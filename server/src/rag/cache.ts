/**
 * DocScope — Redis semantic cache
 *
 * Caches retrieval results keyed by query embedding similarity.
 * On query: embed, hash, compare cosine similarity to cached embeddings.
 * Hit (>= 0.92 similarity) → return cached response.
 * Miss → return null; caller runs retrieval then calls cache.set().
 */

import "dotenv/config";
import RedisModule from "ioredis";
const IORedis = RedisModule.default ?? RedisModule;
type IORedis = InstanceType<typeof IORedis>;
import pino from "pino";
import { embedText, cosineSimilarity } from "./embeddings.js";
import type { RetrievalResult } from "../types.js";

const log = pino({ name: "docscope:cache" });

// ─── Configuration ───

export interface CacheConfig {
  /** Cosine similarity threshold for a cache hit */
  similarityThreshold: number;
  /** TTL in seconds for cached entries */
  ttlSeconds: number;
  /** Redis key prefix */
  keyPrefix: string;
  /** Max number of cached query embeddings to compare against */
  maxCachedQueries: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  similarityThreshold: 0.92,
  ttlSeconds: 3600, // 1 hour
  keyPrefix: "docscope:cache:",
  maxCachedQueries: 500,
};

// ─── Cache entry structure stored in Redis ───

interface CacheEntry {
  query: string;
  embedding: number[];
  namespace: string;
  results: RetrievalResult[];
  createdAt: number;
}

// ─── Redis client ───

let _redis: IORedis | null = null;
let _redisDisabled = false;

function getRedis(): IORedis | null {
  if (_redisDisabled) return null;

  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      log.info("No REDIS_URL set — cache disabled");
      _redisDisabled = true;
      return null;
    }
    _redis = new IORedis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      retryStrategy(times: number) {
        if (times > 2) {
          _redisDisabled = true;
          log.warn("Redis unreachable after retries — disabling cache for this session");
          return null;
        }
        return Math.min(times * 100, 500);
      },
    });

    _redis.on("error", (err: Error) => {
      log.warn({ err }, "Redis connection error (cache degraded)");
    });
  }
  return _redis;
}

// ─── Key helpers ───

function indexKey(prefix: string): string {
  return `${prefix}index`;
}

function entryKey(prefix: string, id: string): string {
  return `${prefix}entry:${id}`;
}

/**
 * Generate a short hash from an embedding vector for use as a cache key.
 * Uses a fast numeric hash — not cryptographic, just for keying.
 */
function embeddingHash(embedding: number[]): string {
  // Sample 32 evenly-spaced dimensions and quantize to 8-bit
  const sampleSize = 32;
  const step = Math.max(1, Math.floor(embedding.length / sampleSize));
  const parts: string[] = [];

  for (let i = 0; i < embedding.length && parts.length < sampleSize; i += step) {
    // Quantize from [-1, 1] to [0, 255]
    const quantized = Math.round((embedding[i] + 1) * 127.5);
    parts.push(quantized.toString(16).padStart(2, "0"));
  }

  return parts.join("");
}

// ─── Public API ───

export class SemanticCache {
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Look up the cache for a semantically similar query.
   *
   * Returns cached results if a query with similarity >= threshold exists,
   * otherwise returns null.
   */
  async get(
    query: string,
    namespace: string,
  ): Promise<RetrievalResult[] | null> {
    try {
      const redis = getRedis();
      if (!redis) return null;

      // Embed the incoming query
      const queryResult = await embedText(query);
      const queryEmb = queryResult.embedding;

      // Get the list of cached entry IDs
      const cachedIds = await redis.smembers(indexKey(this.config.keyPrefix));

      if (cachedIds.length === 0) {
        return null;
      }

      // Compare against each cached embedding
      let bestSimilarity = -1;
      let bestEntry: CacheEntry | null = null;

      // Pipeline fetch for all entries
      const pipeline = redis.pipeline();
      for (const id of cachedIds) {
        pipeline.get(entryKey(this.config.keyPrefix, id));
      }
      const pipelineResults = await pipeline.exec();

      if (!pipelineResults) {
        return null;
      }

      for (let i = 0; i < pipelineResults.length; i++) {
        const [err, raw] = pipelineResults[i];
        if (err || !raw) continue;

        try {
          const entry: CacheEntry = JSON.parse(raw as string);

          // Only match within the same namespace
          if (entry.namespace !== namespace) continue;

          const similarity = cosineSimilarity(queryEmb, entry.embedding);

          if (
            similarity >= this.config.similarityThreshold &&
            similarity > bestSimilarity
          ) {
            bestSimilarity = similarity;
            bestEntry = entry;
          }
        } catch {
          // Corrupted entry — skip
          continue;
        }
      }

      if (bestEntry) {
        log.info(
          {
            query,
            cachedQuery: bestEntry.query,
            similarity: bestSimilarity,
            namespace,
          },
          "Semantic cache hit",
        );
        return bestEntry.results;
      }

      return null;
    } catch (err) {
      log.warn({ err, query }, "Cache lookup failed (proceeding without cache)");
      return null;
    }
  }

  /**
   * Store retrieval results in the cache, keyed by the query embedding.
   */
  async set(
    query: string,
    namespace: string,
    results: RetrievalResult[],
  ): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;

      const queryResult = await embedText(query);
      const id = embeddingHash(queryResult.embedding);

      const entry: CacheEntry = {
        query,
        embedding: queryResult.embedding,
        namespace,
        results,
        createdAt: Date.now(),
      };

      const key = entryKey(this.config.keyPrefix, id);
      const idxKey = indexKey(this.config.keyPrefix);

      // Store entry with TTL
      await redis.setex(
        key,
        this.config.ttlSeconds,
        JSON.stringify(entry),
      );

      // Add to index set
      await redis.sadd(idxKey, id);

      // Prune index if it exceeds max size
      const indexSize = await redis.scard(idxKey);
      if (indexSize > this.config.maxCachedQueries) {
        // Remove random excess entries (SRANDMEMBER + SREM)
        const excess = indexSize - this.config.maxCachedQueries;
        const toRemove = await redis.srandmember(idxKey, excess);
        if (toRemove && toRemove.length > 0) {
          const pipeline = redis.pipeline();
          for (const removeId of toRemove) {
            pipeline.del(entryKey(this.config.keyPrefix, removeId));
            pipeline.srem(idxKey, removeId);
          }
          await pipeline.exec();
        }
      }

      log.info({ query, namespace, id }, "Cached retrieval results");
    } catch (err) {
      log.warn({ err, query }, "Cache store failed (non-fatal)");
    }
  }

  /**
   * Invalidate all cache entries for a given namespace.
   */
  async invalidateNamespace(namespace: string): Promise<number> {
    try {
      const redis = getRedis();
      if (!redis) return 0;
      const idxKey = indexKey(this.config.keyPrefix);
      const cachedIds = await redis.smembers(idxKey);

      let removed = 0;
      const pipeline = redis.pipeline();

      for (const id of cachedIds) {
        const raw = await redis.get(entryKey(this.config.keyPrefix, id));
        if (!raw) {
          pipeline.srem(idxKey, id);
          continue;
        }

        try {
          const entry: CacheEntry = JSON.parse(raw);
          if (entry.namespace === namespace) {
            pipeline.del(entryKey(this.config.keyPrefix, id));
            pipeline.srem(idxKey, id);
            removed++;
          }
        } catch {
          // Corrupted — clean up
          pipeline.del(entryKey(this.config.keyPrefix, id));
          pipeline.srem(idxKey, id);
        }
      }

      await pipeline.exec();
      log.info({ namespace, removed }, "Invalidated namespace cache entries");
      return removed;
    } catch (err) {
      log.warn({ err, namespace }, "Cache invalidation failed");
      return 0;
    }
  }

  /**
   * Flush all cached entries.
   */
  async flush(): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;
      const idxKey = indexKey(this.config.keyPrefix);
      const cachedIds = await redis.smembers(idxKey);

      if (cachedIds.length > 0) {
        const pipeline = redis.pipeline();
        for (const id of cachedIds) {
          pipeline.del(entryKey(this.config.keyPrefix, id));
        }
        pipeline.del(idxKey);
        await pipeline.exec();
      }

      log.info("Flushed semantic cache");
    } catch (err) {
      log.warn({ err }, "Cache flush failed");
    }
  }

  /**
   * Get cache statistics.
   */
  async stats(): Promise<{ size: number; keyPrefix: string }> {
    try {
      const redis = getRedis();
      if (!redis) return { size: 0, keyPrefix: this.config.keyPrefix };
      const size = await redis.scard(indexKey(this.config.keyPrefix));
      return { size, keyPrefix: this.config.keyPrefix };
    } catch {
      return { size: 0, keyPrefix: this.config.keyPrefix };
    }
  }
}

/**
 * Disconnect the Redis client. Call on process shutdown.
 */
export async function disconnectCache(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

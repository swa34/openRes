/**
 * DocScope — Hybrid retrieval engine
 *
 * Dense (Pinecone cosine similarity) + sparse (BM25-style keyword) search
 * with LLM reranking when top results are ambiguous.
 */

import "dotenv/config";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import pino from "pino";
import { embedText } from "./embeddings.js";
import type {
  DocumentChunk,
  ChunkMetadata,
  RetrievalResult,
} from "../types.js";

const log = pino({ name: "docscope:retrieval" });

// ─── Configuration ───

export interface RetrievalConfig {
  /** Weight toward semantic search (0 = all keyword, 1 = all semantic) */
  alpha: number;
  /** Max results to return */
  topK: number;
  /** Score difference threshold for triggering LLM reranking */
  rerankThreshold: number;
  /** Number of top results to consider for reranking */
  rerankTopN: number;
  /** Minimum top score required to trigger reranking */
  minScoreForRerank: number;
  /** Model used for LLM reranking */
  rerankModel: string;
  /** Pinecone index name */
  indexName: string;
}

const DEFAULT_CONFIG: RetrievalConfig = {
  alpha: 0.7,
  topK: 10,
  rerankThreshold: 0.15,
  rerankTopN: 5,
  minScoreForRerank: 0.20,
  rerankModel: "gpt-5-nano",
  indexName: process.env.PINECONE_INDEX ?? "docscope",
};

// ─── Clients ───

let _pinecone: Pinecone | null = null;

function getPinecone(): Pinecone {
  if (!_pinecone) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error("PINECONE_API_KEY environment variable is required");
    }
    _pinecone = new Pinecone({ apiKey });
  }
  return _pinecone;
}

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// ─── BM25-style keyword scoring ───

/**
 * Simple BM25-style term-frequency scoring. Not a full BM25 implementation
 * (no IDF from corpus stats), but effective for boosting exact keyword matches
 * that pure semantic search can miss — especially API parameter names.
 */
function computeKeywordScore(query: string, text: string): number {
  const queryTerms = tokenize(query);
  const docTerms = tokenize(text);

  if (queryTerms.length === 0 || docTerms.length === 0) return 0;

  const docFreq = new Map<string, number>();
  for (const term of docTerms) {
    docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }

  // BM25 parameters
  const k1 = 1.2;
  const b = 0.75;
  const avgDl = 200; // approximate average doc length in tokens

  let score = 0;
  const dl = docTerms.length;

  for (const term of queryTerms) {
    const tf = docFreq.get(term) ?? 0;
    if (tf === 0) continue;

    // Simplified BM25 TF component (without IDF since we lack corpus stats)
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (dl / avgDl));
    score += numerator / denominator;
  }

  // Normalize to 0-1 range (divide by max possible score = queryTerms.length * (k1+1))
  const maxScore = queryTerms.length * (k1 + 1);
  return maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
}

function tokenize(text: string): string[] {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9_/.-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  // Also extract path segments from API paths (e.g., "/v1/payment_intents" → "payment_intents")
  const pathSegments: string[] = [];
  for (const token of base) {
    if (token.includes("/")) {
      const parts = token.split("/").filter((p) => p.length > 1 && !p.startsWith("{"));
      pathSegments.push(...parts);
    }
  }

  return [...base, ...pathSegments];
}

// ─── LLM Reranking ───

/**
 * Use gpt-5-nano to rerank candidates when top scores are too close.
 * Returns reordered results with updated scores.
 */
async function rerankWithLLM(
  query: string,
  candidates: RetrievalResult[],
  model: string,
): Promise<RetrievalResult[]> {
  const openai = getOpenAI();

  const candidateDescriptions = candidates
    .map(
      (c, i) =>
        `[${i}] (score: ${c.score.toFixed(4)}) ${c.chunk.text.slice(0, 400)}`,
    )
    .join("\n\n");

  try {
    const response = await openai.responses.create({
      model,
      reasoning: { effort: "minimal" },
      instructions: `You are a relevance judge for API documentation search. Given a query and candidate results, rank them by relevance. Return ONLY a JSON array of indices in order of relevance, e.g. [2, 0, 1]. No explanation.`,
      input: `Query: "${query}"\n\nCandidates:\n${candidateDescriptions}`,
    });

    const content = response.output_text?.trim() ?? "[]";
    const ranking: number[] = JSON.parse(content);

    // Validate and apply ranking
    if (
      !Array.isArray(ranking) ||
      ranking.some((i) => typeof i !== "number" || i < 0 || i >= candidates.length)
    ) {
      log.warn("LLM reranking returned invalid indices, keeping original order");
      return candidates;
    }

    // Assign new scores based on ranking position (highest first)
    const reranked: RetrievalResult[] = ranking.map((idx, position) => ({
      chunk: candidates[idx].chunk,
      score: 1 - position * (1 / ranking.length), // linear decay from 1.0
      reranked: true,
    }));

    // Append any candidates not included in the ranking
    const seen = new Set(ranking);
    for (let i = 0; i < candidates.length; i++) {
      if (!seen.has(i)) {
        reranked.push({ ...candidates[i], reranked: false });
      }
    }

    return reranked;
  } catch (err) {
    log.error({ err }, "LLM reranking failed, returning original order");
    return candidates;
  }
}

/**
 * Check if the top-N scores are within threshold of each other,
 * meaning results are ambiguous and would benefit from reranking.
 */
function shouldRerank(
  results: RetrievalResult[],
  topN: number,
  threshold: number,
  minScore: number,
): boolean {
  if (results.length < 2) return false;

  const top = results.slice(0, Math.min(topN, results.length));
  const maxResultScore = top[0].score;
  const minResultScore = top[top.length - 1].score;

  // Skip reranking if the best result is below the minimum score gate —
  // all results are low-quality and reranking won't help.
  if (maxResultScore < minScore) return false;

  return maxResultScore - minResultScore <= threshold;
}

// ─── Public API ───

/**
 * Run hybrid retrieval: dense vector search via Pinecone + sparse keyword scoring,
 * with optional LLM reranking.
 *
 * @param query - The user's search query
 * @param namespace - Pinecone namespace (e.g., "stripe", "twilio")
 * @param config - Override default retrieval settings
 */
export async function hybridSearch(
  query: string,
  namespace: string,
  config: Partial<RetrievalConfig> = {},
): Promise<RetrievalResult[]> {
  const cfg: RetrievalConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // 1. Embed the query
    const queryEmbedding = await embedText(query);

    // 2. Dense search via Pinecone
    const pc = getPinecone();
    const index = pc.index(cfg.indexName);
    const ns = index.namespace(namespace);

    const pineconeResults = await ns.query({
      vector: queryEmbedding.embedding,
      topK: cfg.topK * 2, // fetch extra for hybrid merge
      includeMetadata: true,
      includeValues: false,
    });

    const matches = pineconeResults.matches ?? [];

    if (matches.length === 0) {
      log.info({ query, namespace }, "No Pinecone results found");
      return [];
    }

    // 3. Detect explicit endpoint paths in the query (e.g., "/v1/subscriptions")
    const queryPathMatch = query.match(/\/v[12]\/[a-z_/]+/gi);
    const queryPaths = queryPathMatch
      ? queryPathMatch.map((p) => p.toLowerCase())
      : [];

    // Build RetrievalResult array with hybrid scoring
    const results: RetrievalResult[] = matches.map((match) => {
      const metadata = (match.metadata ?? {}) as Record<string, unknown>;

      const chunk: DocumentChunk = {
        id: match.id,
        text: (metadata.text as string) ?? "",
        metadata: {
          api: (metadata.api as string) ?? namespace,
          source: (metadata.source as string) ?? "",
          endpoint: metadata.endpoint as string | undefined,
          method: metadata.method as string | undefined,
          chunkIndex: (metadata.chunkIndex as number) ?? 0,
          totalChunks: (metadata.totalChunks as number) ?? 1,
          type:
            (metadata.type as ChunkMetadata["type"]) ?? "overview",
        },
      };

      // Dense score from Pinecone (cosine similarity, already 0-1)
      const denseScore = match.score ?? 0;

      // Sparse keyword score
      const keywordScore = computeKeywordScore(query, chunk.text);

      // Hybrid score: weighted combination
      let hybridScore =
        cfg.alpha * denseScore + (1 - cfg.alpha) * keywordScore;

      // Boost chunks whose endpoint matches an explicit path in the query
      if (queryPaths.length > 0 && chunk.metadata.endpoint) {
        const epLower = chunk.metadata.endpoint.toLowerCase();
        if (queryPaths.some((p) => epLower.startsWith(p) || p.startsWith(epLower))) {
          hybridScore = Math.min(hybridScore * 1.25, 1);
        }
      }

      // Boost primary resource endpoints (shorter paths = primary resource).
      // "/v1/refunds" should rank above "/v1/charges/{charge}/refunds".
      if (chunk.metadata.endpoint) {
        const segmentCount = chunk.metadata.endpoint.split("/").filter(Boolean).length;
        // Primary resources typically have 2 segments (v1/resource) or 3 (v1/resource/{id})
        if (segmentCount <= 3) {
          hybridScore = Math.min(hybridScore * 1.10, 1);
        }
      }

      // Boost overview chunks (chunkIndex 0 = main endpoint description)
      if (chunk.metadata.chunkIndex === 0) {
        hybridScore = Math.min(hybridScore * 1.05, 1);
      }

      return {
        chunk,
        score: hybridScore,
        reranked: false,
      };
    });

    // 4. Sort by hybrid score descending
    results.sort((a, b) => b.score - a.score);

    // 5. Trim to topK
    const topResults = results.slice(0, cfg.topK);

    // 6. LLM reranking when top-N scores are ambiguous
    if (shouldRerank(topResults, cfg.rerankTopN, cfg.rerankThreshold, cfg.minScoreForRerank)) {
      log.info(
        { query, topScores: topResults.slice(0, cfg.rerankTopN).map((r) => r.score) },
        "Top scores ambiguous — triggering LLM reranking",
      );

      const toRerank = topResults.slice(0, cfg.rerankTopN);
      const rest = topResults.slice(cfg.rerankTopN);

      const reranked = await rerankWithLLM(query, toRerank, cfg.rerankModel);
      return [...reranked, ...rest].slice(0, cfg.topK);
    }

    return topResults;
  } catch (err) {
    log.error({ err, query, namespace }, "Hybrid search failed");
    return [];
  }
}

/**
 * Search across all namespaces (API sources). Merges and re-sorts results.
 */
export async function searchAllNamespaces(
  query: string,
  namespaces: string[],
  config: Partial<RetrievalConfig> = {},
): Promise<RetrievalResult[]> {
  const cfg: RetrievalConfig = { ...DEFAULT_CONFIG, ...config };

  const allResults = await Promise.all(
    namespaces.map((ns) => hybridSearch(query, ns, config)),
  );

  const merged = allResults.flat();
  merged.sort((a, b) => b.score - a.score);

  return merged.slice(0, cfg.topK);
}

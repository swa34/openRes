/**
 * DocScope — OpenAI Embeddings wrapper
 *
 * Wraps text-embedding-3-large with batch support, configurable dimensions,
 * and exponential backoff for rate-limit resilience.
 */

import "dotenv/config";
import OpenAI from "openai";
import pino from "pino";
import type { EmbeddingResult } from "../types.js";

const log = pino({ name: "docscope:embeddings" });

// ─── Configuration ───

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  maxBatchSize: number; // OpenAI allows up to 2048 inputs per request
  maxRetries: number;
  baseDelayMs: number;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  model: "text-embedding-3-large",
  dimensions: 1536, // reduced from default 3072 to match Pinecone index
  maxBatchSize: 20,
  maxRetries: 5,
  baseDelayMs: 500,
};

// ─── Client singleton ───

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ─── Helpers ───

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the embeddings endpoint with exponential backoff on rate-limit (429)
 * and server errors (5xx).
 */
async function callWithBackoff(
  client: OpenAI,
  input: string[],
  config: EmbeddingConfig,
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const response = await client.embeddings.create({
        input,
        model: config.model,
        dimensions: config.dimensions,
        encoding_format: "float",
      });
      return response;
    } catch (err: unknown) {
      lastError = err;

      const status =
        err instanceof OpenAI.APIError ? err.status : undefined;

      // Only retry on rate-limit or server errors
      if (status === 429 || (status !== undefined && status >= 500)) {
        const delayMs = config.baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * config.baseDelayMs;
        log.warn(
          { attempt: attempt + 1, status, delayMs: delayMs + jitter },
          "Retrying embeddings request after error",
        );
        await sleep(delayMs + jitter);
        continue;
      }

      // Non-retryable error — bail immediately
      throw err;
    }
  }

  throw lastError;
}

// ─── Public API ───

/**
 * Embed a single text string.
 */
export async function embedText(
  text: string,
  config: Partial<EmbeddingConfig> = {},
): Promise<EmbeddingResult> {
  const results = await embedBatch([text], config);
  return results[0];
}

/**
 * Embed multiple texts in a single call (or batched calls if input exceeds
 * the per-request limit). Returns results in the same order as input.
 */
export async function embedBatch(
  texts: string[],
  config: Partial<EmbeddingConfig> = {},
): Promise<EmbeddingResult[]> {
  const cfg: EmbeddingConfig = { ...DEFAULT_CONFIG, ...config };
  const client = getClient();

  if (texts.length === 0) {
    return [];
  }

  // Filter out empty strings and truncate oversized texts
  // text-embedding-3-large has 8192 token limit; ~4 chars/token → 30000 char safety limit
  const MAX_CHARS = 30000;
  const validTexts = texts.map((t) => {
    const trimmed = t.trim();
    if (trimmed === "") return " ";
    return trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;
  });

  // Split into batches respecting maxBatchSize
  const batches: string[][] = [];
  for (let i = 0; i < validTexts.length; i += cfg.maxBatchSize) {
    batches.push(validTexts.slice(i, i + cfg.maxBatchSize));
  }

  const allResults: EmbeddingResult[] = [];

  for (const batch of batches) {
    try {
      const response = await callWithBackoff(client, batch, cfg);

      // OpenAI returns embeddings with an `index` field — sort to preserve order
      const sorted = [...response.data].sort((a, b) => a.index - b.index);

      // Approximate per-text token count (total / batch size)
      const avgTokens = Math.ceil(
        response.usage.total_tokens / batch.length,
      );

      for (let i = 0; i < sorted.length; i++) {
        allResults.push({
          text: batch[i],
          embedding: sorted[i].embedding,
          model: response.model,
          tokenCount: avgTokens,
        });
      }
    } catch (err) {
      log.error(
        { err, batchSize: batch.length },
        "Failed to embed batch after retries",
      );
      // Return zero-vectors so callers get a result for every input
      for (const text of batch) {
        allResults.push({
          text,
          embedding: new Array(cfg.dimensions).fill(0),
          model: cfg.model,
          tokenCount: 0,
        });
      }
    }
  }

  return allResults;
}

/**
 * Compute cosine similarity between two embedding vectors.
 * Returns a value between -1 and 1. Handles zero-magnitude vectors gracefully.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  return dot / denom;
}

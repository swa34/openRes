/**
 * DocScope — Eval Metrics
 *
 * Pure metric functions for evaluating RAG retrieval quality, answer quality,
 * and system performance. LLM-as-judge metrics use gpt-5-mini via OpenAI SDK,
 * following OpenAI's recommended patterns for retrieval evaluation:
 *   - precision@k and recall for retrieval quality
 *   - LLM-as-judge for faithfulness and answer relevance
 *   - Latency percentiles and cache hit rate for system health
 *
 * Reference: https://developers.openai.com/cookbook/examples/evaluation/evaluate_rag_with_llamaindex/
 */

import "dotenv/config";
import OpenAI from "openai";
import pino from "pino";

const log = pino({ name: "docscope:eval:metrics" });

// ─── Client singleton ───

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required for LLM-as-judge metrics");
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ─── Retrieval Metrics ───

/**
 * Same-resource matching for API endpoints. A retrieved endpoint matches if:
 * 1. It exactly equals the expected endpoint, OR
 * 2. It starts with the expected endpoint and the remaining path only contains
 *    param segments and action segments of the SAME resource (no child resource names).
 *
 * For expected "/v1/payment_intents":
 *   "/v1/payment_intents"                              -> MATCH (exact)
 *   "/v1/payment_intents/{intent}"                     -> MATCH (param of same resource)
 *   "/v1/payment_intents/{intent}/confirm"             -> MATCH (action on same resource)
 *   "/v1/payment_intents/{intent}/capture"             -> MATCH (action on same resource)
 *   "/v1/customers/{customer}/sources"                 -> NO MATCH (different resource)
 *
 * For expected "/v1/customers":
 *   "/v1/customers/{customer}"                         -> MATCH
 *   "/v1/customers/search"                             -> MATCH (search action)
 *   "/v1/customers/{customer}/cards/{id}"              -> NO MATCH (child resource "cards")
 *   "/v1/customers/{customer}/subscriptions/{sub}"     -> NO MATCH (child resource)
 */
function endpointMatches(retrieved: string, expected: string): boolean {
  if (retrieved === expected) return true;
  if (!retrieved.startsWith(expected)) return false;

  // Parse the suffix after the expected prefix
  const suffix = retrieved.slice(expected.length);
  // Split into path segments, filtering empties
  const segments = suffix.split("/").filter(Boolean);

  // Allow: /{param}, /action (single word like "confirm", "search", "cancel")
  // Reject: /child_resource/{param} patterns (a named resource followed by a param)
  // Heuristic: max 2 suffix segments, and no segment that looks like a child resource
  // (a non-param segment followed by another segment)
  if (segments.length > 2) return false;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isParam = seg.startsWith("{");
    const isAction = !isParam && /^[a-z_]+$/.test(seg);

    if (isParam) continue; // params always ok
    if (isAction && i === segments.length - 1) continue; // trailing action ok
    if (isAction && i === 0 && segments.length === 1) continue; // single action ok

    // A non-param segment followed by more segments = child resource
    if (isAction && i < segments.length - 1) return false;

    return false; // unknown pattern, reject
  }

  return true;
}

/**
 * Precision@K — what fraction of the top-k retrieved items are in the expected set.
 *
 * @param retrieved - ordered list of retrieved item identifiers (endpoints, concept keys, etc.)
 * @param expected  - ground-truth set of relevant items
 * @param k         - cutoff; only the first k retrieved items are evaluated
 * @returns         - ratio in [0, 1]
 */
export function precisionAtK(retrieved: string[], expected: string[], k: number): number {
  if (k <= 0 || expected.length === 0) return 0;

  const topK = retrieved.slice(0, k);
  if (topK.length === 0) return 0;

  const expectedLower = expected.map((e) => e.toLowerCase());

  // A retrieved endpoint is a hit if it exactly matches OR is one param-segment
  // deeper than an expected endpoint (e.g. /v1/customers/{customer} matches /v1/customers).
  // Deep sub-resources like /v1/customers/{customer}/cards/{id} do NOT match.
  const hits = topK.filter((r) => {
    const rLower = r.toLowerCase();
    return expectedLower.some((exp) => endpointMatches(rLower, exp));
  }).length;

  return hits / topK.length;
}

/**
 * Recall — what fraction of the expected items were found anywhere in retrieved.
 *
 * @param retrieved - all retrieved item identifiers
 * @param expected  - ground-truth set of relevant items
 * @returns         - ratio in [0, 1]
 */
export function recall(retrieved: string[], expected: string[]): number {
  if (expected.length === 0) return 1; // vacuously true
  if (retrieved.length === 0) return 0;

  const retrievedLower = retrieved.map((r) => r.toLowerCase());

  // An expected endpoint is "found" if any retrieved endpoint matches it exactly
  // or is one param-segment deeper (e.g., expected "/v1/customers" found via
  // "/v1/customers/{customer}"). Deep sub-resources do NOT count as a match.
  const found = expected.filter((e) => {
    const eLower = e.toLowerCase();
    return retrievedLower.some((r) => endpointMatches(r, eLower));
  }).length;

  return found / expected.length;
}

// ─── LLM-as-Judge Metrics ───

const FAITHFULNESS_PROMPT = `You are an evaluation judge. Given the following source documents and an answer, rate how faithful the answer is to ONLY the information in the sources.

A faithful answer:
- Only contains claims supported by the source documents
- Does not hallucinate facts not present in sources
- Does not contradict the sources

Source documents:
---
{sources}
---

Answer to evaluate:
---
{answer}
---

Respond with ONLY a single decimal number between 0.0 and 1.0, where:
- 0.0 = completely unfaithful (all claims are hallucinated)
- 0.5 = partially faithful (mix of supported and unsupported claims)
- 1.0 = perfectly faithful (every claim is grounded in sources)

Score:`;

const RELEVANCE_PROMPT = `You are an evaluation judge. Rate how well the given answer addresses the question.

A relevant answer:
- Directly addresses what was asked
- Provides useful, specific information
- Does not go off-topic or provide only tangential info

Question:
---
{question}
---

Answer to evaluate:
---
{answer}
---

Respond with ONLY a single decimal number between 0.0 and 1.0, where:
- 0.0 = completely irrelevant (does not address the question at all)
- 0.5 = partially relevant (addresses the topic but misses key aspects)
- 1.0 = perfectly relevant (fully and precisely addresses the question)

Score:`;

/**
 * Faithfulness — LLM-as-judge score for how grounded the answer is in sources.
 * Uses gpt-5-mini for quality scoring.
 *
 * @param answer  - generated answer text
 * @param sources - source document texts the answer should be grounded in
 * @returns       - score in [0, 1]
 */
export async function faithfulness(answer: string, sources: string[]): Promise<number> {
  if (!answer.trim() || sources.length === 0) return 0;

  const client = getClient();
  const prompt = FAITHFULNESS_PROMPT
    .replace("{sources}", sources.join("\n\n"))
    .replace("{answer}", answer);

  try {
    const response = await client.responses.create({
      model: "gpt-5-mini",
      reasoning: { effort: "minimal" },
      input: prompt,
    });

    const raw = response.output_text?.trim() ?? "0";
    const score = parseFloat(raw);

    if (isNaN(score) || score < 0 || score > 1) {
      log.warn({ raw }, "Faithfulness judge returned invalid score, defaulting to 0");
      return 0;
    }

    return score;
  } catch (err) {
    log.error({ err }, "Faithfulness evaluation failed");
    return 0;
  }
}

/**
 * Answer Relevance — LLM-as-judge score for how well the answer addresses the question.
 * Uses gpt-5-mini for quality scoring.
 *
 * @param answer   - generated answer text
 * @param question - the original user query
 * @returns        - score in [0, 1]
 */
export async function answerRelevance(answer: string, question: string): Promise<number> {
  if (!answer.trim() || !question.trim()) return 0;

  const client = getClient();
  const prompt = RELEVANCE_PROMPT
    .replace("{question}", question)
    .replace("{answer}", answer);

  try {
    const response = await client.responses.create({
      model: "gpt-5-mini",
      reasoning: { effort: "minimal" },
      input: prompt,
    });

    const raw = response.output_text?.trim() ?? "0";
    const score = parseFloat(raw);

    if (isNaN(score) || score < 0 || score > 1) {
      log.warn({ raw }, "Relevance judge returned invalid score, defaulting to 0");
      return 0;
    }

    return score;
  } catch (err) {
    log.error({ err }, "Answer relevance evaluation failed");
    return 0;
  }
}

// ─── System Metrics ───

/**
 * Compute latency percentiles from an array of timing measurements (ms).
 *
 * @param timings - array of latency values in milliseconds
 * @returns       - p50, p95, p99 percentiles
 */
export function latencyPercentiles(timings: number[]): { p50: number; p95: number; p99: number } {
  if (timings.length === 0) {
    return { p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...timings].sort((a, b) => a - b);

  function percentile(p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  return {
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
  };
}

/**
 * Cache hit rate — simple ratio of cache hits to total requests.
 *
 * @param hits  - number of cache hits
 * @param total - total number of requests
 * @returns     - ratio in [0, 1]
 */
export function cacheHitRate(hits: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(hits / total, 1);
}

/**
 * DocScope — search tool handler (company knowledge compatible)
 *
 * Semantic + keyword hybrid search over indexed API documentation.
 * Checks Redis semantic cache first; on miss, runs hybridSearch
 * against Pinecone and caches the result.
 *
 * content:  company-knowledge-compatible JSON (id, title, url only)
 * structuredContent:  full results with scores for the widget
 * _meta:  query metadata and cache diagnostics
 */

import { z } from "zod";
import pino from "pino";
import { hybridSearch, searchAllNamespaces } from "../rag/retrieval.js";
import { SemanticCache } from "../rag/cache.js";
import type { RetrievalResult, SearchResult } from "../types.js";

const log = pino({ name: "docscope:tool:search" });

// Shared cache instance — lives for the process lifetime
const cache = new SemanticCache();

// Available namespaces (API sources)
const ALL_NAMESPACES = ["stripe", "twilio"];

// ─── Definition ───

export const definition = {
  title: "Search API documentation",
  description:
    "Search Stripe and Twilio API documentation. Use this tool whenever a user asks about API endpoints, parameters, authentication, error codes, webhooks, or how to use any Stripe or Twilio feature. Returns ranked documentation results with snippets. Use the 'api' parameter to filter by 'stripe' or 'twilio', or omit to search all APIs.",
  inputSchema: {
    query: z.string(),
    api: z.string().optional().describe("Filter to a specific API: 'stripe' or 'twilio'. Omit to search all."),
  },
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
};

// ─── Helpers ───

/**
 * Convert a RetrievalResult into the clean SearchResult shape used
 * by structuredContent (widget) and the company-knowledge content field.
 */
function toSearchResult(r: RetrievalResult): SearchResult {
  const meta = r.chunk.metadata;
  return {
    id: r.chunk.id,
    title: buildTitle(r),
    url: buildUrl(r),
    text: r.chunk.text.slice(0, 300),
    score: r.score,
    api: meta.api,
    endpoint: meta.endpoint,
  };
}

function buildTitle(r: RetrievalResult): string {
  const meta = r.chunk.metadata;
  if (meta.endpoint && meta.method) {
    return `${meta.method.toUpperCase()} ${meta.endpoint} — ${meta.api} API`;
  }
  if (meta.endpoint) {
    return `${meta.endpoint} — ${meta.api} API`;
  }
  // Fallback: first line of chunk text as title
  const firstLine = r.chunk.text.split("\n")[0].slice(0, 80);
  return firstLine || `${meta.api} documentation`;
}

function buildUrl(r: RetrievalResult): string {
  const meta = r.chunk.metadata;
  // Build a plausible docs URL from metadata
  if (meta.api === "stripe" && meta.endpoint) {
    const slug = meta.endpoint.replace(/^\/v1\//, "").replace(/\//g, "/");
    return `https://docs.stripe.com/api/${slug}`;
  }
  if (meta.api === "twilio" && meta.endpoint) {
    return `https://www.twilio.com/docs/api${meta.endpoint}`;
  }
  return meta.source || `https://docs.example.com/${meta.api}`;
}

// ─── Handler ───

export async function handler(args: { query: string; api?: string }): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  _meta: Record<string, unknown>;
}> {
  const { query, api } = args;
  const namespaces = api && ALL_NAMESPACES.includes(api) ? [api] : ALL_NAMESPACES;
  const cacheKey = namespaces.join(",");
  const startMs = Date.now();
  let cacheHit = false;

  log.info({ query, namespaces }, "Search tool invoked");

  let retrievalResults: RetrievalResult[];

  try {
    // 1. Check cache
    const cached = await cache.get(query, cacheKey);

    if (cached) {
      cacheHit = true;
      retrievalResults = cached;
      log.info({ query, resultCount: cached.length }, "Cache hit");
    } else {
      // 2. Cache miss — search specified namespaces
      if (namespaces.length === 1) {
        retrievalResults = await hybridSearch(query, namespaces[0]);
      } else {
        retrievalResults = await searchAllNamespaces(query, namespaces);
      }

      // 3. Cache the results (fire-and-forget, don't block response)
      cache.set(query, cacheKey, retrievalResults).catch((err) => {
        log.warn({ err }, "Failed to cache search results (non-fatal)");
      });

      log.info(
        { query, namespaces, resultCount: retrievalResults.length },
        "Cache miss — ran search",
      );
    }
  } catch (err) {
    log.error({ err, query }, "Search failed");
    retrievalResults = [];
  }

  const latencyMs = Date.now() - startMs;

  // Build results
  const fullResults: SearchResult[] = retrievalResults.map(toSearchResult);

  // Company-knowledge-compatible content: id, title, url only (no score, no api, no endpoint)
  const companyKnowledgeResults = fullResults.map(({ id, title, url }) => ({
    id,
    title,
    url,
  }));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ results: companyKnowledgeResults }),
      },
    ],
    structuredContent: {
      results: fullResults,
    },
    _meta: {
      query,
      namespaces,
      resultCount: fullResults.length,
      cacheHit,
      latencyMs,
    },
  };
}

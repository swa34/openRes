/**
 * DocScope — Ingestion pipeline orchestrator
 *
 * CLI entry point: `npm run ingest -- --source stripe`
 *
 * Flow: parse OpenAPI spec -> build error catalog -> chunk endpoints ->
 *       embed chunks -> upsert to Pinecone -> store in memory for tools.
 *
 * Supports dry-run mode when OPENAI_API_KEY or PINECONE_API_KEY are missing.
 */

import "dotenv/config";
import { Pinecone } from "@pinecone-database/pinecone";
import pino from "pino";
import { parseOpenApiSpec } from "./openapi-parser.js";
import { buildErrorCatalog } from "./error-catalog.js";
import { chunkEndpoint } from "../rag/chunker.js";
import { embedBatch } from "../rag/embeddings.js";
import type {
  ParsedEndpoint,
  DocumentChunk,
  ErrorInfo,
  IngestionResult,
  IngestionSource,
} from "../types.js";

const log = pino({ name: "docscope:pipeline" });

// ─── Source configuration ───

const SOURCES: Record<string, IngestionSource> = {
  stripe: {
    name: "stripe",
    type: "openapi",
    filePath: "../docs-seed/stripe-openapi.yaml",
    baseUrl: "https://api.stripe.com",
  },
  twilio: {
    name: "twilio",
    type: "openapi",
    filePath: "../docs-seed/twilio-api-v2010.json",
    baseUrl: "https://api.twilio.com",
  },
};

// ─── In-memory stores (accessed by MCP tools) ───

const endpointStore = new Map<string, ParsedEndpoint[]>();
const errorCatalogStore = new Map<string, Map<string, ErrorInfo>>();

/**
 * Get all parsed endpoints, optionally filtered by API name.
 */
export function getEndpointStore(): Map<string, ParsedEndpoint[]> {
  return endpointStore;
}

/**
 * Get error catalogs, optionally filtered by API name.
 */
export function getErrorCatalog(): Map<string, Map<string, ErrorInfo>> {
  return errorCatalogStore;
}

// ─── Pinecone client ───

let _pinecone: Pinecone | null = null;

function getPineconeClient(): Pinecone | null {
  if (_pinecone) return _pinecone;

  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    log.warn("PINECONE_API_KEY not set — vectors will not be upserted");
    return null;
  }

  _pinecone = new Pinecone({ apiKey });
  return _pinecone;
}

// ─── Dry-run detection ───

function isDryRun(): { embedding: boolean; pinecone: boolean } {
  return {
    embedding: !process.env.OPENAI_API_KEY,
    pinecone: !process.env.PINECONE_API_KEY,
  };
}

// ─── Upsert helpers ───

const UPSERT_BATCH_SIZE = 100;

interface PineconeVector {
  id: string;
  values: number[];
  metadata: Record<string, string | number | boolean>;
}

/**
 * Upsert document chunks with embeddings to Pinecone in batches of 100.
 */
async function upsertToPinecone(
  chunks: DocumentChunk[],
  namespace: string,
): Promise<number> {
  const pinecone = getPineconeClient();
  if (!pinecone) {
    log.info({ namespace, chunks: chunks.length }, "Dry-run: skipping Pinecone upsert");
    return 0;
  }

  const indexName = process.env.PINECONE_INDEX ?? "docscope";
  const index = pinecone.index(indexName);
  const ns = index.namespace(namespace);

  // Filter chunks that have real embeddings (not zero-vectors from failed batches)
  const validChunks = chunks.filter(
    (c) => c.embedding && c.embedding.length > 0 && c.embedding.some((v) => v !== 0),
  );
  if (validChunks.length === 0) {
    log.warn({ namespace }, "No chunks with embeddings to upsert");
    return 0;
  }

  let upserted = 0;

  for (let i = 0; i < validChunks.length; i += UPSERT_BATCH_SIZE) {
    const batch = validChunks.slice(i, i + UPSERT_BATCH_SIZE);

    const vectors: PineconeVector[] = batch.map((chunk) => ({
      id: chunk.id,
      values: chunk.embedding!,
      metadata: {
        api: chunk.metadata.api,
        source: chunk.metadata.source,
        endpoint: chunk.metadata.endpoint ?? "",
        method: chunk.metadata.method ?? "",
        chunkIndex: chunk.metadata.chunkIndex,
        totalChunks: chunk.metadata.totalChunks,
        type: chunk.metadata.type,
        // Store a truncated version of text for retrieval display
        text: chunk.text.slice(0, 1000),
      },
    }));

    try {
      await ns.upsert({ records: vectors });
      upserted += batch.length;
      log.info(
        { namespace, batch: Math.floor(i / UPSERT_BATCH_SIZE) + 1, upserted },
        "Upsert batch complete",
      );
    } catch (err) {
      log.error(
        { err, namespace, batchStart: i },
        "Failed to upsert batch to Pinecone",
      );
      // Continue with next batch
    }
  }

  return upserted;
}

// ─── Main pipeline ───

/**
 * Run the full ingestion pipeline for a named source.
 *
 * Idempotent: chunk IDs are deterministic (SHA-256 of api:source:identifier:index),
 * so re-running overwrites the same vectors rather than duplicating.
 */
export async function runIngestion(sourceName: string): Promise<IngestionResult> {
  const startMs = Date.now();
  const errors: string[] = [];

  const source = SOURCES[sourceName];
  if (!source) {
    const available = Object.keys(SOURCES).join(", ");
    throw new Error(`Unknown source "${sourceName}". Available: ${available}`);
  }

  const dryRun = isDryRun();
  if (dryRun.embedding) {
    log.warn("OPENAI_API_KEY not set — embeddings will be zero-vectors (dry-run)");
  }
  if (dryRun.pinecone) {
    log.warn("PINECONE_API_KEY not set — skipping Pinecone upsert (dry-run)");
  }

  log.info({ source: source.name, type: source.type }, "Starting ingestion pipeline");

  // ── Step 1: Parse ──

  let endpoints: ParsedEndpoint[] = [];

  if (source.type === "openapi") {
    try {
      endpoints = await parseOpenApiSpec(source.filePath, source.name, source.baseUrl);
    } catch (err) {
      const msg = `Parse failed: ${err instanceof Error ? err.message : String(err)}`;
      log.error({ err }, msg);
      errors.push(msg);
      return {
        source: source.name,
        chunksCreated: 0,
        vectorsUpserted: 0,
        errorsEncountered: errors,
        durationMs: Date.now() - startMs,
      };
    }
  }

  log.info({ endpoints: endpoints.length }, "Parsing complete");

  // ── Step 2: Build error catalog ──

  const errorCatalog = buildErrorCatalog(endpoints);
  log.info({ errorCount: errorCatalog.size }, "Error catalog built");

  // ── Step 3: Chunk endpoints ──

  const allChunks: DocumentChunk[] = [];

  for (const endpoint of endpoints) {
    try {
      const chunks = chunkEndpoint(endpoint, source.name, source.filePath);
      allChunks.push(...chunks);
    } catch (err) {
      const msg = `Chunking failed for ${endpoint.method} ${endpoint.path}: ${err instanceof Error ? err.message : String(err)}`;
      log.warn({ err, endpoint: `${endpoint.method} ${endpoint.path}` }, msg);
      errors.push(msg);
    }
  }

  log.info({ chunks: allChunks.length }, "Chunking complete");

  // ── Step 4: Embed chunks ──

  if (!dryRun.embedding && allChunks.length > 0) {
    try {
      const texts = allChunks.map((c) => c.text);
      const embeddings = await embedBatch(texts);

      for (let i = 0; i < allChunks.length; i++) {
        allChunks[i].embedding = embeddings[i].embedding;
      }

      log.info({ embedded: allChunks.length }, "Embedding complete");
    } catch (err) {
      const msg = `Embedding failed: ${err instanceof Error ? err.message : String(err)}`;
      log.error({ err }, msg);
      errors.push(msg);
    }
  } else if (dryRun.embedding) {
    log.info("Dry-run: skipping embedding step");
  }

  // ── Step 5: Upsert to Pinecone ──

  let vectorsUpserted = 0;
  if (!dryRun.pinecone && allChunks.some((c) => c.embedding)) {
    try {
      vectorsUpserted = await upsertToPinecone(allChunks, source.name);
    } catch (err) {
      const msg = `Pinecone upsert failed: ${err instanceof Error ? err.message : String(err)}`;
      log.error({ err }, msg);
      errors.push(msg);
    }
  }

  // ── Step 6: Store in memory for tools ──

  endpointStore.set(source.name, endpoints);
  errorCatalogStore.set(source.name, errorCatalog);

  log.info(
    { source: source.name, endpointsStored: endpoints.length, errorsStored: errorCatalog.size },
    "In-memory stores populated",
  );

  // ── Result ──

  const result: IngestionResult = {
    source: source.name,
    chunksCreated: allChunks.length,
    vectorsUpserted,
    errorsEncountered: errors,
    durationMs: Date.now() - startMs,
  };

  log.info(result, "Ingestion pipeline complete");
  return result;
}

// ─── CLI entry point ───

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");

  if (sourceIdx === -1 || !args[sourceIdx + 1]) {
    const available = Object.keys(SOURCES).join(", ");
    console.error(`Usage: npm run ingest -- --source <name>`);
    console.error(`Available sources: ${available}`);
    process.exit(1);
  }

  const sourceName = args[sourceIdx + 1];

  try {
    const result = await runIngestion(sourceName);

    console.log("\n=== Ingestion Complete ===");
    console.log(`  Source:           ${result.source}`);
    console.log(`  Chunks created:   ${result.chunksCreated}`);
    console.log(`  Vectors upserted: ${result.vectorsUpserted}`);
    console.log(`  Duration:         ${result.durationMs}ms`);

    if (result.errorsEncountered.length > 0) {
      console.log(`  Errors (${result.errorsEncountered.length}):`);
      for (const err of result.errorsEncountered) {
        console.log(`    - ${err}`);
      }
    }
  } catch (err) {
    log.fatal({ err }, "Ingestion pipeline failed");
    console.error(
      `Fatal: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

// Run if invoked directly
const isMainModule =
  process.argv[1]?.endsWith("pipeline.ts") ||
  process.argv[1]?.endsWith("pipeline.js");

if (isMainModule) {
  main();
}

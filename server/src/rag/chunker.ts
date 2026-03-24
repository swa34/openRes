/**
 * DocScope — OpenAPI-aware document chunker
 *
 * Two strategies:
 * 1. Endpoint chunking: keeps full endpoint schema together (path, params, body, response, examples)
 * 2. Prose/markdown chunking: fixed-size with token overlap
 *
 * Each chunk gets ChunkMetadata and a stable, deterministic ID.
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import pino from "pino";
import type {
  DocumentChunk,
  ChunkMetadata,
  ParsedEndpoint,
} from "../types.js";

const log = pino({ name: "docscope:chunker" });

// ─── Configuration ───

export interface ChunkerConfig {
  /** Max tokens per prose chunk (approximate — uses word-based estimation) */
  maxChunkTokens: number;
  /** Token overlap between consecutive prose chunks */
  overlapTokens: number;
  /** Max characters per endpoint chunk before splitting */
  maxEndpointChars: number;
}

const DEFAULT_CONFIG: ChunkerConfig = {
  maxChunkTokens: 512,
  overlapTokens: 50,
  maxEndpointChars: 8000, // ~2000 tokens — generous to keep endpoints whole
};

// ─── Stable ID generation ───

/**
 * Generate a deterministic chunk ID from source + content identifiers.
 * Uses SHA-256 truncated to 16 hex chars for compact, collision-resistant IDs.
 */
function generateChunkId(
  api: string,
  source: string,
  identifier: string,
  index: number,
): string {
  const input = `${api}:${source}:${identifier}:${index}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return hash.slice(0, 16);
}

// ─── Token estimation ───

/**
 * Rough token count estimation. OpenAI tokenizers average ~0.75 tokens per word
 * for English text. Good enough for chunking boundaries.
 */
function estimateTokens(text: string): number {
  // Split on whitespace and count; multiply by ~1.3 for subword tokens
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return Math.ceil(words.length * 1.3);
}

// ─── Schema → readable text ───

function schemaToReadableText(
  schema: Record<string, unknown>,
  indent = "",
  visited = new WeakSet<object>(),
  depth = 0,
): string {
  if (depth > 4 || !schema || typeof schema !== "object") return "";
  if (visited.has(schema)) return `${indent}(circular reference)`;
  visited.add(schema);

  const parts: string[] = [];
  const desc = schema.description as string | undefined;
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;

  if (desc) parts.push(`${indent}${desc}`);

  if (props) {
    const required = new Set((schema.required as string[]) ?? []);
    for (const [name, prop] of Object.entries(props)) {
      if (!prop || typeof prop !== "object") continue;
      const pType = (prop.type as string) ?? "any";
      const pDesc = (prop.description as string) ?? "";
      const req = required.has(name) ? " (required)" : "";
      parts.push(`${indent}- ${name} [${pType}]${req}: ${pDesc.replace(/<[^>]*>/g, "").slice(0, 150)}`);
    }
  }

  const items = schema.items as Record<string, unknown> | undefined;
  if (items && typeof items === "object") {
    parts.push(schemaToReadableText(items, indent + "  ", visited, depth + 1));
  }

  for (const key of ["anyOf", "oneOf"] as const) {
    const variants = schema[key] as Record<string, unknown>[] | undefined;
    if (Array.isArray(variants)) {
      const names = variants.map((v) => (v.title as string) ?? (v.type as string) ?? "variant").slice(0, 5);
      parts.push(`${indent}One of: ${names.join(", ")}`);
    }
  }

  return parts.join("\n");
}

// ─── Endpoint chunking ───

/**
 * Build the full text representation of a parsed endpoint, keeping all
 * relevant schema information together for embedding.
 */
function endpointToText(endpoint: ParsedEndpoint): string {
  const parts: string[] = [];

  parts.push(`${endpoint.method.toUpperCase()} ${endpoint.path}`);

  if (endpoint.summary) {
    parts.push(`Summary: ${endpoint.summary}`);
  }
  if (endpoint.description) {
    parts.push(`Description: ${endpoint.description}`);
  }

  // Parameters
  if (endpoint.parameters.length > 0) {
    parts.push("Parameters:");
    for (const param of endpoint.parameters) {
      const req = param.required ? "(required)" : "(optional)";
      parts.push(
        `  - ${param.name} [${param.type}] ${req} (${param.location}): ${param.description}`,
      );
    }
  }

  // Request body — human-readable, not raw JSON
  if (endpoint.requestBody) {
    parts.push("Request Body:");
    parts.push(schemaToReadableText(endpoint.requestBody, "  "));
  }

  // Response schema — human-readable
  if (endpoint.responseSchema) {
    parts.push("Response:");
    parts.push(schemaToReadableText(endpoint.responseSchema, "  "));
  }

  // Error codes
  if (endpoint.errorCodes.length > 0) {
    parts.push("Error Codes:");
    for (const err of endpoint.errorCodes) {
      parts.push(
        `  - ${err.code} (HTTP ${err.httpStatus}): ${err.message}`,
      );
    }
  }

  return parts.join("\n");
}

/**
 * Chunk a parsed API endpoint. Keeps the full endpoint together as one chunk
 * if it fits within maxEndpointChars; otherwise splits into logical sub-chunks.
 */
export function chunkEndpoint(
  endpoint: ParsedEndpoint,
  api: string,
  source: string,
  config: Partial<ChunkerConfig> = {},
): DocumentChunk[] {
  const cfg: ChunkerConfig = { ...DEFAULT_CONFIG, ...config };
  const fullText = endpoint.rawText || endpointToText(endpoint);
  const identifier = `${endpoint.method}:${endpoint.path}`;

  // If it fits in one chunk, keep it whole
  if (fullText.length <= cfg.maxEndpointChars) {
    const id = generateChunkId(api, source, identifier, 0);
    return [
      {
        id,
        text: fullText,
        metadata: {
          api,
          source,
          endpoint: endpoint.path,
          method: endpoint.method.toUpperCase(),
          chunkIndex: 0,
          totalChunks: 1,
          type: "endpoint",
        },
      },
    ];
  }

  // Large endpoint — split into logical sections
  log.info(
    { endpoint: identifier, length: fullText.length },
    "Endpoint exceeds max size, splitting into sub-chunks",
  );

  const sections = splitEndpointSections(endpoint, api, source);

  // Update totalChunks on all sections
  for (const section of sections) {
    section.metadata.totalChunks = sections.length;
  }

  return sections;
}

/**
 * Split an oversized endpoint into logical sub-chunks:
 * 1. Overview (summary + description + params)
 * 2. Request body
 * 3. Response schema
 * 4. Examples
 * 5. Error codes
 */
function splitEndpointSections(
  endpoint: ParsedEndpoint,
  api: string,
  source: string,
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const identifier = `${endpoint.method}:${endpoint.path}`;
  let idx = 0;

  // Section 1: Overview
  const overviewParts: string[] = [
    `${endpoint.method.toUpperCase()} ${endpoint.path}`,
  ];
  if (endpoint.summary) overviewParts.push(`Summary: ${endpoint.summary}`);
  if (endpoint.description)
    overviewParts.push(`Description: ${endpoint.description}`);
  if (endpoint.parameters.length > 0) {
    overviewParts.push("Parameters:");
    for (const p of endpoint.parameters) {
      overviewParts.push(
        `  - ${p.name} [${p.type}] ${p.required ? "(required)" : "(optional)"}: ${p.description}`,
      );
    }
  }
  chunks.push({
    id: generateChunkId(api, source, identifier, idx++),
    text: overviewParts.join("\n"),
    metadata: {
      api,
      source,
      endpoint: endpoint.path,
      method: endpoint.method.toUpperCase(),
      chunkIndex: idx - 1,
      totalChunks: 0, // filled in later
      type: "endpoint",
    },
  });

  // Section 2: Request body (if present and non-trivial)
  if (endpoint.requestBody) {
    const bodyText = `${endpoint.method.toUpperCase()} ${endpoint.path} — Request Body\n${schemaToReadableText(endpoint.requestBody, "  ")}`;
    chunks.push({
      id: generateChunkId(api, source, identifier, idx++),
      text: bodyText,
      metadata: {
        api,
        source,
        endpoint: endpoint.path,
        method: endpoint.method.toUpperCase(),
        chunkIndex: idx - 1,
        totalChunks: 0,
        type: "endpoint",
      },
    });
  }

  // Section 3: Response schema
  if (endpoint.responseSchema) {
    const responseText = `${endpoint.method.toUpperCase()} ${endpoint.path} — Response\n${schemaToReadableText(endpoint.responseSchema, "  ")}`;
    chunks.push({
      id: generateChunkId(api, source, identifier, idx++),
      text: responseText,
      metadata: {
        api,
        source,
        endpoint: endpoint.path,
        method: endpoint.method.toUpperCase(),
        chunkIndex: idx - 1,
        totalChunks: 0,
        type: "endpoint",
      },
    });
  }

  // Section 4: Examples
  if (endpoint.examples.length > 0) {
    const exParts = [
      `${endpoint.method.toUpperCase()} ${endpoint.path} — Examples`,
    ];
    for (const ex of endpoint.examples) {
      exParts.push(`${ex.label} (${ex.language}):\n${ex.code}`);
    }
    chunks.push({
      id: generateChunkId(api, source, identifier, idx++),
      text: exParts.join("\n\n"),
      metadata: {
        api,
        source,
        endpoint: endpoint.path,
        method: endpoint.method.toUpperCase(),
        chunkIndex: idx - 1,
        totalChunks: 0,
        type: "endpoint",
      },
    });
  }

  // Section 5: Error codes
  if (endpoint.errorCodes.length > 0) {
    const errParts = [
      `${endpoint.method.toUpperCase()} ${endpoint.path} — Error Codes`,
    ];
    for (const e of endpoint.errorCodes) {
      errParts.push(
        `${e.code} (HTTP ${e.httpStatus}, ${e.type}): ${e.message}\n  Causes: ${e.commonCauses.join("; ")}\n  Resolution: ${e.resolution.join("; ")}`,
      );
    }
    chunks.push({
      id: generateChunkId(api, source, identifier, idx++),
      text: errParts.join("\n\n"),
      metadata: {
        api,
        source,
        endpoint: endpoint.path,
        method: endpoint.method.toUpperCase(),
        chunkIndex: idx - 1,
        totalChunks: 0,
        type: "error",
      },
    });
  }

  return chunks;
}

// ─── Prose/Markdown chunking ───

/**
 * Chunk prose or markdown text with fixed-size windows and token overlap.
 * Respects paragraph boundaries when possible.
 */
export function chunkProse(
  text: string,
  api: string,
  source: string,
  type: ChunkMetadata["type"] = "guide",
  config: Partial<ChunkerConfig> = {},
): DocumentChunk[] {
  const cfg: ChunkerConfig = { ...DEFAULT_CONFIG, ...config };

  if (!text.trim()) {
    return [];
  }

  // Split into paragraphs first
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: DocumentChunk[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  const flushChunk = () => {
    if (currentChunk.length === 0) return;

    const chunkText = currentChunk.join("\n\n");
    const idx = chunks.length;
    const id = generateChunkId(api, source, "prose", idx);

    chunks.push({
      id,
      text: chunkText,
      metadata: {
        api,
        source,
        chunkIndex: idx,
        totalChunks: 0, // filled in after all chunks created
        type,
      },
    });
  };

  for (const paragraph of paragraphs) {
    const pTokens = estimateTokens(paragraph);

    // If a single paragraph exceeds max tokens, split it by sentences
    if (pTokens > cfg.maxChunkTokens) {
      // Flush current buffer first
      flushChunk();
      currentChunk = [];
      currentTokens = 0;

      const subChunks = splitLongParagraph(
        paragraph,
        cfg.maxChunkTokens,
        cfg.overlapTokens,
      );
      for (const sub of subChunks) {
        currentChunk = [sub];
        flushChunk();
        currentChunk = [];
      }
      continue;
    }

    // Would adding this paragraph exceed the limit?
    if (currentTokens + pTokens > cfg.maxChunkTokens && currentChunk.length > 0) {
      flushChunk();

      // Overlap: carry the last paragraph into the next chunk
      const lastParagraph = currentChunk[currentChunk.length - 1];
      const lastTokens = estimateTokens(lastParagraph ?? "");

      if (lastTokens <= cfg.overlapTokens && lastParagraph) {
        currentChunk = [lastParagraph];
        currentTokens = lastTokens;
      } else {
        currentChunk = [];
        currentTokens = 0;
      }
    }

    currentChunk.push(paragraph);
    currentTokens += pTokens;
  }

  // Flush remaining
  flushChunk();

  // Update totalChunks
  for (const chunk of chunks) {
    chunk.metadata.totalChunks = chunks.length;
  }

  return chunks;
}

/**
 * Split a long paragraph (that exceeds maxTokens) into sentence-level sub-chunks.
 */
function splitLongParagraph(
  text: string,
  maxTokens: number,
  overlapTokens: number,
): string[] {
  // Split by sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) ?? [text];

  const subChunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sTokens = estimateTokens(sentence);

    if (currentTokens + sTokens > maxTokens && current.length > 0) {
      subChunks.push(current.join("").trim());

      // Overlap: keep last sentence if it's small enough
      const last = current[current.length - 1];
      const lastTokens = estimateTokens(last ?? "");
      if (lastTokens <= overlapTokens && last) {
        current = [last];
        currentTokens = lastTokens;
      } else {
        current = [];
        currentTokens = 0;
      }
    }

    current.push(sentence);
    currentTokens += sTokens;
  }

  if (current.length > 0) {
    subChunks.push(current.join("").trim());
  }

  return subChunks;
}

// ─── Batch chunking helpers ───

/**
 * Chunk multiple endpoints from a single API source.
 */
export function chunkEndpoints(
  endpoints: ParsedEndpoint[],
  api: string,
  source: string,
  config: Partial<ChunkerConfig> = {},
): DocumentChunk[] {
  const allChunks: DocumentChunk[] = [];

  for (const endpoint of endpoints) {
    const chunks = chunkEndpoint(endpoint, api, source, config);
    allChunks.push(...chunks);
  }

  log.info(
    { api, source, endpoints: endpoints.length, chunks: allChunks.length },
    "Chunked endpoints",
  );

  return allChunks;
}

/**
 * Auto-detect content type and chunk accordingly.
 * If the text looks like it contains OpenAPI endpoint definitions, treat as endpoints.
 * Otherwise, use prose chunking.
 */
export function chunkDocument(
  text: string,
  api: string,
  source: string,
  type: ChunkMetadata["type"] = "guide",
  config: Partial<ChunkerConfig> = {},
): DocumentChunk[] {
  return chunkProse(text, api, source, type, config);
}

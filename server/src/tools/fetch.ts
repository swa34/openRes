/**
 * DocScope — fetch tool handler (company knowledge compatible)
 *
 * Retrieves the full text of a document by its vector ID from Pinecone.
 *
 * content:  company-knowledge-compatible JSON (id, title, text, url, metadata)
 * structuredContent:  same document object for the widget
 * _meta:  source metadata and diagnostics
 */

import "dotenv/config";
import { z } from "zod";
import { Pinecone } from "@pinecone-database/pinecone";
import pino from "pino";
import type { FetchToolOutput, ChunkMetadata } from "../types.js";

const log = pino({ name: "docscope:tool:fetch" });

// ─── Pinecone client ───

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

const INDEX_NAME = process.env.PINECONE_INDEX ?? "docscope";

// ─── Definition ───

export const definition = {
  title: "Fetch document",
  description:
    "Retrieves the full text of a specific documentation page by its ID. Used after search to get complete content.",
  inputSchema: { id: z.string() },
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
};

// ─── Helpers ───

function buildUrl(metadata: Record<string, unknown>): string {
  const api = (metadata.api as string) ?? "";
  const endpoint = metadata.endpoint as string | undefined;

  if (api === "stripe" && endpoint) {
    const slug = endpoint.replace(/^\/v1\//, "").replace(/\//g, "/");
    return `https://docs.stripe.com/api/${slug}`;
  }
  if (api === "twilio" && endpoint) {
    return `https://www.twilio.com/docs/api${endpoint}`;
  }
  return (metadata.source as string) || `https://docs.example.com/${api}`;
}

function buildTitle(metadata: Record<string, unknown>): string {
  const api = (metadata.api as string) ?? "";
  const endpoint = metadata.endpoint as string | undefined;
  const method = metadata.method as string | undefined;

  if (endpoint && method) {
    return `${method.toUpperCase()} ${endpoint} — ${api} API`;
  }
  if (endpoint) {
    return `${endpoint} — ${api} API`;
  }
  return `${api} documentation`;
}

// ─── Handler ───

export async function handler(args: { id: string }): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  _meta: Record<string, unknown>;
}> {
  const { id } = args;

  log.info({ id }, "Fetch tool invoked");

  try {
    const pc = getPinecone();
    const index = pc.index(INDEX_NAME);

    // Pinecone fetch by vector ID (no namespace needed — fetch checks all)
    const fetchResponse = await index.fetch({ ids: [id] });
    const record = fetchResponse.records?.[id];

    if (!record) {
      log.warn({ id }, "Document not found in Pinecone");

      const notFound: FetchToolOutput = {
        id,
        title: "Document not found",
        text: `No document found with ID "${id}". The document may have been removed or the ID may be incorrect.`,
        url: "",
        metadata: null,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(notFound),
          },
        ],
        structuredContent: notFound as unknown as Record<string, unknown>,
        _meta: {
          found: false,
          id,
        },
      };
    }

    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    const text = (metadata.text as string) ?? "";
    const title = buildTitle(metadata);
    const url = buildUrl(metadata);

    // Build clean metadata for the output (strip internal fields like text, embedding)
    const cleanMetadata: Record<string, string> = {};
    for (const [key, val] of Object.entries(metadata)) {
      if (key !== "text" && typeof val === "string") {
        cleanMetadata[key] = val;
      } else if (key !== "text" && typeof val === "number") {
        cleanMetadata[key] = String(val);
      }
    }

    const doc: FetchToolOutput = {
      id,
      title,
      text,
      url,
      metadata: Object.keys(cleanMetadata).length > 0 ? cleanMetadata : null,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(doc),
        },
      ],
      structuredContent: doc as unknown as Record<string, unknown>,
      _meta: {
        found: true,
        id,
        source: (metadata.source as string) ?? null,
        chunkType: (metadata.type as string) ?? null,
        api: (metadata.api as string) ?? null,
      },
    };
  } catch (err) {
    log.error({ err, id }, "Fetch failed");

    const errorDoc: FetchToolOutput = {
      id,
      title: "Fetch error",
      text: `Failed to retrieve document "${id}". ${err instanceof Error ? err.message : "Unknown error."}`,
      url: "",
      metadata: null,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(errorDoc),
        },
      ],
      structuredContent: errorDoc as unknown as Record<string, unknown>,
      _meta: {
        found: false,
        id,
        error: err instanceof Error ? err.message : "Unknown error",
      },
    };
  }
}

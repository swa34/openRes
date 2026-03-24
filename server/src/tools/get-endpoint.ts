/**
 * DocScope — get_endpoint tool handler
 *
 * Looks up a parsed API endpoint by api + path + method from an in-memory
 * store populated by the ingestion pipeline.
 *
 * structuredContent:  concise endpoint summary (method, path, baseUrl, summary, parameters)
 * _meta:  full endpoint details (requestBody, responseSchema, examples, errorCodes)
 */

import { z } from "zod";
import pino from "pino";
import type {
  ParsedEndpoint,
  EndpointSchema,
  GetEndpointInput,
} from "../types.js";
import { ALLOWED_APIS } from "../types.js";

const log = pino({ name: "docscope:tool:get-endpoint" });

// ─── In-memory endpoint store ───
// Populated by ingestion pipeline via setEndpointStore()
// Key format: "api:METHOD:/path" (e.g. "stripe:POST:/v1/charges")

let endpointStore: Map<string, ParsedEndpoint> = new Map();

/**
 * Called by the ingestion pipeline to populate the endpoint store.
 * Key format: "api:METHOD:/path"
 */
export function setEndpointStore(store: Map<string, ParsedEndpoint>): void {
  endpointStore = store;
  log.info({ size: store.size }, "Endpoint store populated");
}

/**
 * Get the current endpoint store (for testing or introspection).
 */
export function getEndpointStore(): Map<string, ParsedEndpoint> {
  return endpointStore;
}

// ─── Definition ───

export const definition = {
  title: "Get API endpoint details",
  description:
    "Returns the full schema, parameters, request/response shapes, code examples, and error codes for a specific API endpoint.",
  inputSchema: {
    api: z.string(),
    path: z.string(),
    method: z.string().optional(),
  },
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
};

// ─── Helpers ───

function buildStoreKey(api: string, method: string, path: string): string {
  return `${api}:${method.toUpperCase()}:${path}`;
}

function findEndpoint(
  api: string,
  path: string,
  method?: string,
): ParsedEndpoint | null {
  if (method) {
    // Exact lookup
    const key = buildStoreKey(api, method, path);
    return endpointStore.get(key) ?? null;
  }

  // No method specified — find any method for this api+path
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  for (const m of methods) {
    const key = buildStoreKey(api, m, path);
    const found = endpointStore.get(key);
    if (found) return found;
  }

  return null;
}

/**
 * Safely serialize an object, replacing circular refs with "[Circular]".
 */
function safeClone<T>(obj: T): T {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  }));
}

function getBaseUrl(api: string): string {
  const apiConfig = ALLOWED_APIS.find((a) => a.name === api);
  return apiConfig?.baseUrl ?? `https://api.${api}.com`;
}

// ─── Handler ───

export async function handler(args: {
  api: string;
  path: string;
  method?: string;
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  _meta: Record<string, unknown>;
}> {
  const { api, path, method } = args;

  log.info({ api, path, method }, "get_endpoint tool invoked");

  const endpoint = findEndpoint(api, path, method);

  if (!endpoint) {
    const displayMethod = method?.toUpperCase() ?? "ANY";
    log.warn({ api, path, method: displayMethod }, "Endpoint not found");

    return {
      content: [
        {
          type: "text" as const,
          text: `Endpoint ${displayMethod} ${path} not found for API "${api}". The endpoint may not be indexed yet.`,
        },
      ],
      structuredContent: {
        error: "not_found",
        api,
        path,
        method: displayMethod,
        message: `No endpoint matching ${displayMethod} ${path} found for ${api}.`,
        availableEndpoints: Array.from(endpointStore.keys())
          .filter((k) => k.startsWith(`${api}:`))
          .slice(0, 20),
      },
      _meta: {
        found: false,
        api,
        path,
        method: displayMethod,
        storeSize: endpointStore.size,
      },
    };
  }

  const resolvedMethod = method?.toUpperCase() ?? endpoint.method.toUpperCase();
  const baseUrl = getBaseUrl(api);

  // Build the full EndpointSchema for _meta
  const fullEndpoint: EndpointSchema = {
    method: resolvedMethod,
    path: endpoint.path,
    baseUrl,
    summary: endpoint.summary,
    description: endpoint.description,
    parameters: endpoint.parameters,
    requestBody: endpoint.requestBody,
    responseSchema: endpoint.responseSchema,
    examples: endpoint.examples,
    errorCodes: endpoint.errorCodes,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: `Endpoint details for ${resolvedMethod} ${path} (${api})`,
      },
    ],
    structuredContent: {
      endpoint: {
        method: resolvedMethod,
        path: endpoint.path,
        baseUrl,
        summary: endpoint.summary,
        parameters: endpoint.parameters,
      },
    },
    _meta: {
      found: true,
      endpoint: safeClone(fullEndpoint),
    },
  };
}

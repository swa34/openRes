/**
 * DocScope — debug_error tool handler
 *
 * Looks up API error codes, messages, or HTTP statuses from an in-memory
 * error catalog populated by the ingestion pipeline.
 *
 * structuredContent:  error info + suggestions
 * _meta:  full resolution details + related endpoints
 */

import { z } from "zod";
import pino from "pino";
import type { ErrorInfo, DebugErrorInput, DebugErrorOutput } from "../types.js";

const log = pino({ name: "docscope:tool:debug-error" });

// ─── In-memory error catalog ───
// Populated by ingestion pipeline via setErrorCatalog()
// Key format: "api:errorCode" (e.g. "stripe:card_declined")

let errorCatalog: Map<string, ErrorInfo> = new Map();

/**
 * Called by the ingestion pipeline to populate the error catalog.
 * Key format: "api:errorCode"
 */
export function setErrorCatalog(catalog: Map<string, ErrorInfo>): void {
  errorCatalog = catalog;
  log.info({ size: catalog.size }, "Error catalog populated");
}

/**
 * Get the current error catalog (for testing or introspection).
 */
export function getErrorCatalog(): Map<string, ErrorInfo> {
  return errorCatalog;
}

// ─── Definition ───

export const definition = {
  title: "Debug API error",
  description:
    "Looks up an API error code or HTTP status and returns common causes, resolution steps, and related endpoints.",
  inputSchema: {
    api: z.string(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    httpStatus: z.number().optional(),
  },
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
};

// ─── Helpers ───

/**
 * Search the catalog by error code (exact match).
 */
function findByCode(api: string, errorCode: string): ErrorInfo | null {
  return errorCatalog.get(`${api}:${errorCode}`) ?? null;
}

/**
 * Search the catalog by HTTP status code.
 * Returns the first match for the given API.
 */
function findByHttpStatus(api: string, httpStatus: number): ErrorInfo | null {
  for (const [key, info] of errorCatalog) {
    if (key.startsWith(`${api}:`) && info.httpStatus === httpStatus) {
      return info;
    }
  }
  return null;
}

/**
 * Search the catalog by error message substring (case-insensitive).
 * Returns the best match for the given API.
 */
function findByMessage(api: string, errorMessage: string): ErrorInfo | null {
  const needle = errorMessage.toLowerCase();
  let bestMatch: ErrorInfo | null = null;
  let bestScore = 0;

  for (const [key, info] of errorCatalog) {
    if (!key.startsWith(`${api}:`)) continue;

    // Check message match
    const infoMsg = info.message.toLowerCase();
    if (infoMsg === needle) {
      return info; // Exact match — return immediately
    }

    if (infoMsg.includes(needle) || needle.includes(infoMsg)) {
      const score = Math.min(needle.length, infoMsg.length) /
        Math.max(needle.length, infoMsg.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = info;
      }
    }

    // Also check common causes
    for (const cause of info.commonCauses) {
      if (cause.toLowerCase().includes(needle)) {
        if (0.5 > bestScore) {
          bestScore = 0.5;
          bestMatch = info;
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Generate generic suggestions when no catalog match is found.
 */
function genericSuggestions(
  api: string,
  errorCode?: string,
  errorMessage?: string,
  httpStatus?: number,
): string[] {
  const suggestions: string[] = [];

  if (httpStatus) {
    if (httpStatus === 401 || httpStatus === 403) {
      suggestions.push(
        "Verify your API key is correct and has the necessary permissions.",
        "Check that you're using the right environment (test vs live).",
      );
    } else if (httpStatus === 404) {
      suggestions.push(
        "Verify the endpoint path is correct.",
        "Check the API version in the URL.",
      );
    } else if (httpStatus === 429) {
      suggestions.push(
        "You're being rate limited. Implement exponential backoff.",
        "Check the Retry-After header for wait time.",
      );
    } else if (httpStatus >= 500) {
      suggestions.push(
        "This is a server-side error. Retry with exponential backoff.",
        `Check the ${api} status page for ongoing incidents.`,
      );
    }
  }

  if (suggestions.length === 0) {
    suggestions.push(
      `Check the ${api} API documentation for error code "${errorCode ?? errorMessage ?? `HTTP ${httpStatus}`}".`,
      `Use the search tool to find relevant documentation about this error.`,
    );
  }

  return suggestions;
}

// ─── Handler ───

export async function handler(args: {
  api: string;
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  _meta: Record<string, unknown>;
}> {
  const { api, errorCode, errorMessage, httpStatus } = args;

  log.info({ api, errorCode, errorMessage, httpStatus }, "debug_error tool invoked");

  // Validate that at least one lookup key is provided
  if (!errorCode && !errorMessage && httpStatus === undefined) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Please provide at least one of: errorCode, errorMessage, or httpStatus to look up.`,
        },
      ],
      structuredContent: {
        error: null,
        suggestions: [
          "Provide an error code (e.g., 'card_declined'), error message, or HTTP status code.",
        ],
      },
      _meta: {
        found: false,
        api,
        catalogSize: errorCatalog.size,
      },
    };
  }

  // Try to find the error in the catalog (priority: code > status > message)
  let errorInfo: ErrorInfo | null = null;

  if (errorCode) {
    errorInfo = findByCode(api, errorCode);
  }

  if (!errorInfo && httpStatus !== undefined) {
    errorInfo = findByHttpStatus(api, httpStatus);
  }

  if (!errorInfo && errorMessage) {
    errorInfo = findByMessage(api, errorMessage);
  }

  // Build the display label for content text
  const displayLabel = errorCode ?? errorMessage ?? `HTTP ${httpStatus}`;

  if (!errorInfo) {
    log.info({ api, displayLabel }, "Error not found in catalog");

    const suggestions = genericSuggestions(api, errorCode, errorMessage, httpStatus);

    return {
      content: [
        {
          type: "text" as const,
          text: `Error "${displayLabel}" not found in the ${api} error catalog. ${suggestions[0]}`,
        },
      ],
      structuredContent: {
        error: null,
        suggestions,
      },
      _meta: {
        found: false,
        api,
        lookupKey: displayLabel,
        catalogSize: errorCatalog.size,
      },
    };
  }

  // Build suggestions from the resolution steps
  const suggestions = [
    ...errorInfo.resolution,
  ];

  const output: DebugErrorOutput = {
    error: errorInfo,
    suggestions,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: `Error lookup for ${api}: ${displayLabel} — ${errorInfo.message}`,
      },
    ],
    structuredContent: {
      error: {
        code: errorInfo.code,
        httpStatus: errorInfo.httpStatus,
        type: errorInfo.type,
        message: errorInfo.message,
        commonCauses: errorInfo.commonCauses,
      },
      suggestions,
    },
    _meta: {
      found: true,
      api,
      error: errorInfo,
      relatedEndpoints: errorInfo.relatedEndpoints,
    },
  };
}

/**
 * DocScope — Error catalog builder
 *
 * Aggregates all error codes from parsed endpoints into a lookup table
 * keyed by error code. Supports lookup by error code, HTTP status, or
 * partial error message match.
 */

import "dotenv/config";
import pino from "pino";
import type { ParsedEndpoint, ErrorInfo } from "../types.js";

const log = pino({ name: "docscope:error-catalog" });

/**
 * Build a deduplicated error catalog from parsed endpoints.
 *
 * The Map is keyed by error code (string). When multiple endpoints share
 * the same error code, their relatedEndpoints lists are merged.
 */
export function buildErrorCatalog(
  endpoints: ParsedEndpoint[],
): Map<string, ErrorInfo> {
  const catalog = new Map<string, ErrorInfo>();

  for (const endpoint of endpoints) {
    for (const error of endpoint.errorCodes) {
      const existing = catalog.get(error.code);

      if (existing) {
        // Merge relatedEndpoints, avoiding duplicates
        const endpointSet = new Set([
          ...existing.relatedEndpoints,
          ...error.relatedEndpoints,
        ]);
        existing.relatedEndpoints = [...endpointSet];
      } else {
        // Clone to avoid shared references
        catalog.set(error.code, {
          code: error.code,
          httpStatus: error.httpStatus,
          type: error.type,
          message: error.message,
          commonCauses: [...error.commonCauses],
          resolution: [...error.resolution],
          relatedEndpoints: [...error.relatedEndpoints],
        });
      }
    }
  }

  log.info(
    { totalErrors: catalog.size, fromEndpoints: endpoints.length },
    "Error catalog built",
  );

  return catalog;
}

/**
 * Look up an error in the catalog by code, HTTP status, or partial message match.
 *
 * Priority:
 * 1. Exact error code match
 * 2. HTTP status match (returns first match)
 * 3. Partial message match (case-insensitive substring)
 *
 * Returns null if no match found.
 */
export function lookupError(
  catalog: Map<string, ErrorInfo>,
  opts: {
    errorCode?: string;
    httpStatus?: number;
    errorMessage?: string;
  },
): ErrorInfo | null {
  // 1. Exact code match
  if (opts.errorCode) {
    const byCode = catalog.get(opts.errorCode);
    if (byCode) return byCode;
  }

  // 2. HTTP status match
  if (opts.httpStatus !== undefined) {
    for (const error of catalog.values()) {
      if (error.httpStatus === opts.httpStatus) {
        return error;
      }
    }
  }

  // 3. Partial message match
  if (opts.errorMessage) {
    const needle = opts.errorMessage.toLowerCase();
    for (const error of catalog.values()) {
      if (error.message.toLowerCase().includes(needle)) {
        return error;
      }
      // Also check common causes
      for (const cause of error.commonCauses) {
        if (cause.toLowerCase().includes(needle)) {
          return error;
        }
      }
    }
  }

  return null;
}

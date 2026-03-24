/**
 * DocScope API Test Engine — Response Sanitizer
 *
 * Two modes:
 * - sanitizeForStructuredContent: stripped down for model consumption
 *   (NO secrets, truncated body)
 * - sanitizeForMeta: full response for widget, secrets redacted
 */

import type { TestEndpointOutput } from "../types.js";

const BODY_PREVIEW_LIMIT = 500;

/** Headers that must never appear in structuredContent */
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
]);

/** Pattern that catches common API key formats in string values */
const API_KEY_PATTERNS = [
  /sk_(test|live)_[A-Za-z0-9]+/g,
  /rk_(test|live)_[A-Za-z0-9]+/g,
  /AC[0-9a-f]{32}/gi,
  /Bearer\s+[^\s"']+/gi,
  /Basic\s+[A-Za-z0-9+/=]+/gi,
];

/**
 * Recursively scrub API key patterns from any string value in an object.
 */
function scrubKeys(value: unknown): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const pattern of API_KEY_PATTERNS) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      result = result.replace(pattern, "[REDACTED]");
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(scrubKeys);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * Strip sensitive headers from a headers record (case-insensitive).
 */
function stripSensitiveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Redact (but keep) sensitive header values.
 */
function redactSensitiveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      out[key] = "***";
    } else {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Build the `summary` portion of TestEndpointOutput.
 * This goes into structuredContent — the model sees it.
 * NEVER let API keys leak here.
 */
export function sanitizeForStructuredContent(raw: {
  statusCode: number;
  statusText: string;
  latencyMs: number;
  contentType: string;
  headers: Record<string, string>;
  body: string;
}): TestEndpointOutput["summary"] {
  // Truncate body
  let bodyPreview = raw.body.slice(0, BODY_PREVIEW_LIMIT);
  if (raw.body.length > BODY_PREVIEW_LIMIT) {
    bodyPreview += `... [truncated, ${raw.body.length} chars total]`;
  }

  // Scrub any leaked keys from the body preview
  bodyPreview = scrubKeys(bodyPreview) as string;

  return {
    statusCode: raw.statusCode,
    statusText: raw.statusText,
    latencyMs: Math.round(raw.latencyMs * 100) / 100,
    contentType: raw.contentType,
    bodyPreview,
  };
}

/**
 * Build the `full` portion of TestEndpointOutput.
 * This goes into _meta — only the widget sees it.
 * We keep the full body but redact auth header values.
 */
export function sanitizeForMeta(raw: {
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}): TestEndpointOutput["full"] {
  return {
    headers: redactSensitiveHeaders(raw.headers),
    body: scrubKeys(raw.body),
    rawBody: scrubKeys(raw.rawBody) as string,
  };
}

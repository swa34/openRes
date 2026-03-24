/**
 * DocScope API Test Engine — Request Executor
 *
 * Executes live HTTP requests against allowlisted APIs.
 * Security flow: validate key format -> validate URL (SSRF guard) -> build auth -> fetch -> sanitize
 */

import { performance } from "node:perf_hooks";
import pino from "pino";
import { nanoid } from "nanoid";
import type { TestEndpointInput, TestEndpointOutput } from "../types.js";
import { ALLOWED_APIS } from "../types.js";
import { buildAuthHeader, validateApiKey } from "./auth.js";
import { validateTargetUrl } from "./guard.js";
import {
  sanitizeForStructuredContent,
  sanitizeForMeta,
} from "./sanitizer.js";

const logger = pino({ name: "docscope-executor" });

const REQUEST_TIMEOUT_MS = 30_000;

export class ExecutorError extends Error {
  public readonly code: string;
  public readonly requestId: string;

  constructor(code: string, message: string, requestId: string) {
    super(message);
    this.name = "ExecutorError";
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Execute a live API request and return a sanitized result.
 */
export async function executeTestRequest(
  input: TestEndpointInput,
): Promise<TestEndpointOutput> {
  const requestId = nanoid();

  logger.info({
    requestId,
    api: input.api,
    method: input.method,
    path: input.path,
    apiKey: "[REDACTED]",
    msg: "Test request initiated",
  });

  // 1. Look up API config
  const apiConfig = ALLOWED_APIS.find((a) => a.name === input.api);
  if (!apiConfig) {
    throw new ExecutorError(
      "UNKNOWN_API",
      `API "${input.api}" is not in the allowlist`,
      requestId,
    );
  }

  // 2. Validate API key format
  const keyValidation = validateApiKey(input.apiKey, input.api);
  if (!keyValidation.valid) {
    throw new ExecutorError(
      "INVALID_API_KEY",
      keyValidation.message,
      requestId,
    );
  }

  // 3. Build full URL
  const url = buildUrl(apiConfig.baseUrl, input.path, input.queryParams);

  // 4. SSRF guard
  const guardResult = await validateTargetUrl(url, input.api);
  if (!guardResult.allowed) {
    throw new ExecutorError("BLOCKED_URL", guardResult.reason, requestId);
  }

  // 5. Build request headers
  const authHeaders = buildAuthHeader(input.apiKey, apiConfig);
  const headers: Record<string, string> = {
    "User-Agent": "DocScope-TestEngine/1.0",
    Accept: "application/json",
    ...authHeaders,
    ...(input.headers ?? {}),
  };

  // 6. Build request options
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const fetchOptions: RequestInit = {
    method: input.method.toUpperCase(),
    headers,
    signal: controller.signal,
    redirect: "follow",
  };

  // Attach body for methods that support it
  if (input.body && !["GET", "HEAD", "DELETE"].includes(input.method.toUpperCase())) {
    fetchOptions.body = JSON.stringify(input.body);
    (fetchOptions.headers as Record<string, string>)["Content-Type"] =
      "application/json";
  }

  // 7. Execute
  let response: Response;
  const startTime = performance.now();
  let latencyMs: number;

  try {
    response = await fetch(url, fetchOptions);
    latencyMs = performance.now() - startTime;
  } catch (err: unknown) {
    clearTimeout(timeout);
    latencyMs = performance.now() - startTime;

    if (err instanceof DOMException && err.name === "AbortError") {
      logger.warn({ requestId, latencyMs, msg: "Request timed out" });
      throw new ExecutorError(
        "TIMEOUT",
        `Request to ${input.api} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        requestId,
      );
    }

    const message =
      err instanceof Error ? err.message : "Unknown network error";
    logger.error({ requestId, msg: "Network error", error: message });
    throw new ExecutorError(
      "NETWORK_ERROR",
      `Network error calling ${input.api}: ${message}`,
      requestId,
    );
  } finally {
    clearTimeout(timeout);
  }

  // 8. Read response
  const rawBody = await response.text();
  const contentType = response.headers.get("content-type") ?? "unknown";

  // Parse body as JSON if possible
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    parsedBody = rawBody;
  }

  // Collect response headers
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  logger.info({
    requestId,
    statusCode: response.status,
    latencyMs: Math.round(latencyMs),
    contentType,
    bodyLength: rawBody.length,
    msg: "Test request completed",
  });

  // 9. Handle 429 rate limiting
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const retryMsg = retryAfter
      ? ` Retry after ${retryAfter} seconds.`
      : "";
    logger.warn({ requestId, retryAfter, msg: "Rate limited by target API" });
    // Still return the response — don't throw. The caller should see the 429.
    // But annotate the body preview.
    const summary = sanitizeForStructuredContent({
      statusCode: response.status,
      statusText: response.statusText || "Too Many Requests",
      latencyMs,
      contentType,
      headers: responseHeaders,
      body: `Rate limited by ${input.api}.${retryMsg} Response: ${rawBody}`,
    });

    const full = sanitizeForMeta({
      headers: responseHeaders,
      body: parsedBody,
      rawBody,
    });

    return { summary, full };
  }

  // 10. Sanitize and return
  const summary = sanitizeForStructuredContent({
    statusCode: response.status,
    statusText: response.statusText,
    latencyMs,
    contentType,
    headers: responseHeaders,
    body: rawBody,
  });

  const full = sanitizeForMeta({
    headers: responseHeaders,
    body: parsedBody,
    rawBody,
  });

  return { summary, full };
}

/**
 * Build full URL from base, path, and optional query params.
 */
function buildUrl(
  baseUrl: string,
  path: string,
  queryParams?: Record<string, string>,
): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, baseUrl);

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

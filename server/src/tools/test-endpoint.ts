/**
 * DocScope — test_endpoint tool handler
 *
 * Makes a live HTTP request to an allowlisted API endpoint.
 * Delegates to the test executor which handles auth, SSRF guard,
 * and response sanitization.
 *
 * structuredContent:  sanitized summary (statusCode, statusText, latencyMs, contentType, bodyPreview)
 * _meta:  full response (headers, body, rawBody) — only visible to the widget
 */

import { z } from "zod";
import pino from "pino";
import {
  executeTestRequest,
  ExecutorError,
} from "../testing/executor.js";
import type { TestEndpointInput } from "../types.js";

const log = pino({ name: "docscope:tool:test-endpoint" });

// ─── Definition ───

export const definition = {
  title: "Test API endpoint",
  description:
    "Makes a live HTTP request to the specified API endpoint and returns the response. Requires an API key. The key is only visible in _meta, never in structuredContent.",
  inputSchema: {
    api: z.string(),
    method: z.string(),
    path: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    queryParams: z.record(z.string(), z.string()).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
    apiKey: z.string(),
  },
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  },
};

// ─── Handler ───

export async function handler(args: {
  api: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: Record<string, unknown>;
  apiKey: string;
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  _meta: Record<string, unknown>;
}> {
  const { api, method, path, headers, queryParams, body, apiKey } = args;

  log.info(
    { api, method, path, apiKey: "[REDACTED]" },
    "test_endpoint tool invoked",
  );

  const input: TestEndpointInput = {
    api,
    method: method.toUpperCase(),
    path,
    headers,
    queryParams,
    body,
    apiKey,
  };

  try {
    const result = await executeTestRequest(input);

    return {
      content: [
        {
          type: "text" as const,
          text: `Tested ${method.toUpperCase()} ${path} on ${api}: ${result.summary.statusCode} ${result.summary.statusText} in ${Math.round(result.summary.latencyMs)}ms`,
        },
      ],
      structuredContent: result.summary as unknown as Record<string, unknown>,
      _meta: result.full as unknown as Record<string, unknown>,
    };
  } catch (err) {
    if (err instanceof ExecutorError) {
      log.warn(
        { code: err.code, requestId: err.requestId, msg: err.message },
        "Executor error",
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Test failed for ${method.toUpperCase()} ${path} on ${api}: [${err.code}] ${err.message}`,
          },
        ],
        structuredContent: {
          error: true,
          code: err.code,
          message: err.message,
          requestId: err.requestId,
        },
        _meta: {
          error: true,
          code: err.code,
          message: err.message,
          requestId: err.requestId,
        },
      };
    }

    // Unexpected error
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err }, "Unexpected test_endpoint error");

    return {
      content: [
        {
          type: "text" as const,
          text: `Test failed for ${method.toUpperCase()} ${path} on ${api}: ${message}`,
        },
      ],
      structuredContent: {
        error: true,
        code: "INTERNAL_ERROR",
        message,
      },
      _meta: {
        error: true,
        code: "INTERNAL_ERROR",
        message,
      },
    };
  }
}

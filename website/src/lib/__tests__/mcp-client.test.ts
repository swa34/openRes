import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpError } from "../mcp-client";

// We test the McpError class and mock-based fetch behavior.
// The actual network calls are tested via integration tests against the live server.

describe("McpError", () => {
  it("has correct name", () => {
    const err = new McpError("test", "TIMEOUT", true);
    expect(err.name).toBe("McpError");
  });

  it("exposes code property", () => {
    const err = new McpError("msg", "NETWORK", true);
    expect(err.code).toBe("NETWORK");
  });

  it("exposes retryable property", () => {
    const errRetryable = new McpError("msg", "TIMEOUT", true);
    expect(errRetryable.retryable).toBe(true);

    const errNotRetryable = new McpError("msg", "RPC_-32600", false);
    expect(errNotRetryable.retryable).toBe(false);
  });

  it("extends Error", () => {
    const err = new McpError("test", "TIMEOUT", true);
    expect(err).toBeInstanceOf(Error);
  });

  it("carries the message", () => {
    const err = new McpError("Something went wrong", "HTTP_ERROR", false);
    expect(err.message).toBe("Something went wrong");
  });
});

describe("MCP client fetch behavior", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("search sends correct JSON-RPC payload", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [{ type: "text", text: "results" }],
            structuredContent: { results: [] },
          },
        }),
    };
    (globalThis.fetch as any).mockResolvedValue(mockResponse);

    // Dynamic import to reset module state
    const { search } = await import("../mcp-client");
    await search("test query", "stripe");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://openres-production.up.railway.app/mcp",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );

    const call = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("search");
    expect(body.params.arguments.query).toBe("test query");
    expect(body.params.arguments.api).toBe("stripe");
  });

  it("handles HTTP 429 rate limiting", async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "30" }),
      json: () => Promise.resolve({}),
    };
    (globalThis.fetch as any).mockResolvedValue(mockResponse);

    const { search } = await import("../mcp-client");

    try {
      await search("test");
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(McpError);
      expect(err.code).toBe("RATE_LIMITED");
      expect(err.retryable).toBe(true);
    }
  });

  it("handles JSON-RPC error response", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32600, message: "Invalid request" },
        }),
    };
    (globalThis.fetch as any).mockResolvedValue(mockResponse);

    const { search } = await import("../mcp-client");

    try {
      await search("test");
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(McpError);
      expect(err.code).toBe("RPC_-32600");
      expect(err.retryable).toBe(false);
    }
  });

  it("handles network failure", async () => {
    (globalThis.fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));

    const { search } = await import("../mcp-client");

    try {
      await search("test");
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(McpError);
      expect(err.code).toBe("NETWORK");
      expect(err.retryable).toBe(true);
    }
  });

  it("no API key exposure in search calls", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [], structuredContent: { results: [] } },
        }),
    };
    (globalThis.fetch as any).mockResolvedValue(mockResponse);

    const { search } = await import("../mcp-client");
    await search("test query");

    const call = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body);
    const bodyStr = JSON.stringify(body);

    // No API keys should appear anywhere in the request
    expect(bodyStr).not.toMatch(/sk_(test|live)_/);
    expect(bodyStr).not.toMatch(/rk_(test|live)_/);
    expect(bodyStr).not.toContain("apiKey");
  });
});

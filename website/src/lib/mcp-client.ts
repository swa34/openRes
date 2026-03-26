/**
 * Lightweight MCP JSON-RPC client for the DocScope demo page.
 *
 * The production server uses Streamable HTTP transport in stateless mode
 * with JSON responses (no SSE). Each request is a standalone JSON-RPC call.
 *
 * Only exposes read-only tools (search, get_endpoint) — test_endpoint is
 * intentionally excluded to avoid credential handling in the browser.
 */

const MCP_ENDPOINT =
  import.meta.env.VITE_MCP_SERVER_URL ??
  "https://openres-production.up.railway.app/mcp";
const REQUEST_TIMEOUT_MS = 15_000;

// ─── JSON-RPC types ───

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

// ─── MCP result types ───

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  text: string;
  score: number;
  api: string;
  endpoint?: string;
}

export interface SearchToolResult {
  content: Array<{
    type: string;
    text?: string;
  }>;
  structuredContent?: {
    type: string;
    results?: SearchResult[];
    query?: string;
    total?: number;
  };
}

export interface EndpointParam {
  name: string;
  in: string;
  location: string;
  required: boolean;
  type: string;
  description?: string;
}

export interface EndpointResponse {
  status: number;
  description: string;
}

export interface EndpointExample {
  code: string;
  language: string;
  label?: string;
}

export interface EndpointDetail {
  api: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  parameters?: EndpointParam[];
  responses?: EndpointResponse[];
  requestBody?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
  examples?: EndpointExample[];
}

export interface GetEndpointToolResult {
  content: Array<{
    type: string;
    text?: string;
  }>;
  structuredContent?: {
    type: string;
    endpoint?: EndpointDetail;
  };
}

// ─── Error types ───

export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: string | number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "McpError";
  }
}

// ─── Internal helpers ───

let requestId = 0;

function nextId(): number {
  return ++requestId;
}

async function rpcCall<T>(
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: nextId(),
    method,
    params,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new McpError(
        "Request timed out — the server may be starting up. Try again in a moment.",
        "TIMEOUT",
        true,
      );
    }
    throw new McpError(
      "Unable to reach the DocScope server. Check your connection.",
      "NETWORK",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After") ?? "60";
    throw new McpError(
      `Rate limited — try again in ${retryAfter}s.`,
      "RATE_LIMITED",
      true,
    );
  }

  if (!res.ok) {
    throw new McpError(
      `Server returned ${res.status}`,
      "HTTP_ERROR",
      res.status >= 500,
    );
  }

  const json = (await res.json()) as JsonRpcResponse<T>;

  if (json.error) {
    throw new McpError(
      json.error.message ?? "Unknown server error",
      `RPC_${json.error.code}`,
      false,
    );
  }

  return json.result as T;
}

// ─── MCP handshake ───

interface InitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: { name: string; version: string };
}

/**
 * Send the MCP `initialize` handshake.
 * In stateless mode this just confirms the server is alive and returns
 * capabilities — no session is created.
 */
export async function initialize(): Promise<InitializeResult> {
  return rpcCall<InitializeResult>("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "docscope-website", version: "1.0.0" },
  });
}

// ─── Tool calls ───

/**
 * Search API documentation.
 * @param query - Natural language search query
 * @param api   - Optional filter: "stripe" or "twilio"
 */
export async function search(
  query: string,
  api?: string,
): Promise<SearchToolResult> {
  const args: Record<string, unknown> = { query };
  if (api) args.api = api;

  return rpcCall<SearchToolResult>("tools/call", {
    name: "search",
    arguments: args,
  });
}

/**
 * Get full endpoint details.
 * @param api    - "stripe" or "twilio"
 * @param path   - Endpoint path, e.g. "/v1/charges"
 * @param method - Optional HTTP method, e.g. "POST"
 */
export async function getEndpoint(
  api: string,
  path: string,
  method?: string,
): Promise<GetEndpointToolResult> {
  const args: Record<string, unknown> = { api, path };
  if (method) args.method = method;

  return rpcCall<GetEndpointToolResult>("tools/call", {
    name: "get_endpoint",
    arguments: args,
  });
}

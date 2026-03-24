/**
 * DocScope widget types — matches server-side types for tool results.
 * The widget receives these via MCP Apps bridge (ui/notifications/tool-result).
 */

// ─── Bridge Types ───

export interface ToolResult {
  toolName: string;
  structuredContent: unknown;
  content: Array<{ type: string; text: string }>;
  _meta: Record<string, unknown>;
}

// ─── Search Results ───

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  text: string;
  score: number;
  api: string;
  endpoint?: string;
}

// ─── Endpoint Schema ───

export interface EndpointParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  location: "path" | "query" | "header" | "body";
}

export interface CodeExample {
  language: string;
  label: string;
  code: string;
}

export interface ErrorInfo {
  code: string;
  httpStatus: number;
  type: string;
  message: string;
  commonCauses: string[];
  resolution: string[];
  relatedEndpoints: string[];
}

export interface EndpointSchema {
  method: string;
  path: string;
  baseUrl: string;
  summary: string;
  description: string;
  parameters: EndpointParam[];
  requestBody: Record<string, unknown> | null;
  responseSchema: Record<string, unknown> | null;
  examples: CodeExample[];
  errorCodes: ErrorInfo[];
}

// ─── Test Endpoint Response ───

export interface TestEndpointSummary {
  statusCode: number;
  statusText: string;
  latencyMs: number;
  contentType: string;
  bodyPreview: string;
}

export interface TestEndpointFull {
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}

// ─── Widget View State ───

export type ActiveView =
  | { type: "idle" }
  | { type: "search"; results: SearchResult[] }
  | { type: "endpoint"; endpoint: EndpointSchema }
  | { type: "request-builder"; endpoint: EndpointSchema }
  | { type: "response"; summary: TestEndpointSummary; full: TestEndpointFull }
  | { type: "error"; error: ErrorInfo; suggestions: string[] }
  | { type: "loading"; message: string }
  | { type: "prompt-hint"; hint: string }
  | { type: "tool-error"; message: string; retryAction?: () => void };

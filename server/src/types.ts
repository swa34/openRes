/**
 * DocScope shared types — interface contracts between agent workstreams.
 * All agents code against these types. Changes require orchestrator approval.
 */

// ─── Search Tool (company knowledge compatible) ───

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  text: string; // snippet
  score: number;
  api: string; // e.g. "stripe", "twilio"
  endpoint?: string; // e.g. "/v1/charges"
}

export interface SearchToolInput {
  query: string;
}

export interface SearchToolOutput {
  results: SearchResult[];
}

// ─── Fetch Tool (company knowledge compatible) ───

export interface FetchToolInput {
  id: string;
}

export interface FetchToolOutput {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata: Record<string, string> | null;
}

// ─── Get Endpoint Tool ───

export interface EndpointParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  location: "path" | "query" | "header" | "body";
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

export interface CodeExample {
  language: string;
  label: string;
  code: string;
}

export interface GetEndpointInput {
  api: string;
  path: string;
  method?: string;
}

export interface GetEndpointOutput {
  endpoint: EndpointSchema;
}

// ─── Test Endpoint Tool ───

export interface TestEndpointInput {
  api: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: Record<string, unknown>;
  apiKey: string; // session-only, never persisted
}

export interface TestEndpointOutput {
  /** Goes in structuredContent (model sees this) */
  summary: {
    statusCode: number;
    statusText: string;
    latencyMs: number;
    contentType: string;
    bodyPreview: string; // truncated to 500 chars
  };
  /** Goes in _meta (only widget sees this) */
  full: {
    headers: Record<string, string>;
    body: unknown;
    rawBody: string;
  };
}

// ─── Debug Error Tool ───

export interface ErrorInfo {
  code: string;
  httpStatus: number;
  type: string;
  message: string;
  commonCauses: string[];
  resolution: string[];
  relatedEndpoints: string[];
}

export interface DebugErrorInput {
  api: string;
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
}

export interface DebugErrorOutput {
  error: ErrorInfo | null;
  suggestions: string[];
}

// ─── RAG Pipeline Interfaces ───

export interface DocumentChunk {
  id: string;
  text: string;
  embedding?: number[];
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  api: string;
  source: string; // file path or URL
  endpoint?: string;
  method?: string;
  chunkIndex: number;
  totalChunks: number;
  type: "endpoint" | "schema" | "guide" | "error" | "overview";
}

export interface RetrievalResult {
  chunk: DocumentChunk;
  score: number;
  reranked: boolean;
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  tokenCount: number;
}

// ─── Ingestion Pipeline ───

export interface ParsedEndpoint {
  path: string;
  method: string;
  summary: string;
  description: string;
  parameters: EndpointParam[];
  requestBody: Record<string, unknown> | null;
  responseSchema: Record<string, unknown> | null;
  examples: CodeExample[];
  errorCodes: ErrorInfo[];
  rawText: string; // full text for embedding
}

export interface IngestionSource {
  name: string; // e.g. "stripe"
  type: "openapi" | "markdown";
  filePath: string;
  baseUrl: string;
}

export interface IngestionResult {
  source: string;
  chunksCreated: number;
  vectorsUpserted: number;
  errorsEncountered: string[];
  durationMs: number;
}

// ─── Eval Types ───

export interface TestCase {
  query: string;
  api: string;
  tool: string;
  expected_endpoints: string[];
  expected_concepts: string[];
  golden_answer_keywords: string[];
}

export interface EvalMetrics {
  precisionAtK: number;
  recall: number;
  faithfulness: number;
  answerRelevance: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  cacheHitRate: number;
}

export interface EvalReport {
  timestamp: string;
  config: Record<string, unknown>;
  metrics: EvalMetrics;
  perQuery: Array<{
    query: string;
    passed: boolean;
    metrics: Partial<EvalMetrics>;
    retrieved: string[];
    expected: string[];
  }>;
}

// ─── API Test Engine ───

export interface AllowedApi {
  name: string;
  baseUrl: string;
  authType: "bearer" | "api-key-header" | "basic";
  authHeader: string; // e.g. "Authorization", "X-API-Key"
}

export const ALLOWED_APIS: AllowedApi[] = [
  {
    name: "stripe",
    baseUrl: "https://api.stripe.com",
    authType: "bearer",
    authHeader: "Authorization",
  },
  {
    name: "twilio",
    baseUrl: "https://api.twilio.com",
    authType: "basic",
    authHeader: "Authorization",
  },
];

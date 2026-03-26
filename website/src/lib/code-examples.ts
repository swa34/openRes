// ─── MCP JSON-RPC Tool Call Examples ───
// Realistic request/response pairs for each DocScope tool,
// used on the Features page and Architecture page.

export const TOOL_EXAMPLES = {
  search: {
    request: `{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": {
      "query": "how to create a payment intent",
      "api": "stripe"
    }
  },
  "id": 1
}`,
    response: `{
  "jsonrpc": "2.0",
  "result": {
    "content": [{
      "type": "text",
      "text": "{\\"results\\": [{\\"id\\": \\"a1b2c3d4\\", \\"title\\": \\"POST /v1/payment_intents — Stripe API\\", \\"url\\": \\"https://docs.stripe.com/api/payment_intents\\"}]}"
    }],
    "structuredContent": {
      "results": [
        {
          "id": "a1b2c3d4",
          "title": "POST /v1/payment_intents — Stripe API",
          "url": "https://docs.stripe.com/api/payment_intents",
          "text": "Creates a PaymentIntent object. After the PaymentIntent is created, attach a payment method...",
          "score": 0.94,
          "api": "stripe",
          "endpoint": "/v1/payment_intents"
        },
        {
          "id": "e5f6g7h8",
          "title": "POST /v1/payment_intents/confirm — Stripe API",
          "url": "https://docs.stripe.com/api/payment_intents/confirm",
          "text": "Confirm that your customer intends to pay with current or provided payment method...",
          "score": 0.87,
          "api": "stripe",
          "endpoint": "/v1/payment_intents/{intent}/confirm"
        }
      ]
    },
    "_meta": {
      "query": "how to create a payment intent",
      "namespaces": ["stripe"],
      "resultCount": 5,
      "cacheHit": false,
      "latencyMs": 340
    }
  },
  "id": 1
}`,
  },

  fetch: {
    request: `{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "fetch",
    "arguments": {
      "document_id": "a1b2c3d4"
    }
  },
  "id": 2
}`,
    response: `{
  "jsonrpc": "2.0",
  "result": {
    "content": [{
      "type": "text",
      "text": "{\\"id\\": \\"a1b2c3d4\\", \\"title\\": \\"POST /v1/payment_intents\\", \\"text\\": \\"Creates a PaymentIntent object...\\", \\"url\\": \\"https://docs.stripe.com/api/payment_intents\\"}"
    }],
    "structuredContent": {
      "document": {
        "id": "a1b2c3d4",
        "title": "POST /v1/payment_intents",
        "text": "Creates a PaymentIntent object. After the PaymentIntent is created, attach a payment method and confirm to continue the payment...",
        "url": "https://docs.stripe.com/api/payment_intents",
        "metadata": {
          "api": "stripe",
          "endpoint": "/v1/payment_intents",
          "method": "post",
          "chunkIndex": 0
        }
      }
    },
    "_meta": {
      "source": "pinecone",
      "namespace": "stripe"
    }
  },
  "id": 2
}`,
  },

  get_endpoint: {
    request: `{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_endpoint",
    "arguments": {
      "api": "stripe",
      "method": "POST",
      "path": "/v1/charges"
    }
  },
  "id": 3
}`,
    response: `{
  "jsonrpc": "2.0",
  "result": {
    "content": [{
      "type": "text",
      "text": "Endpoint details for POST /v1/charges (stripe)"
    }],
    "structuredContent": {
      "endpoint": {
        "method": "POST",
        "path": "/v1/charges",
        "baseUrl": "https://api.stripe.com",
        "summary": "Creates a new charge object",
        "parameters": [
          { "name": "amount", "type": "integer", "location": "body", "required": true, "description": "Amount in cents" },
          { "name": "currency", "type": "string", "location": "body", "required": true, "description": "Three-letter ISO currency code" },
          { "name": "source", "type": "string", "location": "body", "required": false, "description": "Payment source token" }
        ]
      }
    },
    "_meta": {
      "found": true,
      "api": "stripe",
      "method": "POST",
      "path": "/v1/charges"
    }
  },
  "id": 3
}`,
  },

  test_endpoint: {
    request: `{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "test_endpoint",
    "arguments": {
      "api": "stripe",
      "method": "GET",
      "path": "/v1/charges",
      "queryParams": { "limit": "3" },
      "apiKey": "sk_test_..."
    }
  },
  "id": 4
}`,
    response: `{
  "jsonrpc": "2.0",
  "result": {
    "content": [{
      "type": "text",
      "text": "200 OK — GET https://api.stripe.com/v1/charges?limit=3 (142ms)"
    }],
    "structuredContent": {
      "statusCode": 200,
      "statusText": "OK",
      "latencyMs": 142,
      "contentType": "application/json",
      "bodyPreview": "{\\"object\\": \\"list\\", \\"data\\": [...]}"
    },
    "_meta": {
      "headers": { "request-id": "req_abc123" },
      "body": { "object": "list", "data": ["..."] }
    }
  },
  "id": 4
}`,
  },

  debug_error: {
    request: `{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "debug_error",
    "arguments": {
      "api": "stripe",
      "errorCode": "card_declined"
    }
  },
  "id": 5
}`,
    response: `{
  "jsonrpc": "2.0",
  "result": {
    "content": [{
      "type": "text",
      "text": "Error lookup for stripe: card_declined — The card has been declined"
    }],
    "structuredContent": {
      "error": {
        "code": "card_declined",
        "httpStatus": 402,
        "type": "card_error",
        "message": "The card has been declined",
        "commonCauses": [
          "Insufficient funds",
          "Card expired or invalid",
          "Issuer declined the transaction"
        ]
      },
      "suggestions": [
        "Ask the customer to try a different payment method",
        "Check if the card has expired",
        "Verify the card number and CVC are correct"
      ]
    },
    "_meta": {
      "found": true,
      "api": "stripe",
      "relatedEndpoints": ["/v1/charges", "/v1/payment_intents"]
    }
  },
  "id": 5
}`,
  },
} as const;

// ─── curl Examples ───

export const CURL_EXAMPLES = {
  search: `curl -X POST https://openres-production.up.railway.app/mcp \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search",
      "arguments": {
        "query": "send SMS with Twilio",
        "api": "twilio"
      }
    },
    "id": 1
  }'`,

  list_tools: `curl -X POST https://openres-production.up.railway.app/mcp \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'`,
} as const;

// ─── Architecture Section Prose ───

export const ARCHITECTURE_PROSE = {
  ragPipeline: {
    title: "Hybrid RAG Pipeline",
    description:
      "DocScope combines dense vector search with sparse keyword matching to handle the unique challenges of API documentation. Pure semantic search understands intent — 'how to create a payment' finds payment-related endpoints — but misses specific parameter names like `payment_method_types`. Keyword matching catches those exact terms. The hybrid approach (alpha=0.7 semantic, 0.3 keyword) gives you both.",
    details: [
      "Dense embeddings via OpenAI text-embedding-3-large (3072 dimensions)",
      "Sparse scoring via simplified BM25 (TF component with k1=1.2, b=0.75)",
      "Path segment tokenization for API route matching",
      "Smart boosting: explicit path (1.25x), primary resource (1.10x), overview chunk (1.05x)",
      "LLM reranking with gpt-5-nano when top scores are within 0.15 of each other",
    ],
  },

  chunking: {
    title: "OpenAPI-Aware Chunking",
    description:
      "Most RAG systems chunk by character count, which splits API endpoints mid-schema. DocScope parses the OpenAPI spec and chunks by endpoint, keeping the full schema (path, parameters, request body, response, examples) together. When an endpoint exceeds 8000 characters, it splits along logical boundaries — parameters, request body, response schema — not mid-sentence.",
    details: [
      "Each endpoint becomes one chunk if under 8000 characters (~2000 tokens)",
      "Oversized endpoints split into logical sections with parent metadata",
      "Schema-to-text conversion for better embedding quality",
      "Deterministic IDs via SHA-256 — re-ingestion overwrites, never duplicates",
      "Stripe: 587 endpoints indexed, Twilio: 197 endpoints indexed",
    ],
  },

  semanticCache: {
    title: "Semantic Cache",
    description:
      "Before hitting Pinecone, DocScope checks Redis for semantically similar queries. If a cached query has cosine similarity >= 0.92, the cached results are returned immediately. This eliminates redundant embedding and vector search for repeated or near-identical queries.",
    details: [
      "Query embedding hashed to 32 sampled dimensions (8-bit quantized) as cache key",
      "Cosine similarity threshold: 0.92",
      "TTL: 1 hour, max 500 entries with random eviction",
      "Fire-and-forget caching — never blocks the response",
      "Graceful degradation: if Redis is unavailable, search hits Pinecone directly",
    ],
  },

  security: {
    title: "Security Model",
    description:
      "The test_endpoint tool executes real HTTP requests, making SSRF protection critical. DocScope enforces a strict allowlist (only api.stripe.com and api.twilio.com), blocks private IPs after DNS resolution, enforces HTTPS, and follows zero redirects. API keys never reach the model — they live only in _meta, are used once, and immediately discarded.",
    details: [
      "URL allowlist: only api.stripe.com and api.twilio.com",
      "Private IP blocking: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, IPv6 link-local",
      "HTTPS enforced, zero redirect follows",
      "API keys in _meta only — never in structuredContent, logs, or model context",
      "Keys used once and discarded — no storage, no persistence",
      "62 security tests covering SSRF bypasses, key leakage, and header redaction",
    ],
  },

  contentSplit: {
    title: "The content / structuredContent / _meta Split",
    description:
      "Every MCP tool response has three layers serving different audiences. content gives the model minimal text for narration. structuredContent provides concise JSON that both the model and widget can use. _meta carries large payloads and sensitive data that only the widget sees — the model never has access to it.",
    details: [
      "content: company-knowledge-compatible JSON (id, title, url) for model narration",
      "structuredContent: full results with scores, schemas, and error details for the widget",
      "_meta: query diagnostics, full response bodies, API keys, cache metrics",
      "API keys exist only in _meta — the model never sees them",
      "Keeps model context window small while widget gets full data",
    ],
  },

  evalPipeline: {
    title: "Evaluation Pipeline",
    description:
      "DocScope ships with a production eval harness that runs 82 curated test cases (43 Stripe, 39 Twilio) against the retrieval pipeline. Precision and recall are computed mechanically. Faithfulness and answer relevance use gpt-5-mini as an LLM judge. Quality gates block deployment if metrics fall below thresholds.",
    details: [
      "82 curated test cases covering exact lookups, conceptual queries, and cross-resource search",
      "Mechanical metrics: precision@5 (0.66), recall (0.96)",
      "LLM-as-judge metrics: faithfulness (0.98), answer relevance (0.77)",
      "Quality gates: precision@5 > 0.60, recall > 0.70, answer relevance > 0.70",
      "Latency gates: p50 < 2000ms, p95 < 5000ms",
    ],
  },

  statelessServer: {
    title: "Stateless MCP Server",
    description:
      "DocScope creates a fresh McpServer instance for every HTTP request. No session affinity, no stale state, no Express overhead. The server runs on raw node:http with sessionIdGenerator set to undefined for stateless mode. In-memory stores (parsed OpenAPI specs, error catalog, widget HTML) are read-only after startup — stateless server, warm caches.",
    details: [
      "Fresh McpServer per request — horizontal scaling without session affinity",
      "Raw node:http createServer — no Express overhead for a single-endpoint server",
      "In-memory OpenAPI store and error catalog loaded once at startup",
      "Widget HTML (React build) read from disk once and held as a string",
      "Rate limiting: 60 req/min per IP via in-memory sliding window",
      "Request tracing via X-Trace-Id header + pino structured logging",
    ],
  },
} as const;

// ─── Widget Bridge Example (for Architecture page) ───

export const WIDGET_BRIDGE_EXAMPLE = `// MCP Apps bridge initialization (widget → ChatGPT iframe)
import { initializeBridge, onToolResult } from "./bridge";

await initializeBridge();

onToolResult((result) => {
  const { structuredContent, _meta } = result;

  if (structuredContent.results) {
    // Search results → render result cards
    renderSearchResults(structuredContent.results);
  }

  if (structuredContent.endpoint) {
    // Endpoint data → render interactive card
    renderEndpointCard(structuredContent.endpoint, _meta);
  }
});`;

// ─── Server Setup Example (for Architecture page) ───

export const SERVER_SETUP_EXAMPLE = `import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport }
  from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function createDocScopeServer(): McpServer {
  const server = new McpServer({
    name: "docscope",
    version: "0.1.0",
  });
  // register tools, resources...
  return server;
}

// Fresh server per request — stateless, horizontally scalable
const httpServer = createServer(async (req, res) => {
  const server = createDocScopeServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
});`;

// ─── Tool Annotation Example (for Features page) ───

export const TOOL_ANNOTATION_EXAMPLE = `// Read-only tools run automatically in ChatGPT
annotations: {
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false,
}

// test_endpoint makes real API calls — ChatGPT prompts for confirmation
annotations: {
  readOnlyHint: false,
  openWorldHint: true,
  destructiveHint: false,
}`;

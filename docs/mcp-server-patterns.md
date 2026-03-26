# MCP Server Patterns for ChatGPT Apps

*Lessons from building DocScope — a RAG-powered API documentation tool inside ChatGPT*

---

I built [DocScope](https://github.com/swa34/openRes) to solve a specific problem: developers spend too much time bouncing between API docs and their editor. DocScope is a ChatGPT App that lets you search API documentation, explore endpoint schemas, and test live API calls — all without leaving the chat.

It's built with the MCP protocol and OpenAI's Apps SDK. Right now it indexes Stripe (587 endpoints) and Twilio (197 endpoints), runs a hybrid RAG pipeline backed by Pinecone, and renders interactive endpoint cards in a ChatGPT iframe widget. Check out the [website](https://openres-production.up.railway.app) for a live demo, or add the [MCP endpoint](https://openres-production.up.railway.app/mcp) directly in ChatGPT.

This guide covers the patterns I landed on after iterating through the build — the stuff that actually matters when you're shipping an MCP server into ChatGPT.

---

## 1. Stateless MCP Server Architecture

The single most important architectural decision: **create a fresh McpServer for every request.**

```typescript
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function createDocScopeServer(): McpServer {
  const server = new McpServer({ name: "docscope", version: "0.1.0" });
  // register tools, resources...
  return server;
}

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
});
```

### Why this works

- **No session affinity.** Any server instance can handle any request. Railway (or whatever you're deploying to) just spins up more containers.
- **No stale state.** Each request gets a clean McpServer with freshly registered tools. No worrying about leaked state between requests.
- **No Express.** I'm using raw `node:http` `createServer`. For an MCP server that handles one endpoint (`/mcp`) plus a few static routes, Express is unnecessary overhead.

The key is `sessionIdGenerator: undefined` — this tells the SDK you're running in stateless mode. Without it, the transport tries to maintain sessions, which breaks horizontal scaling.

### What stays in memory

Just because the MCP server is stateless doesn't mean everything is per-request. DocScope keeps a few things in process memory that get loaded once at startup:

- **Parsed OpenAPI specs** — a `Map<string, ParsedEndpoint>` built from Stripe and Twilio specs at boot. Used by `get_endpoint` and `debug_error` for fast lookups without hitting Pinecone.
- **The widget HTML** — the entire React build (JS + CSS) is read from disk once and held as a string for inlining into the MCP resource.
- **Error catalog** — pre-built from OpenAPI specs for the `debug_error` tool.

These are all read-only after startup. The pattern: **stateless server, warm caches.**

---

## 2. Tool Design Patterns

### Annotations are mandatory

Every MCP tool registered via the Apps SDK **must** include `annotations`. ChatGPT uses these to decide whether to auto-execute a tool or prompt the user for confirmation first.

```typescript
// Read-only tool — ChatGPT runs it automatically
annotations: {
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false,
}

// Write tool — ChatGPT asks for user confirmation
annotations: {
  readOnlyHint: false,   // this tool makes HTTP requests
  openWorldHint: true,   // hits external APIs
  destructiveHint: false, // doesn't modify data
}
```

DocScope's `search`, `fetch`, `get_endpoint`, and `debug_error` are all read-only — ChatGPT runs them without asking. `test_endpoint` has `readOnlyHint: false` because it makes real API calls. ChatGPT shows the user exactly what will be called and waits for confirmation.

### The content / structuredContent / _meta split

This is the most important pattern for ChatGPT Apps. Every tool response has three layers, and they serve different audiences:

| Layer | Who sees it | What goes in it |
|-------|-------------|-----------------|
| `content` | The model (for narration) | Minimal text — just enough for the model to generate a useful response |
| `structuredContent` | The model AND the widget | Concise JSON the widget renders — search results, endpoint schemas |
| `_meta` | Widget only (never reaches the model) | Large payloads, sensitive data, diagnostics |

Here's how DocScope's search tool splits the response:

```typescript
return {
  // Model narration: company-knowledge-compatible (id, title, url only)
  content: [{
    type: "text",
    text: JSON.stringify({ results: companyKnowledgeResults }),
  }],

  // Widget rendering: full results with scores
  structuredContent: {
    results: fullResults, // id, title, url, text, score, api, endpoint
  },

  // Widget-only metadata: never touches the model
  _meta: {
    query,
    namespaces,
    resultCount: fullResults.length,
    cacheHit,
    latencyMs,
  },
};
```

**Why this matters:** API keys from `test_endpoint` go in `_meta` only. The model never sees them. Full response bodies (which can be huge) go in `_meta`. The model gets a concise summary in `content` to narrate from. This keeps the model's context window small and secrets out of the conversation.

### Company knowledge compatibility

The `search` and `fetch` tools return `content` in the format ChatGPT expects for company knowledge: `{ id, title, url }`. This means DocScope works as a deep research source in ChatGPT, not just a standalone tool.

### Linking tools to the widget

Every tool needs to tell ChatGPT which widget renders its results:

```typescript
registerAppTool(server, "search", {
  ...searchDef,
  _meta: {
    ui: { resourceUri: "ui://docscope/widget.html" },
    "openai/outputTemplate": "ui://docscope/widget.html",
  },
}, handler);
```

Both `ui.resourceUri` and `openai/outputTemplate` point to the widget resource. The response also includes these in `_meta` so ChatGPT knows to render the widget for this tool's output.

---

## 3. RAG Integration

### Hybrid search (alpha=0.7)

Pure semantic search misses specific parameter names. Ask "how to create a payment intent" and semantic search works great. Ask "what does the `payment_method_types` parameter accept on POST /v1/payment_intents" and you need keyword matching to surface the right chunk.

DocScope uses a weighted hybrid: 70% dense (Pinecone cosine similarity) + 30% sparse (BM25-style keyword scoring).

```typescript
let hybridScore = 0.7 * denseScore + 0.3 * keywordScore;
```

The BM25 scoring is simplified — no IDF because we don't have corpus statistics available at query time. But the TF component with standard BM25 parameters (k1=1.2, b=0.75) is enough to boost exact keyword matches.

### Path segment tokenization

API paths like `/v1/payment_intents` need special handling. The tokenizer extracts path segments as separate tokens:

```typescript
function tokenize(text: string): string[] {
  const base = text.toLowerCase()
    .replace(/[^a-z0-9_/.-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  // Extract path segments: "/v1/payment_intents" → "payment_intents"
  const pathSegments: string[] = [];
  for (const token of base) {
    if (token.includes("/")) {
      const parts = token.split("/")
        .filter((p) => p.length > 1 && !p.startsWith("{"));
      pathSegments.push(...parts);
    }
  }

  return [...base, ...pathSegments];
}
```

This means a query containing "payment_intents" will keyword-match against chunks from `/v1/payment_intents` even if the path appears as a single slash-separated token in the text.

### Smart boosting

Three boosts applied after hybrid scoring:

1. **Explicit path boost (1.25x):** If the query contains a literal API path like `/v1/charges`, chunks from that endpoint get boosted. Helps when users paste paths directly.

2. **Primary resource boost (1.10x):** Endpoints with fewer path segments rank higher. `/v1/refunds` beats `/v1/charges/{charge}/refunds` because users asking about "refunds" usually want the primary resource.

3. **Overview chunk boost (1.05x):** The first chunk of an endpoint (chunkIndex=0) contains the summary and description — it's what users want most often.

### LLM reranking

When the top results score too close together, keyword scoring and embedding similarity aren't enough to differentiate. DocScope uses gpt-5-nano as a reranker — but only when it's actually needed:

```typescript
// Trigger conditions:
// 1. Top-5 scores are within 0.15 of each other (ambiguous)
// 2. Best score is at least 0.20 (results aren't all garbage)

if (shouldRerank(topResults, 5, 0.15, 0.20)) {
  const reranked = await rerankWithLLM(query, topResults.slice(0, 5), "gpt-5-nano");
}
```

The reranker call uses the Responses API with `reasoning: { effort: "minimal" }` to keep it fast. It adds ~500ms but resolves ambiguous results that would otherwise return near-identical scores.

```typescript
const response = await openai.responses.create({
  model: "gpt-5-nano",
  reasoning: { effort: "minimal" },
  instructions: "Rank these candidates by relevance. Return ONLY a JSON array of indices.",
  input: `Query: "${query}"\n\nCandidates:\n${descriptions}`,
});
```

### OpenAPI-aware chunking

Don't chunk API docs by character count. Parse the OpenAPI spec and chunk by endpoint:

```typescript
const DEFAULT_CONFIG = {
  maxChunkTokens: 512,      // prose chunks
  overlapTokens: 50,        // prose overlap
  maxEndpointChars: 8000,   // ~2000 tokens — keep endpoints whole
};
```

Each endpoint becomes one chunk if it fits under 8000 characters. This keeps the full schema (path, parameters, request body, response, examples) together, so retrieval returns complete, useful context instead of a fragment.

When an endpoint exceeds the limit, it gets split into logical sections — parameters, request body, response schema, examples — not mid-sentence. Each section chunk gets metadata linking it back to the parent endpoint.

**Deterministic IDs:** Every chunk gets a stable ID via `SHA-256(api:source:identifier:index)` truncated to 16 hex chars. Re-running ingestion overwrites the same vectors in Pinecone — no duplicates, no cleanup needed.

**Schema-to-text conversion:** Raw JSON schemas embed poorly. DocScope converts schemas to human-readable text before embedding:

```
- amount [integer] (required): Amount intended to be collected
- currency [string] (required): Three-letter ISO currency code
- payment_method_types [array of strings] (optional): Payment method types to accept
```

This gives the embedding model natural language to work with instead of `{"type": "integer", "description": "..."}`.

### Semantic cache

Before hitting Pinecone, DocScope checks a Redis semantic cache:

1. Embed the query
2. Compare cosine similarity against cached query embeddings
3. If similarity >= 0.92 and same namespace: cache hit
4. Otherwise: run search, then cache the result (fire-and-forget)

```typescript
// Fire-and-forget caching — never block the response
cache.set(query, cacheKey, retrievalResults).catch((err) => {
  log.warn({ err }, "Failed to cache search results (non-fatal)");
});
```

The cache uses a hash of 32 sampled embedding dimensions (8-bit quantized) as the key. TTL is 1 hour. Max 500 entries, with random eviction when full.

**Graceful degradation:** If Redis is unavailable, the cache silently disables itself. No crashes, no retries. Search just hits Pinecone directly.

---

## 4. Widget UI in the ChatGPT Iframe

### The MCP Apps bridge

The widget lives in a ChatGPT iframe. Communication happens over `postMessage` using JSON-RPC 2.0. The initialization handshake:

```typescript
export function initializeBridge(): Promise<void> {
  return (async () => {
    await rpcRequest("ui/initialize", {
      appInfo: { name: "docscope-widget", version: "0.1.0" },
      appCapabilities: {},
      protocolVersion: "2026-01-26",
    });
    rpcNotify("ui/notifications/initialized", {});
  })();
}
```

Three steps: send `ui/initialize`, wait for the host's response, then send `ui/notifications/initialized` to confirm readiness.

### Dual delivery mechanism

ChatGPT delivers tool results to the widget through **two different channels**, and you need to handle both:

1. **MCP bridge notifications:** `ui/notifications/tool-result` via postMessage (the standard MCP way)
2. **`window.openai` globals:** `window.openai.toolOutput` set directly, plus `openai:set_globals` custom events

DocScope listens for both and funnels them through the same handler set:

```typescript
// Standard MCP bridge
window.addEventListener("message", (event) => {
  if (message.method === "ui/notifications/tool-result") {
    toolResultHandlers.forEach((handler) => handler(message.params));
  }
});

// ChatGPT window.openai fallback
window.addEventListener("openai:set_globals", ((event: CustomEvent) => {
  const globals = event.detail?.globals;
  emitOpenaiToolOutput(globals?.toolOutput ?? window.openai?.toolOutput);
}) as EventListener);
```

### Iframe constraints

A few gotchas with the ChatGPT iframe sandbox:

- **No `localStorage`.** All state lives in React state. If you need persistence, use the bridge to communicate with the host.
- **Widget inlining.** The entire React build (JS + CSS) gets bundled into a single HTML string and served as the MCP resource. No external asset URLs. DocScope reads the Vite output at startup and inlines it:

```typescript
const WIDGET_JS = readFileSync("../../widget/dist/widget.js", "utf8");
const WIDGET_CSS = readFileSync("../../widget/dist/widget.css", "utf8");

const WIDGET_HTML = `
<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body>
  <div id="root"></div>
  <style>${WIDGET_CSS}</style>
  <script type="module">${WIDGET_JS}</script>
</body>
</html>`;
```

- **CSP connect domains.** If your widget makes HTTP requests (like DocScope's "Try it" feature), you need to allowlist the target domains in the resource's `_meta.ui.csp.connectDomains`.
- **`_meta.ui.domain`** is required for fullscreen punch-out in ChatGPT — set it to your deployed server's domain.

---

## 5. Eval Pipeline

You need an eval pipeline. Not "it would be nice to have" — you need one. Without it, you're guessing whether your retrieval is actually good, and you have no way to measure whether tuning changes help or hurt.

### Metrics

DocScope measures six things:

| Metric | How | Target |
|--------|-----|--------|
| precision@5 | Fraction of top-5 results from expected endpoints | > 0.60 |
| recall | Fraction of expected endpoints found anywhere in results | > 0.70 |
| faithfulness | LLM-as-judge: does the answer only use facts from sources? | > 0.70 |
| answer relevance | LLM-as-judge: does the answer address the question? | > 0.70 |
| latency p50 | Median search latency | < 2000ms |
| latency p95 | 95th percentile search latency | < 5000ms |

### Test set format

Each test case has a query, expected endpoints, and keywords the answer should contain:

```json
{
  "query": "How do I create a refund in Stripe?",
  "api": "stripe",
  "tool": "search",
  "expected_endpoints": ["/v1/refunds"],
  "expected_concepts": ["refund", "charge", "payment_intent"],
  "golden_answer_keywords": ["POST", "charge", "amount"]
}
```

DocScope has 82 test cases — 43 for Stripe and 39 for Twilio. Each covers a specific retrieval scenario: exact endpoint lookups, conceptual questions, cross-resource queries, error code lookups.

### LLM-as-judge

Precision and recall are mechanical — just compare retrieved endpoints against expected ones. But "is the answer faithful to the source?" requires judgment. DocScope uses gpt-5-mini as a judge:

- **Faithfulness:** "Given these source documents and this answer, does the answer only make claims supported by the sources?"
- **Answer relevance:** "Given this question and this answer, how well does the answer address the question?"

Both return a score from 0 to 1.

### Quality gates

These are blocking — if they fail, the eval fails:

```
precision@5      > 0.60
recall           > 0.70
answerRelevance  > 0.70
latencyP50       < 2000ms
latencyP95       < 5000ms
```

Cache hit rate (> 0.30) is advisory — it warns but doesn't fail, because dev environments typically don't have Redis.

### Real numbers

Here's where DocScope landed after tuning:

| Metric | Score |
|--------|-------|
| precision@5 | 0.66 |
| recall | 0.96 |
| faithfulness | 0.98 |
| answer relevance | 0.77 |

Precision@5 tops out around 0.66 because Stripe has 587 semantically similar endpoints. `/v1/refunds`, `/v1/charges/{charge}/refunds`, and `/v1/terminal/refunds` all discuss the same concept. Getting past that would need metadata-filtered retrieval or graph-based linking — a different approach entirely, not just more tuning.

---

## 6. Production Hardening

### Rate limiting

In-memory sliding window, 60 requests per minute per IP:

```typescript
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitMap.set(ip, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (entry.timestamps.length >= RATE_LIMIT_MAX) return true;
  entry.timestamps.push(now);
  return false;
}
```

A cleanup interval runs every 5 minutes to prune stale entries (`.unref()` so it doesn't keep the process alive).

### Request tracing

Every request gets a trace ID in the response header:

```typescript
const traceId = randomUUID().slice(0, 8);
res.setHeader("X-Trace-Id", traceId);
```

All log lines from that request include the trace ID via pino structured logging. When something goes wrong in production, you can grep for a trace ID and see the full request lifecycle.

### SSRF protection

`test_endpoint` executes real HTTP requests on behalf of the user. That's a textbook SSRF vector if you're not careful. DocScope's guard:

- **URL allowlist** — only `api.stripe.com` and `api.twilio.com`. No arbitrary URLs, ever.
- **HTTPS only** — no plain HTTP.
- **Private IP blocking** — resolves DNS before connecting, blocks private ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, IPv6 link-local, IPv4-mapped IPv6).
- **No redirects** — follows zero redirects. A redirect could bounce to a private IP after DNS validation.

62 security tests cover key leakage vectors, SSRF bypass attempts, and header redaction.

### API key handling

Keys arrive in the tool input, get used for a single request, and are immediately discarded:

- Never stored (no database, no file, no env var).
- Never logged (`apiKey: "[REDACTED]"` in all log output).
- Never in `structuredContent` — the model never sees the key.
- Only in `_meta` — the widget can show the authenticated response, but the key stays out of the conversation context.

---

## Wrapping up

These patterns came from actually shipping a ChatGPT App and iterating on what worked. The big takeaways:

1. **Stateless servers scale.** Fresh McpServer per request, no session affinity, horizontal scaling for free.
2. **The content/_meta split is your best friend.** Keep the model's context small and secrets out of its reach.
3. **Hybrid search beats pure semantic for API docs.** Parameter names are specific strings — you need keyword matching.
4. **Build an eval pipeline from day one.** Without numbers, you're guessing.
5. **The widget iframe has real constraints.** No localStorage, inline everything, handle both delivery mechanisms.

The full source is at [github.com/swa34/openRes](https://github.com/swa34/openRes). Visit the [website](https://openres-production.up.railway.app) for an interactive demo, or add the [MCP endpoint](https://openres-production.up.railway.app/mcp) to ChatGPT Developer Mode and try it yourself.

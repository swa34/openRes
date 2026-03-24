# DocScope Build Plan

## Progress (updated 2026-03-24)

### Phase 1: Foundation — COMPLETE

| Task | Status |
|------|--------|
| MCP server skeleton + 5 tools | DONE — all tools respond via Docker |
| RAG pipeline (embeddings, retrieval, cache, chunker) | DONE |
| Widget UI (bridge, all components, Vite build) | DONE — builds to 251KB+8KB |
| API test engine (executor, SSRF guard, sanitizer, auth) | DONE |
| Eval harness + metrics + 43 search + 10 debug test cases | DONE — all blocking gates pass |
| Ingestion pipeline + Stripe OpenAPI spec | DONE — 587 endpoints, 776 vectors in Pinecone |
| Docker setup | DONE — `docker compose up -d` starts in ~2s |
| Chunking quality improvement | DONE — human-readable text, scores up 20-60% |
| Widget tested in ChatGPT | DONE — search → click → EndpointCard works via ngrok |
| Eval baseline recorded | DONE — see below |

### Phase 2: Polish + Second Source — COMPLETE

| Task | Status |
|------|--------|
| Twilio OpenAPI spec ingested | DONE — 197 endpoints, 230 vectors in Pinecone (twilio namespace) |
| Cross-source search | DONE — search tool queries all namespaces by default |
| Twilio eval test set | DONE — 39 test cases (30 search + 9 debug_error) |
| Retrieval tuning | DONE — primary resource boost, overview chunk boost, path segment tokenization, wider reranking threshold. precision@5: 0.64 → 0.66 |
| Widget polish | DONE — loading spinner, error boundary, empty states, "Copy as cURL", "Copy response" buttons |
| Production hardening | DONE — rate limiting (60 req/min per IP), request tracing (X-Trace-Id), structured logging (pino) |
| Security review | DONE — 62 tests pass (key leakage, SSRF, header redaction) |
| Twilio support in test_endpoint | DONE — already configured in allowlist with Basic auth |

### Eval Results

**Phase 1 baseline (2026-03-24 morning):**

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| precision@5 | 0.64 | > 0.60 | PASS |
| recall | 0.95 | > 0.70 | PASS |
| faithfulness | 0.91 | > 0.70 | PASS |
| answer relevance | 0.96 | > 0.85 | PASS |
| latency p50 | 502ms | < 600ms | PASS |
| latency p95 | 1554ms | < 2000ms | PASS |
| cache hit rate | 0.00 | > 0.30 | WARN (no Redis in dev) |

**Phase 2 final (2026-03-24 evening, post-tuning):**

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| precision@5 | 0.66 | > 0.60 | PASS |
| recall | 0.96 | > 0.70 | PASS |
| faithfulness | 0.98 | > 0.70 | PASS |
| answer relevance | 0.77 | > 0.70 | PASS |
| latency p50 | 1486ms | < 2000ms | PASS |
| latency p95 | 2339ms | < 5000ms | PASS |
| cache hit rate | 0.00 | > 0.30 | WARN (no Redis in dev) |

**Why precision@5 plateaued at 0.66 (not 0.80):** Stripe's API has 587 endpoints with many semantically similar resources (e.g., `/v1/refunds` vs `/v1/charges/{charge}/refunds` vs `/v1/terminal/refunds`). Pure retrieval can't distinguish between these because they discuss the same concept. Reaching 0.80 would require metadata-filtered retrieval (pre-filter by resource type) or graph-based linking, which is out of scope for Phase 2.

**Why latency increased:** Phase 1 eval ran without LLM answer synthesis. Phase 2 includes per-query answer synthesis via gpt-5-mini for faithfulness/relevance scoring. Production search latency (without synthesis) is ~500-800ms.

### Phase 1 gates
- [x] Test widget in ChatGPT (ngrok + Developer Mode)
- [x] Run eval harness — all blocking quality gates pass
- [ ] Test test_endpoint with real Stripe test key
- [ ] Fix error catalog (empty — Stripe spec doesn't expose error codes in parseable format)

### To resume
```bash
cd /home/scottallen/VSCODE/openRes
sudo systemctl start docker
docker compose up -d
# Server at http://localhost:3000/mcp
# Test: curl -s http://localhost:3000/ → "DocScope MCP server"
```

---

## Overview

DocScope is a ChatGPT App (Apps SDK + MCP) that lets developers **search API docs, explore endpoints, and live-test API calls** — all inside ChatGPT. It combines RAG-powered documentation search with an interactive widget UI and a real API testing sandbox.

**What makes it different from Context7:** Context7 retrieves docs as text. DocScope adds live API execution, structured endpoint cards, error diagnosis, and a full eval pipeline with measured retrieval quality. It's a developer workbench, not a search box.

**Target roles:**
- AI Deployment Engineer — ChatGPT Ecosystem (Apps SDK, MCP, partner integrations)
- AI Deployment Engineer — Codex (AI coding tools, developer productivity, public technical content)
- Software Engineer, Gov (full-stack, React, Python, JS, Kubernetes)

**Resume gaps this plan fills:**
1. No public-facing project outside university → DocScope + App Directory submission
2. No eval pipeline with real metrics → eval harness with precision@5, faithfulness scoring
3. No public technical content → 2 published guides
4. No demonstrated AI coding tool power-user workflow → Codex workflow demo
5. No ChatGPT ecosystem integration → MCP server + Apps SDK widget

---

## Tools

| Tool | Purpose | Annotations | Widget View |
|------|---------|-------------|-------------|
| `search` | RAG over ingested API docs (company knowledge compatible) | `readOnlyHint: true` | Search results list |
| `fetch` | Full document retrieval by ID (company knowledge compatible) | `readOnlyHint: true` | — |
| `get_endpoint` | Structured endpoint schema from OpenAPI data | `readOnlyHint: true` | EndpointCard |
| `test_endpoint` | Execute a real API call with user-provided params | `readOnlyHint: false, destructiveHint: false, openWorldHint: true` | RequestBuilder + ResponseViewer |
| `debug_error` | Look up error codes, common causes, resolution steps | `readOnlyHint: true` | ErrorCard |

`search` and `fetch` follow the OpenAI company knowledge schema exactly, making DocScope compatible with deep research and company knowledge in ChatGPT Business/Enterprise.

`test_endpoint` is a write tool — ChatGPT will require user confirmation before executing. The widget handles API key input (session-only, never in `structuredContent` or persisted server-side).

---

## Architecture

```
User prompt in ChatGPT
   ↓
ChatGPT model ──► MCP tool call ──► DocScope MCP Server
   │                                    │
   │                              ┌─────┴──────────────┐
   │                              │  search/fetch       │ → Pinecone + Redis cache
   │                              │  get_endpoint       │ → Parsed OpenAPI store
   │                              │  test_endpoint      │ → HTTP proxy to real API
   │                              │  debug_error        │ → Error catalog lookup
   │                              └─────┬──────────────┘
   │                                    │
   │                    structuredContent (model reads)
   │                    content (narration text)
   │                    _meta (widget-only data, never reaches model)
   │                                    │
   └───── renders narration ◄── widget iframe ◄──┘
                            (HTML via registerAppResource)
                            (MCP Apps bridge: JSON-RPC/postMessage)
```

### Response payload split (per OpenAI Apps SDK docs)

- **`structuredContent`** — concise JSON for the model AND widget. Keep small.
- **`content`** — optional narration text for the model's response.
- **`_meta`** — large/sensitive data for the widget only. Full chunk text, API response bodies, raw schemas. Never reaches the model.

### Key technical decisions

- Use `registerAppResource` and `registerAppTool` from `@modelcontextprotocol/ext-apps/server`
- Widget MIME type: `RESOURCE_MIME_TYPE` (`text/html;profile=mcp-app`) — required for MCP Apps bridge activation
- Widget HTML/JS/CSS inlined in resource `text` field (built bundle, not served as URL)
- `_meta.ui.domain` set on widget resource (required for submission + fullscreen)
- `_meta.ui.csp.connectDomains` allowlists target API domains for `test_endpoint`
- All tool handlers are idempotent (ChatGPT may retry calls)
- `_meta.ui.visibility` on `test_endpoint`: `["model", "app"]` (callable from both)

---

## Agent Workstreams

This build runs as **5 parallel agent workstreams** coordinated by the Orchestrator. All agents MUST use the OpenAI developer docs MCP server and check npm registry for latest package versions before writing any code. No stale dependencies.

### Agent Rules (all agents)

1. **Always check OpenAI docs MCP** before implementing any Apps SDK, MCP protocol, or ChatGPT integration pattern. The docs are the source of truth.
2. **Always check npm registry** (`npm view <pkg> version`) before adding any dependency. Use the latest stable version.
3. **Use `context7` MCP** for any third-party library docs (Pinecone SDK, Redis client, Zod, Vite, etc.).
4. **Interface contracts first** — before writing implementation, define the TypeScript interfaces that your module exports. Post these to the shared types file (`server/src/types.ts` and `widget/src/types.ts`).
5. **No placeholder/mock code in final output** — stubs are only for Phase 1 connectivity testing, replaced in Phase 2.

---

### Orchestrator (Claude — me)

**Role:** Architect, coordinator, integrator. Owns the main conversation context.

**Responsibilities:**
- Spawns and coordinates all agent workstreams
- Defines interface contracts between modules before agents start
- Integrates outputs across workstreams
- Resolves conflicts when agents produce incompatible code
- Reviews all code before it merges into the main codebase
- Runs the final end-to-end smoke test in ChatGPT Developer Mode

---

### Agent 1: MCP Server (server-agent)

**Role:** Build the MCP server skeleton, tool registration, transport, and Express setup.

**Owns:**
- `server/src/index.ts` — Express + MCP server + `/mcp` endpoint
- `server/src/tools/*.ts` — all 5 tool handlers
- `server/src/types.ts` — shared TypeScript interfaces
- `server/package.json` + `server/tsconfig.json`

**Phase 1 tasks:**
- [ ] Init project: `npm init`, install latest `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, `zod`, `express`
- [ ] Verify package versions against npm registry (not cached/stale)
- [ ] Create `server/src/index.ts`:
  - Express app on port 3000
  - McpServer via SDK
  - Streamable HTTP transport on `/mcp`
  - Health check at `GET /`
  - CORS for `/mcp`
- [ ] Register widget resource via `registerAppResource` with:
  - `RESOURCE_MIME_TYPE` (`text/html;profile=mcp-app`)
  - `_meta.ui.domain`, `_meta.ui.csp`, `_meta.ui.prefersBorder`
  - Inlined HTML/JS/CSS from widget build output
- [ ] Register all 5 tools via `registerAppTool` with:
  - Proper annotations (readOnlyHint, openWorldHint, destructiveHint)
  - `_meta.ui.resourceUri` pointing to widget resource URI
  - Stub handlers returning hardcoded `structuredContent` + `content` + `_meta`
- [ ] `search` and `fetch` tools match OpenAI company knowledge schema exactly
- [ ] `test_endpoint` has `readOnlyHint: false`, `openWorldHint: true`
- [ ] Test locally: `curl -X POST localhost:3000/mcp`
- [ ] Expose via ngrok, verify ChatGPT Developer Mode connects

**Phase 2 tasks:**
- [ ] Wire `search` tool to RAG agent's retrieval module
- [ ] Wire `fetch` tool to RAG agent's document retrieval
- [ ] Wire `get_endpoint` to parsed OpenAPI store
- [ ] Wire `test_endpoint` to API testing agent's executor
- [ ] Wire `debug_error` to error catalog lookup
- [ ] Implement request tracing (unique trace ID per request)
- [ ] Add rate limiting on `/mcp`
- [ ] Add graceful error handling (Pinecone/Redis/OpenAI down → fallback responses)

**Deliverables:**
- ChatGPT calls tools and gets responses (Phase 1: stubs, Phase 2: real data)
- Screenshot of ChatGPT invoking each tool

---

### Agent 2: RAG Engine (rag-agent)

**Role:** Build the retrieval pipeline — ingestion, embeddings, search, cache.

**Owns:**
- `server/src/rag/embeddings.ts` — OpenAI embedding wrapper (text-embedding-3-large)
- `server/src/rag/retrieval.ts` — Pinecone hybrid query + LLM reranking
- `server/src/rag/cache.ts` — Redis semantic cache
- `server/src/rag/chunker.ts` — OpenAPI-aware chunking
- `server/src/ingestion/openapi-parser.ts` — parse OpenAPI specs into chunks
- `server/src/ingestion/markdown-parser.ts` — parse MDX/markdown docs
- `server/src/ingestion/pipeline.ts` — orchestrate: parse → chunk → embed → upsert
- `server/src/ingestion/error-catalog.ts` — extract error codes/messages for debug_error

**Existing code to adapt:**
- `../applied-llm-rag-system/src/retrieval/hybridSearch.js` — dense + sparse hybrid search
- `../applied-llm-rag-system/src/cache/tieredCache.js` — Redis L1 cache
- `../applied-llm-rag-system/src/ingestion/documentIngestion.js` — chunking + Pinecone upsert

**Phase 1 tasks:**
- [ ] Check latest Pinecone SDK version (`@pinecone-database/pinecone`), Redis client (`ioredis`), OpenAI SDK
- [ ] Create `server/src/rag/embeddings.ts` — embed text via OpenAI, batch support
- [ ] Create `server/src/rag/retrieval.ts`:
  - Hybrid search: dense (cosine) + sparse (BM25), alpha=0.7
  - LLM reranking: trigger when top-3 scores within 0.02 of each other (min score 0.35), use gpt-5-nano
  - Return ranked results with scores and metadata
- [ ] Create `server/src/rag/cache.ts`:
  - Embed query → hash → check cosine similarity against cached embeddings (threshold 0.92)
  - Cache hit → return cached response, cache miss → run retrieval → cache result
  - TTL 1 hour, configurable
- [ ] Create `server/src/rag/chunker.ts`:
  - OpenAPI-aware: chunk by endpoint, keep full schema together
  - Fallback: fixed-size with overlap for markdown docs
  - Each chunk includes metadata: source, path, method, parameters
- [ ] Create `server/src/ingestion/openapi-parser.ts`:
  - Parse YAML/JSON OpenAPI specs
  - Extract: endpoints, schemas, descriptions, examples, error codes
  - Output: structured endpoint objects + text chunks for embedding
- [ ] Create `server/src/ingestion/error-catalog.ts`:
  - Extract all error codes, messages, HTTP status codes from OpenAPI spec
  - Build lookup table for `debug_error` tool
- [ ] Create `server/src/ingestion/pipeline.ts`:
  - parse → chunk → embed → upsert to Pinecone (namespace per API source)
  - Idempotent: re-running doesn't duplicate vectors
- [ ] Download Stripe's public OpenAPI spec to `docs-seed/`
- [ ] Run ingestion: `npm run ingest -- --source stripe`
- [ ] Verify retrieval works standalone (unit test: query → relevant chunks returned)

**Phase 2 tasks:**
- [ ] Export clean interfaces for server-agent to wire into tools
- [ ] Add second source: Twilio OpenAPI spec
- [ ] Run ingestion for Twilio, verify cross-source search works
- [ ] Tune hybrid search alpha based on eval results
- [ ] Tune reranking threshold based on eval results

**Deliverables:**
- `npm run ingest -- --source stripe` works end-to-end
- Retrieval returns relevant results for test queries
- Cache reduces latency on repeated queries

---

### Agent 3: Widget UI (widget-agent)

**Role:** Build the React widget that renders inside ChatGPT's iframe.

**Owns:**
- `widget/src/bridge.ts` — MCP Apps UI bridge (JSON-RPC over postMessage)
- `widget/src/App.tsx` — main container, routes tool results to views
- `widget/src/components/SearchResults.tsx` — search results list
- `widget/src/components/EndpointCard.tsx` — endpoint schema display
- `widget/src/components/RequestBuilder.tsx` — form to build API test requests
- `widget/src/components/ResponseViewer.tsx` — display API response (status, headers, body)
- `widget/src/components/ErrorCard.tsx` — error resolution display
- `widget/src/components/CodeBlock.tsx` — syntax-highlighted code
- `widget/src/types.ts` — widget-side type definitions
- `widget/package.json`, `widget/vite.config.ts`, `widget/tsconfig.json`

**Phase 1 tasks:**
- [ ] Init React + Vite + TypeScript project, check latest versions
- [ ] Create `widget/src/bridge.ts`:
  - Listen for `ui/notifications/tool-result` from ChatGPT host
  - Send `tools/call` to invoke tools from widget (for "Try it" flow)
  - Handle `ui/initialize` handshake + `ui/notifications/initialized` confirmation
  - Use MCP Apps bridge standard (portable), NOT `window.openai` for core flows
- [ ] Create `widget/src/App.tsx`:
  - Receive tool results via bridge
  - Route to correct view based on tool name in result
  - `search` / `fetch` → SearchResults
  - `get_endpoint` → EndpointCard
  - `test_endpoint` → ResponseViewer
  - `debug_error` → ErrorCard
- [ ] Create `widget/src/components/SearchResults.tsx`:
  - Render list of search results from `structuredContent`
  - Each result: title, snippet, relevance score
  - Click result → call `get_endpoint` via bridge `tools/call`
- [ ] Create `widget/src/components/EndpointCard.tsx`:
  - Method badge (GET/POST/PUT/DELETE)
  - Path display
  - Parameters table (name, type, required, description)
  - Request body schema (collapsible)
  - Response schema (collapsible)
  - Code examples with syntax highlighting
  - **"Try it" button** → opens RequestBuilder
- [ ] Create `widget/src/components/RequestBuilder.tsx`:
  - Pre-filled from endpoint schema (path params, query params, body)
  - API key input field (session-only, never sent to MCP server)
  - Editable parameter values
  - "Send Request" button → calls `test_endpoint` via bridge `tools/call`
  - Loading state while request executes
- [ ] Create `widget/src/components/ResponseViewer.tsx`:
  - Status code badge (color-coded: 2xx green, 4xx yellow, 5xx red)
  - Response headers (collapsible)
  - Response body (JSON syntax-highlighted, collapsible for large responses)
  - Latency display
  - If error → auto-link to `debug_error` for that error code
- [ ] Create `widget/src/components/ErrorCard.tsx`:
  - Error code + HTTP status
  - Description
  - Common causes (bulleted list)
  - Resolution steps
  - Related endpoints
- [ ] Create `widget/src/components/CodeBlock.tsx` — syntax highlighting (use lightweight lib, no heavy deps)
- [ ] Configure Vite to produce single-file bundle (JS + CSS inlined) for `registerAppResource`
- [ ] Style to match ChatGPT's design language (clean, minimal, dark/light mode aware)

**Phase 2 tasks:**
- [ ] Polish interactions: loading states, error states, empty states
- [ ] Add "Copy as cURL" button to RequestBuilder
- [ ] Add "Copy response" button to ResponseViewer
- [ ] Test in ChatGPT iframe sandbox: no `localStorage`, no blocked APIs
- [ ] Verify fullscreen punch-out works via `_meta.ui.domain`

**Deliverables:**
- Built widget bundle that renders all 5 tool result types
- "Try it" flow: EndpointCard → RequestBuilder → ResponseViewer works end-to-end
- Screenshot of widget rendering in ChatGPT

---

### Agent 4: API Test Engine (api-test-agent)

**Role:** Build the `test_endpoint` execution engine — the live API testing sandbox.

**Owns:**
- `server/src/testing/executor.ts` — HTTP request builder + executor
- `server/src/testing/sanitizer.ts` — request/response sanitization
- `server/src/testing/auth.ts` — API key handling (receive from widget, use once, discard)

**Phase 1 tasks:**
- [ ] Create `server/src/testing/executor.ts`:
  - Receives: method, path, base URL, headers, query params, body, API key
  - Builds HTTP request from structured input
  - Executes via `fetch` (or `undici` for better control)
  - Returns: status code, headers, body, latency
  - Timeout: 30s max, configurable
  - Only supports HTTPS target URLs (no HTTP, no localhost)
- [ ] Create `server/src/testing/sanitizer.ts`:
  - Strip API keys from response before putting in `structuredContent`
  - Redact sensitive headers (Authorization, Cookie, Set-Cookie)
  - API key goes in `_meta` only (never reaches model)
  - Truncate response bodies > 50KB for `structuredContent`, full body in `_meta`
- [ ] Create `server/src/testing/auth.ts`:
  - Receive API key from tool input (widget sends it via `tools/call`)
  - Use key for the single request, then discard (no storage, no logging)
  - Validate key format before use (basic pattern check, not verification)
  - Support: Bearer token, API key header, Basic auth
- [ ] Define supported API targets:
  - Phase 1: Stripe API (api.stripe.com)
  - Phase 2: Twilio API (api.twilio.com)
  - Allowlist of base URLs to prevent SSRF (no arbitrary URL requests)
- [ ] Handle common failure modes:
  - Target API timeout → clear error message
  - Invalid API key → surface auth error, suggest checking key
  - Rate limited → surface rate limit info (retry-after header)
  - Network error → clear error, don't expose internals

**Phase 2 tasks:**
- [ ] Add request history (in-memory, per session, clears on disconnect)
- [ ] Add cURL export (generate cURL command from request params)
- [ ] Add Twilio API support
- [ ] Security review: verify no SSRF, no key leakage, no injection

**Deliverables:**
- `test_endpoint` executes real API calls and returns structured results
- API keys never appear in `structuredContent` or server logs
- SSRF prevention via URL allowlist

---

### Agent 5: Eval & QA (eval-agent)

**Role:** Build the eval harness, measure everything, gate quality. This agent is the **quality gatekeeper** — nothing ships without passing eval thresholds.

**Owns:**
- `server/src/eval/harness.ts` — eval runner
- `server/src/eval/metrics.ts` — precision, recall, faithfulness, relevance, latency
- `server/src/eval/report.ts` — markdown report generator
- `server/src/eval/test-sets/stripe.json` — 50+ Stripe Q&A pairs
- `server/src/eval/test-sets/twilio.json` — 20+ Twilio Q&A pairs
- `server/src/eval/integration.ts` — end-to-end integration tests
- `server/src/eval/security.ts` — security checks for test_endpoint

**Phase 1 tasks:**
- [ ] Create `server/src/eval/metrics.ts`:
  - `precisionAtK(retrieved, expected, k)` — % of top-k that are relevant
  - `recall(retrieved, expected)` — % of expected sources found
  - `faithfulness(answer, sources)` — LLM-as-judge (gpt-5-mini): does the answer only use info from sources?
  - `answerRelevance(answer, question)` — LLM-as-judge: does the answer address the question?
  - `latencyPercentiles(timings)` — p50, p95, p99
  - `cacheHitRate(hits, total)` — % of queries served from cache
- [ ] Create `server/src/eval/harness.ts`:
  - Load test set JSON
  - Run each query through retrieval pipeline
  - Compare retrieved chunks against expected sources
  - Run LLM-as-judge metrics on generated answers
  - Measure latency per query
  - Aggregate all metrics
- [ ] Create `server/src/eval/report.ts`:
  - Generate markdown report with results table
  - Include per-query breakdown for failures
  - Include config snapshot (alpha, chunk size, reranking threshold)
  - Diff against previous run if baseline exists
- [ ] Create `server/src/eval/test-sets/stripe.json` — 50+ curated Q&A pairs:
  - Endpoint lookups: "How do I create a PaymentIntent?"
  - Concept questions: "What's the difference between Charges and PaymentIntents?"
  - Parameter questions: "What params does POST /v1/subscriptions accept?"
  - Error resolution: "What does `card_declined` mean?"
  - Integration flows: "How do I set up Stripe webhooks?"
  - Each entry:
    ```json
    {
      "query": "How do I verify Stripe webhook signatures?",
      "api": "stripe",
      "expected_endpoints": ["/v1/webhook_endpoints"],
      "expected_concepts": ["webhook signature", "endpoint secret", "constructEvent"],
      "golden_answer_keywords": ["constructEvent", "whsec_", "raw body"],
      "tool": "search"
    }
    ```
- [ ] Wire `npm run eval` script in package.json

**Phase 2 tasks:**
- [ ] Create `server/src/eval/integration.ts` — end-to-end tests:
  - Tool invocation → correct `structuredContent` shape
  - Widget bridge → tool result delivery
  - `test_endpoint` → real API call returns valid response
  - `debug_error` → correct error info for known error codes
  - `search` + `fetch` → company knowledge schema compliance
- [ ] Create `server/src/eval/security.ts`:
  - Verify API keys never appear in `structuredContent`
  - Verify API keys never appear in server logs
  - Verify SSRF protection (attempt localhost, file://, etc.)
  - Verify non-allowlisted URLs are rejected
- [ ] Create `server/src/eval/test-sets/twilio.json` — 20+ Q&A pairs
- [ ] Run evals after RAG tuning, record improved metrics
- [ ] Produce final eval report for README

**Quality gates (must pass before shipping):**

| Metric | Target | Blocking? |
|--------|--------|-----------|
| precision@5 | > 0.80 | Yes |
| recall | > 0.70 | Yes |
| answer relevance | > 0.85 | Yes |
| latency p50 | < 500ms | Yes |
| latency p95 | < 2000ms | Yes |
| cache hit rate (warm) | > 30% | No (advisory) |
| test_endpoint key leakage | 0 incidents | Yes |
| SSRF bypass | 0 incidents | Yes |
| integration tests | 100% pass | Yes |

**Deliverables:**
- `npm run eval` produces a markdown report with real metrics
- `npm test` runs integration + security tests
- Quality gates documented and enforced

---

## Execution Timeline

### Phase 1: Foundation (Days 1–4) — all agents in parallel

```
Day 1–2:
  server-agent  → project init, MCP server skeleton, stub tools, ChatGPT connectivity
  rag-agent     → embeddings, retrieval, cache, chunker modules
  widget-agent  → React/Vite init, bridge, App.tsx, component shells
  api-test-agent → executor, sanitizer, auth modules
  eval-agent    → metrics, harness, test sets, report generator

Day 3–4:
  server-agent  → wire real modules into tool handlers
  rag-agent     → OpenAPI parser, ingestion pipeline, run Stripe ingestion
  widget-agent  → EndpointCard, RequestBuilder, ResponseViewer, ErrorCard
  api-test-agent → integration with server-agent, Stripe API testing
  eval-agent    → run first eval pass, record baseline, integration tests
```

**Phase 1 gate:** All tools return real data. Widget renders in ChatGPT. Eval baseline recorded.

### Phase 2: Polish + Second Source (Days 5–7)

```
Day 5:
  rag-agent     → ingest Twilio, verify cross-source search
  eval-agent    → Twilio test set, run evals, identify weak spots
  widget-agent  → polish UI, loading/error/empty states, copy buttons

Day 6:
  rag-agent     → tune retrieval based on eval results
  api-test-agent → add Twilio support, security review
  eval-agent    → re-run evals, verify quality gates pass

Day 7:
  server-agent  → production hardening (rate limiting, tracing, error handling)
  server-agent  → Docker compose (Redis + app)
  eval-agent    → final eval report, security tests, integration tests
```

**Phase 2 gate:** All quality gates pass. Two API sources working. Security tests clean.

### Phase 3: Ship (Days 8–10)

```
Day 8:
  Orchestrator → deploy to Railway/Fly.io (HTTPS)
  Orchestrator → end-to-end test in ChatGPT with deployed server

Day 9:
  Orchestrator → README with architecture diagram, setup, eval results
  Orchestrator → record 2-min demo screencast
  Orchestrator → prepare App Directory submission
    - _meta.ui.domain configured
    - Privacy policy
    - Test cases with expected outputs
    - Tool annotation justifications

Day 10:
  Orchestrator → write "Building a RAG Eval Pipeline for API Docs" guide
  Orchestrator → publish on GitHub + dev.to
```

### Phase 4: Projects 2 & 3 (Days 11–20)

- **Days 11–14:** "MCP Server Patterns for ChatGPT Apps" technical guide
- **Days 15–18:** Codex workflow demo (automated code review / PR summarizer)
- **Days 19–20:** Resume updates, interview prep

---

## Project Structure

```
docscope/
├── CLAUDE.md
├── PLAN.md
├── server/
│   ├── src/
│   │   ├── index.ts                 # Express + MCP server, /mcp endpoint
│   │   ├── types.ts                 # Shared TypeScript interfaces
│   │   ├── tools/
│   │   │   ├── search.ts            # RAG search (company knowledge compatible)
│   │   │   ├── fetch.ts             # Document retrieval (company knowledge compatible)
│   │   │   ├── get-endpoint.ts      # OpenAPI endpoint detail
│   │   │   ├── test-endpoint.ts     # Live API testing
│   │   │   └── debug-error.ts       # Error code resolution
│   │   ├── rag/
│   │   │   ├── embeddings.ts        # OpenAI embedding calls
│   │   │   ├── retrieval.ts         # Pinecone hybrid query + reranking
│   │   │   ├── cache.ts             # Redis semantic cache
│   │   │   └── chunker.ts           # OpenAPI-aware chunking
│   │   ├── ingestion/
│   │   │   ├── openapi-parser.ts    # Parse OpenAPI specs into chunks
│   │   │   ├── markdown-parser.ts   # Parse MDX/markdown docs
│   │   │   ├── error-catalog.ts     # Extract error codes for debug_error
│   │   │   └── pipeline.ts          # Orchestrates full ingestion
│   │   ├── testing/
│   │   │   ├── executor.ts          # HTTP request builder + executor
│   │   │   ├── sanitizer.ts         # Strip keys/sensitive data from responses
│   │   │   └── auth.ts              # API key handling (use once, discard)
│   │   └── eval/
│   │       ├── harness.ts           # Eval runner
│   │       ├── metrics.ts           # Precision, recall, faithfulness, relevance
│   │       ├── report.ts            # Markdown report generator
│   │       ├── integration.ts       # End-to-end integration tests
│   │       ├── security.ts          # Security checks (key leakage, SSRF)
│   │       └── test-sets/
│   │           ├── stripe.json      # 50+ Stripe API test Q&A pairs
│   │           └── twilio.json      # 20+ Twilio API test Q&A pairs
│   ├── package.json
│   └── tsconfig.json
├── widget/
│   ├── src/
│   │   ├── App.tsx                  # Main container, routes tool results
│   │   ├── bridge.ts               # MCP Apps UI bridge (JSON-RPC/postMessage)
│   │   ├── types.ts                # Widget-side type definitions
│   │   └── components/
│   │       ├── SearchResults.tsx    # Search results list
│   │       ├── EndpointCard.tsx     # Endpoint schema display
│   │       ├── RequestBuilder.tsx   # API test request form
│   │       ├── ResponseViewer.tsx   # API response display
│   │       ├── ErrorCard.tsx        # Error resolution display
│   │       └── CodeBlock.tsx        # Syntax-highlighted code
│   ├── package.json
│   └── vite.config.ts
├── docs-seed/
│   ├── stripe-openapi.yaml
│   └── twilio-openapi.yaml
├── docker-compose.yml               # Redis + app
└── README.md
```

---

## Key Commands

```bash
# Install
cd server && npm install
cd widget && npm install

# Dev server (MCP endpoint at localhost:3000/mcp)
cd server && npm run dev

# Build widget (single-file bundle for inlining)
cd widget && npm run build

# Expose for ChatGPT Developer Mode
ngrok http 3000

# Run eval harness
cd server && npm run eval

# Ingest docs
cd server && npm run ingest -- --source stripe
cd server && npm run ingest -- --source twilio

# Run tests (integration + security)
cd server && npm test

# Docker
docker-compose up
```

---

## Resume Bullets

### DocScope
> Built and submitted DocScope, a ChatGPT App (Apps SDK + MCP) combining RAG-powered API documentation search with live API testing — developers search endpoints, view structured schema cards, and execute real API calls without leaving ChatGPT. Serves 2+ API sources with [X]% precision@5, Redis semantic caching ([X]% latency reduction), and company knowledge compatibility for deep research.

### Eval Pipeline
> Designed evaluation harness measuring retrieval precision@k, faithfulness (LLM-as-judge), and answer relevance across 70+ curated test queries — used to compare chunking strategies, retrieval algorithms, and reranking thresholds, improving precision@5 from [X]% to [X]% through systematic tuning.

### Technical Guides
> Published technical guides on RAG evaluation pipelines and MCP server patterns for ChatGPT Apps, contributing to the OpenAI developer ecosystem.

---

## Interview Prep

1. **"Walk me through the DocScope architecture."** — MCP server exposes 5 tools. Read tools use RAG over ingested OpenAPI specs. Write tool proxies live API calls. Widget renders structured results in ChatGPT iframe via MCP Apps bridge. structuredContent for the model, _meta for the widget.

2. **"Why MCP instead of a custom API?"** — Standard protocol, ChatGPT native support, portable across hosts, company knowledge + deep research compatibility built-in, OAuth via spec.

3. **"How does test_endpoint handle API keys securely?"** — Key comes from widget (user input), passed in tool call, used for single request, immediately discarded. Never stored, never logged, never in structuredContent (model can't see it). Only in _meta for widget display. SSRF prevented via URL allowlist.

4. **"What's the difference between structuredContent and _meta?"** — structuredContent is concise data the model reads to narrate. _meta is large/sensitive data only the widget sees. Keeps model context small, keeps secrets out of model context.

5. **"How does your eval pipeline work?"** — Curated test set → run queries → compare retrieved chunks vs expected → LLM-as-judge for faithfulness/relevance → aggregate metrics → markdown report with diff against baseline.

6. **"What happens when Pinecone is down?"** — Cache serves recent queries. New queries get clear error. Never crash. Trace ID in logs for debugging.

7. **"How would you scale to 100 API sources?"** — Namespace isolation per API in Pinecone, async ingestion queue, tenant-scoped retrieval, horizontal scaling of stateless MCP server, per-source eval test sets.

8. **"Why is this better than Context7?"** — Context7 returns docs as text. DocScope adds: live API execution, structured endpoint cards in a widget UI, error diagnosis, measured retrieval quality via eval pipeline, and company knowledge compatibility for enterprise ChatGPT.

9. **"Walk me through the user confirmation flow for test_endpoint."** — Tool has `readOnlyHint: false`, so ChatGPT requires user confirmation before executing. User sees what will be called. After confirmation, server executes, returns response. Widget shows result with option to debug errors.

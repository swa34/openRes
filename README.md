# DocScope

A ChatGPT App that lets developers search API docs, explore endpoints, and test live API calls — all without leaving the chat. Built with the MCP protocol and OpenAI's Apps SDK.

Right now it indexes **Stripe** (587 endpoints) and **Twilio** (197 endpoints), but the ingestion pipeline is designed to handle any OpenAPI spec.

**Live:** https://openres-production.up.railway.app

## Why I built this

I wanted something more useful than just "paste docs into context." Most API doc tools give you a wall of text. DocScope gives you structured endpoint cards, parameter tables, and the ability to actually hit the API from inside ChatGPT. It's the tool I wish I had when jumping between API docs and my editor.

It also gave me a reason to build a proper RAG eval pipeline — not just "does it work" but measured precision, recall, and faithfulness scores against curated test sets.

## What it does

DocScope exposes 5 MCP tools to ChatGPT:

| Tool | What it does |
|------|-------------|
| `search` | Hybrid semantic + keyword search across indexed API docs |
| `fetch` | Pull the full document for a specific result |
| `get_endpoint` | Structured endpoint schema — params, request/response bodies, examples |
| `test_endpoint` | Execute a real API call against Stripe or Twilio (with your key, used once and discarded) |
| `debug_error` | Look up error codes, common causes, and how to fix them |

There's also a **widget UI** that renders inside ChatGPT's iframe — endpoint cards, a request builder with "Try it" functionality, response viewer, and error cards.

## Architecture

```
User prompt in ChatGPT
   |
   v
ChatGPT model --> MCP tool call --> DocScope MCP Server (Railway)
   |                                    |
   |                              search/fetch     --> Pinecone + Redis cache
   |                              get_endpoint     --> Parsed OpenAPI store
   |                              test_endpoint    --> HTTP proxy (SSRF-protected)
   |                              debug_error      --> Error catalog
   |                                    |
   |                    structuredContent (model reads)
   |                    _meta (widget-only, never reaches model)
   |                                    |
   +--- renders response <-- widget iframe (MCP Apps bridge)
```

**Key design decisions:**

- **Hybrid search (alpha=0.7):** Semantic-first with keyword fallback. API docs have specific parameter names that pure semantic search misses.
- **LLM reranking:** When top results score too close together, gpt-5-nano reranks them. Adds ~500ms but improves relevance.
- **OpenAPI-aware chunking:** Chunks by endpoint, not by character count. Keeps the full schema together so retrieval returns complete, useful results.
- **structuredContent vs _meta split:** Model gets concise JSON to narrate from. Widget gets the full payload. API keys only ever live in `_meta` — the model never sees them.

## Eval results

I built an eval harness that runs 43 Stripe queries against the retrieval pipeline, measures precision/recall, then uses gpt-5-mini as a judge for faithfulness and answer relevance.

| Metric | Score | What it means |
|--------|-------|--------------|
| precision@5 | 0.66 | 66% of top-5 results are from the right endpoint |
| recall | 0.96 | 96% of expected endpoints are found somewhere in results |
| faithfulness | 0.98 | Answers stick to what's in the source docs |
| answer relevance | 0.77 | Answers address the actual question asked |

Precision@5 tops out around 0.66 because Stripe has a lot of semantically similar endpoints (`/v1/refunds` vs `/v1/charges/{charge}/refunds` vs `/v1/terminal/refunds`). Getting past that would need metadata filtering or a different retrieval approach entirely.

## Stack

- **Server:** Node.js + TypeScript, `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`
- **RAG:** OpenAI `text-embedding-3-large`, Pinecone, Redis semantic cache
- **Widget:** React 19 + Vite 8, inlined into MCP resource
- **Eval:** Custom harness with LLM-as-judge metrics
- **Infra:** Railway (server), Pinecone (vectors), Docker

## Try it in ChatGPT

1. Open [ChatGPT](https://chatgpt.com) and go to **Settings → Developer → Enable Developer Mode**
2. Start a new chat, click the **MCP tools** icon (puzzle piece) in the composer
3. Add a new MCP server with this URL:
   ```
   https://openres-production.up.railway.app/mcp
   ```
4. Ask something like *"Use DocScope to find how to send an SMS with Twilio"* or *"Use DocScope to look up what params POST /v1/charges accepts"*

The widget should pop up with structured endpoint cards. You can click through to see parameters, schemas, and use the "Try it" button to make real API calls (you'll need your own Stripe or Twilio key for that part).

## Running locally

```bash
# Clone and install
git clone https://github.com/swa34/openRes.git
cd openRes
cd server && npm install
cd ../widget && npm install

# Set up env vars
cp server/.env.example server/.env
# Edit server/.env with your keys

# Build widget
cd widget && npm run build

# Start server
cd ../server && npm run dev
# Server at http://localhost:3000/mcp

# Ingest API docs (first time only)
npm run ingest -- --source stripe
npm run ingest -- --source twilio

# Run eval
npm run eval

# Run tests
npm test
```

## Project structure

```
openRes/
  server/src/
    index.ts              # MCP server + Express
    tools/                # 5 tool handlers
    rag/                  # Retrieval pipeline (embeddings, search, cache, chunking)
    ingestion/            # OpenAPI parser + Pinecone upsert
    testing/              # API test executor + SSRF guard + sanitizer
    eval/                 # Eval harness, metrics, test sets
  widget/src/
    App.tsx               # Main widget, routes tool results to views
    bridge.ts             # MCP Apps UI bridge (JSON-RPC/postMessage)
    components/           # EndpointCard, RequestBuilder, ResponseViewer, etc.
  website/                # Marketing/docs site (React 19 + Vite 8 + Tailwind v4)
    src/pages/            # Home, Features, Architecture, Demo, Docs
    src/lib/mcp-client.ts # Live demo MCP client
  docs-seed/              # OpenAPI specs (Stripe, Twilio)
```

## Website

A standalone marketing and documentation site for DocScope, built with React 19, Vite 8, Tailwind CSS v4, and shadcn/ui. Includes a live demo page that calls the production MCP server.

```bash
cd website && npm install
npm run dev      # Dev server at http://localhost:5174
npm run build    # Production build to website/dist/
npm run preview  # Preview production build
npm test         # Run tests
```

Live at [openres-production.up.railway.app](https://openres-production.up.railway.app). Served from the same Railway deployment as the MCP server.

## Security

The `test_endpoint` tool executes real HTTP requests, so security matters:

- **URL allowlist** — only `api.stripe.com` and `api.twilio.com`, no arbitrary URLs
- **SSRF protection** — blocks private IPs, localhost, non-HTTPS, DNS rebinding
- **API keys never reach the model** — keys go in `_meta` only, scrubbed from `structuredContent` and logs
- **Keys used once and discarded** — no storage, no persistence

62 security tests cover key leakage, SSRF bypass attempts, and header redaction.

## Links

- **Website:** [openres-production.up.railway.app](https://openres-production.up.railway.app)
- **MCP Endpoint:** [openres-production.up.railway.app/mcp](https://openres-production.up.railway.app/mcp)
- **GitHub:** [github.com/swa34/openRes](https://github.com/swa34/openRes)
- **Technical Guide:** [MCP Server Patterns for ChatGPT Apps](docs/mcp-server-patterns.md)

## What's next

- App Directory submission
- More API sources (adding a new one is just an OpenAPI spec + `npm run ingest`)
- Redis cache in production for faster repeat queries

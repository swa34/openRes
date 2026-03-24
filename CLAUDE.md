# DocScope — ChatGPT App for Developer Documentation Intelligence

## What this project is

A production ChatGPT App (Apps SDK + MCP) that helps developers search, understand, and debug API documentation inside ChatGPT. Built to demonstrate OpenAI ecosystem integration for job applications targeting:
- AI Deployment Engineer — ChatGPT Ecosystem
- AI Deployment Engineer — Codex
- Software Engineer, Gov

## Author

Scott Allen — scottwallen3434@gmail.com — github.com/swa34

## Stack

- **MCP Server**: Node.js + TypeScript + Express
- **MCP SDK**: `@modelcontextprotocol/sdk` + `@modelcontextprotocol/ext-apps`
- **RAG Engine**: OpenAI embeddings (text-embedding-3-large) + Pinecone + Redis semantic cache
- **Widget UI**: React + Vite (rendered in ChatGPT iframe via MCP Apps UI bridge)
- **Eval**: Custom harness with curated test sets, metrics: precision@5, faithfulness, answer relevance, latency
- **Models**: All GPT-5 series via Responses API — GPT-5 for generation, gpt-5-nano for reranking, gpt-5-mini for eval/judge
- **Schema validation**: Zod

## Existing RAG code to reuse

There is an existing production RAG system in `../applied-llm-rag-system/` with battle-tested components:
- `src/retrieval/hybridSearch.js` — dense + sparse hybrid search with LLM reranking
- `src/cache/tieredCache.js` — Redis L1 + PostgreSQL L2 cache
- `src/ingestion/documentIngestion.js` — chunking, embedding, Pinecone upsert
- `src/feedback/feedbackLearning.js` — source scoring from user feedback

Adapt and import these rather than rebuilding. The DocScope MCP server wraps this engine behind MCP tools.

## Project structure

```
docscope/
├── CLAUDE.md
├── PLAN.md
├── server/
│   ├── src/
│   │   ├── index.ts              # Express + MCP server, /mcp endpoint
│   │   ├── tools/
│   │   │   ├── search-docs.ts    # RAG-powered doc search tool
│   │   │   ├── get-endpoint.ts   # OpenAPI endpoint detail tool
│   │   │   └── debug-error.ts    # Error code resolution tool
│   │   ├── rag/
│   │   │   ├── embeddings.ts     # OpenAI embedding calls
│   │   │   ├── retrieval.ts      # Pinecone query + reranking
│   │   │   ├── cache.ts          # Redis semantic cache
│   │   │   └── chunker.ts        # Doc chunking strategies
│   │   ├── ingestion/
│   │   │   ├── openapi-parser.ts # Parse OpenAPI specs into chunks
│   │   │   ├── markdown-parser.ts# Parse MDX/markdown docs
│   │   │   └── pipeline.ts       # Orchestrates full ingestion
│   │   └── eval/
│   │       ├── harness.ts        # Eval runner
│   │       ├── metrics.ts        # Precision, faithfulness, relevance
│   │       └── test-sets/
│   │           ├── stripe.json   # Stripe API test Q&A pairs
│   │           └── twilio.json   # Twilio API test Q&A pairs
│   ├── package.json
│   └── tsconfig.json
├── widget/
│   ├── src/
│   │   ├── App.tsx               # Main widget component
│   │   ├── EndpointCard.tsx      # Endpoint schema display
│   │   ├── CodeBlock.tsx         # Syntax-highlighted examples
│   │   └── bridge.ts            # MCP Apps UI bridge (JSON-RPC over postMessage)
│   ├── package.json
│   └── vite.config.ts
├── docs-seed/                     # Initial API doc sources
│   └── stripe-openapi.yaml
├── docker-compose.yml            # Redis + app
└── README.md
```

## Key commands

```bash
# Install
cd server && npm install
cd widget && npm install

# Dev server (MCP endpoint at localhost:3000/mcp)
cd server && npm run dev

# Expose for ChatGPT Developer Mode
ngrok http 3000

# Run eval harness
cd server && npm run eval

# Ingest docs
cd server && npm run ingest -- --source stripe

# Build widget
cd widget && npm run build

# Run tests
cd server && npm test
```

## MCP tool annotations (required by Apps SDK)

Every tool MUST include `annotations` with `readOnlyHint`, `openWorldHint`, and `destructiveHint`. All three DocScope tools are read-only:

```typescript
annotations: {
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false
}
```

## Architecture decisions

- **Hybrid search (alpha=0.7)**: Semantic-first with keyword fallback. API docs have specific parameter names that pure semantic misses.
- **LLM reranking**: Only triggered when top-3 scores are within 0.02 of each other and top score > 0.35. Uses gpt-5-nano (Responses API, minimal reasoning) for speed.
- **Redis semantic cache**: Hash query embedding, check similarity threshold (0.92) before hitting Pinecone. TTL 1 hour.
- **OpenAPI-aware chunking**: Don't chunk by character count alone. Parse the OpenAPI spec and chunk by endpoint, keeping the full schema together.
- **Widget renders via MCP Apps UI standard**: Use `_meta.ui.resourceUri` to link tools to the widget resource. Bridge via `ui/*` JSON-RPC over postMessage.

## Critical build priorities (in order)

1. **Eval harness first** — resume claims an eval pipeline; it must exist with real metrics
2. **MCP server with stubbed tools** — prove ChatGPT connectivity before building the engine
3. **Wire RAG to search_docs tool** — real retrieval behind the MCP tool
4. **Widget UI** — interactive endpoint cards in ChatGPT iframe
5. **Second API source** — proves ingestion generalizes
6. **Public technical guide** — write-up for portfolio

## Do NOT

- Use `ChatGPT-5` anywhere — the model is called `GPT-5`
- Use deprecated Chat Completions API for GPT-5 — use Responses API
- Skip tool annotations on MCP tools — Apps SDK requires them
- Build a generic chatbot — this is a developer tool with specific, scoped tools
- Use `localStorage` in the widget — not available in ChatGPT iframe sandbox

import {
  SearchIcon,
  FetchIcon,
  EndpointIcon,
  TestIcon,
  DebugIcon,
} from "@/assets/icons";

// ─── Site Metadata ───

export const SITE = {
  title: "DocScope",
  tagline: "API documentation intelligence for ChatGPT",
  description:
    "Search, explore, and test API endpoints without leaving ChatGPT. Built with MCP and powered by hybrid RAG retrieval.",
  author: "Scott Allen",
  repo: "https://github.com/swa34/openRes",
  mcpUrl: "https://openres-production.up.railway.app/mcp",
} as const;

// ─── Navigation ───

export const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Architecture", href: "/architecture" },
  { label: "Demo", href: "/demo" },
  { label: "Docs", href: "/docs" },
] as const;

// ─── Hero Section ───

export const HERO = {
  headline: "API docs that work inside ChatGPT",
  subheadline:
    "DocScope turns API documentation into searchable, structured, testable knowledge — delivered through MCP tools right where you code.",
  cta: { label: "Try it in ChatGPT", href: "/demo" },
  secondaryCta: { label: "View on GitHub", href: "https://github.com/swa34/openRes" },
} as const;

// ─── Tool Cards (landing page + features page) ───

export const TOOL_CARDS = [
  {
    name: "search",
    title: "Hybrid RAG Search",
    icon: SearchIcon,
    shortDescription:
      "Semantic + keyword search across indexed API docs with LLM reranking when results are close.",
    longDescription:
      "Combines dense embeddings (text-embedding-3-large) with sparse keyword matching at alpha=0.7. When the top-3 results score within 0.02 of each other, gpt-5-nano reranks them for precision. Results are cached in Redis with a 0.92 similarity threshold to avoid redundant Pinecone queries.",
    example: `search({ query: "how to create a refund", source: "stripe" })`,
  },
  {
    name: "fetch",
    title: "Document Retrieval",
    icon: FetchIcon,
    shortDescription:
      "Pull the full text of any indexed document by its vector ID from Pinecone.",
    longDescription:
      "After a search surfaces relevant chunks, fetch retrieves the complete document with full metadata. Returns company-knowledge-compatible JSON so ChatGPT can narrate the content directly, while the widget displays the formatted version.",
    example: `fetch({ document_id: "stripe:post-v1-charges" })`,
  },
  {
    name: "get_endpoint",
    title: "Endpoint Explorer",
    icon: EndpointIcon,
    shortDescription:
      "Structured OpenAPI endpoint details — params, schemas, examples — rendered as interactive cards.",
    longDescription:
      "Parses OpenAPI specs during ingestion and stores endpoints in memory keyed by api:METHOD:/path. Returns concise summaries in structuredContent for the model and full schemas (request bodies, response types, error codes) in _meta for the widget to render as interactive cards.",
    example: `get_endpoint({ api: "stripe", method: "POST", path: "/v1/charges" })`,
  },
  {
    name: "test_endpoint",
    title: "Live API Testing",
    icon: TestIcon,
    shortDescription:
      "Execute real API requests against Stripe or Twilio from inside ChatGPT with SSRF protection.",
    longDescription:
      "Proxies HTTP requests through an allowlisted executor that blocks private IPs, enforces HTTPS, and prevents DNS rebinding. API keys live only in _meta — never reaching the model or logs. Keys are used once and discarded. 62 security tests cover the attack surface.",
    example: `test_endpoint({ api: "stripe", method: "GET", path: "/v1/charges", apiKey: "sk_test_..." })`,
  },
  {
    name: "debug_error",
    title: "Error Resolution",
    icon: DebugIcon,
    shortDescription:
      "Look up API error codes with root causes, fix suggestions, and links to relevant docs.",
    longDescription:
      "Maintains an in-memory error catalog populated during ingestion, keyed by api:errorCode. Returns structured error info with common causes, suggested fixes, and links to related endpoints. Helps developers debug API issues without context-switching to docs.",
    example: `debug_error({ api: "stripe", error_code: "card_declined" })`,
  },
] as const;

// ─── Feature Highlights (landing page grid) ───

export const FEATURE_HIGHLIGHTS = [
  {
    title: "Hybrid RAG Search",
    description:
      "Dense + sparse retrieval with semantic-first ranking and keyword fallback. Alpha=0.7 tuned for API documentation where parameter names matter.",
  },
  {
    title: "Interactive Endpoint Cards",
    description:
      "Full OpenAPI schema display with parameters, response codes, and example payloads — rendered natively in ChatGPT's iframe.",
  },
  {
    title: "Live API Testing",
    description:
      "Build and execute real API requests from endpoint cards. SSRF-protected, keys never reach the model, used once and discarded.",
  },
  {
    title: "Real Eval Metrics",
    description:
      "Production evaluation harness with 43 curated test queries. Measures precision@5, recall, faithfulness, and answer relevance with LLM-as-judge.",
  },
  {
    title: "Multi-Source Ingestion",
    description:
      "OpenAPI-aware chunking that keeps endpoint schemas intact. Stripe (587 endpoints) and Twilio (197 endpoints) indexed, any OpenAPI spec supported.",
  },
  {
    title: "ChatGPT Native Widget",
    description:
      "MCP Apps UI bridge renders interactive React components inside ChatGPT via JSON-RPC over postMessage. No external tools needed.",
  },
] as const;

// ─── Eval Metrics (landing page + architecture page) ───

export const EVAL_METRICS = [
  { label: "precision@5", value: "0.66", description: "66% of top-5 results are from the correct endpoint" },
  { label: "recall", value: "0.96", description: "96% of expected endpoints found in results" },
  { label: "faithfulness", value: "0.98", description: "Answers stick to source documentation" },
  { label: "answer relevance", value: "0.77", description: "Answers address the actual question asked" },
] as const;

// ─── Architecture Flow ───

export const ARCHITECTURE_STEPS = [
  { label: "User prompt", description: "Developer asks a question in ChatGPT" },
  { label: "MCP tool call", description: "ChatGPT routes the request to DocScope via MCP protocol" },
  { label: "Hybrid retrieval", description: "Dense + sparse search against Pinecone with Redis cache check" },
  { label: "LLM reranking", description: "gpt-5-nano reranks close results for precision" },
  { label: "Structured response", description: "structuredContent for the model, _meta for the widget" },
  { label: "Widget render", description: "Interactive endpoint cards displayed in ChatGPT iframe" },
] as const;

// ─── Terminal Demo Script ───

export const DEMO_LINES = [
  { type: "input" as const, text: '> search({ query: "create a payment intent", source: "stripe" })' },
  { type: "output" as const, text: "" },
  { type: "output" as const, text: "Found 5 results (cache: miss, latency: 340ms)" },
  { type: "output" as const, text: "" },
  { type: "output" as const, text: "1. POST /v1/payment_intents          score: 0.94" },
  { type: "output" as const, text: '   "Creates a PaymentIntent object..."' },
  { type: "output" as const, text: "2. POST /v1/payment_intents/confirm   score: 0.87" },
  { type: "output" as const, text: '   "Confirm that your customer intends to pay..."' },
  { type: "output" as const, text: "3. GET  /v1/payment_intents/:id       score: 0.82" },
  { type: "output" as const, text: '   "Retrieves the details of a PaymentIntent..."' },
] as const;

// ─── SEO Meta per Page ───

export const PAGE_META: Record<string, { title: string; description: string }> = {
  home: {
    title: "DocScope — API Documentation Intelligence for ChatGPT",
    description:
      "Search, explore, and test API endpoints inside ChatGPT. Hybrid RAG retrieval, interactive endpoint cards, and live API testing via MCP.",
  },
  features: {
    title: "Features — DocScope",
    description:
      "Five MCP tools for API documentation: hybrid search, document retrieval, endpoint explorer, live testing, and error resolution.",
  },
  architecture: {
    title: "Architecture — DocScope",
    description:
      "How DocScope works: hybrid RAG pipeline, OpenAPI-aware chunking, semantic caching, LLM reranking, and MCP Apps widget rendering.",
  },
  demo: {
    title: "Demo — DocScope",
    description:
      "Try DocScope live: connect your ChatGPT to the MCP server and search API documentation in real time.",
  },
  docs: {
    title: "Docs — DocScope",
    description:
      "Getting started guide, API reference, and integration instructions for the DocScope MCP server.",
  },
};

// ─── 404 Page ───

export const NOT_FOUND = {
  headline: "404 — Page not found",
  message: "This endpoint doesn't exist in our docs either. Try searching for what you need.",
  cta: { label: "Back to home", href: "/" },
} as const;

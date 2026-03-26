export const MCP_SERVER_URL = "http://localhost:3000/mcp";

export const EVAL_METRICS = {
  precision_at_5: 0.66,
  recall: 0.96,
  faithfulness: 0.98,
  answer_relevance: 0.77,
} as const;

export const FEATURES = [
  {
    title: "Hybrid RAG Search",
    description:
      "Dense + sparse retrieval with semantic-first ranking and keyword fallback. Alpha=0.7 tuned for API documentation.",
  },
  {
    title: "Interactive Endpoint Cards",
    description:
      "Full OpenAPI schema display with parameters, response codes, and example payloads rendered in ChatGPT.",
  },
  {
    title: "Live API Testing",
    description:
      "Build and execute API requests directly from endpoint cards without leaving the ChatGPT interface.",
  },
  {
    title: "Real Eval Metrics",
    description:
      "Production evaluation harness measuring precision@5, recall, faithfulness, and answer relevance on curated test sets.",
  },
  {
    title: "Multi-Source Support",
    description:
      "Ingest OpenAPI specs, MDX docs, and markdown from any API provider. Stripe and Twilio included as seed sources.",
  },
  {
    title: "ChatGPT Native Widget",
    description:
      "MCP Apps UI bridge renders interactive React components inside the ChatGPT iframe via JSON-RPC over postMessage.",
  },
] as const;

export const TOOLS = [
  {
    name: "search",
    description:
      "RAG-powered semantic search across ingested API documentation with hybrid retrieval and LLM reranking.",
  },
  {
    name: "fetch",
    description:
      "Retrieve the full text of any indexed document by its vector ID from Pinecone.",
  },
  {
    name: "get_endpoint",
    description:
      "Retrieve full OpenAPI endpoint details including parameters, request/response schemas, and code examples.",
  },
  {
    name: "test_endpoint",
    description:
      "Execute a live API request against a documentation endpoint and return the formatted response.",
  },
  {
    name: "debug_error",
    description:
      "Resolve API error codes with root cause analysis, fix suggestions, and links to relevant documentation.",
  },
] as const;

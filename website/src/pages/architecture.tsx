import Section from "@/components/layout/section";
import FlowStep from "@/components/architecture/flow-step";
import MetricsTable from "@/components/architecture/metrics-table";
import CodeBlock from "@/components/code/code-block";
import { PAGE_META } from "@/lib/content";
import { useSeo } from "@/hooks/use-seo";

const PIPELINE_STEPS = [
  {
    label: "Query arrives via MCP",
    description: "ChatGPT calls the search_docs tool through the MCP protocol.",
    details:
      "The MCP server validates the request with Zod schemas, extracts the query string and optional source filter, then checks the semantic cache before proceeding to retrieval.",
  },
  {
    label: "Redis semantic cache check",
    description: "Query embedding hashed and compared against cached results (threshold: 0.92).",
    details:
      "Embeddings are generated with text-embedding-3-large (3072 dims). The cache key is the cosine-similarity-nearest neighbor of the query embedding. TTL is 1 hour. Cache hits skip Pinecone entirely, cutting latency from ~340ms to ~45ms.",
  },
  {
    label: "Hybrid retrieval from Pinecone",
    description: "Dense + sparse search with alpha=0.7 weighting toward semantic.",
    details:
      "Dense vectors come from text-embedding-3-large. Sparse vectors use BM25-style keyword matching, critical for API docs where exact parameter names matter. Alpha=0.7 means 70% semantic, 30% keyword. Pinecone returns top-20 candidates.",
  },
  {
    label: "LLM reranking (conditional)",
    description: "gpt-5-nano reranks when top-3 scores are within 0.02 of each other.",
    details:
      "Reranking only triggers when the top result scores above 0.35 AND the gap between positions 1-3 is less than 0.02. This avoids unnecessary LLM calls on clear winners. Uses the Responses API with minimal reasoning for speed (~80ms overhead).",
  },
  {
    label: "Response construction",
    description: "structuredContent for the model, _meta with widget data.",
    details:
      "The MCP response splits data: concise text summaries go in structuredContent (what ChatGPT narrates), while full schemas, parameters, and examples go in _meta.ui for the widget to render. This keeps model context lean while giving the UI rich data.",
  },
  {
    label: "Widget rendering",
    description: "Interactive endpoint cards displayed in ChatGPT iframe.",
    details:
      "The widget receives tool results via the MCP Apps UI bridge (JSON-RPC over postMessage). It renders endpoint cards, search result lists, response viewers, and error cards. No external tools or browser extensions needed.",
  },
];

export function Component() {
  useSeo(PAGE_META.architecture);

  return (
    <>
      {/* Pipeline overview */}
      <Section
        title="Architecture"
        subtitle="How a user question becomes an interactive endpoint card in under 500ms."
      >
        <div className="flex flex-col items-center gap-0">
          {PIPELINE_STEPS.map((step, i) => (
            <FlowStep
              key={step.label}
              number={i + 1}
              label={step.label}
              description={step.description}
              details={step.details}
              isLast={i === PIPELINE_STEPS.length - 1}
            />
          ))}
        </div>
      </Section>

      {/* RAG deep dive */}
      <Section
        title="RAG Pipeline"
        subtitle="OpenAPI-aware chunking ensures endpoint schemas stay intact."
        variant="alt"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-semibold text-text mb-3">OpenAPI-Aware Chunking</h3>
            <p className="text-sm text-text-secondary leading-relaxed mb-4">
              Instead of splitting by character count, the ingestion pipeline parses the OpenAPI spec
              and chunks by endpoint. Each chunk contains the full schema for one endpoint -- method,
              path, parameters, request body, response schema, and examples. This prevents semantic
              search from returning partial schemas.
            </p>
            <h3 className="text-lg font-semibold text-text mb-3">Embedding Strategy</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              Each chunk is embedded with text-embedding-3-large (3072 dimensions). The embedding
              input concatenates the endpoint summary, parameter names, and description to maximize
              semantic coverage. Sparse vectors are generated from the same text using BM25 tokenization
              for exact keyword matching.
            </p>
          </div>
          <div>
            <CodeBlock
              code={`// Ingestion pipeline
const spec = await parseOpenAPI("stripe-openapi.yaml");

for (const endpoint of spec.endpoints) {
  const chunk = buildChunk(endpoint);
  // {method, path, summary, params, requestBody, responseSchema}

  const dense = await embed(chunk.text);
  const sparse = bm25Tokenize(chunk.text);

  await pinecone.upsert({
    id: \`stripe:\${endpoint.method}-\${endpoint.path}\`,
    values: dense,
    sparseValues: sparse,
    metadata: {
      api: "stripe",
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary,
    },
  });
}`}
              language="typescript"
              label="Ingestion Pipeline"
            />
          </div>
        </div>
      </Section>

      {/* Security */}
      <Section title="Security">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div className="p-6 rounded-xl border border-border bg-white dark:bg-gray-900">
            <h3 className="font-semibold text-text mb-2">SSRF Protection</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              The test_endpoint tool proxies requests through an allowlisted executor that blocks
              private IP ranges, enforces HTTPS, prevents DNS rebinding, and validates the target
              URL against a known-good list. 62 security tests cover the attack surface.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-border bg-white dark:bg-gray-900">
            <h3 className="font-semibold text-text mb-2">API Key Handling</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              API keys are passed in _meta (never in structuredContent), meaning they never reach
              the model or appear in logs. Keys are used for a single request and immediately
              discarded. The MCP server never stores or caches credentials.
            </p>
          </div>
        </div>
      </Section>

      {/* Eval */}
      <Section
        title="Evaluation Results"
        subtitle="43 curated test queries across Stripe and Twilio documentation, scored by LLM-as-judge (gpt-5-mini)."
        variant="alt"
      >
        <div className="max-w-3xl mx-auto rounded-xl border border-border bg-white dark:bg-gray-900 overflow-hidden">
          <MetricsTable />
        </div>
      </Section>
    </>
  );
}

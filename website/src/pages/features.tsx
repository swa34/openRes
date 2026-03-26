import { motion } from "motion/react";
import { TOOL_CARDS, PAGE_META } from "@/lib/content";
import Section from "@/components/layout/section";
import CodeBlock from "@/components/code/code-block";
import { useSeo } from "@/hooks/use-seo";

function ToolSection({
  tool,
  index,
}: {
  tool: (typeof TOOL_CARDS)[number];
  index: number;
}) {
  const Icon = tool.icon;
  const isEven = index % 2 === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4 }}
      className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-start ${
        !isEven ? "lg:direction-rtl" : ""
      }`}
    >
      {/* Text content */}
      <div className={!isEven ? "lg:order-2" : ""}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center text-primary">
            <Icon width={22} height={22} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-text">{tool.title}</h3>
            <code className="text-xs font-mono text-text-muted">{tool.name}</code>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed mb-4">
          {tool.longDescription}
        </p>
      </div>

      {/* Code example */}
      <div className={!isEven ? "lg:order-1" : ""}>
        <CodeBlock
          code={tool.example}
          language="typescript"
          label="MCP Tool Call"
        />
      </div>
    </motion.div>
  );
}

export function Component() {
  useSeo(PAGE_META.features);

  return (
    <>
      <Section
        title="MCP Tools"
        subtitle="Five tools that turn API documentation into interactive, searchable knowledge accessible from ChatGPT."
      >
        <div className="flex flex-col gap-16">
          {TOOL_CARDS.map((tool, i) => (
            <ToolSection key={tool.name} tool={tool} index={i} />
          ))}
        </div>
      </Section>

      {/* How tools connect */}
      <Section
        title="How Tools Work Together"
        subtitle="A typical workflow chains search, endpoint exploration, and testing."
        variant="alt"
      >
        <div className="max-w-2xl mx-auto">
          <CodeBlock
            code={`// 1. Search for relevant endpoints
search({ query: "create a payment", source: "stripe" })
// Returns top-5 results with scores

// 2. Explore the best match
get_endpoint({ api: "stripe", method: "POST", path: "/v1/payment_intents" })
// Returns full schema, params, examples

// 3. Test it live
test_endpoint({
  api: "stripe",
  method: "POST",
  path: "/v1/payment_intents",
  body: { amount: 2000, currency: "usd" },
  apiKey: "sk_test_..."
})

// 4. Debug any errors
debug_error({ api: "stripe", error_code: "card_declined" })`}
            language="typescript"
            label="Typical Workflow"
          />
        </div>
      </Section>
    </>
  );
}

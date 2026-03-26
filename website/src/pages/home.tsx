import Hero from "@/components/hero/hero";
import FeatureGrid from "@/components/features/feature-grid";
import ArchitectureDiagram from "@/components/architecture/architecture-diagram";
import MetricsTable from "@/components/architecture/metrics-table";
import Section from "@/components/layout/section";
import { SITE, PAGE_META } from "@/lib/content";
import { useSeo } from "@/hooks/use-seo";

export function Component() {
  useSeo(PAGE_META.home);

  return (
    <>
      <Hero />
      <FeatureGrid />

      <Section
        title="How It Works"
        subtitle="From user prompt to interactive endpoint card in under 500ms."
      >
        <ArchitectureDiagram />
      </Section>

      <Section
        title="Evaluation Results"
        subtitle="Measured on 43 curated test queries across Stripe and Twilio documentation."
        variant="alt"
      >
        <div className="max-w-3xl mx-auto rounded-xl border border-border bg-white dark:bg-gray-900 overflow-hidden">
          <MetricsTable />
        </div>
      </Section>

      {/* Final CTA */}
      <Section>
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-text mb-4">
            Ready to try it?
          </h2>
          <p className="text-lg text-text-secondary mb-8 max-w-xl mx-auto">
            Connect DocScope to ChatGPT and search API documentation in seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={SITE.mcpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-primary rounded-lg hover:opacity-90 transition-opacity"
            >
              Try in ChatGPT
            </a>
            <a
              href={SITE.repo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-text border border-border rounded-lg hover:bg-bg-secondary transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </Section>
    </>
  );
}

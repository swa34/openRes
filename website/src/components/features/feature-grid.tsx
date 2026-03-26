import { FEATURE_HIGHLIGHTS } from "@/lib/content";
import FeatureCard from "./feature-card";
import Section from "@/components/layout/section";

export default function FeatureGrid() {
  return (
    <Section
      title="Built for API Developers"
      subtitle="Five MCP tools that turn static documentation into interactive, searchable, testable knowledge inside ChatGPT."
      variant="alt"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURE_HIGHLIGHTS.map((feature, i) => (
          <FeatureCard
            key={feature.title}
            title={feature.title}
            description={feature.description}
            index={i}
          />
        ))}
      </div>
    </Section>
  );
}

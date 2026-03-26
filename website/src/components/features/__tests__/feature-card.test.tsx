import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FeatureCard from "../feature-card";

// Mock motion/react
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe("FeatureCard", () => {
  it("renders title", () => {
    render(<FeatureCard title="Hybrid RAG Search" description="Dense + sparse" index={0} />);
    expect(screen.getByText("Hybrid RAG Search")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<FeatureCard title="Test" description="This is a description" index={0} />);
    expect(screen.getByText("This is a description")).toBeInTheDocument();
  });

  it("renders all feature highlights", () => {
    const features = [
      { title: "Hybrid RAG Search", description: "Dense + sparse retrieval" },
      { title: "Interactive Endpoint Cards", description: "Full OpenAPI schema" },
      { title: "Live API Testing", description: "Build and execute" },
    ];

    const { container } = render(
      <>
        {features.map((f, i) => (
          <FeatureCard key={i} title={f.title} description={f.description} index={i} />
        ))}
      </>
    );

    for (const f of features) {
      expect(screen.getByText(f.title)).toBeInTheDocument();
    }
  });
});

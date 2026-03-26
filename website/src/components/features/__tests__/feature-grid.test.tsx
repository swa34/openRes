import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import FeatureGrid from "../feature-grid";

// Mock motion/react
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

function renderFeatureGrid() {
  return render(
    <MemoryRouter>
      <FeatureGrid />
    </MemoryRouter>
  );
}

describe("FeatureGrid", () => {
  it("renders the section title", () => {
    renderFeatureGrid();
    expect(screen.getByText("Built for API Developers")).toBeInTheDocument();
  });

  it("renders all 6 feature cards from content", () => {
    renderFeatureGrid();
    expect(screen.getByText("Hybrid RAG Search")).toBeInTheDocument();
    expect(screen.getByText("Interactive Endpoint Cards")).toBeInTheDocument();
    expect(screen.getByText("Live API Testing")).toBeInTheDocument();
    expect(screen.getByText("Real Eval Metrics")).toBeInTheDocument();
    expect(screen.getByText("Multi-Source Ingestion")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT Native Widget")).toBeInTheDocument();
  });

  it("renders feature descriptions", () => {
    renderFeatureGrid();
    expect(screen.getByText(/Dense \+ sparse retrieval/)).toBeInTheDocument();
    expect(screen.getByText(/Full OpenAPI schema display/)).toBeInTheDocument();
  });
});

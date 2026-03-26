import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Mock motion/react globally for this test file
vi.mock("motion/react", () => ({
  motion: {
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    tr: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

async function renderHome() {
  const { Component } = await import("../../pages/home");
  return render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>
  );
}

describe("Home page", () => {
  it("renders the hero section", async () => {
    await renderHome();
    expect(screen.getByText("API docs that work inside ChatGPT")).toBeInTheDocument();
  });

  it("renders the feature grid section", async () => {
    await renderHome();
    expect(screen.getByText("Built for API Developers")).toBeInTheDocument();
  });

  it("renders all 6 feature cards", async () => {
    await renderHome();
    expect(screen.getByText("Hybrid RAG Search")).toBeInTheDocument();
    expect(screen.getByText("Interactive Endpoint Cards")).toBeInTheDocument();
    expect(screen.getByText("Live API Testing")).toBeInTheDocument();
    expect(screen.getByText("Real Eval Metrics")).toBeInTheDocument();
    expect(screen.getByText("Multi-Source Ingestion")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT Native Widget")).toBeInTheDocument();
  });

  it("renders the architecture section", async () => {
    await renderHome();
    expect(screen.getByText("How It Works")).toBeInTheDocument();
  });

  it("renders the evaluation results section", async () => {
    await renderHome();
    expect(screen.getByText("Evaluation Results")).toBeInTheDocument();
  });

  it("renders the final CTA", async () => {
    await renderHome();
    expect(screen.getByText("Ready to try it?")).toBeInTheDocument();
  });

  it("renders eval metric values", async () => {
    await renderHome();
    expect(screen.getByText("0.66")).toBeInTheDocument();
    expect(screen.getByText("0.96")).toBeInTheDocument();
    expect(screen.getByText("0.98")).toBeInTheDocument();
    expect(screen.getByText("0.77")).toBeInTheDocument();
  });

  it("renders architecture steps", async () => {
    await renderHome();
    expect(screen.getByText("User prompt")).toBeInTheDocument();
    expect(screen.getByText("MCP tool call")).toBeInTheDocument();
    expect(screen.getByText("Hybrid retrieval")).toBeInTheDocument();
    expect(screen.getByText("Widget render")).toBeInTheDocument();
  });
});

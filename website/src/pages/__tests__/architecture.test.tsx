import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Mock motion/react
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} {...props}>{children}</button>
    ),
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    tr: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

async function renderArchitecture() {
  const { Component } = await import("../architecture");
  return render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>
  );
}

describe("Architecture page", () => {
  it("renders the Architecture title", async () => {
    await renderArchitecture();
    expect(screen.getByText("Architecture")).toBeInTheDocument();
  });

  it("renders all pipeline steps", async () => {
    await renderArchitecture();
    expect(screen.getByText("Query arrives via MCP")).toBeInTheDocument();
    expect(screen.getByText("Redis semantic cache check")).toBeInTheDocument();
    expect(screen.getByText("Hybrid retrieval from Pinecone")).toBeInTheDocument();
    expect(screen.getByText("LLM reranking (conditional)")).toBeInTheDocument();
    expect(screen.getByText("Response construction")).toBeInTheDocument();
    expect(screen.getByText("Widget rendering")).toBeInTheDocument();
  });

  it("renders the RAG Pipeline section", async () => {
    await renderArchitecture();
    expect(screen.getByText("RAG Pipeline")).toBeInTheDocument();
  });

  it("renders the Security section", async () => {
    await renderArchitecture();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("SSRF Protection")).toBeInTheDocument();
    expect(screen.getByText("API Key Handling")).toBeInTheDocument();
  });

  it("renders the Evaluation Results section with metrics", async () => {
    await renderArchitecture();
    expect(screen.getByText("0.66")).toBeInTheDocument();
    expect(screen.getByText("0.96")).toBeInTheDocument();
    expect(screen.getByText("0.98")).toBeInTheDocument();
    expect(screen.getByText("0.77")).toBeInTheDocument();
  });

  it("pipeline steps are clickable for details", async () => {
    await renderArchitecture();
    const step = screen.getByText("Query arrives via MCP").closest("button");
    expect(step).toBeTruthy();
  });
});

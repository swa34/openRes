import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Mock motion/react
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

async function renderFeatures() {
  const { Component } = await import("../features");
  return render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>
  );
}

describe("Features page", () => {
  it("renders the MCP Tools section title", async () => {
    await renderFeatures();
    expect(screen.getByText("MCP Tools")).toBeInTheDocument();
  });

  it("renders all 5 tool cards", async () => {
    await renderFeatures();
    expect(screen.getByText("Hybrid RAG Search")).toBeInTheDocument();
    expect(screen.getByText("Document Retrieval")).toBeInTheDocument();
    expect(screen.getByText("Endpoint Explorer")).toBeInTheDocument();
    expect(screen.getByText("Live API Testing")).toBeInTheDocument();
    expect(screen.getByText("Error Resolution")).toBeInTheDocument();
  });

  it("renders tool names as code elements", async () => {
    const { container } = await renderFeatures();
    // Tool names appear in <code> elements
    const codeElements = container.querySelectorAll("code.text-xs");
    const codeTexts = Array.from(codeElements).map((el) => el.textContent);
    expect(codeTexts).toContain("search");
    expect(codeTexts).toContain("fetch");
    expect(codeTexts).toContain("get_endpoint");
    expect(codeTexts).toContain("test_endpoint");
    expect(codeTexts).toContain("debug_error");
  });

  it("renders the workflow section", async () => {
    await renderFeatures();
    expect(screen.getByText("How Tools Work Together")).toBeInTheDocument();
  });
});

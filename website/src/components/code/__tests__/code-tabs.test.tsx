import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CodeTabs from "../code-tabs";

const examples = [
  { label: "JSON", language: "json", code: '{ "key": "value" }' },
  { label: "TypeScript", language: "typescript", code: "const x: number = 1;" },
  { label: "curl", language: "bash", code: "curl https://example.com" },
];

describe("CodeTabs", () => {
  it("renders all tab labels", () => {
    render(<CodeTabs examples={examples} />);
    expect(screen.getByText("JSON")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("curl")).toBeInTheDocument();
  });

  it("shows the first tab content by default", () => {
    const { container } = render(<CodeTabs examples={examples} />);
    // highlight.js splits code into spans, so check textContent
    const codeEl = container.querySelector("code");
    expect(codeEl?.textContent).toContain('"key"');
    expect(codeEl?.textContent).toContain('"value"');
  });

  it("returns null when examples array is empty", () => {
    const { container } = render(<CodeTabs examples={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

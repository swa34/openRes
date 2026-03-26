import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CodeBlock from "../code-block";

describe("CodeBlock", () => {
  it("renders the code content", () => {
    const { container } = render(<CodeBlock code='console.log("hello")' language="javascript" />);
    // highlight.js splits code into spans, so check textContent of the code element
    const codeEl = container.querySelector("code");
    expect(codeEl?.textContent).toContain('console.log("hello")');
  });

  it("renders the language label", () => {
    render(<CodeBlock code="test" language="typescript" />);
    expect(screen.getByText("typescript")).toBeInTheDocument();
  });

  it("renders a custom label when provided", () => {
    render(<CodeBlock code="test" language="json" label="Request" />);
    expect(screen.getByText("Request")).toBeInTheDocument();
  });

  it("renders a copy button", () => {
    render(<CodeBlock code="test" language="json" />);
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("shows line numbers when showLineNumbers is true", () => {
    render(
      <CodeBlock
        code={"line1\nline2\nline3"}
        language="json"
        showLineNumbers
      />
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not show line numbers by default", () => {
    const { container } = render(
      <CodeBlock code={"line1\nline2"} language="json" />
    );
    // No table should be rendered in non-line-number mode
    expect(container.querySelector("table")).toBeNull();
  });

  it("copy button calls navigator.clipboard.writeText", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<CodeBlock code="copy me" language="json" />);
    fireEvent.click(screen.getByText("Copy"));

    expect(writeTextMock).toHaveBeenCalledWith("copy me");
  });
});

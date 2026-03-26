import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Footer from "../footer";

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>
  );
}

describe("Footer", () => {
  it("renders author credit", () => {
    renderFooter();
    expect(screen.getByText("Built by Scott Allen")).toBeInTheDocument();
  });

  it("renders quick links", () => {
    renderFooter();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Architecture")).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("renders GitHub external link", () => {
    renderFooter();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("renders Privacy and Terms links", () => {
    renderFooter();
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(screen.getByText("Terms")).toBeInTheDocument();
  });

  it("renders Powered by MCP badge", () => {
    renderFooter();
    expect(screen.getByText("Powered by MCP")).toBeInTheDocument();
  });

  it("renders copyright with current year", () => {
    renderFooter();
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
  });
});

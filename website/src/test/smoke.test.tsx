import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import App from "../app";

describe("Smoke tests", () => {
  it("App component mounts without errors", () => {
    const { container } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
  });

  it("App renders with dark mode classes", () => {
    const { container } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    const root = container.firstElementChild;
    expect(root).toHaveClass("min-h-screen");
  });
});

describe("Placeholder pages export Component", () => {
  it("home page exports a Component", async () => {
    const home = await import("../pages/home");
    expect(home.Component).toBeDefined();
    expect(typeof home.Component).toBe("function");
  });

  it("features page exports a Component", async () => {
    const features = await import("../pages/features");
    expect(features.Component).toBeDefined();
    expect(typeof features.Component).toBe("function");
  });

  it("architecture page exports a Component", async () => {
    const arch = await import("../pages/architecture");
    expect(arch.Component).toBeDefined();
    expect(typeof arch.Component).toBe("function");
  });

  it("demo page exports a Component", async () => {
    const demo = await import("../pages/demo");
    expect(demo.Component).toBeDefined();
    expect(typeof demo.Component).toBe("function");
  });

  it("docs page exports a Component", async () => {
    const docs = await import("../pages/docs");
    expect(docs.Component).toBeDefined();
    expect(typeof docs.Component).toBe("function");
  });

  it("home page renders content", async () => {
    const { Component } = await import("../pages/home");
    const { container } = render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>
    );
    expect(container.textContent).toContain("API docs that work inside ChatGPT");
  });
});

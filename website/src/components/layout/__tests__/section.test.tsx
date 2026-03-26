import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Section from "../section";

describe("Section", () => {
  it("renders children", () => {
    render(<Section><p>Hello world</p></Section>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders title when provided", () => {
    render(<Section title="My Title"><div /></Section>);
    expect(screen.getByText("My Title")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<Section subtitle="My Subtitle"><div /></Section>);
    expect(screen.getByText("My Subtitle")).toBeInTheDocument();
  });

  it("renders both title and subtitle", () => {
    render(<Section title="Title" subtitle="Subtitle"><div /></Section>);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Subtitle")).toBeInTheDocument();
  });

  it("does not render header block when no title or subtitle", () => {
    const { container } = render(<Section><p>Content only</p></Section>);
    // Should not have the header div with mb-12 text-center
    expect(container.querySelector(".mb-12")).toBeNull();
  });

  it("applies alt variant class", () => {
    const { container } = render(
      <Section variant="alt"><p>Alt section</p></Section>
    );
    const section = container.querySelector("section");
    expect(section?.className).toContain("bg-bg-secondary");
  });

  it("applies default variant without alt class", () => {
    const { container } = render(
      <Section variant="default"><p>Default section</p></Section>
    );
    const section = container.querySelector("section");
    expect(section?.className).not.toContain("bg-bg-secondary");
  });

  it("passes id prop to section element", () => {
    const { container } = render(
      <Section id="test-section"><p>With ID</p></Section>
    );
    expect(container.querySelector("#test-section")).toBeTruthy();
  });

  it("passes className prop", () => {
    const { container } = render(
      <Section className="custom-class"><p>Custom</p></Section>
    );
    const section = container.querySelector("section");
    expect(section?.className).toContain("custom-class");
  });
});

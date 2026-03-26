import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Hero from "../hero";

// Mock motion/react to avoid animation issues
vi.mock("motion/react", () => ({
  motion: {
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

function renderHero() {
  return render(
    <MemoryRouter>
      <Hero />
    </MemoryRouter>
  );
}

describe("Hero", () => {
  it("renders the headline", () => {
    renderHero();
    expect(screen.getByText("API docs that work inside ChatGPT")).toBeInTheDocument();
  });

  it("renders the subheadline", () => {
    renderHero();
    expect(screen.getByText(/DocScope turns API documentation/)).toBeInTheDocument();
  });

  it("renders the primary CTA button", () => {
    renderHero();
    expect(screen.getByText("Try it in ChatGPT")).toBeInTheDocument();
  });

  it("renders the secondary CTA button", () => {
    renderHero();
    expect(screen.getByText("View on GitHub")).toBeInTheDocument();
  });

  it("secondary CTA links to GitHub", () => {
    renderHero();
    const link = screen.getByText("View on GitHub").closest("a");
    expect(link).toHaveAttribute("href", "https://github.com/swa34/openRes");
  });
});

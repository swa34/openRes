import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Header from "../header";

// Mock motion/react to avoid animation issues in tests
vi.mock("motion/react", () => ({
  motion: {
    nav: ({ children, ...props }: any) => <nav {...props}>{children}</nav>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );
}

describe("Header", () => {
  it("renders the DocScope logo", () => {
    renderHeader();
    expect(screen.getByText("DocScope")).toBeInTheDocument();
  });

  it("renders desktop navigation links", () => {
    renderHeader();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Architecture")).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("renders GitHub link with aria-label", () => {
    renderHeader();
    const githubLinks = screen.getAllByLabelText("GitHub repository");
    expect(githubLinks.length).toBeGreaterThan(0);
  });

  it("renders Try in ChatGPT CTA", () => {
    renderHeader();
    const cta = screen.getAllByText("Try in ChatGPT");
    expect(cta.length).toBeGreaterThan(0);
  });

  it("has a mobile menu toggle button", () => {
    renderHeader();
    const toggleBtn = screen.getByLabelText("Open menu");
    expect(toggleBtn).toBeInTheDocument();
  });

  it("toggles mobile menu on button click", () => {
    renderHeader();
    const toggleBtn = screen.getByLabelText("Open menu");
    fireEvent.click(toggleBtn);
    // After opening, the button label should change to "Close menu"
    expect(screen.getByLabelText("Close menu")).toBeInTheDocument();
  });

  it("closes mobile menu on second click", () => {
    renderHeader();
    const openBtn = screen.getByLabelText("Open menu");
    fireEvent.click(openBtn);
    const closeBtn = screen.getByLabelText("Close menu");
    fireEvent.click(closeBtn);
    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });
});

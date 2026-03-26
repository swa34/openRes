import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SearchDemo from "../search-demo";

// Mock motion/react
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, onClick, disabled, className, ...props }: any) => (
      <button onClick={onClick} disabled={disabled} className={className}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const originalFetch = globalThis.fetch;

function mockSearchResponse(results: any[] = []) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () =>
      Promise.resolve({
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [{ type: "text", text: "results" }],
          structuredContent: {
            type: "search",
            results,
            total: results.length,
          },
        },
      }),
  };
}

function renderSearchDemo() {
  return render(
    <MemoryRouter>
      <SearchDemo />
    </MemoryRouter>
  );
}

describe("SearchDemo", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders search input", () => {
    renderSearchDemo();
    expect(screen.getByPlaceholderText("Search API documentation...")).toBeInTheDocument();
  });

  it("renders search button", () => {
    renderSearchDemo();
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("renders API filter dropdown", () => {
    renderSearchDemo();
    expect(screen.getByText("All APIs")).toBeInTheDocument();
  });

  it("renders example queries", () => {
    renderSearchDemo();
    expect(screen.getByText("How do I create a payment intent?")).toBeInTheDocument();
    expect(screen.getByText("Send an SMS with Twilio")).toBeInTheDocument();
  });

  it("search button is disabled when input is empty", () => {
    renderSearchDemo();
    const button = screen.getByText("Search");
    expect(button).toBeDisabled();
  });

  it("search button is enabled when input has text", () => {
    renderSearchDemo();
    const input = screen.getByPlaceholderText("Search API documentation...");
    fireEvent.change(input, { target: { value: "test query" } });
    const button = screen.getByText("Search");
    expect(button).not.toBeDisabled();
  });

  it("submits search and renders results", async () => {
    const mockResults = [
      {
        id: "doc-1",
        title: "POST /v1/payment_intents",
        url: "https://docs.stripe.com/api/payment_intents",
        text: "Creates a PaymentIntent object",
        score: 0.94,
        api: "stripe",
        endpoint: "/v1/payment_intents",
      },
    ];
    (globalThis.fetch as any).mockResolvedValue(mockSearchResponse(mockResults));

    renderSearchDemo();
    const input = screen.getByPlaceholderText("Search API documentation...");
    fireEvent.change(input, { target: { value: "create payment" } });
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => {
      expect(screen.getByText("POST /v1/payment_intents")).toBeInTheDocument();
    });
  });

  it("shows error on fetch failure", async () => {
    (globalThis.fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));

    renderSearchDemo();
    const input = screen.getByPlaceholderText("Search API documentation...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => {
      expect(screen.getByText(/Unable to reach/)).toBeInTheDocument();
    });
  });

  it("no API keys in fetch request body", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockSearchResponse([]));

    renderSearchDemo();
    const input = screen.getByPlaceholderText("Search API documentation...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const call = (globalThis.fetch as any).mock.calls[0];
    const body = call[1].body;
    expect(body).not.toMatch(/sk_(test|live)_/);
    expect(body).not.toMatch(/rk_(test|live)_/);
    expect(body).not.toContain("apiKey");
  });
});

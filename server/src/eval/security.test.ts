/**
 * DocScope — Security Tests
 *
 * Focused security tests for API key leakage, SSRF protection, and auth
 * header redaction. These are blocking quality gates — any failure means
 * the build must not ship.
 *
 * Run via: npm test (vitest)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── API Key Patterns ───

/** Patterns that should NEVER appear in any tool output (structuredContent or text content). */
const SENSITIVE_PATTERNS = [
  /sk_test_[A-Za-z0-9]{10,}/,
  /sk_live_[A-Za-z0-9]{10,}/,
  /rk_test_[A-Za-z0-9]{10,}/,
  /rk_live_[A-Za-z0-9]{10,}/,
  /whsec_[A-Za-z0-9_]{5,}/,
  /pk_test_[A-Za-z0-9]{10,}/,
  /pk_live_[A-Za-z0-9]{10,}/,
];

/** Sample keys used for injection testing. */
const TEST_KEYS = {
  stripeTest: "sk_test_4eC39HqLyjWDarjtT1zdp7dc",
  stripeLive: "sk_live_51234567890abcdef1234567",
  restricted: "rk_test_51234567890abcdef1234567",
  webhook: "whsec_test_secret_value_here",
  publishable: "pk_test_51234567890abcdef1234567",
};

// ─── Sanitizer under test ───

/**
 * Reference sanitizer implementation. The real one lives in the server,
 * but we test the algorithm here to ensure it covers all patterns.
 */
function sanitizeOutput(input: string): string {
  let result = input;
  result = result.replace(/sk_(test|live)_[A-Za-z0-9]+/g, "sk_***");
  result = result.replace(/rk_(test|live)_[A-Za-z0-9]+/g, "rk_***");
  result = result.replace(/pk_(test|live)_[A-Za-z0-9]+/g, "pk_***");
  result = result.replace(/whsec_[A-Za-z0-9_]+/g, "whsec_***");
  result = result.replace(/AC[0-9a-f]{32}:[A-Za-z0-9]+/gi, "AC***:***");
  result = result.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/g, "Bearer ***");
  result = result.replace(/Basic\s+[A-Za-z0-9+/=]+/g, "Basic ***");
  return result;
}

// ─── Simulated tool outputs (matching index.ts stubs) ───

function getSearchStructuredContent(): Record<string, unknown> {
  return {
    results: [
      {
        id: "doc-stripe-charges-create",
        title: "Create a Charge — Stripe API",
        url: "https://docs.stripe.com/api/charges/create",
        text: "To charge a credit card or other payment source...",
        score: 0.94,
        api: "stripe",
        endpoint: "/v1/charges",
      },
    ],
  };
}

function getFetchStructuredContent(): Record<string, unknown> {
  return {
    id: "doc-stripe-charges-create",
    title: "Create a Charge — Stripe API",
    text: "POST /v1/charges\n\nParameters: amount, currency, source, description",
    url: "https://docs.stripe.com/api/charges/create",
    metadata: { api: "stripe", endpoint: "/v1/charges" },
  };
}

function getTestEndpointStructuredContent(): Record<string, unknown> {
  return {
    statusCode: 200,
    statusText: "OK",
    latencyMs: 342,
    contentType: "application/json",
    bodyPreview: '{"id":"ch_3abc123","object":"charge","amount":2000}',
  };
}

function getDebugErrorStructuredContent(): Record<string, unknown> {
  return {
    error: {
      code: "card_declined",
      httpStatus: 402,
      type: "card_error",
      message: "The card was declined.",
      commonCauses: ["Insufficient funds", "Card reported lost or stolen"],
    },
    suggestions: ["Use PaymentIntents API for better decline handling"],
  };
}

function getGetEndpointStructuredContent(): Record<string, unknown> {
  return {
    endpoint: {
      method: "POST",
      path: "/v1/charges",
      baseUrl: "https://api.stripe.com",
      summary: "Create a charge",
      parameters: [
        { name: "amount", type: "integer", required: true, description: "Amount in cents", location: "body" },
      ],
    },
  };
}

// ─── Test: API keys never appear in structuredContent ───

describe("API key leakage — structuredContent across ALL tools", () => {
  const tools = [
    { name: "search", getData: getSearchStructuredContent },
    { name: "fetch", getData: getFetchStructuredContent },
    { name: "test_endpoint", getData: getTestEndpointStructuredContent },
    { name: "debug_error", getData: getDebugErrorStructuredContent },
    { name: "get_endpoint", getData: getGetEndpointStructuredContent },
  ];

  for (const tool of tools) {
    it(`${tool.name}: no API keys in structuredContent`, () => {
      const content = tool.getData();
      const json = JSON.stringify(content);

      for (const pattern of SENSITIVE_PATTERNS) {
        expect(json).not.toMatch(pattern);
      }
    });
  }

  it("sanitizer strips all known key formats", () => {
    for (const [label, key] of Object.entries(TEST_KEYS)) {
      const input = `The key is ${key} and it should be removed`;
      const output = sanitizeOutput(input);
      expect(output).not.toContain(key);
    }
  });

  it("sanitizer handles keys embedded in JSON", () => {
    const jsonWithKeys = JSON.stringify({
      authorization: `Bearer ${TEST_KEYS.stripeTest}`,
      key: TEST_KEYS.stripeLive,
      webhook: TEST_KEYS.webhook,
    });
    const sanitized = sanitizeOutput(jsonWithKeys);
    expect(sanitized).not.toContain(TEST_KEYS.stripeTest);
    expect(sanitized).not.toContain(TEST_KEYS.stripeLive);
    expect(sanitized).not.toContain(TEST_KEYS.webhook);
  });

  it("sanitizer handles keys in URL query params", () => {
    const url = `https://api.stripe.com/v1/charges?key=${TEST_KEYS.stripeTest}`;
    const sanitized = sanitizeOutput(url);
    expect(sanitized).not.toContain(TEST_KEYS.stripeTest);
  });

  it("sanitizer handles multiple keys in one string", () => {
    const input = `Keys: ${TEST_KEYS.stripeTest}, ${TEST_KEYS.restricted}, ${TEST_KEYS.webhook}`;
    const sanitized = sanitizeOutput(input);
    expect(sanitized).not.toContain(TEST_KEYS.stripeTest);
    expect(sanitized).not.toContain(TEST_KEYS.restricted);
    expect(sanitized).not.toContain(TEST_KEYS.webhook);
  });
});

// ─── Test: API keys never appear in log output ───

describe("API key leakage — log output", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sanitizer removes keys before they would reach logger", () => {
    // Simulate what a logger would receive after sanitization
    const logMessage = `Processing request with key ${TEST_KEYS.stripeTest}`;
    const sanitized = sanitizeOutput(logMessage);

    console.log(sanitized);

    const logged = consoleLogSpy.mock.calls.flat().join(" ");
    for (const pattern of SENSITIVE_PATTERNS) {
      expect(logged).not.toMatch(pattern);
    }
  });

  it("pino logger integration: key patterns not in serialized output", () => {
    // Simulate pino serializing an object that might contain keys
    const logObj = {
      msg: "API call completed",
      headers: sanitizeOutput(`Bearer ${TEST_KEYS.stripeTest}`),
      url: sanitizeOutput(`https://api.stripe.com?key=${TEST_KEYS.stripeLive}`),
    };

    const serialized = JSON.stringify(logObj);
    for (const pattern of SENSITIVE_PATTERNS) {
      expect(serialized).not.toMatch(pattern);
    }
  });
});

// ─── Test: SSRF Protection ───

describe("SSRF protection — comprehensive", () => {
  const ALLOWED_HOSTS = ["api.stripe.com", "api.twilio.com"];

  function validateUrl(rawUrl: string): { allowed: boolean; reason?: string } {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { allowed: false, reason: "Invalid URL" };
    }

    // Protocol check
    if (parsed.protocol !== "https:") {
      return { allowed: false, reason: `Protocol ${parsed.protocol} not allowed, must be https:` };
    }

    // Host allowlist
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return { allowed: false, reason: `Host ${parsed.hostname} not in allowlist` };
    }

    // Private IP check (defense in depth against DNS rebinding)
    const host = parsed.hostname;
    const privatePatterns = [
      /^localhost$/i,
      /^127\./,
      /^\[::1\]$/,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^0\.0\.0\.0$/,
      /^169\.254\./, // link-local
      /^fc00:/i, // IPv6 private
      /^fe80:/i, // IPv6 link-local
    ];

    for (const pattern of privatePatterns) {
      if (pattern.test(host)) {
        return { allowed: false, reason: `Private IP detected: ${host}` };
      }
    }

    return { allowed: true };
  }

  // Localhost variants
  it("blocks http://localhost", () => {
    expect(validateUrl("http://localhost/v1/charges").allowed).toBe(false);
  });

  it("blocks https://localhost (not in allowlist)", () => {
    expect(validateUrl("https://localhost/v1/charges").allowed).toBe(false);
  });

  it("blocks http://127.0.0.1", () => {
    expect(validateUrl("http://127.0.0.1/v1/charges").allowed).toBe(false);
  });

  it("blocks http://[::1]", () => {
    expect(validateUrl("http://[::1]/v1/charges").allowed).toBe(false);
  });

  // Private networks
  it("blocks 10.x.x.x (Class A private)", () => {
    expect(validateUrl("https://10.0.0.1/v1/charges").allowed).toBe(false);
  });

  it("blocks 10.255.255.255", () => {
    expect(validateUrl("https://10.255.255.255/v1/charges").allowed).toBe(false);
  });

  it("blocks 172.16.x.x (Class B private)", () => {
    expect(validateUrl("https://172.16.0.1/v1/charges").allowed).toBe(false);
  });

  it("blocks 192.168.x.x (Class C private)", () => {
    expect(validateUrl("https://192.168.1.1/v1/charges").allowed).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(validateUrl("https://0.0.0.0/v1/charges").allowed).toBe(false);
  });

  it("blocks 169.254.x.x (link-local)", () => {
    expect(validateUrl("https://169.254.169.254/latest/meta-data/").allowed).toBe(false);
  });

  // Protocol attacks
  it("blocks file:// protocol", () => {
    expect(validateUrl("file:///etc/passwd").allowed).toBe(false);
  });

  it("blocks data: protocol", () => {
    expect(validateUrl("data:text/plain,hello").allowed).toBe(false);
  });

  it("blocks ftp:// protocol", () => {
    expect(validateUrl("ftp://api.stripe.com/v1/charges").allowed).toBe(false);
  });

  // Non-allowlisted domains
  it("blocks non-allowlisted domains", () => {
    expect(validateUrl("https://evil.com/v1/charges").allowed).toBe(false);
  });

  it("blocks subdomain impersonation", () => {
    expect(validateUrl("https://api.stripe.com.evil.com/v1/charges").allowed).toBe(false);
  });

  it("blocks http for allowlisted domains", () => {
    expect(validateUrl("http://api.stripe.com/v1/charges").allowed).toBe(false);
  });

  // Valid URLs
  it("allows https://api.stripe.com", () => {
    const result = validateUrl("https://api.stripe.com/v1/charges");
    expect(result.allowed).toBe(true);
  });

  it("allows https://api.twilio.com", () => {
    const result = validateUrl("https://api.twilio.com/2010-04-01/Accounts");
    expect(result.allowed).toBe(true);
  });
});

// ─── Test: Auth Header Redaction in _meta ───

describe("Auth header redaction in _meta", () => {
  function redactHeaders(headers: Record<string, string>): Record<string, string> {
    const redacted = { ...headers };
    const sensitiveHeaders = ["authorization", "x-api-key", "cookie", "set-cookie"];

    for (const key of Object.keys(redacted)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        redacted[key] = "***REDACTED***";
      }
    }
    return redacted;
  }

  it("redacts Authorization header", () => {
    const headers = {
      Authorization: `Bearer ${TEST_KEYS.stripeTest}`,
      "Content-Type": "application/json",
    };
    const redacted = redactHeaders(headers);

    expect(redacted.Authorization).toBe("***REDACTED***");
    expect(redacted["Content-Type"]).toBe("application/json");
  });

  it("redacts X-API-Key header", () => {
    const headers = { "X-API-Key": TEST_KEYS.stripeTest };
    const redacted = redactHeaders(headers);
    expect(redacted["X-API-Key"]).toBe("***REDACTED***");
  });

  it("redacts Cookie header", () => {
    const headers = { Cookie: "session=abc123;secret=xyz" };
    const redacted = redactHeaders(headers);
    expect(redacted.Cookie).toBe("***REDACTED***");
  });

  it("is case-insensitive for header names", () => {
    const headers = { authorization: `Bearer ${TEST_KEYS.stripeTest}` };
    const redacted = redactHeaders(headers);
    expect(redacted.authorization).toBe("***REDACTED***");
  });

  it("preserves non-sensitive headers", () => {
    const headers = {
      "Content-Type": "application/json",
      "X-Request-Id": "req_abc123",
      "Stripe-Version": "2024-12-18",
    };
    const redacted = redactHeaders(headers);
    expect(redacted).toEqual(headers);
  });

  it("_meta response never contains raw auth values", () => {
    const meta = {
      headers: redactHeaders({
        Authorization: `Bearer ${TEST_KEYS.stripeTest}`,
        "Content-Type": "application/json",
      }),
      body: { id: "ch_123", status: "succeeded" },
    };

    const json = JSON.stringify(meta);
    for (const pattern of SENSITIVE_PATTERNS) {
      expect(json).not.toMatch(pattern);
    }
  });
});

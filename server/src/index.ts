/**
 * DocScope MCP Server — RAG-powered API doc search + live API testing for ChatGPT.
 *
 * Stateless MCP server using node:http, @modelcontextprotocol/sdk,
 * and @modelcontextprotocol/ext-apps. Creates a fresh McpServer + transport
 * per request (stateless mode).
 */

import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import pino from "pino";

const log = pino({ name: "docscope:server" });

// ─── Tool imports ───

import { definition as searchDef, handler as searchHandler } from "./tools/search.js";
import { definition as fetchDef, handler as fetchHandler } from "./tools/fetch.js";
import { definition as getEndpointDef, handler as getEndpointHandler } from "./tools/get-endpoint.js";
import { definition as testEndpointDef, handler as testEndpointHandler } from "./tools/test-endpoint.js";
import { definition as debugErrorDef, handler as debugErrorHandler } from "./tools/debug-error.js";
import { setEndpointStore } from "./tools/get-endpoint.js";
import { setErrorCatalog } from "./tools/debug-error.js";
import { parseOpenApiSpec } from "./ingestion/openapi-parser.js";
import { buildErrorCatalog } from "./ingestion/error-catalog.js";
import type { ParsedEndpoint, ErrorInfo } from "./types.js";

// ─── Constants ───

const PORT = Number(process.env.PORT ?? 3000);
const MCP_PATH = "/mcp";
const WIDGET_URI = "ui://docscope/widget.html";
const WIDGET_DOMAIN = process.env.WIDGET_DOMAIN ?? "https://openres-production.up.railway.app";

// ─── Inline built widget ───

const WIDGET_JS = readFileSync(resolve(import.meta.dirname, "../../widget/dist/widget.js"), "utf8");
const WIDGET_CSS = readFileSync(resolve(import.meta.dirname, "../../widget/dist/widget.css"), "utf8");

const WIDGET_HTML = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>DocScope</title></head>
<body>
  <div id="root"></div>
  <style>${WIDGET_CSS}</style>
  <script type="module">${WIDGET_JS}</script>
</body>
</html>
`.trim();

// ─── Rate limiter (in-memory, per-IP, sliding window) ───

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // requests per window

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitMap.set(ip, entry);
  }

  // Prune expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (entry.timestamps.length >= RATE_LIMIT_MAX) return true;

  entry.timestamps.push(now);
  return false;
}

// Periodically clean up stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (entry.timestamps.length === 0) rateLimitMap.delete(ip);
  }
}, 300_000).unref();

// ─── Server factory ───

function createDocScopeServer(): McpServer {
  const server = new McpServer({
    name: "docscope",
    version: "0.1.0",
  });

  // ── Widget resource ──

  registerAppResource(
    server,
    "docscope-widget",
    WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: WIDGET_HTML,
          _meta: {
            ui: {
              prefersBorder: true,
              domain: WIDGET_DOMAIN,
              csp: {
                connectDomains: [
                  "https://api.stripe.com",
                  "https://api.twilio.com",
                  WIDGET_DOMAIN,
                ],
              },
            },
          },
        },
      ],
    })
  );

  // ── Tool 1: search (company knowledge compatible) ──

  registerAppTool(
    server,
    "search",
    {
      ...searchDef,
      _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI },
    },
    async (args) => {
      const result = await searchHandler(args);
      return { ...result, _meta: { ...result._meta, ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI } };
    }
  );

  // ── Tool 2: fetch (company knowledge compatible) ──

  registerAppTool(
    server,
    "fetch",
    {
      ...fetchDef,
      _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI },
    },
    async (args) => {
      const result = await fetchHandler(args);
      return { ...result, _meta: { ...result._meta, ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI } };
    }
  );

  // ── Tool 3: get_endpoint ──

  registerAppTool(
    server,
    "get_endpoint",
    {
      ...getEndpointDef,
      _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI },
    },
    async (args) => {
      const result = await getEndpointHandler(args);
      return { ...result, _meta: { ...result._meta, ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI } };
    }
  );

  // ── Tool 4: test_endpoint ──

  registerAppTool(
    server,
    "test_endpoint",
    {
      ...testEndpointDef,
      _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI },
    },
    async (args) => {
      const result = await testEndpointHandler(args);
      return { ...result, _meta: { ...result._meta, ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI } };
    }
  );

  // ── Tool 5: debug_error ──

  registerAppTool(
    server,
    "debug_error",
    {
      ...debugErrorDef,
      _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI },
    },
    async (args) => {
      const result = await debugErrorHandler(args);
      return { ...result, _meta: { ...result._meta, ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI } };
    }
  );

  return server;
}

// ─── HTTP server ───

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  // CORS preflight
  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  // Request tracing — attach a unique trace ID to every request
  const traceId = randomUUID().slice(0, 8);
  res.setHeader("X-Trace-Id", traceId);
  const startMs = Date.now();

  // Health check
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end("DocScope MCP server");
    return;
  }

  // Privacy policy (served as HTML from PRIVACY.md)
  if (req.method === "GET" && url.pathname === "/privacy") {
    const privacyMd = readFileSync(resolve(import.meta.dirname, "../../PRIVACY.md"), "utf8");
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DocScope Privacy Policy</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1a1a1a}h1,h2,h3{margin-top:2rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}a{color:#0066cc}hr{border:none;border-top:1px solid #eee;margin:2rem 0}</style></head><body>${privacyMd
      .replace(/^# (.+)$/m, "<h1>$1</h1>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/^---$/gm, "<hr>")
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/\|(.+)\|/gm, (match) => {
        const cells = match.split("|").filter(Boolean).map((c) => c.trim());
        return "<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>";
      })
    }</body></html>`;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
    return;
  }

  // Rate limiting (applied to /mcp only)
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? "unknown";

  // MCP endpoint
  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    if (isRateLimited(clientIp)) {
      log.warn({ traceId, clientIp }, "Rate limited");
      res.writeHead(429, { "Retry-After": "60" }).end("Too many requests");
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, X-Trace-Id");

    const server = createDocScopeServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true,
    });

    res.on("close", () => {
      const durationMs = Date.now() - startMs;
      log.info({ traceId, method: req.method, durationMs }, "Request completed");
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      const durationMs = Date.now() - startMs;
      log.error({ traceId, error, durationMs }, "Error handling MCP request");
      if (!res.headersSent) {
        res.writeHead(500).end(JSON.stringify({ error: "Internal server error" }));
      }
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404).end("Not Found");
});

// ─── Startup: parse specs into memory (no embedding, no API calls) ───

async function loadEndpointData() {
  const sources = [
    { file: resolve(import.meta.dirname, "../../docs-seed/stripe-openapi.yaml"), api: "stripe", baseUrl: "https://api.stripe.com" },
    { file: resolve(import.meta.dirname, "../../docs-seed/twilio-api-v2010.json"), api: "twilio", baseUrl: "https://api.twilio.com" },
  ];

  const mergedEndpoints = new Map<string, ParsedEndpoint>();
  const mergedErrors = new Map<string, ErrorInfo>();

  for (const src of sources) {
    try {
      const endpoints = await parseOpenApiSpec(src.file, src.api, src.baseUrl);
      for (const ep of endpoints) {
        mergedEndpoints.set(`${src.api}:${ep.method.toUpperCase()}:${ep.path}`, ep);
      }

      const errorCatalog = buildErrorCatalog(endpoints);
      for (const [key, val] of errorCatalog) {
        mergedErrors.set(key, val);
      }

      console.log(`Loaded ${endpoints.length} endpoints for ${src.api}`);
    } catch (err) {
      console.warn(`Failed to load ${src.api} (server still works, search queries Pinecone directly):`, err);
    }
  }

  setEndpointStore(mergedEndpoints);
  setErrorCatalog(mergedErrors);
}

loadEndpointData().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`DocScope MCP server listening on http://localhost:${PORT}${MCP_PATH}`);
  });
});

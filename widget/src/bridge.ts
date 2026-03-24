/**
 * MCP Apps bridge — JSON-RPC 2.0 over postMessage.
 *
 * This module implements the standard MCP Apps UI bridge for communicating
 * with the ChatGPT host from inside the iframe widget.
 *
 * Protocol: https://modelcontextprotocol.io/docs/extensions/apps
 * ChatGPT guide: https://developers.openai.com/apps-sdk/build/chatgpt-ui/
 */

import type { ToolResult } from "./types";

// ─── ChatGPT window.openai type shim ───

declare global {
  interface Window {
    openai?: {
      toolInput?: Record<string, unknown>;
      toolOutput?: Record<string, unknown>;
      callTool?: (name: string, args: Record<string, unknown>) => Promise<{ structuredContent?: unknown }>;
      sendFollowUpMessage?: (text: string) => void;
      setWidgetState?: (state: unknown) => void;
    };
  }
}

// ─── Internal state ───

let rpcId = 0;
const pendingRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: unknown) => void }
>();

type ToolResultHandler = (result: ToolResult) => void;
const toolResultHandlers: Set<ToolResultHandler> = new Set();

let bridgeReadyPromise: Promise<void> | null = null;

// ─── Low-level JSON-RPC helpers ───

function rpcNotify(method: string, params: Record<string, unknown> = {}): void {
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
}

function rpcRequest(
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pendingRequests.set(id, { resolve, reject });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });
}

// ─── Message listener (singleton) ───

function handleMessage(event: MessageEvent): void {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (!message || message.jsonrpc !== "2.0") return;

  // JSON-RPC response (has numeric id)
  if (typeof message.id === "number") {
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(message.error);
    } else {
      pending.resolve(message.result);
    }
    return;
  }

  // JSON-RPC notification (has method, no id)
  if (typeof message.method === "string") {
    if (
      message.method === "ui/notifications/tool-result" &&
      message.params
    ) {
      const result = message.params as ToolResult;
      toolResultHandlers.forEach((handler) => handler(result));
    }
  }
}

window.addEventListener("message", handleMessage, { passive: true });

// ─── ChatGPT window.openai fallback ───
// ChatGPT delivers tool results via window.openai.toolOutput and fires
// "openai:set_globals" events. Listen for both to ensure the widget renders.

function emitOpenaiToolOutput(data: Record<string, unknown> | undefined) {
  if (!data) return;
  const result: ToolResult = {
    toolName: (data.toolName as string) ?? "unknown",
    structuredContent: data.structuredContent ?? data,
    content: (data.content as ToolResult["content"]) ?? [],
    _meta: (data._meta as Record<string, unknown>) ?? {},
  };
  toolResultHandlers.forEach((handler) => handler(result));
}

// Check initial toolOutput on load
if (window.openai?.toolOutput) {
  setTimeout(() => emitOpenaiToolOutput(window.openai?.toolOutput), 0);
}

// Listen for subsequent updates
window.addEventListener(
  "openai:set_globals" as string,
  ((event: CustomEvent) => {
    const globals = event.detail?.globals;
    emitOpenaiToolOutput(globals?.toolOutput ?? window.openai?.toolOutput);
  }) as EventListener,
  { passive: true }
);

// ─── Public API ───

/**
 * Initialize the MCP Apps bridge.
 * Sends `ui/initialize`, waits for the host response, then sends
 * `ui/notifications/initialized` to confirm readiness.
 *
 * Call this once on mount. Subsequent calls return the same promise.
 */
export function initializeBridge(): Promise<void> {
  if (bridgeReadyPromise) return bridgeReadyPromise;

  bridgeReadyPromise = (async () => {
    const appInfo = { name: "docscope-widget", version: "0.1.0" };
    const appCapabilities = {};
    const protocolVersion = "2026-01-26";

    try {
      await rpcRequest("ui/initialize", {
        appInfo,
        appCapabilities,
        protocolVersion,
      });
      rpcNotify("ui/notifications/initialized", {});
    } catch (error) {
      // Reset so caller can retry
      bridgeReadyPromise = null;
      console.error("Failed to initialize MCP Apps bridge:", error);
      throw error;
    }
  })();

  return bridgeReadyPromise;
}

/**
 * Call a tool on the MCP server via the host bridge.
 * Waits for bridge initialization before sending.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  // Use MCP Apps bridge (standard, portable) — NOT window.openai.callTool
  await initializeBridge();
  const response = await rpcRequest("tools/call", {
    name,
    arguments: args,
  }) as Record<string, unknown> | null;

  return {
    toolName: name,
    structuredContent: response?.structuredContent ?? response,
    content: (response?.content as ToolResult["content"]) ?? [],
    _meta: (response?._meta as Record<string, unknown>) ?? {},
  };
}

/**
 * Register a handler for incoming tool results pushed by the host.
 * Returns an unsubscribe function.
 */
export function onToolResult(handler: ToolResultHandler): () => void {
  toolResultHandlers.add(handler);
  return () => {
    toolResultHandlers.delete(handler);
  };
}

/**
 * Send a follow-up message to the conversation via the host.
 */
export function sendMessage(text: string): void {
  rpcNotify("ui/message", {
    role: "user",
    content: [{ type: "text", text }],
  });
}

/**
 * Update model-visible context so the model can see current widget state.
 */
export async function updateModelContext(text: string): Promise<void> {
  await initializeBridge();
  await rpcRequest("ui/update-model-context", {
    content: [{ type: "text", text }],
  });
}

import { useEffect, useState, useCallback } from "react";
import { initializeBridge, onToolResult, callTool } from "./bridge";
import type {
  ActiveView,
  ToolResult,
  SearchResult,
  EndpointSchema,
  TestEndpointSummary,
  TestEndpointFull,
  ErrorInfo,
} from "./types";
import SearchResults from "./components/SearchResults";
import EndpointCard from "./components/EndpointCard";
import RequestBuilder from "./components/RequestBuilder";
import ResponseViewer from "./components/ResponseViewer";
import ErrorCard from "./components/ErrorCard";

export default function App() {
  const [view, setView] = useState<ActiveView>({ type: "idle" });
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  // Infer tool name from data shape when not provided (e.g. window.openai.toolOutput)
  function inferToolName(data: Record<string, unknown>): string {
    if (Array.isArray(data.results) || Array.isArray(data.items)) return "search";
    if (data.method && data.path && data.parameters) return "get_endpoint";
    if (data.summary && typeof (data.summary as Record<string, unknown>).statusCode === "number") return "test_endpoint";
    if (data.statusCode !== undefined && data.latencyMs !== undefined) return "test_endpoint";
    if (data.error && (data.error as Record<string, unknown>).code) return "debug_error";
    return "unknown";
  }

  // Route incoming tool results to the correct view
  const handleToolResult = useCallback((result: ToolResult) => {
    const data = result.structuredContent as Record<string, unknown>;
    if (!data) return;

    const toolName = result.toolName && result.toolName !== "unknown"
      ? result.toolName
      : inferToolName(data);

    switch (toolName) {
      case "search":
      case "search_docs":
      case "fetch": {
        const results = (data.results ?? data.items ?? []) as SearchResult[];
        setView({ type: "search", results });
        break;
      }

      case "get_endpoint": {
        // Server returns { endpoint: { method, path, ... } } in structuredContent
        const endpoint = ((data.endpoint as Record<string, unknown>) ?? data) as unknown as EndpointSchema;
        setView({ type: "endpoint", endpoint });
        break;
      }

      case "test_endpoint": {
        const summary = (data.summary ?? data) as TestEndpointSummary;
        const full = (data.full ?? {
          headers: {},
          body: data.body ?? null,
          rawBody: "",
        }) as TestEndpointFull;
        setView({ type: "response", summary, full });
        break;
      }

      case "debug_error": {
        const error = (data.error ?? data) as ErrorInfo;
        const suggestions = (data.suggestions ?? []) as string[];
        setView({ type: "error", error, suggestions });
        break;
      }

      default:
        // Unknown tool — try to render as search or endpoint based on shape
        if (Array.isArray(data.results)) {
          setView({
            type: "search",
            results: data.results as SearchResult[],
          });
        }
        break;
    }
  }, []);

  // Initialize bridge and listen for tool results
  useEffect(() => {
    initializeBridge().catch((err) => {
      console.error("Bridge init failed:", err);
      setBridgeError("Failed to connect to ChatGPT host.");
    });

    const unsub = onToolResult(handleToolResult);
    return unsub;
  }, [handleToolResult]);

  // Action: select an endpoint from search results
  const handleSelectEndpoint = useCallback(async (endpoint: string, api = "stripe") => {
    setView({ type: "loading", message: "Loading endpoint..." });
    try {
      // Parse "METHOD /path" format if present
      let method: string | undefined;
      let path = endpoint;
      const match = endpoint.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(.+)$/i);
      if (match) {
        method = match[1].toUpperCase();
        path = match[2];
      }

      const args: Record<string, unknown> = { api, path };
      if (method) args.method = method;

      const result = await callTool("get_endpoint", args);
      handleToolResult({
        toolName: "get_endpoint",
        structuredContent: result.structuredContent ?? result,
        content: result.content ?? [],
        _meta: result._meta ?? {},
      });
    } catch (err) {
      console.error("get_endpoint callTool failed:", err);
      setView({
        type: "tool-error",
        message: `Failed to load endpoint: ${err instanceof Error ? err.message : "Unknown error"}`,
        retryAction: () => handleSelectEndpoint(endpoint, api),
      });
    }
  }, [handleToolResult]);

  // Action: open request builder from endpoint card
  const handleTryIt = useCallback((endpoint: EndpointSchema) => {
    setView({ type: "request-builder", endpoint });
  }, []);

  // Action: send test request
  const handleSendRequest = useCallback(
    async (args: Record<string, unknown>) => {
      setView({ type: "loading", message: "Sending request..." });
      try {
        const result = await callTool("test_endpoint", args);
        handleToolResult({
          toolName: "test_endpoint",
          structuredContent: result.structuredContent ?? result,
          content: result.content ?? [],
          _meta: result._meta ?? {},
        });
      } catch (err) {
        console.error("test_endpoint callTool failed:", err);
        setView({
          type: "tool-error",
          message: `Request failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          retryAction: () => handleSendRequest(args),
        });
      }
    },
    [handleToolResult]
  );

  // Action: debug an error
  const handleDebugError = useCallback(
    async (statusCode: number, body: string) => {
      setView({ type: "loading", message: "Analyzing error..." });
      try {
        const result = await callTool("debug_error", { statusCode, body });
        handleToolResult({
          toolName: "debug_error",
          structuredContent: result.structuredContent ?? result,
          content: result.content ?? [],
          _meta: result._meta ?? {},
        });
      } catch (err) {
        console.error("debug_error callTool failed:", err);
        setView({
          type: "tool-error",
          message: `Error analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          retryAction: () => handleDebugError(statusCode, body),
        });
      }
    },
    [handleToolResult]
  );

  // ─── Render ───

  if (bridgeError) {
    return (
      <div className="ds-idle">
        <div className="ds-idle-title">Connection Error</div>
        <div className="ds-idle-text">{bridgeError}</div>
      </div>
    );
  }

  switch (view.type) {
    case "idle":
      return (
        <div className="ds-idle">
          <div className="ds-idle-icon">&#128269;</div>
          <div className="ds-idle-title">DocScope</div>
          <div className="ds-idle-text">
            Ask ChatGPT to search API docs, look up an endpoint, or debug an
            error.
          </div>
        </div>
      );

    case "loading":
      return (
        <div className="ds-loading">
          <div className="ds-spinner" />
          <span>{view.message}</span>
        </div>
      );

    case "search":
      return (
        <SearchResults
          results={view.results}
          onSelectEndpoint={handleSelectEndpoint}
        />
      );

    case "endpoint":
      return <EndpointCard endpoint={view.endpoint} onTryIt={handleTryIt} />;

    case "request-builder":
      return (
        <RequestBuilder
          endpoint={view.endpoint}
          onSend={handleSendRequest}
          onBack={() => setView({ type: "endpoint", endpoint: view.endpoint })}
          loading={false}
        />
      );

    case "response":
      return (
        <ResponseViewer
          summary={view.summary}
          full={view.full}
          onDebugError={handleDebugError}
        />
      );

    case "error":
      return (
        <ErrorCard
          error={view.error}
          suggestions={view.suggestions}
          onSelectEndpoint={handleSelectEndpoint}
        />
      );

    case "tool-error":
      return (
        <div className="ds-tool-error">
          <div className="ds-tool-error-icon">!</div>
          <div className="ds-tool-error-message">{view.message}</div>
          <div className="ds-tool-error-actions">
            {view.retryAction && (
              <button
                className="ds-btn ds-btn-primary ds-btn-sm"
                onClick={view.retryAction}
                type="button"
              >
                Retry
              </button>
            )}
            <button
              className="ds-btn ds-btn-sm"
              onClick={() => setView({ type: "idle" })}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
      );

    default:
      return null;
  }
}

import { useState } from "react";
import clsx from "clsx";
import type { TestEndpointSummary, TestEndpointFull } from "../types";
import CodeBlock from "./CodeBlock";
import Collapsible from "./Collapsible";

interface ResponseViewerProps {
  summary: TestEndpointSummary;
  full: TestEndpointFull;
  onDebugError: (statusCode: number, body: string) => void;
}

function statusBadgeClass(code: number): string {
  if (code >= 200 && code < 300) return "ds-badge-2xx";
  if (code >= 300 && code < 400) return "ds-badge-3xx";
  if (code >= 400 && code < 500) return "ds-badge-4xx";
  return "ds-badge-5xx";
}

export default function ResponseViewer({
  summary,
  full,
  onDebugError,
}: ResponseViewerProps) {
  const [responseCopied, setResponseCopied] = useState(false);

  const isError = summary.statusCode >= 400;
  const bodyStr =
    typeof full.body === "string"
      ? full.body
      : JSON.stringify(full.body, null, 2);

  const handleCopyResponse = async () => {
    try {
      await navigator.clipboard.writeText(bodyStr);
      setResponseCopied(true);
      setTimeout(() => setResponseCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = bodyStr;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setResponseCopied(true);
      setTimeout(() => setResponseCopied(false), 1500);
    }
  };

  return (
    <div className="ds-card">
      {/* Header */}
      <div className="ds-response-header">
        <span className={clsx("ds-badge", statusBadgeClass(summary.statusCode))}>
          {summary.statusCode} {summary.statusText}
        </span>
        <span className="ds-latency">{summary.latencyMs}ms</span>
        <span
          style={{
            fontSize: 11,
            color: "var(--ds-text-muted)",
            marginLeft: "auto",
          }}
        >
          {summary.contentType}
        </span>
        <button
          className="ds-btn ds-btn-sm"
          onClick={handleCopyResponse}
          type="button"
          title="Copy response body"
        >
          {responseCopied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Response headers */}
      {Object.keys(full.headers).length > 0 && (
        <Collapsible title="Response Headers">
          <table className="ds-table">
            <tbody>
              {Object.entries(full.headers).map(([key, value]) => (
                <tr key={key}>
                  <td>
                    <code className="ds-mono" style={{ fontSize: 11 }}>
                      {key}
                    </code>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--ds-text-secondary)" }}>
                    {value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Collapsible>
      )}

      <hr className="ds-divider" />

      {/* Response body */}
      <CodeBlock
        code={bodyStr}
        language={summary.contentType.includes("json") ? "json" : "bash"}
        label="Response Body"
      />

      {/* Debug error link */}
      {isError && (
        <div style={{ marginTop: 12 }}>
          <button
            className="ds-btn ds-btn-sm"
            onClick={() =>
              onDebugError(summary.statusCode, summary.bodyPreview)
            }
            type="button"
            style={{ color: "var(--ds-red)" }}
          >
            Debug this error
          </button>
        </div>
      )}
    </div>
  );
}

import clsx from "clsx";
import type { ErrorInfo } from "../types";

interface ErrorCardProps {
  error: ErrorInfo;
  suggestions: string[];
  onSelectEndpoint: (endpoint: string) => void;
}

function statusBadgeClass(code: number): string {
  if (code >= 200 && code < 300) return "ds-badge-2xx";
  if (code >= 300 && code < 400) return "ds-badge-3xx";
  if (code >= 400 && code < 500) return "ds-badge-4xx";
  return "ds-badge-5xx";
}

export default function ErrorCard({
  error,
  suggestions,
  onSelectEndpoint,
}: ErrorCardProps) {
  return (
    <div className="ds-card">
      {/* Header */}
      <div className="ds-error-header">
        <span className={clsx("ds-badge", statusBadgeClass(error.httpStatus))}>
          {error.httpStatus}
        </span>
        <code className="ds-mono" style={{ fontSize: 14, fontWeight: 600 }}>
          {error.code}
        </code>
        {error.type && (
          <span
            style={{
              fontSize: 11,
              color: "var(--ds-text-muted)",
              marginLeft: "auto",
            }}
          >
            {error.type}
          </span>
        )}
      </div>

      {/* Description */}
      <div className="ds-error-description">{error.message}</div>

      <hr className="ds-divider" />

      {/* Common causes */}
      {error.commonCauses.length > 0 && (
        <div className="ds-error-section">
          <h4>Common Causes</h4>
          <ul>
            {error.commonCauses.map((cause, i) => (
              <li key={i}>{cause}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Resolution steps */}
      {error.resolution.length > 0 && (
        <div className="ds-error-section">
          <h4>Resolution Steps</h4>
          <ol>
            {error.resolution.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="ds-error-section">
          <h4>Suggestions</h4>
          <ul>
            {suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Related endpoints */}
      {error.relatedEndpoints.length > 0 && (
        <div className="ds-error-section">
          <h4>Related Endpoints</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {error.relatedEndpoints.map((ep) => (
              <span
                key={ep}
                className="ds-related-link"
                onClick={() => onSelectEndpoint(ep)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelectEndpoint(ep);
                }}
              >
                {ep}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

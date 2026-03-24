import clsx from "clsx";
import type { EndpointSchema } from "../types";
import CodeBlock from "./CodeBlock";
import Collapsible from "./Collapsible";

interface EndpointCardProps {
  endpoint: EndpointSchema;
  onTryIt: (endpoint: EndpointSchema) => void;
}

const METHOD_BADGE: Record<string, string> = {
  GET: "ds-badge-get",
  POST: "ds-badge-post",
  PUT: "ds-badge-put",
  PATCH: "ds-badge-patch",
  DELETE: "ds-badge-delete",
};

export default function EndpointCard({ endpoint, onTryIt }: EndpointCardProps) {
  const method = (endpoint.method ?? "GET").toUpperCase();
  const badgeClass = METHOD_BADGE[method] || "ds-badge-post";

  const params = endpoint.parameters ?? [];
  const pathParams = params.filter((p) => p.location === "path");
  const queryParams = params.filter((p) => p.location === "query");
  const headerParams = params.filter((p) => p.location === "header");
  const allParams = [...pathParams, ...queryParams, ...headerParams];
  const examples = endpoint.examples ?? [];

  return (
    <div className="ds-card">
      {/* Header */}
      <div className="ds-endpoint-header">
        <span className={clsx("ds-badge", badgeClass)}>{method}</span>
        <span className="ds-path">{endpoint.path}</span>
      </div>

      {/* Summary */}
      {endpoint.summary && (
        <div className="ds-endpoint-summary">{endpoint.summary}</div>
      )}

      {/* Description */}
      {endpoint.description && endpoint.description !== endpoint.summary && (
        <p style={{ fontSize: 13, color: "var(--ds-text-secondary)", margin: "0 0 12px" }}>
          {endpoint.description}
        </p>
      )}

      {/* Parameters table */}
      {allParams.length > 0 && (
        <div className="ds-endpoint-section">
          <Collapsible title={`Parameters (${allParams.length})`} defaultOpen>
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>In</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {allParams.map((param) => (
                  <tr key={`${param.location}-${param.name}`}>
                    <td>
                      <code className="ds-mono" style={{ fontSize: 12 }}>
                        {param.name}
                      </code>
                      {param.required && (
                        <span className="ds-required"> *</span>
                      )}
                    </td>
                    <td style={{ color: "var(--ds-text-muted)", fontSize: 12 }}>
                      {param.type}
                    </td>
                    <td style={{ color: "var(--ds-text-muted)", fontSize: 12 }}>
                      {param.location}
                    </td>
                    <td style={{ fontSize: 12 }}>{param.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Collapsible>
        </div>
      )}

      {/* Request body */}
      {endpoint.requestBody && (
        <div className="ds-endpoint-section">
          <Collapsible title="Request Body">
            <CodeBlock
              code={JSON.stringify(endpoint.requestBody, null, 2)}
              language="json"
              label="Request Body Schema"
            />
          </Collapsible>
        </div>
      )}

      {/* Response schema */}
      {endpoint.responseSchema && (
        <div className="ds-endpoint-section">
          <Collapsible title="Response Schema">
            <CodeBlock
              code={JSON.stringify(endpoint.responseSchema, null, 2)}
              language="json"
              label="Response Schema"
            />
          </Collapsible>
        </div>
      )}

      {/* Code examples */}
      {examples.length > 0 && (
        <div className="ds-endpoint-section">
          <Collapsible title={`Examples (${examples.length})`}>
            {examples.map((example, i) => (
              <CodeBlock
                key={i}
                code={example.code}
                language={example.language}
                label={example.label}
              />
            ))}
          </Collapsible>
        </div>
      )}

      {/* Actions */}
      <div className="ds-endpoint-actions">
        <button
          className="ds-btn ds-btn-primary"
          onClick={() => onTryIt(endpoint)}
          type="button"
        >
          Try it
        </button>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";
import type { EndpointDetail } from "@/lib/mcp-client";
import CodeBlock from "@/components/code/code-block";

interface EndpointPreviewProps {
  endpoint: EndpointDetail;
  onClose: () => void;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue text-white",
  POST: "bg-green text-white",
  PUT: "bg-orange text-white",
  PATCH: "bg-yellow text-white",
  DELETE: "bg-red text-white",
};

export default function EndpointPreview({ endpoint, onClose }: EndpointPreviewProps) {
  const method = (endpoint.method ?? "GET").toUpperCase();
  const params = endpoint.parameters ?? [];

  return (
    <div className="rounded-xl border border-border bg-bg dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-bg-secondary dark:bg-gray-800/50">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-text-muted hover:text-text transition-colors"
        >
          Back
        </button>
        <span
          className={cn(
            "px-2 py-0.5 rounded text-xs font-bold uppercase",
            METHOD_COLORS[method] ?? "bg-gray-500 text-white",
          )}
        >
          {method}
        </span>
        <span className="font-mono text-sm text-text">{endpoint.path}</span>
      </div>

      <div className="p-5 space-y-5">
        {/* Summary */}
        {endpoint.summary && (
          <p className="text-sm text-text-secondary">{endpoint.summary}</p>
        )}

        {/* Description */}
        {endpoint.description && endpoint.description !== endpoint.summary && (
          <p className="text-sm text-text-muted">{endpoint.description}</p>
        )}

        {/* Parameters */}
        {params.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              Parameters ({params.length})
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-medium text-text-muted text-xs">Name</th>
                    <th className="pb-2 pr-4 font-medium text-text-muted text-xs">Type</th>
                    <th className="pb-2 pr-4 font-medium text-text-muted text-xs">In</th>
                    <th className="pb-2 font-medium text-text-muted text-xs">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {params.map((param) => (
                    <tr key={`${param.in}-${param.name}`} className="border-b border-border/50">
                      <td className="py-2 pr-4">
                        <code className="font-mono text-xs text-text">{param.name}</code>
                        {param.required && (
                          <span className="ml-1 text-red text-xs">*</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs text-text-muted">{param.type}</td>
                      <td className="py-2 pr-4 text-xs text-text-muted">{param.in}</td>
                      <td className="py-2 text-xs text-text-secondary">{param.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Responses */}
        {endpoint.responses && endpoint.responses.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              Responses
            </h4>
            <div className="space-y-1">
              {endpoint.responses.map((resp) => (
                <div key={resp.status} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded font-mono font-bold",
                      resp.status >= 200 && resp.status < 300 ? "bg-green-light text-green" :
                      resp.status >= 400 ? "bg-red-light text-red" :
                      "bg-bg-secondary text-text-muted",
                    )}
                  >
                    {resp.status}
                  </span>
                  <span className="text-text-secondary">{resp.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

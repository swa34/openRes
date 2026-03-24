import { useState, useMemo, useCallback } from "react";
import type { EndpointSchema } from "../types";

interface RequestBuilderProps {
  endpoint: EndpointSchema;
  onSend: (args: Record<string, unknown>) => void;
  onBack: () => void;
  loading: boolean;
}

export default function RequestBuilder({
  endpoint,
  onSend,
  onBack,
  loading,
}: RequestBuilderProps) {
  const method = (endpoint.method ?? "GET").toUpperCase();

  const params = endpoint.parameters ?? [];
  const pathParams = params.filter((p) => p.location === "path");
  const queryParams = params.filter((p) => p.location === "query");
  const headerParams = params.filter((p) => p.location === "header");

  // Build initial form values
  const initialValues = useMemo(() => {
    const vals: Record<string, string> = {};
    [...pathParams, ...queryParams, ...headerParams].forEach((p) => {
      vals[`${p.location}:${p.name}`] = "";
    });
    return vals;
  }, [pathParams, queryParams, headerParams]);

  const [values, setValues] = useState(initialValues);
  const [apiKey, setApiKey] = useState("");
  const [body, setBody] = useState(
    endpoint.requestBody ? JSON.stringify(endpoint.requestBody, null, 2) : ""
  );
  const [curlCopied, setCurlCopied] = useState(false);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    const pathValues: Record<string, string> = {};
    const queryValues: Record<string, string> = {};
    const headerValues: Record<string, string> = {};

    Object.entries(values).forEach(([key, val]) => {
      if (!val) return;
      const [loc, name] = key.split(":");
      if (loc === "path") pathValues[name] = val;
      else if (loc === "query") queryValues[name] = val;
      else if (loc === "header") headerValues[name] = val;
    });

    let parsedBody: unknown = undefined;
    if (body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = body;
      }
    }

    const args: Record<string, unknown> = {
      method,
      path: endpoint.path,
      baseUrl: endpoint.baseUrl,
      pathParams: pathValues,
      queryParams: queryValues,
      headers: headerValues,
      body: parsedBody,
    };

    if (apiKey) {
      args.apiKey = apiKey;
    }

    onSend(args);
  };

  const buildCurl = useCallback((): string => {
    // Build the URL with path params substituted
    let url = endpoint.path;
    const queryParts: string[] = [];
    const headerParts: string[] = [];

    Object.entries(values).forEach(([key, val]) => {
      if (!val) return;
      const [loc, name] = key.split(":");
      if (loc === "path") {
        url = url.replace(`{${name}}`, encodeURIComponent(val));
      } else if (loc === "query") {
        queryParts.push(`${encodeURIComponent(name)}=${encodeURIComponent(val)}`);
      } else if (loc === "header") {
        headerParts.push(`-H '${name}: ${val}'`);
      }
    });

    const baseUrl = endpoint.baseUrl || "https://api.example.com";
    let fullUrl = `${baseUrl}${url}`;
    if (queryParts.length > 0) {
      fullUrl += `?${queryParts.join("&")}`;
    }

    const parts = [`curl -X ${method} '${fullUrl}'`];

    if (apiKey) {
      parts.push(`-H 'Authorization: Bearer ${apiKey}'`);
    }

    headerParts.forEach((h) => parts.push(h));

    if (body.trim()) {
      parts.push("-H 'Content-Type: application/json'");
      parts.push(`-d '${body.replace(/\n\s*/g, " ").trim()}'`);
    }

    return parts.join(" \\\n  ");
  }, [endpoint, method, values, apiKey, body]);

  const handleCopyCurl = async () => {
    const curl = buildCurl();
    try {
      await navigator.clipboard.writeText(curl);
      setCurlCopied(true);
      setTimeout(() => setCurlCopied(false), 1500);
    } catch {
      // Fallback: select text from a temporary textarea
      const ta = document.createElement("textarea");
      ta.value = curl;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCurlCopied(true);
      setTimeout(() => setCurlCopied(false), 1500);
    }
  };

  const renderParamGroup = (
    title: string,
    params: typeof pathParams,
    location: string
  ) => {
    if (params.length === 0) return null;
    return (
      <div className="ds-form-group">
        <label className="ds-label">{title}</label>
        {params.map((param) => {
          const key = `${location}:${param.name}`;
          return (
            <div key={key} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <code className="ds-mono" style={{ fontSize: 12 }}>
                  {param.name}
                </code>
                <span
                  style={{ fontSize: 10, color: "var(--ds-text-muted)" }}
                >
                  {param.type}
                </span>
                {param.required && (
                  <span className="ds-required">required</span>
                )}
              </div>
              <input
                className="ds-input"
                value={values[key] || ""}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={param.description || param.name}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="ds-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button className="ds-btn ds-btn-sm" onClick={onBack} type="button">
          Back
        </button>
        <span className="ds-badge ds-badge-post" style={{ textTransform: "uppercase" }}>
          {method}
        </span>
        <span className="ds-path">{endpoint.path}</span>
      </div>

      <hr className="ds-divider" />

      {/* API Key */}
      <div className="ds-form-group">
        <label className="ds-label">API Key</label>
        <input
          className="ds-input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-... (session only, not stored)"
        />
      </div>

      {/* Path params */}
      {renderParamGroup("Path Parameters", pathParams, "path")}

      {/* Query params */}
      {renderParamGroup("Query Parameters", queryParams, "query")}

      {/* Header params */}
      {renderParamGroup("Headers", headerParams, "header")}

      {/* Request body */}
      {endpoint.requestBody && (
        <div className="ds-form-group">
          <label className="ds-label">Request Body (JSON)</label>
          <textarea
            className="ds-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
          />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="ds-btn ds-btn-primary"
          onClick={handleSubmit}
          disabled={loading}
          type="button"
          style={{ flex: 1 }}
        >
          {loading ? "Sending..." : "Send Request"}
        </button>
        <button
          className="ds-btn"
          onClick={handleCopyCurl}
          type="button"
          title="Copy as cURL"
        >
          {curlCopied ? "Copied" : "cURL"}
        </button>
      </div>
    </div>
  );
}

import { useState, useMemo } from "react";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";

hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);

interface CodeBlockProps {
  code: string;
  language: string;
  label?: string;
  showLineNumbers?: boolean;
}

export default function CodeBlock({
  code,
  language,
  label,
  showLineNumbers = false,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const highlightedHtml = useMemo(() => {
    try {
      return hljs.highlight(code, { language }).value;
    } catch {
      // Language not registered — return escaped HTML
      return code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }, [code, language]);

  const lines = highlightedHtml.split("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-tertiary dark:bg-gray-800">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          {label || language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs text-text-muted hover:text-text transition-colors px-2 py-0.5 rounded"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Code */}
      <div className="relative overflow-x-auto bg-bg-secondary dark:bg-gray-950">
        {showLineNumbers ? (
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className="px-3 py-0 text-right text-xs text-text-muted select-none font-mono leading-6 w-8">
                    {i + 1}
                  </td>
                  <td className="px-3 py-0">
                    <pre className="m-0 font-mono text-sm leading-6">
                      <code
                        className={`language-${language}`}
                        dangerouslySetInnerHTML={{ __html: line }}
                      />
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className="m-0 p-4 font-mono text-sm leading-6">
            <code
              className={`language-${language}`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        )}
      </div>
    </div>
  );
}

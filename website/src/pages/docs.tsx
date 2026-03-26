import Section from "@/components/layout/section";
import CodeBlock from "@/components/code/code-block";
import { CURL_EXAMPLES } from "@/lib/code-examples";
import { SITE, PAGE_META } from "@/lib/content";
import { useSeo } from "@/hooks/use-seo";

export function Component() {
  useSeo(PAGE_META.docs);

  return (
    <>
      <Section
        title="Getting Started"
        subtitle="Connect DocScope to ChatGPT or query the MCP endpoint directly."
      >
        <div className="max-w-2xl mx-auto space-y-8">
          {/* ChatGPT setup */}
          <div>
            <h3 className="text-lg font-semibold text-text mb-3">Use in ChatGPT</h3>
            <ol className="space-y-3 text-sm text-text-secondary">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue text-white text-xs font-bold flex items-center justify-center">1</span>
                <span>Enable <strong>Developer Mode</strong> in ChatGPT Settings</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue text-white text-xs font-bold flex items-center justify-center">2</span>
                <span>Click the MCP tools icon and add a new server</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue text-white text-xs font-bold flex items-center justify-center">3</span>
                <span>
                  Enter: <code className="font-mono text-xs bg-bg-secondary dark:bg-gray-800 px-1.5 py-0.5 rounded">{SITE.mcpUrl}</code>
                </span>
              </li>
            </ol>
          </div>

          {/* Direct API */}
          <div>
            <h3 className="text-lg font-semibold text-text mb-3">Direct API Access</h3>
            <p className="text-sm text-text-secondary mb-4">
              The MCP endpoint accepts standard JSON-RPC 2.0 requests. You can query it from any HTTP client.
            </p>

            <h4 className="text-sm font-medium text-text mb-2">List available tools</h4>
            <CodeBlock code={CURL_EXAMPLES.list_tools} language="bash" label="curl" />
          </div>

          <div>
            <h4 className="text-sm font-medium text-text mb-2">Search documentation</h4>
            <CodeBlock code={CURL_EXAMPLES.search} language="bash" label="curl" />
          </div>

          {/* Available tools */}
          <div>
            <h3 className="text-lg font-semibold text-text mb-3">Available Tools</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-medium text-text-muted">Tool</th>
                    <th className="pb-2 font-medium text-text-muted">Description</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4"><code className="font-mono text-xs">search</code></td>
                    <td className="py-2">Hybrid semantic + keyword search across indexed API docs</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4"><code className="font-mono text-xs">fetch</code></td>
                    <td className="py-2">Retrieve full document text by vector ID</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4"><code className="font-mono text-xs">get_endpoint</code></td>
                    <td className="py-2">Structured endpoint schema with params, request/response bodies</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4"><code className="font-mono text-xs">test_endpoint</code></td>
                    <td className="py-2">Execute live API requests (requires API key, SSRF-protected)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4"><code className="font-mono text-xs">debug_error</code></td>
                    <td className="py-2">Look up error codes with causes, fixes, and related endpoints</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Source code */}
          <div className="pt-4 border-t border-border">
            <p className="text-sm text-text-muted">
              Full source code and local setup instructions:{" "}
              <a
                href={SITE.repo}
                className="text-blue hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/swa34/openRes
              </a>
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

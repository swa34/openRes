import Section from "@/components/layout/section";
import SearchDemo from "./search-demo";
import CodeBlock from "@/components/code/code-block";
import { CURL_EXAMPLES } from "@/lib/code-examples";
import { SITE } from "@/lib/content";

export default function DemoSection() {
  return (
    <>
      {/* Live search demo */}
      <Section
        title="Try it live"
        subtitle="Search DocScope's indexed API documentation in real time. Results come from the same MCP server that powers the ChatGPT integration."
      >
        <SearchDemo />
      </Section>

      {/* How to connect */}
      <Section
        title="Connect to ChatGPT"
        subtitle="Add DocScope to your ChatGPT in three steps."
        variant="alt"
      >
        <div className="max-w-2xl mx-auto space-y-6">
          <ol className="space-y-4 text-sm text-text-secondary">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue text-white text-xs font-bold flex items-center justify-center">1</span>
              <span>Open <strong>ChatGPT</strong> and go to <strong>Settings &rarr; Developer &rarr; Enable Developer Mode</strong></span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue text-white text-xs font-bold flex items-center justify-center">2</span>
              <span>Click the <strong>MCP tools</strong> icon (puzzle piece) in the composer and add a new server</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue text-white text-xs font-bold flex items-center justify-center">3</span>
              <span>
                Paste this URL: <code className="font-mono text-xs bg-bg-secondary dark:bg-gray-800 px-1.5 py-0.5 rounded">{SITE.mcpUrl}</code>
              </span>
            </li>
          </ol>

          <p className="text-xs text-text-muted">
            Then ask something like: &ldquo;Use DocScope to find how to send an SMS with Twilio&rdquo;
          </p>
        </div>
      </Section>

      {/* curl example */}
      <Section
        title="Or use the API directly"
        subtitle="Send JSON-RPC requests to the MCP endpoint from any HTTP client."
      >
        <div className="max-w-2xl mx-auto">
          <CodeBlock
            code={CURL_EXAMPLES.search}
            language="bash"
            label="curl"
          />
        </div>
      </Section>
    </>
  );
}

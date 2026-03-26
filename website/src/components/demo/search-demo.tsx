import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { search, getEndpoint, McpError } from "@/lib/mcp-client";
import type { SearchResult, EndpointDetail } from "@/lib/mcp-client";
import { SearchIcon } from "@/assets/icons";
import EndpointPreview from "./endpoint-preview";

const EXAMPLE_QUERIES = [
  "How do I create a payment intent?",
  "Send an SMS with Twilio",
  "List all Stripe customers",
  "What params does POST /v1/refunds accept?",
];

export default function SearchDemo() {
  const [query, setQuery] = useState("");
  const [apiFilter, setApiFilter] = useState<string>("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultMeta, setResultMeta] = useState<{ total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Endpoint detail view
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDetail | null>(null);
  const [endpointLoading, setEndpointLoading] = useState(false);

  const handleSearch = useCallback(async (searchQuery?: string) => {
    const q = searchQuery ?? query;
    if (!q.trim()) return;

    setLoading(true);
    setError(null);
    setSelectedEndpoint(null);

    try {
      const data = await search(q, apiFilter || undefined);
      const searchResults = data.structuredContent?.results ?? [];
      setResults(searchResults);
      setResultMeta({
        total: data.structuredContent?.total ?? searchResults.length,
      });
    } catch (err) {
      if (err instanceof McpError && err.retryable) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Search failed");
      }
      setResults([]);
      setResultMeta(null);
    } finally {
      setLoading(false);
    }
  }, [query, apiFilter]);

  const handleExampleClick = (example: string) => {
    setQuery(example);
    handleSearch(example);
  };

  const handleResultClick = async (result: SearchResult) => {
    if (!result.endpoint || !result.api) return;

    setEndpointLoading(true);
    try {
      const data = await getEndpoint(result.api, result.endpoint);
      const endpoint = data.structuredContent?.endpoint ?? null;
      if (endpoint) {
        setSelectedEndpoint(endpoint);
      }
    } catch (err) {
      console.error("Failed to fetch endpoint details:", err);
      // User can still see search results
    } finally {
      setEndpointLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search API documentation..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-bg dark:bg-gray-900 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
          />
        </div>

        {/* API filter */}
        <select
          value={apiFilter}
          onChange={(e) => setApiFilter(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-border bg-bg dark:bg-gray-900 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/30"
        >
          <option value="">All APIs</option>
          <option value="stripe">Stripe</option>
          <option value="twilio">Twilio</option>
        </select>

        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={loading || !query.trim()}
          className="px-5 py-2.5 rounded-lg bg-blue text-white text-sm font-medium hover:bg-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Example queries */}
      {results.length === 0 && !loading && !error && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Try an example</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExampleClick(example)}
                className="px-3 py-1.5 rounded-full border border-border text-xs text-text-secondary hover:bg-bg-secondary hover:text-text transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-light dark:bg-red/10 border border-red/20 text-sm text-red">
          {error}
        </div>
      )}

      {/* Results meta */}
      {resultMeta && !selectedEndpoint && (
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>{resultMeta.total} results</span>
        </div>
      )}

      {/* Endpoint detail view */}
      <AnimatePresence mode="wait">
        {selectedEndpoint ? (
          <motion.div
            key="endpoint"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <EndpointPreview
              endpoint={selectedEndpoint}
              onClose={() => setSelectedEndpoint(null)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            {results.map((result, i) => (
              <motion.button
                key={result.id}
                type="button"
                onClick={() => handleResultClick(result)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: i * 0.03 }}
                disabled={endpointLoading}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-lg border border-border",
                  "bg-bg dark:bg-gray-900 hover:bg-bg-secondary dark:hover:bg-gray-800",
                  "transition-colors cursor-pointer group",
                  endpointLoading && "opacity-50 cursor-wait",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                      result.api === "stripe"
                        ? "bg-purple/10 text-purple"
                        : "bg-red/10 text-red",
                    )}
                  >
                    {result.api}
                  </span>
                  <span className="text-sm font-medium text-text group-hover:text-blue transition-colors">
                    {result.title}
                  </span>
                  <span className="ml-auto text-xs text-text-muted font-mono">
                    {result.score.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-text-muted line-clamp-2">{result.text}</p>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

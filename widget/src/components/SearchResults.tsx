import clsx from "clsx";
import type { SearchResult } from "../types";

interface SearchResultsProps {
  results: SearchResult[];
  onSelectEndpoint: (endpoint: string, api?: string) => void;
}

export default function SearchResults({
  results,
  onSelectEndpoint,
}: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="ds-idle">
        <div className="ds-idle-title">No results found</div>
        <div className="ds-idle-text">Try a different search query.</div>
      </div>
    );
  }

  return (
    <div className="ds-search-list">
      {results.map((result) => (
        <div
          key={result.id}
          className="ds-search-item"
          onClick={() => {
            if (result.endpoint) {
              onSelectEndpoint(result.endpoint, result.api);
            }
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" && result.endpoint) {
              onSelectEndpoint(result.endpoint, result.api);
            }
          }}
        >
          <div className="ds-search-item-header">
            <span className="ds-search-item-title">{result.title}</span>
            <span className={clsx("ds-badge", "ds-badge-score")}>
              {result.score.toFixed(2)}
            </span>
            <span className={clsx("ds-badge", "ds-badge-api")}>
              {result.api}
            </span>
          </div>
          <div className="ds-search-item-snippet">{result.text}</div>
        </div>
      ))}
    </div>
  );
}

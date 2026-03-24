/**
 * DocScope — Eval Report Generator
 *
 * Produces markdown reports from EvalReport objects, including summary tables,
 * per-query breakdown for failures, config snapshots, and optional baseline deltas.
 */

import type { EvalReport, EvalMetrics } from "../types.js";

// ─── Quality Gate Targets ───

interface QualityTarget {
  metric: keyof EvalMetrics;
  label: string;
  target: number;
  comparator: ">" | "<" | ">=" | "<=";
  blocking: boolean;
}

const QUALITY_TARGETS: QualityTarget[] = [
  { metric: "precisionAtK", label: "precision@5", target: 0.80, comparator: ">", blocking: true },
  { metric: "recall", label: "recall", target: 0.70, comparator: ">", blocking: true },
  { metric: "answerRelevance", label: "answer relevance", target: 0.85, comparator: ">", blocking: true },
  { metric: "faithfulness", label: "faithfulness", target: 0.70, comparator: ">", blocking: false },
  { metric: "latencyP50", label: "latency p50 (ms)", target: 500, comparator: "<", blocking: true },
  { metric: "latencyP95", label: "latency p95 (ms)", target: 2000, comparator: "<", blocking: true },
  { metric: "latencyP99", label: "latency p99 (ms)", target: 5000, comparator: "<", blocking: false },
  { metric: "cacheHitRate", label: "cache hit rate", target: 0.30, comparator: ">", blocking: false },
];

// ─── Helpers ───

function formatMetricValue(metric: string, value: number): string {
  if (metric.startsWith("latency")) return `${Math.round(value)}ms`;
  return value.toFixed(2);
}

function checkPasses(value: number, target: number, comparator: string): boolean {
  switch (comparator) {
    case ">": return value > target;
    case "<": return value < target;
    case ">=": return value >= target;
    case "<=": return value <= target;
    default: return false;
  }
}

function statusEmoji(passes: boolean, blocking: boolean): string {
  if (passes) return "PASS";
  return blocking ? "FAIL" : "WARN";
}

// ─── Main Report Generator ───

/**
 * Generate a full markdown eval report from an EvalReport.
 *
 * @param report   - the completed evaluation report
 * @param baseline - optional previous report for delta comparison
 * @returns        - markdown string
 */
export function generateMarkdownReport(report: EvalReport, baseline?: EvalReport): string {
  const lines: string[] = [];

  // Header
  lines.push("# DocScope Eval Report");
  lines.push("");
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push(`**Total queries:** ${report.perQuery.length}`);
  lines.push(`**Passed:** ${report.perQuery.filter((q) => q.passed).length}/${report.perQuery.length}`);
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");

  if (baseline) {
    lines.push("| Metric | Value | Target | Delta | Status |");
    lines.push("|--------|-------|--------|-------|--------|");
  } else {
    lines.push("| Metric | Value | Target | Status |");
    lines.push("|--------|-------|--------|--------|");
  }

  for (const qt of QUALITY_TARGETS) {
    const value = report.metrics[qt.metric];
    const passes = checkPasses(value, qt.target, qt.comparator);
    const status = statusEmoji(passes, qt.blocking);
    const formatted = formatMetricValue(qt.metric, value);
    const targetStr = `${qt.comparator} ${qt.metric.startsWith("latency") ? `${qt.target}ms` : qt.target.toFixed(2)}`;

    if (baseline) {
      const baselineValue = baseline.metrics[qt.metric];
      const delta = value - baselineValue;
      const deltaStr = delta >= 0 ? `+${formatMetricValue(qt.metric, Math.abs(delta))}` : `-${formatMetricValue(qt.metric, Math.abs(delta))}`;
      const direction = isImprovementPositive(qt)
        ? (delta > 0 ? "improved" : delta < 0 ? "regressed" : "unchanged")
        : (delta < 0 ? "improved" : delta > 0 ? "regressed" : "unchanged");
      lines.push(`| ${qt.label} | ${formatted} | ${targetStr} | ${deltaStr} (${direction}) | ${status} |`);
    } else {
      lines.push(`| ${qt.label} | ${formatted} | ${targetStr} | ${status} |`);
    }
  }

  lines.push("");

  // Overall verdict
  const allBlockingPass = QUALITY_TARGETS
    .filter((qt) => qt.blocking)
    .every((qt) => checkPasses(report.metrics[qt.metric], qt.target, qt.comparator));

  lines.push(`## Verdict: ${allBlockingPass ? "PASS — all blocking gates met" : "FAIL — one or more blocking gates missed"}`);
  lines.push("");

  // Per-query failures
  const failures = report.perQuery.filter((q) => !q.passed);
  if (failures.length > 0) {
    lines.push("## Failed Queries");
    lines.push("");
    lines.push("| # | Query | Precision@5 | Recall | Retrieved | Expected |");
    lines.push("|---|-------|-------------|--------|-----------|----------|");

    for (let i = 0; i < failures.length; i++) {
      const f = failures[i];
      const p = f.metrics.precisionAtK?.toFixed(2) ?? "N/A";
      const r = f.metrics.recall?.toFixed(2) ?? "N/A";
      const retrieved = f.retrieved.length > 0 ? f.retrieved.join(", ") : "(none)";
      const expected = f.expected.length > 0 ? f.expected.join(", ") : "(none)";
      lines.push(`| ${i + 1} | ${truncate(f.query, 60)} | ${p} | ${r} | ${truncate(retrieved, 40)} | ${truncate(expected, 40)} |`);
    }
    lines.push("");
  }

  // Config snapshot
  if (Object.keys(report.config).length > 0) {
    lines.push("## Config Snapshot");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(report.config, null, 2));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Utilities ───

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/**
 * For higher-is-better metrics (precision, recall, relevance, cache hit rate) a positive
 * delta is an improvement. For latency metrics, a negative delta is an improvement.
 */
function isImprovementPositive(qt: QualityTarget): boolean {
  return qt.comparator === ">" || qt.comparator === ">=";
}

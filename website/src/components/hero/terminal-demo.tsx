import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { DEMO_LINES } from "@/lib/content";

export default function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines >= DEMO_LINES.length) return;

    const line = DEMO_LINES[visibleLines];
    const delay = line.type === "input" ? 1200 : 150;
    const timer = setTimeout(() => setVisibleLines((v) => v + 1), delay);
    return () => clearTimeout(timer);
  }, [visibleLines]);

  return (
    <div className="w-full max-w-2xl mx-auto rounded-xl overflow-hidden shadow-lg border border-border">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-bg-tertiary dark:bg-gray-800">
        <span className="w-3 h-3 rounded-full bg-red" />
        <span className="w-3 h-3 rounded-full bg-yellow" />
        <span className="w-3 h-3 rounded-full bg-green" />
        <span className="ml-3 text-xs font-mono text-text-muted">docscope-mcp</span>
      </div>

      {/* Terminal body */}
      <div className="bg-gray-950 px-4 py-4 font-mono text-sm leading-relaxed min-h-[240px]">
        {DEMO_LINES.slice(0, visibleLines).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className={
              line.type === "input"
                ? "text-green"
                : "text-gray-400"
            }
          >
            {line.text || "\u00A0"}
          </motion.div>
        ))}
        {visibleLines < DEMO_LINES.length && (
          <span className="inline-block w-2 h-4 bg-green animate-pulse" />
        )}
      </div>
    </div>
  );
}

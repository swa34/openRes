import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface FlowStepProps {
  number: number;
  label: string;
  description: string;
  details?: string;
  isLast?: boolean;
}

export default function FlowStep({
  number,
  label,
  description,
  details,
  isLast = false,
}: FlowStepProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col items-center">
      <motion.button
        type="button"
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3, delay: number * 0.08 }}
        onClick={() => details && setExpanded(!expanded)}
        className={`relative flex items-start gap-4 px-6 py-4 rounded-xl border bg-white dark:bg-gray-900 w-full max-w-lg text-left transition-all ${
          details ? "cursor-pointer hover:border-primary/40 hover:shadow-md" : "cursor-default"
        } ${expanded ? "border-primary shadow-md" : "border-border shadow-sm"}`}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center mt-0.5">
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-text">{label}</p>
          <p className="text-xs text-text-secondary mt-0.5">{description}</p>
          <AnimatePresence>
            {expanded && details && (
              <motion.p
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-xs text-text-secondary mt-2 leading-relaxed overflow-hidden"
              >
                {details}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        {details && (
          <span className={`text-xs text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}>
            &#9660;
          </span>
        )}
      </motion.button>

      {!isLast && (
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, delay: number * 0.08 + 0.1 }}
          className="py-1"
        >
          <svg width="20" height="24" viewBox="0 0 20 24" fill="none" className="text-border">
            <path d="M10 0 L10 18 M5 14 L10 20 L15 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      )}
    </div>
  );
}

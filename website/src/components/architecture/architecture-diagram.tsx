import { motion } from "motion/react";
import { ARCHITECTURE_STEPS } from "@/lib/content";

export default function ArchitectureDiagram() {
  return (
    <div className="flex flex-col gap-0 items-center">
      {ARCHITECTURE_STEPS.map((step, i) => (
        <div key={step.label} className="flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
            className="relative flex items-center gap-4 px-6 py-4 rounded-xl border border-border bg-white dark:bg-gray-900 w-full max-w-md shadow-sm"
          >
            {/* Step number */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">
              {i + 1}
            </div>
            <div>
              <p className="font-semibold text-sm text-text">{step.label}</p>
              <p className="text-xs text-text-secondary">{step.description}</p>
            </div>
          </motion.div>

          {/* Connector arrow */}
          {i < ARCHITECTURE_STEPS.length - 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: i * 0.1 + 0.15 }}
              className="py-1"
            >
              <svg width="20" height="24" viewBox="0 0 20 24" fill="none" className="text-border">
                <path d="M10 0 L10 18 M5 14 L10 20 L15 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
          )}
        </div>
      ))}
    </div>
  );
}

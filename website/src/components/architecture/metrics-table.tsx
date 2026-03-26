import { motion } from "motion/react";
import { EVAL_METRICS } from "@/lib/content";

export default function MetricsTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Metric
            </th>
            <th className="py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Score
            </th>
            <th className="py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {EVAL_METRICS.map((metric, i) => (
            <motion.tr
              key={metric.label}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              className="border-b border-border last:border-b-0"
            >
              <td className="py-3 px-4 font-mono text-sm font-medium text-text">
                {metric.label}
              </td>
              <td className="py-3 px-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-semibold font-mono bg-primary-light text-primary">
                  {metric.value}
                </span>
              </td>
              <td className="py-3 px-4 text-sm text-text-secondary">
                {metric.description}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

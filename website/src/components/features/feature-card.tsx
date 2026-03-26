import { motion } from "motion/react";

interface FeatureCardProps {
  title: string;
  description: string;
  index: number;
}

export default function FeatureCard({ title, description, index }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="p-6 rounded-xl border border-border bg-white dark:bg-gray-900 hover:shadow-lg hover:border-primary/30 transition-all"
    >
      <h3 className="text-lg font-semibold text-text mb-2">{title}</h3>
      <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
    </motion.div>
  );
}

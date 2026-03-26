import { motion } from "motion/react";
import { Link } from "react-router";
import { HERO } from "@/lib/content";
import TerminalDemo from "./terminal-demo";

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary-light to-transparent dark:from-gray-900 dark:to-transparent -z-10" />

      <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 md:pt-32 md:pb-24">
        <div className="text-center mb-12">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl md:text-6xl font-bold text-text leading-tight mb-6"
          >
            {HERO.headline}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-8"
          >
            {HERO.subheadline}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              to={HERO.cta.href}
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-primary rounded-lg hover:opacity-90 transition-opacity"
            >
              {HERO.cta.label}
            </Link>
            <a
              href={HERO.secondaryCta.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-text border border-border rounded-lg hover:bg-bg-secondary transition-colors"
            >
              {HERO.secondaryCta.label}
            </a>
          </motion.div>
        </div>

        {/* Terminal demo */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
        >
          <TerminalDemo />
        </motion.div>
      </div>
    </section>
  );
}

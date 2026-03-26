import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  variant?: "default" | "alt";
  className?: string;
  id?: string;
}

export default function Section({
  title,
  subtitle,
  children,
  variant = "default",
  className,
  id,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "max-w-6xl mx-auto px-6 py-16 md:py-24",
        variant === "alt" && "bg-bg-secondary dark:bg-gray-900/50",
        className
      )}
    >
      {(title || subtitle) && (
        <div className="mb-12 text-center">
          {title && (
            <h2 className="text-3xl md:text-4xl font-bold text-text mb-3">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

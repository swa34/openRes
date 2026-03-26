import { NavLink } from "react-router";
import { NOT_FOUND } from "@/lib/content";
import { SearchIcon } from "@/assets/icons";
import { useSeo } from "@/hooks/use-seo";

export function Component() {
  useSeo({ title: "404 — DocScope", description: NOT_FOUND.message });

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-bg-secondary dark:bg-gray-800 flex items-center justify-center mb-6">
        <SearchIcon className="w-8 h-8 text-text-muted" />
      </div>
      <h1 className="text-5xl font-bold text-text mb-4">{NOT_FOUND.headline}</h1>
      <p className="text-lg text-text-secondary mb-8 max-w-md">
        {NOT_FOUND.message}
      </p>
      <NavLink
        to={NOT_FOUND.cta.href}
        className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-primary rounded-lg hover:opacity-90 transition-opacity"
      >
        {NOT_FOUND.cta.label}
      </NavLink>
    </div>
  );
}

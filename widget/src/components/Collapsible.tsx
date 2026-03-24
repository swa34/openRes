import { useState } from "react";
import clsx from "clsx";

interface CollapsibleProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function Collapsible({
  title,
  defaultOpen = false,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        className="ds-collapsible-header"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className={clsx("ds-collapsible-arrow", open && "open")}>
          &#9654;
        </span>
        {title}
      </button>
      {open && children}
    </div>
  );
}

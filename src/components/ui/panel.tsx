import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A bordered section with a mono caption bar. The archive's basic container. */
export function Panel({
  label,
  action,
  children,
  className,
  bodyClassName,
}: {
  label?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("border border-ink bg-paper", className)}>
      {label ? (
        <header className="flex items-center justify-between gap-3 border-b border-ink px-3 py-2">
          <span className="label-strong">{label}</span>
          {action}
        </header>
      ) : null}
      <div className={cn("px-3 py-3", bodyClassName)}>{children}</div>
    </section>
  );
}

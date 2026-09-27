import { cn } from "@/lib/cn";

/**
 * A rubber stamp, not a badge. Reserved for the few records that earn it —
 * see lib/archival.ts.
 */
export function Stamp({
  children,
  tone = "acid",
  className,
}: {
  children: string;
  tone?: "acid" | "red";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none inline-flex select-none items-center border-2 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase leading-none tracking-[0.18em]",
        tone === "acid" ? "border-ink bg-acid text-ink" : "border-red bg-transparent text-red",
        className,
      )}
      style={{ transform: "rotate(-3.5deg)" }}
    >
      {children}
    </span>
  );
}

import { cn } from "@/lib/cn";

/**
 * The personnel annotation, as a filing mark.
 *
 * Not a Stamp: a stamp is reserved for records that earned one, and this is a
 * note in a margin about a person. Not an error colour either — someone leaving
 * is an administrative fact, not a fault, and nothing about it is a warning.
 * Flat, quiet, and the same two words everywhere it appears.
 */
export function FormerMark({
  label,
  tone = "paper",
  className,
}: {
  label: string;
  /** `ink` for the dark dossier header, where a dark border disappears. */
  tone?: "paper" | "ink";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center whitespace-nowrap border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase leading-none tracking-[0.12em]",
        tone === "ink" ? "border-paper/40 text-muted-dark" : "border-muted text-muted",
        className,
      )}
    >
      {label}
    </span>
  );
}

import { cn } from "@/lib/cn";
import { fill, plural } from "@/lib/i18n/locale";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { type Verification } from "@/lib/verification";

/**
 * Where a record sits on the verification ladder. In the feed only records that
 * someone has actually corroborated say anything; UNVERIFIED is silent there
 * and only announces itself on the record's own page.
 */
export async function VerificationBadge({
  verification,
  witnesses,
  context = "feed",
  className,
}: {
  verification: Verification;
  witnesses: number;
  context?: "feed" | "record";
  className?: string;
}) {
  if (context === "feed" && verification === "UNVERIFIED") return null;

  const certified = verification === "CERTIFIED";
  const [d, locale] = await Promise.all([getDictionary(), getLocale()]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] uppercase leading-none tracking-[0.12em]",
        // Only certification is loud enough to earn a box; the rungs below it
        // are technical detail and read as such.
        certified ? "border border-ink px-2 py-1 font-bold" : "text-muted",
        className,
      )}
      title={d.verification[`blurb${verification}`]}
    >
      {certified ? <span aria-hidden>✓</span> : null}
      {d.verification[verification]}
      {witnesses > 0 ? (
        <span className="opacity-60">
          ·{" "}
          {fill(
            plural(locale, witnesses, [d.note.witnessOne, d.note.witnessFew, d.note.witnessMany]),
            { n: witnesses },
          )}
        </span>
      ) : null}
    </span>
  );
}

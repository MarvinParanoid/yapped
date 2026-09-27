import { cn } from "@/lib/cn";
import { quoteSizeClass, type QuoteScale } from "@/lib/format";

/**
 * The quote is the largest thing on screen, always. Long statements step down
 * a size and drop the uppercase so they stay readable.
 */
export function QuoteText({
  text,
  scale = "feed",
  className,
}: {
  text: string;
  scale?: QuoteScale;
  className?: string;
}) {
  const long = text.length > 150;
  return (
    <span
      className={cn("quote block", long && "quote-lower", quoteSizeClass(text, scale), className)}
    >
      <span aria-hidden className="opacity-40">
        “
      </span>
      {text}
      <span aria-hidden className="opacity-40">
        ”
      </span>
    </span>
  );
}

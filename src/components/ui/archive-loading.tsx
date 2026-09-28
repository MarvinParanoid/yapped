/**
 * Loading states are scoped per route rather than declared at the root: a root
 * loading.tsx flushes the shell early, which makes notFound() render a 404 page
 * with a 200 status.
 */
export function ArchiveLoading({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6 lg:px-8">
      <p className="label animate-pulse">{label}</p>
    </div>
  );
}

import { LoaderCircle } from "lucide-react";

/** Present an observed activity state without fabricating streamed content. */
export function StreamingStatus({ label, active = true, iconClassName = "motion-safe:animate-spin" }: { label: string; active?: boolean; iconClassName?: string }) {
  return <span role="status" aria-live="polite" className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
    {active && <LoaderCircle aria-hidden="true" className={`size-3 shrink-0 ${iconClassName}`} />}
    <span className="break-words">{label}</span>
  </span>;
}

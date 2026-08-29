import { RATING_STYLE } from "@/components/loads/rating-badge";
import { scoreBand, type LoadScore } from "@/lib/finance/load-score";
import { cn } from "@/lib/utils";

/** The score as a compact chip: "87 / 100 GREAT". */
export function LoadScoreBadge({
  score,
  className,
}: {
  score: LoadScore;
  className?: string;
}) {
  const style = RATING_STYLE[score.rating];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-1 text-2xs font-semibold uppercase tracking-wide",
        style.chip,
        className,
      )}
    >
      <span className="tnum">{score.score}</span>
      <span className="opacity-50">/100</span>
      <span className="opacity-90">{style.label}</span>
    </span>
  );
}

/**
 * The score with its three components spelled out, so the answer to "why did
 * this load score 87?" is always on the screen.
 */
export function LoadScoreBreakdown({
  score,
  className,
}: {
  score: LoadScore;
  className?: string;
}) {
  const style = RATING_STYLE[score.rating];

  return (
    <div className={cn("rounded-md border p-3.5", style.chip, className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg font-semibold uppercase leading-none tracking-wide">
            {style.label} load
          </p>
          <p className="mt-1 text-2xs opacity-80">{scoreBand(score.score)} overall</p>
        </div>
        <p className="shrink-0 tnum text-3xl font-semibold leading-none tracking-tight">
          {score.score}
          <span className="text-base opacity-60">/100</span>
        </p>
      </div>

      <ul className="mt-3 space-y-2 border-t border-current/20 pt-3">
        {score.components.map((component) => (
          <li key={component.key}>
            <div className="flex items-baseline justify-between gap-2 text-2xs">
              <span className="font-medium">{component.label}</span>
              <span className="tnum opacity-90">
                {component.points} / {component.max}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-current/15">
              <div
                className="h-full rounded-full bg-current"
                style={{ width: `${(component.points / component.max) * 100}%` }}
              />
            </div>
            <p className="mt-0.5 text-2xs opacity-70">{component.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

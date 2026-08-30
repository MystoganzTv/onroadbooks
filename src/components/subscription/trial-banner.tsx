import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface TrialBannerData {
  planName: string;
  priceMonthly: number;
  daysRemaining: number;
  expired: boolean;
}

/** A quiet conversion prompt: useful, visible, and never confused with Fleet. */
export function TrialBanner({ trial }: { trial: TrialBannerData }) {
  const timeLabel = trial.expired
    ? "Trial ended"
    : trial.daysRemaining === 0
      ? "Ends today"
      : `${trial.daysRemaining} ${trial.daysRemaining === 1 ? "day" : "days"} left`;

  return (
    <div className="border-b border-primary/25 bg-primary/10 px-4 py-2.5 print:hidden">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground sm:mt-0">
            <Sparkles className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">
              {trial.planName} trial
              <span className="ml-2 text-primary">{timeLabel}</span>
            </p>
            <p className="text-2xs text-muted-foreground">
              Keep every Pro tool for your one-truck business after the trial for ${trial.priceMonthly}/month.
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0 self-start sm:self-auto">
          <Link href="/settings#plan">
            Keep {trial.planName}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

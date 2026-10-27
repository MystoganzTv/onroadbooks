"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { onroadAiRetryPending, onroadAiRunAlerts, onroadAiSetBlocked } from "@/lib/actions/onroad-ai-admin";
import { interpolate } from "@/lib/i18n/dictionaries";
import { localizedClientError } from "@/lib/i18n/errors";

export function OnroadAiOperations({ enabled }: { enabled: boolean }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.onroadAi;
  const [pending, startTransition] = React.useTransition();

  const retry = () =>
    startTransition(async () => {
      const result = await onroadAiRetryPending();
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(interpolate(copy.retryToast, { processed: result.data.processed, failed: result.data.failed }));
    });

  const alerts = () =>
    startTransition(async () => {
      const result = await onroadAiRunAlerts();
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      if (result.data.noProvider) toast.info(copy.alertsNoProvider);
      else toast.success(interpolate(copy.alertsToast, { checked: result.data.checked, sent: result.data.sent }));
    });

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button type="button" size="sm" variant="outline" disabled={!enabled || pending} onClick={retry}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
        {copy.retryNow}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={!enabled || pending} onClick={alerts}>
        {copy.runAlerts}
      </Button>
    </div>
  );
}

export function OnroadAiBlockButton({ userId, blocked }: { userId: string; blocked: boolean }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.onroadAi;
  const [pending, startTransition] = React.useTransition();

  const toggle = () =>
    startTransition(async () => {
      const result = await onroadAiSetBlocked(userId, !blocked);
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(blocked ? copy.unblockedToast : copy.blockedToast);
    });

  return (
    <Button type="button" size="sm" variant={blocked ? "outline" : "ghost"} disabled={pending} onClick={toggle}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {blocked ? copy.unblock : copy.block}
    </Button>
  );
}

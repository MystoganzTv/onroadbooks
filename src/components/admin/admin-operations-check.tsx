"use client";

import * as React from "react";
import { Activity, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { adminRunOperationsCheck } from "@/lib/actions/admin";
import { localizedClientError } from "@/lib/i18n/errors";

export function AdminOperationsCheck() {
  const { dictionary } = useLanguage();
  const copy = dictionary.admin;
  const [pending, startTransition] = React.useTransition();

  function run() {
    startTransition(async () => {
      const result = await adminRunOperationsCheck();
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(copy.operationsCheckSuccess);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <Activity className="mt-0.5 size-5 shrink-0 text-info" />
          <div>
            <h2 className="text-sm font-semibold">{copy.operationsCheckTitle}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {copy.operationsCheckDescription}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" className="sm:ml-auto" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          {pending ? copy.operationsCheckRunning : copy.operationsCheckAction}
        </Button>
      </CardContent>
    </Card>
  );
}

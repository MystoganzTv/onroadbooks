"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteCurrentAccount, resetAccountData } from "@/lib/actions/account";
import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";

type Operation = "reset" | "delete";

export function AccountDangerZone({
  email,
  locale,
  operation,
}: {
  email: string;
  locale: AppLocale;
  operation: Operation;
}) {
  const router = useRouter();
  const dictionary = getWebDictionary(locale);
  const copy = dictionary.settings;
  const [open, setOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setConfirmation("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result =
        operation === "reset"
          ? await resetAccountData(confirmation)
          : await deleteCurrentAccount(confirmation);

      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }

      if (operation === "reset") {
        toast.success(copy.resetSuccess, {
          description: copy.resetSuccessDescription,
        });
        setOpen(false);
        setConfirmation("");
        router.push("/welcome");
        router.refresh();
      } else {
        window.location.assign("/login?account=deleted");
      }
    });
  }

  const expected = operation === "reset" ? "RESET" : email;
  const confirmed =
    operation === "reset"
      ? confirmation.trim() === "RESET"
      : confirmation.trim() === email;

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-muted-foreground" />
          <CardTitle>
            {operation === "reset" ? copy.advancedBusiness : copy.advancedAccount}
          </CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">
          {copy.permanentOwnerOnly}
        </span>
      </CardHeader>
      <CardContent>
        {operation === "reset" ? (
          <div className="flex flex-col justify-between gap-4 rounded-md border border-border p-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-semibold">
                {copy.resetBusiness}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {copy.resetBusinessDescription}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 self-start"
              onClick={() => setOpen(true)}
            >
              <RotateCcw />
              {copy.resetData}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/[0.03] p-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-semibold text-destructive">
                {copy.deleteAccount}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {copy.deleteAccountDescription}
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              className="shrink-0 self-start"
              onClick={() => setOpen(true)}
            >
              <Trash2 />
              {copy.deleteAccount}
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : close()}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {operation === "reset" ? copy.resetAllTitle : copy.deleteAccountTitle}
              </DialogTitle>
              <DialogDescription>
                {copy.permanentDescription}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="rounded-md border border-destructive/25 bg-destructive/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
                {operation === "reset" ? copy.resetRemoval : copy.deleteRemoval}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-confirmation">
                  {interpolate(copy.typeConfirm, { value: expected })}
                </Label>
                <Input
                  id="account-confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                  autoFocus
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                {dictionary.common.cancel}
              </Button>
              <Button type="submit" variant="destructive" disabled={!confirmed || pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {operation === "reset" ? copy.resetPermanently : copy.deletePermanently}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

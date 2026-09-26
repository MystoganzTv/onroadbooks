"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/field";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { moveBrokerNameAction } from "@/lib/actions/brokers";
import { interpolate } from "@/lib/i18n/dictionaries";
import { localizedClientError } from "@/lib/i18n/errors";

/**
 * A person's name typed into a load's Broker field shows up as a "company".
 * This moves it where it belongs: its loads go to the real broker, and the
 * name becomes one of that broker's contacts.
 */
export function MoveBrokerNameDialog({
  name,
  loadCount,
  brokers,
}: {
  name: string;
  loadCount: number;
  brokers: { id: string; name: string }[];
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.brokers;
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState(brokers.length === 1 ? brokers[0].id : "");
  const [pending, startTransition] = React.useTransition();
  const target = brokers.find((broker) => broker.id === targetId);

  function move() {
    if (!target) return;
    startTransition(async () => {
      const result = await moveBrokerNameAction(name, target.id);
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(interpolate(copy.moved, { name, broker: target.name }));
      setOpen(false);
      router.refresh();
    });
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" disabled={brokers.length === 0} title={brokers.length === 0 ? copy.moveNeedsBroker : undefined}>
        <UserRoundPlus />{copy.moveToBroker}
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{interpolate(copy.moveTitle, { name })}</DialogTitle>
        <DialogDescription>{copy.moveDescription}</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-3">
        <Field label={copy.moveBrokerLabel} htmlFor="move-broker-target">
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger id="move-broker-target"><SelectValue placeholder={copy.moveChoose} /></SelectTrigger>
            <SelectContent>
              {brokers.map((broker) => <SelectItem key={broker.id} value={broker.id}>{broker.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {target ? <p className="text-sm text-muted-foreground">
          {interpolate(copy.moveExplain, { name, broker: target.name, count: loadCount })}
        </p> : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>{dictionary.common.cancel}</Button>
        <Button size="sm" onClick={move} disabled={pending || !target}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {target ? interpolate(copy.moveAction, { broker: target.name }) : copy.moveToBroker}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

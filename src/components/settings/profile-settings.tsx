"use client";

import { LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";

import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import type { MemberRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProfileSettings({
  name,
  email,
  role,
  locale,
}: {
  name: string | null;
  email: string;
  role: MemberRole;
  locale: AppLocale;
}) {
  const dictionary = getWebDictionary(locale);
  const copy = dictionary.settings;
  const roleLabels: Record<MemberRole, string> = {
    OWNER: dictionary.team.owner,
    ADMIN: dictionary.team.admin,
    BOOKKEEPER: dictionary.team.bookkeeper,
    DISPATCHER: dictionary.team.dispatcher,
    VIEWER: dictionary.team.viewer,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserRound className="size-4 text-primary" />
          <CardTitle>{copy.profileTitle}</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">
          {copy.profileIdentity}
        </span>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <ProfileValue
            icon={UserRound}
            label={copy.name}
            value={name || copy.noName}
          />
          <ProfileValue icon={Mail} label={copy.email} value={email} />
          <ProfileValue
            icon={ShieldCheck}
            label={copy.role}
            value={roleLabels[role]}
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {copy.profilePreferences}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            <LogOut />
            {copy.signOut}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileValue({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-sunken p-3">
      <p className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1.5 break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

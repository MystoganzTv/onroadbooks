"use client";

import * as React from "react";
import Link from "next/link";
import { FileSpreadsheet, Loader2, MailPlus, Trash2, Users } from "lucide-react";

import {
  inviteMemberAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/lib/actions/team";
import {
  ASSIGNABLE_ROLES,
  type AssignableRole,
} from "@/lib/roles";
import type { MemberRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/shell/language-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TeamMemberView {
  id: string;
  email: string;
  name: string | null;
  role: MemberRole;
  joinedAt: string | null;
  invitedAt: string | null;
}

interface TeamManagerProps {
  members: TeamMemberView[];
  canManage: boolean;
}

export function TeamManager({ members, canManage }: TeamManagerProps) {
  const { dictionary } = useLanguage();
  const copy = dictionary.team;
  const displayName = (member: TeamMemberView) =>
    member.name?.trim() || member.email.split("@")[0] || copy.teamMember;
  const roleCopy = (memberRole: MemberRole) => ({
    OWNER: [copy.owner, copy.ownerDescription],
    ADMIN: [copy.admin, copy.adminDescription],
    BOOKKEEPER: [copy.bookkeeper, copy.bookkeeperDescription],
    DISPATCHER: [copy.dispatcher, copy.dispatcherDescription],
    VIEWER: [copy.viewer, copy.viewerDescription],
  } as const)[memberRole];
  const [pending, startTransition] = React.useTransition();
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<AssignableRole>("BOOKKEEPER");
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await inviteMemberAction({ email, name, role });
      if (result.ok) {
        setEmail("");
        setName("");
        setMessage({ ok: true, text: copy.invitationSent });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  function changeRole(userId: string, nextRole: AssignableRole) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateMemberRoleAction({ userId, role: nextRole });
      setMessage(
        result.ok
          ? { ok: true, text: copy.roleUpdated }
          : { ok: false, text: result.error },
      );
    });
  }

  function remove(member: TeamMemberView) {
    if (!window.confirm(copy.removeConfirm.replace("{member}", displayName(member)))) return;
    setMessage(null);
    startTransition(async () => {
      const result = await removeMemberAction(member.id);
      setMessage(
        result.ok
          ? { ok: true, text: copy.memberRemoved }
          : { ok: false, text: result.error },
      );
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.7fr)]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <CardTitle>{copy.peopleAccess}</CardTitle>
          </div>
          <Badge variant="outline">{copy.total.replace("{count}", String(members.length))}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{displayName(member)}</p>
                  <Badge variant={member.joinedAt ? "positive" : "warning"}>
                    {member.joinedAt ? copy.active : copy.invitationPending}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{member.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {roleCopy(member.role)[1]}
                </p>
              </div>

              {member.role === "OWNER" ? (
                <Badge variant="info">{copy.owner}</Badge>
              ) : (
                <div className="flex items-center gap-2 sm:w-52">
                  <Select
                    value={member.role}
                    onValueChange={(value) => changeRole(member.id, value as AssignableRole)}
                    disabled={!canManage || pending}
                  >
                    <SelectTrigger aria-label={copy.roleFor.replace("{member}", displayName(member))}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {member.role === "VIEWER" ? (
                        <SelectItem value="VIEWER" disabled>
                          {copy.viewerLegacy}
                        </SelectItem>
                      ) : null}
                      {ASSIGNABLE_ROLES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {roleCopy(value)[0]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      onClick={() => remove(member)}
                      aria-label={copy.removeMember.replace("{member}", displayName(member))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border-info/30 bg-info-soft/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-info" />
              <CardTitle>{copy.accountantTitle}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              {copy.accountantDescription}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports">{copy.openReports}</Link>
            </Button>
          </CardContent>
        </Card>

        {canManage ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MailPlus className="size-4 text-primary" />
                <CardTitle>{copy.inviteMember}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={invite}>
                <div>
                  <label htmlFor="member-name" className="mb-1 block text-xs font-medium">{copy.name} <span className="text-muted-foreground">({copy.optional})</span></label>
                  <Input id="member-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
                </div>
                <div>
                  <label htmlFor="member-email" className="mb-1 block text-xs font-medium">{copy.email}</label>
                  <Input id="member-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
                </div>
                <div>
                  <label htmlFor="member-role" className="mb-1 block text-xs font-medium">{copy.role}</label>
                  <Select value={role} onValueChange={(value) => setRole(value as AssignableRole)}>
                    <SelectTrigger id="member-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((value) => (
                        <SelectItem key={value} value={value}>{roleCopy(value)[0]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{roleCopy(role)[1]}</p>
                </div>
                <Button className="w-full" disabled={pending || !email.trim()}>
                  {pending ? <Loader2 className="animate-spin" /> : <MailPlus />}
                  {copy.sendInvitation}
                </Button>
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  {copy.invitationScope}
                </p>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 text-sm leading-relaxed text-muted-foreground">
              {copy.ownerInviteOnly}
            </CardContent>
          </Card>
        )}

        {message ? (
          <div className={message.ok ? "rounded-md border border-pos/30 bg-pos-soft p-3 text-sm text-pos" : "rounded-md border border-neg/30 bg-neg-soft p-3 text-sm text-neg"} role="status">
            {message.text}
          </div>
        ) : null}

        <Card>
          <CardHeader><CardTitle>{copy.roleBoundaries}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            {ASSIGNABLE_ROLES.map((value) => (
              <div key={value}>
                <p className="font-semibold text-foreground">{roleCopy(value)[0]}</p>
                <p>{roleCopy(value)[1]}</p>
              </div>
            ))}
            <p className="border-t border-border pt-3">
              {copy.ownerBoundary}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

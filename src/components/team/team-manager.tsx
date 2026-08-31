"use client";

import * as React from "react";
import { Loader2, MailPlus, Trash2, Users } from "lucide-react";

import {
  inviteMemberAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/lib/actions/team";
import {
  ASSIGNABLE_ROLES,
  ROLE_DEFINITIONS,
  type AssignableRole,
} from "@/lib/roles";
import type { MemberRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

function displayName(member: TeamMemberView): string {
  return member.name?.trim() || member.email.split("@")[0] || "Team member";
}

export function TeamManager({ members, canManage }: TeamManagerProps) {
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
        setMessage({ ok: true, text: "Invitation sent. Access begins only after the email is verified." });
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
          ? { ok: true, text: "Role updated. The new permissions apply immediately." }
          : { ok: false, text: result.error },
      );
    });
  }

  function remove(member: TeamMemberView) {
    if (!window.confirm(`Remove ${displayName(member)} from this workspace?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await removeMemberAction(member.id);
      setMessage(
        result.ok
          ? { ok: true, text: "Member removed. Existing OnRoad sessions are now revoked." }
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
            <CardTitle>Workspace members</CardTitle>
          </div>
          <Badge variant="outline">{members.length} total</Badge>
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
                    {member.joinedAt ? "Active" : "Invitation pending"}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{member.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ROLE_DEFINITIONS[member.role].description}
                </p>
              </div>

              {member.role === "OWNER" ? (
                <Badge variant="info">Owner</Badge>
              ) : (
                <div className="flex items-center gap-2 sm:w-52">
                  <Select
                    value={member.role}
                    onValueChange={(value) => changeRole(member.id, value as AssignableRole)}
                    disabled={!canManage || pending}
                  >
                    <SelectTrigger aria-label={`Role for ${displayName(member)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {ROLE_DEFINITIONS[value].label}
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
                      aria-label={`Remove ${displayName(member)}`}
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
        {canManage ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MailPlus className="size-4 text-primary" />
                <CardTitle>Invite a member</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={invite}>
                <div>
                  <label htmlFor="member-name" className="mb-1 block text-xs font-medium">Name <span className="text-muted-foreground">(optional)</span></label>
                  <Input id="member-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
                </div>
                <div>
                  <label htmlFor="member-email" className="mb-1 block text-xs font-medium">Email</label>
                  <Input id="member-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Role</label>
                  <Select value={role} onValueChange={(value) => setRole(value as AssignableRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((value) => (
                        <SelectItem key={value} value={value}>{ROLE_DEFINITIONS[value].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{ROLE_DEFINITIONS[role].description}</p>
                </div>
                <Button className="w-full" disabled={pending || !email.trim()}>
                  {pending ? <Loader2 className="animate-spin" /> : <MailPlus />}
                  Send invitation
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 text-sm leading-relaxed text-muted-foreground">
              Only the workspace owner can invite members or change roles.
            </CardContent>
          </Card>
        )}

        {message ? (
          <div className={message.ok ? "rounded-md border border-pos/30 bg-pos-soft p-3 text-sm text-pos" : "rounded-md border border-neg/30 bg-neg-soft p-3 text-sm text-neg"} role="status">
            {message.text}
          </div>
        ) : null}

        <Card>
          <CardHeader><CardTitle>Permission boundaries</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            {ASSIGNABLE_ROLES.map((value) => (
              <div key={value}>
                <p className="font-semibold text-foreground">{ROLE_DEFINITIONS[value].label}</p>
                <p>{ROLE_DEFINITIONS[value].description}</p>
              </div>
            ))}
            <p className="border-t border-border pt-3">Billing, member management, account reset and account deletion always remain with the Owner.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

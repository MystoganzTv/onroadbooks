"use client";

import { LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";

import type { AppLocale } from "@/lib/i18n";
import type { MemberRole } from "@/lib/types";
import { ROLE_DEFINITIONS } from "@/lib/roles";
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
  const spanish = locale === "es";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserRound className="size-4 text-primary" />
          <CardTitle>{spanish ? "Mi perfil" : "My profile"}</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">
          {spanish ? "Tu identidad de acceso, no la configuración del negocio" : "Your sign-in identity, separate from business settings"}
        </span>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <ProfileValue
            icon={UserRound}
            label={spanish ? "Nombre" : "Name"}
            value={name || (spanish ? "Sin nombre registrado" : "No name on file")}
          />
          <ProfileValue icon={Mail} label="Email" value={email} />
          <ProfileValue
            icon={ShieldCheck}
            label={spanish ? "Rol en este negocio" : "Role in this business"}
            value={ROLE_DEFINITIONS[role].label}
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {spanish
              ? "El idioma, tema y tamaño de texto están en Preferencias de la app."
              : "Language, theme, and text size live under App preferences."}
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
            {spanish ? "Cerrar sesión" : "Sign out"}
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

import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const messageId = `${htmlFor ?? generatedId}-message`;

  return (
    <div className={cn("space-y-1.5", className)} data-error-anchor={error ? "" : undefined}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-neg">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-2xs text-neg" id={messageId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-2xs text-muted-foreground" id={messageId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

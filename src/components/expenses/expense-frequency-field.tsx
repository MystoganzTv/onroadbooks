"use client";

import { useId } from "react";
import { useLanguage } from "@/components/shell/language-provider";

export function ExpenseFrequencyField({ recurring, onChange }: {
  recurring: boolean;
  onChange: (recurring: boolean) => void;
}) {
  const id = useId();
  const { dictionary } = useLanguage();
  const copy = dictionary.expenses;

  return (
    <fieldset className="space-y-2 rounded-md border border-border bg-surface-sunken p-3" aria-describedby={`${id}-hint`}>
      <legend className="px-1 text-sm font-medium">{copy.expenseFrequency}</legend>
      <div className="grid grid-cols-2 gap-2">
        {[{ value: false, label: copy.oneTimeExpense }, { value: true, label: copy.monthlyExpense }].map((option) => (
          <label key={String(option.value)} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${recurring === option.value ? "border-primary bg-primary/10" : "border-border"}`}>
            <input
              type="radio"
              name={id}
              value={String(option.value)}
              checked={recurring === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 accent-primary"
            />
            {option.label}
          </label>
        ))}
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {recurring ? copy.recurringDescription : copy.oneTimeDescription}
      </p>
    </fieldset>
  );
}

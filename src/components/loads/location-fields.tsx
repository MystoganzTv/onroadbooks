"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, MapPin } from "lucide-react";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

interface LocationSuggestion {
  city: string;
  state: string;
  country: "US" | "CA";
}

interface LocationReview {
  valid: boolean;
  stateValid: boolean;
  alternatives: LocationSuggestion[];
}

interface LocationResponse {
  results: LocationSuggestion[];
  review: LocationReview | null;
}

interface LocationFieldsProps {
  id: string;
  label: string;
  city: string;
  state: string;
  cityError?: string;
  stateError?: string;
  enabled: boolean;
  manualConfirmed: boolean;
  onCityChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onManualConfirmedChange: (value: boolean) => void;
}

function warningText(city: string, state: string, review: LocationReview, copy: ReturnType<typeof useLanguage>["dictionary"]["loads"]): string {
  const stateCode = state.trim().toUpperCase();
  if (!review.stateValid) {
    return interpolate(copy.invalidRegion, { code: stateCode || copy.invalidRegionCode });
  }
  const alternatives = [...new Set(review.alternatives.map((location) => location.state))];
  if (alternatives.length > 0) {
    return interpolate(copy.cityListedElsewhere, { city: city.trim(), alternatives: alternatives.join(" / "), state: stateCode });
  }
  return interpolate(copy.couldNotVerify, { city: city.trim(), state: stateCode });
}

export function LocationFields({
  id,
  label,
  city,
  state,
  cityError,
  stateError,
  enabled,
  manualConfirmed,
  onCityChange,
  onStateChange,
  onManualConfirmedChange,
}: LocationFieldsProps) {
  const { dictionary } = useLanguage();
  const copy = dictionary.loads;
  const listId = `${id}-suggestions`;
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<LocationSuggestion[]>([]);
  const [review, setReview] = React.useState<LocationReview | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  React.useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }
    onManualConfirmedChange(false);
  }, [enabled, onManualConfirmedChange]);

  React.useEffect(() => {
    if (!enabled || city.trim().length < 2) {
      setResults([]);
      setReview(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: city.trim(), limit: "8" });
        if (state.trim().length === 2) params.set("state", state.trim().toUpperCase());
        const response = await fetch(`/api/locations?${params}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Location lookup failed");
        const data = (await response.json()) as LocationResponse;
        setResults(data.results);
        setReview(data.review);
        setActiveIndex(data.results.length > 0 ? 0 : -1);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setReview(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [city, enabled, state]);

  function resetManualConfirmation() {
    if (manualConfirmed) onManualConfirmedChange(false);
  }

  function choose(location: LocationSuggestion) {
    onCityChange(location.city);
    onStateChange(location.state);
    onManualConfirmedChange(false);
    setReview({ valid: true, stateValid: true, alternatives: [location] });
    setOpen(false);
  }

  function handleCityKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showResults = open && city.trim().length >= 2;
  const showWarning =
    city.trim().length >= 2 && state.trim().length === 2 && review && !review.valid;
  const alternatives = review?.alternatives.filter((location) => location.state !== state) ?? [];

  return (
    <>
      <Field
        label={label}
        htmlFor={`${id}-city`}
        required
        error={cityError}
        className="sm:col-span-2"
      >
        <Popover open={showResults} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div className="relative">
              <Input
                id={`${id}-city`}
                value={city}
                onChange={(event) => {
                  resetManualConfirmation();
                  onCityChange(event.target.value);
                  setOpen(event.target.value.trim().length >= 2);
                }}
                onFocus={() => {
                  if (city.trim().length >= 2) setOpen(true);
                }}
                onKeyDown={handleCityKeyDown}
                placeholder={id.includes("origin") ? "Austell" : "Baltimore"}
                autoComplete="off"
                aria-autocomplete="list"
                aria-controls={listId}
                aria-expanded={showResults}
                aria-activedescendant={
                  showResults && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
                }
                aria-invalid={Boolean(cityError)}
                className="pr-8"
                required
              />
              {loading ? (
                <Loader2
                  className="pointer-events-none absolute right-2.5 top-2.5 size-4 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : review?.valid ? (
                <Check
                  className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-pos"
                  aria-label={copy.verifiedLocation}
                />
              ) : null}
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            sideOffset={4}
            className="w-[min(22rem,calc(100vw-2rem))] p-1"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <div id={listId} role="listbox" aria-label={interpolate(copy.suggestions, { label })}>
              {results.length > 0 ? (
                results.map((location, index) => (
                  <button
                    key={`${location.country}-${location.state}-${location.city}`}
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm outline-none",
                      index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(location)}
                  >
                    <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{location.city}</span>
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                      {location.state} · {location.country}
                    </span>
                  </button>
                ))
              ) : loading ? (
                <p className="px-2.5 py-3 text-xs text-muted-foreground">{copy.searchingLocations}</p>
              ) : (
                <p className="px-2.5 py-3 text-xs text-muted-foreground">
                  {copy.noMatchingLocation}
                </p>
              )}
            </div>
            <p className="border-t border-border px-2.5 pt-1.5 text-[10px] text-muted-foreground">
              Data ©{" "}
              <a
                href="https://github.com/dr5hn/countries-states-cities-database"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                dr5hn
              </a>{" "}
              · ODbL 1.0
            </p>
          </PopoverContent>
        </Popover>

        {showWarning ? (
          <div
            className="flex gap-2 rounded-md border border-warn/35 bg-warn-subtle px-2.5 py-2"
            role="status"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
            <div className="min-w-0 text-2xs leading-relaxed">
              <p className="text-foreground">
                {warningText(city, state, review, copy)}{" "}
                {manualConfirmed ? copy.manualSaved : copy.chooseOrConfirm}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {alternatives.slice(0, 3).map((location) => (
                  <Button
                    key={`${location.country}-${location.state}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-2xs"
                    onClick={() => choose(location)}
                  >
                    {interpolate(copy.useState, { state: location.state })}
                  </Button>
                ))}
                {!manualConfirmed && review.stateValid ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-2xs"
                    onClick={() => onManualConfirmedChange(true)}
                  >
                    {copy.keepEntered}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Field>

      <Field label={copy.stateCode} htmlFor={`${id}-state`} required error={stateError}>
        <Input
          id={`${id}-state`}
          value={state}
          onChange={(event) => {
            resetManualConfirmation();
            onStateChange(event.target.value.toUpperCase().slice(0, 2));
          }}
          placeholder={id.includes("origin") ? "GA" : "MD"}
          autoComplete="off"
          maxLength={2}
          aria-invalid={Boolean(stateError)}
          required
        />
      </Field>
    </>
  );
}

import "server-only";

import {
  getAllCitiesOfCountry,
  getStatesOfCountry,
  type ICity,
} from "@countrystatecity/countries";

const DEFAULT_RESULT_LIMIT = 8;
const MAX_RESULT_LIMIT = 12;

type SupportedCountry = "US" | "CA";

export interface LocationSuggestion {
  city: string;
  state: string;
  country: SupportedCountry;
}

export interface LocationReview {
  valid: boolean;
  stateValid: boolean;
  alternatives: LocationSuggestion[];
}

interface IndexedLocation extends LocationSuggestion {
  cityKey: string;
  labelKey: string;
}

interface LocationIndex {
  locations: IndexedLocation[];
  stateCodes: Set<string>;
}

let indexPromise: Promise<LocationIndex> | null = null;

/** Normalize user-entered place names without changing the value that is saved. */
function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toIndexedLocation(city: ICity): IndexedLocation | null {
  const country = city.country_code;
  if (country !== "US" && country !== "CA") return null;
  const state = city.state_code.toUpperCase();
  const cityKey = searchKey(city.name);
  if (!cityKey || state.length !== 2) return null;
  return {
    city: city.name,
    state,
    country,
    cityKey,
    labelKey: `${cityKey} ${state.toLocaleLowerCase("en-US")}`,
  };
}

async function buildLocationIndex(): Promise<LocationIndex> {
  const [usCities, caCities, usStates, caStates] = await Promise.all([
    getAllCitiesOfCountry("US"),
    getAllCitiesOfCountry("CA"),
    getStatesOfCountry("US"),
    getStatesOfCountry("CA"),
  ]);

  const seen = new Set<string>();
  const locations: IndexedLocation[] = [];
  for (const raw of [...usCities, ...caCities]) {
    const location = toIndexedLocation(raw);
    if (!location) continue;
    const key = `${location.country}:${location.state}:${location.cityKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push(location);
  }

  const stateCodes = new Set(
    [...usStates, ...caStates]
      .map((state) => state.iso2.trim().toUpperCase())
      .filter((state) => state.length === 2),
  );

  return { locations, stateCodes };
}

async function getLocationIndex(): Promise<LocationIndex> {
  indexPromise ??= buildLocationIndex();
  return indexPromise;
}

function publicLocation(location: IndexedLocation): LocationSuggestion {
  return {
    city: location.city,
    state: location.state,
    country: location.country,
  };
}

export async function searchLocations(
  query: string,
  stateHint = "",
  requestedLimit = DEFAULT_RESULT_LIMIT,
): Promise<LocationSuggestion[]> {
  const queryKey = searchKey(query).slice(0, 80);
  if (queryKey.length < 2) return [];

  const stateKey = stateHint.trim().toUpperCase().slice(0, 2);
  const limit = Math.min(MAX_RESULT_LIMIT, Math.max(1, Math.floor(requestedLimit)));
  const { locations } = await getLocationIndex();

  return locations
    .map((location) => {
      let rank = Number.POSITIVE_INFINITY;
      if (location.cityKey === queryKey) rank = 0;
      else if (location.cityKey.startsWith(queryKey)) rank = 1;
      else if (location.cityKey.split(" ").some((word) => word.startsWith(queryKey))) rank = 2;
      else if (location.cityKey.includes(queryKey)) rank = 3;
      else if (location.labelKey.startsWith(queryKey)) rank = 4;
      if (!Number.isFinite(rank)) return null;
      if (stateKey && location.state === stateKey) rank -= 0.25;
      return { location, rank };
    })
    .filter((match): match is { location: IndexedLocation; rank: number } => match !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.location.city.length - b.location.city.length ||
        a.location.city.localeCompare(b.location.city) ||
        a.location.state.localeCompare(b.location.state),
    )
    .slice(0, limit)
    .map(({ location }) => publicLocation(location));
}

export async function reviewLocation(city: string, state: string): Promise<LocationReview> {
  const cityKey = searchKey(city);
  const stateKey = state.trim().toUpperCase();
  const { locations, stateCodes } = await getLocationIndex();
  const exactCityMatches = locations.filter((location) => location.cityKey === cityKey);

  return {
    valid:
      cityKey.length > 0 &&
      stateCodes.has(stateKey) &&
      exactCityMatches.some((location) => location.state === stateKey),
    stateValid: stateCodes.has(stateKey),
    alternatives: exactCityMatches.slice(0, MAX_RESULT_LIMIT).map(publicLocation),
  };
}

export function locationReviewMessage(
  city: string,
  state: string,
  review: LocationReview,
): string | null {
  if (review.valid) return null;
  const entered = `${city.trim()}, ${state.trim().toUpperCase()}`;
  if (!review.stateValid) {
    return `${state.trim().toUpperCase() || "That code"} is not a US state or Canadian province.`;
  }
  const alternatives = [...new Set(review.alternatives.map((location) => location.state))];
  if (alternatives.length > 0) {
    return `${city.trim()} is listed in ${alternatives.join(" or ")}, not ${state.trim().toUpperCase()}.`;
  }
  return `We could not verify ${entered}.`;
}

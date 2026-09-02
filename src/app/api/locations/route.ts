import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { reviewLocation, searchLocations } from "@/lib/locations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const state = (url.searchParams.get("state") ?? "").trim().toUpperCase().slice(0, 2);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 8);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 8;

  if (query.length < 2) {
    return NextResponse.json({ results: [], review: null });
  }

  const [results, review] = await Promise.all([
    searchLocations(query, state, limit),
    state.length === 2 ? reviewLocation(query, state) : Promise.resolve(null),
  ]);

  return NextResponse.json(
    { results, review },
    { headers: { "Cache-Control": "private, max-age=86400" } },
  );
}

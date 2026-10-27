import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeLoad, type FreightAnalysis } from "../onroad-ai/analyze";
import { brokerMessage } from "../onroad-ai/broker-message";
import { checkCompatibility } from "../onroad-ai/equipment";
import { contributionPerMileForDisplay, renderAnalysis, renderNegotiation } from "../onroad-ai/format";
import { emptyFacts, mergeFacts, type LoadFacts } from "../onroad-ai/load-facts";
import { driverProfileSchema, parseProfile, type DriverProfile } from "../onroad-ai/profile";

type Ok = Extract<FreightAnalysis, { status: "OK" }>;

const base = (overrides: Partial<DriverProfile> = {}): DriverProfile =>
  driverProfileSchema.parse({
    truckType: "BOX_TRUCK",
    truckLengthFt: 26,
    cargoCapacityLbs: 10_000,
    hasLiftgate: true,
    mpg: 8.5,
    fuelPrice: 6.7,
    dispatchValue: 5,
    factoringValue: 3.5,
    maintenancePerMile: 0.2,
    minRatePerTotalMile: 1.8,
    ...overrides,
  });

const load = (overrides: Partial<LoadFacts> = {}) =>
  mergeFacts(emptyFacts(), { loadedMiles: 1_400, deadheadPickupMiles: 120, grossRate: 2_800, ...overrides });

function ok(profile: DriverProfile, facts: LoadFacts, needOffer = true): Ok {
  const analysis = analyzeLoad(profile, facts, { needOffer });
  assert.equal(analysis.status, "OK", JSON.stringify(analysis));
  return analysis as Ok;
}

describe("mileage and deadhead", () => {
  it("total miles = loaded + deadhead to pickup + deadhead after delivery", () => {
    const a = ok(base(), load({ deadheadAfterMiles: 80 }));
    assert.equal(a.estimate.totalMiles, 1_600);
    assert.equal(a.estimate.deadheadMiles, 200);
  });
  it("never invents a return leg", () => {
    const a = ok(base(), load());
    assert.equal(a.estimate.deadheadAfterMiles, 0);
    assert.equal(a.estimate.totalMiles, 1_520);
  });
  it("loaded RPM and real RPM are different numbers", () => {
    const a = ok(base(), load());
    assert.equal(a.estimate.grossPerLoadedMile, 2);
    assert.ok(Math.abs(a.estimate.grossPerTotalMile - 2_800 / 1_520) < 1e-12);
  });
});

describe("direct costs", () => {
  it("fuel = total miles / MPG x price", () => {
    const a = ok(base(), load());
    assert.equal(a.estimate.fuelCost, Math.round((1_520 / 8.5) * 6.7 * 100) / 100);
  });
  it("percentage fees are a share of gross; flat fees are dollars", () => {
    assert.equal(ok(base(), load()).estimate.dispatch, 140);
    assert.equal(ok(base(), load()).estimate.factoring, 98);
    const flat = ok(base({ dispatchMode: "AMOUNT", dispatchValue: 125, factoringMode: "AMOUNT", factoringValue: 30 }), load());
    assert.equal(flat.estimate.dispatch, 125);
    assert.equal(flat.estimate.factoring, 30);
  });
  it("tolls from the load win over the profile default; both are deducted", () => {
    assert.equal(ok(base({ defaultTolls: 40 }), load()).estimate.tolls, 40);
    const stated = ok(base({ defaultTolls: 40 }), load({ tolls: 12.5 }));
    assert.equal(stated.estimate.tolls, 12.5);
    assert.equal(stated.estimate.contributionProfit, Math.round((2_800 - stated.estimate.fuelCost - 140 - 98 - 12.5) * 100) / 100);
  });
  it("keeps maintenance out of the contribution and on its own line", () => {
    const a = ok(base(), load());
    assert.equal(a.estimate.maintenanceAllocation, 304);
    assert.equal(a.estimate.contributionAfterMaintenance, Math.round((a.estimate.contributionProfit - 304) * 100) / 100);
    assert.ok(!a.estimate.lines.some((line) => line.key === "maintenance"));
  });
});

describe("classification, score and the operational minimum", () => {
  it("rates by contribution per TOTAL mile against the user's own thresholds", () => {
    assert.equal(ok(base(), load({ grossRate: 2_800 })).estimate.score.rating, "MARGINAL");
    assert.equal(ok(base(), load({ grossRate: 3_100 })).estimate.score.rating, "GOOD");
    assert.equal(ok(base(), load({ grossRate: 3_600 })).estimate.score.rating, "GREAT");
    assert.equal(ok(base(), load({ grossRate: 2_100 })).estimate.score.rating, "BAD");
    const strict = base({ ratingGreat: 2, ratingGood: 1.5, ratingMarginal: 1 });
    assert.equal(ok(strict, load({ grossRate: 3_100 })).estimate.score.rating, "MARGINAL");
  });
  it("scores 0-100 with the 50/30/20 split and a band", () => {
    const a = ok(base(), load());
    const parts = a.estimate.score.components.map((part) => part.max);
    assert.deepEqual(parts, [50, 30, 20]);
    assert.ok(a.estimate.score.score >= 0 && a.estimate.score.score <= 100);
    assert.equal(a.scoreBand, "Solid");
  });
  it("the configurable deadhead warning moves the deadhead points", () => {
    const loose = ok(base({ deadheadWarnPct: 40 }), load({ deadheadPickupMiles: 400 }));
    const tight = ok(base({ deadheadWarnPct: 10 }), load({ deadheadPickupMiles: 400 }));
    assert.ok(loose.estimate.score.components[2].points > tight.estimate.score.components[2].points);
  });
  it("a GOOD load can still fail the operational minimum, and both are shown", () => {
    const profile = base({ minRatePerTotalMile: 2.5 });
    const a = ok(profile, load({ grossRate: 3_100 }));
    assert.equal(a.estimate.score.rating, "GOOD");
    assert.equal(a.estimate.operationalMinimum.meets, false);
    assert.equal(a.decision, "NEGOTIATE");
    const text = renderAnalysis(a, "en");
    assert.match(text, /CLASSIFICATION: \*GOOD\*/);
    assert.match(text, /short of your \$2\.50\/total mi/);
  });
  it("passing the minimum alone never makes it a TAKE", () => {
    const a = ok(base({ minRatePerTotalMile: 1 }), load({ grossRate: 2_100 }));
    assert.equal(a.estimate.operationalMinimum.meets, true);
    assert.equal(a.estimate.score.rating, "BAD");
    assert.equal(a.decision, "PASS");
  });
  it("prints contribution/mi so it never reads as the next band", () => {
    const a = ok(base(), load());
    assert.equal(a.estimate.score.rating, "MARGINAL");
    assert.equal(contributionPerMileForDisplay(a), 0.89);
  });
});

describe("negotiation", () => {
  it("ASK >= TARGET >= WALK AWAY, and the counter never lands under the floor", () => {
    const a = ok(base(), load({ grossRate: 2_500 }));
    const n = a.negotiation;
    assert.ok(n.ask.rate >= n.target.rate && n.target.rate >= n.walkAway.rate);
    assert.ok(n.ask.rate >= a.estimate.operationalMinimum.rate);
    assert.equal(n.ask.rate % 25, 0);
    assert.ok(Math.abs(n.walkAway.perTotalMile - n.walkAway.rate / 1_520) < 1e-12);
    assert.ok(Math.abs(n.walkAway.perLoadedMile - n.walkAway.rate / 1_400) < 1e-12);
  });
  it("works without an offer ('what should I ask?')", () => {
    const a = ok(base(), load({ grossRate: null }), false);
    assert.equal(a.hasOffer, false);
    assert.equal(a.decision, null);
    assert.ok(a.negotiation.ask.rate > 0);
    assert.match(renderNegotiation(a, "es"), /PEDIR/);
  });
  it("says no counter is needed at GREAT above the minimum", () => {
    const a = ok(base(), load({ grossRate: 3_800 }));
    assert.equal(a.negotiation.counterNeeded, false);
    assert.equal(a.decision, "TAKE");
  });
  it("broker message uses the ASK, never the walk-away, and never accepts", () => {
    const a = ok(base(), load({ grossRate: 2_500, brokerContact: "Maria Lopez", origin: { city: "Chicago", state: "IL" }, destination: { city: "Miami", state: "FL" } }));
    const text = brokerMessage(a);
    assert.match(text, /^Hi Maria,/);
    assert.ok(text.includes(`$${a.negotiation.ask.rate.toLocaleString("en-US")}`));
    assert.ok(!text.includes(a.negotiation.walkAway.rate.toLocaleString("en-US")));
    assert.doesNotMatch(text, /\b(accept|booked|confirm the load)\b/i);
  });
});

describe("missing and invalid data", () => {
  it("asks for loaded miles, then deadhead, then the rate -- never guesses", () => {
    assert.deepEqual(analyzeLoad(base(), mergeFacts(emptyFacts(), { grossRate: 2_800 })), { status: "NEEDS_INFO", missing: ["loadedMiles", "deadheadPickupMiles"] });
    assert.deepEqual(analyzeLoad(base(), mergeFacts(emptyFacts(), { loadedMiles: 900, deadheadPickupMiles: 0 })), { status: "NEEDS_INFO", missing: ["grossRate"] });
  });
  it("0 deadhead is an answer, not a missing value", () => {
    assert.equal(analyzeLoad(base(), load({ deadheadPickupMiles: 0 })).status, "OK");
  });
  it("refuses to price with an unfinished profile", () => {
    const blank = driverProfileSchema.parse({});
    assert.deepEqual(analyzeLoad(blank, load()), { status: "NEEDS_PROFILE", missingProfile: ["mpg", "fuelPrice", "dispatchValue", "factoringValue", "minRatePerTotalMile"] });
  });
  it("rejects nonsense in facts instead of pricing it", () => {
    const before = load();
    assert.deepEqual(mergeFacts(before, { loadedMiles: -5 }), before);
    assert.deepEqual(mergeFacts(before, { grossRate: Number.NaN }), before);
  });
  it("repairs a corrupt stored profile field to 'not set', never to a default", () => {
    const repaired = parseProfile({ mpg: 500, fuelPrice: 4.1, locale: "es" });
    assert.equal(repaired.mpg, null);
    assert.equal(repaired.fuelPrice, 4.1);
    assert.equal(repaired.locale, "es");
  });
});

describe("equipment compatibility", () => {
  it("never treats a box truck as a 53 ft dry van", () => {
    const a = ok(base(), load({ equipment: "DRY_VAN", equipmentLengthFt: 53 }));
    assert.equal(a.compatibility.status, "INCOMPATIBLE");
    assert.equal(a.decision, "PASS");
  });
  it("flags overweight and missing liftgate as blocking", () => {
    assert.equal(checkCompatibility(load({ equipment: "BOX_TRUCK", weightLbs: 12_000 }), base()).status, "INCOMPATIBLE");
    assert.equal(checkCompatibility(load({ equipment: "BOX_TRUCK", weightLbs: 5_000, liftgateRequired: true }), base({ hasLiftgate: false })).status, "INCOMPATIBLE");
  });
  it("unknown equipment or weight is UNVERIFIED, never OK", () => {
    assert.equal(checkCompatibility(load(), base()).status, "UNVERIFIED");
    assert.equal(checkCompatibility(load({ equipment: "BOX_TRUCK", weightLbs: 5_000 }), base()).status, "OK");
  });
  it("hotshot and flatbed are not interchangeable without confirmation", () => {
    const status = checkCompatibility(load({ equipment: "FLATBED", weightLbs: 5_000 }), base({ truckType: "HOTSHOT" }));
    assert.equal(status.status, "UNVERIFIED");
    assert.equal(status.issues[0].kind, "EQUIPMENT_CONFIRM");
  });
});

describe("rendering", () => {
  it("fits one WhatsApp message and keeps every section", () => {
    const text = renderAnalysis(ok(base(), load()), "en");
    assert.ok(text.length < 4_096);
    for (const label of ["OFFER", "LOADED", "DEADHEAD", "TOTAL", "RPM LOADED", "RPM TOTAL", "LOAD CONTRIBUTION", "Maintenance", "AFTER MAINTENANCE", "SCORE", "CLASSIFICATION", "ASK", "TARGET", "WALK AWAY", "FINAL DECISION"]) {
      assert.ok(text.includes(label), `missing ${label}`);
    }
    assert.doesNotMatch(text, /take-home|profit you keep/i);
  });
  it("renders in Spanish", () => {
    const text = renderAnalysis(ok(base(), load()), "es");
    assert.match(text, /CONTRIBUCIÓN DE LA CARGA/);
    assert.match(text, /DECISIÓN FINAL: NEGOCIAR/);
  });
});

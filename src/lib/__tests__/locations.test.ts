import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewLocation, searchLocations } from "../locations";

describe("load location verification", () => {
  it("accepts the correct Baltimore and Austell state pairs", async () => {
    const [baltimore, austell] = await Promise.all([
      reviewLocation("Baltimore", "MD"),
      reviewLocation("Austell", "GA"),
    ]);

    assert.equal(baltimore.valid, true);
    assert.equal(austell.valid, true);
  });

  it("suggests the known states when a city is paired incorrectly", async () => {
    const [baltimore, austell] = await Promise.all([
      reviewLocation("Baltimore", "FL"),
      reviewLocation("Austell", "VA"),
    ]);

    assert.equal(baltimore.valid, false);
    assert.deepEqual(
      [...new Set(baltimore.alternatives.map((location) => location.state))].sort(),
      ["MD", "OH"],
    );
    assert.equal(austell.valid, false);
    assert.deepEqual(austell.alternatives.map((location) => location.state), ["GA"]);
  });

  it("returns distinct suggestions for repeated city names", async () => {
    const results = await searchLocations("Baltimore", "FL");
    const states = results
      .filter((location) => location.city === "Baltimore")
      .map((location) => location.state)
      .sort();

    assert.deepEqual(states, ["MD", "OH"]);
  });

  it("allows the UI to distinguish an unknown city from an invalid state code", async () => {
    const [unknownCity, invalidState] = await Promise.all([
      reviewLocation("OnRoad Test Yard", "MD"),
      reviewLocation("Baltimore", "ZZ"),
    ]);

    assert.equal(unknownCity.valid, false);
    assert.equal(unknownCity.stateValid, true);
    assert.deepEqual(unknownCity.alternatives, []);
    assert.equal(invalidState.stateValid, false);
  });
});

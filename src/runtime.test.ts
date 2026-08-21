import assert from "node:assert/strict";
import test from "node:test";
import { dataQuality } from "./runtime";

test("Studio publishes truthful deterministic coverage metadata", () => {
  const quality = dataQuality();
  assert.equal(quality.personaCount, 64);
  assert.ok(Number(quality.roleProfiles) >= 10);
  assert.ok(Number(quality.scenarioCount) >= 20);
  assert.deepEqual(quality.eventDistribution, { normal: 85, minor: 10, significant: 4, critical: 1 });
});


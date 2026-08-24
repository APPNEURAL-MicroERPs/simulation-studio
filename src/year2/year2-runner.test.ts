import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, createYear2StorySignature } from "./year2-runner";

test("canonicalJson sorts nested object keys while preserving array order", () => {
  assert.equal(
    canonicalJson({ z: 3, a: { y: [2, 1], b: true } }),
    '{"a":{"b":true,"y":[2,1]},"z":3}',
  );
});

test("Year 2 story signatures are stable across object key order", async () => {
  const secret = "test-simulation-secret-at-least-32-characters";
  const first = await createYear2StorySignature(secret, "SIM-001", {
    id: "Y2-2027-04-001",
    body: { beta: 2, alpha: 1 },
  });
  const reordered = await createYear2StorySignature(secret, "SIM-001", {
    body: { alpha: 1, beta: 2 },
    id: "Y2-2027-04-001",
  });
  assert.equal(first, reordered);
});

test("Year 2 story signatures are bound to the run and story payload", async () => {
  const secret = "test-simulation-secret-at-least-32-characters";
  const story = { id: "Y2-2027-04-001", intent: "Create a lead" };
  const original = await createYear2StorySignature(secret, "SIM-001", story);
  const otherRun = await createYear2StorySignature(secret, "SIM-002", story);
  const changedStory = await createYear2StorySignature(secret, "SIM-001", { ...story, intent: "Create an invoice" });
  assert.notEqual(original, otherRun);
  assert.notEqual(original, changedStory);
});

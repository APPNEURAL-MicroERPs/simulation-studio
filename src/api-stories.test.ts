import assert from "node:assert/strict";
import test from "node:test";
import { februaryApiStories, sixMonthStoryline } from "./api-stories";

test("six-month storyline covers February through July 2026", () => {
  assert.deepEqual(sixMonthStoryline.map((item) => item.month), [
    "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
  ]);
});

test("February API catalog is deterministic and uses portal routes", () => {
  assert.equal(new Set(februaryApiStories.map((story) => story.id)).size, februaryApiStories.length);
  assert.ok(februaryApiStories.some((story) => story.steps.some((step) => step.expectedStatus === 403)));
  for (const story of februaryApiStories) {
    assert.match(story.companyTime, /^2026-02-/u);
    assert.ok(story.actorId.startsWith("EMP-"));
    assert.ok(story.preconditions.length > 0);
    assert.ok(story.expectedState.length > 0);
    for (const step of story.steps) {
      assert.ok(step.path.startsWith("/api/"));
      assert.equal(step.path.includes("simulation"), false);
      assert.ok([200, 201, 202, 403].includes(step.expectedStatus));
    }
  }
});

test("positive mutation stories require API and entity assertions", () => {
  for (const story of februaryApiStories.filter((item) => item.steps.some((step) => step.expectedStatus < 300 && step.method !== "GET"))) {
    assert.ok(story.assertions.includes("api_response"));
    assert.ok(story.assertions.includes("entity_state"));
    assert.ok(story.steps.some((step) => Boolean(step.verifyListPath)));
  }
});

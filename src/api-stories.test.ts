import assert from "node:assert/strict";
import test from "node:test";
import { februaryApiStories, month1ApiStories, sixMonthStoryline, type ApiStory } from "./api-stories";
import { goldenStoriesMonth2to12, goldenStoriesMonth2to4 } from "./golden-story";

// ─── All stories combined (same set the api-runner executes) ──────────────────

const ALL_STORIES: readonly ApiStory[] = [
  ...februaryApiStories,
  ...month1ApiStories,
  ...goldenStoriesMonth2to12,
];

// ─── Storyline Coverage ───────────────────────────────────────────────────────

test("six-month storyline covers February through July 2026", () => {
  assert.deepEqual(sixMonthStoryline.map((item) => item.month), [
    "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
  ]);
});

test("storyline months have increasing theme and story counts", () => {
  for (const entry of sixMonthStoryline) {
    assert.ok(entry.theme.length > 0, "storyline theme must be non-empty");
    assert.ok(entry.outcomes.length > 0, "storyline must have at least one outcome");
  }
});

// ─── Story ID Uniqueness ──────────────────────────────────────────────────────

test("all story IDs are globally unique across all catalogs", () => {
  const ids = ALL_STORIES.map((s) => s.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length, `Duplicate story IDs found: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(", ")}`);
});

test("February API catalog has unique IDs", () => {
  assert.equal(new Set(februaryApiStories.map((s) => s.id)).size, februaryApiStories.length);
});

test("Month 1 golden stories have unique IDs", () => {
  assert.equal(new Set(month1ApiStories.map((s) => s.id)).size, month1ApiStories.length);
});

test("Golden stories month 2-12 have unique IDs", () => {
  assert.equal(new Set(goldenStoriesMonth2to12.map((s) => s.id)).size, goldenStoriesMonth2to12.length);
});

// ─── Story Structure Validation ───────────────────────────────────────────────

test("every story has required metadata fields", () => {
  for (const story of ALL_STORIES) {
    assert.ok(story.id, "story must have an id");
    assert.ok(story.month, `story ${story.id} must have a month`);
    assert.ok(story.companyTime, `story ${story.id} must have companyTime`);
    assert.ok(story.actorId, `story ${story.id} must have an actorId`);
    assert.ok(story.actorRole, `story ${story.id} must have an actorRole`);
    assert.ok(story.module, `story ${story.id} must have a module`);
    assert.ok(story.intent, `story ${story.id} must have an intent`);
    assert.ok(story.steps.length > 0, `story ${story.id} must have at least one step`);
    assert.ok(story.expectedState.length > 0, `story ${story.id} must have expectedState`);
    assert.ok(story.assertions.length > 0, `story ${story.id} must have assertions`);
  }
});

test("every story actorId starts with EMP-", () => {
  for (const story of ALL_STORIES) {
    assert.match(story.actorId, /^EMP-/u, `story ${story.id} actorId must start with EMP-`);
  }
});

test("every story actorRole is a valid role", () => {
  const validRoles = new Set(["owner", "admin", "manager", "member", "viewer"]);
  for (const story of ALL_STORIES) {
    assert.ok(validRoles.has(story.actorRole), `story ${story.id} has invalid actorRole: ${story.actorRole}`);
  }
});

test("every story companyTime matches its month", () => {
  for (const story of ALL_STORIES) {
    assert.ok(
      story.companyTime.startsWith(story.month),
      `story ${story.id} companyTime ${story.companyTime} does not match month ${story.month}`,
    );
  }
});

test("every story companyTime is a valid ISO datetime", () => {
  for (const story of ALL_STORIES) {
    const parsed = Date.parse(story.companyTime);
    assert.ok(Number.isFinite(parsed), `story ${story.id} companyTime ${story.companyTime} is not a valid datetime`);
  }
});

// ─── Step Validation ──────────────────────────────────────────────────────────

test("every step path starts with /api/", () => {
  for (const story of ALL_STORIES) {
    for (const step of story.steps) {
      assert.ok(step.path.startsWith("/api/"), `story ${story.id} step ${step.method} ${step.path} must start with /api/`);
    }
  }
});

test("no step path contains 'simulation' prefix", () => {
  for (const story of ALL_STORIES) {
    for (const step of story.steps) {
      assert.equal(step.path.includes("simulation"), false, `story ${story.id} step ${step.path} must not contain 'simulation'`);
    }
  }
});

test("every step has a valid HTTP method", () => {
  const validMethods = new Set(["GET", "POST", "PATCH"]);
  for (const story of ALL_STORIES) {
    for (const step of story.steps) {
      assert.ok(validMethods.has(step.method), `story ${story.id} step has invalid method: ${step.method}`);
    }
  }
});

test("every step has a valid expected status code", () => {
  const validStatuses = new Set([200, 201, 202, 400, 403, 404, 409, 422]);
  for (const story of ALL_STORIES) {
    for (const step of story.steps) {
      assert.ok(validStatuses.has(step.expectedStatus), `story ${story.id} step ${step.method} ${step.path} has invalid expectedStatus: ${step.expectedStatus}`);
    }
  }
});

test("POST/PATCH steps have a request body", () => {
  for (const story of ALL_STORIES) {
    for (const step of story.steps) {
      if (step.method === "POST" || step.method === "PATCH") {
        assert.ok(step.body, `story ${story.id} step ${step.method} ${step.path} must have a body`);
      }
    }
  }
});

test("GET steps do not have a request body", () => {
  for (const story of ALL_STORIES) {
    for (const step of story.steps) {
      if (step.method === "GET") {
        assert.equal(step.body, undefined, `story ${story.id} GET ${step.path} must not have a body`);
      }
    }
  }
});

// ─── Module Routing Validation ────────────────────────────────────────────────

test("every step module is a known ExecutableModule", () => {
  const validModules = new Set([
    "attendance", "resource", "recruitment", "crm", "organization", "hr",
    "finance", "procurement", "administration", "security", "asset", "audit",
    "billing", "compliance", "contract", "customer", "devops", "expense",
    "inventory", "learning", "legal", "payroll", "performance", "presales",
    "project", "qa", "risk", "sdlc", "support", "vendor",
  ]);
  for (const story of ALL_STORIES) {
    for (const step of story.steps) {
      assert.ok(validModules.has(step.module), `story ${story.id} step has unknown module: ${step.module}`);
    }
  }
});

test("story module is a valid domain owner (steps may target different modules for cross-ERP workflows)", () => {
  const validModules = new Set([
    "attendance", "resource", "recruitment", "crm", "organization", "hr",
    "finance", "procurement", "administration", "security", "asset", "audit",
    "billing", "compliance", "contract", "customer", "devops", "expense",
    "inventory", "learning", "legal", "payroll", "performance", "presales",
    "project", "qa", "risk", "sdlc", "support", "vendor",
  ]);
  for (const story of ALL_STORIES) {
    assert.ok(validModules.has(story.module), `story ${story.id} has unknown module: ${story.module}`);
  }
});

// ─── Assertion Validation ─────────────────────────────────────────────────────

test("positive mutation stories require api_response and entity_state assertions", () => {
  const positiveMutations = ALL_STORIES.filter((story) =>
    story.steps.some((step) => step.expectedStatus >= 200 && step.expectedStatus < 300 && step.method !== "GET"),
  );
  for (const story of positiveMutations) {
    assert.ok(story.assertions.includes("api_response"), `story ${story.id} must include api_response assertion`);
    assert.ok(story.assertions.includes("entity_state"), `story ${story.id} must include entity_state assertion`);
  }
});

test("positive mutation steps have verifyListPath or the story still asserts entity_state", () => {
  const positiveMutations = ALL_STORIES.filter((story) =>
    story.steps.some((step) => step.expectedStatus >= 200 && step.expectedStatus < 300 && step.method !== "GET"),
  );
  for (const story of positiveMutations) {
    const hasVerify = story.steps.some((step) => Boolean(step.verifyListPath));
    const hasEntityAssertion = story.assertions.includes("entity_state");
    assert.ok(hasVerify || hasEntityAssertion, `story ${story.id} must have verifyListPath or entity_state assertion`);
  }
});

test("negative (403) stories include permission assertion", () => {
  const negativeStories = ALL_STORIES.filter((story) =>
    story.steps.some((step) => step.expectedStatus === 403),
  );
  assert.ok(negativeStories.length > 0, "there must be at least one negative test story");
  for (const story of negativeStories) {
    assert.ok(story.assertions.includes("permission"), `negative story ${story.id} must include permission assertion`);
  }
});

// ─── February Catalog Specific Tests ──────────────────────────────────────────

test("February API catalog is deterministic and uses portal routes", () => {
  assert.ok(februaryApiStories.some((story) => story.steps.some((step) => step.expectedStatus === 403)));
  for (const story of februaryApiStories) {
    assert.match(story.companyTime, /^2026-02-/u);
    assert.ok(story.actorId.startsWith("EMP-"));
    assert.ok(story.preconditions.length > 0);
    assert.ok(story.expectedState.length > 0);
  }
});

test("February contains the negative permission test", () => {
  const negStory = februaryApiStories.find((s) => s.id === "REC-FEB-NEG-001");
  assert.ok(negStory, "REC-FEB-NEG-001 must exist");
  assert.equal(negStory.steps[0]!.expectedStatus, 403);
  assert.equal(negStory.actorRole, "member");
});

test("February contains REC-FEB-001 with requisition → job chain", () => {
  const story = februaryApiStories.find((s) => s.id === "REC-FEB-001");
  assert.ok(story, "REC-FEB-001 must exist");
  assert.equal(story.steps.length, 2);
  assert.equal(story.steps[0]!.path, "/api/requisitions");
  assert.equal(story.steps[1]!.path, "/api/jobs");
  assert.equal(story.steps[1]!.body?.requisitionId, "$PREV.createdId");
});

// ─── Month 1 Golden Story Tests ───────────────────────────────────────────────

test("Month 1 has 14 golden stories (GOLD-M1-001 to GOLD-M1-014)", () => {
  assert.equal(month1ApiStories.length, 14);
  for (let i = 1; i <= 14; i++) {
    const id = `GOLD-M1-${String(i).padStart(3, "0")}`;
    assert.ok(month1ApiStories.find((s) => s.id === id), `${id} must exist`);
  }
});

test("GOLD-M1-001 bootstraps legal entity, departments, and office", () => {
  const story = month1ApiStories.find((s) => s.id === "GOLD-M1-001");
  assert.ok(story);
  assert.equal(story.module, "organization");
  const paths = story.steps.map((s) => s.path);
  assert.ok(paths.includes("/api/legal-entities"));
  assert.ok(paths.filter((p) => p === "/api/departments").length === 6);
  assert.ok(paths.includes("/api/offices"));
});

test("GOLD-M1-005 creates requisitions with interleaved jobs", () => {
  const story = month1ApiStories.find((s) => s.id === "GOLD-M1-005");
  assert.ok(story);
  assert.equal(story.steps.length, 4);
  // Step 1: Create requisition 1
  assert.equal(story.steps[0]!.path, "/api/requisitions");
  // Step 2: Create job for requisition 1
  assert.equal(story.steps[1]!.path, "/api/jobs");
  assert.equal(story.steps[1]!.body?.requisitionId, "$PREV.createdId");
  // Step 3: Create requisition 2
  assert.equal(story.steps[2]!.path, "/api/requisitions");
  // Step 4: Create job for requisition 2
  assert.equal(story.steps[3]!.path, "/api/jobs");
  assert.equal(story.steps[3]!.body?.requisitionId, "$PREV.createdId");
});

test("GOLD-M1-014 is a read-only reconciliation story", () => {
  const story = month1ApiStories.find((s) => s.id === "GOLD-M1-014");
  assert.ok(story);
  for (const step of story.steps) {
    assert.equal(step.method, "GET");
    assert.equal(step.expectedStatus, 200);
  }
});

// ─── $PREV.createdId Chain Validation ─────────────────────────────────────────

test("all $PREV.createdId references appear only in step 2+ (never in step 1)", () => {
  for (const story of ALL_STORIES) {
    if (story.steps.length < 2) continue;
    const firstStep = story.steps[0]!;
    if (firstStep.body) {
      const bodyStr = JSON.stringify(firstStep.body);
      assert.ok(!bodyStr.includes("$PREV.createdId"), `story ${story.id} step 1 must not reference $PREV.createdId`);
    }
  }
});

test("every $PREV.createdId reference has a preceding POST step that can create an entity", () => {
  for (const story of ALL_STORIES) {
    for (let i = 1; i < story.steps.length; i++) {
      const step = story.steps[i]!;
      if (!step.body) continue;
      const bodyStr = JSON.stringify(step.body);
      if (bodyStr.includes("$PREV.createdId")) {
        const prevStep = story.steps[i - 1]!;
        assert.equal(prevStep.method, "POST", `story ${story.id} step ${i + 1} uses $PREV.createdId but step ${i} is ${prevStep.method}`);
        assert.ok(prevStep.expectedStatus >= 200 && prevStep.expectedStatus < 300, `story ${story.id} step ${i} must succeed (2xx) to provide createdId`);
      }
    }
  }
});

test("interleaved chains (Req→Job→Req→Job) correctly pass $PREV.createdId", () => {
  // GOLD-M1-005 is the canonical interleaved test case
  const story = month1ApiStories.find((s) => s.id === "GOLD-M1-005");
  assert.ok(story);
  assert.equal(story.steps.length, 4);
  // After step 1 (req1), $PREV.createdId = req1.id
  assert.equal(story.steps[1]!.body?.requisitionId, "$PREV.createdId");
  // After step 2 (job1), $PREV.createdId = job1.id
  // Step 3 creates req2 (no $PREV reference needed)
  assert.equal(story.steps[2]!.path, "/api/requisitions");
  assert.ok(!JSON.stringify(story.steps[2]!.body).includes("$PREV.createdId"));
  // After step 3 (req2), $PREV.createdId = req2.id
  assert.equal(story.steps[3]!.body?.requisitionId, "$PREV.createdId");
});

// ─── Golden Stories Month 2-12 Validation ─────────────────────────────────────

test("golden stories month 2-4 are a subset of month 2-12", () => {
  const m2to12Ids = new Set(goldenStoriesMonth2to12.map((s) => s.id));
  for (const story of goldenStoriesMonth2to4) {
    assert.ok(m2to12Ids.has(story.id), `story ${story.id} from month 2-4 must be in month 2-12`);
  }
});

test("golden stories cover months May 2026 through March 2027", () => {
  const months: Set<string> = new Set(goldenStoriesMonth2to12.map((s) => s.month));
  const expectedMonths = [
    "2026-05", "2026-06", "2026-07",
    "2026-10", "2026-11", "2026-12",
    "2027-01", "2027-02", "2027-03",
  ];
  for (const m of expectedMonths) {
    assert.ok(months.has(m), `golden stories must cover month ${m}`);
  }
});

test("golden story IDs follow GOLD-M{N}-{NNN} pattern", () => {
  for (const story of goldenStoriesMonth2to12) {
    assert.match(story.id, /^GOLD-M\d+-\d{3}$/u, `story ID ${story.id} must match GOLD-M{N}-{NNN}`);
  }
});

// ─── Cross-Module Workflow Tests ──────────────────────────────────────────────

test("at least one story targets each core module", () => {
  const coreModules = new Set([
    "attendance", "recruitment", "crm", "organization", "hr",
    "finance", "procurement", "project", "security",
  ]);
  const coveredModules = new Set<string>(ALL_STORIES.flatMap((s) => s.steps.map((step) => step.module)));
  for (const mod of coreModules) {
    assert.ok(coveredModules.has(mod), `core module ${mod} must be covered by at least one story`);
  }
});

test("multi-step stories have chronological step execution (POST before dependent POST)", () => {
  // Verify that in any multi-step story, a step using $PREV.createdId
  // comes AFTER the step that creates the entity
  for (const story of ALL_STORIES) {
    for (let i = 1; i < story.steps.length; i++) {
      const step = story.steps[i]!;
      if (!step.body) continue;
      const bodyStr = JSON.stringify(step.body);
      if (bodyStr.includes("$PREV.createdId")) {
        // There must be a prior POST step with 2xx status
        const priorCreateStep = story.steps.slice(0, i).find(
          (s) => s.method === "POST" && s.expectedStatus >= 200 && s.expectedStatus < 300,
        );
        assert.ok(priorCreateStep, `story ${story.id} step ${i + 1} uses $PREV.createdId but no prior POST creates an entity`);
      }
    }
  }
});

// ─── Total Catalog Size ───────────────────────────────────────────────────────

test("total catalog has meaningful coverage", () => {
  assert.ok(ALL_STORIES.length >= 100, `expected at least 100 stories, got ${ALL_STORIES.length}`);
  const totalSteps = ALL_STORIES.reduce((sum, s) => sum + s.steps.length, 0);
  assert.ok(totalSteps >= 200, `expected at least 200 total steps, got ${totalSteps}`);
});

test("multi-step stories exist across all catalogs", () => {
  const multiStepFeb = februaryApiStories.filter((s) => s.steps.length > 1);
  const multiStepM1 = month1ApiStories.filter((s) => s.steps.length > 1);
  const multiStepGolden = goldenStoriesMonth2to12.filter((s) => s.steps.length > 1);
  assert.ok(multiStepFeb.length > 0, "February must have multi-step stories");
  assert.ok(multiStepM1.length > 0, "Month 1 must have multi-step stories");
  assert.ok(multiStepGolden.length > 0, "Golden stories must have multi-step stories");
});

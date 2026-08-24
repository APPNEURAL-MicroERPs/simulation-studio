import assert from "node:assert/strict";
import test from "node:test";
import { substitutePrevRefs, entityId, isDuplicateConflict } from "./api-runner";

// ─── substitutePrevRefs ──────────────────────────────────────────────────────

test("substitutePrevRefs replaces $PREV.createdId at top level", () => {
  const body = { requisitionId: "$PREV.createdId", title: "Test" };
  const result = substitutePrevRefs(body, "abc-123");
  assert.equal(result.requisitionId, "abc-123");
  assert.equal(result.title, "Test");
});

test("substitutePrevRefs replaces $PREV.createdId in nested objects", () => {
  const body = { parent: { id: "$PREV.createdId" }, name: "test" };
  const result = substitutePrevRefs(body, "nested-id");
  assert.equal((result.parent as Record<string, unknown>).id, "nested-id");
  assert.equal(result.name, "test");
});

test("substitutePrevRefs replaces multiple $PREV.createdId references", () => {
  const body = { fk1: "$PREV.createdId", fk2: "$PREV.createdId", other: "value" };
  const result = substitutePrevRefs(body, "shared-id");
  assert.equal(result.fk1, "shared-id");
  assert.equal(result.fk2, "shared-id");
  assert.equal(result.other, "value");
});

test("substitutePrevRefs does not modify non-$PREV values", () => {
  const body = { name: "hello", count: 42, active: true, tags: ["a", "b"] };
  const result = substitutePrevRefs(body, "some-id");
  assert.deepEqual(result, body);
});

test("substitutePrevRefs handles empty body", () => {
  const result = substitutePrevRefs({}, "any-id");
  assert.deepEqual(result, {});
});

test("substitutePrevRefs handles deeply nested $PREV.createdId", () => {
  const body = { level1: { level2: { level3: { ref: "$PREV.createdId" } } } };
  const result = substitutePrevRefs(body, "deep-id");
  const l1 = result.level1 as Record<string, unknown>;
  const l2 = l1.level2 as Record<string, unknown>;
  const l3 = l2.level3 as Record<string, unknown>;
  assert.equal(l3.ref, "deep-id");
});

test("substitutePrevRefs preserves array values without modification", () => {
  const body = { items: ["$PREV.createdId", "other"], name: "test" };
  const result = substitutePrevRefs(body, "arr-id");
  // Arrays are not recursively processed — they are kept as-is
  assert.deepEqual(result.items, ["$PREV.createdId", "other"]);
  assert.equal(result.name, "test");
});

test("substitutePrevRefs with UUID-style IDs", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  const body = { invoiceRef: "$PREV.createdId" };
  const result = substitutePrevRefs(body, uuid);
  assert.equal(result.invoiceRef, uuid);
});

// ─── entityId ─────────────────────────────────────────────────────────────────

test("entityId extracts id from standard API response", () => {
  const payload = { data: { id: "entity-001", name: "Test" } };
  assert.equal(entityId(payload), "entity-001");
});

test("entityId returns null for null payload", () => {
  assert.equal(entityId(null), null);
});

test("entityId returns null for undefined payload", () => {
  assert.equal(entityId(undefined), null);
});

test("entityId returns null for non-object payload", () => {
  assert.equal(entityId("string"), null);
  assert.equal(entityId(42), null);
  assert.equal(entityId(true), null);
});

test("entityId returns null for array data", () => {
  const payload = { data: [{ id: "first" }, { id: "second" }] };
  assert.equal(entityId(payload), null);
});

test("entityId returns null when data is missing", () => {
  const payload = { status: "ok" };
  assert.equal(entityId(payload), null);
});

test("entityId returns null when id is missing from data", () => {
  const payload = { data: { name: "No ID here" } };
  assert.equal(entityId(payload), null);
});

test("entityId returns null when id is empty string", () => {
  const payload = { data: { id: "", name: "Empty" } };
  assert.equal(entityId(payload), null);
});

test("entityId returns null when id is not a string", () => {
  const payload = { data: { id: 123 } };
  assert.equal(entityId(payload), null);
});

test("entityId handles nested data object correctly", () => {
  const payload = { data: { id: "nested-entity", nested: { id: "should-not-extract" } } };
  assert.equal(entityId(payload), "nested-entity");
});

// ─── Idempotent Replay Detection ─────────────────────────────────────────────

test("isDuplicateConflict recognizes nested duplicate error envelopes", () => {
  assert.equal(isDuplicateConflict({
    error: {
      code: "DUPLICATE_EMPLOYEE",
      message: "a employee with key 'EMP-Y2-009' already exists in this tenant",
    },
  }, 422), true);
});

test("isDuplicateConflict recognizes nested conflict messages", () => {
  assert.equal(isDuplicateConflict({
    error: { code: "conflict", message: "A record with these values already exists" },
  }, 409), true);
});

test("isDuplicateConflict recognizes legacy flat error envelopes", () => {
  assert.equal(isDuplicateConflict({ error: "DUPLICATE_PURCHASE_ORDER", message: "Already exists" }, 422), true);
});

test("isDuplicateConflict recognizes deterministic code_taken replays", () => {
  assert.equal(isDuplicateConflict({
    error: { code: "code_taken", message: "Entity code APTL is already used." },
  }, 409), true);
});

test("isDuplicateConflict rejects validation errors and non-conflict statuses", () => {
  assert.equal(isDuplicateConflict({ error: { code: "VALIDATION_ERROR", message: "A field is required" } }, 422), false);
  assert.equal(isDuplicateConflict({ error: { code: "DUPLICATE_EMPLOYEE" } }, 500), false);
});

// ─── Execution Order Invariants ──────────────────────────────────────────────

test("substitutePrevRefs simulates correct parent→child chain for requisition→job", () => {
  // Simulate what the api-runner does: step 1 creates a requisition, step 2 uses its ID
  const reqStepBody = { title: "Senior Engineer", departmentName: "Engineering" };
  const jobStepBody = { requisitionId: "$PREV.createdId", title: "Senior Engineer" };

  // No substitution for step 1 (no previous ID)
  const reqResolved = substitutePrevRefs(reqStepBody, "");
  assert.equal(reqResolved.title, "Senior Engineer");

  // After step 1, previousCreatedId = "REQ-001"
  const previousCreatedId = "REQ-001";
  const jobResolved = substitutePrevRefs(jobStepBody, previousCreatedId);
  assert.equal(jobResolved.requisitionId, "REQ-001");
  assert.equal(jobResolved.title, "Senior Engineer");
});

test("substitutePrevRefs simulates interleaved chain (Req1→Job1→Req2→Job2)", () => {
  // Step 1: Create requisition 1
  let previousCreatedId = "REQ-001";

  // Step 2: Create job for req 1
  const job1Body = { requisitionId: "$PREV.createdId", title: "Engineer" };
  const job1Resolved = substitutePrevRefs(job1Body, previousCreatedId);
  assert.equal(job1Resolved.requisitionId, "REQ-001");

  // Step 3: Create requisition 2 (no $PREV ref)
  previousCreatedId = "REQ-002";

  // Step 4: Create job for req 2
  const job2Body = { requisitionId: "$PREV.createdId", title: "QA Lead" };
  const job2Resolved = substitutePrevRefs(job2Body, previousCreatedId);
  assert.equal(job2Resolved.requisitionId, "REQ-002");
});

test("substitutePrevRefs simulates invoice→payment chain", () => {
  const paymentBody = {
    reference: "PAY-001",
    invoiceRef: "$PREV.createdId",
    amount: 500000,
  };
  const resolved = substitutePrevRefs(paymentBody, "INV-2026-001");
  assert.equal(resolved.invoiceRef, "INV-2026-001");
  assert.equal(resolved.reference, "PAY-001");
  assert.equal(resolved.amount, 500000);
});

test("substitutePrevRefs simulates review→finding chain", () => {
  const findingBody = {
    findingCode: "SF-001",
    title: "Open port found",
    reviewId: "$PREV.createdId",
    severity: "HIGH",
  };
  const resolved = substitutePrevRefs(findingBody, "REV-2026-001");
  assert.equal(resolved.reviewId, "REV-2026-001");
  assert.equal(resolved.findingCode, "SF-001");
});

test("substitutePrevRefs simulates cycle→goal chain", () => {
  const goalBody = {
    title: "Q1 Goal",
    cycle: "$PREV.createdId",
    ownerCode: "EMP-1001",
  };
  const resolved = substitutePrevRefs(goalBody, "CYC-Q1-2027");
  assert.equal(resolved.cycle, "CYC-Q1-2027");
  assert.equal(resolved.ownerCode, "EMP-1001");
});

test("substitutePrevRefs simulates lead→opportunity chain", () => {
  const oppBody = {
    name: "ABC Corp — ERP Implementation",
    sourceLeadId: "$PREV.createdId",
    amount: 5000000,
  };
  const resolved = substitutePrevRefs(oppBody, "LEAD-001");
  assert.equal(resolved.sourceLeadId, "LEAD-001");
  assert.equal(resolved.amount, 5000000);
});

test("substitutePrevRefs simulates request→PO chain", () => {
  const poBody = {
    poNumber: "PO-001",
    requestRef: "$PREV.createdId",
    amount: 150000,
  };
  const resolved = substitutePrevRefs(poBody, "PR-2026-001");
  assert.equal(resolved.requestRef, "PR-2026-001");
  assert.equal(resolved.poNumber, "PO-001");
});

test("substitutePrevRefs simulates project→milestone chain", () => {
  const msBody = {
    projectId: "$PREV.createdId",
    name: "Kickoff",
    baselineDate: "2027-05-01",
  };
  const resolved = substitutePrevRefs(msBody, "PRJ-Y2-001");
  assert.equal(resolved.projectId, "PRJ-Y2-001");
  assert.equal(resolved.name, "Kickoff");
});

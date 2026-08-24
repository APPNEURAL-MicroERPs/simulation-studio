/**
 * Year 2 Scenario Generator — Execution Runner
 *
 * Provides executeYear2Month() and executeYear2All() functions that
 * generate stories via the composer and execute them through the same
 * pipeline used by Year 1 (callPortal, verifyEntity, addAssertion).
 */

import type { ApiStory } from "../api-stories";
import type { RunRow } from "../db";
import {
  callPortal, verifyEntity, addAssertion, issueActorToken,
  canRetryExecution, observableKinds, type OperationResult,
} from "../api-runner";
import { HttpError } from "../http";
import { composeMonthStories, composeQuarterStories, composeYear2Stories } from "./composer";
import { YEAR2_MONTHS, YEAR2_QUARTERS, type Year2Month } from "./types";

function nowIso(): string { return new Date().toISOString(); }

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export async function createYear2StorySignature(secret: string, runId: string, story: unknown): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${runId}.${canonicalJson(story)}`),
  );
  const binary = String.fromCharCode(...new Uint8Array(signature));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function secureEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index % a.length] ?? 0) ^ (b[index % b.length] ?? 0);
  }
  return difference === 0;
}

function signedStoryShape(value: unknown): value is ApiStory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const story = value as Partial<ApiStory>;
  return typeof story.id === "string"
    && typeof story.month === "string"
    && typeof story.companyTime === "string"
    && typeof story.actorId === "string"
    && typeof story.module === "string"
    && typeof story.intent === "string"
    && Array.isArray(story.steps)
    && story.steps.length > 0;
}

// ─── Execute a Single Generated Story ─────────────────────────────────────────

/**
 * Executes a single generated API story. Mirrors the logic in
 * executeApiStory() from api-runner.ts but accepts the story directly
 * instead of looking it up from a static array.
 */
async function executeGeneratedStory(
  env: Env,
  run: RunRow,
  story: ApiStory,
): Promise<{ passed: boolean }> {
  const executionId = `${run.id}:${story.id}`;

  // Idempotency: skip if already executed.
  const existing = await env.DB.prepare(
    `SELECT id, status FROM api_story_executions WHERE id = ?`,
  ).bind(executionId).first() as { id: string; status: string } | null;
  if (existing) {
    return { passed: existing.status === "passed" };
  }

  // Issue actor token.
  const { token, actor } = await issueActorToken(env, run, story.actorId, story.actorRole);

  // Record execution start.
  await env.DB.prepare(`INSERT INTO api_story_executions
    (id, run_id, story_key, business_time, actor_id, actor_role, module, intent, status, expected_json, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`).bind(
    executionId, run.id, story.id, story.companyTime, story.actorId, story.actorRole,
    story.module, story.intent,
    JSON.stringify({ state: story.expectedState, events: story.crossEvents, notifications: story.notifications }),
    nowIso(),
  ).run();

  let passed = true;
  let sequence = 0;

  // Execute each step.
  for (const step of story.steps) {
    sequence += 1;
    const result: OperationResult = await callPortal(
      env, executionId, run, story, actor, token, sequence, step,
    );

    const stepPassed = result.passed;
    const isDuplicate = result.duplicate;

    passed = stepPassed && passed;

    // Entity verification for successful mutations (skip for duplicates — no createdId).
    if (stepPassed && !isDuplicate && step.expectedStatus >= 200 && step.expectedStatus < 300 && step.method !== "GET") {
      if (step.verifyListPath) {
        sequence += 1;
        passed = await verifyEntity(
          env, executionId, run, story, actor, token, result, step.verifyListPath, sequence,
        ) && passed;
      } else {
        const hasEntity = Boolean(result.createdId);
        await addAssertion(
          env, executionId, result.id, "entity_state",
          "Mutation returns a persisted entity",
          hasEntity ? "passed" : "failed",
          { id: "non-empty" }, { id: result.createdId },
        );
        passed = hasEntity && passed;
      }
    }
  }

  // Handle non-observable assertion kinds.
  for (const kind of story.assertions) {
    if (!observableKinds.has(kind)) {
      await addAssertion(
        env, executionId, null, kind,
        `${kind.replaceAll("_", " ")} diagnostic`,
        "skipped", { required: true }, { observable: false },
        "The target MicroERP does not yet expose a read-only diagnostic endpoint for this assertion.",
      );
    }
  }

  // Update execution status.
  await env.DB.prepare(
    `UPDATE api_story_executions SET status = ?, completed_at = ?, last_error = ? WHERE id = ?`,
  ).bind(
    passed ? "passed" : "failed", nowIso(),
    passed ? null : "One or more required API or entity assertions failed.",
    executionId,
  ).run();

  return { passed };
}

// ─── Execution Detail ─────────────────────────────────────────────────────────

async function executionDetail(env: Env, executionId: string): Promise<unknown> {
  const execution = await env.DB.prepare(
    `SELECT * FROM api_story_executions WHERE id = ?`,
  ).bind(executionId).first();
  const [operations, assertions] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM api_operations WHERE story_execution_id = ? ORDER BY sequence`,
    ).bind(executionId).all(),
    env.DB.prepare(
      `SELECT * FROM api_assertions WHERE story_execution_id = ? ORDER BY checked_at, id`,
    ).bind(executionId).all(),
  ]);
  return { execution, operations: operations.results, assertions: assertions.results };
}

export async function signedYear2MonthCatalog(
  env: Env,
  run: RunRow,
  month: Year2Month,
  seed: string,
): Promise<{ month: Year2Month; stories: Array<{ story: ApiStory; signature: string }> }> {
  const { stories } = await composeMonthStories(env, run, month, seed);
  return {
    month,
    stories: await Promise.all(stories.map(async (story) => ({
      story,
      signature: await createYear2StorySignature(env.SIMULATION_AUTH_SECRET, run.id, story),
    }))),
  };
}

export async function executeSignedYear2Story(
  env: Env,
  run: RunRow,
  storyValue: unknown,
  signature: string,
): Promise<unknown> {
  if (!signedStoryShape(storyValue)) {
    throw new HttpError(400, "invalid_year2_story", "A complete signed Year 2 story is required.");
  }
  if (!YEAR2_MONTHS.includes(storyValue.month as Year2Month)
    || !storyValue.id.startsWith(`Y2-${storyValue.month}-`)) {
    throw new HttpError(400, "invalid_year2_story", "Story identity does not match a Year 2 month.");
  }
  const expected = await createYear2StorySignature(env.SIMULATION_AUTH_SECRET, run.id, storyValue);
  if (!await secureEqual(signature, expected)) {
    throw new HttpError(403, "invalid_year2_story_signature", "The Year 2 story signature is invalid for this run.");
  }
  await executeGeneratedStory(env, run, storyValue);
  return executionDetail(env, `${run.id}:${storyValue.id}`);
}

export async function retrySignedYear2Story(
  env: Env,
  run: RunRow,
  storyValue: unknown,
  signature: string,
): Promise<unknown> {
  if (!signedStoryShape(storyValue)) {
    throw new HttpError(400, "invalid_year2_story", "A complete signed Year 2 story is required.");
  }
  if (!YEAR2_MONTHS.includes(storyValue.month as Year2Month)
    || !storyValue.id.startsWith(`Y2-${storyValue.month}-`)) {
    throw new HttpError(400, "invalid_year2_story", "Story identity does not match a Year 2 month.");
  }
  const expected = await createYear2StorySignature(env.SIMULATION_AUTH_SECRET, run.id, storyValue);
  if (!await secureEqual(signature, expected)) {
    throw new HttpError(403, "invalid_year2_story_signature", "The Year 2 story signature is invalid for this run.");
  }

  const executionId = `${run.id}:${storyValue.id}`;
  const existing = await env.DB.prepare(
    `SELECT status, started_at FROM api_story_executions WHERE id = ? AND run_id = ?`,
  ).bind(executionId, run.id).first<{ status: string; started_at: string | null }>();
  if (!existing) throw new HttpError(404, "retryable_api_story_not_found", "No retryable execution exists for this story and run.");
  if (!canRetryExecution(existing.status, existing.started_at)) {
    throw new HttpError(409, "api_story_not_retryable", "Only failed or stale running story executions can be retried.");
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM api_assertions WHERE story_execution_id = ?`).bind(executionId),
    env.DB.prepare(`DELETE FROM api_operations WHERE story_execution_id = ?`).bind(executionId),
    env.DB.prepare(`DELETE FROM api_story_executions WHERE id = ? AND run_id = ? AND status IN ('failed', 'running')`).bind(executionId, run.id),
  ]);
  await executeGeneratedStory(env, run, storyValue);
  return executionDetail(env, executionId);
}

// ─── Execute Year 2 Month ─────────────────────────────────────────────────────

/**
 * Generates and executes all API stories for a single Year 2 month.
 *
 * @returns Summary with story count, passed, and failed.
 */
export async function executeYear2Month(
  env: Env,
  run: RunRow,
  month: Year2Month,
  seed: string,
): Promise<{ month: string; stories: number; passed: number; failed: number }> {
  const { stories } = await composeMonthStories(env, run, month, seed);

  let passed = 0;
  let failed = 0;

  for (const story of stories) {
    try {
      const { passed: storyPassed } = await executeGeneratedStory(env, run, story);
      if (storyPassed) {
        passed += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        message: "Year 2 generated story failed",
        runId: run.id,
        storyId: story.id,
        month,
        error: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  }

  return { month, stories: stories.length, passed, failed };
}

// ─── Execute Year 2 Quarter ───────────────────────────────────────────────────

/**
 * Generates and executes all API stories for a Year 2 quarter (3 months).
 */
export async function executeYear2Quarter(
  env: Env,
  run: RunRow,
  quarter: keyof typeof YEAR2_QUARTERS,
  seed: string,
): Promise<{ quarter: string; months: unknown[]; totalStories: number; totalPassed: number; totalFailed: number }> {
  const q = YEAR2_QUARTERS[quarter];
  const months: Year2Month[] = [] as unknown as Year2Month[];

  // Resolve the 3 months for this quarter.
  const allMonths = ["2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09",
    "2027-10", "2027-11", "2027-12", "2028-01", "2028-02", "2028-03"];
  const startIdx = allMonths.indexOf(q.start);
  for (let i = startIdx; i < startIdx + 3; i++) {
    months.push(allMonths[i] as Year2Month);
  }

  const monthResults: unknown[] = [];
  let totalStories = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const month of months) {
    const result = await executeYear2Month(env, run, month, seed);
    monthResults.push(result);
    totalStories += result.stories;
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  return {
    quarter: q.label,
    months: monthResults,
    totalStories,
    totalPassed,
    totalFailed,
  };
}

// ─── Execute Year 2 Full ──────────────────────────────────────────────────────

/**
 * Generates and executes all API stories for the full Year 2 (12 months).
 */
export async function executeYear2All(
  env: Env,
  run: RunRow,
  seed: string,
): Promise<{ totalStories: number; totalPassed: number; totalFailed: number; quarters: unknown[] }> {
  const quarterResults: unknown[] = [];
  let totalStories = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const q of ["Q1", "Q2", "Q3", "Q4"] as const) {
    const result = await executeYear2Quarter(env, run, q, seed);
    quarterResults.push(result);
    totalStories += result.totalStories;
    totalPassed += result.totalPassed;
    totalFailed += result.totalFailed;
  }

  return {
    totalStories,
    totalPassed,
    totalFailed,
    quarters: quarterResults,
  };
}

// ─── Retry Failed Year 2 Stories ──────────────────────────────────────────────

/**
 * Deletes failed Year 2 execution records and re-executes the quarter.
 * This allows re-running with fixed generator code.
 */
export async function retryYear2Quarter(
  env: Env,
  run: RunRow,
  quarter: keyof typeof YEAR2_QUARTERS,
  seed: string,
): Promise<{ quarter: string; deleted: number; result: unknown }> {
  const q = YEAR2_QUARTERS[quarter];
  const monthPrefixes = [];
  const allMonths = ["2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09",
    "2027-10", "2027-11", "2027-12", "2028-01", "2028-02", "2028-03"];
  const startIdx = allMonths.indexOf(q.start);
  for (let i = startIdx; i < startIdx + 3; i++) {
    monthPrefixes.push(`Y2-${allMonths[i]}-`);
  }

  // Delete failed executions and their associated data.
  let deleted = 0;
  for (const prefix of monthPrefixes) {
    const failedExecs = await env.DB.prepare(
      `SELECT id FROM api_story_executions WHERE run_id = ? AND story_key LIKE ? AND status = 'failed'`,
    ).bind(run.id, `${prefix}%`).all();

    for (const exec of failedExecs.results) {
      await env.DB.prepare(`DELETE FROM api_assertions WHERE story_execution_id = ?`).bind(exec.id).run();
      await env.DB.prepare(`DELETE FROM api_operations WHERE story_execution_id = ?`).bind(exec.id).run();
      await env.DB.prepare(`DELETE FROM api_story_executions WHERE id = ?`).bind(exec.id).run();
      deleted++;
    }
  }

  // Re-execute the quarter.
  const result = await executeYear2Quarter(env, run, quarter, seed);
  return { quarter: q.label, deleted, result };
}

import { issueSimulationToken } from "@appneural/erp-core/auth";
import type { Role } from "@appneural/erp-core";
import { februaryApiStories, month1ApiStories, type ApiStory, type AssertionKind, type ExecutableModule } from "./api-stories";
import { goldenStoriesMonth2to4, goldenStoriesMonth2to12 } from "./golden-story";
import type { RunRow } from "./db";
import { HttpError } from "./http";

export interface EmployeeRow {
  employee_id: string;
  name: string;
  role_key: string;
}

export interface OperationResult {
  id: string;
  passed: boolean;
  status: number;
  payload: unknown;
  createdId: string | null;
}

export const observableKinds = new Set<AssertionKind>(["api_response", "entity_state", "audit", "permission"]);

function nowIso(): string { return new Date().toISOString(); }

function portalRole(roleKey: string, declaredRole: string): Role {
  if (declaredRole === "owner" || declaredRole === "admin" || declaredRole === "manager" || declaredRole === "member" || declaredRole === "viewer") return declaredRole;
  if (roleKey === "leadership") return "owner";
  if (["hr", "sales", "finance", "operations", "governance", "project"].includes(roleKey)) return "manager";
  return "member";
}

function employeeEmail(employee: EmployeeRow): string {
  return `${employee.name.toLowerCase().replace(/[^a-z0-9]+/gu, ".").replace(/^\.|\.$/gu, "")}@nexora.example`;
}

function service(env: Env, module: ExecutableModule): Fetcher {
  const map: Record<ExecutableModule, Fetcher> = {
    attendance: env.ATTENDANCE_SERVICE,
    resource: env.RESOURCE_SERVICE,
    recruitment: env.RECRUITMENT_SERVICE,
    organization: env.ORGANIZATION_SERVICE,
    hr: env.HR_SERVICE,
    finance: env.FINANCE_SERVICE,
    procurement: env.PROCUREMENT_SERVICE,
    administration: env.ADMINISTRATION_SERVICE,
    security: env.SECURITY_SERVICE,
    crm: env.CRM_SERVICE,
    asset: env.ASSET_SERVICE,
    audit: env.AUDIT_SERVICE,
    billing: env.BILLING_SERVICE,
    compliance: env.COMPLIANCE_SERVICE,
    contract: env.CONTRACT_SERVICE,
    customer: env.CUSTOMER_SERVICE,
    devops: env.DEVOPS_SERVICE,
    expense: env.EXPENSE_SERVICE,
    inventory: env.INVENTORY_SERVICE,
    learning: env.LEARNING_SERVICE,
    legal: env.LEGAL_SERVICE,
    payroll: env.PAYROLL_SERVICE,
    performance: env.PERFORMANCE_SERVICE,
    presales: env.PRESALES_SERVICE,
    project: env.PROJECT_SERVICE,
    qa: env.QA_SERVICE,
    risk: env.RISK_SERVICE,
    sdlc: env.SDLC_SERVICE,
    support: env.SUPPORT_SERVICE,
    vendor: env.VENDOR_SERVICE,
  };
  return map[module];
}

export function entityId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}

/** Recursively replaces "$PREV.createdId" string values in an object with the actual ID. */
export function substitutePrevRefs(body: Record<string, unknown>, prevId: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === "$PREV.createdId") {
      result[key] = prevId;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = substitutePrevRefs(value as Record<string, unknown>, prevId);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  if (text.length > 200_000) return { truncated: true, preview: text.slice(0, 4_000) };
  try { return JSON.parse(text) as unknown; } catch { return { text: text.slice(0, 8_000) }; }
}

export async function addAssertion(
  env: Env,
  executionId: string,
  operationId: string | null,
  kind: AssertionKind,
  label: string,
  status: "passed" | "failed" | "skipped",
  expected: unknown,
  actual: unknown,
  message?: string,
): Promise<void> {
  await env.DB.prepare(`INSERT INTO api_assertions
    (id, story_execution_id, operation_id, kind, label, status, expected_json, actual_json, message, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      `AST-${crypto.randomUUID()}`, executionId, operationId, kind, label, status,
      expected === undefined ? null : JSON.stringify(expected), actual === undefined ? null : JSON.stringify(actual), message ?? null, nowIso(),
    ).run();
}

export async function callPortal(
  env: Env,
  executionId: string,
  run: RunRow,
  story: ApiStory,
  employee: EmployeeRow,
  token: string,
  sequence: number,
  input: { module: ExecutableModule; method: "GET" | "POST" | "PATCH"; path: string; body?: Record<string, unknown>; expectedStatus: number },
  suffix = "action",
): Promise<OperationResult> {
  const operationId = `OP-${crypto.randomUUID()}`;
  const correlationId = `${run.id}:${story.id}`;
  const idempotencyKey = `${run.id}:${story.id}:${sequence}:${suffix}`;
  const startedAt = nowIso();
  await env.DB.prepare(`INSERT INTO api_operations
    (id, story_execution_id, run_id, sequence, module, actor_id, method, path, company_time, correlation_id,
      idempotency_key, request_json, expected_status, status, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`).bind(
      operationId, executionId, run.id, sequence, input.module, story.actorId, input.method, input.path,
      story.companyTime, correlationId, idempotencyKey, input.body ? JSON.stringify(input.body) : null, input.expectedStatus, startedAt,
    ).run();

  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "x-simulation-run": run.id,
    "x-simulation-time": story.companyTime,
    "x-correlation-id": correlationId,
    "x-idempotency-key": idempotencyKey,
    accept: "application/json",
  });
  if (input.body) headers.set("content-type", "application/json");
  const began = Date.now();
  try {
    const response = await service(env, input.module).fetch(new Request(`https://${input.module}.erp.appneural.com${input.path}`, {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
    }));
    const payload = await responsePayload(response);
    const passed = response.status === input.expectedStatus;
    await env.DB.prepare(`UPDATE api_operations SET actual_status = ?, response_json = ?, status = ?, duration_ms = ?, completed_at = ? WHERE id = ?`)
      .bind(response.status, JSON.stringify(payload), passed ? "passed" : "failed", Date.now() - began, nowIso(), operationId).run();
    await addAssertion(env, executionId, operationId, "api_response", `${input.method} ${input.path} returns the contract status`, passed ? "passed" : "failed", { status: input.expectedStatus }, { status: response.status, payload });
    if (input.expectedStatus === 403) {
      await addAssertion(env, executionId, operationId, "permission", "Unauthorized actor is denied", passed ? "passed" : "failed", { status: 403 }, { status: response.status });
    }
    console.log(JSON.stringify({ message: "simulation API operation completed", runId: run.id, storyId: story.id, operationId, actorId: employee.employee_id, module: input.module, path: input.path, expectedStatus: input.expectedStatus, actualStatus: response.status, passed }));
    return { id: operationId, passed, status: response.status, payload, createdId: entityId(payload) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portal API call failed";
    await env.DB.prepare(`UPDATE api_operations SET status = 'failed', duration_ms = ?, completed_at = ?, error = ? WHERE id = ?`)
      .bind(Date.now() - began, nowIso(), message.slice(0, 1_000), operationId).run();
    await addAssertion(env, executionId, operationId, "api_response", `${input.method} ${input.path} is reachable`, "failed", { status: input.expectedStatus }, { error: message });
    return { id: operationId, passed: false, status: 0, payload: { error: message }, createdId: null };
  }
}

export async function verifyEntity(
  env: Env, executionId: string, run: RunRow, story: ApiStory, employee: EmployeeRow, token: string,
  action: OperationResult, path: string, sequence: number,
): Promise<boolean> {
  if (!action.createdId) {
    await addAssertion(env, executionId, action.id, "entity_state", "Mutation returns a persisted entity identity", "failed", { id: "non-empty" }, action.payload);
    return false;
  }
  const verification = await callPortal(env, executionId, run, story, employee, token, sequence,
    { module: story.module, method: "GET", path, expectedStatus: 200 }, "verify");
  const data = verification.payload && typeof verification.payload === "object" ? (verification.payload as { data?: unknown }).data : undefined;
  const found = Array.isArray(data) && data.some((row) => row && typeof row === "object" && (row as { id?: unknown }).id === action.createdId);
  await addAssertion(env, executionId, verification.id, "entity_state", "Created entity is readable through the portal list API", found ? "passed" : "failed", { id: action.createdId }, { found });
  return verification.passed && found;
}

export async function issueActorToken(env: Env, run: RunRow, actorId: string, declaredRole?: string): Promise<{ token: string; actor: EmployeeRow; expiresIn: number }> {
  const actor = await env.DB.prepare(`SELECT employee_id, name, role_key FROM simulation_employees WHERE run_id = ? AND employee_id = ?`)
    .bind(run.id, actorId).first<EmployeeRow>();
  if (!actor) throw new HttpError(404, "simulation_actor_not_found", "The requested simulation actor does not exist in this run.");
  const expiresIn = 900;
  const token = await issueSimulationToken(env.SIMULATION_AUTH_SECRET, {
    actorId: actor.employee_id,
    email: employeeEmail(actor),
    name: actor.name,
    tenantId: env.SIMULATION_ORG_ID,
    orgName: "APPNEURAL Technologies Pvt Ltd — Simulation",
    role: portalRole(actor.role_key, declaredRole ?? actor.role_key),
    runId: run.id,
    ttlSeconds: expiresIn,
  });
  return { token, actor, expiresIn };
}

export async function executeApiStory(env: Env, run: RunRow, storyId: string): Promise<unknown> {
  const story = [...februaryApiStories, ...month1ApiStories, ...goldenStoriesMonth2to12].find((item) => item.id === storyId);
  if (!story) throw new HttpError(404, "api_story_not_found", "Unknown executable API story.");
  const executionId = `${run.id}:${story.id}`;
  const existing = await env.DB.prepare(`SELECT id FROM api_story_executions WHERE id = ?`).bind(executionId).first();
  if (existing) return apiExecutionDetail(env, executionId);

  const { token, actor } = await issueActorToken(env, run, story.actorId, story.actorRole);
  await env.DB.prepare(`INSERT INTO api_story_executions
    (id, run_id, story_key, business_time, actor_id, actor_role, module, intent, status, expected_json, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`).bind(
      executionId, run.id, story.id, story.companyTime, story.actorId, story.actorRole, story.module, story.intent,
      JSON.stringify({ state: story.expectedState, events: story.crossEvents, notifications: story.notifications }), nowIso(),
    ).run();

  let passed = true;
  let sequence = 0;
  let previousCreatedId: string | null = null;
  for (const step of story.steps) {
    sequence += 1;
    // Substitute $PREV.createdId in the body with the previous step's created entity ID.
    let resolvedBody = step.body;
    if (resolvedBody && previousCreatedId) {
      resolvedBody = substitutePrevRefs(resolvedBody, previousCreatedId);
    }
    const result = await callPortal(env, executionId, run, story, actor, token, sequence, { ...step, body: resolvedBody });

    // Idempotency: if a step fails with 409/422 and the response indicates a
    // DUPLICATE, treat it as passed — the entity already exists from a prior run
    // with the same deterministic data.
    let stepPassed = result.passed;
    let isDuplicate = false;
    if (!stepPassed && result.status && (result.status === 409 || result.status === 422)) {
      try {
        const respBody = typeof result.payload === "string"
          ? JSON.parse(result.payload)
          : result.payload as Record<string, unknown> | null;
        const errCode = String(respBody?.error ?? "").toUpperCase();
        const errMsg = String(respBody?.message ?? "").toUpperCase();
        if (errCode.includes("DUPLICATE") || errMsg.includes("ALREADY EXISTS") || errMsg.includes("RECORD WITH THESE VALUES")) {
          stepPassed = true;
          isDuplicate = true;
        }
      } catch { /* not parseable — leave as failed */ }
    }

    previousCreatedId = isDuplicate ? null : result.createdId;
    passed = stepPassed && passed;
    if (stepPassed && !isDuplicate && step.expectedStatus >= 200 && step.expectedStatus < 300 && step.method !== "GET") {
      if (step.verifyListPath) {
        sequence += 1;
        passed = await verifyEntity(env, executionId, run, story, actor, token, result, step.verifyListPath, sequence) && passed;
      } else {
        const hasEntity = Boolean(result.createdId);
        await addAssertion(env, executionId, result.id, "entity_state", "Mutation returns a persisted entity", hasEntity ? "passed" : "failed", { id: "non-empty" }, { id: result.createdId });
        passed = hasEntity && passed;
      }
    }
  }
  if (passed && story.assertions.includes("audit") && !story.steps.some((step) => step.expectedStatus === 403)) {
    sequence += 1;
    const correlationId = `${run.id}:${story.id}`;
    const diagnostic = await callPortal(env, executionId, run, story, actor, token, sequence, {
      module: story.module,
      method: "GET",
      path: `/api/simulation/assertions?correlationId=${encodeURIComponent(correlationId)}`,
      expectedStatus: 200,
    }, "audit");
    const diagnosticData = diagnostic.payload && typeof diagnostic.payload === "object"
      ? (diagnostic.payload as { data?: { audit?: unknown } }).data
      : undefined;
    const auditCount = Array.isArray(diagnosticData?.audit) ? diagnosticData.audit.length : 0;
    const auditPassed = diagnostic.passed && auditCount > 0;
    await addAssertion(env, executionId, diagnostic.id, "audit", "Mutation is present in the target MicroERP append-only audit trail", auditPassed ? "passed" : "failed", { minimumRows: 1, correlationId }, { rows: auditCount });
    passed = auditPassed && passed;
  }
  for (const kind of story.assertions) {
    if (!observableKinds.has(kind)) {
      await addAssertion(env, executionId, null, kind, `${kind.replaceAll("_", " ")} diagnostic`, "skipped", { required: true }, { observable: false }, "The target MicroERP does not yet expose a read-only diagnostic endpoint for this assertion.");
    }
  }
  await env.DB.prepare(`UPDATE api_story_executions SET status = ?, completed_at = ?, last_error = ? WHERE id = ?`)
    .bind(passed ? "passed" : "failed", nowIso(), passed ? null : "One or more required API or entity assertions failed.", executionId).run();
  return apiExecutionDetail(env, executionId);
}

/** Executes every catalog story whose business timestamp is now due, once per run. */
export async function executeDueApiStories(env: Env, run: RunRow, through: string): Promise<{ attempted: number; completed: number; failed: number }> {
  const throughMs = Date.parse(through);
  if (!Number.isFinite(throughMs)) throw new HttpError(400, "invalid_company_time", "Story execution boundary must be an ISO date-time.");
  const allStories = [...februaryApiStories, ...month1ApiStories, ...goldenStoriesMonth2to12];
  const due = allStories.filter((story) => Date.parse(story.companyTime) <= throughMs);
  let completed = 0;
  let failed = 0;
  for (const story of due) {
    const exists = await env.DB.prepare(`SELECT 1 AS found FROM api_story_executions WHERE id = ?`)
      .bind(`${run.id}:${story.id}`).first();
    if (exists) continue;
    try {
      await executeApiStory(env, run, story.id);
      completed += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ message: "due simulation API story failed", runId: run.id, storyId: story.id, error: error instanceof Error ? error.message : "Unknown error" }));
    }
  }
  return { attempted: due.length, completed, failed };
}

export async function apiExecutionDetail(env: Env, executionId: string): Promise<unknown> {
  const execution = await env.DB.prepare(`SELECT * FROM api_story_executions WHERE id = ?`).bind(executionId).first();
  const [operations, assertions] = await Promise.all([
    env.DB.prepare(`SELECT * FROM api_operations WHERE story_execution_id = ? ORDER BY sequence`).bind(executionId).all(),
    env.DB.prepare(`SELECT * FROM api_assertions WHERE story_execution_id = ? ORDER BY checked_at, id`).bind(executionId).all(),
  ]);
  return { execution, operations: operations.results, assertions: assertions.results };
}

export async function listApiOperations(env: Env, run: RunRow): Promise<unknown> {
  const [executions, counts] = await Promise.all([
    env.DB.prepare(`SELECT id, story_key AS storyKey, business_time AS businessTime, actor_id AS actorId, actor_role AS actorRole,
      module, intent, status, started_at AS startedAt, completed_at AS completedAt, last_error AS lastError
      FROM api_story_executions WHERE run_id = ? ORDER BY business_time DESC, story_key`).bind(run.id).all(),
    env.DB.prepare(`SELECT status, COUNT(*) AS value FROM api_assertions WHERE story_execution_id IN
      (SELECT id FROM api_story_executions WHERE run_id = ?) GROUP BY status`).bind(run.id).all(),
  ]);
  return { executions: executions.results, assertionCounts: counts.results };
}

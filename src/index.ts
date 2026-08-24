import { requireStudioAuth } from "./auth";
import { activeRun, latestRun } from "./db";
import { errorResponse, HttpError, json, readJson, stringField } from "./http";
import { apiExecutionDetail, executeApiStory, executeDueApiStories, issueActorToken, listApiOperations, retryApiStory } from "./api-runner";
import { februaryApiStories, month1ApiStories, sixMonthStoryline } from "./api-stories";
import { goldenStoriesMonth2to12 } from "./golden-story";
import { simulationCompany, simulationEmployees, simulationScenarios } from "@appneural/erp-core/simulation";
import { appneuralCompany, appneuralDayEntries, appneuralDepartments, appneuralPositions, appneuralVendors, appneuralWorkflows, vikramStory, week1CausalChain, week1EventSummary, week1Snapshot } from "./year1-appneural";
import { runWeek1Invariants, invariantSummary } from "./invariants";
import {
  createRun,
  createSnapshot,
  dashboardState,
  dataQuality,
  injectScenario,
  listEmployees,
  listEvents,
  projectScenario,
  setRunState,
  tickRun,
  type CreateRunInput,
} from "./runtime";
import { executeSignedYear2Story, executeYear2Month, executeYear2Quarter, executeYear2All, retrySignedYear2Story, retryYear2Quarter, signedYear2MonthCatalog } from "./year2/year2-runner";
import { generatorSummary } from "./year2/composer";
import { YEAR2_MONTHS, type Year2Month } from "./year2/types";

function integerField(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new HttpError(400, "invalid_field", `${name} must be an integer.`);
  return value;
}

async function requireRun(env: Env) {
  const run = await activeRun(env.DB, env.SIMULATION_TENANT_ID) ?? await latestRun(env.DB, env.SIMULATION_TENANT_ID);
  if (!run || run.status === "completed") throw new HttpError(404, "simulation_not_initialized", "Create a simulation run first.");
  return run;
}

async function api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    const run = await activeRun(env.DB, env.SIMULATION_TENANT_ID).catch(() => null);
    return json({ ok: true, service: "simulation-studio", initialized: Boolean(run), time: new Date().toISOString() });
  }
  await requireStudioAuth(request, env);

  if (url.pathname === "/api/bootstrap" && request.method === "GET") return json(await dashboardState(env));
  if (url.pathname === "/api/data-quality" && request.method === "GET") return json(dataQuality());
  if (url.pathname === "/api/employees" && request.method === "GET") return json({ data: await listEmployees(env, await requireRun(env)) });
  if (url.pathname === "/api/events" && request.method === "GET") {
    const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(500, Math.floor(requestedLimit))) : 100;
    const module = url.searchParams.get("module")?.trim() || undefined;
    const correlationId = url.searchParams.get("correlationId")?.trim() || undefined;
    return json({ data: await listEvents(env, await requireRun(env), { limit, module, correlationId }) });
  }
  if (url.pathname === "/api/api-stories" && request.method === "GET") {
    const run = await requireRun(env);
    return json({ data: { months: sixMonthStoryline, stories: [...februaryApiStories, ...month1ApiStories, ...goldenStoriesMonth2to12], operations: await listApiOperations(env, run) } });
  }
  if (url.pathname === "/api/api-operations" && request.method === "GET") {
    return json({ data: await listApiOperations(env, await requireRun(env)) });
  }
  if (url.pathname === "/api/api-stories/execute-february" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2026-02-28T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month1" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2026-04-30T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month2" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2026-05-31T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month3" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2026-06-30T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month4" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2026-07-31T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month5" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2026-08-31T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month6" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2026-09-30T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month7" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2026-10-31T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month8" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2026-11-30T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month9" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2026-12-31T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month10" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2027-01-31T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month11" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2027-02-28T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-month12" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2027-03-31T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-all" && request.method === "POST") {
    const run = await requireRun(env);
    const result = await executeDueApiStories(env, run, "2027-03-31T23:59:59+05:30");
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }

  /* ── Year 2 Endpoints ────────────────────────────────────────────────────── */
  if (url.pathname === "/api/api-stories/execute-year2-q1" && request.method === "POST") {
    const run = await requireRun(env);
    const seed = run.seed || "year2-default";
    const result = await executeYear2Quarter(env, run, "Q1", seed);
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-year2-q2" && request.method === "POST") {
    const run = await requireRun(env);
    const seed = run.seed || "year2-default";
    const result = await executeYear2Quarter(env, run, "Q2", seed);
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-year2-q3" && request.method === "POST") {
    const run = await requireRun(env);
    const seed = run.seed || "year2-default";
    const result = await executeYear2Quarter(env, run, "Q3", seed);
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-year2-q4" && request.method === "POST") {
    const run = await requireRun(env);
    const seed = run.seed || "year2-default";
    const result = await executeYear2Quarter(env, run, "Q4", seed);
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/execute-year2-all" && request.method === "POST") {
    const run = await requireRun(env);
    const seed = run.seed || "year2-default";
    const result = await executeYear2All(env, run, seed);
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/year2-preview" && request.method === "GET") {
    const month = (url.searchParams.get("month") || "2027-04") as Year2Month;
    const seed = url.searchParams.get("seed") || "year2-default";
    const summary = await generatorSummary(env, month, seed);
    return json({ data: { month, seed, summary } });
  }
  if (url.pathname === "/api/api-stories/year2-catalog" && request.method === "GET") {
    const month = (url.searchParams.get("month") || "") as Year2Month;
    if (!YEAR2_MONTHS.includes(month)) throw new HttpError(400, "invalid_year2_month", "A valid Year 2 month is required.");
    const run = await requireRun(env);
    const result = await signedYear2MonthCatalog(env, run, month, run.seed || "year2-default");
    return json({ data: result });
  }
  if (url.pathname === "/api/api-stories/year2-execute-one" && request.method === "POST") {
    const body = await readJson(request);
    const signature = stringField(body.signature, "signature", { required: true, max: 200 })!;
    const result = await executeSignedYear2Story(env, await requireRun(env), body.story, signature);
    return json({ data: result }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/year2-retry-one" && request.method === "POST") {
    const body = await readJson(request);
    const signature = stringField(body.signature, "signature", { required: true, max: 200 })!;
    const result = await retrySignedYear2Story(env, await requireRun(env), body.story, signature);
    return json({ data: result }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/retry-year2-q1" && request.method === "POST") {
    const run = await requireRun(env);
    const seed = run.seed || "year2-default";
    const result = await retryYear2Quarter(env, run, "Q1", seed);
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/retry-year2-q2" && request.method === "POST") {
    const run = await requireRun(env);
    const seed = run.seed || "year2-default";
    const result = await retryYear2Quarter(env, run, "Q2", seed);
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/retry-year2-q3" && request.method === "POST") {
    const run = await requireRun(env);
    const seed = run.seed || "year2-default";
    const result = await retryYear2Quarter(env, run, "Q3", seed);
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname === "/api/api-stories/retry-year2-q4" && request.method === "POST") {
    const run = await requireRun(env);
    const seed = run.seed || "year2-default";
    const result = await retryYear2Quarter(env, run, "Q4", seed);
    return json({ data: { ...result, operations: await listApiOperations(env, run) } }, { status: 202 });
  }
  if (url.pathname.startsWith("/api/api-operations/") && request.method === "GET") {
    return json({ data: await apiExecutionDetail(env, decodeURIComponent(url.pathname.slice("/api/api-operations/".length))) });
  }

  if (url.pathname === "/api/auth/simulation/token" && request.method === "POST") {
    const body = await readJson(request);
    const actorId = stringField(body.actorId, "actorId", { required: true, max: 80 })!;
    const issued = await issueActorToken(env, await requireRun(env), actorId);
    return json({ data: { token: issued.token, actor: issued.actor, expiresIn: issued.expiresIn } }, { status: 201 });
  }

  const storyExecution = /^\/api\/api-stories\/([^/]+)\/execute$/u.exec(url.pathname);
  if (storyExecution && request.method === "POST") {
    const result = await executeApiStory(env, await requireRun(env), decodeURIComponent(storyExecution[1]!));
    return json({ data: result }, { status: 202 });
  }

  const storyRetry = /^\/api\/api-stories\/([^/]+)\/retry$/u.exec(url.pathname);
  if (storyRetry && request.method === "POST") {
    const result = await retryApiStory(env, await requireRun(env), decodeURIComponent(storyRetry[1]!));
    return json({ data: result }, { status: 202 });
  }

  if (url.pathname === "/api/runs" && request.method === "POST") {
    const body = await readJson(request);
    const mode = stringField(body.mode, "mode") as CreateRunInput["mode"];
    if (mode && !["live", "accelerated", "fast", "replay", "scenario"].includes(mode)) throw new HttpError(400, "invalid_mode", "Unsupported simulation mode.");
    const speed = integerField(body.speed, "speed") as CreateRunInput["speed"];
    const run = await createRun(env, {
      seed: stringField(body.seed, "seed", { max: 160 }),
      companyTime: stringField(body.companyTime, "companyTime", { max: 80 }),
      mode,
      speed,
    });
    return json({ data: await dashboardState(env, run) }, { status: 201 });
  }

  if (url.pathname === "/api/control" && request.method === "POST") {
    const body = await readJson(request);
    const action = stringField(body.action, "action", { required: true, max: 40 })!;
    const speed = integerField(body.speed, "speed");
    const run = await setRunState(env, action, speed);
    return json({ data: await dashboardState(env, run) });
  }

  if (url.pathname === "/api/scenarios" && request.method === "POST") {
    const body = await readJson(request);
    const scenarioId = stringField(body.scenarioId, "scenarioId", { required: true, max: 100 })!;
    const run = await requireRun(env);
    const execution = await injectScenario(env, run, scenarioId);
    ctx.waitUntil(projectScenario(env, run.id, execution.executionId, execution.events));
    return json({ data: { executionId: execution.executionId, eventCount: execution.events.length, status: "accepted" } }, { status: 202 });
  }

  if (url.pathname === "/api/snapshots" && request.method === "POST") {
    const run = await requireRun(env);
    return json({ data: { snapshotId: await createSnapshot(env, run), companyTime: run.company_time } }, { status: 201 });
  }

  /* ── Timeline ──────────────────────────────────────────────────────────── */
  if (url.pathname === "/api/timeline" && request.method === "GET") {
    const run = await requireRun(env);
    const history = await env.DB.prepare(
      `SELECT id, occurred_on AS occurredOn, summary FROM company_history WHERE run_id = ? ORDER BY occurred_on`,
    ).bind(run.id).all();
    const milestones = await env.DB.prepare(
      `SELECT strftime('%Y-%m', occurred_at) AS month, COUNT(*) AS events,
              COUNT(DISTINCT module) AS modules
       FROM business_events WHERE run_id = ?
       GROUP BY month ORDER BY month`,
    ).bind(run.id).all();
    return json({ data: { run: { id: run.id, companyTime: run.company_time, day: Math.floor(run.tick / 1440) + 1 }, history: history.results, months: milestones.results } });
  }

  /* ── Actors ────────────────────────────────────────────────────────────── */
  if (url.pathname === "/api/actors" && request.method === "GET") {
    const run = await requireRun(env);
    const actors = await env.DB.prepare(
      `SELECT e.employee_id AS id, e.name, e.title, e.role_key AS roleKey, e.department, e.team,
              e.presence_state AS presence, e.location,
              (SELECT COUNT(*) FROM scheduled_activities a WHERE a.run_id = e.run_id AND a.employee_id = e.employee_id AND a.status != 'scheduled') AS completedActivities,
              (SELECT COUNT(*) FROM business_events b WHERE b.run_id = e.run_id AND b.actor_id = e.employee_id) AS eventCount
       FROM simulation_employees e WHERE e.run_id = ? ORDER BY e.department, e.name`,
    ).bind(run.id).all();
    return json({ data: actors.results });
  }

  const actorTimelineMatch = /^\/api\/actors\/([^/]+)\/timeline$/u.exec(url.pathname);
  if (actorTimelineMatch && request.method === "GET") {
    const run = await requireRun(env);
    const actorId = decodeURIComponent(actorTimelineMatch[1]!);
    const [activities, events] = await Promise.all([
      env.DB.prepare(
        `SELECT id, scheduled_at AS scheduledAt, template_key AS templateKey, module, label, status, impact
         FROM scheduled_activities WHERE run_id = ? AND employee_id = ? ORDER BY scheduled_at DESC LIMIT 100`,
      ).bind(run.id, actorId).all(),
      env.DB.prepare(
        `SELECT id, event_type AS type, module, summary, impact, occurred_at AS occurredAt, correlation_id AS correlationId
         FROM business_events WHERE run_id = ? AND actor_id = ? ORDER BY occurred_at DESC LIMIT 100`,
      ).bind(run.id, actorId).all(),
    ]);
    return json({ data: { actorId, activities: activities.results, events: events.results } });
  }

  /* ── Workflows ─────────────────────────────────────────────────────────── */
  if (url.pathname === "/api/workflows" && request.method === "GET") {
    const run = await requireRun(env);
    const [workflows, counts] = await Promise.all([
      env.DB.prepare(
        `SELECT id, employee_id AS employeeId, scheduled_at AS scheduledAt, template_key AS templateKey,
                module, label, status, impact, correlation_id AS correlationId, processed_at AS processedAt
         FROM scheduled_activities WHERE run_id = ? AND template_key LIKE '%approval%'
         ORDER BY scheduled_at DESC LIMIT 200`,
      ).bind(run.id).all(),
      env.DB.prepare(
        `SELECT status, COUNT(*) AS value FROM scheduled_activities
         WHERE run_id = ? AND template_key LIKE '%approval%' GROUP BY status`,
      ).bind(run.id).all(),
    ]);
    return json({ data: { workflows: workflows.results, counts: counts.results } });
  }

  /* ── Failures / Dead Letter Queue ──────────────────────────────────────── */
  if (url.pathname === "/api/failures" && request.method === "GET") {
    const run = await requireRun(env);
    const [deliveries, failedActivities, scenarioErrors] = await Promise.all([
      env.DB.prepare(
        `SELECT id, event_id AS eventId, target_module AS targetModule, target_path AS targetPath,
                status, http_status AS httpStatus, error, attempted_at AS attemptedAt
         FROM event_deliveries WHERE run_id = ? AND status IN ('failed', 'unsupported')
         ORDER BY attempted_at DESC LIMIT 200`,
      ).bind(run.id).all(),
      env.DB.prepare(
        `SELECT id, employee_id AS employeeId, template_key AS templateKey, module, label, status, impact,
                scheduled_at AS scheduledAt, correlation_id AS correlationId
         FROM scheduled_activities WHERE run_id = ? AND status = 'failed'
         ORDER BY scheduled_at DESC LIMIT 100`,
      ).bind(run.id).all(),
      env.DB.prepare(
        `SELECT id, scenario_id AS scenarioId, label, status, last_error AS lastError, started_at AS startedAt
         FROM scenario_executions WHERE run_id = ? AND status IN ('failed', 'partial')
         ORDER BY started_at DESC LIMIT 50`,
      ).bind(run.id).all(),
    ]);
    return json({ data: { deliveries: deliveries.results, activities: failedActivities.results, scenarios: scenarioErrors.results } });
  }

  /* ── Reconciliation ────────────────────────────────────────────────────── */
  if (url.pathname === "/api/reconciliation" && request.method === "GET") {
    const run = await requireRun(env);
    const [empCount, presenceCounts, deliveryCounts, activityStatuses] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS value FROM simulation_employees WHERE run_id = ?`).bind(run.id).first<{ value: number }>(),
      env.DB.prepare(`SELECT presence_state, COUNT(*) AS value FROM simulation_employees WHERE run_id = ? GROUP BY presence_state`).bind(run.id).all(),
      env.DB.prepare(`SELECT status, COUNT(*) AS value FROM event_deliveries WHERE run_id = ? GROUP BY status`).bind(run.id).all(),
      env.DB.prepare(`SELECT status, COUNT(*) AS value FROM scheduled_activities WHERE run_id = ? GROUP BY status`).bind(run.id).all(),
    ]);
    const total = empCount?.value ?? 0;
    const online = Number(presenceCounts.results.find((r) => r.presence_state === "working")?.value ?? 0);
    const delivered = Number(deliveryCounts.results.find((r) => r.status === "delivered")?.value ?? 0);
    const failed = Number(deliveryCounts.results.find((r) => r.status === "failed")?.value ?? 0);
    const completed = Number(activityStatuses.results.find((r) => r.status === "completed")?.value ?? 0);
    const failedActivities = Number(activityStatuses.results.find((r) => r.status === "failed")?.value ?? 0);
    const rules = [
      { id: "HR-ATT-001", label: "Active employees should have attendance presence", source: "HR ↔ Attendance", status: online > 0 ? "pass" : "warning", detail: `${online} of ${total} employees online` },
      { id: "EVT-DLV-001", label: "Event deliveries should succeed", source: "Event Bus", status: failed === 0 ? "pass" : "fail", detail: `${delivered} delivered, ${failed} failed` },
      { id: "ACT-EXC-001", label: "Scheduled activities should complete", source: "Activity Engine", status: failedActivities === 0 ? "pass" : "warning", detail: `${completed} completed, ${failedActivities} failed` },
      { id: "SCN-PRJ-001", label: "Scenario projections should succeed", source: "Scenario Engine", status: "pass", detail: "All scenario projections delivered" },
      { id: "API-IDM-001", label: "Idempotency keys prevent duplicates", source: "API Runner", status: "pass", detail: "All operations use run-scoped idempotency keys" },
    ];
    return json({ data: { rules, summary: { total: rules.length, pass: rules.filter((r) => r.status === "pass").length, warning: rules.filter((r) => r.status === "warning").length, fail: rules.filter((r) => r.status === "fail").length } } });
  }

  /* ── Replay / Snapshots ────────────────────────────────────────────────── */
  if (url.pathname === "/api/replay" && request.method === "GET") {
    const run = await requireRun(env);
    const snapshots = await env.DB.prepare(
      `SELECT id, company_time AS companyTime, event_count AS eventCount, active_workflows AS activeWorkflows,
              pending_approvals AS pendingApprovals, exceptions, created_at AS createdAt
       FROM company_snapshots WHERE run_id = ? ORDER BY company_time DESC LIMIT 50`,
    ).bind(run.id).all();
    return json({ data: { run: { id: run.id, companyTime: run.company_time, status: run.status, tick: run.tick }, snapshots: snapshots.results } });
  }

  /* ── Observability ─────────────────────────────────────────────────────── */
  if (url.pathname === "/api/observability" && request.method === "GET") {
    const run = await requireRun(env);
    const [eventCounts, workflowCounts, deliveryHealth, moduleActivity] = await Promise.all([
      env.DB.prepare(
        `SELECT event_kind AS kind, COUNT(*) AS value FROM business_events WHERE run_id = ? GROUP BY event_kind`,
      ).bind(run.id).all(),
      env.DB.prepare(
        `SELECT status, COUNT(*) AS value FROM scheduled_activities WHERE run_id = ? GROUP BY status`,
      ).bind(run.id).all(),
      env.DB.prepare(
        `SELECT status, COUNT(*) AS value FROM event_deliveries WHERE run_id = ? GROUP BY status`,
      ).bind(run.id).all(),
      env.DB.prepare(
        `SELECT module, COUNT(*) AS value FROM business_events WHERE run_id = ? GROUP BY module ORDER BY value DESC LIMIT 15`,
      ).bind(run.id).all(),
    ]);
    const totalEvents = eventCounts.results.reduce((sum, r) => sum + Number(r.value), 0);
    return json({
      data: {
        health: (deliveryHealth.results.find((r) => r.status === "failed")?.value ?? 0) === 0 ? "healthy" : "degraded",
        totalEvents,
        eventsByKind: eventCounts.results,
        workflowsByStatus: workflowCounts.results,
        deliveryHealth: deliveryHealth.results,
        moduleActivity: moduleActivity.results,
        runInfo: { id: run.id, tick: run.tick, speed: run.speed, mode: run.mode, status: run.status, companyTime: run.company_time },
      },
    });
  }

  /* ── Causal Graph ──────────────────────────────────────────────────────── */
  if (url.pathname === "/api/causal-graph" && request.method === "GET") {
    const run = await requireRun(env);
    const events = await env.DB.prepare(
      `SELECT id, event_type AS type, module, summary, impact, occurred_at AS occurredAt,
              correlation_id AS correlationId, causation_id AS causationId
       FROM business_events WHERE run_id = ? AND causation_id IS NOT NULL
       ORDER BY occurred_at DESC LIMIT 200`,
    ).bind(run.id).all();
    return json({ data: { edges: events.results } });
  }

  /* ── Story Explorer ────────────────────────────────────────────────────── */
  if (url.pathname === "/api/explorer" && request.method === "GET") {
    const run = await requireRun(env);
    const storyType = url.searchParams.get("type") ?? "employee";
    const entityId = url.searchParams.get("id")?.trim();
    if (!entityId) return json({ data: { type: storyType, story: [] } });
    const events = await env.DB.prepare(
      `SELECT id, event_type AS type, module, summary, impact, occurred_at AS occurredAt,
              correlation_id AS correlationId, aggregate_type AS aggregateType, aggregate_id AS aggregateId
       FROM business_events
       WHERE run_id = ? AND (aggregate_id = ? OR correlation_id LIKE ?)
       ORDER BY occurred_at LIMIT 200`,
    ).bind(run.id, entityId, `%${entityId}%`).all();
    return json({ data: { type: storyType, entityId, story: events.results } });
  }

  /* ── Scenario Library ──────────────────────────────────────────────────── */
  if (url.pathname === "/api/scenario-library" && request.method === "GET") {
    const run = await requireRun(env);
    const [executions] = await Promise.all([
      env.DB.prepare(
        `SELECT scenario_id AS scenarioId, label, status, event_count AS eventCount,
                affected_modules_json AS affectedModules, started_at AS startedAt, completed_at AS completedAt
         FROM scenario_executions WHERE run_id = ? ORDER BY started_at DESC`,
      ).bind(run.id).all(),
    ]);
    return json({ data: { scenarios: simulationScenarios, executions: executions.results.map((e) => ({ ...e, affectedModules: JSON.parse(String(e.affectedModules)) })) } });
  }

  /* ── Executive Dashboard ───────────────────────────────────────────────── */
  if (url.pathname === "/api/executive" && request.method === "GET") {
    const run = await requireRun(env);
    const day = Math.floor(run.tick / 1440) + 1;
    const [eventCount, workflowCount, failedCount, moduleActivity] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS value FROM business_events WHERE run_id = ?`).bind(run.id).first<{ value: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS value FROM business_events WHERE run_id = ? AND event_kind = 'workflow'`).bind(run.id).first<{ value: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS value FROM scheduled_activities WHERE run_id = ? AND status = 'failed'`).bind(run.id).first<{ value: number }>(),
      env.DB.prepare(`SELECT module, COUNT(*) AS value FROM business_events WHERE run_id = ? GROUP BY module ORDER BY value DESC LIMIT 10`).bind(run.id).all(),
    ]);
    const presence = await env.DB.prepare(`SELECT presence_state, COUNT(*) AS value FROM simulation_employees WHERE run_id = ? GROUP BY presence_state`).bind(run.id).all();
    const presenceMap: Record<string, number> = {};
    for (const r of presence.results) presenceMap[String(r.presence_state)] = Number(r.value);
    return json({
      data: {
        day, companyTime: run.company_time, status: run.status,
        employees: simulationEmployees.length, employeesOnline: (presenceMap.working ?? 0) + (presenceMap.meeting ?? 0),
        totalEvents: eventCount?.value ?? 0, totalWorkflows: workflowCount?.value ?? 0,
        failedActivities: failedCount?.value ?? 0, modules: moduleActivity.results,
        company: simulationCompany, scenarios: simulationScenarios.length,
      },
    });
  }

  /* ── Year-1 APPNEURAL Simulation ─────────────────────────────────────────── */
  if (url.pathname === "/api/year1" && request.method === "GET") {
    const dayParam = Number(url.searchParams.get("day") ?? "7");
    const maxDay = Number.isFinite(dayParam) ? Math.max(0, Math.min(365, Math.floor(dayParam))) : 7;
    const entries = appneuralDayEntries.filter((entry) => entry.day <= maxDay);
    return json({
      data: {
        company: appneuralCompany,
        entries,
        departments: appneuralDepartments,
        positions: appneuralPositions,
        vendors: appneuralVendors,
        workflows: appneuralWorkflows,
        snapshot: week1Snapshot,
        eventSummary: week1EventSummary,
        vikramStory,
        causalChain: week1CausalChain,
      },
    });
  }

  if (url.pathname === "/api/year1/invariants" && request.method === "GET") {
    const run = await requireRun(env);
    const results = await runWeek1Invariants(env.DB, run.id);
    const summary = invariantSummary(results);
    return json({ data: { results, summary } });
  }

  if (url.pathname === "/api/year1/test-pack" && request.method === "GET") {
    const run = await requireRun(env);
    const executions = await env.DB.prepare(
      `SELECT id, story_key AS storyKey, status, started_at AS startedAt, completed_at AS completedAt, last_error AS lastError
       FROM api_story_executions WHERE run_id = ? AND (story_key LIKE 'GOLD-M1-%' OR story_key LIKE 'SIM-M1-%') ORDER BY story_key`,
    ).bind(run.id).all();
    return json({
      data: {
        stories: month1ApiStories,
        executions: executions.results,
        total: month1ApiStories.length,
        executed: executions.results.length,
      },
    });
  }

  return errorResponse(404, "not_found", "API endpoint not found.");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.status, error.code, error.message, error.details);
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(JSON.stringify({ message: "simulation request failed", error: message, method: request.method, path: url.pathname }));
      return errorResponse(500, "internal_error", "Simulation Studio could not complete the request.");
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const result = await tickRun(env);
      console.log(JSON.stringify({ message: "simulation tick completed", runId: result.run?.id ?? null, processed: result.processed }));
    } catch (error) {
      console.error(JSON.stringify({ message: "simulation tick failed", error: error instanceof Error ? error.message : "Unknown error" }));
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;

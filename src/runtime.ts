import {
  companyHistory,
  injectSimulationScenario,
  simulateWorkingDay,
  simulationCompany,
  simulationEmployees,
  simulationScenarios,
  type SimulationActionBundle,
  type SimulationEvent,
} from "@appneural/erp-core/simulation";
import { createEventEnvelope as envelope, signEventRequest as sign } from "@appneural/erp-core/events";
import { activeRun, executeBatches, latestRun, type RunRow } from "./db";
import { HttpError } from "./http";
import { executeDueApiStories } from "./api-runner";

const EVENT_KINDS = ["business", "activity", "audit", "workflow", "notification"] as const;
const MAX_DUE_PER_TICK = 500;

type EventKind = typeof EVENT_KINDS[number] | "history";
type StoredBundle = { activityStatus: "completed" | "blocked" | "failed"; events: SimulationEvent[] };

export interface DashboardSummary {
  employeesOnline: number;
  employeesTotal: number;
  activitiesToday: number;
  activeWorkflows: number;
  pendingApprovals: number;
  exceptions: number;
  planned: number;
  processed: number;
}

export interface DashboardState {
  run: RunRow | null;
  company: typeof simulationCompany;
  summary: DashboardSummary | null;
  presence: Record<string, number>;
  modules: unknown[];
  events: unknown[];
  executions: unknown[];
  scenarios: typeof simulationScenarios;
}

export interface CreateRunInput {
  seed?: string;
  mode?: "live" | "accelerated" | "fast" | "replay" | "scenario";
  speed?: 1 | 10 | 60;
  companyTime?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, "invalid_company_time", "companyTime must be a valid ISO date-time.");
  return date.toISOString();
}

function companyDate(companyTime: string): string {
  const utc = new Date(companyTime);
  return new Date(utc.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function namespaceEvent(event: SimulationEvent, runId: string): SimulationEvent {
  return {
    ...event,
    id: `${runId}:${event.id}`,
    runId,
    correlationId: `${runId}:${event.correlationId}`,
    ...(event.causationId ? { causationId: `${runId}:${event.causationId}` } : {}),
    occurredAt: normalizeTime(event.occurredAt),
  };
}

function eventsFromBundle(bundle: SimulationActionBundle, runId: string): SimulationEvent[] {
  return [bundle.businessEvent, bundle.activityEvent, bundle.auditEvent, bundle.workflowEvent, bundle.notificationEvent]
    .filter((item): item is SimulationEvent => Boolean(item))
    .map((event) => namespaceEvent(event, runId));
}

function eventKind(event: SimulationEvent): EventKind {
  if (event.type === "Activity.Recorded") return "activity";
  if (event.type === "Audit.MutationRecorded") return "audit";
  if (event.type === "Workflow.TaskCreated") return "workflow";
  if (event.type === "Notification.Created") return "notification";
  return "business";
}

function eventInsert(db: D1Database, event: SimulationEvent, createdAt: string): D1PreparedStatement {
  return db.prepare(`INSERT OR IGNORE INTO business_events
    (id, run_id, event_kind, event_type, module, actor_id, aggregate_type, aggregate_id, occurred_at, correlation_id, causation_id, impact, summary, data_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(event.id, event.runId, eventKind(event), event.type, event.module, event.actorId, event.aggregateType,
      event.aggregateId, event.occurredAt, event.correlationId, event.causationId ?? null, event.impact,
      event.summary, JSON.stringify(event.data), createdAt);
}

function presenceFor(templateKey: string, label: string): "offline" | "working" | "meeting" {
  if (templateKey === "check-out") return "offline";
  if (templateKey === "check-in") return "working";
  return /standup|meeting|review|call|triage|walkthrough/i.test(label) ? "meeting" : "working";
}

export async function planDay(db: D1Database, run: RunRow, date: string): Promise<number> {
  const exists = await db.prepare(`SELECT 1 AS found FROM scheduled_activities WHERE run_id = ? AND scheduled_at >= ? AND scheduled_at < ? LIMIT 1`)
    .bind(run.id, `${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`).first<{ found: number }>();
  if (exists) return 0;

  const day = simulateWorkingDay(run.seed, date, run.id);
  const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const createdAt = nowIso();
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < day.plans.length; index += 1) {
    const plan = day.plans[index]!;
    if (weekend && !plan.employeeId.startsWith("SYSTEM-")) continue;
    const events = eventsFromBundle(day.bundles[index]!, run.id);
    const id = `${run.id}:${plan.id}`;
    const correlationId = `${run.id}:${plan.correlationId}`;
    const scheduledAt = normalizeTime(plan.scheduledAt);
    const stored: StoredBundle = { activityStatus: plan.status === "scheduled" ? "completed" : plan.status, events };
    statements.push(db.prepare(`INSERT OR IGNORE INTO scheduled_activities
      (id, run_id, employee_id, scheduled_at, template_key, module, label, status, impact, correlation_id, action_bundle_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`)
      .bind(id, run.id, plan.employeeId, scheduledAt, plan.templateKey, plan.module, plan.label, plan.impact,
        correlationId, JSON.stringify(stored), createdAt));
  }
  await executeBatches(db, statements);
  await db.prepare(`UPDATE simulation_runs SET planned_through_date = ?, updated_at = ? WHERE id = ?`)
    .bind(date, createdAt, run.id).run();
  return statements.length;
}

interface DueRow {
  id: string;
  employee_id: string;
  template_key: string;
  label: string;
  action_bundle_json: string;
}

export async function processDueActivities(db: D1Database, run: RunRow, through: string, maximum = MAX_DUE_PER_TICK): Promise<number> {
  let processed = 0;
  while (processed < maximum) {
    const due = await db.prepare(`SELECT id, employee_id, template_key, label, action_bundle_json
      FROM scheduled_activities WHERE run_id = ? AND status = 'scheduled' AND scheduled_at <= ?
      ORDER BY scheduled_at, id LIMIT 100`).bind(run.id, through).all<DueRow>();
    if (!due.results.length) break;
    const completedAt = nowIso();
    const statements: D1PreparedStatement[] = [];
    for (const row of due.results) {
      const stored = JSON.parse(row.action_bundle_json) as StoredBundle;
      for (const event of stored.events) statements.push(eventInsert(db, event, completedAt));
      statements.push(db.prepare(`UPDATE scheduled_activities SET status = ?, processed_at = ? WHERE id = ? AND status = 'scheduled'`)
        .bind(stored.activityStatus, completedAt, row.id));
      if (!row.employee_id.startsWith("SYSTEM-")) {
        statements.push(db.prepare(`UPDATE simulation_employees SET presence_state = ?, current_activity_id = ?, updated_at = ? WHERE run_id = ? AND employee_id = ?`)
          .bind(presenceFor(row.template_key, row.label), row.id, completedAt, run.id, row.employee_id));
      }
    }
    await executeBatches(db, statements);
    processed += due.results.length;
    if (due.results.length < 100) break;
  }
  return processed;
}

export async function createRun(env: Env, input: CreateRunInput = {}): Promise<RunRow> {
  const createdAt = nowIso();
  const companyTime = normalizeTime(input.companyTime ?? env.SIMULATION_DEFAULT_TIME);
  const mode = input.mode ?? "accelerated";
  const speed = mode === "fast" ? 60 : input.speed ?? 10;
  if (![1, 10, 60].includes(speed)) throw new HttpError(400, "invalid_speed", "Simulation speed must be 1, 10, or 60.");
  const seed = (input.seed ?? env.SIMULATION_DEFAULT_SEED).trim();
  if (!seed || seed.length > 160) throw new HttpError(400, "invalid_seed", "Simulation seed is required and must be at most 160 characters.");
  const runId = `SIM-${companyDate(companyTime).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  await env.DB.prepare(`UPDATE simulation_runs SET status = 'completed', updated_at = ? WHERE tenant_id = ? AND status != 'completed'`)
    .bind(createdAt, env.SIMULATION_TENANT_ID).run();
  await env.DB.prepare(`INSERT INTO simulation_runs
    (id, tenant_id, seed, mode, clock_profile, status, company_time, speed, tick, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'paused', ?, ?, 0, ?, ?)`) 
    .bind(runId, env.SIMULATION_TENANT_ID, seed, mode === "fast" ? "accelerated" : mode,
      mode === "fast" ? "fast" : "standard", companyTime, speed, createdAt, createdAt).run();

  const employeeStatements = simulationEmployees.map((employee) => env.DB.prepare(`INSERT INTO simulation_employees
    (run_id, employee_id, name, title, role_key, department, team, manager_id, location, timezone,
      work_start_minute, work_end_minute, permissions_json, project_ids_json, skills_json, presence_state, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline', ?)`)
    .bind(runId, employee.id, employee.name, employee.title, employee.roleKey, employee.department, employee.team,
      employee.managerId ?? null, employee.location, employee.timezone, employee.workStartMinute, employee.workEndMinute,
      JSON.stringify(employee.permissions), JSON.stringify(employee.projectIds), JSON.stringify(employee.skills), createdAt));
  const historyStatements = companyHistory.map(([occurredOn, summary], index) => env.DB.prepare(`INSERT INTO company_history
    (id, run_id, occurred_on, summary, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(`${runId}:HIST:${String(index + 1).padStart(3, "0")}`, runId, occurredOn, summary, createdAt));
  await executeBatches(env.DB, [...employeeStatements, ...historyStatements]);

  const start = new Date("2026-02-01T00:00:00Z");
  const end = new Date("2026-07-31T00:00:00Z");
  const calendarStatements: D1PreparedStatement[] = [];
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 86_400_000) {
    const date = new Date(cursor);
    const businessDate = date.toISOString().slice(0, 10);
    const day = date.getUTCDay();
    const weekend = day === 0 || day === 6;
    const holiday = businessDate === "2026-03-04" || businessDate === "2026-05-01";
    calendarStatements.push(env.DB.prepare(`INSERT INTO simulation_calendar_days
      (run_id, business_date, day_type, active_roles_json, note) VALUES (?, ?, ?, ?, ?)`)
      .bind(runId, businessDate, holiday ? "holiday" : weekend ? "weekend" : "working",
        JSON.stringify(holiday ? ["devops", "support"] : weekend ? ["devops"] : ["all"]),
        holiday ? "Company holiday; on-call coverage only" : weekend ? "Weekend; on-call coverage only" : null));
  }
  await executeBatches(env.DB, calendarStatements);

  let run = await activeRun(env.DB, env.SIMULATION_TENANT_ID);
  if (!run) throw new Error("Simulation run could not be created.");
  await planDay(env.DB, run, companyDate(companyTime));
  run = await activeRun(env.DB, env.SIMULATION_TENANT_ID) ?? run;
  await processDueActivities(env.DB, run, companyTime);
  return await latestRun(env.DB, env.SIMULATION_TENANT_ID) ?? run;
}

export async function tickRun(env: Env, minutes?: number): Promise<{ run: RunRow | null; processed: number }> {
  const run = await activeRun(env.DB, env.SIMULATION_TENANT_ID);
  if (!run) return { run: null, processed: 0 };
  if (minutes === undefined && run.status !== "running") return { run, processed: 0 };
  const advance = minutes ?? run.speed;
  const companyTime = new Date(new Date(run.company_time).getTime() + advance * 60_000).toISOString();
  const updatedAt = nowIso();
  const updatedRun: RunRow = { ...run, company_time: companyTime, tick: run.tick + 1, last_tick_at: updatedAt, updated_at: updatedAt };
  await planDay(env.DB, updatedRun, companyDate(companyTime));
  const processed = await processDueActivities(env.DB, updatedRun, companyTime);
  await env.DB.prepare(`UPDATE simulation_runs SET company_time = ?, tick = tick + 1, last_tick_at = ?, updated_at = ? WHERE id = ?`)
    .bind(companyTime, updatedAt, updatedAt, run.id).run();
  await executeDueApiStories(env, updatedRun, companyTime);
  return { run: await activeRun(env.DB, env.SIMULATION_TENANT_ID), processed };
}

export async function setRunState(env: Env, action: string, speed?: number): Promise<RunRow> {
  const run = await activeRun(env.DB, env.SIMULATION_TENANT_ID);
  if (!run) throw new HttpError(404, "simulation_not_initialized", "Create a simulation run first.");
  const updatedAt = nowIso();
  if (action === "pause" || action === "resume") {
    await env.DB.prepare(`UPDATE simulation_runs SET status = ?, updated_at = ? WHERE id = ?`)
      .bind(action === "pause" ? "paused" : "running", updatedAt, run.id).run();
  } else if (action === "speed") {
    if (![1, 10, 60].includes(speed ?? 0)) throw new HttpError(400, "invalid_speed", "Speed must be 1, 10, or 60.");
    await env.DB.prepare(`UPDATE simulation_runs SET speed = ?, mode = ?, updated_at = ? WHERE id = ?`)
      .bind(speed, speed === 1 ? "live" : "accelerated", updatedAt, run.id).run();
  } else if (action === "advance-hour" || action === "advance-day") {
    await tickRun(env, action === "advance-hour" ? 60 : 1_440);
  } else {
    throw new HttpError(400, "invalid_action", "Unsupported simulation control action.");
  }
  const updated = await activeRun(env.DB, env.SIMULATION_TENANT_ID);
  if (!updated) throw new Error("Active simulation run was lost.");
  return updated;
}

export async function injectScenario(env: Env, run: RunRow, scenarioId: string): Promise<{ executionId: string; events: SimulationEvent[] }> {
  const definition = simulationScenarios.find((scenario) => scenario.id === scenarioId);
  if (!definition) throw new HttpError(404, "scenario_not_found", "Unknown simulation scenario.");
  const rawEvents = injectSimulationScenario(run.seed, scenarioId, run.company_time, run.id);
  const events = rawEvents.map((event) => namespaceEvent(event, run.id));
  const executionId = `SCN-${crypto.randomUUID()}`;
  const startedAt = nowIso();
  const statements = events.map((event) => eventInsert(env.DB, event, startedAt));
  statements.push(env.DB.prepare(`INSERT INTO scenario_executions
    (id, run_id, scenario_id, label, correlation_id, status, event_count, affected_modules_json, started_at)
    VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?)`)
    .bind(executionId, run.id, scenarioId, definition.label, events[0]?.correlationId ?? executionId,
      events.length, JSON.stringify(definition.affectedModules), startedAt));
  await executeBatches(env.DB, statements);
  return { executionId, events };
}

export async function projectScenario(env: Env, runId: string, executionId: string, events: SimulationEvent[]): Promise<void> {
  let delivered = 0;
  const failures: string[] = [];
  for (const event of events) {
    const eventEnvelope = envelope({
      eventId: event.id,
      type: event.type,
      orgId: env.SIMULATION_ORG_ID,
      sourceModule: event.module,
      aggregate: { entityType: event.aggregateType, entityId: event.aggregateId },
      correlationId: event.correlationId,
      causationId: event.causationId,
      occurredAt: event.occurredAt,
      actorId: event.actorId,
      data: {
        effectiveAt: event.occurredAt,
        subject: { entityType: event.aggregateType, id: event.aggregateId, label: event.summary, href: null },
        payload: { ...event.data, simulationRunId: runId, impact: event.impact },
      },
    });
    const body = JSON.stringify(eventEnvelope);
    const headers = await sign(env.EVENT_SIGNING_SECRET, eventEnvelope, body);
    let status = 0;
    let failure: string | null = null;
    try {
      const response = await env.ORGANIZATION_SERVICE.fetch(new Request("https://organization.erp.appneural.com/api/workflows/events", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body,
      }));
      status = response.status;
      if (response.ok) delivered += 1;
      else failure = `Organization workflow projection returned ${response.status}.`;
      if (response.body) await response.body.cancel().catch(() => undefined);
    } catch (error) {
      failure = error instanceof Error ? error.message : "Projection failed.";
    }
    if (failure) failures.push(`${event.id}: ${failure}`);
    await env.DB.prepare(`INSERT INTO event_deliveries
      (id, run_id, event_id, target_module, target_path, status, http_status, error, attempted_at)
      VALUES (?, ?, ?, 'organization', '/api/workflows/events', ?, ?, ?, ?)`)
      .bind(`DLV-${crypto.randomUUID()}`, runId, event.id, failure ? "failed" : "delivered", status || null, failure, nowIso()).run();
  }
  const executionStatus = failures.length === 0 ? "projected" : delivered ? "partial" : "failed";
  await env.DB.prepare(`UPDATE scenario_executions SET status = ?, completed_at = ?, last_error = ? WHERE id = ?`)
    .bind(executionStatus, nowIso(), failures.slice(0, 5).join("; ") || null, executionId).run();
}

export async function createSnapshot(env: Env, run: RunRow): Promise<string> {
  const state = await dashboardState(env, run);
  if (!state.summary) throw new Error("Simulation summary is unavailable.");
  const id = `SNP-${crypto.randomUUID()}`;
  const createdAt = nowIso();
  await env.DB.prepare(`INSERT INTO company_snapshots
    (id, run_id, company_time, event_count, active_workflows, pending_approvals, exceptions, state_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, run.id, run.company_time, state.summary.activitiesToday, state.summary.activeWorkflows,
      state.summary.pendingApprovals, state.summary.exceptions, JSON.stringify(state), createdAt).run();
  return id;
}

interface CountRow { value: number }
interface ModuleCountRow { module: string; value: number }
interface PresenceCountRow { presence_state: string; value: number }

export async function dashboardState(env: Env, suppliedRun?: RunRow | null): Promise<DashboardState> {
  const run = suppliedRun === undefined ? await latestRun(env.DB, env.SIMULATION_TENANT_ID) : suppliedRun;
  if (!run) return { run: null, company: simulationCompany, scenarios: simulationScenarios, summary: null, events: [], modules: [], presence: {}, executions: [] };
  const day = companyDate(run.company_time);
  const start = normalizeTime(`${day}T00:00:00+05:30`);
  const end = normalizeTime(`${day}T23:59:59+05:30`);
  const [activities, workflows, approvals, exceptions, planned, processed, modules, presence, recentEvents, executions] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS value FROM business_events WHERE run_id = ? AND event_kind = 'activity' AND occurred_at BETWEEN ? AND ?`).bind(run.id, start, end).first<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS value FROM business_events WHERE run_id = ? AND event_kind = 'workflow' AND occurred_at BETWEEN ? AND ?`).bind(run.id, start, end).first<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS value FROM scheduled_activities WHERE run_id = ? AND lower(label) LIKE '%approval%' AND status = 'scheduled'`).bind(run.id).first<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS value FROM scheduled_activities WHERE run_id = ? AND impact != 'normal' AND scheduled_at BETWEEN ? AND ?`).bind(run.id, start, end).first<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS value FROM scheduled_activities WHERE run_id = ? AND scheduled_at BETWEEN ? AND ?`).bind(run.id, start, end).first<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS value FROM scheduled_activities WHERE run_id = ? AND status != 'scheduled' AND scheduled_at BETWEEN ? AND ?`).bind(run.id, start, end).first<CountRow>(),
    env.DB.prepare(`SELECT module, COUNT(*) AS value FROM scheduled_activities WHERE run_id = ? AND status != 'scheduled' AND scheduled_at BETWEEN ? AND ? GROUP BY module ORDER BY value DESC`).bind(run.id, start, end).all<ModuleCountRow>(),
    env.DB.prepare(`SELECT presence_state, COUNT(*) AS value FROM simulation_employees WHERE run_id = ? GROUP BY presence_state`).bind(run.id).all<PresenceCountRow>(),
    env.DB.prepare(`SELECT id, event_kind AS kind, event_type AS type, module, actor_id AS actorId, aggregate_id AS aggregateId, occurred_at AS occurredAt, correlation_id AS correlationId, causation_id AS causationId, impact, summary FROM business_events WHERE run_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 40`).bind(run.id).all(),
    env.DB.prepare(`SELECT id, scenario_id AS scenarioId, label, correlation_id AS correlationId, status, event_count AS eventCount, affected_modules_json AS affectedModules, started_at AS startedAt, completed_at AS completedAt, last_error AS lastError FROM scenario_executions WHERE run_id = ? ORDER BY started_at DESC LIMIT 8`).bind(run.id).all(),
  ]);
  const presenceMap: Record<string, number> = { working: 0, meeting: 0, leave: 0, offline: 0 };
  for (const row of presence.results) presenceMap[row.presence_state] = row.value;
  return {
    run,
    company: simulationCompany,
    summary: {
      employeesOnline: presenceMap.working + presenceMap.meeting,
      employeesTotal: simulationEmployees.length,
      activitiesToday: activities?.value ?? 0,
      activeWorkflows: workflows?.value ?? 0,
      pendingApprovals: approvals?.value ?? 0,
      exceptions: exceptions?.value ?? 0,
      planned: planned?.value ?? 0,
      processed: processed?.value ?? 0,
    },
    presence: presenceMap,
    modules: modules.results,
    events: recentEvents.results,
    executions: executions.results.map((item) => ({ ...item, affectedModules: JSON.parse(String(item.affectedModules)) })),
    scenarios: simulationScenarios,
  };
}

export async function listEvents(env: Env, run: RunRow, options: { limit: number; module?: string; correlationId?: string }): Promise<unknown[]> {
  const conditions = ["run_id = ?"];
  const bindings: Array<string | number> = [run.id];
  if (options.module) { conditions.push("module = ?"); bindings.push(options.module); }
  if (options.correlationId) { conditions.push("correlation_id = ?"); bindings.push(options.correlationId); }
  bindings.push(options.limit);
  const result = await env.DB.prepare(`SELECT id, event_kind AS kind, event_type AS type, module, actor_id AS actorId,
    aggregate_type AS aggregateType, aggregate_id AS aggregateId, occurred_at AS occurredAt,
    correlation_id AS correlationId, causation_id AS causationId, impact, summary, data_json AS data
    FROM business_events WHERE ${conditions.join(" AND ")} ORDER BY occurred_at DESC, id DESC LIMIT ?`)
    .bind(...bindings).all();
  return result.results.map((item) => ({ ...item, data: JSON.parse(String(item.data)) }));
}

export async function listEmployees(env: Env, run: RunRow): Promise<unknown[]> {
  const result = await env.DB.prepare(`SELECT employee_id AS id, name, title, role_key AS roleKey, department, team,
    manager_id AS managerId, location, timezone, work_start_minute AS workStartMinute, work_end_minute AS workEndMinute,
    skills_json AS skills, project_ids_json AS projectIds, presence_state AS presence, current_activity_id AS currentActivityId
    FROM simulation_employees WHERE run_id = ? ORDER BY department, name`).bind(run.id).all();
  return result.results.map((item) => ({ ...item, skills: JSON.parse(String(item.skills)), projectIds: JSON.parse(String(item.projectIds)) }));
}

export function dataQuality(): Record<string, unknown> {
  return {
    seed: simulationCompany.seed,
    personaCount: simulationEmployees.length,
    roleProfiles: new Set(simulationEmployees.map((employee) => employee.roleKey)).size,
    scenarioCount: simulationScenarios.length,
    actionBundleRule: ["business entity change", "activity event", "audit event", "optional workflow", "optional notification"],
    eventDistribution: { normal: 85, minor: 10, significant: 4, critical: 1 },
    integration: {
      studioPersistence: "materialized",
      organizationWorkflowProjection: "materialized via signed Cloudflare service binding",
      apiDrivenTwin: "6 deterministic February stories through Attendance, Resource, Recruitment and CRM portal APIs",
      apiAuthentication: "short-lived per-actor HMAC token with run, time, correlation and idempotency headers",
      assertionEvidence: "API response, entity read-back, target audit trail and permission denial are materialized",
      pendingDiagnostics: ["workflow", "related entity", "domain event", "My Work", "notification"],
      nativeCompletedErpContracts: ["organization→hr/recruitment", "recruitment→hr", "hr→attendance/payroll", "performance→learning/resource", "crm/support→customer"],
      moduleEntityMutations: "API stories mutate only through existing portal routes; unsupported modules remain master-storyline projections",
    },
    history: companyHistory.map(([date, summary]) => ({ date, summary })),
  };
}

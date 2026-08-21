const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const content = $("#content");
const authDialog = $("#authDialog");
const runDialog = $("#runDialog");
let token = sessionStorage.getItem("simulation-studio-token") ?? "";
let state = null;
let employees = [];
let quality = null;
let streamEvents = [];
let apiStoryData = null;
let currentView = location.hash.slice(1) || "overview";
let toastTimer;

const titles = {
  overview: "Simulation overview",
  timeline: "Company timeline",
  actors: "Synthetic actors",
  scenarios: "Scenario library",
  workflows: "Workflow inspector",
  events: "Event stream",
  company: "Company state",
  failures: "Failures & DLQ",
  reconciliation: "Reconciliation",
  replay: "Replay & snapshots",
  observability: "Observability",
  "causal-graph": "Business causal graph",
  explorer: "Story explorer",
  executive: "Executive dashboard",
  year1: "Year 1 — APPNEURAL Technologies",
  "api-operations": "API operations",
  quality: "Data quality",
};

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function fmtNumber(value) { return new Intl.NumberFormat("en-IN").format(Number(value ?? 0)); }
function fmtDate(value, options = {}) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: options.year ? "numeric" : undefined, hour: options.time === false ? undefined : "2-digit", minute: options.time === false ? undefined : "2-digit" }).format(new Date(value));
}
function initials(name) { return String(name).split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function percent(part, total) { return total ? Math.min(100, Math.round((part / total) * 100)) : 0; }

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show${isError ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3300);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers });
  let payload = null;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setConnected(connected) {
  $("#connectionLabel").textContent = connected ? "Connected" : "Locked";
  $(".pulse-dot").classList.toggle("live", connected);
}

function pageHead(title, description, actions = "") {
  return `<div class="page-head"><div><div class="eyebrow">SYNTHETIC COMPANY RUNTIME</div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="button-row">${actions}</div></div>`;
}

function emptyRuntime() {
  return `${pageHead("No active company runtime", "Create a deterministic company state before using Studio controls.")}
    <div class="panel empty"><div class="empty-icon">⌁</div><h2>Build the company from its timeline</h2><p>The runtime will create 64 role-aware employees, a complete working-day plan, atomic audit bundles, and a reproducible event stream from one seed.</p><button class="button primary" data-action="new-run">Create simulation run</button></div>`;
}

function kpi(label, value, note, icon) {
  return `<article class="kpi"><div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-icon">${icon}</span></div><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}

function eventRows(events, limit = 12) {
  if (!events?.length) return `<div class="empty"><p>No events have reached company time yet.</p></div>`;
  return `<div class="activity-list">${events.slice(0, limit).map((event) => `<article class="activity" data-correlation="${esc(event.correlationId)}">
    <div class="activity-top"><span class="tag ${esc(event.impact)}">${esc(event.module)}</span><span class="tag">${esc(event.kind)}</span><time>${fmtDate(event.occurredAt)}</time></div>
    <b>${esc(event.summary)}</b><small>${esc(event.type)} · ${esc(event.actorId)} · ${esc(event.aggregateId)}</small>
  </article>`).join("")}</div>`;
}

function overview() {
  if (!state?.run) return emptyRuntime();
  const { run, summary, presence, modules, events, executions } = state;
  const progress = percent(summary.processed, summary.planned);
  const controls = `<button class="button secondary" data-control="${run.status === "running" ? "pause" : "resume"}">${run.status === "running" ? "Pause" : "Resume"}</button>
    <button class="button secondary" data-speed="1">1×</button><button class="button secondary" data-speed="10">10×</button><button class="button secondary" data-speed="60">60×</button>
    <button class="button secondary" data-control="advance-hour">Advance 1 hour</button><button class="button secondary" data-control="advance-day">Advance 1 day</button>
    <button class="button primary" data-view-link="scenarios">Inject scenario</button>`;
  return `${pageHead("Company operating now", "A live, role-aware view of the simulated working day.", controls)}
    <section class="run-hero panel"><div><div class="eyebrow">${esc(run.id)}</div><h2>${fmtDate(run.company_time, { year: true })}</h2><p>${esc(state.company.name)} is running from deterministic seed <b>${esc(run.seed)}</b>. Every completed activity writes a business event, activity record and audit event.</p><span class="status-pill ${esc(run.status)}">${esc(run.status)} · ${run.speed}× · ${esc(run.mode)}</span></div>
      <div class="run-meta"><div><span>Plan progress</span><b>${summary.processed} / ${summary.planned}</b></div><div><span>Simulation tick</span><b>#${fmtNumber(run.tick)}</b></div><div><span>Working</span><b>${presence.working}</b></div><div><span>In meetings</span><b>${presence.meeting}</b></div></div></section>
    <section class="grid kpi-grid" style="margin-top:16px">${kpi("Employees online", `${summary.employeesOnline} / ${summary.employeesTotal}`, `${presence.offline} offline · ${presence.leave} leave`, "♙")}${kpi("Activities today", fmtNumber(summary.activitiesToday), `${progress}% of scheduled plan`, "↯")}${kpi("Active workflows", fmtNumber(summary.activeWorkflows), "Exception-driven follow-ups", "⌘")}${kpi("Pending approvals", fmtNumber(summary.pendingApprovals), "Across company modules", "✓")}${kpi("Exceptions", fmtNumber(summary.exceptions), "Minor to critical", "!")}</section>
    <section class="grid layout-2"><article class="panel"><div class="panel-head"><div><h3>Live event stream</h3><p>Business changes and their downstream audit trail</p></div><button class="button secondary" data-view-link="events">Open stream</button></div>${eventRows(events, 10)}</article>
      <div class="grid"><article class="panel"><div class="panel-head"><div><h3>Module activity</h3><p>Processed actions today</p></div></div><div class="panel-body module-list">${modules.slice(0, 9).map((item) => `<div class="module-line"><label>${esc(item.module)}</label><div class="progress"><span style="width:${percent(item.value, Math.max(...modules.map((entry) => Number(entry.value)), 1))}%"></span></div><b>${item.value}</b></div>`).join("") || "<p>No activity yet.</p>"}</div></article>
      <article class="panel"><div class="panel-head"><div><h3>Scenario executions</h3><p>Latest injected business conditions</p></div></div><div class="panel-body">${executions.length ? executions.slice(0, 4).map((item) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0"><div><b style="font-size:10px">${esc(item.label)}</b><small style="display:block;color:var(--muted);margin-top:4px">${item.eventCount} events</small></div><span class="tag ${esc(item.status)}">${esc(item.status)}</span></div>`).join("") : "<p style='font-size:10px'>No scenarios injected.</p>"}</div></article></div></section>`;
}

async function ensureQuality() { if (!quality) quality = await api("/api/data-quality"); }
async function companyView() {
  await ensureQuality();
  if (!state?.run) return emptyRuntime();
  const company = state.company;
  const actions = `<button class="button secondary" data-action="snapshot">Create snapshot</button><button class="button danger" data-action="new-run">New run / replay</button>`;
  return `${pageHead("Company state", "Founding history, present operating scale, and reproducible state controls.", actions)}
    <section class="grid kpi-grid">${kpi("Current employees", company.employees, `${company.historicalEmployees} historical employees`, "♙")}${kpi("Offices", company.offices, "Udaipur · Bengaluru · Gurugram", "⌂")}${kpi("Departments", company.departments, `${company.teams} delivery teams`, "◫")}${kpi("Active customers", company.activeCustomers, "Enterprise and mid-market", "◎")}${kpi("Active projects", company.activeDeliveryProjects + company.internalProjects, `${company.internalProjects} internal`, "⌘")}</section>
    <section class="grid layout-2"><article class="panel"><div class="panel-head"><div><h3>Company history</h3><p>Entity 360 foundation · 01 Apr 2024 onwards</p></div></div><div class="panel-body timeline">${quality.history.map((item) => `<div class="history-row"><time>${fmtDate(`${item.date}T00:00:00+05:30`, { year: true, time: false })}</time><i></i><b>${esc(item.summary)}</b></div>`).join("")}</div></article>
      <article class="panel"><div class="panel-head"><div><h3>Runtime identity</h3><p>Replay and audit coordinates</p></div></div><div class="panel-body run-meta" style="color:var(--ink);background:white"><div style="background:var(--soft)"><span>Run ID</span><b>${esc(state.run.id)}</b></div><div style="background:var(--soft)"><span>Seed</span><b>${esc(state.run.seed)}</b></div><div style="background:var(--soft)"><span>Mode</span><b>${esc(state.run.mode)}</b></div><div style="background:var(--soft)"><span>Speed</span><b>${state.run.speed}×</b></div></div></article></section>`;
}

async function employeesView() {
  if (!state?.run) return emptyRuntime();
  if (!employees.length) employees = (await api("/api/employees")).data;
  const departments = [...new Set(employees.map((employee) => employee.department))].sort();
  return `${pageHead("Synthetic workforce", "64 employees with role constraints, projects, skills, reporting lines and live presence.")}
    <article class="panel"><div class="table-tools"><input class="search" id="employeeSearch" placeholder="Search employee, role or project…" /><select id="departmentFilter"><option value="">All departments</option>${departments.map((department) => `<option>${esc(department)}</option>`).join("")}</select></div>
    <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Department / team</th><th>Location</th><th>Projects</th><th>Top skills</th><th>Presence</th></tr></thead><tbody id="employeeRows">${employeeTableRows(employees)}</tbody></table></div></article>`;
}

function employeeTableRows(rows) {
  return rows.map((employee) => `<tr><td><div class="person"><span class="person-avatar">${initials(employee.name)}</span><div><b>${esc(employee.name)}</b><small>${esc(employee.id)} · ${esc(employee.title)}</small></div></div></td><td>${esc(employee.department)}<br><small>${esc(employee.team)}</small></td><td>${esc(employee.location)}<br><small>${esc(employee.timezone)}</small></td><td>${employee.projectIds.map((item) => `<span class="tag">${esc(item)}</span>`).join(" ")}</td><td>${employee.skills.slice(0, 2).map((item) => `${esc(item.skill)} ${item.rating}/10`).join(" · ")}</td><td><span class="tag ${employee.presence === "working" ? "normal" : employee.presence === "meeting" ? "accepted" : ""}">${esc(employee.presence)}</span></td></tr>`).join("");
}

async function eventsView() {
  if (!state?.run) return emptyRuntime();
  const eventData = (await api("/api/events?limit=250")).data;
  streamEvents = eventData;
  const modules = [...new Set(eventData.map((event) => event.module))].sort();
  return `${pageHead("Event stream", "Inspect correlation, causation and atomic action bundles without flattening context.", `<button class="button secondary" data-action="refresh">Refresh</button>`)}
    <article class="panel"><div class="table-tools"><input class="search" id="eventSearch" placeholder="Search event, actor or entity…" /><select id="eventModule"><option value="">All modules</option>${modules.map((module) => `<option>${esc(module)}</option>`).join("")}</select></div><div id="eventRows">${eventRows(eventData, 250)}</div></article>`;
}

function scenariosView() {
  if (!state?.run) return emptyRuntime();
  return `${pageHead("Scenario injection", "Inject prerequisite-aware incidents into the current company time.")}
    <section class="grid scenario-grid">${state.scenarios.map((scenario) => `<article class="scenario-card"><span class="scenario-icon">⌘</span><h3>${esc(scenario.label)}</h3><p>${scenario.steps.length} causal steps across ${scenario.affectedModules.length} Micro-ERPs.</p><footer><small>${scenario.affectedModules.slice(0, 4).map(esc).join(" · ")}${scenario.affectedModules.length > 4 ? " …" : ""}</small><button class="button primary" data-scenario="${esc(scenario.id)}">Inject</button></footer></article>`).join("")}</section>`;
}

async function apiOperationsView() {
  if (!state?.run) return emptyRuntime();
  apiStoryData = (await api("/api/api-stories")).data;
  const executions = apiStoryData.operations.executions ?? [];
  const byStory = new Map(executions.map((item) => [item.storyKey, item]));
  const counts = Object.fromEntries((apiStoryData.operations.assertionCounts ?? []).map((item) => [item.status, item.value]));
  return `${pageHead("API-driven company twin", "February actions execute through the exact MicroERP portal APIs with actor tokens, simulated time, correlation and idempotency.", `<button class="button secondary" data-action="refresh">Refresh</button><button class="button primary" data-action="execute-february">Execute February</button>`)}
    <section class="grid kpi-grid">${kpi("Executable stories", apiStoryData.stories.length, "Deterministic February catalog", "⇄")}${kpi("Passed assertions", fmtNumber(counts.passed), "API, entity and permission evidence", "✓")}${kpi("Failed assertions", fmtNumber(counts.failed), "Must be resolved before replay", "!")}${kpi("Not observable", fmtNumber(counts.skipped), "Diagnostics not exposed by target ERP", "◇")}</section>
    <section class="grid layout-2" style="align-items:start"><article class="panel"><div class="panel-head"><div><h3>February execution catalog</h3><p>403 permission checks count as valid negative tests</p></div></div><div class="panel-body">${apiStoryData.stories.map((story) => {
      const execution = byStory.get(story.id);
      return `<article class="quality-item" style="margin-bottom:10px"><span class="check">${execution?.status === "passed" ? "✓" : execution?.status === "failed" ? "!" : "⇄"}</span><div style="min-width:0;flex:1"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><h3>${esc(story.id)} · ${esc(story.module)}</h3><p>${esc(story.intent)}</p><small>${fmtDate(story.companyTime, { year: true })} · ${esc(story.actorId)} · ${esc(story.actorRole)}</small></div>${execution ? `<span class="tag ${esc(execution.status)}">${esc(execution.status)}</span>` : `<button class="button primary" data-api-story="${esc(story.id)}">Execute</button>`}</div></div></article>`;
    }).join("")}</div></article>
    <div class="grid"><article class="panel"><div class="panel-head"><div><h3>Six-month storyline</h3><p>01 Feb – 31 Jul 2026</p></div></div><div class="panel-body timeline">${apiStoryData.months.map((month) => `<div class="history-row"><time>${esc(month.month)}</time><i></i><div><b>${esc(month.theme)}</b><small style="display:block;margin-top:4px">${month.outcomes.map(esc).join(" · ")}${month.executableStories ? ` · ${month.executableStories} executable` : " · master plan"}</small></div></div>`).join("")}</div></article>
    <article class="panel"><div class="panel-head"><div><h3>Recent story executions</h3><p>Deterministic once-per-run idempotency</p></div></div><div class="panel-body">${executions.length ? executions.map((item) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0"><div><b style="font-size:10px">${esc(item.storyKey)}</b><small style="display:block;color:var(--muted);margin-top:4px">${esc(item.actorId)} · ${esc(item.module)}</small></div><span class="tag ${esc(item.status)}">${esc(item.status)}</span></div>`).join("") : "<p>No API stories executed in this run.</p>"}</div></article></div></section>`;
}

async function qualityView() {
  await ensureQuality();
  return `${pageHead("Data quality & integration", "Evidence-backed coverage of deterministic data, action integrity and cross-ERP delivery.")}
    <section class="grid quality-grid">${[
      ["Deterministic company seed", `${quality.seed} reproduces the same history and daily plan.`],
      ["Role-aware personas", `${quality.personaCount} employees across ${quality.roleProfiles} behaviour profiles.`],
      ["Atomic action bundles", quality.actionBundleRule.join(" + ")],
      ["Realistic exception mix", `Normal ${quality.eventDistribution.normal}% · Minor ${quality.eventDistribution.minor}% · Significant ${quality.eventDistribution.significant}% · Critical ${quality.eventDistribution.critical}%`],
      ["Scenario library", `${quality.scenarioCount} prerequisite-aware business scenarios with shared correlations.`],
      ["Signed workflow projection", quality.integration.organizationWorkflowProjection],
    ].map(([title, copy]) => `<article class="quality-item"><span class="check">✓</span><div><h3>${esc(title)}</h3><p>${esc(copy)}</p></div></article>`).join("")}</section>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Integration truth table</h3><p>No fabricated downstream mutation claims</p></div></div><div class="panel-body"><div class="callout warning"><b>Native entity mutations</b><span>${esc(quality.integration.moduleEntityMutations)}</span></div><div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">${quality.integration.nativeCompletedErpContracts.map((item) => `<span class="tag projected">${esc(item)}</span>`).join("")}</div></div></article>`;
}

async function timelineView() {
  if (!state?.run) return emptyRuntime();
  const data = (await api("/api/timeline")).data;
  return `${pageHead("Company timeline", "Month-by-month business milestones and event volume.", `<button class="button secondary" data-action="refresh">Refresh</button>`)}
    <section class="grid kpi-grid">${kpi("Simulation day", `Day ${data.run.day}`, fmtDate(data.run.companyTime, { year: true }), "◷")}${kpi("History entries", fmtNumber(data.history.length), "Founding milestones", "↯")}${kpi("Active months", fmtNumber(data.months.length), "Months with events", "◫")}${kpi("Total events", fmtNumber(data.months.reduce((s, m) => s + m.events, 0)), "Across all modules", "⌘")}${kpi("Modules touched", fmtNumber(new Set(data.months.flatMap(() => [])).size || data.months.reduce((max, m) => Math.max(max, m.modules), 0)), "Unique ERP modules", "◎")}</section>
    <section class="grid layout-2"><article class="panel"><div class="panel-head"><div><h3>Company milestones</h3><p>Founding history and business-significant events</p></div></div><div class="panel-body">${data.history.length ? `<div class="timeline">${data.history.map((item) => `<div class="history-row"><time>${fmtDate(`${item.occurredOn}T00:00:00+05:30`, { year: true, time: false })}</time><i></i><b>${esc(item.summary)}</b></div>`).join("")}</div>` : "<p>No milestones recorded yet.</p>"}</div></article>
      <article class="panel"><div class="panel-head"><div><h3>Monthly event volume</h3><p>Business events per calendar month</p></div></div><div class="panel-body">${data.months.length ? data.months.map((month) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #edf0f4"><div><b style="font-size:10px">${esc(month.month)}</b><small style="display:block;color:var(--muted);margin-top:4px">${month.modules} modules active</small></div><span class="tag">${month.events} events</span></div>`).join("") : "<p>No events yet.</p>"}</div></article></section>`;
}

async function actorsView() {
  if (!state?.run) return emptyRuntime();
  const data = (await api("/api/actors")).data;
  return `${pageHead("Synthetic actors", "Employees with role-aware activity and event footprints.", `<button class="button secondary" data-action="refresh">Refresh</button>`)}
    <section class="grid actor-grid">${data.map((actor) => `<article class="actor-card" data-actor="${esc(actor.id)}"><div class="person"><span class="person-avatar">${initials(actor.name)}</span><div><b>${esc(actor.name)}</b><small>${esc(actor.title)}</small></div></div><div class="actor-stats"><div><span>Activities</span><b>${fmtNumber(actor.completedActivities)}</b></div><div><span>Events</span><b>${fmtNumber(actor.eventCount)}</b></div><div><span>Role</span><b style="font-size:10px">${esc(actor.roleKey)}</b></div></div><small style="display:block;margin-top:10px;color:var(--muted);font-size:9px">${esc(actor.department)} · ${esc(actor.team)} · ${esc(actor.location)}</small></article>`).join("") || "<p>No actors found.</p>"}</section>`;
}

async function workflowsView() {
  if (!state?.run) return emptyRuntime();
  const data = (await api("/api/workflows")).data;
  const countMap = Object.fromEntries(data.counts.map((c) => [c.status, c.value]));
  return `${pageHead("Workflow inspector", "Approval-type activities with status tracking.", `<button class="button secondary" data-action="refresh">Refresh</button>`)}
    <section class="grid kpi-grid">${kpi("Total workflows", fmtNumber(data.workflows.length), "Approval activities", "⇶")}${kpi("Completed", fmtNumber(countMap.completed ?? 0), "Successfully processed", "✓")}${kpi("Scheduled", fmtNumber(countMap.scheduled ?? 0), "Pending execution", "◷")}${kpi("Failed", fmtNumber(countMap.failed ?? 0), "Require attention", "!")}${kpi("Processing", fmtNumber(countMap.processing ?? 0), "In progress", "↯")}</section>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Approval workflows</h3><p>Recent approval-type scheduled activities</p></div></div><div class="panel-body">${data.workflows.length ? `<div class="workflow-list">${data.workflows.map((wf) => `<article class="workflow-item"><div class="workflow-item-top"><span class="tag ${esc(wf.status)}">${esc(wf.status)}</span><span class="tag">${esc(wf.module)}</span><span class="tag">${esc(wf.impact)}</span><time>${fmtDate(wf.scheduledAt)}</time></div><b>${esc(wf.label)}</b><small>${esc(wf.templateKey)} · ${esc(wf.employeeId)}${wf.correlationId ? ` · ${esc(wf.correlationId)}` : ""}</small></article>`).join("")}</div>` : "<p>No approval workflows found.</p>"}</div></article>`;
}

async function failuresView() {
  if (!state?.run) return emptyRuntime();
  const data = (await api("/api/failures")).data;
  return `${pageHead("Failures & Dead Letter Queue", "Failed deliveries, activities and scenario errors requiring attention.", `<button class="button secondary" data-action="refresh">Refresh</button>`)}
    <section class="grid kpi-grid">${kpi("Failed deliveries", fmtNumber(data.deliveries.length), "Event dispatch failures", "⚠")}${kpi("Failed activities", fmtNumber(data.activities.length), "Scheduled activity errors", "!")}${kpi("Failed scenarios", fmtNumber(data.scenarios.length), "Scenario execution errors", "⌘")}${kpi("Total issues", fmtNumber(data.deliveries.length + data.activities.length + data.scenarios.length), "All failure categories", "◇")}${kpi("Health", data.deliveries.length + data.activities.length === 0 ? "Healthy" : "Degraded", data.deliveries.length + data.activities.length === 0 ? "No failures detected" : "Attention required", "◉")}</section>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Failed event deliveries</h3><p>Events that could not be dispatched to target modules</p></div></div>${data.deliveries.length ? `<div class="table-wrap"><table class="dlq-table"><thead><tr><th>Event</th><th>Target</th><th>Path</th><th>HTTP</th><th>Error</th><th>When</th></tr></thead><tbody>${data.deliveries.map((d) => `<tr><td>${esc(d.eventId)}</td><td>${esc(d.targetModule)}</td><td>${esc(d.targetPath)}</td><td><span class="tag critical">${d.httpStatus ?? "—"}</span></td><td class="error-cell">${esc(d.error ?? "—")}</td><td>${fmtDate(d.attemptedAt)}</td></tr>`).join("")}</tbody></table></div>` : "<div class=\"panel-body\"><p>No failed deliveries.</p></div>"}</article>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Failed activities</h3><p>Scheduled activities that did not complete successfully</p></div></div>${data.activities.length ? `<div class="panel-body"><div class="workflow-list">${data.activities.map((a) => `<article class="workflow-item"><div class="workflow-item-top"><span class="tag failed">${esc(a.status)}</span><span class="tag">${esc(a.module)}</span><span class="tag">${esc(a.impact)}</span><time>${fmtDate(a.scheduledAt)}</time></div><b>${esc(a.label)}</b><small>${esc(a.templateKey)} · ${esc(a.employeeId)}</small></article>`).join("")}</div></div>` : "<div class=\"panel-body\"><p>No failed activities.</p></div>"}</article>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Scenario errors</h3><p>Scenario executions that failed or partially completed</p></div></div>${data.scenarios.length ? `<div class="panel-body"><div class="workflow-list">${data.scenarios.map((s) => `<article class="workflow-item"><div class="workflow-item-top"><span class="tag ${esc(s.status)}">${esc(s.status)}</span><time>${fmtDate(s.startedAt)}</time></div><b>${esc(s.label)}</b><small>${esc(s.scenarioId)}${s.lastError ? ` · ${esc(s.lastError)}` : ""}</small></article>`).join("")}</div></div>` : "<div class=\"panel-body\"><p>No scenario errors.</p></div>"}</article>`;
}

async function reconciliationView() {
  if (!state?.run) return emptyRuntime();
  const data = (await api("/api/reconciliation")).data;
  const iconFor = (status) => status === "pass" ? "✓" : status === "fail" ? "✕" : "!";
  return `${pageHead("Reconciliation", "Cross-ERP consistency checks and data integrity rules.", `<button class="button secondary" data-action="refresh">Refresh</button>`)}
    <section class="grid kpi-grid">${kpi("Total rules", fmtNumber(data.summary.total), "Cross-ERP checks", "◇")}${kpi("Passing", fmtNumber(data.summary.pass), "Rules fully satisfied", "✓")}${kpi("Warnings", fmtNumber(data.summary.warning), "Minor inconsistencies", "!")}${kpi("Failing", fmtNumber(data.summary.fail), "Critical mismatches", "✕")}${kpi("Coverage", data.summary.total > 0 ? `${Math.round((data.summary.pass / data.summary.total) * 100)}%` : "—", "Rule pass rate", "◉")}</section>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Reconciliation rules</h3><p>Cross-ERP data integrity verification</p></div></div><div class="panel-body"><div class="rule-list">${data.rules.map((rule) => `<article class="rule-item"><span class="rule-icon ${esc(rule.status)}">${iconFor(rule.status)}</span><div class="rule-content"><h3>${esc(rule.id)} · ${esc(rule.label)}</h3><small>${esc(rule.source)}</small><small>${esc(rule.detail)}</small></div><span class="tag ${rule.status === "pass" ? "delivered" : rule.status === "fail" ? "failed" : "accepted"}">${esc(rule.status)}</span></article>`).join("")}</div></div></article>`;
}

async function replayView() {
  if (!state?.run) return emptyRuntime();
  const data = (await api("/api/replay")).data;
  return `${pageHead("Replay & snapshots", "Point-in-time company state captures for deterministic replay.", `<button class="button secondary" data-action="snapshot">Create snapshot</button><button class="button secondary" data-action="refresh">Refresh</button>`)}
    <section class="grid kpi-grid">${kpi("Run status", data.run.status, `Tick #${fmtNumber(data.run.tick)}`, "◷")}${kpi("Company time", fmtDate(data.run.companyTime, { year: true }), "Current simulation time", "⌘")}${kpi("Snapshots", fmtNumber(data.snapshots.length), "Point-in-time captures", "⟳")}${kpi("Latest snapshot", data.snapshots.length ? fmtDate(data.snapshots[0].companyTime, { year: true }) : "—", data.snapshots.length ? `${data.snapshots[0].eventCount} events captured` : "No snapshots yet", "◎")}${kpi("Mode", data.run.id.slice(0, 12), "Run identifier", "⌁")}</section>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Snapshot history</h3><p>Chronological company state captures</p></div></div><div class="panel-body">${data.snapshots.length ? `<div class="snapshot-list">${data.snapshots.map((snap) => `<article class="snapshot-item"><time>${fmtDate(snap.companyTime, { year: true })}</time><div style="flex:1"><b>Snapshot ${esc(snap.id)}</b><small>${fmtNumber(snap.eventCount)} events · ${fmtNumber(snap.activeWorkflows)} workflows · ${fmtNumber(snap.pendingApprovals)} approvals · ${fmtNumber(snap.exceptions)} exceptions</small></div><span class="tag">${fmtDate(snap.createdAt)}</span></article>`).join("")}</div>` : "<p>No snapshots captured yet. Create one to save the current company state.</p>"}</div></article>`;
}

async function observabilityView() {
  if (!state?.run) return emptyRuntime();
  const data = (await api("/api/observability")).data;
  return `${pageHead("Observability", "System health, event distribution and module activity metrics.", `<button class="button secondary" data-action="refresh">Refresh</button>`)}
    <section class="grid kpi-grid">${kpi("Health", data.health, `${data.totalEvents} total events`, data.health === "healthy" ? "✓" : "!")}${kpi("Run status", data.runInfo.status, `${data.runInfo.speed}× · ${esc(data.runInfo.mode)}`, "◷")}${kpi("Company time", fmtDate(data.runInfo.companyTime, { year: true }), `Tick #${fmtNumber(data.runInfo.tick)}`, "⌘")}${kpi("Event kinds", fmtNumber(data.eventsByKind.length), "Distinct event types", "↯")}${kpi("Top module", data.moduleActivity.length ? data.moduleActivity[0].module : "—", data.moduleActivity.length ? `${fmtNumber(data.moduleActivity[0].value)} events` : "—", "◎")}</section>
    <section class="grid obs-grid" style="margin-top:16px"><article class="obs-panel"><h3>Events by kind</h3>${data.eventsByKind.length ? data.eventsByKind.map((e) => `<div class="obs-stat"><span>${esc(e.kind)}</span><b>${fmtNumber(e.value)}</b></div>`).join("") : "<p>No events yet.</p>"}</article>
      <article class="obs-panel"><h3>Workflow status</h3>${data.workflowsByStatus.length ? data.workflowsByStatus.map((w) => `<div class="obs-stat"><span>${esc(w.status)}</span><b>${fmtNumber(w.value)}</b></div>`).join("") : "<p>No workflows yet.</p>"}</article>
      <article class="obs-panel"><h3>Delivery health</h3>${data.deliveryHealth.length ? data.deliveryHealth.map((d) => `<div class="obs-stat"><span>${esc(d.status)}</span><b>${fmtNumber(d.value)}</b></div>`).join("") : "<p>No deliveries yet.</p>"}</article>
      <article class="obs-panel"><h3>Module activity</h3>${data.moduleActivity.length ? data.moduleActivity.map((m) => `<div class="obs-stat"><span>${esc(m.module)}</span><b>${fmtNumber(m.value)}</b></div>`).join("") : "<p>No module activity yet.</p>"}</article></section>`;
}

async function causalGraphView() {
  if (!state?.run) return emptyRuntime();
  const data = (await api("/api/causal-graph")).data;
  const edges = data.edges;
  const depths = new Map();
  for (const edge of edges) { depths.set(edge.id, edge.causationId ? (depths.get(edge.causationId) ?? 0) + 1 : 0); }
  return `${pageHead("Business causal graph", "Event causation chains for root-cause analysis and impact tracing.", `<button class="button secondary" data-action="refresh">Refresh</button>`)}
    <section class="grid kpi-grid">${kpi("Causal edges", fmtNumber(edges.length), "Events with causation", "⤟")}${kpi("Unique causes", fmtNumber(new Set(edges.map((e) => e.causationId).filter(Boolean)).size), "Distinct root causes", "↯")}${kpi("Max depth", fmtNumber(Math.max(0, ...[...depths.values()])), "Longest causation chain", "◫")}${kpi("Modules", fmtNumber(new Set(edges.map((e) => e.module)).size), "Modules in causal chains", "◎")}${kpi("Impact spread", edges.filter((e) => e.impact === "critical").length > 0 ? "Critical" : edges.filter((e) => e.impact === "significant").length > 0 ? "Significant" : "Normal", "Highest impact in chains", "!")}</section>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Causation chains</h3><p>Events linked by cause-and-effect relationships</p></div></div><div class="panel-body causal-graph">${edges.length ? edges.map((edge) => `<article class="causal-node" style="--depth:${Math.min(5, depths.get(edge.id) ?? 0) * 24}px"><span class="tag ${esc(edge.impact)}">${esc(edge.module)}</span><b>${esc(edge.summary)}</b><small>${esc(edge.type)} · ${fmtDate(edge.occurredAt)} · caused by ${esc(edge.causationId)}</small></article>`).join("") : "<p>No causal relationships found yet.</p>"}</div></article>`;
}

async function explorerView() {
  if (!state?.run) return emptyRuntime();
  return `${pageHead("Story explorer", "Trace the complete lifecycle of any entity across all Micro-ERPs.", `<button class="button secondary" data-action="refresh">Refresh</button>`)}
    <div class="explorer-controls"><select id="explorerType"><option value="employee">Employee</option><option value="customer">Customer</option><option value="project">Project</option><option value="invoice">Invoice</option><option value="vendor">Vendor</option><option value="incident">Incident</option><option value="risk">Risk</option></select><input id="explorerId" placeholder="Enter entity ID (e.g. EMP-1001, PRJ-5001, CUS-3001)…" /><button class="button primary" id="explorerSearch">Explore story</button></div>
    <div id="explorerResults"><article class="panel"><div class="panel-body"><div class="empty"><div class="empty-icon">⊞</div><h2>Search for an entity</h2><p>Enter an entity ID above to trace its complete story across all Micro-ERP modules, events, and correlations.</p></div></div></article></div>`;
}

async function runExplorerSearch() {
  const type = $("#explorerType")?.value ?? "employee";
  const entityId = $("#explorerId")?.value?.trim();
  if (!entityId) { showToast("Enter an entity ID to explore.", true); return; }
  const data = (await api(`/api/explorer?type=${encodeURIComponent(type)}&id=${encodeURIComponent(entityId)}`)).data;
  $("#explorerResults").innerHTML = `<article class="panel"><div class="panel-head"><div><h3>${esc(type)} story: ${esc(data.entityId)}</h3><p>${data.story.length} events found across Micro-ERP modules</p></div></div><div class="panel-body">${data.story.length ? `<div class="story-timeline">${data.story.map((event) => `<article class="story-event"><div class="story-event-top"><span class="tag ${esc(event.impact)}">${esc(event.module)}</span><span class="tag">${esc(event.aggregateType)}</span><time>${fmtDate(event.occurredAt)}</time></div><b>${esc(event.summary)}</b><small>${esc(event.type)} · ${esc(event.aggregateId)}${event.correlationId ? ` · correlation: ${esc(event.correlationId)}` : ""}</small></article>`).join("")}</div>` : "<p>No events found for this entity.</p>"}</div></article>`;
}

async function executiveView() {
  if (!state?.run) return emptyRuntime();
  const data = (await api("/api/executive")).data;
  return `${pageHead("Executive dashboard", "High-level company simulation KPIs and operating metrics.")}
    <section class="exec-hero"><div class="eyebrow">COMPANY DIGITAL TWIN</div><h2>${esc(data.company.name)}</h2><p>Day ${data.day} · ${esc(data.company.stage)} · ${fmtDate(data.companyTime, { year: true })} · ${esc(data.status)} · ${data.employeesOnline} of ${data.employees} employees online</p></section>
    <section class="grid exec-kpi-grid">${kpi("Employees", fmtNumber(data.employees), `${data.employeesOnline} online now`, "♙").replace("kpi", "exec-kpi")}${kpi("Total events", fmtNumber(data.totalEvents), `${fmtNumber(data.totalWorkflows)} workflow events`, "↯").replace("kpi", "exec-kpi")}${kpi("Failed activities", fmtNumber(data.failedActivities), data.failedActivities === 0 ? "All clear" : "Needs attention", "!").replace("kpi", "exec-kpi")}${kpi("Scenarios", fmtNumber(data.scenarios), "Available scenario packs", "⌘").replace("kpi", "exec-kpi")}</section>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Module activity</h3><p>Top modules by event volume</p></div></div><div class="panel-body">${data.modules.length ? data.modules.map((m, i) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;${i < data.modules.length - 1 ? "border-bottom:1px solid #edf0f4" : ""}"><div><b style="font-size:10px;text-transform:capitalize">${esc(m.module)}</b></div><span class="tag">${fmtNumber(m.value)} events</span></div>`).join("") : "<p>No module activity yet.</p>"}</div></article>`;
}

async function year1View() {
  const [year1Data, invariantData, testPackData] = await Promise.all([
    api("/api/year1"),
    state?.run ? api("/api/year1/invariants").catch(() => ({ data: { results: [], summary: { total: 9, pass: 0, warning: 0, fail: 0 } } })) : Promise.resolve({ data: { results: [], summary: { total: 9, pass: 0, warning: 0, fail: 0 } } }),
    state?.run ? api("/api/year1/test-pack").catch(() => ({ data: { stories: [], executions: [], total: 13, executed: 0 } })) : Promise.resolve({ data: { stories: [], executions: [], total: 13, executed: 0 } }),
  ]);
  const company = year1Data.data.company;
  const snap = year1Data.data.snapshot;
  const entries = year1Data.data.entries;
  const invariants = invariantData.data.results;
  const invSummary = invariantData.data.summary;
  const workflows = year1Data.data.workflows;
  const testStories = testPackData.data.stories;
  const testExecs = testPackData.data.executions;
  const execMap = new Map(testExecs.map((e) => [e.storyKey, e]));

  const entriesByDay = new Map();
  for (const entry of entries) {
    if (!entriesByDay.has(entry.day)) entriesByDay.set(entry.day, []);
    entriesByDay.get(entry.day).push(entry);
  }

  const dayLabels = ["Day 0 — Bootstrap", "Day 1 — Finance", "Day 2 — Vendors", "Day 3 — Recruitment", "Day 4 — First Hire", "Day 5 — Sales & CRM", "Day 6 — Engineering", "Day 7 — Operations"];

  return `${pageHead("Year 1 — APPNEURAL Technologies", "Month 1, Day 0–7: Company Foundation → First Employees → Operating Company", `<button class="button secondary" data-action="refresh">Refresh</button>`)}
    <section class="exec-hero"><div class="eyebrow">${esc(company.id)} · ${esc(company.incorporatedOn)}</div><h2>${esc(company.name)}</h2><p>Day ${snap.day} / ${company.durationDays} · ${esc(snap.stage)} · ${snap.employees} employees · Pipeline ₹${fmtNumber(snap.pipeline / 100000)}L · Cash ~₹${fmtNumber(snap.openingCapital / 100000)}L</p></section>
    <section class="grid kpi-grid">${kpi("Employees", snap.employees, `${snap.acceptedJoiners} accepted joiner`, "♙")}${kpi("Pipeline", `₹${fmtNumber(snap.pipeline / 100000)}L`, `${snap.opportunities} opportunity`, "₹")}${kpi("Departments", snap.departments, `${snap.positions} positions (${snap.openPositions} open)`, "◫")}${kpi("Projects", snap.internalProjects, `${snap.stories} stories in Sprint 1`, "⌘")}${kpi("Vendors", snap.activeVendors, `${snap.vendorOnboarding} onboarding`, "◎")}${kpi("Invariants", `${invSummary.pass}/${invSummary.total}`, `${invSummary.fail} failing`, "✓")}</section>
    <section class="grid layout-2"><article class="panel"><div class="panel-head"><div><h3>Day-by-day timeline</h3><p>Business-significant activities Day 0–7</p></div></div><div class="panel-body">${dayLabels.map((label, day) => {
      const dayEntries = entriesByDay.get(day) ?? [];
      return `<details class="year1-day"${day <= 2 ? " open" : ""}><summary><b>${label}</b><span>${dayEntries.length} activities</span></summary><div class="year1-entries">${dayEntries.map((e) => `<div class="year1-entry"><span class="tag ${esc(e.chain || "")}">${esc(e.erp)}</span><b>${esc(e.activity)}</b>${e.event ? `<small>Event: ${esc(e.event)}</small>` : ""}${e.entities?.length ? `<small>Entities: ${e.entities.map((ent) => esc(ent.id)).join(", ")}</small>` : ""}</div>`).join("")}</div></details>`;
    }).join("")}</div></article>
    <div class="grid"><article class="panel"><div class="panel-head"><div><h3>Cross-ERP invariants</h3><p>Week-1 data consistency checks</p></div></div><div class="panel-body"><div class="rule-list">${invariants.map((inv) => `<article class="rule-item"><span class="rule-icon ${esc(inv.status)}">${inv.status === "pass" ? "✓" : inv.status === "fail" ? "✕" : "!"}</span><div class="rule-content"><h3>${esc(inv.id)} · ${esc(inv.label)}</h3><small>${esc(inv.source)}</small><small>Expected: ${esc(inv.expected)}</small><small>Actual: ${esc(inv.actual)}</small></div><span class="tag ${inv.status === "pass" ? "delivered" : inv.status === "fail" ? "failed" : "accepted"}">${esc(inv.status)}</span></article>`).join("") || "<p>No invariant data yet. Start a simulation run first.</p>"}</div></div></article>
    <article class="panel"><div class="panel-head"><div><h3>Workflow executions</h3><p>10 major workflow runs</p></div></div><div class="panel-body"><div class="workflow-list">${workflows.map((wf) => `<article class="workflow-item"><div class="workflow-item-top"><span class="tag ${esc(wf.status === "complete" ? "completed" : wf.status === "in-progress" ? "scheduled" : "accepted")}">${esc(wf.status)}</span></div><b>${esc(wf.label)}</b><small>${esc(wf.id)}</small></article>`).join("")}</div></div></article></div></section>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>API test pack — SIM-M1-001 to SIM-M1-013</h3><p>13 executable cross-ERP test stories</p></div></div><div class="panel-body">${testStories.length ? testStories.map((story) => {
      const exec = execMap.get(story.id);
      return `<article class="quality-item" style="margin-bottom:10px"><span class="check">${exec?.status === "passed" ? "✓" : exec?.status === "failed" ? "!" : "⇄"}</span><div style="min-width:0;flex:1"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><h3>${esc(story.id)} · ${esc(story.module)}</h3><p>${esc(story.intent)}</p><small>${esc(story.actorId)} · ${story.steps.length} steps · ${story.assertions.length} assertions</small></div>${exec ? `<span class="tag ${esc(exec.status)}">${esc(exec.status)}</span>` : `<button class="button primary" data-api-story="${esc(story.id)}">Execute</button>`}</div></div></article>`;
    }).join("") : "<p>Start a simulation run to access the test pack.</p>"}</div></article>
    <article class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Vikram's first week — Cross-ERP story</h3><p>Position → Recruitment → Employee → Asset → Admin → Security → Project → Resource</p></div></div><div class="panel-body"><div class="story-timeline">${year1Data.data.vikramStory.map((step) => `<article class="story-event"><div class="story-event-top"><span class="tag">${esc(step.erp)}</span><span class="tag">${esc(step.entity)}</span></div><b>${esc(step.label)}</b></article>`).join("")}</div></div></article>`;
}

async function render() {
  currentView = location.hash.slice(1) || currentView || "overview";
  if (!titles[currentView]) currentView = "overview";
  $("#pageTitle").textContent = titles[currentView];
  $$("#nav a").forEach((item) => item.classList.toggle("active", item.dataset.view === currentView));
  $("#companyClock").textContent = state?.run ? fmtDate(state.run.company_time, { year: true }) : "—";
  content.innerHTML = `<div class="loading-card"><span class="loader"></span></div>`;
  try {
    if (currentView === "company") content.innerHTML = await companyView();
    else if (currentView === "timeline") content.innerHTML = await timelineView();
    else if (currentView === "actors") content.innerHTML = await actorsView();
    else if (currentView === "workflows") content.innerHTML = await workflowsView();
    else if (currentView === "events") content.innerHTML = await eventsView();
    else if (currentView === "scenarios") content.innerHTML = scenariosView();
    else if (currentView === "failures") content.innerHTML = await failuresView();
    else if (currentView === "reconciliation") content.innerHTML = await reconciliationView();
    else if (currentView === "replay") content.innerHTML = await replayView();
    else if (currentView === "observability") content.innerHTML = await observabilityView();
    else if (currentView === "causal-graph") content.innerHTML = await causalGraphView();
    else if (currentView === "explorer") content.innerHTML = await explorerView();
    else if (currentView === "executive") content.innerHTML = await executiveView();
    else if (currentView === "year1") content.innerHTML = await year1View();
    else if (currentView === "api-operations") content.innerHTML = await apiOperationsView();
    else if (currentView === "quality") content.innerHTML = await qualityView();
    else content.innerHTML = overview();
    bindViewControls();
  } catch (error) {
    content.innerHTML = `<div class="panel empty"><div class="empty-icon">!</div><h2>View could not be loaded</h2><p>${esc(error.message)}</p><button class="button primary" data-action="refresh">Try again</button></div>`;
    bindViewControls();
  }
}

async function load() {
  state = await api("/api/bootstrap");
  setConnected(true);
  await render();
}

async function mutate(path, body, message) {
  content.classList.add("busy");
  try {
    const payload = await api(path, { method: "POST", body: JSON.stringify(body ?? {}) });
    if (payload.data?.run || path === "/api/control") state = payload.data;
    else state = await api("/api/bootstrap");
    showToast(message);
    await render();
  } catch (error) {
    showToast(error.message, true);
  } finally { content.classList.remove("busy"); }
}

function bindViewControls() {
  $$('[data-view-link]').forEach((button) => button.addEventListener("click", () => { location.hash = button.dataset.viewLink; }));
  $$('[data-control]').forEach((button) => button.addEventListener("click", () => mutate("/api/control", { action: button.dataset.control }, "Simulation clock updated.")));
  $$('[data-speed]').forEach((button) => button.addEventListener("click", () => mutate("/api/control", { action: "speed", speed: Number(button.dataset.speed) }, `Simulation speed changed to ${button.dataset.speed}×.`)));
  $$('[data-scenario]').forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    await mutate("/api/scenarios", { scenarioId: button.dataset.scenario }, "Scenario accepted; projection is running.");
  }));
  $$('[data-api-story]').forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    await mutate(`/api/api-stories/${encodeURIComponent(button.dataset.apiStory)}/execute`, {}, `${button.dataset.apiStory} execution completed.`);
  }));
  $$('[data-action="new-run"]').forEach((button) => button.addEventListener("click", () => runDialog.showModal()));
  $$('[data-action="snapshot"]').forEach((button) => button.addEventListener("click", () => mutate("/api/snapshots", {}, "Company snapshot created.")));
  $$('[data-action="execute-february"]').forEach((button) => button.addEventListener("click", () => mutate("/api/api-stories/execute-february", {}, "Due February API stories executed.")));
  $$('[data-action="refresh"]').forEach((button) => button.addEventListener("click", () => load().catch(handleAuthError)));
  const employeeSearch = $("#employeeSearch");
  const departmentFilter = $("#departmentFilter");
  if (employeeSearch && departmentFilter) {
    const filter = () => {
      const search = employeeSearch.value.toLowerCase();
      const department = departmentFilter.value;
      const rows = employees.filter((employee) => (!department || employee.department === department) && `${employee.name} ${employee.title} ${employee.projectIds.join(" ")}`.toLowerCase().includes(search));
      $("#employeeRows").innerHTML = employeeTableRows(rows);
    };
    employeeSearch.addEventListener("input", filter); departmentFilter.addEventListener("change", filter);
  }
  const eventSearch = $("#eventSearch");
  const eventModule = $("#eventModule");
  if (eventSearch && eventModule) {
    const filter = () => {
      const search = eventSearch.value.toLowerCase();
      const module = eventModule.value;
      const rows = streamEvents.filter((event) => (!module || event.module === module) && `${event.type} ${event.summary} ${event.actorId} ${event.aggregateId}`.toLowerCase().includes(search));
      $("#eventRows").innerHTML = eventRows(rows, 250);
      bindEventRows();
    };
    eventSearch.addEventListener("input", filter); eventModule.addEventListener("change", filter);
  }
  bindEventRows();
  const explorerSearch = $("#explorerSearch");
  if (explorerSearch) {
    explorerSearch.addEventListener("click", () => runExplorerSearch());
    const explorerId = $("#explorerId");
    if (explorerId) explorerId.addEventListener("keydown", (e) => { if (e.key === "Enter") runExplorerSearch(); });
  }
}

function bindEventRows() {
  $$('.activity[data-correlation]').forEach((row) => row.addEventListener("click", () => showEventGraph(row.dataset.correlation)));
}

async function showEventGraph(correlationId) {
  try {
    const events = (await api(`/api/events?limit=100&correlationId=${encodeURIComponent(correlationId)}`)).data.reverse();
    const depths = new Map();
    for (const event of events) depths.set(event.id, event.causationId ? (depths.get(event.causationId) ?? 0) + 1 : 0);
    $("#eventDialogContent").innerHTML = `<div class="dialog-head" style="padding:22px 22px 0"><div><div class="eyebrow">CORRELATION GRAPH</div><h2>${esc(correlationId)}</h2></div><button class="icon-button close" id="closeEventDialog">×</button></div><div class="event-graph">${events.map((event) => `<article class="event-node" style="--depth:${Math.min(5, depths.get(event.id) ?? 0) * 24}px"><span class="tag ${esc(event.impact)}">${esc(event.module)}</span><b>${esc(event.summary)}</b><small>${esc(event.type)} · ${fmtDate(event.occurredAt)}${event.causationId ? ` · caused by ${esc(event.causationId)}` : ""}</small></article>`).join("")}</div>`;
    $("#closeEventDialog").addEventListener("click", () => $("#eventDialog").close());
    $("#eventDialog").showModal();
  } catch (error) { showToast(error.message, true); }
}

function handleAuthError(error) {
  setConnected(false);
  if (error?.status === 401 || error?.status === 503) {
    $("#authError").textContent = error.status === 401 ? "Token was not accepted." : error.message;
    if (!authDialog.open) authDialog.showModal();
  } else showToast(error?.message ?? "Studio connection failed.", true);
}

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  token = $("#tokenInput").value;
  $("#authError").textContent = "";
  try {
    await load();
    sessionStorage.setItem("simulation-studio-token", token);
    authDialog.close();
  } catch (error) { handleAuthError(error); }
});

$("#runForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  runDialog.close();
  const localCompanyTime = String(form.get("companyTime"));
  await mutate("/api/runs", { seed: form.get("seed"), mode: form.get("mode"), speed: Number(form.get("speed")), companyTime: new Date(`${localCompanyTime}:00+05:30`).toISOString() }, "Synthetic company runtime created.");
});

$("#refreshButton").addEventListener("click", () => load().catch(handleAuthError));
$("#lockButton").addEventListener("click", () => { token = ""; sessionStorage.removeItem("simulation-studio-token"); setConnected(false); authDialog.showModal(); });
window.addEventListener("hashchange", () => render());

if (token) load().catch(handleAuthError);
else authDialog.showModal();

setInterval(() => {
  if (token && state?.run?.status === "running" && !document.hidden) load().catch(() => undefined);
}, 15_000);

/**
 * Year 2 Scenario Generator — Delivery Generator
 *
 * Generates project delivery stories: new projects, resource allocations,
 * contracts, project milestones, and change requests.
 */

import type { ApiStory } from "../api-stories";
import type { GeneratorContext } from "../types";
import { step, generatedAssertions } from "../types";
import {
  randomCompanyName, randomDateTimeInMonth, randomFutureDate,
  nextProjectCode, nextAllocationCode,
} from "../probability";
import { projectsPerMonth, selectActor } from "../business-rules";

// ─── New Projects ─────────────────────────────────────────────────────────────

function generateProjectStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state, phase } = ctx;
  const stories: ApiStory[] = [];
  const count = projectsPerMonth(phase, rng);

  const projectTypes = [
    "ERP Implementation", "Platform Development", "Digital Transformation",
    "Cloud Migration", "Custom Software", "Analytics Dashboard",
    "Mobile Application", "API Integration", "System Modernization",
    "Process Automation", "Data Pipeline", "Security Assessment",
  ];

  for (let i = 0; i < count; i++) {
    ctx.sequence++;
    const projCode = nextProjectCode();
    const client = rng.chance(0.6) && state.customers.length > 0
      ? rng.pick(state.customers).name
      : randomCompanyName(rng);
    const actor = selectActor("project", state.employees, rng);
    const budget = rng.int(500000, 8000000);
    const dayBase = Math.max(1, Math.floor((i / count) * 18) + 1);

    // 2-step story: create project, then create milestone linked to it
    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, dayBase, dayBase + 3),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "project",
      preconditions: [`${state.activeProjectCount} active projects`, `${phase.label} phase`],
      intent: `New project: ${projCode} — ${rng.pick(projectTypes)} for ${client} with kickoff milestone.`,
      steps: [
        step("project", "POST", "/api/projects", 201, {
          name: `${client} — ${rng.pick(projectTypes)}`,
          code: projCode,
          client,
          managerEmail: actor.actorEmail,
          startDate: randomDateTimeInMonth(rng, month, dayBase + 1, dayBase + 7).slice(0, 10),
          endDate: randomFutureDate(rng, `${month}-15`, 3, 9),
          budget,
          status: rng.pick(["planning", "active"]),
        }, "/api/projects?pageSize=200"),
        step("project", "POST", "/api/milestones", 201, {
          projectId: "$PREV.createdId",
          name: `Kickoff — ${rng.pick(["Requirements gathering", "Architecture design", "Sprint 0 setup", "Discovery phase", "Initial planning"])}`,
          baselineDate: randomDateTimeInMonth(rng, month, dayBase + 7, dayBase + 14).slice(0, 10),
          forecastDate: randomDateTimeInMonth(rng, month, dayBase + 7, dayBase + 14).slice(0, 10),
          isBillingTrigger: false,
        }, "/api/milestones?pageSize=200"),
      ],
      expectedState: [`Project ${projCode} created for ${client}`, `Kickoff milestone created`],
      crossEvents: ["project.created", "project.milestone-created"],
      notifications: ["Project manager receives kickoff task", "Milestone added to project plan"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Resource Allocations ─────────────────────────────────────────────────────

function generateAllocationStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];

  if (state.activeProjectCount === 0 || state.employees.length === 0) return stories;

  const allocCount = rng.int(1, Math.min(4, state.activeProjectCount));
  const roles = [
    "Software Engineer", "Senior Engineer", "QA Engineer", "DevOps Engineer",
    "Product Designer", "Business Analyst", "Tech Lead", "Project Manager",
  ];

  for (let i = 0; i < allocCount; i++) {
    ctx.sequence++;
    const emp = rng.pick(state.employees);
    const project = state.projects.filter((p) => p.status === "active" || p.status === "in_progress");
    const targetProject = project.length > 0 ? rng.pick(project) : rng.pick(state.projects);
    const actor = selectActor("resource", state.employees, rng);
    const allocPct = rng.pick([25, 30, 40, 50, 60, 75, 100]);

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, 1 + i * 3, 5 + i * 3),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "resource",
      preconditions: [`${emp.fullName} is active`, `Project ${targetProject.code} is active`],
      intent: `Allocate ${emp.fullName} to ${targetProject.code} at ${allocPct}%.`,
      steps: [
        step("resource", "POST", "/api/allocations", 201, {
          allocationNo: nextAllocationCode(),
          resourceId: `RES-${emp.employeeCode}`,
          employeeCode: emp.employeeCode,
          projectId: targetProject.code,
          role: rng.pick(roles),
          allocationPercent: allocPct,
          startDate: `${month}-01`,
          endDate: randomFutureDate(rng, `${month}-15`, 2, 6),
        }, "/api/allocations?pageSize=200"),
      ],
      expectedState: [`${emp.fullName} allocated to ${targetProject.code} at ${allocPct}%`],
      crossEvents: ["resource.allocation-created"],
      notifications: ["Employee and manager notified of allocation"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Contracts ────────────────────────────────────────────────────────────────

function generateContractStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];

  // 1-2 contracts per month (MSA, SOW, or amendment).
  const contractCount = rng.int(1, 2);
  const contractTypes = ["MSA", "SOW", "Amendment", "Renewal"];

  for (let i = 0; i < contractCount; i++) {
    ctx.sequence++;
    const customer = state.customers.length > 0
      ? rng.pick(state.customers).name
      : randomCompanyName(rng);
    const actor = selectActor("customer", state.employees, rng);
    const type = rng.pick(contractTypes);
    const value = rng.int(500000, 10000000);

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, 5 + i * 7, 10 + i * 7),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "contract",
      preconditions: [`Customer ${customer} exists`],
      intent: `Create ${type} contract with ${customer} (value: ${Math.round(value / 100000)}L).`,
      steps: [
        step("contract", "POST", "/api/contracts", 201, {
          contractNo: `CTR-Y2-${String(ctx.sequence).padStart(3, "0")}`,
          title: `${type} — ${customer}`,
          counterpartyName: customer,
          counterpartyType: "customer",
          contractType: type === "MSA" ? "msa" : type === "SOW" ? "sow" : "amendment",
          ownerEmail: actor.actorEmail,
          value: String(value),
          currency: "INR",
          startOn: `${month}-01`,
          endOn: randomFutureDate(rng, `${month}-15`, 6, 18),
          status: "draft",
          description: `${type} for ${rng.pick(["software development", "platform maintenance", "consulting services", "managed support", "implementation project"])} with ${customer}.`,
        }, "/api/contracts?pageSize=200"),
      ],
      expectedState: [`${type} contract created with ${customer}`],
      crossEvents: ["contract.created"],
      notifications: ["Legal and finance notified for review"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Combined Delivery Generator ──────────────────────────────────────────────

export function generateDeliveryStories(ctx: GeneratorContext): ApiStory[] {
  return [
    ...generateProjectStories(ctx),
    ...generateAllocationStories(ctx),
    ...generateContractStories(ctx),
  ];
}

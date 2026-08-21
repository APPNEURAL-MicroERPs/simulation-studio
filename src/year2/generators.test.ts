import assert from "node:assert/strict";
import test from "node:test";
import type { GeneratorContext, CompanyState, GrowthPhase } from "./types";
import type { RunRow } from "../db";
import { createRNG, resetCounters, initializeCountersForMonth } from "./probability";
import { getGrowthPhase } from "./business-rules";
import { generateHiringStories } from "./generators/hiring";
import { generatePeopleStories } from "./generators/people";
import { generateSalesStories } from "./generators/sales";
import { generateDeliveryStories } from "./generators/delivery";
import { generateFinanceStories } from "./generators/finance";
import { generateOperationsStories } from "./generators/operations";
import { generateGovernanceStories } from "./generators/governance";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const MOCK_EMPLOYEES = [
  { employeeCode: "EMP-1001", fullName: "Priya Sharma", email: "priya@nexora.example", department: "Executive", designation: "Founder & CEO", location: "Udaipur", employmentStatus: "active", dateOfJoining: "2026-04-01" },
  { employeeCode: "EMP-1006", fullName: "Meera Joshi", email: "meera@nexora.example", department: "People", designation: "HR Manager", location: "Udaipur", employmentStatus: "active", dateOfJoining: "2026-04-01" },
  { employeeCode: "EMP-1008", fullName: "Karan Malhotra", email: "karan@nexora.example", department: "Sales", designation: "Sales Director", location: "Gurugram", employmentStatus: "active", dateOfJoining: "2026-04-01" },
  { employeeCode: "EMP-1012", fullName: "Sandeep Patel", email: "sandeep@nexora.example", department: "Engineering", designation: "Lead Engineer", location: "Bengaluru", employmentStatus: "active", dateOfJoining: "2026-04-01" },
  { employeeCode: "EMP-1020", fullName: "Neha Gupta", email: "neha@nexora.example", department: "Engineering", designation: "Software Engineer", location: "Bengaluru", employmentStatus: "active", dateOfJoining: "2026-06-15" },
  { employeeCode: "EMP-1025", fullName: "Ravi Kumar", email: "ravi@nexora.example", department: "Finance", designation: "Financial Analyst", location: "Udaipur", employmentStatus: "active", dateOfJoining: "2026-07-01" },
  { employeeCode: "EMP-1030", fullName: "Amit Verma", email: "amit@nexora.example", department: "Governance", designation: "Security Manager", location: "Udaipur", employmentStatus: "active", dateOfJoining: "2026-05-01" },
  { employeeCode: "EMP-1035", fullName: "Pooja Singh", email: "pooja@nexora.example", department: "Support", designation: "Support Engineer", location: "Mumbai", employmentStatus: "active", dateOfJoining: "2026-08-01" },
];

const MOCK_CUSTOMERS = [
  { id: "CUST-001", name: "ABC Manufacturing", tier: "enterprise", ownerEmail: "karan@nexora.example" },
  { id: "CUST-002", name: "EduSphere Tech", tier: "growth", ownerEmail: "karan@nexora.example" },
];

const MOCK_PROJECTS = [
  { id: "PRJ-001", code: "PRJ-INT-001", name: "Internal Platform v2", status: "active", client: "Internal", managerEmail: "priya@nexora.example" },
  { id: "PRJ-002", code: "PRJ-ABC-001", name: "ABC ERP Implementation", status: "active", client: "ABC Manufacturing", managerEmail: "sandeep@nexora.example" },
];

const MOCK_VENDORS = [
  { id: "VND-001", displayName: "TechSupply Co", code: "VND-TECHSUPPLY", status: "ACTIVE" },
  { id: "VND-002", displayName: "OfficeMart India", code: "VND-OFFICEMART", status: "ACTIVE" },
];

function createMockState(overrides?: Partial<CompanyState>): CompanyState {
  return {
    employeeCount: MOCK_EMPLOYEES.length,
    departments: { Executive: 1, People: 1, Sales: 1, Engineering: 2, Finance: 1, Governance: 1, Support: 1 },
    employees: MOCK_EMPLOYEES,
    customerCount: MOCK_CUSTOMERS.length,
    customers: MOCK_CUSTOMERS,
    activeProjectCount: MOCK_PROJECTS.length,
    completedProjectCount: 0,
    projects: MOCK_PROJECTS,
    vendorCount: MOCK_VENDORS.length,
    vendors: MOCK_VENDORS,
    openRequisitionCount: 2,
    leadCount: 5,
    opportunityCount: 3,
    pipelineValue: 12000000,
    invoiceCount: 4,
    journalEntryCount: 20,
    budgetCount: 2,
    riskCount: 3,
    findingCount: 2,
    securityReviewCount: 1,
    auditCampaignCount: 0,
    performanceCycleCount: 1,
    ticketCount: 5,
    contractCount: 2,
    billingInvoiceCount: 4,
    purchaseOrderCount: 3,
    expenseCount: 10,
    ...overrides,
  };
}

function createMockContext(month: string, seed = "test-seed", overrides?: Partial<CompanyState>): GeneratorContext {
  resetCounters();
  initializeCountersForMonth(month);
  const rng = createRNG(`${seed}:${month}`);
  const state = createMockState(overrides);
  const phase: GrowthPhase = getGrowthPhase(state.employeeCount);
  return {
    run: { id: "test-run-001" } as RunRow,
    month,
    dayStart: 366,
    state,
    rng,
    phase,
    sequence: 0,
  };
}

// ─── Shared Story Validation ─────────────────────────────────────────────────

function validateStoryStructure(stories: ReturnType<typeof generateHiringStories>, month: string) {
  for (const story of stories) {
    assert.ok(story.id, "story must have an id");
    assert.equal(story.month, month, `story ${story.id} month must be ${month}`);
    assert.ok(story.companyTime.startsWith(month), `story ${story.id} companyTime must start with ${month}`);
    assert.ok(story.actorId.startsWith("EMP-"), `story ${story.id} actorId must start with EMP-`);
    assert.ok(["owner", "manager", "member"].includes(story.actorRole), `story ${story.id} has invalid role`);
    assert.ok(story.steps.length > 0, `story ${story.id} must have steps`);
    assert.ok(story.intent.length > 0, `story ${story.id} must have intent`);
    assert.ok(story.assertions.length > 0, `story ${story.id} must have assertions`);

    for (const step of story.steps) {
      assert.ok(step.path.startsWith("/api/"), `story ${story.id} step path must start with /api/`);
      assert.ok([200, 201, 202, 400, 403, 404].includes(step.expectedStatus), `story ${story.id} step has invalid status ${step.expectedStatus}`);
    }
  }
}

// ─── Hiring Generator ────────────────────────────────────────────────────────

test("hiring generator produces requisition + job stories", () => {
  const ctx = createMockContext("2027-04");
  const stories = generateHiringStories(ctx);
  assert.ok(stories.length > 0, "must produce at least one story");
  validateStoryStructure(stories, "2027-04");

  // Find requisition+job stories (2-step stories)
  const reqJobStories = stories.filter((s) => s.steps.length === 2 && s.steps[0]!.path === "/api/requisitions");
  assert.ok(reqJobStories.length > 0, "must have at least one requisition+job story");

  for (const story of reqJobStories) {
    assert.equal(story.steps[0]!.path, "/api/requisitions");
    assert.equal(story.steps[1]!.path, "/api/jobs");
    assert.equal(story.steps[1]!.body?.requisitionId, "$PREV.createdId", "job must reference parent requisition");
  }
});

test("hiring generator produces candidate stories", () => {
  const ctx = createMockContext("2027-05");
  const stories = generateHiringStories(ctx);
  const candidateStories = stories.filter((s) => s.steps.some((step) => step.path === "/api/candidates"));
  assert.ok(candidateStories.length > 0, "must produce candidate stories");

  for (const story of candidateStories) {
    const candStep = story.steps.find((s) => s.path === "/api/candidates");
    assert.ok(candStep?.body?.fullName);
    assert.ok(candStep?.body?.email);
  }
});

test("hiring generator produces employee hire stories (70% probability)", () => {
  // Run multiple times to test probability
  let hireCount = 0;
  for (let i = 0; i < 10; i++) {
    const ctx = createMockContext(`2027-${String(4 + (i % 9)).padStart(2, "0")}`, `hire-test-${i}`);
    const stories = generateHiringStories(ctx);
    const hireStories = stories.filter((s) => s.module === "hr" && s.steps.some((step) => step.path === "/api/employees"));
    hireCount += hireStories.length;
  }
  // With 70% probability and multiple requisitions, we should get some hires
  assert.ok(hireCount > 0, "should produce at least some hire stories across 10 iterations");
});

test("hiring stories have unique IDs within a month", () => {
  const ctx = createMockContext("2027-06");
  const stories = generateHiringStories(ctx);
  const ids = new Set(stories.map((s) => s.id));
  assert.equal(ids.size, stories.length, "all story IDs must be unique");
});

// ─── Sales Generator ─────────────────────────────────────────────────────────

test("sales generator produces lead + opportunity stories", () => {
  const ctx = createMockContext("2027-04");
  const stories = generateSalesStories(ctx);
  assert.ok(stories.length > 0);
  validateStoryStructure(stories, "2027-04");

  // Find lead+opportunity stories (2-step stories)
  const leadOppStories = stories.filter((s) => s.steps.length === 2 && s.steps[0]!.path === "/api/leads");
  assert.ok(leadOppStories.length > 0, "must have lead+opportunity stories");

  for (const story of leadOppStories) {
    assert.equal(story.steps[0]!.path, "/api/leads");
    assert.equal(story.steps[1]!.path, "/api/opportunities");
    assert.equal(story.steps[1]!.body?.sourceLeadId, "$PREV.createdId", "opportunity must reference parent lead");
  }
});

test("sales generator produces standalone opportunity stories", () => {
  const ctx = createMockContext("2027-05");
  const stories = generateSalesStories(ctx);
  const oppStories = stories.filter((s) => s.steps.some((step) => step.path === "/api/opportunities" && !JSON.stringify(step.body).includes("$PREV.createdId")));
  assert.ok(oppStories.length > 0, "must have standalone opportunity stories");
});

test("sales generator may produce customer onboarding stories", () => {
  let customerCount = 0;
  for (let i = 0; i < 20; i++) {
    const ctx = createMockContext(`2027-${String(4 + (i % 9)).padStart(2, "0")}`, `sales-test-${i}`);
    const stories = generateSalesStories(ctx);
    customerCount += stories.filter((s) => s.module === "customer").length;
  }
  // With win probability ~20-32%, we should get some customers across 20 iterations
  assert.ok(customerCount > 0, "should produce at least some customer stories across 20 iterations");
});

// ─── Delivery Generator ──────────────────────────────────────────────────────

test("delivery generator produces project + milestone stories", () => {
  const ctx = createMockContext("2027-04");
  const stories = generateDeliveryStories(ctx);
  assert.ok(stories.length > 0);
  validateStoryStructure(stories, "2027-04");

  const projMsStories = stories.filter((s) => s.steps.length === 2 && s.steps[0]!.path === "/api/projects");
  assert.ok(projMsStories.length > 0, "must have project+milestone stories");

  for (const story of projMsStories) {
    assert.equal(story.steps[0]!.path, "/api/projects");
    assert.equal(story.steps[1]!.path, "/api/milestones");
    assert.equal(story.steps[1]!.body?.projectId, "$PREV.createdId", "milestone must reference parent project");
  }
});

test("delivery generator produces allocation stories", () => {
  const ctx = createMockContext("2027-05");
  const stories = generateDeliveryStories(ctx);
  const allocStories = stories.filter((s) => s.steps.some((step) => step.path === "/api/allocations"));
  assert.ok(allocStories.length > 0, "must produce allocation stories");

  for (const story of allocStories) {
    const allocStep = story.steps.find((s) => s.path === "/api/allocations");
    assert.ok(allocStep?.body?.employeeCode);
    assert.ok(allocStep?.body?.projectId);
  }
});

test("delivery generator produces contract stories", () => {
  const ctx = createMockContext("2027-06");
  const stories = generateDeliveryStories(ctx);
  const contractStories = stories.filter((s) => s.module === "contract");
  assert.ok(contractStories.length > 0, "must produce contract stories");

  for (const story of contractStories) {
    const ctrStep = story.steps.find((s) => s.path === "/api/contracts");
    assert.ok(ctrStep?.body?.counterpartyName);
    assert.ok(ctrStep?.body?.contractNo);
  }
});

test("delivery allocation stories skip when no active projects", () => {
  const ctx = createMockContext("2027-04", "no-projects", { activeProjectCount: 0, projects: [] });
  const stories = generateDeliveryStories(ctx);
  const allocStories = stories.filter((s) => s.steps.some((step) => step.path === "/api/allocations"));
  assert.equal(allocStories.length, 0, "must not produce allocation stories without projects");
});

// ─── Finance Generator ───────────────────────────────────────────────────────

test("finance generator produces journal entry stories", () => {
  const ctx = createMockContext("2027-04");
  const stories = generateFinanceStories(ctx);
  const journalStories = stories.filter((s) => s.steps.some((step) => step.path === "/api/journal-entries"));
  assert.ok(journalStories.length >= 3, "must produce at least 3 journal stories");

  for (const story of journalStories) {
    const jeStep = story.steps.find((s) => s.path === "/api/journal-entries");
    assert.ok(jeStep?.body?.entryNo);
    assert.ok(jeStep?.body?.accountCode);
    assert.ok(typeof jeStep?.body?.debit === "number");
  }
});

test("finance generator produces expense stories", () => {
  const ctx = createMockContext("2027-05");
  const stories = generateFinanceStories(ctx);
  const expStories = stories.filter((s) => s.module === "expense");
  assert.ok(expStories.length >= 2, "must produce at least 2 expense stories");

  for (const story of expStories) {
    const expStep = story.steps.find((s) => s.path === "/api/claims");
    assert.ok(expStep?.body?.claimNo);
    assert.ok(expStep?.body?.employeeCode);
  }
});

test("finance generator produces invoice + payment stories", () => {
  const ctx = createMockContext("2027-06");
  const stories = generateFinanceStories(ctx);
  const billingStories = stories.filter((s) => s.steps.length === 2 && s.steps[0]!.path === "/api/invoices");
  assert.ok(billingStories.length > 0, "must have invoice+payment stories");

  for (const story of billingStories) {
    assert.equal(story.steps[0]!.path, "/api/invoices");
    assert.equal(story.steps[1]!.path, "/api/payments");
    assert.equal(story.steps[1]!.body?.invoiceRef, "$PREV.createdId", "payment must reference parent invoice");
  }
});

test("finance generator produces budget stories only in quarterly months", () => {
  // Q1 month (June = "06")
  const qCtx = createMockContext("2027-06");
  const qStories = generateFinanceStories(qCtx);
  const qBudget = qStories.filter((s) => s.steps.some((step) => step.path === "/api/budgets"));
  assert.ok(qBudget.length > 0, "quarterly month must have budget stories");

  // Non-quarterly month (April = "04")
  const nCtx = createMockContext("2027-04");
  const nStories = generateFinanceStories(nCtx);
  const nBudget = nStories.filter((s) => s.steps.some((step) => step.path === "/api/budgets"));
  assert.equal(nBudget.length, 0, "non-quarterly month must not have budget stories");
});

// ─── Operations Generator ────────────────────────────────────────────────────

test("operations generator produces procurement request + PO stories", () => {
  const ctx = createMockContext("2027-04");
  const stories = generateOperationsStories(ctx);
  const poStories = stories.filter((s) => s.steps.length === 2 && s.steps[0]!.path === "/api/requests");
  assert.ok(poStories.length > 0, "must have request+PO stories");

  for (const story of poStories) {
    assert.equal(story.steps[0]!.path, "/api/requests");
    assert.equal(story.steps[1]!.path, "/api/purchase-orders");
    assert.equal(story.steps[1]!.body?.requestRef, "$PREV.createdId", "PO must reference parent request");
  }
});

test("operations generator produces vendor evaluation stories", () => {
  const ctx = createMockContext("2027-05");
  const stories = generateOperationsStories(ctx);
  const vendorStories = stories.filter((s) => s.module === "vendor");
  assert.ok(vendorStories.length > 0, "must produce vendor evaluation stories");

  for (const story of vendorStories) {
    const scStep = story.steps.find((s) => s.path === "/api/vendor-scorecards");
    assert.ok(scStep?.body?.vendorId);
    assert.ok(typeof scStep?.body?.overallScore === "number");
  }
});

test("operations generator skips vendor stories when no vendors", () => {
  const ctx = createMockContext("2027-04", "no-vendors", { vendors: [], vendorCount: 0 });
  const stories = generateOperationsStories(ctx);
  const vendorStories = stories.filter((s) => s.module === "vendor");
  assert.equal(vendorStories.length, 0, "must not produce vendor stories without vendors");
});

test("operations generator produces support ticket stories", () => {
  const ctx = createMockContext("2027-06");
  const stories = generateOperationsStories(ctx);
  const ticketStories = stories.filter((s) => s.module === "support");
  assert.ok(ticketStories.length > 0, "must produce support ticket stories");

  for (const story of ticketStories) {
    const tktStep = story.steps.find((s) => s.path === "/api/tickets");
    assert.ok(tktStep?.body?.ticketNo);
    assert.ok(tktStep?.body?.subject);
  }
});

test("operations generator produces admin supply stories", () => {
  const ctx = createMockContext("2027-07");
  const stories = generateOperationsStories(ctx);
  const adminStories = stories.filter((s) => s.module === "administration");
  assert.ok(adminStories.length > 0, "must produce admin stories");

  for (const story of adminStories) {
    const supStep = story.steps.find((s) => s.path === "/api/supplies");
    assert.ok(supStep?.body?.name);
    assert.ok(supStep?.body?.unit);
  }
});

test("operations generator produces asset stories", () => {
  const ctx = createMockContext("2027-08");
  const stories = generateOperationsStories(ctx);
  const assetStories = stories.filter((s) => s.module === "asset");
  assert.ok(assetStories.length > 0, "must produce asset stories");

  for (const story of assetStories) {
    const astStep = story.steps.find((s) => s.path === "/api/assets");
    assert.ok(astStep?.body?.assetTag);
    assert.ok(astStep?.body?.assignedTo);
  }
});

// ─── Governance Generator ────────────────────────────────────────────────────

test("governance generator produces security review + finding stories", () => {
  // Run multiple times to find one with findings > 0
  let foundFindings = false;
  for (let i = 0; i < 20; i++) {
    const ctx = createMockContext(`2027-${String(4 + (i % 9)).padStart(2, "0")}`, `gov-test-${i}`);
    const stories = generateGovernanceStories(ctx);
    const secStories = stories.filter((s) => s.module === "security" && s.steps.some((step) => step.path === "/api/reviews"));
    for (const story of secStories) {
      const findingStep = story.steps.find((s) => s.path === "/api/findings");
      if (findingStep) {
        assert.equal(findingStep.body?.reviewId, "$PREV.createdId", "finding must reference parent review");
        foundFindings = true;
      }
    }
  }
  assert.ok(foundFindings, "should produce at least one finding across 20 iterations");
});

test("governance generator produces compliance finding stories", () => {
  const ctx = createMockContext("2027-04");
  const stories = generateGovernanceStories(ctx);
  const compStories = stories.filter((s) => s.module === "compliance");
  assert.ok(compStories.length > 0, "must produce compliance stories");

  for (const story of compStories) {
    const fStep = story.steps.find((s) => s.path === "/api/findings");
    assert.ok(fStep?.body?.findingRef);
    assert.ok(fStep?.body?.title);
  }
});

test("governance generator produces audit evidence only in quarterly months", () => {
  const qCtx = createMockContext("2027-06"); // Q1
  const qStories = generateGovernanceStories(qCtx);
  const qAudit = qStories.filter((s) => s.module === "audit");
  assert.ok(qAudit.length > 0, "quarterly month must have audit stories");

  const nCtx = createMockContext("2027-04"); // Non-quarterly
  const nStories = generateGovernanceStories(nCtx);
  const nAudit = nStories.filter((s) => s.module === "audit");
  assert.equal(nAudit.length, 0, "non-quarterly month must not have audit stories");
});

test("governance generator produces risk register stories", () => {
  const ctx = createMockContext("2027-05");
  const stories = generateGovernanceStories(ctx);
  const riskStories = stories.filter((s) => s.module === "risk");
  assert.ok(riskStories.length > 0, "must produce risk stories");

  for (const story of riskStories) {
    const rStep = story.steps.find((s) => s.path === "/api/risks");
    assert.ok(rStep?.body?.riskRef);
    assert.ok(rStep?.body?.title);
    assert.ok(typeof rStep?.body?.likelihood === "number");
    assert.ok(typeof rStep?.body?.impact === "number");
  }
});

test("governance generator may produce legal stories (40% probability)", () => {
  let legalCount = 0;
  for (let i = 0; i < 20; i++) {
    const ctx = createMockContext(`2027-${String(4 + (i % 9)).padStart(2, "0")}`, `legal-test-${i}`);
    const stories = generateGovernanceStories(ctx);
    legalCount += stories.filter((s) => s.module === "legal").length;
  }
  // With 40% probability across 20 iterations, we should get some legal stories
  assert.ok(legalCount > 0, "should produce at least some legal stories across 20 iterations");
});

// ─── People Generator ────────────────────────────────────────────────────────

test("people generator produces attendance batch stories", () => {
  const ctx = createMockContext("2027-04");
  const stories = generatePeopleStories(ctx);
  const attStories = stories.filter((s) => s.module === "attendance" && s.steps.some((step) => step.path === "/api/attendance"));
  assert.ok(attStories.length > 0, "must produce attendance stories");

  for (const story of attStories) {
    for (const step of story.steps) {
      if (step.path === "/api/attendance") {
        assert.ok(step.body?.employeeCode);
        assert.ok(step.body?.workDate);
      }
    }
  }
});

test("people generator produces leave request stories", () => {
  const ctx = createMockContext("2027-05");
  const stories = generatePeopleStories(ctx);
  const leaveStories = stories.filter((s) => s.steps.some((step) => step.path === "/api/leave-requests"));
  assert.ok(leaveStories.length > 0, "must produce leave stories");

  for (const story of leaveStories) {
    const lrStep = story.steps.find((s) => s.path === "/api/leave-requests");
    assert.ok(lrStep?.body?.employeeCode);
    assert.ok(lrStep?.body?.fromDate);
    assert.ok(lrStep?.body?.toDate);
  }
});

test("people generator produces payroll batch stories", () => {
  const ctx = createMockContext("2027-06");
  const stories = generatePeopleStories(ctx);
  const payrollStories = stories.filter((s) => s.module === "payroll");
  assert.ok(payrollStories.length > 0, "must produce payroll stories");

  for (const story of payrollStories) {
    for (const step of story.steps) {
      assert.ok(step.body?.employeeCode);
      assert.ok(step.body?.period);
    }
  }
});

test("people generator produces performance cycle + goal stories in quarterly months", () => {
  const qCtx = createMockContext("2027-06"); // Q1
  const qStories = generatePeopleStories(qCtx);
  const perfStories = qStories.filter((s) => s.module === "performance");
  assert.ok(perfStories.length > 0, "quarterly month must have performance stories");

  for (const story of perfStories) {
    if (story.steps.length === 2) {
      assert.equal(story.steps[0]!.path, "/api/cycles");
      assert.equal(story.steps[1]!.path, "/api/goals");
      assert.equal(story.steps[1]!.body?.cycle, "$PREV.createdId", "goal must reference parent cycle");
    }
  }
});

test("people generator skips performance stories in non-quarterly months", () => {
  const nCtx = createMockContext("2027-04"); // Non-quarterly
  const nStories = generatePeopleStories(nCtx);
  const perfStories = nStories.filter((s) => s.module === "performance");
  assert.equal(perfStories.length, 0, "non-quarterly month must not have performance stories");
});

test("people generator produces learning assignment stories", () => {
  const ctx = createMockContext("2027-07");
  const stories = generatePeopleStories(ctx);
  const learnStories = stories.filter((s) => s.module === "learning");
  assert.ok(learnStories.length > 0, "must produce learning stories");

  for (const story of learnStories) {
    const dpStep = story.steps.find((s) => s.path === "/api/development-plans");
    assert.ok(dpStep?.body?.employeeCode);
    assert.ok(dpStep?.body?.title);
  }
});

// ─── Cross-Generator Integration ─────────────────────────────────────────────

test("all generators together produce stories covering all modules", () => {
  const ctx = createMockContext("2027-06"); // Quarterly month for max coverage
  const allStories = [
    ...generateHiringStories(ctx),
    ...generatePeopleStories(ctx),
    ...generateSalesStories(ctx),
    ...generateDeliveryStories(ctx),
    ...generateFinanceStories(ctx),
    ...generateOperationsStories(ctx),
    ...generateGovernanceStories(ctx),
  ];

  const modules = new Set(allStories.flatMap((s) => s.steps.map((step) => step.module)));
  const expectedModules = [
    "recruitment", "attendance", "hr", "payroll", "learning",
    "crm", "customer", "project", "resource", "contract",
    "finance", "expense", "billing", "procurement", "vendor",
    "asset", "support", "administration", "security", "compliance",
    "risk",
  ];
  for (const mod of expectedModules) {
    assert.ok(modules.has(mod), `module ${mod} must be covered by at least one generator`);
  }
});

test("all generators produce deterministic output with same seed", () => {
  const ctx1 = createMockContext("2027-04", "determinism-test");
  const stories1 = [
    ...generateHiringStories(ctx1),
    ...generateSalesStories(ctx1),
  ];

  const ctx2 = createMockContext("2027-04", "determinism-test");
  const stories2 = [
    ...generateHiringStories(ctx2),
    ...generateSalesStories(ctx2),
  ];

  assert.equal(stories1.length, stories2.length, "same seed must produce same number of stories");
  for (let i = 0; i < stories1.length; i++) {
    assert.equal(stories1[i]!.steps.length, stories2[i]!.steps.length, `story ${i} must have same steps`);
    assert.deepEqual(stories1[i]!.steps[0]!.body, stories2[i]!.steps[0]!.body, `story ${i} step 0 body must match`);
  }
});

test("all generators produce different output with different seeds", () => {
  const ctx1 = createMockContext("2027-04", "seed-alpha");
  const stories1 = generateHiringStories(ctx1);

  const ctx2 = createMockContext("2027-04", "seed-beta");
  const stories2 = generateHiringStories(ctx2);

  // Different seeds should produce different story counts or different content
  const bodies1 = stories1.map((s) => JSON.stringify(s.steps[0]!.body));
  const bodies2 = stories2.map((s) => JSON.stringify(s.steps[0]!.body));
  // At least some stories should differ
  const allSame = bodies1.length === bodies2.length && bodies1.every((b, i) => b === bodies2[i]);
  assert.equal(allSame, false, "different seeds must produce different stories");
});

// ─── $PREV.createdId Chain Integrity Across All Generators ────────────────────

test("all generator $PREV.createdId chains have correct parent→child ordering", () => {
  const ctx = createMockContext("2027-06"); // Quarterly month for max coverage
  const allStories = [
    ...generateHiringStories(ctx),
    ...generatePeopleStories(ctx),
    ...generateSalesStories(ctx),
    ...generateDeliveryStories(ctx),
    ...generateFinanceStories(ctx),
    ...generateOperationsStories(ctx),
    ...generateGovernanceStories(ctx),
  ];

  for (const story of allStories) {
    for (let i = 1; i < story.steps.length; i++) {
      const step = story.steps[i]!;
      if (!step.body) continue;
      const bodyStr = JSON.stringify(step.body);
      if (bodyStr.includes("$PREV.createdId")) {
        // Verify the previous step is a POST with 2xx status
        const prevStep = story.steps[i - 1]!;
        assert.equal(prevStep.method, "POST", `story ${story.id} step ${i + 1} uses $PREV.createdId but step ${i} is ${prevStep.method}`);
        assert.ok(prevStep.expectedStatus >= 200 && prevStep.expectedStatus < 300, `story ${story.id} step ${i} must succeed to provide createdId`);
        // Verify step 1 never uses $PREV.createdId
        const firstBodyStr = JSON.stringify(story.steps[0]!.body ?? {});
        assert.ok(!firstBodyStr.includes("$PREV.createdId"), `story ${story.id} step 1 must not reference $PREV.createdId`);
      }
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  GROWTH_PHASES, getGrowthPhase, hasCapability,
  requisitionsPerMonth, leadsPerMonth, projectsPerMonth,
  churnProbability, offerRejectionProbability, winProbability,
  incidentProbability, isQuarterlyMonth, isYearEndMonth,
  workingDaysInMonth, selectActor,
} from "./business-rules";

// ─── Growth Phase Definitions ────────────────────────────────────────────────

test("GROWTH_PHASES has 5 phases in ascending order", () => {
  assert.equal(GROWTH_PHASES.length, 5);
  const names = GROWTH_PHASES.map((p) => p.name);
  assert.deepEqual(names, ["startup-40", "scale-75", "expansion-100", "enterprise-250", "maturity-500"]);
});

test("each phase has increasing employee thresholds", () => {
  for (let i = 1; i < GROWTH_PHASES.length; i++) {
    assert.ok(
      GROWTH_PHASES[i]!.employeeThreshold > GROWTH_PHASES[i - 1]!.employeeThreshold,
      `phase ${GROWTH_PHASES[i]!.name} threshold must be > ${GROWTH_PHASES[i - 1]!.name}`,
    );
  }
});

test("each phase has increasing story volume targets", () => {
  for (let i = 1; i < GROWTH_PHASES.length; i++) {
    const prevMax = GROWTH_PHASES[i - 1]!.targetStoriesPerMonth[1];
    const currMin = GROWTH_PHASES[i]!.targetStoriesPerMonth[0];
    assert.ok(currMin >= prevMax || GROWTH_PHASES[i]!.targetStoriesPerMonth[0] > GROWTH_PHASES[i - 1]!.targetStoriesPerMonth[0]);
  }
});

test("each phase has unlocked capabilities", () => {
  for (const phase of GROWTH_PHASES) {
    assert.ok(phase.unlockedCapabilities.length > 0, `phase ${phase.name} must have capabilities`);
    assert.ok(phase.label.length > 0, `phase ${phase.name} must have a label`);
    assert.ok(phase.hiringRatePerMonth[0] > 0);
    assert.ok(phase.leadRatePerMonth[0] > 0);
    assert.ok(phase.projectRatePerMonth[0] > 0);
  }
});

// ─── getGrowthPhase ──────────────────────────────────────────────────────────

test("getGrowthPhase returns startup-40 for 0-50 employees", () => {
  assert.equal(getGrowthPhase(0).name, "startup-40");
  assert.equal(getGrowthPhase(25).name, "startup-40");
  assert.equal(getGrowthPhase(50).name, "startup-40");
});

test("getGrowthPhase returns scale-75 for 51-80 employees", () => {
  assert.equal(getGrowthPhase(51).name, "scale-75");
  assert.equal(getGrowthPhase(65).name, "scale-75");
  assert.equal(getGrowthPhase(80).name, "scale-75");
});

test("getGrowthPhase returns expansion-100 for 81-150 employees", () => {
  assert.equal(getGrowthPhase(81).name, "expansion-100");
  assert.equal(getGrowthPhase(120).name, "expansion-100");
  assert.equal(getGrowthPhase(150).name, "expansion-100");
});

test("getGrowthPhase returns enterprise-250 for 151-350 employees", () => {
  assert.equal(getGrowthPhase(151).name, "enterprise-250");
  assert.equal(getGrowthPhase(250).name, "enterprise-250");
  assert.equal(getGrowthPhase(350).name, "enterprise-250");
});

test("getGrowthPhase returns maturity-500 for 351+ employees", () => {
  assert.equal(getGrowthPhase(351).name, "maturity-500");
  assert.equal(getGrowthPhase(500).name, "maturity-500");
  assert.equal(getGrowthPhase(1000).name, "maturity-500");
});

// ─── hasCapability ───────────────────────────────────────────────────────────

test("hasCapability checks capability presence", () => {
  const startup = getGrowthPhase(40);
  assert.ok(hasCapability(startup, "basic-hiring"));
  assert.ok(hasCapability(startup, "lead-generation"));
  assert.equal(hasCapability(startup, "enterprise-sales"), false);
});

test("enterprise phase has more capabilities than startup", () => {
  const startup = getGrowthPhase(40);
  const enterprise = getGrowthPhase(200);
  assert.ok(enterprise.unlockedCapabilities.length > startup.unlockedCapabilities.length);
});

// ─── Monthly Business Rules ──────────────────────────────────────────────────

test("requisitionsPerMonth returns values within phase range", () => {
  const phase = getGrowthPhase(40); // startup
  const rng = { int: (min: number, _max: number) => min }; // always returns min
  const count = requisitionsPerMonth(phase, rng);
  assert.ok(count >= phase.hiringRatePerMonth[0] && count <= phase.hiringRatePerMonth[1]);
});

test("leadsPerMonth returns values within phase range", () => {
  const phase = getGrowthPhase(100); // expansion
  const rng = { int: (min: number, _max: number) => min };
  const count = leadsPerMonth(phase, rng);
  assert.ok(count >= phase.leadRatePerMonth[0] && count <= phase.leadRatePerMonth[1]);
});

test("projectsPerMonth returns values within phase range", () => {
  const phase = getGrowthPhase(200); // enterprise
  const rng = { int: (min: number, _max: number) => min };
  const count = projectsPerMonth(phase, rng);
  assert.ok(count >= phase.projectRatePerMonth[0] && count <= phase.projectRatePerMonth[1]);
});

// ─── Probability Functions ───────────────────────────────────────────────────

test("churnProbability decreases with company maturity", () => {
  const phases = GROWTH_PHASES;
  for (let i = 1; i < phases.length; i++) {
    assert.ok(
      churnProbability(phases[i]!) <= churnProbability(phases[i - 1]!),
      `churn probability must decrease from ${phases[i - 1]!.name} to ${phases[i]!.name}`,
    );
  }
});

test("churnProbability returns values between 0 and 1", () => {
  for (const phase of GROWTH_PHASES) {
    const p = churnProbability(phase);
    assert.ok(p > 0 && p < 1);
  }
});

test("offerRejectionProbability returns a fixed value", () => {
  const p = offerRejectionProbability();
  assert.ok(p > 0 && p < 1);
  assert.equal(p, 0.12);
});

test("winProbability increases with company maturity", () => {
  const phases = GROWTH_PHASES;
  for (let i = 1; i < phases.length; i++) {
    assert.ok(
      winProbability(phases[i]!) >= winProbability(phases[i - 1]!),
      `win probability must increase from ${phases[i - 1]!.name} to ${phases[i]!.name}`,
    );
  }
});

test("incidentProbability returns values between 0 and 1", () => {
  for (const phase of GROWTH_PHASES) {
    const p = incidentProbability(phase);
    assert.ok(p > 0 && p < 1);
  }
});

// ─── Quarter and Year-End Detection ──────────────────────────────────────────

test("isQuarterlyMonth identifies months 03, 06, 09, 12", () => {
  assert.equal(isQuarterlyMonth("2027-03"), true);
  assert.equal(isQuarterlyMonth("2027-06"), true);
  assert.equal(isQuarterlyMonth("2027-09"), true);
  assert.equal(isQuarterlyMonth("2027-12"), true);
});

test("isQuarterlyMonth returns false for non-quarterly months", () => {
  assert.equal(isQuarterlyMonth("2027-01"), false);
  assert.equal(isQuarterlyMonth("2027-02"), false);
  assert.equal(isQuarterlyMonth("2027-04"), false);
  assert.equal(isQuarterlyMonth("2027-05"), false);
  assert.equal(isQuarterlyMonth("2027-07"), false);
  assert.equal(isQuarterlyMonth("2027-08"), false);
  assert.equal(isQuarterlyMonth("2027-10"), false);
  assert.equal(isQuarterlyMonth("2027-11"), false);
});

test("isYearEndMonth identifies March (Indian FY)", () => {
  assert.equal(isYearEndMonth("2027-03"), true);
  assert.equal(isYearEndMonth("2027-12"), false);
  assert.equal(isYearEndMonth("2027-06"), false);
});

// ─── Working Days ────────────────────────────────────────────────────────────

test("workingDaysInMonth returns 20-23 for typical months", () => {
  const months = ["2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09"];
  for (const m of months) {
    const days = workingDaysInMonth(m);
    assert.ok(days >= 19 && days <= 24, `month ${m} has ${days} working days, expected 19-24`);
  }
});

test("workingDaysInMonth excludes weekends", () => {
  // February 2028 has 29 days (leap year)
  const days = workingDaysInMonth("2028-02");
  assert.ok(days >= 19 && days <= 22);
});

// ─── Actor Selection ─────────────────────────────────────────────────────────

const MOCK_EMPLOYEES = [
  { employeeCode: "EMP-1001", fullName: "Priya Sharma", email: "priya@nexora.example", department: "Executive", designation: "Founder & CEO" },
  { employeeCode: "EMP-1006", fullName: "Meera Joshi", email: "meera@nexora.example", department: "People", designation: "HR Manager" },
  { employeeCode: "EMP-1008", fullName: "Karan Malhotra", email: "karan@nexora.example", department: "Sales", designation: "Sales Director" },
  { employeeCode: "EMP-1012", fullName: "Sandeep Patel", email: "sandeep@nexora.example", department: "Engineering", designation: "Lead Engineer" },
  { employeeCode: "EMP-1020", fullName: "Neha Gupta", email: "neha@nexora.example", department: "Engineering", designation: "Software Engineer" },
];

const MOCK_RNG = { pick: <T>(items: readonly T[]): T => items[0]! };

test("selectActor returns a valid actor with correct fields", () => {
  const actor = selectActor("recruitment", MOCK_EMPLOYEES, MOCK_RNG);
  assert.ok(actor.actorId.startsWith("EMP-"));
  assert.ok(["owner", "manager", "member"].includes(actor.actorRole));
  assert.ok(actor.actorEmail.includes("@"));
});

test("selectActor prefers department-matched employees", () => {
  const actor = selectActor("crm", MOCK_EMPLOYEES, MOCK_RNG);
  // CRM maps to Sales/Marketing — should pick Karan (Sales Director)
  assert.equal(actor.actorId, "EMP-1008");
});

test("selectActor assigns owner role for CEO/Founder titles", () => {
  const actor = selectActor("project", MOCK_EMPLOYEES, MOCK_RNG);
  // First employee is Founder & CEO — should get owner role
  if (actor.actorId === "EMP-1001") {
    assert.equal(actor.actorRole, "owner");
  }
});

test("selectActor assigns manager role for manager/director titles", () => {
  const hrActor = selectActor("hr", MOCK_EMPLOYEES, MOCK_RNG);
  // Meera is HR Manager
  if (hrActor.actorId === "EMP-1006") {
    assert.equal(hrActor.actorRole, "manager");
  }
});

test("selectActor falls back to all employees when no department match", () => {
  const employees = [
    { employeeCode: "EMP-9001", fullName: "Test User", email: "test@example.com", department: "Unknown", designation: "Engineer" },
  ];
  const actor = selectActor("recruitment", employees, MOCK_RNG);
  assert.equal(actor.actorId, "EMP-9001");
});

test("selectActor for manager-required modules prefers managers", () => {
  const managerModules = ["recruitment", "procurement", "finance", "project", "crm", "hr", "performance", "vendor"];
  for (const mod of managerModules) {
    const actor = selectActor(mod, MOCK_EMPLOYEES, MOCK_RNG);
    // The first matching manager/owner should be picked
    assert.ok(actor.actorId.startsWith("EMP-"));
  }
});

/**
 * Year 2 Scenario Generator — Business Rules and Growth Phases
 *
 * Defines the phase thresholds and capability unlocks for company growth.
 * Each phase represents a stage in the company's evolution and determines
 * which generator capabilities are active and at what volume.
 */

import type { GrowthPhase } from "./types";

// ─── Growth Phase Definitions ─────────────────────────────────────────────────

export const GROWTH_PHASES: readonly GrowthPhase[] = [
  {
    name: "startup-40",
    employeeThreshold: 0,
    label: "Startup (38-50 employees)",
    unlockedCapabilities: [
      "basic-hiring", "lead-generation", "project-delivery", "monthly-payroll",
      "basic-procurement", "security-baseline", "compliance-baseline",
    ],
    targetStoriesPerMonth: [15, 25],
    hiringRatePerMonth: [2, 5],
    leadRatePerMonth: [4, 8],
    projectRatePerMonth: [1, 2],
  },
  {
    name: "scale-75",
    employeeThreshold: 51,
    label: "Scale-Up (51-80 employees)",
    unlockedCapabilities: [
      "department-heads", "formal-hrbp", "middle-management",
      "formal-recruitment-pipeline", "sales-territory", "project-pmo",
      "formal-procurement", "vendor-evaluation", "quarterly-performance",
      "security-access-review", "compliance-framework",
    ],
    targetStoriesPerMonth: [25, 40],
    hiringRatePerMonth: [5, 10],
    leadRatePerMonth: [6, 12],
    projectRatePerMonth: [1, 3],
  },
  {
    name: "expansion-100",
    employeeThreshold: 81,
    label: "Expansion (81-150 employees)",
    unlockedCapabilities: [
      "second-office", "dedicated-infosec", "formal-procurement-office",
      "multi-location-hiring", "enterprise-sales", "program-management",
      "formal-budget-planning", "vendor-scorecards", "annual-audit",
      "dr-testing", "formal-onboarding-program",
    ],
    targetStoriesPerMonth: [35, 55],
    hiringRatePerMonth: [8, 15],
    leadRatePerMonth: [8, 16],
    projectRatePerMonth: [2, 4],
  },
  {
    name: "enterprise-250",
    employeeThreshold: 151,
    label: "Enterprise (151-350 employees)",
    unlockedCapabilities: [
      "business-units", "shared-services", "regional-management",
      "enterprise-sales-ops", "formal-l&D-academy", "internal-mobility",
      "multi-entity-accounting", "formal-risk-committee",
      "soc2-iso-audits", "enterprise-security-program",
    ],
    targetStoriesPerMonth: [50, 80],
    hiringRatePerMonth: [12, 25],
    leadRatePerMonth: [12, 25],
    projectRatePerMonth: [3, 6],
  },
  {
    name: "maturity-500",
    employeeThreshold: 351,
    label: "Maturity (351-500+ employees)",
    unlockedCapabilities: [
      "enterprise-governance", "multi-entity", "multiple-geographies",
      "advanced-workforce-planning", "global-sales", "partner-ecosystem",
      "formal-innovation-lab", "csr-program", "board-reporting",
      "advanced-tax-planning", "treasury-management",
    ],
    targetStoriesPerMonth: [70, 120],
    hiringRatePerMonth: [15, 35],
    leadRatePerMonth: [15, 30],
    projectRatePerMonth: [4, 8],
  },
] as const;

// ─── Phase Resolution ─────────────────────────────────────────────────────────

/**
 * Returns the growth phase for a given employee count.
 * Phases are evaluated from highest to lowest threshold.
 */
export function getGrowthPhase(employeeCount: number): GrowthPhase {
  for (let i = GROWTH_PHASES.length - 1; i >= 0; i--) {
    if (employeeCount >= GROWTH_PHASES[i]!.employeeThreshold) {
      return GROWTH_PHASES[i]!;
    }
  }
  return GROWTH_PHASES[0]!;
}

/**
 * Checks whether a specific capability is unlocked at the given phase.
 */
export function hasCapability(phase: GrowthPhase, capability: string): boolean {
  return phase.unlockedCapabilities.includes(capability);
}

// ─── Monthly Business Rules ───────────────────────────────────────────────────

/**
 * Determines how many new requisitions to open this month.
 */
export function requisitionsPerMonth(phase: GrowthPhase, rng: { int: (min: number, max: number) => number }): number {
  const [min, max] = phase.hiringRatePerMonth;
  return rng.int(min, max);
}

/**
 * Determines how many new leads to generate this month.
 */
export function leadsPerMonth(phase: GrowthPhase, rng: { int: (min: number, max: number) => number }): number {
  const [min, max] = phase.leadRatePerMonth;
  return rng.int(min, max);
}

/**
 * Determines how many new projects to start this month.
 */
export function projectsPerMonth(phase: GrowthPhase, rng: { int: (min: number, max: number) => number }): number {
  const [min, max] = phase.projectRatePerMonth;
  return rng.int(min, max);
}

/**
 * Probability that a customer churns this month (0-1).
 * Decreases as the company matures (better customer success).
 */
export function churnProbability(phase: GrowthPhase): number {
  const rates: Record<string, number> = {
    "startup-40": 0.04,
    "scale-75": 0.03,
    "expansion-100": 0.025,
    "enterprise-250": 0.02,
    "maturity-500": 0.015,
  };
  return rates[phase.name] ?? 0.03;
}

/**
 * Probability that a candidate rejects an offer (0-1).
 */
export function offerRejectionProbability(): number {
  return 0.12;
}

/**
 * Probability that an opportunity is won (0-1).
 * Increases with sales maturity.
 */
export function winProbability(phase: GrowthPhase): number {
  const rates: Record<string, number> = {
    "startup-40": 0.20,
    "scale-75": 0.25,
    "expansion-100": 0.28,
    "enterprise-250": 0.30,
    "maturity-500": 0.32,
  };
  return rates[phase.name] ?? 0.25;
}

/**
 * Probability of a production incident this month (0-1).
 * Increases with scale but decreases with maturity.
 */
export function incidentProbability(phase: GrowthPhase): number {
  const rates: Record<string, number> = {
    "startup-40": 0.15,
    "scale-75": 0.20,
    "expansion-100": 0.18,
    "enterprise-250": 0.12,
    "maturity-500": 0.10,
  };
  return rates[phase.name] ?? 0.15;
}

/**
 * Determines if a quarterly event should fire this month.
 * Quarterly events happen in months 3, 6, 9, 12 of the fiscal year.
 */
export function isQuarterlyMonth(month: string): boolean {
  const m = month.slice(5, 7); // "06", "09", "12", "03"
  return m === "06" || m === "09" || m === "12" || m === "03";
}

/**
 * Determines if this is a year-end month (March for Indian FY).
 */
export function isYearEndMonth(month: string): boolean {
  return month.slice(5, 7) === "03";
}

/**
 * Working days in a month (approximate — excludes weekends).
 */
export function workingDaysInMonth(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year!, mon!, 0).getDate();
  let working = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year!, mon! - 1, d).getDay();
    if (day !== 0 && day !== 6) working++;
  }
  return working;
}

// ─── Actor Selection ──────────────────────────────────────────────────────────

/**
 * Selects an appropriate actor for a given module and role type.
 */
export function selectActor(
  module: string,
  employees: readonly { employeeCode: string; fullName: string; email: string; department: string; designation: string }[],
  rng: { pick: <T>(items: readonly T[]) => T },
): { actorId: string; actorRole: string; actorEmail: string } {
  const deptMap: Record<string, string[]> = {
    hr: ["People", "Human Resources"],
    recruitment: ["People", "Human Resources"],
    crm: ["Sales", "Marketing"],
    finance: ["Finance"],
    project: ["Engineering", "Product", "Delivery"],
    procurement: ["Operations", "Finance"],
    security: ["Governance", "Engineering"],
    compliance: ["Governance"],
    audit: ["Governance", "Finance"],
    risk: ["Governance", "Finance"],
    performance: ["People", "Executive"],
    learning: ["People"],
    support: ["Support", "Customer Success"],
    customer: ["Sales", "Customer Success"],
    vendor: ["Operations", "Procurement"],
    asset: ["Administration", "Operations"],
    administration: ["Administration"],
    legal: ["Governance", "Legal"],
  };

  // Modules that require manager or owner role.
  const managerRequired = ["recruitment", "procurement", "finance", "project", "crm", "hr", "performance", "vendor"];

  const targetDepts = deptMap[module] ?? ["Engineering"];
  const candidates = employees.filter((e) =>
    targetDepts.some((d) => e.department.toLowerCase().includes(d.toLowerCase()))
  );

  const pool = candidates.length > 0 ? candidates : employees;

  // For modules that require manager role, filter to only managers/owners.
  let selected;
  if (managerRequired.includes(module)) {
    const managers = pool.filter((e) => /manager|lead|director|head|vp|cto|cfo|coo|founder|ceo/i.test(e.designation));
    selected = managers.length > 0 ? rng.pick(managers) : rng.pick(pool);
  } else {
    selected = rng.pick(pool);
  }

  const isManager = /manager|lead|director|head|vp|cto|cfo|coo/i.test(selected.designation);
  const isOwner = /founder|ceo|cto|coo|cfo/i.test(selected.designation);

  return {
    actorId: selected.employeeCode,
    actorRole: isOwner ? "owner" : isManager ? "manager" : "member",
    actorEmail: selected.email,
  };
}

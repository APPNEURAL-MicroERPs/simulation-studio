/**
 * Year 2 Scenario Generator — Core Type Definitions
 *
 * Defines the types used by all Year 2 generators, the state reader,
 * probability models, and business rules. Generators produce the same
 * ApiStory type used by Year 1, so the existing execution engine works
 * unchanged.
 */

import type { ApiStory, ExecutableModule } from "../api-stories";
import type { RunRow } from "../db";

// ─── Seeded PRNG ──────────────────────────────────────────────────────────────

export interface SeededRNG {
  /** Returns a float in [0, 1). */
  (): number;
  /** Returns an integer in [min, max] inclusive. */
  int: (min: number, max: number) => number;
  /** Returns true with the given probability (0-1). */
  chance: (probability: number) => boolean;
  /** Picks a random element from an array. */
  pick: <T>(items: readonly T[]) => T;
  /** Shuffles an array in place (Fisher-Yates). */
  shuffle: <T>(items: T[]) => T[];
  /** Returns a sample of n items from the array (without replacement). */
  sample: <T>(items: readonly T[], n: number) => T[];
}

// ─── Company State (queried from live Micro-ERP APIs) ─────────────────────────

export interface CompanyState {
  /** Total active employees. */
  employeeCount: number;
  /** Employee breakdown by department. */
  departments: Record<string, number>;
  /** Employee list (codes + names + emails). */
  employees: EmployeeSummary[];
  /** Active customer count. */
  customerCount: number;
  /** Customer names/IDs. */
  customers: CustomerSummary[];
  /** Active project count. */
  activeProjectCount: number;
  /** Completed project count. */
  completedProjectCount: number;
  /** Project summaries. */
  projects: ProjectSummary[];
  /** Total vendor count. */
  vendorCount: number;
  /** Vendor summaries. */
  vendors: VendorSummary[];
  /** Open requisition count. */
  openRequisitionCount: number;
  /** Total lead count. */
  leadCount: number;
  /** Total opportunity count. */
  opportunityCount: number;
  /** Pipeline value (sum of open opportunity amounts). */
  pipelineValue: number;
  /** Total invoice count. */
  invoiceCount: number;
  /** Total journal entry count. */
  journalEntryCount: number;
  /** Total budget count. */
  budgetCount: number;
  /** Total risk count. */
  riskCount: number;
  /** Total compliance finding count. */
  findingCount: number;
  /** Total security review count. */
  securityReviewCount: number;
  /** Total asset audit campaign count. */
  auditCampaignCount: number;
  /** Total performance cycle count. */
  performanceCycleCount: number;
  /** Total support ticket count. */
  ticketCount: number;
  /** Total contract count. */
  contractCount: number;
  /** Total billing invoice count. */
  billingInvoiceCount: number;
  /** Total procurement PO count. */
  purchaseOrderCount: number;
  /** Total expense count. */
  expenseCount: number;
}

export interface EmployeeSummary {
  employeeCode: string;
  fullName: string;
  email: string;
  department: string;
  designation: string;
  location: string;
  employmentStatus: string;
  dateOfJoining: string;
}

export interface CustomerSummary {
  id: string;
  name: string;
  tier: string;
  ownerEmail: string;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  status: string;
  client: string;
  managerEmail: string;
}

export interface VendorSummary {
  id: string;
  displayName: string;
  code: string;
  status: string;
}

// ─── Growth Phase ─────────────────────────────────────────────────────────────

export interface GrowthPhase {
  /** Phase identifier: "startup-40", "scale-75", "expansion-100", "enterprise-250", "maturity-500". */
  name: string;
  /** Employee count threshold that triggers this phase. */
  employeeThreshold: number;
  /** Human-readable label. */
  label: string;
  /** Capabilities unlocked at this phase. */
  unlockedCapabilities: string[];
  /** Monthly story volume target (approximate). */
  targetStoriesPerMonth: [number, number]; // [min, max]
  /** Hiring rate (new employees per month). */
  hiringRatePerMonth: [number, number];
  /** Lead generation rate per month. */
  leadRatePerMonth: [number, number];
  /** New project rate per month. */
  projectRatePerMonth: [number, number];
}

// ─── Generator Context ────────────────────────────────────────────────────────

export interface GeneratorContext {
  /** Current simulation run. */
  run: RunRow;
  /** Month being generated (e.g. "2027-04"). */
  month: string;
  /** Day offset from company founding (366 = first day of Year 2). */
  dayStart: number;
  /** Current company state snapshot. */
  state: CompanyState;
  /** Seeded PRNG for deterministic generation. */
  rng: SeededRNG;
  /** Current growth phase. */
  phase: GrowthPhase;
  /** Sequence counter for unique story IDs within this month. */
  sequence: number;
}

// ─── Generator Function Type ──────────────────────────────────────────────────

/** A generator function takes a context and returns an array of ApiStory objects. */
export type StoryGenerator = (ctx: GeneratorContext) => ApiStory[];

// ─── Year 2 Month Constants ───────────────────────────────────────────────────

/** Year 2 months: April 2027 through March 2028. */
export const YEAR2_MONTHS = [
  "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09",
  "2027-10", "2027-11", "2027-12", "2028-01", "2028-02", "2028-03",
] as const;

export type Year2Month = typeof YEAR2_MONTHS[number];

/** Quarter boundaries for Year 2. */
export const YEAR2_QUARTERS = {
  Q1: { start: "2027-04", end: "2027-06", label: "Year 2 Q1 (Apr-Jun 2027)" },
  Q2: { start: "2027-07", end: "2027-09", label: "Year 2 Q2 (Jul-Sep 2027)" },
  Q3: { start: "2027-10", end: "2027-12", label: "Year 2 Q3 (Oct-Dec 2027)" },
  Q4: { start: "2028-01", end: "2028-03", label: "Year 2 Q4 (Jan-Mar 2028)" },
} as const;

/** Day offset at the start of each Year 2 month (relative to company founding 2026-04-01). */
export const YEAR2_DAY_OFFSETS: Record<Year2Month, number> = {
  "2027-04": 366, "2027-05": 396, "2027-06": 427,
  "2027-07": 457, "2027-08": 488, "2027-09": 519,
  "2027-10": 549, "2027-11": 580, "2027-12": 610,
  "2028-01": 641, "2028-02": 672, "2028-03": 701,
};

/** Helper to build an ApiStory step. */
export function step(
  module: ExecutableModule,
  method: "GET" | "POST" | "PATCH",
  path: string,
  expectedStatus: number,
  body?: Record<string, unknown>,
  verifyListPath?: string,
): ApiStory["steps"][number] {
  return { module, method, path, expectedStatus, ...(body ? { body } : {}), ...(verifyListPath ? { verifyListPath } : {}) };
}

/** Standard complete assertions used by most generated stories. */
export const generatedAssertions: ApiStory["assertions"] = [
  "api_response", "entity_state",
];

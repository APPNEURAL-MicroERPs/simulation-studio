/**
 * Year 2 Scenario Generator — Seeded PRNG and Probability Models
 *
 * Provides a deterministic mulberry32 PRNG and probability distribution
 * functions used by all generators. Same seed + same state = same stories.
 */

import type { SeededRNG } from "./types";

// ─── Mulberry32 PRNG ──────────────────────────────────────────────────────────

/**
 * Creates a seeded PRNG using the mulberry32 algorithm.
 * Deterministic: same seed always produces the same sequence.
 */
export function createRNG(seed: string): SeededRNG {
  // Hash the seed string into a 32-bit integer.
  let state = 0;
  for (let i = 0; i < seed.length; i++) {
    state = (state * 31 + seed.charCodeAt(i)) | 0;
  }
  // Ensure non-zero state.
  if (state === 0) state = 0xDEADBEEF;

  const next = (): number => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng = next as SeededRNG;

  rng.int = (min: number, max: number): number => {
    return Math.floor(next() * (max - min + 1)) + min;
  };

  rng.chance = (probability: number): boolean => {
    return next() < probability;
  };

  rng.pick = <T>(items: readonly T[]): T => {
    return items[Math.floor(next() * items.length)]!;
  };

  rng.shuffle = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  };

  rng.sample = <T>(items: readonly T[], n: number): T[] => {
    const copy = [...items];
    rng.shuffle(copy);
    return copy.slice(0, Math.min(n, copy.length));
  };

  return rng;
}

// ─── Name Pools ───────────────────────────────────────────────────────────────

const FIRST_NAMES_MALE = [
  "Arjun", "Vikram", "Rohan", "Karan", "Rahul", "Amit", "Suresh", "Rajesh",
  "Pradeep", "Anil", "Sanjay", "Manish", "Deepak", "Nitin", "Arun", "Vivek",
  "Gaurav", "Pankaj", "Naveen", "Sachin", "Ravi", "Mohan", "Ashish", "Tarun",
  "Harsh", "Aditya", "Siddharth", "Varun", "Nikhil", "Akash", "Yash", "Dev",
];

const FIRST_NAMES_FEMALE = [
  "Priya", "Sneha", "Neha", "Pooja", "Kavya", "Anita", "Meera", "Riya",
  "Swati", "Divya", "Shweta", "Nisha", "Pallavi", "Aarti", "Kiran", "Sunita",
  "Tanvi", "Isha", "Nandini", "Shreya", "Aparna", "Vandana", "Radhika", "Tara",
  "Anjali", "Preeti", "Sakshi", "Ritu", "Jyoti", "Lakshmi", "Asha", "Uma",
];

const LAST_NAMES = [
  "Sharma", "Patel", "Singh", "Kumar", "Gupta", "Verma", "Joshi", "Mehta",
  "Reddy", "Nair", "Rao", "Das", "Mishra", "Chauhan", "Yadav", "Agarwal",
  "Iyer", "Pillai", "Sinha", "Dubey", "Pandey", "Tiwari", "Bhat", "Menon",
  "Saxena", "Malhotra", "Kapoor", "Bose", "Desai", "Shah", "Rastogi", "Jain",
];

const LOCATIONS = ["Udaipur", "Bengaluru", "Gurugram", "Mumbai", "Pune", "Hyderabad", "Chennai", "Noida"];

const DEPARTMENTS = [
  "Engineering", "QA", "Product", "Design", "Sales", "Marketing",
  "Finance", "People", "Operations", "Support", "DevOps", "Data",
];

const DESIGNATIONS_BY_LEVEL: Record<string, string[]> = {
  junior: ["Junior Engineer", "Associate Engineer", "Junior Analyst", "Junior Developer", "Trainee Engineer"],
  mid: ["Engineer", "Senior Engineer", "Analyst", "Senior Analyst", "Consultant", "Senior Consultant"],
  senior: ["Lead Engineer", "Principal Engineer", "Manager", "Senior Manager", "Staff Engineer", "Tech Lead"],
  executive: ["Director", "VP Engineering", "VP Sales", "Head of Product", "CFO", "CTO", "COO"],
};

const SKILLS_POOL = [
  "React", "TypeScript", "Next.js", "Node.js", "Python", "Java", "Go", "Rust",
  "AWS", "Azure", "GCP", "Kubernetes", "Docker", "Terraform", "PostgreSQL",
  "MongoDB", "Redis", "GraphQL", "REST", "CI/CD", "Jenkins", "GitHub Actions",
  "Selenium", "Cypress", "Playwright", "Jest", "Vitest",
  "Salesforce", "SAP", "Oracle", "Tableau", "Power BI", "Excel",
  "Figma", "Sketch", "Adobe XD", "Jira", "Confluence",
  "Financial Modeling", "Accounting", "Tax", "Audit", "Compliance",
  "Recruitment", "HR Operations", "Payroll", "Training",
  "Customer Success", "Account Management", "Technical Support",
];

const COMPANY_NAME_PARTS_1 = [
  "Nova", "Apex", "Zenith", "Pinnacle", "Summit", "Vertex", "Crest", "Orbit",
  "Stellar", "Quantum", "Nexus", "Vortex", "Catalyst", "Synergy", "Prism",
  "Aurora", "Helios", "Atlas", "Titan", "Phoenix", "Omega", "Delta",
];

const COMPANY_NAME_PARTS_2 = [
  "Technologies", "Solutions", "Systems", "Labs", "Digital", "Software",
  "Infotech", "Ventures", "Industries", "Corp", "Group", "Dynamics",
  "Analytics", "Networks", "Services", "Innovations", "Cloud", "Data",
];

const INDUSTRIES = [
  "Technology", "Banking", "Insurance", "Healthcare", "Education", "Retail",
  "Manufacturing", "Logistics", "Telecom", "Energy", "Automotive", "Pharma",
  "Real Estate", "Media", "Hospitality", "Agriculture", "Mining", "Aerospace",
];

const SOURCES = ["website", "referral", "campaign"];

// ─── Random Data Generators ───────────────────────────────────────────────────

export function randomFullName(rng: SeededRNG): string {
  const isMale = rng.chance(0.7);
  const first = isMale ? rng.pick(FIRST_NAMES_MALE) : rng.pick(FIRST_NAMES_FEMALE);
  const last = rng.pick(LAST_NAMES);
  return `${first} ${last}`;
}

export function randomEmail(name: string): string {
  return `${name.toLowerCase().replace(/\s+/gu, ".")}@example.com`;
}

export function randomPhone(rng: SeededRNG): string {
  const prefix = rng.pick(["+91-98", "+91-97", "+91-96", "+91-95", "+91-90"]);
  const suffix = String(rng.int(10000000, 99999999));
  return `${prefix}${suffix}`;
}

export function randomLocation(rng: SeededRNG): string {
  return rng.pick(LOCATIONS);
}

export function randomDepartment(rng: SeededRNG): string {
  return rng.pick(DEPARTMENTS);
}

export function randomDesignation(rng: SeededRNG, level: "junior" | "mid" | "senior" | "executive" = "mid"): string {
  return rng.pick(DESIGNATIONS_BY_LEVEL[level]!);
}

export function randomSkills(rng: SeededRNG, count: number): string {
  return rng.sample(SKILLS_POOL, count).join(", ");
}

export function randomCompanyName(rng: SeededRNG): string {
  return `${rng.pick(COMPANY_NAME_PARTS_1)} ${rng.pick(COMPANY_NAME_PARTS_2)}`;
}

export function randomIndustry(rng: SeededRNG): string {
  return rng.pick(INDUSTRIES);
}

export function randomSource(rng: SeededRNG): string {
  return rng.pick(SOURCES);
}

export function randomDealSize(rng: SeededRNG, phase: string): number {
  const ranges: Record<string, [number, number]> = {
    "startup-40": [500000, 5000000],
    "scale-75": [800000, 8000000],
    "expansion-100": [1000000, 12000000],
    "enterprise-250": [2000000, 25000000],
    "maturity-500": [3000000, 50000000],
  };
  const [min, max] = ranges[phase] ?? [500000, 5000000];
  return Math.round(rng.int(min, max) / 10000) * 10000;
}

export function randomSalary(rng: SeededRNG, level: "junior" | "mid" | "senior" | "executive"): number {
  const ranges: Record<string, [number, number]> = {
    junior: [400000, 800000],
    mid: [800000, 1800000],
    senior: [1800000, 3500000],
    executive: [3000000, 6000000],
  };
  const [min, max] = ranges[level]!;
  return Math.round(rng.int(min, max) / 50000) * 50000;
}

export function randomNoticePeriod(rng: SeededRNG): number {
  return rng.pick([0, 15, 30, 30, 30, 60, 60, 90]);
}

export function randomDateInMonth(rng: SeededRNG, month: string, dayMin = 1, dayMax = 28): string {
  const day = rng.int(dayMin, dayMax);
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function randomDateTimeInMonth(rng: SeededRNG, month: string, dayMin = 1, dayMax = 28): string {
  const day = rng.int(dayMin, dayMax);
  const hour = rng.int(9, 17);
  const minute = rng.pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  return `${month}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`;
}

export function randomFutureDate(rng: SeededRNG, fromDate: string, monthsAheadMin: number, monthsAheadMax: number): string {
  const base = new Date(fromDate);
  const monthsAhead = rng.int(monthsAheadMin, monthsAheadMax);
  base.setMonth(base.getMonth() + monthsAhead);
  return base.toISOString().slice(0, 10);
}

// ─── Reference Code Generators ────────────────────────────────────────────────

let requisitionCounter = 100;
let candidateCounter = 200;
let leadCounter = 100;
let opportunityCounter = 100;
let projectCounter = 10;
let expenseCounter = 500;
let journalCounter = 200;
let ticketCounter = 300;
let poCounter = 100;
let assetCounter = 200;
let invoiceCounter = 30;
let allocationCounter = 10;

export function nextRequisitionCode(): string { return `Y2-REQ-${++requisitionCounter}`; }
export function nextCandidateCode(): string { return `Y2-CAND-${++candidateCounter}`; }
export function nextLeadCode(): string { return `Y2-LD-${++leadCounter}`; }
export function nextOpportunityCode(): string { return `Y2-OPP-${++opportunityCounter}`; }
export function nextProjectCode(): string { return `Y2-PRJ-${++projectCounter}`; }
export function nextExpenseCode(): string { return `Y2-EXP-${++expenseCounter}`; }
export function nextJournalCode(): string { return `Y2-JE-${++journalCounter}`; }
export function nextTicketCode(): string { return `Y2-TKT-${++ticketCounter}`; }
export function nextPOCode(): string { return `Y2-PO-${++poCounter}`; }
export function nextAssetCode(): string { return `Y2-AST-${++assetCounter}`; }
export function nextInvoiceCode(): string { return `INV-Y2-${String(++invoiceCounter).padStart(3, "0")}`; }
export function nextAllocationCode(): string { return `Y2-ALLOC-${String(++allocationCounter).padStart(3, "0")}`; }

/** Reset all counters (useful for testing). */
export function resetCounters(): void {
  requisitionCounter = 100;
  candidateCounter = 200;
  leadCounter = 100;
  opportunityCounter = 100;
  projectCounter = 10;
  expenseCounter = 500;
  journalCounter = 200;
  ticketCounter = 300;
  poCounter = 100;
  assetCounter = 200;
  invoiceCounter = 30;
  allocationCounter = 10;
}

/**
 * Initialize counters with month-specific offsets to avoid code collisions
 * across months. Each month gets a unique range so retries and re-executions
 * produce the same codes within a month but different codes across months.
 */
export function initializeCountersForMonth(month: string): void {
  const monthNum = (parseInt(month.slice(0, 4)) - 2027) * 12 + parseInt(month.slice(5, 7)) - 4;
  const offset = monthNum * 200;
  requisitionCounter = 100 + offset;
  candidateCounter = 200 + offset * 3;
  leadCounter = 100 + offset * 2;
  opportunityCounter = 100 + offset * 2;
  projectCounter = 10 + offset;
  expenseCounter = 500 + offset * 5;
  journalCounter = 200 + offset * 5;
  ticketCounter = 300 + offset * 2;
  poCounter = 100 + offset;
  assetCounter = 200 + offset;
  invoiceCounter = 30 + offset * 3;
  allocationCounter = 10 + offset * 2;
}

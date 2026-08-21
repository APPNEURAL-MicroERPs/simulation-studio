/**
 * Year 2 Scenario Generator — Composer
 *
 * Orchestrates all domain generators for a given month. Reads company
 * state, computes the growth phase, initializes a seeded RNG, calls
 * each generator, assigns unique IDs, sorts by companyTime, and
 * returns the combined ApiStory array.
 */

import type { ApiStory } from "../api-stories";
import type { GeneratorContext, CompanyState } from "./types";
import type { RunRow } from "../db";
import { createRNG, resetCounters, initializeCountersForMonth } from "./probability";
import { getGrowthPhase } from "./business-rules";
import { readCompanyState } from "./state-reader";

import { generateHiringStories } from "./generators/hiring";
import { generatePeopleStories } from "./generators/people";
import { generateSalesStories } from "./generators/sales";
import { generateDeliveryStories } from "./generators/delivery";
import { generateFinanceStories } from "./generators/finance";
import { generateOperationsStories } from "./generators/operations";
import { generateGovernanceStories } from "./generators/governance";

// ─── All Generators ───────────────────────────────────────────────────────────

const ALL_GENERATORS = [
  { name: "hiring", fn: generateHiringStories },
  { name: "people", fn: generatePeopleStories },
  { name: "sales", fn: generateSalesStories },
  { name: "delivery", fn: generateDeliveryStories },
  { name: "finance", fn: generateFinanceStories },
  { name: "operations", fn: generateOperationsStories },
  { name: "governance", fn: generateGovernanceStories },
] as const;

// ─── Compose Month ────────────────────────────────────────────────────────────

/**
 * Generates all API stories for a single month.
 *
 * @param env - Cloudflare Worker environment with service bindings.
 * @param run - Current simulation run.
 * @param month - Month to generate (e.g. "2027-04").
 * @param seed - Seed for deterministic generation.
 * @param cachedState - Optional pre-fetched company state (avoids re-querying).
 */
export async function composeMonthStories(
  env: Env,
  run: RunRow,
  month: string,
  seed: string,
  cachedState?: CompanyState,
): Promise<{ stories: ApiStory[]; state: CompanyState }> {
  // Read company state (or use cached). Pass runId to filter employees to
  // only those that exist in the simulation_employees table.
  const state = cachedState ?? await readCompanyState(env, run.id);

  // Compute growth phase from current employee count.
  const phase = getGrowthPhase(state.employeeCount);

  // Create seeded RNG for this month (deterministic).
  const monthSeed = `${seed}:${month}`;
  const rng = createRNG(monthSeed);

  // Initialize reference code counters with month-specific offsets to avoid
  // code collisions across months (each month gets a unique range).
  initializeCountersForMonth(month);

  // Build the generator context.
  const ctx: GeneratorContext = {
    run,
    month,
    dayStart: 366, // Year 2 starts at day 366
    state,
    rng,
    phase,
    sequence: 0,
  };

  // Run all generators.
  const allStories: ApiStory[] = [];
  for (const gen of ALL_GENERATORS) {
    const stories = gen.fn(ctx);
    allStories.push(...stories);
  }

  // Sort stories by companyTime for chronological execution.
  allStories.sort((a, b) => a.companyTime.localeCompare(b.companyTime));

  // Re-assign IDs after sorting to ensure sequential ordering.
  for (let i = 0; i < allStories.length; i++) {
    const story = allStories[i]!;
    story.id = `Y2-${month}-${String(i + 1).padStart(3, "0")}`;
  }

  return { stories: allStories, state };
}

// ─── Compose Quarter ──────────────────────────────────────────────────────────

/**
 * Generates all API stories for a quarter (3 months).
 * State is re-read at the start of each month to reflect changes.
 */
export async function composeQuarterStories(
  env: Env,
  run: RunRow,
  months: readonly string[],
  seed: string,
): Promise<{ stories: ApiStory[]; finalState: CompanyState }> {
  const allStories: ApiStory[] = [];
  let currentState: CompanyState | undefined;

  for (const month of months) {
    const result = await composeMonthStories(env, run, month, seed, currentState);
    allStories.push(...result.stories);
    currentState = result.state;
  }

  return { stories: allStories, finalState: currentState! };
}

// ─── Compose Full Year ────────────────────────────────────────────────────────

/**
 * Generates all API stories for the full Year 2 (12 months).
 */
export async function composeYear2Stories(
  env: Env,
  run: RunRow,
  seed: string,
): Promise<{ stories: ApiStory[]; finalState: CompanyState }> {
  const { YEAR2_MONTHS } = await import("./types");
  return composeQuarterStories(env, run, YEAR2_MONTHS, seed);
}

// ─── Generator Summary ────────────────────────────────────────────────────────

/**
 * Returns a summary of what each generator would produce for a month
 * without actually generating full stories (for preview/debugging).
 */
export async function generatorSummary(
  env: Env,
  month: string,
  seed: string,
): Promise<Record<string, number>> {
  const state = await readCompanyState(env);
  const phase = getGrowthPhase(state.employeeCount);
  const rng = createRNG(`${seed}:${month}`);
  initializeCountersForMonth(month);

  const run = { id: "preview" } as RunRow;
  const ctx: GeneratorContext = {
    run, month, dayStart: 366, state, rng, phase, sequence: 0,
  };

  const summary: Record<string, number> = {};
  for (const gen of ALL_GENERATORS) {
    const stories = gen.fn(ctx);
    summary[gen.name] = stories.length;
  }

  summary._total = Object.values(summary).reduce((a, b) => a + b, 0);
  summary._employees = state.employeeCount;
  summary._phase = phase.name as unknown as number;

  return summary;
}

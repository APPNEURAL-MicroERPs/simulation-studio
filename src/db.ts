const BATCH_SIZE = 50;

export async function executeBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await db.batch(statements.slice(index, index + BATCH_SIZE));
  }
}

export interface RunRow {
  id: string;
  tenant_id: string;
  seed: string;
  mode: "live" | "accelerated" | "fast" | "replay" | "scenario";
  clock_profile: "standard" | "fast";
  status: "running" | "paused" | "completed";
  company_time: string;
  speed: 1 | 10 | 60;
  tick: number;
  planned_through_date: string | null;
  last_tick_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function activeRun(db: D1Database, tenantId: string): Promise<RunRow | null> {
  const row = await db.prepare(`SELECT * FROM simulation_runs WHERE tenant_id = ? AND status != 'completed' ORDER BY created_at DESC LIMIT 1`)
    .bind(tenantId).first<RunRow>();
  return row?.clock_profile === "fast" ? { ...row, mode: "fast" } : row;
}

export async function latestRun(db: D1Database, tenantId: string): Promise<RunRow | null> {
  const row = await db.prepare(`SELECT * FROM simulation_runs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(tenantId).first<RunRow>();
  return row?.clock_profile === "fast" ? { ...row, mode: "fast" } : row;
}

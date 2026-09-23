import { pool } from "../src/db/pool.js";

/** Resets all tables between tests (dev/test database only). */
export async function resetTables(): Promise<void> {
  await pool.query(
    "TRUNCATE imaging_studies, appointments, doctors RESTART IDENTITY CASCADE",
  );
}

/** Inserts a doctor directly and returns its id. */
export async function createDoctor(name: string): Promise<number> {
  const r = await pool.query<{ id: number }>(
    "INSERT INTO doctors (name) VALUES ($1) RETURNING id",
    [name],
  );
  return r.rows[0].id;
}

/** Fixed test day so date-filter tests are deterministic. */
export const TEST_DAY = "2026-09-22";

/** Builds an ISO instant on the test day in canonical toISOString form. */
export const at = (hhmm: string) =>
  new Date(`${TEST_DAY}T${hhmm}:00Z`).toISOString();

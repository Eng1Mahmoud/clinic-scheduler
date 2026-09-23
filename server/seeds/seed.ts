import "dotenv/config";
import { pool } from "../src/db/pool.js";

/**
 * Idempotent seed: resets tables and inserts a ready-to-review day.
 * The appointment linked to the supplied DICOM file makes the main
 * workflow (list -> View scan) instantly reviewable.
 */
async function seed() {
  await pool.query(
    "TRUNCATE imaging_studies, appointments, doctors RESTART IDENTITY CASCADE",
  );

  const doctors = await pool.query<{ id: number }>(
    `
    INSERT INTO doctors (name) VALUES
      ('Dr. Ahmed'), ('Dr. Sara'), ('Dr. Mohamed')
    RETURNING id
    `,
  );
  const [ahmed, sara, mohamed] = doctors.rows.map((r) => r.id);

  // All seeded on today's date (UTC) so the default schedule view has data.
  const today = new Date().toISOString().slice(0, 10);
  const at = (hhmm: string) => new Date(`${today}T${hhmm}:00Z`);

  const appointments = await pool.query<{ id: number }>(
    `
    INSERT INTO appointments
      (patient_name, doctor_id, starts_at, ends_at, duration_minutes, status, reason)
    VALUES
      ('John Doe',    $1, $4,  $5,  60, 'completed',  'Routine check-up'),
      ('Jane Smith',  $2, $6,  $7,  30, 'scheduled',  'Chest X-ray review'),
      ('Omar Khaled', $1, $8,  $9,  30, 'checked_in', 'Follow-up'),
      ('Mona Adel',   $3, $10, $11, 60, 'cancelled',  'Consultation'),
      ('Sara Wael',   $2, $12, $13, 30, 'scheduled',  'First visit')
    RETURNING id
    `,
    [
      ahmed, sara, mohamed,
      at("09:00"), at("10:00"),               // John Doe, Dr. Ahmed
      at("10:00"), at("10:30"),               // Jane Smith, Dr. Sara
      at("11:00"), at("11:30"),               // Omar Khaled, Dr. Ahmed
      at("09:00"), at("10:00"),               // Mona Adel (cancelled), Dr. Mohamed
      at("12:00"), at("12:30"),               // Sara Wael, Dr. Sara
    ],
  );

  // Attach the supplied anonymized DICOM file to Jane Smith's appointment.
  await pool.query(
    `
    INSERT INTO imaging_studies (appointment_id, modality, description, dicom_file_path)
    VALUES ($1, 'XA', 'Angiography scan (supplied sample)', 'storage/dicom/0002.dcm')
    `,
    [appointments.rows[1].id],
  );

  console.log(`Seeded ${doctors.rowCount} doctors and ${appointments.rowCount} appointments for ${today}.`);
  console.log(`Imaging study attached to appointment #${appointments.rows[1].id}.`);
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

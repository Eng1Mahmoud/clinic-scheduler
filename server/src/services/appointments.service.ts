import { query } from "../db/pool.js";
import { ApiError } from "../errors.js";
import type {
  AppointmentStatus,
  CreateAppointmentInput,
  ListAppointmentsQuery,
} from "../validation.js";

export interface AppointmentRow {
  id: number;
  patient_name: string;
  doctor_id: number;
  doctor_name: string;
  starts_at: Date;
  ends_at: Date;
  duration_minutes: number;
  status: AppointmentStatus;
  reason: string | null;
  created_at: Date;
  updated_at: Date;
  imaging_study_id: number | null;
}

function toAppointmentDto(row: AppointmentRow) {
  return {
    id: row.id,
    patientName: row.patient_name,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    durationMinutes: row.duration_minutes,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    // Lets the UI show "View scan" only where a study exists.
    imagingStudyId: row.imaging_study_id,
  };
}

export async function listAppointments(q: ListAppointmentsQuery) {
  const result = await query<AppointmentRow>(
    `
    SELECT a.*, d.name AS doctor_name, i.id AS imaging_study_id
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    LEFT JOIN imaging_studies i ON i.appointment_id = a.id
    WHERE ($1::date IS NULL OR (a.starts_at AT TIME ZONE 'UTC')::date = $1::date)
      AND ($2::int  IS NULL OR a.doctor_id = $2)
      AND ($3::text IS NULL OR a.status = $3)
    ORDER BY a.starts_at
    `,
    [q.date ?? null, q.doctorId ?? null, q.status ?? null],
  );
  return result.rows.map(toAppointmentDto);
}

export async function createAppointment(body: CreateAppointmentInput) {
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(startsAt.getTime() + body.durationMinutes * 60_000);

  // Clear, explicit doctor check (nicer than a raw FK error).
  const doctor = await query<{ name: string }>("SELECT name FROM doctors WHERE id = $1", [body.doctorId]);
  if (doctor.rowCount === 0) {
    throw new ApiError(404, "DOCTOR_NOT_FOUND", `Doctor ${body.doctorId} does not exist.`);
  }
  const doctorName = doctor.rows[0].name;

  // The overlap rule is enforced by the DB's no_doctor_overlap EXCLUDE
  // constraint, which also protects against concurrent creates. A conflict
  // surfaces as error code 23P01 and is mapped to 409 by the error handler.
  const inserted = await query<AppointmentRow>(
    `
    INSERT INTO appointments
      (patient_name, doctor_id, starts_at, ends_at, duration_minutes, status, reason)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, patient_name, doctor_id, starts_at, ends_at,
    duration_minutes, status, reason, created_at, updated_at
    `,
    [
      body.patientName,
      body.doctorId,
      startsAt,
      endsAt,
      body.durationMinutes,
      body.status,
      body.reason ?? null,
    ],
  );

  return toAppointmentDto({
    ...inserted.rows[0],
    doctor_name: doctorName,
  });
}

export async function updateAppointmentStatus(id: number, status: AppointmentStatus) {
  const updated = await query<AppointmentRow>(
    `
    UPDATE appointments a
    SET status = $2, updated_at = now()
    WHERE a.id = $1
    RETURNING id, patient_name, doctor_id, starts_at, ends_at,
              duration_minutes, status, reason, created_at, updated_at
    `,
    [id, status],
  );

  if (updated.rowCount === 0) {
    throw new ApiError(404, "APPOINTMENT_NOT_FOUND", `Appointment ${id} does not exist.`);
  }

  // doctor name for the response
  const doctorName = await query<{ name: string }>(
    "SELECT name FROM doctors WHERE id = $1",
    [updated.rows[0].doctor_id],
  );

  return toAppointmentDto({ ...updated.rows[0], doctor_name: doctorName.rows[0]?.name ?? "" });
}

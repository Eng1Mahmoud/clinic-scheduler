import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { pool } from "../src/db/pool.js";
import { at, createDoctor, resetTables, TEST_DAY } from "./helpers.js";

beforeAll(async () => {
  await resetTables();
});

afterEach(async () => {
  await resetTables();
});

afterAll(async () => {
  await pool.end();
});

const post = (body: object) =>
  request(app).post("/appointments").send(body);

describe("POST /appointments — creation", () => {
  it("persists a valid appointment and returns 201", async () => {
    const doctorId = await createDoctor("Dr. Ahmed");
    const res = await post({
      patientName: "John Doe",
      doctorId,
      startsAt: at("10:00"),
      durationMinutes: 30,
      reason: "Check-up",
    });

    expect(res.status).toBe(201);
    expect(res.body.appointment).toMatchObject({
      patientName: "John Doe",
      doctorId,
      status: "scheduled",
      durationMinutes: 30,
      startsAt: at("10:00"),
      endsAt: at("10:30"),
    });

    const list = await request(app).get(`/appointments?date=${TEST_DAY}`);
    expect(list.body.appointments).toHaveLength(1);
  });

  it("rejects missing required fields with 400 and field details", async () => {
    const doctorId = await createDoctor("Dr. Sara");
    const res = await post({ doctorId, durationMinutes: 30 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain("patientName");
    expect(fields).toContain("startsAt");
  });

  it("rejects non-positive durationMinutes", async () => {
    const doctorId = await createDoctor("Dr. Sara");
    for (const durationMinutes of [0, -30]) {
      const res = await post({
        patientName: "Jane",
        doctorId,
        startsAt: at("10:00"),
        durationMinutes,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects an invalid startsAt date", async () => {
    const doctorId = await createDoctor("Dr. Sara");
    const res = await post({
      patientName: "Jane",
      doctorId,
      startsAt: "not-a-date",
      durationMinutes: 30,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when the doctor does not exist", async () => {
    const res = await post({
      patientName: "Ghost Patient",
      doctorId: 9999,
      startsAt: at("10:00"),
      durationMinutes: 30,
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("DOCTOR_NOT_FOUND");
  });
});

describe("POST /appointments — conflict rules (DB-level)", () => {
  it("returns 409 APPOINTMENT_CONFLICT for overlapping appointments", async () => {
    const doctorId = await createDoctor("Dr. Ahmed");
    await post({
      patientName: "First",
      doctorId,
      startsAt: at("10:00"),
      durationMinutes: 30,
    });

    const res = await post({
      patientName: "Overlapping",
      doctorId,
      startsAt: at("10:15"),
      durationMinutes: 30,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("APPOINTMENT_CONFLICT");
    expect(res.body.error.message).toMatch(/choose another time/i);
  });

  it("allows adjacent appointments (10:00-10:30 then 10:30-11:00)", async () => {
    const doctorId = await createDoctor("Dr. Ahmed");
    const first = await post({
      patientName: "First",
      doctorId,
      startsAt: at("10:00"),
      durationMinutes: 30,
    });
    const second = await post({
      patientName: "Second",
      doctorId,
      startsAt: at("10:30"),
      durationMinutes: 30,
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("allows a cancelled appointment to overlap a scheduled one", async () => {
    const doctorId = await createDoctor("Dr. Ahmed");
    await post({
      patientName: "Scheduled",
      doctorId,
      startsAt: at("10:00"),
      durationMinutes: 30,
    });

    const res = await post({
      patientName: "Cancelled overlap",
      doctorId,
      startsAt: at("10:15"),
      durationMinutes: 30,
      status: "cancelled",
    });

    expect(res.status).toBe(201);
    expect(res.body.appointment.status).toBe("cancelled");
  });

  it("allows the same time slot for different doctors", async () => {
    const a = await createDoctor("Dr. Ahmed");
    const b = await createDoctor("Dr. Sara");
    const first = await post({
      patientName: "With Ahmed",
      doctorId: a,
      startsAt: at("10:00"),
      durationMinutes: 30,
    });
    const second = await post({
      patientName: "With Sara",
      doctorId: b,
      startsAt: at("10:00"),
      durationMinutes: 30,
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("keeps exactly one success when conflicting creates arrive concurrently", async () => {
    const doctorId = await createDoctor("Dr. Ahmed");
    const body = {
      patientName: "Concurrent",
      doctorId,
      startsAt: at("16:00"),
      durationMinutes: 30,
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => post(body)),
    );
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([201, 409, 409, 409, 409]);

    const db = await pool.query(
      "SELECT COUNT(*)::int AS n FROM appointments WHERE starts_at = $1",
      [at("16:00")],
    );
    expect(db.rows[0].n).toBe(1);
  });
});

describe("PATCH /appointments/:id/status", () => {
  async function createScheduledAppointment(doctorId: number) {
    const res = await post({
      patientName: "Jane",
      doctorId,
      startsAt: at("09:00"),
      durationMinutes: 30,
    });
    return res.body.appointment.id as number;
  }

  it("persists a valid status change", async () => {
    const doctorId = await createDoctor("Dr. Ahmed");
    const id = await createScheduledAppointment(doctorId);

    const res = await request(app)
      .patch(`/appointments/${id}/status`)
      .send({ status: "checked_in" });

    expect(res.status).toBe(200);
    expect(res.body.appointment.status).toBe("checked_in");

    const list = await request(app)
      .get(`/appointments?date=${TEST_DAY}&status=checked_in`);
    expect(list.body.appointments).toHaveLength(1);
  });

  it("cycles through all supported statuses", async () => {
    const doctorId = await createDoctor("Dr. Ahmed");
    const id = await createScheduledAppointment(doctorId);

    for (const status of ["checked_in", "completed", "cancelled", "scheduled"]) {
      const res = await request(app)
        .patch(`/appointments/${id}/status`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe(status);
    }
  });

  it("rejects unsupported status values with 400", async () => {
    const doctorId = await createDoctor("Dr. Ahmed");
    const id = await createScheduledAppointment(doctorId);

    const res = await request(app)
      .patch(`/appointments/${id}/status`)
      .send({ status: "deleted" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for a non-existent appointment", async () => {
    const res = await request(app)
      .patch("/appointments/9999/status")
      .send({ status: "completed" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("APPOINTMENT_NOT_FOUND");
  });
});

describe("GET /appointments — filters", () => {
  it("filters by date, doctor, and status — combined", async () => {
    const ahmed = await createDoctor("Dr. Ahmed");
    const sara = await createDoctor("Dr. Sara");

    await post({ patientName: "A1", doctorId: ahmed, startsAt: at("09:00"), durationMinutes: 30 });
    await post({ patientName: "A2", doctorId: ahmed, startsAt: at("10:00"), durationMinutes: 30 });
    const saraAppt = await post({
      patientName: "S1",
      doctorId: sara,
      startsAt: at("11:00"),
      durationMinutes: 30,
    });

    const res = await request(app)
      .get(`/appointments?date=${TEST_DAY}&doctorId=${sara}&status=scheduled`);
    expect(res.body.appointments).toHaveLength(1);
    expect(res.body.appointments[0].patientName).toBe("S1");

    await request(app)
      .patch(`/appointments/${saraAppt.body.appointment.id}/status`)
      .send({ status: "completed" });
    const after = await request(app)
      .get(`/appointments?date=${TEST_DAY}&doctorId=${sara}&status=completed`);
    expect(after.body.appointments[0].patientName).toBe("S1");
    const empty = await request(app)
      .get(`/appointments?date=${TEST_DAY}&doctorId=${sara}&status=scheduled`);
    expect(empty.body.appointments).toHaveLength(0);
  });

  it("returns an empty list for a day without appointments", async () => {
    await createDoctor("Dr. Ahmed");
    const res = await request(app).get("/appointments?date=2030-01-01");
    expect(res.status).toBe(200);
    expect(res.body.appointments).toHaveLength(0);
  });

  it("rejects invalid query parameter formats with 400", async () => {
    const res = await request(app).get("/appointments?date=not-a-date");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});


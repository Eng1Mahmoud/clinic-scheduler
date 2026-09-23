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

async function createAppointmentWithStudy(): Promise<{
  appointmentId: number;
  studyId: number;
}> {
  const doctorId = await createDoctor("Dr. Ahmed");
  const appt = await request(app)
    .post("/appointments")
    .send({
      patientName: "Jane Smith",
      doctorId,
      startsAt: at("10:00"),
      durationMinutes: 30,
    });
  const appointmentId = appt.body.appointment.id as number;

  const study = await pool.query<{ id: number }>(
    `
    INSERT INTO imaging_studies (appointment_id, modality, description, dicom_file_path)
    VALUES ($1, 'XA', 'Seeded study', 'storage/dicom/0002.dcm')
    RETURNING id
    `,
    [appointmentId],
  );
  return { appointmentId, studyId: study.rows[0].id };
}

describe("GET /appointments/:id/imaging-study", () => {
  it("returns safe metadata only (no patient-identifying DICOM fields)", async () => {
    const { appointmentId } = await createAppointmentWithStudy();

    const res = await request(app).get(`/appointments/${appointmentId}/imaging-study`);

    expect(res.status).toBe(200);
    expect(res.body.imagingStudy).toEqual({
      id: expect.any(Number),
      appointmentId,
      modality: "XA",
      description: "Seeded study",
      fileUrl: expect.stringMatching(/^\/imaging-studies\/\d+\/file$/),
    });

    // Guard: no patient-identifying fields ever leak into the response.
    const json = JSON.stringify(res.body);
    for (const forbidden of ["patientname", "patientid", "patientbirth"]) {
      expect(json.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("returns 404 when the appointment has no imaging study", async () => {
    const doctorId = await createDoctor("Dr. Sara");
    const appt = await request(app)
      .post("/appointments")
      .send({
        patientName: "No Study",
        doctorId,
        startsAt: at("12:00"),
        durationMinutes: 30,
      });

    const res = await request(app)
      .get(`/appointments/${appt.body.appointment.id}/imaging-study`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("IMAGING_STUDY_NOT_FOUND");
  });
});

describe("GET /imaging-studies/:id/file", () => {
  it("streams the DICOM file with the correct content type and size", async () => {
    const { studyId } = await createAppointmentWithStudy();

    const res = await request(app)
      .get(`/imaging-studies/${studyId}/file`)
      .responseType("blob");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/dicom");

    // The supplied file is exactly 1,702,398 bytes.
    const body = res.body as Buffer;
    expect(body.length).toBe(1_702_398);

    // A valid DICOM file has the "DICM" magic at byte offset 128.
    const magic = body.subarray(128, 132).toString("ascii");
    expect(magic).toBe("DICM");
  });

  it("returns 404 for a non-existent imaging study", async () => {
    const res = await request(app).get("/imaging-studies/9999/file");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("IMAGING_STUDY_NOT_FOUND");
  });

  it("returns 400 INVALID_FILE_PATH when the stored path escapes server/", async () => {
    const doctorId = await createDoctor("Dr. Ahmed");
    const appt = await request(app)
      .post("/appointments")
      .send({
        patientName: "Path escape test",
        doctorId,
        startsAt: at("14:00"),
        durationMinutes: 30,
      });
    const appointmentId = appt.body.appointment.id as number;

    // Intentionally store a path that resolves outside server/.
    await pool.query(
      `INSERT INTO imaging_studies (appointment_id, modality, description, dicom_file_path)
       VALUES ($1, 'XA', 'Path escape attempt', '../../etc/passwd')`,
      [appointmentId],
    );

    const res = await request(app).get(`/imaging-studies/${appointmentId}/file`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_FILE_PATH");
  });
});

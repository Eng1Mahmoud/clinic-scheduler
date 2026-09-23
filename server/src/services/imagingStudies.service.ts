import { query } from "../db/pool.js";
import { ApiError } from "../errors.js";

export interface ImagingStudyRow {
  id: number;
  appointment_id: number;
  modality: string;
  description: string | null;
  dicom_file_path: string;
}

/** Safe metadata only: modality, description and a file URL.
 *  Patient-identifying DICOM fields are never read, returned, or logged. */
export async function getImagingStudyByAppointment(appointmentId: number) {
  const result = await query<ImagingStudyRow>(
    `
    SELECT id, appointment_id, modality, description, dicom_file_path
    FROM imaging_studies
    WHERE appointment_id = $1
    `,
    [appointmentId],
  );

  if (result.rowCount === 0) {
    throw new ApiError(
      404,
      "IMAGING_STUDY_NOT_FOUND",
      `No imaging study is attached to appointment ${appointmentId}.`,
    );
  }

  const row = result.rows[0];
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    modality: row.modality,
    description: row.description,
    fileUrl: `/imaging-studies/${row.id}/file`,
  };
}

export async function getImagingStudyFile(id: number) {
  const result = await query<ImagingStudyRow>(
    `
    SELECT id, appointment_id, modality, description, dicom_file_path
    FROM imaging_studies
    WHERE id = $1
    `,
    [id],
  );

  if (result.rowCount === 0) {
    throw new ApiError(404, "IMAGING_STUDY_NOT_FOUND", `Imaging study ${id} does not exist.`);
  }

  return result.rows[0];
}

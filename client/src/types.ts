export const APPOINTMENT_STATUSES = [
  "scheduled",
  "checked_in",
  "completed",
  "cancelled",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface Doctor {
  id: number;
  name: string;
}

export interface Appointment {
  id: number;
  patientName: string;
  doctorId: number;
  doctorName: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  imagingStudyId: number | null;
}

export interface ImagingStudy {
  id: number;
  appointmentId: number;
  modality: string;
  description: string | null;
  fileUrl: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
};

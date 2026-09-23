import { api } from "./client";
import type {
  Appointment,
  AppointmentStatus,
  Doctor,
  ImagingStudy,
} from "../types";

export async function fetchDoctors(): Promise<{ doctors: Doctor[] }> {
  return api("/api/doctors");
}

export async function fetchAppointments(params: {
  date: string;
  doctorId?: number;
  status?: AppointmentStatus;
}): Promise<{ appointments: Appointment[] }> {
  const qs = new URLSearchParams({ date: params.date });
  if (params.doctorId) qs.set("doctorId", String(params.doctorId));
  if (params.status) qs.set("status", params.status);
  return api(`/api/appointments?${qs.toString()}`);
}

export async function createAppointment(body: {
  patientName: string;
  doctorId: number;
  startsAt: string;
  durationMinutes: number;
  reason?: string;
}): Promise<{ appointment: Appointment }> {
  return api("/api/appointments", { method: "POST", body: JSON.stringify(body) });
}

export async function updateAppointmentStatus(
  id: number,
  status: AppointmentStatus,
): Promise<{ appointment: Appointment }> {
  return api(`/api/appointments/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function fetchImagingStudy(
  appointmentId: number,
): Promise<{ imagingStudy: ImagingStudy }> {
  return api(`/api/appointments/${appointmentId}/imaging-study`);
}

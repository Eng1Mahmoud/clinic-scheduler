import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAppointment,
  fetchAppointments,
  fetchDoctors,
  fetchImagingStudy,
  updateAppointmentStatus,
} from "../api/appointments";
import type { AppointmentStatus } from "../types";

export function useDoctors() {
  return useQuery({
    queryKey: ["doctors"],
    queryFn: fetchDoctors,
    staleTime: 5 * 60_000,
  });
}

export function useAppointments(filters: {
  date: string;
  doctorId?: number;
  status?: AppointmentStatus;
}) {
  return useQuery({
    queryKey: ["appointments", filters.date, filters.doctorId ?? null, filters.status ?? null],
    queryFn: () => fetchAppointments(filters),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAppointment,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["appointments", variables.startsAt.slice(0, 10)] });
    },
  });
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: AppointmentStatus }) =>
      updateAppointmentStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useImagingStudy(appointmentId: number | null) {
  return useQuery({
    queryKey: ["imaging-study", appointmentId],
    queryFn: () => fetchImagingStudy(appointmentId!),
    enabled: appointmentId !== null,
    retry: false,
  });
}

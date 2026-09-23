import { z } from "zod";

/** Canonical appointment statuses (mirrors the DB CHECK constraint). */
export const APPOINTMENT_STATUSES = [
  "scheduled",
  "checked_in",
  "completed",
  "cancelled",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const statusSchema = z.enum(APPOINTMENT_STATUSES);

const isParsableDate = (v: string) => !Number.isNaN(Date.parse(v));

export const createAppointmentSchema = z.object({
  patientName: z.string().trim().min(1),
  doctorId: z.coerce.number().int().positive(),
  /** Full ISO-8601 instant, e.g. 2026-09-22T10:00:00Z (stored as UTC). */
  startsAt: z.string().refine(isParsableDate),
  durationMinutes: z.coerce.number().int().positive(),
  status: statusSchema.default("scheduled"),
  reason: z.string().trim().optional(),
});

export const updateStatusSchema = z.object({
  status: statusSchema,
});

export const listAppointmentsQuerySchema = z.object({
  /** Calendar day, e.g. 2026-09-22. Interpreted in UTC (documented). */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  doctorId: z.coerce.number().int().positive().optional(),
  status: statusSchema.optional(),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

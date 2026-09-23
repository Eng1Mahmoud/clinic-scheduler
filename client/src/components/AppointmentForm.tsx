import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiRequestError } from "../api/client";
import { useCreateAppointment, useDoctors } from "../hooks/useAppointments";

const formSchema = z.object({
  patientName: z.string().trim().min(1, "Patient name is required"),
  doctorId: z
    .number({ message: "Choose a doctor" })
    .int()
    .positive("Choose a doctor"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Time is required"),
  durationMinutes: z
    .number({ message: "Choose a duration" })
    .int()
    .positive("Duration must be positive")
    .max(480, "Duration is too long"),
  reason: z.string().trim().max(200).optional(),
});

type FormValues = z.infer<typeof formSchema>;

function toIsoStart(date: string, time: string): string {
  // Interpreted in the browser's local timezone, sent as a UTC instant.
  return new Date(`${date}T${time}`).toISOString();
}

export function AppointmentForm({ defaultDate }: { defaultDate: string }) {
  const { data: doctorsData } = useDoctors();
  const doctors = doctorsData?.doctors ?? [];
  const create = useCreateAppointment();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientName: "",
      date: defaultDate,
      time: "10:00",
      durationMinutes: 30,
      reason: "",
    },
  });

  useEffect(() => {
    reset((values) => ({ ...values, date: defaultDate }));
  }, [defaultDate, reset]);

  const onSubmit = (values: FormValues) => {
    setSuccessMessage(null);
    create.mutate(
      {
        patientName: values.patientName,
        doctorId: values.doctorId,
        startsAt: toIsoStart(values.date, values.time),
        durationMinutes: values.durationMinutes,
        reason: values.reason || undefined,
      },
      {
        onSuccess: (data) => {
          setSuccessMessage(`Appointment #${data.appointment.id} created.`);
          reset({
            patientName: "",
            doctorId: values.doctorId,
            date: values.date,
            time: values.time,
            durationMinutes: values.durationMinutes,
            reason: "",
          });
        },
        // On conflict (or any server error) we intentionally do NOT reset:
        // the entered data stays so the user can just fix the time.
      },
    );
  };

  const serverError = create.error as ApiRequestError | null;
  const isConflict = serverError?.code === "APPOINTMENT_CONFLICT";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4 rounded-xl border border-border-strong bg-surface-raised p-5 shadow-card"
      noValidate
    >
      <h2 className="font-display text-lg font-medium text-fg">Create appointment</h2>

      {isConflict && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-warning bg-warning-soft px-3 py-2.5 text-sm"
        >
          <span className="dot dot-checked-in mt-1.5 shrink-0" />
          <div>
            <p className="text-fg">{serverError?.message}</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Your entered details are kept — choose another time and retry.
            </p>
          </div>
        </div>
      )}
      {!isConflict && serverError && (
        <div
          role="alert"
          className="rounded-lg border border-error bg-error-soft px-3 py-2 text-sm text-error"
        >
          {serverError.message}
        </div>
      )}
      {successMessage && (
        <div
          role="status"
          className="rounded-lg border border-success bg-success-soft px-3 py-2 text-sm text-success"
        >
          {successMessage}
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        Patient name
        <input
          type="text"
          {...register("patientName")}
          placeholder="e.g. Mahmoud Ali"
          className="field"
        />
        {errors.patientName && (
          <span className="text-xs text-error">
            {errors.patientName.message}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        Doctor
        <select
          {...register("doctorId", { valueAsNumber: true })}
          className="field appearance-none cursor-pointer"
        >
          <option value="">Select a doctor…</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {errors.doctorId && (
          <span className="text-xs text-error">{errors.doctorId.message}</span>
        )}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          Date
          <input type="date" {...register("date")} className="field" />
          {errors.date && (
            <span className="text-xs text-error">{errors.date.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          Start time
          <input type="time" {...register("time")} className="field" />
          {errors.time && (
            <span className="text-xs text-error">{errors.time.message}</span>
          )}
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        Duration
        <select
          {...register("durationMinutes", { valueAsNumber: true })}
          className="field appearance-none cursor-pointer"
        >
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={45}>45 minutes</option>
          <option value={60}>60 minutes</option>
        </select>
        {errors.durationMinutes && (
          <span className="text-xs text-error">
            {errors.durationMinutes.message}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        Reason
        <input
          type="text"
          {...register("reason")}
          placeholder="e.g. Follow-up"
          className="field"
        />
      </label>

      <button
        type="submit"
        disabled={create.isPending}
        className="btn btn-primary self-start"
      >
        {create.isPending ? "Creating…" : "Create appointment"}
      </button>
    </form>
  );
}

import { useUpdateAppointmentStatus } from "../hooks/useAppointments";
import { APPOINTMENT_STATUSES, STATUS_LABELS } from "../types";
import type { Appointment, AppointmentStatus } from "../types";

/** Pill class per status — defined in index.css as .pill + .pill-*. */
const STATUS_PILL_CLASS: Record<AppointmentStatus, string> = {
  scheduled: "pill pill-scheduled",
  checked_in: "pill pill-checked-in",
  completed: "pill pill-completed",
  cancelled: "pill pill-cancelled",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  appointments: Appointment[];
  onViewScan: (appointment: Appointment) => void;
}

export function AppointmentList({ appointments, onViewScan }: Props) {
  const updateStatus = useUpdateAppointmentStatus();

  return (
    <ul className="flex flex-col gap-3">
      {appointments.map((a) => {
        const pillClass = STATUS_PILL_CLASS[a.status];
        return (
          <li
            key={a.id}
            className="card flex flex-wrap items-center gap-3 p-4 transition-hover"
          >
            <div className="shrink-0 text-center">
              <div className="text-base font-semibold text-fg tracking-tight">
                {formatTime(a.startsAt)}
              </div>
              <div className="text-xs text-fg-muted">{a.durationMinutes} min</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-fg">{a.patientName}</div>
              <div className="text-sm text-fg-soft">{a.doctorName}</div>
              {a.reason && (
                <div className="mt-0.5 text-sm text-fg-muted">{a.reason}</div>
              )}
            </div>
            <span className={pillClass}>{STATUS_LABELS[a.status]}</span>
            <label className="text-xs text-fg-muted">
              <span className="sr-only">Change status for {a.patientName}</span>
              <select
                aria-label={`Change status for ${a.patientName}`}
                value={a.status}
                disabled={updateStatus.isPending}
                onChange={(e) =>
                  updateStatus.mutate({
                    id: a.id,
                    status: e.target.value as AppointmentStatus,
                  })
                }
                className="field text-xs appearance-none cursor-pointer [&::-webkit-scrollbar]:h-3.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-field-border [&::-webkit-scrollbar-thumb]:hover:bg-accent/30"
              >
                {APPOINTMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            {a.imagingStudyId && (
              <button
                type="button"
                onClick={() => onViewScan(a)}
                className="btn btn-primary"
              >
                View scan
              </button>
            )}
            {updateStatus.isError && (
              <span role="alert" className="text-xs text-error">
                Status update failed — try again.
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

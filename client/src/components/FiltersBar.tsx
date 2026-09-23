import { APPOINTMENT_STATUSES, STATUS_LABELS } from "../types";
import type { AppointmentStatus, Doctor } from "../types";

interface Props {
  date: string;
  onDateChange: (date: string) => void;
  doctorId: number | null;
  onDoctorChange: (id: number | null) => void;
  status: AppointmentStatus | null;
  onStatusChange: (status: AppointmentStatus | null) => void;
  doctors: Doctor[];
}

export function FiltersBar({
  date,
  onDateChange,
  doctorId,
  onDoctorChange,
  status,
  onStatusChange,
  doctors,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border-strong bg-surface-raised p-4 shadow-card">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
        <span className="text-xs font-medium text-fg-muted">
          Date
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="field text-sm [&::-webkit-calendar-picker-indicator]:text-[var(--color-muted)] [&::-webkit-calendar-picker-indicator]:opacity-70"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
        <span className="text-xs font-medium text-fg-muted">
          Doctor
        </span>
        <select
          value={doctorId ?? ""}
          onChange={(e) =>
            onDoctorChange(e.target.value ? Number(e.target.value) : null)
          }
          className="field text-sm appearance-none cursor-pointer [&::-webkit-scrollbar]:h-4 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-thumb]:hover:bg-accent/30 [&::-webkit-calendar-picker-indicator]:hidden"
        >
          <option value="">All doctors</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
        <span className="text-xs font-medium text-fg-muted">
          Status
        </span>
        <select
          value={status ?? ""}
          onChange={(e) =>
            onStatusChange((e.target.value || null) as AppointmentStatus | null)
          }
          className="field text-sm [&::-webkit-calendar-picker-indicator]:hidden"
        >
          <option value="">All</option>
          {APPOINTMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

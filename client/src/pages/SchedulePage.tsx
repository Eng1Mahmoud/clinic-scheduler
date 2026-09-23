import { useState } from "react";
import { AppointmentForm } from "../components/AppointmentForm";
import { AppointmentList } from "../components/AppointmentList";
import { DicomViewerModal } from "../components/DicomViewerModal";
import { FiltersBar } from "../components/FiltersBar";
import { useAppointments, useDoctors } from "../hooks/useAppointments";
import type { Appointment, AppointmentStatus } from "../types";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function SchedulePage() {
  const [date, setDate] = useState(todayIso);
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [status, setStatus] = useState<AppointmentStatus | null>(null);
  const [viewingScan, setViewingScan] = useState<Appointment | null>(null);

  const doctorsQuery = useDoctors();
  const appointmentsQuery = useAppointments({ date, doctorId: doctorId ?? undefined, status: status ?? undefined });

  const doctors = doctorsQuery.data?.doctors ?? [];
  const appointments = appointmentsQuery.data?.appointments ?? [];

  return (
    <div className="min-h-screen bg-surface">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex items-baseline justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="font-display text-[1.75rem] font-medium text-fg">Clinic Schedule</h1>
          <p className="mt-1 text-sm text-fg-soft">Manage today&apos;s appointments and attached scans.</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-fg-muted sm:flex">
          <span className="dot dot-scheduled" />
          Staff view
        </span>
      </header>
      <FiltersBar
        date={date}
        onDateChange={setDate}
        doctorId={doctorId}
        onDoctorChange={setDoctorId}
        status={status}
        onStatusChange={setStatus}
        doctors={doctors}
      />
      {doctorsQuery.isError && (
        <div role="alert" className="rounded-xl border border-error bg-error-soft p-4 text-sm text-error">
          Failed to load doctors.
        </div>
      )}
      <section aria-label="Appointments" className="space-y-3">
        {appointmentsQuery.isPending ? (
          <div className="flex items-center justify-center rounded-xl border border-border bg-surface-raised py-12 text-sm text-fg-muted" role="status">
            <span className="spinner mr-3" />
            Loading appointments…
          </div>
        ) : appointmentsQuery.isError ? (
          <div role="alert" className="rounded-xl border border-error bg-error-soft p-6 text-center">
            <p className="font-medium text-error">Could not load appointments.</p>
            <button
              type="button"
              onClick={() => appointmentsQuery.refetch()}
              className="mt-3 rounded-lg border border-error bg-surface-raised px-3 py-1.5 text-sm font-medium text-error hover:bg-error-soft focus:outline-none focus:ring-2 focus:ring-error/30"
            >
              Retry
            </button>
          </div>
        ) : appointments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-raised py-12 text-center text-sm text-fg-muted empty-dot-grid">
            <p className="px-4 text-fg-soft">No appointments for this day.</p>
            <p className="mt-1">Use the form below to create one.</p>
          </div>
        ) : (
          <AppointmentList appointments={appointments} onViewScan={setViewingScan} />
        )}
      </section>
      <AppointmentForm defaultDate={date} />
      {viewingScan && (
        <DicomViewerModal appointment={viewingScan} onClose={() => setViewingScan(null)} />
      )}
      </main>
    </div>
  );
}

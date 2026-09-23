import { useEffect } from "react";
import { useImagingStudy } from "../hooks/useAppointments";
import type { Appointment } from "../types";
import { DicomViewport } from "./DicomViewport";

export function DicomViewerModal({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useImagingStudy(appointment.id);

  // Escape key closes the modal (keyboard usability requirement).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (isLoading) {
    return (
      <ModalShell title="DICOM Viewer" onClose={onClose}>
        <div className="flex h-72 items-center justify-center text-fg-muted" role="status">
          Loading scan…
        </div>
      </ModalShell>
    );
  }

  if (isError) {
    return (
      <ModalShell title="DICOM Viewer" onClose={onClose}>
        <div
          role="alert"
          className="flex h-72 flex-col items-center justify-center gap-2 text-error"
        >
          <p className="font-medium">Could not load the scan.</p>
          <p className="text-sm text-error/80">
            {(error as Error)?.message ?? "The study may be unsupported or missing."}
          </p>
        </div>
      </ModalShell>
    );
  }

  const study = data?.imagingStudy;

  if (!study) {
    return (
      <ModalShell title="DICOM Viewer" onClose={onClose}>
        <div
          role="alert"
          className="flex h-72 items-center justify-center text-center text-fg-soft"
        >
          No imaging study is attached to this appointment.
        </div>
      </ModalShell>
    );
  }

  const startTime = new Date(appointment.startsAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <ModalShell
      title="DICOM Viewer"
      subtitle={`Appointment #${appointment.id} · ${startTime} · ${appointment.doctorName}`}
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      <DicomViewport
        fileUrl={study.fileUrl}
        fallbackModality={study.modality}
        description={study.description}
      />
    </ModalShell>
  );
}

function ModalShell({
  title,
  subtitle,
  onClose,
  widthClass = "max-w-xl",
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  widthClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${widthClass} rounded-xl bg-surface-raised p-5 shadow-modal border border-border-strong`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-medium text-fg">{title}</h2>
            {subtitle && <p className="text-xs text-fg-soft">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close viewer"
            className="rounded-lg p-1.5 text-fg-muted hover:bg-surface focus:ring-2 focus:ring-accent focus:outline-none"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

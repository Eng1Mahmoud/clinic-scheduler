-- Enables equality checks in the GiST exclusion constraint below.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE doctors (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE appointments (
  id               SERIAL PRIMARY KEY,
  patient_name     TEXT        NOT NULL,
  doctor_id        INT         NOT NULL REFERENCES doctors(id),
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  duration_minutes INT         NOT NULL CHECK (duration_minutes > 0),
  status           TEXT        NOT NULL
    CHECK (status IN ('scheduled', 'checked_in', 'completed', 'cancelled')),
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),

  -- Prevents a doctor from having overlapping active appointments.
  CONSTRAINT no_doctor_overlap EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled')
);

CREATE INDEX idx_appointments_starts_at ON appointments (starts_at);
CREATE INDEX idx_appointments_doctor    ON appointments (doctor_id);

CREATE TABLE imaging_studies (
  id              SERIAL PRIMARY KEY,
  appointment_id  INT    NOT NULL REFERENCES appointments(id),
  modality        TEXT   NOT NULL,
  description     TEXT,
  dicom_file_path TEXT   NOT NULL
);

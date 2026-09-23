# Clinic Appointments & DICOM Viewer

A small full-stack application for a clinic staff member: browse one day of doctor
appointments, create and re-status them, and open the DICOM study attached to an
appointment in a browser-based viewer.

Built for the *Senior Full-Stack Engineer* take-home assignment. The emphasis is on
a **reliable core flow** — correct appointment-conflict prevention under
concurrency, a real DICOM viewer, and honest documentation of the trade-offs —
rather than on feature count.

---

## Stack

| Layer | Choice |
|---|---|
| Backend | Node.js 24, TypeScript (strict), Express 5 |
| Validation | Zod 4 (shared request schemas) |
| Database | PostgreSQL 16 via `pg` (raw parameterised SQL, no ORM) |
| Migrations | Plain `.sql` files + a tiny ordered runner (`src/db/migrate.ts`) |
| Tests | Vitest + Supertest against a real PostgreSQL instance |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| Server state | TanStack Query 5 |
| Forms | React Hook Form + `@hookform/resolvers` + Zod |
| DICOM | Cornerstone3D (`@cornerstonejs/core`, `@cornerstonejs/dicom-image-loader`) |

Everything runs from the repo root through npm workspaces — no global tooling
beyond Node.js, npm and Docker.

---

## Quick start

**Prerequisites:** Node.js ≥ 20, npm ≥ 10, Docker (or a local PostgreSQL 16 server).

```bash
# 1. install dependencies (also copies the DICOM decoder WASM binaries)
npm install

# 2. create the server .env from the committed template
cp server/.env.example server/.env      # Windows: copy server\.env.example server\.env

# 3. start PostgreSQL (container: clinic-app-db, host port 5434)
npm run db:up

# 4. apply migrations
npm run migrate

# 5. insert the review-ready seed day (3 doctors, 5 appointments, 1 DICOM study)
npm run seed

# 6. run the API (http://localhost:4000) and the UI (http://localhost:5173)
npm run dev:server     # terminal 1
npm run dev:client     # terminal 2
```

Open **http://localhost:5173**. The seeded day is *today* (UTC), so the default
view is populated and the **View scan** button on *Jane Smith / Dr. Sara* opens the
supplied DICOM study.

### Tests

```bash
npm test
```

The suite runs against the same PostgreSQL instance and **truncates the tables**, so
run `npm run seed` again afterwards to restore the demo data for manual review.

### Useful root scripts

| Script | Purpose |
|---|---|
| `npm run db:up` / `db:down` | Start / stop the PostgreSQL container |
| `npm run migrate` | Apply pending SQL migrations (idempotent) |
| `npm run seed` | Reset + insert demo data (idempotent) |
| `npm run dev:server` / `dev:client` | Dev servers |
| `npm test` | Backend test suite |

## AI assistance disclosure

AI assistance was used for targeted code exploration, implementation support, and
review of the setup, API, concurrency, and DICOM viewer flow. I reviewed the
resulting code, ran the automated tests and production builds, and manually
verified the seeded DICOM viewer flow before submission.


---

## Architecture and Trade-offs

*(Required by the assignment brief. This is a short index — each point is a one-line
summary with a link to the full discussion further down.)*

- **Project structure and library choices** — npm workspaces splitting `server`
  (Express 5 + TypeScript + raw parameterised `pg`, no ORM) from `client` (React 19 +
  Vite + Tailwind 4), sharing nothing but a documented HTTP contract. See
  [Stack](#stack) and [Project structure](#project-structure).
- **Concurrent appointment conflicts** — enforced by a PostgreSQL `EXCLUDE USING gist`
  constraint, not application-level locking, so it is correct even under concurrent
  requests. See [Concurrency](#concurrency-how-overlapping-appointments-are-prevented).
- **DICOM viewer lifecycle** — one Cornerstone3D `RenderingEngine` per modal mount,
  torn down (including the cached dataset) on every unmount; a `ResizeObserver` keeps
  it in sync with the modal. See [DICOM viewer](#dicom-viewer).
- **Time-zone assumptions** — all storage and API responses are UTC; the client
  renders wall-clock time in the browser's locale. See
  [Timezone handling](#timezone-handling).
- **Security and privacy** — DICOM patient-identifying tags are never read (an
  allow-list of 5 safe tags only), errors never leak stack traces, and the file route
  guards against path traversal. See [Security & privacy](#security--privacy).
- **What's next** — see [What to Improve Next](#what-to-improve-next).

---

## Project structure

```
.
├── docker-compose.yml            # PostgreSQL 16
├── package.json                  # npm workspaces (server, client)
├── server/
│   ├── src/
│   │   ├── app.ts                # Express app: routes + 404 + error handler
│   │   ├── server.ts             # process entry point (loads .env, listens)
│   │   ├── errors.ts             # ApiError (status + machine-readable code)
│   │   ├── validation.ts         # Zod schemas for bodies/queries/params
│   │   ├── db/
│   │   │   ├── pool.ts           # single pg.Pool
│   │   │   ├── migrate.ts        # ordered .sql runner (skips applied files)
│   │   │   └── migrations/001_init.sql
│   │   ├── middleware/
│   │   │   ├── validate.ts       # Zod → 400 with per-field details
│   │   │   └── errorHandler.ts   # PostgreSQL error codes → HTTP contract
│   │   ├── routes/               # appointments, doctors, imaging-studies
│   │   └── services/             # SQL + business logic
│   ├── seeds/seed.ts
│   ├── storage/dicom/0002.dcm    # the supplied study
│   └── tests/                    # Vitest + Supertest
└── client/
    ├── public/dicom-wasm/        # decoder binaries (copied on npm install)
    ├── scripts/copy-dicom-wasm.mjs
    └── src/
        ├── api/                  # fetch wrapper + typed endpoints
        ├── hooks/useAppointments.ts
        ├── lib/cornerstone.ts    # one-time Cornerstone3D bootstrap
        ├── lib/dicomMetadata.ts  # allow-listed metadata extraction
        ├── pages/SchedulePage.tsx
        └── components/

---

## API reference

All responses are JSON. Errors share one shape so the client can branch on a code
instead of parsing prose:

```json
{ "error": { "code": "APPOINTMENT_CONFLICT", "message": "…", "details": [] } }
```

| Method & path | Purpose |
|---|---|
| `GET /health` | Liveness + database reachability |
| `GET /doctors` | Doctor list for the filter/form dropdowns |
| `GET /appointments?date=YYYY-MM-DD&doctorId=&status=` | Day schedule; every filter is optional and all combine |
| `POST /appointments` | Create an appointment |
| `PATCH /appointments/:id/status` | Change status only |
| `GET /appointments/:id/imaging-study` | Safe study metadata for an appointment |
| `GET /imaging-studies/:id/file` | Stream the DICOM file (`application/dicom`) |

### `GET /appointments`

```jsonc
{
  "appointments": [
    {
      "id": 2,
      "patientName": "Jane Smith",
      "doctorId": 2,
      "doctorName": "Dr. Sara",
      "startsAt": "2026-09-22T10:00:00.000Z",
      "endsAt": "2026-09-22T10:30:00.000Z",
      "durationMinutes": 30,
      "status": "scheduled",
      "reason": "Chest X-ray review",
      "createdAt": "2026-09-22T16:43:40.277Z",
      "updatedAt": "2026-09-22T16:43:40.277Z",
      "imagingStudyId": 1        // null when no study is attached
    }
  ]
}
```

Sorted by `starts_at`, then `id`. `imagingStudyId` lets the list render **View
scan** only for appointments that actually have a study, instead of opening a modal
that then reports "nothing here".

### `POST /appointments`

```jsonc
// request
{
  "patientName": "Jane Smith",
  "doctorId": 2,
  "startsAt": "2026-09-22T10:00:00Z",   // ISO 8601, offset or Z
  "durationMinutes": 30,
  "status": "scheduled",                // optional, defaults to "scheduled"
  "reason": "Chest X-ray review"        // optional, nullable
}
```

`201` → `{ "appointment": { … } }`.

Failure cases:

| Status | `code` | Cause |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing/invalid field, bad status, `durationMinutes <= 0`, unparseable date |
| `404` | `DOCTOR_NOT_FOUND` | `doctorId` does not exist |
| `409` | `APPOINTMENT_CONFLICT` | The doctor already has a non-cancelled appointment overlapping this range |

### `PATCH /appointments/:id/status`

```jsonc
{ "status": "checked_in" }
```

`200` → `{ "appointment": { … } }`; `400 VALIDATION_ERROR` for an unsupported
status; `404 APPOINTMENT_NOT_FOUND` when the id is unknown.

### `GET /appointments/:id/imaging-study`


---

## Concurrency: how overlapping appointments are prevented

This is the part of the assignment I designed for first, because it is where
straightforward implementations are quietly wrong.

### The rule

Two appointments for the same doctor must not overlap, **unless** the existing one
is `cancelled`. Touching ranges are not overlapping: `10:00–10:30` followed by
`10:30–11:00` is allowed.

### Why an application-level check is not enough

The obvious implementation — `SELECT` for a clash, then `INSERT` if none — has a
race window:

```
Request A                          Request B
SELECT → no conflict
                                   SELECT → no conflict   (A has not committed yet)
INSERT → ok
                                   INSERT → ok             ← double booking
```

Both requests read a consistent snapshot that does not yet contain the other's
insert, so both succeed. `SERIALIZABLE` isolation or `SELECT … FOR UPDATE` would
close the window, but both require every writer to cooperate and are easy to get
wrong later (an advisory lock keyed by `doctor_id`, for instance, silently fails if
a future code path forgets to take it).

### What this implementation does instead

The invariant is **declared in the schema** and enforced by PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CONSTRAINT no_doctor_overlap EXCLUDE USING gist (
  doctor_id WITH =,
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (status <> 'cancelled')
```

Read as: *for each `doctor_id`, no two non-cancelled rows may have overlapping
`[starts_at, ends_at)` ranges.* Because it is a GiST **exclusion constraint**, the
conflict check and the row insertion are the same atomic operation. There is no
window between them — if two transactions race, PostgreSQL makes the second one
wait on the index entry and then rejects it:

```
ERROR:  conflicting key value violates exclusion constraint "no_doctor_overlap"
DETAIL:  Key (doctor_id, tstzrange(starts_at, ends_at))=(2, ["…10:15:00+00","…10:45:00+00"]))
         conflicts with existing key (2, ["…10:00:00+00","…10:30:00+00"])).
SQLSTATE: 23P01
```

`WHERE (status <> 'cancelled')` is what makes cancellation free the slot — the
partial index simply stops covering cancelled rows, so they can overlap anything.

### Turning the database error into an API contract

The constraint's `23P01` is mapped once, in `errorHandler.ts`, to the response the
UI already knows how to render:

```json
{ "error": { "code": "APPOINTMENT_CONFLICT",
             "message": "This doctor already has an appointment during this time. Please choose another time." } }
```

So the API has exactly one source of truth for "is this slot free", and it is the
same source that owns the data. No double-checking, no drift between validation and
persistence.


---

## DICOM viewer

### What the supplied file actually is

Inspecting `server/storage/dicom/0002.dcm` before writing any viewer code was worth
the detour, because it differs from the brief in three ways that change the design:

| Property | Value | Consequence |
|---|---|---|
| Modality | **XA** (X-ray angiography), not CT | Metadata is shown as the file reports it, not as the brief assumed |
| Transfer syntax | **JPEG Baseline (compressed)**, 8-bit | A decoder + WASM codec must be available in the browser |
| `NumberOfFrames` | **96** — multi-frame, not single-frame | The viewer must decide what to do with frames |
| Patient attributes | **Present and non-empty** | The privacy requirement becomes a real implementation concern, not a formality |

### Flow

```
View scan
   └─ GET /appointments/:id/imaging-study        → { modality, description, fileUrl }
        └─ <DicomViewport fileUrl=…>
             └─ imageId = `wadouri:${absolute(fileUrl)}`
                  └─ Cornerstone3D: fetch → decode (JPEG) → render into a canvas
```

The server's only job is to hand over bytes; every pixel-level concern belongs to
the browser library. No DICOM parsing, no `.dcm → PNG` conversion, and no bespoke
decoder was written.

### Lifecycle (the part reviewers look at)

`DicomViewport.tsx` owns the whole lifecycle in a single effect keyed on the file
URL, so every resource created on mount is released on unmount:

| Phase | Implementation |
|---|---|
| Initialise | `initCornerstone()` memoises `core.init()` + loader `init()` behind one promise, so React StrictMode's double-invoke cannot register loaders or the decode worker twice |
| Create | one `RenderingEngine` + one stack viewport, ids derived from `useId()` so concurrent modals never collide |
| Load | `viewport.setStack([imageId], 0)` then `render()` |
| Resize | a `ResizeObserver` calls `engine.resize()` + `resetCamera()` — the modal is responsive and the image re-fits instead of stretching |
| Fit / Reset | `resetCamera()` on the active viewport |
| Error | decode/fetch failures set an error state with a **Try again** button; the viewport is never left as a dead black box |
| Cleanup | `ResizeObserver.disconnect()`, `engine.destroy()`, `wadouri.dataSetCacheManager.unload(url)` |
| Post-unmount safety | a `disposed` flag guards every `setState` and short-circuits late work, so a slow decode cannot touch an unmounted component |

Cleaning up matters more than it looks: a `RenderingEngine` holds a WebGL context,
and browsers cap how many can exist. Opening a dozen scans without teardown would
exhaust them and blank the whole viewer for the rest of the session.

### Multi-frame handling

The supplied study has 96 frames. Cine playback, MPR and 3D are explicitly out of
scope, so the viewer deliberately renders **frame 1** and labels it as such
(`Frame: 1 of 96`) rather than pretending the study is a single image. This keeps
the viewer honest about what it is showing without inventing a feature that was
never requested.

### Safe metadata only

`lib/dicomMetadata.ts` defines an explicit allow-list:

```ts
{ studyDate: "x00080020", modality: "x00080060",
  numberOfFrames: "x00280008", rows: "x00280010", columns: "x00280011" }
```

Only these five attributes are ever read, and all of them are non-identifying.

---

## Frontend notes

- **TanStack Query** owns all server state. Loading, empty and error states are
  derived from query status rather than hand-rolled `isLoading` booleans, and
  creating an appointment or changing a status invalidates the day's query, so the
  list is never stale.
- **The create form keeps its values on conflict.** The mutation never resets the
  form on failure: the `APPOINTMENT_CONFLICT` case renders an inline message while
  every field the user typed (patient, doctor, date, time, duration, reason) stays
  exactly as it was, so recovering means changing the time and resubmitting. A
  successful create *does* reset the form. This is one of the assignment's explicit
  acceptance criteria.
- **"View scan" appears only when a study exists**, driven by `imagingStudyId` on
  the list payload.
- **Accessibility / keyboard use:** labelled inputs and `<select>`s, a real
  `<dialog role="dialog" aria-modal>` with `aria-label`, `role="status"` for loading
  and `role="alert"` for errors, visible focus rings, and Escape closes the viewer.
- **Styling** is Tailwind utility classes plus a small CSS custom-property token
  system in `index.css` (`--color-*`, `.btn`, `.field`, `.pill`, `.card`) — no
  component library. Colour is a graphite/paper base with one reserved teal accent
  used only for primary actions and focus states; `Fraunces` (serif) marks headings
  and identity moments (page title, modal titles) while `Inter` (sans) carries all
  functional UI text, so the interface stays legible first and distinctive second —
  clear behaviour over decoration, as the brief asks.

---

## Timezone handling

This is the assumption most likely to differ from a reviewer's expectations, so it
is stated explicitly:

- The database stores `TIMESTAMPTZ`; PostgreSQL normalises to UTC. The API always
  emits UTC ISO-8601 (`…Z`) and accepts any ISO-8601 offset on input.
- The client sends a full ISO timestamp and renders with the browser's locale
  (`toLocaleTimeString`), so staff see wall-clock times in their own timezone.
- The seed script anchors its appointments to **today in UTC**, which is also what
  the schedule page selects by default. On a machine several hours off UTC a late
  evening "today" can therefore look off by one day; this is a demo-data
  convenience, not a rule.
- `GET /appointments?date=…` filters by this ceiling: rather than assuming a clinic
  timezone, the `date` filter is applied against UTC. In a real deployment with a
  fixed clinic timezone the filter should become
  `(starts_at AT TIME ZONE 'Africa/Cairo')::date = $1` — one line in
  `appointments.service.ts` — so a day boundary means midnight in the clinic, not at
  Greenwich.

`date` is intentionally kept as an explicit query parameter instead of being
inferred from a timestamp, which keeps "which day am I looking at" unambiguous and
trivially testable.

---

## Security & privacy

| Concern | Handling |
|---|---|
| Patient identifiers in the study | Never parsed, never returned, never rendered — see *Safe metadata only*. `GET /imaging-studies/:id/file` streams bytes and does not read attributes at all, and a test asserts the metadata payload contains no `patientName`/`patientId`/`patientBirthDate` key |
| Patient names typed into the app | `patientName` is a clinical record field, not a secret; it is stored and returned as domain data. The rule enforced here is the assignment's: nothing *from the DICOM file* is exposed |
| Error leakage | `errorHandler` logs unexpected errors server-side and returns a generic `INTERNAL_ERROR`; no stack traces or SQL reaches the client |
| SQL injection | Every statement uses parameterised `$1` placeholders — no string interpolation of user input |
| Path traversal | The DICOM path from the database is resolved and asserted to stay inside `server/storage/dicom/` before the file is read |
| Input validation | Zod schemas validate body, query and params at the edge; unknown statuses and malformed dates are rejected with per-field `details` |
| Secrets | Configuration comes from `server/.env` (git-ignored); `server/.env.example` documents the shape with a local-development-only password. No credentials are committed |
| Transport | HTTP is fine for local review. Any real deployment must terminate TLS and restrict the imaging endpoint, since it serves clinical content |

`PatientName (0010,0010)`, `PatientID (0010,0020)`, `PatientBirthDate (0010,0030)`
and `AccessionNumber (0008,0050)` are never accessed, never displayed and never
logged — even though **they are present in the supplied file**. The UI surfaces
modality, study date, dimensions and frame count, and states in the footer that no
patient-identifying fields are read.

### Two things this viewer needed that are easy to trip over

1. **Serve the decoder WASM explicitly.** The loader resolves its codecs via
   `new URL(..., import.meta.url)`, which points into `node_modules` and breaks
   once Vite pre-bundles the dependencies. `scripts/copy-dicom-wasm.mjs` copies the
   four decode binaries into `client/public/dicom-wasm/` on `npm install`, and
   `init({ wasmBasePath: "/dicom-wasm/" })` tells Cornerstone where they are. Dev and
   production then behave identically.
2. **Use the legacy wadouri metadata provider.** Cornerstone3D v5's default
   "naturalized metadata" pipeline returned no `COMPRESSED_FRAME_DATA` for this
   compressed multi-frame file, which produced an axis-shaped image with no pixels.
   The loader is initialised with `useLegacyMetadataProvider: true`, which both
   decodes the JPEG frames correctly and populates `dataSetCacheManager` — the same
   dataset the metadata allow-list reads from, so there is no second download.

### Evidence

`server/tests/appointments.api.test.ts` asserts, among others:

- `10:00–10:30` + `10:15–10:45` (same doctor) → **409**
- `10:00–10:30` + `10:30–11:00` (same doctor) → **201** (touching is allowed)
- a `cancelled` appointment + an overlapping one → **201**
- identical time ranges for two *different* doctors → **201**
- **five concurrent `POST`s for the same slot → exactly one `201`, four `409`, and
  exactly one row in the table**

The last test fires all five requests with `Promise.all` before awaiting any of
them, so the requests genuinely interleave server-side.

### Trade-offs of this approach

- **Cost:** inserting an appointment now acquires a GiST index lock, so throughput
  for the *same* doctor is serialised. That is exactly the intent, and irrelevant
  at clinic scale.
- **Coupling:** the rule lives in SQL, so it is invisible to a reader who only
  opens the service files. This is mitigated by a comment in the service that points
  at the constraint, and by the migration filename being the obvious place to look.
- **Rejected alternative:** `SERIALIZABLE` isolation alone still requires the
  application to write a correct query and to retry on `40001`. The constraint is
  one declaration, cannot be bypassed by a future insert path, and needs no retry
  logic.

```jsonc
{
  "imagingStudy": {
    "id": 1,
    "appointmentId": 2,
    "modality": "XA",
    "description": "Angiography scan (supplied sample)",
    "fileUrl": "/imaging-studies/1/file"     // relative; the client resolves it
  }
}
```

`404 IMAGING_STUDY_NOT_FOUND` when the appointment has no study.

### `GET /imaging-studies/:id/file`

Streams the `.dcm` bytes with `Content-Type: application/dicom`. The server never
parses the file, so no patient attribute can leak through this endpoint (see
*Security & privacy*). `404 IMAGING_STUDY_NOT_FOUND` for an unknown id, `400
INVALID_FILE_PATH` if the stored path resolves outside `server/` (path-traversal
guard), and `504 FILE_TRANSFER_TIMEOUT` if the transfer does not complete within 30
seconds. A read error on the underlying stream is surfaced as `500 FILE_READ_ERROR`.
The resolved path is asserted to stay inside `server/storage/dicom/` to rule out path
traversal via the database value.

            ├── FiltersBar.tsx
            ├── AppointmentList.tsx
            ├── AppointmentForm.tsx
            ├── DicomViewerModal.tsx   # modal chrome + study lookup
            └── DicomViewport.tsx      # Cornerstone3D lifecycle
```

The layering is deliberately shallow: `routes` (HTTP) → `services` (SQL + rules) →
`db`. A repository/unit-of-work abstraction is not warranted at three tables, and
no ORM is used because the feature that matters most — the exclusion constraint —
is expressed far more clearly in SQL than through any query builder.

---

## Domain model

```
Doctor 1 ──── * Appointment 1 ──── 0..1 ImagingStudy ──→ storage/dicom/*.dcm
```

| Table | Columns |
|---|---|
| `doctors` | `id`, `name` |
| `appointments` | `id`, `patient_name`, `doctor_id` → `doctors`, `starts_at`, `ends_at`, `duration_minutes`, `status`, `reason`, `created_at`, `updated_at` |
| `imaging_studies` | `id`, `appointment_id` → `appointments`, `modality`, `description`, `dicom_file_path` |

`status` ∈ `scheduled` | `checked_in` | `completed` | `cancelled`.

A patient is intentionally **not** a table. The assignment scopes a patient to a
name on an appointment; inventing a `patients` entity would have added a join and
a migration without serving any acceptance criterion.

`ends_at` is persisted rather than derived — see *Trade-offs → storing the end time*.

---

## AI Disclosure

This project was built with the assistance of an AI coding agent. The AI helped bootstrap the initial project structure, write standard boilerplate for Express and React, implement the DICOM viewer integration with Cornerstone3D, and configure the Tailwind v4 styling.

As the developer, I explicitly guided the architectural decisions (specifically the use of PostgreSQL exclusion constraints for concurrency), thoroughly reviewed the database schema, audited the DICOM metadata extraction logic to ensure strict privacy compliance, and verified that all edge cases for overlapping appointments were correctly handled. All code submitted was reviewed, tested, and understood by me.

---

## What to Improve Next

If given more time, the following enhancements would be prioritized:
1. **Authentication & Authorization**: Implement a real auth system (e.g., JWT) to identify clinic staff users and associate appointments with the person who booked them.
2. **End-to-End Tests**: Add Cypress or Playwright tests to verify the UI flow, particularly the conflict handling behavior and DICOM viewer rendering.
3. **Pagination & Infinite Scroll**: The `GET /appointments` endpoint currently returns an unpaginated array. For a single doctor's day this is fine, but it will scale poorly if filters are broadened.
4. **DICOM Viewer Features**: Add the optional window/level, pan, and zoom controls for a better viewing experience once the core flow is fully validated.
5. **UI Polish**: Add skeletal loading states during data fetches and refine the responsive layout for smaller mobile viewports.

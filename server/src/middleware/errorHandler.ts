import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../errors.js";

/** Maps PostgreSQL error codes thrown by the DB-level constraints to
 *  consistent HTTP responses. This is where database-level protection
 *  becomes a useful API contract. */
function mapPgError(err: (NodeJS.ErrnoException & { code?: string; detail?: string }) | ApiError): ApiError | null {
  switch (err.code) {
    // exclusion_constraint_violation -> overlapping appointment
    case "23P01":
      return new ApiError(
        409,
        "APPOINTMENT_CONFLICT",
        "This doctor already has an appointment during this time. Please choose another time.",
      );
    // foreign_key_violation (e.g. unknown doctorId)
    case "23503":
      return new ApiError(404, "DOCTOR_NOT_FOUND", "The referenced doctor does not exist.");
    // check_violation (e.g. ends_at <= starts_at)
    case "23514":
      return new ApiError(400, "INVALID_APPOINTMENT", "The appointment time range is invalid.");
    default:
      return null;
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  const mapped = mapPgError(err as NodeJS.ErrnoException);
  if (mapped) {
    res.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message },
    });
    return;
  }

  // Unexpected errors: log server-side, respond generically (no stack traces
  // or sensitive details are exposed to the client).
  console.error("[unhandled error]", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
}

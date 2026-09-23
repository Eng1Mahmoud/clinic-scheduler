import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

function formatIssues(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((i) => ({
    field: i.path.map(String).join("."),
    message: i.message,
  }));
}

/** Validates req.body; parsed value replaces req.body on success. */
export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: formatIssues(result.error.issues),
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Validates req.query; parsed value is stored on res.locals.query.
 *  (Express 5 makes req.query a read-only getter, so we don't reassign it.) */
export function validateQuery(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: formatIssues(result.error.issues),
        },
      });
      return;
    }
    res.locals.query = result.data;
    next();
  };
}

/** Validates route params (e.g. :id); parsed value stored on res.locals.params. */
export function validateParams(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request parameters",
          details: formatIssues(result.error.issues),
        },
      });
      return;
    }
    res.locals.params = result.data;
    next();
  };
}

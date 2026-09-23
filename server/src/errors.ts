/** Application error with machine-readable code — mapped to consistent
 *  HTTP responses by the error handler. Never leaks stack traces. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

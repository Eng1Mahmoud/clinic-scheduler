import { Router } from "express";
import { query } from "../db/pool.js";

export const doctorsRouter = Router();

// GET /doctors — used by the schedule filters and the create form.
doctorsRouter.get("/", async (_req, res) => {
  const result = await query<{ id: number; name: string }>(
    "SELECT id, name FROM doctors ORDER BY name",
  );
  res.json({ doctors: result.rows });
});

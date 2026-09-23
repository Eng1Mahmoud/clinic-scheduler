import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import { appointmentsRouter } from "./routes/appointments.routes.js";
import { doctorsRouter } from "./routes/doctors.routes.js";
import { imagingStudiesRouter } from "./routes/imagingStudies.routes.js";
import { pool } from "./db/pool.js";

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

app.use("/doctors", doctorsRouter);
app.use("/appointments", appointmentsRouter);
app.use("/imaging-studies", imagingStudiesRouter);

// 404 for unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
});

app.use(errorHandler);

export default app;

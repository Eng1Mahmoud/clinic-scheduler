import { Router } from "express";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import {
  createAppointment,
  listAppointments,
  updateAppointmentStatus,
} from "../services/appointments.service.js";
import { getImagingStudyByAppointment } from "../services/imagingStudies.service.js";
import {
  createAppointmentSchema,
  idParamSchema,
  listAppointmentsQuerySchema,
  updateStatusSchema,
} from "../validation.js";

export const appointmentsRouter = Router();

// GET /appointments?date=YYYY-MM-DD&doctorId=1&status=scheduled
appointmentsRouter.get(
  "/",
  validateQuery(listAppointmentsQuerySchema),
  async (req, res) => {
    const appointments = await listAppointments(res.locals.query);
    res.json({ appointments });
  },
);

// POST /appointments
appointmentsRouter.post(
  "/",
  validateBody(createAppointmentSchema),
  async (req, res) => {
    const appointment = await createAppointment(req.body);
    res.status(201).json({ appointment });
  },
);

// PATCH /appointments/:id/status
appointmentsRouter.patch(
  "/:id/status",
  validateParams(idParamSchema),
  validateBody(updateStatusSchema),
  async (req, res) => {
    const { id } = res.locals.params;
    const appointment = await updateAppointmentStatus(id, req.body.status);
    res.json({ appointment });
  },
);

// GET /appointments/:id/imaging-study
appointmentsRouter.get(
  "/:id/imaging-study",
  validateParams(idParamSchema),
  async (req, res) => {
    const { id } = res.locals.params;
    const imagingStudy = await getImagingStudyByAppointment(id);
    res.json({ imagingStudy });
  },
);

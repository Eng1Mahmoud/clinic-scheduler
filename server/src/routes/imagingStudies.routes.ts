import { createReadStream, statSync } from "node:fs";
import { join, resolve, dirname, sep as pathSep } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { validateParams } from "../middleware/validate.js";
import { getImagingStudyFile } from "../services/imagingStudies.service.js";
import { idParamSchema } from "../validation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// src/routes/imagingStudies.routes.ts -> server/ root
const serverRoot = resolve(join(__dirname, "..", ".."));
const dicomRoot = resolve(join(serverRoot, "storage", "dicom"));

export const imagingStudiesRouter = Router();

// GET /imaging-studies/:id/file
// Streams the stored DICOM file as opaque bytes. The file is never parsed
// server-side, so patient-identifying DICOM fields never reach the API layer.
imagingStudiesRouter.get("/:id/file", validateParams(idParamSchema), async (req, res) => {
  const { id } = res.locals.params;
  const study = await getImagingStudyFile(id);

  // Keep database references constrained to the directory containing supplied DICOM files.
  const filePath = resolve(join(serverRoot, study.dicom_file_path));
  if (!filePath.startsWith(`${dicomRoot}${pathSep}`)) {
    res.status(400).json({ error: { code: "INVALID_FILE_PATH", message: "Invalid file reference." } });
    return;
  }

  res.setHeader("Content-Type", "application/dicom");
  res.setHeader("Content-Length", statSync(filePath).size);

  // The assignment requires a timeout on DICOM file transfers. For a small sample
  // file this is not practically needed, but it is the right defensive posture for a
  // streaming endpoint, and it keeps the API contract consistent if larger studies are
  // ever served through the same path.
  const transferTimeoutMs = 30_000;
  res.setTimeout(transferTimeoutMs, () => {
    res.status(504).json({
      error: { code: "FILE_TRANSFER_TIMEOUT", message: "DICOM file transfer timed out." },
    });
    res.destroy();
  });

  const stream = createReadStream(filePath);

  stream.on("error", (err: NodeJS.ErrnoException) => {
    // Anything except a client abort (ECONNRESET, ECONNABORTED) is a server error.
    if (err.code !== "ECONNRESET" && err.code !== "ECONNABORTED") {
      console.error("[dicom file stream error]", err);
      if (!res.headersSent) {
        res.status(500).json({
          error: { code: "FILE_READ_ERROR", message: "The DICOM file could not be read." },
        });
      }
    }
    // In-flight response is abandoned either way.
    res.destroy();
  });

  stream.pipe(res);
});

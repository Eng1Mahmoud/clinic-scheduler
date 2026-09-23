import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Enums,
  RenderingEngine,
  getRenderingEngine,
  initCornerstone,
  wadouri,
  type StackViewport,
} from "../lib/cornerstone";
import { readStudyMetadata, type StudyMetadata } from "../lib/dicomMetadata";
import { apiUrl } from "../api/client";

type ViewerStatus = "loading" | "ready" | "error";

interface Props {
  /** Relative API path of the DICOM file, e.g. `/imaging-studies/1/file`. */
  fileUrl: string;
  /** Modality recorded in our database, used until the file is parsed. */
  fallbackModality: string;
  description: string | null;
}

/**
 * Cornerstone3D stack viewport for a single-frame (or first-frame) study.
 *
 * Lifecycle contract:
 *  - Exactly one `RenderingEngine` + viewport is created per mount, and both are
 *    torn down in the effect cleanup (WebGL contexts are a scarce resource).
 *  - `ResizeObserver` keeps the canvas in sync with the modal size.
 *  - The cached DICOM dataset is released on unmount.
 */
export function DicomViewport({ fileUrl, fallbackModality, description }: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RenderingEngine | null>(null);

  // `useId` gives a stable, unique id per modal instance (safe with StrictMode).
  const instanceId = useId().replace(/:/g, "");
  const viewportId = `dicom-viewport-${instanceId}`;
  const engineId = `dicom-engine-${instanceId}`;

  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [study, setStudy] = useState<StudyMetadata | null>(null);

  // The loader needs an absolute URL: the fileUrl returned by the API is
  // server-relative (`/imaging-studies/:id/file`), so it is prefixed with the
  // API base path and resolved against the current origin.
  const absoluteUrl = new URL(apiUrl(fileUrl), window.location.origin).href;
  const imageId = `wadouri:${absoluteUrl}`;

  const fitToWindow = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const viewport = engine.getViewport<StackViewport>(viewportId);
      // `resetCamera()` restores the initial fit-to-window camera.
      viewport?.resetCamera();
      viewport?.render();
    } catch {
      // Viewport not ready yet — the initial render already fits the image.
    }
  }, [viewportId]);


  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let disposed = false;
    setStatus("loading");
    setErrorMessage(null);
    setStudy(null);

    const resizeObserver = new ResizeObserver(() => {
      const engine = engineRef.current;
      if (!engine) return;
      try {
        // Re-fit the image whenever the modal (and therefore the canvas) resizes.
        engine.resize(true, false);
        const viewport = engine.getViewport<StackViewport>(viewportId);
        viewport?.resetCameraForResize();
        viewport?.render();
      } catch {
        // Transient: the engine can be mid-teardown while the modal closes.
      }
    });
    resizeObserver.observe(element);

    void (async () => {
      try {
        await initCornerstone();
        if (disposed) return;

        // A previous mount may have left an engine with this id behind when an
        // error was thrown before the cleanup registered.
        getRenderingEngine(engineId)?.destroy();

        const engine = new RenderingEngine(engineId);
        engine.enableElement({
          viewportId,
          type: Enums.ViewportType.STACK,
          element,
          defaultOptions: { background: [0, 0, 0] },
        });
        engineRef.current = engine;

        if (disposed) {
          engine.destroy();
          engineRef.current = null;
          return;
        }

        const viewport = engine.getViewport<StackViewport>(viewportId);
        // Multi-frame studies render their first frame only; cine playback is
        // explicitly out of scope for this viewer.
        await viewport.setStack([imageId], 0);
        if (disposed) return;

        viewport.render();
        setStudy(readStudyMetadata(absoluteUrl));
        setStatus("ready");
      } catch (error) {
        if (disposed) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Unexpected error while decoding the study.",
        );
        setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      const engine = engineRef.current;
      engineRef.current = null;
      engine?.destroy();
      // Release the parsed DICOM dataset (and its ArrayBuffer) from the cache.
      wadouri.dataSetCacheManager.unload(absoluteUrl);
    };
  }, [absoluteUrl, imageId, engineId, viewportId, reloadKey]);

  const dimensions =
    study?.columns && study?.rows ? `${study.columns} × ${study.rows} px` : "—";
  const frameLabel =
    study?.numberOfFrames && study.numberOfFrames > 1 ? `1 of ${study.numberOfFrames}` : "1 of 1";

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-[26rem] w-full overflow-hidden rounded-lg" style={{ backgroundColor: "var(--color-canvas)" }}>
        <div ref={elementRef} className="h-full w-full" />

        {status === "loading" && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted"
          >
            Loading image…
          </div>
        )}

        {status === "error" && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center"
          >
            <p className="font-medium text-error">This scan could not be displayed.</p>
            <p className="text-xs break-words text-error/80">{errorMessage}</p>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="rounded-lg border border-error/60 px-3 py-1.5 text-sm text-error hover:bg-error/10 focus:ring-2 focus:ring-error focus:outline-none"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Safe study metadata only — never patient-identifying attributes. */}
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-fg-muted">Modality</dt>
          <dd className="font-medium text-fg">{study?.modality ?? fallbackModality}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Study date</dt>
          <dd className="font-medium text-fg">{study?.studyDate ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Dimensions</dt>
          <dd className="font-medium text-fg">{dimensions}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Frame</dt>
          <dd className="font-medium text-fg">{frameLabel}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-fg-soft">
          {description ?? "Attached imaging study"}
          {" · "}
          No patient-identifying fields from the file are read or displayed.
        </p>
        <button
          type="button"
          onClick={fitToWindow}
          disabled={status !== "ready"}
          className="btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Fit / Reset
        </button>
      </div>
    </div>
  );
}

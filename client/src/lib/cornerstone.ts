/**
 * Cornerstone3D bootstrap.
 *
 * Both `core.init()` and the DICOM image loader `init()` are side-effectful and
 * must run exactly once per document, so they are memoised behind a module-level
 * promise (React re-mounts and StrictMode double-invocations stay safe).
 *
 * `dicomLoaderInit()` also registers the `wadouri` / `wadors` image loaders, the
 * naturalized metadata providers and the decode web worker (JPEG Baseline,
 * JPEG-LS, JPEG 2000, RLE — including the codec our seeded study needs).
 */
import {
  Enums,
  RenderingEngine,
  getRenderingEngine,
  init as coreInit,
} from "@cornerstonejs/core";
import { init as dicomLoaderInit, wadouri } from "@cornerstonejs/dicom-image-loader";

let bootstrap: Promise<void> | null = null;

/**
 * The decoder WASM binaries are served from `public/dicom-wasm` instead of relying
 * on the loader's `new URL(..., import.meta.url)` lookup, which points at the
 * package directory in dev and does not survive dependency pre-bundling.
 * The files are copied from the codec packages — see README → "DICOM viewer".
 */
export const WASM_BASE_PATH = "/dicom-wasm/";

export function initCornerstone(): Promise<void> {
  bootstrap ??= (async () => {
    await coreInit();
    // `useLegacyMetadataProvider` keeps the classic wadouri pipeline, which
    //  - parses the file into `dataSetCacheManager` (our source for the
    //    allow-listed study metadata), and
    //  - supports multi-frame compressed transfer syntaxes such as the
    //    JPEG Baseline XA study used for this assignment.
    // The v5 "naturalized metadata" pipeline returned no COMPRESSED_FRAME_DATA
    // for that file, so the legacy provider is used deliberately — see
    // README → "DICOM viewer".
    dicomLoaderInit({ wasmBasePath: WASM_BASE_PATH, useLegacyMetadataProvider: true });
  })();

  return bootstrap;
}

// `StackViewport` and `RenderingEngine` are classes (usable as both values and
// types); `ViewportType` is a type-only export in this version, so the runtime
// constants come from `Enums.ViewportType`.
export { Enums, RenderingEngine, getRenderingEngine, wadouri };
export type { StackViewport } from "@cornerstonejs/core";


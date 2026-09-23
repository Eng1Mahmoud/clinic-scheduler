import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const targetDir = join(here, "..", "public", "dicom-wasm");

/** [file in node_modules, destination file name] */
const codecs = [
  ["@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbowasm_decode.wasm", "libjpegturbowasm_decode.wasm"],
  ["@cornerstonejs/codec-charls/dist/charlswasm_decode.wasm", "charlswasm_decode.wasm"],
  ["@cornerstonejs/codec-openjpeg/dist/openjpegwasm_decode.wasm", "openjpegwasm_decode.wasm"],
  ["@cornerstonejs/codec-openjph/dist/openjphjs.wasm", "openjphjs.wasm"],
];

mkdirSync(targetDir, { recursive: true });

let copied = 0;
const skipped = [];

for (const [source, destination] of codecs) {
  // Workspace hoisting puts the codec packages in the root node_modules.
  const from = join(here, "..", "..", "node_modules", source);
  if (!existsSync(from)) {
    skipped.push(source);
    continue;
  }
  copyFileSync(from, join(targetDir, destination));
  copied += 1;
}

console.log(`[dicom-wasm] copied ${copied}/${codecs.length} decoder binaries to public/dicom-wasm`);
if (skipped.length > 0) {
  console.warn(`[dicom-wasm] skipped (not installed): ${skipped.join(", ")}`);
}

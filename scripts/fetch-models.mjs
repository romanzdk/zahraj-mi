// Downloads the homr models that homr-web expects, checks each against the SHA-256
// pinned in homr-web's manifest, and places them under <outDir>/<sha256>/<file>.
// Usage: node scripts/fetch-models.mjs [outDir=public/models]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, process.argv[2] ?? "public/models");
const cacheDir = resolve(root, process.env.MODELS_CACHE ?? "node_modules/.cache/homr-models");

const manifestPath = join(root, "node_modules/homr-web/dist/models/manifest.js");
const { ARTIFACTS } = await import(manifestPath);

// Only reachable through homr-web's opt-in WebGPU decoder catalog, which this app does not use.
const UNUSED = new Set(["decoder-396-web-fp16"]);

const HOMR = "https://github.com/liebharc/homr/releases/download/onnx_checkpoints";
const RAPIDOCR = "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx";
const HOMR_WEB = "https://github.com/jymen/homr-web/releases/download/models-homr0.7.0";

function sourceOf(file) {
  if (file === "PP-OCRv6_det_small.onnx") return { url: `${RAPIDOCR}/PP-OCRv6/det/${file}` };
  if (file === "PP-OCRv6_rec_small.onnx") return { url: `${RAPIDOCR}/PP-OCRv6/rec/${file}` };
  if (file === "ch_ppocr_mobile_v2.0_cls_mobile.onnx") return { url: `${RAPIDOCR}/PP-OCRv4/cls/${file}` };
  if (file.startsWith("tab-digits-")) return { url: `${HOMR_WEB}/${file}` };
  return { url: `${HOMR}/${file.replace(/\.onnx$/, ".zip")}`, zipped: true };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": "zahraj-mi-build" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

mkdirSync(cacheDir, { recursive: true });
let total = 0;
for (const [id, artifact] of Object.entries(ARTIFACTS)) {
  if (UNUSED.has(id)) continue;
  const [hash, file] = artifact.urlPath.split("/");
  const cached = join(cacheDir, artifact.urlPath.replace("/", "-"));
  if (!existsSync(cached) || sha256(readFileSync(cached)) !== hash) {
    const { url, zipped } = sourceOf(file);
    console.log(`fetching ${file}`);
    let bytes = await download(url);
    if (zipped) {
      const entries = unzipSync(bytes, { filter: (f) => f.name.endsWith(file) });
      const entry = Object.values(entries)[0];
      if (!entry) throw new Error(`${file} not found in ${url}`);
      bytes = entry;
    }
    const actual = sha256(bytes);
    if (actual !== hash) throw new Error(`${file}: sha256 ${actual}, expected ${hash}`);
    writeFileSync(cached, bytes);
  }
  const target = join(outDir, artifact.urlPath);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(cached, target);
  total += artifact.bytes;
}
console.log(`models ready in ${outDir}: ${(total / 1e6).toFixed(0)} MB`);

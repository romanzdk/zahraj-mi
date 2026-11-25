import { createRecognizer, type Backend, type Progress, type RecognizeResult, type Recognizer } from "homr-web";

export type RecognizeStep =
  | { kind: "starting" }
  | { kind: "retrying" }
  | { kind: "models"; loadedMb: number; totalMb: number }
  | { kind: "reading"; done: number; total: number };

export class RecognizeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: string,
  ) {
    super(message);
  }
}

const MAX_SIDE = 3000;
const RETRY_ERRORS = new Set(["worker_lost", "engine_failed", "start_failed"]);

let recognizer: { prefer: Backend; ready: Promise<Recognizer> } | null = null;
const log: string[] = [];

function note(line: string): void {
  log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  if (log.length > 40) log.shift();
}

function getRecognizer(prefer: Backend): Promise<Recognizer> {
  if (recognizer?.prefer !== prefer) {
    const previous = recognizer;
    recognizer = {
      prefer,
      ready: createRecognizer({ baseUrl: `${import.meta.env.BASE_URL}models/`, prefer }),
    };
    void previous?.ready.then((r) => r.dispose()).catch(() => undefined);
    recognizer.ready.then(
      (r) => note(`recognizer ready, backend ${r.backend}`),
      (err: unknown) => note(`recognizer failed to start: ${String(err)}`),
    );
  }
  return recognizer.ready;
}

function dropRecognizer(): void {
  const current = recognizer;
  recognizer = null;
  void current?.ready.then((r) => r.dispose()).catch(() => undefined);
}

/** Large phone photos slow the engine down without helping it, so they are scaled down first. */
async function prepare(image: Blob): Promise<ImageBitmap> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
  } catch {
    throw new RecognizeError("bad_input", "image could not be decoded", diagnostics());
  }
  note(`image ${bitmap.width}×${bitmap.height}`);
  const scale = MAX_SIDE / Math.max(bitmap.width, bitmap.height);
  if (scale >= 1) return bitmap;
  const resized = await createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * scale),
    resizeHeight: Math.round(bitmap.height * scale),
    resizeQuality: "high",
  });
  bitmap.close();
  return resized;
}

let lastStage = "";

function toStep(p: Progress): RecognizeStep {
  if (p.stage !== lastStage) {
    lastStage = p.stage;
    note(`stage ${p.stage} ${p.done}/${p.total}`);
  }
  if (p.stage === "models") {
    return { kind: "models", loadedMb: Math.round(p.done / 1e6), totalMb: Math.round(p.total / 1e6) };
  }
  if (p.stage === "staff") return { kind: "reading", done: p.done, total: p.total };
  return { kind: "starting" };
}

async function attempt(image: Blob, prefer: Backend, onStep: (step: RecognizeStep) => void): Promise<RecognizeResult> {
  let rec: Recognizer;
  try {
    rec = await getRecognizer(prefer);
  } catch (err) {
    dropRecognizer();
    return { ok: false, error: "start_failed", log: String(err) } as unknown as RecognizeResult;
  }
  const input = await prepare(image);
  const started = performance.now();
  const result = await rec.recognizePage(input, { ocr: false, onProgress: (p) => onStep(toStep(p)) });
  input.close();
  note(`recognize on ${rec.backend}: ${result.ok ? "ok" : result.error} after ${Math.round((performance.now() - started) / 1000)} s`);
  if (!result.ok) {
    const tail = result.log.trim().split("\n").slice(-6).join("\n");
    if (tail) note(tail);
    if (RETRY_ERRORS.has(result.error)) dropRecognizer();
  }
  return result;
}

/**
 * Reads the notes in an image. If the engine breaks (seen on iPhone Safari with WebGPU),
 * it tries once more with a fresh engine on WebAssembly only.
 */
export async function recognizeImage(image: Blob, onStep: (step: RecognizeStep) => void): Promise<string> {
  onStep({ kind: "starting" });
  lastStage = "";
  let result = await attempt(image, recognizer?.prefer ?? preferredBackend(), onStep);
  if (!result.ok && RETRY_ERRORS.has(result.error)) {
    onStep({ kind: "retrying" });
    result = await attempt(image, "wasm-threads", onStep);
  }
  if (!result.ok) {
    const message = result.log.trim().split("\n").at(-1) || result.error;
    throw new RecognizeError(result.error, message, diagnostics());
  }
  return result.musicXml;
}

/** `?backend=wasm` (or webgpu, wasm-threads) forces an engine, to compare them on one device. */
function preferredBackend(): Backend {
  const asked = new URLSearchParams(location.search).get("backend");
  return asked === "wasm" || asked === "wasm-threads" || asked === "webgpu" ? asked : "webgpu";
}

export function diagnostics(): string {
  const nav = navigator as Navigator & { gpu?: unknown; deviceMemory?: number };
  return [
    `app ${__APP_VERSION__}`,
    `ua ${navigator.userAgent}`,
    `crossOriginIsolated ${String(globalThis.crossOriginIsolated)}, service worker ${navigator.serviceWorker?.controller ? "controls the page" : "none"}`,
    `webgpu ${nav.gpu ? "yes" : "no"}, cores ${navigator.hardwareConcurrency ?? "?"}, memory ${nav.deviceMemory ?? "?"} GB`,
    ...log,
  ].join("\n");
}

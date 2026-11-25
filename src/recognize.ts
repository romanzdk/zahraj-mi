import { createRecognizer, type Progress, type Recognizer } from "homr-web";

export type RecognizeStep =
  | { kind: "starting" }
  | { kind: "models"; loadedMb: number; totalMb: number }
  | { kind: "reading"; done: number; total: number };

export class RecognizeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const MAX_SIDE = 3000;
let recognizer: Promise<Recognizer> | null = null;

function getRecognizer(): Promise<Recognizer> {
  if (!recognizer) {
    recognizer = createRecognizer({ baseUrl: `${import.meta.env.BASE_URL}models/` }).catch((err: unknown) => {
      recognizer = null;
      throw err;
    });
  }
  return recognizer;
}

/** Large phone photos slow the engine down without helping it, so they are scaled down first. */
async function prepare(image: Blob): Promise<Blob | ImageBitmap> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
  } catch {
    throw new RecognizeError("bad_input", "image could not be decoded");
  }
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

function toStep(p: Progress): RecognizeStep {
  if (p.stage === "models") {
    return { kind: "models", loadedMb: Math.round(p.done / 1e6), totalMb: Math.round(p.total / 1e6) };
  }
  if (p.stage === "staff") return { kind: "reading", done: p.done, total: p.total };
  return { kind: "starting" };
}

export async function recognizeImage(
  image: Blob,
  onStep: (step: RecognizeStep) => void,
  signal?: AbortSignal,
): Promise<string> {
  onStep({ kind: "starting" });
  const [rec, input] = await Promise.all([getRecognizer(), prepare(image)]);
  const result = await rec.recognizePage(input, {
    ocr: false,
    signal,
    onProgress: (p) => onStep(toStep(p)),
  });
  if (input instanceof ImageBitmap) input.close();
  if (!result.ok) {
    if (result.error === "worker_lost") {
      recognizer = null;
      void rec.dispose();
    }
    const lastLines = result.log.trim().split("\n").slice(-3).join(" ");
    throw new RecognizeError(result.error, lastLines || result.error);
  }
  return result.musicXml;
}

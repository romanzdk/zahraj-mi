// Invite-only note reading by an AI model (see worker/). Hidden unless VITE_AI_API_URL is set.
import { cropBoxes, cropScale, type Box } from "./crops";

export interface AiNote {
  pitch: string;
  duration: number;
  lyric: string;
}

export interface AiMelody {
  title: string;
  keyFifths: number;
  beats: number;
  beatType: number;
  tempo: number;
  measures: { notes: AiNote[] }[];
}

export interface AiAccess {
  name: string;
  remaining: number;
}

const API = (import.meta.env.VITE_AI_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const STORAGE_KEY = "aiCode";

export const aiEnabled = API !== "";

export function storedCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeCode(code: string | null): void {
  try {
    if (code) localStorage.setItem(STORAGE_KEY, code);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage may be blocked; the code then lasts for this page only
  }
}

/** Takes ?kod=… (or ?code=…) from an invite link, stores it and removes it from the address bar. */
export function codeFromUrl(): string | null {
  const url = new URL(location.href);
  const code = url.searchParams.get("kod") ?? url.searchParams.get("code");
  if (!code) return null;
  url.searchParams.delete("kod");
  url.searchParams.delete("code");
  history.replaceState(null, "", url);
  return code.trim();
}

export class AiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, code: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${code}`, "Content-Type": "application/json" },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new AiError(body.error ?? `http_${res.status}`, body.message ?? body.error ?? `HTTP ${res.status}`);
  return body;
}

export function checkAccess(code: string): Promise<AiAccess> {
  return call<AiAccess>("/api/me", code);
}

function toJpeg(bitmap: ImageBitmap, box: Box, scale: number): string {
  const sx = box.x * bitmap.width;
  const sy = box.y * bitmap.height;
  const sw = box.w * bitmap.width;
  const sh = box.h * bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AiError("bad_input", "canvas unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

/** The whole page (at most 2400 px) plus enlarged strips, which the model reads far better (see crops.ts). */
async function pageAndCrops(image: Blob): Promise<{ image: string; crops: string[] }> {
  const bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
  try {
    const whole = { x: 0, y: 0, w: 1, h: 1 };
    const page = toJpeg(bitmap, whole, Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height)));
    const crops = cropBoxes().map((box) => toJpeg(bitmap, box, cropScale(box.w * bitmap.width)));
    return { image: page, crops };
  } finally {
    bitmap.close();
  }
}

export async function recognizeWithAi(image: Blob, code: string): Promise<{ musicXml: string; remaining: number }> {
  const result = await call<{ melody: AiMelody; remaining: number }>("/api/recognize", code, {
    method: "POST",
    body: JSON.stringify(await pageAndCrops(image)),
  });
  return { musicXml: aiMelodyToMusicXml(result.melody), remaining: result.remaining };
}

const DIVISIONS = 24;
const TYPES: [number, string, boolean][] = [
  [4, "whole", false],
  [3, "half", true],
  [2, "half", false],
  [1.5, "quarter", true],
  [1, "quarter", false],
  [0.75, "eighth", true],
  [0.5, "eighth", false],
  [0.375, "16th", true],
  [0.25, "16th", false],
  [0.125, "32nd", false],
];

const escapeXml = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

function pitchXml(pitch: string): string {
  const m = /^([A-G])(##|#|bb|b)?(-?\d)$/.exec(pitch);
  if (!m) return "";
  const alter = { "##": 2, "#": 1, bb: -2, b: -1 }[m[2] ?? ""] ?? 0;
  return `<pitch><step>${m[1]}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${m[3]}</octave></pitch>`;
}

/** Turns the model's melody into MusicXML, so the score view and player treat it like any other score. */
export function aiMelodyToMusicXml(m: AiMelody): string {
  let continuing = false;
  const measures = m.measures.map((measure, i) => {
    const notes = measure.notes.map((n) => {
      const duration = Math.max(1, Math.round(n.duration * DIVISIONS));
      const type = TYPES.find(([q]) => Math.abs(q - n.duration) < 1e-6);
      const typeXml = type ? `<type>${type[1]}</type>${type[2] ? "<dot/>" : ""}` : "";
      if (n.pitch === "rest") return `<note><rest/><duration>${duration}</duration><voice>1</voice>${typeXml}</note>`;
      let lyricXml = "";
      const text = n.lyric.trim();
      if (text) {
        const cont = text.endsWith("-");
        const clean = cont ? text.slice(0, -1) : text;
        const syllabic = continuing ? (cont ? "middle" : "end") : cont ? "begin" : "single";
        continuing = cont;
        lyricXml = `<lyric number="1"><syllabic>${syllabic}</syllabic><text>${escapeXml(clean)}</text></lyric>`;
      }
      return `<note>${pitchXml(n.pitch)}<duration>${duration}</duration><voice>1</voice>${typeXml}${lyricXml}</note>`;
    });
    const attrs =
      i === 0
        ? `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${m.keyFifths}</fifths></key>` +
          `<time><beats>${m.beats}</beats><beat-type>${m.beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>` +
          (m.tempo > 0 ? `<sound tempo="${m.tempo}"/>` : "")
        : "";
    return `<measure number="${i + 1}">${attrs}${notes.join("")}</measure>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">${m.title ? `<work><work-title>${escapeXml(m.title)}</work-title></work>` : ""}
<part-list><score-part id="P1"><part-name print-object="no">Melodie</part-name></score-part></part-list>
<part id="P1">${measures.join("\n")}</part></score-partwise>`;
}

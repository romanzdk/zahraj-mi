/** The melody format the model must return. The web app turns it into MusicXML. */
export interface AiNote {
  /** "C4", "F#4", "Bb3" (sounding pitch, key signature already applied) or "rest". */
  pitch: string;
  /** Length in quarter notes: 1 = quarter, 0.5 = eighth, 1.5 = dotted quarter. */
  duration: number;
  /** Syllable of the first verse under this note, "" if none. */
  lyric: string;
}

export interface AiMelody {
  title: string;
  /** Sharps (positive) or flats (negative) in the key signature. */
  keyFifths: number;
  beats: number;
  beatType: number;
  /** Quarter notes per minute, 0 when the page does not say. */
  tempo: number;
  measures: { notes: AiNote[] }[];
}

export const MELODY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "keyFifths", "beats", "beatType", "tempo", "measures"],
  properties: {
    title: { type: "string" },
    keyFifths: { type: "integer" },
    beats: { type: "integer" },
    beatType: { type: "integer" },
    tempo: { type: "number" },
    measures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["notes"],
        properties: {
          notes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["pitch", "duration", "lyric"],
              properties: {
                pitch: { type: "string" },
                duration: { type: "number" },
                lyric: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const PITCH = /^([A-G])(##|#|bb|b)?(-?\d)$/;

/** Checks the model's answer and throws a readable error when it is not a usable melody. */
export function validateMelody(value: unknown): AiMelody {
  const m = value as AiMelody;
  if (!m || typeof m !== "object" || !Array.isArray(m.measures)) throw new Error("answer has no measures");
  if (!Number.isInteger(m.keyFifths) || Math.abs(m.keyFifths) > 7) throw new Error(`bad key signature ${m.keyFifths}`);
  if (!Number.isInteger(m.beats) || m.beats < 1 || m.beats > 16) throw new Error(`bad time signature ${m.beats}`);
  if (![1, 2, 4, 8, 16].includes(m.beatType)) throw new Error(`bad time signature /${m.beatType}`);
  let notes = 0;
  for (const [i, measure] of m.measures.entries()) {
    if (!Array.isArray(measure?.notes)) throw new Error(`measure ${i + 1} has no notes`);
    for (const n of measure.notes) {
      if (n.pitch !== "rest" && !PITCH.test(n.pitch)) throw new Error(`measure ${i + 1}: bad pitch "${n.pitch}"`);
      if (!(typeof n.duration === "number" && n.duration > 0 && n.duration <= 8)) {
        throw new Error(`measure ${i + 1}: bad duration ${n.duration}`);
      }
      if (n.pitch !== "rest") notes++;
    }
  }
  if (notes === 0) throw new Error("no notes found");
  return { ...m, title: String(m.title ?? ""), tempo: m.tempo > 0 && m.tempo < 400 ? m.tempo : 0 };
}

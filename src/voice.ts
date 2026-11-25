import { melodyRange, type MelodyNote } from "./melody";

export interface VoiceType {
  id: string;
  low: number;
  high: number;
}

/** Comfortable singing ranges (MIDI note numbers), deliberately a bit narrower than the full range. */
export const VOICES: VoiceType[] = [
  { id: "bass", low: 41, high: 62 }, // F2–D4
  { id: "tenor", low: 48, high: 67 }, // C3–G4
  { id: "alto", low: 55, high: 74 }, // G3–D5
  { id: "soprano", low: 60, high: 79 }, // C4–G5
  { id: "child", low: 60, high: 74 }, // C4–D5
];

/**
 * Finds the transposition (in semitones) that best fits the melody into the voice range:
 * least overflow first, then the most centred, then the smallest shift.
 */
export function fitToVoice(notes: MelodyNote[], voice: VoiceType): number {
  const range = melodyRange(notes);
  if (!range) return 0;
  const voiceMid = (voice.low + voice.high) / 2;
  let best = 0;
  let bestScore = [Infinity, Infinity, Infinity];
  for (let shift = -24; shift <= 24; shift++) {
    const low = range.low + shift;
    const high = range.high + shift;
    const overflow = Math.max(0, voice.low - low) + Math.max(0, high - voice.high);
    const offCentre = Math.abs((low + high) / 2 - voiceMid);
    const score = [overflow, Math.round(offCentre), Math.abs(shift)];
    if (lexLess(score, bestScore)) {
      bestScore = score;
      best = shift;
    }
  }
  return best;
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

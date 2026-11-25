export interface MelodyNote {
  midi: number;
  /** Start in quarter notes from the beginning of the piece. */
  start: number;
  /** Length in quarter notes. */
  duration: number;
  /** 0-based measure index. */
  measure: number;
}

export interface Melody {
  title: string;
  notes: MelodyNote[];
  /** Quarter notes per minute. */
  tempo: number;
  beatsPerMeasure: number;
  beatType: number;
  measureCount: number;
  /** Start of every measure in quarter notes. */
  measureStarts: number[];
}

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

export const DEFAULT_TEMPO = 90;

export function midiToName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function child(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return null;
}

function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name);
}

function num(el: Element | null, fallback: number): number {
  const v = el?.textContent ? Number(el.textContent.trim()) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

function pitchToMidi(pitch: Element): number | null {
  const step = child(pitch, "step")?.textContent?.trim().toUpperCase() ?? "";
  if (!(step in STEPS)) return null;
  const octave = num(child(pitch, "octave"), 4);
  const alter = num(child(pitch, "alter"), 0);
  return (octave + 1) * 12 + STEPS[step] + Math.round(alter);
}

interface RawNote {
  midi: number;
  start: number;
  duration: number;
  measure: number;
  tieStart: boolean;
  tieStop: boolean;
}

/**
 * Turns a MusicXML (score-partwise) document into a single melody line:
 * the first part, the first voice found in it, and the highest note of every chord.
 */
export function parseMusicXml(xml: string): Melody {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Soubor není platný MusicXML.");
  }
  const root = doc.documentElement;
  if (root.localName === "score-timewise") {
    throw new Error("MusicXML ve formátu score-timewise zatím nepodporujeme.");
  }
  const part = root.getElementsByTagName("part")[0];
  if (!part) throw new Error("V souboru nejsou žádné noty.");

  const title =
    root.getElementsByTagName("work-title")[0]?.textContent?.trim() ||
    root.getElementsByTagName("movement-title")[0]?.textContent?.trim() ||
    "";

  let divisions = 1;
  let tempo: number | null = null;
  let beatsPerMeasure = 4;
  let beatType = 4;
  let timeSeen = false;
  let melodyVoice: string | null = null;
  let measureStart = 0;
  const measureStarts: number[] = [];
  const raw: RawNote[] = [];

  const measures = children(part, "measure");
  measures.forEach((measure, mIndex) => {
    measureStarts.push(measureStart);
    let pos = 0;
    let measureLength = 0;
    let lastNoteStart = 0;

    for (const el of Array.from(measure.children)) {
      switch (el.localName) {
        case "attributes": {
          divisions = num(child(el, "divisions"), divisions) || 1;
          const time = child(el, "time");
          if (time && !timeSeen) {
            beatsPerMeasure = num(child(time, "beats"), 4);
            beatType = num(child(time, "beat-type"), 4);
            timeSeen = true;
          }
          break;
        }
        case "direction":
        case "sound": {
          const sound = el.localName === "sound" ? el : el.getElementsByTagName("sound")[0];
          const t = sound?.getAttribute("tempo");
          if (tempo === null && t && Number(t) > 0) tempo = Number(t);
          const perMinute = el.getElementsByTagName("per-minute")[0];
          if (tempo === null && perMinute) {
            const bpm = num(perMinute, NaN);
            const unit = el.getElementsByTagName("beat-unit")[0]?.textContent?.trim();
            const factor = unit === "half" ? 2 : unit === "eighth" ? 0.5 : 1;
            if (bpm > 0) tempo = bpm * factor;
          }
          break;
        }
        case "backup":
          pos -= num(child(el, "duration"), 0) / divisions;
          break;
        case "forward":
          pos += num(child(el, "duration"), 0) / divisions;
          measureLength = Math.max(measureLength, pos);
          break;
        case "note": {
          if (child(el, "grace") || child(el, "cue")) break;
          const isChord = child(el, "chord") !== null;
          const duration = num(child(el, "duration"), 0) / divisions;
          const start = isChord ? lastNoteStart : pos;
          if (!isChord) {
            lastNoteStart = pos;
            pos += duration;
            measureLength = Math.max(measureLength, pos);
          }
          const voice = child(el, "voice")?.textContent?.trim() ?? "1";
          const pitch = child(el, "pitch");
          if (!pitch || child(el, "rest")) break;
          if (melodyVoice === null) melodyVoice = voice;
          if (voice !== melodyVoice) break;
          const midi = pitchToMidi(pitch);
          if (midi === null || duration <= 0) break;
          const ties = children(el, "tie").map((t) => t.getAttribute("type"));
          raw.push({
            midi,
            start: measureStart + start,
            duration,
            measure: mIndex,
            tieStart: ties.includes("start"),
            tieStop: ties.includes("stop"),
          });
          break;
        }
      }
    }
    const expected = (beatsPerMeasure * 4) / beatType;
    measureStart += measureLength > 0 ? measureLength : expected;
  });

  return {
    title,
    notes: toMelodyLine(raw),
    tempo: tempo ?? DEFAULT_TEMPO,
    beatsPerMeasure,
    beatType,
    measureCount: measures.length,
    measureStarts,
  };
}

function toMelodyLine(raw: RawNote[]): MelodyNote[] {
  const byStart = new Map<number, RawNote>();
  for (const n of raw) {
    const key = Math.round(n.start * 1000);
    const prev = byStart.get(key);
    if (!prev || n.midi > prev.midi) byStart.set(key, n);
  }
  const sorted = [...byStart.values()].sort((a, b) => a.start - b.start);

  const out: MelodyNote[] = [];
  let open: (MelodyNote & { tieStart: boolean }) | null = null;
  for (const n of sorted) {
    const continuesTie =
      open !== null && open.tieStart && n.tieStop && n.midi === open.midi &&
      Math.abs(open.start + open.duration - n.start) < 1e-6;
    if (continuesTie && open) {
      open.duration += n.duration;
      open.tieStart = n.tieStart;
      continue;
    }
    if (open) out.push(strip(open));
    open = { midi: n.midi, start: n.start, duration: n.duration, measure: n.measure, tieStart: n.tieStart };
  }
  if (open) out.push(strip(open));

  for (let i = 0; i < out.length - 1; i++) {
    const gap = out[i + 1].start - out[i].start;
    if (out[i].duration > gap) out[i].duration = gap;
  }
  return out;
}

function strip(n: MelodyNote & { tieStart: boolean }): MelodyNote {
  return { midi: n.midi, start: n.start, duration: n.duration, measure: n.measure };
}

export function melodyRange(notes: MelodyNote[]): { low: number; high: number } | null {
  if (notes.length === 0) return null;
  let low = Infinity;
  let high = -Infinity;
  for (const n of notes) {
    low = Math.min(low, n.midi);
    high = Math.max(high, n.midi);
  }
  return { low, high };
}

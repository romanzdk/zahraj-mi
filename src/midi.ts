import type { Melody } from "./melody";

const PPQ = 480;

function varLen(value: number): number[] {
  const bytes = [value & 0x7f];
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** Writes the melody as a single-track Standard MIDI File (format 0). */
export function melodyToMidi(melody: Melody, transpose = 0, tempo = melody.tempo): Uint8Array<ArrayBuffer> {
  const events: { tick: number; order: number; data: number[] }[] = [];
  const usPerQuarter = Math.round(60_000_000 / tempo);
  events.push({ tick: 0, order: 0, data: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff] });
  const denomPow = Math.round(Math.log2(melody.beatType));
  events.push({ tick: 0, order: 0, data: [0xff, 0x58, 0x04, melody.beatsPerMeasure, denomPow, 24, 8] });
  for (const n of melody.notes) {
    const key = Math.min(127, Math.max(0, n.midi + transpose));
    const on = Math.round(n.start * PPQ);
    const off = Math.max(on + 1, Math.round((n.start + n.duration) * PPQ));
    events.push({ tick: on, order: 2, data: [0x90, key, 90] });
    events.push({ tick: off, order: 1, data: [0x80, key, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  let last = 0;
  for (const e of events) {
    track.push(...varLen(e.tick - last), ...e.data);
    last = e.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff];
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, ...u32(track.length)];
  return new Uint8Array([...header, ...trackHeader, ...track]);
}

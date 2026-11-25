// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { guessTime, loopEnd, melodyRange, midiToName, parseMusicXml } from "./melody";
import { melodyToMidi } from "./midi";
import { fitToVoice, VOICES } from "./voice";

function score(measures: string, header = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  ${header}
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`;
}

const note = (step: string, octave: number, duration: number) =>
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice></note>`;

describe("parseMusicXml", () => {
  it("reads pitches, timing, time signature and tempo", () => {
    const xml = score(
      `<measure number="1">
        <attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
        <direction><sound tempo="120"/></direction>
        ${note("C", 4, 2)}${note("E", 4, 2)}${note("G", 4, 2)}
      </measure>
      <measure number="2">
        <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
        <note><rest/><duration>2</duration><voice>1</voice></note>
      </measure>`,
      `<work><work-title>Test</work-title></work>`,
    );
    const m = parseMusicXml(xml);
    expect(m.title).toBe("Test");
    expect(m.tempo).toBe(120);
    expect(m.beatsPerMeasure).toBe(3);
    expect(m.beatType).toBe(4);
    expect(m.measureCount).toBe(2);
    expect(m.measureStarts).toEqual([0, 3]);
    expect(m.length).toBe(6);
    expect(m.notes.map((n) => n.midi)).toEqual([60, 64, 67, 66]);
    expect(m.notes.map((n) => n.start)).toEqual([0, 1, 2, 3]);
    expect(m.notes[3].duration).toBe(2);
    expect(m.notes[3].measure).toBe(1);
  });

  it("keeps the top note of chords and only the first voice", () => {
    const xml = score(
      `<measure number="1">
        <attributes><divisions>1</divisions></attributes>
        ${note("C", 4, 4)}
        <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
        <backup><duration>4</duration></backup>
        <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice></note>
      </measure>`,
    );
    expect(parseMusicXml(xml).notes.map((n) => n.midi)).toEqual([64]);
  });

  it("merges tied notes and ignores grace notes", () => {
    const xml = score(
      `<measure number="1">
        <attributes><divisions>1</divisions></attributes>
        <note><grace/><pitch><step>B</step><octave>3</octave></pitch><voice>1</voice></note>
        <note><rest/><duration>2</duration><voice>1</voice></note>
        <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><tie type="start"/><voice>1</voice></note>
      </measure>
      <measure number="2">
        <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><tie type="stop"/><voice>1</voice></note>
        ${note("A", 4, 3)}
      </measure>`,
    );
    const m = parseMusicXml(xml);
    expect(m.notes).toEqual([
      { midi: 74, start: 2, duration: 3, measure: 0 },
      { midi: 69, start: 5, duration: 3, measure: 1 },
    ]);
    expect(m.tempo).toBe(90);
  });

  it("guesses a missing time signature from the measure lengths", () => {
    const m3 = `<measure>${note("C", 4, 1)}${note("D", 4, 1)}${note("E", 4, 1)}</measure>`;
    const xml = score(`<measure><attributes><divisions>1</divisions></attributes>${note("C", 4, 1)}${note("D", 4, 2)}</measure>${m3}${m3}`);
    const m = parseMusicXml(xml);
    expect([m.beatsPerMeasure, m.beatType, m.timeGuessed]).toEqual([3, 4, true]);
  });

  it("rejects invalid input", () => {
    expect(() => parseMusicXml("<not-xml")).toThrow();
    expect(() => parseMusicXml("<score-partwise/>")).toThrow();
  });
});

describe("helpers", () => {
  it("turns measure lengths into a time signature", () => {
    expect(guessTime([3, 3, 1.5, 3])).toEqual([3, 4]);
    expect(guessTime([2.5, 2.5])).toEqual([5, 8]);
    expect(guessTime([])).toBeNull();
  });

  it("ends a loop with the written rests, but at least one beat after the last note", () => {
    const n = (start: number, duration: number) => ({ midi: 60, start, duration, measure: 0 });
    expect(loopEnd([n(0, 2), n(2, 2), n(4, 2)], 0, 8, 1)).toBe(8);
    expect(loopEnd([n(0, 4), n(4, 4)], 0, 8, 1)).toBe(9);
    expect(loopEnd([n(0, 4), n(4, 3.5)], 0, 8, 1)).toBe(8.5);
    expect(loopEnd([n(0, 4), n(4, 8)], 0, 8, 1)).toBe(9);
    expect(loopEnd([n(0, 4), n(4, 2), n(8, 4)], 4, 8, 1)).toBe(8);
  });

  it("names notes", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(70)).toBe("B♭4");
  });

  it("fits a high melody into a bass range", () => {
    const notes = [72, 76, 79, 84].map((midi, i) => ({ midi, start: i, duration: 1, measure: 0 }));
    const bass = VOICES.find((v) => v.id === "bass")!;
    const shift = fitToVoice(notes, bass);
    const range = melodyRange(notes.map((n) => ({ ...n, midi: n.midi + shift })))!;
    expect(range.low).toBeGreaterThanOrEqual(bass.low);
    expect(range.high).toBeLessThanOrEqual(bass.high);
  });

  it("writes a valid MIDI header", () => {
    const xml = score(`<measure number="1"><attributes><divisions>1</divisions></attributes>${note("C", 4, 4)}</measure>`);
    const bytes = melodyToMidi(parseMusicXml(xml), 2);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd");
    expect(Array.from(bytes)).toContain(62);
  });
});

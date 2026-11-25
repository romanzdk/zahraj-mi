// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { aiMelodyToMusicXml, type AiMelody } from "./ai";
import { cropBoxes, cropScale } from "./crops";
import { parseMusicXml } from "./melody";

const melody: AiMelody = {
  title: "Vánoční <test>",
  keyFifths: -1,
  beats: 3,
  beatType: 4,
  tempo: 96,
  measures: [
    {
      notes: [
        { pitch: "E4", duration: 1, lyric: "Vdál-" },
        { pitch: "E4", duration: 0.5, lyric: "ce" },
        { pitch: "F#4", duration: 0.5, lyric: "stro-" },
        { pitch: "Bb4", duration: 0.5, lyric: "me-" },
        { pitch: "G4", duration: 0.5, lyric: "ček" },
      ],
    },
    { notes: [{ pitch: "B4", duration: 1.5, lyric: "zá-" }, { pitch: "A4", duration: 1.5, lyric: "ří" }] },
    { notes: [{ pitch: "C4", duration: 1, lyric: "nám." }, { pitch: "rest", duration: 2, lyric: "" }] },
  ],
};

describe("aiMelodyToMusicXml", () => {
  it("round-trips through the MusicXML reader", () => {
    const xml = aiMelodyToMusicXml(melody);
    const m = parseMusicXml(xml);
    expect(m.title).toBe("Vánoční <test>");
    expect([m.beatsPerMeasure, m.beatType, m.tempo, m.timeGuessed]).toEqual([3, 4, 96, false]);
    expect(m.notes.map((n) => n.midi)).toEqual([64, 64, 66, 70, 67, 71, 69, 60]);
    expect(m.notes.map((n) => n.duration)).toEqual([1, 0.5, 0.5, 0.5, 0.5, 1.5, 1.5, 1]);
    expect(m.length).toBe(9);
  });

  it("writes hyphenated lyrics and dotted note types", () => {
    const xml = aiMelodyToMusicXml(melody);
    expect(xml).toContain("<syllabic>begin</syllabic><text>Vdál</text>");
    expect(xml).toContain("<syllabic>middle</syllabic><text>me</text>");
    expect(xml).toContain("<type>quarter</type><dot/>");
    expect(xml).toContain("<alter>-1</alter>");
  });
});

describe("crops", () => {
  it("covers the whole page with overlapping strips", () => {
    const boxes = cropBoxes();
    expect(boxes).toHaveLength(6);
    expect(boxes[0].y).toBe(0);
    expect(boxes.at(-1)!.y + boxes.at(-1)!.h).toBeCloseTo(1);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].y).toBeLessThan(boxes[i - 1].y + boxes[i - 1].h);
  });

  it("enlarges small crops up to 4x and never shrinks", () => {
    expect(cropScale(464)).toBeCloseTo(1600 / 464);
    expect(cropScale(200)).toBe(4);
    expect(cropScale(3000)).toBe(1);
  });
});

// Generates the demo song (Ode to Joy, public domain) as MusicXML and a rendered PNG.
// The PNG doubles as the end-to-end test image. Run: npm run make-demo
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";

const FONT_URL = "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSerif/hinted/ttf/NotoSerif-Regular.ttf";
const outDir = new URL("../public/demo/", import.meta.url);
mkdirSync(outDir, { recursive: true });

// "pitch quarters syllable"; a trailing "-" means the word goes on
const lines = [
  ["B4 1 Freu-", "B4 1 de", "C5 1 schö-", "D5 1 ner", "D5 1 Göt-", "C5 1 ter-", "B4 1 fun-", "A4 1 ken,", "G4 1 Toch-", "G4 1 ter", "A4 1 aus", "B4 1 E-", "B4 1.5 ly-", "A4 0.5 si-", "A4 2 um,"],
  ["B4 1 Wir", "B4 1 be-", "C5 1 tre-", "D5 1 ten", "D5 1 feu-", "C5 1 er-", "B4 1 trun-", "A4 1 ken,", "G4 1 Himm-", "G4 1 li-", "A4 1 sche,", "B4 1 dein", "A4 1.5 Hei-", "G4 0.5 lig-", "G4 2 tum!"],
];

const TYPES = { 0.5: ["eighth", false], 1: ["quarter", false], 1.5: ["quarter", true], 2: ["half", false] };
const DIVISIONS = 2;

const notes = lines.flat().map((s, i, all) => {
  const [pitch, q, lyric] = s.split(" ");
  const afterHyphen = i > 0 && all[i - 1].endsWith("-");
  return { step: pitch[0], octave: Number(pitch.slice(1)), quarters: Number(q), lyric, afterHyphen };
});

const measures = [];
let current = [];
let filled = 0;
for (const n of notes) {
  current.push(n);
  filled += n.quarters;
  if (filled >= 4) {
    measures.push(current);
    current = [];
    filled = 0;
  }
}

const noteXml = (n) => {
  const [type, dot] = TYPES[n.quarters];
  const continues = n.lyric.endsWith("-");
  const text = continues ? n.lyric.slice(0, -1) : n.lyric;
  const syllabic = n.afterHyphen ? (continues ? "middle" : "end") : continues ? "begin" : "single";
  return `      <note>
        <pitch><step>${n.step}</step><octave>${n.octave}</octave></pitch>
        <duration>${n.quarters * DIVISIONS}</duration>
        <voice>1</voice>
        <type>${type}</type>${dot ? "\n        <dot/>" : ""}
        <lyric number="1"><syllabic>${syllabic}</syllabic><text>${text}</text></lyric>
      </note>`;
};

const measureXml = measures
  .map((m, i) => {
    const attrs =
      i === 0
        ? `      <attributes>
        <divisions>${DIVISIONS}</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <sound tempo="100"/>
`
        : "";
    const barline = i === measures.length - 1 ? `\n      <barline location="right"><bar-style>light-heavy</bar-style></barline>` : "";
    return `    <measure number="${i + 1}">
${attrs}${m.map(noteXml).join("\n")}${barline}
    </measure>`;
  })
  .join("\n");

const musicXml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Óda na radost</work-title></work>
  <identification><creator type="composer">Ludwig van Beethoven</creator></identification>
  <part-list><score-part id="P1"><part-name print-object="no">Melodie</part-name></score-part></part-list>
  <part id="P1">
${measureXml}
  </part>
</score-partwise>
`;

writeFileSync(new URL("oda-na-radost.musicxml", outDir), musicXml);

const VerovioModule = await createVerovioModule();
const tk = new VerovioToolkit(VerovioModule);
tk.setOptions({ pageWidth: 2100, pageHeight: 1200, scale: 60, adjustPageHeight: true, footer: "none", header: "none", breaks: "auto" });
tk.loadData(musicXml);
const svg = tk.renderToSVG(1);
const fontPath = new URL("../node_modules/.cache/NotoSerif-Regular.ttf", import.meta.url);
if (!existsSync(fontPath)) {
  mkdirSync(new URL(".", fontPath), { recursive: true });
  const res = await fetch(FONT_URL);
  if (!res.ok) throw new Error(`font download failed: ${res.status}`);
  writeFileSync(fontPath, Buffer.from(await res.arrayBuffer()));
}
const png = new Resvg(svg, {
  background: "white",
  fitTo: { mode: "width", value: 1600 },
  font: { fontFiles: [fontPath.pathname], loadSystemFonts: false, defaultFontFamily: "Noto Serif", serifFamily: "Noto Serif" },
})
  .render()
  .asPng();
writeFileSync(new URL("oda-na-radost.png", outDir), png);
console.log(`demo written: ${notes.length} notes, ${measures.length} measures, png ${png.length} bytes`);

// Measures AI note reading on a folder of photos, sending the same page + enlarged parts the app sends.
// OPENROUTER_API_KEY=... node scripts/eval.ts <dir> [model,model,...] [outDir]
// <dir> holds images and optional <name>.txt files with the expected MIDI pitches.
// Needs `npm ci` in the repository root too (for the image cropping).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, extname, join } from "node:path";
import { cropBoxes, cropScale } from "../../src/crops.ts";
import { similarity } from "../../e2e/similarity.ts";
import { recognizeWithModel } from "../src/openrouter.ts";

const { Resvg } = createRequire(new URL("../../package.json", import.meta.url).pathname)("@resvg/resvg-js");

const [dir, modelList = "anthropic/claude-opus-5.5", outDir = "eval-results"] = process.argv.slice(2);
const key = process.env.OPENROUTER_API_KEY;
if (!dir || !key) {
  console.error("Usage: OPENROUTER_API_KEY=... node scripts/eval.ts <dir> [models] [outDir]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

function size(bytes: Buffer): { width: number; height: number } {
  if (bytes.readUInt32BE(0) === 0x89504e47) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  for (let i = 2; i < bytes.length; ) {
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
    i += 2 + length;
  }
  throw new Error("unknown image size");
}

function crops(bytes: Buffer, mime: string): string[] {
  const { width, height } = size(bytes);
  const href = `data:${mime};base64,${bytes.toString("base64")}`;
  return cropBoxes().map((b) => {
    const [x, y, w, h] = [b.x * width, b.y * height, b.w * width, b.h * height];
    const scale = cropScale(w);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w * scale}" height="${h * scale}"><image href="${href}" width="${width}" height="${height}"/></svg>`;
    const png = new Resvg(svg, { background: "white", fitTo: { mode: "width", value: Math.round(w * scale) } }).render().asPng();
    return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  });
}

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ALTER: Record<string, number> = { "##": 2, "#": 1, bb: -2, b: -1, "": 0 };
const toMidi = (p: string) => {
  const m = /^([A-G])(##|#|bb|b)?(-?\d)$/.exec(p)!;
  return (Number(m[3]) + 1) * 12 + STEPS[m[1]] + ALTER[m[2] ?? ""];
};

const images = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const table = ["| model | image | parts | notes | similarity | cost $ | seconds | error |", "|---|---|---|---|---|---|---|---|"];
for (const model of modelList.split(",")) {
  let totalCost = 0;
  for (const file of images) {
    const name = basename(file, extname(file));
    const mime = extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
    const bytes = readFileSync(join(dir, file));
    const parts = crops(bytes, mime);
    const label = String(parts.length);
    try {
      const r = await recognizeWithModel(key, model, `data:${mime};base64,${bytes.toString("base64")}`, parts, "https://github.com/romanzdk/zahraj-mi");
      const got = r.melody.measures.flatMap((m) => m.notes).filter((n) => n.pitch !== "rest").map((n) => toMidi(n.pitch));
      const truthFile = join(dir, `${name}.txt`);
      const sim = existsSync(truthFile)
        ? similarity(got, readFileSync(truthFile, "utf8").trim().split(/\s+/).map(Number))
        : null;
      totalCost += r.costUsd ?? 0;
      writeFileSync(join(outDir, `${model.replace(/\W+/g, "_")}--${name}.json`), JSON.stringify(r, null, 2));
      table.push(`| ${model} | ${file} | ${label} | ${got.length} | ${sim === null ? "" : sim.toFixed(3)} | ${r.costUsd?.toFixed(4) ?? "?"} | ${r.seconds} | |`);
    } catch (err) {
      table.push(`| ${model} | ${file} | ${label} | | | | | ${String(err).slice(0, 120)} |`);
    }
    console.log(table.at(-1));
  }
  console.log(`${model}: total cost $${totalCost.toFixed(4)}`);
}
writeFileSync(join(outDir, "summary.md"), table.join("\n") + "\n");

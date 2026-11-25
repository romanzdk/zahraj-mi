// Runs the real recognizer on a folder of your own sheet music photos and writes a report.
// REALWORLD_DIR=/path/to/images npm run test:realworld
// Optional ground truth: <image name>.txt next to the image, with the expected MIDI pitches
// separated by spaces. The report lands in test-results/realworld/.
import { mkdirSync, readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { similarity } from "./similarity";

const dir = process.env.REALWORLD_DIR;
const outDir = "test-results/realworld";
const images = dir ? readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort() : [];

test.describe("real-world images", () => {
  test.skip(!dir, "set REALWORLD_DIR to run");
  test.describe.configure({ mode: "serial" });

  const summary: Record<string, unknown>[] = [];
  test.afterAll(() => {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
    const lines = summary.map((s) => `| ${s.image} | ${s.ok ? "yes" : "no"} | ${s.notes ?? ""} | ${s.similarity ?? ""} | ${s.seconds} | ${s.status ?? ""} |`);
    writeFileSync(
      join(outDir, "summary.md"),
      ["| image | notes found | count | similarity | seconds | status |", "|---|---|---|---|---|---|", ...lines].join("\n") + "\n",
    );
  });

  for (const file of images) {
    test(file, async ({ page }) => {
      test.setTimeout(10 * 60_000);
      const name = basename(file, extname(file));
      mkdirSync(outDir, { recursive: true });
      await page.goto("./");
      const started = Date.now();
      await page.locator("#file-input").setInputFiles(join(dir!, file));
      const done = page.locator("#player-card:not([hidden]), #status.error");
      await expect(done.first()).toBeVisible({ timeout: 9 * 60_000 });
      const seconds = Math.round((Date.now() - started) / 1000);
      const ok = await page.locator("#player-card").isVisible();
      const entry: Record<string, unknown> = { image: file, ok, seconds };
      if (ok) {
        const raw = (await page.locator("#player-card").getAttribute("data-pitches")) ?? "";
        const got = raw.split(",").filter(Boolean).map(Number);
        entry.notes = got.length;
        entry.pitches = got;
        const truthFile = join(dir!, `${name}.txt`);
        if (existsSync(truthFile)) {
          const truth = readFileSync(truthFile, "utf8").trim().split(/\s+/).map(Number);
          entry.similarity = Number(similarity(got, truth).toFixed(3));
        }
        const download = page.waitForEvent("download");
        await page.locator("#download-xml").click();
        await (await download).saveAs(join(outDir, `${name}.musicxml`));
        await page.locator("#score").screenshot({ path: join(outDir, `${name}-score.png`) });
      } else {
        entry.status = await page.locator("#status-text").textContent();
      }
      summary.push(entry);
      console.log(JSON.stringify(entry));
    });
  }
});

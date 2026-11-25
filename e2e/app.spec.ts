import { expect, test, type Page } from "@playwright/test";

// Ode to Joy as written in public/demo/oda-na-radost.musicxml.
const EXPECTED = [
  71, 71, 72, 74, 74, 72, 71, 69, 67, 67, 69, 71, 71, 69, 69,
  71, 71, 72, 74, 74, 72, 71, 69, 67, 67, 69, 71, 69, 67, 67,
];

function similarity(a: number[], b: number[]): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

async function pitches(page: Page): Promise<number[]> {
  const raw = await page.locator("#player-card").getAttribute("data-pitches");
  return (raw ?? "").split(",").filter(Boolean).map(Number);
}

test("demo song loads and plays", async ({ page }) => {
  await page.goto("./");
  await page.locator("[data-lang=cs]").click();
  await expect(page.locator("h1")).toHaveText("Zahraj mi");
  await page.locator("#demo-button").click();
  await expect(page.locator("#player-card")).toBeVisible();
  await expect(page.locator("#melody-info")).toContainText("30 not");
  await expect(page.locator("#score svg").first()).toBeVisible();
  expect(await pitches(page)).toEqual(EXPECTED);

  await page.screenshot({ path: "test-results/screenshots/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/screenshots/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.locator("#voice").selectOption("bass");
  await expect(page.locator("#transpose-value")).not.toHaveText("0");

  await page.locator("#play-button").click();
  await expect(page.locator("#play-button")).toHaveText("Zastavit");
  await page.locator("#play-button").click();
  await expect(page.locator("#play-button")).toHaveText("Přehrát");
});

test("recognizes notes from the demo image in the browser", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[browser] ${msg.text()}`);
  });
  await page.goto("./");
  await page.locator("#file-input").setInputFiles("public/demo/oda-na-radost.png");
  await expect(page.locator("#player-card")).toBeVisible({ timeout: 9 * 60_000 });
  await page.screenshot({ path: "test-results/screenshots/recognized.png", fullPage: true });
  const got = await pitches(page);
  const score = similarity(got, EXPECTED);
  console.log(`recognized ${got.length} notes, similarity ${score.toFixed(3)}: ${got.join(" ")}`);
  expect(score).toBeGreaterThanOrEqual(0.9);
});

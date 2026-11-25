import { expect, test, type Page } from "@playwright/test";
import { similarity } from "./similarity";

// Ode to Joy as written in public/demo/oda-na-radost.musicxml.
const EXPECTED = [
  71, 71, 72, 74, 74, 72, 71, 69, 67, 67, 69, 71, 71, 69, 69,
  71, 71, 72, 74, 74, 72, 71, 69, 67, 67, 69, 71, 69, 67, 67,
];

/** Opens the app and, where coi-serviceworker has to reload the page first, waits for that reload. */
async function open(page: Page): Promise<void> {
  await page.goto("./");
  await page.waitForFunction(() => crossOriginIsolated || navigator.serviceWorker?.controller != null, null, { timeout: 20_000 }).catch(() => undefined);
  await page.waitForLoadState("load");
  console.log(`crossOriginIsolated ${await page.evaluate(() => crossOriginIsolated)}`);
}

async function pitches(page: Page): Promise<number[]> {
  const raw = await page.locator("#player-card").getAttribute("data-pitches");
  return (raw ?? "").split(",").filter(Boolean).map(Number);
}

test("demo song loads and plays", async ({ page }) => {
  await open(page);
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
  await open(page);
  await page.locator("#file-input").setInputFiles("public/demo/oda-na-radost.png");
  await expect(page.locator("#player-card:not([hidden]), #status.error").first()).toBeVisible({ timeout: 9 * 60_000 });
  if (await page.locator("#status.error").isVisible()) {
    throw new Error(`${await page.locator("#status-text").textContent()}\n${await page.locator("#status-log").textContent()}`);
  }
  await page.screenshot({ path: "test-results/screenshots/recognized.png", fullPage: true });
  const got = await pitches(page);
  const score = similarity(got, EXPECTED);
  console.log(`recognized ${got.length} notes, similarity ${score.toFixed(3)}: ${got.join(" ")}`);
  expect(score).toBeGreaterThanOrEqual(0.9);
});

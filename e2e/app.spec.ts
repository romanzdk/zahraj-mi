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
  const coiActive = await page.evaluate(() => "chrome" in window || "netscape" in window);
  if (coiActive) {
    await page.waitForFunction(() => crossOriginIsolated || navigator.serviceWorker?.controller != null, null, { timeout: 20_000 }).catch(() => undefined);
  }
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

test("tells the user when the page reloaded during recognition", async ({ page }) => {
  await open(page);
  await page.evaluate(() => sessionStorage.setItem("zahraj-mi.recognition", "last step models\ntest"));
  await page.reload();
  await expect(page.locator("#status.error")).toBeVisible();
  await expect(page.locator("#status-log")).toHaveText(/last step models/);
  await page.reload();
  await expect(page.locator("#status")).toBeHidden();
});

test("theme and language switches stick after reload", async ({ page }) => {
  await open(page);
  await page.locator("[data-theme-choice=dark]").click();
  await page.locator("[data-lang=en]").click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("[data-theme-choice=dark]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cta .btn")).toHaveText("Contact me");
  await expect(page.locator(".cta .btn")).toHaveAttribute("href", /^mailto:romanzdk@gmail\.com/);

  await page.locator("[data-theme-choice=light]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("[data-theme-choice=system]").click();
  await expect(page.locator("[data-theme-choice=system]")).toHaveAttribute("aria-pressed", "true");
});

test("stop stays on screen while the score scrolls with the music", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator("#demo-button").click();
  await page.locator("#score svg").first().waitFor();
  await page.locator("#tempo").fill("220");
  await page.locator("#play-button").click();
  await page.waitForFunction(() => scrollY > 300);
  await expect(page.locator("#play-button")).toBeInViewport();
  await page.locator("#play-button").click();
  await expect(page.locator("#play-button")).not.toHaveClass(/playing/);
});

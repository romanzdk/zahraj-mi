// Invite-only AI reading, against a mocked Worker. Needs a build with VITE_AI_API_URL=https://ai.invalid.
import { expect, test } from "@playwright/test";

test.skip(!process.env.AI_E2E, "set AI_E2E=1 with a build that has VITE_AI_API_URL=https://ai.invalid");

const melody = {
  title: "Test",
  keyFifths: 0,
  beats: 3,
  beatType: 4,
  tempo: 100,
  measures: [
    { notes: [{ pitch: "E4", duration: 1, lyric: "Vdál-" }, { pitch: "E4", duration: 0.5, lyric: "ce" }, { pitch: "E4", duration: 0.5, lyric: "stro-" }, { pitch: "F4", duration: 0.5, lyric: "me-" }, { pitch: "G4", duration: 0.5, lyric: "ček" }] },
    { notes: [{ pitch: "B4", duration: 1.5, lyric: "zá-" }, { pitch: "A4", duration: 1.5, lyric: "ří" }] },
  ],
};

test("invite link turns on AI reading and its result plays", async ({ page }) => {
  const seen: string[] = [];
  await page.route("https://ai.invalid/api/me", (route) => {
    seen.push(route.request().headers()["authorization"] ?? "");
    return route.fulfill({ json: { name: "Jana", remaining: 5 } });
  });
  await page.route("https://ai.invalid/api/recognize", (route) =>
    route.fulfill({ json: { melody, model: "test", costUsd: 0.01, seconds: 1, remaining: 4 } }),
  );

  await page.goto("./?kod=test-code-123");
  await page.locator("[data-lang=cs]").click();
  await expect(page.locator("#ai-active")).toContainText("Jana");
  expect(page.url()).not.toContain("kod=");
  expect(seen[0]).toBe("Bearer test-code-123");

  await page.locator("#file-input").setInputFiles("public/demo/oda-na-radost.png");
  await expect(page.locator("#ai-button")).toBeEnabled();
  await expect(page.locator("#status")).toBeHidden();
  await page.locator("#ai-button").click();
  await expect(page.locator("#player-card")).toBeVisible();
  await expect(page.locator("#status-text")).toContainText("přečetla AI");
  expect(await page.locator("#player-card").getAttribute("data-pitches")).toBe("64,64,64,65,67,71,69");
  await expect(page.locator("#melody-info")).toContainText("3/4");
  await page.screenshot({ path: "test-results/screenshots/ai.png", fullPage: true });

  await page.locator("#ai-logout").click();
  await expect(page.locator("#ai-button")).toBeHidden();
  await expect(page.locator("#ai-invite")).toBeVisible();
});

test("a wrong code is refused", async ({ page }) => {
  await page.route("https://ai.invalid/api/me", (route) => route.fulfill({ status: 401, json: { error: "invalid_code" } }));
  await page.goto("./");
  await page.locator("[data-lang=cs]").click();
  await page.locator("#ai-invite summary").click();
  await page.locator("#ai-code").fill("wrong-code");
  await page.locator("#ai-form button").click();
  await expect(page.locator("#ai-form-error")).toHaveText("Tenhle kód neplatí.");
  await expect(page.locator("#ai-button")).toBeHidden();
});

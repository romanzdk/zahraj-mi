import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:4173${process.env.BASE_PATH ?? "/"}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["iPhone 15"] } },
    {
      name: "webkit-pages",
      use: { ...devices["iPhone 15"], baseURL: `http://localhost:4174${process.env.BASE_PATH ?? "/"}` },
    },
  ],
  webServer: [
    {
      command: "npx vite preview --port 4173 --strictPort",
      url: `http://localhost:4173${process.env.BASE_PATH ?? "/"}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Like GitHub Pages: no isolation headers, so coi-serviceworker is in play.
      command: "npx vite preview --port 4174 --strictPort",
      env: { NO_ISOLATION: "1" },
      url: `http://localhost:4174${process.env.BASE_PATH ?? "/"}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});

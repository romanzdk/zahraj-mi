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
  ],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: `http://localhost:4173${process.env.BASE_PATH ?? "/"}`,
    reuseExistingServer: !process.env.CI,
  },
});

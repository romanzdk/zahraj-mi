// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SITE = "https://romanzdk.github.io/zahraj-mi/";
const doc = new DOMParser().parseFromString(readFileSync("index.html", "utf8"), "text/html");
const meta = (key: string) =>
  doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute("content");

describe("index.html", () => {
  it("loads GoatCounter in CORS mode, else COEP require-corp blocks count.js", () => {
    const gc = doc.querySelector("script[data-goatcounter]");
    expect(gc?.getAttribute("data-goatcounter")).toBe("https://zahrajmi.goatcounter.com/count");
    expect(gc?.getAttribute("crossorigin")).toBe("anonymous");
  });

  it("has absolute canonical and share-preview URLs pointing at existing files", () => {
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(SITE);
    expect(meta("og:url")).toBe(SITE);
    const image = meta("og:image")!;
    expect(image.startsWith(SITE)).toBe(true);
    expect(existsSync(`public/${image.slice(SITE.length)}`)).toBe(true);
    expect(meta("twitter:card")).toBe("summary_large_image");
  });

  it("has valid JSON-LD", () => {
    const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld["@type"]).toBe("WebApplication");
    expect(ld.url).toBe(SITE);
  });
});

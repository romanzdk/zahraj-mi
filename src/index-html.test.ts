// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SAMPLES } from "./player";
import { t, type Key } from "./i18n";

const SITE = "https://romanzdk.github.io/zahraj-mi/";
const doc = new DOMParser().parseFromString(readFileSync("index.html", "utf8"), "text/html");
const meta = (key: string) =>
  doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute("content");

describe("index.html", () => {
  it("loads GoatCounter in CORS mode, else COEP require-corp blocks count.js", () => {
    const gc = doc.querySelector("script[data-goatcounter]");
    expect(gc?.getAttribute("data-goatcounter")).toBe("https://zahrajmi.goatcounter.com/count");
    expect(gc?.getAttribute("crossorigin")).toBe("anonymous");
    expect(gc?.getAttribute("src")).toBe("https://gc.zgo.at/count.v4.js");
    expect(gc?.getAttribute("integrity")).toMatch(/^sha384-/);
  });

  it("has absolute canonical and share-preview URLs pointing at existing files", () => {
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(SITE);
    expect(meta("og:url")).toBe(SITE);
    const image = meta("og:image")!;
    expect(image.startsWith(SITE)).toBe(true);
    expect(existsSync(`public/${image.slice(SITE.length)}`)).toBe(true);
    expect(meta("twitter:card")).toBe("summary_large_image");
    expect(meta("og:locale:alternate")).toBeUndefined();
  });

  it("offers every sampled instrument, and every sample file exists", () => {
    const options = [...doc.querySelectorAll("#instrument option")].map((o) => o.getAttribute("value"));
    expect(options).toEqual(Object.keys(SAMPLES));
    for (const [id, notes] of Object.entries(SAMPLES)) {
      for (const note of notes) expect(existsSync(`public/samples/${id}/${note}.mp3`), `${id}/${note}`).toBe(true);
    }
  });

  it("links the third-party notices from the page, which the sample licenses require", () => {
    const href = doc.querySelector('footer a[data-i18n="footer.credits"]')?.getAttribute("href");
    expect(href).toBe("https://github.com/romanzdk/zahraj-mi/blob/main/THIRD_PARTY_NOTICES.md");
    expect(existsSync("THIRD_PARTY_NOTICES.md")).toBe(true);
  });

  it("links the privacy page from the footer and the AI invite, and the page exists", () => {
    for (const key of ["footer.privacyLink", "ai.privacy"]) {
      expect(doc.querySelector(`a[data-i18n="${key}"]`)?.getAttribute("href")).toBe("privacy.html");
    }
    expect(existsSync("public/privacy.html")).toBe(true);
  });

  it("has valid JSON-LD", () => {
    const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld["@type"]).toBe("WebApplication");
    expect(ld.url).toBe(SITE);
  });

  it("translates every aria-label instead of hardcoding one language", () => {
    expect(doc.querySelectorAll("[aria-label]:not(svg *):not([aria-label^='+']):not([aria-label^='-'])")).toHaveLength(0);
    for (const el of doc.querySelectorAll<HTMLElement>("[data-i18n-label]")) {
      expect(t(el.dataset.i18nLabel as Key)).not.toBe("");
    }
  });
});

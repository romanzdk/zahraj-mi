import { describe, expect, it } from "vitest";
import worker, { bearer, corsHeaders, readImages, type Env } from "./index.ts";
import { validateMelody } from "./melody.ts";

function env(codes: Record<string, string> = { "abc123": "Jana" }, limit = "2"): Env {
  const store = new Map(Object.entries(codes).map(([c, n]) => [`code:${c}`, n]));
  return {
    OPENROUTER_API_KEY: "test",
    ALLOWED_ORIGINS: "https://romanzdk.github.io",
    MODEL: "test/model",
    DAILY_LIMIT: limit,
    KV: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => void store.set(k, v),
    } as unknown as KVNamespace,
  };
}

const req = (path: string, init: RequestInit = {}) => new Request(`https://w.example${path}`, init);

describe("access", () => {
  it("reads only well-formed bearer codes", () => {
    expect(bearer(req("/", { headers: { Authorization: "Bearer abc123" } }))).toBe("abc123");
    expect(bearer(req("/", { headers: { Authorization: "Bearer a b" } }))).toBeNull();
    expect(bearer(req("/"))).toBeNull();
  });

  it("allows CORS only for listed origins", () => {
    expect(corsHeaders("https://romanzdk.github.io", "https://romanzdk.github.io")["Access-Control-Allow-Origin"]).toBe(
      "https://romanzdk.github.io",
    );
    expect(corsHeaders("https://evil.example", "https://romanzdk.github.io")).toEqual({});
  });

  it("rejects unknown codes and tells known people their quota", async () => {
    const e = env();
    const bad = await worker.fetch(req("/api/me", { headers: { Authorization: "Bearer nope12" } }), e);
    expect(bad.status).toBe(401);
    const ok = await worker.fetch(req("/api/me", { headers: { Authorization: "Bearer abc123" } }), e);
    expect(await ok.json()).toEqual({ name: "Jana", remaining: 2 });
  });

  it("refuses a request that is not an image", async () => {
    const res = await worker.fetch(
      req("/api/recognize", { method: "POST", headers: { Authorization: "Bearer abc123" }, body: JSON.stringify({ image: "hello" }) }),
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("stops at the daily limit", async () => {
    const e = env({ abc123: "Jana" }, "0");
    const res = await worker.fetch(
      req("/api/recognize", { method: "POST", headers: { Authorization: "Bearer abc123" }, body: "{}" }),
      e,
    );
    expect(res.status).toBe(429);
  });
});

describe("readImages", () => {
  const jpeg = "data:image/jpeg;base64,AAAA";
  it("accepts a page with enlarged parts", () => {
    expect(readImages({ image: jpeg, crops: [jpeg, jpeg] })).toEqual({ image: jpeg, crops: [jpeg, jpeg] });
    expect(readImages({ image: jpeg })).toEqual({ image: jpeg, crops: [] });
  });
  it("refuses non-images, too many parts and script in the data", () => {
    expect(readImages({ image: "data:text/html;base64,AAAA" })).toBeNull();
    expect(readImages({ image: jpeg, crops: Array(13).fill(jpeg) })).toBeNull();
    expect(readImages({ image: jpeg, crops: ["data:image/png;base64,AA<script>"] })).toBeNull();
  });
});

describe("validateMelody", () => {
  const good = {
    title: "T",
    keyFifths: 0,
    beats: 3,
    beatType: 4,
    tempo: 0,
    measures: [{ notes: [{ pitch: "E4", duration: 1, lyric: "Za" }, { pitch: "rest", duration: 2, lyric: "" }] }],
  };

  it("accepts a valid melody", () => {
    expect(validateMelody(good).measures).toHaveLength(1);
  });

  it("rejects bad pitches, lengths and time signatures", () => {
    expect(() => validateMelody({ ...good, measures: [{ notes: [{ pitch: "H4", duration: 1, lyric: "" }] }] })).toThrow(/pitch/);
    expect(() => validateMelody({ ...good, measures: [{ notes: [{ pitch: "C4", duration: 0, lyric: "" }] }] })).toThrow(/duration/);
    expect(() => validateMelody({ ...good, beatType: 3 })).toThrow(/time/);
    expect(() => validateMelody({ ...good, measures: [{ notes: [{ pitch: "rest", duration: 1, lyric: "" }] }] })).toThrow(/no notes/);
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSong, listSongs, saveSong, updateSong, type Song } from "./library";

const song = (id: string, createdAt: number): Song => ({
  id,
  name: `Song ${id}`,
  createdAt,
  xml: `<score-partwise>${id}</score-partwise>`,
  thumb: null,
  settings: null,
});

describe("library", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("saves, lists newest first, updates and deletes", () => {
    saveSong(song("a", 1));
    saveSong(song("b", 2));
    expect(listSongs().map((s) => s.id)).toEqual(["b", "a"]);

    const settings = { tempo: 90, transpose: -3, voice: "bass", instrument: "piano", from: 2, to: 4, countIn: true, loop: true };
    updateSong("a", { name: "Tichá noc", settings });
    expect(listSongs().find((s) => s.id === "a")).toMatchObject({ name: "Tichá noc", settings });

    deleteSong("b");
    expect(listSongs().map((s) => s.id)).toEqual(["a"]);
  });

  it("skips broken entries and ignores other keys", () => {
    saveSong(song("a", 1));
    localStorage.setItem("zahraj-mi.song.broken", "{not json");
    localStorage.setItem("theme", "dark");
    expect(listSongs().map((s) => s.id)).toEqual(["a"]);
  });

  it("returns an empty list when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(listSongs()).toEqual([]);
  });

  it("lets a full storage error reach the caller", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveSong(song("a", 1))).toThrow("full");
  });
});

import "./style.css";
import { unzipSync, strFromU8 } from "fflate";
import { applyTranslations, getLang, setLang, t, type Key, type Lang } from "./i18n";
import { melodyRange, midiToName, parseMusicXml, type Melody } from "./melody";
import { melodyToMidi } from "./midi";
import { isIos } from "./device";
import { deleteSong, listSongs, saveSong, updateSong, type Song, type SongSettings } from "./library";
import { Player, type InstrumentId } from "./player";
import { diagnostics, RecognizeError, recognizeImage, type RecognizeStep } from "./recognize";
import { ScoreView } from "./score";
import { fitToVoice, VOICES } from "./voice";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  dropzone: $("dropzone"),
  cameraInput: $<HTMLInputElement>("camera-input"),
  fileInput: $<HTMLInputElement>("file-input"),
  xmlInput: $<HTMLInputElement>("xml-input"),
  demoButton: $<HTMLButtonElement>("demo-button"),
  preview: $("preview"),
  previewImg: $<HTMLImageElement>("preview-img"),
  recognizeButton: $<HTMLButtonElement>("recognize-button"),
  resetButton: $<HTMLButtonElement>("reset-button"),
  status: $("status"),
  statusText: $("status-text"),
  statusProgress: $<HTMLProgressElement>("status-progress"),
  statusDetails: $<HTMLDetailsElement>("status-details"),
  statusLog: $("status-log"),
  copyLog: $<HTMLButtonElement>("copy-log"),
  playerCard: $("player-card"),
  melodyInfo: $("melody-info"),
  playButton: $<HTMLButtonElement>("play-button"),
  pitchButton: $<HTMLButtonElement>("pitch-button"),
  countin: $("countin"),
  tempo: $<HTMLInputElement>("tempo"),
  tempoValue: $<HTMLOutputElement>("tempo-value"),
  transposeValue: $<HTMLOutputElement>("transpose-value"),
  transposeDown: $<HTMLButtonElement>("transpose-down"),
  transposeReset: $<HTMLButtonElement>("transpose-reset"),
  transposeUp: $<HTMLButtonElement>("transpose-up"),
  voice: $<HTMLSelectElement>("voice"),
  instrument: $<HTMLSelectElement>("instrument"),
  fromMeasure: $<HTMLInputElement>("from-measure"),
  toMeasure: $<HTMLInputElement>("to-measure"),
  countIn: $<HTMLInputElement>("count-in"),
  loop: $<HTMLInputElement>("loop"),
  score: $("score"),
  downloadMidi: $<HTMLButtonElement>("download-midi"),
  downloadXml: $<HTMLButtonElement>("download-xml"),
  library: $("library"),
  libraryList: $<HTMLUListElement>("library-list"),
};

const player = new Player();
const scoreView = new ScoreView(els.score);

const state = {
  image: null as Blob | null,
  imageUrl: "",
  musicXml: "",
  melody: null as Melody | null,
  transpose: 0,
  songId: null as string | null,
  busy: false,
  statusKey: null as { key: Key; vars: Record<string, string | number>; isError: boolean } | null,
};

function setStatus(key: Key | null, vars: Record<string, string | number> = {}, isError = false, details = ""): void {
  state.statusKey = key ? { key, vars, isError } : null;
  els.statusDetails.hidden = !details;
  els.statusDetails.open = false;
  els.statusLog.textContent = details;
  renderStatus();
}

function renderStatus(): void {
  const s = state.statusKey;
  els.status.hidden = !s;
  if (!s) return;
  els.statusText.textContent = t(s.key, s.vars);
  els.status.classList.toggle("error", s.isError);
  els.status.classList.toggle("working", state.busy);
}

function setBusy(busy: boolean): void {
  state.busy = busy;
  els.recognizeButton.disabled = busy;
  els.resetButton.disabled = busy;
  els.demoButton.disabled = busy;
  if (!busy) els.statusProgress.hidden = true;
  renderStatus();
}

function showImage(file: Blob): void {
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.image = file;
  state.imageUrl = URL.createObjectURL(file);
  els.previewImg.src = state.imageUrl;
  els.preview.hidden = false;
  els.dropzone.hidden = true;
  setStatus(null);
}

function resetInput(): void {
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.image = null;
  state.imageUrl = "";
  els.preview.hidden = true;
  els.dropzone.hidden = false;
  setStatus(null);
}

const RUN_KEY = "zahraj-mi.recognition";

function storeRun(details: string | null): void {
  try {
    if (details === null) sessionStorage.removeItem(RUN_KEY);
    else sessionStorage.setItem(RUN_KEY, details);
  } catch {
    // storage may be blocked
  }
}

/** A run still marked as running after a page load means the page reloaded in the middle of it. */
function reportInterruptedRun(): void {
  let details: string | null = null;
  try {
    details = sessionStorage.getItem(RUN_KEY);
  } catch {
    return;
  }
  if (details === null) return;
  storeRun(null);
  setStatus("status.interrupted", {}, true, details);
}

async function runRecognition(): Promise<void> {
  if (!state.image || state.busy) return;
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
    setStatus("status.unsupported", {}, true);
    return;
  }
  setBusy(true);
  const started = performance.now();
  let lastStep: RecognizeStep = { kind: "starting" };
  const tick = window.setInterval(() => showStep(lastStep), 1000);
  const showStep = (step: RecognizeStep) => {
    lastStep = step;
    const elapsed = t("status.elapsed", { s: Math.round((performance.now() - started) / 1000) });
    if (step.kind === "models") {
      setStatus("status.models", { loaded: step.loadedMb });
      els.statusProgress.hidden = step.totalMb === 0;
      els.statusProgress.value = step.totalMb ? (100 * step.loadedMb) / step.totalMb : 0;
    } else if (step.kind === "reading") {
      setStatus("status.reading", { done: Math.min(step.done + 1, step.total), total: step.total });
      els.statusProgress.hidden = false;
      els.statusProgress.value = (100 * step.done) / Math.max(1, step.total);
    } else {
      setStatus(step.kind === "retrying" ? "status.retrying" : "status.starting");
      els.statusProgress.hidden = true;
    }
    els.statusText.textContent += ` ${elapsed}`;
    storeRun(`last step ${step.kind} at ${elapsed}\n${diagnostics()}`);
  };
  try {
    storeRun(`started\n${diagnostics()}`);
    const image = state.image;
    const xml = await recognizeImage(image, showStep);
    await loadMusicXml(xml);
    setBusy(false);
    setStatus("status.done");
    await remember(xml, image);
  } catch (err) {
    setBusy(false);
    const details = err instanceof RecognizeError ? err.details : `${String(err)}\n${diagnostics()}`;
    if (err instanceof RecognizeError && err.code === "not_music") setStatus("status.noNotes", {}, true, details);
    else setStatus("status.error", { msg: err instanceof Error ? err.message : String(err) }, true, details);
    console.error(err);
  } finally {
    window.clearInterval(tick);
    storeRun(null);
  }
}

async function loadMusicXml(xml: string): Promise<void> {
  const melody = parseMusicXml(xml);
  if (melody.notes.length === 0) throw new RecognizeError("not_music", "no notes", "");
  player.stop();
  state.musicXml = xml;
  state.melody = melody;
  state.transpose = 0;
  state.songId = null;
  els.playerCard.dataset.pitches = melody.notes.map((n) => n.midi).join(",");
  els.voice.value = "";
  els.tempo.value = String(Math.round(melody.tempo));
  els.fromMeasure.max = els.toMeasure.max = String(melody.measureCount);
  els.fromMeasure.value = "1";
  els.toMeasure.value = String(melody.measureCount);
  els.playerCard.hidden = false;
  renderPlayer();
  await scoreView.show(xml);
  els.playerCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPlayer(): void {
  const m = state.melody;
  if (!m) return;
  els.tempoValue.textContent = els.tempo.value;
  els.transposeValue.textContent = state.transpose > 0 ? `+${state.transpose}` : String(state.transpose);
  const range = melodyRange(m.notes);
  const parts = [
    t("player.notes", { n: m.notes.length, m: m.measureCount }),
    t(m.timeGuessed ? "player.timeGuessed" : "player.time", { t: `${m.beatsPerMeasure}/${m.beatType}` }),
  ];
  if (range) {
    parts.push(t("player.range", { low: midiToName(range.low + state.transpose), high: midiToName(range.high + state.transpose) }));
  }
  els.melodyInfo.textContent = (m.title ? `${m.title} · ` : "") + parts.join(" · ");
  els.playButton.textContent = t(player.isPlaying ? "player.stop" : "player.play");
  els.playButton.classList.toggle("playing", player.isPlaying);
}

function setTranspose(value: number): void {
  state.transpose = Math.max(-24, Math.min(24, value));
  renderPlayer();
  saveSettings();
  restartIfPlaying();
}

function restartIfPlaying(): void {
  if (player.isPlaying) void play();
}

async function play(): Promise<void> {
  const m = state.melody;
  if (!m) return;
  const from = Number(els.fromMeasure.value) || 1;
  const to = Number(els.toMeasure.value) || m.measureCount;
  await player.play(m, {
    tempo: Number(els.tempo.value),
    transpose: state.transpose,
    instrument: els.instrument.value as InstrumentId,
    countIn: els.countIn.checked,
    loop: els.loop.checked,
    fromMeasure: Math.min(from, to) - 1,
    toMeasure: Math.max(from, to) - 1,
  });
  renderPlayer();
}

function download(data: BlobPart, type: string, ext: string): void {
  const name = (state.melody?.title || "melodie").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "melodie";
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readMusicXmlFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return new TextDecoder().decode(bytes);
  const files = unzipSync(bytes);
  const container = files["META-INF/container.xml"];
  const rootPath = container ? /full-path="([^"]+)"/.exec(strFromU8(container))?.[1] : undefined;
  const entry =
    (rootPath && files[rootPath]) ||
    Object.entries(files).find(([name]) => !name.startsWith("META-INF/") && /\.(xml|musicxml)$/i.test(name))?.[1];
  if (!entry) throw new Error("MXL");
  return strFromU8(entry);
}

function fillVoiceOptions(): void {
  const current = els.voice.value;
  els.voice.innerHTML = "";
  const none = new Option(t("player.voice.none"), "");
  els.voice.add(none);
  for (const v of VOICES) els.voice.add(new Option(t(`voice.${v.id}` as Key), v.id));
  els.voice.value = current;
}

function renderLanguage(lang: Lang): void {
  setLang(lang);
  document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
  });
  fillVoiceOptions();
  renderStatus();
  renderPlayer();
  renderLibrary();
}

/** Returns false when the write failed; a full storage is reported, a blocked one stays silent. */
function store(write: () => void): boolean {
  try {
    write();
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") setStatus("status.storageFull", {}, true);
    return false;
  }
}

function currentSettings(): SongSettings {
  return {
    tempo: Number(els.tempo.value),
    transpose: state.transpose,
    voice: els.voice.value,
    instrument: els.instrument.value,
    from: Number(els.fromMeasure.value),
    to: Number(els.toMeasure.value),
    countIn: els.countIn.checked,
    loop: els.loop.checked,
  };
}

function applySettings(s: SongSettings): void {
  els.tempo.value = String(s.tempo);
  state.transpose = s.transpose;
  els.voice.value = s.voice;
  els.instrument.value = s.instrument;
  els.fromMeasure.value = String(s.from);
  els.toMeasure.value = String(s.to);
  els.countIn.checked = s.countIn;
  els.loop.checked = s.loop;
  void player.preload(els.instrument.value as InstrumentId);
  renderPlayer();
}

function saveSettings(): void {
  const id = state.songId;
  if (id) store(() => updateSong(id, { settings: currentSettings() }));
}

async function thumbnail(image: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(image);
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = Math.round((160 * bitmap.height) / bitmap.width);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

/** Saves the song that was just loaded, or picks up the saved copy (and its settings) when the same notes come in again. */
async function remember(xml: string, image: Blob | null): Promise<void> {
  const existing = listSongs().find((s) => s.xml === xml);
  if (existing) {
    state.songId = existing.id;
    if (existing.settings) applySettings(existing.settings);
    return;
  }
  const song: Song = {
    id: String(Date.now()),
    name: state.melody?.title || t("library.defaultName", { date: new Date().toLocaleDateString(getLang()) }),
    createdAt: Date.now(),
    xml,
    thumb: image ? await thumbnail(image) : null,
    settings: currentSettings(),
  };
  if (!store(() => saveSong(song))) return;
  state.songId = song.id;
  void navigator.storage?.persist?.();
  renderLibrary();
}

const songTemplate = document.createElement("template");
songTemplate.innerHTML =
  '<li><button type="button" class="song-open"><img class="song-thumb" alt="" /><span class="song-text"><span class="song-name"></span><small class="muted"></small></span></button>' +
  '<button type="button" class="btn small song-rename">✏️</button><button type="button" class="btn small song-delete">🗑️</button></li>';

function renderLibrary(): void {
  const songs = listSongs();
  els.library.hidden = songs.length === 0;
  els.libraryList.replaceChildren(
    ...songs.map((song) => {
      const li = (songTemplate.content.cloneNode(true) as DocumentFragment).firstElementChild as HTMLLIElement;
      li.dataset.id = song.id;
      const img = li.querySelector("img")!;
      if (song.thumb) img.src = song.thumb;
      else img.replaceWith(Object.assign(document.createElement("span"), { className: "song-thumb", textContent: "🎵" }));
      li.querySelector(".song-name")!.textContent = song.name;
      li.querySelector("small")!.textContent = new Date(song.createdAt).toLocaleDateString(getLang());
      for (const [cls, key] of [["song-rename", "library.rename"], ["song-delete", "library.delete"]] as const) {
        const b = li.querySelector(`.${cls}`)!;
        b.setAttribute("aria-label", t(key));
        b.setAttribute("title", t(key));
      }
      return li;
    }),
  );
}

async function openSong(song: Song): Promise<void> {
  try {
    await loadMusicXml(song.xml);
  } catch (err) {
    setStatus("status.badFile", { msg: err instanceof Error ? err.message : String(err) }, true);
    return;
  }
  state.songId = song.id;
  if (song.settings) applySettings(song.settings);
  setStatus(null);
}

player.setEvents({
  onNote: (note) => {
    els.countin.textContent = "";
    scoreView.moveTo(note.start);
  },
  onCountIn: (beat) => {
    els.countin.textContent = t("player.countBeat", { n: beat });
  },
  onEnd: () => {
    els.countin.textContent = "";
    scoreView.hideCursor();
    renderPlayer();
  },
});

for (const input of [els.cameraInput, els.fileInput]) {
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) {
      showImage(file);
      void runRecognition();
    }
  });
}

els.dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.dropzone.classList.add("over");
});
els.dropzone.addEventListener("dragleave", () => els.dropzone.classList.remove("over"));
els.dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropzone.classList.remove("over");
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  if (file.type.startsWith("image/")) {
    showImage(file);
    void runRecognition();
  } else {
    void openMusicXml(file);
  }
});

async function openMusicXml(file: File): Promise<void> {
  try {
    const xml = await readMusicXmlFile(file);
    await loadMusicXml(xml);
    setStatus(null);
    await remember(xml, null);
  } catch (err) {
    setStatus("status.badFile", { msg: err instanceof Error ? err.message : String(err) }, true);
  }
}

els.xmlInput.addEventListener("change", () => {
  const file = els.xmlInput.files?.[0];
  els.xmlInput.value = "";
  if (file) void openMusicXml(file);
});

els.demoButton.addEventListener("click", async () => {
  const base = `${import.meta.env.BASE_URL}demo/oda-na-radost`;
  const [img, xml] = await Promise.all([fetch(`${base}.png`).then((r) => r.blob()), fetch(`${base}.musicxml`).then((r) => r.text())]);
  showImage(img);
  await loadMusicXml(xml);
});

els.recognizeButton.addEventListener("click", () => void runRecognition());
els.copyLog.addEventListener("click", () => {
  void navigator.clipboard?.writeText(els.statusLog.textContent ?? "").then(() => {
    els.copyLog.textContent = t("status.copied");
  });
});
els.resetButton.addEventListener("click", resetInput);

els.playButton.addEventListener("click", () => {
  if (player.isPlaying) {
    player.stop();
    els.countin.textContent = "";
    scoreView.hideCursor();
    renderPlayer();
  } else {
    void play();
  }
});

els.pitchButton.addEventListener("click", () => {
  const m = state.melody;
  const from = (Number(els.fromMeasure.value) || 1) - 1;
  const first = m?.notes.find((n) => n.measure >= from) ?? m?.notes[0];
  if (first) void player.playPitch(first.midi + state.transpose, els.instrument.value as InstrumentId);
});

els.tempo.addEventListener("input", renderPlayer);
els.tempo.addEventListener("change", restartIfPlaying);
els.transposeDown.addEventListener("click", () => setTranspose(state.transpose - 1));
els.transposeUp.addEventListener("click", () => setTranspose(state.transpose + 1));
els.transposeReset.addEventListener("click", () => {
  els.voice.value = "";
  setTranspose(0);
});
els.voice.addEventListener("change", () => {
  const voice = VOICES.find((v) => v.id === els.voice.value);
  if (voice && state.melody) setTranspose(fitToVoice(state.melody.notes, voice));
});
els.instrument.addEventListener("change", () => {
  void player.preload(els.instrument.value as InstrumentId);
  restartIfPlaying();
});
for (const el of [els.fromMeasure, els.toMeasure, els.countIn, els.loop]) el.addEventListener("change", restartIfPlaying);

els.playerCard.addEventListener("change", saveSettings);

els.libraryList.addEventListener("click", (e) => {
  const button = (e.target as Element).closest("button");
  const id = button?.closest("li")?.dataset.id;
  const song = listSongs().find((s) => s.id === id);
  if (!button || !song || state.busy) return;
  if (button.classList.contains("song-open")) {
    void openSong(song);
  } else if (button.classList.contains("song-rename")) {
    const name = prompt(t("library.renamePrompt"), song.name)?.trim();
    if (name) store(() => updateSong(song.id, { name }));
  } else if (button.classList.contains("song-delete")) {
    store(() => deleteSong(song.id));
    if (state.songId === song.id) state.songId = null;
  }
  renderLibrary();
});

els.downloadMidi.addEventListener("click", () => {
  if (state.melody) download(melodyToMidi(state.melody, state.transpose, Number(els.tempo.value)), "audio/midi", "mid");
});
els.downloadXml.addEventListener("click", () => {
  if (state.musicXml) download(state.musicXml, "application/vnd.recordare.musicxml+xml", "musicxml");
});

document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((b) => {
  b.addEventListener("click", () => renderLanguage(b.dataset.lang as Lang));
});

type Theme = "light" | "dark" | "system";
const systemDark = matchMedia("(prefers-color-scheme: dark)");

function savedTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // storage may be blocked
  }
  return "system";
}

function renderTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && systemDark.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.themeChoice === theme));
  });
}

document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach((b) => {
  b.addEventListener("click", () => {
    const theme = b.dataset.themeChoice as Theme;
    try {
      if (theme === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", theme);
    } catch {
      // storage may be blocked
    }
    renderTheme(theme);
  });
});
systemDark.addEventListener("change", () => renderTheme(savedTheme()));
renderTheme(savedTheme());

$("silent-hint").hidden = !isIos;

applyTranslations();
renderLanguage(getLang());
reportInterruptedRun();

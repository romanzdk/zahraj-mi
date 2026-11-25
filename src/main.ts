import "./style.css";
import { unzipSync, strFromU8 } from "fflate";
import { applyTranslations, getLang, setLang, t, type Key, type Lang } from "./i18n";
import { melodyRange, midiToName, parseMusicXml, type Melody } from "./melody";
import { melodyToMidi } from "./midi";
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
};

const player = new Player();
const scoreView = new ScoreView(els.score);

const state = {
  image: null as Blob | null,
  imageUrl: "",
  musicXml: "",
  melody: null as Melody | null,
  transpose: 0,
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
  };
  try {
    const xml = await recognizeImage(state.image, showStep);
    await loadMusicXml(xml);
    setBusy(false);
    setStatus("status.done");
  } catch (err) {
    setBusy(false);
    const details = err instanceof RecognizeError ? err.details : `${String(err)}\n${diagnostics()}`;
    if (err instanceof RecognizeError && err.code === "not_music") setStatus("status.noNotes", {}, true, details);
    else setStatus("status.error", { msg: err instanceof Error ? err.message : String(err) }, true, details);
    console.error(err);
  } finally {
    window.clearInterval(tick);
  }
}

async function loadMusicXml(xml: string): Promise<void> {
  const melody = parseMusicXml(xml);
  if (melody.notes.length === 0) throw new RecognizeError("not_music", "no notes", "");
  player.stop();
  state.musicXml = xml;
  state.melody = melody;
  state.transpose = 0;
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
    await loadMusicXml(await readMusicXmlFile(file));
    setStatus(null);
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

els.downloadMidi.addEventListener("click", () => {
  if (state.melody) download(melodyToMidi(state.melody, state.transpose, Number(els.tempo.value)), "audio/midi", "mid");
});
els.downloadXml.addEventListener("click", () => {
  if (state.musicXml) download(state.musicXml, "application/vnd.recordare.musicxml+xml", "musicxml");
});

document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((b) => {
  b.addEventListener("click", () => renderLanguage(b.dataset.lang as Lang));
});

applyTranslations();
renderLanguage(getLang());

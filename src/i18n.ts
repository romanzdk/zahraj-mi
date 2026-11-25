export type Lang = "cs" | "en";

const cs = {
  tagline: "Vyfoť noty, pusť si melodii a zpívej.",
  "step1.title": "1. Noty",
  "step1.camera": "Vyfotit noty",
  "step1.upload": "Nahrát obrázek",
  "step1.drop": "nebo sem přetáhni obrázek (JPG, PNG)",
  "step1.musicxml": "Mám soubor MusicXML",
  "step1.demo": "Zkusit ukázku",
  "step1.tips": "Tip: fotografuj rovně a ostře, při dobrém světle a jen jednu píseň. Nejlépe funguje jedna melodická linka (jako ve zpěvníku).",
  "step1.recognize": "Rozpoznat noty",
  "step1.another": "Jiný obrázek",
  "step1.firstTime": "Noty se čtou přímo ve tvém zařízení, obrázek nikam neodchází. Poprvé se stáhne rozpoznávací model (asi 100–160 MB, raději přes Wi-Fi), pak už zůstane v prohlížeči.",
  "status.starting": "Připravuji rozpoznávání not…",
  "status.retrying": "Něco se zadrhlo, zkouším to znovu jiným způsobem…",
  "status.details": "Technické detaily (pro nahlášení chyby)",
  "status.copy": "Zkopírovat",
  "status.copied": "Zkopírováno",
  "status.models": "Stahuji rozpoznávací model: {loaded} MB…",
  "status.reading": "Čtu noty: řádek {done} z {total}…",
  "status.elapsed": "({s} s)",
  "status.done": "Hotovo. Zkontroluj noty, rozpoznání nemusí být přesné.",
  "status.noNotes": "V obrázku jsem nenašel žádné noty. Zkus ostřejší fotku nebo jen jednu píseň.",
  "status.error": "Rozpoznání se nepovedlo: {msg}",
  "status.badFile": "Soubor se nepodařilo načíst: {msg}",
  "status.unsupported": "Tenhle prohlížeč neumí spustit rozpoznávání not. Zkus aktuální Chrome, Edge, Firefox nebo Safari.",
  "step2.title": "2. Přehrát a zpívat",
  "player.play": "Přehrát",
  "player.stop": "Zastavit",
  "player.pitch": "Dej tón",
  "player.tempo": "Tempo",
  "player.transpose": "Tónina",
  "player.semitones": "půltónů",
  "player.voice": "Přizpůsobit hlasu",
  "player.voice.none": "—",
  "voice.bass": "Bas (muž, nízko)",
  "voice.tenor": "Tenor (muž, výš)",
  "voice.alto": "Alt (žena, níž)",
  "voice.soprano": "Soprán (žena, výš)",
  "voice.child": "Dětský hlas",
  "player.instrument": "Zvuk",
  "instrument.piano": "Klavír",
  "instrument.soft": "Jemný tón",
  "instrument.bright": "Ostrý tón",
  "player.countIn": "Předtaktí",
  "player.loop": "Opakovat dokola",
  "player.measures": "Takty",
  "player.range": "Rozsah melodie: {low}–{high}",
  "player.notes": "{n} not, {m} taktů",
  "player.countBeat": "Počítám: {n}",
  "download.midi": "Stáhnout MIDI",
  "download.musicxml": "Stáhnout MusicXML",
  "footer.privacy": "Vše běží ve tvém prohlížeči: obrázky ani noty se nikam neposílají.",
  "footer.source": "Zdrojový kód",
  "footer.engine": "Rozpoznávání not: homr (open source)",
};

const en: Record<keyof typeof cs, string> = {
  tagline: "Snap your sheet music, play the melody and sing along.",
  "step1.title": "1. Sheet music",
  "step1.camera": "Take a photo",
  "step1.upload": "Upload image",
  "step1.drop": "or drop an image here (JPG, PNG)",
  "step1.musicxml": "I have a MusicXML file",
  "step1.demo": "Try an example",
  "step1.tips": "Tip: shoot straight and sharp, in good light, one song at a time. A single melody line (like in a songbook) works best.",
  "step1.recognize": "Recognize notes",
  "step1.another": "Another image",
  "step1.firstTime": "Notes are read right on your device, the image never leaves it. The first time, the recognition model is downloaded (about 100–160 MB, Wi-Fi recommended); after that it stays in your browser.",
  "status.starting": "Preparing note recognition…",
  "status.retrying": "Something got stuck, trying again another way…",
  "status.details": "Technical details (for bug reports)",
  "status.copy": "Copy",
  "status.copied": "Copied",
  "status.models": "Downloading the recognition model: {loaded} MB…",
  "status.reading": "Reading notes: line {done} of {total}…",
  "status.elapsed": "({s} s)",
  "status.done": "Done. Check the notes, recognition may not be perfect.",
  "status.noNotes": "No notes found in the image. Try a sharper photo or just one song.",
  "status.error": "Recognition failed: {msg}",
  "status.badFile": "Could not open the file: {msg}",
  "status.unsupported": "This browser cannot run note recognition. Try a current Chrome, Edge, Firefox or Safari.",
  "step2.title": "2. Play and sing",
  "player.play": "Play",
  "player.stop": "Stop",
  "player.pitch": "Starting note",
  "player.tempo": "Tempo",
  "player.transpose": "Key",
  "player.semitones": "semitones",
  "player.voice": "Fit to voice",
  "player.voice.none": "—",
  "voice.bass": "Bass (low male)",
  "voice.tenor": "Tenor (high male)",
  "voice.alto": "Alto (low female)",
  "voice.soprano": "Soprano (high female)",
  "voice.child": "Child",
  "player.instrument": "Sound",
  "instrument.piano": "Piano",
  "instrument.soft": "Soft tone",
  "instrument.bright": "Bright tone",
  "player.countIn": "Count-in",
  "player.loop": "Loop",
  "player.measures": "Measures",
  "player.range": "Melody range: {low}–{high}",
  "player.notes": "{n} notes, {m} measures",
  "player.countBeat": "Counting: {n}",
  "download.midi": "Download MIDI",
  "download.musicxml": "Download MusicXML",
  "footer.privacy": "Everything runs in your browser: images and notes are never uploaded.",
  "footer.source": "Source code",
  "footer.engine": "Note recognition: homr (open source)",
};

export type Key = keyof typeof cs;

const dictionaries: Record<Lang, Record<Key, string>> = { cs, en };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "cs" || saved === "en") return saved;
  } catch {
    // storage may be blocked
  }
  return navigator.language.toLowerCase().startsWith("cs") || navigator.language.toLowerCase().startsWith("sk") ? "cs" : "en";
}

let lang: Lang = initialLang();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem("lang", next);
  } catch {
    // storage may be blocked
  }
  applyTranslations();
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return dictionaries[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

export function applyTranslations(root: ParentNode = document): void {
  document.documentElement.lang = lang;
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as Key);
  });
}

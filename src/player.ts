import * as Tone from "tone";
import type { Melody, MelodyNote } from "./melody";

export type InstrumentId = "piano" | "soft" | "bright";

export interface PlayOptions {
  tempo: number;
  transpose: number;
  instrument: InstrumentId;
  countIn: boolean;
  loop: boolean;
  fromMeasure: number;
  toMeasure: number;
}

export interface PlayerEvents {
  onNote?: (note: MelodyNote, index: number) => void;
  onCountIn?: (beat: number) => void;
  onEnd?: () => void;
}

type Voice = Tone.Sampler | Tone.PolySynth;

const PIANO_NOTES = ["C", "Ds", "Fs", "A"];

function pianoUrls(): Record<string, string> {
  const urls: Record<string, string> = {};
  for (let octave = 1; octave <= 7; octave++) {
    for (const n of PIANO_NOTES) urls[`${n.replace("s", "#")}${octave}`] = `${n}${octave}.mp3`;
  }
  return urls;
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/** iPhone silent mode mutes Web Audio unless the page says it plays media. */
function startAudio(): Promise<void> {
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (session && session.type !== "playback") session.type = "playback";
  return Tone.start();
}

export class Player {
  private voices = new Map<InstrumentId, Voice>();
  private click: Tone.MembraneSynth | null = null;
  private events: PlayerEvents = {};
  private playing = false;

  setEvents(events: PlayerEvents): void {
    this.events = events;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private async voice(id: InstrumentId): Promise<Voice> {
    const existing = this.voices.get(id);
    if (existing) return existing;
    let v: Voice;
    if (id === "piano") {
      v = new Tone.Sampler({
        urls: pianoUrls(),
        baseUrl: `${import.meta.env.BASE_URL}samples/piano/`,
        release: 1,
      }).toDestination();
      await Tone.loaded();
    } else if (id === "soft") {
      v = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.06, decay: 0.1, sustain: 0.8, release: 0.4 },
      }).toDestination();
      v.volume.value = -6;
    } else {
      v = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle8" },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
      }).toDestination();
      v.volume.value = -10;
    }
    this.voices.set(id, v);
    return v;
  }

  async preload(id: InstrumentId): Promise<void> {
    await this.voice(id);
  }

  /** Plays one pitch, e.g. the starting note to sing from. */
  async playPitch(midi: number, instrument: InstrumentId, seconds = 1.2): Promise<void> {
    await startAudio();
    const v = await this.voice(instrument);
    v.triggerAttackRelease(Tone.Frequency(midi, "midi").toFrequency(), seconds);
  }

  async play(melody: Melody, opts: PlayOptions): Promise<void> {
    this.stop();
    await startAudio();
    const v = await this.voice(opts.instrument);
    if (!this.click) {
      this.click = new Tone.MembraneSynth({ octaves: 2, pitchDecay: 0.01 }).toDestination();
      this.click.volume.value = -8;
    }
    const click = this.click;

    const transport = Tone.getTransport();
    transport.cancel();
    transport.bpm.value = opts.tempo;
    const quarter = 60 / opts.tempo;

    const from = Math.max(0, Math.min(opts.fromMeasure, melody.measureCount - 1));
    const to = Math.max(from, Math.min(opts.toMeasure, melody.measureCount - 1));
    const sectionStart = melody.measureStarts[from] ?? 0;
    const sectionEnd = melody.measureStarts[to + 1] ?? melody.length;
    const beatLength = 4 / melody.beatType;
    // Before every repetition there is a breath: the count-in again, or one silent beat without it.
    const leadIn = opts.countIn ? melody.beatsPerMeasure * beatLength : opts.loop ? beatLength : 0;

    if (opts.countIn) {
      for (let b = 0; b < melody.beatsPerMeasure; b++) {
        transport.schedule((time) => {
          click.triggerAttackRelease(b === 0 ? "C3" : "G2", "32n", time);
          Tone.getDraw().schedule(() => this.events.onCountIn?.(b + 1), time);
        }, b * beatLength * quarter);
      }
    }

    melody.notes.forEach((note, index) => {
      if (note.start < sectionStart - 1e-6 || note.start >= sectionEnd - 1e-6) return;
      const at = (leadIn + note.start - sectionStart) * quarter;
      const length = Math.max(0.05, Math.min(note.duration, sectionEnd - note.start) * quarter * 0.95);
      const freq = Tone.Frequency(note.midi + opts.transpose, "midi").toFrequency();
      transport.schedule((time) => {
        v.triggerAttackRelease(freq, length, time);
        Tone.getDraw().schedule(() => this.events.onNote?.(note, index), time);
      }, at);
    });

    const total = (leadIn + sectionEnd - sectionStart) * quarter;
    if (opts.loop) {
      transport.loop = true;
      transport.loopStart = 0;
      transport.loopEnd = total;
    } else {
      transport.loop = false;
      transport.schedule((time) => {
        Tone.getDraw().schedule(() => {
          this.stop();
          this.events.onEnd?.();
        }, time);
      }, total + 0.3);
    }
    this.playing = true;
    transport.start("+0.05");
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.loop = false;
    for (const v of this.voices.values()) v.releaseAll();
    this.playing = false;
  }
}

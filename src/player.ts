import * as Tone from "tone";
import type { Melody, MelodyNote } from "./melody";

const octaves = (notes: string[], from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => notes.map((n) => `${n}${from + i}`)).flat();

/** Sample files in public/samples/<instrument>/; Tone.Sampler pitch-shifts the notes in between. */
export const SAMPLES = {
  piano: octaves(["C", "Ds", "Fs", "A"], 1, 7),
  flute: ["C4", "E4", "A4", "C5", "E5", "A5", "C6", "E6", "A6", "C7"],
  guitar: ["E2", "Gs2", "C3", "E3", "Gs3", "C4", "E4", "Gs4", "C5"],
  violin: ["G3", "C4", "E4", "A4", "C5", "E5", "A5", "C6", "E6"],
  organ: octaves(["C", "Fs"], 2, 5).concat("C6"),
};

export type InstrumentId = keyof typeof SAMPLES;

// Volume measured on the first second of a middle note against the piano. Held instruments get a
// short release, or fast notes ring into each other and the pitch change is hard to hear.
const SOUND: Partial<Record<InstrumentId, { volume: number; release: number }>> = {
  flute: { volume: -10, release: 0.2 },
  guitar: { volume: -3, release: 1 },
  violin: { volume: -8, release: 0.2 },
  organ: { volume: -9, release: 0.15 },
};

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

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/** iPhone silent mode mutes Web Audio unless the page says it plays media. */
function startAudio(): Promise<void> {
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (session && session.type !== "playback") session.type = "playback";
  return Tone.start();
}

export class Player {
  private voices = new Map<InstrumentId, Promise<Tone.Sampler>>();
  private click: Tone.MembraneSynth | null = null;
  private events: PlayerEvents = {};
  private playing = false;
  /** Bumped by every stop(), so a play() still waiting for samples knows it was cancelled. */
  private run = 0;

  setEvents(events: PlayerEvents): void {
    this.events = events;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private voice(id: InstrumentId): Promise<Tone.Sampler> {
    let v = this.voices.get(id);
    if (!v) {
      v = new Promise((resolve, reject) => {
        const sampler = new Tone.Sampler({
          urls: Object.fromEntries(SAMPLES[id].map((n) => [n.replace("s", "#"), `${n}.mp3`])),
          baseUrl: `${import.meta.env.BASE_URL}samples/${id}/`,
          ...(SOUND[id] ?? { volume: 0, release: 1 }),
          onload: () => resolve(sampler),
          onerror: (err) => {
            sampler.dispose();
            reject(err);
          },
        }).toDestination();
      });
      v.catch(() => this.voices.delete(id));
      this.voices.set(id, v);
    }
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
    const run = this.run;
    this.playing = true;
    let v: Tone.Sampler;
    try {
      await startAudio();
      v = await this.voice(opts.instrument);
    } catch (err) {
      if (run === this.run) this.playing = false;
      throw err;
    }
    if (run !== this.run) return;
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
    this.run++;
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.loop = false;
    for (const v of this.voices.values()) void v.then((s) => s.releaseAll(), () => undefined);
    this.playing = false;
  }
}

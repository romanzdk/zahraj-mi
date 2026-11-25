import { MELODY_SCHEMA, validateMelody, type AiMelody } from "./melody.ts";

export const PROMPT = `You transcribe printed sheet music from a photo into a melody that someone will sing along to.

Read ONE song: the main melody line (the top voice of the first staff in each system). Ignore chord symbols,
piano accompaniment, guitar tabs, pictures and verses printed as plain text below the music.

Work carefully, the photo may be small, blurry or skewed:
1. Find the clef, the key signature and the time signature. If no time signature is printed, infer it from the bars.
2. Go system by system, measure by measure. For every note give its pitch and length.
   - Pitch is the sounding pitch with the key signature and accidentals applied, e.g. "F#4", "Bb3", "C5".
     Middle C is C4. In treble clef the bottom line is E4 and the top line is F5.
   - Length is in quarter notes: whole 4, half 2, dotted quarter 1.5, quarter 1, eighth 0.5, sixteenth 0.25.
     Watch for dots and for single flagged eighths next to beamed groups.
   - Rests are notes with pitch "rest".
3. Check every measure: its lengths must add up to the time signature (only a pickup and the last measure may be shorter).
4. Use the lyrics to check yourself: usually one syllable per note. Put the syllable of the first verse in "lyric",
   ending with "-" when the word goes on to the next note (e.g. "ok-", "ny"), "" when there is none.
5. Songs often repeat a motif a step lower or higher (sequences). If one copy is clearer, use it to read the others.

Return only the JSON object. tempo is quarter notes per minute if printed, otherwise 0.`;

export interface RecognizeResult {
  melody: AiMelody;
  model: string;
  costUsd: number | null;
  seconds: number;
}

export function userContent(imageDataUrl: string, crops: readonly string[]): unknown[] {
  const text =
    crops.length === 0
      ? "Transcribe the melody of this song."
      : `Transcribe the melody of this song. The first image is the whole page. The next ${crops.length} images ` +
        "are overlapping horizontal strips of the same page, top to bottom, enlarged so you can read every notehead " +
        "exactly. Read the notes from the strips and use the whole page for order and layout. A staff cut by a strip " +
        "edge is complete in the neighbouring strip, and notes seen in two strips are the same notes: write them once.";
  return [
    { type: "text", text },
    { type: "image_url", image_url: { url: imageDataUrl } },
    ...crops.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
}

export async function recognizeWithModel(
  apiKey: string,
  model: string,
  imageDataUrl: string,
  crops: readonly string[],
  referer: string,
): Promise<RecognizeResult> {
  const started = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "Zahraj mi",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: userContent(imageDataUrl, crops) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "melody", strict: true, schema: MELODY_SCHEMA } },
      provider: { zdr: true, data_collection: "deny", require_parameters: true },
      usage: { include: true },
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: { cost?: number };
    error?: { message?: string };
  } | null;
  if (!res.ok || !body) throw new Error(`OpenRouter ${res.status}: ${body?.error?.message ?? "no answer"}`);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("the model gave no answer");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("the model's answer is not JSON");
  }
  return {
    melody: validateMelody(parsed),
    model,
    costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : null,
    seconds: Math.round((Date.now() - started) / 100) / 10,
  };
}

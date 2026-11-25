import { recognizeWithModel } from "./openrouter.ts";

export interface Env {
  OPENROUTER_API_KEY: string;
  ALLOWED_ORIGINS: string;
  MODEL: string;
  DAILY_LIMIT: string;
  /** "code:<invite code>" -> person's name, "usage:<code>:<day>" -> requests that day. */
  KV: KVNamespace;
}

const MAX_IMAGE_CHARS = 8 * 1024 * 1024;
const MAX_TOTAL_CHARS = 24 * 1024 * 1024;
const MAX_CROPS = 12;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** The page and its enlarged parts, or null when the request is not usable. */
export function readImages(body: unknown): { image: string; crops: string[] } | null {
  const b = body as { image?: unknown; crops?: unknown } | null;
  const image = typeof b?.image === "string" ? b.image : "";
  const crops = Array.isArray(b?.crops) ? b.crops : [];
  if (crops.length > MAX_CROPS || !crops.every((c) => typeof c === "string")) return null;
  const all = [image, ...(crops as string[])];
  if (!all.every((d) => d.length <= MAX_IMAGE_CHARS && DATA_URL.test(d))) return null;
  if (all.reduce((sum, d) => sum + d.length, 0) > MAX_TOTAL_CHARS) return null;
  return { image, crops: crops as string[] };
}

export function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  const list = allowed.split(",").map((s) => s.trim());
  if (!origin || !list.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function bearer(request: Request): string | null {
  const m = /^Bearer\s+([A-Za-z0-9_-]{6,64})$/.exec(request.headers.get("Authorization") ?? "");
  return m ? m[1] : null;
}

const today = () => new Date().toISOString().slice(0, 10);

async function remaining(env: Env, code: string): Promise<number> {
  const used = Number((await env.KV.get(`usage:${code}:${today()}`)) ?? 0);
  return Math.max(0, Number(env.DAILY_LIMIT || 20) - used);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request.headers.get("Origin"), env.ALLOWED_ORIGINS);
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const path = new URL(request.url).pathname;

    const code = bearer(request);
    const name = code ? await env.KV.get(`code:${code}`) : null;
    if (!code || name === null) return json({ error: "invalid_code" }, 401);

    if (request.method === "GET" && path === "/api/me") {
      return json({ name, remaining: await remaining(env, code) });
    }

    if (request.method === "POST" && path === "/api/recognize") {
      if ((await remaining(env, code)) <= 0) return json({ error: "daily_limit" }, 429);
      const images = readImages(await request.json().catch(() => null));
      if (!images) return json({ error: "bad_image" }, 400);
      const key = `usage:${code}:${today()}`;
      const used = Number((await env.KV.get(key)) ?? 0);
      await env.KV.put(key, String(used + 1), { expirationTtl: 3 * 86400 });
      try {
        const result = await recognizeWithModel(
          env.OPENROUTER_API_KEY,
          env.MODEL,
          images.image,
          images.crops,
          "https://romanzdk.github.io/zahraj-mi/",
        );
        console.log(JSON.stringify({ who: name, model: result.model, crops: images.crops.length, cost: result.costUsd, seconds: result.seconds }));
        return json({ ...result, remaining: await remaining(env, code) });
      } catch (err) {
        console.log(JSON.stringify({ who: name, error: String(err) }));
        return json({ error: "model_failed", message: err instanceof Error ? err.message : String(err) }, 502);
      }
    }

    return json({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;

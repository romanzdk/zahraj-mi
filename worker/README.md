# AI note reading (invite-only)

The free app reads notes in the browser with homr. For blurry or tiny photos, invited people can also
send the photo to an AI model. This Cloudflare Worker keeps the OpenRouter key, checks invite codes and
limits how much each person can use per day.

```
browser ──(photo + invite code)──► Worker ──► OpenRouter (zero data retention) ──► melody as JSON
                                     │
                                     └── KV: invite codes, daily counters
```

- **Who can use it:** only people with an invite code. Each code is one person, revocable at any time.
- **Cost control:** `DAILY_LIMIT` requests per code per day (default 20). Model in `MODEL` (wrangler.toml),
  default `anthropic/claude-opus-5.5`: about $0.05–0.12 per photo.
- **What is sent:** the whole photo plus 6 overlapping strips of it, enlarged. The model reads small noteheads
  much better from the enlarged strips (see results below).
- **Privacy:** OpenRouter is called with `provider.zdr = true` and `data_collection = "deny"`. The Worker logs
  only who, model, cost and time, never the image.
- **Without this Worker** the web app hides everything about AI (`VITE_AI_API_URL` unset).

## Setup (once)

```bash
cd worker
npm ci
npx wrangler login
npx wrangler kv namespace create zahraj-mi-ai   # put the printed id into wrangler.toml
npx wrangler secret put OPENROUTER_API_KEY
npm run deploy                                  # prints https://zahraj-mi-ai.<account>.workers.dev
```

Then set the repository variable `AI_API_URL` (Settings → Secrets and variables → Actions → Variables)
to the Worker URL and re-run the CI on `main`. The site then shows "I have an invite for AI reading".

## Inviting people

```bash
npm run invite -- "Jana Nováková"
```

It prints the `wrangler kv key put` command that stores the code, the link to send
(`https://romanzdk.github.io/zahraj-mi/?kod=…`, the app stores the code and removes it from the address bar)
and the command that revokes it.

## Results (2026-11-25, 6 Czech songbook photos, private test set)

Similarity = share of melody pitches matching a hand transcription (edit distance).

| Photo | homr (free, in browser) | Opus 5.5, page only | Sonnet 5.5, page + strips* | **Opus 5.5, page + strips** |
|---|---|---|---|---|
| Vánoční (464 px, blurry) | 74 % | 36 % | 45 % | **97 %** |
| U stromečku | 100 % | 100 % | | 100 % |
| Štědrej večer | 100 % | 100 % | | 100 % |
| Zelená se louka | 100 % | 100 % | | 100 % |
| Cost for all 6 photos | $0 | $0.31 | | $0.46 |
| Time per photo | 95–145 s (CI CPU) | 8–32 s | | 9–41 s |

\* Sonnet was only tried on Vánoční, with staff crops cut by hand.

## Measuring a model

```bash
OPENROUTER_API_KEY=... npm run eval -- ../path/to/photos anthropic/claude-sonnet-5.5,anthropic/claude-opus-5.5
```

Photos can have `<name>.txt` next to them with the expected MIDI pitches; the report (`eval-results/summary.md`)
shows similarity, cost and time per photo.

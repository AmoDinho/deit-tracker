# Deit

Photo-first food logging for a small group, starting in South Africa. You snap a meal, describe it, photograph a nutrition label, or search. The model only names the food and estimates grams. Calories and macros come from USDA foods plus foods the group has added. Nothing is saved until you confirm.

The screens follow the mockups in `docs/`. Phone layout uses a bottom tab bar. Desktop uses a top bar, a two-column today view, and a wider week history.

## Architecture

```text
Browser (Vite + React + Tailwind + shadcn)
  |  same-origin /api  (Vite proxy locally, reverse proxy in production)
  v
Hono on Node, or the Lambda handler in apps/api/src/lambda.ts
  |-- /api/auth/*     Better Auth (email/password, optional Google)
  |-- /api/graphql    GraphQL Yoga
  |-- /api/uploads    local photo POST when S3 is not configured
  |-- /api/files/*    local photo GET
  |
  +-- Postgres        embedded PGlite in .data/pglite, or Neon via DATABASE_URL
  +-- Photos          .data/uploads, or a private S3 bucket
  +-- AI              OpenAI-compatible API, DeepSeek by default
                      keyword fallback when AI_API_KEY is empty
```

| Piece | Where | Role |
| --- | --- | --- |
| Web app | `apps/web` | Responsive UI. Tailwind v4 and shadcn/ui. Installable as a PWA. |
| API | `apps/api` | GraphQL, auth, uploads, food matching, AI calls. |
| Domain | `packages/domain` | Mifflin–St Jeor targets, kJ/kcal, nutrition math, timezone dates. |
| Specs | `docs/` | Research, architecture, and the screen mockups. |

Meal photos are resized in the browser to about 1024 px, then uploaded with a presigned S3 URL or a local POST. A GraphQL mutation sends the image to the vision model and matches names against the food table. The confirm screen is the same for photo, text, and search. Label photos create a shared food so the rest of the group can search for it.

Data is scoped to the signed-in user, except the shared `food` table. Auth cookies are first-party when the browser talks to `/api` on the same origin. If the API moves to another host, put it on a sibling subdomain (`app.` and `api.`) and set Better Auth's trusted origins, or Safari will drop the session.

## Local setup

Requirements: Node 20.19+ or 22.12+ (Vite 8 will not build on older 20.x), and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:8787
- Health: http://localhost:8787/api/health

The Vite dev server proxies `/api` to the API, so sign-in cookies stay on port 5173. Leave `DATABASE_URL` empty to use embedded Postgres in `.data/pglite`. Photos land in `.data/uploads`. Both directories are gitignored.

A demo account is created on first boot unless `SEED_DEMO=false`:

- email: `demo@deit.app`
- password: `demopass`

Without `AI_API_KEY`, photo and text logging still work through a local keyword matcher, and label photos open a form you fill in yourself. Add a [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide.html) key as `FDC_API_KEY` if you want live USDA search on top of the seeded foods.

Other scripts:

```bash
npm run dev:web
npm run dev:api
npm run build
npm run db:seed
```

## Deploy

There is no billing, scan quota, or monetisation. Keep a modest `DAILY_AI_LIMIT` so an open sign-up cannot run up the model bill.

### Web

Static Vite build. On Vercel, use the repository root (the web app imports `@deit/domain` from the workspace):

- Install command: `npm install`
- Build command: `npm run build -w @deit/web`
- Output directory: `apps/web/dist`

`apps/web/vercel.json` rewrites client routes to `index.html`. Set `VITE_API_URL` only if the API is on another origin. Prefer leaving it empty and proxying `/api` to the API so auth cookies stay first-party.

### API

The supported runtime is the Node server:

```bash
npm run start -w @deit/api
```

Set the variables in `.env.example`. For a hosted database, use a Neon pooled connection string as `DATABASE_URL`. For photos, set `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`. The bucket stays private; the API issues presigned PUT and GET URLs.

`apps/api/src/lambda.ts` exports a Hono AWS Lambda handler for API Gateway. Bundle it before deploy — the source imports TypeScript files directly, which `tsx` accepts but Lambda does not. Point the function at that bundle, give it the same environment, and put the function behind the same parent domain as the web app.

Required production settings:

- `BETTER_AUTH_SECRET` — long random string, not the dev default
- `BETTER_AUTH_URL` — the origin the browser uses for `/api/auth` (the web origin if you proxy)
- `BETTER_AUTH_TRUSTED_ORIGINS` and `CORS_ORIGINS` — the web origin
- `SEED_DEMO=false`
- `AI_API_KEY` if you want real photo and label reading
- `AI_BASE_URL`, `AI_VISION_MODEL`, `AI_TEXT_MODEL` — defaults are DeepSeek `deepseek-flash`

Google sign-in appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Password reset links are printed by the API process until an email provider is wired to `sendResetPassword` in `apps/api/src/auth.ts`.

## Product notes

Onboarding calculates calorie and macro targets with Mifflin–St Jeor, an activity multiplier, and a goal pace. Loss pace is capped at 1% of body weight per week, and targets are not defaulted below 1,200 kcal (women) or 1,500 kcal (men) without a warning. Users can override any number. Energy can display as kcal or kJ; storage stays in kcal. South African labels that lead with kilojoules are converted with `kcal = kJ / 4.184`.

Out of scope for this version: barcode scanning, weight trends, saved meals, voice logging, adaptive weekly targets, streaks, and a nutrition coach. Those are listed as later phases in the research doc.

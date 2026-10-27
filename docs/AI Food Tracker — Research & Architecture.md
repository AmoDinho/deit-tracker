# AI Food Tracker — Research & Architecture

Oct 27, 2026 · @Amogelang

## Summary

We should build a photo-first tracker that always lets users correct the AI against a real nutrition database. Camera-only apps (Cal AI) win on speed but drift on accuracy; database apps (MyFitnessPal, Cronometer) win on accuracy but are slow to log. The gap is doing both well.

The product is a per-user React web app (desktop + mobile responsive) with open sign-up, used in South Africa and starting with you and a few friends. Users log meals by photo, text description, nutrition-label photo or search, and track calories and protein against personal goals. The backend is a fully serverless GraphQL API on AWS Lambda, with Postgres on Neon (or Supabase), Better Auth for sign-up/login, and S3 for meal photos.

The AI layer is provider-agnostic: DeepSeek (`deepseek-flash`, which accepts images) is the default, and any other AI API can be swapped in through configuration. Barcode scanning via Open Food Facts is out of scope for now because its South African coverage is thin; see the appendix.

At this scale (a handful of users) the app should run within free tiers apart from small AI costs, so there is no billing, scan quota or monetisation in scope.

Three principles drive the design:

- **AI proposes, user confirms.** The model identifies foods and portions; numbers come from a nutrition database, not the model's guess.
- **Logging under 10 seconds.** Photo, description, recents and "log again" must all be one or two taps.
- **Goals are calculated, not typed.** Onboarding derives calorie and macro targets from the user's body stats and objective.

## Market landscape

Every major tracker now offers photo, text and barcode logging; they differ in which one they optimise and whether the data behind it is verified. Premium plans cluster at $40–$100 a year, and AI photo logging is almost always the paywalled feature.

| App | Optimised for | Database | Photo AI | Approx. price/year | Lesson for us |
| --- | --- | --- | --- | --- | --- |
| [Cal AI](https://www.calai.app/) | Photo-first speed | Mixed | Core feature, trial | \~$40–60 | Speed sells; MyFitnessPal acquired it in 2026 |
| [MyFitnessPal](https://macaron.im/blog/best-ai-calorie-counter-apps) | Breadth (14M+ foods) | Crowdsourced, noisy | Premium only | $79.99–99.99 | Unverified entries vary widely (a banana logged at 80–140 kcal) |
| [Cronometer](https://macaron.im/blog/best-ai-calorie-counter-apps) | Precision, 84 nutrients | USDA + lab-verified | Gold only | $49.99–59.99 | Verified data builds trust; dense UI hurts |
| [MacroFactor](https://macaron.im/blog/best-ai-calorie-counter-apps) | Adaptive targets | Verified (NCC) | Yes | $71.99 | Weekly target recalculation from weight trend is the stand-out feature |
| [SnapCalorie](https://macaron.im/blog/best-ai-calorie-counter-apps) | Photo accuracy (depth sensor) | USDA-verified | 3 free/day | Paid tier | \~15% average calorie error, the most transparent benchmark |

Prices as reported by the source, verified March 2026; check live store listings before relying on them. Most comparison articles in this space are written by competing apps, so treat their accuracy claims as marketing until reproduced.

**Where we can win:** photo-first logging (Cal AI speed) on top of a verified database with one-tap correction (Cronometer trust), plus adaptive goals (MacroFactor) — on the web, where most rivals are mobile-only.

## User use cases

Three personas cover most of the market, and each needs a different logging path to be fast.

| Persona | Goal | Typical day | Must-have |
| --- | --- | --- | --- |
| Weight-loss starter | Lose 5–10 kg | Snaps most meals, forgets snacks | Photo logging, simple calorie ring, streaks and reminders |
| Gym / macro tracker | Hit 150 g+ protein daily | Repeats the same meals, weighs food | Recents, saved meals, "log again", precise grams, protein-first dashboard |
| Health-conscious eater | Eat better, not count obsessively | Restaurants, home cooking, mixed dishes | Text/voice description ("chicken curry with rice, about a cup"), weekly trends |

The core daily journey every persona shares:

1. Sign up and complete onboarding (body stats, goal, activity) → targets calculated.
2. Log breakfast by photo → AI suggests items and portions → user confirms or edits → saved.
3. Log lunch by text description, or repeat yesterday's lunch in one tap.
4. Photograph the nutrition label of a packaged snack the first time; after that, anyone in the group can find it by search.
5. Check the dashboard: calories and protein remaining, macros so far.
6. End of day: see the day summary; weekly view shows averages, weight trend and streak.

Edge cases to design for from day one: logging a meal after the fact (date/time picker), splitting a shared meal, correcting a wrong AI guess, offline or slow uploads on mobile, and deleting or editing past entries.

## Feature requirements

The MVP is sign-up, goals, four ways to log, and a daily dashboard; everything else follows once people log daily.

| Area | Feature | Phase |
| --- | --- | --- |
| Auth | Email/password + Google sign-in, password reset, per-user data isolation | MVP |
| Onboarding | Height, weight, age, sex, activity, goal → calculated calorie and macro targets | MVP |
| Goals | Edit targets manually; goal weight and pace | MVP |
| Logging | Photo → AI estimate → confirm/edit | MVP |
| Logging | Text description → AI parse → confirm/edit | MVP |
| Logging | Food search (USDA generics + foods the group has added) with serving sizes | MVP |
| Logging | Nutrition-label photo → AI reads per-100 g table → new food shared with the group | MVP |
| Logging | Meal slots (breakfast, lunch, dinner, snacks), recents, "log again" | MVP |
| Dashboard | Calories and protein rings; carbs and fat bars; remaining for today | MVP |
| History | Day view, edit/delete entries, weekly averages | MVP |
| AI | Swappable AI provider via config (DeepSeek default) | MVP |
| Weight | Log weight, trend line | Phase 2 |
| Logging | Saved meals and custom recipes | Phase 2 |
| Logging | Voice logging (speech → text → same parser) | Phase 2 |
| Goals | Adaptive weekly target recalculation from weight trend | Phase 2 |
| Engagement | Streaks, reminders (web push / email) | Phase 2 |
| AI | Nutrition coach chat ("what should I eat to hit protein?") | Phase 3 |
| Data | Micronutrients, water, CSV export | Phase 3 |
| Logging | Barcode scanning | Appendix (later) |

Non-functional requirements: responsive from 360 px phones to desktop, installable as a PWA so the camera and home-screen icon feel native, AI photo result in under 5 seconds, and all data scoped to the signed-in user.

## AI workflows

Every input ends in the same confirm screen, and calorie numbers always come from the food database, never from the model's own guess. The model's job is only to say what is on the plate and how many grams.

&#91;embedded content: meal logging pipeline · 4 inputs, one confirm step\]

Meal photos, label photos and text all go through the AI step; search goes straight to data. Nothing is saved until the user confirms.

How each AI step works:

- **Meal photo.** The browser uploads straight to S3 via a presigned URL (resized to \~1024 px first). A GraphQL mutation then sends the image to the vision model with a prompt that demands strict JSON: `[{name, grams, confidence, cooking_method}]`. Ask about hidden fats explicitly, since oils and sauces are the main source of error.
- **Text or voice.** Voice is transcribed (browser speech API), then the same parser prompt turns "two eggs and a slice of toast with butter" into items and grams.
- **Nutrition-label photo.** Replaces barcode lookup. The vision model reads the label's per-100 g table (energy in kJ, converted to kcal, plus protein, carbs, fat) and the product name, the user checks the numbers, and the product is saved to the shared `food` table so every friend can find it by search. SA labels give kJ, so convert: kcal = kJ ÷ 4.184.
- **Match.** Each item name is matched to a `food` row: exact cache hit first, then trigram search, then USDA search; the model can pick the best candidate from the top 5.
- **Follow-up question.** When confidence is low, ask one question ("Was this fried?", "About how big was the bowl?") rather than guess.

Timing: run the AI call synchronously from the Lambda for MVP (target under 5 s); move to an async job with a status field on `ai_analysis` if latency or timeouts become a problem.

### Swappable AI provider

The app talks to AI through one small interface, so changing provider is a config change, not a code change. DeepSeek's API is OpenAI-compatible and also offers an Anthropic-compatible endpoint, and [its vision guide](https://api-docs.deepseek.com/guides/vision) shows `deepseek-flash` accepting images as base64, URL or uploaded file, with each image capped at 1,024 tokens.

- **Interface.** An `AiProvider` with three methods: `analyzeMealPhoto(image)`, `parseMealText(text)` and `readNutritionLabel(image)`. Each returns the same validated JSON shape (checked with a Zod schema), whatever the provider.
- **Config, not code.** Set `AI_BASE_URL`, `AI_API_KEY`, `AI_VISION_MODEL` and `AI_TEXT_MODEL` per environment. Default: `https://api.deepseek.com` with `deepseek-flash` for both. Any OpenAI-compatible API (OpenAI, OpenRouter, Together, Groq, local Ollama) works with no new code; Claude or Gemini get a thin adapter, or go through OpenRouter.
- **Library option.** The Vercel AI SDK already wraps most providers behind one call with structured output, which saves writing adapters.
- **Prompts live in files,** versioned, with the model and prompt version stored on every `ai_analysis` row so results can be compared when you switch.
- **Send images by presigned S3 URL** or base64; DeepSeek fetches URLs itself, so the Lambda never has to load large images.

Accuracy to expect: photo AI averages roughly 15% calorie error in the best published benchmark ([SnapCalorie / Nutrition5k](https://macaron.im/blog/best-ai-calorie-counter-apps)), and is worst on mixed dishes, hidden oils and cuisines under-represented in training data. Barcode is the most accurate path for packaged food. Every user correction is stored, giving us a growing evaluation set.

## Nutrition data sources

Use USDA FoodData Central for generic foods and a shared `food` table the group fills by photographing labels. Both cost nothing; the AI maps its guesses onto these entries rather than inventing calorie numbers.

| Source | Use for | Access | Limits | Cost / licence |
| --- | --- | --- | --- | --- |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide.html) | Generic and whole foods (chicken breast, rice, banana, eggs) | Free data.gov API key, or bulk download once | 1,000 requests/hour per IP | Free; public domain (CC0) |
| Shared `food` table (ours) | South African packaged products, local dishes, home recipes | Created from label photos and manual entry, visible to all users | None | Free; our own data |
| [Open Food Facts](https://za.openfoodfacts.org/categories) | Barcodes | Keyless API | — | Free, but out of scope: see appendix |

Why not Open Food Facts for now: the API itself is free, but South African coverage is thin. Its largest SA category lists only around 500 products, so most barcodes your group scans would come back empty. For a handful of users, photographing a label once is cheaper and more reliable.

Practical notes:

- **Seed USDA once.** Import the FDC generic-food dataset into `food` at setup rather than calling the API per search.
- **Local dishes.** Add common SA meals (pap, chakalaka, bobotie, boerewors, bunny chow) as user foods or recipes early; USDA will not have them, and the AI matches better against named entries.
- **kJ, not kcal.** SA labels lead with kilojoules; store kcal internally and let users choose the display unit.
- **SAMRC food composition tables** are the authoritative SA source for generic foods, but licensing terms need checking before use.

## Goals and calculations

Targets are calculated at onboarding with the Mifflin-St Jeor equation, then adjusted by goal; users can override any number.

**1. Basal metabolic rate (BMR)** — weight in kg, height in cm, age in years:

```latex
BMR = 10w + 6.25h - 5a + s \quad (s = +5 \text{ male},\ -161 \text{ female})
```

**2. Total daily energy expenditure (TDEE)** = BMR × activity multiplier: sedentary 1.2, light 1.375, moderate 1.55, very active 1.725, extra active 1.9.

**3. Calorie target** = TDEE adjusted by goal:

| Goal | Adjustment | Example (TDEE 2,400 kcal) |
| --- | --- | --- |
| Lose \~0.5 kg/week | −500 kcal/day | 1,900 kcal |
| Lose \~0.25 kg/week | −250 kcal/day | 2,150 kcal |
| Maintain | 0 | 2,400 kcal |
| Gain (lean bulk) | +250 kcal/day | 2,650 kcal |

**4. Macro targets:** protein 1.6–2.2 g per kg body weight (default 1.8), fat 25–30% of calories, carbs fill the remainder. Protein and carbs are 4 kcal/g, fat 9 kcal/g.

**Guardrails:** never default a target below \~1,200 kcal (women) or \~1,500 kcal (men) without a warning, cap loss pace at 1% of body weight per week, and show a short note recommending a dietitian for users with medical conditions or a history of disordered eating.

**Phase 2 — adaptive targets:** each week, compare average logged intake with the weight trend to estimate real TDEE, then nudge the target (MacroFactor's core differentiator). Needs at least 2–3 weeks of consistent logging and weigh-ins.

## Architecture

The stack you described works as-is: a static React app on Vercel talks to a single GraphQL Lambda behind API Gateway, with Better Auth, Neon and S3 around it. Nothing runs on a server you manage.

&#91;embedded content: system architecture · Vercel front end, AWS serverless back end\]

The browser uploads photos straight to S3, so large images never pass through Lambda; the GraphQL Lambda does everything else.

| Layer | Choice | Why / notes |
| --- | --- | --- |
| Front end | React + Vite + TypeScript, Tailwind, Apollo Client (or urql), PWA | Static build hosts anywhere (Vercel, Netlify, S3 + CloudFront). Mobile-first layout; camera via `<input capture>` for meal and label photos |
| API | GraphQL on Lambda (Apollo Server or GraphQL Yoga) behind API Gateway HTTP API | One endpoint; schema-first with codegen for typed client hooks. AppSync is the managed alternative but makes Better Auth integration harder |
| Auth | [Better Auth](https://www.better-auth.com/docs/concepts/cookies) on its own Lambda route (`/api/auth/*`), email + Google | Host app and API on subdomains of one domain (`app.` and `api.`) and enable cross-subdomain cookies, or Safari will block the session cookie. Sign-up is open to everyone; require email verification and a modest per-user daily AI-call limit so strangers cannot run up the AI bill |
| Database | [Neon](https://neon.com/docs/guides/serverless-connection-pooling) Postgres, Drizzle ORM | Use the `-pooler` connection string, keep 1–2 connections per Lambda container. Supabase works too via its Supavisor pooler |
| Storage | Private S3 bucket, presigned PUT for upload and GET for display | Keys like `users/{userId}/meals/{mealId}.jpg`. Deploy in `af-south-1` (Cape Town) for low latency, or a cheaper region if cost matters more |
| AI | `AiProvider` interface; DeepSeek `deepseek-flash` by default, any OpenAI-compatible API via env config | Prompts return strict JSON validated with Zod; log provider, model and prompt version to `ai_analysis` |
| Infra as code | SST or AWS CDK (Serverless Framework also fine) | Separate dev and prod stages; secrets (AI key, DB URL) in SSM Parameter Store |
| Observability | Sentry + CloudWatch | Track AI latency and error rate |

Core GraphQL operations for the MVP: `me`, `dailySummary(date)`, `meals(date)`, `searchFoods(q)`, `createUploadUrl`, `analyzeMealPhoto(key)`, `parseMealText(text)`, `readNutritionLabel(key)`, `saveFood(input)`, `saveMeal(input)`, `updateMeal`, `deleteMeal`, `updateProfile`, `setGoals`.

## Data model

Eight core tables: Better Auth owns the auth tables, and every app table carries `user_id` so all queries are scoped to the signed-in user. Nutrition is stored per 100 g on `food` and snapshotted onto each `meal_item`, so editing a food never rewrites history.

| Table | Key columns | Notes |
| --- | --- | --- |
| `user`, `session`, `account`, `verification` | Managed by Better Auth | Generated by the Better Auth CLI migration |
| `profile` | user\_id, sex, birth\_date, height\_cm, activity\_level, goal\_type, goal\_pace, energy\_unit (kJ / kcal), timezone | One row per user; drives target calculation |
| `goal` | user\_id, effective\_from, calories, protein\_g, carbs\_g, fat\_g, source (calculated / manual / adaptive) | Versioned so past days show the targets in force then |
| `food` | id, source (usda / label / user / ai), source\_ref (FDC ID, nullable barcode for later), name, brand, kcal\_100g, protein\_100g, carbs\_100g, fat\_100g, fibre\_100g, label\_photo\_key, created\_by | Shared across the group: USDA seed plus label-photo and manual foods |
| `food_serving` | food\_id, label ("1 cup", "1 slice"), grams | Common portion sizes |
| `meal` | id, user\_id, eaten\_at, slot (breakfast / lunch / dinner / snack), note, photo\_key (S3), input\_type (photo / text / voice / label / search) | One row per logged meal |
| `meal_item` | meal\_id, food\_id, grams, kcal, protein\_g, carbs\_g, fat\_g, ai\_confidence, user\_edited | Snapshotted nutrition; flags show where AI was corrected |
| `ai_analysis` | id, user\_id, meal\_id, task (meal\_photo / meal\_text / label), status, provider, model, prompt\_version, raw\_request, raw\_response, latency\_ms, tokens | Audit trail; lets you compare providers after a switch |
| `weight_log` | user\_id, logged\_on, weight\_kg | Phase 2: trend line and adaptive targets |

Indexes: `meal (user_id, eaten_at)` for the daily dashboard, `food (source, source_ref)` unique for cache lookups, and trigram search on `food.name` for food search. A `daily_totals` view (or materialised table updated on write) keeps the dashboard to a single query.

## Risks, open questions and next steps

The biggest risk is AI accuracy on mixed and local dishes; the mitigation is the confirm-and-correct step plus logging every correction to measure and improve.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Photo estimates wrong on mixed dishes, hidden oils, local SA food | Targets drift | Always show editable items and grams; ask one follow-up ("cooked in oil?"); seed common SA dishes; track `user_edited` rate per food |
| DeepSeek quality on food photos untested | Poor estimates | Test on 20–30 of your own meals first; switch provider by config if another model does better |
| AI provider outage or model rename | Logging by photo stops | Provider and model in config; text and search logging still work without AI |
| Label reader misreads a number | Bad food shared with everyone | User confirms the parsed values before saving; show the label photo beside the numbers |
| Safari blocking auth cookies when API is on another domain | Login breaks on iPhone | Host app and API under one parent domain (`app.` and `api.`) with Better Auth cross-subdomain cookies |
| Lambda exhausting Postgres connections | Errors under load | Neon pooled endpoint or serverless HTTP driver (unlikely to bite at this scale) |
| Health data privacy (POPIA) | Users' data exposed | Private S3 bucket, presigned URLs, email verification, account deletion |
| Encouraging unhealthy restriction | User harm | Minimum calorie guardrails, no extreme pace options, dietitian note |

Open questions:

- [ ] Neon or Supabase? Neon fits a Lambda-plus-Better-Auth stack cleanly; Supabase adds its own auth and storage we would not use.
- [ ] Show energy in kJ, kcal, or let each user choose?
- [ ] Native app later (React Native / Expo) or PWA only?

Next steps:

1. Confirm the open questions above and pick a domain.
2. Quick DeepSeek test: 20–30 meal photos and 10 SA labels through `deepseek-flash`, comparing against weighed meals and the printed labels.
3. Scaffold: React + Vite on Vercel, GraphQL Lambda, Neon schema, Better Auth sign-up, `AiProvider` interface.
4. Ship MVP logging (search first, then text, label photo and meal photo).
5. Dashboard and goals, then hand it to friends.

## Appendix: barcode scanning (later)

Barcode scanning is deferred because no free source covers South African products well. Open Food Facts is free and keyless, but its South African catalogue is small, so most scans would miss.

A cheap path when it is worth adding:

1. Scan in the browser with a JavaScript barcode library (no cost).
2. Look up our own `food` table first by `source_ref`; once friends have photographed labels, attach the barcode to that food, so the group builds its own SA barcode list.
3. Fall back to the Open Food Facts product API, cached in `food` with ODbL attribution.
4. On a miss, prompt for a label photo, which reuses the existing label reader.

Open Food Facts is crowd-sourced, so the group could also contribute its label photos back to it, improving SA coverage over time.

## Sources

- [Macaron: Best AI calorie counter apps compared in 2026](https://macaron.im/blog/best-ai-calorie-counter-apps) — app pricing, databases, photo accuracy (verified March 2026)
- [Cal AI](https://www.calai.app/) — product overview
- [DeepSeek API: Vision](https://api-docs.deepseek.com/guides/vision) — `deepseek-flash` image input, limits, OpenAI- and Anthropic-compatible endpoints
- [USDA FoodData Central API guide](https://fdc.nal.usda.gov/api-guide.html) — rate limits, licence
- [Open Food Facts South Africa categories](https://za.openfoodfacts.org/categories) — SA product counts
- [Better Auth: cookies](https://www.better-auth.com/docs/concepts/cookies) — cross-subdomain cookies, Safari ITP
- [Neon: serverless connection pooling](https://neon.com/docs/guides/serverless-connection-pooling) — Lambda pooling guidance

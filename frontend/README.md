# Historical Figure · 以古为鉴

Historical Figure helps people think through a present dilemma using sourced historical decision cases. It identifies the structure of the decision, finds past decisions with similar mechanisms, uses **Jev by TypeSafe AI** to rate how well each one fits, and has a server-side LLM write conditional advice. Both Jev and the LLM are called through **OpenRouter** with a single API key, so all usage is billed to one OpenRouter account. It shows the sources, the important differences, and what would change the advice.

The full design rationale is in [docs/historical_figure_system_design.md](../docs/historical_figure_system_design.md). This folder is the website and its API: one Next.js app. The database schema, migrations and CSV import live in [`db/`](../db) and [`backend/`](../backend).

## Run it

Requires Node 20+. Run these from `frontend/`.

```bash
cd frontend
npm install
cp .env.example .env.local   # optional: preview mode needs no key; live mode needs OPENROUTER_API_KEY
npm run dev                  # http://localhost:3000
```

Production build:

```bash
npm run build && npm start   # http://localhost:3000
```

Checks:

```bash
npm run typecheck   # next typegen + tsc
npm run lint
npm test            # vitest: pipeline, validation, scoring, corpus, Jev adapter
```

## Modes

The server chooses the mode from `APP_MODE`; the browser cannot switch it.

| | Preview (`APP_MODE=demo`, default) | Live (`APP_MODE=live`) |
| --- | --- | --- |
| Example dilemmas | Prewritten sample analyses from the reviewed corpus, labelled "Sample analysis". Fit ratings are illustrative, not Jev output. | Fully analysed |
| Changed assumption | The rebuild example has a second prewritten variant for "rollback tested" | Profile, ranking and advice are recomputed |
| Your own text | An explicit preview limitation, plus approved cases that share wording, marked "not assessed for fit" | Fully analysed |
| Provider calls | None | Through OpenRouter: Jev for ranking and claim checks, Gemini 3.8 Flash for profiling and writing |

In live mode, provider failures never fall back to sample content:

- **Jev unavailable:** a `partial` result with unrated cases and no advice.
- **Writer unavailable:** Jev-rated cases without written comparisons or advice.
- **No OpenRouter key:** HTTP 503 `provider_unconfigured`.

The page itself always renders.

## Environment variables

All of them are server-only; none use the `NEXT_PUBLIC_` prefix. See [.env.example](.env.example).

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_MODE` | `demo` | `demo` or `live` |
| `OPENROUTER_API_KEY` | (none) | One key for both Jev and the LLM (required for live mode) |
| `JEV_MODEL` | `typesafe/jev-1.14` | Pinned Jev model on OpenRouter's System One API; the model that answered is recorded in each response |
| `JEV_API_URL` | `https://openrouter.ai/api/v1/systemone` | System One endpoint (same request/response shape as TypeSafe's own API) |
| `LLM_MODEL` | `google/gemini-3.8-flash` | OpenRouter model for profiling and writing; it must support `structured_outputs` (`anthropic/claude-opus-5.5` also works, at about 8× the cost) |
| `LLM_API_URL` | `https://openrouter.ai/api/v1/chat/completions` | OpenRouter chat completions endpoint |
| `LLM_EXTRACTION_EFFORT` / `LLM_SYNTHESIS_EFFORT` | `low` / `low` | `reasoning.effort` per call |
| `PIPELINE_DEADLINE_MS` | `180000` | Overall deadline per request |
| `ANALOGY_WEIGHTS` | `structural=0.45,incentives=0.25,constraints=0.20,time=0.10` | Application heuristic weights |
| `MIN_ANALOGY_FIT`, `CRITICAL_MISMATCH_THRESHOLD`, `STRUCTURAL_FLOOR`, `CHALLENGE_THRESHOLD` | 45, 0.6, 0.4, 0.6 | Eligibility gates |
| `CORPUS_DIR` | `seed-v0.1.0` | Folder in `data/corpus/`, or an absolute path |
| `DATABASE_URL` | (none) | Team PostgreSQL corpus; used in live mode when set |
| `CORPUS_SOURCE` | auto | `json` forces the seed even when `DATABASE_URL` is set |
| `CORPUS_VERSION` | latest published | Pin a corpus version |

## How a request flows

`POST /api/advice` → `getAdvice` ([src/lib/server/advice-service.ts](src/lib/server/advice-service.ts)) → live or demo pipeline. The service has no HTTP dependencies, so a later MCP or assistant adapter can call it directly.

1. **Validate:** Zod contract, length limits, rate limit and one overall deadline.
2. **Profile** ([profile/extract.ts](src/lib/server/profile/extract.ts)): options, actors, constraints, urgency, reversibility, unknowns and assumptions, with the user's interpretations kept apart from facts. Explicit constraints override inferred ones. It asks at most one targeted clarification, and only when the input is not a decision or the options are missing.
3. **Retrieve** ([retrieval/candidates.ts](src/lib/server/retrieval/candidates.ts)): approved cases only. With a small corpus every case goes to Jev; above 24 cases a lexical prefilter applies.
4. **Rank** ([ranking/](src/lib/server/ranking/)): four Jev Score questions (levels 0–4) plus a critical-mismatch Noul per case. Jev sees **pre-decision fields only**, with no chosen action or outcome. Every question names its target case explicitly. Batches are bounded and calls run with bounded concurrency and one retry.
   `analogy_fit = round(100 × (0.45·structural + 0.25·incentives + 0.20·constraints + 0.10·time))`, with each score normalised to 0–1.
   Independent gates for evidence, critical mismatch, structural floor and minimum fit mean a high score cannot force a match.
5. **Select** up to three diverse cases, then run a **counterexample pass**: a Jev Noul asks whether each other eligible case challenges the lead case's lesson. Outcomes are read only at this stage.
6. **Write** ([synthesis/](src/lib/server/synthesis/)): OpenRouter chat completions with a strict JSON-schema `response_format` generated from Zod, and `provider.require_parameters: true` so only endpoints that honour the schema are used. The answer is re-validated with Zod. Input is the decision profile, approved claims, exact passages, read-only ratings and recorded disputes.
7. **Validate** ([validation/](src/lib/server/validation/)):
   - Deterministic checks: case, claim and passage IDs; exact quotations; no URLs; next-step count; conditional recommendation; conflicting alternatives.
   - A Jev Choice check that each historical point's cited passages support it, plus a Jev Noul for conflicting advice.
   - One bounded repair. Failing items, and any advice that depended only on them, are then removed.
   - The result is `ready`, `partial` or `insufficient_evidence`.
8. **Assemble:** case metadata, ratings, quotations and links come from storage, never from the writer.

The client streams NDJSON progress events (real stage names) and receives the answer only after validation. A newer request aborts and supersedes an older one.

## Results timeline and story pages

- **After you submit:** the question collapses to one line ("Edit question" reopens the form), and the results show only one large left-to-right timeline. Points are the historical moments in date order, ending with **Today · Your decision**.
  - Points are evenly spaced with the gap between them labelled, because a proportional scale would crush 1962 and 1969 next to 480 BCE.
  - On phones the timeline scrolls sideways.
- **Hover or focus** a point for a quick summary: what they did, what happened, and the lesson.
- **Select a historical point** to open its details below the timeline:
  - what they did, what happened, and the lesson for you;
  - how it resembles your decision and where it differs;
  - the analogy-fit breakdown;
  - the sourced points (folded), sources and passages, and a link to the full story.
- **Select Your decision** for the advice: the recommendation, next steps, and what would change it, with re-run buttons. "How we read your decision" and "How this answer was checked" are folded.
- **Story pages** at `/cases/[id]` give a case's full story: the situation, the choice, what they did, what happened, the lesson or pattern, the limits of the comparison, and every claim with its exact passages and sources. "Back to your results" restores the analysis from memory; nothing is stored.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/advice` | `{ query, language: "en" \| "zh", max_cases: 1–3, constraints?, clarifications? }`. Returns JSON, or NDJSON progress plus result with `Accept: application/x-ndjson`. |
| `GET /api/cases/:id` | An approved case with its claims, passages and sources |
| `POST /api/mcp` | Remote MCP server (Streamable HTTP, stateless) with the read-only tools `get_historical_advice` and `get_historical_case`, for ChatGPT. Setup: [skills/chatgpt/README.md](../skills/chatgpt/README.md) |
| `GET /api/health` | Mode, corpus version, whether the OpenRouter key is configured (never the key itself), models and versions |

Response `status` is one of `ready`, `needs_clarification`, `insufficient_evidence` or `partial`. Each response carries `request_id`, `versions` (corpus, rubric, pipeline, weights, Jev model, LLM model), the `validation` report and warnings. Shared types are in [src/lib/contracts/advice.ts](src/lib/contracts/advice.ts).

```bash
curl -s localhost:3000/api/advice -H 'Content-Type: application/json' \
  -d '{"query":"We have one day left at a hackathon. Our backend partly works, but my teammate wants to replace it with a new framework tonight because it would be cleaner. I worry we will end up with nothing working for the demo. Should we agree to the rebuild?","constraints":{"rollback_tested":true}}'
```

## Deploying to Vercel

The front end and back end are one Next.js app. Vercel serves the pages, and runs each route under `src/app/api/` as a Vercel Function, so there is no separate backend to deploy.

```bash
npx vercel link                                  # from frontend/: create or link the project
npx vercel env add OPENROUTER_API_KEY production # paste the key when prompted
npx vercel env add DATABASE_URL production       # the team's PostgreSQL URL
npx vercel env add APP_MODE production           # "live" (or "demo" for preview only)
npx vercel deploy --prod
```

- `POST /api/advice` sets `maxDuration = 200` (seconds). That covers the 180 s pipeline deadline and is within Vercel's 300 s limit on every plan.
- The PostgreSQL pool registers with `attachDatabasePool` from `@vercel/functions`, so idle connections are released before a Fluid compute instance suspends. Every session is read-only.
- `.vercelignore` keeps `.env*`, tests and build output out of uploads, so secrets reach Vercel only as environment variables. Deploy with `vercel deploy --prod`, which builds on Vercel. Do **not** use `vercel build` + `vercel deploy --prebuilt` from a machine with a `.env.local`: Vercel's Next.js builder bundles root `.env*` files into the functions.
- The project is linked as `fwsciis-projects/historical-figure`. Connecting the GitHub repository for automatic deploys needs Vercel access to `dw711/AncientWisdom`.
- The rate limit is in memory per function instance. A public production URL in live mode can spend OpenRouter credit up to the key's limit; use Vercel Deployment Protection, or `APP_MODE=demo`, for a private or zero-cost deployment.

## Corpus and storage

The corpus sits behind the `CaseRepository` interface ([src/lib/server/corpus/repository.ts](src/lib/server/corpus/repository.ts)):

- `corpusVersion()` returns the version string.
- `listCandidates()` returns approved, outcome-free views.
- `getBundles(ids)` returns the full case, claims, passages and sources.

[getCaseRepository()](src/lib/server/corpus/index.ts) is the one place an implementation is chosen:

- **Live mode with `DATABASE_URL` set:** [PostgresCaseRepository](src/lib/server/corpus/postgres-repository.ts) reads the team's corpus (the `approved_case` view, `mechanism_annotation`, `event`, `claim`, `claim_passage`, `passage`, `source`, `corpus_version` and `corpus_version_case`).
  - It uses the latest published `corpus_version`, or `CORPUS_VERSION` if set, and caches a snapshot for `CORPUS_CACHE_SECONDS` (default 300).
  - Sessions are read-only. A dedicated read-only database role is still recommended over an admin account.
  - Passage hashes are re-verified, and claims reviewed as contradicted, or with contradicting passages, are excluded.
  - The published corpus is treated as reviewed. Every historical point the writer makes must still pass Jev's check against its cited passage.
  - Ranking never sees which stored option was chosen.
- **Preview mode, or no database:** the JSON seed below, because the prewritten samples cite its cases.

The seed fixture `data/corpus/seed-v0.1.0/` has one file per table:

| File | Record |
| --- | --- |
| `sources.json` | Title, institution, URL, archived URL, retrieval date, rights note |
| `passages.json` | Exact excerpt, locator, `sha256` content hash |
| `events.json` | Dates with precision |
| `cases.json` | Pre-decision fields, chosen action, outcome, mechanism tags, disputes, analogy limits, editorial lesson, review status |
| `claims.json` | Statement, type (observation, interpretation or outcome), phase, attribution, supporting passage IDs |

Schemas are in [schema.ts](src/lib/server/corpus/schema.ts). The repository refuses to serve a corpus that fails Zod validation, referential integrity or hash checks.

The seed holds three verified cases: Apollo 13, Apollo 11 and Challenger. Every passage was extracted programmatically from the fetched source page, so it is verbatim. nasa.gov was unreachable on 24 October 2026, so NASA pages were read from Internet Archive snapshots of the same URLs; each source records this. The production corpus is being built separately and should replace this fixture.

## Two-minute demo script

1. **(0:00)** Open the page. Point out the question, the limits note and the **Preview mode** badge, or **Live** if keys are set.
2. **(0:15)** Click **A risky rebuild before a deadline**, then **Find historical comparisons**. Progress messages appear while it works.
3. **(0:30)** Walk the sections in order:
   - **Your decision:** stated facts versus assumptions.
   - **Recommendation:** conditional, labelled as modern inference.
   - **Comparisons:** Challenger and Apollo 13, each with a fit rating. Open the rating to show it is a rubric rating, not a probability.
4. **(0:55)** Click a reference such as **[6]**. The drawer opens on the exact Commission passage, with links to the original and the archived copy. Note the *Accounts differ* box (Lovingood versus Reinartz).
5. **(1:15)** Scroll to **A challenging case**. Apollo 11 continued through alarms because a specialist diagnosed them and an abort remained possible.
6. **(1:30)** Under **What would change the advice**, click **Re-run with this change** ("rollback tested"). It is a fresh request with a new request ID. Apollo 11 now supports an isolated, time-boxed experiment, and Challenger becomes the challenge: agree the stop rule in advance.
7. **(1:50)** Close on **How this answer was checked**: evidence IDs, exact quotations, claim support and consistency, plus anything removed.
8. **(Optional)** Try **Funding runs out mid-year**. It shows an honest "no challenging case in the collection".

## Known limitations

- The seed corpus has only three cases, all of them aerospace; the analogies are narrow until the team corpus lands.
- Measured in live mode on 24 October 2026 with `typesafe/jev-1.14`:
  - `google/gemini-3.8-flash` (default): a full answer takes about 40 s and costs about $0.025.
  - `anthropic/claude-opus-5.5`: about 55–70 s and $0.17–0.19.
  - Jev ranking and claim checks cost under $0.001 per request. A repair, when one is needed, adds roughly another write.
- `LIVE_SMOKE=1 npx vitest run tests/live.smoke.test.ts` checks that Jev ranks a related dilemma above an unrelated control (costs under $0.001). Adding `LIVE_SMOKE_FULL=1` runs the whole pipeline (about $0.2).
- Each request's server log line records OpenRouter usage and cost (`usage.cost`) for Jev and the LLM separately; there is no per-request budget cap yet.
- Rate limiting is in-memory and per instance.
- Jev's primary language is English. Chinese input is accepted and the LLM writes in Chinese, but ranking accuracy may be lower.

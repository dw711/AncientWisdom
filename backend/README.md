# Backend: database integration

How the backend connects to and uses the historical corpus database. Read
`docs/historical_figure_system_design.md` §4 (data), §6 (retrieval and Jev) and
§9 (deployment) first; this file covers only the database side.

## 1. Connecting

| | |
| --- | --- |
| Service | Tiger Cloud `historical_figures`, ID `xw8booi7g6` |
| Region | `eu-west-1` |
| Engine | PostgreSQL with pgvector 0.8.7 (TimescaleDB is installed but unused) |
| Database / user | `tsdb` / `tsdbadmin` |

Get the connection string (needs the Tiger CLI, logged in to the project):

```sh
tiger db uri xw8booi7g6 --with-password
```

Put it in the backend's environment as `DATABASE_URL`. Never commit it, never send
it to the browser. `sslmode=require` is already in the URI; keep it.

```sh
# .env (gitignored)
DATABASE_URL=postgresql://tsdbadmin:...@xw8booi7g6.tiknvyl283.tsdb.cloud.timescale.com:30512/tsdb?sslmode=require
```

Python driver: `psycopg[binary,pool]` (v3) plus `pgvector` for the vector type:

```python
from psycopg_pool import AsyncConnectionPool
from pgvector.psycopg import register_vector_async

async def configure(conn):
    await register_vector_async(conn)

pool = AsyncConnectionPool(os.environ["DATABASE_URL"], min_size=1, max_size=10,
                           configure=configure, open=False)
# FastAPI lifespan: await pool.open() on startup, await pool.close() on shutdown
```

Keep the pool small (≤10); the service is 0.5 CPU / 2 GB.

**Before the public demo**, stop using `tsdbadmin` from the web backend. Create a
role that can read the corpus and write only traces and feedback (design §9.4):

```sql
CREATE ROLE hf_app LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA public TO hf_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hf_app;
GRANT INSERT ON request_trace, feedback TO hf_app;
```

`tsdbadmin` remains for migrations and the import job.

## 2. Migrations

Schema lives in `db/migrations/`, applied in filename order. The table
`schema_migration` records what has been applied:

```sql
SELECT * FROM schema_migration ORDER BY version;
```

Rules:

- Never edit a migration that has been applied. Add `0003_<what>.sql` instead.
- Each new migration ends with
  `INSERT INTO schema_migration (version) VALUES ('0003_<what>');`.
- Apply with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f db/migrations/0003_<what>.sql`
  (`-1` runs it in one transaction).
- If you change the embedding model's dimension, that is a migration:
  `ALTER TABLE case_embedding ALTER COLUMN embedding TYPE vector(<n>);`
  (only while the table is empty, or after deleting the old vectors).

## 3. Loading the corpus

The researched case index is in `data/merged-canonical-{cases,evidence,pairs}.csv`.
Load or reload it with:

```sh
DATABASE_URL="$(tiger db uri xw8booi7g6 --with-password)" \
  uv run backend/app/ingest/import_csv.py            # add --dry-run to test
```

The script validates every controlled value first and writes nothing if anything
is wrong. It is safe to re-run:

- Cases are upserted by `case_id`. If a case's content changed, its `version` is
  bumped and it goes back to `review_status = 'draft'`, even if it was approved.
- Claims whose statement changed go back to `support_status = 'unreviewed'`.
- Pairs that reference a case not yet in the database are skipped and reported;
  they load automatically once that case is added to the CSV.

Current contents: 27 cases, 101 sources, 495 passages, 412 claims, 501
claim–passage links, 9 pairs (P09–P11 wait on cases C35, C41, C43).

## 4. Review status and corpus versions

**Current state:** all 27 cases are `approved` and published as corpus version
`2026-10-24.1`. The approval was a bulk sign-off: 45 passages from 15 sources
were spot-checked word for word against the live sources, but individual claims
were not reviewed, so every `claim.support_status` is still `unreviewed`. Don't
display claims as "verified"; the validator's semantic support check (design
§7.4) still matters.

- Production code reads only approved cases (`approved_case`, or
  `review_status = 'approved'`), filtered to the configured corpus version.
- Cases added later arrive as `draft`. For development, make that a setting, e.g.
  `CORPUS_STATUSES=approved` in production and `CORPUS_STATUSES=draft,approved`
  locally, and show a visible "unreviewed" badge whenever a draft is returned.

Approving a case, once a human has checked its claims against the passages:

```sql
UPDATE claim SET support_status = 'supported' WHERE claim_id IN (...);  -- per claim
UPDATE decision_case
SET review_status = 'approved', reviewed_by = 'name', reviewed_at = now()
WHERE case_id = 'C29';
```

Publishing a corpus version (design §2 "Consistency": each response cites one):

```sql
INSERT INTO corpus_version (corpus_version, published_at, notes)
VALUES ('2026-10-25.1', now(), 'First reviewed demo set');
INSERT INTO corpus_version_case (corpus_version, case_id, case_version)
SELECT '2026-10-25.1', case_id, version FROM decision_case WHERE review_status = 'approved';
```

Put the current version in config (`CORPUS_VERSION=2026-10-24.1`) and filter
retrieval to `corpus_version_case` for that version, so a re-import cannot
silently change answers mid-demo.

## 5. Table map

| Table | Holds | Key points |
| --- | --- | --- |
| `decision_case` | One decision moment | See pre/post split below |
| `mechanism_annotation` | 1:1 with case | `mechanism_tags`, `mechanism_description` (the "when to retrieve" text), `reversibility`, `relationship`, `horizon` |
| `event` | 1:1 with case for now (`E-<case_id>`) | `start_year`/`end_year` (negative = BCE), `date_precision`, `date_display` (show this, not the years) |
| `claim` | Factual statements about a case | `claim_type`: observation / interpretation / outcome |
| `claim_passage` | Claim ↔ passage links | `relation`: supports / contradicts; `attribution` = whose view that passage expresses |
| `passage` | Verbatim source excerpts (<100 words) | The only text that may be quoted to users |
| `source` | Bibliographic record | Resolve URLs from here, never from LLM output (§7.4) |
| `case_relation` | Curated pairs | `relationship`: counterexample / conditional_contrast / comparative_pair / no_forced_pair; `fit_strength`; `critical_limit` |
| `case_embedding` | Vectors | **Empty**: see §7 |
| `corpus_version`, `corpus_version_case` | Published snapshots | Current: `2026-10-24.1` (27 cases) |
| `request_trace`, `feedback` | Operations | No raw dilemma text (§9.4) |

### Pre-decision vs post-decision fields

Design §6.2: Jev scores cases **without seeing the outcome**. Only these fields
may go into a Jev scoring request:

| Pre-decision (send to Jev) | Post-decision (fetch after selection) |
| --- | --- |
| `decision`, `context_before`, `situation_summary` | `chosen_action`, `outcome`, `outcome_uncertainty` |
| `goals`, `available_information`, `unknowns`, `constraints` | `disputed_points`, `analogy_limits` |
| `options[].text` (**not** `chosen` / `note`) | claims of type `outcome` |
| `reversibility`, `relationship`, `horizon` | `case_relation` rows |

`mechanism_description` is fine for **retrieval**, but some entries state the
lesson (e.g. C29: "preserving future options matters more than appearing
resolute"). Leave it out of the Jev scoring payload.

`research_notes` and `case_relation.change_note` are for reviewers only. Never
show them to users or send them to a model.

### JSON column shapes

```jsonc
// decision_case.options
[{"text": "Hold Brooklyn Heights", "chosen": false},
 {"text": "Leave Long Island by night", "chosen": true, "note": "chosen; council of war unanimous"}]

// decision_case.actors ("figures" is a best-effort split; display "display")
{"display": "Jimmy Carter, Anwar Sadat, and Menachem Begin",
 "figures": ["Jimmy Carter", "Anwar Sadat", "Menachem Begin"],
 "role": "Mediator and state leaders"}

// goals, available_information, unknowns, constraints, analogy_limits: arrays of strings
```

## 6. Queries the backend needs

All of these have been run against the live database.

### 6.1 Jev card (pre-decision only)

```sql
SELECT jsonb_build_object(
         'case_id', dc.case_id, 'decision', dc.decision,
         'context_before', dc.context_before,
         'goals', dc.goals, 'available_information', dc.available_information,
         'unknowns', dc.unknowns, 'constraints', dc.constraints,
         'options', (SELECT jsonb_agg(o->'text') FROM jsonb_array_elements(dc.options) o),
         'reversibility', ma.reversibility, 'relationship', ma.relationship,
         'horizon', ma.horizon) AS jev_card
FROM decision_case dc JOIN mechanism_annotation ma USING (case_id)
WHERE dc.case_id = ANY($1);
```

For ~30 cases, design §3.2 says to score all eligible cases rather than build
candidate search first. Use this with every approved case ID, batched by Jev's
token limits (§6.4).

### 6.2 Hybrid candidate retrieval (when the corpus grows)

Lexical (Postgres full-text) and semantic (pgvector) lists merged with
reciprocal rank fusion (§6.1). `plainto_tsquery` ANDs every word, which almost
never matches a whole dilemma, so the query below turns it into an OR:

```sql
WITH params AS (
  SELECT replace(plainto_tsquery('english', $1)::text, '&', '|')::tsquery AS q,
         $2::vector AS qvec                 -- query embedding
),
pool AS (
  SELECT dc.case_id, dc.version, dc.search_tsv, ma.search_tsv AS mech_tsv
  FROM decision_case dc JOIN mechanism_annotation ma USING (case_id)
  WHERE dc.review_status = ANY($3::review_status[])   -- '{approved}' in production
),
lexical AS (
  SELECT case_id, row_number() OVER (
           ORDER BY ts_rank(search_tsv, q) + ts_rank(mech_tsv, q) DESC) AS rnk
  FROM pool, params
  WHERE search_tsv @@ q OR mech_tsv @@ q
  LIMIT 50
),
semantic AS (
  SELECT e.case_id, row_number() OVER (ORDER BY min(e.embedding <=> qvec)) AS rnk
  FROM case_embedding e
  JOIN pool p ON p.case_id = e.case_id AND p.version = e.case_version, params
  WHERE e.embedding_model = $4
  GROUP BY e.case_id, qvec
  LIMIT 50
)
SELECT case_id, sum(1.0 / (60 + rnk)) AS rrf
FROM (SELECT * FROM lexical UNION ALL SELECT * FROM semantic) ranked
GROUP BY case_id
ORDER BY rrf DESC
LIMIT 24;
```

`decision_case.search_tsv` covers title, decision, situation summary and
context (no outcome). `mechanism_annotation.search_tsv` covers the mechanism
description. Both are English-only for now.

### 6.3 Full case card with evidence (after selection)

```sql
SELECT c.claim_id, c.claim_type, c.statement, c.support_status,
       jsonb_agg(jsonb_build_object(
         'relation', cp.relation, 'attribution', cp.attribution,
         'passage_id', p.passage_id, 'text', p.text, 'locator', p.locator,
         'source_id', s.source_id, 'title', s.title, 'author', s.author,
         'url', s.url, 'retrieved_at', s.retrieved_at, 'source_type', s.source_type
       ) ORDER BY cp.relation) AS evidence
FROM claim c
JOIN claim_passage cp USING (claim_id)
JOIN passage p USING (passage_id)
JOIN source s USING (source_id)
WHERE c.case_id = ANY($1)
GROUP BY c.claim_id
ORDER BY c.claim_id;
```

A claim with both `supports` and `contradicts` links is disputed (e.g. C22-CL16:
CDC supports, Snow's own 1855 account contradicts). Show both with attribution;
do not resolve it (design §7.2).

### 6.4 Counterexample candidates

```sql
SELECT r.*, CASE WHEN r.case_a = $1 THEN r.case_b ELSE r.case_a END AS other_case
FROM case_relation r
WHERE $1 IN (r.case_a, r.case_b)
  AND r.relationship IN ('counterexample', 'conditional_contrast')
  AND r.fit_strength IN ('strong', 'moderate');
```

Curated pairs are a starting point, not a substitute for the counterexample
pass in §6.5: the other case must still pass the same Jev relevance gate. Always
show `critical_limit` with a pair.

### 6.5 Writing a trace and feedback

```sql
INSERT INTO request_trace (request_id, client, status, corpus_version, rubric_version,
                           model_versions, stage_timings_ms, selected_cases, token_usage, cost_usd)
VALUES ($1, 'website', 'ready', $2, 'rubric-v1',
        '{"jev": "jev-1.14.0", "writer": "..."}',
        '{"retrieval": 41, "jev": 1830, "writer": 5120, "validate": 900}',
        '[{"case_id": "C29", "case_version": 1, "analogy_fit": 74}]',
        '{"jev_in": 9200, "writer_in": 6100, "writer_out": 800}', 0.031);

INSERT INTO feedback (request_id, case_id, kind) VALUES ($1, 'C29', 'misleading');
```

Never store the user's dilemma text in `request_trace`. A feedback `comment` is
rejected by the database unless `consent_to_store` is true.

## 7. Embeddings (not computed yet)

`case_embedding` is empty because the embedding model hasn't been chosen. Once
it is:

1. Check its dimension. If it isn't 1536, add a migration changing
   `vector(1536)` (§2 above).
2. For each case, embed two texts (design §6.1):
   - `situation`: `decision` + `situation_summary` + `context_before`
   - `mechanism`: `mechanism_description`
3. Insert with the case's current version:
   ```sql
   INSERT INTO case_embedding (case_id, representation_type, embedding_model, case_version, embedding)
   VALUES ($1, 'situation', 'text-embedding-3-small', $2, $3)
   ON CONFLICT DO NOTHING;
   ```
4. Re-embed whenever a case's `version` changes. Old rows can stay; queries join
   on `case_version = decision_case.version`.

Embed the user's query with the **same model**. Until embeddings exist, run the
lexical half of §6.2 alone (design §9.2 fallback). No vector index is needed at
this size; see the commented HNSW line in `0001_init.sql` for later.

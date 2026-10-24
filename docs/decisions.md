# Decisions

Resolved 24 October 2026, before the skills/MCP build. Supersedes any open
question in `historical_figure_system_design.md`. Where a decision was already
made by the shipped code, that is noted.

## A. Assistant surface: Claude Code, local stdio

**Decision:** Claude Code only. ChatGPT and claude.ai are out for the demo.

**Reason:** a remote connector (claude.ai) requires OAuth to hold any
credential, a public URL, and connector review — three failure modes we cannot
afford before judging. Claude Code spawns a local stdio server: no auth, no
public dependency, works offline. The website is the judge-facing product; the
assistant integration only has to prove F11 ("one assistant integration").
Keep the tool definitions transport-agnostic so a remote adapter can reuse
them later (design §8: "retain adapters for the next integration").

## B. MCP transport and hosting: thin local stdio wrapper over the one backend

**Decision:** a small Node script (`mcp/index.mjs`, `@modelcontextprotocol/sdk`
StdioServerTransport) that Claude Code spawns locally and which calls the
existing HTTP API. No second service, no separate process hosting.

**Reason:** the plan's FastAPI / Render / Fly / Railway / Supabase / Neon
questions are moot — the build already decided the stack: one Next.js app on
Vercel, Tiger Cloud PostgreSQL (pgvector 0.8.7 installed). Mounting MCP inside
that app as a second deployment would break the "one backend deployment" rule
(NFR Maintainability). The stdio wrapper is a *client* of the same API, so all
validation, corpus access, and synthesis stay in one place. Tools:
`get_historical_advice`, `get_historical_case` (read-only, per design §8.2).
The wrapper points at the Vercel URL in the demo, or `localhost:3000` in dev.

## C. Connector auth: none for the demo

**Decision:** no auth on the API or the MCP layer. Keep the shipped rate limit
(20 requests / 5 min per instance) and the Zod input caps; enable Vercel
Deployment Protection if the URL spreads.

**Reason:** a browser cannot hold a secret, so the website's public API must
stay open anyway; a token held only by the stdio wrapper would protect nothing.
Each live answer costs ~$0.025 and is rate-limited, so exposure is bounded.
A shared bearer token (env var + one middleware check, carried in the wrapper's
MCP config) is the first post-demo hardening, matching design §8.1's
"server-side integration credential" — but not this weekend.

## D. Writer LLM: keep `google/gemini-3.8-flash` (already decided in code)

**Decision:** no change. `LLM_MODEL` defaults to `google/gemini-3.8-flash`;
`anthropic/claude-opus-5.5` is the documented env fallback.

**Reason:** already shipped and measured: ~40 s and ~$0.025 per full answer,
vs 55–70 s and $0.17–0.19 for opus-5.5; supports structured outputs, which the
pipeline requires (`config.ts:113`, frontend README env table). The design doc
named no writer; the build resolved it — keep it.

## E. Embedding model: `openai/text-embedding-3-small`, deferred to post-demo

**Decision:** name it now, build it later.

**Reason:** 1,536 dimensions matches the existing `vector(1536)` column (no
migration), multilingual (Chinese queries against English cases), cheapest
reasonable option, and backend/README §7 already sketches the integration with
it. But embeddings are **not needed for the demo**: at 27 cases the pipeline
uses score-all with a lexical prefilter only above 24 cases, which is the
documented fallback (design §9.2). Deferring avoids a second provider key this
weekend. If OpenRouter cannot bill embeddings when we build it, accept a
separate OpenAI key then.

## F. Corpus language: English cases, answer in the query language

**Decision:** cases (and passages) stay English-only. The answer returns in the
query language (already implemented: `language: en | zh` in the contract,
Chinese profile and synthesis prompts). The Jev ranking rubric stays English —
an accepted, disclosed limitation.

**Reason:** passages are verbatim excerpts, and exact-quote validation is a
core product claim; translating cases breaks grounding and would require
re-verifying 27 cases against sources — not feasible this weekend. Chinese
input/output already works end-to-end in live mode. F1's acceptance ("a user
describes a dilemma in English or Chinese") is satisfied by bilingual input and
output over an English corpus. Multilingual embeddings (E) make Chinese queries
retrieve the English cases properly when built. In the assistant path, the
skill relays in the user's language.

## G. Clarification ownership: backend owns it; the skill relays

**Decision:** the backend returns `needs_clarification` with at most one
question (implementation limit, inside the plan's "at most two"). The MCP tool
schema mirrors the HTTP contract and accepts `clarifications: [{question,
answer}]` (already in `AdviceRequestSchema`, max 2). The skill's job: present
the question to the user, then re-call with the answers.

**Reason:** the backend owns the decision-structure knowledge and the
one-question discipline; the skill stays a thin relay ("the skill supplies the
workflow; the connected tool supplies the corpus and model-backed service").

## H. Follow-ups: stateless

**Decision:** no session IDs. The host re-sends the full dilemma plus the
changed constraint as a fresh request; every call gets a new `request_id`.

**Reason:** this is already how the website works ("Re-run with this change" is
a fresh request), it matches the privacy stance (no stored raw dilemmas, no
session store to build or secure), and the counterfactual-constraint demo works
identically in both surfaces. The skill instructions document the re-send
pattern explicitly.

## I. Double synthesis: tool returns structured JSON **and** pre-rendered markdown

**Decision:** `get_historical_advice` returns the validated structured response
plus a server-rendered markdown block. The skill instructs the host to display
the markdown mostly as-is: it may add one preamble sentence but must not alter
facts, quotes, or evidence links.

**Reason:** a host LLM rewriting the answer can hallucinate quotes and source
URLs — the exact failure design §8.4 warns about ("the host becomes responsible
for synthesis and may introduce new errors"). The canonical answer already
exists server-side; rendering it to markdown once (a small shared module,
reusable by future adapters) protects the evidence chain.

## J. Tool latency: accept ~40 s; do not expose evidence-only

**Decision:** one slow, honest tool call. No `evidence_only` MCP tool.

**Reason:** validation is the product claim; an evidence-only path would put
the host in charge of synthesis and drop the canonical-answer guarantee. The
demo presenter narrates while the tool runs (Claude Code visibly shows the call
in flight). MCP progress notifications are a possible later enhancement — not
this weekend.

## K. Feedback via MCP: no

**Decision:** no feedback tool in the MCP surface.

**Reason:** feedback writes data and design §8.2 keeps it separate from the
read-only lookup tools; F14 is a website concern (and unimplemented there too).
Nothing to demo this weekend.

## L. Themes and the spotlight case set

**Decision:** four themes, already embodied in the CSV: **Negotiation,
Leadership, Uncertainty, Commitment** (Preparation, C33/C34, stays as
expansion). Spotlight 12 cases for verification and demo:

| Theme | Cases |
| --- | --- |
| Negotiation | C01 Cuban Missile Crisis · C02 Zhu Zhiwu (烛之武) · C03 Mandela |
| Leadership | C10 Lincoln's cabinet · C11 Taizong & Wei Zheng (唐太宗/魏徵) · C13 Washington at Newburgh |
| Uncertainty | C19 Apollo 13 · C20 Apollo 11 alarms · C23 Kelsey / thalidomide |
| Commitment | C27 Shang Yang (商鞅) · C29 Washington's Brooklyn evacuation · C30 Fabius |

C02, C11, C27 (and C28 as an alternate) carry the Chinese cases, which the
bilingual demo needs for the 以古为鉴 story. Verification split (confirm with
the team): carol verifies the demo-path cases (C19, C20, C29 plus three used
in the assistant demo), FWSCII verifies the other six. **Rule: the verifier
must not be the researcher of that case** (independence, per design §4.4).

## M. `context_before`: researcher writes, a second person leak-checks

**Decision:** the case's researcher writes `context_before` from pre-decision
sources only. A different person re-reads it against the sources and flags
anything only knowable after the decision. This check is part of verifying the
12 spotlight cases (L).

**Reason:** the hindsight-bias design depends on this field, and the 27-case
corpus already has it written. The mechanical guard already exists: Jev payloads
contain pre-decision fields only, with a test enforcing it. The human
leak-check is the missing half.

## N. Thresholds: adopt the shipped defaults as demo values

**Decision:** keep the values already in code (`config.ts:123-126`), all
env-overridable:

| Gate | Value | Meaning |
| --- | --- | --- |
| `MIN_ANALOGY_FIT` | 45 | analogy_fit below this is a weak match: no lesson drawn, weak-match disclosure |
| `STRUCTURAL_FLOOR` | 0.4 | minimum normalised structural dimension |
| `CRITICAL_MISMATCH_THRESHOLD` | 0.6 | critical-mismatch Noul probability that vetoes a case |
| `CHALLENGE_THRESHOLD` | 0.6 | counterexample eligibility: P(case challenges the lesson) ≥ 0.6 |

**Reason:** they are shipped, tested, and reasonable starting values; they are
untuned by construction. Tuning happens against the 30-dilemma evaluation set
(design §11) after the demo, not the night before it.

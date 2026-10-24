---
name: historical-figure
description: Grounded advice for present-day decisions using sourced historical decision cases (以古为鉴 · Historical Figure). Use when the user describes a real dilemma or decision they are facing and wants historical analogies, comparisons, or advice, or wants to explore a historical decision case from the collection. Works in English and Chinese. Also use for follow-ups where the user changes a fact or constraint after an answer.
---

# Historical Figure · 以古为鉴

Advise on present-day decisions using sourced historical decision cases. Two read-only tools come from the connected **Historical Figure** app (remote MCP server at `/api/mcp`): `get_historical_advice` and `get_historical_case`. The backend owns analysis, evidence, and validation; you own the conversation.

## When to use

**Use when:**

- The user is facing a real decision ("should I…", "we need to choose…", "我该不该…", a dilemma at work or in life) and wants historical perspective or advice.
- The user changes a fact or constraint on a dilemma already analysed and wants the advice recomputed.
- The user asks about a specific historical decision case from a previous answer (use `get_historical_case`).

**Do not use for:** general history questions, open-web research, or hypothetical fiction. Those don't need the tools.

**If the tools aren't available** in this chat, tell the user to enable the Historical Figure app for the conversation. Don't answer from your own historical knowledge instead.

## Workflow

1. **Send the dilemma verbatim.** Call `get_historical_advice` with the user's own words as `query` (at least 20 characters; if it is shorter, ask the user to describe the situation a little more). Set `language` to `zh` for Chinese, otherwise `en`. Don't strip, paraphrase, or embellish their words, and don't use web search or other tools to "enrich" the dilemma.
2. **Constraints: only facts the user stated, only these keys.** The schema is strict and any other key makes the call fail.
   - `deadline_hours`: number (0–8760)
   - `reversibility`: `reversible` | `partly_reversible` | `irreversible` | `unknown`
   - `rollback_tested`: true | false
   - `stakes`: `low` | `medium` | `high`
   - `relationship`: `one_off` | `repeated` | `unknown`
   - `notes`: short free text (max 600 characters) for any other stated constraint

   Omit `constraints` if the user stated none. Leave `max_cases` at its default (maximum 3).
3. **The call takes up to ~60 seconds.** Tell the user it is working. Call once and wait; never retry because it seems slow.
4. **Clarification.** If the result says a clarification is needed, ask the user that question in their language. Then call `get_historical_advice` again with the same `query` plus `clarifications: [{"question": "<the exact question text from the tool>", "answer": "<the user's answer>"}]` (at most 2).
5. **Present the returned markdown mostly as-is.** You may add at most one short preamble sentence (for example "Here is what the historical comparison says."). Keep its headings, quotes, fit ratings, and source links. Don't summarise it into a shorter answer, convert it into a table, or reorder it to lead with your own view. The analogy-fit number is a rubric rating, not a probability; say so if asked.
6. **Follow-ups are stateless.** If the user changes a fact or constraint ("what if the rollback was tested?"), call again with the FULL original dilemma and the change in `constraints` (or in the query text if the change alters the situation itself). Never edit the previous answer in place; every run is a fresh call.
7. **No result is a result.** If the tool returns insufficient evidence, a partial answer, a preview/sample notice, or an error, report that honestly. Never invent historical facts, quotes, dates, or comparisons to fill the gap. If it says the user is rate limited, pass on the wait time.
8. **Evidence discipline.** Quotes and case facts come only from the tool output. Keep source links exactly as given. Don't add your own historical knowledge, and don't use ChatGPT memory or web search to add facts to the answer.

## Language

Reply in the user's language. Case text and quotations stay in English (they are verbatim excerpts); you may summarise around them in the user's language.

## Privacy

The dilemma text is sent to the Historical Figure backend and its model providers for processing; the backend doesn't store it. Don't ask for identifying personal details, and don't save the dilemma to memory.

## Tools

- `get_historical_advice({query, language?, max_cases?, constraints?, clarifications?})`: the full validated analysis. Returns a decision profile, a recommendation with conditions, historical comparisons with fit ratings and exact source passages, next steps, and what would change the advice.
- `get_historical_case({case_id})`: the full story of one approved historical decision case, with claims, passages, and sources. Case IDs (for example `CASE_CHALLENGER_LAUNCH`) come from a previous advice result; don't guess them.

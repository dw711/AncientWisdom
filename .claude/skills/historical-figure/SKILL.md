---
name: historical-figure
description: Grounded advice for present-day decisions using sourced historical decision cases (以古为鉴 · Historical Figure). Use when the user describes a real dilemma or decision they are facing and wants historical analogies, comparisons, or advice — or wants to explore a historical decision case. Works in English and Chinese. Also use for follow-ups like "what if this constraint changed".
when_to_use: "should I, decision, dilemma, what would history do, historical analogy, in the past, what would you do, constraint changed, re-run with"
---

# Historical Figure · 以古为鉴

Advise on present-day decisions using sourced historical decision cases. You have two read-only MCP tools from the connected `historical-figure` server: `get_historical_advice` and `get_historical_case`. The backend owns analysis, evidence, and validation; you own the conversation.

## When to use

Use when:

- The user is facing a decision ("should I…", "we need to choose…", a dilemma) and wants historical perspective or advice.
- The user changes a fact or constraint on a dilemma you already ran and wants the advice recomputed.
- The user asks about a specific historical decision case from a previous answer (use `get_historical_case`).

Do not use for: general history questions, open-web research, or hypothetical fiction — those don't call the tools.

## Workflow

1. **Send the dilemma verbatim.** Call `get_historical_advice` with the user's own words as `query`. Set `language` to match the user (`en` or `zh`). Pass `constraints` only for facts the user explicitly stated. Do not strip, paraphrase, or embellish their words.
2. **The call takes up to ~60 seconds.** Tell the user it is working. Never re-call in a loop because the first call has not returned.
3. **Clarification.** If the result asks for a clarification, relay the question to the user in their language. Then call `get_historical_advice` again with the same `query` plus `clarifications: [{question: "<the exact question text from the tool>", answer: "<the user's answer>"}]`.
4. **Present the returned markdown mostly as-is.** You may add at most one short preamble sentence (for example "Here is what the historical comparison says."). Never alter historical facts, quotations, source links, or ratings. The analogy-fit number is a rubric rating, not a probability — say so if asked.
5. **Follow-ups are stateless.** If the user changes a fact or constraint, re-send the FULL original dilemma with the change in `constraints` (or in the query text if the change alters the situation itself). Never edit or amend the previous answer in place; every run is a fresh call.
6. **No result is a result.** If the tool returns insufficient evidence, a partial answer, or an error, report that honestly. Never invent historical facts, quotes, dates, or comparisons to fill the gap.
7. **Evidence discipline.** Quotes and case facts come only from the tool output. Keep source links exactly as given. Do not add your own historical knowledge to the answer.

## Language

Reply in the user's language. Case text and quotations stay in English (verbatim excerpts); you may summarize around them in the user's language. Set `language: "zh"` for Chinese questions.

## Privacy

The dilemma text is sent to the backend and external model providers for processing; nothing is stored. Do not ask for identifying personal details, and do not offer to remember or save the dilemma.

## Tools

- `get_historical_advice({query, language?, max_cases?, constraints?, clarifications?})` — the full validated analysis: decision profile, recommendation with conditions, historical comparisons with fit ratings and exact source passages, next steps, and what would change the advice.
- `get_historical_case({case_id})` — the full story of one approved historical decision case with claims, passages, and sources.

# Assistant integrations

Both chatbots connect to the same remote MCP endpoint inside the Next.js app
(`/api/mcp`, Streamable HTTP, no auth) and expose three read-only tools:
`get_historical_evidence` (fast, default), `get_historical_case`, and
`get_historical_advice` (full validated pipeline, ~40–60 s). Rationale in
docs/decisions.md §A, §B, §C, §J.

The endpoint must be publicly reachable over HTTPS, so deploy the app to
Vercel first (`frontend/README.md` §Deploying to Vercel).

## Claude (claude.ai)

1. **Skill.** Zip the folder `skills/claude/historical-figure/` (the zip must
   contain `SKILL.md` at its root) and upload it as a skill on claude.ai.
2. **Connector.** In claude.ai: Settings → Connectors → Add connector →
   Remote. URL: `https://<your-deployment>/api/mcp`, transport Streamable
   HTTP, authentication **No sign-in**.
3. **Verify on the account you will demo with** — custom connectors are in
   beta and plan-dependent (Free allows one connector). Firewall/WAF rules
   must not block Anthropic's egress.

## ChatGPT

1. **Skill.** Zip the folder `skills/chatgpt/` (with `SKILL.md` at the zip
   root) and upload it as a skill in ChatGPT.
2. **MCP server.** Plugins → Add custom MCP server. URL:
   `https://<your-deployment>/api/mcp`, authentication **No authentication**.
   If the option is hidden, enable Developer mode under Settings → Apps.
3. **Verify on the demo account** — connector features vary by plan.

## Timeouts

Both hosts hard-cap a tool call around 60 s (ChatGPT may be stricter). That is
why the default tool is `get_historical_evidence` (~10–20 s): ranking is
outcome-blind and the host writes the comparison under the skill's rules. The
full `get_historical_advice` tool exists for users who explicitly want the
fully validated analysis; it is described as slow so the host calls it
deliberately.

## Testing before the demo

- `npm run typecheck && npm run lint && npm test` in `frontend/` covers the
  pipeline and the evidence path.
- Point the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
  at `http://localhost:3000/api/mcp` (demo mode needs no keys) or at the
  deployed URL.
- In demo mode the tools return prewritten sample analysis; live mode needs
  `OPENROUTER_API_KEY` (and `DATABASE_URL` for the team corpus).

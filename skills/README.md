# Assistant integrations

Both surfaces share the same two read-only tools and the same workflow
(docs/decisions.md §A–K). The Claude Code path is the demo surface.

## Claude Code (demo surface)

The skill is committed at `.claude/skills/historical-figure/SKILL.md`, so it
auto-loads in any session in this repo — no installation. It appears as
`/historical-figure` and triggers automatically on decision-dilemma requests.

The MCP server is configured in the repo's `.mcp.json`; Claude Code picks it
up at session start (approve the server when prompted). One-time setup:

```bash
cd mcp && npm install
```

Then start the backend (`cd frontend && npm run dev`) — the default
`HF_API_BASE` is `http://localhost:3000`. For the live deployment, change
`HF_API_BASE` in `.mcp.json` to the Vercel URL.

Test it by asking Claude: *"We have one day left at a hackathon. Our backend
partly works, but my teammate wants to replace it with a new framework
tonight because it would be cleaner. I worry we will end up with nothing
working for the demo. Should we agree to the rebuild?"* — then follow with
*"What if the rollback was tested?"* to show the stateless re-run.

## ChatGPT (package ready; remote endpoint deferred)

Per docs/decisions.md §A/B, ChatGPT is out of scope for the demo: it needs a
remote Streamable HTTP MCP endpoint (deferred) and its own connector
configuration. The package is complete, so activating it later is:

1. Mount a Streamable HTTP MCP route in the Next.js app exposing the same two
   tools (the service layer is already transport-agnostic).
2. Zip the `skills/chatgpt/` folder and upload it as a skill in ChatGPT.
3. Connect the MCP server in ChatGPT's MCP settings (Connected Apps) with the
   deployed endpoint URL.

Until then, nothing here needs to change: the `SKILL.md` instructions are
transport-agnostic and assume only that a `historical-figure` MCP server
provides `get_historical_advice` and `get_historical_case`.

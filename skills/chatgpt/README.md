# ChatGPT integration

Two parts:

| Part | Where |
| --- | --- |
| Remote MCP server (Streamable HTTP, stateless) | `POST /api/mcp` in the Next.js app: `frontend/src/app/api/mcp/route.ts`, tools in `frontend/src/lib/server/mcp/` |
| Skill | `skills/chatgpt/SKILL.md` |

The MCP route calls the same service layer as `/api/advice` and `/api/cases/:id`, in the
same deployment, so ChatGPT gets the same validated answers as the website. It exposes
the same two read-only tools, with the same descriptions and markdown output, as the
local stdio server for Claude Code (`mcp/` on `assistant-integration`).

## 1. Get a public HTTPS URL

ChatGPT connects from OpenAI's servers, so `localhost` won't work.

- **Deployed:** `https://<your-vercel-app>/api/mcp`. If Vercel Deployment Protection is
  turned on, ChatGPT is blocked too. Turn it off for the demo, or add a bypass.
- **Local:** run `npm run dev` in `frontend/`, then `cloudflared tunnel --url http://localhost:3000`
  (or `ngrok http 3000`), and use `https://<tunnel-host>/api/mcp`.

Check it from a terminal:

```sh
curl -s https://<host>/api/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 2. Connect it in ChatGPT

1. Settings → Apps & Connectors → Advanced → turn on **Developer mode**.
2. Create an app or connector: name `Historical Figure`, MCP server URL
   `https://<host>/api/mcp`, authentication **None** (docs/decisions.md §C).
3. In a chat, enable the app from the tools menu. Both tools are marked read-only, so
   ChatGPT shouldn't ask for confirmation before each call.

## 3. Add the skill

Zip the folder (`cd skills && zip -r historical-figure-chatgpt.zip chatgpt`) and upload it
as a skill. If skills aren't available on the plan you're demoing with, paste the body of
`SKILL.md` (everything below the front matter) into the project's or custom GPT's
instructions instead.

Menu names change often. Check them on the account you'll demo with.

## 4. Try it

> We have one day left at a hackathon. Our backend partly works, but my teammate wants to
> replace it with a new framework tonight because it would be cleaner. I worry we will end
> up with nothing working for the demo. Should we agree to the rebuild?

Then: *"What if the rollback was tested?"* ChatGPT should re-send the full dilemma with
`constraints: {"rollback_tested": true}`.

In preview mode (`APP_MODE` unset) this prompt returns the prewritten sample. Other
prompts return a partial "preview" answer. Live mode needs `APP_MODE=live` and the
OpenRouter key (see `frontend/README.md`).

## Limits for the demo

- No auth (docs/decisions.md §C). The tool applies the same per-client rate limit as
  `/api/advice`, but every ChatGPT user arrives from OpenAI's IP ranges, so they share
  one bucket.
- Each advice call takes ~40 s in live mode, within the route's `maxDuration` of 200 s.

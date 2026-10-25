# Historical Figure · 以古为鉴

Historical Figure helps people think through a present decision using sourced historical decision cases. It is an OxHack 2026 project.

| Folder | What it holds |
| --- | --- |
| [`frontend/`](frontend) | The website and its API: a Next.js app with the advice pipeline (Jev ranking, LLM synthesis, validation), story pages and Vercel configuration. Start with [frontend/README.md](frontend/README.md). |
| [`db/`](db) | PostgreSQL schema migrations for the historical corpus. |
| [`backend/`](backend) | Database guide and the CSV import job. |
| [`data/`](data) | Researched case, evidence and pairing data imported into the database. |
| [`docs/`](docs) | System design. |
| [`skills/`](skills) | Assistant integrations: skill packages for claude.ai and ChatGPT, backed by the remote MCP endpoint (`/api/mcp` in the frontend app). See [skills/README.md](skills/README.md). |

Quick start:

```bash
cd frontend
npm install
cp .env.example .env.local   # preview mode needs no keys
npm run dev                  # http://localhost:3000
```

## Installing the assistant skills

The Claude and ChatGPT skills both call the remote MCP endpoint at `/api/mcp` in the frontend app. The live deployment is at:

```
https://historical-figure-delta.vercel.app/api/mcp
```

If you run your own deployment, use its URL instead. The endpoint must be public HTTPS (see [frontend/README.md](frontend/README.md)). Each assistant needs two things: the **skill**, which tells the model how to use the tools, and the **connector**, which provides the tools.

### Claude (claude.ai)

1. Zip the skill. `SKILL.md` must be at the root of the zip:

   ```bash
   cd skills/claude/historical-figure
   zip -X ../../historical-figure-claude-skill.zip SKILL.md
   ```

2. Upload `skills/historical-figure-claude-skill.zip` as a skill on claude.ai (Settings → Capabilities → Skills → Upload skill).
3. Add the connector: Settings → Connectors → Add custom connector. URL: `https://historical-figure-delta.vercel.app/api/mcp`, with no sign-in.

### Claude Code

```bash
mkdir -p ~/.claude/skills
cp -r skills/claude/historical-figure ~/.claude/skills/
claude mcp add --transport http historical-figure https://historical-figure-delta.vercel.app/api/mcp
```

### ChatGPT

**Option A: plugin (recommended).** Upload [`skills/historical-figure-chatgpt-plugin.zip`](skills/historical-figure-chatgpt-plugin.zip) under Plugins → **+** → Create plugin. One package holds both the skill and the MCP server. Package all of it in that first upload, because ChatGPT accepts an MCP server only when a plugin is first created. To rebuild the zip after you edit the skill, see [skills/chatgpt-plugin/README.md](skills/chatgpt-plugin/README.md).

**Option B: separate skill and server.**

1. Zip the skill, with `SKILL.md` at the root:

   ```bash
   cd skills/chatgpt
   zip -X ../historical-figure-chatgpt-skill.zip SKILL.md
   ```

2. Upload the zip as a skill in ChatGPT.
3. Add the server: Plugins → Add custom MCP server. URL: `https://historical-figure-delta.vercel.app/api/mcp`, with no authentication. If the option is hidden, turn on Developer mode under Settings → Apps.

### Check it works

Ask either assistant about a real decision, for example *"Should I leave a stable job to start a company?"*. It should call `get_historical_evidence` and cite historical cases. Custom connectors depend on your plan, so test on the account you will demo with. [skills/README.md](skills/README.md) covers timeouts and testing with the MCP Inspector.

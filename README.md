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

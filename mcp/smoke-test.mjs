/**
 * End-to-end smoke test for the MCP server: spawns mcp/index.mjs over stdio
 * (exactly how Claude Code runs it) and calls both tools against a running
 * backend. Demo mode needs no provider keys, so the frontend dev server is
 * enough:
 *
 *   cd frontend && npm run dev     (in one terminal)
 *   HF_API_BASE=http://localhost:3000 node mcp/smoke-test.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const API_BASE = process.env.HF_API_BASE ?? "http://localhost:3000";

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [new URL("./index.mjs", import.meta.url).pathname],
    env: { ...process.env, HF_API_BASE: API_BASE },
    stderr: "inherit",
  })
);

const { tools } = await client.listTools();
console.log(`tools: ${tools.map((t) => t.name).join(", ")}`);
if (tools.length !== 2) throw new Error(`expected 2 tools, got ${tools.length}`);

const HACKATHON =
  "We have one day left at a hackathon. Our backend partly works, but my teammate wants to replace it with a new framework tonight because it would be cleaner. I worry we will end up with nothing working for the demo. Should we agree to the rebuild?";

function show(label, result) {
  console.log(`\n===== ${label} =====`);
  console.log(`isError: ${result.isError}`);
  for (const item of result.content ?? []) {
    console.log(`[${item.type}] ${item.text.slice(0, 1200)}${item.text.length > 1200 ? "\n…(truncated)" : ""}`);
  }
}

const advice = await client.callTool({
  name: "get_historical_advice",
  arguments: { query: HACKATHON, language: "en" },
});
if (advice.isError) throw new Error("advice call failed");
if (!advice.content.some((c) => c.text.includes("## Recommendation"))) {
  throw new Error("expected rendered markdown with a Recommendation section");
}
show("advice (preset query)", advice);

const clarificationPath = await client.callTool({
  name: "get_historical_advice",
  arguments: { query: HACKATHON, language: "en", constraints: { rollback_tested: true } },
});
show("advice (rollback_tested=true — fresh stateless call)", clarificationPath);

const caseDetail = await client.callTool({
  name: "get_historical_case",
  arguments: { case_id: "CASE_APOLLO13_TRIAGE" },
});
if (caseDetail.isError) throw new Error("case call failed");
show("case (Apollo 13)", caseDetail);

await client.close();
console.log("\nSMOKE OK");

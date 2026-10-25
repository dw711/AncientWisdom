# ChatGPT plugin package

Upload [`../historical-figure-chatgpt-plugin.zip`](../historical-figure-chatgpt-plugin.zip) in ChatGPT: Plugins → **+** → Create plugin. It bundles:

- `plugin.json`: the manifest (Agent Plugins 1.0.0 portable format).
- `mcp.json`: the remote MCP server at `https://historical-figure-delta.vercel.app/api/mcp` (Streamable HTTP, no authentication).
- `skills/historical-figure/SKILL.md`: the ChatGPT skill, copied from `skills/chatgpt/SKILL.md` on the `assistant-integration` branch.

ChatGPT accepts an MCP server only in the first upload of a plugin, so keep the server and the skill in one package.

Rebuild the zip after changing any of these files:

    cd skills/chatgpt-plugin
    rm -f ../historical-figure-chatgpt-plugin.zip
    zip -X -r ../historical-figure-chatgpt-plugin.zip plugin.json mcp.json skills

The `/api/mcp` endpoint exists only in deployments that include the `assistant-integration` code.

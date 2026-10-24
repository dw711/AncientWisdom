import type { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/server/mcp/server";

/** Same budget as /api/advice: get_historical_advice runs the full pipeline. */
export const maxDuration = 200;

const MAX_BODY_BYTES = 20_000;

/**
 * Remote MCP endpoint (Streamable HTTP) for ChatGPT and other remote hosts.
 * Stateless: every request gets a fresh server and transport, which suits
 * serverless instances and the stateless follow-up design (docs/decisions.md §H).
 */
async function handle(request: NextRequest): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "The request is too large." }, id: null }, { status: 413 });
  }
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const server = createMcpServer({ client, signal: request.signal });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };

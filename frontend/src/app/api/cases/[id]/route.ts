import type { NextRequest } from "next/server";
import { getCaseDetail } from "@/lib/server/case-service";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/cases/[id]">) {
  const { id } = await ctx.params;
  const requestId = `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const result = await getCaseDetail(id, requestId);
  return Response.json(result.body, { status: result.httpStatus, headers: { "Cache-Control": "no-store" } });
}

import type { NextRequest } from "next/server";
import type { ApiError } from "@/lib/contracts/advice";
import { CorpusError } from "@/lib/server/corpus";
import { getCaseDetail } from "@/lib/server/case-service";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/cases/[id]">) {
  const { id } = await ctx.params;
  const requestId = `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const notFound = (): Response =>
    Response.json({ request_id: requestId, error: { code: "invalid_request", message: "No approved case has that ID." } } satisfies ApiError, { status: 404 });
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return notFound();

  try {
    const body = await getCaseDetail(id);
    if (!body) return notFound();
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof CorpusError ? "The historical collection could not be loaded." : "Something went wrong.";
    return Response.json({ request_id: requestId, error: { code: err instanceof CorpusError ? "corpus_unavailable" : "internal_error", message } } satisfies ApiError, {
      status: 503,
    });
  }
}

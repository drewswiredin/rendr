import { handleBridgeRequest } from "@/lib/ai/codex/tool-bridge";

// The presentation tools, served to the `codex` CLI over MCP for the duration
// of one turn (see lib/ai/codex/tool-bridge). Only reachable with that turn's
// token, and only from this machine — the CLI is a child of this process.

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "parse error" },
      },
      { status: 400 },
    );
  }

  // Batches are legal JSON-RPC; Codex doesn't send them, but answering one
  // costs nothing.
  const requests = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const one of requests) {
    const response = await handleBridgeRequest(token, one);
    if (response) {
      responses.push(response);
    }
  }
  if (responses.length === 0) {
    return new Response(null, { status: 202 });
  }
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}

// Streamable HTTP clients may open a GET stream for server-initiated
// messages; this server never sends any.
export function GET() {
  return new Response("method not allowed", { status: 405 });
}

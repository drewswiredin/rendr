import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { stopLiveStream, subscribeLiveStream } from "@/lib/ai/live-streams";
import { getChat } from "@/lib/db/queries";
import { getGuestId } from "@/lib/guest";

type Params = { params: Promise<{ id: string }> };

// useChat `resume`: reconnect to a reply still being generated for this
// chat. 204 when there is none (the persisted messages are current) — that
// includes a brand-new chat, which useChat asks about before it exists.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const stream = subscribeLiveStream(id);
  if (!stream) {
    return new Response(null, { status: 204 });
  }
  const guestId = await getGuestId();
  if (!(await getChat({ id, guestId }))) {
    stream.cancel();
    return new Response(null, { status: 404 });
  }
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: UI_MESSAGE_STREAM_HEADERS,
  });
}

// The stop button: generation no longer ends with the request, so stopping
// is an explicit call.
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const guestId = await getGuestId();
  if (!(await getChat({ id, guestId }))) {
    return new Response(null, { status: 404 });
  }
  return Response.json({ stopped: stopLiveStream(id) });
}

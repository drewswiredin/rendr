import { getChat, getChatUsage } from "@/lib/db/queries";
import { getGuestId } from "@/lib/guest";

// Per-model totals for one chat. Grouped rather than summed so a chat that
// switched models shows where the tokens went.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guestId = await getGuestId();
  const chat = await getChat({ id, guestId });
  if (!chat) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ usage: await getChatUsage({ chatId: id }) });
}

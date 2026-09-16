import { listChats } from "@/lib/db/queries";
import { getGuestId } from "@/lib/guest";

export async function GET() {
  const guestId = await getGuestId();
  const chats = await listChats({ guestId });
  return Response.json({
    chats: chats.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.getTime(),
    })),
  });
}

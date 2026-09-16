import { deleteChat } from "@/lib/db/queries";
import { getGuestId } from "@/lib/guest";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guestId = await getGuestId();
  await deleteChat({ id, guestId });
  return Response.json({ ok: true });
}

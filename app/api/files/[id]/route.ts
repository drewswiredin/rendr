import { getGuestId } from "@/lib/guest";
import { readUpload } from "@/lib/uploads/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guestId = await getGuestId();
  const found = await readUpload({ id, guestId });
  if (!found) {
    return new Response("not found", { status: 404 });
  }
  return new Response(found.bytes, {
    headers: {
      "content-type": found.row.mediaType,
      "content-disposition": `inline; filename="${encodeURIComponent(found.row.name)}"`,
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

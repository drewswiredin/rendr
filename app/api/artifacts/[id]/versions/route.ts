import { getArtifact, listVersions } from "@/lib/artifacts/store";
import { getGuestId } from "@/lib/guest";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guestId = await getGuestId();
  const existing = await getArtifact({ id, guestId });
  if (!existing) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ versions: await listVersions({ id }) });
}

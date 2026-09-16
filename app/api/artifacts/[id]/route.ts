import { z } from "zod";
import { addVersion, getArtifact } from "@/lib/artifacts/store";
import { getGuestId } from "@/lib/guest";

const patchSchema = z.object({ content: z.string() });

// User edits from the stage: each save appends a version.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guestId = await getGuestId();
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const existing = await getArtifact({ id, guestId });
  if (!existing) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (existing.content === parsed.data.content) {
    return Response.json({ artifact: existing });
  }
  const artifact = await addVersion({ id, content: parsed.data.content });
  return Response.json({ artifact });
}

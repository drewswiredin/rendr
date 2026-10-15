import { getGuestId } from "@/lib/guest";
import { looksLikeText } from "@/lib/uploads/content";
import { MAX_UPLOAD_BYTES, saveUpload } from "@/lib/uploads/store";

// Accepts one or more files of any type as multipart/form-data ("files")
// and returns their served URLs, which the composer then attaches to the
// message. What the model can do with each one is decided at call time
// (lib/uploads/content).
export async function POST(request: Request) {
  const guestId = await getGuestId();
  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json(
      { error: "expected multipart form data" },
      { status: 400 },
    );
  }
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "no files" }, { status: 400 });
  }

  const results = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `${file.name} is larger than 20 MB` },
        { status: 413 },
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Browsers know no type for most source and config files and send them
    // as octet-stream; serving those as text keeps them viewable from the
    // chat, and the model-side classifier then has less to guess.
    const unknown = !file.type || file.type === "application/octet-stream";
    const mediaType = !unknown
      ? file.type
      : looksLikeText(bytes)
        ? "text/plain"
        : "application/octet-stream";
    results.push(
      await saveUpload({
        guestId,
        name: file.name || "upload",
        mediaType,
        bytes,
      }),
    );
  }
  return Response.json({ files: results });
}

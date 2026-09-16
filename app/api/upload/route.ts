import { getGuestId } from "@/lib/guest";
import {
  ALLOWED_MEDIA,
  MAX_UPLOAD_BYTES,
  saveUpload,
} from "@/lib/uploads/store";

// Accepts one or more files as multipart/form-data ("files") and returns
// their served URLs, which the composer then attaches to the message.
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
    const mediaType = file.type || "application/octet-stream";
    if (!ALLOWED_MEDIA.has(mediaType)) {
      return Response.json(
        { error: `unsupported file type: ${mediaType}` },
        { status: 415 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `${file.name} is larger than 20 MB` },
        { status: 413 },
      );
    }
    results.push(
      await saveUpload({
        guestId,
        name: file.name || "upload",
        mediaType,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }),
    );
  }
  return Response.json({ files: results });
}

import type { FileUIPart } from "ai";

// Turns the composer's data-URL attachments into stored files served by
// /api/files/<id>, returning file parts to attach to the message. One
// request per file: each is capped at 20 MB, and the server's body limit is
// set just above that (next.config).
export async function uploadAttachments(
  files: FileUIPart[],
): Promise<FileUIPart[]> {
  const uploaded: FileUIPart[] = [];
  for (const file of files) {
    const response = await fetch(file.url);
    const blob = await response.blob();
    const form = new FormData();
    form.append(
      "files",
      new File([blob], file.filename ?? "upload", {
        type: file.mediaType || blob.type,
      }),
    );
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? "Upload failed");
    }
    const json = (await res.json()) as {
      files: { url: string; name: string; mediaType: string }[];
    };
    for (const f of json.files) {
      uploaded.push({
        type: "file",
        url: f.url,
        mediaType: f.mediaType,
        filename: f.name,
      });
    }
  }
  return uploaded;
}

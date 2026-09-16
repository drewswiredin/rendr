import type { FileUIPart } from "ai";

// Turns the composer's data-URL attachments into stored files served by
// /api/files/<id>, returning file parts to attach to the message.
export async function uploadAttachments(
  files: FileUIPart[],
): Promise<FileUIPart[]> {
  const form = new FormData();
  for (const file of files) {
    const response = await fetch(file.url);
    const blob = await response.blob();
    form.append(
      "files",
      new File([blob], file.filename ?? "upload", {
        type: file.mediaType || blob.type,
      }),
    );
  }
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
  return json.files.map((f) => ({
    type: "file",
    url: f.url,
    mediaType: f.mediaType,
    filename: f.name,
  }));
}

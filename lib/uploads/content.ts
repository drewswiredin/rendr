import "server-only";

// What the model gets for a stored attachment. Any file can be attached;
// the model sees the ones it can read (images and PDFs as themselves, text
// of any kind inlined) and a description of the rest.

export const MODEL_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

// Inlined text is capped so a large log or dataset can't swamp the context.
export const MAX_INLINE_TEXT_CHARS = 100_000;

// Text is anything that decodes as UTF-8 with no NUL bytes in its head.
// Browsers report no media type for most source files, so the bytes decide.
export function looksLikeText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) {
    return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head);
    return true;
  } catch {
    return false;
  }
}

export type AttachmentModelPart =
  | { type: "file"; mediaType: string; url: string; filename?: string }
  | { type: "text"; text: string };

export function attachmentModelPart({
  name,
  mediaType,
  bytes,
}: {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}): AttachmentModelPart {
  if (MODEL_IMAGE_TYPES.has(mediaType) || mediaType === "application/pdf") {
    return {
      type: "file",
      mediaType,
      filename: name,
      url: `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`,
    };
  }
  if (looksLikeText(bytes)) {
    const text = Buffer.from(bytes).toString("utf8");
    const clipped = text.length > MAX_INLINE_TEXT_CHARS;
    const body = clipped ? text.slice(0, MAX_INLINE_TEXT_CHARS) : text;
    const note = clipped
      ? `\n[truncated: showing the first ${MAX_INLINE_TEXT_CHARS} of ${text.length} characters]`
      : "";
    return {
      type: "text",
      text: `<attachment name="${name}" type="${mediaType}">\n${body}${note}\n</attachment>`,
    };
  }
  return {
    type: "text",
    text: `<attachment name="${name}" type="${mediaType}" size="${formatBytes(bytes.byteLength)}">\n[binary file; its contents are not readable here]\n</attachment>`,
  };
}

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

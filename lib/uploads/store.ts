import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { upload } from "@/lib/db/schema";

// Attachments live on local disk next to the database. The row carries the
// metadata; the file is named by its id, so nothing user-supplied touches the
// filesystem path.

const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_MEDIA = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

export function fileUrl(id: string) {
  return `/api/files/${id}`;
}

export function uploadIdFromUrl(url: string): string | null {
  const match = /^\/api\/files\/([A-Za-z0-9-]+)$/.exec(url);
  return match ? match[1] : null;
}

export async function saveUpload({
  guestId,
  name,
  mediaType,
  bytes,
}: {
  guestId: string;
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}) {
  const id = crypto.randomUUID();
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, id), bytes);
  await db
    .insert(upload)
    .values({ id, guestId, name, mediaType, size: bytes.byteLength });
  return { id, url: fileUrl(id), name, mediaType, size: bytes.byteLength };
}

export async function readUpload({
  id,
  guestId,
}: {
  id: string;
  guestId: string;
}) {
  const row = await db.query.upload.findFirst({
    where: and(eq(upload.id, id), eq(upload.guestId, guestId)),
  });
  if (!row) {
    return null;
  }
  const bytes = await readFile(path.join(UPLOAD_DIR, id));
  return { row, bytes };
}

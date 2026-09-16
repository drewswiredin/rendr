import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { artifact, artifactVersion, chat } from "@/lib/db/schema";
import type {
  ArtifactKind,
  ArtifactSnapshot,
  ArtifactVersionSummary,
} from "./kinds";

type ArtifactRow = typeof artifact.$inferSelect;
type VersionRow = typeof artifactVersion.$inferSelect;

function toSnapshot(
  row: ArtifactRow,
  latest: VersionRow,
  versionCount: number,
): ArtifactSnapshot {
  return {
    id: row.id,
    chatId: row.chatId,
    title: row.title,
    kind: row.kind,
    content: latest.content,
    version: latest.version,
    versionCount,
    updatedAt: row.updatedAt.getTime(),
  };
}

async function latestVersion(artifactId: string) {
  return db.query.artifactVersion.findFirst({
    where: eq(artifactVersion.artifactId, artifactId),
    orderBy: desc(artifactVersion.version),
  });
}

// Artifacts belong to a chat, and chats belong to a guest; every lookup
// goes through the chat so a guest can only reach their own artifacts.
export async function getArtifact({
  id,
  guestId,
}: {
  id: string;
  guestId: string;
}): Promise<ArtifactSnapshot | null> {
  const row = await db
    .select({ artifact })
    .from(artifact)
    .innerJoin(chat, eq(chat.id, artifact.chatId))
    .where(and(eq(artifact.id, id), eq(chat.guestId, guestId)))
    .get();
  if (!row) {
    return null;
  }
  const latest = await latestVersion(id);
  if (!latest) {
    return null;
  }
  return toSnapshot(row.artifact, latest, latest.version);
}

export async function listArtifacts({
  chatId,
}: {
  chatId: string;
}): Promise<ArtifactSnapshot[]> {
  const rows = await db.query.artifact.findMany({
    where: eq(artifact.chatId, chatId),
    orderBy: desc(artifact.updatedAt),
    with: { versions: { orderBy: desc(artifactVersion.version), limit: 1 } },
  });
  return rows
    .filter((row) => row.versions.length > 0)
    .map((row) => toSnapshot(row, row.versions[0], row.versions[0].version));
}

export async function listVersions({
  id,
}: {
  id: string;
}): Promise<ArtifactVersionSummary[]> {
  const rows = await db.query.artifactVersion.findMany({
    where: eq(artifactVersion.artifactId, id),
    orderBy: asc(artifactVersion.version),
  });
  return rows.map((row) => ({
    version: row.version,
    content: row.content,
    createdAt: row.createdAt.getTime(),
  }));
}

export async function createArtifact({
  chatId,
  title,
  kind,
  content,
}: {
  chatId: string;
  title: string;
  kind: ArtifactKind;
  content: string;
}): Promise<ArtifactSnapshot> {
  const id = crypto.randomUUID();
  await db.insert(artifact).values({ id, chatId, title, kind });
  await db
    .insert(artifactVersion)
    .values({ id: crypto.randomUUID(), artifactId: id, version: 1, content });
  const row = await db.query.artifact.findFirst({ where: eq(artifact.id, id) });
  const latest = await latestVersion(id);
  if (!(row && latest)) {
    throw new Error("artifact not created");
  }
  return toSnapshot(row, latest, 1);
}

// Every change — agent or user — appends a version; nothing is edited in place.
export async function addVersion({
  id,
  content,
}: {
  id: string;
  content: string;
}): Promise<ArtifactSnapshot> {
  const latest = await latestVersion(id);
  if (!latest) {
    throw new Error("artifact not found");
  }
  const version = latest.version + 1;
  await db
    .insert(artifactVersion)
    .values({ id: crypto.randomUUID(), artifactId: id, version, content });
  await db
    .update(artifact)
    .set({ updatedAt: sql`(unixepoch('subsec') * 1000)` })
    .where(eq(artifact.id, id));
  const row = await db.query.artifact.findFirst({ where: eq(artifact.id, id) });
  if (!row) {
    throw new Error("artifact not found");
  }
  return toSnapshot(row, { ...latest, version, content }, version);
}

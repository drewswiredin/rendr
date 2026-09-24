import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const chat = sqliteTable("chat", {
  id: text("id").primaryKey(),
  guestId: text("guest_id").notNull(),
  title: text("title").notNull().default("New chat"),
  // Claude Agent SDK session backing this chat (subscription backend), so
  // later turns resume the transcript instead of replaying it.
  claudeSessionId: text("claude_session_id"),
  // Codex thread backing this chat (ChatGPT-subscription backend), for the
  // same reason.
  codexThreadId: text("codex_thread_id"),
  // The model and reasoning effort this chat last ran with, so reopening it
  // picks up where it left off instead of inheriting whatever the last chat
  // used.
  modelId: text("model_id"),
  effort: text("effort"),
  createdAt: timestamp("created_at"),
});

export const message = sqliteTable("message", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  // UIMessage parts, stored as JSON
  parts: text("parts", { mode: "json" }).notNull(),
  createdAt: timestamp("created_at"),
});

export const artifact = sqliteTable("artifact", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["html", "mermaid", "markdown"] }).notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const artifactVersion = sqliteTable("artifact_version", {
  id: text("id").primaryKey(),
  artifactId: text("artifact_id")
    .notNull()
    .references(() => artifact.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at"),
});

export const upload = sqliteTable("upload", {
  id: text("id").primaryKey(),
  guestId: text("guest_id").notNull(),
  name: text("name").notNull(),
  mediaType: text("media_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at"),
});

export const chatRelations = relations(chat, ({ many }) => ({
  messages: many(message),
  artifacts: many(artifact),
}));

export const messageRelations = relations(message, ({ one }) => ({
  chat: one(chat, { fields: [message.chatId], references: [chat.id] }),
}));

export const artifactRelations = relations(artifact, ({ one, many }) => ({
  chat: one(chat, { fields: [artifact.chatId], references: [chat.id] }),
  versions: many(artifactVersion),
}));

export const artifactVersionRelations = relations(
  artifactVersion,
  ({ one }) => ({
    artifact: one(artifact, {
      fields: [artifactVersion.artifactId],
      references: [artifact.id],
    }),
  }),
);

export type Chat = typeof chat.$inferSelect;
export type DBMessage = typeof message.$inferSelect;
export type Artifact = typeof artifact.$inferSelect;
export type ArtifactVersion = typeof artifactVersion.$inferSelect;
export type Upload = typeof upload.$inferSelect;

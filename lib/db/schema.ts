import { relations, sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

// One row per model call: the reply turns, and the title turn that has no
// message of its own. `cost_usd` is what OpenRouter charged, or what those
// tokens would have cost at list price on a subscription — `billed` says
// which. Null when the model had no price to look up.
export const usage = sqliteTable("usage", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }),
  messageId: text("message_id"),
  modelId: text("model_id").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  reasoningTokens: integer("reasoning_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  costUsd: real("cost_usd"),
  billed: integer("billed", { mode: "boolean" }).notNull().default(false),
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
  usage: many(usage),
}));

export const usageRelations = relations(usage, ({ one }) => ({
  chat: one(chat, { fields: [usage.chatId], references: [chat.id] }),
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
export type Usage = typeof usage.$inferSelect;

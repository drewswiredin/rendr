import {
  type ArtifactKind,
  type ArtifactSnapshot,
  artifactKinds,
} from "@/lib/artifacts/kinds";

// Some models can't deliver a large artifact as a tool call. Gemini emits a
// function call only once all of its arguments exist, and OpenRouter drops a
// stream that has carried nothing for 120 s, so a createArtifact call with a
// few thousand lines of HTML in it never arrives (text, by contrast, streams
// token by token for as long as it takes). Models flagged `inlineArtifacts`
// are told to write artifacts in the reply instead:
//
//   <rendr-artifact kind="html" title="Orbit simulator">
//   …complete content…
//   </rendr-artifact>
//
// This stage lifts those out of the text stream and re-emits them as the
// tool-call chunks createArtifact (or rewriteArtifact, when the tag carries
// an id) would have produced, writing the artifact when the tag closes. The
// client, the persisted message and the model's own history then look the
// same as on every other model.

export const ARTIFACT_TAG = "rendr-artifact";
const OPEN = `<${ARTIFACT_TAG}`;
const CLOSE = `</${ARTIFACT_TAG}>`;
// An opener this long without a `>` isn't a tag; the text goes out as is.
const MAX_OPENER = 600;

type Chunk = { type: string; id?: string; delta?: string };

export type ArtifactWriteResult =
  | { ok: true; artifact: ArtifactSnapshot; summary: string }
  | { ok: false; error: string };

export type ArtifactTagStore = {
  create(input: {
    title: string;
    kind: ArtifactKind;
    content: string;
  }): Promise<ArtifactWriteResult>;
  rewrite(input: { id: string; content: string }): Promise<ArtifactWriteResult>;
};

type Tag = {
  toolCallId: string;
  toolName: "createArtifact" | "rewriteArtifact";
  input: Record<string, string>;
  content: string;
  // Why the tag can't become an artifact, decided from its attributes.
  invalid?: string;
};

function isKind(value: string | undefined): value is ArtifactKind {
  return (
    value !== undefined && (artifactKinds as readonly string[]).includes(value)
  );
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([a-zA-Z_-]+)\s*=\s*"([^"]*)"/g)) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

// The longest suffix of `text` that could still grow into one of `patterns`;
// it has to be held back until the rest arrives.
function heldSuffix(text: string, patterns: string[]): number {
  let held = 0;
  for (const pattern of patterns) {
    const max = Math.min(pattern.length - 1, text.length);
    for (let n = max; n > held; n--) {
      if (pattern.startsWith(text.slice(text.length - n))) {
        held = n;
        break;
      }
    }
  }
  return held;
}

// JSON-escaped text without the surrounding quotes: appended to an open
// string in the partial tool input the client parses.
function escapeFragment(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

export function liftArtifactTags<T>(
  stream: ReadableStream<T>,
  store: ArtifactTagStore,
): ReadableStream<T> {
  // The text part the deltas belong to. Lifting a tag splits it: the part is
  // ended before the tool call and a fresh one is started for what follows.
  let text: { id: string; open: boolean } | undefined;
  let buffer = "";
  let tag: Tag | undefined;
  // Set when a tag has just opened: the newline after `>` isn't content.
  let stripNewline = false;

  type Controller = TransformStreamDefaultController<T>;
  const enqueue = (controller: Controller, chunk: object) => {
    controller.enqueue(chunk as T);
  };

  const emitText = (controller: Controller, delta: string) => {
    if (!delta) {
      return;
    }
    if (!text?.open) {
      text = { id: crypto.randomUUID(), open: true };
      enqueue(controller, { type: "text-start", id: text.id });
    }
    enqueue(controller, { type: "text-delta", id: text.id, delta });
  };

  const emitContent = (controller: Controller, delta: string) => {
    if (!(tag && delta)) {
      return;
    }
    tag.content += delta;
    enqueue(controller, {
      type: "tool-input-delta",
      toolCallId: tag.toolCallId,
      inputTextDelta: escapeFragment(delta),
    });
  };

  const openTag = (controller: Controller, rawAttributes: string) => {
    const attrs = parseAttributes(rawAttributes);
    const toolCallId = `tag_${crypto.randomUUID()}`;
    if (attrs.id) {
      tag = {
        toolCallId,
        toolName: "rewriteArtifact",
        input: { id: attrs.id },
        content: "",
      };
    } else {
      const kind = attrs.kind?.trim();
      tag = {
        toolCallId,
        toolName: "createArtifact",
        input: {
          title: attrs.title?.trim() || "Untitled",
          kind: isKind(kind) ? kind : "",
        },
        content: "",
        invalid: isKind(kind)
          ? undefined
          : `<${ARTIFACT_TAG}> needs kind="${artifactKinds.join('" | "')}" (got ${kind ? `"${kind}"` : "none"})`,
      };
    }
    if (text?.open) {
      enqueue(controller, { type: "text-end", id: text.id });
      text.open = false;
    }
    enqueue(controller, {
      type: "tool-input-start",
      toolCallId,
      toolName: tag.toolName,
    });
    // The input streams as JSON so the client's partial parse yields
    // { title, kind, content } while the content is still arriving.
    const head = Object.entries(tag.input)
      .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)},`)
      .join("");
    enqueue(controller, {
      type: "tool-input-delta",
      toolCallId,
      inputTextDelta: `{${head}"content":"`,
    });
  };

  const closeTag = async (controller: Controller, complete: boolean) => {
    if (!tag) {
      return;
    }
    const { toolCallId, toolName, input, content, invalid } = tag;
    tag = undefined;
    enqueue(controller, {
      type: "tool-input-available",
      toolCallId,
      toolName,
      input: { ...input, content },
    });
    const fail = (errorText: string) =>
      enqueue(controller, { type: "tool-output-error", toolCallId, errorText });
    if (!complete) {
      fail("The reply ended before the artifact was complete.");
      return;
    }
    if (invalid) {
      fail(invalid);
      return;
    }
    let output: ArtifactWriteResult;
    try {
      output =
        toolName === "rewriteArtifact"
          ? await store.rewrite({ id: input.id, content })
          : await store.create({
              title: input.title,
              kind: input.kind as ArtifactKind,
              content,
            });
    } catch (error) {
      output = {
        ok: false,
        error: `Failed to save artifact: ${String(error)}`,
      };
    }
    enqueue(controller, { type: "tool-output-available", toolCallId, output });
  };

  // Drains `buffer`, keeping back only what might be the start of a tag.
  const drain = async (controller: Controller) => {
    for (;;) {
      if (!tag) {
        const at = buffer.indexOf(OPEN);
        if (at === -1) {
          const held = heldSuffix(buffer, [OPEN]);
          emitText(controller, buffer.slice(0, buffer.length - held));
          buffer = buffer.slice(buffer.length - held);
          return;
        }
        const end = buffer.indexOf(">", at + OPEN.length);
        if (end === -1) {
          if (buffer.length - at > MAX_OPENER) {
            // Not a tag after all.
            emitText(controller, buffer.slice(0, at + OPEN.length));
            buffer = buffer.slice(at + OPEN.length);
            continue;
          }
          emitText(controller, buffer.slice(0, at));
          buffer = buffer.slice(at);
          return;
        }
        emitText(controller, buffer.slice(0, at));
        openTag(controller, buffer.slice(at + OPEN.length, end));
        buffer = buffer.slice(end + 1);
        stripNewline = true;
        continue;
      }
      if (stripNewline) {
        if (buffer === "") {
          return;
        }
        stripNewline = false;
        if (buffer.startsWith("\n")) {
          buffer = buffer.slice(1);
        }
      }
      const at = buffer.indexOf(CLOSE);
      if (at === -1) {
        const held = heldSuffix(buffer, [CLOSE, `\n${CLOSE}`]);
        emitContent(controller, buffer.slice(0, buffer.length - held));
        buffer = buffer.slice(buffer.length - held);
        return;
      }
      const body = buffer.slice(0, at);
      emitContent(controller, body.endsWith("\n") ? body.slice(0, -1) : body);
      buffer = buffer.slice(at + CLOSE.length);
      await closeTag(controller, true);
    }
  };

  return stream.pipeThrough(
    new TransformStream<T, T>({
      async transform(chunk, controller) {
        const c = chunk as Chunk;
        if (c.type === "text-start" && typeof c.id === "string") {
          text = { id: c.id, open: true };
          controller.enqueue(chunk);
          return;
        }
        if (c.type === "text-delta" && typeof c.delta === "string") {
          if (!text && typeof c.id === "string") {
            text = { id: c.id, open: true };
          }
          buffer += c.delta;
          await drain(controller);
          return;
        }
        if (c.type === "text-end") {
          // Whatever is held back can't become a tag any more…
          if (!tag && buffer) {
            emitText(controller, buffer);
            buffer = "";
          }
          // …but an open tag may continue in the next text part.
          if (text?.open) {
            enqueue(controller, { type: "text-end", id: text.id });
            text.open = false;
          }
          return;
        }
        controller.enqueue(chunk);
      },
      async flush(controller) {
        if (tag) {
          emitContent(controller, buffer);
          buffer = "";
          await closeTag(controller, false);
        } else if (buffer) {
          emitText(controller, buffer);
          buffer = "";
        }
        if (text?.open) {
          enqueue(controller, { type: "text-end", id: text.id });
          text.open = false;
        }
      },
    }),
  );
}

import "server-only";

import { tool } from "ai";
import { z } from "zod";
import {
  type ArtifactSnapshot,
  artifactKinds,
  kindLabels,
} from "@/lib/artifacts/kinds";
import {
  addVersion,
  createArtifact as createArtifactRow,
  getArtifact,
  listArtifacts as listArtifactRows,
} from "@/lib/artifacts/store";

// Tool outputs carry the full snapshot so the client can update the stage
// straight from the message stream; `toModelOutput` trims what the model sees
// so content isn't echoed back into context twice.

type ArtifactToolResult =
  | { ok: true; artifact: ArtifactSnapshot; summary: string }
  | { ok: false; error: string };

function summarize(result: ArtifactToolResult) {
  if (!result.ok) {
    return { type: "error-text" as const, value: result.error };
  }
  const { artifact, summary } = result;
  return {
    type: "text" as const,
    value: `${summary} — id: ${artifact.id}, kind: ${artifact.kind}, version ${artifact.version} of ${artifact.versionCount}`,
  };
}

const kindDescription = artifactKinds
  .map((kind) => `'${kind}' (${kindLabels[kind]})`)
  .join(", ");

export function artifactTools({
  chatId,
  guestId,
}: {
  chatId: string;
  guestId: string;
}) {
  const createArtifact = tool({
    description:
      "Create a new artifact in the shared workspace. YOU write the complete content. Use for living things the user will look at, revisit or iterate on: an interactive/animated piece (html), a diagram (mermaid), or a document (markdown).",
    inputSchema: z.object({
      title: z.string().min(1).max(120),
      kind: z.enum(artifactKinds).describe(kindDescription),
      content: z
        .string()
        .describe(
          "COMPLETE artifact content, raw — never wrapped in code fences. html: one complete self-contained HTML document. mermaid: bare mermaid source. markdown: the document.",
        ),
    }),
    execute: async ({ title, kind, content }): Promise<ArtifactToolResult> => {
      try {
        const artifact = await createArtifactRow({
          chatId,
          title,
          kind,
          content,
        });
        return { ok: true, artifact, summary: `Created "${title}"` };
      } catch (error) {
        return {
          ok: false,
          error: `Failed to create artifact: ${String(error)}`,
        };
      }
    },
    toModelOutput: ({ output }) => summarize(output),
  });

  const editArtifact = tool({
    description:
      "Make a targeted edit to an existing artifact by finding and replacing an exact string. Preferred for small changes; you wrote the content, so target it precisely. Issue edits to the SAME artifact one at a time, never in parallel.",
    inputSchema: z.object({
      id: z.string(),
      old_string: z
        .string()
        .min(1)
        .describe(
          "Exact text to find. Include enough surrounding lines to be unique.",
        ),
      new_string: z.string().describe("Replacement text"),
      replace_all: z
        .boolean()
        .optional()
        .describe("Replace every occurrence instead of only the first"),
    }),
    execute: async ({
      id,
      old_string,
      new_string,
      replace_all,
    }): Promise<ArtifactToolResult> => {
      const current = await getArtifact({ id, guestId });
      if (!current) {
        return { ok: false, error: "Artifact not found" };
      }
      if (!current.content.includes(old_string)) {
        return {
          ok: false,
          error:
            "old_string not found. Use readArtifact to see the current content — the user may have edited it.",
        };
      }
      // Function replacer keeps `$` patterns in new_string literal.
      const content = replace_all
        ? current.content.replaceAll(old_string, () => new_string)
        : current.content.replace(old_string, () => new_string);
      try {
        const artifact = await addVersion({ id, content });
        return { ok: true, artifact, summary: `Edited "${artifact.title}"` };
      } catch (error) {
        return { ok: false, error: `Failed to save edit: ${String(error)}` };
      }
    },
    toModelOutput: ({ output }) => summarize(output),
  });

  const rewriteArtifact = tool({
    description:
      "Replace an artifact's entire content. Use when the change is too large for editArtifact. The title and kind stay the same.",
    inputSchema: z.object({
      id: z.string(),
      content: z
        .string()
        .describe("The COMPLETE new content, raw, no code fences"),
    }),
    execute: async ({ id, content }): Promise<ArtifactToolResult> => {
      const current = await getArtifact({ id, guestId });
      if (!current) {
        return { ok: false, error: "Artifact not found" };
      }
      try {
        const artifact = await addVersion({ id, content });
        return { ok: true, artifact, summary: `Rewrote "${artifact.title}"` };
      } catch (error) {
        return { ok: false, error: `Failed to save: ${String(error)}` };
      }
    },
    toModelOutput: ({ output }) => summarize(output),
  });

  const readArtifact = tool({
    description:
      "Read an artifact's current content and bring it to the front of the user's stage. Use before editing if the user may have changed it, or if you no longer remember its exact content.",
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }): Promise<ArtifactToolResult> => {
      const artifact = await getArtifact({ id, guestId });
      if (!artifact) {
        return { ok: false, error: "Artifact not found" };
      }
      return { ok: true, artifact, summary: `Opened "${artifact.title}"` };
    },
    toModelOutput: ({ output }) =>
      output.ok
        ? {
            type: "text",
            value: `"${output.artifact.title}" (${output.artifact.kind}, version ${output.artifact.version} of ${output.artifact.versionCount}):\n\n${output.artifact.content}`,
          }
        : { type: "error-text", value: output.error },
  });

  const listArtifacts = tool({
    description:
      "List the artifacts in this conversation's workspace, most recently updated first — the same view the user has of the stage.",
    inputSchema: z.object({}),
    execute: async () => {
      const artifacts = await listArtifactRows({ chatId });
      return { artifacts };
    },
    toModelOutput: ({ output }) => ({
      type: "text",
      value:
        output.artifacts.length === 0
          ? "The workspace is empty."
          : output.artifacts
              .map(
                (a) =>
                  `- ${a.title} — id: ${a.id}, kind: ${a.kind}, version ${a.version} of ${a.versionCount}`,
              )
              .join("\n"),
    }),
  });

  return {
    createArtifact,
    editArtifact,
    rewriteArtifact,
    readArtifact,
    listArtifacts,
  };
}

export type ArtifactTools = ReturnType<typeof artifactTools>;

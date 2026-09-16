export const artifactKinds = ["html", "mermaid", "markdown"] as const;

export type ArtifactKind = (typeof artifactKinds)[number];

export const kindLabels: Record<ArtifactKind, string> = {
  html: "Interactive",
  mermaid: "Diagram",
  markdown: "Document",
};

// The shape both the server (tool results, API) and the client store use.
export type ArtifactSnapshot = {
  id: string;
  chatId: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  version: number;
  versionCount: number;
  updatedAt: number;
};

export type ArtifactVersionSummary = {
  version: number;
  content: string;
  createdAt: number;
};

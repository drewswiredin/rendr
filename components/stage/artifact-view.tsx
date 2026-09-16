"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Streamdown } from "streamdown";
import type { ArtifactKind } from "@/lib/artifacts/kinds";
import { PieceFrame } from "./piece-frame";

const plugins = { cjk, code, math, mermaid };

type ArtifactViewProps = {
  artifactId?: string;
  kind: ArtifactKind;
  content: string;
  title: string;
  streaming?: boolean;
};

// Preview rendering per kind. Editing happens in the source view, not here.
export function ArtifactView({
  artifactId,
  kind,
  content,
  title,
  streaming,
}: ArtifactViewProps) {
  if (!content.trim()) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Nothing here yet.
      </div>
    );
  }

  if (kind === "html") {
    // While streaming, an HTML document is half-written and would flash
    // broken states in an iframe; show the source instead until it lands.
    if (streaming) {
      return <SourcePre content={content} />;
    }
    return (
      <PieceFrame
        artifactId={artifactId ?? "preview"}
        html={content}
        title={title}
      />
    );
  }

  if (kind === "mermaid") {
    return (
      <div className="h-full overflow-auto p-4">
        <Streamdown
          className="[&_.streamdown-mermaid]:my-0"
          isAnimating={streaming}
          plugins={plugins}
        >
          {`\`\`\`mermaid\n${content}\n\`\`\``}
        </Streamdown>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-6 py-5">
      <Streamdown
        className="mx-auto max-w-3xl"
        codeBlockMaxHeight="none"
        isAnimating={streaming}
        plugins={plugins}
        tableMaxHeight="none"
      >
        {content}
      </Streamdown>
    </div>
  );
}

export function SourcePre({ content }: { content: string }) {
  return (
    <pre className="h-full w-full overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">
      {content}
    </pre>
  );
}

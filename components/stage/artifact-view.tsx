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
          // Mermaid draws at its natural size; on the stage let the diagram
          // (the svg with an aria role, not the toolbar icons) fill the pane.
          className="[&_[data-streamdown=mermaid]_.justify-center]:w-full [&_[data-streamdown=mermaid]_svg[aria-roledescription]]:h-[75vh] [&_[data-streamdown=mermaid]_svg[aria-roledescription]]:w-full"
          isAnimating={streaming}
          plugins={plugins}
        >
          {mermaidFence(content)}
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

// A fence longer than any run of backticks in the source, so a diagram whose
// labels mention ``` can't close the fence early.
function mermaidFence(source: string): string {
  const runs = [...source.matchAll(/`+/g)].map((m) => m[0].length + 1);
  const fence = "`".repeat(Math.max(3, ...runs));
  return `${fence}mermaid\n${source}\n${fence}`;
}

export function SourcePre({ content }: { content: string }) {
  return (
    <pre className="h-full w-full overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">
      {content}
    </pre>
  );
}

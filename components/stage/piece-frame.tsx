"use client";

import { useEffect, useRef } from "react";
import { useChatActions } from "@/components/chat/chat-context";
import { PieceHost } from "@/lib/pieces/host";
import { cn } from "@/lib/utils";
import { useArtifacts } from "@/stores/artifacts";

type PieceFrameProps = {
  artifactId: string;
  html: string;
  title: string;
  className?: string;
};

// Renders an html artifact through the MCP Apps host. A new host per
// content version: pieces are documents, not long-lived apps, so reloading
// on every edit is the simplest correct behaviour.
export function PieceFrame({
  artifactId,
  html,
  title,
  className,
}: PieceFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const { sendText } = useChatActions();
  const setPieceContext = useArtifacts((s) => s.setPieceContext);

  // Callbacks go through refs so a re-render never reloads the piece; only a
  // new artifact or new content does.
  const callbacksRef = useRef({ sendText, setPieceContext });
  callbacksRef.current = { sendText, setPieceContext };

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) {
      return;
    }
    const host = new PieceHost(iframe, {
      onMessage: (text) => callbacksRef.current.sendText(text),
      onContext: (text) =>
        callbacksRef.current.setPieceContext(artifactId, text),
    });
    host.load(html).catch((error) => {
      console.warn("[rendr] piece failed to load", error);
    });
    return () => {
      host.dispose();
      iframe.removeAttribute("src");
    };
  }, [artifactId, html]);

  return (
    <iframe
      className={cn("h-full w-full border-0 bg-transparent", className)}
      ref={ref}
      title={title}
    />
  );
}

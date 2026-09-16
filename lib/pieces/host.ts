"use client";

import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";

// MCP Apps host for agent-authored pieces. One PieceHost per iframe: loads the
// sandbox proxy (a second origin), connects an AppBridge with no MCP server
// behind it (the host supplies the HTML itself), and relays what the piece
// says back to the conversation.

const HOST_INFO = { name: "rendr", version: "1.0.0" };
const PROXY_READY = "ui/notifications/sandbox-proxy-ready";

export type PieceHostCallbacks = {
  onMessage?: (text: string) => void;
  onContext?: (text: string | null) => void;
  onSize?: (size: { width?: number; height?: number }) => void;
};

// The sandbox must live on a different origin from the app. In development
// that's the same server reached by the other loopback name; in production
// set NEXT_PUBLIC_SANDBOX_ORIGIN.
export function sandboxOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SANDBOX_ORIGIN;
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  const { protocol, hostname, port } = window.location;
  const other = hostname === "127.0.0.1" ? "localhost" : "127.0.0.1";
  return `${protocol}//${other}${port ? `:${port}` : ""}`;
}

// Injects the runtime shim so the piece can talk to the host. The agent writes
// an ordinary document; this is invisible to it.
export function wrapPiece(html: string, origin: string): string {
  const shim = `<script type="module" src="${origin}/piece-runtime.js"></script>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${shim}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${shim}</head>`);
  }
  return `<!doctype html><html><head>${shim}</head><body>${html}</body></html>`;
}

function currentTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export class PieceHost {
  private bridge: AppBridge | null = null;
  private themeObserver: MutationObserver | null = null;
  private disposed = false;

  constructor(
    private readonly iframe: HTMLIFrameElement,
    private readonly callbacks: PieceHostCallbacks,
  ) {}

  async load(html: string): Promise<void> {
    const origin = sandboxOrigin();
    const { iframe } = this;

    const proxyReady = new Promise<void>((resolve) => {
      const listener = ({ source, data }: MessageEvent) => {
        if (source === iframe.contentWindow && data?.method === PROXY_READY) {
          window.removeEventListener("message", listener);
          resolve();
        }
      };
      window.addEventListener("message", listener);
    });

    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-pointer-lock",
    );
    iframe.src = `${origin}/sandbox.html`;
    await proxyReady;
    if (this.disposed || !iframe.contentWindow) {
      return;
    }

    const bridge = new AppBridge(
      null,
      HOST_INFO,
      {
        openLinks: {},
        logging: {},
        message: { text: {} },
        updateModelContext: { text: {} },
      },
      {
        hostContext: {
          theme: currentTheme(),
          platform: "web",
          containerDimensions: { maxHeight: 6000 },
          displayMode: "inline",
          availableDisplayModes: ["inline"],
        },
      },
    );
    this.bridge = bridge;

    bridge.onmessage = async (params) => {
      const text = params.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();
      if (text) {
        this.callbacks.onMessage?.(text);
      }
      return {};
    };
    bridge.onupdatemodelcontext = async (params) => {
      const text = (params.content ?? [])
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();
      this.callbacks.onContext?.(text || null);
      return {};
    };
    bridge.onopenlink = async ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
      return {};
    };
    bridge.onsizechange = async (size) => {
      this.callbacks.onSize?.(size);
    };
    bridge.onrequestdisplaymode = async () => ({ mode: "inline" });
    bridge.onloggingmessage = (params) => {
      console.debug("[rendr piece]", params.data);
    };

    const initialized = new Promise<void>((resolve) => {
      bridge.oninitialized = () => resolve();
    });

    await bridge.connect(
      new PostMessageTransport(iframe.contentWindow, iframe.contentWindow),
    );
    await bridge.sendSandboxResourceReady({ html: wrapPiece(html, origin) });
    await initialized;

    // Mirror theme changes from the app into the piece.
    this.themeObserver = new MutationObserver(() => {
      bridge.sendHostContextChange({ theme: currentTheme() });
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  dispose() {
    this.disposed = true;
    this.themeObserver?.disconnect();
    this.bridge?.close().catch(() => {});
    this.bridge = null;
  }
}

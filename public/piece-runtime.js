// rendr piece runtime — injected into every html artifact by the host.
//
// Connects the piece to the host over the MCP Apps bridge, mirrors the host
// theme, reports its size, and exposes a tiny API the agent can rely on:
//
//   rendr.send(text)         send a message to the assistant as the user
//   rendr.setContext(value)  tell the assistant the piece's current state
//                            (string or JSON-able object); it is included
//                            with the user's next message
//   rendr.theme              "light" | "dark"
//   rendr.ready              promise resolved once connected
//
// Pieces work without the host too (plain preview): the API degrades to no-ops.

import { App, PostMessageTransport } from "./mcp-app.js";

const app = new App({ name: "rendr-piece", version: "1.0.0" }, {});

function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
  window.rendr.theme = t;
  window.dispatchEvent(new CustomEvent("rendr:theme", { detail: t }));
}

let connected = false;

window.rendr = {
  theme: "light",
  async send(text) {
    if (!connected || typeof text !== "string" || !text.trim()) return;
    await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
  },
  async setContext(value) {
    if (!connected) return;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    await app.updateModelContext({ content: [{ type: "text", text }] });
  },
  ready: null,
};

app.onhostcontextchanged = (ctx) => {
  if (ctx?.theme) applyTheme(ctx.theme);
};

window.rendr.ready = (async () => {
  try {
    if (window.self === window.top) return; // plain preview, no host
    await app.connect(new PostMessageTransport(window.parent, window.parent));
    connected = true;
    const ctx = app.getHostContext();
    if (ctx?.theme) applyTheme(ctx.theme);

    // Keep the host informed of our natural height (for inline embedding).
    let pending = null;
    const report = () => {
      pending = null;
      const h = Math.ceil(document.documentElement.scrollHeight);
      app.sendSizeChanged({ height: h }).catch(() => {});
    };
    const ro = new ResizeObserver(() => {
      if (pending === null) pending = requestAnimationFrame(report);
    });
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
    report();
  } catch (error) {
    console.warn("[rendr] host bridge unavailable:", error);
  }
})();

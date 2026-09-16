// Sandbox proxy for MCP Apps (adapted from modelcontextprotocol/ext-apps
// examples/basic-host). This page is served from an origin DIFFERENT from the
// rendr host — that separation is what keeps agent-authored code away from
// the app's cookies and storage. It relays JSON-RPC messages between the host
// (parent window) and the piece (inner iframe) and loads the piece HTML the
// host sends.

if (window.self === window.top) {
  throw new Error("sandbox.html only works inside an iframe");
}
if (!document.referrer) {
  throw new Error("no referrer; cannot determine the host origin");
}

const HOST_ORIGIN = new URL(document.referrer).origin;
const OWN_ORIGIN = new URL(window.location.href).origin;
if (HOST_ORIGIN === OWN_ORIGIN) {
  throw new Error("sandbox must be on a different origin from the host");
}

// Isolation self-test: reaching the top window must throw.
try {
  window.top.alert("sandbox is not isolated");
  throw "FAIL";
} catch (e) {
  if (e === "FAIL") throw new Error("sandbox is not isolated");
}

const inner = document.createElement("iframe");
inner.style = "width:100%; height:100%; border:none;";
inner.setAttribute(
  "sandbox",
  "allow-scripts allow-same-origin allow-forms allow-pointer-lock",
);
document.body.appendChild(inner);

const RESOURCE_READY = "ui/notifications/sandbox-resource-ready";
const PROXY_READY = "ui/notifications/sandbox-proxy-ready";

window.addEventListener("message", (event) => {
  if (event.source === window.parent) {
    if (event.origin !== HOST_ORIGIN) return;
    if (event.data && event.data.method === RESOURCE_READY) {
      const { html, sandbox } = event.data.params ?? {};
      if (typeof sandbox === "string") inner.setAttribute("sandbox", sandbox);
      if (typeof html === "string") {
        const doc = inner.contentDocument || inner.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();
        } else {
          inner.srcdoc = html;
        }
      }
      return;
    }
    inner.contentWindow?.postMessage(event.data, "*");
  } else if (event.source === inner.contentWindow) {
    if (event.origin !== OWN_ORIGIN) return;
    window.parent.postMessage(event.data, HOST_ORIGIN);
  }
});

window.parent.postMessage(
  { jsonrpc: "2.0", method: PROXY_READY, params: {} },
  HOST_ORIGIN,
);

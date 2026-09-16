// The library manifest for agent-authored pieces (html artifacts).
//
// A piece is a self-contained HTML document. Instead of bundling libraries,
// the runtime offers this pinned, load-tested menu: the agent picks whatever
// presents best, references the exact URL, and pays nothing for the rest. The
// sandbox CSP allows exactly these hosts. To offer a new library, add it here
// (and verify the URL) — nothing else changes.

export type ManifestEntry = {
  name: string;
  version: string;
  kind: "script" | "module" | "style";
  url: string;
  global?: string; // for classic scripts: the global it defines
  note: string;
};

export const CDN_HOSTS = [
  "https://cdnjs.cloudflare.com",
  "https://cdn.jsdelivr.net",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
] as const;

export const manifest: ManifestEntry[] = [
  // 2D drawing & animation
  {
    name: "p5.js",
    version: "2.3.3",
    kind: "script",
    global: "p5",
    url: "https://cdnjs.cloudflare.com/ajax/libs/p5.js/2.3.3/p5.min.js",
    note: "creative-coding canvas: sketches, particles, simple simulations (use instance mode: new p5(sketch, el))",
  },
  {
    name: "anime.js",
    version: "4.5.0",
    kind: "script",
    global: "anime",
    url: "https://cdnjs.cloudflare.com/ajax/libs/animejs/4.5.0/anime.umd.min.js",
    note: "timeline animation of DOM/SVG/values",
  },
  {
    name: "GSAP",
    version: "3.15.0",
    kind: "script",
    global: "gsap",
    url: "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/gsap.min.js",
    note: "robust tweening/timelines for DOM, SVG, canvas values",
  },
  {
    name: "Motion",
    version: "13.3.0",
    kind: "module",
    url: "https://cdn.jsdelivr.net/npm/motion@13.3.0/dist/motion.js",
    note: "ESM: import { animate, scroll } from '<url>'",
  },
  {
    name: "Konva",
    version: "10.5.0",
    kind: "script",
    global: "Konva",
    url: "https://cdnjs.cloudflare.com/ajax/libs/konva/10.5.0/konva.min.js",
    note: "2D canvas scene graph with drag/hit-testing",
  },
  {
    name: "PixiJS",
    version: "8.16.0",
    kind: "script",
    global: "PIXI",
    url: "https://cdnjs.cloudflare.com/ajax/libs/pixi.js/8.16.0/pixi.min.js",
    note: "fast WebGL 2D rendering for many sprites/particles",
  },
  {
    name: "Rough.js",
    version: "3.1.0",
    kind: "script",
    global: "rough",
    url: "https://cdnjs.cloudflare.com/ajax/libs/rough.js/3.1.0/rough.umd.js",
    note: "hand-drawn-look shapes on canvas/SVG",
  },

  // 3D & physics
  {
    name: "three",
    version: "0.186.0",
    kind: "module",
    url: "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
    note: "ESM 3D. Addons: https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/controls/OrbitControls.js (import { OrbitControls } from that URL; use an import map { 'three': '<three url>' } so addons resolve)",
  },
  {
    name: "matter-js",
    version: "0.20.0",
    kind: "script",
    global: "Matter",
    url: "https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js",
    note: "2D rigid-body physics",
  },
  {
    name: "cannon-es",
    version: "0.20.0",
    kind: "module",
    url: "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js",
    note: "ESM 3D physics, pairs with three",
  },

  // data, charts, diagrams
  {
    name: "d3",
    version: "7.9.0",
    kind: "script",
    global: "d3",
    url: "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js",
    note: "data-driven SVG: custom charts, force graphs, maps, scales",
  },
  {
    name: "Chart.js",
    version: "4.5.1",
    kind: "script",
    global: "Chart",
    url: "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.1/chart.umd.min.js",
    note: "standard charts, quick",
  },
  {
    name: "Plotly",
    version: "4.1.1",
    kind: "script",
    global: "Plotly",
    url: "https://cdnjs.cloudflare.com/ajax/libs/plotly.js/4.1.1/plotly.min.js",
    note: "scientific/3D/interactive plots (large, ~4MB)",
  },
  {
    name: "mermaid",
    version: "11.15.0",
    kind: "module",
    url: "https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.esm.min.mjs",
    note: "ESM diagrams inside a piece (prefer the mermaid artifact kind for a standalone diagram)",
  },
  {
    name: "cytoscape",
    version: "3.34.2",
    kind: "script",
    global: "cytoscape",
    url: "https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.34.2/cytoscape.min.js",
    note: "interactive graph/network layouts",
  },
  {
    name: "vis-network",
    version: "10.1.2",
    kind: "script",
    global: "vis",
    url: "https://cdn.jsdelivr.net/npm/vis-network@10.1.2/dist/vis-network.min.js",
    note: "physics-based network diagrams",
  },

  // math & text
  {
    name: "KaTeX",
    version: "0.18.6",
    kind: "script",
    global: "katex",
    url: "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.18.6/katex.min.js",
    note: "typeset math; also load the css and https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.18.6/contrib/auto-render.min.js for renderMathInElement",
  },
  {
    name: "KaTeX css",
    version: "0.18.6",
    kind: "style",
    url: "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.18.6/katex.min.css",
    note: "required with KaTeX",
  },
  {
    name: "math.js",
    version: "15.2.0",
    kind: "script",
    global: "math",
    url: "https://cdnjs.cloudflare.com/ajax/libs/mathjs/15.2.0/math.min.js",
    note: "expression parsing, units, matrices, symbolic algebra",
  },

  // maps, audio, misc
  {
    name: "Leaflet",
    version: "1.9.4",
    kind: "script",
    global: "L",
    url: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
    note: "maps; tiles from https://tile.openstreetmap.org/{z}/{x}/{y}.png are allowed",
  },
  {
    name: "Leaflet css",
    version: "1.9.4",
    kind: "style",
    url: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
    note: "required with Leaflet",
  },
  {
    name: "Tone.js",
    version: "15.5.36",
    kind: "script",
    global: "Tone",
    url: "https://cdnjs.cloudflare.com/ajax/libs/tone/15.5.36/Tone.js",
    note: "synthesis and sequencing (start audio from a user gesture)",
  },
  {
    name: "Howler",
    version: "2.2.4",
    kind: "script",
    global: "Howl",
    url: "https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js",
    note: "audio playback",
  },
  {
    name: "dayjs",
    version: "1.11.23",
    kind: "script",
    global: "dayjs",
    url: "https://cdnjs.cloudflare.com/ajax/libs/dayjs/1.11.23/dayjs.min.js",
    note: "dates",
  },
  {
    name: "lodash",
    version: "4.17.21",
    kind: "script",
    global: "_",
    url: "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js",
    note: "utilities",
  },
  {
    name: "Tailwind (play)",
    version: "4",
    kind: "script",
    url: "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4/dist/index.global.js",
    note: "utility classes without a build; fine for layout/controls, avoid for tiny pieces",
  },
];

export function manifestPrompt(): string {
  return manifest
    .map((m) => {
      const how =
        m.kind === "style"
          ? `<link rel="stylesheet" href="${m.url}">`
          : m.kind === "module"
            ? `import … from "${m.url}"`
            : `<script src="${m.url}"></script>${m.global ? ` → window.${m.global}` : ""}`;
      return `- ${m.name} ${m.version} — ${m.note}. ${how}`;
    })
    .join("\n");
}

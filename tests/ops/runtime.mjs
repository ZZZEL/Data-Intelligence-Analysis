import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
export const demoRoot = resolve(import.meta.dirname, "../..");

// Keep this list in the same order as src/launcher.js.  The runtime is made
// of small classic scripts so it can still be opened from a static server;
// tests use the same order without parsing an HTML document.
export const opsRuntimeScripts = [
  "src/ops/namespace.js",
  "src/ops/supply-chain-seed.js",
  "src/ops/seed.js",
  "src/ops/store.js",
  "src/ops/selectors.js",
  "src/ops/actions.js",
  "src/ops/file-processing.js",
  "src/ops/knowledge-context.js",
  "src/ops/dom.js",
  "src/ops/overlay.js",
  "src/ops/preview.js",
  "src/ops/directory-tree.js",
  "src/ops/charts.js"
];

export function loadOpsRuntime({ pages = [] } = {}) {
  globalThis.window = globalThis;
  globalThis.addEventListener = globalThis.addEventListener || (() => {});
  globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
  // Some UI helpers register listeners only when a browser document exists;
  // behavior tests provide the smallest safe stubs instead of a DOM emulator.
  globalThis.document = globalThis.document || {
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    documentElement: { clientWidth: 1280, clientHeight: 800 },
    activeElement: null,
    body: { addEventListener() {}, removeEventListener() {}, appendChild() {} }
  };
  for (const script of opsRuntimeScripts) require(resolve(demoRoot, script));
  globalThis.OpsDemo.ui.overlay = globalThis.OpsDemo.ui.overlay || {};
  globalThis.OpsDemo.ui.charts = globalThis.OpsDemo.ui.charts || {};
  globalThis.OpsDemo.core.router = globalThis.OpsDemo.core.router || { navigate() {} };
  for (const page of pages) require(resolve(demoRoot, `src/ops/${page}.js`));
  return globalThis.OpsDemo;
}

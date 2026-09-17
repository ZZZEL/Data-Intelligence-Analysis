(function bootstrapUnifiedDemo(window, document) {
  "use strict";

  var root = document.documentElement;
  var appRoot = document.getElementById("app");
  var mode = getMode(window.location.hash);

  var manifests = {
    client: {
      styles: ["assets/css/client/app.css?v=20260916-search-dialog-5", "assets/css/client/responsive.css?v=20260916-search-dialog-5"],
      scripts: ["src/client/fixture.js?v=20260916-search-dialog-5", "src/client/app.js?v=20260916-search-dialog-5"]
    },
    ops: {
      styles: [
        "assets/css/ops/base.css",
        "assets/css/ops/shell.css",
        "assets/css/ops/components.css",
        "assets/css/ops/pages.css",
        "assets/css/ops/documents.css",
        "assets/css/ops/responsive.css"
      ],
      scripts: [
        "assets/vendor/echarts.min.js",
        "src/ops/namespace.js",
        "src/ops/supply-chain-seed.js",
        "src/ops/seed.js",
        "src/ops/store.js",
        "src/ops/selectors.js",
        "src/ops/router.js",
        "src/ops/dom.js",
        "src/ops/overlay.js",
        "src/ops/preview.js",
        "src/ops/directory-tree.js",
        "src/ops/charts.js",
        "src/ops/actions.js",
        "src/ops/file-processing.js",
        "src/ops/knowledge-context.js",
        "src/ops/knowledge.js",
        "src/ops/documents.js",
        "src/ops/data-access.js",
        "src/ops/rag.js",
        "src/ops/models.js",
        "src/ops/api-access.js",
        "src/ops/consumption.js",
        "src/ops/app.js"
      ]
    }
  };

  function getMode(hash) {
    return /^#\/?(?:knowledge|local-documents|enterprise-connections|external-information|models|retrieval-config|retrieval-test|api-access|consumption)(?:[/?]|$)/.test(hash || "") ? "ops" : "client";
  }

  function updateModeAttribute(nextMode) {
    root.dataset.demoMode = nextMode;
  }

  function loadStyle(path) {
    return new Promise(function appendStyle(resolve, reject) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = path;
      link.dataset.demoStyle = mode;
      link.onload = resolve;
      link.onerror = function onError() { reject(new Error("无法加载样式：" + path)); };
      document.head.appendChild(link);
    });
  }

  function loadScript(path) {
    return new Promise(function appendScript(resolve, reject) {
      var script = document.createElement("script");
      script.src = path;
      script.dataset.demoScript = mode;
      script.onload = resolve;
      script.onerror = function onError() { reject(new Error("无法加载脚本：" + path)); };
      document.body.appendChild(script);
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showLoadError(error) {
    var message = error && error.message ? error.message : String(error);
    appRoot.innerHTML = '<main class="boot-error" role="alert"><h1>演示加载失败</h1><p>请通过本地 HTTP 服务打开页面，然后刷新重试。</p><code>' + escapeHtml(message) + "</code></main>";
  }

  function reloadForModeChange() {
    var nextMode = getMode(window.location.hash);
    if (nextMode !== mode) window.location.reload();
  }

  function start() {
    updateModeAttribute(mode);
    var manifest = manifests[mode];
    var styleQueue = manifest.styles.reduce(function chain(previous, path) {
      return previous.then(function load() { return loadStyle(path); });
    }, Promise.resolve());
    return styleQueue.then(function loadScripts() {
      return manifest.scripts.reduce(function chain(previous, path) {
        return previous.then(function load() { return loadScript(path); });
      }, Promise.resolve());
    });
  }

  // Expose the manifest for smoke tests and future adapters. The runtime is
  // still framework-free and does not require a build step.
  window.DataIntelligenceDemo = {
    mode: mode,
    manifests: manifests,
    getMode: getMode
  };
  window.addEventListener("hashchange", reloadForModeChange);
  start().catch(showLoadError);
})(window, document);

(function defineOverlay(OpsDemo) {
  "use strict";

  var current = null;
  var root = null;
  var preserveCloseDepth = 0;

  function overlayRoot() {
    root = root || document.getElementById("overlay-root");
    return root;
  }

  function close() {
    if (preserveCloseDepth > 0) return;
    current = null;
    overlayRoot().innerHTML = "";
  }

  function preserveDuring(callback) {
    preserveCloseDepth += 1;
    try {
      return callback();
    } finally {
      preserveCloseDepth -= 1;
    }
  }

  function panelHtml(kind, opts) {
    var dismissible = opts.dismissible !== false;
    var cancelButton = opts.cancelLabel === false ? "" : OpsDemo.ui.dom.button(opts.cancelLabel || "取消", { variant: "secondary", attrs: opts.cancelAttrs || "data-overlay-close" });
    return '<header class="' + kind + '__header"><h2 class="' + kind + '__title" id="overlay-title">' + OpsDemo.ui.dom.escape(opts.title || "") + "</h2>" +
      (opts.headerActions ? '<div class="' + kind + '__header-actions">' + opts.headerActions + "</div>" : "") +
      (dismissible ? '<button class="' + kind + '__close" type="button" data-overlay-close aria-label="关闭">' + OpsDemo.ui.dom.icon("x", 18) + "</button>" : "") + "</header>" +
      '<div class="' + kind + '__body">' + (opts.body || "") + "</div>" +
      (opts.footer === false ? "" : '<footer class="' + kind + '__footer">' +
        cancelButton +
        OpsDemo.ui.dom.button(opts.confirmLabel || "确认", { variant: opts.confirmVariant || "primary", attrs: "data-overlay-confirm" }) + "</footer>");
  }

  function focusFirstControl(container) {
    var firstInput = container.querySelector(".dialog__body input:not([type=hidden]), .dialog__body select, .dialog__body textarea, .drawer__body input:not([type=hidden]), .drawer__body select, .drawer__body textarea") ||
      container.querySelector("[data-overlay-confirm]") ||
      container.querySelector(".dialog__footer button, .drawer__footer button") ||
      container.querySelector("button");
    if (firstInput) window.setTimeout(function focus() {
      if (firstInput.isConnected) firstInput.focus();
    }, 0);
  }

  function open(options) {
    var opts = options || {};
    var kind = opts.kind === "drawer" ? "drawer" : "dialog";
    var widthClass = opts.wide && kind === "dialog" ? " dialog--wide" : "";
    var panelClass = opts.panelClass ? " " + OpsDemo.ui.dom.escape(opts.panelClass) : "";
    var dismissible = opts.dismissible !== false;
    var container = overlayRoot();
    var existingPanel = container.querySelector("." + kind);
    current = opts;
    if (existingPanel && container.querySelector(".overlay-backdrop")) {
      var backdrop = container.querySelector(".overlay-backdrop");
      backdrop.toggleAttribute("data-overlay-close", dismissible);
      existingPanel.className = kind + widthClass + panelClass;
      existingPanel.innerHTML = panelHtml(kind, opts);
      OpsDemo.ui.dom.hydrateIcons(existingPanel);
      focusFirstControl(existingPanel);
      return;
    }
    container.innerHTML = '<div class="overlay-backdrop"' + (dismissible ? " data-overlay-close" : "") + '></div>' +
      '<section class="' + kind + widthClass + panelClass + '" role="dialog" aria-modal="true" aria-labelledby="overlay-title">' + panelHtml(kind, opts) + "</section>";
    OpsDemo.ui.dom.hydrateIcons(container);
    focusFirstControl(container);
  }

  function confirm(options) {
    open(Object.assign({ kind: "dialog" }, options || {}));
  }

  function toast(title, message, tone) {
    var toastRoot = document.getElementById("toast-root");
    var node = document.createElement("div");
    var iconName = tone === "danger" ? "circle-x" : tone === "warning" ? "triangle-alert" : "circle-check";
    node.className = "toast";
    node.innerHTML = OpsDemo.ui.dom.icon(iconName, 18) + '<div class="toast__content"><div class="toast__title"></div><div class="toast__message"></div></div>';
    node.querySelector(".toast__title").textContent = title || "操作成功";
    node.querySelector(".toast__message").textContent = message || "页面数据已更新。";
    toastRoot.appendChild(node);
    OpsDemo.ui.dom.hydrateIcons(node);
    window.setTimeout(function remove() {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 3600);
  }

  document.addEventListener("click", function handle(event) {
    var closeTarget = event.target.closest("[data-overlay-close]");
    if (closeTarget) {
      event.preventDefault();
      var active = current;
      var shouldClose = !active || typeof active.onCancel !== "function" || active.onCancel(overlayRoot(), "close") !== false;
      if (shouldClose && current === active) close();
      return;
    }
    var confirmTarget = event.target.closest("[data-overlay-confirm]");
    if (confirmTarget && current) {
      event.preventDefault();
      var active = current;
      var shouldClose = active.onConfirm ? active.onConfirm(overlayRoot()) !== false : true;
      if (shouldClose && current === active) close();
    }
  });

  document.addEventListener("keydown", function handleKey(event) {
    if (event.key === "Escape" && current && current.dismissible !== false) {
      var active = current;
      var shouldClose = typeof active.onCancel !== "function" || active.onCancel(overlayRoot(), "escape") !== false;
      if (shouldClose && current === active) close();
    }
  });

  OpsDemo.ui.overlay = {
    open: open,
    confirm: confirm,
    close: close,
    preserveDuring: preserveDuring,
    toast: toast
  };
})(window.OpsDemo);

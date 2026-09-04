(function definePreviewUi(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;

  function split(options) {
    var opts = options || {};
    var toolbar = opts.toolbar ? '<div class="preview-workspace__toolbar">' + opts.toolbar + "</div>" : "";
    var sourceHeader = opts.sourceHeader === false ? "" : '<header class="preview-workspace__pane-header"><h2>' + dom.escape(opts.sourceTitle || "源内容") + '</h2>' + (opts.sourceMeta ? '<span>' + dom.escape(opts.sourceMeta) + "</span>" : "") + "</header>";
    var resultHeader = opts.resultHeader === false ? "" : '<header class="preview-workspace__pane-header"><h2>' + dom.escape(opts.resultTitle || "预览") + '</h2>' + (opts.resultActions || "") + "</header>";
    return '<section class="preview-workspace' + (opts.className ? " " + dom.escape(opts.className) : "") + '">' +
      toolbar + '<div class="preview-workspace__panes">' +
      '<section class="preview-workspace__pane preview-workspace__pane--source">' + sourceHeader + '<div class="preview-workspace__pane-body">' + (opts.source || "") + "</div></section>" +
      '<section class="preview-workspace__pane preview-workspace__pane--result">' + resultHeader + '<div class="preview-workspace__pane-body">' + (opts.result || "") + "</div></section>" +
      "</div></section>";
  }

  OpsDemo.ui.preview = {
    split: split
  };
})(window.OpsDemo);

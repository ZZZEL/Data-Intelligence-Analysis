(function defineDomUi(OpsDemo) {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function icon(name, size, className) {
    return '<i data-lucide="' + escapeHtml(name) + '" width="' + (size || 16) + '" height="' + (size || 16) + '" class="' + escapeHtml(className || "") + '" aria-hidden="true"></i>';
  }

  function hydrateIcons(root) {
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons({
        root: root || document,
        attrs: { "stroke-width": 1.8 }
      });
    }
  }

  function statusTone(label) {
    var value = String(label || "");
    if (/可用|正常|成功|已生效|已验证|已接入|完成|就绪|已恢复/.test(value) && !/不可用|未接入|失败/.test(value)) return "success";
    if (/异常|不可用|失败|超阈值/.test(value)) return "danger";
    if (/待处理|待验证|待生效|构建中|草稿|处理中|更新中|接近/.test(value)) return "info";
    return "neutral";
  }

  function status(label, tone, plain) {
    return '<span class="status status--' + escapeHtml(tone || statusTone(label)) + (plain ? " status--plain" : "") + '">' + escapeHtml(label) + "</span>";
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("zh-CN");
  }

  function formatCurrency(value, decimals) {
    return "¥" + Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 });
  }

  function headerSearch(options) {
    var opts = options || {};
    var attrs = opts.attrs || "";
    return '<div class="page-header__search search-box">' + icon(opts.icon || "search", 15) +
      '<input type="search" class="field field--search" value="' + escapeHtml(opts.value || "") + '" placeholder="' + escapeHtml(opts.placeholder || "搜索") + '" aria-label="' + escapeHtml(opts.ariaLabel || opts.placeholder || "搜索") + '" ' + attrs + "></div>";
  }

  function headerFilter(label, control, options) {
    var opts = options || {};
    return '<label class="page-header__filter' + (opts.className ? " " + escapeHtml(opts.className) : "") + '">' +
      (label ? '<span class="sr-only">' + escapeHtml(label) + "</span>" : "") +
      (control || "") + "</label>";
  }

  /*
   * Header contract: identity, contextual controls and primary actions share
   * one row. `toolbar` remains the page API for search/filter/view controls,
   * but it no longer creates a second visual band.
   */
  function headerToolbar(options) {
    if (!options) return "";
    if (typeof options === "string") {
      return options ? '<div class="page-header__tools page-header__tools--inline">' + options + "</div>" : "";
    }

    var opts = options || {};
    var filters = Array.isArray(opts.filters) ? opts.filters : (opts.filters ? [opts.filters] : []);
    var start = (opts.search ? headerSearch(opts.search) : "") + (opts.start || "");
    var end = filters.join("") + (opts.view || "") + (opts.actions || "") + (opts.end || "");
    if (!start && !end) return "";

    return '<div class="page-header__tools page-header__tools--inline">' + start + end + "</div>";
  }

  function pageHeader(options) {
    var opts = options || {};
    var back = opts.back || null;
    var breadcrumbs = Array.isArray(opts.breadcrumbs) ? opts.breadcrumbs.filter(function filter(item) {
      return item && item.label;
    }) : [];
    var backControl = "";
    var breadcrumbNav = "";

    if (back) {
      var backLabel = back.label || "返回";
      var backAttrs = back.attrs || "";
      if (back.href || back.route) {
        var backHref = back.href || "#/" + String(back.route || "").replace(/^#\/?/, "");
        backControl = '<a class="page-header__back" href="' + escapeHtml(backHref) + '" aria-label="' + escapeHtml(backLabel) + '" title="' + escapeHtml(backLabel) + '" ' + backAttrs + ">" + icon("arrow-left", 17) + "</a>";
      } else {
        backControl = '<button type="button" class="page-header__back" aria-label="' + escapeHtml(backLabel) + '" title="' + escapeHtml(backLabel) + '" ' + backAttrs + ">" + icon("arrow-left", 17) + "</button>";
      }
    }

    if (breadcrumbs.length) {
      breadcrumbNav = '<nav class="page-header__breadcrumbs" aria-label="面包屑"><ol>' + breadcrumbs.map(function renderBreadcrumb(item, index) {
        var crumb = item.href || item.route ? '<a href="' + escapeHtml(item.href || "#/" + String(item.route || "").replace(/^#\/?/, "")) + '">' + escapeHtml(item.label) + "</a>" : "<span>" + escapeHtml(item.label) + "</span>";
        return "<li>" + crumb + (index < breadcrumbs.length - 1 ? icon("chevron-right", 12) : "") + "</li>";
      }).join("") + "</ol></nav>";
    }

    var toolbar = headerToolbar(opts.toolbar);
    return '<header class="page-header' + (back ? " page-header--with-back" : "") + (breadcrumbs.length ? " page-header--with-breadcrumbs" : "") + '">' +
      '<div class="page-header__top">' +
        backControl + '<div class="page-header__main">' + breadcrumbNav + '<h1 class="page-header__title">' + escapeHtml(opts.title || "") + "</h1>" +
        (opts.subtitle ? '<p class="page-header__subtitle">' + escapeHtml(opts.subtitle) + "</p>" : "") + "</div>" +
        (opts.meta ? '<div class="page-header__meta">' + (opts.metaIcon ? icon(opts.metaIcon, 15) : "") + escapeHtml(opts.meta) + "</div>" : "") +
        '<div class="page-header__actions">' + toolbar + (opts.actions || "") + "</div>" +
      "</div></header>";
  }

  function button(label, options) {
    var opts = options || {};
    var attrs = opts.attrs || "";
    return '<button type="button" class="btn btn--' + escapeHtml(opts.variant || "secondary") + (opts.size ? " btn--" + escapeHtml(opts.size) : "") + '" ' + attrs + (opts.disabled ? " disabled" : "") + ">" +
      (opts.icon ? icon(opts.icon, opts.iconSize || 15) : "") + escapeHtml(label) + "</button>";
  }

  /*
   * Required-field labels share one rendering contract so every form uses the
   * same visual marker and assistive-text treatment. Callers should also set
   * `required` and `aria-required="true"` on the corresponding control.
   */
  function requiredLabel(label, options) {
    var opts = options || {};
    var allowedTags = ["label", "legend", "div", "span"];
    var tag = allowedTags.indexOf(opts.tag) >= 0 ? opts.tag : "label";
    var className = "form-label form-label--required" + (opts.className ? " " + escapeHtml(opts.className) : "");
    var forAttribute = tag === "label" && opts.forId ? ' for="' + escapeHtml(opts.forId) + '"' : "";
    var attrs = opts.attrs ? " " + opts.attrs : "";
    return "<" + tag + ' class="' + className + '"' + forAttribute + attrs + ">" +
      escapeHtml(label) + '<span class="form-required-mark" aria-hidden="true">*</span><span class="sr-only">（必填）</span></' + tag + ">";
  }

  function empty(title, description, iconName) {
    return '<div class="empty-state"><div class="empty-state__icon">' + icon(iconName || "inbox", 22) + '</div><div class="empty-state__title">' + escapeHtml(title) + '</div><div>' + escapeHtml(description || "") + "</div></div>";
  }

  function setContent(root, html) {
    root.innerHTML = html;
    hydrateIcons(root);
  }

  OpsDemo.ui.dom = {
    escape: escapeHtml,
    icon: icon,
    hydrateIcons: hydrateIcons,
    status: status,
    statusTone: statusTone,
    formatNumber: formatNumber,
    formatCurrency: formatCurrency,
    headerSearch: headerSearch,
    headerFilter: headerFilter,
    headerToolbar: headerToolbar,
    pageHeader: pageHeader,
    button: button,
    requiredLabel: requiredLabel,
    empty: empty,
    setContent: setContent
  };
})(window.OpsDemo);

(function defineRouter(window, OpsDemo) {
  "use strict";

  var listeners = [];
  var navigationBlocker = null;
  var acceptedHash = "";
  var bypassNextBlock = false;

  var routes = {
    knowledge: { page: "knowledge", title: "知识库", group: "knowledge" },
    "local-documents": { page: "localDocuments", title: "文档管理", group: "knowledge" },
    "enterprise-connections": { page: "enterpriseConnections", title: "企业数据", group: "dataAccess" },
    "external-information": { page: "externalInformation", title: "外部信源", group: "dataAccess" },
    models: { page: "models", title: "模型管理", group: "systemConfig" },
    "retrieval-config": { page: "rag", title: "检索配置", group: "retrieval" },
    "retrieval-test": { page: "retrievalTest", title: "检索测试", group: "retrieval" },
    "api-access": { page: "apiAccess", title: "API 密钥", group: "api-access" },
    consumption: { page: "consumption", title: "消耗统计", group: "consumption" }
  };

  function parseQuery(queryText) {
    var query = {};
    new URLSearchParams(queryText || "").forEach(function each(value, key) {
      query[key] = value;
    });
    return query;
  }

  function parse() {
    var hash = window.location.hash.replace(/^#\/?/, "");
    var pieces = hash.split("?");
    var path = pieces[0] || "knowledge";
    var segments = path.split("/").filter(Boolean);
    var routeName = segments[0] || "knowledge";
    var query = parseQuery(pieces[1]);
    if (routeName === "rag") {
      routeName = query.tab === "retrieval" ? "retrieval-config" : "knowledge";
    }
    if (routeName === "document-processing") {
      routeName = "knowledge";
      path = "knowledge";
      segments = ["knowledge"];
    }
    if (routeName === "overview" || routeName === "change-log") {
      routeName = "knowledge";
    }
    if (routeName === "tools" || routeName === "skills" || routeName === "visualizations") {
      routeName = "knowledge";
      path = "knowledge";
      segments = ["knowledge"];
    }
    if (!(routeName in routes)) {
      routeName = "knowledge";
      path = "knowledge";
      segments = ["knowledge"];
    }
    var config = routes[routeName];
    return {
      name: routeName,
      id: segments[1] || null,
      path: path,
      query: query,
      page: config.page,
      title: config.title,
      group: config.group
    };
  }

  function navigationHash(path) {
    var next = String(path || "knowledge").replace(/^#\/?/, "");
    return "#/" + next;
  }

  function commitNavigation(nextHash) {
    if (window.location.hash === nextHash) return true;
    bypassNextBlock = true;
    window.location.hash = nextHash;
    return true;
  }

  function requestNavigation(nextHash, source) {
    var targetHash = navigationHash(nextHash);
    if (navigationBlocker && acceptedHash && targetHash !== acceptedHash) {
      var retried = false;
      var transition = {
        fromHash: acceptedHash,
        toHash: targetHash,
        source: source || "programmatic",
        retry: function retry() {
          if (retried) return false;
          retried = true;
          return commitNavigation(targetHash);
        }
      };
      if (navigationBlocker(transition) !== true) return false;
    }
    return commitNavigation(targetHash);
  }

  function navigate(path) {
    return requestNavigation(path, "programmatic");
  }

  function block(handler) {
    navigationBlocker = typeof handler === "function" ? handler : null;
    return function unblock() {
      if (navigationBlocker === handler) navigationBlocker = null;
    };
  }

  function normalizeLegacyHash() {
    var replacement = null;
    if (/^#\/?(?:tools|skills|visualizations)(?:[/?]|$)/.test(window.location.hash)) replacement = "#/knowledge";
    if (/^#\/?document-processing(?:[/?]|$)/.test(window.location.hash)) replacement = "#/knowledge";
    if (!replacement) return;
    if (window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search + replacement);
    } else {
      window.location.hash = replacement;
    }
  }

  function notify() {
    normalizeLegacyHash();
    var nextHash = window.location.hash || "#/knowledge";
    if (bypassNextBlock) {
      bypassNextBlock = false;
    } else if (navigationBlocker && acceptedHash && nextHash !== acceptedHash) {
      var attemptedHash = nextHash;
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + acceptedHash);
      } else {
        bypassNextBlock = true;
        window.location.hash = acceptedHash;
      }
      requestNavigation(attemptedHash, "history");
      return;
    }
    acceptedHash = window.location.hash || "#/knowledge";
    var route = parse();
    listeners.slice().forEach(function each(listener) { listener(route); });
  }

  function subscribe(listener) {
    listeners.push(listener);
    return function unsubscribe() {
      listeners = listeners.filter(function keep(item) { return item !== listener; });
    };
  }

  window.addEventListener("hashchange", notify);
  document.addEventListener("click", function routeLinkClick(event) {
    if (!navigationBlocker || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var anchor = event.target.closest && event.target.closest('a[href^="#/"]');
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    var nextHash = anchor.getAttribute("href");
    if (!nextHash || nextHash === acceptedHash) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    requestNavigation(nextHash, "link");
  }, true);

  OpsDemo.core.router = {
    routes: routes,
    parse: parse,
    navigate: navigate,
    block: block,
    subscribe: subscribe,
    start: function start() {
      if (!window.location.hash) {
        window.location.hash = "#/knowledge";
      } else {
        notify();
      }
    }
  };
})(window, window.OpsDemo);

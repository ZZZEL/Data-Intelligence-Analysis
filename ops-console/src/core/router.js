(function defineRouter(window, OpsDemo) {
  "use strict";

  var listeners = [];

  var routes = {
    knowledge: { page: "knowledge", title: "知识库", group: "knowledge" },
    "local-documents": { page: "localDocuments", title: "文档管理", group: "knowledge" },
    "enterprise-connections": { page: "enterpriseConnections", title: "企业数据", group: "dataAccess" },
    "external-information": { page: "externalInformation", title: "检索服务", group: "dataAccess" },
    models: { page: "models", title: "模型管理", group: "systemConfig" },
    "retrieval-config": { page: "rag", title: "检索配置", group: "retrieval" },
    "retrieval-test": { page: "retrievalTest", title: "检索测试", group: "retrieval" },
    skills: { page: "skills", title: "Skill 目录", group: "capabilities" },
    visualizations: { page: "visualizations", title: "可视化能力", group: "capabilities" },
    definitions: { page: "definitions", title: "分析口径", group: "capabilities" },
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
    if (routeName === "tools") {
      routeName = "skills";
      path = "skills";
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

  function navigate(path) {
    var next = String(path || "knowledge").replace(/^#\/?/, "");
    window.location.hash = "#/" + next;
  }

  function normalizeLegacyHash() {
    var replacement = null;
    if (/^#\/?tools(?:[/?]|$)/.test(window.location.hash)) replacement = "#/skills";
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

  OpsDemo.core.router = {
    routes: routes,
    parse: parse,
    navigate: navigate,
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

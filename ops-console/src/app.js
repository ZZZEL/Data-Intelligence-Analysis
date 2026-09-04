(function startApplication(window, OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var router = OpsDemo.core.router;
  var store = OpsDemo.core.store;
  var appRoot = document.getElementById("app");
  var navigation = [
    {
      id: "knowledge",
      label: "知识库",
      children: [
        { label: "知识库管理", icon: "database", route: "knowledge" },
        { label: "文档管理", icon: "files", route: "local-documents" }
      ]
    },
    {
      id: "dataAccess",
      label: "数据接入",
      children: [
        { label: "企业数据", icon: "plug-zap", route: "enterprise-connections" },
        { label: "检索服务", icon: "search-check", route: "external-information" }
      ]
    },
    {
      id: "retrieval",
      label: "检索引擎",
      children: [
        { label: "检索配置", icon: "sliders-horizontal", route: "retrieval-config" },
        { label: "检索测试", icon: "search-check", route: "retrieval-test" }
      ]
    },
    {
      id: "capabilities",
      label: "能力管理",
      children: [
        { label: "Skill 目录", icon: "sparkles", route: "skills" },
        { label: "可视化能力", icon: "chart-no-axes-combined", route: "visualizations" },
        { label: "分析口径", icon: "list-checks", route: "definitions" }
      ]
    },
    {
      id: "systemConfig",
      label: "系统配置",
      children: [
        { label: "模型管理", icon: "cpu", route: "models" }
      ]
    }
  ];
  var accountNavigation = [
    { id: "api-access", label: "API 密钥", icon: "key-round", route: "api-access" },
    { id: "consumption", label: "消耗统计", icon: "chart-no-axes-column", route: "consumption" }
  ];

  function renderNavLink(item, active, modifier) {
    var className = "nav-item" + (modifier ? " " + modifier : "") + (active ? " is-active" : "");
    return '<a class="' + className + '" href="#/' + item.route + '" title="' + dom.escape(item.label) + '"' + (active ? ' aria-current="page"' : "") + '>' +
      '<span class="nav-item__icon">' + dom.icon(item.icon, 18) + '</span><span class="nav-item__label">' + dom.escape(item.label) + "</span></a>";
  }

  function renderNavigation(route) {
    return navigation.map(function renderItem(item) {
      return '<div class="nav-group nav-group--section" data-nav-group="' + item.id + '">' +
        '<div class="nav-section-title" role="heading" aria-level="2"><span class="nav-section-title__label">' + dom.escape(item.label) + "</span></div>" +
        '<div class="nav-sublist">' + item.children.map(function renderChild(child) {
          var childActive = route.name === child.route;
          return renderNavLink(child, childActive, "nav-item--nested");
        }).join("") + "</div></div>";
    }).join("");
  }

  function renderAccountNavigation(route) {
    return accountNavigation.map(function renderItem(item) {
      var active = route.group === item.id || route.name === item.route;
      return renderNavLink(item, active, "nav-item--utility");
    }).join("");
  }

  function shell(route, state, pageHtml) {
    var user = state.meta && state.meta.currentUser ? state.meta.currentUser : { displayName: "运营管理员 A", accessLevel: "L3" };
    var avatarLabel = String(user.displayName || "运营管理员").replace(/\s+/g, "").slice(0, 1) || "运";
    return '<div class="app-shell">' +
      '<aside class="sidebar" aria-label="主导航">' +
        '<a class="brand" href="#/knowledge" aria-label="返回知识库管理">' +
          '<span class="brand__mark">' + dom.icon("layers-3", 25) + '</span><span class="brand__name">数据智能分析工具</span>' +
        "</a>" +
        '<nav class="sidebar__nav">' + renderNavigation(route) + "</nav>" +
        '<nav class="sidebar__utilities" aria-label="密钥与消耗">' + renderAccountNavigation(route) + "</nav>" +
        '<div class="sidebar__footer"><div class="sidebar-account-menu" data-account-menu>' +
          '<button type="button" class="sidebar-account" data-account-trigger aria-expanded="false" title="上游访问等级 ' + dom.escape(user.accessLevel) + '" aria-label="' + dom.escape(user.displayName) + '，打开账户菜单；上游访问等级 ' + dom.escape(user.accessLevel) + '">' +
            '<span class="sidebar-account__avatar" aria-hidden="true">' + dom.escape(avatarLabel) + '</span><span class="sidebar-account__name">' + dom.escape(user.displayName) + "</span></button>" +
          '<div class="sidebar-account-popover" role="menu" aria-label="账户操作"><div class="sidebar-account-popover__meta"><span>访问等级</span><strong>' + dom.escape(user.accessLevel) + '</strong></div>' +
            '<a class="sidebar-account-popover__action" role="menuitem" href="../user-client/#/chat/copper-decision">' + dom.icon("message-square", 16) + '<span>用户端入口</span></a>' +
            '<button type="button" class="sidebar-account-popover__action" role="menuitem" data-action="logout">' + dom.icon("log-out", 16) + "<span>退出登录</span></button></div>" +
        "</div></div>" +
      "</aside>" +
      '<main class="main-shell" id="main-shell"><div id="page-root">' + pageHtml + "</div></main>" +
    "</div>";
  }

  function missingPage(route) {
    return dom.pageHeader({ title: route.title }) + '<div class="page-content">' + dom.empty("页面暂不可用", "请从左侧导航进入其他功能。", "file-question") + "</div>";
  }

  function render() {
    var route = router.parse();
    var state = store.getState();
    var page = OpsDemo.pages[route.page];
    OpsDemo.ui.overlay.close();
    OpsDemo.ui.charts.clear();
    var pageHtml = page && typeof page.render === "function" ? page.render(route, state) : missingPage(route);
    appRoot.innerHTML = shell(route, state, pageHtml);
    dom.hydrateIcons(appRoot);
    var pageRoot = document.getElementById("page-root");
    if (page && typeof page.mount === "function") page.mount(pageRoot, route, state);
    document.title = route.title + " · 数据智能分析工具";
  }

  appRoot.addEventListener("click", function handleAppClick(event) {
    var accountTrigger = event.target.closest("[data-account-trigger]");
    var accountMenu = event.target.closest("[data-account-menu]");
    appRoot.querySelectorAll("[data-account-menu].is-open").forEach(function closeOther(menu) {
      if (!accountTrigger || menu !== accountMenu) {
        menu.classList.remove("is-open");
        var trigger = menu.querySelector("[data-account-trigger]");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      }
    });
    if (accountTrigger && accountMenu) {
      var nextOpen = !accountMenu.classList.contains("is-open");
      accountMenu.classList.toggle("is-open", nextOpen);
      accountTrigger.setAttribute("aria-expanded", String(nextOpen));
      return;
    }

    if (event.target.closest('[data-action="logout"]')) {
      OpsDemo.ui.overlay.confirm({
        title: "退出登录",
        body: '<div class="notice">' + dom.icon("log-out", 17) + '<div class="notice__content"><div class="notice__title">确认退出当前账户？</div>正式接入统一身份体系后，这里会结束当前会话并返回登录入口。</div></div>',
        confirmLabel: "确认退出",
        onConfirm: function confirmLogout() {
          OpsDemo.ui.overlay.toast("演示模式未接入登录", "当前仅演示账户操作入口，不会结束本地会话。", "info");
        }
      });
      return;
    }

    if (event.target.closest('[data-action="reset-demo"]')) {
      event.preventDefault();
      OpsDemo.ui.overlay.confirm({
        title: "恢复演示数据",
        body: '<div class="notice notice--warning">' + dom.icon("rotate-ccw", 17) + '<div><strong>恢复后，本次浏览中的所有模拟变更都会清空。</strong><br>页面将回到初始演示状态。</div></div>',
        confirmLabel: "确认恢复",
        onConfirm: function confirmReset() {
          store.reset();
          OpsDemo.ui.overlay.toast("演示数据已恢复", "所有页面已回到初始状态。", "success");
        }
      });
      return;
    }

  });

  router.subscribe(render);
  store.subscribe(function onStateChange(state, meta) {
    if (meta && meta.silentRender) return;
    render();
  });
  router.start();
})(window, window.OpsDemo);

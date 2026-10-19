(function defineDataAccessPages(window, OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;
  var actions = OpsDemo.core.actions;

  function esc(value) {
    return dom.escape(value);
  }

  function formatDate(value) {
    if (!value) return "尚未测试";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function connectionTone(connection) {
    if (connection.status === "available") return "success";
    if (connection.status === "unavailable") return "danger";
    if (connection.status === "degraded") return "info";
    return "neutral";
  }

  function connectionDisplayStatus(connection) {
    if (connection.status === "unavailable") return { label: connection.statusLabel || "连接失败", tone: "danger" };
    if (connection.syncStatus === "running") return { label: "同步中", tone: "info" };
    if (connection.syncStatus === "failed") return { label: "同步失败", tone: "danger" };
    if (connection.lastSyncResult === "updated") return { label: "已更新", tone: "success" };
    if (connection.status === "available") return { label: "已连接", tone: "success" };
    if (connection.status === "degraded") return { label: connection.statusLabel || "连接异常", tone: "info" };
    return { label: connection.statusLabel || "未测试", tone: "neutral" };
  }

  function connectionRows(state) {
    return state.enterpriseConnections || [];
  }

  function renderEnterpriseConnections(route, state) {
    var rows = connectionRows(state);
    var body = rows.map(function map(item) {
      var deleteDisabled = item.protected;
      var engine = databaseEngineMeta(item.databaseEngine);
      var titleId = "enterprise-database-title-" + item.id;
      return '<article class="enterprise-database-card' + (item.status === "unavailable" ? " enterprise-database-card--unavailable" : "") + '" role="listitem" data-enterprise-card data-enterprise-row="' + esc(item.id) + '" aria-labelledby="' + esc(titleId) + '">' +
        '<header class="enterprise-database-card__header"><span class="enterprise-database-card__icon">' + dom.icon(engine.icon, 18) + '</span><div class="enterprise-database-card__identity"><button id="' + esc(titleId) + '" type="button" class="enterprise-database-card__title" data-enterprise-edit="' + esc(item.id) + '">' + esc(item.name) + '</button><span>' + esc(item.databaseEngineLabel || item.connectionTypeLabel || item.implementationType) + "</span></div>" +
        '<div class="enterprise-database-card__status">' + dom.status(connectionDisplayStatus(item).label, connectionDisplayStatus(item).tone) + "</div></header>" +
        '<dl class="enterprise-database-card__meta"><div><dt>连接地址</dt><dd class="enterprise-database-card__mono">' + esc((item.host || "—") + (item.port ? ":" + item.port : "")) + '</dd></div><div><dt>同步策略</dt><dd>' + esc(updatePolicyLabel(item)) + '</dd></div></dl>' +
        '<footer class="enterprise-database-card__footer"><span class="enterprise-database-card__sync">最近同步：' + esc(latestSyncLabel(item)) + '</span><div class="enterprise-database-card__actions"><button type="button" class="table-action" data-enterprise-sync="' + esc(item.id) + '"' + (item.status === "available" ? "" : ' disabled title="连接失败时无法读取企业数据"') + '>立即同步</button><button type="button" class="table-action" data-enterprise-edit="' + esc(item.id) + '">配置</button><button type="button" class="table-action table-action--danger" data-enterprise-delete="' + esc(item.id) + '"' + (deleteDisabled ? ' disabled title="演示主数据库不可删除"' : "") + ">删除</button></div></footer></article>";
    }).join("");

    if (!body) body = '<div class="enterprise-database-empty">' + dom.empty("暂无数据库", "接入数据库后可在这里测试和维护连接。", "database") + "</div>";
    return dom.pageHeader({
      title: "企业数据",
      actions: dom.button("接入数据库", { variant: "primary", icon: "plus", attrs: "data-enterprise-create" })
    }) + '<div class="page-content data-access-page"><div class="enterprise-database-grid" role="list">' + body + "</div></div>";
  }

  function databaseEngineDefinitions() {
    return [
      {
        id: "postgresql",
        label: "PostgreSQL",
        icon: "database",
        hostPlaceholder: "例如：postgres.internal"
      },
      {
        id: "mysql",
        label: "MySQL",
        icon: "table-properties",
        hostPlaceholder: "例如：mysql.internal"
      },
      {
        id: "sqlserver",
        label: "SQL Server",
        icon: "server",
        hostPlaceholder: "例如：sqlserver.internal"
      }
    ];
  }

  function databaseEngineMeta(engine) {
    return databaseEngineDefinitions().find(function find(item) { return item.id === engine; }) || databaseEngineDefinitions()[0];
  }

  function databaseEngineCards(selected) {
    return databaseEngineDefinitions().map(function map(item) {
      return '<label class="model-type-card database-engine-card' + (item.id === selected ? " is-selected" : "") + '" data-enterprise-engine-card><input type="radio" name="database-engine" value="' + item.id + '" required aria-required="true"' + (item.id === selected ? " checked" : "") + '><span class="model-type-card__icon">' + dom.icon(item.icon, 18) + '</span><strong>' + esc(item.label) + "</strong></label>";
    }).join("");
  }

  var ENTERPRISE_UPDATE_FREQUENCIES = [
    { id: "manual", label: "手动更新" },
    { id: "hourly", label: "每小时" },
    { id: "daily", label: "每天" },
    { id: "weekly", label: "每周" }
  ];
  var ENTERPRISE_UPDATE_STRATEGIES = [
    { id: "full_snapshot", label: "全量读取" },
    { id: "incremental_snapshot", label: "增量读取" }
  ];

  function updatePolicyValue(item, key) {
    var policy = item && item.updatePolicy || {};
    var options = key === "updateFrequency" ? ENTERPRISE_UPDATE_FREQUENCIES : ENTERPRISE_UPDATE_STRATEGIES;
    var current = policy[key] || (key === "updateFrequency" ? "daily" : "full_snapshot");
    return options.some(function option(optionItem) { return optionItem.id === current; }) ? current : options[0].id;
  }

  function updatePolicyLabel(item) {
    var frequency = ENTERPRISE_UPDATE_FREQUENCIES.find(function find(optionItem) { return optionItem.id === updatePolicyValue(item, "updateFrequency"); });
    var strategy = ENTERPRISE_UPDATE_STRATEGIES.find(function find(optionItem) { return optionItem.id === updatePolicyValue(item, "updateStrategy"); });
    return (frequency && frequency.label || "每天") + " · " + (strategy && strategy.label || "全量读取");
  }

  function snapshotDate(value) {
    if (!value) return "尚未更新";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function latestSyncLabel(item) {
    if (!item.lastSyncAt) return snapshotDate(null);
    var result = item.lastSyncResult === "updated" ? " · 已更新" : item.lastSyncResult === "unchanged" ? " · 无更新" : item.lastSyncResult === "failed" ? " · 同步失败" : "";
    return snapshotDate(item.lastSyncAt) + result;
  }

  function updatePolicyFields(item) {
    return [
      { key: "updateFrequency", label: "同步频率", options: ENTERPRISE_UPDATE_FREQUENCIES },
      { key: "updateStrategy", label: "同步策略", options: ENTERPRISE_UPDATE_STRATEGIES }
    ].map(function map(field) {
      var selected = updatePolicyValue(item, field.key);
      return '<div class="form-field"><label class="form-label" for="enterprise-' + field.key + '">' + field.label + '</label><select id="enterprise-' + field.key + '" class="select-field" data-enterprise-field="' + field.key + '">' + field.options.map(function map(optionItem) {
        return '<option value="' + esc(optionItem.id) + '"' + (optionItem.id === selected ? " selected" : "") + ">" + esc(optionItem.label) + "</option>";
      }).join("") + "</select></div>";
    }).join("");
  }

  function connectionDatabaseNames(item) {
    var values = Array.isArray(item && item.databaseNames) && item.databaseNames.length ? item.databaseNames : [item && item.databaseName];
    return Array.from(new Set(values.map(function map(value) { return String(value || "").trim(); }).filter(Boolean)));
  }

  function databaseOptionRows(databases, selected, tested) {
    var values = Array.from(new Set((databases || []).filter(Boolean)));
    if (!tested) return '<label class="database-target-option is-disabled"><input type="checkbox" disabled><span>测试连通性后可选择目标数据库</span></label>';
    return values.map(function map(databaseName) {
      var checked = selected.indexOf(databaseName) >= 0;
      return '<label class="database-target-option' + (checked ? " is-selected" : "") + '"><input type="checkbox" value="' + esc(databaseName) + '" data-enterprise-database-option' + (checked ? " checked" : "") + '><span>' + esc(databaseName) + "</span></label>";
    }).join("");
  }

  function databaseSelectionSummary(selected, total, tested) {
    if (!tested) return "测试连通性后可选择";
    if (!selected.length) return "已访问 " + total + " 个数据库，请勾选";
    return "已选择 " + selected.length + "/" + total + "：" + selected.join("、");
  }

  function databaseTargetControl(databases, selected, tested) {
    var summary = databaseSelectionSummary(selected, (databases || []).length, tested);
    return '<details class="database-target-dropdown' + (tested ? "" : " is-disabled") + '" data-enterprise-database-dropdown' + '>' +
      '<summary id="enterprise-database" class="database-target-dropdown__summary" aria-disabled="' + (!tested) + '"><span data-enterprise-database-summary>' + esc(summary) + "</span>" + dom.icon("chevron-down", 15, "database-target-dropdown__icon") + "</summary>" +
      '<div class="database-target-dropdown__menu" role="group" aria-label="目标数据库">' + databaseOptionRows(databases, selected, tested) + "</div></details>";
  }

  function databaseEditorSection(kind, title, content) {
    return '<section class="database-editor-section database-editor-section--' + kind + '" data-enterprise-' + kind + '-fields><div class="database-editor-section__heading"><h3>' + esc(title) + "</h3></div>" + '<div class="database-editor-section__content">' + content + "</div></section>";
  }

  function connectionEditorBody(connection) {
    var item = connection || {};
    var engine = item.databaseEngine || "postgresql";
    var engineMeta = databaseEngineMeta(engine);
    var tested = Boolean(connection && connection.status === "available");
    var initialTest = tested ? actions.testEnterpriseConnectionDraft({
      databaseEngine: engine,
      host: item.host,
      port: item.port,
      username: item.username,
      passwordConfigured: item.passwordConfigured
    }) : null;
    var initialDatabases = initialTest && initialTest.passed ? initialTest.databases.slice() : [];
    var selectedDatabases = connectionDatabaseNames(item).filter(function available(databaseName) {
      return initialDatabases.indexOf(databaseName) >= 0;
    });
    var passwordPlaceholder = item.passwordConfigured ? "已保存，留空表示不修改" : "请输入密码";
    var basicFields = '<div class="form-grid data-access-form database-editor-fields database-editor-fields--basic">' +
      '<div class="form-field form-field--full">' + dom.requiredLabel("数据库名称", { forId: "enterprise-name" }) + '<input id="enterprise-name" class="field" maxlength="48" value="' + esc(item.name || "") + '" placeholder="例如：订单与库存数据库" required aria-required="true" data-enterprise-field="name"></div>' +
      '</div>';
    var connectionFields = '<fieldset class="model-type-fieldset database-engine-fieldset" aria-required="true">' + dom.requiredLabel("数据库类型", { tag: "legend" }) + '<div class="model-type-cards database-engine-cards">' + databaseEngineCards(engine) + "</div></fieldset>" +
      '<div class="form-grid data-access-form database-editor-fields database-editor-fields--connection">' +
      '<div class="form-field">' + dom.requiredLabel("服务器地址", { forId: "enterprise-host" }) + '<input id="enterprise-host" class="field" value="' + esc(item.host || "") + '" placeholder="' + esc(engineMeta.hostPlaceholder) + '" required aria-required="true" data-enterprise-field="host"></div>' +
      '<div class="form-field">' + dom.requiredLabel("端口", { forId: "enterprise-port" }) + '<input id="enterprise-port" class="field" type="number" min="1" max="65535" value="' + esc(item.port || actions.enterpriseDefaultPort(engine)) + '" required aria-required="true" data-enterprise-field="port"><div class="form-help">默认端口可修改</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("用户名", { forId: "enterprise-username" }) + '<input id="enterprise-username" class="field" value="' + esc(item.username || "") + '" placeholder="例如：reporting_ro" required aria-required="true" autocomplete="username" data-enterprise-field="username"><div class="form-help">建议只读账号</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("密码", { forId: "enterprise-password" }) + '<input id="enterprise-password" class="field" type="password" value="" placeholder="' + esc(passwordPlaceholder) + '"' + (connection ? "" : ' required aria-required="true"') + ' autocomplete="new-password" data-enterprise-field="password"><div class="form-help">仅保存配置状态</div></div>' +
      '</div>';
    var targetFields = '<div class="form-field form-field--full database-target-field">' + dom.requiredLabel("可访问数据库", { forId: "enterprise-database" }) + databaseTargetControl(initialDatabases, selectedDatabases, tested) + '<div class="form-help" data-enterprise-database-help>' + (tested ? "连接已通过测试，可勾选一个或多个访问范围。" : "测试连通性后选择访问范围；表 / 视图在知识库导入时选择。") + "</div></div>";
    var syncFields = '<div class="form-grid data-access-form database-editor-fields database-editor-fields--sync">' + updatePolicyFields(item) + '</div>';
    return '<div class="database-connection-editor" data-enterprise-editor data-enterprise-tested="' + (tested ? "true" : "false") + '">' +
      databaseEditorSection("basic", "基础信息", basicFields) +
      databaseEditorSection("connection", "连接信息", connectionFields) +
      databaseEditorSection("target", "访问目标", targetFields) +
      databaseEditorSection("sync", "同步配置", syncFields) +
      '<div class="form-error" role="alert" tabindex="-1" data-enterprise-form-error hidden></div>' +
      '</div>';
  }

  function readConnectionEditor(dialog, connection) {
    var value = function value(key) {
      var field = dialog.querySelector('[data-enterprise-field="' + key + '"]');
      return field ? field.value : "";
    };
    var engineField = dialog.querySelector('[name="database-engine"]:checked');
    var currentLimits = connection && connection.limits || {};
    var databaseNames = Array.from(dialog.querySelectorAll("[data-enterprise-database-option]:checked")).map(function map(input) { return input.value; }).filter(Boolean);
    return {
      id: connection && connection.id,
      name: value("name"),
      connectionType: "database",
      databaseEngine: engineField ? engineField.value : "",
      host: value("host"),
      port: Number(value("port")),
      databaseNames: databaseNames,
      databaseName: databaseNames[0] || "",
      updatePolicy: {
        updateFrequency: value("updateFrequency") || "daily",
        updateStrategy: value("updateStrategy") || "full_snapshot"
      },
      username: value("username"),
      password: value("password"),
      passwordConfigured: Boolean(connection && connection.passwordConfigured),
      tested: dialog.querySelector("[data-enterprise-editor]").dataset.enterpriseTested === "true",
      maxRows: Number(currentLimits.maxRows || 1000),
      timeoutSeconds: Number(currentLimits.timeoutSeconds || 20),
      ssl: true
    };
  }

  function bindConnectionDraftControls(connection) {
    var overlayRoot = document.getElementById("overlay-root");
    var editor = overlayRoot.querySelector("[data-enterprise-editor]");
    var engineInputs = Array.from(overlayRoot.querySelectorAll('[name="database-engine"]'));
    var nameInput = overlayRoot.querySelector('[data-enterprise-field="name"]');
    var portInput = overlayRoot.querySelector('[data-enterprise-field="port"]');
    var hostInput = overlayRoot.querySelector('[data-enterprise-field="host"]');
    var usernameInput = overlayRoot.querySelector('[data-enterprise-field="username"]');
    var passwordField = overlayRoot.querySelector('[data-enterprise-field="password"]');
    var databaseDropdown = overlayRoot.querySelector("[data-enterprise-database-dropdown]");
    var databaseSummary = overlayRoot.querySelector("[data-enterprise-database-summary]");
    var databaseHelp = overlayRoot.querySelector("[data-enterprise-database-help]");
    var resultTarget = overlayRoot.querySelector("[data-enterprise-draft-result]");
    var testButton = overlayRoot.querySelector("[data-enterprise-draft-test]");
    var confirmButton = overlayRoot.querySelector("[data-overlay-confirm]");
    var error = overlayRoot.querySelector("[data-enterprise-form-error]");
    var selectedEngine = function selectedEngine() {
      var selected = overlayRoot.querySelector('[name="database-engine"]:checked');
      return selected ? selected.value : "postgresql";
    };
    var previousEngine = selectedEngine();

    function hideError() {
      error.hidden = true;
      error.textContent = "";
    }

    function setDraftResult(state, message) {
      if (state !== "success" && state !== "failed") {
        resultTarget.hidden = true;
        resultTarget.className = "model-draft-result";
        resultTarget.textContent = "";
        return;
      }
      resultTarget.hidden = !message;
      resultTarget.className = "model-draft-result" + (state === "success" ? " model-draft-result--success" : " model-draft-result--failed");
      resultTarget.textContent = message || "";
    }

    function selectedDatabaseNames() {
      return Array.from(overlayRoot.querySelectorAll("[data-enterprise-database-option]:checked")).map(function map(input) { return input.value; });
    }

    function connectionRequiredComplete() {
      return Boolean(editor.dataset.enterpriseTested === "true" && nameInput.value.trim() && hostInput.value.trim() && Number(portInput.value) > 0 && usernameInput.value.trim() && selectedDatabaseNames().length && (passwordField.value || connection && connection.passwordConfigured));
    }

    function syncConfirmState() {
      confirmButton.disabled = !connectionRequiredComplete();
    }

    function setDatabaseOptions(databases, selected, help) {
      var values = Array.from(new Set((databases || []).filter(Boolean)));
      var tested = editor.dataset.enterpriseTested === "true";
      var nextSelected = selected.filter(function available(databaseName) { return values.indexOf(databaseName) >= 0; });
      databaseDropdown.classList.toggle("is-disabled", !tested);
      databaseDropdown.open = Boolean(tested && databaseDropdown.open);
      databaseDropdown.querySelector(".database-target-dropdown__menu").innerHTML = databaseOptionRows(values, nextSelected, tested);
      databaseSummary.textContent = databaseSelectionSummary(nextSelected, values.length, tested);
      if (databaseHelp) databaseHelp.textContent = help || (tested ? (nextSelected.length ? "可勾选一个或多个目标数据库。" : "请勾选目标数据库。") : "测试连通性后可选择数据库。");
      syncConfirmState();
    }

    function updateEnginePresentation() {
      var engine = selectedEngine();
      var meta = databaseEngineMeta(engine);
      hostInput.placeholder = meta.hostPlaceholder;
      overlayRoot.querySelectorAll("[data-enterprise-engine-card]").forEach(function each(card) {
        var input = card.querySelector('[name="database-engine"]');
        card.classList.toggle("is-selected", Boolean(input && input.checked));
      });
    }

    function invalidateTest(message, state) {
      editor.dataset.enterpriseTested = "false";
      setDatabaseOptions([], [], "此处只选择数据库访问范围；表 / 视图在知识库导入时选择。");
      setDraftResult(state, state === "failed" ? message : "");
      hideError();
      syncConfirmState();
    }

    ["host", "port", "username", "password"].forEach(function each(key) {
      var field = overlayRoot.querySelector('[data-enterprise-field="' + key + '"]');
      field.addEventListener("input", function invalidateConnectionTest() { invalidateTest("连接参数已变更，请重新测试连通性。"); });
    });
    nameInput.addEventListener("input", function handleIdentityChange() { hideError(); syncConfirmState(); });

    databaseDropdown.querySelector(".database-target-dropdown__summary").addEventListener("click", function blockDisabledToggle(event) {
      if (editor.dataset.enterpriseTested !== "true") event.preventDefault();
    });
    databaseDropdown.addEventListener("change", function selectDatabase(event) {
      if (!event.target.matches("[data-enterprise-database-option]")) return;
      var rows = Array.from(databaseDropdown.querySelectorAll(".database-target-option"));
      rows.forEach(function each(row) {
        var input = row.querySelector("[data-enterprise-database-option]");
        row.classList.toggle("is-selected", Boolean(input && input.checked));
      });
      var selected = selectedDatabaseNames();
      databaseSummary.textContent = databaseSelectionSummary(selected, databaseDropdown.querySelectorAll("[data-enterprise-database-option]").length, true);
      if (databaseHelp) databaseHelp.textContent = selected.length ? "已勾选 " + selected.length + " 个目标数据库。" : "请勾选目标数据库。";
      hideError();
      syncConfirmState();
    });

    engineInputs.forEach(function each(input) {
      input.addEventListener("change", function changeEngine() {
        var oldDefault = actions.enterpriseDefaultPort(previousEngine);
        if (!portInput.value || Number(portInput.value) === oldDefault) portInput.value = actions.enterpriseDefaultPort(selectedEngine());
        previousEngine = selectedEngine();
        updateEnginePresentation();
        invalidateTest("数据库类型已变更，请重新测试连通性。");
      });
    });

    testButton.addEventListener("click", function testDraft() {
      hideError();
      var payload = readConnectionEditor(overlayRoot, connection);
      var lockedControls = Array.from(overlayRoot.querySelectorAll('[data-enterprise-field], [name="database-engine"], [data-enterprise-database-option], [data-overlay-confirm]')).map(function map(control) {
        return { control: control, disabled: control.disabled };
      });
      lockedControls.forEach(function lock(item) { item.control.disabled = true; });
      testButton.disabled = true;
      testButton.setAttribute("aria-busy", "true");
      testButton.innerHTML = dom.icon("loader-circle", 15, "is-spinning") + "测试连通性";
      setDraftResult("", "");
      dom.hydrateIcons(testButton);
      window.setTimeout(function finishTest() {
        if (!testButton.isConnected) return;
        var result = actions.testEnterpriseConnectionDraft(payload);
        lockedControls.forEach(function unlock(item) { item.control.disabled = item.disabled; });
        testButton.disabled = false;
        testButton.removeAttribute("aria-busy");
        testButton.innerHTML = dom.icon("plug-zap", 15) + "测试连通性";
        dom.hydrateIcons(testButton);
        if (!result.passed) {
          invalidateTest(result.message, "failed");
          return;
        }
        editor.dataset.enterpriseTested = "true";
        setDatabaseOptions(result.databases, payload.databaseNames, "请勾选一个或多个可访问数据库。");
        setDraftResult("success", result.message);
      }, 420);
    });

    updateEnginePresentation();
    setDatabaseOptions(
      editor.dataset.enterpriseTested === "true" ? actions.testEnterpriseConnectionDraft({
        databaseEngine: selectedEngine(),
        host: hostInput.value,
        port: Number(portInput.value),
        username: usernameInput.value,
        passwordConfigured: connection && connection.passwordConfigured
      }).databases : [],
      connectionDatabaseNames(connection || {}),
      null
    );
    syncConfirmState();
    if (editor.dataset.enterpriseTested === "true") {
      setDraftResult("success", actions.testEnterpriseConnectionDraft({
        databaseEngine: selectedEngine(),
        host: hostInput.value,
        port: Number(portInput.value),
        username: usernameInput.value,
        passwordConfigured: connection && connection.passwordConfigured
      }).message);
    }
  }

  function openConnectionEditor(connection, pageRoot, route) {
    overlay.open({
      title: connection ? "编辑数据库" : "接入数据库",
      wide: true,
      panelClass: "database-editor-dialog",
      body: connectionEditorBody(connection),
      confirmLabel: connection ? "保存修改" : "确认接入",
      onConfirm: function onConfirm(dialog) {
        var payload = readConnectionEditor(dialog, connection);
        var error = dialog.querySelector("[data-enterprise-form-error]");
        var message = "";
        if (!payload.name || !payload.host || !payload.port || !payload.databaseNames.length || !payload.username || (!payload.password && !payload.passwordConfigured)) message = "请填写数据库名称、服务器地址、端口、用户名和密码，测试连通性并勾选可访问数据库。";
        if (message) {
          error.hidden = false;
          error.textContent = message;
          error.scrollIntoView({ block: "center" });
          error.focus();
          return false;
        }
        var saved = actions.saveEnterpriseConnection(payload);
        if (!saved) {
          error.hidden = false;
          error.textContent = "保存失败：请检查名称是否重复，或连接配置是否可达。";
          error.scrollIntoView({ block: "center" });
          error.focus();
          return false;
        }
        overlay.toast(connection ? "数据库信息已更新" : "数据库已接入", "已保存数据库连接，密码不会明文展示。", "success");
        rerenderEnterprise(pageRoot, route);
        return true;
      }
    });
    var overlayRoot = document.getElementById("overlay-root");
    var footer = overlayRoot.querySelector(".dialog__footer");
    if (footer) {
      footer.classList.add("model-editor__footer", "database-editor__footer");
      var testGroup = document.createElement("div");
      testGroup.className = "model-editor__footer-test";
      testGroup.innerHTML = '<button type="button" class="btn btn--secondary" data-enterprise-draft-test>' + dom.icon("plug-zap", 15) + '测试连通性</button><div class="model-draft-result" role="status" aria-live="polite" data-enterprise-draft-result hidden></div>';
      footer.insertBefore(testGroup, footer.firstChild);
      dom.hydrateIcons(testGroup);
    }
    bindConnectionDraftControls(connection);
  }

  function rerenderEnterprise(root, route) {
    dom.setContent(root, renderEnterpriseConnections(route, OpsDemo.core.store.getState()));
    mountEnterpriseConnections(root, route);
  }

  function mountEnterpriseConnections(root, route) {
    var state = OpsDemo.core.store.getState();
    var create = root.querySelector("[data-enterprise-create]");
    if (create) create.addEventListener("click", function handle() { openConnectionEditor(null, root, route); });
    root.querySelectorAll("[data-enterprise-edit]").forEach(function each(button) {
      button.addEventListener("click", function handle() { openConnectionEditor((state.enterpriseConnections || []).find(function find(item) { return item.id === button.dataset.enterpriseEdit; }), root, route); });
    });
    root.querySelectorAll("[data-enterprise-sync]").forEach(function each(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        var refreshed = actions.refreshEnterpriseConnection(button.dataset.enterpriseSync);
        if (!refreshed) {
          overlay.toast("企业数据未同步", "请先测试连通性，确保连接可访问。", "warning");
          return;
        }
        overlay.toast(refreshed.lastSyncResult === "unchanged" ? "企业数据无更新" : "企业数据已同步", refreshed.name + " · " + updatePolicyLabel(refreshed), "success");
        rerenderEnterprise(root, route);
      });
    });
    root.querySelectorAll("[data-enterprise-delete]").forEach(function each(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        var item = (state.enterpriseConnections || []).find(function find(candidate) { return candidate.id === button.dataset.enterpriseDelete; });
        overlay.confirm({
          title: "删除数据库连接",
          body: '<div class="notice notice--danger">' + dom.icon("trash-2", 17) + '<div>确认删除 <strong>' + esc(item.name) + "</strong>？删除后将彻底断开该数据库；来自该连接且已导入知识库的企业数据文件、切片和索引会同步清除。</div></div>",
          confirmLabel: "确认删除",
          confirmVariant: "danger",
          onConfirm: function confirmDelete() {
            actions.deleteEnterpriseConnection(item.id);
            overlay.toast("数据库连接已删除", item.name, "success");
            rerenderEnterprise(root, route);
          }
        });
      });
    });
  }

  function searchServiceDefinitions() {
    return [
      { id: "elasticsearch", label: "Elasticsearch", icon: "search", endpointPlaceholder: "例如：" + "https" + "://search.internal", indexPlaceholder: "例如：trade-news-v3" },
      { id: "opensearch", label: "OpenSearch", icon: "network", endpointPlaceholder: "例如：" + "https" + "://opensearch.internal", indexPlaceholder: "例如：policy-publications" },
      { id: "custom", label: "自定义接口", icon: "braces", endpointPlaceholder: "例如：" + "https" + "://retrieval.internal", pathPlaceholder: "例如：/v1/search" }
    ];
  }

  function searchServiceMeta(type) {
    return searchServiceDefinitions().find(function find(item) { return item.id === type; }) || searchServiceDefinitions()[0];
  }

  function searchServiceTypeCards(selected) {
    return searchServiceDefinitions().map(function map(item) {
      return '<label class="model-type-card search-service-type-card' + (item.id === selected ? " is-selected" : "") + '" data-search-service-type-card><input type="radio" name="search-service-type" value="' + item.id + '" required aria-required="true"' + (item.id === selected ? " checked" : "") + '><span class="model-type-card__icon">' + dom.icon(item.icon, 18) + '</span><strong>' + esc(item.label) + "</strong></label>";
    }).join("");
  }

  function searchServiceRows(state) {
    return state.externalInformation && state.externalInformation.services || [];
  }

  function renderSearchServices(route, state) {
    var rows = searchServiceRows(state);
    var body = rows.map(function map(item) {
      var meta = searchServiceMeta(item.serviceType);
      var titleId = "search-service-title-" + item.id;
      var resourceLabel = item.serviceType === "custom" ? "接口路径" : "检索索引";
      var resourceValue = item.serviceType === "custom" ? (item.method || "POST") + " " + (item.path || "/") : item.indexName;
      return '<article class="enterprise-database-card search-service-card' + (item.status === "unavailable" ? " enterprise-database-card--unavailable" : "") + '" role="listitem" data-search-service-card data-search-service-row="' + esc(item.id) + '" aria-labelledby="' + esc(titleId) + '">' +
        '<header class="enterprise-database-card__header"><span class="enterprise-database-card__icon search-service-card__icon">' + dom.icon(meta.icon, 18) + '</span><div class="enterprise-database-card__identity"><button id="' + esc(titleId) + '" type="button" class="enterprise-database-card__title" data-search-service-edit="' + esc(item.id) + '">' + esc(item.name) + '</button><span>' + esc(meta.label) + '</span></div><div class="enterprise-database-card__status">' + dom.status(item.statusLabel, connectionTone(item)) + '</div></header>' +
        '<p class="enterprise-database-card__description">' + esc(item.description || "暂无服务描述") + "</p>" +
        '<dl class="enterprise-database-card__meta"><div><dt>' + resourceLabel + '</dt><dd class="enterprise-database-card__mono">' + esc(resourceValue || "—") + '</dd></div><div><dt>服务地址</dt><dd class="enterprise-database-card__mono">' + esc(item.endpoint || "—") + '</dd></div></dl>' +
        '<footer class="enterprise-database-card__footer"><span class="enterprise-database-card__checked">最近测试 ' + esc(formatDate(item.lastCheck && item.lastCheck.at)) + '</span><div class="enterprise-database-card__actions"><button type="button" class="table-action" data-search-service-test="' + esc(item.id) + '">测试</button><button type="button" class="table-action" data-search-service-edit="' + esc(item.id) + '">配置</button><button type="button" class="table-action table-action--danger" data-search-service-delete="' + esc(item.id) + '">删除</button></div></footer></article>';
    }).join("");
    if (!body) body = '<div class="enterprise-database-empty search-service-empty">' + dom.empty("暂无检索服务", "接入后可在这里测试和维护服务连接。", "search") + "</div>";
    return dom.pageHeader({ title: "外部信源", actions: dom.button("接入服务", { variant: "primary", icon: "plus", attrs: "data-search-service-create" }) }) +
      '<div class="page-content data-access-page"><div class="enterprise-database-grid search-service-grid" role="list">' + body + "</div></div>";
  }

  function searchServiceEditorBody(service) {
    var item = service || {};
    var type = item.serviceType || "elasticsearch";
    var meta = searchServiceMeta(type);
    var tested = Boolean(service && service.status === "available");
    var credentialPlaceholder = item.credentialConfigured ? "已保存，留空表示不修改" : "请输入访问凭证";
    return '<div class="database-connection-editor search-service-editor" data-search-service-editor data-search-service-tested="' + (tested ? "true" : "false") + '">' +
      '<div class="form-grid data-access-form database-editor-fields search-service-identity-fields"><div class="form-field">' + dom.requiredLabel("服务名称", { forId: "search-service-name" }) + '<input id="search-service-name" class="field" maxlength="48" value="' + esc(item.name || "") + '" placeholder="例如：全球贸易资讯检索" required aria-required="true" data-search-service-field="name"></div>' +
      '<div class="form-field"><label class="form-label" for="search-service-description">服务描述 <span class="form-optional">（选填）</span></label><input id="search-service-description" class="field" maxlength="160" value="' + esc(item.description || "") + '" placeholder="说明服务覆盖范围及用途" data-search-service-field="description"></div></div>' +
      '<section class="database-editor-section"><div class="database-editor-section__heading"><h3>连接信息</h3></div>' +
      '<fieldset class="model-type-fieldset" aria-required="true">' + dom.requiredLabel("接入类型", { tag: "legend" }) + '<div class="model-type-cards search-service-type-cards">' + searchServiceTypeCards(type) + "</div></fieldset>" +
      '<div class="form-grid data-access-form database-editor-fields"><div class="form-field form-field--full">' + dom.requiredLabel("服务地址", { forId: "search-service-endpoint" }) + '<input id="search-service-endpoint" class="field" value="' + esc(item.endpoint || "") + '" placeholder="' + esc(meta.endpointPlaceholder) + '" required aria-required="true" data-search-service-field="endpoint"></div>' +
      '<div class="form-field" data-search-service-engine-field>' + dom.requiredLabel("索引或别名", { forId: "search-service-index" }) + '<input id="search-service-index" class="field" value="' + esc(item.indexName || "") + '" placeholder="' + esc(meta.indexPlaceholder || "") + '" data-search-service-field="indexName"></div>' +
      '<div class="form-field" data-search-service-custom-field>' + dom.requiredLabel("请求路径", { forId: "search-service-path" }) + '<input id="search-service-path" class="field" value="' + esc(item.path || "/v1/search") + '" placeholder="' + esc(meta.pathPlaceholder || "/v1/search") + '" data-search-service-field="path"></div>' +
      '<div class="form-field" data-search-service-custom-field><label class="form-label" for="search-service-method">请求方式</label><select id="search-service-method" class="select-field" data-search-service-field="method"><option value="POST"' + (item.method !== "GET" ? " selected" : "") + '>POST</option><option value="GET"' + (item.method === "GET" ? " selected" : "") + ">GET</option></select></div>" +
      '<div class="form-field"><label class="form-label" for="search-service-auth">鉴权方式</label><select id="search-service-auth" class="select-field" data-search-service-field="authType"><option value="api_key"' + (item.authType === "api_key" || !item.authType ? " selected" : "") + '>API Key</option><option value="bearer"' + (item.authType === "bearer" ? " selected" : "") + '>Bearer Token</option><option value="basic"' + (item.authType === "basic" ? " selected" : "") + '>Basic Auth</option><option value="none"' + (item.authType === "none" ? " selected" : "") + ">无需鉴权</option></select></div>" +
      '<div class="form-field" data-search-service-username-field>' + dom.requiredLabel("用户名", { forId: "search-service-username" }) + '<input id="search-service-username" class="field" value="' + esc(item.username || "") + '" placeholder="例如：search_reader" autocomplete="username" data-search-service-field="username"></div>' +
      '<div class="form-field form-field--full" data-search-service-credential-field>' + dom.requiredLabel("访问凭证", { forId: "search-service-credential" }) + '<input id="search-service-credential" class="field" type="password" value="" placeholder="' + esc(credentialPlaceholder) + '" autocomplete="new-password" data-search-service-field="credential"></div></div></section>' +
      '<div class="form-error" role="alert" tabindex="-1" data-search-service-form-error hidden></div></div>';
  }

  function readSearchServiceEditor(dialog, service) {
    var value = function value(key) {
      var field = dialog.querySelector('[data-search-service-field="' + key + '"]');
      return field ? field.value : "";
    };
    var mapping = {};
    dialog.querySelectorAll("[data-search-service-mapping]").forEach(function each(field) { mapping[field.dataset.searchServiceMapping] = field.value; });
    var selectedType = dialog.querySelector('[name="search-service-type"]:checked');
    return { id: service && service.id, name: value("name"), description: value("description"), serviceType: selectedType ? selectedType.value : "", endpoint: value("endpoint"), indexName: value("indexName"), path: value("path"), method: value("method"), authType: value("authType"), username: value("username"), credential: value("credential"), credentialConfigured: Boolean(service && service.authType === value("authType") && service.credentialConfigured), mapping: mapping, tested: dialog.querySelector("[data-search-service-editor]").dataset.searchServiceTested === "true" };
  }

  function bindSearchServiceDraftControls(service) {
    var overlayRoot = document.getElementById("overlay-root");
    var editor = overlayRoot.querySelector("[data-search-service-editor]");
    var typeInputs = Array.from(overlayRoot.querySelectorAll('[name="search-service-type"]'));
    var endpointInput = overlayRoot.querySelector('[data-search-service-field="endpoint"]');
    var authSelect = overlayRoot.querySelector('[data-search-service-field="authType"]');
    var resultTarget = overlayRoot.querySelector("[data-search-service-draft-result]");
    var testButton = overlayRoot.querySelector("[data-search-service-draft-test]");
    var confirmButton = overlayRoot.querySelector("[data-overlay-confirm]");
    var error = overlayRoot.querySelector("[data-search-service-form-error]");

    function field(name) {
      return overlayRoot.querySelector('[data-search-service-field="' + name + '"]');
    }

    function mapping(name) {
      var input = overlayRoot.querySelector('[data-search-service-mapping="' + name + '"]');
      var defaults = actions.externalSearchServiceMappingDefaults(selectedType());
      return input ? input.value.trim() : defaults[name] || "";
    }

    function selectedType() {
      var selected = overlayRoot.querySelector('[name="search-service-type"]:checked');
      return selected ? selected.value : "elasticsearch";
    }

    function setDraftResult(state, message) {
      resultTarget.hidden = !message;
      resultTarget.className = "model-draft-result" + (state === "success" ? " model-draft-result--success" : state === "failed" ? " model-draft-result--failed" : "");
      resultTarget.textContent = message || "";
    }

    function requiredComplete() {
      var type = selectedType();
      var auth = authSelect.value;
      var targetReady = type === "custom" ? Boolean(field("path").value.trim() && mapping("resultPath")) : Boolean(field("indexName").value.trim());
      var credentialReady = auth === "none" || Boolean(field("credential").value || service && service.authType === auth && service.credentialConfigured);
      var usernameReady = auth !== "basic" || Boolean(field("username").value.trim() || service && service.authType === auth && service.username);
      return Boolean(field("name").value.trim() && field("endpoint").value.trim() && targetReady && credentialReady && usernameReady);
    }

    function syncConfirmState() {
      confirmButton.disabled = !requiredComplete();
    }

    function updatePresentation() {
      var type = selectedType();
      endpointInput.placeholder = searchServiceMeta(type).endpointPlaceholder;
      overlayRoot.querySelectorAll("[data-search-service-type-card]").forEach(function each(card) { card.classList.toggle("is-selected", card.querySelector("input").checked); });
      overlayRoot.querySelectorAll("[data-search-service-engine-field]").forEach(function each(fieldItem) { fieldItem.hidden = type === "custom"; });
      overlayRoot.querySelectorAll("[data-search-service-custom-field]").forEach(function each(fieldItem) { fieldItem.hidden = type !== "custom"; });
      overlayRoot.querySelector("[data-search-service-username-field]").hidden = authSelect.value !== "basic";
      overlayRoot.querySelector("[data-search-service-credential-field]").hidden = authSelect.value === "none";
    }

    function hideError() {
      error.hidden = true;
      syncConfirmState();
    }

    function invalidateTest(message) {
      editor.dataset.searchServiceTested = "false";
      setDraftResult("idle", message || "连接参数已变更，可重新测试。");
      hideError();
    }

    overlayRoot.querySelectorAll("[data-search-service-field], [data-search-service-mapping]").forEach(function each(input) {
      var name = input.dataset.searchServiceField;
      input.addEventListener("input", function handleInput() {
        if (name === "name") hideError();
        else invalidateTest();
      });
      input.addEventListener("change", function handleChange() {
        updatePresentation();
        if (name === "name") hideError();
        else invalidateTest();
      });
    });

    typeInputs.forEach(function each(input) {
      input.addEventListener("change", function changeType() {
        var defaults = actions.externalSearchServiceMappingDefaults(selectedType());
        overlayRoot.querySelectorAll("[data-search-service-mapping]").forEach(function each(mappingInput) { mappingInput.value = defaults[mappingInput.dataset.searchServiceMapping] || ""; });
        updatePresentation();
        invalidateTest("接入类型已变更，请检查字段映射；可重新测试。");
      });
    });

    testButton.addEventListener("click", function testDraft() {
      var payload = readSearchServiceEditor(overlayRoot, service);
      var lockedControls = Array.from(overlayRoot.querySelectorAll('[data-search-service-field], [data-search-service-mapping], [name="search-service-type"], [data-overlay-confirm]')).map(function map(control) {
        return { control: control, disabled: control.disabled };
      });
      lockedControls.forEach(function lock(item) { item.control.disabled = true; });
      testButton.disabled = true;
      testButton.setAttribute("aria-busy", "true");
      testButton.innerHTML = dom.icon("loader-circle", 15, "is-spinning") + "测试中";
      setDraftResult("idle", "正在自动检查连接和返回格式…");
      dom.hydrateIcons(testButton);
      window.setTimeout(function finishTest() {
        if (!testButton.isConnected) return;
        var result = actions.testExternalSearchServiceDraft(payload);
        lockedControls.forEach(function unlock(item) { item.control.disabled = item.disabled; });
        testButton.disabled = false;
        testButton.removeAttribute("aria-busy");
        testButton.innerHTML = dom.icon("search-check", 15) + "自动测试";
        dom.hydrateIcons(testButton);
        editor.dataset.searchServiceTested = result.passed ? "true" : "false";
        setDraftResult(result.passed ? "success" : "failed", result.message);
        syncConfirmState();
      }, 420);
    });

    updatePresentation();
    syncConfirmState();
    if (editor.dataset.searchServiceTested === "true") setDraftResult("success", "上次测试通过；修改连接或映射后可重新测试。");
  }

  function openSearchServiceEditor(service, pageRoot, route) {
    overlay.open({
      title: service ? "编辑检索服务" : "接入检索服务",
      wide: true,
      panelClass: "search-service-dialog",
      body: searchServiceEditorBody(service),
      confirmLabel: service ? "保存修改" : "确认接入",
      onConfirm: function onConfirm(dialog) {
        var payload = readSearchServiceEditor(dialog, service);
        var error = dialog.querySelector("[data-search-service-form-error]");
        var requiresCredential = payload.authType !== "none" && !payload.credential && !payload.credentialConfigured;
        var missingTarget = payload.serviceType === "custom" ? !payload.path || !payload.mapping.resultPath : !payload.indexName;
        var message = "";
        if (!payload.name || !payload.endpoint || missingTarget || requiresCredential || (payload.authType === "basic" && !payload.username)) message = "请完成服务名称和连接信息。";
        if (message) {
          error.hidden = false;
          error.textContent = message;
          error.scrollIntoView({ block: "center" });
          error.focus();
          return false;
        }
        var saved = actions.saveExternalSearchService(payload);
        if (!saved) {
          error.hidden = false;
          error.textContent = "保存失败：请检查名称是否重复，或连接配置是否有效。";
          return false;
        }
        overlay.toast(service ? "检索服务已更新" : "检索服务已接入", saved.name, "success");
        rerenderSearchServices(pageRoot, route);
        return true;
      }
    });
    var overlayRoot = document.getElementById("overlay-root");
    var footer = overlayRoot.querySelector(".dialog__footer");
    if (footer) {
      footer.classList.add("model-editor__footer", "database-editor__footer");
      var testGroup = document.createElement("div");
      testGroup.className = "model-editor__footer-test";
      testGroup.innerHTML = '<button type="button" class="btn btn--secondary" data-search-service-draft-test>' + dom.icon("search-check", 15) + '自动测试</button><div class="model-draft-result" role="status" aria-live="polite" data-search-service-draft-result hidden></div>';
      footer.insertBefore(testGroup, footer.firstChild);
      dom.hydrateIcons(testGroup);
    }
    bindSearchServiceDraftControls(service);
  }

  function rerenderSearchServices(root, route) {
    dom.setContent(root, renderSearchServices(route, OpsDemo.core.store.getState()));
    mountSearchServices(root, route);
  }

  function mountSearchServices(root, route) {
    var services = searchServiceRows(OpsDemo.core.store.getState());
    var create = root.querySelector("[data-search-service-create]");
    if (create) create.addEventListener("click", function handle() { openSearchServiceEditor(null, root, route); });
    root.querySelectorAll("[data-search-service-edit]").forEach(function each(button) {
      button.addEventListener("click", function handle() { openSearchServiceEditor(services.find(function find(item) { return item.id === button.dataset.searchServiceEdit; }), root, route); });
    });
    root.querySelectorAll("[data-search-service-test]").forEach(function each(button) {
      button.addEventListener("click", function handle() {
        var tested = actions.testExternalSearchService(button.dataset.searchServiceTest);
        var message = tested && tested.lastCheck ? tested.lastCheck.message : "无法测试当前服务。";
        overlay.toast(tested && tested.status === "available" ? "检索测试通过" : "检索测试失败", message, tested && tested.status === "available" ? "success" : "danger");
        rerenderSearchServices(root, route);
      });
    });
    root.querySelectorAll("[data-search-service-delete]").forEach(function each(button) {
      button.addEventListener("click", function handle() {
        var item = services.find(function find(candidate) { return candidate.id === button.dataset.searchServiceDelete; });
        if (!item) return;
        overlay.confirm({ title: "删除检索服务", body: '<div class="notice notice--danger">' + dom.icon("trash-2", 17) + '<div>确认删除 <strong>' + esc(item.name) + "</strong>？删除后需要重新接入该服务。</div></div>", confirmLabel: "确认删除", confirmVariant: "danger", onConfirm: function confirmDelete() { actions.deleteExternalSearchService(item.id); overlay.toast("检索服务已删除", item.name, "success"); rerenderSearchServices(root, route); } });
      });
    });
  }

  OpsDemo.pages.enterpriseConnections = { render: renderEnterpriseConnections, mount: mountEnterpriseConnections };
  OpsDemo.pages.externalInformation = { render: renderSearchServices, mount: mountSearchServices };
})(window, window.OpsDemo);

(function defineDataAccessPages(window, OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;
  var actions = OpsDemo.core.actions;
  var externalView = "enabled";
  var externalSelectedIds = [];
  var externalTagEditor = null;

  function esc(value) {
    return dom.escape(value);
  }

  function formatDate(value) {
    if (!value) return "尚未测试";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function tags(items, emptyLabel) {
    if (!items || !items.length) return '<span class="table-secondary">' + esc(emptyLabel || "未配置") + "</span>";
    return items.map(function map(item) {
      return '<span class="tag">' + esc(typeof item === "string" ? item : item.name) + "</span>";
    }).join("");
  }

  function connectionTone(connection) {
    if (connection.status === "available") return "success";
    if (connection.status === "unavailable") return "danger";
    if (connection.status === "degraded") return "info";
    return "neutral";
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
        '<div class="enterprise-database-card__status">' + dom.status(item.statusLabel, connectionTone(item)) + "</div></header>" +
        '<p class="enterprise-database-card__description">' + esc(item.description || "暂无数据库描述") + "</p>" +
        '<dl class="enterprise-database-card__meta"><div><dt>目标数据库</dt><dd class="enterprise-database-card__mono">' + esc(item.databaseName || "—") + '</dd></div><div><dt>服务器</dt><dd class="enterprise-database-card__mono">' + esc((item.host || "—") + (item.port ? ":" + item.port : "")) + "</dd></div></dl>" +
        '<footer class="enterprise-database-card__footer"><span class="enterprise-database-card__checked">最近测试 ' + esc(formatDate(item.lastCheck && item.lastCheck.at)) + '</span><div class="enterprise-database-card__actions"><button type="button" class="table-action" data-enterprise-test="' + esc(item.id) + '">' + (item.status === "unavailable" ? "重新测试" : "测试连接") + '</button><button type="button" class="table-action" data-enterprise-edit="' + esc(item.id) + '">编辑</button><button type="button" class="table-action table-action--danger" data-enterprise-delete="' + esc(item.id) + '"' + (deleteDisabled ? ' disabled title="演示主数据库不可删除"' : "") + ">删除</button></div></footer></article>";
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

  function databaseSelectOptions(databases, selected, tested) {
    var values = Array.from(new Set((databases || []).filter(Boolean)));
    var placeholder = tested ? "请选择目标数据库" : "请先测试连接";
    return '<option value="" disabled' + (selected ? "" : " selected") + ">" + placeholder + "</option>" + values.map(function map(databaseName) {
      return '<option value="' + esc(databaseName) + '"' + (databaseName === selected ? " selected" : "") + ">" + esc(databaseName) + "</option>";
    }).join("");
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
    var initialDatabases = initialTest && initialTest.passed ? initialTest.databases : [];
    if (item.databaseName && initialDatabases.indexOf(item.databaseName) < 0) initialDatabases.unshift(item.databaseName);
    var passwordPlaceholder = item.passwordConfigured ? "已保存，留空表示不修改" : "请输入密码";
    return '<div class="database-connection-editor" data-enterprise-editor data-enterprise-tested="' + (tested ? "true" : "false") + '">' +
      '<div class="form-grid data-access-form database-editor-fields">' +
      '<div class="form-field form-field--full">' + dom.requiredLabel("数据库名称", { forId: "enterprise-name" }) + '<input id="enterprise-name" class="field" maxlength="48" value="' + esc(item.name || "") + '" placeholder="例如：订单与库存数据库" required aria-required="true" data-enterprise-field="name"></div>' +
      '<div class="form-field form-field--full"><label class="form-label" for="enterprise-description">数据库描述 <span class="form-optional">（选填）</span></label><textarea id="enterprise-description" class="textarea-field enterprise-database-description" maxlength="160" placeholder="说明这个数据库包含的业务数据及用途" data-enterprise-field="description">' + esc(item.description || "") + "</textarea></div></div>" +
      '<section class="database-editor-section database-editor-section--connection" data-enterprise-connection-fields><div class="database-editor-section__heading"><h3>连接信息</h3></div>' +
      '<fieldset class="model-type-fieldset database-engine-fieldset" aria-required="true">' + dom.requiredLabel("数据库类型", { tag: "legend" }) + '<div class="model-type-cards database-engine-cards">' + databaseEngineCards(engine) + "</div></fieldset>" +
      '<div class="form-grid data-access-form database-editor-fields">' +
      '<div class="form-field">' + dom.requiredLabel("服务器地址", { forId: "enterprise-host" }) + '<input id="enterprise-host" class="field" value="' + esc(item.host || "") + '" placeholder="' + esc(engineMeta.hostPlaceholder) + '" required aria-required="true" data-enterprise-field="host"><div class="form-help">数据库所在的内网域名或 IP。</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("端口", { forId: "enterprise-port" }) + '<input id="enterprise-port" class="field" type="number" min="1" max="65535" value="' + esc(item.port || actions.enterpriseDefaultPort(engine)) + '" required aria-required="true" data-enterprise-field="port"><div class="form-help">已按数据库类型自动填写，可修改。</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("用户名", { forId: "enterprise-username" }) + '<input id="enterprise-username" class="field" value="' + esc(item.username || "") + '" placeholder="例如：reporting_ro" required aria-required="true" autocomplete="username" data-enterprise-field="username"><div class="form-help">请使用具有只读权限的数据库账号。</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("密码", { forId: "enterprise-password" }) + '<input id="enterprise-password" class="field" type="password" value="" placeholder="' + esc(passwordPlaceholder) + '"' + (connection ? "" : ' required aria-required="true"') + ' autocomplete="new-password" data-enterprise-field="password"><div class="form-help">Demo 不保存明文密码；SSL 默认开启。</div></div>' +
      '<div class="form-field form-field--full database-target-field">' + dom.requiredLabel("目标数据库", { forId: "enterprise-database" }) + '<select id="enterprise-database" class="select-field" required aria-required="true" data-enterprise-field="databaseName"' + (tested ? "" : " disabled") + '>' + databaseSelectOptions(initialDatabases, item.databaseName || "", tested) + '</select><div class="form-help" data-enterprise-database-help>' + (tested ? "当前连接已通过测试，可选择账号有权访问的数据库。" : "测试连接后可选择当前账号有权访问的数据库。") + "</div></div></div>" +
      '<div class="form-error" role="alert" tabindex="-1" data-enterprise-form-error hidden></div></section></div>';
  }

  function readConnectionEditor(dialog, connection) {
    var value = function value(key) {
      var field = dialog.querySelector('[data-enterprise-field="' + key + '"]');
      return field ? field.value : "";
    };
    var engineField = dialog.querySelector('[name="database-engine"]:checked');
    var currentLimits = connection && connection.limits || {};
    return {
      id: connection && connection.id,
      name: value("name"),
      description: value("description"),
      connectionType: "database",
      databaseEngine: engineField ? engineField.value : "",
      host: value("host"),
      port: Number(value("port")),
      databaseName: value("databaseName"),
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
    var descriptionInput = overlayRoot.querySelector('[data-enterprise-field="description"]');
    var portInput = overlayRoot.querySelector('[data-enterprise-field="port"]');
    var hostInput = overlayRoot.querySelector('[data-enterprise-field="host"]');
    var databaseSelect = overlayRoot.querySelector('[data-enterprise-field="databaseName"]');
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
      resultTarget.hidden = !message;
      resultTarget.className = "model-draft-result" + (state === "success" ? " model-draft-result--success" : state === "failed" ? " model-draft-result--failed" : "");
      resultTarget.textContent = message || "";
    }

    function syncConfirmState() {
      confirmButton.disabled = !(editor.dataset.enterpriseTested === "true" && databaseSelect.value);
    }

    function setDatabaseOptions(databases, selected) {
      var values = databases || [];
      var nextSelected = values.indexOf(selected) >= 0 ? selected : "";
      databaseSelect.innerHTML = databaseSelectOptions(values, nextSelected, true);
      databaseSelect.disabled = false;
      databaseSelect.value = nextSelected;
      databaseHelp.textContent = nextSelected
        ? "一个接入卡片对应一个目标数据库。"
        : "已获取 " + values.length + " 个可访问数据库，请选择目标数据库。";
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
      databaseSelect.innerHTML = databaseSelectOptions([], "", false);
      databaseSelect.disabled = true;
      databaseHelp.textContent = "测试连接后可选择当前账号有权访问的数据库。";
      setDraftResult(state || "idle", message || "连接参数已变更，请重新测试。");
      hideError();
      syncConfirmState();
    }

    ["host", "port", "username", "password"].forEach(function each(key) {
      var field = overlayRoot.querySelector('[data-enterprise-field="' + key + '"]');
      field.addEventListener("input", function invalidateConnectionTest() { invalidateTest("连接参数已变更，请重新测试。"); });
    });

    nameInput.addEventListener("input", hideError);
    descriptionInput.addEventListener("input", hideError);
    databaseSelect.addEventListener("change", function selectDatabase() {
      hideError();
      databaseHelp.textContent = databaseSelect.value ? "一个接入卡片对应一个目标数据库。" : "请选择目标数据库。";
      syncConfirmState();
    });

    engineInputs.forEach(function each(input) {
      input.addEventListener("change", function changeEngine() {
        var oldDefault = actions.enterpriseDefaultPort(previousEngine);
        if (!portInput.value || Number(portInput.value) === oldDefault) portInput.value = actions.enterpriseDefaultPort(selectedEngine());
        previousEngine = selectedEngine();
        updateEnginePresentation();
        invalidateTest("数据库类型已变更，请重新测试。");
      });
    });

    testButton.addEventListener("click", function testDraft() {
      hideError();
      var payload = readConnectionEditor(overlayRoot, connection);
      var lockedControls = Array.from(overlayRoot.querySelectorAll('[data-enterprise-field], [name="database-engine"], [data-overlay-confirm]')).map(function map(control) {
        return { control: control, disabled: control.disabled };
      });
      lockedControls.forEach(function lock(item) { item.control.disabled = true; });
      testButton.disabled = true;
      testButton.setAttribute("aria-busy", "true");
      testButton.innerHTML = dom.icon("loader-circle", 15, "is-spinning") + "获取中";
      setDraftResult("idle", "正在验证连接并获取可访问数据库…");
      dom.hydrateIcons(testButton);
      window.setTimeout(function finishTest() {
        if (!testButton.isConnected) return;
        var result = actions.testEnterpriseConnectionDraft(payload);
        lockedControls.forEach(function unlock(item) { item.control.disabled = item.disabled; });
        testButton.disabled = false;
        testButton.removeAttribute("aria-busy");
        testButton.innerHTML = dom.icon("plug-zap", 15) + "测试并获取数据库";
        dom.hydrateIcons(testButton);
        if (!result.passed) {
          invalidateTest(result.message, "failed");
          return;
        }
        editor.dataset.enterpriseTested = "true";
        setDatabaseOptions(result.databases, payload.databaseName);
        setDraftResult("success", result.message);
      }, 420);
    });

    updateEnginePresentation();
    syncConfirmState();
    if (editor.dataset.enterpriseTested === "true") setDraftResult("success", "上次测试通过；可保留当前数据库或重新测试获取列表。");
  }

  function openConnectionEditor(connection, pageRoot, route) {
    overlay.open({
      title: connection ? "编辑数据库" : "接入数据库",
      wide: true,
      body: connectionEditorBody(connection),
      confirmLabel: connection ? "保存修改" : "确认接入",
      onConfirm: function onConfirm(dialog) {
        var payload = readConnectionEditor(dialog, connection);
        var error = dialog.querySelector("[data-enterprise-form-error]");
        var message = "";
        if (!payload.name || !payload.host || !payload.port || !payload.databaseName || !payload.username || (!payload.password && !payload.passwordConfigured)) message = "请填写数据库名称、服务器地址、端口、用户名和密码，并选择目标数据库。";
        else if (!payload.tested) message = "请先测试连接；连接参数变更后也需要重新测试。";
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
          error.textContent = "保存失败：请检查数据库名称是否重复，并重新测试当前配置。";
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
      testGroup.innerHTML = '<button type="button" class="btn btn--secondary" data-enterprise-draft-test>' + dom.icon("plug-zap", 15) + '测试并获取数据库</button><div class="model-draft-result" role="status" aria-live="polite" data-enterprise-draft-result hidden></div>';
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
    root.querySelectorAll("[data-enterprise-test]").forEach(function each(button) {
      button.addEventListener("click", function handle() {
        var tested = actions.testEnterpriseConnection(button.dataset.enterpriseTest);
        var testMessage = tested && tested.lastCheck ? tested.lastCheck.message : "无法测试当前连接。";
        overlay.toast(tested && tested.status === "available" ? "连接测试通过" : "连接测试失败", testMessage, tested && tested.status === "available" ? "success" : "danger");
        rerenderEnterprise(root, route);
      });
    });
    root.querySelectorAll("[data-enterprise-delete]").forEach(function each(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        var item = (state.enterpriseConnections || []).find(function find(candidate) { return candidate.id === button.dataset.enterpriseDelete; });
        overlay.confirm({
          title: "删除数据库连接",
          body: '<div class="notice notice--danger">' + dom.icon("trash-2", 17) + '<div>确认删除 <strong>' + esc(item.name) + "</strong>？删除后需要重新接入该数据库。</div></div>",
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

  function externalTagMap(external) {
    return (external.tags || []).reduce(function reduce(map, tag) {
      map[tag.id] = tag;
      return map;
    }, {});
  }

  function externalSourceTags(item, tagMap) {
    var sourceTags = (item.tagIds || []).map(function map(id) { return tagMap[id]; }).filter(Boolean);
    if (!sourceTags.length) return '<span class="external-source-tag-empty">—</span>';
    var visible = sourceTags.slice(0, 2).map(function map(tag) {
      return '<span class="tag external-source-tag-chip is-selected" data-external-source-tag-chip="' + esc(tag.id) + '">' + esc(tag.name) + "</span>";
    }).join("");
    return '<div class="external-source-tags">' + visible + (sourceTags.length > 2 ? '<span class="tag external-source-tag-chip is-selected">+' + (sourceTags.length - 2) + "</span>" : "") + "</div>";
  }

  function externalVisibleSources(external) {
    var enabled = externalView === "enabled";
    return (external.sources || []).filter(function filter(item) {
      return Boolean(item.enabled) === enabled;
    });
  }

  function externalSourceHref(value) {
    var displayUrl = actions.externalSourceDisplayUrl(value);
    return displayUrl ? "https" + "://" + displayUrl : "#";
  }

  function renderExternalSourceRows(external, sources) {
    var tagMap = externalTagMap(external);
    return sources.map(function map(item) {
      var selected = externalSelectedIds.indexOf(item.id) >= 0;
      var deleteAction = item.enabled ? "" : '<button type="button" class="table-action table-action--danger" data-external-source-delete="' + esc(item.id) + '">删除</button>';
      var displayUrl = actions.externalSourceDisplayUrl(item.url);
      return '<tr data-external-source-row="' + esc(item.id) + '"><td class="external-source-select-cell"><input type="checkbox" aria-label="选择' + esc(item.name) + '" data-external-source-select="' + esc(item.id) + '"' + (selected ? " checked" : "") + "></td>" +
        '<td><span class="external-source-name">' + esc(item.name) + "</span></td>" +
        '<td data-external-source-tags-cell="' + esc(item.id) + '">' + externalSourceTags(item, tagMap) + "</td>" +
        '<td><a class="external-source-url" href="' + esc(externalSourceHref(item.url)) + '" target="_blank" rel="noopener noreferrer" title="' + esc(displayUrl) + '">' + esc(displayUrl) + "</a></td>" +
        '<td><div class="table-actions external-source-actions"><button type="button" class="table-action" data-external-source-edit="' + esc(item.id) + '">编辑</button><button type="button" class="table-action" data-external-source-toggle="' + esc(item.id) + '">' + (item.enabled ? "停用" : "启用") + "</button>" + deleteAction + "</div></td></tr>";
    }).join("");
  }

  function refreshExternalSourceTagCells(root) {
    if (!root) return;
    var external = OpsDemo.core.store.getState().externalInformation;
    var tagMap = externalTagMap(external);
    root.querySelectorAll("[data-external-source-tags-cell]").forEach(function each(cell) {
      var source = external.sources.find(function find(item) { return item.id === cell.dataset.externalSourceTagsCell; });
      if (source) cell.innerHTML = externalSourceTags(source, tagMap);
    });
  }

  function renderExternalBulkBar() {
    if (!externalSelectedIds.length) return "";
    var stateAction = externalView === "enabled" ? '<button type="button" class="btn btn--secondary btn--sm" data-external-source-bulk-disable>批量停用</button>' : '<button type="button" class="btn btn--secondary btn--sm" data-external-source-bulk-enable>批量启用</button><button type="button" class="btn btn--danger btn--sm" data-external-source-bulk-delete>批量删除</button>';
    return '<div class="external-source-bulk-bar"><span>已选择 <strong>' + externalSelectedIds.length + '</strong> 个信源</span><div class="external-source-bulk-actions">' + stateAction + "</div></div>";
  }

  function renderExternalInformation(route, state) {
    if (typeof document !== "undefined" && !document.querySelector("#page-root .external-source-surface")) externalSelectedIds = [];
    var external = state.externalInformation || { sources: [], tags: [] };
    var sources = externalVisibleSources(external);
    var visibleIds = sources.map(function map(item) { return item.id; });
    externalSelectedIds = externalSelectedIds.filter(function filter(id) { return visibleIds.indexOf(id) >= 0; });
    var enabledCount = (external.sources || []).filter(function filter(item) { return item.enabled; }).length;
    var disabledCount = (external.sources || []).length - enabledCount;
    var sourceRows = renderExternalSourceRows(external, sources);
    var emptyTitle = externalView === "enabled" ? "暂无启用中的信源" : "暂无已停用信源";
    if (!sourceRows) sourceRows = '<tr><td colspan="5">' + dom.empty(emptyTitle, "", "globe-2") + "</td></tr>";
    var headerActions = dom.button("标签管理", { variant: "secondary", icon: "tags", attrs: "data-external-tag-manage" }) +
      dom.button("添加信源", { variant: "primary", icon: "plus", attrs: "data-external-source-create" });
    var allSelected = Boolean(sources.length) && sources.every(function every(item) { return externalSelectedIds.indexOf(item.id) >= 0; });
    return dom.pageHeader({ title: "外部信源", actions: headerActions }) + '<div class="page-content data-access-page"><div class="table-surface external-source-surface">' +
      '<div class="external-source-list-header"><div class="tabs external-source-tabs" role="tablist" aria-label="信源状态">' +
      '<button type="button" class="tab' + (externalView === "enabled" ? " is-active" : "") + '" role="tab" aria-selected="' + (externalView === "enabled") + '" data-external-source-tab="enabled">启用中（' + enabledCount + '）</button>' +
      '<button type="button" class="tab' + (externalView === "disabled" ? " is-active" : "") + '" role="tab" aria-selected="' + (externalView === "disabled") + '" data-external-source-tab="disabled">已停用（' + disabledCount + "）</button></div></div>" +
      renderExternalBulkBar() + '<div class="table-wrap"><table class="data-table external-source-table"><thead><tr>' +
      '<th class="external-source-select-cell"><input type="checkbox" aria-label="全选当前信源" data-external-source-select-all' + (allSelected ? " checked" : "") + (sources.length ? "" : " disabled") + '></th>' +
      '<th>信源名称</th><th>标签</th><th>URL</th><th>操作</th></tr></thead><tbody>' + sourceRows + "</tbody></table></div></div></div>";
  }

  function externalTagOptions(external, selectedIds) {
    if (!(external.tags || []).length) return '<div class="external-tag-options-empty">暂无标签，请先在标签管理中新增。</div>';
    return '<div class="external-tag-options">' + external.tags.map(function map(tag) {
      var selected = selectedIds.indexOf(tag.id) >= 0;
      return '<button type="button" class="tag external-source-tag-chip external-source-tag-choice' + (selected ? " is-selected" : "") + '" aria-pressed="' + (selected ? "true" : "false") + '" data-source-tag="' + esc(tag.id) + '">' + esc(tag.name) + "</button>";
    }).join("") + "</div>";
  }

  function externalSourceEditorBody(source, external) {
    var item = source || {};
    return '<div class="form-grid data-access-form">' +
      '<div class="form-field form-field--full">' + dom.requiredLabel("信源名称", { forId: "external-source-name" }) + '<input id="external-source-name" class="field" value="' + esc(item.name || "") + '" placeholder="填写信源名称" required aria-required="true" data-source-field="name"></div>' +
      '<div class="form-field form-field--full">' + dom.requiredLabel("URL", { forId: "external-source-url" }) + '<input id="external-source-url" class="field" value="' + esc(item.url || "") + '" placeholder="填写网址" required aria-required="true" data-source-field="url"></div>' +
      '<div class="form-field form-field--full"><label class="form-label">标签</label>' + externalTagOptions(external, item.tagIds || []) + "</div>" +
      '<div class="form-field form-field--full"><div class="form-error" data-source-form-error hidden></div></div></div>';
  }

  function readExternalSourceEditor(dialog, source) {
    var value = function value(key) {
      var field = dialog.querySelector('[data-source-field="' + key + '"]');
      return field ? field.value : "";
    };
    return {
      id: source && source.id,
      name: value("name"),
      url: value("url"),
      tagIds: Array.from(dialog.querySelectorAll('[data-source-tag][aria-pressed="true"]')).map(function map(button) { return button.dataset.sourceTag; })
    };
  }

  function openExternalSourceEditor(source, pageRoot, route) {
    var external = OpsDemo.core.store.getState().externalInformation;
    overlay.open({
      title: "编辑外部信源",
      body: externalSourceEditorBody(source, external),
      confirmLabel: "保存",
      onConfirm: function onConfirm(dialog) {
        var saved = actions.saveExternalSource(readExternalSourceEditor(dialog, source));
        if (!saved) {
          var error = dialog.querySelector("[data-source-form-error]");
          error.hidden = false;
          error.textContent = "请填写信源名称和有效 URL，并确保网址未重复。";
          return false;
        }
        overlay.toast("外部信源已更新", saved.name, "success");
        rerenderExternal(pageRoot, route);
        return true;
      }
    });
    var overlayRoot = document.getElementById("overlay-root");
    overlayRoot.querySelectorAll("[data-source-tag]").forEach(function each(button) {
      button.addEventListener("click", function toggleTag() {
        var selected = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", selected ? "true" : "false");
        button.classList.toggle("is-selected", selected);
      });
    });
  }

  function externalImportResultMessage(result) {
    var notes = [];
    if (result.duplicateCount) notes.push("已去除 " + result.duplicateCount + " 个重复网址");
    if (result.invalidCount) notes.push("已忽略 " + result.invalidCount + " 个无效网址");
    return notes.length ? notes.join("，") + "。" : "信源已默认启用。";
  }

  function externalRecognitionTagSelect(external) {
    var hasTags = (external.tags || []).length > 0;
    return '<button type="button" class="external-source-tag-select" aria-haspopup="dialog" aria-expanded="false" aria-label="' + (hasTags ? "选择标签" : "暂无可用标签") + '" data-external-recognition-tag-trigger' + (hasTags ? "" : " disabled") + '>' +
      '<span class="external-source-tag-select__summary" data-external-recognition-tag-summary>' + (hasTags ? "选择标签" : "暂无标签") + "</span>" + dom.icon("chevron-down", 15) + "</button>";
  }

  function externalRecognitionSelectedTagIds(row) {
    return String(row.dataset.externalRecognitionSelectedTags || "").split(",").filter(Boolean);
  }

  function externalRecognitionTagMenu(external, selectedIds) {
    var search = external.tags.length > 8 ? '<input type="search" class="field external-source-tag-menu__search" placeholder="搜索标签" aria-label="搜索标签" data-external-recognition-tag-search>' : "";
    var options = external.tags.map(function map(tag) {
      var checked = selectedIds.indexOf(tag.id) >= 0;
      return '<label class="external-source-tag-menu__option" data-external-recognition-tag-option-row>' +
        '<input type="checkbox" value="' + esc(tag.id) + '" data-external-recognition-tag-option' + (checked ? " checked" : "") + ">" +
        '<span>' + esc(tag.name) + "</span></label>";
    }).join("");
    return search + '<div class="external-source-tag-menu__options" role="group" aria-label="可选标签">' + options + '</div><div class="external-source-tag-menu__empty" data-external-recognition-tag-empty hidden>没有匹配标签</div>';
  }

  function openExternalSourceRecognition(sourceText, preview, pageRoot, route) {
    var external = OpsDemo.core.store.getState().externalInformation;
    var readyItems = preview.items.filter(function filter(item) { return item.status === "ready"; });
    var rows = readyItems.map(function map(item) {
      return '<tr data-external-recognition-row="' + esc(item.canonicalUrl) + '" data-external-recognition-selected-tags=""><td><input class="field external-source-recognition-name" value="' + esc(item.name) + '" aria-label="' + esc(item.url) + ' 的信源名称" data-external-recognized-name></td>' +
        '<td>' + externalRecognitionTagSelect(external) + "</td>" +
        '<td><span class="external-source-recognition-url" title="' + esc(item.url) + '">' + esc(item.url) + "</span></td>" +
        '<td class="external-source-recognition-actions"><button type="button" class="btn btn--quiet btn--icon external-source-recognition-remove" aria-label="移除 ' + esc(item.url) + '" title="移除" data-external-recognition-remove>' + dom.icon("trash-2", 15) + "</button></td></tr>";
    }).join("");
    var activeTagMenu = null;
    var activeTagTrigger = null;
    var recognitionTagMenuSequence = 0;

    function updateRecognitionTagSummary(row) {
      var trigger = row.querySelector("[data-external-recognition-tag-trigger]");
      var summary = trigger && trigger.querySelector("[data-external-recognition-tag-summary]");
      if (!trigger || !summary) return;
      var selectedIds = externalRecognitionSelectedTagIds(row);
      var names = external.tags.filter(function filter(tag) { return selectedIds.indexOf(tag.id) >= 0; }).map(function map(tag) { return tag.name; });
      summary.textContent = names.length ? names[0] + (names.length > 1 ? " +" + (names.length - 1) : "") : "选择标签";
      trigger.title = names.length ? names.join("、") : "选择标签";
      trigger.setAttribute("aria-label", names.length ? "已选标签：" + names.join("、") + "，点击修改" : "选择标签");
    }

    function positionRecognitionTagMenu() {
      if (!activeTagMenu || !activeTagTrigger || !activeTagTrigger.isConnected) return;
      var rect = activeTagTrigger.getBoundingClientRect();
      var viewportPadding = 12;
      var width = Math.min(300, Math.max(224, rect.width));
      var left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
      activeTagMenu.style.width = width + "px";
      activeTagMenu.style.left = left + "px";
      var menuHeight = activeTagMenu.offsetHeight;
      var opensAbove = rect.bottom + 6 + menuHeight > window.innerHeight - viewportPadding && rect.top > menuHeight + viewportPadding;
      activeTagMenu.style.top = Math.max(viewportPadding, opensAbove ? rect.top - menuHeight - 6 : rect.bottom + 6) + "px";
    }

    function handleRecognitionTagOutsidePointer(event) {
      if (!activeTagMenu || activeTagMenu.contains(event.target) || (activeTagTrigger && activeTagTrigger.contains(event.target))) return;
      closeRecognitionTagMenu(false);
    }

    function handleRecognitionTagEscape(event) {
      if (event.key !== "Escape" || !activeTagMenu) return;
      event.preventDefault();
      event.stopPropagation();
      closeRecognitionTagMenu(true);
    }

    function closeRecognitionTagMenu(restoreFocus) {
      var trigger = activeTagTrigger;
      if (activeTagMenu) activeTagMenu.remove();
      if (trigger) {
        trigger.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
        trigger.removeAttribute("aria-controls");
      }
      activeTagMenu = null;
      activeTagTrigger = null;
      document.removeEventListener("pointerdown", handleRecognitionTagOutsidePointer, true);
      document.removeEventListener("keydown", handleRecognitionTagEscape, true);
      window.removeEventListener("resize", positionRecognitionTagMenu);
      window.removeEventListener("scroll", positionRecognitionTagMenu, true);
      if (restoreFocus && trigger && trigger.isConnected) trigger.focus();
    }

    function openRecognitionTagMenu(trigger) {
      if (trigger === activeTagTrigger) {
        closeRecognitionTagMenu(true);
        return;
      }
      closeRecognitionTagMenu(false);
      var row = trigger.closest("[data-external-recognition-row]");
      var menu = document.createElement("div");
      menu.id = "external-recognition-tag-menu-" + (++recognitionTagMenuSequence);
      menu.className = "external-source-tag-menu";
      menu.setAttribute("role", "dialog");
      menu.setAttribute("aria-label", "选择标签");
      menu.setAttribute("data-external-recognition-tag-menu", "");
      menu.innerHTML = externalRecognitionTagMenu(external, externalRecognitionSelectedTagIds(row));
      document.getElementById("overlay-root").appendChild(menu);
      activeTagMenu = menu;
      activeTagTrigger = trigger;
      trigger.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-controls", menu.id);
      positionRecognitionTagMenu();
      document.addEventListener("pointerdown", handleRecognitionTagOutsidePointer, true);
      document.addEventListener("keydown", handleRecognitionTagEscape, true);
      window.addEventListener("resize", positionRecognitionTagMenu);
      window.addEventListener("scroll", positionRecognitionTagMenu, true);
      menu.addEventListener("change", function handleTagChange(event) {
        if (!event.target.matches("[data-external-recognition-tag-option]")) return;
        var selectedIds = Array.from(menu.querySelectorAll("[data-external-recognition-tag-option]:checked")).map(function map(option) { return option.value; });
        row.dataset.externalRecognitionSelectedTags = selectedIds.join(",");
        updateRecognitionTagSummary(row);
      });
      var searchInput = menu.querySelector("[data-external-recognition-tag-search]");
      if (searchInput) {
        searchInput.addEventListener("input", function filterTags() {
          var query = searchInput.value.trim().toLocaleLowerCase();
          var visibleCount = 0;
          menu.querySelectorAll("[data-external-recognition-tag-option-row]").forEach(function each(optionRow) {
            var visible = !query || optionRow.textContent.toLocaleLowerCase().indexOf(query) >= 0;
            optionRow.hidden = !visible;
            if (visible) visibleCount += 1;
          });
          menu.querySelector("[data-external-recognition-tag-empty]").hidden = visibleCount > 0;
        });
      }
      window.setTimeout(function focusMenu() {
        var firstControl = menu.querySelector("[data-external-recognition-tag-search], [data-external-recognition-tag-option]");
        if (firstControl && menu.isConnected) firstControl.focus();
      }, 0);
    }

    overlay.open({
      title: "确认信源",
      wide: true,
      panelClass: "dialog--source-recognition",
      body: '<div class="table-surface external-source-recognition-surface"><div class="table-wrap"><table class="data-table external-source-recognition-table" data-external-source-recognition><thead><tr><th>信源名称</th><th>标签</th><th>URL</th><th class="external-source-recognition-actions"><span class="sr-only">操作</span></th></tr></thead><tbody>' + rows + '</tbody></table></div></div><div class="form-error external-source-recognition-error" role="alert" data-external-recognition-error hidden></div>',
      cancelLabel: "上一步",
      cancelAttrs: "data-external-recognition-back",
      confirmLabel: "添加",
      onCancel: function onCancel() {
        closeRecognitionTagMenu(false);
        return true;
      },
      onConfirm: function onConfirm(dialog) {
        closeRecognitionTagMenu(false);
        var names = {};
        var tagIdsByUrl = {};
        var includeUrls = [];
        var invalid = false;
        dialog.querySelectorAll("[data-external-recognition-row]").forEach(function each(row) {
          var canonicalUrl = row.dataset.externalRecognitionRow;
          var input = row.querySelector("[data-external-recognized-name]");
          var name = String(input.value || "").trim();
          input.setAttribute("aria-invalid", name ? "false" : "true");
          if (!name) invalid = true;
          includeUrls.push(canonicalUrl);
          names[canonicalUrl] = name;
          tagIdsByUrl[canonicalUrl] = externalRecognitionSelectedTagIds(row);
        });
        if (invalid || !includeUrls.length) {
          var recognitionError = dialog.querySelector("[data-external-recognition-error]");
          recognitionError.hidden = false;
          recognitionError.textContent = includeUrls.length ? "请完成信源名称。" : "请至少保留一个信源。";
          return false;
        }
        var submit = dialog.querySelector("[data-overlay-confirm]");
        if (submit) submit.disabled = true;
        externalView = "enabled";
        externalSelectedIds = [];
        var result = actions.importExternalSources(sourceText, { names: names, tagIdsByUrl: tagIdsByUrl, includeUrls: includeUrls });
        if (!result.created.length) {
          if (submit) submit.disabled = false;
          overlay.toast("没有添加信源", externalImportResultMessage(result), "warning");
          return false;
        }
        overlay.toast("已添加 " + result.created.length + " 个信源", externalImportResultMessage(result), "success");
        rerenderExternal(pageRoot, route);
        return true;
      }
    });
    var overlayRoot = document.getElementById("overlay-root");
    var recognitionTable = overlayRoot.querySelector("[data-external-source-recognition]");
    var confirmButton = overlayRoot.querySelector("[data-overlay-confirm]");
    function updateRecognitionAvailability() {
      confirmButton.disabled = !recognitionTable.querySelector("[data-external-recognition-row]");
    }
    recognitionTable.addEventListener("click", function handleRecognitionTable(event) {
      var tagTrigger = event.target.closest("[data-external-recognition-tag-trigger]");
      if (tagTrigger) {
        openRecognitionTagMenu(tagTrigger);
        return;
      }
      var remove = event.target.closest("[data-external-recognition-remove]");
      if (!remove) return;
      var row = remove.closest("[data-external-recognition-row]");
      var adjacentRow = row.nextElementSibling || row.previousElementSibling;
      var nextFocus = adjacentRow && adjacentRow.querySelector("[data-external-recognition-remove]");
      if (row.contains(activeTagTrigger)) closeRecognitionTagMenu(false);
      row.remove();
      var error = overlayRoot.querySelector("[data-external-recognition-error]");
      if (error) error.hidden = true;
      updateRecognitionAvailability();
      (nextFocus || overlayRoot.querySelector("[data-external-recognition-back]")).focus();
    });
    updateRecognitionAvailability();
    var back = overlayRoot.querySelector("[data-external-recognition-back]");
    if (back) back.addEventListener("click", function goBack() {
      closeRecognitionTagMenu(false);
      openExternalSourceImporter(pageRoot, route, sourceText);
    });
  }

  function openExternalSourceImporter(pageRoot, route, initialValue) {
    overlay.open({
      title: "添加信源",
      wide: true,
      body: '<div class="external-import"><textarea id="external-source-import-input" class="textarea-field external-import-input" rows="8" aria-label="信源网址" placeholder="粘贴信源网址，一行一个；可一次粘贴多个网址" data-external-source-import>' + esc(initialValue || "") + "</textarea></div>",
      confirmLabel: "下一步",
      onConfirm: function onConfirm(dialog) {
        var value = dialog.querySelector("[data-external-source-import]").value;
        var preview = actions.previewExternalSourceUrls(value);
        if (!preview.readyCount) {
          overlay.toast("没有可添加的信源", externalImportResultMessage(preview), "warning");
          return false;
        }
        openExternalSourceRecognition(value, preview, pageRoot, route);
        return false;
      }
    });
    var overlayRoot = document.getElementById("overlay-root");
    var input = overlayRoot.querySelector("[data-external-source-import]");
    var confirmButton = overlayRoot.querySelector("[data-overlay-confirm]");
    function updateAvailability() {
      confirmButton.disabled = !input.value.trim();
    }
    input.addEventListener("input", updateAvailability);
    updateAvailability();
  }

  function externalTagUsage(external, tagId) {
    return external.sources.filter(function filter(source) { return (source.tagIds || []).indexOf(tagId) >= 0; }).length;
  }

  function externalTagInlineRow(external, tag) {
    var isCreate = !tag;
    var mode = isCreate ? "create" : "rename";
    return '<tr class="external-tag-inline-row" data-external-tag-editor-row><td><input class="field external-tag-inline-input" value="' + esc(tag ? tag.name : "") + '" aria-label="标签名称" data-external-tag-inline-input data-external-tag-inline-mode="' + mode + '"' + (tag ? ' data-external-tag-inline-id="' + esc(tag.id) + '"' : "") + '><div class="form-error external-tag-inline-error" role="alert" data-external-tag-inline-error hidden></div></td>' +
      '<td>' + (tag ? externalTagUsage(external, tag.id) : 0) + ' 个信源</td><td><div class="table-actions"><button type="button" class="table-action" data-external-tag-inline-save>保存</button><button type="button" class="table-action" data-external-tag-inline-cancel>取消</button></div></td></tr>';
  }

  function externalTagDisplayRow(external, tag) {
    return '<tr data-external-tag-row="' + esc(tag.id) + '"><td><span class="table-primary">' + esc(tag.name) + '</span></td><td>' + externalTagUsage(external, tag.id) + ' 个信源</td><td><div class="table-actions"><button type="button" class="table-action" data-external-tag-rename="' + esc(tag.id) + '">重命名</button><button type="button" class="table-action table-action--danger" data-external-tag-delete="' + esc(tag.id) + '">删除</button></div></td></tr>';
  }

  function externalTagEmptyRow() {
    return '<tr data-external-tag-empty><td colspan="3">' + dom.empty("暂无标签", "", "tags") + "</td></tr>";
  }

  function openExternalTagManager(pageRoot, route) {
    externalTagEditor = null;
    pageRoot = document.getElementById("page-root") || pageRoot;
    var external = OpsDemo.core.store.getState().externalInformation;
    var rows = external.tags.map(function map(tag) {
      return externalTagDisplayRow(external, tag);
    }).join("");
    if (!rows) rows = externalTagEmptyRow();
    overlay.open({
      title: "标签管理",
      wide: true,
      footer: false,
      headerActions: dom.button("新增标签", { variant: "primary", icon: "plus", size: "sm", attrs: "data-external-tag-create" }),
      body: '<div class="table-surface"><div class="table-wrap"><table class="data-table external-tag-table"><thead><tr><th>标签名称</th><th>使用情况</th><th>操作</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>",
      onCancel: function onCancel() { externalTagEditor = null; }
    });
    var overlayRoot = document.getElementById("overlay-root");
    var create = overlayRoot.querySelector("[data-external-tag-create]");
    var table = overlayRoot.querySelector(".external-tag-table");
    var tableBody = table.querySelector("tbody");
    function setEditing(editing) {
      create.disabled = editing;
      table.querySelectorAll("[data-external-tag-rename], [data-external-tag-delete]").forEach(function each(button) { button.disabled = editing; });
    }
    function focusInlineEditor() {
      var input = table.querySelector("[data-external-tag-inline-input]");
      if (!input) return;
      window.setTimeout(function focusInput() {
        input.focus();
        input.select();
      }, 0);
    }
    function focusTagAction(tagId) {
      window.setTimeout(function focusAction() {
        var action = table.querySelector('[data-external-tag-row="' + tagId + '"] [data-external-tag-rename]');
        if (action) action.focus();
      }, 0);
    }
    function cancelInlineEditor() {
      var input = table.querySelector("[data-external-tag-inline-input]");
      if (!input) return;
      var row = input.closest("tr");
      var renamedTagId = input.dataset.externalTagInlineId;
      if (input.dataset.externalTagInlineMode === "rename") {
        var currentExternal = OpsDemo.core.store.getState().externalInformation;
        var tag = currentExternal.tags.find(function findTag(item) { return item.id === input.dataset.externalTagInlineId; });
        if (tag) row.outerHTML = externalTagDisplayRow(currentExternal, tag);
      } else {
        row.remove();
        if (!tableBody.querySelector("tr")) tableBody.innerHTML = externalTagEmptyRow();
      }
      externalTagEditor = null;
      setEditing(false);
      if (renamedTagId) focusTagAction(renamedTagId);
      else create.focus();
    }
    function saveInlineEditor() {
      var inlineInput = table.querySelector("[data-external-tag-inline-input]");
      if (!inlineInput) return;
      var saveButton = table.querySelector("[data-external-tag-inline-save]");
      if (saveButton && saveButton.disabled) return;
      if (saveButton) saveButton.disabled = true;
      var saved = overlay.preserveDuring(function saveTagWithoutClosingManager() {
        return inlineInput.dataset.externalTagInlineMode === "create"
          ? actions.createExternalTag(inlineInput.value)
          : actions.renameExternalTag(inlineInput.dataset.externalTagInlineId, inlineInput.value);
      });
      if (!saved) {
        if (saveButton) saveButton.disabled = false;
        var error = table.querySelector("[data-external-tag-inline-error]");
        inlineInput.setAttribute("aria-invalid", "true");
        error.hidden = false;
        error.textContent = "标签名称不能为空，也不能与已有标签重复。";
        return;
      }
      var wasCreate = inlineInput.dataset.externalTagInlineMode === "create";
      var editorRow = inlineInput.closest("tr");
      var updatedExternal = OpsDemo.core.store.getState().externalInformation;
      editorRow.outerHTML = externalTagDisplayRow(updatedExternal, saved);
      if (!wasCreate) refreshExternalSourceTagCells(document.getElementById("page-root") || pageRoot);
      externalTagEditor = null;
      setEditing(false);
      focusTagAction(saved.id);
      overlay.toast(wasCreate ? "标签已新增" : "标签已重命名", saved.name, "success");
    }
    if (create) create.addEventListener("click", function handleCreate() {
      if (externalTagEditor) return;
      externalTagEditor = { mode: "create" };
      var empty = tableBody.querySelector("[data-external-tag-empty]");
      if (empty) empty.remove();
      tableBody.insertAdjacentHTML("beforeend", externalTagInlineRow(OpsDemo.core.store.getState().externalInformation, null));
      setEditing(true);
      focusInlineEditor();
    });
    table.addEventListener("click", function handleTableClick(event) {
      var rename = event.target.closest("[data-external-tag-rename]");
      var remove = event.target.closest("[data-external-tag-delete]");
      if (rename && !externalTagEditor) {
        var currentExternal = OpsDemo.core.store.getState().externalInformation;
        var tag = currentExternal.tags.find(function findTag(item) { return item.id === rename.dataset.externalTagRename; });
        if (!tag) return;
        externalTagEditor = { mode: "rename", id: tag.id };
        rename.closest("tr").outerHTML = externalTagInlineRow(currentExternal, tag);
        setEditing(true);
        focusInlineEditor();
        return;
      }
      if (remove && !externalTagEditor) {
        openExternalTagDelete(remove.dataset.externalTagDelete, pageRoot, route);
        return;
      }
      if (event.target.closest("[data-external-tag-inline-save]")) saveInlineEditor();
      if (event.target.closest("[data-external-tag-inline-cancel]")) cancelInlineEditor();
    });
    table.addEventListener("input", function clearInlineError(event) {
      if (!event.target.matches("[data-external-tag-inline-input]")) return;
      event.target.setAttribute("aria-invalid", "false");
      var error = table.querySelector("[data-external-tag-inline-error]");
      if (error) error.hidden = true;
    });
    table.addEventListener("keydown", function handleInlineKey(event) {
      if (!event.target.matches("[data-external-tag-inline-input]")) return;
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        saveInlineEditor();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelInlineEditor();
      }
    });
  }

  function openExternalTagDelete(tagId, pageRoot, route) {
    var external = OpsDemo.core.store.getState().externalInformation;
    var tag = external.tags.find(function findTag(item) { return item.id === tagId; });
    if (!tag) return;
    var usage = externalTagUsage(external, tag.id);
    overlay.confirm({
      title: "删除标签",
      wide: true,
      body: '<div class="notice notice--danger">' + dom.icon("trash-2", 17) + '<div>“' + esc(tag.name) + '”将从 ' + usage + " 个信源移除，不会删除信源。</div></div>",
      cancelAttrs: "data-overlay-close data-external-tag-delete-back",
      confirmLabel: "确认删除",
      confirmVariant: "danger",
      onCancel: function onCancel() {
        openExternalTagManager(document.getElementById("page-root") || pageRoot, route);
        return false;
      },
      onConfirm: function onConfirm() {
        var deleted = overlay.preserveDuring(function deleteTagWithoutClosingManager() { return actions.deleteExternalTag(tag.id); });
        if (!deleted) {
          overlay.toast("标签未删除", "标签可能已不存在，请重新检查。", "warning");
          return false;
        }
        refreshExternalSourceTagCells(document.getElementById("page-root") || pageRoot);
        overlay.toast("标签已删除", "信源本身未受影响。", "success");
        openExternalTagManager(document.getElementById("page-root") || pageRoot, route);
        return false;
      }
    });
  }

  function rerenderExternal(root, route) {
    dom.setContent(root, renderExternalInformation(route, OpsDemo.core.store.getState()));
    mountExternalInformation(root, route);
  }

  function confirmDeleteExternalSources(ids, pageRoot, route) {
    var external = OpsDemo.core.store.getState().externalInformation;
    var sources = ids.map(function map(id) { return external.sources.find(function findSource(item) { return item.id === id; }); }).filter(Boolean);
    overlay.confirm({
      title: sources.length > 1 ? "批量删除外部信源" : "删除外部信源",
      body: '<div class="notice notice--danger">' + dom.icon("trash-2", 17) + '<div>确认删除 <strong>' + sources.length + "</strong> 个已停用信源？</div></div>",
      confirmLabel: "确认删除",
      confirmVariant: "danger",
      onConfirm: function confirmDelete() {
        externalSelectedIds = [];
        var deleted = actions.deleteExternalSources(ids);
        if (!deleted.length) return false;
        overlay.toast("外部信源已删除", "已删除 " + deleted.length + " 个信源。", "success");
        rerenderExternal(pageRoot, route);
        return true;
      }
    });
  }

  function confirmExternalSourceEnabled(ids, nextEnabled, pageRoot, route) {
    var external = OpsDemo.core.store.getState().externalInformation;
    var sources = ids.map(function map(id) {
      return external.sources.find(function find(item) { return item.id === id; });
    }).filter(function filter(item) { return item && item.enabled !== nextEnabled; });
    if (!sources.length) return;
    var action = nextEnabled ? "启用" : "停用";
    var subject = sources.length === 1 ? "“" + esc(sources[0].name) + "”" : "<strong>" + sources.length + "</strong> 个信源";
    overlay.confirm({
      title: (sources.length > 1 ? "批量" : "") + action + "外部信源",
      body: '<div class="notice' + (nextEnabled ? "" : " notice--danger") + '" data-external-source-state-confirm>' + dom.icon(nextEnabled ? "circle-check" : "circle-pause", 17) + "<div>确认" + action + subject + "？</div></div>",
      confirmLabel: "确认" + action,
      confirmVariant: nextEnabled ? "primary" : "danger",
      onConfirm: function onConfirm() {
        var selectedBefore = externalSelectedIds.slice();
        externalSelectedIds = [];
        var updated = actions.setExternalSourcesEnabled(sources.map(function map(item) { return item.id; }), nextEnabled);
        if (updated.length !== sources.length) {
          externalSelectedIds = selectedBefore;
          rerenderExternal(document.getElementById("page-root") || pageRoot, route);
          overlay.toast("状态未更新", "信源状态可能已变化，请重新检查。", "warning");
          return false;
        }
        overlay.toast("外部信源已" + action, "已" + action + " " + updated.length + " 个信源。", "success");
        return true;
      }
    });
  }

  function mountExternalInformation(root, route) {
    var state = OpsDemo.core.store.getState();
    var external = state.externalInformation;
    var visibleSources = externalVisibleSources(external);
    var create = root.querySelector("[data-external-source-create]");
    if (create) create.addEventListener("click", function handle() { openExternalSourceImporter(root, route); });
    var manageTags = root.querySelector("[data-external-tag-manage]");
    if (manageTags) manageTags.addEventListener("click", function handle() { openExternalTagManager(root, route); });
    root.querySelectorAll("[data-external-source-tab]").forEach(function each(button) {
      button.addEventListener("click", function handle() {
        externalView = button.dataset.externalSourceTab;
        externalSelectedIds = [];
        rerenderExternal(root, route);
      });
    });
    var selectAll = root.querySelector("[data-external-source-select-all]");
    if (selectAll) selectAll.indeterminate = externalSelectedIds.length > 0 && externalSelectedIds.length < visibleSources.length;
    if (selectAll) selectAll.addEventListener("change", function handle() {
      externalSelectedIds = selectAll.checked ? visibleSources.map(function map(item) { return item.id; }) : [];
      rerenderExternal(root, route);
      var nextSelectAll = root.querySelector("[data-external-source-select-all]");
      if (nextSelectAll) nextSelectAll.focus();
    });
    root.querySelectorAll("[data-external-source-select]").forEach(function each(input) {
      input.addEventListener("change", function handle() {
        var id = input.dataset.externalSourceSelect;
        if (input.checked && externalSelectedIds.indexOf(id) < 0) externalSelectedIds.push(id);
        if (!input.checked) externalSelectedIds = externalSelectedIds.filter(function filter(item) { return item !== id; });
        rerenderExternal(root, route);
        var nextInput = Array.from(root.querySelectorAll("[data-external-source-select]")).find(function find(candidate) { return candidate.dataset.externalSourceSelect === id; });
        if (nextInput) nextInput.focus();
      });
    });
    root.querySelectorAll("[data-external-source-edit]").forEach(function each(button) {
      button.addEventListener("click", function handle() { openExternalSourceEditor(external.sources.find(function find(item) { return item.id === button.dataset.externalSourceEdit; }), root, route); });
    });
    root.querySelectorAll("[data-external-source-toggle]").forEach(function each(button) {
      button.addEventListener("click", function handle() {
        var item = external.sources.find(function find(candidate) { return candidate.id === button.dataset.externalSourceToggle; });
        confirmExternalSourceEnabled([item.id], !item.enabled, root, route);
      });
    });
    root.querySelectorAll("[data-external-source-delete]").forEach(function each(button) {
      button.addEventListener("click", function handle() { confirmDeleteExternalSources([button.dataset.externalSourceDelete], root, route); });
    });
    var bulkDisable = root.querySelector("[data-external-source-bulk-disable]");
    if (bulkDisable) bulkDisable.addEventListener("click", function handle() {
      confirmExternalSourceEnabled(externalSelectedIds.slice(), false, root, route);
    });
    var bulkEnable = root.querySelector("[data-external-source-bulk-enable]");
    if (bulkEnable) bulkEnable.addEventListener("click", function handle() {
      confirmExternalSourceEnabled(externalSelectedIds.slice(), true, root, route);
    });
    var bulkDelete = root.querySelector("[data-external-source-bulk-delete]");
    if (bulkDelete) bulkDelete.addEventListener("click", function handle() { confirmDeleteExternalSources(externalSelectedIds.slice(), root, route); });
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
        '<footer class="enterprise-database-card__footer"><span class="enterprise-database-card__checked">最近测试 ' + esc(formatDate(item.lastCheck && item.lastCheck.at)) + '</span><div class="enterprise-database-card__actions"><button type="button" class="table-action" data-search-service-test="' + esc(item.id) + '">' + (item.status === "unavailable" ? "重新测试" : "测试检索") + '</button><button type="button" class="table-action" data-search-service-edit="' + esc(item.id) + '">编辑</button><button type="button" class="table-action table-action--danger" data-search-service-delete="' + esc(item.id) + '">删除</button></div></footer></article>';
    }).join("");
    if (!body) body = '<div class="enterprise-database-empty search-service-empty">' + dom.empty("暂无检索服务", "接入后可在这里测试和维护服务连接。", "search") + "</div>";
    return dom.pageHeader({ title: "检索服务", actions: dom.button("接入服务", { variant: "primary", icon: "plus", attrs: "data-search-service-create" }) }) +
      '<div class="page-content data-access-page"><div class="enterprise-database-grid search-service-grid" role="list">' + body + "</div></div>";
  }

  function searchServiceMappingValue(item, key, type) {
    var defaults = actions.externalSearchServiceMappingDefaults(type);
    return item.mapping && item.mapping[key] != null ? item.mapping[key] : defaults[key] || "";
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
      '<details class="database-editor-section search-service-advanced"><summary class="search-service-advanced__summary"><span><strong>高级配置</strong><small>结果字段映射</small></span>' + dom.icon("chevron-down", 16) + '</summary><div class="form-grid data-access-form search-service-mapping-grid">' +
      '<div class="form-field" data-search-service-custom-field><label class="form-label" for="search-service-result-path">结果列表路径</label><input id="search-service-result-path" class="field" value="' + esc(searchServiceMappingValue(item, "resultPath", type)) + '" placeholder="例如：data.items" data-search-service-mapping="resultPath"></div>' +
      '<div class="form-field"><label class="form-label" for="search-service-id-field">文档 ID</label><input id="search-service-id-field" class="field" value="' + esc(searchServiceMappingValue(item, "idField", type)) + '" data-search-service-mapping="idField"></div>' +
      '<div class="form-field"><label class="form-label" for="search-service-title-field">标题</label><input id="search-service-title-field" class="field" value="' + esc(searchServiceMappingValue(item, "titleField", type)) + '" data-search-service-mapping="titleField"></div>' +
      '<div class="form-field"><label class="form-label" for="search-service-url-field">链接</label><input id="search-service-url-field" class="field" value="' + esc(searchServiceMappingValue(item, "urlField", type)) + '" data-search-service-mapping="urlField"></div>' +
      '<div class="form-field"><label class="form-label" for="search-service-snippet-field">摘要</label><input id="search-service-snippet-field" class="field" value="' + esc(searchServiceMappingValue(item, "snippetField", type)) + '" data-search-service-mapping="snippetField"></div>' +
      '<div class="form-field"><label class="form-label" for="search-service-content-field">正文</label><input id="search-service-content-field" class="field" value="' + esc(searchServiceMappingValue(item, "contentField", type)) + '" data-search-service-mapping="contentField"></div>' +
      '<div class="form-field"><label class="form-label" for="search-service-source-field">来源</label><input id="search-service-source-field" class="field" value="' + esc(searchServiceMappingValue(item, "sourceField", type)) + '" data-search-service-mapping="sourceField"></div>' +
      '<div class="form-field"><label class="form-label" for="search-service-published-field">发布时间</label><input id="search-service-published-field" class="field" value="' + esc(searchServiceMappingValue(item, "publishedAtField", type)) + '" data-search-service-mapping="publishedAtField"></div>' +
      '<div class="form-field"><label class="form-label" for="search-service-score-field">相关度</label><input id="search-service-score-field" class="field" value="' + esc(searchServiceMappingValue(item, "scoreField", type)) + '" data-search-service-mapping="scoreField"></div></div></details>' +
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
    return { id: service && service.id, name: value("name"), description: value("description"), serviceType: selectedType ? selectedType.value : "", endpoint: value("endpoint"), indexName: value("indexName"), path: value("path"), method: value("method"), authType: value("authType"), username: value("username"), credential: value("credential"), credentialConfigured: Boolean(service && service.credentialConfigured), mapping: mapping, tested: dialog.querySelector("[data-search-service-editor]").dataset.searchServiceTested === "true" };
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
    var selectedType = function selectedType() { var selected = overlayRoot.querySelector('[name="search-service-type"]:checked'); return selected ? selected.value : "elasticsearch"; };
    function setDraftResult(state, message) {
      resultTarget.hidden = !message;
      resultTarget.className = "model-draft-result" + (state === "success" ? " model-draft-result--success" : state === "failed" ? " model-draft-result--failed" : "");
      resultTarget.textContent = message || "";
    }
    function syncConfirmState() { confirmButton.disabled = editor.dataset.searchServiceTested !== "true"; }
    function updatePresentation() {
      var type = selectedType();
      endpointInput.placeholder = searchServiceMeta(type).endpointPlaceholder;
      overlayRoot.querySelectorAll("[data-search-service-type-card]").forEach(function each(card) { card.classList.toggle("is-selected", card.querySelector("input").checked); });
      overlayRoot.querySelectorAll("[data-search-service-engine-field]").forEach(function each(field) { field.hidden = type === "custom"; });
      overlayRoot.querySelectorAll("[data-search-service-custom-field]").forEach(function each(field) { field.hidden = type !== "custom"; });
      overlayRoot.querySelector("[data-search-service-username-field]").hidden = authSelect.value !== "basic";
      overlayRoot.querySelector("[data-search-service-credential-field]").hidden = authSelect.value === "none";
    }
    function invalidateTest(message) {
      editor.dataset.searchServiceTested = "false";
      setDraftResult("idle", message || "连接参数已变更，请重新测试。");
      error.hidden = true;
      syncConfirmState();
    }
    overlayRoot.querySelectorAll("[data-search-service-field], [data-search-service-mapping]").forEach(function each(field) {
      if (["name", "description"].indexOf(field.dataset.searchServiceField) >= 0) return;
      field.addEventListener("input", function handleChange() { invalidateTest(); });
      field.addEventListener("change", function handleSelectChange() { updatePresentation(); invalidateTest(); });
    });
    typeInputs.forEach(function each(input) {
      input.addEventListener("change", function changeType() {
        var defaults = actions.externalSearchServiceMappingDefaults(selectedType());
        overlayRoot.querySelectorAll("[data-search-service-mapping]").forEach(function each(field) { field.value = defaults[field.dataset.searchServiceMapping] || ""; });
        updatePresentation();
        invalidateTest("接入类型已变更，请检查字段映射并重新测试。");
      });
    });
    testButton.addEventListener("click", function testDraft() {
      var payload = readSearchServiceEditor(overlayRoot, service);
      testButton.disabled = true;
      testButton.setAttribute("aria-busy", "true");
      testButton.innerHTML = dom.icon("loader-circle", 15, "is-spinning") + "测试中";
      setDraftResult("idle", "正在自动检查连接和返回格式…");
      dom.hydrateIcons(testButton);
      window.setTimeout(function finishTest() {
        if (!testButton.isConnected) return;
        var result = actions.testExternalSearchServiceDraft(payload);
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
    if (editor.dataset.searchServiceTested === "true") setDraftResult("success", "上次测试通过；修改连接或映射后需要重新测试。");
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
        else if (!payload.tested) message = "请先完成自动测试；连接或高级配置变更后需要重新测试。";
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
          error.textContent = "保存失败：请检查服务名称是否重复，并重新测试当前配置。";
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

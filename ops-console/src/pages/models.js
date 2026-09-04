(function defineModelsPage(window) {
  "use strict";

  var runtime = window.OpsDemo || window.App;
  if (!runtime) return;

  var dom = runtime.ui.dom;
  var overlay = runtime.ui.overlay;
  var searchQuery = "";

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value, fallback) {
    return value == null || value === "" ? (fallback == null ? "—" : fallback) : String(value);
  }

  function invoke(name, args) {
    var actions = runtime.core.actions || {};
    if (typeof actions[name] === "function") return actions[name].apply(actions, args || []);
    overlay.toast("演示动作未就绪", "动作接口 " + name + " 尚未加载。", "warning");
    return null;
  }

  function modelCatalog(state) {
    return state && state.rag && state.rag.modelCatalog ? state.rag.modelCatalog : {};
  }

  function apiEndpoint(model) {
    var api = model && model.apiConfig ? model.apiConfig : {};
    return text(api.endpoint || api.serviceAddress, "未配置");
  }

  function apiKeyMasked(model) {
    var api = model && model.apiConfig ? model.apiConfig : {};
    return text(api.apiKeyMasked || api.credentialMasked, "未配置");
  }

  function displayTime(value, emptyLabel) {
    if (!value) return emptyLabel || "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date).replace(/\//g, "-");
  }

  function statusKey(model) {
    var status = model && (model.connectionStatus || (model.lastConnectionTest && model.lastConnectionTest.status));
    if (status === "passed" || status === "available" || status === "connected") return "passed";
    if (status === "failed" || status === "unavailable") return "failed";
    return "untested";
  }

  function connectionLabel(model) {
    if (model && model.connectionStatusLabel) return model.connectionStatusLabel;
    var legacy = model && model.lastConnectionTest ? model.lastConnectionTest.statusLabel : "";
    if (legacy) return legacy;
    if (statusKey(model) === "passed") return "连接正常";
    if (statusKey(model) === "failed") return "连接失败";
    return "待测试";
  }

  function lastTestAt(model) {
    return model && (model.lastTestAt || (model.lastConnectionTest && model.lastConnectionTest.testedAt));
  }

  function connectionTone(model) {
    if (statusKey(model) === "passed") return "success";
    if (statusKey(model) === "failed") return "danger";
    return "neutral";
  }

  function modelGroups(state) {
    var catalog = modelCatalog(state);
    return [
      { kind: "embedding", title: "向量模型", icon: "binary", models: list(catalog.embeddingModels) },
      { kind: "reranker", title: "Rerank 模型", icon: "list-filter", models: list(catalog.rerankerModels) },
    ];
  }

  function findModel(state, kind, id) {
    var group = modelGroups(state).find(function find(item) { return item.kind === kind; });
    return group ? group.models.find(function find(item) { return item.id === id; }) : null;
  }

  function connectionCell(model) {
    return '<div class="model-connection">' +
      dom.status(connectionLabel(model), connectionTone(model), true) +
      '<span class="table-secondary">' + dom.escape(displayTime(lastTestAt(model), "尚未测试")) + "</span></div>";
  }

  function rowActions(kind, model) {
    var attrs = ' data-model-kind="' + kind + '" data-model-id="' + dom.escape(model.id) + '"';
    return '<div class="table-actions model-row-actions">' +
      '<button type="button" class="table-action" data-model-test' + attrs + '>测试</button>' +
      '<button type="button" class="table-action" data-model-edit' + attrs + '>编辑</button>' +
      '<button type="button" class="table-action table-action--danger" data-model-delete' + attrs + '>删除</button>' +
    "</div>";
  }

  function modelRows(group) {
    return group.models.map(function row(model) {
      var dimensionCell = group.kind === "embedding"
        ? '<td class="models-table__dimension"><div class="table-primary">' + dom.escape(model.dimension ? dom.formatNumber(model.dimension) + " 维" : "—") + "</div></td>"
        : '<td class="models-table__dimension" aria-label="不适用"></td>';
      return '<tr data-model-row data-model-kind="' + group.kind + '" data-model-id="' + dom.escape(model.id) + '">' +
        '<td><div class="capability-name"><span class="capability-icon">' + dom.icon(group.icon, 16) + '</span><div class="model-identity"><div class="table-primary">' + dom.escape(text(model.alias || model.name, "未命名模型")) + '</div></div></div></td>' +
        dimensionCell +
        '<td>' + connectionCell(model) + "</td>" +
        '<td>' + rowActions(group.kind, model) + "</td>" +
      "</tr>";
    }).join("");
  }

  function groupTable(group) {
    var dimensionHeader = group.kind === "embedding" ? "向量维度" : "";
    var secondaryAriaLabel = dimensionHeader || "不适用";
    var columns = '<colgroup><col class="models-table__col models-table__col--name"><col class="models-table__col models-table__col--dimension"><col class="models-table__col models-table__col--connection"><col class="models-table__col models-table__col--actions"></colgroup>';
    return '<section class="models-group" data-model-group="' + group.kind + '">' +
      '<div class="models-group__header"><div class="models-group__identity"><span class="models-group__icon">' + dom.icon(group.icon, 17) + '</span><h2>' + group.title + '</h2><span class="models-group__count" data-model-group-count>' + group.models.length + "</span></div></div>" +
      '<div class="models-group__surface"><div class="table-wrap"><table class="data-table models-table models-table--' + group.kind + '">' + columns + '<thead><tr><th>模型名称</th><th aria-label="' + dom.escape(secondaryAriaLabel) + '">' + dimensionHeader + "</th><th>连接状态</th><th>操作</th></tr></thead><tbody>" + modelRows(group) + "</tbody></table></div>" +
      '<div class="models-group__empty" data-model-group-empty hidden>没有匹配的' + group.title + "</div></div>" +
    "</section>";
  }

  function modelPayload(scope, current) {
    var selectedType = scope.querySelector('[name="model-kind"]:checked');
    var kind = selectedType ? selectedType.value : (current && current.kind) || "embedding";
    var apiKeyValue = scope.querySelector('[data-model-field="apiKey"]').value.trim();
    var currentMaskedKey = current && current.model ? apiKeyMasked(current.model) : "";
    var apiKeyUnchanged = Boolean(currentMaskedKey && currentMaskedKey !== "未配置" && apiKeyValue === currentMaskedKey);
    var payload = {
      kind: kind,
      name: scope.querySelector('[data-model-field="name"]').value.trim(),
      dimension: null,
      endpoint: scope.querySelector('[data-model-field="endpoint"]').value.trim(),
      apiKey: apiKeyUnchanged ? "" : apiKeyValue,
      apiKeyUnchanged: apiKeyUnchanged,
    };
    if (current) payload.id = current.model.id;
    return payload;
  }

  function validatePayload(payload, current) {
    if (!payload.name || !payload.endpoint) return "请填写模型名称和 API 地址。";
    if (!payload.apiKey && !payload.apiKeyUnchanged) return "请填写 API Key。";
    return "";
  }

  function setDraftTestState(scope, status, message) {
    var result = scope.querySelector("[data-model-draft-result]");
    if (!result) return;
    result.className = "model-draft-result model-draft-result--" + status;
    result.innerHTML = status === "success"
      ? dom.icon("circle-check", 15) + '<span>' + dom.escape(message || "连接正常") + "</span>"
      : status === "failed"
        ? dom.icon("circle-x", 15) + '<span>' + dom.escape(message || "连接失败，请检查 API 地址和 API Key。") + "</span>"
        : '<span>' + dom.escape(message || "修改配置后需要重新测试。") + "</span>";
    result.hidden = status === "idle";
    dom.hydrateIcons(result);
  }

  function toggleTypeFields(scope) {
    var selected = scope.querySelector('[name="model-kind"]:checked');
    var dimension = scope.querySelector("[data-model-dimension-field]");
    var primaryRow = scope.querySelector(".model-editor__primary-row");
    var endpoint = scope.querySelector('[data-model-field="endpoint"]');
    var isEmbedding = Boolean(selected && selected.value === "embedding");
    if (dimension) {
      dimension.hidden = !isEmbedding;
      dimension.setAttribute("aria-hidden", isEmbedding ? "false" : "true");
    }
    if (primaryRow) primaryRow.classList.toggle("has-dimension", isEmbedding);
    if (endpoint && selected) endpoint.placeholder = selected.value === "embedding" ? "model-gateway.internal/v1/embeddings" : "model-gateway.internal/v1/rerank";
    scope.querySelectorAll("[data-model-kind-card]").forEach(function each(card) {
      var input = card.querySelector('input[name="model-kind"]');
      card.classList.toggle("is-selected", Boolean(input && input.checked));
    });
  }

  function runDraftTest(scope, current, button) {
    var payload = modelPayload(scope, current);
    var validation = validatePayload(payload, current);
    if (validation) {
      setDraftTestState(scope, "failed", validation);
      return;
    }
    var signature = JSON.stringify(payload);
    var lockedControls = Array.from(scope.querySelectorAll('[data-model-field], [name="model-kind"], [data-overlay-confirm]')).map(function map(control) {
      return { control: control, disabled: control.disabled };
    });
    lockedControls.forEach(function lock(item) { item.control.disabled = true; });
    button.disabled = true;
    button.innerHTML = dom.icon("loader-circle", 15, "is-spinning") + "测试中";
    dom.hydrateIcons(button);
    window.setTimeout(function finish() {
      if (!button.isConnected) return;
      if (JSON.stringify(modelPayload(scope, current)) !== signature) {
        lockedControls.forEach(function unlock(item) { item.control.disabled = item.disabled; });
        button.disabled = false;
        button.innerHTML = dom.icon("plug-zap", 15) + "测试连接";
        setDraftTestState(scope, "idle");
        dom.hydrateIcons(button);
        return;
      }
      var result = invoke("testRagModelDraft", [payload]);
      var passed = Boolean(result && result.passed);
      var dimensionField = scope.querySelector('[data-model-field="dimension"]');
      if (passed && payload.kind === "embedding" && dimensionField && Number.isFinite(result.dimension)) {
        dimensionField.value = String(result.dimension);
      }
      setDraftTestState(scope, passed ? "success" : "failed", passed
        ? (payload.kind === "embedding" && result.dimension ? "连接正常，已读取 " + dom.formatNumber(result.dimension) + " 维" : "连接正常")
        : "连接失败，请检查 API 地址和 API Key。");
      lockedControls.forEach(function unlock(item) { item.control.disabled = item.disabled; });
      button.disabled = false;
      button.innerHTML = dom.icon("plug-zap", 15) + "测试连接";
      dom.hydrateIcons(button);
    }, 420);
  }

  function editorBody(current) {
    var model = current && current.model ? current.model : {};
    var kind = current ? current.kind : "embedding";
    var locked = current ? " disabled" : "";
    var keyValue = current && apiKeyMasked(model) !== "未配置" ? apiKeyMasked(model) : "";
    return '<div class="model-editor"><fieldset class="model-type-fieldset" aria-required="true">' + dom.requiredLabel("模型类型", { tag: "legend" }) + '<div class="model-type-cards">' +
      '<label class="model-type-card' + (kind === "embedding" ? " is-selected" : "") + '" data-model-kind-card><input type="radio" name="model-kind" value="embedding" required aria-required="true"' + (kind === "embedding" ? " checked" : "") + locked + '><span class="model-type-card__icon">' + dom.icon("binary", 18) + '</span><span><strong>向量模型</strong><small>将文本转换为语义向量</small></span></label>' +
      '<label class="model-type-card' + (kind === "reranker" ? " is-selected" : "") + '" data-model-kind-card><input type="radio" name="model-kind" value="reranker" required aria-required="true"' + (kind === "reranker" ? " checked" : "") + locked + '><span class="model-type-card__icon">' + dom.icon("list-filter", 18) + '</span><span><strong>Rerank 模型</strong><small>对召回结果重新排序</small></span></label>' +
      "</div></fieldset>" +
      '<div class="model-editor__fields"><div class="model-editor__primary-row' + (kind === "embedding" ? " has-dimension" : "") + '"><div class="form-field">' + dom.requiredLabel("模型名称", { forId: "model-name" }) + '<input id="model-name" class="field" maxlength="48" value="' + dom.escape(text(model.alias || model.name, "")) + '" placeholder="输入模型名称" required aria-required="true" data-model-field="name"></div>' +
      '<div class="form-field model-editor__dimension" data-model-dimension-field aria-hidden="' + (kind === "embedding" ? "false" : "true") + '"' + (kind === "embedding" ? "" : " hidden") + '><label class="form-label" for="model-dimension">向量维度</label><input id="model-dimension" class="field field--readonly" type="text" inputmode="numeric" value="' + dom.escape(model.dimension ? String(model.dimension) : "") + '" readonly data-model-field="dimension"></div></div>' +
      '<div class="form-field form-field--full">' + dom.requiredLabel("API 地址", { forId: "model-endpoint" }) + '<input id="model-endpoint" class="field" value="' + dom.escape(apiEndpoint(model) === "未配置" ? "" : apiEndpoint(model)) + '" placeholder="model-gateway.internal/v1/embeddings" required aria-required="true" data-model-field="endpoint"></div>' +
      '<div class="form-field form-field--full">' + dom.requiredLabel("API Key", { forId: "model-key" }) + '<input id="model-key" class="field" type="text" autocomplete="off" value="' + dom.escape(keyValue) + '" placeholder="输入 API Key" required aria-required="true" data-model-field="apiKey"></div></div>' +
    "</div>";
  }

  function openModelEditor(state, kind, id) {
    var model = id ? findModel(state, kind, id) : null;
    var current = model ? { kind: kind, model: model } : null;
    overlay.open({
      kind: "dialog",
      title: current ? "编辑模型" : "新增模型",
      confirmLabel: current ? "保存修改" : "保存模型",
      body: editorBody(current),
      onConfirm: function onConfirm(scope) {
        var payload = modelPayload(scope, current);
        var validation = validatePayload(payload, current);
        if (validation) {
          setDraftTestState(scope, "failed", validation);
          return false;
        }
        var connection = invoke("testRagModelDraft", [payload]);
        if (!connection || !connection.passed) {
          setDraftTestState(scope, "failed", "连接失败，请检查 API 地址和 API Key。");
          return false;
        }
        if (payload.kind === "embedding") {
          if (!Number.isFinite(connection.dimension) || connection.dimension < 1) {
            setDraftTestState(scope, "failed", "未能读取向量维度，请重新测试连接。");
            return false;
          }
          payload.dimension = connection.dimension;
        }
        var saved = invoke("saveRagModel", [payload]);
        if (!saved) {
          setDraftTestState(scope, "failed", "模型名称已存在，请更换名称后保存。");
          return false;
        }
        overlay.toast(current ? "模型已更新" : "模型已新增", "连接测试已通过，配置已保存。", "success");
        return true;
      },
    });
    var scope = document.getElementById("overlay-root");
    var footer = scope.querySelector(".dialog__footer");
    if (footer) {
      footer.classList.add("model-editor__footer");
      var testGroup = document.createElement("div");
      testGroup.className = "model-editor__footer-test";
      testGroup.innerHTML = '<button type="button" class="btn btn--secondary" data-model-draft-test>' + dom.icon("plug-zap", 15) + '测试连接</button><div class="model-draft-result" data-model-draft-result hidden></div>';
      footer.insertBefore(testGroup, footer.firstChild);
      dom.hydrateIcons(testGroup);
    }
    var testButton = scope.querySelector("[data-model-draft-test]");
    scope.querySelectorAll('[name="model-kind"]').forEach(function each(field) {
      field.addEventListener("change", function changeKind() {
        var dimensionField = scope.querySelector('[data-model-field="dimension"]');
        if (dimensionField) dimensionField.value = "";
        toggleTypeFields(scope);
        setDraftTestState(scope, "idle");
      });
    });
    scope.querySelectorAll("[data-model-field]").forEach(function each(field) {
      field.addEventListener("input", function invalidate() {
        if (field.matches('[data-model-field="endpoint"]')) {
          var dimensionField = scope.querySelector('[data-model-field="dimension"]');
          if (dimensionField) dimensionField.value = "";
        }
        setDraftTestState(scope, "idle");
      });
    });
    if (testButton) testButton.addEventListener("click", function testDraft() { runDraftTest(scope, current, testButton); });
    toggleTypeFields(scope);
  }

  function testExistingModel(trigger) {
    var kind = trigger.getAttribute("data-model-kind");
    var id = trigger.getAttribute("data-model-id");
    trigger.disabled = true;
    trigger.innerHTML = dom.icon("loader-circle", 13, "is-spinning") + "测试中";
    dom.hydrateIcons(trigger);
    window.setTimeout(function finish() {
      var result = invoke("testRagModelConnection", [kind, id]);
      var passed = Boolean(result && statusKey(result) === "passed");
      if (!passed) {
        trigger.disabled = false;
        trigger.textContent = "测试";
        overlay.toast("连接测试失败", "请编辑模型并检查 API 地址和 API Key。", "danger");
        return;
      }
      overlay.toast("连接正常", "模型服务已通过连接测试。", "success");
    }, 420);
  }

  function confirmDelete(state, kind, id) {
    var model = findModel(state, kind, id);
    if (!model) return;
    overlay.confirm({
      title: "删除模型",
      confirmLabel: "删除",
      confirmVariant: "danger",
      body: '<p class="dialog-copy">删除“' + dom.escape(text(model.alias || model.name, "该模型")) + '”后将无法恢复；正在被知识库或全局检索设置使用的模型不能删除。</p>',
      onConfirm: function onConfirm() {
        var result = invoke("deleteRagModel", [kind, id]);
        if (!result) {
          overlay.toast("模型未删除", "请先解除知识库或全局检索设置中的模型引用。", "warning");
          return false;
        }
        overlay.toast("模型已删除", "模型配置已从目录移除。", "success");
        return true;
      },
    });
  }

  function render(route, state) {
    return dom.pageHeader({
      title: "模型管理",
      actions: dom.button("新增模型", { variant: "primary", icon: "plus", attrs: "data-model-create" }),
      toolbar: { search: { value: searchQuery, placeholder: "搜索模型名称", ariaLabel: "搜索模型", attrs: "data-model-search" } },
    }) + '<div class="page-content models-page"><div class="models-groups">' + modelGroups(state).map(groupTable).join("") + '</div><div data-model-empty hidden>' + dom.empty("没有匹配的模型", "请尝试其他搜索词。", "search-x") + "</div></div>";
  }

  function applySearch(root) {
    var query = searchQuery.trim().toLowerCase();
    var totalVisible = 0;
    root.querySelectorAll("[data-model-group]").forEach(function eachGroup(group) {
      var visible = 0;
      group.querySelectorAll("[data-model-row]").forEach(function eachRow(row) {
        row.hidden = Boolean(query && row.textContent.toLowerCase().indexOf(query) < 0);
        if (!row.hidden) visible += 1;
      });
      totalVisible += visible;
      var count = group.querySelector("[data-model-group-count]");
      var empty = group.querySelector("[data-model-group-empty]");
      if (count) count.textContent = visible;
      if (empty) empty.hidden = visible !== 0;
    });
    var pageEmpty = root.querySelector("[data-model-empty]");
    if (pageEmpty) pageEmpty.hidden = totalVisible !== 0;
  }

  function mount(root) {
    root.addEventListener("input", function onInput(event) {
      if (!event.target.matches("[data-model-search]")) return;
      searchQuery = event.target.value;
      applySearch(root);
    });

    root.addEventListener("click", function onClick(event) {
      var trigger = event.target.closest("[data-model-create], [data-model-test], [data-model-edit], [data-model-delete]");
      if (!trigger) return;
      var state = runtime.core.store.getState();
      if (trigger.matches("[data-model-create]")) {
        openModelEditor(state);
        return;
      }
      var kind = trigger.getAttribute("data-model-kind");
      var id = trigger.getAttribute("data-model-id");
      if (trigger.matches("[data-model-test]")) testExistingModel(trigger);
      else if (trigger.matches("[data-model-edit]")) openModelEditor(state, kind, id);
      else if (trigger.matches("[data-model-delete]")) confirmDelete(state, kind, id);
    });
    applySearch(root);
  }

  var page = { render: render, mount: mount };
  runtime.pages = runtime.pages || {};
  runtime.pages.models = page;
  window.App = window.App || runtime;
  window.App.pages = window.App.pages || {};
  window.App.pages.models = page;
  if (window.OpsDemo) {
    window.OpsDemo.pages = window.OpsDemo.pages || {};
    window.OpsDemo.pages.models = page;
  }
})(window);

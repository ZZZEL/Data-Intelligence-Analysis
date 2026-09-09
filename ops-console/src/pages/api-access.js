(function defineApiAccessPage(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value, fallback) {
    return value == null || value === "" ? (fallback || "—") : String(value);
  }

  function invoke(name, args) {
    var actions = OpsDemo.core.actions || {};
    if (typeof actions[name] === "function") return actions[name].apply(actions, args || []);
    overlay.toast("演示动作未就绪", "动作接口 " + name + " 尚未加载。", "warning");
    return null;
  }

  function keyName(item) {
    return text(item && (item.name || item.applicationName), "未命名密钥");
  }

  function maskedKey(item) {
    return text(item && (item.keyMasked || item.secretMasked));
  }

  function isRetrievalKey(item) {
    return Boolean(item) && String(item.apiType || "").trim().toLowerCase() === "retrieval";
  }

  function retrievalKeys(state) {
    return list(state.apiAccess && state.apiAccess.clients).filter(isRetrievalKey);
  }

  function knowledgeBases(state) {
    return list(state.knowledgeBases);
  }

  function findKnowledgeBase(state, id) {
    return knowledgeBases(state).find(function find(item) { return item.id === id; }) || null;
  }

  function keyKnowledgeBases(item, state) {
    return list(item && item.knowledgeBaseIds).map(function map(id) {
      return findKnowledgeBase(state, id);
    }).filter(Boolean);
  }

  function retrievalPolicy(item) {
    var policy = item && item.retrievalPolicy;
    return policy && policy.mode === "custom" ? policy : { mode: "global" };
  }

  function retrievalOperator(item, state) {
    var policy = retrievalPolicy(item);
    if (policy.mode === "custom" && policy.operator) return policy.operator;
    return state.rag && state.rag.retrievalSettings && state.rag.retrievalSettings.operator || {};
  }

  function modelConnectionReady(model) {
    return Boolean(model && model.status === "available" && model.lastConnectionTest && model.lastConnectionTest.status === "passed");
  }

  function rerankerModels(state) {
    var catalog = state.rag && state.rag.modelCatalog;
    return list(catalog && catalog.rerankerModels).filter(modelConnectionReady);
  }

  function rerankerName(state, id) {
    var model = rerankerModels(state).find(function find(item) { return item.id === id; });
    return model ? text(model.alias || model.name) : "未配置";
  }

  function retrievalThreshold(operator) {
    var value = Number(operator && operator.relevanceThreshold);
    return Number.isFinite(value) ? value : 0.6;
  }

  function findKey(state, id) {
    return retrievalKeys(state).find(function find(item) { return item.id === id; });
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
      hour12: false
    }).format(date).replace(/\//g, "-");
  }

  function keyEnabled(item) {
    return Boolean(item) && item.enabled !== false && item.status !== "disabled";
  }

  function statusTone(item) {
    return keyEnabled(item) ? "success" : "neutral";
  }

  function statusLabel(item) {
    return keyEnabled(item) ? "已启用" : "已禁用";
  }

  function keyActions(item) {
    var id = dom.escape(item.id);
    return '<div class="api-key-row-actions"><button type="button" class="table-action" data-api-detail="' + id + '">查看</button>' +
      '<button type="button" class="table-action" data-api-toggle="' + id + '">' + (keyEnabled(item) ? "禁用" : "启用") + "</button>" +
      '<button type="button" class="table-action table-action--danger" data-api-delete="' + id + '">删除</button></div>';
  }

  function knowledgeBaseSummary(item, state) {
    var scoped = keyKnowledgeBases(item, state);
    return '<div class="table-primary">' + scoped.length + '</div>';
  }

  function retrievalPolicySummary(item) {
    var policy = retrievalPolicy(item);
    return '<div class="table-primary">' + (policy.mode === "custom" ? "独立" : "全局") + '</div>';
  }

  function keyRows(keys, state) {
    return keys.map(function row(item) {
      return '<tr data-api-key-row><td><div class="table-primary">' + dom.escape(keyName(item)) + '</div></td>' +
        '<td><span class="api-key-masked">' + dom.escape(maskedKey(item)) + '</span></td>' +
        '<td>' + knowledgeBaseSummary(item, state) + '</td>' +
        '<td>' + retrievalPolicySummary(item, state) + '</td>' +
        '<td>' + dom.status(statusLabel(item), statusTone(item)) + '</td>' +
        '<td>' + dom.escape(displayTime(item.lastUsedAt || item.lastCalledAt, "尚未使用")) + '</td>' +
        '<td>' + dom.escape(displayTime(item.createdAt)) + '</td>' +
        '<td>' + keyActions(item) + '</td></tr>';
    }).join("");
  }

  function renderApiAccess(route, state) {
    var keys = retrievalKeys(state);
    var table = keys.length
      ? '<div class="table-wrap" data-api-table-wrap><table class="data-table api-key-table"><thead><tr><th>名称</th><th>API Key</th><th>可访问知识库</th><th>检索策略</th><th>状态</th><th>最近使用时间</th><th>创建时间</th><th>操作</th></tr></thead><tbody>' + keyRows(keys, state) + '</tbody></table></div>'
      : dom.empty("暂无检索 API 密钥", "创建后即可用于调用检索 API。", "key-round");
    return dom.pageHeader({
      title: "API 密钥",
      actions: dom.button("创建 API Key", { variant: "primary", icon: "plus", attrs: "data-api-create" })
    }) + '<div class="page-content api-access-page"><section class="table-surface" aria-label="API 密钥列表">' + table + '</section></div>';
  }

  function wizardSteps(activeStep) {
    var labels = ["基本配置", "检索策略", "获取 API Key"];
    return '<ol class="api-key-wizard-steps" aria-label="创建 API Key 步骤">' + labels.map(function map(label, index) {
      var step = index + 1;
      var stateClass = step === activeStep ? " is-active" : step < activeStep ? " is-complete" : "";
      return '<li class="api-key-wizard-step' + stateClass + '"' + (step === activeStep ? ' aria-current="step"' : "") + '><span class="api-key-wizard-step__index">' + (step < activeStep ? dom.icon("check", 13) : step) + '</span><span>' + label + '</span></li>';
    }).join("") + '</ol>';
  }

  function showSecret(result) {
    var key = result && (result.key || result.secret);
    if (!key) return;
    var copied = false;
    overlay.open({
      title: "创建 API Key",
      wide: true,
      panelClass: "api-key-config-dialog",
      dismissible: false,
      cancelLabel: false,
      confirmLabel: "完成",
      confirmVariant: "primary",
      body: wizardSteps(3) + '<div class="api-key-result" data-api-wizard-step="3"><div class="api-key-once-notice"><p>API Key 已生成。请立即复制并安全保存，完成后将无法再次查看完整内容。</p></div>' +
        '<div class="form-field"><label class="form-label" for="api-key-secret-value">API Key</label><div class="api-key-secret-row"><input id="api-key-secret-value" class="field api-key-secret-value" readonly value="' + dom.escape(key) + '" data-api-secret-value>' + dom.button("复制", { variant: "secondary", icon: "copy", attrs: "data-api-secret-copy" }) + '</div></div></div>',
      onConfirm: function onConfirm() {
        if (copied) return true;
        overlay.toast("请先复制密钥", "安全保存后才能完成。", "warning");
        return false;
      }
    });
    var scope = document.getElementById("overlay-root");
    var input = scope && scope.querySelector("[data-api-secret-value]");
    var copyButton = scope && scope.querySelector("[data-api-secret-copy]");
    var confirmButton = scope && scope.querySelector("[data-overlay-confirm]");
    if (confirmButton) {
      confirmButton.disabled = true;
      confirmButton.setAttribute("aria-disabled", "true");
    }
    if (copyButton && input) copyButton.addEventListener("click", function handle() {
      copyVisibleSecret(input, function copiedSecret() {
        copied = true;
        copyButton.innerHTML = dom.icon("check", 15) + "已复制";
        dom.hydrateIcons(copyButton);
        if (confirmButton) {
          confirmButton.disabled = false;
          confirmButton.removeAttribute("aria-disabled");
          confirmButton.focus();
        }
      });
    });
  }

  function knowledgeBaseOptions(state, selectedIds) {
    var selected = list(selectedIds);
    return knowledgeBases(state).map(function map(item) {
      return '<label class="api-key-kb-option"><input type="checkbox" value="' + dom.escape(item.id) + '" data-api-kb-option' + (selected.indexOf(item.id) >= 0 ? " checked" : "") + '>' +
        '<span class="api-key-kb-option__identity"><strong>' + dom.escape(item.name) + '</strong><small>' + dom.escape(item.id) + '</small></span>' +
        dom.status(item.enabled ? "检索已启用" : "检索已关闭", item.enabled ? "success" : "neutral") + '</label>';
    }).join("");
  }

  function rerankerOptions(state, selectedId) {
    var models = rerankerModels(state);
    if (!models.length) return '<option value="" selected disabled>暂无连接正常的 Rerank 模型</option>';
    return models.map(function map(model) {
      return '<option value="' + dom.escape(model.id) + '"' + (model.id === selectedId ? " selected" : "") + '>' + dom.escape(model.alias || model.name) + '</option>';
    }).join("");
  }

  function createKeyStepOneForm(state, draft) {
    var selectedIds = list(draft.knowledgeBaseIds);
    return '<div class="api-key-create-form" data-api-wizard-step="1"><div class="form-field">' + dom.requiredLabel("名称", { forId: "api-key-name" }) + '<input id="api-key-name" class="field" maxlength="48" required aria-required="true" value="' + dom.escape(draft.name || "") + '" placeholder="例如：合同知识检索组件" data-api-field="name"></div>' +
      '<section class="api-key-create-section"><div class="api-key-create-section__heading">' + dom.requiredLabel("可访问知识库", { tag: "div" }) + '<span data-api-kb-count>已选择 ' + selectedIds.length + ' 个</span></div>' +
      '<div class="api-key-kb-list" role="group" aria-label="可访问知识库">' + knowledgeBaseOptions(state, selectedIds) + '</div>' +
      '<div class="form-error" role="alert" data-api-kb-error hidden>请至少选择一个知识库。</div><p class="form-help">调用时只能指定已选择的知识库；知识库关闭检索后，即使在范围内也不会返回结果。</p></section></div>';
  }

  function createKeyStepTwoForm(state, draft) {
    var globalOperator = state.rag && state.rag.retrievalSettings && state.rag.retrievalSettings.operator || {};
    var policy = draft.retrievalPolicy && draft.retrievalPolicy.mode === "custom" ? draft.retrievalPolicy : { mode: "global" };
    var operator = policy.mode === "custom" && policy.operator ? policy.operator : globalOperator;
    var models = rerankerModels(state);
    var requestedModelId = operator.rerankerModelId || globalOperator.rerankerModelId;
    var selectedModelId = models.some(function some(model) { return model.id === requestedModelId; })
      ? requestedModelId
      : models[0] && models[0].id;
    var rerankEnabled = Boolean(operator.rerankEnabled && selectedModelId);
    var finalTopK = Number(operator.finalTopK);
    if (!Number.isFinite(finalTopK)) finalTopK = Number(globalOperator.finalTopK || 10);
    return '<div class="api-key-create-form" data-api-wizard-step="2"><section class="api-key-create-section"><div class="form-label">检索策略</div><div class="api-key-policy-options" role="radiogroup" aria-label="检索策略">' +
      '<label class="api-key-policy-option' + (policy.mode === "global" ? " is-selected" : "") + '" data-api-policy-option><input type="radio" name="api-key-policy-mode" value="global"' + (policy.mode === "global" ? " checked" : "") + '><span class="api-key-policy-option__icon">' + dom.icon("refresh-cw", 17) + '</span><span><strong>跟随全局配置</strong><small>始终使用检索配置页的最新设置</small></span></label>' +
      '<label class="api-key-policy-option' + (policy.mode === "custom" ? " is-selected" : "") + '" data-api-policy-option><input type="radio" name="api-key-policy-mode" value="custom"' + (policy.mode === "custom" ? " checked" : "") + '><span class="api-key-policy-option__icon">' + dom.icon("sliders-horizontal", 17) + '</span><span><strong>独立配置</strong><small>固定使用此 Key 的召回参数</small></span></label></div>' +
      '<div class="api-key-custom-policy" data-api-custom-policy' + (policy.mode === "custom" ? "" : " hidden") + ' aria-hidden="' + (policy.mode === "custom" ? "false" : "true") + '"><div class="api-key-fixed-retrieval">' + dom.icon("git-merge", 17) + '<span><strong>混合检索</strong><small>关键词与语义检索由系统统一融合并去重</small></span></div>' +
      '<div class="api-key-rerank-setting"><div><strong>Rerank</strong><small>对召回候选结果重新排序</small></div><button type="button" class="switch' + (rerankEnabled ? " is-on" : "") + '" role="switch" aria-checked="' + (rerankEnabled ? "true" : "false") + '" aria-label="API Key Rerank" data-api-rerank-toggle' + (models.length ? "" : " disabled") + '></button></div>' +
      '<div class="api-key-custom-fields"><div class="form-field">' + dom.requiredLabel("Rerank 模型", { forId: "api-key-reranker-model" }) + '<select id="api-key-reranker-model" class="select-field" data-api-custom-control data-api-reranker-model disabled>' + rerankerOptions(state, selectedModelId) + '</select></div>' +
      '<div class="form-field">' + dom.requiredLabel("最终 Top K", { forId: "api-key-final-topk" }) + '<input id="api-key-final-topk" class="field" type="number" inputmode="numeric" min="5" max="20" step="1" value="' + dom.escape(String(finalTopK)) + '" required aria-required="true" data-api-custom-control disabled></div>' +
      '<div class="form-field">' + dom.requiredLabel("相关度阈值", { forId: "api-key-relevance" }) + '<input id="api-key-relevance" class="field" type="number" inputmode="decimal" min="0.40" max="0.90" step="0.01" value="' + retrievalThreshold(operator).toFixed(2) + '" required aria-required="true" data-api-custom-control disabled></div></div></div></section></div>';
  }

  function syncKeyCreateForm(scope) {
    var selectedMode = scope.querySelector('[name="api-key-policy-mode"]:checked');
    var custom = Boolean(selectedMode && selectedMode.value === "custom");
    var panel = scope.querySelector("[data-api-custom-policy]");
    var rerankToggle = scope.querySelector("[data-api-rerank-toggle]");
    var rerankEnabled = Boolean(rerankToggle && rerankToggle.getAttribute("aria-checked") === "true");
    scope.querySelectorAll("[data-api-policy-option]").forEach(function each(card) {
      var radio = card.querySelector('input[type="radio"]');
      card.classList.toggle("is-selected", Boolean(radio && radio.checked));
    });
    if (panel) {
      panel.hidden = !custom;
      panel.setAttribute("aria-hidden", custom ? "false" : "true");
    }
    scope.querySelectorAll("[data-api-custom-control]").forEach(function each(control) {
      control.disabled = !custom;
    });
    var model = scope.querySelector("[data-api-reranker-model]");
    if (model) {
      model.disabled = !custom || !rerankEnabled;
      model.required = custom && rerankEnabled;
      if (model.required) model.setAttribute("aria-required", "true");
      else model.removeAttribute("aria-required");
      var modelLabel = scope.querySelector('label[for="api-key-reranker-model"]');
      if (modelLabel) {
        modelLabel.classList.toggle("form-label--required", model.required);
        modelLabel.querySelectorAll(".form-required-mark, .sr-only").forEach(function each(indicator) {
          indicator.hidden = !model.required;
        });
      }
    }
    var selectedCount = scope.querySelectorAll("[data-api-kb-option]:checked").length;
    var count = scope.querySelector("[data-api-kb-count]");
    var error = scope.querySelector("[data-api-kb-error]");
    if (count) count.textContent = "已选择 " + selectedCount + " 个";
    if (error && selectedCount) error.hidden = true;
  }

  function bindKeyCreateForm(scope) {
    if (!scope) return;
    scope.addEventListener("change", function handleChange(event) {
      if (event.target.matches('[name="api-key-policy-mode"], [data-api-kb-option]')) syncKeyCreateForm(scope);
    });
    var rerankToggle = scope.querySelector("[data-api-rerank-toggle]");
    if (rerankToggle) rerankToggle.addEventListener("click", function handleToggle() {
      if (rerankToggle.disabled) return;
      var enabled = rerankToggle.getAttribute("aria-checked") !== "true";
      rerankToggle.setAttribute("aria-checked", enabled ? "true" : "false");
      rerankToggle.classList.toggle("is-on", enabled);
      syncKeyCreateForm(scope);
    });
    syncKeyCreateForm(scope);
  }

  function retrievalPolicyPayload(root) {
    var selectedMode = root.querySelector('[name="api-key-policy-mode"]:checked');
    var mode = selectedMode ? selectedMode.value : "global";
    if (mode === "global") return { mode: "global" };
    var toggle = root.querySelector("[data-api-rerank-toggle]");
    var rerankEnabled = Boolean(toggle && toggle.getAttribute("aria-checked") === "true");
    return {
      mode: "custom",
      operator: {
        rerankEnabled: rerankEnabled,
        rerankerModelId: rerankEnabled ? (root.querySelector("[data-api-reranker-model]") || {}).value || null : null,
        finalTopK: Number((root.querySelector("#api-key-final-topk") || {}).value),
        relevanceThreshold: Number((root.querySelector("#api-key-relevance") || {}).value)
      }
    };
  }

  function firstInvalidControl(root) {
    return Array.from(root.querySelectorAll("input, select")).find(function find(control) {
      return !control.disabled && typeof control.checkValidity === "function" && !control.checkValidity();
    }) || null;
  }

  function openKeyStepOne(state, draft) {
    overlay.open({
      title: "创建 API Key",
      confirmLabel: "下一步",
      wide: true,
      panelClass: "api-key-config-dialog",
      body: wizardSteps(1) + createKeyStepOneForm(state, draft),
      onConfirm: function onConfirm(root) {
        var name = root.querySelector('[data-api-field="name"]').value.trim();
        if (!name) {
          overlay.toast("请输入名称", "名称为必填项。", "warning");
          return false;
        }
        var duplicate = retrievalKeys(state).some(function some(item) {
          return keyName(item).toLowerCase() === name.toLowerCase();
        });
        if (duplicate) {
          overlay.toast("无法创建密钥", "检索 API 密钥名称不能重复。", "warning");
          return false;
        }
        var knowledgeBaseIds = Array.from(root.querySelectorAll("[data-api-kb-option]:checked")).map(function map(input) { return input.value; });
        if (!knowledgeBaseIds.length) {
          var error = root.querySelector("[data-api-kb-error]");
          if (error) error.hidden = false;
          var firstOption = root.querySelector("[data-api-kb-option]");
          if (firstOption) firstOption.focus();
          return false;
        }
        var invalid = firstInvalidControl(root);
        if (invalid) {
          if (typeof invalid.reportValidity === "function") invalid.reportValidity();
          invalid.focus();
          return false;
        }
        draft.name = name;
        draft.knowledgeBaseIds = knowledgeBaseIds;
        openKeyStepTwo(state, draft);
        return true;
      }
    });
    bindKeyCreateForm(document.querySelector("#overlay-root .dialog"));
  }

  function openKeyStepTwo(state, draft) {
    overlay.open({
      title: "创建 API Key",
      cancelLabel: "上一步",
      cancelAttrs: "data-api-key-back",
      confirmLabel: "生成 API Key",
      wide: true,
      panelClass: "api-key-config-dialog",
      body: wizardSteps(2) + createKeyStepTwoForm(state, draft),
      onConfirm: function onConfirm(root) {
        var invalid = firstInvalidControl(root);
        if (invalid) {
          if (typeof invalid.reportValidity === "function") invalid.reportValidity();
          invalid.focus();
          return false;
        }
        draft.retrievalPolicy = retrievalPolicyPayload(root);
        var result = invoke("createApiKey", [{
          apiType: "retrieval",
          name: draft.name,
          knowledgeBaseIds: draft.knowledgeBaseIds,
          retrievalPolicy: draft.retrievalPolicy
        }]);
        if (!result) {
          overlay.toast("无法创建密钥", "请检查知识库范围和检索策略配置。", "warning");
          return false;
        }
        showSecret(result);
        return true;
      }
    });
    var panel = document.querySelector("#overlay-root .dialog");
    bindKeyCreateForm(panel);
    var back = panel && panel.querySelector("[data-api-key-back]");
    if (back) back.addEventListener("click", function goBack() {
      draft.retrievalPolicy = retrievalPolicyPayload(panel);
      openKeyStepOne(state, draft);
    });
  }

  function createKey(state) {
    openKeyStepOne(state, {
      name: "",
      knowledgeBaseIds: [],
      retrievalPolicy: { mode: "global" }
    });
  }

  function knowledgeBaseDetail(item, state) {
    var scoped = keyKnowledgeBases(item, state);
    if (!scoped.length) return '<div class="api-key-detail-empty">当前未绑定可用知识库。</div>';
    return '<ul class="api-key-detail-kb-list">' + scoped.map(function map(knowledgeBase) {
      return '<li class="api-key-detail-kb">' + dom.escape(knowledgeBase.name) + '</li>';
    }).join("") + '</ul>';
  }

  function retrievalPolicyDetail(item, state) {
    var operator = retrievalOperator(item, state);
    var reranker = operator.rerankEnabled ? rerankerName(state, operator.rerankerModelId) : "未启用";
    return '<dl class="api-key-detail-grid"><div><dt>Rerank 模型</dt><dd>' + dom.escape(reranker) + '</dd></div><div><dt>最终 Top K</dt><dd>' + dom.escape(text(operator.finalTopK, "10")) + '</dd></div><div><dt>相关度阈值</dt><dd>' + retrievalThreshold(operator).toFixed(2) + '</dd></div></dl>';
  }

  function showDetail(item, state) {
    if (!item) return;
    overlay.open({
      title: "查看检索 API Key",
      wide: true,
      panelClass: "api-key-config-dialog",
      cancelLabel: false,
      confirmLabel: "完成",
      body: '<div class="api-key-view-form"><dl class="api-key-view-fields"><div><dt>名称</dt><dd>' + dom.escape(keyName(item)) + '</dd></div>' +
        '<div><dt>API Key</dt><dd class="api-key-secret-value">' + dom.escape(maskedKey(item)) + '</dd></div></dl>' +
        '<section class="api-key-detail-section"><h3>可访问知识库</h3>' + knowledgeBaseDetail(item, state) + '</section>' +
        '<section class="api-key-detail-section"><h3>检索策略</h3>' + retrievalPolicyDetail(item, state) + '</section></div>'
    });
  }

  function toggleKey(item, state) {
    if (!item) return;
    var nextEnabled = !keyEnabled(item);
    overlay.confirm({
      title: (nextEnabled ? "启用" : "禁用") + "检索 API Key",
      confirmLabel: "确认" + (nextEnabled ? "启用" : "禁用"),
      confirmVariant: nextEnabled ? "primary" : "danger",
      body: '<p class="api-key-confirm-copy">' + (nextEnabled ? "启用后，该密钥可恢复调用。" : "禁用后，使用该密钥的新调用将被拒绝，之后可重新启用。") + '</p>',
      onConfirm: function onConfirm() {
        var result = invoke("setApiKeyEnabled", [item.id, nextEnabled]);
        if (!result) return false;
        overlay.toast("密钥状态已更新", "检索 API · " + keyName(item) + " 已" + (nextEnabled ? "启用。" : "禁用。"), nextEnabled ? "success" : "warning");
        return true;
      }
    });
  }

  function deleteKey(item, state) {
    if (!item) return;
    overlay.confirm({
      title: "删除检索 API Key",
      confirmLabel: "删除",
      confirmVariant: "danger",
      body: '<p class="api-key-confirm-copy">删除后，“' + dom.escape(keyName(item)) + '”的 API Key 将立即失效且无法恢复。</p>',
      onConfirm: function onConfirm() {
        var result = invoke("deleteApiKey", [item.id]);
        if (!result) return false;
        overlay.toast("密钥已删除", "检索 API · " + keyName(item) + " 已从列表中删除。", "success");
        return true;
      }
    });
  }

  function copyVisibleSecret(input, onCopied) {
    if (!input) return;
    var copied = function copied() {
      if (typeof onCopied === "function") onCopied();
      overlay.toast("密钥已复制", "请安全保存并按需配置到业务系统。", "success");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(copied).catch(function fallback() {
        input.select();
        document.execCommand("copy");
        copied();
      });
      return;
    }
    input.select();
    document.execCommand("copy");
    copied();
  }

  function mountApiAccess(root) {
    root.addEventListener("click", function onClick(event) {
      var state = OpsDemo.core.store.getState();
      var create = event.target.closest("[data-api-create]");
      if (create) return createKey(state);
      var detail = event.target.closest("[data-api-detail]");
      if (detail) return showDetail(findKey(state, detail.getAttribute("data-api-detail")), state);
      var toggle = event.target.closest("[data-api-toggle]");
      if (toggle) return toggleKey(findKey(state, toggle.getAttribute("data-api-toggle")), state);
      var remove = event.target.closest("[data-api-delete]");
      if (remove) return deleteKey(findKey(state, remove.getAttribute("data-api-delete")), state);
    });
  }

  OpsDemo.pages.apiAccess = { render: renderApiAccess, mount: mountApiAccess };
})(window.OpsDemo);

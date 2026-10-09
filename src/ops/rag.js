(function defineRagPages(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;
  var router = OpsDemo.core.router;
  var actions = OpsDemo.core.actions;
  var cleanupRetrievalSettingsPage = null;

  function esc(value) {
    return dom.escape(value);
  }

  function number(value) {
    return dom.formatNumber(value == null ? 0 : value);
  }

  function findKnowledgeBase(state, id) {
    return state.knowledgeBases.find(function find(item) { return item.id === id; }) || null;
  }

  function modelConnectionReady(model) {
    return Boolean(model && model.status === "available" && model.lastConnectionTest && model.lastConnectionTest.status === "passed");
  }

  function currentRetrievalOperator(state) {
    return state.rag && state.rag.retrievalSettings ? state.rag.retrievalSettings.operator : {};
  }

  function readyRerankerModels(state) {
    var catalog = state.rag && state.rag.modelCatalog;
    return (catalog && catalog.rerankerModels || []).filter(modelConnectionReady);
  }

  function rerankerOptions(state, selectedId) {
    var models = readyRerankerModels(state);
    return models.length ? models.map(function map(model) {
      return '<option value="' + esc(model.id) + '"' + (model.id === selectedId ? " selected" : "") + '>' + esc(model.alias) + "</option>";
    }).join("") : '<option value="" selected disabled>暂无连接正常的 Rerank 模型</option>';
  }

  var relevanceBands = [
    { value: "loose", label: "宽松", range: "≤ 0.50", max: 0.5, description: "覆盖优先" },
    { value: "balanced", label: "均衡", range: "0.51–0.70", max: 0.7, description: "兼顾数量与质量" },
    { value: "strict", label: "严格", range: "≥ 0.71", max: 0.9, description: "质量优先，结果可能更少" }
  ];

  function exactRelevanceThreshold(value) {
    var numeric = Number(value);
    var scaled = Math.round(numeric * 100);
    if (!Number.isFinite(numeric) || Math.abs(numeric - scaled / 100) > 1e-9 || scaled < 40 || scaled > 90) return null;
    return scaled / 100;
  }

  function normalizedRelevanceThreshold(value, legacyLevel) {
    var exact = exactRelevanceThreshold(value);
    if (exact != null) return exact;
    return legacyLevel === "loose" ? 0.4 : legacyLevel === "strict" ? 0.8 : 0.6;
  }

  function relevanceThresholdFromOperator(operator) {
    var value = operator || {};
    return normalizedRelevanceThreshold(value.relevanceThreshold, value.relevanceLevel);
  }

  function relevanceBandAt(threshold) {
    var score = normalizedRelevanceThreshold(threshold);
    return relevanceBands.find(function find(item) { return score <= item.max; }) || relevanceBands[2];
  }

  function relevanceDescription() {
    return relevanceBands.map(function describe(item) {
      return item.range + " " + item.label + "（" + item.description + "）";
    }).join("，") + "。";
  }

  function relevanceNumberInput(id, selected, options) {
    var threshold = normalizedRelevanceThreshold(selected);
    var band = relevanceBandAt(threshold);
    var showDescription = !options || options.showDescription !== false;
    var descriptionId = id + "-description";
    return '<input id="' + id + '" class="field" type="number" inputmode="decimal" min="0.40" max="0.90" step="0.01" value="' + threshold.toFixed(2) + '" required aria-required="true"' +
      (showDescription ? ' aria-describedby="' + descriptionId + '"' : "") +
      ' aria-valuetext="相关度阈值 ' + threshold.toFixed(2) + "，" + band.label + '" data-relevance-input>' +
      (showDescription ? '<div id="' + descriptionId + '" class="form-help" data-relevance-description>' + relevanceDescription() + '</div>' : "");
  }

  function syncRelevanceInput(input, normalize) {
    if (!input) return;
    var threshold = exactRelevanceThreshold(input.value);
    var description = input.parentElement && input.parentElement.querySelector("[data-relevance-description]");
    if (threshold == null) {
      input.setCustomValidity("请输入 0.40 至 0.90 之间的数值，步长为 0.01。");
      input.setAttribute("aria-invalid", "true");
      input.removeAttribute("aria-valuetext");
      if (description) description.textContent = "请输入 0.40 至 0.90 之间的数值，最多保留两位小数。";
      return;
    }
    var band = relevanceBandAt(threshold);
    input.setCustomValidity("");
    input.removeAttribute("aria-invalid");
    input.setAttribute("aria-valuetext", "相关度阈值 " + threshold.toFixed(2) + "，" + band.label);
    if (normalize) input.value = threshold.toFixed(2);
    if (description) description.textContent = relevanceDescription(threshold);
  }

  function bindRelevanceInputs(root) {
    root.querySelectorAll("[data-relevance-input]").forEach(function bind(input) {
      input.addEventListener("input", function handle() { syncRelevanceInput(input, false); });
      input.addEventListener("change", function handle() { syncRelevanceInput(input, true); });
      input.addEventListener("blur", function handle() { syncRelevanceInput(input, true); });
      syncRelevanceInput(input, true);
    });
  }

  function relevanceInputValue(root, id) {
    var input = root.querySelector("#" + id);
    var threshold = exactRelevanceThreshold(input && input.value);
    if (threshold == null && input) {
      syncRelevanceInput(input, false);
      if (typeof input.reportValidity === "function") input.reportValidity();
    } else if (input) {
      syncRelevanceInput(input, true);
    }
    return threshold == null ? Number.NaN : threshold;
  }

  function renderRetrievalSettings(state) {
    var settings = state.rag.retrievalSettings;
    var operator = settings.operator;
    var modelReady = readyRerankerModels(state).length > 0;
    var headerActions = dom.button("检索测试", { variant: "secondary", icon: "search-check", attrs: "data-open-retrieval-test" }) +
      dom.button("更新配置", { variant: "primary", icon: "save", attrs: "data-save-retrieval-settings", disabled: true });
    return dom.pageHeader({ title: "检索配置", actions: headerActions }) +
      '<div class="page-content retrieval-settings-page"><div class="retrieval-settings-layout">' +
      '<section class="panel retrieval-settings-section retrieval-settings-section--system"><div class="panel__header"><div><h2>检索方式</h2><p>系统统一管理召回与融合策略</p></div></div><div class="panel__body">' +
      '<div class="retrieval-system-heading"><span class="retrieval-system-heading__icon" aria-hidden="true">' + dom.icon("git-merge", 18) + '</span><div><h3>混合检索</h3><p>同时使用关键词与语义检索，系统统一合并结果并去重。关键词检索按关键词与字段匹配召回证据。语义检索按向量语义相似度召回证据。</p></div></div>' +
      '</div></section>' +
      '<section class="panel retrieval-settings-section retrieval-settings-section--rerank"><div class="panel__header"><div><h2>Rerank</h2><p>按需对系统召回的候选结果重新排序</p></div><button type="button" class="switch' + (operator.rerankEnabled ? " is-on" : "") + '" role="switch" aria-checked="' + (operator.rerankEnabled ? "true" : "false") + '" aria-label="Rerank" data-rerank-toggle></button></div><div class="panel__body retrieval-settings-fields retrieval-settings-fields--single" data-rerank-fields>' +
      '<div class="form-field">' + dom.requiredLabel("Rerank 模型", { forId: "retrieval-reranker-model" }) + '<select id="retrieval-reranker-model" class="select-field"' + (operator.rerankEnabled ? ' required aria-required="true"' : " disabled") + '>' + rerankerOptions(state, operator.rerankerModelId) + '</select><div class="form-help">' + (modelReady ? "开启后使用所选模型对候选结果重新排序。" : "暂无连接正常的 Rerank 模型。") + '</div></div>' +
      '</div></section>' +
      '<section class="panel retrieval-settings-section retrieval-settings-section--results"><div class="panel__header"><div><h2>召回设置</h2><p>控制最终返回数量与相关度阈值</p></div></div><div class="panel__body"><div class="retrieval-result-fields">' +
      '<div class="form-field">' + dom.requiredLabel("最终 Top K", { forId: "retrieval-final-topk" }) + '<input id="retrieval-final-topk" class="field" type="number" min="5" max="20" value="' + esc(operator.finalTopK) + '" required aria-required="true"><div class="form-help">达到相关度阈值后，最多返回的证据切片数。</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("相关度阈值", { forId: "retrieval-relevance" }) + relevanceNumberInput("retrieval-relevance", relevanceThresholdFromOperator(operator)) + '</div></div></div></section>' +
      '<div class="retrieval-settings-footnote">' + dom.icon("info", 15) + '<span>设置仅影响后续 Query 检索，不会重新解析文件、切片或生成向量。</span></div>' +
      '</div></div>';
  }

  function retrievalSettingsPayload(root) {
    var toggle = root.querySelector("[data-rerank-toggle]");
    var relevanceThreshold = relevanceInputValue(root, "retrieval-relevance");
    return {
      rerankEnabled: Boolean(toggle && toggle.getAttribute("aria-checked") === "true"),
      rerankerModelId: (root.querySelector("#retrieval-reranker-model") || {}).value || null,
      finalTopK: Number((root.querySelector("#retrieval-final-topk") || {}).value),
      relevanceThreshold: relevanceThreshold,
      relevanceLevel: relevanceBandAt(relevanceThreshold).value
    };
  }

  function syncRequiredLabel(root, controlId, required) {
    var label = root.querySelector('label[for="' + controlId + '"]');
    if (!label) return;
    label.classList.toggle("form-label--required", required);
    label.querySelectorAll(".form-required-mark, .sr-only").forEach(function each(indicator) {
      indicator.hidden = !required;
    });
  }

  function syncRetrievalSettingsControls(root) {
    var toggle = root.querySelector("[data-rerank-toggle]");
    if (!toggle) return;
    var enabled = toggle.getAttribute("aria-checked") === "true";
    [root.querySelector("#retrieval-reranker-model")].forEach(function each(control) {
      if (!control) return;
      control.disabled = !enabled;
      control.required = enabled;
      if (enabled) control.setAttribute("aria-required", "true");
      else control.removeAttribute("aria-required");
    });
    syncRequiredLabel(root, "retrieval-reranker-model", enabled);
  }

  function retrievalSettingsDraftKey(root) {
    var toggle = root.querySelector("[data-rerank-toggle]");
    var enabled = Boolean(toggle && toggle.getAttribute("aria-checked") === "true");
    var model = root.querySelector("#retrieval-reranker-model");
    var topK = root.querySelector("#retrieval-final-topk");
    var relevance = root.querySelector("#retrieval-relevance");
    return [
      enabled ? "1" : "0",
      enabled && model ? model.value : "",
      topK ? String(topK.value).trim() : "",
      relevance ? String(relevance.value).trim() : ""
    ].join("|");
  }

  function validateRetrievalSettings(root) {
    var relevance = root.querySelector("#retrieval-relevance");
    if (relevance) syncRelevanceInput(relevance, true);
    var invalid = Array.from(root.querySelectorAll("input, select")).find(function find(control) {
      return !control.disabled && typeof control.checkValidity === "function" && !control.checkValidity();
    });
    if (!invalid) return true;
    if (typeof invalid.reportValidity === "function") invalid.reportValidity();
    invalid.focus();
    return false;
  }

  function mountRetrievalSettings(root) {
    if (cleanupRetrievalSettingsPage) cleanupRetrievalSettingsPage();
    var save = root.querySelector("[data-save-retrieval-settings]");
    var initialDraftKey = retrievalSettingsDraftKey(root);
    var dirty = false;
    var unblockNavigation = null;

    function beforeUnload(event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function releaseDirtyGuard() {
      if (unblockNavigation) unblockNavigation();
      unblockNavigation = null;
      window.removeEventListener("beforeunload", beforeUnload);
    }

    function saveSettings() {
      if (!validateRetrievalSettings(root)) return false;
      var result = actions.updateRetrievalSettings(retrievalSettingsPayload(root));
      if (!result) {
        overlay.toast("配置未更新", "请检查 Top K、相关度阈值和 Rerank 模型连接状态。", "warning");
        return false;
      }
      dirty = false;
      releaseDirtyGuard();
      overlay.toast("检索配置已更新", "后续检索请求将使用新配置。", "success");
      return true;
    }

    function confirmUnsavedNavigation(transition, options) {
      var opts = options || {};
      var onConfirm = typeof opts.onConfirm === "function" ? opts.onConfirm : (function defaultConfirm() {
        if (!saveSettings()) return false;
        if (transition && typeof transition.retry === "function") {
          transition.retry();
          return true;
        }
        return false;
      });
      overlay.open({
        title: "有未更新的配置",
        body: '<div class="retrieval-unsaved-dialog"><p>当前修改尚未更新。离开后，未保存的内容将丢失。</p></div>',
        cancelLabel: "继续编辑",
        confirmLabel: opts.confirmLabel || "更新配置并离开",
        onConfirm: onConfirm,
      });
      return false;
    }

    function syncDirtyState() {
      dirty = retrievalSettingsDraftKey(root) !== initialDraftKey;
      root.toggleAttribute("data-retrieval-settings-dirty", dirty);
      if (save) {
        save.disabled = !dirty;
        save.setAttribute("aria-disabled", dirty ? "false" : "true");
      }
      if (dirty && !unblockNavigation) {
        unblockNavigation = router.block(confirmUnsavedNavigation);
        window.addEventListener("beforeunload", beforeUnload);
      } else if (!dirty) {
        releaseDirtyGuard();
      }
    }

    var toggle = root.querySelector("[data-rerank-toggle]");
    if (toggle) toggle.addEventListener("click", function handle() {
      var next = toggle.getAttribute("aria-checked") !== "true";
      var model = root.querySelector("#retrieval-reranker-model");
      if (next && (!model || !model.value)) {
        overlay.toast("无法启用 Rerank", "请先在模型管理中配置并测通 Rerank 模型。", "warning");
        return;
      }
      toggle.setAttribute("aria-checked", next ? "true" : "false");
      toggle.classList.toggle("is-on", next);
      syncRetrievalSettingsControls(root);
      syncDirtyState();
    });
    bindRelevanceInputs(root);
    if (save) save.addEventListener("click", function handle() {
      saveSettings();
    });
    root.querySelectorAll("#retrieval-reranker-model, #retrieval-final-topk, #retrieval-relevance").forEach(function bindDirty(control) {
      control.addEventListener("input", syncDirtyState);
      control.addEventListener("change", syncDirtyState);
    });
    var preview = root.querySelector("[data-open-retrieval-test]");
    if (preview) preview.addEventListener("click", function handle() {
      if (!dirty) {
        actions.clearRetrievalTestDraft();
        router.navigate("retrieval-test");
        return;
      }
      if (!validateRetrievalSettings(root)) return;
      var draft = actions.previewRetrievalSettings(retrievalSettingsPayload(root));
      if (!draft) {
        overlay.toast("无法进入检索测试", "请检查 Top K、相关度阈值和 Rerank 模型连接状态。", "warning");
        return;
      }
      router.navigate("retrieval-test?settings=preview");
    });
    syncRetrievalSettingsControls(root);
    syncDirtyState();
    cleanupRetrievalSettingsPage = function cleanup() {
      releaseDirtyGuard();
      cleanupRetrievalSettingsPage = null;
    };
  }

  function unmountRetrievalSettings() {
    if (cleanupRetrievalSettingsPage) cleanupRetrievalSettingsPage();
  }

  function renderRag(route, state) {
    return renderRetrievalSettings(state);
  }

  function optionList(items, selected, labeler) {
    return items.map(function map(item) {
      return '<option value="' + esc(item.id) + '"' + (item.id === selected ? " selected" : "") + ">" + esc(labeler(item)) + "</option>";
    }).join("");
  }

  function retrievalKnowledgeBaseChoice(item) {
    return '<span class="retrieval-kb-choice"><span class="retrieval-kb-choice__name">' + esc(item.name) + "</span></span>";
  }

  function retrievalKnowledgeBasePicker(items, selectedId) {
    var knowledgeBases = (items || []).slice();
    var selectedItem = knowledgeBases.find(function find(item) { return item.id === selectedId; }) || knowledgeBases[0];
    var sourceOptions = knowledgeBases.map(function mapSourceOption(item) {
      return '<option value="' + esc(item.id) + '"' + (selectedItem && item.id === selectedItem.id ? " selected" : "") + ">" + esc(item.name) + "</option>";
    }).join("");
    var listOptions = knowledgeBases.map(function mapListOption(item) {
      var isSelected = Boolean(selectedItem && item.id === selectedItem.id);
      return '<button type="button" class="retrieval-kb-option" role="option" tabindex="-1" aria-selected="' + (isSelected ? "true" : "false") + '" data-retrieval-kb-option="' + esc(item.id) + '">' + retrievalKnowledgeBaseChoice(item) + '<span class="retrieval-kb-option__check" aria-hidden="true">' + dom.icon("check", 14) + "</span></button>";
    }).join("");
    return '<div class="retrieval-kb-picker" data-retrieval-kb-picker><select id="test-kb-v2" hidden aria-hidden="true" tabindex="-1" data-retrieval-kb-source>' + sourceOptions + '</select><button type="button" class="retrieval-kb-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="test-kb-listbox" aria-labelledby="test-kb-label test-kb-value" data-retrieval-kb-trigger><span id="test-kb-value" data-retrieval-kb-value>' + (selectedItem ? retrievalKnowledgeBaseChoice(selectedItem) : "请选择知识库") + '</span>' + dom.icon("chevron-down", 15) + '</button><div id="test-kb-listbox" class="retrieval-kb-listbox" role="listbox" aria-labelledby="test-kb-label" data-retrieval-kb-listbox hidden>' + listOptions + "</div></div>";
  }

  function isAnswerGenerationEnabled(test) {
    if (!test) return false;
    if (typeof test.answerGenerationEnabled === "boolean") return test.answerGenerationEnabled;
    return Boolean(test.generationSnapshot && test.generationSnapshot.enabled === true);
  }

  function percentage(numerator, denominator, hasRun) {
    if (!hasRun) return "—";
    if (!denominator) return "0%";
    return Math.round((Number(numerator || 0) / Number(denominator)) * 100) + "%";
  }

  function retrievalResultSummary(test, comparison, hasRun) {
    var evidence = test.evidence || [];
    var evidenceRelevant = evidence.filter(function filter(item) { return item.relevanceMark === "relevant"; }).length;
    var evidenceIrrelevant = evidence.filter(function filter(item) { return item.relevanceMark === "irrelevant"; }).length;
    var returnedCount = Number(comparison.returnedCount != null ? comparison.returnedCount : evidence.length);
    var effectiveCount = Number(comparison.expectedEvidenceHit != null ? comparison.expectedEvidenceHit : evidenceRelevant);
    var expectedTotal = Number(comparison.expectedEvidenceTotal || 0);
    var irrelevantCount = Number(comparison.irrelevantCount != null ? comparison.irrelevantCount : evidenceIrrelevant);
    var reviewedCount = effectiveCount + irrelevantCount;
    var value = function value(content) { return hasRun ? content : "—"; };
    return '<div class="retrieval-result-summary" aria-label="本次检索摘要">' +
      '<div title="本次检索实际返回的切片总量"><span>返回切片数</span><strong>' + value(number(returnedCount)) + "</strong></div>" +
      '<div title="本次结果中被标记为相关的证据切片数"><span>有效证据数</span><strong>' + value(number(effectiveCount)) + "</strong></div>" +
      '<div title="已命中的预期证据占全部预期证据的比例"><span>证据覆盖度</span><strong>' + percentage(effectiveCount, expectedTotal, hasRun) + "</strong></div>" +
      '<div title="已判断切片中相关证据所占的比例"><span>结果相关性</span><strong>' + percentage(effectiveCount, reviewedCount, hasRun) + "</strong></div></div>";
  }

  function answerQualitySummary(test, hasRun) {
    var metrics = hasRun && test.answerMetrics || null;
    var generated = Boolean(hasRun && test.answerGenerated && metrics);
    var percent = function percent(value) {
      return generated && value != null ? (Number(value) * 100).toFixed(1) + "%" : "—";
    };
    var latency = generated && metrics.generationLatencyMs != null ? number(metrics.generationLatencyMs) + " ms" : "—";
    return '<div class="retrieval-answer-quality"><div class="retrieval-quality-heading"><strong>回答质量</strong></div>' +
      '<div class="retrieval-result-summary retrieval-result-summary--quality" aria-label="回答质量指标">' +
      '<div title="回答中的事实是否得到检索证据支持"><span>忠实度</span><small>Faithfulness</small><strong>' + percent(metrics && metrics.faithfulness) + '</strong></div>' +
      '<div title="生成回答是否直接回应测试问题"><span>答案相关性</span><small>Answer relevance</small><strong>' + percent(metrics && metrics.answerRelevance) + '</strong></div>' +
      '<div title="回答中的关键结论是否附带引用"><span>引用覆盖率</span><small>Citation coverage</small><strong>' + percent(metrics && metrics.citationCoverage) + '</strong></div>' +
      '<div title="静态 Demo 的确定性模拟生成耗时"><span>生成时延</span><small>Generation latency</small><strong>' + latency + '</strong></div></div></div>';
  }

  function qualityDashboard(test, comparison, hasRun, generationEnabled) {
    return '<div class="retrieval-quality-dashboard' + (generationEnabled ? "" : " is-retrieval-only") + '"><section class="retrieval-quality-group"><div class="retrieval-quality-heading"><strong>检索质量</strong></div>' + retrievalResultSummary(test, comparison, hasRun) + '</section><section class="retrieval-quality-group" data-answer-quality' + (generationEnabled ? "" : " hidden") + '>' + answerQualitySummary(test, hasRun) + '</section></div>';
  }

  function generatedAnswerMessage(test) {
    if (!test.answerGenerated || !test.generatedAnswer) return "";
    var citations = (test.answerCitations || []).map(function map(citation, index) {
      var rank = Number(citation.rank || index + 1);
      return '<button type="button" class="retrieval-answer-citation" data-evidence-jump="' + rank + '" title="定位到引用证据"><span>[' + rank + ']</span>' + esc(citation.documentName || "引用证据") + '</button>';
    }).join("");
    var snapshot = test.generationSnapshot || {};
    return '<article class="retrieval-message retrieval-message--assistant" aria-label="生成回答"><div class="retrieval-message__avatar">' + dom.icon("sparkles", 16) + '</div><div class="retrieval-message__content"><div class="retrieval-message__label">生成回答</div><p class="retrieval-generated-answer">' + esc(test.generatedAnswer) + '</p>' +
      (citations ? '<div class="retrieval-answer-citations" aria-label="回答引用">' + citations + '</div>' : "") +
      '<div class="retrieval-answer-meta">' + esc(snapshot.modelAlias || snapshot.modelId || snapshot.model || "回答模型") + ' · 基于本次检索证据生成</div></div></article>';
  }

  function evidenceRows(test, comparison) {
    if (!test.evidence || !test.evidence.length) {
      return '<div class="notice">' + dom.icon("shield-x", 17) + '<div class="notice__content"><div class="notice__title">无可返回证据</div>' + esc(test.emptyReasonLabel || "当前身份和过滤条件下未命中可访问内容。") + "</div></div>";
    }
    var rows = test.evidence.map(function map(item) {
      var snapshot = test.runtimeSnapshot || {};
      var scoreSource = item.scoreSource || snapshot.scoreSource || (snapshot.operator && snapshot.operator.rerankEnabled === false ? "fusion" : "rerank");
      var rawScore = item.retrievalScore != null ? item.retrievalScore : scoreSource === "rerank" ? item.rerankScore : item.fusionScore;
      var score = Number(rawScore);
      var scoreLabel = scoreSource === "rerank" ? "重排分" : "融合分";
      var scoreHtml = Number.isFinite(score) ? '<span class="evidence-item__score" title="本次用于排序和过滤的' + scoreLabel + '"><span>相关度</span><strong>' + score.toFixed(2) + '</strong><small>' + scoreLabel + '</small></span>' : "";
      return '<article class="evidence-item" id="retrieval-evidence-' + esc(item.rank) + '" tabindex="-1"><div class="evidence-item__header"><div class="evidence-item__rank">' + esc(item.rank) + '</div><div class="evidence-item__title">' + esc(item.documentName) + '</div><div class="evidence-item__locator">' + esc(item.locator) + "</div></div>" +
        '<p class="evidence-item__excerpt">' + esc(item.excerpt) + '</p><div class="evidence-item__quality">' + scoreHtml + dom.status(item.relevanceMarkLabel, item.relevanceMark === "relevant" ? "success" : "neutral", true) + "</div></article>";
    }).join("");
    return rows;
  }

  function retrievalTestSettings(state, route, test) {
    var draft = state.rag && state.rag.retrievalTestDraft;
    var usePreview = route.query.settings === "preview" && draft && draft.operator;
    var useTest = route.query.settings === "test" && test && test.runtimeSnapshot && test.runtimeSnapshot.source === "test";
    return {
      source: usePreview ? "preview" : useTest ? "test" : "online",
      operator: usePreview ? draft.operator : useTest ? test.runtimeSnapshot.operator : currentRetrievalOperator(state)
    };
  }

  function retrievalOperatorKey(operator) {
    var value = operator || {};
    return [
      value.rerankEnabled ? "1" : "0",
      value.rerankerModelId || "",
      Number(value.finalTopK || 0),
      relevanceThresholdFromOperator(value).toFixed(2)
    ].join("|");
  }

  function retrievalResultMatchesRuntime(test, runtime) {
    var snapshot = test && test.runtimeSnapshot;
    return Boolean(snapshot && snapshot.source === runtime.source && retrievalOperatorKey(snapshot.operator) === retrievalOperatorKey(runtime.operator));
  }

  function retrievalTestControls(state, runtime, kbId, generationEnabled) {
    var operator = runtime.operator;
    var system = state.rag && state.rag.retrievalSettings && state.rag.retrievalSettings.system || {};
    var modeLabel = String(system.retrievalModeLabel || "混合检索").replace(/（系统默认）/g, "");
    var rerankRequired = operator.rerankEnabled ? ' required aria-required="true"' : " disabled";
    var generation = state.rag && state.rag.answerGeneration || { model: "DeepSeek-V4-Pro", temperature: 0.2, citationEnabled: true };
    var answerModelName = generation.modelAlias || generation.model || generation.modelId || "DeepSeek-V4-Pro";
    return '<div class="retrieval-test-settings-heading"><h2>测试参数</h2></div>' +
      '<section class="retrieval-test-settings-section retrieval-test-settings-section--scope">' +
      '<div class="form-field"><div id="test-kb-label" class="form-label">知识库</div>' + retrievalKnowledgeBasePicker(state.knowledgeBases, kbId) + "</div>" +
      '<div class="form-field"><span class="form-label">检索方式</span><div class="retrieval-test-mode-card">' +
      '<span class="retrieval-test-mode-card__icon">' + dom.icon("git-merge", 17) + '</span><div><strong>' + esc(modeLabel) + '</strong><span>关键词检索与语义检索始终启用 · 系统统一合并排序并去重</span></div></div></div></section>' +
      '<section class="retrieval-test-settings-section retrieval-test-settings-section--rerank"><div class="retrieval-test-settings-section__header"><div><h3>Rerank</h3><p>对候选结果进行语义重排</p></div><button type="button" class="switch' + (operator.rerankEnabled ? " is-on" : "") + '" role="switch" aria-checked="' + (operator.rerankEnabled ? "true" : "false") + '" aria-label="本次测试 Rerank" data-test-rerank-toggle></button></div>' +
      '<div class="retrieval-test-rerank-fields" data-test-rerank-fields><div class="form-field">' + dom.requiredLabel("Rerank 模型", { forId: "test-reranker-model" }) + '<select id="test-reranker-model" class="select-field"' + rerankRequired + '>' + rerankerOptions(state, operator.rerankerModelId) + '</select></div></div></section>' +
      '<section class="retrieval-test-settings-section retrieval-test-settings-section--results"><div class="retrieval-test-result-grid"><div class="form-field">' + dom.requiredLabel("最终 Top K", { forId: "test-final-topk" }) + '<input id="test-final-topk" class="field" type="number" min="5" max="20" value="' + esc(operator.finalTopK) + '" required aria-required="true"></div>' +
      '<div class="form-field">' + dom.requiredLabel("相关度阈值", { forId: "test-relevance" }) + relevanceNumberInput("test-relevance", relevanceThresholdFromOperator(operator), { showDescription: false }) + '</div></div></section>' +
      '<section class="retrieval-test-settings-section retrieval-test-settings-section--answer"><div class="retrieval-test-settings-section__header"><div><h3>回答生成</h3><p>基于检索证据生成带引用的回答</p></div><button type="button" class="switch' + (generationEnabled ? " is-on" : "") + '" role="switch" aria-checked="' + (generationEnabled ? "true" : "false") + '" aria-label="本次测试生成回答" data-test-answer-toggle></button></div>' +
      '<div class="retrieval-test-rerank-fields retrieval-test-answer-fields' + (generationEnabled ? "" : " is-disabled") + '" data-test-answer-fields aria-disabled="' + (generationEnabled ? "false" : "true") + '"><div class="form-field"><label class="form-label" for="test-answer-model">回答模型</label><select id="test-answer-model" class="select-field" data-test-answer-model disabled title="使用中的 LLM 可在模型管理中设置"><option selected>' + esc(answerModelName) + '</option></select></div></div></section>';
  }

  function retrievalTestPayload(root) {
    var toggle = root.querySelector("[data-test-rerank-toggle]");
    var rerankEnabled = Boolean(toggle && toggle.getAttribute("aria-checked") === "true");
    var relevanceThreshold = relevanceInputValue(root, "test-relevance");
    return {
      rerankEnabled: rerankEnabled,
      rerankerModelId: rerankEnabled ? (root.querySelector("#test-reranker-model") || {}).value || null : null,
      finalTopK: Number((root.querySelector("#test-final-topk") || {}).value),
      relevanceThreshold: relevanceThreshold,
      relevanceLevel: relevanceBandAt(relevanceThreshold).value,
      generateAnswer: Boolean(root.querySelector("[data-test-answer-toggle]") && root.querySelector("[data-test-answer-toggle]").getAttribute("aria-checked") === "true")
    };
  }

  function syncRetrievalTestControls(root) {
    var toggle = root.querySelector("[data-test-rerank-toggle]");
    var model = root.querySelector("#test-reranker-model");
    var run = root.querySelector("[data-run-test-v2]");
    if (!toggle) return;
    var enabled = toggle.getAttribute("aria-checked") === "true";
    [model].forEach(function each(control) {
      if (!control) return;
      control.disabled = !enabled;
      control.required = enabled;
      if (enabled) control.setAttribute("aria-required", "true");
      else control.removeAttribute("aria-required");
    });
    syncRequiredLabel(root, "test-reranker-model", enabled);
    if (run) {
      var baseRunnable = run.getAttribute("data-base-runnable") === "true";
      run.disabled = !baseRunnable || Boolean(enabled && (!model || !model.value));
    }
    var answerToggle = root.querySelector("[data-test-answer-toggle]");
    var answerFields = root.querySelector("[data-test-answer-fields]");
    var answerModel = root.querySelector("[data-test-answer-model]");
    var answerEnabled = Boolean(answerToggle && answerToggle.getAttribute("aria-checked") === "true");
    if (answerFields) {
      answerFields.classList.toggle("is-disabled", !answerEnabled);
      answerFields.setAttribute("aria-disabled", answerEnabled ? "false" : "true");
    }
    if (answerModel) answerModel.disabled = true;
    var answerQuality = root.querySelector("[data-answer-quality]");
    if (answerQuality) answerQuality.hidden = !answerEnabled;
    var qualityDashboard = root.querySelector(".retrieval-quality-dashboard");
    if (qualityDashboard) qualityDashboard.classList.toggle("is-retrieval-only", !answerEnabled);
  }

  function retrievalTestLocation(knowledgeBaseId, options) {
    var input = options || {};
    var query = [];
    if (knowledgeBaseId) query.push("knowledgeBaseId=" + encodeURIComponent(knowledgeBaseId));
    if (input.settings && input.settings !== "online") query.push("settings=" + encodeURIComponent(input.settings));
    if (input.run) query.push("run=" + encodeURIComponent(input.run));
    return "retrieval-test" + (query.length ? "?" + query.join("&") : "");
  }

  function renderRetrievalTest(route, state) {
    var fallbackTest = state.rag.retrievalTests[0] || null;
    var kbId = route.query.knowledgeBaseId || fallbackTest && fallbackTest.knowledgeBaseId || state.knowledgeBases[0] && state.knowledgeBases[0].id;
    var kb = findKnowledgeBase(state, kbId);
    if (!kb) {
      kb = findKnowledgeBase(state, fallbackTest && fallbackTest.knowledgeBaseId) || state.knowledgeBases[0] || null;
      kbId = kb && kb.id;
    }
    var test = state.rag.retrievalTests.find(function find(item) { return item.knowledgeBaseId === kbId; }) || {
      id: null,
      knowledgeBaseId: kbId,
      question: "",
      comparison: { returnedCount: 0, expectedEvidenceHit: 0, expectedEvidenceTotal: 0, irrelevantCount: 0 },
      evidence: [],
      fixtureAvailable: false,
      validationState: "not_run",
      emptyReasonLabel: "尚无测试结果，请输入问题并运行检索。"
    };
    var runtime = retrievalTestSettings(state, route, test);
    var operator = runtime.operator;
    var searchableCount = kb && kb.documentCounts ? Number(kb.documentCounts.searchable || 0) : 0;
    var embeddingModels = state.rag.modelCatalog.embeddingModels || [];
    var embeddingModel = kb && embeddingModels.find(function find(item) { return item.id === kb.boundEmbeddingModelId; });
    var blockedReason = !kb ? "知识库不存在" : !searchableCount ? "知识库尚无可检索文件" : !modelConnectionReady(embeddingModel) ? "当前知识库的向量模型连接不可用" : "";
    var runnable = !blockedReason;
    var resultMatchesRuntime = retrievalResultMatchesRuntime(test, runtime);
    var hasRun = Boolean(route.query.run && resultMatchesRuntime && test.lastRunAt);
    var comparison = hasRun ? test.comparison || (test.comparisons || [])[0] : null;
    if (!comparison) comparison = { returnedCount: 0, expectedEvidenceHit: 0, expectedEvidenceTotal: 0, irrelevantCount: 0 };
    var generationEnabled = Boolean(hasRun && isAnswerGenerationEnabled(test));
    var qualitySummary = '<div class="retrieval-chat__quality" aria-live="polite">' + qualityDashboard(test, comparison, hasRun, generationEnabled) + "</div>";
    var chatBody = "";
    if (!runnable) {
      chatBody = '<div class="retrieval-chat-blocked"><div class="notice notice--danger">' + dom.icon("circle-off", 17) + '<div class="notice__content"><div class="notice__title">暂时无法检索</div>' + esc(blockedReason) + "。</div></div></div>";
    } else if (hasRun) {
      chatBody = '<article class="retrieval-message retrieval-message--user" aria-label="测试问题"><div class="retrieval-message__avatar">' + dom.icon("user-round", 16) + '</div><div class="retrieval-message__content"><p>' + esc(test.question || "") + '</p></div></article>' +
        generatedAnswerMessage(test) +
        '<article class="retrieval-message retrieval-message--result" tabindex="-1" data-retrieval-result><div class="retrieval-message__avatar">' + dom.icon("search-check", 16) + '</div><div class="retrieval-message__content"><div class="retrieval-message__label">检索证据</div><p>' + esc((test.evidence || []).length ? "本次回答使用了以下证据片段。" : "本次未返回符合要求的证据。") + '</p>' +
        '<div class="retrieval-evidence-list">' + evidenceRows(test, comparison) + '</div></div></article>';
    } else {
      chatBody = '<div class="retrieval-chat-empty">' + dom.icon("message-square-text", 22) + '<strong>开始一次完整 RAG 测试</strong><span>发送问题后，将依次展示生成回答、引用证据、检索质量与回答质量。</span></div>';
    }
    var rerankReady = !operator.rerankEnabled || readyRerankerModels(state).length > 0;
    return dom.pageHeader({ title: "检索测试" }) +
      '<div class="page-content retrieval-test-page"><div class="retrieval-studio">' +
      '<section class="retrieval-chat" aria-label="RAG 对话与质量结果">' + qualitySummary + '<div class="retrieval-chat__body" aria-live="polite">' + chatBody + '</div>' +
      '<footer class="retrieval-composer"><textarea id="test-question-v2" class="retrieval-composer__input" rows="2" required aria-required="true" aria-label="测试问题" placeholder="输入需要测试的问题，Enter 发送，Shift + Enter 换行"' + (runnable ? "" : " disabled") + '>' + esc(test.question || "") + '</textarea>' + dom.button("发送", { variant: "primary", icon: "send", attrs: 'data-run-test-v2 data-base-runnable="' + (runnable ? "true" : "false") + '"', disabled: !runnable || !rerankReady }) + '</footer></section>' +
      '<aside class="retrieval-studio__settings" aria-label="检索测试设置">' + retrievalTestControls(state, runtime, kbId, generationEnabled) + '</aside></div></div>';
  }

  function mountRetrievalTest(root, route) {
    var initialState = OpsDemo.core.store.getState();
    var kbSelect = root.querySelector("#test-kb-v2");
    var selectedTest = initialState.rag.retrievalTests.find(function find(item) { return item.knowledgeBaseId === (kbSelect && kbSelect.value); }) || null;
    var runtime = retrievalTestSettings(initialState, route, selectedTest);
    if (route.query.from) {
      router.navigate(retrievalTestLocation(kbSelect && kbSelect.value, { settings: runtime.source, run: route.query.run }));
      return;
    }
    if (kbSelect && route.query.knowledgeBaseId && route.query.knowledgeBaseId !== kbSelect.value) {
      router.navigate(retrievalTestLocation(kbSelect.value, { settings: runtime.source }));
      return;
    }
    if (kbSelect) kbSelect.addEventListener("change", function handle() {
      router.navigate(retrievalTestLocation(kbSelect.value, { settings: runtime.source }));
    });
    var knowledgeBasePicker = root.querySelector("[data-retrieval-kb-picker]");
    if (knowledgeBasePicker && kbSelect) {
      var knowledgeBaseTrigger = knowledgeBasePicker.querySelector("[data-retrieval-kb-trigger]");
      var knowledgeBaseValue = knowledgeBasePicker.querySelector("[data-retrieval-kb-value]");
      var knowledgeBaseListbox = knowledgeBasePicker.querySelector("[data-retrieval-kb-listbox]");
      var knowledgeBaseOptions = Array.from(knowledgeBasePicker.querySelectorAll("[data-retrieval-kb-option]"));
      var knowledgeBaseRemovalObserver = null;

      function selectedKnowledgeBaseOption() {
        return knowledgeBaseOptions.find(function find(option) { return option.dataset.retrievalKbOption === kbSelect.value; }) || knowledgeBaseOptions[0];
      }

      function syncKnowledgeBaseSelection() {
        var current = selectedKnowledgeBaseOption();
        if (!current) return;
        knowledgeBaseOptions.forEach(function each(option) {
          option.setAttribute("aria-selected", option === current ? "true" : "false");
        });
        var choice = current.querySelector(".retrieval-kb-choice");
        if (knowledgeBaseValue && choice) knowledgeBaseValue.innerHTML = choice.outerHTML;
      }

      function handleKnowledgeBaseOutsidePointer(event) {
        if (!knowledgeBasePicker.contains(event.target)) setKnowledgeBaseOpen(false);
      }

      function handleKnowledgeBaseEscape(event) {
        if (event.key !== "Escape" || knowledgeBaseTrigger.getAttribute("aria-expanded") !== "true") return;
        event.preventDefault();
        event.stopPropagation();
        setKnowledgeBaseOpen(false);
        knowledgeBaseTrigger.focus();
      }

      function cleanupKnowledgeBaseGlobalListeners() {
        document.removeEventListener("pointerdown", handleKnowledgeBaseOutsidePointer, true);
        document.removeEventListener("keydown", handleKnowledgeBaseEscape, true);
        if (knowledgeBaseRemovalObserver) knowledgeBaseRemovalObserver.disconnect();
        knowledgeBaseRemovalObserver = null;
      }

      function setKnowledgeBaseOpen(open) {
        var nextOpen = open === true;
        knowledgeBaseTrigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
        knowledgeBaseTrigger.classList.toggle("is-open", nextOpen);
        knowledgeBaseListbox.hidden = !nextOpen;
        if (nextOpen) {
          cleanupKnowledgeBaseGlobalListeners();
          document.addEventListener("pointerdown", handleKnowledgeBaseOutsidePointer, true);
          document.addEventListener("keydown", handleKnowledgeBaseEscape, true);
          if (typeof MutationObserver === "function") {
            knowledgeBaseRemovalObserver = new MutationObserver(function cleanupWhenRemoved() {
              if (!knowledgeBasePicker.isConnected) cleanupKnowledgeBaseGlobalListeners();
            });
            knowledgeBaseRemovalObserver.observe(document.body, { childList: true, subtree: true });
          }
        } else {
          cleanupKnowledgeBaseGlobalListeners();
        }
      }

      function focusKnowledgeBaseOption(offset, absoluteIndex) {
        var activeIndex = knowledgeBaseOptions.indexOf(document.activeElement);
        var currentIndex = knowledgeBaseOptions.indexOf(selectedKnowledgeBaseOption());
        var nextIndex = absoluteIndex;
        if (!Number.isInteger(nextIndex)) nextIndex = (activeIndex >= 0 ? activeIndex : currentIndex) + offset;
        if (nextIndex < 0) nextIndex = knowledgeBaseOptions.length - 1;
        if (nextIndex >= knowledgeBaseOptions.length) nextIndex = 0;
        knowledgeBaseOptions[nextIndex].focus();
      }

      function chooseKnowledgeBase(option) {
        var nextValue = option.dataset.retrievalKbOption;
        var changed = kbSelect.value !== nextValue;
        kbSelect.value = nextValue;
        syncKnowledgeBaseSelection();
        setKnowledgeBaseOpen(false);
        knowledgeBaseTrigger.focus();
        if (changed) kbSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }

      knowledgeBaseTrigger.addEventListener("click", function toggleKnowledgeBasePicker() {
        var willOpen = knowledgeBaseTrigger.getAttribute("aria-expanded") !== "true";
        setKnowledgeBaseOpen(willOpen);
        if (willOpen) focusKnowledgeBaseOption(0, knowledgeBaseOptions.indexOf(selectedKnowledgeBaseOption()));
      });
      knowledgeBaseTrigger.addEventListener("keydown", function handleKnowledgeBaseTriggerKeydown(event) {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        setKnowledgeBaseOpen(true);
        focusKnowledgeBaseOption(0, event.key === "ArrowUp" ? knowledgeBaseOptions.length - 1 : knowledgeBaseOptions.indexOf(selectedKnowledgeBaseOption()));
      });
      knowledgeBaseOptions.forEach(function bindKnowledgeBaseOption(option) {
        option.addEventListener("click", function selectKnowledgeBaseOption() { chooseKnowledgeBase(option); });
      });
      knowledgeBaseListbox.addEventListener("keydown", function handleKnowledgeBaseListboxKeydown(event) {
        if (event.key === "Tab") {
          setKnowledgeBaseOpen(false);
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          focusKnowledgeBaseOption(event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          focusKnowledgeBaseOption(0, event.key === "Home" ? 0 : knowledgeBaseOptions.length - 1);
          return;
        }
        if ((event.key === "Enter" || event.key === " ") && knowledgeBaseOptions.indexOf(document.activeElement) >= 0) {
          event.preventDefault();
          chooseKnowledgeBase(document.activeElement);
        }
      });
      syncKnowledgeBaseSelection();
    }
    var toggle = root.querySelector("[data-test-rerank-toggle]");
    if (toggle) toggle.addEventListener("click", function handle() {
      var next = toggle.getAttribute("aria-checked") !== "true";
      var model = root.querySelector("#test-reranker-model");
      if (next && (!model || !model.value)) {
        overlay.toast("无法启用 Rerank", "请先配置并测通 Rerank 模型。", "warning");
        return;
      }
      toggle.setAttribute("aria-checked", next ? "true" : "false");
      toggle.classList.toggle("is-on", next);
      syncRetrievalTestControls(root);
    });
    var model = root.querySelector("#test-reranker-model");
    if (model) model.addEventListener("change", function handle() {
      syncRetrievalTestControls(root);
    });
    var answerToggle = root.querySelector("[data-test-answer-toggle]");
    if (answerToggle) answerToggle.addEventListener("click", function handle() {
      var next = answerToggle.getAttribute("aria-checked") !== "true";
      answerToggle.setAttribute("aria-checked", next ? "true" : "false");
      answerToggle.classList.toggle("is-on", next);
      syncRetrievalTestControls(root);
    });
    bindRelevanceInputs(root);
    var run = root.querySelector("[data-run-test-v2]");
    if (run) run.addEventListener("click", function handle() {
      var question = root.querySelector("#test-question-v2").value.trim();
      if (!question) {
        overlay.toast("请输入测试问题", "检索问题不能为空。", "warning");
        return;
      }
      var knowledgeBaseId = root.querySelector("#test-kb-v2").value;
      var current = OpsDemo.core.store.getState();
      var currentTest = current.rag.retrievalTests.find(function find(item) { return item.knowledgeBaseId === knowledgeBaseId; }) || null;
      var quickSettings = retrievalTestPayload(root);
      var changed = retrievalOperatorKey(quickSettings) !== retrievalOperatorKey(runtime.operator);
      var result = actions.runRetrievalTest({
        testId: currentTest && currentTest.id,
        knowledgeBaseId: knowledgeBaseId,
        question: question,
        useDraft: runtime.source === "preview",
        operatorOverrides: runtime.source === "test" || changed ? quickSettings : null,
        generateAnswer: quickSettings.generateAnswer,
        silentRender: true
      });
      if (result) {
        var source = result.runtimeSnapshot && result.runtimeSnapshot.source || "online";
        var runToken = result.lastRunAt || String(Date.now());
        router.navigate(retrievalTestLocation(knowledgeBaseId, { settings: source, run: runToken }));
        overlay.toast("检索已完成", "结果已按本次参数刷新，全局设置未发生变化。", "success");
      } else {
        overlay.toast("无法运行检索", "请检查 Rerank、Top K 和相关性设置。", "warning");
      }
    });
    var questionInput = root.querySelector("#test-question-v2");
    if (questionInput && !questionInput.readOnly) questionInput.addEventListener("keydown", function sendOnEnter(event) {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      if (run && !run.disabled) run.click();
    });
    root.querySelectorAll("[data-evidence-jump]").forEach(function bindCitation(button) {
      button.addEventListener("click", function jumpToEvidence() {
        var evidence = root.querySelector("#retrieval-evidence-" + button.getAttribute("data-evidence-jump"));
        if (!evidence) return;
        evidence.scrollIntoView({ behavior: "smooth", block: "center" });
        evidence.focus({ preventScroll: true });
      });
    });
    syncRetrievalTestControls(root);
    var resultFocus = root.querySelector("[data-retrieval-result]");
    if (route.query.run && resultFocus) requestAnimationFrame(function focusResult() { resultFocus.focus({ preventScroll: true }); });
  }

  OpsDemo.pages.rag = {
    render: renderRag,
    mount: mountRetrievalSettings,
    unmount: unmountRetrievalSettings
  };

  OpsDemo.pages.retrievalTest = {
    render: renderRetrievalTest,
    mount: mountRetrievalTest
  };
})(window.OpsDemo);

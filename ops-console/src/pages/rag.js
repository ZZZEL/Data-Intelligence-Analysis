(function defineRagPages(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;
  var router = OpsDemo.core.router;
  var actions = OpsDemo.core.actions;

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
    { value: "loose", label: "宽松", range: "0.4–0.5", max: 0.5, description: "覆盖优先，可能包含弱相关内容。" },
    { value: "balanced", label: "均衡", range: "0.6–0.7", max: 0.7, description: "平衡结果数量与相关质量。" },
    { value: "strict", label: "严格", range: "0.8–0.9", max: 0.9, description: "质量优先，返回结果可能更少。" }
  ];

  function normalizedRelevanceThreshold(value, legacyLevel) {
    var numeric = Number(value);
    if (Number.isFinite(numeric)) {
      var rounded = Math.round(numeric * 10) / 10;
      if (rounded >= 0.4 && rounded <= 0.9) return rounded;
    }
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

  function relevanceProgress(threshold) {
    return ((normalizedRelevanceThreshold(threshold) - 0.4) / 0.5) * 100;
  }

  function relevanceCards(activeBand) {
    return '<div class="retrieval-relevance-cards" role="list" aria-label="相关度分数区间说明">' + relevanceBands.map(function map(band) {
      var active = band.value === activeBand.value;
      return '<article class="retrieval-relevance-card' + (active ? " is-active" : "") + '" role="listitem" data-relevance-card="' + band.value + '"' + (active ? ' aria-current="true"' : "") + '><div class="retrieval-relevance-card__header"><strong>' + band.label + '</strong><span>' + band.range + '</span></div><p>' + band.description + '</p></article>';
    }).join("") + '</div>';
  }

  function relevanceSlider(id, selected, compact) {
    var threshold = normalizedRelevanceThreshold(selected);
    var band = relevanceBandAt(threshold);
    var descriptionId = id + "-description";
    return '<div class="retrieval-relevance-slider' + (compact ? " retrieval-relevance-slider--compact" : "") + '" data-relevance-slider data-relevance-value="' + threshold.toFixed(1) + '" data-relevance-band="' + band.value + '" style="--relevance-progress: ' + relevanceProgress(threshold) + '%">' +
      (compact ? "" : relevanceCards(band)) +
      '<div class="retrieval-relevance-slider__summary"><span>最低相关度</span><strong data-relevance-current>' + threshold.toFixed(1) + '</strong></div>' +
      '<input id="' + id + '" class="retrieval-relevance-slider__input" type="range" min="0.4" max="0.9" step="0.1" value="' + threshold.toFixed(1) + '" aria-labelledby="' + id + '-label" aria-valuetext="最低相关度 ' + threshold.toFixed(1) + "，" + band.label + '" aria-describedby="' + descriptionId + '" data-relevance-range>' +
      '<div class="retrieval-relevance-slider__scale" aria-hidden="true"><span>0.4</span><span>0.5</span><span>0.6</span><span>0.7</span><span>0.8</span><span>0.9</span></div>' +
      '<p id="' + descriptionId + '" class="retrieval-relevance-slider__description"><span data-relevance-description>仅返回相关度 ≥ ' + threshold.toFixed(1) + ' 的结果。</span> <span>开启 Rerank 时使用重排分，关闭时使用融合分。</span></p></div>';
  }

  function syncRelevanceSlider(input) {
    var slider = input && input.closest("[data-relevance-slider]");
    if (!slider) return;
    var threshold = normalizedRelevanceThreshold(input.value);
    var band = relevanceBandAt(threshold);
    var current = slider.querySelector("[data-relevance-current]");
    var description = slider.querySelector("[data-relevance-description]");
    slider.setAttribute("data-relevance-value", threshold.toFixed(1));
    slider.setAttribute("data-relevance-band", band.value);
    slider.style.setProperty("--relevance-progress", relevanceProgress(threshold) + "%");
    input.setAttribute("aria-valuetext", "最低相关度 " + threshold.toFixed(1) + "，" + band.label);
    slider.querySelectorAll("[data-relevance-card]").forEach(function update(card) {
      var active = card.getAttribute("data-relevance-card") === band.value;
      card.classList.toggle("is-active", active);
      if (active) card.setAttribute("aria-current", "true");
      else card.removeAttribute("aria-current");
    });
    if (current) current.textContent = threshold.toFixed(1);
    if (description) description.textContent = "仅返回相关度 ≥ " + threshold.toFixed(1) + " 的结果。";
  }

  function bindRelevanceSliders(root) {
    root.querySelectorAll("[data-relevance-range]").forEach(function bind(input) {
      input.addEventListener("input", function handle() { syncRelevanceSlider(input); });
      syncRelevanceSlider(input);
    });
  }

  function relevanceSliderValue(root, id) {
    var input = root.querySelector("#" + id);
    return normalizedRelevanceThreshold(input ? input.value : 0.6);
  }

  function keywordWeightFrom(operator, system) {
    var value = Number(operator && operator.keywordWeight);
    if (!Number.isFinite(value)) {
      var fallback = system && system.fusionWeights && system.fusionWeights.bm25;
      value = Math.round(Number(fallback == null ? 0.5 : fallback) * 100);
    }
    return Math.max(10, Math.min(90, Math.round(value / 5) * 5));
  }

  function hybridRetrievalComposition(operator, system) {
    var keywordWeight = keywordWeightFrom(operator, system);
    var semanticWeight = 100 - keywordWeight;
    return '<div class="retrieval-hybrid-composition" data-hybrid-composition data-keyword-weight="' + keywordWeight + '">' +
      '<section class="retrieval-hybrid-card" aria-labelledby="retrieval-hybrid-title"><div class="retrieval-hybrid-card__heading"><span class="retrieval-system-mode__icon">' + dom.icon("git-merge", 18) + '</span><div><h3 id="retrieval-hybrid-title">混合检索</h3><p>系统固定同时使用两路检索并融合去重</p></div></div>' +
      '<div class="retrieval-hybrid-weight"><div class="retrieval-hybrid-weight__summary"><span>融合权重</span><div><strong data-keyword-weight-label>关键词 ' + keywordWeight + '%</strong><strong data-semantic-weight-label>语义 ' + semanticWeight + '%</strong></div></div>' +
      '<input id="retrieval-keyword-weight" class="retrieval-hybrid-weight__input" type="range" min="10" max="90" step="5" value="' + keywordWeight + '" aria-label="关键词检索权重" aria-valuetext="关键词 ' + keywordWeight + '%，语义 ' + semanticWeight + '%" data-hybrid-weight-range>' +
      '<div class="retrieval-hybrid-weight__scale" aria-hidden="true"><span>偏语义</span><span>均衡</span><span>偏关键词</span></div><p>两种检索始终启用；权重只影响融合排序。</p></div></section>' +
      '<div class="retrieval-hybrid-sources" aria-label="混合检索包含的两路能力">' +
      '<article class="retrieval-hybrid-source retrieval-hybrid-source--keyword" data-keyword-source style="flex-grow:' + keywordWeight + '"><span class="retrieval-system-mode__icon">' + dom.icon("text-search", 18) + '</span><div><div class="retrieval-hybrid-source__title"><strong>关键词检索</strong><span data-keyword-source-value>' + keywordWeight + '%</span></div><p>按关键词与字段匹配</p></div></article>' +
      '<article class="retrieval-hybrid-source retrieval-hybrid-source--semantic" data-semantic-source style="flex-grow:' + semanticWeight + '"><span class="retrieval-system-mode__icon">' + dom.icon("waypoints", 18) + '</span><div><div class="retrieval-hybrid-source__title"><strong>语义检索</strong><span data-semantic-source-value>' + semanticWeight + '%</span></div><p>按语义相似度召回</p></div></article>' +
      '</div></div>';
  }

  function syncHybridWeight(input) {
    var composition = input && input.closest("[data-hybrid-composition]");
    if (!composition) return;
    var keywordWeight = Math.max(10, Math.min(90, Math.round(Number(input.value) / 5) * 5));
    var semanticWeight = 100 - keywordWeight;
    composition.dataset.keywordWeight = String(keywordWeight);
    input.value = String(keywordWeight);
    input.setAttribute("aria-valuetext", "关键词 " + keywordWeight + "%，语义 " + semanticWeight + "%");
    var keywordSource = composition.querySelector("[data-keyword-source]");
    var semanticSource = composition.querySelector("[data-semantic-source]");
    if (keywordSource) keywordSource.style.flexGrow = String(keywordWeight);
    if (semanticSource) semanticSource.style.flexGrow = String(semanticWeight);
    [["[data-keyword-weight-label]", "关键词 " + keywordWeight + "%"], ["[data-semantic-weight-label]", "语义 " + semanticWeight + "%"], ["[data-keyword-source-value]", keywordWeight + "%"], ["[data-semantic-source-value]", semanticWeight + "%"]].forEach(function update(item) {
      var node = composition.querySelector(item[0]);
      if (node) node.textContent = item[1];
    });
  }

  function renderRetrievalSettings(state) {
    var settings = state.rag.retrievalSettings;
    var system = settings.system;
    var operator = settings.operator;
    var modelReady = readyRerankerModels(state).length > 0;
    var headerActions = dom.button("检索测试", { variant: "secondary", icon: "search-check", attrs: "data-open-retrieval-test" }) +
      dom.button("保存设置", { variant: "primary", icon: "save", attrs: "data-save-retrieval-settings" });
    return dom.pageHeader({ title: "检索配置", actions: headerActions }) +
      '<div class="page-content retrieval-settings-page"><div class="retrieval-settings-layout">' +
      '<section class="panel retrieval-settings-section retrieval-settings-section--system"><div class="panel__header"><div><h2>检索方式</h2><p>系统固定使用混合检索，可调整两路结果的融合权重</p></div></div><div class="panel__body">' +
      hybridRetrievalComposition(operator, system) +
      '</div></section>' +
      '<section class="panel retrieval-settings-section retrieval-settings-section--rerank"><div class="panel__header"><div><h2>Rerank</h2><p>按需对系统召回的候选结果重新排序</p></div><button type="button" class="switch' + (operator.rerankEnabled ? " is-on" : "") + '" role="switch" aria-checked="' + (operator.rerankEnabled ? "true" : "false") + '" aria-label="Rerank" data-rerank-toggle></button></div><div class="panel__body retrieval-settings-fields retrieval-settings-fields--single" data-rerank-fields' + (operator.rerankEnabled ? "" : " hidden") + '>' +
      '<div class="form-field">' + dom.requiredLabel("Rerank 模型", { forId: "retrieval-reranker-model" }) + '<select id="retrieval-reranker-model" class="select-field"' + (operator.rerankEnabled ? ' required aria-required="true"' : " disabled") + '>' + rerankerOptions(state, operator.rerankerModelId) + '</select><div class="form-help">' + (modelReady ? "开启后使用所选模型对候选结果重新排序。" : "暂无连接正常的 Rerank 模型。") + '</div></div>' +
      '</div></section>' +
      '<section class="panel retrieval-settings-section retrieval-settings-section--results"><div class="panel__header"><div><h2>召回设置</h2><p>控制最终返回数量与最低相关度</p></div></div><div class="panel__body"><div class="retrieval-result-fields retrieval-result-fields--single">' +
      '<div class="form-field">' + dom.requiredLabel("最终 Top K", { forId: "retrieval-final-topk" }) + '<input id="retrieval-final-topk" class="field" type="number" min="5" max="20" value="' + esc(operator.finalTopK) + '" required aria-required="true"><div class="form-help">达到最低相关度后，最多返回的证据切片数。</div></div></div>' +
      '<fieldset class="retrieval-relevance-fieldset"><legend id="retrieval-relevance-label">相关性要求</legend>' +
      relevanceSlider("retrieval-relevance", relevanceThresholdFromOperator(operator), false) +
      '</fieldset></div></section>' +
      '<div class="retrieval-settings-footnote">' + dom.icon("info", 15) + '<span>设置仅影响后续 Query 检索，不会重新解析文件、切片或生成向量。</span></div>' +
      '</div></div>';
  }

  function retrievalSettingsPayload(root) {
    var toggle = root.querySelector("[data-rerank-toggle]");
    var relevanceThreshold = relevanceSliderValue(root, "retrieval-relevance");
    return {
      rerankEnabled: Boolean(toggle && toggle.getAttribute("aria-checked") === "true"),
      rerankerModelId: (root.querySelector("#retrieval-reranker-model") || {}).value || null,
      keywordWeight: Number((root.querySelector("#retrieval-keyword-weight") || {}).value),
      semanticWeight: 100 - Number((root.querySelector("#retrieval-keyword-weight") || {}).value),
      finalTopK: Number((root.querySelector("#retrieval-final-topk") || {}).value),
      relevanceThreshold: relevanceThreshold,
      relevanceLevel: relevanceBandAt(relevanceThreshold).value
    };
  }

  function syncRetrievalSettingsControls(root) {
    var toggle = root.querySelector("[data-rerank-toggle]");
    if (!toggle) return;
    var enabled = toggle.getAttribute("aria-checked") === "true";
    var fields = root.querySelector("[data-rerank-fields]");
    if (fields) fields.hidden = !enabled;
    [root.querySelector("#retrieval-reranker-model")].forEach(function each(control) {
      if (!control) return;
      control.disabled = !enabled;
      control.required = enabled;
      if (enabled) control.setAttribute("aria-required", "true");
      else control.removeAttribute("aria-required");
    });
  }

  function mountRetrievalSettings(root) {
    var hybridWeight = root.querySelector("[data-hybrid-weight-range]");
    if (hybridWeight) {
      hybridWeight.addEventListener("input", function handle() { syncHybridWeight(hybridWeight); });
      syncHybridWeight(hybridWeight);
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
    });
    bindRelevanceSliders(root);
    var save = root.querySelector("[data-save-retrieval-settings]");
    if (save) save.addEventListener("click", function handle() {
      var result = actions.updateRetrievalSettings(retrievalSettingsPayload(root));
      if (result) overlay.toast("检索设置已保存", "后续检索请求将使用新设置。", "success");
      else overlay.toast("设置未保存", "请检查混合权重、Top K、相关性阈值和 Rerank 模型连接状态。", "warning");
    });
    var preview = root.querySelector("[data-open-retrieval-test]");
    if (preview) preview.addEventListener("click", function handle() {
      var draft = actions.previewRetrievalSettings(retrievalSettingsPayload(root));
      if (!draft) {
        overlay.toast("无法开始测试", "请先检查当前设置。", "warning");
        return;
      }
      router.navigate("retrieval-test?settings=preview");
    });
    syncRetrievalSettingsControls(root);
  }

  function renderRag(route, state) {
    return renderRetrievalSettings(state);
  }

  function optionList(items, selected, labeler) {
    return items.map(function map(item) {
      return '<option value="' + esc(item.id) + '"' + (item.id === selected ? " selected" : "") + ">" + esc(labeler(item)) + "</option>";
    }).join("");
  }

  function orderedRetrievalKnowledgeBases(items) {
    var list = (items || []).slice();
    return list.filter(function filter(item) { return item.benchmarkReadOnly === true; })
      .concat(list.filter(function filter(item) { return item.benchmarkReadOnly !== true; }));
  }

  function retrievalKnowledgeBaseChoice(item) {
    var evaluationBadge = item.benchmarkReadOnly === true ? '<span class="retrieval-kb-choice__badge">评测库</span>' : "";
    return '<span class="retrieval-kb-choice"><span class="retrieval-kb-choice__name">' + esc(item.name) + "</span>" + evaluationBadge + "</span>";
  }

  function retrievalKnowledgeBasePicker(items, selectedId) {
    var orderedItems = orderedRetrievalKnowledgeBases(items);
    var selectedItem = orderedItems.find(function find(item) { return item.id === selectedId; }) || orderedItems[0];
    var sourceOptions = orderedItems.map(function mapSourceOption(item) {
      return '<option value="' + esc(item.id) + '"' + (selectedItem && item.id === selectedItem.id ? " selected" : "") + ">" + esc(item.name) + "</option>";
    }).join("");
    var listOptions = orderedItems.map(function mapListOption(item) {
      var isEvaluation = item.benchmarkReadOnly === true;
      var isSelected = Boolean(selectedItem && item.id === selectedItem.id);
      return '<button type="button" class="retrieval-kb-option' + (isEvaluation ? " retrieval-kb-option--evaluation" : "") + '" role="option" tabindex="-1" aria-selected="' + (isSelected ? "true" : "false") + '" data-retrieval-kb-option="' + esc(item.id) + '" data-evaluation="' + (isEvaluation ? "true" : "false") + '">' + retrievalKnowledgeBaseChoice(item) + '<span class="retrieval-kb-option__check" aria-hidden="true">' + dom.icon("check", 14) + "</span></button>";
    }).join("");
    return '<div class="retrieval-kb-picker" data-retrieval-kb-picker><select id="test-kb-v2" hidden aria-hidden="true" tabindex="-1" data-retrieval-kb-source>' + sourceOptions + '</select><button type="button" class="retrieval-kb-trigger' + (selectedItem && selectedItem.benchmarkReadOnly === true ? " is-evaluation" : "") + '" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="test-kb-listbox" aria-labelledby="test-kb-label test-kb-value" data-retrieval-kb-trigger><span id="test-kb-value" data-retrieval-kb-value>' + (selectedItem ? retrievalKnowledgeBaseChoice(selectedItem) : "请选择知识库") + '</span>' + dom.icon("chevron-down", 15) + '</button><div id="test-kb-listbox" class="retrieval-kb-listbox" role="listbox" aria-labelledby="test-kb-label" data-retrieval-kb-listbox hidden>' + listOptions + "</div></div>";
  }

  function percentage(numerator, denominator, hasRun) {
    if (!hasRun) return "—";
    if (!denominator) return "0%";
    return Math.round((Number(numerator || 0) / Number(denominator)) * 100) + "%";
  }

  function retrievalResultSummary(test, comparison, hasRun, currentOperator) {
    if (test.evaluationSuite) {
      var metrics = hasRun ? test.evaluationMetrics : null;
      var k = metrics && metrics.k || (currentOperator && currentOperator.finalTopK) || (test.runtimeSnapshot && test.runtimeSnapshot.operator && test.runtimeSnapshot.operator.finalTopK) || "K";
      var percentMetric = function percentMetric(value) {
        return value == null ? "N/A" : (Number(value) * 100).toFixed(1) + "%";
      };
      var decimalMetric = function decimalMetric(value) {
        return value == null ? "N/A" : Number(value).toFixed(3);
      };
      var latencyMetric = metrics && metrics.retrievalLatencyMs != null ? number(metrics.retrievalLatencyMs) + " ms" : "N/A";
      var sampleNote = metrics ? "宏平均 · N=" + number(metrics.sampleCount || 0) + (metrics.excludedCount ? " · 排除 " + number(metrics.excludedCount) : "") : "运行后按整套 Gold 评测集计算";
      var latencyNote = metrics && metrics.latencyKind === "simulated" ? "检索时延为静态 Demo 模拟均值；" : "";
      return '<div class="retrieval-evaluation-summary"><div class="retrieval-result-summary retrieval-result-summary--evaluation" aria-label="检索评测指标">' +
        '<div title="前 ' + esc(k) + ' 个结果覆盖了多少 Gold 相关文档"><span>召回率</span><small>Recall@' + esc(k) + '</small><strong>' + (metrics ? percentMetric(metrics.recallAtK) : "—") + '</strong></div>' +
        '<div title="前 ' + esc(k) + ' 个结果中相关文档所占比例；不足 K 的位置按非相关计"><span>精确率</span><small>Precision@' + esc(k) + '</small><strong>' + (metrics ? percentMetric(metrics.precisionAtK) : "—") + '</strong></div>' +
        '<div title="各评测题首个相关结果倒数排名的宏平均；只统计 Top K，因此记作 MRR@K"><span>平均倒数排名</span><small>MRR@' + esc(k) + '</small><strong>' + (metrics ? decimalMetric(metrics.mrrAtK) : "—") + '</strong></div>' +
        '<div title="静态 Demo 的确定性模拟耗时；接入真实检索服务后替换为实测值"><span>检索时延</span><small>Retrieval latency</small><strong>' + (metrics ? latencyMetric : "—") + '</strong></div></div>' +
        '<p class="retrieval-evaluation-summary__note">' + dom.icon("info", 14) + '<span>' + esc(sampleNote) + "。" + esc(latencyNote) + 'Gold 只用于评分，不参与排序；本 Mini 子集不可与完整 SciFact / BEIR 榜单横向比较。</span></p></div>';
    }
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
      return '<article class="evidence-item"><div class="evidence-item__header"><div class="evidence-item__rank">' + esc(item.rank) + '</div><div class="evidence-item__title">' + esc(item.documentName) + '</div><div class="evidence-item__locator">' + esc(item.locator) + "</div></div>" +
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
      Number(value.keywordWeight || 0),
      Number(value.semanticWeight || 0),
      Number(value.finalTopK || 0),
      relevanceThresholdFromOperator(value).toFixed(1)
    ].join("|");
  }

  function retrievalResultMatchesRuntime(test, runtime) {
    var snapshot = test && test.runtimeSnapshot;
    return Boolean(snapshot && snapshot.source === runtime.source && retrievalOperatorKey(snapshot.operator) === retrievalOperatorKey(runtime.operator));
  }

  function retrievalTestControls(state, runtime, kbId, test) {
    var operator = runtime.operator;
    var system = state.rag && state.rag.retrievalSettings && state.rag.retrievalSettings.system || {};
    var modeLabel = system.retrievalModeLabel || "混合检索";
    var keywordWeight = keywordWeightFrom(operator, system);
    var semanticWeight = 100 - keywordWeight;
    var rerankHidden = operator.rerankEnabled ? "" : " hidden";
    var rerankRequired = operator.rerankEnabled ? ' required aria-required="true"' : " disabled";
    var evaluationCases = test && test.evaluationCases || [];
    var activeCaseId = test && test.activeEvaluationCaseId || evaluationCases[0] && evaluationCases[0].id;
    var evaluationControl = evaluationCases.length ? '<div class="form-field retrieval-evaluation-case-field"><label class="form-label" for="test-evaluation-case">预置评测题</label><select id="test-evaluation-case" class="select-field">' + evaluationCases.map(function mapCase(item, index) {
      return '<option value="' + esc(item.id) + '" data-question="' + esc(item.question) + '"' + (item.id === activeCaseId ? " selected" : "") + '>#' + String(index + 1).padStart(2, "0") + " · " + esc(item.question) + "</option>";
    }).join("") + '</select><div class="form-help">本次展示所选题的证据，四项指标按全部 ' + number(evaluationCases.length) + ' 条 Gold 题宏平均。</div></div>' : "";
    return '<div class="retrieval-test-settings-heading"><h2>测试参数</h2></div>' +
      '<section class="retrieval-test-settings-section retrieval-test-settings-section--scope">' +
      '<div class="form-field"><div id="test-kb-label" class="form-label">知识库</div>' + retrievalKnowledgeBasePicker(state.knowledgeBases, kbId) + "</div>" +
      evaluationControl +
      '<div class="form-field"><span class="form-label">检索方式</span><div class="retrieval-test-mode-card">' +
      '<span class="retrieval-test-mode-card__icon">' + dom.icon("git-merge", 17) + '</span><div><strong>' + esc(modeLabel) + '</strong><span>关键词 ' + keywordWeight + '% · 语义 ' + semanticWeight + '%</span></div></div></div></section>' +
      '<section class="retrieval-test-settings-section retrieval-test-settings-section--rerank"><div class="retrieval-test-settings-section__header"><div><h3>Rerank</h3><p>对候选结果进行语义重排</p></div><button type="button" class="switch' + (operator.rerankEnabled ? " is-on" : "") + '" role="switch" aria-checked="' + (operator.rerankEnabled ? "true" : "false") + '" aria-label="本次测试 Rerank" data-test-rerank-toggle></button></div>' +
      '<div class="retrieval-test-rerank-fields" data-test-rerank-fields' + rerankHidden + '><div class="form-field">' + dom.requiredLabel("Rerank 模型", { forId: "test-reranker-model" }) + '<select id="test-reranker-model" class="select-field"' + rerankRequired + '>' + rerankerOptions(state, operator.rerankerModelId) + '</select></div></div></section>' +
      '<section class="retrieval-test-settings-section retrieval-test-settings-section--results"><div class="retrieval-test-result-grid"><div class="form-field">' + dom.requiredLabel("最终 Top K", { forId: "test-final-topk" }) + '<input id="test-final-topk" class="field" type="number" min="5" max="20" value="' + esc(operator.finalTopK) + '" required aria-required="true"></div></div>' +
      '<div class="form-field"><label id="test-relevance-label" class="form-label" for="test-relevance">相关性要求</label>' + relevanceSlider("test-relevance", relevanceThresholdFromOperator(operator), true) + '</div></section>';
  }

  function retrievalTestPayload(root, runtime) {
    var toggle = root.querySelector("[data-test-rerank-toggle]");
    var rerankEnabled = Boolean(toggle && toggle.getAttribute("aria-checked") === "true");
    var relevanceThreshold = relevanceSliderValue(root, "test-relevance");
    return {
      rerankEnabled: rerankEnabled,
      rerankerModelId: rerankEnabled ? (root.querySelector("#test-reranker-model") || {}).value || null : null,
      keywordWeight: Number(runtime.operator.keywordWeight || 50),
      semanticWeight: Number(runtime.operator.semanticWeight || 50),
      finalTopK: Number((root.querySelector("#test-final-topk") || {}).value),
      relevanceThreshold: relevanceThreshold,
      relevanceLevel: relevanceBandAt(relevanceThreshold).value
    };
  }

  function syncRetrievalTestControls(root) {
    var toggle = root.querySelector("[data-test-rerank-toggle]");
    var model = root.querySelector("#test-reranker-model");
    var fields = root.querySelector("[data-test-rerank-fields]");
    var run = root.querySelector("[data-run-test-v2]");
    if (!toggle) return;
    var enabled = toggle.getAttribute("aria-checked") === "true";
    if (fields) fields.hidden = !enabled;
    [model].forEach(function each(control) {
      if (!control) return;
      control.disabled = !enabled;
      control.required = enabled;
      if (enabled) control.setAttribute("aria-required", "true");
      else control.removeAttribute("aria-required");
    });
    if (run) {
      var baseRunnable = run.getAttribute("data-base-runnable") === "true";
      run.disabled = !baseRunnable || Boolean(enabled && (!model || !model.value));
    }
  }

  function renderRetrievalTest(route, state) {
    var fallbackTest = state.rag.retrievalTests[0] || null;
    var kbId = route.query.knowledgeBaseId || fallbackTest && fallbackTest.knowledgeBaseId || state.knowledgeBases[0] && state.knowledgeBases[0].id;
    var kb = findKnowledgeBase(state, kbId);
    if (!kb) {
      kb = findKnowledgeBase(state, fallbackTest && fallbackTest.knowledgeBaseId) || orderedRetrievalKnowledgeBases(state.knowledgeBases)[0] || null;
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
    var blockedReason = !kb ? "知识库不存在" : !kb.enabled ? "知识库已关闭检索" : !searchableCount ? "知识库尚无可检索文件" : !modelConnectionReady(embeddingModel) ? "当前知识库的向量模型连接不可用" : "";
    var runnable = !blockedReason;
    var resultMatchesRuntime = retrievalResultMatchesRuntime(test, runtime);
    var hasRun = Boolean(route.query.run && resultMatchesRuntime && test.lastRunAt);
    var comparison = hasRun ? test.comparison || (test.comparisons || [])[0] : null;
    if (!comparison) comparison = { returnedCount: 0, expectedEvidenceHit: 0, expectedEvidenceTotal: 0, irrelevantCount: 0 };
    var evaluationSummary = test.evaluationSuite ? '<div class="retrieval-chat__evaluation" aria-live="polite">' + retrievalResultSummary(test, comparison, hasRun, operator) + "</div>" : "";
    var chatBody = "";
    if (!runnable) {
      chatBody = '<div class="retrieval-chat-blocked"><div class="notice notice--danger">' + dom.icon("circle-off", 17) + '<div class="notice__content"><div class="notice__title">暂时无法检索</div>' + esc(blockedReason) + "。</div></div></div>";
    } else if (hasRun) {
      chatBody = '<article class="retrieval-message retrieval-message--user" aria-label="测试问题"><div class="retrieval-message__avatar">' + dom.icon("user-round", 16) + '</div><div class="retrieval-message__content"><p>' + esc(test.question || "") + '</p></div></article>' +
        '<article class="retrieval-message retrieval-message--result" tabindex="-1" data-retrieval-result><div class="retrieval-message__avatar">' + dom.icon("search-check", 16) + '</div><div class="retrieval-message__content"><div class="retrieval-message__label">检索结果</div><p>' + esc((test.evidence || []).length ? "已返回以下证据片段。" : "本次未返回符合要求的证据。") + '</p>' +
        (test.evaluationSuite ? "" : retrievalResultSummary(test, comparison, true, operator)) + '<div class="retrieval-evidence-list">' + evidenceRows(test, comparison) + '</div></div></article>';
    }
    var rerankReady = !operator.rerankEnabled || readyRerankerModels(state).length > 0;
    return dom.pageHeader({ title: "检索测试", back: { label: "返回检索配置", route: "retrieval-config" } }) +
      '<div class="page-content retrieval-test-page"><div class="retrieval-studio"><aside class="retrieval-studio__settings" aria-label="检索测试设置">' +
      retrievalTestControls(state, runtime, kbId, test) + '</aside>' +
      '<section class="retrieval-chat" aria-label="检索测试结果">' + evaluationSummary + '<div class="retrieval-chat__body" aria-live="polite">' + chatBody + '</div>' +
      '<footer class="retrieval-composer"><textarea id="test-question-v2" class="retrieval-composer__input" rows="2" required aria-required="true" aria-label="检索问题" placeholder="输入需要检索知识库的问题"' + (test.evaluationSuite ? " readonly" : "") + (runnable ? "" : " disabled") + '>' + esc(test.question || "") + '</textarea>' + dom.button("检索", { variant: "primary", icon: "play", attrs: 'data-run-test-v2 data-base-runnable="' + (runnable ? "true" : "false") + '"', disabled: !runnable || !rerankReady }) + '</footer></section></div></div>';
  }

  function mountRetrievalTest(root, route) {
    var initialState = OpsDemo.core.store.getState();
    var kbSelect = root.querySelector("#test-kb-v2");
    var selectedTest = initialState.rag.retrievalTests.find(function find(item) { return item.knowledgeBaseId === (kbSelect && kbSelect.value); }) || null;
    var runtime = retrievalTestSettings(initialState, route, selectedTest);
    if (kbSelect && route.query.knowledgeBaseId && route.query.knowledgeBaseId !== kbSelect.value) {
      router.navigate("retrieval-test?knowledgeBaseId=" + encodeURIComponent(kbSelect.value) + (runtime.source === "preview" ? "&settings=preview" : ""));
      return;
    }
    if (kbSelect) kbSelect.addEventListener("change", function handle() {
      router.navigate("retrieval-test?knowledgeBaseId=" + encodeURIComponent(kbSelect.value) + (runtime.source === "preview" ? "&settings=preview" : ""));
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
        if (knowledgeBaseTrigger) knowledgeBaseTrigger.classList.toggle("is-evaluation", current.dataset.evaluation === "true");
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
    var evaluationCaseSelect = root.querySelector("#test-evaluation-case");
    if (evaluationCaseSelect) evaluationCaseSelect.addEventListener("change", function handle() {
      var selectedOption = evaluationCaseSelect.options[evaluationCaseSelect.selectedIndex];
      var questionInput = root.querySelector("#test-question-v2");
      if (questionInput && selectedOption) questionInput.value = selectedOption.dataset.question || "";
    });
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
    bindRelevanceSliders(root);
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
      var quickSettings = retrievalTestPayload(root, runtime);
      var changed = retrievalOperatorKey(quickSettings) !== retrievalOperatorKey(runtime.operator);
      var result = actions.runRetrievalTest({
        testId: currentTest && currentTest.id,
        knowledgeBaseId: knowledgeBaseId,
        question: question,
        evaluationCaseId: evaluationCaseSelect && evaluationCaseSelect.value,
        useDraft: runtime.source === "preview",
        operatorOverrides: runtime.source === "test" || changed ? quickSettings : null,
        silentRender: true
      });
      if (result) {
        var source = result.runtimeSnapshot && result.runtimeSnapshot.source || "online";
        var settingsQuery = source === "online" ? "" : "&settings=" + encodeURIComponent(source);
        var runToken = encodeURIComponent(result.lastRunAt || String(Date.now()));
        router.navigate("retrieval-test?knowledgeBaseId=" + encodeURIComponent(knowledgeBaseId) + settingsQuery + "&run=" + runToken);
        overlay.toast("检索已完成", "结果已按本次参数刷新，全局设置未发生变化。", "success");
      } else {
        overlay.toast("无法运行检索", "请检查 Rerank、Top K 和相关性设置。", "warning");
      }
    });
    syncRetrievalTestControls(root);
    var resultFocus = root.querySelector("[data-retrieval-result]");
    if (route.query.run && resultFocus) requestAnimationFrame(function focusResult() { resultFocus.focus({ preventScroll: true }); });
  }

  OpsDemo.pages.rag = {
    render: renderRag,
    mount: mountRetrievalSettings
  };

  OpsDemo.pages.retrievalTest = {
    render: renderRetrievalTest,
    mount: mountRetrievalTest
  };
})(window.OpsDemo);

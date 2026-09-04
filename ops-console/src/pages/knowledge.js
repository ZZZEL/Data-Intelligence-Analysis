(function defineKnowledgePage(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;
  var preview = OpsDemo.ui.preview;
  var router = OpsDemo.core.router;
  var actions = OpsDemo.core.actions;
  var onboardingProcessingDrafts = Object.create(null);

  function esc(value) {
    return dom.escape(value);
  }

  function displayDate(value) {
    if (!value) return "—";
    var text = String(value);
    var parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime()) && text.length > 10) {
      var parts = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(parsed).reduce(function reduce(result, part) {
        result[part.type] = part.value;
        return result;
      }, {});
      return esc(parts.year + "-" + parts.month + "-" + parts.day + " " + parts.hour + ":" + parts.minute);
    }
    return esc(text.slice(0, 10));
  }

  function number(value) {
    return dom.formatNumber(value == null ? 0 : value);
  }

  function knowledgeDocuments(state, knowledgeBaseId) {
    return (state.documents || []).filter(function filter(item) {
      return item.knowledgeBaseId === knowledgeBaseId;
    });
  }

  function knowledgeImports(state, knowledgeBaseId) {
    return (state.importBatches || []).filter(function filter(item) {
      return item.knowledgeBaseId === knowledgeBaseId;
    });
  }

  function findDocument(state, id) {
    return (state.documents || []).find(function find(item) { return item.id === id; }) || null;
  }

  function documentChunks(state, item) {
    if (!item) return [];
    if (item.chunks) return item.chunks;
    return (state.chunks || []).filter(function filter(chunk) { return chunk.documentId === item.id; }).sort(function sort(left, right) {
      return Number(left.index || left.order || 0) - Number(right.index || right.order || 0);
    });
  }

  function documentLifecycle(item) {
    var status = item.status || item.fileStatus || item.lifecycleStatus || "pending";
    var step = item.currentStep || "";
    if (!step && item.versions && item.versions[0]) step = item.versions[0].currentStep || "";
    var label = item.statusLabel || item.fileStatusLabel || "";
    if (status === "ready") return { key: "effective", label: label || "可检索" };
    if (status === "parsing") return { key: "parsing", label: label || "解析中" };
    if (status === "chunking") return { key: "chunking", label: label || "切片中" };
    if (status === "embedding") return { key: "embedding", label: label || "向量化中" };
    if (status === "indexing") return { key: "indexing", label: label || "索引中" };
    if (status === "failed" || status === "partial_failure") return { key: "failed", label: "处理失败" };
    if (item.searchable || status === "effective" || status === "completed") return { key: "effective", label: "可检索" };
    if (status === "pending_activation" || step === "index" || step === "activation") return { key: "indexing", label: "索引中" };
    if (step === "embedding") {
      var progress = String(item.lifecycleStatusLabel || "").match(/(\d+)%/);
      return { key: "embedding", label: progress ? "向量化中 " + progress[1] + "%" : "向量化中" };
    }
    if (step === "chunk" || step === "chunking" || status === "updating") return { key: "chunking", label: "切片中" };
    if (step === "mineru_parse" || step === "parse" || step === "parsing") return { key: "parsing", label: "解析中" };
    return { key: "pending", label: "待处理" };
  }

  function lifecycleTone(key) {
    return { effective: "success", failed: "danger", pending: "neutral", parsing: "info", chunking: "info", embedding: "info", indexing: "info" }[key] || "neutral";
  }

  function findKnowledgeBase(state, id, batchId) {
    if (id === "local-documents") return actions.getLocalDocumentImportContext(batchId);
    return (state.knowledgeBases || []).find(function find(item) { return item.id === id; }) || null;
  }

  function importReturnRoute(id) {
    return id === "local-documents" ? "local-documents" : "knowledge/" + id + "?tab=documents";
  }

  function importStepRoute(id, step, batchId, existingImport) {
    var path = id === "local-documents" ? "local-documents/upload?step=" : "knowledge/" + id + "?onboarding=1&step=";
    return path + step + (batchId ? "&batch=" + encodeURIComponent(batchId) : "") + (id !== "local-documents" && existingImport ? "&flow=import" : "");
  }

  function processingDraftKey(id, batchId) {
    return id === "local-documents" ? id + ":" + (batchId || "new") : id;
  }

  function findIngestionProfile(state, id) {
    return ((state.rag && state.rag.ingestionProfiles) || []).find(function find(item) { return item.id === id; }) || null;
  }

  function findEmbeddingModel(state, id) {
    var catalog = state.rag && state.rag.modelCatalog;
    return ((catalog && catalog.embeddingModels) || []).find(function find(item) { return item.id === id; }) || null;
  }

  function modelConnectionReady(model) {
    return Boolean(model && model.status === "available" && model.lastConnectionTest && model.lastConnectionTest.status === "passed");
  }

  function knowledgeEmbeddingModel(state, kb) {
    var catalog = state.rag && state.rag.modelCatalog;
    if (kb.boundEmbeddingModelId) return findEmbeddingModel(state, kb.boundEmbeddingModelId);
    return ((catalog && catalog.embeddingModels) || []).find(modelConnectionReady) || null;
  }

  function knowledgeEmbeddingReady(state, kb) {
    return modelConnectionReady(knowledgeEmbeddingModel(state, kb));
  }

  function processingModeLabel(mode) {
    return {
      smart: "自动切片",
      semantic: "语义切片",
      structure: "结构切片",
      separator: "分隔符切片",
      recursive: "递归切块",
      fixed: "固定长度切片",
      page: "按页切片",
      whole_document: "整篇切片"
    }[mode] || "自动切片";
  }

  function knowledgeAvailability(state, kb) {
    if (!kb.enabled) return { key: "disabled", label: "检索已关闭" };
    if (!knowledgeEmbeddingReady(state, kb)) return { key: "unavailable", label: "检索不可用" };
    if (!kb.currentKnowledgeVersionId || !(kb.documentCounts && kb.documentCounts.searchable)) return { key: "unavailable", label: "检索不可用" };
    return { key: "available", label: "检索已启用" };
  }

  function iconStatus(value) {
    var statusMap = {
      effective: "success",
      historical: "neutral",
      building: "info",
      pending_validation: "info",
      pending_activation: "info",
      pending_configuration: "info",
      staged: "info",
      processing: "info",
      updating: "info",
      partial_failure: "danger",
      completed: "success",
      resolved_removed: "neutral",
      disabled: "neutral",
      not_ready: "neutral",
      available: "success",
      unavailable: "danger"
    };
    return statusMap[value] || null;
  }

  function pageIntro(title, actionsHtml) {
    return dom.pageHeader({ title: title, actions: actionsHtml || "" });
  }

  function summaryCell(label, value, note) {
    return '<div class="summary-cell"><div class="summary-cell__label">' + esc(label) +
      '</div><div class="summary-cell__value">' + esc(value) +
      '</div><div class="summary-cell__note">' + esc(note || "") + "</div></div>";
  }

  function accessLevelHelp() {
    var explanation = "L1 基础内部；L2 敏感业务，仅 L2/L3 可访问；L3 受限业务，仅 L3 可访问。最终权限取知识库等级与上游文件等级中更严格者。";
    return '<span class="access-level-help"><button type="button" class="access-level-help__trigger" aria-label="访问等级说明：' + esc(explanation) + '">' + dom.icon("info", 14) + '</button><span class="access-level-help__tooltip" role="tooltip">' + esc(explanation) + "</span></span>";
  }

  function renderKnowledgeList(state) {
    var rows = state.knowledgeBases.map(function map(item) {
      var accessible = item.minAccessLevel;
      var currentAvailability = knowledgeAvailability(state, item);
      var availability = currentAvailability.key;
      var availabilityLabel = currentAvailability.label;
      var testReady = availability === "available";
      var locked = Boolean(item.benchmarkReadOnly);
      var lockAttribute = locked ? ' disabled title="只读评测基准不可编辑"' : "";
      var badge = locked ? '<span class="knowledge-benchmark-badge">只读评测基准</span>' : "";
      return '<tr data-kb-enabled="' + (item.enabled ? "true" : "false") + '" data-kb-issue="' + (item.openImportIssueCount ? "true" : "false") + '" data-kb-availability="' + esc(availability) + '" data-kb-readonly="' + (locked ? "true" : "false") + '">' +
        '<td><div class="knowledge-name-line"><button type="button" class="table-primary table-primary--link" data-kb-open="' + esc(item.id) + '">' + esc(item.name) + '</button>' + badge + '</div><div class="table-secondary">' + esc(item.id) + "</div></td>" +
        '<td class="knowledge-description">' + esc(item.purpose) + "</td>" +
        '<td><div class="table-primary">' + number(item.documentCounts.total) + "</div></td>" +
        "<td>" + esc(accessible) + "</td>" +
        "<td>" + displayDate(item.updatedAt || item.contentUpdatedAt) + "</td>" +
        "<td>" + displayDate(item.createdAt) + "</td>" +
        "<td>" + dom.status(availabilityLabel, iconStatus(availability)) + "</td>" +
        '<td><div class="knowledge-row-actions"><button type="button" class="table-action" data-kb-test="' + esc(item.id) + '"' + (testReady ? "" : ' disabled title="当前知识库尚不可检索"') + '>测试</button><button type="button" class="table-action" data-kb-open="' + esc(item.id) + '">详情</button><button type="button" class="table-action" data-kb-edit="' + esc(item.id) + '"' + lockAttribute + '>编辑</button><button type="button" class="table-action table-action--danger" data-kb-delete="' + esc(item.id) + '"' + lockAttribute + '>删除</button></div></td>' +
        "</tr>";
    }).join("");

    return dom.pageHeader({
      title: "知识库",
      actions: dom.button("新建知识库", { variant: "primary", icon: "plus", attrs: "data-create-kb" }),
      toolbar: { search: { placeholder: "搜索知识库", attrs: "data-kb-search" } }
    }) + '<div class="page-content"><section class="panel">' +
      '<div class="table-wrap"><table class="data-table knowledge-table"><thead><tr><th>知识库名称 / ID</th><th>描述</th><th>文件数量</th><th><span class="access-level-heading">访问等级' + accessLevelHelp() + '</span></th><th>更新时间</th><th>创建时间</th><th>检索状态</th><th>操作</th></tr></thead>' +
      '<tbody data-kb-table>' + rows + "</tbody></table></div>" +
      '<div class="table-footer"><span>共 ' + state.knowledgeBases.length + " 个知识库</span></div></section></div>";
  }

  function detailHeaderActions(state, kb) {
    var toggleLabel = kb.enabled ? "关闭检索" : "启用检索";
    var toggleVariant = kb.enabled ? "danger" : "primary";
    var hasSearchableIndex = Boolean(kb.currentKnowledgeVersionId && kb.documentCounts && kb.documentCounts.searchable);
    var embeddingReady = knowledgeEmbeddingReady(state, kb);
    var retrievalReady = hasSearchableIndex && embeddingReady;
    if (kb.benchmarkReadOnly) {
      return dom.button("检索测试", { variant: "primary", icon: "search-check", disabled: !retrievalReady, attrs: 'data-test-kb="' + esc(kb.id) + '"' }) +
        dom.button("导入文件", { variant: "secondary", icon: "upload", disabled: true, attrs: 'title="只读评测基准不可导入或替换文件"' }) +
        dom.button("基准已锁定", { variant: "secondary", icon: "lock-keyhole", disabled: true, attrs: 'title="为保证评测结果可复现，禁止修改、停用或删除"' });
    }
    var toggleAction = !kb.enabled && !retrievalReady ?
      dom.button(!hasSearchableIndex ? "等待索引建立" : "模型连接不可用", { variant: "secondary", icon: !hasSearchableIndex ? "clock-3" : "circle-alert", disabled: true, attrs: 'title="' + (!hasSearchableIndex ? "完成索引构建后可启用检索" : "向量模型未通过连通性测试") + '"' }) :
      dom.button(toggleLabel, { variant: toggleVariant, icon: kb.enabled ? "pause" : "play", attrs: 'data-toggle-kb="' + esc(kb.id) + '" data-next="' + (kb.enabled ? "false" : "true") + '"' });
    return dom.button("检索测试", { variant: "secondary", icon: "search-check", disabled: !retrievalReady, attrs: 'data-test-kb="' + esc(kb.id) + '"' + (retrievalReady ? "" : ' title="当前知识库尚不可检索"') }) +
      dom.button("导入文件", { variant: "secondary", icon: "upload", disabled: !embeddingReady, attrs: 'data-import-kb="' + esc(kb.id) + '"' + (embeddingReady ? "" : ' title="向量模型连接不可用"') }) + toggleAction;
  }

  function detailRow(label, value) {
    return "<div class=\"detail-row\"><dt>" + esc(label) + "</dt><dd>" + value + "</dd></div>";
  }

  function embeddingDisplay(state, kb) {
    var model = knowledgeEmbeddingModel(state, kb);
    if (!model) return "—";
    var dimension = kb.boundVectorDimension || model.dimension;
    return esc(model.alias || kb.boundEmbeddingModelId) +
      (dimension ? " · " + number(dimension) + " 维" : "");
  }

  function knowledgeInfoItem(label, value, modifier) {
    return '<div class="knowledge-info__item' + (modifier ? " knowledge-info__item--" + esc(modifier) : "") + '"><div class="knowledge-info__label">' + esc(label) + '</div><div class="knowledge-info__value">' + value + "</div></div>";
  }

  function pipelineStage(options) {
    var attrs = options.attrs ? " " + options.attrs : "";
    var tag = attrs ? "button" : "div";
    var type = attrs ? ' type="button"' : "";
    return "<" + tag + type + ' class="knowledge-pipeline__stage"' + attrs + ' title="' + esc(options.title || options.label) + '">' +
      '<span class="knowledge-pipeline__icon">' + dom.icon(options.icon, 20) + '</span>' +
      '<span class="knowledge-pipeline__label">' + esc(options.label) + '</span>' +
      '<span class="knowledge-pipeline__value is-' + esc(options.tone || "neutral") + '">' + esc(options.value) + "</span></" + tag + ">";
  }

  function renderKnowledgePipeline(state, kb) {
    var documents = knowledgeDocuments(state, kb.id);
    var lifecycle = documents.map(documentLifecycle);
    function count(key) { return lifecycle.filter(function filter(item) { return item.key === key; }).length; }
    var failed = count("failed");
    var parsing = count("parsing");
    var chunking = count("chunking");
    var embeddingFiles = count("embedding");
    var indexing = count("indexing");
    var availability = knowledgeAvailability(state, kb);
    var embeddingReady = knowledgeEmbeddingReady(state, kb);
    function progressValue(active, normalLabel) { return active ? number(active) + " 个处理中" : normalLabel; }

    return '<div class="knowledge-pipeline"><div class="knowledge-pipeline__header"><div><h3>知识处理与检索状态</h3></div></div>' +
      '<div class="knowledge-pipeline__stages">' +
      pipelineStage({ label: "文档解析", value: failed ? number(failed) + " 个失败" : progressValue(parsing, "正常"), icon: "scan-text", tone: failed ? "danger" : parsing ? "info" : "success" }) +
      pipelineStage({ label: "切片处理", value: progressValue(chunking, "正常"), icon: "blocks", tone: chunking ? "info" : "success" }) +
      pipelineStage({ label: "向量化", value: !embeddingReady ? "连接不可用" : progressValue(embeddingFiles, "正常"), icon: "box", tone: !embeddingReady ? "danger" : embeddingFiles ? "info" : "success" }) +
      pipelineStage({ label: "索引", value: progressValue(indexing, "正常"), icon: "database", tone: indexing ? "info" : "success" }) +
      pipelineStage({ label: "检索", value: availability.label, icon: "search", tone: availability.key === "available" ? "success" : (availability.key === "unavailable" ? "danger" : "neutral") }) +
      "</div></div>";
  }

  function renderKnowledgeInfo(state, kb) {
    var embeddingReady = knowledgeEmbeddingReady(state, kb);
    var modelErrorTitle = !embeddingReady ? "向量模型连接不可用" : "";
    var modelErrorDescription = "已建立的文件和索引仍可查看，但暂时不能导入新文件或发起检索。";
    var embeddingError = modelErrorTitle ? '<div class="notice notice--danger knowledge-model-error">' + dom.icon("circle-alert", 16) + '<div class="notice__content"><div class="notice__title">' + modelErrorTitle + '</div>' + modelErrorDescription + dom.button("前往模型管理", { variant: "secondary", attrs: 'data-open-config="models"' }) + '</div></div>' : "";
    var dataset = kb.evaluationDataset || null;
    var benchmarkNotice = dataset ? '<div class="knowledge-benchmark-notice" role="note"><span class="knowledge-benchmark-notice__icon">' + dom.icon("badge-check", 18) + '</span><div><strong>' + esc(dataset.name) + '</strong><p>' + esc(dataset.attribution) + ' · Claims / Gold：' + esc(dataset.claimLicense) + ' · Corpus：' + esc(dataset.corpusLicense) + '</p><p>' + esc(dataset.caseCount) + ' 条评测题 · ' + esc(dataset.documentCount) + ' 篇本地语料。' + esc(dataset.scopeNote) + '</p></div><span class="knowledge-benchmark-notice__lock">' + dom.icon("lock-keyhole", 15) + ' 内容与标注只读</span></div>' : "";
    return '<section class="panel knowledge-info"><div class="panel__header"><h2 class="panel__title">知识库信息</h2></div><div class="panel__body">' + benchmarkNotice +
      '<div class="knowledge-info__grid">' +
      knowledgeInfoItem("知识库 ID", esc(kb.id), "id") +
      knowledgeInfoItem("访问等级", '<span class="access-level-value">' + esc(kb.minAccessLevel) + accessLevelHelp() + "</span>", "access") +
      knowledgeInfoItem("描述", esc(kb.purpose), "description") +
      knowledgeInfoItem("向量模型", embeddingDisplay(state, kb), "model") +
      knowledgeInfoItem("创建时间", displayDate(kb.createdAt), "created") +
      knowledgeInfoItem("更新时间", displayDate(kb.updatedAt || kb.contentUpdatedAt), "updated") +
      "</div>" + embeddingError + renderKnowledgePipeline(state, kb) + "</div></section>";
  }

  function renderKnowledgeContentTabs(activeTab) {
    return '<div class="tabs knowledge-content-tabs" role="tablist" aria-label="知识库内容">' +
      '<button type="button" class="tab' + (activeTab === "documents" ? " is-active" : "") + '" role="tab" aria-selected="' + (activeTab === "documents" ? "true" : "false") + '" aria-controls="knowledge-documents-panel" data-knowledge-content-tab="documents">文件</button>' +
      '<button type="button" class="tab' + (activeTab === "chunks" ? " is-active" : "") + '" role="tab" aria-selected="' + (activeTab === "chunks" ? "true" : "false") + '" aria-controls="knowledge-chunks-panel" data-knowledge-content-tab="chunks">切片</button>' +
      "</div>";
  }

  function renderDocumentsTab(state, kb) {
    var documents = knowledgeDocuments(state, kb.id);
    var rows = documents.map(function map(item) {
      var lifecycle = documentLifecycle(item);
      var chunks = documentChunks(state, item);
      var chunkCount = item.chunkCount == null ? chunks.length : item.chunkCount;
      var previewReady = chunks.length > 0;
      return "<tr>" +
        '<td><button type="button" class="table-primary table-primary--link" data-document-preview="' + esc(item.id) + '"' + (previewReady ? "" : ' disabled title="切片生成后可预览"') + '>' + esc(item.name) + '</button><div class="table-secondary">' + esc(item.id) + " · " + esc(item.documentType) + "</div></td>" +
        "<td>" + dom.status(lifecycle.label, lifecycleTone(lifecycle.key)) + "</td>" +
        "<td>" + (chunkCount ? number(chunkCount) + " 个" : "—") + "</td>" +
        "<td>" + displayDate(item.importedAt) + "</td>" +
        '<td><div class="knowledge-row-actions"><button type="button" class="table-action" data-document-preview="' + esc(item.id) + '"' + (previewReady ? "" : ' disabled title="切片生成后可预览"') + '>预览</button><button type="button" class="table-action table-action--danger" data-document-delete="' + esc(item.id) + '"' + (kb.benchmarkReadOnly ? ' disabled title="只读评测基准不可删除文件"' : "") + '>删除</button></div></td>' +
        "</tr>";
    }).join("");
    return '<section class="panel knowledge-assets knowledge-files">' + renderKnowledgeContentTabs("documents") + '<div id="knowledge-documents-panel" class="knowledge-assets__panel" role="tabpanel"><div class="table-wrap"><table class="data-table knowledge-files__table"><thead><tr><th>文件</th><th>文件状态</th><th>切片数</th><th>导入时间</th><th>操作</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5">' + dom.empty("暂无文件", "导入文件后可查看处理状态与切片。", "files") + "</td></tr>") + "</tbody></table></div><div class=\"table-footer\">当前展示 " + documents.length + " 个文件</div></div></section>";
  }

  function renderChunksTab(state, kb, requestedDocumentId) {
    var documents = knowledgeDocuments(state, kb.id);
    var item = documents.find(function find(documentItem) { return documentItem.id === requestedDocumentId; }) || documents.find(function find(documentItem) { return documentChunks(state, documentItem).length > 0; }) || documents[0];
    var chunks = item ? documentChunks(state, item) : [];
    var fileSelector = item ? '<label class="knowledge-chunk-quick__selector" for="knowledge-chunk-document"><span>文件</span><select id="knowledge-chunk-document" class="select-field" data-quick-chunk-document-select="' + esc(kb.id) + '">' + documents.map(function map(documentItem) {
      return '<option value="' + esc(documentItem.id) + '"' + (documentItem.id === item.id ? " selected" : "") + '>' + esc(documentItem.name) + "</option>";
    }).join("") + "</select></label>" : "";
    var actionsHtml = item ? '<div class="knowledge-chunk-quick__actions">' +
      dom.button("完整预览", { variant: "secondary", icon: "eye", size: "small", attrs: 'data-chunk-full-preview="' + esc(item.id) + '"' }) +
      dom.button("新增切片", { variant: "primary", icon: "plus", size: "small", disabled: Boolean(kb.benchmarkReadOnly), attrs: 'data-chunk-add="' + esc(item.id) + '" data-kb-id="' + esc(kb.id) + '"' + (kb.benchmarkReadOnly ? ' title="只读评测基准不可修改切片"' : "") }) +
      "</div>" : "";
    var toolbar = '<div class="knowledge-chunk-quick__toolbar">' + fileSelector + '<div class="knowledge-chunk-quick__summary"><strong>全部切片（' + number(chunks.length) + "）</strong>" + actionsHtml + "</div></div>";
    var body = item ? renderChunkCards(state, item) : dom.empty("暂无文件", "导入文件后可浏览切片。", "blocks");
    return '<section class="panel knowledge-assets knowledge-chunk-quick">' + renderKnowledgeContentTabs("chunks") + '<div id="knowledge-chunks-panel" class="knowledge-assets__panel" role="tabpanel">' + toolbar + '<div class="knowledge-chunk-quick__body">' + body + "</div></div></section>";
  }

  function renderCreationSteps(activeStep, isLocalDocumentFlow) {
    var steps = [
      ["database", "定义知识库", "设置基础信息"],
      ["file-up", "导入文件", "添加知识文件"],
      ["scan-text", "文档解析", "提取文档内容"],
      ["blocks", "文档处理", "配置本次切片参数"]
    ];
    if (isLocalDocumentFlow) steps = steps.slice(1);
    return '<ol class="creation-steps' + (isLocalDocumentFlow ? " creation-steps--documents" : "") + '" aria-label="' + (isLocalDocumentFlow ? "上传文档进度" : "新建知识库进度") + '">' + steps.map(function map(step, index) {
      var stepNumber = index + (isLocalDocumentFlow ? 2 : 1);
      var className = stepNumber === activeStep ? " is-active" : (stepNumber < activeStep ? " is-complete" : "");
      return '<li class="creation-step' + className + '"><span class="creation-step__number">' + stepNumber + '</span><span class="creation-step__icon">' + dom.icon(step[0], 18) + '</span><span class="creation-step__copy"><strong>' + esc(step[1]) + '</strong><small>' + esc(step[2]) + '</small></span>' + (index < steps.length - 1 ? '<span class="creation-step__next" aria-hidden="true">' + dom.icon("chevron-right", 17) + "</span>" : "") + "</li>";
    }).join("") + "</ol>";
  }

  function readyVectorModels(state) {
    return (((state.rag && state.rag.modelCatalog) || {}).embeddingModels || []).filter(modelConnectionReady);
  }

  function vectorModelOptions(state) {
    var models = readyVectorModels(state);
    if (!models.length) return '<option value="" selected disabled>暂无已测试可用模型</option>';
    return '<option value="" selected disabled>请选择向量模型</option>' + models.map(function map(model) {
      return '<option value="' + esc(model.id) + '" data-dimension="' + esc(model.dimension) + '">' + esc(model.alias) + "</option>";
    }).join("");
  }

  function accessLevelOptions(state) {
    return '<option value="" selected disabled>请选择访问等级</option>' + (state.meta.accessLevels || []).map(function map(level) {
      return '<option value="' + esc(level.code) + '">' + esc(level.code) + "</option>";
    }).join("");
  }

  function accessLevelDescriptions(state) {
    return '<div class="creation-access-levels" aria-label="访问等级说明">' + (state.meta.accessLevels || []).map(function map(level) {
      var accessText = level.code === "L3" ? "仅 L3 权限用户可访问" : level.code + " 及以上权限用户可访问";
      return '<div><strong>' + esc(level.code) + '</strong><span>' + esc(level.name) + " · " + esc(accessText) + "</span></div>";
    }).join("") + "</div>";
  }

  function renderKnowledgeCreate(state) {
    var vectorModels = readyVectorModels(state);
    var hasVectorModel = Boolean(vectorModels.length);
    var modelEmptyNotice = hasVectorModel ? "" : '<div class="notice notice--danger"><div class="notice__content"><div class="notice__title">暂无可用向量模型</div>请先在模型管理中新增模型或完成连通性测试。' + dom.button("前往模型管理", { variant: "secondary", attrs: 'data-open-config="models"' }) + "</div></div>";
    return dom.pageHeader({
      title: "新建知识库",
      back: { label: "返回知识库列表", route: "knowledge" }
    }) + '<div class="page-content creation-page">' +
      '<div class="creation-page__top">' + renderCreationSteps(1) + "</div>" +
      '<section class="panel creation-panel"><div class="panel__body"><form data-create-kb-form><div class="creation-form-layout"><div class="creation-form-column">' +
      '<div class="form-field">' + dom.requiredLabel("知识库名称", { forId: "kb-name" }) + '<input id="kb-name" class="field" maxlength="40" autocomplete="off" placeholder="请输入知识库名称" required aria-required="true" /></div>' +
      '<div class="form-field">' + dom.requiredLabel("描述", { forId: "kb-purpose" }) + '<textarea id="kb-purpose" class="textarea-field creation-description" maxlength="120" placeholder="说明知识库收录的内容及用途" required aria-required="true"></textarea></div>' +
      modelEmptyNotice + '<div class="creation-model-row"><div class="form-field">' + dom.requiredLabel("向量模型", { forId: "kb-vector" }) + '<select id="kb-vector" class="select-field" required aria-required="true"' + (hasVectorModel ? "" : " disabled") + '>' + vectorModelOptions(state) + '</select></div>' +
      '<div class="form-field creation-model-dimension" data-vector-dimension-field hidden><label class="form-label" for="kb-vector-dimension">向量维度</label><div id="kb-vector-dimension" class="field field--static" data-vector-dimension></div></div></div>' +
      '<div class="form-help creation-model-help">用于将文档内容转换为向量，支持语义检索。</div>' +
      '<div class="form-field">' + dom.requiredLabel("访问等级", { forId: "kb-access" }) + '<select id="kb-access" class="select-field" required aria-required="true">' + accessLevelOptions(state) + '</select>' + accessLevelDescriptions(state) + '</div></div></div>' +
      '<div class="creation-actions">' + dom.button("取消", { variant: "secondary", attrs: "data-create-cancel" }) + dom.button("仅创建", { variant: "secondary", attrs: "data-create-only", disabled: true }) + dom.button("创建并导入", { variant: "primary", icon: "arrow-right", attrs: "data-create-and-import", disabled: true }) +
      "</div></form></div></section></div>";
  }

  function renderKnowledgeUpload(state, kb, isOnboarding, isExistingImport) {
    var backRoute = importReturnRoute(kb.id);
    var canReceiveFiles = kb.isLocalDocumentFlow || (isOnboarding && !isExistingImport) || knowledgeEmbeddingReady(state, kb);
    var modelError = canReceiveFiles ? "" : '<div class="notice notice--danger" style="margin-bottom:16px">' + dom.icon("circle-alert", 16) + '<div class="notice__content"><div class="notice__title">向量模型连接不可用</div>暂时不能启动新文件处理。' + dom.button("前往模型管理", { variant: "secondary", attrs: 'data-open-config="models"' }) + '</div></div>';
    var headerOptions = {
      title: kb.isLocalDocumentFlow ? "上传文档" : (isExistingImport ? "导入文件" : (isOnboarding ? "新建知识库" : "导入文件")),
      back: { label: kb.isLocalDocumentFlow ? "返回文档管理" : (isOnboarding && !isExistingImport ? "稍后导入并返回知识库" : "返回知识库"), route: backRoute }
    };
    return dom.pageHeader(headerOptions) + '<div class="page-content creation-page">' +
      (isOnboarding ? '<div class="creation-page__top">' + renderCreationSteps(2, kb.isLocalDocumentFlow) + "</div>" : "") +
      '<section class="panel creation-panel">' + (isOnboarding ? "" : '<div class="panel__header"><h2 class="panel__title">导入文件</h2></div>') +
      '<div class="panel__body">' + modelError + '<div class="file-drop-heading">' + dom.requiredLabel("文件", { tag: "div" }) + '</div><label class="file-drop" for="kb-upload-files" data-upload-drop>' + dom.icon("file-up", 30) + '<strong>点击选择文件，或将文件拖入此处</strong><span>支持 PDF、图片、Word、PPT、Excel 和 TXT，可多选</span><span class="btn btn--secondary file-drop__choose">选择文件</span><input id="kb-upload-files" class="sr-only" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" required aria-required="true" data-upload-files' + (canReceiveFiles ? "" : " disabled") + ' /></label>' +
      '<div class="upload-file-list" data-upload-file-list hidden></div>' +
      (!isOnboarding ? '<div class="vector-cost-notice">' + dom.icon("circle-alert", 15) + '<span>完成导入后将按当前策略解析并生成向量，产生 Embedding Token 消耗。</span></div>' : "") +
      '<div class="creation-actions">' +
      dom.button("取消", { variant: "secondary", attrs: 'data-upload-cancel="' + esc(kb.id) + '"' }) +
      dom.button(isOnboarding ? "下一步" : "完成导入", { variant: "primary", icon: isOnboarding ? "arrow-right" : "upload", disabled: true, attrs: 'data-upload-start="' + esc(kb.id) + '" data-onboarding="' + (isOnboarding ? "true" : "false") + '" data-existing-import="' + (isExistingImport ? "true" : "false") + '" data-model-ready="' + (canReceiveFiles ? "true" : "false") + '"' }) +
      "</div></div></section></div>";
  }

  function optionToggle(id, label, description, checked, disabled, badge) {
    return '<label class="parse-toggle' + (disabled ? " is-disabled" : "") + '" for="' + esc(id) + '"><span><span class="parse-toggle__title"><strong>' + esc(label) + '</strong>' + (badge ? '<span class="tag">' + esc(badge) + '</span>' : "") + '</span><small>' + esc(description) + '</small></span><input id="' + esc(id) + '" type="checkbox"' + (checked ? " checked" : "") + (disabled ? " disabled" : "") + " /></label>";
  }

  function requiredParseOutput(id, label, description) {
    return '<div class="parse-toggle is-required"><span><span class="parse-toggle__title"><strong>' + esc(label) + '</strong><span class="tag">必选</span></span><small>' + esc(description) + '</small></span><input id="' + esc(id) + '" type="checkbox" checked disabled aria-label="' + esc(label) + '（必选）" /></div>';
  }

  function visualUnderstandingEnabled(config) {
    return config.imageAnalysisEnabled === true || config.imageUnderstandingEnabled === true || config.chartUnderstandingEnabled === true;
  }

  function parseConfigFields(kb) {
    var config = kb.mineruParseConfig || {};
    var visualUnderstanding = visualUnderstandingEnabled(config);
    return '<div class="creation-config-stack">' +
      '<section class="parse-config-section" aria-labelledby="parse-method-title"><div class="parse-config-section__header"><div><h2 id="parse-method-title">解析方法</h2><p>设置文字提取方式；解析模式由所选识别内容自动确定。</p></div></div>' +
      '<div class="creation-control-grid creation-control-grid--single"><div class="form-field">' + dom.requiredLabel("文字提取方式", { forId: "parse-recognition" }) + '<select id="parse-recognition" class="select-field" required aria-required="true"><option value="auto">自动判断（推荐）</option><option value="txt">优先原生文本</option><option value="ocr">全文 OCR</option></select><div class="form-help">自动判断会优先读取文档原生文字；扫描型、图片型 PDF 或文字层异常时自动使用 OCR。</div></div></div></section>' +
      '<section class="parse-config-section" aria-labelledby="parse-content-title"><div class="parse-config-section__header"><div><h2 id="parse-content-title">识别内容</h2><p>文本与版面结构是后续切片、索引和引用定位所需的基础内容。</p></div></div><div class="parse-toggle-list">' +
      requiredParseOutput("parse-text-content", "文本内容", "正文、段落、列表文字、链接和代码") +
      requiredParseOutput("parse-layout-structure", "版面结构", "标题、目录 / 索引、段落、列表、参考文献与阅读顺序") +
      optionToggle("parse-table", "表格解析", "输出 HTML / Markdown 表格与单元格结构", config.tableEnabled !== false) +
      optionToggle("parse-formula", "公式解析", "输出 LaTeX 与公式位置", config.formulaEnabled !== false) +
      optionToggle("parse-visual-understanding", "图片 / 图表内容理解", "识别图像 / 图表类型、物体场景、图中文字与印章、结构化数据、流程结构及内容趋势", visualUnderstanding, false, "依赖 VLM") +
      '</div><div class="parse-vlm-note"><span class="parse-vlm-status' + (visualUnderstanding ? " is-on" : "") + '" data-parse-mode-status role="status" aria-live="polite">' + (visualUnderstanding ? "精细解析 · VLM 已开启" : "标准解析 · 系统自动") + '</span><p>开启图片 / 图表内容理解后，系统自动使用精细解析并启用 Image Analysis。</p></div></section></div>';
  }

  function renderKnowledgeParse(state, kb, isExistingImport) {
    return dom.pageHeader({
      title: kb.isLocalDocumentFlow ? "上传文档" : (isExistingImport ? "导入文件" : "新建知识库"),
      back: { label: kb.isLocalDocumentFlow ? "返回文档管理" : "返回知识库", route: importReturnRoute(kb.id) }
    }) + '<div class="page-content creation-page"><div class="creation-page__top">' + renderCreationSteps(3, kb.isLocalDocumentFlow) + '</div><section class="panel creation-panel"><div class="panel__body">' +
      parseConfigFields(kb) + '<div class="creation-actions">' + dom.button("取消", { variant: "secondary", attrs: 'data-onboarding-cancel="' + esc(kb.id) + '"' }) + dom.button("下一步", { variant: "primary", icon: "arrow-right", attrs: 'data-parse-next="' + esc(kb.id) + '"' }) + '</div></div></section></div>';
  }

  function renderKnowledgeParseSettings(state, kb) {
    return dom.pageHeader({
      title: "文档解析策略",
      back: { label: "返回知识库", route: "knowledge/" + kb.id + "?tab=documents" }
    }) + '<div class="page-content creation-page"><section class="panel creation-panel"><div class="panel__body">' + parseConfigFields(kb) +
      '<div class="notice notice--info"><div class="notice__content">仅影响新导入文件，不会重新处理已有文件。</div></div>' +
      '<div class="creation-actions">' + dom.button("取消", { variant: "secondary", attrs: 'data-parse-settings-cancel="' + esc(kb.id) + '"' }) + dom.button("保存", { variant: "primary", icon: "save", attrs: 'data-parse-settings-save="' + esc(kb.id) + '"' }) + "</div></div></section></div>";
  }

  function availableProcessingProfiles(state) {
    return ((state.rag && state.rag.ingestionProfiles) || []).filter(function filter(profile) {
      return profile.visible !== false && profile.displayGroup !== "internal" && profile.chunking;
    }).sort(function sort(left, right) {
      var leftGeneral = left.id === "ING-01" || String(left.name || "").indexOf("通用") >= 0;
      var rightGeneral = right.id === "ING-01" || String(right.name || "").indexOf("通用") >= 0;
      return Number(rightGeneral) - Number(leftGeneral) || Number(left.displayOrder || 99) - Number(right.displayOrder || 99);
    });
  }

  function processingFamilyForDraft(draft) {
    var mode = draft && draft.mode || "smart";
    return mode === "smart" || mode === "semantic" ? mode : "custom";
  }

  function processingCustomMethodForDraft(draft) {
    var mode = draft && draft.mode || "smart";
    if (["structure", "recursive", "separator", "page", "whole_document"].indexOf(mode) >= 0) return mode;
    return "structure";
  }

  function processingProfileCards(state, kb, draft) {
    var profiles = availableProcessingProfiles(state);
    if (!profiles.length) return '<div class="processing-profile-empty">系统没有可用的预置处理方案，请联系技术人员检查代码配置。</div>';
    function profileForMode(mode) {
      return profiles.find(function find(profile) { return (profile.chunking && profile.chunking.mode || "smart") === mode; }) || null;
    }
    var smartProfile = profileForMode("smart");
    var semanticProfile = profileForMode("semantic");
    var structureProfile = profileForMode("structure");
    var separatorProfile = profileForMode("separator");
    var selectedFamily = processingFamilyForDraft(draft);
    var selectedMethod = processingCustomMethodForDraft(draft);
    var methodDefinitions = [
      { value: "structure", title: "结构切片", summary: "依据解析得到的标题、段落、列表和表格等内容块切分，适合结构清晰的文档。", profile: structureProfile },
      { value: "recursive", title: "递归切块", summary: "按段落、换行、句末标点等边界逐级拆分超长内容，尽量保留完整句段。", profile: profileForMode("recursive") },
      { value: "separator", title: "分隔符切片", summary: "按选定的一种换行或标点符号匹配边界，适合分隔规则明确的文本。", profile: separatorProfile },
      { value: "page", title: "按页切片", summary: "按原文连续页分组，适合需要保留页面整体内容的 PDF 或演示文稿。", profile: profileForMode("page") },
      { value: "whole_document", title: "整篇切片", summary: "将短文档整体保留为一个切片；超长时按所选方式处理。", profile: profileForMode("whole_document") }
    ].filter(function filterMethod(method) { return !!method.profile; });
    if (!methodDefinitions.some(function some(method) { return method.value === selectedMethod; })) selectedMethod = methodDefinitions.length ? methodDefinitions[0].value : "";

    function renderProfileCard(options) {
      var profile = options.profile;
      var compatibility = profile && actions.getProcessingProfileCompatibility ? actions.getProcessingProfileCompatibility(profile, kb.mineruParseConfig) : { compatible: true, completeOutput: true, message: "可用于当前解析策略" };
      var outputNotice = compatibility.completeOutput === false ? '<small>' + esc(compatibility.message) + '</small>' : "";
      var semanticMeta = options.semantic ? '<span class="processing-profile-card__meta" aria-label="语义切片特性"><span class="tag">效果需评测</span><span class="tag">额外句段 Embedding</span></span>' : "";
      var profileAttribute = profile ? ' data-processing-profile-id="' + esc(profile.id) + '"' : "";
      return '<label class="processing-profile-card' + (options.method ? " processing-profile-card--method" : "") + '"><input type="radio" name="' + esc(options.group) + '" value="' + esc(options.value) + '" ' + (options.method ? 'data-processing-method="' + esc(options.value) + '"' : 'data-processing-family="' + esc(options.value) + '"') + profileAttribute + ' required aria-required="true"' + (options.checked ? " checked" : "") + '><span class="processing-profile-card__content"><span class="processing-profile-card__header"><span class="processing-profile-card__title"><strong>' + esc(options.title) + '</strong>' + (options.recommended ? '<span class="tag">推荐</span>' : "") + '</span>' + outputNotice + '</span><span class="processing-profile-card__summary">' + esc(options.summary) + '</span>' + semanticMeta + '</span></label>';
    }
    var familyDefinitions = [
      smartProfile && { value: "smart", title: "自动切片", summary: smartProfile.description || "自动组合解析结构、递归拆分与长度兜底。", profile: smartProfile, recommended: true },
      semanticProfile && { value: "semantic", title: "语义切片", summary: semanticProfile.description || "在主题切换处生成边界，适合结构不明显的长文本。", profile: semanticProfile, semantic: true },
      methodDefinitions.length && { value: "custom", title: "自定义切片", summary: "明确选择结构、递归、分隔符、按页或整篇处理，适合已知文档形态。", profile: null }
    ].filter(Boolean);
    var familyCards = familyDefinitions.map(function mapFamily(family) {
      return renderProfileCard({
        group: "processing-family",
        value: family.value,
        title: family.title,
        summary: family.summary,
        profile: family.profile,
        checked: selectedFamily === family.value,
        recommended: family.recommended,
        semantic: family.semantic
      });
    }).join("");
    var methodCards = methodDefinitions.map(function mapMethod(method) {
      return renderProfileCard({
        group: "processing-method",
        value: method.value,
        title: method.title,
        summary: method.summary,
        profile: method.profile,
        checked: selectedMethod === method.value,
        method: true
      });
    }).join("");
    return '<div class="processing-profile-list processing-family-list" role="radiogroup" aria-label="切片类型" data-processing-family-list>' + familyCards + '</div>' +
      '<section class="processing-method-picker" data-processing-method-picker' + (selectedFamily === "custom" ? "" : " hidden") + '><div class="processing-method-picker__header"><strong id="processing-method-title">自定义切片方法</strong><span>每次选择一种方法，再配置对应参数。</span></div><div class="processing-profile-list processing-method-list" role="radiogroup" aria-labelledby="processing-method-title" data-processing-method-list>' + methodCards + '</div></section>';
  }

  function normalizedSemanticSensitivity(value) {
    return ["low", "balanced", "high"].indexOf(value) >= 0 ? value : "balanced";
  }

  function createProcessingDraft(knowledgeBaseId, profile, batchId) {
    var chunking = profile.chunking || {};
    var indexContent = profile.indexContent || {};
    var mode = chunking.mode || "smart";
    var separatorTypes = ["structure", "paragraph", "newline", "zh_period", "zh_exclamation", "zh_question", "en_period", "en_exclamation", "en_question"];
    var separatorTypeByLiteral = { "\n\n": "paragraph", "\n": "newline", "。": "zh_period", "！": "zh_exclamation", "？": "zh_question", ".": "en_period", "!": "en_exclamation", "?": "en_question" };
    var configuredSeparatorType = chunking.separatorPreset || chunking.separatorType || "";
    var separatorType = separatorTypes.indexOf(configuredSeparatorType) >= 0 ? configuredSeparatorType :
      (configuredSeparatorType === "sentence" ? "zh_period" : (separatorTypeByLiteral[chunking.separator] || "paragraph"));
    if (mode === "structure") separatorType = "structure";
    if (mode === "separator" && separatorType === "structure") separatorType = "paragraph";
    var draft = {
      knowledgeBaseId: knowledgeBaseId,
      profileId: profile.id,
      mode: mode,
      maxChars: Number(chunking.maxChars || 1200),
      maxDocumentChars: Number(chunking.maxDocumentChars || chunking.maxChars || 20000),
      overlapPercent: Number(chunking.overlapPercent || 0),
      semanticSensitivity: normalizedSemanticSensitivity(chunking.semanticSensitivity),
      separatorType: separatorType,
      pagesPerChunk: Number(chunking.pagesPerChunk || 1),
      longDocumentFallback: chunking.longDocumentFallback || "smart",
      mergeShortChunks: chunking.mergeShortChunks !== false,
      includeContext: mode !== "whole_document" && chunking.includeContext !== false,
      documentName: indexContent.documentName !== false,
      headingPath: indexContent.headingPath !== false,
      pageNumber: indexContent.pageNumber !== false,
      tableText: indexContent.tableText !== false,
      imageText: indexContent.imageText === true
    };
    onboardingProcessingDrafts[processingDraftKey(knowledgeBaseId, batchId)] = draft;
    return draft;
  }

  function renderProcessingParameters(draft) {
    if (!draft) return "";
    var mode = draft.mode || "smart";
    var sizeFields = '<div class="form-field">' + dom.requiredLabel("切片最大字符", { forId: "processing-max-chars" }) + '<div class="field-with-suffix"><input id="processing-max-chars" class="field" type="number" min="200" max="10000" step="1" value="' + esc(draft.maxChars) + '" data-processing-param="maxChars" required aria-required="true" aria-describedby="processing-max-help"><span>字符</span></div><div id="processing-max-help" class="form-help">每片的长度上限，不要求每片等长；200–10000 个字符。</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("切片重叠率", { forId: "processing-overlap" }) + '<div class="field-with-suffix"><input id="processing-overlap" class="field" type="number" min="0" max="50" step="1" value="' + esc(draft.overlapPercent) + '" data-processing-param="overlapPercent" required aria-required="true" aria-describedby="processing-overlap-help"><span>%</span></div><div id="processing-overlap-help" class="form-help">按最大字符数计算重复正文的目标量；0 表示不重叠。</div></div>';
    var strategyFields = "";
    if (mode === "smart") strategyFields = sizeFields + '<div class="processing-strategy-note" role="note"><strong>系统自动编排</strong><span>依次按解析结构 → 递归拆分 → 长度上限兜底生成切片，不调用语义模型，不产生语义边界判断消耗。</span></div>';
    if (mode === "recursive") strategyFields = sizeFields + '<div class="form-field form-field--full"><div class="form-help">依次按段落 → 换行 → 句末标点 → 空格拆分，仅对超长片段继续递归，最后按字符兜底；不调用语义模型。重叠率为上限，优先保留完整边界。</div></div>';
    if (mode === "semantic") strategyFields = '<div class="form-field">' + dom.requiredLabel("切片最大字符", { forId: "processing-max-chars" }) + '<div class="field-with-suffix"><input id="processing-max-chars" class="field" type="number" min="200" max="10000" step="1" value="' + esc(draft.maxChars) + '" data-processing-param="maxChars" required aria-required="true" aria-describedby="processing-semantic-max-help"><span>字符</span></div><div id="processing-semantic-max-help" class="form-help">仅作为安全上限；超过上限时仍优先在完整句段边界处拆分。</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("语义切分敏感度", { forId: "processing-semantic-sensitivity" }) + '<select id="processing-semantic-sensitivity" class="select-field" data-processing-param="semanticSensitivity" required aria-required="true" aria-describedby="processing-semantic-sensitivity-help"><option value="low"' + (draft.semanticSensitivity === "low" ? " selected" : "") + '>低 · 较少切分</option><option value="balanced"' + (draft.semanticSensitivity === "balanced" ? " selected" : "") + '>均衡 · 推荐</option><option value="high"' + (draft.semanticSensitivity === "high" ? " selected" : "") + '>高 · 较多切分</option></select><div id="processing-semantic-sensitivity-help" class="form-help">敏感度越高，越容易在较小的主题变化处切分，切片和索引条目通常越多。</div></div>';
    if (mode === "structure") strategyFields = sizeFields + '<div class="form-field form-field--full"><div class="form-help">依据上一阶段的解析结构，不是匹配换行符；长度上限用于限制过大的内容块，不能保证任意表格都完整放入一片。</div></div>';
    if (mode === "separator") {
      var separatorHelp = "仅匹配所选分隔符，不智能识别句子；例如英文句点也可能匹配小数和缩写。没有匹配或片段超长时，仍需按字符上限兜底。";
      var separatorOptions = [
        { value: "paragraph", token: "\\n\\n", name: "段落 / 空行" },
        { value: "newline", token: "\\n", name: "每次换行" },
        { value: "zh_period", token: "。", name: "中文句号" },
        { value: "zh_exclamation", token: "！", name: "中文感叹号" },
        { value: "zh_question", token: "？", name: "中文问号" },
        { value: "en_period", token: ".", name: "英文句点" },
        { value: "en_exclamation", token: "!", name: "英文感叹号" },
        { value: "en_question", token: "?", name: "英文问号" }
      ];
      var selectedSeparator = separatorOptions.find(function findSeparator(option) { return option.value === draft.separatorType; }) || separatorOptions[0];
      function separatorChoiceMarkup(option) {
        return '<span class="processing-separator-choice"><code>' + esc(option.token) + '</code><span class="processing-separator-choice__divider" aria-hidden="true">·</span><span>' + esc(option.name) + '</span></span>';
      }
      var separatorSourceOptions = separatorOptions.map(function mapSeparatorSourceOption(option) {
        return '<option value="' + esc(option.value) + '"' + (selectedSeparator.value === option.value ? " selected" : "") + '>' + esc(option.token + " · " + option.name) + '</option>';
      }).join("");
      var separatorListOptions = separatorOptions.map(function mapSeparatorListOption(option) {
        return '<button type="button" class="processing-separator-option" role="option" tabindex="-1" aria-selected="' + (selectedSeparator.value === option.value ? "true" : "false") + '" data-processing-separator-option="' + esc(option.value) + '">' + separatorChoiceMarkup(option) + '</button>';
      }).join("");
      strategyFields = sizeFields + '<div class="form-field form-field--full processing-separator-field" data-processing-separator-picker>' + dom.requiredLabel("拆分依据", { tag: "div", attrs: 'id="processing-separator-label"' }) + '<div class="processing-separator-control"><select id="processing-separator-type" hidden data-processing-param="separatorType" data-processing-separator-source>' + separatorSourceOptions + '</select><button type="button" class="processing-separator-trigger" role="combobox" aria-required="true" aria-haspopup="listbox" aria-expanded="false" aria-controls="processing-separator-listbox" aria-labelledby="processing-separator-label processing-separator-value" aria-describedby="processing-separator-help" data-processing-separator-trigger><span id="processing-separator-value" data-processing-separator-value>' + separatorChoiceMarkup(selectedSeparator) + '</span>' + dom.icon("chevron-down", 15) + '</button><div id="processing-separator-listbox" class="processing-separator-listbox" role="listbox" aria-labelledby="processing-separator-label" data-processing-separator-listbox hidden>' + separatorListOptions + '</div></div><div id="processing-separator-help" class="form-help">' + esc(separatorHelp) + '</div></div>';
    }
    if (mode === "page") strategyFields = '<div class="form-field form-field--full">' + dom.requiredLabel("每个切片页数", { forId: "processing-pages" }) + '<div class="field-with-suffix"><input id="processing-pages" class="field" type="number" min="1" max="10" step="1" value="' + esc(draft.pagesPerChunk) + '" data-processing-param="pagesPerChunk" required aria-required="true" aria-describedby="processing-pages-help"><span>页</span></div><div id="processing-pages-help" class="form-help">需解析结果包含原文分页信息；每片包含指定数量的连续页，尾片可不足该页数。页数不能替代模型输入长度校验。</div></div>';
    if (mode === "whole_document") strategyFields = '<div class="form-field form-field--full">' + dom.requiredLabel("超长文档处理", { forId: "processing-long-document" }) + '<select id="processing-long-document" class="select-field" data-processing-param="longDocumentFallback" required aria-required="true" aria-describedby="processing-whole-help"><option value="smart"' + (draft.longDocumentFallback === "smart" ? " selected" : "") + '>改用自动切片</option><option value="stop"' + (draft.longDocumentFallback === "stop" ? " selected" : "") + '>停止处理并提示</option></select><div id="processing-whole-help" class="form-help">Demo 预置整篇上限为 ' + number(draft.maxDocumentChars) + ' 字符；超长处理选项目前仅保存配置。正式接入时还需按向量模型的 Token 上限校验。</div></div>';
    return '<section class="processing-parameters">' +
      '<div class="processing-parameter-grid' + (mode === "semantic" ? " processing-parameter-grid--semantic" : "") + '">' + strategyFields + '</div>' +
      (mode === "semantic" ? '<div class="vector-cost-notice semantic-cost-notice" role="note">' + dom.icon("circle-alert", 15) + '<span>语义边界效果需用真实问题集验证；入库时会增加句段 Embedding 消耗与处理耗时，查询阶段不会新增这类切片模型调用。</span></div>' : "") +
      '<div class="processing-parameter-groups"><fieldset><legend>关联信息</legend><div class="processing-parameter-toggles">' +
      (mode !== "whole_document" ? '<label><input type="checkbox" data-processing-param="includeContext"' + (draft.includeContext ? " checked" : "") + '><span>相邻切片上下文</span></label>' : "") +
      '<label><input type="checkbox" data-processing-param="documentName"' + (draft.documentName ? " checked" : "") + '><span>文件名</span></label>' +
      '<label><input type="checkbox" data-processing-param="headingPath"' + (draft.headingPath ? " checked" : "") + '><span>标题路径</span></label>' +
      '<label><input type="checkbox" data-processing-param="pageNumber"' + (draft.pageNumber ? " checked" : "") + '><span>页码</span></label></div></fieldset>' +
      '<fieldset><legend>索引内容</legend><div class="processing-parameter-toggles"><label><input type="checkbox" checked disabled><span>正文</span></label><label><input type="checkbox" data-processing-param="tableText"' + (draft.tableText ? " checked" : "") + '><span>表格文本</span></label><label><input type="checkbox" data-processing-param="imageText"' + (draft.imageText ? " checked" : "") + '><span>图片 OCR 文本</span></label></div></fieldset></div></section>';
  }

  function renderKnowledgeProcessing(state, kb, isExistingImport) {
    var profiles = availableProcessingProfiles(state);
    var existingDraft = onboardingProcessingDrafts[processingDraftKey(kb.id, kb.importBatchId)];
    var preferredProfileId = existingDraft && existingDraft.profileId || kb.currentIngestionProfileId;
    var selectedProfile = profiles.find(function find(profile) { return profile.id === preferredProfileId; }) || profiles[0] || null;
    var savedProfile = kb.processingProfileSnapshot;
    var draftProfile = savedProfile && selectedProfile && (savedProfile.sourceProfileId || savedProfile.id) === selectedProfile.id ? savedProfile : selectedProfile;
    var processingDraft = selectedProfile && (!existingDraft || existingDraft.profileId !== selectedProfile.id) ? createProcessingDraft(kb.id, draftProfile, kb.importBatchId) : existingDraft;
    return dom.pageHeader({
      title: kb.isLocalDocumentFlow ? "上传文档" : (isExistingImport ? "导入文件" : "新建知识库"),
      back: { label: kb.isLocalDocumentFlow ? "返回文档管理" : "返回知识库", route: importReturnRoute(kb.id) }
    }) + '<div class="page-content creation-page"><div class="creation-page__top">' + renderCreationSteps(4, kb.isLocalDocumentFlow) + '</div><section class="panel creation-panel"><div class="panel__body">' +
      '<div class="processing-section-label">' + dom.requiredLabel("切片策略", { tag: "div" }) + '<p>先选择切片类型；如需精确控制，再在自定义切片中选择具体方法。</p></div><div class="processing-profile-picker">' + processingProfileCards(state, kb, processingDraft) + '</div>' +
      '<div data-processing-draft>' + renderProcessingParameters(processingDraft) + '</div>' +
      '<div class="form-help" role="note">Demo 说明：当前仅递归切块对已读取文本执行实际拆分；其他策略用于配置演示，预览结果不代表对应算法已接入。</div>' +
      '<div class="vector-cost-notice">' + dom.icon("circle-alert", 15) + '<span>' + (kb.isLocalDocumentFlow ? "完成后保存解析内容与切片，可在文档管理中预览。" : "完成后将为本次导入内容生成向量并写入索引，产生 Embedding Token 消耗。") + '</span></div>' +
      '<div class="creation-actions">' + dom.button("取消", { variant: "secondary", attrs: 'data-onboarding-cancel="' + esc(kb.id) + '"' }) + dom.button("上一步", { variant: "secondary", icon: "arrow-left", attrs: 'data-processing-back="' + esc(kb.id) + '"' }) + dom.button("完成", { variant: "primary", icon: "check", disabled: !processingDraft, attrs: 'data-processing-finish="' + esc(kb.id) + '" data-existing-import="' + (isExistingImport ? "true" : "false") + '"' }) + '</div></div></section></div>';
  }
  function renderChunkCards(state, item) {
    var chunks = documentChunks(state, item);
    if (!chunks.length) return dom.empty("暂无切片", "该文件完成切片处理后将在此显示。", "blocks");
    return '<div class="chunk-preview-list">' + chunks.map(function map(chunk, index) {
      var content = chunk.content || chunk.text || "";
      var characterCount = chunk.characterCount == null ? content.length : chunk.characterCount;
      var chunkId = chunk.id || item.id + "-CH-" + (index + 1);
      return '<article class="chunk-preview-card" data-chunk-preview-card="' + esc(chunkId) + '" tabindex="0" role="button" aria-expanded="false"><header><span class="chunk-preview-card__number">#' + String(chunk.index || chunk.order || index + 1).padStart(2, "0") + '</span><strong>' + esc(chunkId) + '</strong><span>' + number(characterCount) + ' 字符</span></header><p>' + esc(content) + "</p><span class=\"chunk-preview-card__hint\">点击展开全文</span></article>";
    }).join("") + "</div>";
  }

  function renderDocumentSource(state, item) {
    var sourceText = item.sourcePreview || item.extractedText || documentChunks(state, item).filter(function filter(chunk) { return chunk.origin !== "manual"; }).map(function map(chunk) { return chunk.content || chunk.text || ""; }).join("\n\n");
    return '<article class="document-source-preview"><div class="document-source-preview__page"><div class="document-source-preview__file">' + dom.icon("file-text", 17) + '<span>' + esc(item.name) + '</span></div><div class="document-source-preview__content">' + esc(sourceText || "暂无可预览的源内容。") + "</div></div></article>";
  }

  function renderDocumentPreviewPage(state, kb, documentId, originTab) {
    var documents = knowledgeDocuments(state, kb.id);
    var item = findDocument(state, documentId) || documents[0];
    var returnsToChunks = originTab === "chunks";
    var backRoute = "knowledge/" + kb.id + (returnsToChunks && item ? "?tab=chunks&document=" + encodeURIComponent(item.id) : "?tab=documents");
    if (!item) return dom.pageHeader({ title: "文件预览", back: { label: "返回知识库", route: backRoute } }) + '<div class="page-content">' + dom.empty("暂无文件", "导入文件后可预览源内容与切片。", "files") + "</div>";
    var chunks = documentChunks(state, item);
    var toolbar = '<div class="knowledge-preview-toolbar"><div class="knowledge-preview-toolbar__source"><label for="preview-document-select">源文档</label><select id="preview-document-select" class="select-field" data-preview-document-select="' + esc(kb.id) + '" data-preview-origin="' + (returnsToChunks ? "chunks" : "documents") + '">' + documents.map(function map(documentItem) {
      return '<option value="' + esc(documentItem.id) + '"' + (documentItem.id === item.id ? " selected" : "") + '>' + esc(documentItem.name) + "</option>";
    }).join("") + '</select></div><div class="knowledge-preview-toolbar__result"><h2>全部切片（' + number(chunks.length) + '）</h2>' + dom.button("新增切片", { variant: "primary", icon: "plus", size: "small", disabled: Boolean(kb.benchmarkReadOnly), attrs: 'data-chunk-add="' + esc(item.id) + '" data-kb-id="' + esc(kb.id) + '"' + (kb.benchmarkReadOnly ? ' title="只读评测基准不可修改切片"' : "") }) + "</div></div>";
    var body = preview.split({
      className: "knowledge-chunk-preview",
      toolbar: toolbar,
      sourceHeader: false,
      source: renderDocumentSource(state, item),
      resultHeader: false,
      result: renderChunkCards(state, item)
    });
    return dom.pageHeader({ title: "文件预览", back: { label: "返回知识库", route: backRoute }, actions: dom.button("下载原文件", { variant: "secondary", icon: "download", attrs: 'data-preview-document-download="' + esc(item.id) + '"' }) }) + '<div class="page-content preview-page">' + body + "</div>";
  }

  function renderKnowledgeDetail(state, route, kb) {
    if (!kb.benchmarkReadOnly && String(route.query.settings || "") === "parse") return renderKnowledgeParseSettings(state, kb);
    if (!kb.benchmarkReadOnly && String(route.query.onboarding || "") === "1") {
      var onboardingStep = route.query.step || "upload";
      var isExistingImport = route.query.flow === "import";
      if (onboardingStep === "parse") return renderKnowledgeParse(state, kb, isExistingImport);
      if (onboardingStep === "processing") return renderKnowledgeProcessing(state, kb, isExistingImport);
      return renderKnowledgeUpload(state, kb, true, isExistingImport);
    }
    if (!kb.benchmarkReadOnly && String(route.query.upload || "") === "1") return renderKnowledgeUpload(state, kb, true, true);
    if (route.query.preview) return renderDocumentPreviewPage(state, kb, route.query.preview, route.query.from);
    var activeContentTab = route.query.tab === "chunks" ? "chunks" : "documents";
    var content = activeContentTab === "chunks" ? renderChunksTab(state, kb, String(route.query.document || "")) : renderDocumentsTab(state, kb);
    return dom.pageHeader({
      title: kb.name,
      back: { label: "返回知识库列表", route: "knowledge" },
      actions: detailHeaderActions(state, kb)
    }) + '<div class="page-content">' +
      renderKnowledgeInfo(state, kb) + content + "</div>";
  }

  function render(route, state) {
    if (route.id === "new") return renderKnowledgeCreate(state);
    if (route.id) {
      var kb = findKnowledgeBase(state, route.id);
      if (!kb) {
        return pageIntro("知识库") + '<div class="page-content">' + dom.empty("知识库不存在", "请返回列表选择可用对象。", "database-zap") + "</div>";
      }
      return renderKnowledgeDetail(state, route, kb);
    }
    return renderKnowledgeList(state);
  }

  function localImportRoute(route) {
    return Object.assign({}, route, { id: "local-documents", query: Object.assign({}, route.query, { onboarding: "1", flow: "local-documents" }) });
  }

  function renderLocalImport(route, state) {
    var sharedRoute = localImportRoute(route);
    var context = findKnowledgeBase(state, sharedRoute.id, sharedRoute.query.batch);
    if (!context || (sharedRoute.query.step !== "upload" && sharedRoute.query.step && !sharedRoute.query.batch)) {
      return dom.pageHeader({ title: "上传文档", back: { label: "返回文档管理", route: "local-documents" } }) + '<div class="page-content">' + dom.empty("上传记录已失效", "请返回文档管理重新上传文件。", "file-x") + "</div>";
    }
    return renderKnowledgeDetail(state, sharedRoute, context);
  }

  function mountLocalImport(root, route, state) {
    mount(root, localImportRoute(route), state);
  }

  function confirmToggle(kb, enabled) {
    overlay.confirm({
      title: enabled ? "启用检索" : "关闭检索",
      confirmLabel: enabled ? "确认启用" : "确认关闭",
      confirmVariant: enabled ? "primary" : "danger",
      body: '<div class="notice' + (enabled ? '' : ' notice--warning') + '">' + dom.icon(enabled ? "play" : "triangle-alert", 16) + '<div class="notice__content">' +
        (enabled ? "启用后，该知识库将恢复提供检索服务。确认启用检索？" : "关闭后，该知识库将停止响应新的检索请求。确认关闭检索？") +
        '</div></div>',
      onConfirm: function onConfirm() {
        var result = actions.setKnowledgeBaseEnabled(kb.id, enabled);
        if (!result) {
          overlay.toast("检索未启用", "请确认已有可检索文件、索引已建立，且向量模型已通过连通性测试。", "warning");
          return false;
        }
        overlay.toast(enabled ? "检索已启用" : "检索已关闭", enabled ? "符合访问等级的 Agent 现在可以检索此知识库。" : "文件、索引和权限设置均已保留。", "success");
        return true;
      }
    });
  }

  function editKnowledgeBase(kb) {
    if (!kb) return;
    overlay.open({
      title: "编辑知识库",
      confirmLabel: "保存",
      body: '<div class="stack"><div class="form-field">' + dom.requiredLabel("名称", { forId: "edit-kb-name" }) + '<input id="edit-kb-name" class="field" maxlength="40" value="' + esc(kb.name) + '" data-edit-kb-name required aria-required="true"></div><div class="form-field">' + dom.requiredLabel("描述", { forId: "edit-kb-purpose" }) + '<textarea id="edit-kb-purpose" class="textarea-field" maxlength="120" data-edit-kb-purpose required aria-required="true">' + esc(kb.purpose) + "</textarea></div></div>",
      onConfirm: function onConfirm(scope) {
        var name = scope.querySelector("[data-edit-kb-name]").value.trim();
        var purpose = scope.querySelector("[data-edit-kb-purpose]").value.trim();
        if (!name || !purpose) {
          overlay.toast("信息未完整", "请填写知识库名称和描述。", "warning");
          return false;
        }
        var updated = actions.updateKnowledgeBase(kb.id, { name: name, purpose: purpose });
        if (!updated) {
          overlay.toast("未能保存", "请确认名称未与其他知识库重复。", "warning");
          return false;
        }
        overlay.toast("知识库已更新", "名称与描述已保存。", "success");
        return true;
      }
    });
  }

  function confirmDeleteKnowledgeBase(kb) {
    if (!kb) return;
    if (kb.enabled) {
      overlay.confirm({
        title: "删除知识库",
        confirmLabel: "关闭检索",
        confirmVariant: "danger",
        body: '<p class="knowledge-delete-copy">“' + esc(kb.name) + '”正在提供检索。请先关闭检索，确认 Agent 不再使用后再删除。</p>',
        onConfirm: function onConfirm() {
          var disabled = actions.setKnowledgeBaseEnabled(kb.id, false);
          if (!disabled) return false;
          overlay.toast("检索已关闭", "知识库仍完整保留，确认后可再次点击删除。", "success");
          return true;
        }
      });
      return;
    }
    overlay.confirm({
      title: "删除知识库",
      confirmLabel: "删除",
      confirmVariant: "danger",
      body: '<p class="knowledge-delete-copy">删除“' + esc(kb.name) + '”后，其文件、切片、向量和索引数据将同时删除，且无法恢复。</p>',
      onConfirm: function onConfirm() {
        var deleted = actions.deleteKnowledgeBase(kb.id);
        if (!deleted) {
          overlay.toast("未能删除", "请先关闭该知识库的检索。", "warning");
          return false;
        }
        overlay.toast("知识库已删除", kb.name + " 已从列表中移除。", "success");
        return true;
      }
    });
  }

  function confirmDeleteDocument(kb, item) {
    if (!kb || !item) return;
    overlay.confirm({
      title: "删除文件",
      confirmLabel: "删除",
      confirmVariant: "danger",
      body: '<p class="knowledge-delete-copy">删除“' + esc(item.name) + '”后，该文件的切片、向量和引用定位将同时移除，且无法恢复。</p>',
      onConfirm: function onConfirm() {
        var deleted = actions.deleteDocument && actions.deleteDocument(item.id);
        if (!deleted) {
          overlay.toast("未能删除", "请稍后重试。", "warning");
          return false;
        }
        overlay.toast("文件已删除", "对应切片、向量和索引内容已移除。", "success");
        return true;
      }
    });
  }

  function openAddChunk(knowledgeBaseId, documentId, originTab) {
    overlay.open({
      title: "新增切片",
      confirmLabel: "创建切片",
      wide: true,
      body: '<div class="stack"><div class="form-field">' + dom.requiredLabel("切片内容", { forId: "new-chunk-content" }) + '<textarea id="new-chunk-content" class="textarea-field chunk-content-editor" maxlength="5000" placeholder="输入需要纳入检索的内容" data-chunk-content required aria-required="true"></textarea></div><div class="vector-cost-notice">' + dom.icon("circle-alert", 15) + '<span>保存后会重新生成该文件的向量索引，产生 Embedding Token 消耗；完成前该切片不可检索。</span></div></div>',
      onConfirm: function onConfirm(scope) {
        var content = scope.querySelector("[data-chunk-content]").value.trim();
        if (!content) {
          overlay.toast("切片内容为空", "请输入需要纳入检索的内容。", "warning");
          return false;
        }
        var result = actions.addDocumentChunk && actions.addDocumentChunk(documentId, { content: content });
        if (!result) {
          overlay.toast("切片未保存", "请确认向量模型连接正常后重试。", "warning");
          return false;
        }
        overlay.toast("切片已新增", "已进入向量化队列，完成后自动进入检索范围。", "success");
        window.setTimeout(function refreshPreview() {
          router.navigate("knowledge/" + knowledgeBaseId + "?preview=" + documentId + (originTab === "chunks" ? "&from=chunks" : ""));
        }, 0);
        return true;
      }
    });
  }

  function openDocumentReplacementConfirmation(batch, knowledgeBaseId, onComplete) {
    var items = (batch && batch.items) || [];
    var replacements = items.filter(function filter(item) { return item.operation === "replace" && item.status === "replacement_staged"; });
    var skipped = items.filter(function filter(item) { return item.operation === "skip" || item.status === "skipped"; });
    if (!replacements.length) {
      if (skipped.length) overlay.toast("重复文件已处理", number(skipped.length) + " 个文件内容相同，已跳过。", "success");
      if (typeof onComplete === "function") onComplete();
      return;
    }
    var skippedRows = skipped.length ? '<div class="duplicate-import-summary"><strong>内容相同，已跳过</strong><span>' + skipped.map(function map(item) { return esc(item.fileName); }).join("、") + "</span></div>" : "";
    var replacementRows = replacements.map(function map(item) {
      return '<label class="duplicate-import-choice is-selected" data-confirm-document-replacement="' + esc(item.id) + '"><input type="radio" name="replacement-resolution-' + esc(item.id) + '" value="replace" checked><span><strong>替换原文件 <em>推荐</em></strong><small>' + esc(item.fileName) + "</small></span></label>";
    }).join("");
    overlay.open({
      title: "确认同名文件处理方式",
      confirmLabel: "替换原文件",
      cancelLabel: "暂不替换",
      dismissible: false,
      body: '<div class="duplicate-import-review">' + skippedRows + '<p>检测到同名但内容不同的文件，已默认选择“替换原文件”。确认后沿用原文件 ID，重新解析、切片、重新生成向量并更新索引，会产生 Embedding Token 消耗。</p><div class="duplicate-import-choices">' + replacementRows + "</div></div>",
      onConfirm: function onConfirm() {
        var allConfirmed = replacements.every(function confirm(item) {
          return Boolean(actions.confirmDocumentReplacement && actions.confirmDocumentReplacement(batch.id, item.id));
        });
        if (!allConfirmed) {
          overlay.toast("替换未完成", "请确认向量模型连接正常后重试。", "warning");
          return false;
        }
        overlay.toast("原文件已替换", number(replacements.length) + " 个文件已复用原 ID 并重新生成向量。", "success");
        if (typeof onComplete === "function") window.setTimeout(onComplete, 0);
        return true;
      }
    });
  }

  function mineruSummary(config) {
    var parseConfig = config || {};
    var outputs = ["文本内容", "版面结构"];
    if (parseConfig.tableEnabled !== false) outputs.push("表格");
    if (parseConfig.formulaEnabled !== false) outputs.push("公式");
    if (visualUnderstandingEnabled(parseConfig)) outputs.push("图片 / 图表内容理解");
    outputs.push("原图");
    var recognition = { auto: "自动判断（推荐）", txt: "优先原生文本", ocr: "全文 OCR" }[parseConfig.parseMethod] || "自动判断（推荐）";
    return {
      effort: visualUnderstandingEnabled(parseConfig) ? "系统自动 · 精细解析" : "系统自动 · 标准解析",
      recognition: recognition,
      outputs: outputs.join("、"),
      execution: "本地解析"
    };
  }

  function openMineruDetail(state, kb) {
    var summary = mineruSummary(kb.mineruParseConfig);
    var failedCount = knowledgeImports(state, kb.id).reduce(function count(total, batch) {
      return total + (batch.items || []).filter(function filter(item) { return item.status === "failed" && item.failedStep === "mineru_parse"; }).length;
    }, 0);
    var failureNotice = failedCount ? '<div class="notice notice--danger"><div class="notice__content"><div class="notice__title">' + number(failedCount) + " 项解析失败</div>请检查文件后重新导入。</div></div>" : "";
    overlay.open({
      kind: "drawer",
      title: "文档解析策略",
      footer: false,
      body: '<div class="stack">' + failureNotice + '<div class="notice"><div class="notice__content"><div class="notice__title">后续导入默认策略</div>修改后仅影响保存后的新导入，不会重新处理已有文件。</div></div><dl class="detail-list">' +
        detailRow("解析模式（自动）", esc(summary.effort)) + detailRow("文字提取", esc(summary.recognition)) + detailRow("执行方式", esc(summary.execution)) + detailRow("保留内容", esc(summary.outputs)) +
        '</dl><div style="display:flex;justify-content:flex-end;gap:8px">' + dom.button("编辑后续导入策略", { variant: "primary", icon: "settings-2", attrs: 'data-mineru-edit="' + esc(kb.id) + '"' }) + "</div></div>"
    });
    var overlayRoot = document.getElementById("overlay-root");
    var edit = overlayRoot && overlayRoot.querySelector("[data-mineru-edit]");
    if (edit) edit.addEventListener("click", function handle() { overlay.close(); router.navigate("knowledge/" + kb.id + "?settings=parse"); });
  }

  function applyListSearch(root) {
    var input = root.querySelector("[data-kb-search]");
    var query = input ? input.value.trim().toLowerCase() : "";
    root.querySelectorAll("[data-kb-table] tr").forEach(function each(row) {
      row.hidden = Boolean(query && row.textContent.toLowerCase().indexOf(query) < 0);
    });
  }

  function mount(root, route, state) {
    var createButton = root.querySelector("[data-create-kb]");
    if (createButton) createButton.addEventListener("click", function handle() { router.navigate("knowledge/new"); });

    root.querySelectorAll("[data-create-cancel]").forEach(function bind(button) {
      button.addEventListener("click", function handle() { router.navigate("knowledge"); });
    });
    var vectorSelect = root.querySelector("#kb-vector");
    var nameInput = root.querySelector("#kb-name");
    var purposeInput = root.querySelector("#kb-purpose");
    var levelSelect = root.querySelector("#kb-access");
    var createOnly = root.querySelector("[data-create-only]");
    var createAndImport = root.querySelector("[data-create-and-import]");
    function syncCreateAvailability() {
      var complete = Boolean(nameInput && nameInput.value.trim() && purposeInput && purposeInput.value.trim() && vectorSelect && vectorSelect.value && levelSelect && levelSelect.value);
      if (createOnly) createOnly.disabled = !complete;
      if (createAndImport) createAndImport.disabled = !complete;
    }
    function syncVectorDimension() {
      if (!vectorSelect) return;
      var option = vectorSelect.options[vectorSelect.selectedIndex];
      var dimension = root.querySelector("[data-vector-dimension]");
      var dimensionField = root.querySelector("[data-vector-dimension-field]");
      var hasDimension = Boolean(option && option.dataset.dimension);
      if (dimension) dimension.textContent = hasDimension ? number(option.dataset.dimension) + " 维" : "";
      if (dimensionField) dimensionField.hidden = !hasDimension;
      syncCreateAvailability();
    }
    if (vectorSelect) {
      vectorSelect.addEventListener("change", syncVectorDimension);
      syncVectorDimension();
    }
    [nameInput, purposeInput].forEach(function bind(input) {
      if (input) input.addEventListener("input", syncCreateAvailability);
    });
    if (levelSelect) levelSelect.addEventListener("change", syncCreateAvailability);
    syncCreateAvailability();
    function createKnowledgeBase(continueToImport) {
      var name = nameInput && nameInput.value.trim();
      var purpose = purposeInput && purposeInput.value.trim();
      if (!name || !purpose || !vectorSelect || !vectorSelect.value || !levelSelect || !levelSelect.value) {
        overlay.toast("信息未完整", "请填写名称和描述，并选择向量模型与访问等级。", "warning");
        return;
      }
      var created = actions.createKnowledgeBase({
        name: name,
        purpose: purpose,
        embeddingModelId: vectorSelect.value,
        minAccessLevel: levelSelect.value,
        minAccessLevelLabel: ((state.meta.accessLevels || []).find(function find(level) { return level.code === levelSelect.value; }) || {}).name || ""
      });
      if (!created) return;
      if (continueToImport) {
        overlay.toast("知识库已创建", "继续导入文件并完成处理流程。", "success");
        router.navigate("knowledge/" + created.id + "?onboarding=1&step=upload");
      } else {
        overlay.toast("知识库已创建", "当前未导入文件，检索保持关闭。", "success");
        router.navigate("knowledge/" + created.id + "?tab=documents");
      }
    }
    if (createOnly) createOnly.addEventListener("click", function handle() { createKnowledgeBase(false); });
    if (createAndImport) createAndImport.addEventListener("click", function handle() { createKnowledgeBase(true); });
    var createForm = root.querySelector("[data-create-kb-form]");
    if (createForm && createAndImport) {
      createForm.addEventListener("submit", function handle(event) {
        event.preventDefault();
        createAndImport.click();
      });
    }

    root.querySelectorAll("[data-kb-open]").forEach(function bind(button) {
      button.addEventListener("click", function handle() { router.navigate("knowledge/" + button.dataset.kbOpen + "?tab=documents"); });
    });
    root.querySelectorAll("[data-kb-test]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        router.navigate("retrieval-test?knowledgeBaseId=" + encodeURIComponent(button.dataset.kbTest));
      });
    });
    root.querySelectorAll("[data-kb-edit]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        editKnowledgeBase(findKnowledgeBase(OpsDemo.core.store.getState(), button.dataset.kbEdit));
      });
    });
    root.querySelectorAll("[data-kb-delete]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        confirmDeleteKnowledgeBase(findKnowledgeBase(OpsDemo.core.store.getState(), button.dataset.kbDelete));
      });
    });
    var back = root.querySelector("[data-back-kb-list]");
    if (back) back.addEventListener("click", function handle() { router.navigate("knowledge"); });

    root.querySelectorAll("[data-import-kb]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        router.navigate("knowledge/" + button.dataset.importKb + "?onboarding=1&step=upload&flow=import");
      });
    });
    var uploadInput = root.querySelector("[data-upload-files]");
    var uploadDrop = root.querySelector("[data-upload-drop]");
    var uploadStart = root.querySelector("[data-upload-start]");
    var uploadModelReady = !uploadStart || uploadStart.dataset.modelReady !== "false";
    var selectedFiles = [];
    var isUploading = false;
    function fileVisual(fileName) {
      var extension = ((fileName || "").split(".").pop() || "").toLowerCase();
      if (["png", "jpg", "jpeg", "webp"].indexOf(extension) >= 0) return { icon: "image", label: extension.toUpperCase() };
      if (["ppt", "pptx"].indexOf(extension) >= 0) return { icon: "presentation", label: extension.toUpperCase() };
      if (["xls", "xlsx"].indexOf(extension) >= 0) return { icon: "sheet", label: extension.toUpperCase() };
      if (["doc", "docx"].indexOf(extension) >= 0) return { icon: "file-type-2", label: extension.toUpperCase() };
      return { icon: "file-text", label: extension ? extension.toUpperCase() : "FILE" };
    }
    function renderUploadFiles() {
      var list = root.querySelector("[data-upload-file-list]");
      if (!list) return;
      if (!selectedFiles.length) {
        list.innerHTML = "";
        list.hidden = true;
      } else {
        list.hidden = false;
        list.innerHTML = selectedFiles.map(function map(entry, index) {
          var file = entry.file;
          var visual = fileVisual(file.name);
          var size = file.size ? (file.size >= 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(file.size / 1024)) + " KB") : "待导入";
          var statusClass = entry.status === "importing" ? " is-loading" : (entry.status === "error" ? " is-error" : "");
          var statusContent = entry.status === "importing" ? dom.icon("loader-circle", 17, "is-spinning") + '<span>导入中</span>' : (entry.status === "error" ? dom.icon("circle-alert", 17) + '<span>导入失败</span>' : dom.icon("check", 17) + '<span>已导入</span>');
          return '<div class="upload-file-row"><span class="upload-file-row__icon">' + dom.icon(visual.icon, 19) + '</span><span class="upload-file-row__name"><strong>' + esc(file.name) + '</strong><small>' + esc(visual.label + " · " + size) + '</small></span><span class="upload-file-row__status' + statusClass + '">' + statusContent + '</span><button type="button" class="upload-file-row__remove" data-upload-remove="' + index + '" aria-label="移除 ' + esc(file.name) + '" title="移除"' + (isUploading || entry.status === "importing" ? " disabled" : "") + '>' + dom.icon("trash-2", 16) + "</button></div>";
        }).join("");
      }
      dom.hydrateIcons(list);
      var allImported = selectedFiles.length > 0 && selectedFiles.every(function every(entry) { return entry.status === "imported"; });
      if (uploadStart) uploadStart.disabled = !allImported || isUploading || !uploadModelReady;
    }
    function updateUploadFiles(files) {
      var sourceFiles = Array.prototype.slice.call(files || []);
      var accepted = sourceFiles.filter(function filter(file) { return /\.(pdf|png|jpe?g|webp|docx?|pptx?|xlsx?|txt)$/i.test(file.name || ""); });
      var rejectedCount = sourceFiles.length - accepted.length;
      var pendingEntries = [];
      accepted.forEach(function each(file) {
        var duplicate = selectedFiles.some(function some(existing) { return existing.file.name === file.name && existing.file.size === file.size && existing.file.lastModified === file.lastModified; });
        if (!duplicate) {
          var entry = { file: file, status: "importing" };
          selectedFiles.push(entry);
          pendingEntries.push(entry);
        }
      });
      renderUploadFiles();
      if (pendingEntries.length) {
        pendingEntries.forEach(function readFile(entry) {
          var readText = /\.txt$/i.test(entry.file.name) && typeof entry.file.text === "function" ? entry.file.text() : Promise.resolve("");
          readText.then(function received(text) {
            entry.sourcePreview = text;
            window.setTimeout(function finishLocalImport() {
              if (selectedFiles.indexOf(entry) >= 0) entry.status = "imported";
              renderUploadFiles();
            }, 520);
          }).catch(function failed() {
            entry.status = "error";
            renderUploadFiles();
          });
        });
      }
      if (rejectedCount) overlay.toast("部分文件未加入", "请选择 PDF、图片、Word、PPT、Excel 或 TXT 文件。", "warning");
    }
    if (uploadInput) uploadInput.addEventListener("change", function handle() { updateUploadFiles(uploadInput.files); });
    if (uploadDrop) {
      ["dragenter", "dragover"].forEach(function bindDrag(eventName) {
        uploadDrop.addEventListener(eventName, function handle(event) {
          event.preventDefault();
          uploadDrop.classList.add("is-dragover");
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        });
      });
      ["dragleave", "dragend"].forEach(function bindLeave(eventName) {
        uploadDrop.addEventListener(eventName, function handle() { uploadDrop.classList.remove("is-dragover"); });
      });
      uploadDrop.addEventListener("drop", function handle(event) {
        event.preventDefault();
        uploadDrop.classList.remove("is-dragover");
        updateUploadFiles(event.dataTransfer && event.dataTransfer.files);
      });
    }
    var uploadList = root.querySelector("[data-upload-file-list]");
    if (uploadList) uploadList.addEventListener("click", function handle(event) {
      var remove = event.target.closest("[data-upload-remove]");
      if (!remove || isUploading) return;
      selectedFiles.splice(Number(remove.dataset.uploadRemove), 1);
      renderUploadFiles();
    });
    if (uploadStart) {
      uploadStart.addEventListener("click", function handle() {
        if (!uploadModelReady) {
          overlay.toast("暂时无法导入", "请先在模型管理中恢复向量模型连接。", "warning");
          return;
        }
        if (!selectedFiles.length) {
          overlay.toast("尚未选择文件", "请选择文件或将文件拖入上传区域。", "warning");
          return;
        }
        var knowledgeBaseId = uploadStart.dataset.uploadStart;
        var isOnboardingImport = uploadStart.dataset.onboarding === "true";
        isUploading = true;
        renderUploadFiles();
        window.setTimeout(function completeUpload() {
          if (!root.isConnected || !uploadStart.isConnected) return;
          var batch = actions.startKnowledgeImport(knowledgeBaseId, { files: selectedFiles.map(function map(entry) { return { name: entry.file.name, size: entry.file.size, type: entry.file.type, lastModified: entry.file.lastModified, sourceFile: entry.file, sourcePreview: entry.sourcePreview }; }), deferred: isOnboardingImport });
          if (!batch) {
            isUploading = false;
            selectedFiles.forEach(function each(entry) { entry.status = "error"; });
            renderUploadFiles();
            overlay.toast("文件未导入", "请检查向量模型连接和系统预置处理方案。", "warning");
            return;
          }
          isUploading = false;
          renderUploadFiles();
          if (isOnboardingImport || batch.status === "pending_configuration") {
            overlay.toast("文件已接收", "文件已暂存，完成后续步骤后开始处理。", "success");
            router.navigate(importStepRoute(knowledgeBaseId, "parse", batch.id, uploadStart.dataset.existingImport === "true"));
          } else {
            openDocumentReplacementConfirmation(batch, knowledgeBaseId, function finishImport() {
              if (batch.successCount) overlay.toast("文件已导入", "文件已完成解析、向量化和索引构建。", "success");
              router.navigate("knowledge/" + knowledgeBaseId + "?tab=documents");
            });
          }
        }, 520);
      });
    }
    root.querySelectorAll("[data-upload-cancel]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        router.navigate(importReturnRoute(button.dataset.uploadCancel));
      });
    });
    root.querySelectorAll("[data-onboarding-cancel]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        delete onboardingProcessingDrafts[processingDraftKey(button.dataset.onboardingCancel, route.query.batch)];
        router.navigate(importReturnRoute(button.dataset.onboardingCancel));
      });
    });
    var parseRecognition = root.querySelector("#parse-recognition");
    var parseVisualUnderstanding = root.querySelector("#parse-visual-understanding");
    function syncVisualUnderstanding() {
      var visualEnabled = Boolean(parseVisualUnderstanding && parseVisualUnderstanding.checked);
      var status = root.querySelector("[data-parse-mode-status]");
      if (status) {
        status.textContent = visualEnabled ? "精细解析 · VLM 已开启" : "标准解析 · 系统自动";
        status.classList.toggle("is-on", visualEnabled);
      }
    }
    if (parseVisualUnderstanding) {
      parseVisualUnderstanding.addEventListener("change", syncVisualUnderstanding);
      syncVisualUnderstanding();
    }
    if (route.id && ((route.query.onboarding === "1" && route.query.step === "parse") || route.query.settings === "parse")) {
      var activeKb = findKnowledgeBase(state, route.id, route.query.batch);
      var activeParseConfig = (activeKb && activeKb.mineruParseConfig) || {};
      if (parseRecognition) parseRecognition.value = activeParseConfig.parseMethod || "auto";
    }
    function readParseConfig() {
      var imageAnalysisEnabled = Boolean(parseVisualUnderstanding && parseVisualUnderstanding.checked);
      return {
        parseMethod: parseRecognition ? parseRecognition.value : "auto",
        executionMode: "local",
        remoteAuthorized: false,
        textContentEnabled: true,
        layoutStructureEnabled: true,
        tableEnabled: root.querySelector("#parse-table").checked,
        formulaEnabled: root.querySelector("#parse-formula").checked,
        imageAnalysisEnabled: imageAnalysisEnabled,
        returnContentList: true,
        returnImages: true,
        preserveLocators: true
      };
    }
    function parseCompatibilityFor(knowledgeBase, parseConfig) {
      if (!knowledgeBase || !knowledgeBase.currentIngestionProfileId || !actions.getProcessingProfileCompatibility) return { compatible: true };
      var currentState = OpsDemo.core.store.getState();
      var currentProfile = findIngestionProfile(currentState, knowledgeBase.currentIngestionProfileId);
      return actions.getProcessingProfileCompatibility(currentProfile, parseConfig);
    }
    var parseNext = root.querySelector("[data-parse-next]");
    if (parseNext) parseNext.addEventListener("click", function handle() {
      var currentState = OpsDemo.core.store.getState();
      var currentKb = findKnowledgeBase(currentState, parseNext.dataset.parseNext, route.query.batch);
      var nextParseConfig = readParseConfig();
      var compatibility = parseCompatibilityFor(currentKb, nextParseConfig);
      if (!compatibility.compatible) {
        overlay.toast("解析选项无法使用", (compatibility.message || "缺少系统处理所需内容") + "。请调整解析选项，或联系技术人员检查预置配置。", "warning");
        return;
      }
      var configured = actions.setKnowledgeBaseOnboardingConfig(parseNext.dataset.parseNext, {
        mineruParseConfig: nextParseConfig,
        batchId: route.query.batch || null
      });
      if (!configured) return;
      router.navigate(importStepRoute(parseNext.dataset.parseNext, "processing", route.query.batch, route.query.flow === "import"));
    });
    var parseSettingsCancel = root.querySelector("[data-parse-settings-cancel]");
    var parseSettingsSave = root.querySelector("[data-parse-settings-save]");
    if (parseSettingsCancel) parseSettingsCancel.addEventListener("click", function handle() {
      router.navigate("knowledge/" + parseSettingsCancel.dataset.parseSettingsCancel + "?tab=documents");
    });
    if (parseSettingsSave) parseSettingsSave.addEventListener("click", function handle() {
      var currentState = OpsDemo.core.store.getState();
      var currentKb = findKnowledgeBase(currentState, parseSettingsSave.dataset.parseSettingsSave);
      var nextParseConfig = readParseConfig();
      var compatibility = parseCompatibilityFor(currentKb, nextParseConfig);
      if (!compatibility.compatible) {
        overlay.toast("解析配置未保存", (compatibility.message || "缺少系统处理所需内容") + "。请调整解析选项，或联系技术人员检查预置配置。", "warning");
        return;
      }
      var configured = actions.setKnowledgeBaseOnboardingConfig(parseSettingsSave.dataset.parseSettingsSave, { mineruParseConfig: nextParseConfig });
      if (!configured) {
        overlay.toast("策略未保存", "请检查文字提取方式与识别内容。", "warning");
        return;
      }
      overlay.toast("文档解析策略已保存", "仅影响之后新导入的文件，已有文件不会重新处理。", "success");
      router.navigate("knowledge/" + configured.id + "?tab=documents");
    });
    var processingFinish = root.querySelector("[data-processing-finish]");
    var processingBack = root.querySelector("[data-processing-back]");
    var processingDraftRoot = root.querySelector("[data-processing-draft]");
    var processingMethodPicker = root.querySelector("[data-processing-method-picker]");
    var processingDraftCache = {};
    var initialProcessingDraft = processingFinish && onboardingProcessingDrafts[processingDraftKey(processingFinish.dataset.processingFinish, route.query.batch)];
    if (initialProcessingDraft && initialProcessingDraft.profileId) processingDraftCache[initialProcessingDraft.profileId] = initialProcessingDraft;

    function bindProcessingSeparatorPicker() {
      if (!processingDraftRoot) return;
      var picker = processingDraftRoot.querySelector("[data-processing-separator-picker]");
      if (!picker) return;
      var source = picker.querySelector("[data-processing-separator-source]");
      var trigger = picker.querySelector("[data-processing-separator-trigger]");
      var selectedValue = picker.querySelector("[data-processing-separator-value]");
      var listbox = picker.querySelector("[data-processing-separator-listbox]");
      var options = Array.from(picker.querySelectorAll("[data-processing-separator-option]"));
      if (!source || !trigger || !selectedValue || !listbox || !options.length) return;

      function selectedOption() {
        return options.find(function find(option) { return option.dataset.processingSeparatorOption === source.value; }) || options[0];
      }

      function syncSelection() {
        var current = selectedOption();
        options.forEach(function each(option) {
          option.setAttribute("aria-selected", option === current ? "true" : "false");
        });
        selectedValue.innerHTML = current.innerHTML;
      }

      function handleOutsidePointer(event) {
        if (!picker.contains(event.target)) setOpen(false);
      }

      function handleEscape(event) {
        if (event.key !== "Escape" || trigger.getAttribute("aria-expanded") !== "true") return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.focus();
      }

      function setOpen(open) {
        var nextOpen = open === true;
        trigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
        trigger.classList.toggle("is-open", nextOpen);
        listbox.hidden = !nextOpen;
        if (nextOpen) {
          document.addEventListener("pointerdown", handleOutsidePointer, true);
          document.addEventListener("keydown", handleEscape, true);
        } else {
          document.removeEventListener("pointerdown", handleOutsidePointer, true);
          document.removeEventListener("keydown", handleEscape, true);
        }
      }

      function focusOption(offset, absoluteIndex) {
        var activeIndex = options.indexOf(document.activeElement);
        var currentIndex = options.indexOf(selectedOption());
        var nextIndex = absoluteIndex;
        if (!Number.isInteger(nextIndex)) nextIndex = (activeIndex >= 0 ? activeIndex : currentIndex) + offset;
        if (nextIndex < 0) nextIndex = options.length - 1;
        if (nextIndex >= options.length) nextIndex = 0;
        options[nextIndex].focus();
      }

      function choose(option) {
        source.value = option.dataset.processingSeparatorOption;
        source.dispatchEvent(new Event("change", { bubbles: true }));
        syncSelection();
        setOpen(false);
        trigger.focus();
      }

      trigger.addEventListener("click", function togglePicker() {
        var willOpen = trigger.getAttribute("aria-expanded") !== "true";
        setOpen(willOpen);
        if (willOpen) focusOption(0);
      });
      trigger.addEventListener("keydown", function handleTriggerKeydown(event) {
        if (["ArrowDown", "ArrowUp"].indexOf(event.key) < 0) return;
        event.preventDefault();
        setOpen(true);
        focusOption(0, event.key === "ArrowUp" ? options.length - 1 : options.indexOf(selectedOption()));
      });
      options.forEach(function bindOption(option) {
        option.addEventListener("click", function selectOption() { choose(option); });
      });
      listbox.addEventListener("keydown", function handleListboxKeydown(event) {
        if (event.key === "Tab") {
          setOpen(false);
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          focusOption(event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          focusOption(0, event.key === "Home" ? 0 : options.length - 1);
          return;
        }
        if ((event.key === "Enter" || event.key === " ") && options.indexOf(document.activeElement) >= 0) {
          event.preventDefault();
          choose(document.activeElement);
        }
      });
      syncSelection();
    }

    function bindProcessingDraftInputs() {
      if (!processingDraftRoot || !processingFinish) return;
      processingDraftRoot.querySelectorAll("[data-processing-param]").forEach(function bind(input) {
        input.addEventListener("change", function handle() {
          var draft = onboardingProcessingDrafts[processingDraftKey(processingFinish.dataset.processingFinish, route.query.batch)];
          if (!draft) return;
          var key = input.dataset.processingParam;
          if (input.type === "checkbox") draft[key] = input.checked;
          else if (input.type === "number") draft[key] = Number(input.value);
          else draft[key] = input.value;
        });
        if (input.type === "number" || input.type === "text") {
          input.addEventListener("input", function handle() {
            var draft = onboardingProcessingDrafts[processingDraftKey(processingFinish.dataset.processingFinish, route.query.batch)];
            if (!draft) return;
            draft[input.dataset.processingParam] = input.type === "number" ? Number(input.value) : input.value;
          });
        }
      });
      bindProcessingSeparatorPicker();
    }

    function activateProcessingProfile(profile) {
      if (!profile || !processingDraftRoot || !processingFinish) {
        if (processingFinish) processingFinish.disabled = true;
        return null;
      }
      var knowledgeBaseId = processingFinish.dataset.processingFinish;
      var currentDraft = onboardingProcessingDrafts[processingDraftKey(knowledgeBaseId, route.query.batch)];
      if (currentDraft && currentDraft.profileId) processingDraftCache[currentDraft.profileId] = currentDraft;
      var draft = processingDraftCache[profile.id];
      if (!draft) {
        draft = createProcessingDraft(knowledgeBaseId, profile, route.query.batch);
        processingDraftCache[profile.id] = draft;
      } else {
        onboardingProcessingDrafts[processingDraftKey(knowledgeBaseId, route.query.batch)] = draft;
      }
      processingDraftRoot.innerHTML = renderProcessingParameters(draft);
      dom.hydrateIcons(processingDraftRoot);
      bindProcessingDraftInputs();
      processingFinish.disabled = false;
      return draft;
    }

    var selectedMethodInput = root.querySelector('input[name="processing-method"]:checked');
    var lastCustomMethod = selectedMethodInput ? selectedMethodInput.value : "structure";
    root.querySelectorAll('input[name="processing-family"]').forEach(function bindFamily(input) {
      input.addEventListener("change", function handle() {
        if (!input.checked || !processingDraftRoot || !processingFinish) return;
        var currentState = OpsDemo.core.store.getState();
        var isCustom = input.value === "custom";
        if (processingMethodPicker) processingMethodPicker.hidden = !isCustom;
        if (isCustom) {
          var methodInput = root.querySelector('input[name="processing-method"][value="' + lastCustomMethod + '"]') || root.querySelector('input[name="processing-method"]');
          if (!methodInput) {
            processingFinish.disabled = true;
            return;
          }
          methodInput.checked = true;
          activateProcessingProfile(findIngestionProfile(currentState, methodInput.dataset.processingProfileId));
          return;
        }
        activateProcessingProfile(findIngestionProfile(currentState, input.dataset.processingProfileId));
      });
    });
    root.querySelectorAll('input[name="processing-method"]').forEach(function bindMethod(input) {
      input.addEventListener("change", function handle() {
        if (!input.checked || !processingDraftRoot || !processingFinish) return;
        lastCustomMethod = input.value;
        var customFamily = root.querySelector('input[name="processing-family"][value="custom"]');
        if (customFamily) customFamily.checked = true;
        if (processingMethodPicker) processingMethodPicker.hidden = false;
        var currentState = OpsDemo.core.store.getState();
        activateProcessingProfile(findIngestionProfile(currentState, input.dataset.processingProfileId));
      });
    });
    bindProcessingDraftInputs();
    if (processingBack) processingBack.addEventListener("click", function handle() {
      router.navigate(importStepRoute(processingBack.dataset.processingBack, "parse", route.query.batch, route.query.flow === "import"));
    });
    if (processingFinish) processingFinish.addEventListener("click", function handle() {
      var currentState = OpsDemo.core.store.getState();
      var currentKb = findKnowledgeBase(currentState, processingFinish.dataset.processingFinish, route.query.batch);
      var processingDraft = onboardingProcessingDrafts[processingDraftKey(processingFinish.dataset.processingFinish, route.query.batch)];
      var currentProfile = processingDraft && findIngestionProfile(currentState, processingDraft.profileId);
      if (!currentKb || (!currentKb.isLocalDocumentFlow && !knowledgeEmbeddingReady(currentState, currentKb))) {
        overlay.toast("暂时无法开始文件处理", "请先在模型管理中恢复已绑定向量模型的连接。", "warning");
        return;
      }
      if (!currentProfile || !processingDraft || processingDraft.profileId !== currentProfile.id) {
        overlay.toast("请选择切片策略", "请选择代码中预置的处理方案，并确认本次处理参数。", "warning");
        return;
      }
      if ((processingDraft.mode === "smart" || processingDraft.mode === "semantic" || processingDraft.mode === "structure" || processingDraft.mode === "recursive" || processingDraft.mode === "separator") && (!Number.isInteger(processingDraft.maxChars) || processingDraft.maxChars < 200 || processingDraft.maxChars > 10000)) {
        overlay.toast("切片参数有误", "切片最大字符需为 200–10000 之间的整数。", "warning");
        return;
      }
      if (processingDraft.mode === "semantic" && ["low", "balanced", "high"].indexOf(processingDraft.semanticSensitivity) < 0) {
        overlay.toast("语义切片参数有误", "请选择低、均衡或高敏感度。", "warning");
        return;
      }
      if (["smart", "structure", "recursive", "separator"].indexOf(processingDraft.mode) >= 0 && (!Number.isInteger(processingDraft.overlapPercent) || processingDraft.overlapPercent < 0 || processingDraft.overlapPercent > 50)) {
        overlay.toast("切片参数有误", "切片重叠率需为 0–50 之间的整数。", "warning");
        return;
      }
      if (processingDraft.mode === "page" && (!Number.isInteger(processingDraft.pagesPerChunk) || processingDraft.pagesPerChunk < 1 || processingDraft.pagesPerChunk > 10)) {
        overlay.toast("切片参数有误", "每个切片页数需在 1–10 之间。", "warning");
        return;
      }
      var compatibility = actions.getProcessingProfileCompatibility ? actions.getProcessingProfileCompatibility(currentProfile, currentKb && currentKb.mineruParseConfig) : { compatible: true };
      if (!compatibility.compatible) {
        overlay.toast("无法开始处理", compatibility.message || "请联系技术人员检查代码预置方案。", "warning");
        return;
      }
      var completed = actions.setKnowledgeBaseOnboardingConfig(processingFinish.dataset.processingFinish, {
        ingestionProfileId: currentProfile.id,
        batchId: route.query.batch || null,
        processingParameters: {
          mode: processingDraft.mode,
          maxChars: processingDraft.maxChars,
          overlapPercent: processingDraft.overlapPercent,
          semanticSensitivity: processingDraft.semanticSensitivity,
          separatorType: processingDraft.separatorType,
          pagesPerChunk: processingDraft.pagesPerChunk,
          longDocumentFallback: processingDraft.longDocumentFallback,
          mergeShortChunks: processingDraft.mergeShortChunks,
          includeContext: processingDraft.includeContext,
          documentName: processingDraft.documentName,
          headingPath: processingDraft.headingPath,
          pageNumber: processingDraft.pageNumber,
          tableText: processingDraft.tableText,
          imageText: processingDraft.imageText
        },
        completed: true
      });
      if (!completed) {
        overlay.toast("文件处理未开始", "请检查向量模型连接与本次处理参数，或联系技术人员检查代码预置方案。", "warning");
        return;
      }
      var completionRoute = function completionRoute() {
        var existingImport = processingFinish.dataset.existingImport === "true";
        delete onboardingProcessingDrafts[processingDraftKey(processingFinish.dataset.processingFinish, route.query.batch)];
        overlay.toast(currentKb.isLocalDocumentFlow ? "文档已处理" : (existingImport ? "文件已导入" : "知识库已完成创建"), currentKb.isLocalDocumentFlow ? "文件已完成解析与切块，可在文档管理中预览。" : "文件已按本次解析与处理设置完成索引。", "success");
        router.navigate(importReturnRoute(processingFinish.dataset.processingFinish));
      };
      var completedState = OpsDemo.core.store.getState();
      var completedBatch = route.query.batch && (completedState.importBatches || []).find(function find(batch) { return batch.id === route.query.batch; });
      if (completedBatch && !currentKb.isLocalDocumentFlow) openDocumentReplacementConfirmation(completedBatch, processingFinish.dataset.processingFinish, completionRoute);
      else completionRoute();
    });
    root.querySelectorAll("[data-test-kb]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        router.navigate("retrieval-test?knowledgeBaseId=" + encodeURIComponent(button.dataset.testKb));
      });
    });
    root.querySelectorAll("[data-toggle-kb]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        var current = OpsDemo.core.store.getState();
        var kb = findKnowledgeBase(current, button.dataset.toggleKb);
        if (kb) confirmToggle(kb, button.dataset.next === "true");
      });
    });
    root.querySelectorAll("[data-knowledge-content-tab]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (!route.id || button.getAttribute("aria-selected") === "true") return;
        router.navigate("knowledge/" + route.id + "?tab=" + button.dataset.knowledgeContentTab);
      });
    });
    var quickChunkDocumentSelect = root.querySelector("[data-quick-chunk-document-select]");
    if (quickChunkDocumentSelect) quickChunkDocumentSelect.addEventListener("change", function handle() {
      router.navigate("knowledge/" + quickChunkDocumentSelect.dataset.quickChunkDocumentSelect + "?tab=chunks&document=" + encodeURIComponent(quickChunkDocumentSelect.value));
    });
    root.querySelectorAll("[data-chunk-full-preview]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (route.id) router.navigate("knowledge/" + route.id + "?preview=" + encodeURIComponent(button.dataset.chunkFullPreview) + "&from=chunks");
      });
    });
    root.querySelectorAll("[data-document-preview]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (!button.disabled && route.id) router.navigate("knowledge/" + route.id + "?preview=" + button.dataset.documentPreview);
      });
    });
    root.querySelectorAll("[data-document-delete]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        var current = OpsDemo.core.store.getState();
        confirmDeleteDocument(findKnowledgeBase(current, route.id), findDocument(current, button.dataset.documentDelete));
      });
    });
    var previewDocumentSelect = root.querySelector("[data-preview-document-select]");
    if (previewDocumentSelect) previewDocumentSelect.addEventListener("change", function handle() {
      var originQuery = previewDocumentSelect.dataset.previewOrigin === "chunks" ? "&from=chunks" : "";
      router.navigate("knowledge/" + previewDocumentSelect.dataset.previewDocumentSelect + "?preview=" + encodeURIComponent(previewDocumentSelect.value) + originQuery);
    });
    var previewDocumentDownload = root.querySelector("[data-preview-document-download]");
    if (previewDocumentDownload) previewDocumentDownload.addEventListener("click", function handle() {
      var currentState = OpsDemo.core.store.getState();
      var item = findDocument(currentState, previewDocumentDownload.dataset.previewDocumentDownload);
      if (!item) return;
      var sourceText = item.sourcePreview || item.extractedText || documentChunks(currentState, item).map(function map(chunk) { return chunk.content || chunk.text || ""; }).join("\n\n");
      var blob = new Blob([sourceText || item.name], { type: item.mimeType || "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = item.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function release() { URL.revokeObjectURL(url); }, 0);
      overlay.toast("已开始下载", item.name, "success");
    });
    var chunkCards = Array.prototype.slice.call(root.querySelectorAll("[data-chunk-preview-card]"));
    function setChunkExpanded(card, expanded) {
      card.classList.toggle("is-expanded", expanded);
      card.setAttribute("aria-expanded", expanded ? "true" : "false");
      var hint = card.querySelector(".chunk-preview-card__hint");
      if (hint) hint.textContent = expanded ? "点击收起" : "点击展开全文";
    }
    function toggleChunkCard(card) {
      var expanded = card.getAttribute("aria-expanded") === "true";
      chunkCards.forEach(function collapse(other) { if (other !== card) setChunkExpanded(other, false); });
      setChunkExpanded(card, !expanded);
    }
    chunkCards.forEach(function bind(card) {
      card.addEventListener("click", function handle() {
        var selection = window.getSelection && window.getSelection();
        if (selection && String(selection).trim()) return;
        toggleChunkCard(card);
      });
      card.addEventListener("keydown", function handle(event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleChunkCard(card);
      });
    });
    if (chunkCards.length) root.addEventListener("click", function collapseOutside(event) {
      if (event.target.closest("[data-chunk-preview-card]")) return;
      chunkCards.forEach(function collapse(card) { setChunkExpanded(card, false); });
    });
    root.querySelectorAll("[data-chunk-add]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        var originTab = route.query.tab === "chunks" || route.query.from === "chunks" ? "chunks" : "documents";
        openAddChunk(button.dataset.kbId, button.dataset.chunkAdd, originTab);
      });
    });
    root.querySelectorAll("[data-open-config]").forEach(function bind(button) {
      button.addEventListener("click", function handle() { router.navigate(button.dataset.openConfig); });
    });
    root.querySelectorAll("[data-mineru-detail]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        var currentState = OpsDemo.core.store.getState();
        var knowledgeBase = findKnowledgeBase(currentState, button.dataset.mineruDetail);
        if (knowledgeBase) openMineruDetail(currentState, knowledgeBase);
      });
    });
    var listSearch = root.querySelector("[data-kb-search]");
    if (listSearch) listSearch.addEventListener("input", function handle() { applyListSearch(root); });

    if (route.id && route.query.tab === "versions") {
      router.navigate("knowledge/" + route.id + "?tab=documents");
    }
  }

  OpsDemo.pages.knowledge = {
    render: render,
    mount: mount,
    renderLocalImport: renderLocalImport,
    mountLocalImport: mountLocalImport
  };
})(window.OpsDemo);

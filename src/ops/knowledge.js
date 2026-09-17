(function defineKnowledgePage(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;
  var preview = OpsDemo.ui.preview;
  var directoryTree = OpsDemo.ui.directoryTree;
  var router = OpsDemo.core.router;
  var actions = OpsDemo.core.actions;
  var onboardingProcessingDrafts = Object.create(null);
  var importSelections = Object.create(null);
  var pageCleanups = [];
  var sourcePreviewUrls = [];

  function unmount() {
    if (preview.dismissChunkMetadata) preview.dismissChunkMetadata();
    pageCleanups.splice(0).forEach(function clean(cleanup) { cleanup(); });
    sourcePreviewUrls.splice(0).forEach(function release(url) { URL.revokeObjectURL(url); });
  }

  function normalizeImportRoute(route) {
    if (/^knowledge\/[^/]+\/import(?:\/|$)/.test(route.path || "")) {
      return Object.assign({}, route, { query: Object.assign({}, route.query, { onboarding: "1", flow: "import" }) });
    }
    return route;
  }

  function importBatch(state, batchId) {
    return (state.importBatches || []).find(function match(batch) { return batch.id === batchId; }) || null;
  }

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
    var kb = id === "local-documents" ? actions.getLocalDocumentImportContext(batchId) : (state.knowledgeBases || []).find(function find(item) { return item.id === id; });
    if (!kb) return null;
    var batch = importBatch(state, batchId);
    if (batchId && (!batch || (id === "local-documents" ? batch.processingScope !== "local-documents" : batch.knowledgeBaseId !== id))) return null;
    return batch ? Object.assign({}, kb, {
      importBatchId: batch.id,
      mineruParseConfig: batch.mineruParseConfig || kb.mineruParseConfig,
      processingProfileSnapshot: batch.processingProfileSnapshot || kb.processingProfileSnapshot,
      currentIngestionProfileId: batch.ingestionProfileId || kb.currentIngestionProfileId
    }) : kb;
  }

  function importReturnRoute(id, batchId) {
    var batch = importBatch(OpsDemo.core.store.getState(), batchId);
    return batch && batch.returnRoute || (id === "local-documents" ? "local-documents" : "knowledge/" + id + "?tab=documents");
  }

  function importStepRoute(id, step, batchId, existingImport) {
    var path = id === "local-documents" ? "local-documents/upload?step=" : "knowledge/" + id + "/import?step=";
    return path + step + (batchId ? "&batch=" + encodeURIComponent(batchId) : "") + (id !== "local-documents" && existingImport ? "&flow=import" : "");
  }

  function processingDraftKey(id, batchId) {
    return id + ":" + (batchId || "new");
  }

  function importSelectionFromBatch(state, batch) {
    var versions = (batch && batch.items || []).map(function version(item) {
      return (state.fileVersions || []).find(function match(candidate) { return candidate.id === item.fileVersionId; }) || null;
    }).filter(Boolean);
    var sourceObjectIds = Array.from(new Set(versions.map(function source(version) { return version.sourceObjectId; }).filter(Boolean)));
    var versionIds = Array.from(new Set(versions.filter(function local(version) { return !version.sourceObjectId && version.lifecycleStatus !== "retired"; }).map(function key(version) { return version.id; })));
    return {
      versionIds: versionIds,
      sourceObjectIds: sourceObjectIds,
      files: [],
      source: sourceObjectIds.length && !versionIds.length ? "enterprise" : "assets",
      localFolderId: "all",
      enterpriseDirectoryId: "all",
      localCollapsedIds: [],
      enterpriseCollapsedIds: []
    };
  }

  function existingKnowledgeImportSources(state, knowledgeBaseId) {
    var versions = (state.fileVersions || []).reduce(function index(result, version) {
      result[version.id] = version;
      return result;
    }, {});
    var assetIds = new Set();
    var sourceObjectIds = new Set();
    (state.documents || []).forEach(function collect(document) {
      if (document.knowledgeBaseId !== knowledgeBaseId) return;
      var version = versions[document.fileVersionId];
      var assetId = document.localAssetId || document.fileId || version && version.fileId;
      var sourceObjectId = document.sourceObjectId || version && version.sourceObjectId;
      if (assetId) assetIds.add(assetId);
      if (sourceObjectId) sourceObjectIds.add(sourceObjectId);
    });
    return { assetIds: assetIds, sourceObjectIds: sourceObjectIds };
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

  function renderKnowledgeList(state) {
    var rows = state.knowledgeBases.map(function map(item) {
      var currentAvailability = knowledgeAvailability(state, item);
      var availability = currentAvailability.key;
      var availabilityLabel = currentAvailability.label;
      return '<tr data-kb-enabled="' + (item.enabled ? "true" : "false") + '" data-kb-issue="' + (item.openImportIssueCount ? "true" : "false") + '" data-kb-availability="' + esc(availability) + '">' +
        '<td><div class="knowledge-name-line"><button type="button" class="table-primary table-primary--link" data-kb-open="' + esc(item.id) + '">' + esc(item.name) + '</button></div><div class="table-secondary">' + esc(item.id) + "</div></td>" +
        "<td>" + dom.status(availabilityLabel, iconStatus(availability)) + "</td>" +
        '<td><div class="table-primary">' + number(item.documentCounts.total) + "</div></td>" +
        "<td>" + displayDate(item.updatedAt || item.contentUpdatedAt) + "</td>" +
        "<td>" + displayDate(item.createdAt) + "</td>" +
        '<td><div class="knowledge-row-actions"><button type="button" class="table-action" data-kb-open="' + esc(item.id) + '">详情</button><button type="button" class="table-action" data-kb-edit="' + esc(item.id) + '">编辑</button><button type="button" class="table-action" data-kb-test="' + esc(item.id) + '">测试</button><button type="button" class="table-action table-action--danger" data-kb-delete="' + esc(item.id) + '"' + (item.enabled ? ' disabled title="请先关闭检索再删除"' : "") + '>删除</button></div></td>' +
        "</tr>";
    }).join("");

    return dom.pageHeader({
      title: "知识库",
      actions: dom.button("新建知识库", { variant: "primary", icon: "plus", attrs: "data-create-kb" }),
      toolbar: { search: { placeholder: "搜索知识库", attrs: "data-kb-search" } }
    }) + '<div class="page-content"><section class="panel">' +
      '<div class="table-wrap"><table class="data-table knowledge-table"><thead><tr><th>知识库名称 / ID</th><th>检索状态</th><th>文件数量</th><th>更新时间</th><th>创建时间</th><th>操作</th></tr></thead>' +
      '<tbody data-kb-table>' + rows + "</tbody></table></div>" +
      '<div class="table-footer"><span>共 ' + state.knowledgeBases.length + " 个知识库</span></div></section></div>";
  }

  function detailHeaderActions(state, kb) {
    var toggleLabel = kb.enabled ? "关闭检索" : "启用检索";
    var toggleVariant = kb.enabled ? "danger" : "primary";
    var hasSearchableIndex = Boolean(kb.currentKnowledgeVersionId && kb.documentCounts && kb.documentCounts.searchable);
    var embeddingReady = knowledgeEmbeddingReady(state, kb);
    var retrievalReady = hasSearchableIndex && embeddingReady;
    var toggleAction = !kb.enabled && !retrievalReady ?
      dom.button(!hasSearchableIndex ? "等待索引建立" : "模型连接不可用", { variant: "secondary", icon: !hasSearchableIndex ? "clock-3" : "circle-alert", disabled: true, attrs: 'title="' + (!hasSearchableIndex ? "完成索引构建后可启用检索" : "向量模型未通过连通性测试") + '"' }) :
      dom.button(toggleLabel, { variant: toggleVariant, icon: kb.enabled ? "pause" : "play", attrs: 'data-toggle-kb="' + esc(kb.id) + '" data-next="' + (kb.enabled ? "false" : "true") + '"' });
    return dom.button("检索测试", { variant: "secondary", icon: "search-check", attrs: 'data-test-kb="' + esc(kb.id) + '"' }) +
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
    var modelErrorDescription = "原文件与处理结果仍可查看，恢复连接后可继续向量化和检索。";
    var embeddingError = modelErrorTitle ? '<div class="notice notice--danger knowledge-model-error">' + dom.icon("circle-alert", 16) + '<div class="notice__content"><div class="notice__title">' + modelErrorTitle + '</div>' + modelErrorDescription + dom.button("前往模型管理", { variant: "secondary", attrs: 'data-open-config="models"' }) + '</div></div>' : "";
    return '<section class="panel knowledge-info"><div class="panel__header"><h2 class="panel__title">知识库信息</h2></div><div class="panel__body">' +
      '<div class="knowledge-info__grid">' +
      knowledgeInfoItem("知识库 ID", esc(kb.id), "id") +
      knowledgeInfoItem("描述", esc(kb.purpose), "description") +
      knowledgeInfoItem("向量模型", embeddingDisplay(state, kb), "model") +
      knowledgeInfoItem("创建时间", displayDate(kb.createdAt), "created") +
      knowledgeInfoItem("更新时间", displayDate(kb.updatedAt || kb.contentUpdatedAt), "updated") +
      "</div>" + embeddingError + renderKnowledgePipeline(state, kb) + "</div></section>";
  }

  function renderKnowledgeContentTabs(activeTab) {
    return '<div class="knowledge-content-header"><div class="tabs knowledge-content-tabs" role="tablist" aria-label="知识库内容">' +
      '<button type="button" class="tab' + (activeTab === "documents" ? " is-active" : "") + '" role="tab" aria-selected="' + (activeTab === "documents" ? "true" : "false") + '" aria-controls="knowledge-documents-panel" data-knowledge-content-tab="documents">文件</button>' +
      '<button type="button" class="tab' + (activeTab === "chunks" ? " is-active" : "") + '" role="tab" aria-selected="' + (activeTab === "chunks" ? "true" : "false") + '" aria-controls="knowledge-chunks-panel" data-knowledge-content-tab="chunks">切片</button>' +
      "</div></div>";
  }

  function renderDocumentsTab(state, kb) {
    var documents = knowledgeDocuments(state, kb.id);
    var rows = documents.map(function map(item) {
      var lifecycle = documentLifecycle(item);
      var chunks = documentChunks(state, item);
      var chunkCount = item.chunkCount == null ? chunks.length : item.chunkCount;
      return "<tr>" +
        '<td><button type="button" class="table-primary table-primary--link" data-document-preview="' + esc(item.id) + '"' + '>' + esc(item.name) + '</button><div class="table-secondary">' + esc(item.id) + " · " + esc(item.documentType) + "</div></td>" +
        "<td>" + dom.status(lifecycle.label, lifecycleTone(lifecycle.key)) + "</td>" +
        "<td>" + (chunkCount ? number(chunkCount) + " 个" : "—") + "</td>" +
        "<td>" + displayDate(item.updatedAt || item.importedAt) + "</td>" +
        '<td><div class="knowledge-row-actions"><button type="button" class="table-action" data-document-preview="' + esc(item.id) + '"' + '>详情</button><button type="button" class="table-action table-action--danger" data-document-delete="' + esc(item.id) + '">移除</button><button type="button" class="table-action" data-document-reprocess="' + esc(item.id) + '">重新处理</button></div></td>' +
        "</tr>";
    }).join("");
    return '<section class="panel knowledge-assets knowledge-files">' + renderKnowledgeContentTabs("documents") + '<div id="knowledge-documents-panel" class="knowledge-assets__panel" role="tabpanel"><div class="table-wrap"><table class="data-table knowledge-files__table"><thead><tr><th>文件</th><th>文件状态</th><th>切片数</th><th>更新时间</th><th>操作</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5">' + dom.empty("暂无文件", "导入文件后可查看处理状态与切片。", "files") + "</td></tr>") + "</tbody></table></div><div class=\"table-footer\">当前展示 " + documents.length + " 个文件</div></div></section>";
  }

  function renderChunksTab(state, kb, requestedDocumentId) {
    var documents = knowledgeDocuments(state, kb.id);
    var item = documents.find(function match(documentItem) { return documentItem.id === requestedDocumentId; }) || documents[0] || null;
    var body;
    if (!item) {
      body = dom.empty("暂无文件", "导入文件后可对照查看源文档与切片。", "files");
    } else {
      var chunks = documentChunks(state, item);
      var toolbar = '<div class="knowledge-preview-toolbar"><div class="knowledge-preview-toolbar__source"><label for="preview-document-select">源文档</label><select id="preview-document-select" class="select-field" data-preview-document-select="' + esc(kb.id) + '">' + documents.map(function map(documentItem) {
        return '<option value="' + esc(documentItem.id) + '"' + (documentItem.id === item.id ? " selected" : "") + '>' + esc(documentItem.name) + "</option>";
      }).join("") + '</select></div><div class="knowledge-preview-toolbar__result"><h2>全部切片（' + number(chunks.length) + '）</h2>' + dom.button("新增切片", { variant: "primary", icon: "plus", size: "small", attrs: 'data-chunk-add="' + esc(item.id) + '" data-kb-id="' + esc(kb.id) + '"' }) + "</div></div>";
      body = preview.split({
        className: "knowledge-chunk-preview",
        toolbar: toolbar,
        sourceHeader: false,
        source: renderDocumentSource(state, item),
        resultHeader: false,
        result: renderChunkCards(state, item)
      });
    }
    return '<section class="panel knowledge-assets knowledge-chunk-comparison">' + renderKnowledgeContentTabs("chunks") + '<div id="knowledge-chunks-panel" class="knowledge-assets__panel" role="tabpanel">' + body + "</div></section>";
  }

  function renderCreationSteps(activeStep, isLocalDocumentFlow) {
    var steps = [
      ["database", "定义知识库", "设置基础信息"],
      ["file-up", "导入文件", "添加知识文件"],
      ["scan-text", "文档解析", "提取文档内容"],
      ["blocks", "文档处理", "配置本次切片参数"]
    ];
    if (isLocalDocumentFlow) steps = [
      ["file-up", "上传", "选择原文件"],
      ["scan-text", "解析", "提取文档内容"]
    ];
    return '<ol class="creation-steps' + (isLocalDocumentFlow ? " creation-steps--documents" : "") + '" aria-label="' + (isLocalDocumentFlow ? "上传文档进度" : "新建知识库进度") + '">' + steps.map(function map(step, index) {
      var stepNumber = index + 1;
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

  function renderKnowledgeCreate(state) {
    var vectorModels = readyVectorModels(state);
    var hasVectorModel = Boolean(vectorModels.length);
    var modelEmptyNotice = hasVectorModel ? "" : '<div class="notice notice--danger"><div class="notice__content"><div class="notice__title">暂无可用向量模型</div>请先在模型管理中新增模型或完成连通性测试。' + dom.button("前往模型管理", { variant: "secondary", attrs: 'data-open-config="models"' }) + "</div></div>";
    return dom.pageHeader({
      title: "新建知识库",
      back: { label: "返回知识库列表", route: "knowledge" }
    }) + '<div class="page-content creation-page">' +
      '<div class="creation-page__top">' + renderCreationSteps(1) + "</div>" +
      '<section class="panel creation-panel"><div class="panel__body creation-panel__body"><form class="creation-panel__form" data-create-kb-form><div class="creation-panel__scroll"><div class="creation-form-layout"><div class="creation-form-column">' +
      '<div class="form-field">' + dom.requiredLabel("知识库名称", { forId: "kb-name" }) + '<input id="kb-name" class="field" maxlength="40" autocomplete="off" placeholder="请输入知识库名称" required aria-required="true" /></div>' +
      '<div class="form-field">' + dom.requiredLabel("描述", { forId: "kb-purpose" }) + '<textarea id="kb-purpose" class="textarea-field creation-description" maxlength="120" placeholder="说明知识库收录的内容及用途" required aria-required="true"></textarea></div>' +
      modelEmptyNotice + '<div class="creation-model-row"><div class="form-field">' + dom.requiredLabel("向量模型", { forId: "kb-vector" }) + '<select id="kb-vector" class="select-field" required aria-required="true"' + (hasVectorModel ? "" : " disabled") + '>' + vectorModelOptions(state) + '</select></div>' +
      '<div class="form-field creation-model-dimension" data-vector-dimension-field hidden><label class="form-label" for="kb-vector-dimension">向量维度</label><div id="kb-vector-dimension" class="field field--static" data-vector-dimension></div></div></div>' +
      '<div class="form-help creation-model-help">用于将文档内容转换为向量，支持语义检索。</div></div></div></div>' +
      '<div class="creation-actions">' + dom.button("取消", { variant: "secondary", attrs: "data-create-cancel" }) + dom.button("仅创建", { variant: "secondary", attrs: "data-create-only", disabled: true }) + dom.button("创建并导入", { variant: "primary", icon: "arrow-right", attrs: "data-create-and-import", disabled: true }) +
      "</div></form></div></section></div>";
  }

  function uploadFolderId(state, requestedId) {
    var folders = state.documentFolders || [];
    var fallback = folders.some(function hasUncategorized(folder) { return folder.id === "FOLDER-UNCATEGORIZED"; }) ? "FOLDER-UNCATEGORIZED" : folders[0] && folders[0].id || "all";
    return folders.some(function hasFolder(folder) { return folder.id === requestedId; }) ? requestedId : fallback;
  }

  function renderUploadFolderPicker(state, selectedId, collapsedIds) {
    var folders = (state.documentFolders || []).slice();
    var targetId = uploadFolderId(state, selectedId);
    return directoryTree.folderPicker({
      folders: folders,
      items: state.fileAssets || [],
      selectedId: targetId,
      collapsedIds: collapsedIds || [],
      scope: "local-upload-target",
      rootId: "all",
      rootLabel: "全部文档",
      rootIcon: "files",
      label: "",
      ariaLabel: "选择上传文件的存放目录",
      pathAttrs: "data-upload-folder-path",
      treeAttrs: "data-upload-folder-tree"
    });
  }

  function renderKnowledgeUpload(state, kb, isOnboarding, isExistingImport, route) {
    var headerOptions = {
      title: kb.isLocalDocumentFlow ? "上传文档" : (isExistingImport ? "导入文件" : "新建知识库"),
      back: { label: kb.isLocalDocumentFlow ? "返回文档管理" : "返回知识库", route: importReturnRoute(kb.id, kb.importBatchId) }
    };
    var tabs = kb.isLocalDocumentFlow ? "" : '<div class="import-source-toolbar"><div class="import-source-tabs" role="tablist" aria-label="选择资料来源">' +
      '<button type="button" class="tab" role="tab" aria-selected="false" data-import-source-tab="upload"><span>上传文件</span><span class="import-source-tab-count" data-import-source-count="upload" hidden>0</span></button>' +
      '<button type="button" class="tab is-active" role="tab" aria-selected="true" data-import-source-tab="assets"><span>文档管理</span><span class="import-source-tab-count" data-import-source-count="assets" hidden>0</span></button>' +
      '<button type="button" class="tab" role="tab" aria-selected="false" data-import-source-tab="enterprise"><span>企业数据</span><span class="import-source-tab-count" data-import-source-count="enterprise" hidden>0</span></button>' +
      '</div><div class="import-source-toolbar__actions"><div class="search-box import-resource-list__search" data-import-resource-search-wrap>' + dom.icon("search", 15) + '<input class="field field--search" type="search" placeholder="搜索文档" aria-label="搜索文档" data-import-resource-search></div></div></div>';
    var existing = kb.isLocalDocumentFlow ? "" : '<section class="import-source-pane import-resource-pane" data-import-resource-pane><div class="document-directory-browser import-directory-browser" data-import-source-browser><aside class="document-directory-sidebar" aria-label="文档管理文件目录" data-import-local-directory><div data-import-local-directory-list></div></aside><aside class="document-directory-sidebar" aria-label="企业数据文件目录" data-import-enterprise-directory hidden><div data-import-enterprise-directory-list></div></aside><div class="document-directory-content import-resource-list"><div class="document-directory-context" data-import-directory-path></div><div class="table-wrap"><table class="data-table import-resource-table"><colgroup><col class="import-resource-table__col-check"><col class="import-resource-table__col-name"><col class="import-resource-table__col-size"><col class="import-resource-table__col-status"><col class="import-resource-table__col-updated"><col class="import-resource-table__col-action"></colgroup><thead><tr><th class="import-resource-table__check"><span class="sr-only">选择</span></th><th>名称</th><th>大小</th><th>状态</th><th>更新时间</th><th class="import-resource-table__action-heading"><span class="sr-only">预览</span></th></tr></thead><tbody data-import-resource-rows></tbody></table></div></div></div></section>';
    var fileDrop = '<label class="file-drop" for="kb-upload-files" data-upload-drop>' + dom.icon("file-up", 30) + '<strong>点击选择文件，或将文件拖入此处</strong><span>支持 PDF、图片、Word、PPT、Excel 和 TXT，可多选</span><span class="btn btn--secondary file-drop__choose">选择文件</span><input id="kb-upload-files" class="sr-only" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" data-upload-files /></label>';
    var initialFolderId = uploadFolderId(state, route && route.query && route.query.folder || "FOLDER-UNCATEGORIZED");
    var uploadBody = '<div class="local-upload-stack"><div class="upload-folder-picker-inline"><div class="form-field"><label class="form-label">目标位置</label></div><details class="upload-folder-picker upload-folder-picker--standalone" data-upload-folder-picker>' + renderUploadFolderPicker(state, initialFolderId, []) + "</details></div>" + fileDrop + "</div>";
    var upload = '<section class="import-source-pane" data-import-source-pane="upload"' + (kb.isLocalDocumentFlow ? "" : " hidden") + ">" + uploadBody + '<div class="upload-file-list" data-upload-file-list hidden></div></section>';
    var steps = kb.isLocalDocumentFlow ? renderCreationSteps(1, true) : renderCreationSteps(2, false);
    return dom.pageHeader(headerOptions) + '<div class="page-content creation-page"><div class="creation-page__top">' + steps + '</div><section class="panel creation-panel"><div class="panel__body creation-panel__body">' + tabs + '<div class="creation-source-workspace">' + existing + upload + '</div>' +
      '<div class="creation-actions">' + dom.button("取消", { variant: "secondary", attrs: 'data-upload-cancel="' + esc(kb.id) + '"' }) + dom.button("下一步（0）", { variant: "primary", icon: "arrow-right", disabled: true, attrs: 'data-upload-start="' + esc(kb.id) + '" data-onboarding="true" data-existing-import="' + (isExistingImport ? "true" : "false") + '"' }) + '</div></div></section></div>';
  }

  function importStatusLabel(status) {
    return {
      pending_configuration: "等待解析", parsing: "正在解析", parsed: "解析已完成", waiting_parse: "等待解析完成", chunking: "正在生成切片", preview_ready: "切片预览已就绪",
      embedding: "正在向量化", indexing: "正在更新索引", completed: "处理已完成", failed: "处理失败", cancelled: "已取消", awaiting_replacement_confirmation: "等待确认文件更新"
    }[status] || "等待处理";
  }

  function renderImportProgress(batchId) {
    var batch = importBatch(OpsDemo.core.store.getState(), batchId);
    return '<div class="import-processing-status" data-import-processing-status role="status" aria-live="polite"><span>' + dom.icon(batch && batch.status === "failed" ? "circle-alert" : "scan-text", 17) + '<span data-import-status-label>' + esc(importStatusLabel(batch && batch.status)) + '</span></span><div>' + dom.button("重试", { variant: "secondary", size: "small", attrs: 'data-import-retry' + (batch && batch.status === "failed" ? "" : " hidden") }) + '</div></div>';
  }

  function processingPayload(draft) {
    var parameters = {};
    ["mode", "maxChars", "overlapPercent", "semanticSensitivity", "separatorType", "pagesPerChunk", "longDocumentFallback", "mergeShortChunks", "includeContext", "parentChildEnabled", "documentName", "headingPath", "pageNumber", "tableText", "formulaText", "imageText"].forEach(function copy(key) { parameters[key] = draft[key]; });
    if (draft.mode === "recursive") {
      parameters.mode = "separator";
      parameters.separatorType = draft.separatorType || "paragraph";
    }
    return { ingestionProfileId: draft.profileId, processingParameters: parameters };
  }

  function renderVersionSource(version) {
    if (!version) return dom.empty("暂无原文件", "选择资料后可查看原文件。", "file-text");
    var source = version.sourceFile;
    var sourceUrl = version.sourceUrl || "";
    var mime = version.mimeType || source && source.type || "";
    if (source && /^(application\/pdf|image\/)/.test(mime)) {
      var url = URL.createObjectURL(source);
      sourcePreviewUrls.push(url);
      if (mime === "application/pdf") return '<iframe class="import-preview-pdf" src="' + esc(url) + '" title="' + esc(version.name) + '原文件预览"></iframe>';
      return '<div class="import-preview-image"><img src="' + esc(url) + '" alt="' + esc(version.name) + '"></div>';
    }
    if (sourceUrl && /^(application\/pdf|image\/)/.test(mime)) {
      if (mime === "application/pdf") return '<iframe class="import-preview-pdf" src="' + esc(sourceUrl) + '" title="' + esc(version.name) + '原文件预览"></iframe>';
      return '<div class="import-preview-image"><img src="' + esc(sourceUrl) + '" alt="' + esc(version.name) + '"></div>';
    }
    if (!version.sourcePreview) return dom.empty("原文件已保存", source || sourceUrl ? "此格式暂不支持在线预览，可下载原文件查看。" : "此预置资料没有原始二进制文件，可查看已生成的切片。", "file-text");
    return '<article class="document-source-preview"><div class="document-source-preview__page"><div class="document-source-preview__file">' + dom.icon("file-text", 17) + '<span>' + esc(version.name) + '</span></div><div class="document-source-preview__content">' + esc(version.sourcePreview) + '</div></div></article>';
  }

  function openImportChoicePreview(trigger, title, size, body) {
    overlay.open({
      kind: "dialog",
      wide: true,
      panelClass: "import-choice-preview-dialog",
      title: title,
      headerActions: '<span class="import-choice-preview-dialog__size" aria-label="文件大小">' + esc(size) + '</span>',
      footer: false,
      body: body,
      onCancel: function restorePreviewTrigger() {
        window.setTimeout(function restoreFocus() {
          if (trigger && trigger.isConnected) trigger.focus();
        }, 0);
        return true;
      }
    });
  }

  function importChoicePreviewButton(attrs) {
    return '<button type="button" class="table-action import-resource-preview-action" ' + attrs + ' aria-label="预览" title="预览">' + dom.icon("eye", 15) + '<span class="sr-only">预览</span></button>';
  }

  function renderImportResult(view) {
    if (!view || !view.version) return dom.empty("暂无处理结果", "添加资料后，处理结果会显示在这里。", "files");
    var result = view.chunkSet;
    var status = result && result.status;
    var failure = status === "failed" || (!result && view.status === "failed");
    if (failure) return dom.empty("处理失败", view.error && (view.error.message || view.error) || "请检查资料后重试。", "circle-alert");
    if (result && status === "ready") return renderChunkCards(OpsDemo.core.store.getState(), { id: result.id, chunks: view.chunks || [] });
    var title = "正在生成切片";
    var description = "完成后将在此展示结果，可以继续设置处理参数。";
    if (!view.parseResult || view.parseResult.status !== "ready") { title = "等待文档处理"; description = "系统处理完成后将在这里显示切片。"; }
    if (status === "cancelled" || view.status === "cancelled") { title = "处理已取消"; description = "已保存的原文件仍可查看。"; }
    return dom.empty(title, description, status === "running" || status === "queued" ? "loader-circle" : "blocks");
  }

  function renderImportPreviewContent(view) {
    return '<div class="import-preview-columns"><section><h3>原文件</h3><div class="import-preview-scroll">' + renderVersionSource(view && view.version) + '</div></section><section><h3>切片</h3><div class="import-preview-scroll">' + renderImportResult(view) + '</div></section></div>';
  }

  function optionToggle(id, label, description, checked, disabled, badge) {
    return '<label class="parse-toggle' + (disabled ? " is-disabled" : "") + '" for="' + esc(id) + '"><span><span class="parse-toggle__title"><strong>' + esc(label) + '</strong>' + (badge ? '<span class="tag">' + esc(badge) + '</span>' : "") + '</span><small>' + esc(description) + '</small></span><input id="' + esc(id) + '" type="checkbox"' + (checked ? " checked" : "") + (disabled ? " disabled" : "") + " /></label>";
  }

  function requiredParseOutput(id, label, description) {
    return '<div class="parse-toggle is-required"><span><span class="parse-toggle__title"><strong>' + esc(label) + '</strong><span class="tag">必选</span></span><small>' + esc(description) + '</small></span><input id="' + esc(id) + '" type="checkbox" checked disabled aria-label="' + esc(label) + '（必选）" /></div>';
  }

  function visualUnderstandingEnabled(config) {
    var source = config || {};
    return source.imageAnalysisEnabled === true || source.imageUnderstandingEnabled === true || source.chartUnderstandingEnabled === true;
  }

  function processingParseAvailability(parseConfig) {
    var config = parseConfig || {};
    return {
      tableText: config.tableEnabled !== false,
      formulaText: config.formulaEnabled !== false,
      imageText: visualUnderstandingEnabled(config)
    };
  }

  function syncProcessingDraftParseAvailability(draft, parseConfig) {
    if (!draft) return draft;
    var availability = processingParseAvailability(parseConfig);
    draft.parseAvailability = availability;
    if (!availability.tableText) draft.tableText = false;
    if (!availability.formulaText) draft.formulaText = false;
    if (!availability.imageText) draft.imageText = false;
    return draft;
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
    var currentBatch = importBatch(state, kb.importBatchId);
    var isReprocess = Boolean(currentBatch && (currentBatch.reprocess === true || (currentBatch.items || []).some(function reprocessed(item) { return item.operation === "reprocess"; })));
    var parseBackAction = isReprocess ? "" : dom.button("上一步", { variant: "secondary", icon: "arrow-left", attrs: 'data-parse-back="' + esc(kb.id) + '"' });
    return dom.pageHeader({
      title: kb.isLocalDocumentFlow ? "上传文档" : (isExistingImport ? "导入文件" : "新建知识库"),
      back: { label: kb.isLocalDocumentFlow ? "返回文档管理" : "返回知识库", route: importReturnRoute(kb.id, kb.importBatchId) }
    }) + '<div class="page-content creation-page"><div class="creation-page__top">' + renderCreationSteps(kb.isLocalDocumentFlow ? 2 : 3, kb.isLocalDocumentFlow) + '</div><section class="panel creation-panel"><div class="panel__body creation-panel__body"><div class="creation-panel__scroll">' +
      parseConfigFields(kb) + '</div><div class="creation-actions">' + dom.button("取消", { variant: "secondary", attrs: 'data-onboarding-cancel="' + esc(kb.id) + '"' }) + parseBackAction + dom.button(kb.isLocalDocumentFlow ? "开始解析" : "下一步", { variant: "primary", icon: kb.isLocalDocumentFlow ? "scan-text" : "arrow-right", attrs: 'data-parse-next="' + esc(kb.id) + '"' }) + '</div></div></section></div>';
  }

  function renderKnowledgeParseSettings(state, kb) {
    return dom.pageHeader({
      title: "文档解析策略",
      back: { label: "返回知识库", route: "knowledge/" + kb.id + "?tab=documents" }
    }) + '<div class="page-content creation-page"><section class="panel creation-panel"><div class="panel__body creation-panel__body"><div class="creation-panel__scroll">' + parseConfigFields(kb) +
      '<div class="notice notice--info"><div class="notice__content">仅影响新导入文件，不会重新处理已有文件。</div></div></div>' +
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
    if (mode === "recursive") return "separator";
    if (["structure", "separator", "fixed", "page", "whole_document"].indexOf(mode) >= 0) return mode;
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
    var fixedProfile = profileForMode("fixed") || findIngestionProfile(state, "ING-FIXED");
    var selectedFamily = processingFamilyForDraft(draft);
    var selectedMethod = processingCustomMethodForDraft(draft);
    var methodDefinitions = [
      { value: "structure", title: "结构切片", summary: "依据解析得到的标题、段落、列表和表格等结构切分；超长内容块仍按长度上限拆分。", profile: structureProfile },
      { value: "separator", title: "分隔符切片", summary: "优先按选定的常用边界切分；超长片段由系统继续递归拆分。", profile: separatorProfile },
      { value: "fixed", title: "固定长度", summary: "按设定的字符数切分，适合结构较弱、内容连续的文本。", profile: fixedProfile },
      { value: "page", title: "按页切片", summary: "按原文连续页分组，适合需要保留页面整体内容的 PDF 或演示文稿。", profile: profileForMode("page") },
      { value: "whole_document", title: "整篇切片", summary: "将短文档整体保留为一个切片；超长时按所选方式处理。", profile: profileForMode("whole_document") }
    ].filter(function filterMethod(method) { return !!method.profile; });
    if (!methodDefinitions.some(function some(method) { return method.value === selectedMethod; })) selectedMethod = methodDefinitions.length ? methodDefinitions[0].value : "";

    function renderProfileCard(options) {
      var profile = options.profile;
      var profileAttribute = profile ? ' data-processing-profile-id="' + esc(profile.id) + '"' : "";
      return '<label class="processing-profile-card' + (options.method ? " processing-profile-card--method" : "") + '"><input type="radio" name="' + esc(options.group) + '" value="' + esc(options.value) + '" ' + (options.method ? 'data-processing-method="' + esc(options.value) + '"' : 'data-processing-family="' + esc(options.value) + '"') + profileAttribute + ' required aria-required="true"' + (options.checked ? " checked" : "") + '><span class="processing-profile-card__content"><span class="processing-profile-card__header"><span class="processing-profile-card__title"><strong>' + esc(options.title) + '</strong>' + (options.recommended ? '<span class="tag">推荐</span>' : "") + '</span></span><span class="processing-profile-card__summary">' + esc(options.summary) + '</span></span></label>';
    }
    var familyDefinitions = [
      smartProfile && { value: "smart", title: "自动切片", summary: "依次按解析结构、逐级边界与长度上限生成切片，不调用语义模型。", profile: smartProfile, recommended: true },
      semanticProfile && { value: "semantic", title: "语义切片", summary: "比较相邻句段的语义变化，在主题切换处生成边界；效果需用真实问题集验证，入库会增加句段 Embedding 消耗。", profile: semanticProfile },
      methodDefinitions.length && { value: "custom", title: "自定义切片", summary: "明确选择结构、分隔符、固定长度、按页或整篇处理，适合已知文档形态。", profile: null }
    ].filter(Boolean);
    var familyCards = familyDefinitions.map(function mapFamily(family) {
      return renderProfileCard({
        group: "processing-family",
        value: family.value,
        title: family.title,
        summary: family.summary,
        profile: family.profile,
        checked: selectedFamily === family.value,
        recommended: family.recommended
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

  function normalizedContextPolicy(mode, parentChildEnabled) {
    if (mode === "whole_document") return "none";
    return parentChildEnabled ? "enhanced" : "standard";
  }

  function processingDraftSourceKey(profile) {
    if (!profile) return "";
    return JSON.stringify({
      profileId: profile.sourceProfileId || profile.id || "",
      snapshotAt: profile.snapshotAt || "",
      chunking: profile.chunking || {},
      indexContent: profile.indexContent || {}
    });
  }

  function createProcessingDraft(knowledgeBaseId, profile, batchId, parseConfig) {
    var chunking = profile.chunking || {};
    var indexContent = profile.indexContent || {};
    var sourceMode = chunking.mode || "smart";
    var mode = sourceMode === "recursive" ? "separator" : sourceMode;
    var parentChildEnabled = mode !== "whole_document" && chunking.parentChildEnabled === true;
    var contextPolicy = normalizedContextPolicy(mode, parentChildEnabled);
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
      includeContext: mode !== "whole_document",
      parentChildEnabled: parentChildEnabled,
      contextPolicy: contextPolicy,
      documentName: true,
      headingPath: true,
      pageNumber: true,
      tableText: indexContent.tableText !== false,
      formulaText: indexContent.formulaText !== false,
      imageText: indexContent.imageText === true
    };
    syncProcessingDraftParseAvailability(draft, parseConfig);
    Object.defineProperties(draft, {
      sourceKey: { value: processingDraftSourceKey(profile), writable: true, enumerable: false, configurable: true },
      dirty: { value: false, writable: true, enumerable: false, configurable: true }
    });
    onboardingProcessingDrafts[processingDraftKey(knowledgeBaseId, batchId)] = draft;
    return draft;
  }

  function renderProcessingAdvancedSettings(draft) {
    var availability = draft.parseAvailability || processingParseAvailability();
    function advancedIndexToggle(key, title, description) {
      var available = availability[key] !== false;
      var checked = available && draft[key] === true;
      return '<label class="processing-advanced-toggle' + (available ? "" : " is-disabled") + '"><input type="checkbox" data-processing-param="' + esc(key) + '"' + (checked ? " checked" : "") + (available ? "" : " disabled") + '><span><strong>' + esc(title) + '</strong><small>' + esc(description) + '</small></span></label>';
    }
    return '<fieldset class="processing-advanced-settings"><legend>高级配置</legend><div class="processing-advanced-grid">' +
      advancedIndexToggle("tableText", "表格解析内容进入索引", "将表格中的金额、指标、表头和单位用于检索与回答证据召回。") +
      advancedIndexToggle("formulaText", "公式解析内容进入索引", "将公式符号、LaTeX 表达和公式位置用于专业术语、参数和推导检索。") +
      advancedIndexToggle("imageText", "图片 / 图表内容理解进入索引", "将图像、图表、图中文字和结构化描述用于跨模态内容召回。") +
      "</div></fieldset>";
  }

  function renderProcessingParameters(draft) {
    if (!draft) return "";
    var mode = draft.mode || "smart";
    var sizeFields = '<div class="form-field">' + dom.requiredLabel("切片最大字符", { forId: "processing-max-chars" }) + '<div class="field-with-suffix"><input id="processing-max-chars" class="field" type="number" min="200" max="10000" step="1" value="' + esc(draft.maxChars) + '" data-processing-param="maxChars" required aria-required="true" aria-describedby="processing-max-help"><span>字符</span></div><div id="processing-max-help" class="form-help">每片的长度上限，不要求每片等长；200–10000 个字符。</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("切片重叠率", { forId: "processing-overlap" }) + '<div class="field-with-suffix"><input id="processing-overlap" class="field" type="number" min="0" max="50" step="1" value="' + esc(draft.overlapPercent) + '" data-processing-param="overlapPercent" required aria-required="true" aria-describedby="processing-overlap-help"><span>%</span></div><div id="processing-overlap-help" class="form-help">按最大字符数计算重复正文的目标量；0 表示不重叠。</div></div>';
    var fixedSizeFields = '<div class="form-field">' + dom.requiredLabel("每片字符数", { forId: "processing-max-chars" }) + '<div class="field-with-suffix"><input id="processing-max-chars" class="field" type="number" min="200" max="10000" step="1" value="' + esc(draft.maxChars) + '" data-processing-param="maxChars" required aria-required="true" aria-describedby="processing-fixed-max-help"><span>字符</span></div><div id="processing-fixed-max-help" class="form-help">按该字符数切分；最后一片可以不足设定长度。</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("切片重叠率", { forId: "processing-overlap" }) + '<div class="field-with-suffix"><input id="processing-overlap" class="field" type="number" min="0" max="50" step="1" value="' + esc(draft.overlapPercent) + '" data-processing-param="overlapPercent" required aria-required="true" aria-describedby="processing-fixed-overlap-help"><span>%</span></div><div id="processing-fixed-overlap-help" class="form-help">相邻切片重复保留的字符比例；0 表示不重叠。</div></div>';
    var strategyFields = "";
    if (mode === "smart") strategyFields = sizeFields;
    if (mode === "semantic") strategyFields = '<div class="form-field">' + dom.requiredLabel("切片最大字符", { forId: "processing-max-chars" }) + '<div class="field-with-suffix"><input id="processing-max-chars" class="field" type="number" min="200" max="10000" step="1" value="' + esc(draft.maxChars) + '" data-processing-param="maxChars" required aria-required="true" aria-describedby="processing-semantic-max-help"><span>字符</span></div><div id="processing-semantic-max-help" class="form-help">仅作为安全上限；超过上限时仍优先在完整句段边界处拆分。</div></div>' +
      '<div class="form-field">' + dom.requiredLabel("语义切分敏感度", { forId: "processing-semantic-sensitivity" }) + '<select id="processing-semantic-sensitivity" class="select-field" data-processing-param="semanticSensitivity" required aria-required="true" aria-describedby="processing-semantic-sensitivity-help"><option value="low"' + (draft.semanticSensitivity === "low" ? " selected" : "") + '>低</option><option value="balanced"' + (draft.semanticSensitivity === "balanced" ? " selected" : "") + '>均衡</option><option value="high"' + (draft.semanticSensitivity === "high" ? " selected" : "") + '>高</option></select><div id="processing-semantic-sensitivity-help" class="form-help">低：较少切分；均衡：推荐；高：较多切分。敏感度越高，越容易在较小的主题变化处切分。</div></div>';
    if (mode === "structure") strategyFields = sizeFields;
    if (mode === "recursive" || mode === "separator") {
      var separatorHelp = "优先按所选边界切分；片段超长时，系统自动按更细边界递归拆分，最后按字符上限兜底。";
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
      var separatorPicker = '<div class="form-field form-field--full processing-separator-field" data-processing-separator-picker>' + dom.requiredLabel("优先切分边界", { tag: "div", attrs: 'id="processing-separator-label"' }) + '<div class="processing-separator-control"><select id="processing-separator-type" hidden data-processing-param="separatorType" data-processing-separator-source>' + separatorSourceOptions + '</select><button type="button" class="processing-separator-trigger" role="combobox" aria-required="true" aria-haspopup="listbox" aria-expanded="false" aria-controls="processing-separator-listbox" aria-labelledby="processing-separator-label processing-separator-value" aria-describedby="processing-separator-help" data-processing-separator-trigger><span id="processing-separator-value" data-processing-separator-value>' + separatorChoiceMarkup(selectedSeparator) + '</span>' + dom.icon("chevron-down", 15) + '</button><div id="processing-separator-listbox" class="processing-separator-listbox" role="listbox" aria-labelledby="processing-separator-label" data-processing-separator-listbox hidden>' + separatorListOptions + '</div></div><div id="processing-separator-help" class="form-help">' + esc(separatorHelp) + '</div></div>';
      strategyFields = sizeFields + separatorPicker;
    }
    if (mode === "fixed") strategyFields = fixedSizeFields;
    if (mode === "page") strategyFields = '<div class="form-field form-field--full">' + dom.requiredLabel("每个切片页数", { forId: "processing-pages" }) + '<div class="field-with-suffix"><input id="processing-pages" class="field" type="number" min="1" max="10" step="1" value="' + esc(draft.pagesPerChunk) + '" data-processing-param="pagesPerChunk" required aria-required="true" aria-describedby="processing-pages-help"><span>页</span></div><div id="processing-pages-help" class="form-help">需解析结果包含原文分页信息；每片包含指定数量的连续页，尾片可不足该页数。页数不能替代模型输入长度校验。</div></div>';
    if (mode === "whole_document") strategyFields = '<div class="form-field form-field--full">' + dom.requiredLabel("超长文档处理", { forId: "processing-long-document" }) + '<select id="processing-long-document" class="select-field" data-processing-param="longDocumentFallback" required aria-required="true" aria-describedby="processing-whole-help"><option value="smart"' + (draft.longDocumentFallback === "smart" ? " selected" : "") + '>改用自动切片</option><option value="stop"' + (draft.longDocumentFallback === "stop" ? " selected" : "") + '>停止处理并提示</option></select><div id="processing-whole-help" class="form-help">Demo 预置整篇上限为 ' + number(draft.maxDocumentChars) + ' 字符；超长处理选项目前仅保存配置。正式接入时还需按向量模型的 Token 上限校验。</div></div>';
    var parentChildAvailable = mode !== "whole_document";
    var parentChildDescription = "通过上下文增强，在检索命中后补充更完整的内容，降低孤立切片理解偏差。";
    var parentChildDetail = '<div class="processing-parent-child-flow" id="processing-parent-child-help"><p>子块：参与 Embedding、检索和评分，负责定位最相关的细粒度证据。</p><p>父块：命中后补充上下文，并用于同父去重。</p></div>';
    var parentChildOption = '<section class="processing-context-option' + (parentChildAvailable ? "" : " is-disabled") + '" aria-labelledby="processing-parent-child-title"><div class="processing-context-option__main"><div class="processing-context-option__copy"><div class="processing-context-option__title"><strong id="processing-parent-child-title">父子块检索</strong></div><p id="processing-parent-child-summary">' + esc(parentChildDescription) + '</p></div><label class="processing-context-toggle" for="processing-parent-child"><input id="processing-parent-child" class="sr-only" type="checkbox" data-processing-param="parentChildEnabled" aria-describedby="processing-parent-child-summary processing-parent-child-help"' + (draft.parentChildEnabled && parentChildAvailable ? " checked" : "") + (parentChildAvailable ? "" : " disabled") + '><span class="switch" aria-hidden="true"></span><span class="sr-only">启用父子块检索</span></label></div>' + parentChildDetail + '</section>';
    return '<section class="processing-parameters">' +
      '<div class="processing-parameter-grid' + (mode === "semantic" ? " processing-parameter-grid--semantic" : "") + '">' + strategyFields + '</div>' +
      parentChildOption +
      renderProcessingAdvancedSettings(draft) +
      "</section>";
  }

  function renderKnowledgeProcessing(state, kb, isExistingImport) {
    var profiles = availableProcessingProfiles(state);
    var existingDraft = onboardingProcessingDrafts[processingDraftKey(kb.id, kb.importBatchId)];
    var savedProfile = kb.processingProfileSnapshot;
    var savedProfileId = savedProfile && (savedProfile.sourceProfileId || savedProfile.id);
    var savedProfileChanged = Boolean(existingDraft && existingDraft.dirty !== true && savedProfile && existingDraft.sourceKey !== processingDraftSourceKey(savedProfile));
    var preferredProfileId = savedProfileChanged ? savedProfileId : existingDraft && existingDraft.profileId || kb.currentIngestionProfileId;
    var selectedProfile = findIngestionProfile(state, preferredProfileId);
    if (!selectedProfile || !selectedProfile.chunking || selectedProfile.enabled === false) selectedProfile = profiles[0] || null;
    var draftProfile = savedProfile && selectedProfile && (savedProfile.sourceProfileId || savedProfile.id) === selectedProfile.id ? savedProfile : selectedProfile;
    var sourceChanged = Boolean(existingDraft && existingDraft.dirty !== true && existingDraft.sourceKey !== processingDraftSourceKey(draftProfile));
    var processingDraft = selectedProfile && (!existingDraft || existingDraft.profileId !== selectedProfile.id || sourceChanged) ? createProcessingDraft(kb.id, draftProfile, kb.importBatchId, kb.mineruParseConfig) : existingDraft;
    syncProcessingDraftParseAvailability(processingDraft, kb.mineruParseConfig);
    return dom.pageHeader({
      title: kb.isLocalDocumentFlow ? "上传文档" : (isExistingImport ? "导入文件" : "新建知识库"),
      back: { label: kb.isLocalDocumentFlow ? "返回文档管理" : "返回知识库", route: importReturnRoute(kb.id, kb.importBatchId) }
    }) + '<div class="page-content creation-page"><div class="creation-page__top">' + renderCreationSteps(4, kb.isLocalDocumentFlow) + '</div><section class="panel creation-panel"><div class="panel__body creation-panel__body"><div class="creation-panel__scroll">' +
      '<div class="processing-section-label">' + dom.requiredLabel("切片策略", { tag: "div" }) + '<p>先选择切片类型；如需精确控制，再在自定义切片中选择具体方法。</p></div><div class="processing-profile-picker">' + processingProfileCards(state, kb, processingDraft) + '</div>' +
      '<div data-processing-draft>' + renderProcessingParameters(processingDraft) + '</div>' +
      '<div class="vector-cost-notice">' + dom.icon("circle-alert", 15) + '<span>完成后将为本次导入内容生成向量并写入索引，产生 Embedding Token 消耗。</span></div></div>' +
      '<div class="creation-actions">' + dom.button("取消", { variant: "secondary", attrs: 'data-onboarding-cancel="' + esc(kb.id) + '"' }) + dom.button("上一步", { variant: "secondary", icon: "arrow-left", attrs: 'data-processing-back="' + esc(kb.id) + '"' }) + dom.button("确认处理", { variant: "primary", icon: "check", disabled: !processingDraft, attrs: 'data-processing-finish="' + esc(kb.id) + '" data-existing-import="' + (isExistingImport ? "true" : "false") + '"' }) + '</div></div></section></div>';
  }
  function renderChunkCards(state, item, options) {
    var chunks = documentChunks(state, item);
    if (!chunks.length) {
      var lifecycle = documentLifecycle(item);
      var title = lifecycle.key === "failed" ? "处理失败" : lifecycle.key === "parsing" ? "正在解析" : lifecycle.key === "chunking" ? "正在生成切片" : "暂无切片";
      return dom.empty(title, lifecycle.key === "failed" ? "请检查资料并重新处理。" : "结果就绪后将在此显示，原文件可独立预览。", lifecycle.key === "failed" ? "circle-alert" : "blocks");
    }
    var knowledgeBase = item.knowledgeBaseId && findKnowledgeBase(state, item.knowledgeBaseId);
    var editable = Boolean(knowledgeBase);
    return preview.chunkCards(chunks, {
      itemId: item.id,
      grid: Boolean(options && options.grid),
      remove: editable ? function removeAction(chunk) {
        return {
          label: "删除切片 " + (chunk.id || ""),
          attrs: 'data-chunk-delete="' + esc(chunk.id) + '" data-document-id="' + esc(item.id) + '" data-kb-id="' + esc(knowledgeBase.id) + '"'
        };
      } : null,
      edit: editable ? function editAction(chunk) {
        return {
          label: "编辑切片 " + (chunk.id || ""),
          attrs: 'data-chunk-edit="' + esc(chunk.id) + '" data-document-id="' + esc(item.id) + '" data-kb-id="' + esc(knowledgeBase.id) + '"'
        };
      } : null
    });
  }

  function renderDocumentSource(state, item) {
    var detail = actions.getFileAssetDetail && actions.getFileAssetDetail(item.fileId || item.localAssetId, { fileVersionId: item.fileVersionId, knowledgeBaseId: item.knowledgeBaseId });
    return renderVersionSource(detail && detail.version || item);
  }

  function renderKnowledgeDetail(state, route, kb) {
    if (String(route.query.settings || "") === "parse") return renderKnowledgeParseSettings(state, kb);
    if (String(route.query.onboarding || "") === "1") {
      var onboardingStep = route.query.step || "upload";
      var isExistingImport = route.query.flow === "import";
      if (onboardingStep === "parse") return renderKnowledgeParse(state, kb, isExistingImport);
      if (onboardingStep === "processing") return renderKnowledgeProcessing(state, kb, isExistingImport);
      return renderKnowledgeUpload(state, kb, true, isExistingImport, route);
    }
    if (String(route.query.upload || "") === "1") return renderKnowledgeUpload(state, kb, true, true, route);
    var previewDocumentId = String(route.query.document || route.query.preview || "");
    var activeContentTab = route.query.tab === "chunks" || Boolean(route.query.preview) ? "chunks" : "documents";
    var content = activeContentTab === "chunks" ? renderChunksTab(state, kb, previewDocumentId) : renderDocumentsTab(state, kb);
    return dom.pageHeader({
      title: kb.name,
      back: { label: "返回知识库列表", route: "knowledge" },
      actions: detailHeaderActions(state, kb)
    }) + '<div class="page-content knowledge-detail-page">' +
      renderKnowledgeInfo(state, kb) + content + "</div>";
  }

  function render(route, state) {
    route = normalizeImportRoute(route);
    if (route.id === "new") return renderKnowledgeCreate(state);
    if (route.id) {
      var kb = findKnowledgeBase(state, route.id, route.query.batch);
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
    if (sharedRoute.query.batch && sharedRoute.query.step === "processing") sharedRoute.query.step = "parse";
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
        overlay.toast(enabled ? "检索已启用" : "检索已关闭", enabled ? "该知识库现在可以接收检索请求。" : "文件和索引均已保留。", "success");
        return true;
      }
    });
  }

  function editKnowledgeBase(kb) {
    if (!kb) return;
    overlay.open({
      title: "编辑知识库",
      confirmLabel: "保存",
      body: '<div class="stack"><div class="form-field">' + dom.requiredLabel("名称", { forId: "edit-kb-name" }) + '<input id="edit-kb-name" class="field" maxlength="40" value="' + esc(kb.name) + '" data-edit-kb-name required aria-required="true"></div><div class="form-field">' + dom.requiredLabel("描述", { forId: "edit-kb-purpose" }) + '<textarea id="edit-kb-purpose" class="textarea-field" maxlength="120" data-edit-kb-purpose required aria-required="true">' + esc(kb.purpose) + '</textarea></div></div>',
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
      body: '<p class="knowledge-delete-copy">删除“' + esc(kb.name) + '”后，该库的文件引用、切片、向量、索引及同步任务将移除；文档管理中的原文件和其他知识库内容继续保留。</p>',
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
      title: "移除文件",
      confirmLabel: "移除",
      confirmVariant: "danger",
      body: '<p class="knowledge-delete-copy">删除“' + esc(item.name) + '”后，仅移除该文件在当前知识库中的引用、切片和索引，原文件及其他知识库的使用结果继续保留。</p>',
      onConfirm: function onConfirm() {
        var deleted = actions.deleteDocument && actions.deleteDocument(item.id);
        if (!deleted) {
          overlay.toast("未能删除", "请稍后重试。", "warning");
          return false;
        }
        overlay.toast("文件已移除", "已移除当前库检索内容，原文件仍保存在文档管理中。", "success");
        return true;
      }
    });
  }

  function openAddChunk(knowledgeBaseId, documentId) {
    overlay.open({
      title: "新增切片",
      confirmLabel: "创建切片",
      wide: true,
      body: '<div class="stack"><div class="form-field">' + dom.requiredLabel("切片内容", { forId: "new-chunk-content" }) + '<textarea id="new-chunk-content" class="textarea-field chunk-content-editor" maxlength="5000" placeholder="输入需要纳入检索的内容" data-chunk-content required aria-required="true"></textarea></div><div class="vector-cost-notice">' + dom.icon("circle-alert", 15) + '<span>保存后将切片追加到当前文档末尾，仅为新增切片生成向量并更新当前知识库索引，产生 Embedding Token 消耗；其他切片仍可检索。</span></div></div>',
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
          router.navigate("knowledge/" + knowledgeBaseId + "?tab=chunks&document=" + encodeURIComponent(documentId));
        }, 0);
        return true;
      }
    });
  }

  function openEditChunk(knowledgeBaseId, documentId, chunkId) {
    var currentState = OpsDemo.core.store.getState();
    var knowledgeBase = findKnowledgeBase(currentState, knowledgeBaseId);
    var documentItem = findDocument(currentState, documentId);
    var chunk = documentItem && documentChunks(currentState, documentItem).find(function match(item) { return item.id === chunkId; });
    if (!knowledgeBase || !documentItem || documentItem.knowledgeBaseId !== knowledgeBase.id || !chunk) return;
    overlay.open({
      title: "编辑切片",
      confirmLabel: "保存切片",
      wide: true,
      body: '<div class="stack"><div class="form-field">' + dom.requiredLabel("切片内容", { forId: "edit-chunk-content" }) + '<textarea id="edit-chunk-content" class="textarea-field chunk-content-editor" maxlength="5000" data-edit-chunk-content required aria-required="true">' + esc(chunk.content || chunk.text || "") + '</textarea></div><div class="vector-cost-notice">' + dom.icon("circle-alert", 15) + '<span>保存后仅重新生成当前切片的向量并更新当前知识库索引；切换完成前继续使用现有检索结果。</span></div></div>',
      onConfirm: function onConfirm(scope) {
        var content = scope.querySelector("[data-edit-chunk-content]").value.trim();
        if (!content) {
          overlay.toast("切片内容为空", "请输入需要纳入检索的内容。", "warning");
          return false;
        }
        var result = actions.updateDocumentChunk && actions.updateDocumentChunk(documentId, chunkId, { content: content });
        if (!result) {
          overlay.toast("切片未保存", "请确认当前知识库可编辑且向量模型连接正常。", "warning");
          return false;
        }
        overlay.toast("切片已更新", "已进入向量化队列，完成后自动替换当前检索结果。", "success");
        return true;
      }
    });
  }

  function confirmDeleteChunk(knowledgeBaseId, documentId, chunkId) {
    var currentState = OpsDemo.core.store.getState();
    var knowledgeBase = findKnowledgeBase(currentState, knowledgeBaseId);
    var documentItem = findDocument(currentState, documentId);
    var chunk = (currentState.chunks || []).find(function match(item) { return item.id === chunkId; });
    if (!knowledgeBase || !documentItem || documentItem.knowledgeBaseId !== knowledgeBase.id || !chunk || chunk.documentId !== documentItem.id) return;
    overlay.confirm({
      title: "删除切片",
      confirmLabel: "确认删除",
      confirmVariant: "danger",
      body: '<p>仅从当前知识库移除此切片及对应检索记录，原文件和其他知识库保持可用。</p>',
      onConfirm: function confirm() {
        var result = actions.deleteDocumentChunk(documentId, chunkId);
        if (!result) {
          overlay.toast("切片未删除", "请检查当前知识库与向量模型状态。", "warning");
          return false;
        }
        overlay.toast("切片删除已提交", "索引更新完成后，当前知识库将停止返回该切片。", "success");
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
    route = normalizeImportRoute(route);
    var createButton = root.querySelector("[data-create-kb]");
    if (createButton) createButton.addEventListener("click", function handle() { router.navigate("knowledge/new"); });

    root.querySelectorAll("[data-create-cancel]").forEach(function bind(button) {
      button.addEventListener("click", function handle() { router.navigate("knowledge"); });
    });
    var vectorSelect = root.querySelector("#kb-vector");
    var nameInput = root.querySelector("#kb-name");
    var purposeInput = root.querySelector("#kb-purpose");
    var createOnly = root.querySelector("[data-create-only]");
    var createAndImport = root.querySelector("[data-create-and-import]");
    function syncCreateAvailability() {
      var complete = Boolean(nameInput && nameInput.value.trim() && purposeInput && purposeInput.value.trim() && vectorSelect && vectorSelect.value);
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
    syncCreateAvailability();
    function createKnowledgeBase(continueToImport) {
      var name = nameInput && nameInput.value.trim();
      var purpose = purposeInput && purposeInput.value.trim();
      if (!name || !purpose || !vectorSelect || !vectorSelect.value) {
        overlay.toast("信息未完整", "请填写名称和描述，并选择向量模型。", "warning");
        return;
      }
      var created = actions.createKnowledgeBase({
        name: name,
        purpose: purpose,
        embeddingModelId: vectorSelect.value
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
    var routeAssetDetail = route.query.fileId && actions.getFileAssetDetail ? actions.getFileAssetDetail(route.query.fileId) : null;
    var initialFileVersionId = route.query.fileVersionId || routeAssetDetail && routeAssetDetail.version && routeAssetDetail.version.id;
    var selectionKey = processingDraftKey(route.id, route.query.batch || route.query.fileId || initialFileVersionId || "new");
    var defaultLocalFolderId = route.id === "local-documents" ? uploadFolderId(state, route.query.folder || "FOLDER-UNCATEGORIZED") : route.query.folder || "all";
    var selection = importSelections[selectionKey] || (route.query.batch ? importSelectionFromBatch(state, importBatch(state, route.query.batch)) : { versionIds: [], sourceObjectIds: [], files: [], source: route.id === "local-documents" ? "upload" : "assets", localFolderId: defaultLocalFolderId, enterpriseDirectoryId: "all", localCollapsedIds: [], enterpriseCollapsedIds: [] });
    if (!selection.localFolderId) selection.localFolderId = defaultLocalFolderId;
    if (route.id === "local-documents") {
      selection.localFolderId = route.query.folder ? uploadFolderId(state, route.query.folder) : uploadFolderId(state, selection.localFolderId);
    }
    if (!selection.enterpriseDirectoryId) selection.enterpriseDirectoryId = "all";
    if (!selection.localCollapsedIds) selection.localCollapsedIds = [];
    if (!selection.enterpriseCollapsedIds) selection.enterpriseCollapsedIds = [];
    if (initialFileVersionId && selection.versionIds.indexOf(initialFileVersionId) < 0) selection.versionIds.push(initialFileVersionId);
    if (uploadStart) importSelections[selectionKey] = selection;
    var selectedFiles = selection.files;
    var isUploading = false;
    var enterpriseObjects = actions.listEnterpriseSourceObjects ? actions.listEnterpriseSourceObjects() : [];
    var hideExistingImports = route.id !== "local-documents" && route.query.reprocess !== "1";

    function localFolders(current) {
      return (current.documentFolders || []).slice();
    }
    function localAssets(current) {
      return (current.fileAssets || []).slice();
    }
    function selectableLocalAssets(current) {
      if (!hideExistingImports) return localAssets(current);
      var existing = existingKnowledgeImportSources(current, route.id);
      return localAssets(current).filter(function available(asset) { return !existing.assetIds.has(asset.id); });
    }
    function selectableEnterpriseObjects(current) {
      if (!hideExistingImports) return enterpriseObjects.slice();
      var existing = existingKnowledgeImportSources(current, route.id);
      return enterpriseObjects.filter(function available(source) { return !existing.sourceObjectIds.has(source.id); });
    }
    function pruneExistingSelections(current) {
      if (!hideExistingImports) return;
      var existing = existingKnowledgeImportSources(current, route.id);
      var versions = (current.fileVersions || []).reduce(function index(result, version) {
        result[version.id] = version;
        return result;
      }, {});
      selection.versionIds = selection.versionIds.filter(function available(versionId) {
        var version = versions[versionId];
        return version && !existing.assetIds.has(version.fileId);
      });
      selection.sourceObjectIds = selection.sourceObjectIds.filter(function available(sourceId) { return !existing.sourceObjectIds.has(sourceId); });
    }
    function enterpriseDirectories(current) {
      return (current.enterpriseConnections || []).reduce(function directories(result, connection, index) {
        var available = connection.status === "available";
        result.push({ id: connection.id, name: connection.name, parentId: null, icon: "database", available: available, sortOrder: index * 10 });
        result.push({ id: "ENT-DIR-" + connection.id, name: connection.businessDomain || connection.databaseName || "默认目录", parentId: connection.id, icon: "folder", available: available, sortOrder: 10 });
        return result;
      }, []);
    }
    function renderLocalDirectories(current) {
      var list = root.querySelector("[data-import-local-directory-list]");
      if (!list) return;
      var folders = localFolders(current);
      if (selection.localFolderId !== "all" && !folders.some(function exists(folder) { return folder.id === selection.localFolderId; })) selection.localFolderId = "all";
      list.innerHTML = directoryTree.render({ folders: folders, items: selectableLocalAssets(current), itemLabel: function itemName(asset) { return asset.name; }, selectedId: selection.localFolderId, collapsedIds: selection.localCollapsedIds, scope: "knowledge-local", rootId: "all", rootLabel: "全部文档", rootIcon: "files", ariaLabel: "文档管理文件目录", showItems: false });
      dom.hydrateIcons(list);
    }
    function renderEnterpriseDirectories(current) {
      var list = root.querySelector("[data-import-enterprise-directory-list]");
      if (!list) return;
      var directories = enterpriseDirectories(current);
      if (selection.enterpriseDirectoryId !== "all" && !directories.some(function exists(directory) { return directory.id === selection.enterpriseDirectoryId; })) {
        selection.enterpriseDirectoryId = "all";
      }
      list.innerHTML = directoryTree.render({ folders: directories, items: selectableEnterpriseObjects(current), itemFolderId: function folderId(item) { return item.directoryId; }, itemLabel: function itemName(item) { return item.fileName || item.name; }, selectedId: selection.enterpriseDirectoryId, collapsedIds: selection.enterpriseCollapsedIds, scope: "knowledge-enterprise", rootId: "all", rootLabel: "全部企业数据", rootIcon: "database", ariaLabel: "企业数据文件目录", showItems: false });
      dom.hydrateIcons(list);
    }
    function renderDirectoryPath(current) {
      var host = root.querySelector("[data-import-directory-path]");
      if (!host) return;
      var enterprise = selection.source === "enterprise";
      host.innerHTML = directoryTree.breadcrumb({
        folders: enterprise ? enterpriseDirectories(current) : localFolders(current),
        selectedId: enterprise ? selection.enterpriseDirectoryId : selection.localFolderId,
        scope: enterprise ? "knowledge-enterprise" : "knowledge-local",
        rootId: "all",
        rootLabel: enterprise ? "全部企业数据" : "全部文档"
      });
      dom.hydrateIcons(host);
    }
    function renderUploadFolderTarget(current) {
      var host = root.querySelector("[data-upload-folder-picker]");
      if (!host) return;
      selection.localFolderId = uploadFolderId(current, selection.localFolderId);
      host.innerHTML = renderUploadFolderPicker(current, selection.localFolderId, selection.localCollapsedIds);
      dom.hydrateIcons(host);
    }
    function fileVisual(fileName) {
      var extension = ((fileName || "").split(".").pop() || "").toLowerCase();
      if (["png", "jpg", "jpeg", "webp"].indexOf(extension) >= 0) return { icon: "image", label: extension.toUpperCase() };
      if (["ppt", "pptx"].indexOf(extension) >= 0) return { icon: "presentation", label: extension.toUpperCase() };
      if (["xls", "xlsx"].indexOf(extension) >= 0) return { icon: "sheet", label: extension.toUpperCase() };
      return { icon: "file-text", label: extension ? extension.toUpperCase() : "FILE" };
    }
    function versionFor(id) {
      return (OpsDemo.core.store.getState().fileVersions || []).find(function match(version) { return version.id === id; });
    }
    function selectedCount() {
      return selection.versionIds.length + selection.sourceObjectIds.length + selectedFiles.filter(function prepared(entry) { return entry.status === "prepared"; }).length;
    }
    function sourceSelectedCount(source) {
      if (source === "assets") return selection.versionIds.length;
      if (source === "enterprise") return selection.sourceObjectIds.length;
      return selectedFiles.filter(function ready(entry) { return entry.status === "prepared"; }).length;
    }
    function syncSelectionUi() {
      root.querySelectorAll("[data-import-source-count]").forEach(function update(counter) {
        var count = sourceSelectedCount(counter.dataset.importSourceCount);
        counter.textContent = number(count);
        counter.hidden = !count;
      });
      if (uploadStart) {
        var total = selectedCount();
        uploadStart.innerHTML = dom.icon("arrow-right", 15) + "下一步（" + number(total) + "）";
        uploadStart.disabled = !total || isUploading || selectedFiles.some(function pending(entry) { return entry.status === "preparing" || entry.status === "error"; });
        dom.hydrateIcons(uploadStart);
      }
    }
    function renderResourceChoices() {
      var container = root.querySelector("[data-import-resource-rows]");
      if (!container) return;
      var current = OpsDemo.core.store.getState();
      pruneExistingSelections(current);
      var search = root.querySelector("[data-import-resource-search]");
      var query = search && search.value.trim().toLowerCase() || "";
      var localDirectory = root.querySelector("[data-import-local-directory]");
      var directory = root.querySelector("[data-import-enterprise-directory]");
      if (search) {
        search.placeholder = selection.source === "enterprise" ? (selection.enterpriseDirectoryId === "all" ? "搜索企业数据文件" : "搜索当前目录") : "搜索文档";
        search.setAttribute("aria-label", search.placeholder);
      }
      if (selection.source === "enterprise") {
        if (localDirectory) localDirectory.hidden = true;
        if (directory) directory.hidden = false;
        renderEnterpriseDirectories(current);
        var enterpriseFolders = enterpriseDirectories(current);
        renderDirectoryPath(current);
        var visibleEnterpriseObjects = selectableEnterpriseObjects(current).filter(function inDirectory(source) {
          return directoryTree.includesFolder(enterpriseFolders, source.directoryId, selection.enterpriseDirectoryId, "all");
        });
        var enterpriseRows = visibleEnterpriseObjects.map(function map(source) {
          var connection = (current.enterpriseConnections || []).find(function match(item) { return item.id === source.connectionId; });
          var available = source.available !== false;
          var checked = selection.sourceObjectIds.indexOf(source.id) >= 0;
          var searchableText = [source.fileName || source.name, source.directoryPath, connection && connection.name, source.connectionId].join(" ").toLowerCase();
          if (query && searchableText.indexOf(query) < 0) return "";
          var inputId = "import-source-" + source.id;
          return '<tr class="import-resource-row' + (checked ? " is-selected" : "") + (available ? "" : " is-disabled") + '"><td class="import-resource-table__check"><input id="' + esc(inputId) + '" type="checkbox" data-import-enterprise-object="' + esc(source.id) + '"' + (checked ? " checked" : "") + (available ? "" : " disabled") + '></td><td><label class="table-primary" for="' + esc(inputId) + '">' + esc(source.fileName || source.name) + '</label></td><td>' + esc(source.fileSizeLabel || "—") + '</td><td>' + dom.status(available ? "可引用" : "连接不可用", available ? "success" : "danger") + '</td><td>' + displayDate(source.updatedAt) + '</td><td class="import-resource-table__action">' + importChoicePreviewButton('data-import-enterprise-preview="' + esc(source.id) + '"') + '</td></tr>';
        }).join("");
        container.innerHTML = enterpriseRows || '<tr><td colspan="6">' + dom.empty("暂无可选企业数据", query ? "试试其他名称。" : "当前目录没有可添加到该知识库的文件。", "database") + '</td></tr>';
        dom.hydrateIcons(container);
        return;
      }
      if (localDirectory) localDirectory.hidden = false;
      if (directory) directory.hidden = true;
      renderLocalDirectories(current);
      renderDirectoryPath(current);
      var assets = selectableLocalAssets(current).filter(function inDirectory(asset) {
        return directoryTree.includesFolder(localFolders(current), asset.folderId, selection.localFolderId, "all");
      });
      var rows = assets.map(function map(asset) {
        var selectedVersionId = selection.versionIds.find(function selected(id) { var candidate = versionFor(id); return candidate && candidate.fileId === asset.id; });
        var detail = actions.getFileAssetDetail && actions.getFileAssetDetail(asset.id, { fileVersionId: selectedVersionId || undefined });
        var version = detail && detail.version;
        if (!version || (query && (version.name + " " + asset.id).toLowerCase().indexOf(query) < 0)) return "";
        var processing = detail.processingState;
        var status = typeof processing === "string" ? processing : processing && processing.status;
        var processedLabel = detail.parseResult && detail.parseResult.status === "ready" ? "已解析" : status === "parsing" ? "解析中" : status === "failed" ? "异常" : "未处理";
        var checked = selection.versionIds.indexOf(version.id) >= 0;
        var inputId = "import-version-" + version.id;
        return '<tr class="import-resource-row' + (checked ? " is-selected" : "") + '"><td class="import-resource-table__check"><input id="' + esc(inputId) + '" type="checkbox" data-import-version="' + esc(version.id) + '"' + (checked ? " checked" : "") + '></td><td><label class="table-primary" for="' + esc(inputId) + '">' + esc(version.name || asset.name) + '</label></td><td>' + esc(version.fileSizeLabel || "原文件") + '</td><td>' + dom.status(processedLabel, "info") + '</td><td>' + displayDate(version.createdAt || asset.createdAt) + '</td><td class="import-resource-table__action">' + importChoicePreviewButton('data-import-file-preview="' + esc(asset.id) + '" data-import-file-version="' + esc(version.id) + '"') + '</td></tr>';
      }).join("");
      container.innerHTML = rows || '<tr><td colspan="6">' + dom.empty("暂无可选文档", query ? "试试其他名称。" : "当前目录没有可添加到该知识库的文件。", "files") + '</td></tr>';
      dom.hydrateIcons(container);
    }
    function showSource(source) {
      selection.source = source;
      root.querySelectorAll("[data-import-source-tab]").forEach(function update(button) {
        var active = button.dataset.importSourceTab === source;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
      var resourcePane = root.querySelector("[data-import-resource-pane]");
      if (resourcePane) resourcePane.hidden = source === "upload";
      var searchWrap = root.querySelector("[data-import-resource-search-wrap]");
      if (searchWrap) searchWrap.hidden = source === "upload";
      root.querySelectorAll("[data-import-source-pane]").forEach(function update(pane) { pane.hidden = pane.dataset.importSourcePane !== source; });
      if (source !== "upload") renderResourceChoices();
      else renderUploadFolderTarget(OpsDemo.core.store.getState());
      syncSelectionUi();
    }
    function renderUploadFiles() {
      var list = root.querySelector("[data-upload-file-list]");
      if (!list) return;
      list.hidden = !selectedFiles.length;
      list.innerHTML = selectedFiles.map(function map(entry, index) {
        var file = entry.file;
        var visual = fileVisual(file.name);
        var size = file.size >= 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round((file.size || 0) / 1024)) + " KB";
        var pending = entry.status === "preparing";
        var failed = entry.status === "error";
        var statusContent = pending ? dom.icon("loader-circle", 17, "is-spinning") + '<span>读取中</span>' : failed ? dom.icon("circle-alert", 17) + '<span>读取失败</span>' : dom.icon("check", 17) + '<span>待上传</span>';
        return '<div class="upload-file-row"><span class="upload-file-row__icon">' + dom.icon(visual.icon, 19) + '</span><span class="upload-file-row__name"><strong>' + esc(file.name) + '</strong><small>' + esc(visual.label + " · " + size) + '</small></span><span class="upload-file-row__status' + (pending ? " is-loading" : failed ? " is-error" : "") + '">' + statusContent + '</span><button type="button" class="upload-file-row__remove" data-upload-remove="' + index + '" aria-label="移除 ' + esc(file.name) + '"' + (isUploading ? " disabled" : "") + '>' + dom.icon("trash-2", 16) + '</button></div>';
      }).join("");
      dom.hydrateIcons(list);
      syncSelectionUi();
    }
    function updateUploadFiles(files) {
      var sourceFiles = Array.prototype.slice.call(files || []);
      var accepted = sourceFiles.filter(function filter(file) { return /\.(pdf|png|jpe?g|webp|docx?|pptx?|xlsx?|txt)$/i.test(file.name || ""); });
      accepted.forEach(function each(file) {
        if (selectedFiles.some(function duplicate(entry) { return entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified; })) return;
        var entry = { file: file, status: "preparing" };
        selectedFiles.push(entry);
        Promise.resolve(actions.prepareUploadFiles([file])).then(function prepared(candidates) {
          entry.candidate = candidates[0];
          entry.status = entry.candidate ? "prepared" : "error";
          if (root.isConnected) renderUploadFiles();
        }).catch(function failed() {
          entry.status = "error";
          if (root.isConnected) renderUploadFiles();
        });
      });
      renderUploadFiles();
      if (accepted.length < sourceFiles.length) overlay.toast("部分文件未加入", "请选择 PDF、图片、Word、PPT、Excel 或 TXT 文件。", "warning");
    }
    function uploadIdentityConflicts() {
      var current = OpsDemo.core.store.getState();
      var currentAssets = (current.fileAssets || []).map(function currentVersion(asset) {
        var version = (current.fileVersions || []).find(function match(item) { return item.id === asset.latestVersionId && item.lifecycleStatus !== "retired"; });
        return version ? { fileId: asset.id, id: asset.id, name: version.name || asset.name, version: version } : null;
      }).filter(Boolean);
      var conflicts = [];
      selectedFiles.forEach(function inspect(entry) {
        var candidate = entry.status === "prepared" && entry.candidate;
        if (!candidate || candidate.identityDecision) return;
        var exact = currentAssets.find(function sameContent(asset) { return asset.version.contentHash === candidate.contentHash; });
        if (exact) {
          candidate.identityDecision = "reuse_existing";
          candidate.targetFileId = exact.id;
          return;
        }
        var sameName = currentAssets.filter(function same(asset) {
          return String(asset.name || "").toLowerCase() === String(candidate.name || "").toLowerCase();
        });
        if (sameName.length) conflicts.push({ entry: entry, assets: sameName });
      });
      return conflicts;
    }
    function resolveUploadIdentityConflicts(conflicts, index, onResolved) {
      if (index >= conflicts.length) { onResolved(); return; }
      var conflict = conflicts[index];
      var candidate = conflict.entry.candidate;
      var targetOptions = conflict.assets.map(function option(asset) {
        return '<option value="' + esc(asset.fileId) + '">' + esc(asset.name) + " · " + esc(asset.id) + "</option>";
      }).join("");
      var targetChoice = conflict.assets.length > 1 ? '<label class="form-field"><span class="form-label">更新对象</span><select class="select-field" data-import-update-target>' + targetOptions + "</select></label>" : '<p class="table-secondary">当前文档：' + esc(conflict.assets[0].name) + " · " + esc(conflict.assets[0].id) + "</p>";
      overlay.confirm({
        title: "发现同名但内容不同的文档" + (conflicts.length > 1 ? "（" + number(index + 1) + "/" + number(conflicts.length) + "）" : ""),
        confirmLabel: "更新原文档",
        cancelLabel: "作为新文档",
        cancelAttrs: "data-import-create-new",
        body: '<div class="knowledge-delete-copy"><p>上传的“' + esc(candidate.name) + '”与文档管理中的同名文档内容不同。</p>' + targetChoice + '<p>更新会保留稳定文档 ID，重新处理受影响知识库的切片、向量与索引，并产生 Embedding Token 消耗；新结果切换前继续使用原有检索结果。作为新文档会创建独立文档 ID，并保留两个同名文档。</p></div>',
        onConfirm: function updateExisting(overlayRoot) {
          var target = overlayRoot.querySelector("[data-import-update-target]");
          candidate.identityDecision = "update_existing";
          candidate.targetFileId = target ? target.value : conflict.assets[0].fileId;
          window.setTimeout(function nextConflict() { resolveUploadIdentityConflicts(conflicts, index + 1, onResolved); }, 0);
          return true;
        }
      });
      var createNew = document.querySelector("[data-import-create-new]");
      if (createNew) createNew.addEventListener("click", function createSeparateDocument(event) {
        event.preventDefault();
        candidate.identityDecision = "create_new";
        candidate.targetFileId = null;
        overlay.close();
        window.setTimeout(function nextConflict() { resolveUploadIdentityConflicts(conflicts, index + 1, onResolved); }, 0);
      });
    }
    function startSelectedImport() {
      var previousSelectionKey = selectionKey;
      isUploading = true;
      syncSelectionUi();
      var batch = actions.startKnowledgeImport(uploadStart.dataset.uploadStart, {
        files: selectedFiles.map(function file(entry) { return entry.candidate; }),
        fileVersionIds: selection.versionIds.slice(),
        sourceObjects: selection.sourceObjectIds.slice(),
        targetFolderId: selection.localFolderId === "all" ? "FOLDER-UNCATEGORIZED" : selection.localFolderId,
        deferred: true,
        reprocess: route.query.reprocess === "1",
        returnRoute: route.query.returnRoute || importReturnRoute(route.id)
      });
      if (!batch) {
        isUploading = false;
        syncSelectionUi();
        overlay.toast("资料未加入", "请检查所选资料是否仍然可用。", "warning");
        return;
      }
      if (batch.status === "completed" && batch.skippedCount === batch.items.length) {
        var localDuplicate = batch.processingScope === "local-documents" || !batch.knowledgeBaseId;
        overlay.toast(localDuplicate ? "文档已存在" : "资料已在知识库中", localDuplicate ? "相同内容无需重复上传或解析。" : "所选文件已经加入，无需重复处理。", "info");
        router.navigate(importReturnRoute(route.id, batch.id));
        return;
      }
      var nextSelectionKey = processingDraftKey(route.id, batch.id);
      importSelections[nextSelectionKey] = {
        versionIds: selection.versionIds.slice(),
        sourceObjectIds: selection.sourceObjectIds.slice(),
        files: selectedFiles.slice(),
        source: selection.source,
        localFolderId: selection.localFolderId,
        enterpriseDirectoryId: selection.enterpriseDirectoryId,
        localCollapsedIds: selection.localCollapsedIds.slice(),
        enterpriseCollapsedIds: selection.enterpriseCollapsedIds.slice()
      };
      if (previousSelectionKey !== nextSelectionKey) delete importSelections[previousSelectionKey];
      var localUpload = batch.processingScope === "local-documents" || !batch.knowledgeBaseId;
      overlay.toast(localUpload ? "文档已登记" : "资料已保存", "请继续设置文档解析方式。", "success");
      router.navigate(importStepRoute(route.id, "parse", batch.id, !localUpload));
    }
    if (uploadStart) {
      renderUploadFiles();
      showSource(selection.source);
      root.querySelectorAll("[data-import-source-tab]").forEach(function bind(button) { button.addEventListener("click", function handle() { showSource(button.dataset.importSourceTab); }); });
      var resourceSearch = root.querySelector("[data-import-resource-search]");
      if (resourceSearch) resourceSearch.addEventListener("input", renderResourceChoices);
      root.addEventListener("click", function selectImportDirectory(event) {
        var button = event.target.closest("[data-directory-select], [data-directory-toggle]");
        if (!button) return;
        var scope = button.dataset.directoryScope;
        var selectedUploadTarget = false;
        if (button.dataset.directoryToggle) {
          var collapsed = scope === "knowledge-enterprise" ? selection.enterpriseCollapsedIds : selection.localCollapsedIds;
          var index = collapsed.indexOf(button.dataset.directoryToggle);
          if (index >= 0) collapsed.splice(index, 1);
          else collapsed.push(button.dataset.directoryToggle);
        } else if (scope === "knowledge-enterprise") {
          selection.enterpriseDirectoryId = button.dataset.directorySelect || "all";
        } else if (scope === "knowledge-local") {
          selection.localFolderId = button.dataset.directorySelect || "all";
        } else if (scope === "local-upload-target") {
          selection.localFolderId = uploadFolderId(OpsDemo.core.store.getState(), button.dataset.directorySelect);
          selectedUploadTarget = true;
        } else {
          return;
        }
        if (scope === "local-upload-target") {
          renderUploadFolderTarget(OpsDemo.core.store.getState());
          if (selectedUploadTarget) root.querySelector("[data-upload-folder-picker]").open = false;
          syncSelectionUi();
        } else {
          renderResourceChoices();
        }
      });
      root.addEventListener("click", function previewImportResource(event) {
        var button = event.target.closest("[data-import-file-preview], [data-import-enterprise-preview]");
        if (!button) return;
        if (button.dataset.importFilePreview) {
          var detail = actions.getFileAssetDetail && actions.getFileAssetDetail(button.dataset.importFilePreview, { fileVersionId: button.dataset.importFileVersion });
          if (!detail || !detail.version) return;
          openImportChoicePreview(button, detail.version.name || detail.asset.name, detail.version.fileSizeLabel || "原文件", renderVersionSource(detail.version));
          return;
        }
        var source = enterpriseObjects.find(function match(item) { return item.id === button.dataset.importEnterprisePreview; });
        if (!source) return;
        openImportChoicePreview(button, source.fileName || source.name, source.fileSizeLabel || "—", '<pre class="import-choice-preview__data">' + esc(source.content || "暂无可预览内容") + '</pre>');
      });
      root.addEventListener("change", function selectExisting(event) {
        var input = event.target;
        var versionId = input.dataset.importVersion;
        var sourceId = input.dataset.importEnterpriseObject;
        var target = versionId ? selection.versionIds : sourceId ? selection.sourceObjectIds : null;
        var id = versionId || sourceId;
        if (!target) return;
        if (versionId && input.checked) {
          var version = versionFor(versionId);
          selection.versionIds = selection.versionIds.filter(function otherVersion(selectedId) {
            var other = versionFor(selectedId);
            return !version || !other || other.fileId !== version.fileId;
          });
          selection.versionIds.push(versionId);
          renderResourceChoices();
          syncSelectionUi();
          return;
        }
        var index = target.indexOf(id);
        if (input.checked && index < 0) target.push(id);
        if (!input.checked && index >= 0) target.splice(index, 1);
        renderResourceChoices();
        syncSelectionUi();
      });
      uploadStart.addEventListener("click", function handle() {
        if (!selectedCount() || isUploading || uploadStart.disabled) return;
        var conflicts = uploadIdentityConflicts();
        if (conflicts.length) { resolveUploadIdentityConflicts(conflicts, 0, startSelectedImport); return; }
        startSelectedImport();
      });
    }
    if (uploadInput) uploadInput.addEventListener("change", function handle() { updateUploadFiles(uploadInput.files); });
    if (uploadDrop) {
      ["dragenter", "dragover"].forEach(function bindDrag(eventName) {
        uploadDrop.addEventListener(eventName, function handle(event) { event.preventDefault(); uploadDrop.classList.add("is-dragover"); });
      });
      ["dragleave", "dragend"].forEach(function bindLeave(eventName) {
        uploadDrop.addEventListener(eventName, function handle() { uploadDrop.classList.remove("is-dragover"); });
      });
      uploadDrop.addEventListener("drop", function handle(event) {
        event.preventDefault(); uploadDrop.classList.remove("is-dragover"); updateUploadFiles(event.dataTransfer && event.dataTransfer.files);
      });
    }
    var uploadList = root.querySelector("[data-upload-file-list]");
    if (uploadList) uploadList.addEventListener("click", function handle(event) {
      var remove = event.target.closest("[data-upload-remove]");
      if (!remove || isUploading) return;
      selectedFiles.splice(Number(remove.dataset.uploadRemove), 1);
      renderUploadFiles();
    });
    root.querySelectorAll("[data-upload-cancel]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        delete importSelections[selectionKey];
        router.navigate(importReturnRoute(button.dataset.uploadCancel, route.query.batch));
      });
    });
    root.querySelectorAll("[data-onboarding-cancel]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        delete onboardingProcessingDrafts[processingDraftKey(button.dataset.onboardingCancel, route.query.batch)];
        router.navigate(importReturnRoute(button.dataset.onboardingCancel, route.query.batch));
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
    function parseConfigFingerprint(config) {
      var source = config || {};
      return ["parseMethod", "tableEnabled", "formulaEnabled", "imageAnalysisEnabled"].map(function value(key) {
        return key + ":" + String(source[key]);
      }).join("|");
    }
    function parseCompatibilityFor(knowledgeBase, parseConfig) {
      if (!knowledgeBase || !knowledgeBase.currentIngestionProfileId || !actions.getProcessingProfileCompatibility) return { compatible: true };
      var currentState = OpsDemo.core.store.getState();
      var currentProfile = findIngestionProfile(currentState, knowledgeBase.currentIngestionProfileId);
      return actions.getProcessingProfileCompatibility(currentProfile, parseConfig);
    }
    var parseBack = root.querySelector("[data-parse-back]");
    if (parseBack) parseBack.addEventListener("click", function handle() {
      var currentState = OpsDemo.core.store.getState();
      var currentBatch = importBatch(currentState, route.query.batch);
      if (!currentBatch) {
        overlay.toast("无法返回资料选择", "本次导入记录已经失效，请重新开始导入。", "warning");
        return;
      }
      var key = processingDraftKey(parseBack.dataset.parseBack, currentBatch.id);
      var restored = importSelections[key] || importSelectionFromBatch(currentState, currentBatch);
      importSelections[key] = restored;
      actions.cancelImportProcessing(currentBatch.id);
      var latestState = OpsDemo.core.store.getState();
      restored.versionIds = restored.versionIds.filter(function available(versionId) {
        var version = (latestState.fileVersions || []).find(function match(item) { return item.id === versionId; });
        return version && version.lifecycleStatus !== "retired";
      });
      if (!restored.versionIds.length && !restored.sourceObjectIds.length && !restored.files.length) restored.source = route.id === "local-documents" ? "upload" : "assets";
      router.navigate(importStepRoute(parseBack.dataset.parseBack, "upload", currentBatch.id, route.query.flow === "import"));
    });
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
      var currentBatch = importBatch(currentState, route.query.batch);
      var configChanged = !currentBatch || parseConfigFingerprint(currentBatch.mineruParseConfig) !== parseConfigFingerprint(nextParseConfig);
      var shouldStartParsing = !currentBatch || currentBatch.status === "pending_configuration" || currentBatch.status === "cancelled" || currentBatch.status === "failed" || configChanged;
      var configured = shouldStartParsing ? actions.startImportParsing(route.query.batch, { mineruParseConfig: nextParseConfig }) : currentBatch;
      if (!configured) {
        overlay.toast("解析未开始", "请确认本次导入记录与文件仍然可用。", "warning");
        return;
      }
      if (currentKb && currentKb.isLocalDocumentFlow) {
        delete importSelections[processingDraftKey(parseNext.dataset.parseNext, route.query.batch)];
        overlay.toast("解析已提交", "可在文档管理中查看处理状态。", "success");
        router.navigate(importReturnRoute(parseNext.dataset.parseNext, route.query.batch));
        return;
      }
      overlay.toast("解析已开始", "可以继续配置切片；解析完成后将自动衔接处理。", "success");
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
    var previewBatchId = route.query.batch || null;
    var previewFileVersionId = route.query.fileVersionId || null;
    function readImportPreview() {
      return previewBatchId && actions.getImportPreview ? actions.getImportPreview(previewBatchId, { fileVersionId: previewFileVersionId || undefined }) : null;
    }
    function updateImportProgress() {
      if (!root.isConnected) return;
      var batch = importBatch(OpsDemo.core.store.getState(), route.query.batch);
      var label = root.querySelector("[data-import-status-label]");
      if (label) label.textContent = importStatusLabel(batch && batch.status);
      var retry = root.querySelector("[data-import-retry]");
      if (retry) retry.hidden = !batch || batch.status !== "failed";
      var host = document.querySelector('[data-import-preview-host]');
      if (host && host.dataset.importPreviewHost === previewBatchId) {
        var content = host.querySelector("[data-import-preview-content]");
        var view = readImportPreview();
        if (content) {
          var scrolls = Array.from(content.querySelectorAll(".import-preview-scroll")).map(function save(el) { return el.scrollTop; });
          content.innerHTML = renderImportPreviewContent(view);
          dom.hydrateIcons(content);
          content.querySelectorAll(".import-preview-scroll").forEach(function restore(el, i) { el.scrollTop = scrolls[i] || 0; });
        }
      }
    }
    function openImportPreview(batchId) {
      if (typeof batchId === "string" && batchId !== previewBatchId) { previewBatchId = batchId; previewFileVersionId = null; }
      var view = readImportPreview();
      if (!view) {
        overlay.open({ title: "文件预览", footer: false, body: dom.empty("暂无导入资料", "请先选择资料。", "files") });
        return;
      }
      if (!previewFileVersionId && view.version) previewFileVersionId = view.version.id;
      var options = (view.items || []).map(function map(item) {
        var version = item.version || {};
        var id = version.id || item.fileVersionId;
        return '<option value="' + esc(id) + '"' + (id === previewFileVersionId ? " selected" : "") + '>' + esc(version.name || item.fileName || "文件") + '</option>';
      }).join("");
      overlay.open({
        title: "文件预览", wide: true, panelClass: "import-preview-dialog", footer: false,
        onCancel: function refreshAfterClose() { if (!route.query.batch) window.setTimeout(function refresh() { if (root.isConnected) refreshKnowledgeView(); }, 0); },
        body: '<div data-import-preview-host="' + esc(previewBatchId) + '"><div class="import-preview-toolbar"><label>文件<select class="select-field" data-import-preview-file>' + options + '</select></label><strong>原文件与切片</strong></div><div data-import-preview-content>' + renderImportPreviewContent(view) + '</div></div>'
      });
      var host = document.querySelector("[data-import-preview-host]");
      host.querySelector("[data-import-preview-file]").addEventListener("change", function selectFile(event) {
        previewFileVersionId = event.target.value;
        updateImportProgress();
      });
      preview.bindChunkCards(host);
    }
    root.querySelectorAll("[data-import-preview]").forEach(function bind(button) { button.addEventListener("click", openImportPreview); });
    root.querySelectorAll("[data-import-retry]").forEach(function bind(button) {
      button.addEventListener("click", function retry() {
        var result = actions.retryImportProcessing(route.query.batch);
        if (result) overlay.toast("已重新提交", "将从失败阶段继续处理。", "success");
        updateImportProgress();
      });
    });
    if (route.query.batch) {
      var stopImportUpdates = OpsDemo.core.store.subscribe(function updateBatch(current, meta) {
        if (!root.isConnected || meta && meta.batchId && meta.batchId !== route.query.batch) return;
        updateImportProgress();
      });
      pageCleanups.push(stopImportUpdates);
      updateImportProgress();
    }
    var processingFinish = root.querySelector("[data-processing-finish]");
    var processingBack = root.querySelector("[data-processing-back]");
    var processingDraftRoot = root.querySelector("[data-processing-draft]");
    var processingMethodPicker = root.querySelector("[data-processing-method-picker]");
    var processingDraftCache = {};
    var initialProcessingDraft = processingFinish && onboardingProcessingDrafts[processingDraftKey(processingFinish.dataset.processingFinish, route.query.batch)];
    if (initialProcessingDraft && initialProcessingDraft.profileId) processingDraftCache[initialProcessingDraft.profileId] = initialProcessingDraft;

    function refreshProcessingDraftControls(draft) {
      var activeKb = processingFinish ? findKnowledgeBase(OpsDemo.core.store.getState(), processingFinish.dataset.processingFinish, route.query.batch) : null;
      syncProcessingDraftParseAvailability(draft, activeKb && activeKb.mineruParseConfig);
      processingDraftRoot.innerHTML = renderProcessingParameters(draft);
      dom.hydrateIcons(processingDraftRoot);
      bindProcessingDraftInputs();
    }

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
      pageCleanups.push(function closeSeparator() { setOpen(false); });
      syncSelection();
    }

    function bindProcessingDraftInputs() {
      if (!processingDraftRoot || !processingFinish) return;
      processingDraftRoot.querySelectorAll("[data-processing-param]").forEach(function bind(input) {
        input.addEventListener("change", function handle() {
          var draft = onboardingProcessingDrafts[processingDraftKey(processingFinish.dataset.processingFinish, route.query.batch)];
          if (!draft) return;
          draft.dirty = true;
          var key = input.dataset.processingParam;
          if (input.type === "checkbox") {
            if (draft.parseAvailability && draft.parseAvailability[key] === false) {
              input.checked = false;
              draft[key] = false;
              return;
            }
            draft[key] = input.checked;
            if (key === "parentChildEnabled") {
              draft.includeContext = draft.mode !== "whole_document";
              draft.contextPolicy = normalizedContextPolicy(draft.mode, draft.parentChildEnabled);
            }
          }
          else if (input.type === "number") draft[key] = Number(input.value);
          else draft[key] = input.value;
          if (key === "parentChildEnabled") refreshProcessingDraftControls(draft);
        });
        if (input.type === "number" || input.type === "text") {
          input.addEventListener("input", function handle() {
            var draft = onboardingProcessingDrafts[processingDraftKey(processingFinish.dataset.processingFinish, route.query.batch)];
            if (!draft) return;
            draft.dirty = true;
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
      var activeKb = findKnowledgeBase(OpsDemo.core.store.getState(), knowledgeBaseId, route.query.batch);
      var currentDraft = onboardingProcessingDrafts[processingDraftKey(knowledgeBaseId, route.query.batch)];
      if (currentDraft && currentDraft.profileId) processingDraftCache[currentDraft.profileId] = currentDraft;
      var draft = processingDraftCache[profile.id];
      if (!draft) {
        draft = createProcessingDraft(knowledgeBaseId, profile, route.query.batch, activeKb && activeKb.mineruParseConfig);
        processingDraftCache[profile.id] = draft;
      } else {
        onboardingProcessingDrafts[processingDraftKey(knowledgeBaseId, route.query.batch)] = draft;
      }
      syncProcessingDraftParseAvailability(draft, activeKb && activeKb.mineruParseConfig);
      draft.dirty = true;
      refreshProcessingDraftControls(draft);
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
      if ((processingDraft.mode === "smart" || processingDraft.mode === "semantic" || processingDraft.mode === "structure" || processingDraft.mode === "recursive" || processingDraft.mode === "separator" || processingDraft.mode === "fixed") && (!Number.isInteger(processingDraft.maxChars) || processingDraft.maxChars < 200 || processingDraft.maxChars > 10000)) {
        overlay.toast("切片参数有误", "切片最大字符需为 200–10000 之间的整数。", "warning");
        return;
      }
      if (processingDraft.mode === "semantic" && ["low", "balanced", "high"].indexOf(processingDraft.semanticSensitivity) < 0) {
        overlay.toast("语义切片参数有误", "请选择低、均衡或高敏感度。", "warning");
        return;
      }
      if (["smart", "structure", "recursive", "separator", "fixed"].indexOf(processingDraft.mode) >= 0 && (!Number.isInteger(processingDraft.overlapPercent) || processingDraft.overlapPercent < 0 || processingDraft.overlapPercent > 50)) {
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
      var completed = actions.completeImportProcessing(route.query.batch, processingPayload(processingDraft));
      if (!completed) {
        overlay.toast("文件处理未开始", "请检查本次切块配置与所选文件。", "warning");
        return;
      }
      delete onboardingProcessingDrafts[processingDraftKey(processingFinish.dataset.processingFinish, route.query.batch)];
      overlay.toast("处理已提交", completed.status === "waiting_parse" || completed.status === "parsing" ? "解析完成后将自动继续，可离开页面。" : "将按当前知识库模型处理并更新索引，可随时查看进度。", "success");
      router.navigate(importReturnRoute(processingFinish.dataset.processingFinish, route.query.batch));
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
    root.querySelectorAll("[data-document-preview]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (!button.disabled && route.id) router.navigate("knowledge/" + route.id + "?tab=chunks&document=" + encodeURIComponent(button.dataset.documentPreview));
      });
    });
    root.querySelectorAll("[data-document-reprocess]").forEach(function bind(button) {
      button.addEventListener("click", function reprocess() {
        var item = findDocument(OpsDemo.core.store.getState(), button.dataset.documentReprocess);
        if (!item || item.knowledgeBaseId !== route.id || !item.fileVersionId) return;
        var batch = actions.startKnowledgeImport(route.id, {
          fileVersionIds: [item.fileVersionId],
          deferred: true,
          reprocess: true,
          returnRoute: "knowledge/" + route.id + "?tab=documents"
        });
        if (!batch || batch.status === "completed") {
          overlay.toast("处理未开始", "请确认文件仍在该知识库中，并且知识库可编辑。", "warning");
          return;
        }
        router.navigate("knowledge/" + encodeURIComponent(route.id) + "/import?step=parse&batch=" + encodeURIComponent(batch.id) + "&flow=import");
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
      router.navigate("knowledge/" + previewDocumentSelect.dataset.previewDocumentSelect + "?tab=chunks&document=" + encodeURIComponent(previewDocumentSelect.value));
    });
    preview.bindChunkCards(root);
    root.querySelectorAll("[data-chunk-add]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        openAddChunk(button.dataset.kbId, button.dataset.chunkAdd);
      });
    });
    root.querySelectorAll("[data-chunk-edit]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        openEditChunk(button.dataset.kbId, button.dataset.documentId, button.dataset.chunkEdit);
      });
    });
    root.querySelectorAll("[data-chunk-delete]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        confirmDeleteChunk(button.dataset.kbId, button.dataset.documentId, button.dataset.chunkDelete);
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

    function refreshKnowledgeView() {
      var current = OpsDemo.core.store.getState();
      unmount();
      var nextRoot = root.cloneNode(false);
      nextRoot.innerHTML = render(route, current);
      root.replaceWith(nextRoot);
      dom.hydrateIcons(nextRoot);
      mount(nextRoot, route, current);
    }
    if (route.id && route.id !== "new" && route.id !== "local-documents" && route.query.onboarding !== "1" && route.query.settings !== "parse") {
      pageCleanups.push(OpsDemo.core.store.subscribe(function refreshKnowledge(current, meta) {
        if (!root.isConnected || !meta || !meta.silentRender) return;
        var batch = meta.batchId && importBatch(current, meta.batchId);
        if (meta.knowledgeBaseId && meta.knowledgeBaseId !== route.id) return;
        if (batch && batch.knowledgeBaseId !== route.id) return;
        if (document.querySelector("[data-import-preview-host]")) { updateImportProgress(); return; }
        refreshKnowledgeView();
      }));
    }

    if (route.id && route.query.tab === "versions") {
      router.navigate("knowledge/" + route.id + "?tab=documents");
    }
  }

  OpsDemo.pages.knowledge = {
    render: render,
    mount: mount,
    unmount: unmount,
    renderLocalImport: renderLocalImport,
    mountLocalImport: mountLocalImport
  };
})(window.OpsDemo);

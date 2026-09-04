(function defineActions(OpsDemo) {
  "use strict";

  var store = OpsDemo.core.store;
  var localImportState = null;
  var localImportContexts = {};

  function getLocalDocumentImportContext(batchId) {
    var state = store.getState();
    if (localImportState !== state) {
      localImportState = state;
      localImportContexts = {};
    }
    var key = batchId || "new";
    if (!localImportContexts[key]) {
      var batch = batchId && find(state.importBatches, batchId);
      if (batchId && (!batch || batch.processingScope !== "local-documents")) return null;
      var profile = (state.rag.ingestionProfiles || []).find(function available(item) {
        return item.visible !== false && item.displayGroup !== "internal" && item.chunking;
      });
      localImportContexts[key] = {
        id: "local-documents",
        name: "文档管理",
        isLocalDocumentFlow: true,
        importBatchId: batchId || null,
        currentIngestionProfileId: profile ? profile.id : null,
        currentIngestionProfileName: profile ? profile.name : null,
        mineruParseConfig: normalizeMineruParseConfig()
      };
    }
    return localImportContexts[key];
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function find(list, id) {
    return (list || []).find(function findItem(item) { return item.id === id; });
  }

  function actor(state) {
    return state.meta.currentUser.displayName;
  }

  function apiSecret() {
    var random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return "sk_agent_" + random.slice(0, 24);
  }

  function maskedApiSecret(secret) {
    var value = String(secret || "");
    return "sk_agent_•••••••" + value.slice(-4).toUpperCase();
  }

  function record(state, change) {
    state.configurationRecords.unshift(Object.assign({
      id: OpsDemo.utils.id("CR"),
      occurredAt: nowIso(),
      actor: actor(state),
      canCreateRollbackDraft: false
    }, change));
  }

  function recalculateOverview(state) {
    var metrics = state.overview.metrics;
    var enabledKnowledge = state.knowledgeBases.filter(function each(item) { return item.enabled; });
    metrics.knowledgeBases.total = state.knowledgeBases.length;
    metrics.knowledgeBases.enabled = enabledKnowledge.length;
    metrics.retrievalAvailability.available = state.knowledgeBases.filter(function each(item) { return item.retrievalStatus === "available"; }).length;
    metrics.retrievalAvailability.disabled = state.knowledgeBases.filter(function each(item) { return item.retrievalStatus === "disabled"; }).length;
    metrics.retrievalAvailability.unavailable = state.knowledgeBases.filter(function each(item) { return item.retrievalStatus === "unavailable"; }).length;
    metrics.documents.total = state.knowledgeBases.reduce(function sum(total, item) { return total + item.documentCounts.total; }, 0);
    metrics.documents.searchable = state.knowledgeBases.reduce(function sum(total, item) { return total + item.documentCounts.searchable; }, 0);
    metrics.importIssues.open = state.importBatches.reduce(function sum(total, batch) {
      return total + batch.items.filter(function each(item) { return item.status === "failed"; }).length;
    }, 0);

    ["available", "unavailable", "disabled"].forEach(function each(status) {
      metrics.skills[status] = state.skills.filter(function filter(item) { return item.status === status; }).length;
      metrics.tools[status] = state.tools.filter(function filter(item) { return item.status === status; }).length;
    });
    metrics.skills.total = state.skills.length;
    metrics.tools.total = state.tools.length;
    metrics.visualizations.defined = state.visualizations.length;
    metrics.visualizations.integrated = state.visualizations.filter(function each(item) { return item.integrationStatus === "integrated"; }).length;
    metrics.visualizations.notIntegrated = metrics.visualizations.defined - metrics.visualizations.integrated;
    metrics.consumption.totalTokensM = state.consumption.monthSummary.totalTokensM;

    var openImportIssues = metrics.importIssues.open;
    var mineruStage = state.overview.ragPipeline.find(function findStage(stage) { return stage.key === "mineru"; });
    var indexStage = state.overview.ragPipeline.find(function findStage(stage) { return stage.key === "index"; });
    var retrievalStage = state.overview.ragPipeline.find(function findStage(stage) { return stage.key === "retrieval"; });
    var buildingVersions = state.knowledgeVersions.filter(function each(item) { return item.status === "building"; }).length;
    if (mineruStage) {
      mineruStage.value = openImportIssues ? openImportIssues + " 项异常" : "正常";
      mineruStage.status = openImportIssues ? "error" : "normal";
    }
    if (indexStage) {
      indexStage.value = buildingVersions ? buildingVersions + " 个构建中" : "正常";
      indexStage.status = buildingVersions ? "info" : "normal";
    }
    if (retrievalStage) {
      retrievalStage.value = metrics.retrievalAvailability.unavailable ? metrics.retrievalAvailability.unavailable + " 库不可用" : "正常";
      retrievalStage.status = metrics.retrievalAvailability.unavailable ? "error" : "normal";
    }
  }

  function commit(type, mutator, meta) {
    var result = null;
    store.mutate(function mutateState(state) {
      result = mutator(state);
      recalculateOverview(state);
    }, Object.assign({ type: type }, meta || {}));
    return result;
  }

  // Fixed-length is retained only for existing profile snapshots.
  var PROCESSING_MODES = ["smart", "semantic", "structure", "separator", "recursive", "fixed", "page", "whole_document"];
  var RECURSIVE_BOUNDARIES = ["paragraph", "newline", "sentence", "whitespace", "character"];

  function processingModeLabel(mode) {
    return {
      smart: "自动切片",
      semantic: "语义切片",
      structure: "结构切片",
      recursive: "递归切块",
      fixed: "固定长度",
      separator: "分隔符切片",
      page: "按页切片",
      whole_document: "整篇切片"
    }[mode] || "自动切片";
  }

  function processingIndexContent(input, fallback) {
    var base = Object.assign({
      documentName: true,
      headingPath: true,
      pageNumber: true,
      tableText: true,
      imageText: false
    }, fallback || {});
    var patch = input || {};
    ["documentName", "headingPath", "pageNumber", "tableText", "imageText"].forEach(function each(key) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) base[key] = patch[key] === true;
    });
    return base;
  }

  function processingRequirements(mode, indexContent, fallback) {
    return Object.assign({}, fallback || {}, {
      structuredContent: mode === "smart" || mode === "structure",
      pageLocator: mode === "page" || indexContent.pageNumber === true,
      tableContent: indexContent.tableText === true,
      imageText: indexContent.imageText === true
    });
  }

  function normalizedProcessingProfile(profile, parameters) {
    if (!profile || !profile.chunking) return null;
    var source = OpsDemo.utils.clone(profile);
    var baseChunking = source.chunking || {};
    var input = Object.assign({}, parameters && parameters.chunking || {}, parameters || {});
    delete input.chunking;
    var mode = input.mode || baseChunking.mode || "smart";
    if (PROCESSING_MODES.indexOf(mode) < 0) return null;

    var maxChars = Number(Object.prototype.hasOwnProperty.call(input, "maxChars") ? input.maxChars : (baseChunking.maxChars || 1200));
    var overlapPercent = Number(Object.prototype.hasOwnProperty.call(input, "overlapPercent") ? input.overlapPercent : (baseChunking.overlapPercent || 0));
    if (!Number.isFinite(maxChars) || !Number.isFinite(overlapPercent)) return null;
    if (["smart", "semantic", "structure", "recursive", "fixed", "separator"].indexOf(mode) >= 0 && (maxChars < 200 || maxChars > 10000)) return null;
    if (mode !== "fixed" && !Number.isInteger(maxChars)) return null;
    if ((mode === "page" || mode === "whole_document") && (maxChars < 200 || maxChars > 50000)) return null;
    if (mode === "semantic" || mode === "page" || mode === "whole_document") overlapPercent = 0;
    if (overlapPercent < 0 || overlapPercent > 50 || (mode !== "fixed" && !Number.isInteger(overlapPercent))) return null;

    var semanticSensitivity = input.semanticSensitivity || baseChunking.semanticSensitivity || "balanced";
    if (mode === "semantic" && ["low", "balanced", "high"].indexOf(semanticSensitivity) < 0) return null;
    var breakpointPercentiles = { low: 95, balanced: 85, high: 75 };
    var semanticBreakpointPercentile = breakpointPercentiles[semanticSensitivity];
    var semanticMinChars = Math.min(maxChars, Math.max(100, Math.min(400, Math.round(maxChars * 0.2))));
    if (mode === "semantic") overlapPercent = 0;

    var sentenceSeparator = "。！？.!?";
    var separatorByType = {
      structure: "\n\n",
      paragraph: "\n\n",
      newline: "\n",
      zh_period: "。",
      zh_exclamation: "！",
      zh_question: "？",
      en_period: ".",
      en_exclamation: "!",
      en_question: "?",
      sentence: sentenceSeparator
    };
    var separatorTypeByLiteral = {
      "\n\n": "paragraph",
      "\n": "newline",
      "。": "zh_period",
      "！": "zh_exclamation",
      "？": "zh_question",
      ".": "en_period",
      "!": "en_exclamation",
      "?": "en_question"
    };
    var hasInputSeparatorType = Object.prototype.hasOwnProperty.call(input, "separatorType") || Object.prototype.hasOwnProperty.call(input, "separatorPreset");
    var baseSeparatorType = baseChunking.separatorPreset || baseChunking.separatorType || "";
    var separatorType = input.separatorType || input.separatorPreset || baseSeparatorType || (mode === "structure" ? "structure" : "paragraph");
    if (mode === "page" || mode === "whole_document") separatorType = "literal";
    if (mode === "structure") separatorType = "structure";
    if (mode === "separator" && !hasInputSeparatorType && baseChunking.mode !== "separator") separatorType = "paragraph";
    if (["structure", "paragraph", "newline", "zh_period", "zh_exclamation", "zh_question", "en_period", "en_exclamation", "en_question", "sentence", "custom", "literal"].indexOf(separatorType) < 0) return null;
    var hasInputSeparator = Object.prototype.hasOwnProperty.call(input, "separator");
    var hasInputCustomSeparator = Object.prototype.hasOwnProperty.call(input, "customSeparator");
    var legacySeparator = hasInputSeparator ? String(input.separator || "") : String(baseChunking.separator || "");
    var customSeparator = hasInputCustomSeparator ? String(input.customSeparator || "") : String(baseChunking.customSeparator || "");
    if (separatorType === "literal") {
      if (Object.prototype.hasOwnProperty.call(separatorTypeByLiteral, legacySeparator)) separatorType = separatorTypeByLiteral[legacySeparator];
      else if (legacySeparator === sentenceSeparator) separatorType = "sentence";
      else if (!legacySeparator) separatorType = "paragraph";
      else if (mode === "separator") {
        separatorType = "custom";
        customSeparator = legacySeparator;
      }
    }
    if (separatorType === "custom" && !customSeparator && hasInputSeparator) customSeparator = legacySeparator;
    if (separatorType === "custom" && !customSeparator && !hasInputCustomSeparator && (baseSeparatorType === "custom" || baseSeparatorType === "literal")) customSeparator = String(baseChunking.separator || "");
    if (separatorType === "custom" && Object.prototype.hasOwnProperty.call(separatorTypeByLiteral, customSeparator)) separatorType = separatorTypeByLiteral[customSeparator];
    else if (separatorType === "custom" && customSeparator === sentenceSeparator) separatorType = "sentence";
    else if (separatorType === "custom" && !customSeparator) separatorType = "paragraph";
    if (mode === "separator" && separatorType === "structure") mode = "structure";
    if (mode === "structure") separatorType = "structure";
    var separator = Object.prototype.hasOwnProperty.call(separatorByType, separatorType) ? separatorByType[separatorType] : (customSeparator || legacySeparator);
    if (mode === "page" || mode === "whole_document") {
      separatorType = "literal";
      separator = mode === "page" ? "\f" : "";
    }
    if (separatorType !== "custom") customSeparator = "";

    var pagesPerChunk = mode === "page" ? Number(Object.prototype.hasOwnProperty.call(input, "pagesPerChunk") ? input.pagesPerChunk : (baseChunking.pagesPerChunk || 1)) : 1;
    if (!Number.isInteger(pagesPerChunk) || pagesPerChunk < 1 || pagesPerChunk > 10) return null;
    var longDocumentFallback = mode === "whole_document" ? input.longDocumentFallback || baseChunking.longDocumentFallback || "smart" : "smart";
    if (["smart", "stop"].indexOf(longDocumentFallback) < 0) return null;

    var indexPatch = Object.assign({}, parameters && parameters.indexContent || {}, input);
    var indexContent = processingIndexContent(indexPatch, source.indexContent);
    source.chunking = Object.assign({}, baseChunking, {
      mode: mode,
      strategyLabel: processingModeLabel(mode),
      maxChars: maxChars,
      overlapPercent: overlapPercent,
      separator: separator,
      separatorType: separatorType,
      separatorPreset: separatorType,
      customSeparator: customSeparator,
      pagesPerChunk: pagesPerChunk,
      longDocumentFallback: longDocumentFallback,
      mergeShortChunks: Object.prototype.hasOwnProperty.call(input, "mergeShortChunks") ? input.mergeShortChunks === true : baseChunking.mergeShortChunks !== false,
      includeContext: Object.prototype.hasOwnProperty.call(input, "includeContext") ? input.includeContext === true : baseChunking.includeContext !== false
    });
    if (mode !== baseChunking.mode) {
      source.chunking.strategy = {
        smart: "auto_structure_recursive_length_fallback",
        semantic: "semantic_boundary",
        structure: "parsed_structure_boundary",
        separator: "delimiter_boundary",
        recursive: "recursive_character",
        fixed: "fixed_length",
        page: "page_boundary",
        whole_document: "whole_document"
      }[mode];
      source.chunking.usesSemanticModel = mode === "semantic";
    }
    if (mode === "semantic") {
      Object.assign(source.chunking, {
        semanticSensitivity: semanticSensitivity,
        breakpointPercentile: semanticBreakpointPercentile,
        semanticMinChars: semanticMinChars,
        sentenceWindow: 1,
        fallbackMode: "smart",
        overlapPercent: 0
      });
    } else {
      ["semanticSensitivity", "breakpointPercentile", "semanticMinChars", "sentenceWindow", "fallbackMode"].forEach(function removeSemanticField(key) {
        delete source.chunking[key];
      });
    }
    if (mode === "recursive") {
      Object.assign(source.chunking, {
        strategy: "recursive_character",
        recursiveBoundaries: RECURSIVE_BOUNDARIES.slice(),
        keepSeparator: true,
        usesSemanticModel: false
      });
      ["separator", "separatorType", "separatorPreset", "customSeparator", "targetTokens", "maxTokens", "overlapTokens"].forEach(function removeSingleBoundaryField(key) {
        delete source.chunking[key];
      });
    } else {
      delete source.chunking.recursiveBoundaries;
      delete source.chunking.keepSeparator;
    }
    if (mode !== "fixed") {
      ["targetTokens", "maxTokens", "overlapTokens"].forEach(function removeLegacyTokenSetting(key) { delete source.chunking[key]; });
    }
    if (mode === "whole_document") {
      source.chunking.includeContext = false;
      source.chunking.maxDocumentChars = maxChars;
    }
    source.indexContent = indexContent;
    source.requirements = processingRequirements(mode, indexContent, source.requirements);
    return source;
  }

  function processingProfileSnapshot(profile, parameters) {
    var normalized = normalizedProcessingProfile(profile, parameters);
    if (!normalized) return null;
    return Object.assign(normalized, {
      sourceProfileId: profile.id,
      snapshotAt: nowIso()
    });
  }

  function processingParametersSnapshot(profileSnapshot) {
    if (!profileSnapshot || !profileSnapshot.chunking) return null;
    var chunking = profileSnapshot.chunking;
    var snapshot = {
      mode: chunking.mode,
      maxChars: chunking.maxChars,
      overlapPercent: chunking.overlapPercent,
      separator: chunking.separator,
      separatorType: chunking.separatorType,
      separatorPreset: chunking.separatorPreset,
      customSeparator: chunking.customSeparator,
      pagesPerChunk: chunking.pagesPerChunk,
      longDocumentFallback: chunking.longDocumentFallback,
      mergeShortChunks: chunking.mergeShortChunks,
      includeContext: chunking.includeContext,
      indexContent: OpsDemo.utils.clone(profileSnapshot.indexContent || {})
    };
    if (chunking.mode === "semantic") {
      Object.assign(snapshot, {
        semanticSensitivity: chunking.semanticSensitivity,
        breakpointPercentile: chunking.breakpointPercentile,
        semanticMinChars: chunking.semanticMinChars,
        sentenceWindow: chunking.sentenceWindow,
        fallbackMode: chunking.fallbackMode
      });
    }
    if (chunking.mode === "recursive") {
      snapshot.strategy = chunking.strategy;
      snapshot.recursiveBoundaries = chunking.recursiveBoundaries.slice();
      snapshot.keepSeparator = chunking.keepSeparator;
      snapshot.usesSemanticModel = false;
    }
    return snapshot;
  }

  function normalizeMineruParseConfig(baseConfig, patch) {
    var defaults = {
      effort: "medium",
      parseMethod: "auto",
      executionMode: "local",
      remoteAuthorized: false,
      textContentEnabled: true,
      layoutStructureEnabled: true,
      tableEnabled: true,
      formulaEnabled: true,
      imageAnalysisEnabled: false,
      returnContentList: true,
      returnImages: true,
      preserveLocators: true
    };
    var base = Object.assign({}, defaults, baseConfig || {});
    var input = patch || {};
    var next = Object.assign({}, base, input);
    if (Object.prototype.hasOwnProperty.call(input, "effort") && ["medium", "high"].indexOf(input.effort) < 0) return null;
    if (["auto", "txt", "ocr"].indexOf(next.parseMethod) < 0) return null;
    if (["local", "remote"].indexOf(next.executionMode) < 0) return null;
    if (next.executionMode === "remote" && !next.remoteAuthorized) return null;

    var baseOwnsImageAnalysis = Object.prototype.hasOwnProperty.call(baseConfig || {}, "imageAnalysisEnabled");
    var baseVisualUnderstanding = baseOwnsImageAnalysis
      ? baseConfig.imageAnalysisEnabled === true
      : base.imageUnderstandingEnabled === true || base.chartUnderstandingEnabled === true;
    var ownsImageAnalysis = Object.prototype.hasOwnProperty.call(input, "imageAnalysisEnabled");
    var ownsSplitVisualUnderstanding = Object.prototype.hasOwnProperty.call(input, "imageUnderstandingEnabled") || Object.prototype.hasOwnProperty.call(input, "chartUnderstandingEnabled");
    var visualUnderstanding = ownsImageAnalysis
      ? input.imageAnalysisEnabled === true
      : ownsSplitVisualUnderstanding
        ? input.imageUnderstandingEnabled === true || input.chartUnderstandingEnabled === true
        : baseVisualUnderstanding;

    next.textContentEnabled = true;
    next.layoutStructureEnabled = true;
    next.returnContentList = true;
    next.preserveLocators = true;
    next.tableEnabled = next.tableEnabled !== false;
    next.formulaEnabled = next.formulaEnabled !== false;
    next.returnImages = true;
    next.imageAnalysisEnabled = visualUnderstanding;
    next.effort = visualUnderstanding ? "high" : "medium";
    delete next.imageUnderstandingEnabled;
    delete next.chartUnderstandingEnabled;
    return next;
  }

  function getProcessingProfileCompatibility(profile, parseConfig) {
    var missing = [];
    var requirements = profile && profile.requirements || {};
    var config = normalizeMineruParseConfig(null, parseConfig || {}) || normalizeMineruParseConfig();
    if (requirements.tableContent && config.tableEnabled === false) missing.push("表格解析");
    if (requirements.imageText && !config.imageAnalysisEnabled) missing.push("图片 / 图表内容理解");
    var profileAvailable = Boolean(profile);
    var message = "系统预置处理方案可用";
    if (!profile) message = "系统预置处理方案不可用";
    else if (missing.length) message = "可使用；以下解析内容不会进入索引：" + missing.join("、");
    return {
      compatible: profileAvailable,
      completeOutput: profileAvailable && !missing.length,
      missing: missing,
      message: message
    };
  }


  var DOCUMENT_STATUS_META = {
    uploaded: { label: "已上传", legacy: "uploaded" },
    processed: { label: "已切块", legacy: "processed" },
    ready: { label: "可检索", legacy: "effective" },
    parsing: { label: "文档解析中", legacy: "processing" },
    chunking: { label: "切片处理中", legacy: "processing" },
    embedding: { label: "向量化中", legacy: "processing" },
    indexing: { label: "等待索引", legacy: "pending_activation" },
    failed: { label: "处理失败", legacy: "failed" }
  };

  function formatFileSize(bytes) {
    var size = Number(bytes || 0);
    if (size >= 1048576) return (size / 1048576).toFixed(size >= 10485760 ? 0 : 1) + " MB";
    if (size >= 1024) return Math.round(size / 1024) + " KB";
    return size + " B";
  }

  function setDocumentStatus(documentItem, status, options) {
    var input = options || {};
    var meta = DOCUMENT_STATUS_META[status] || DOCUMENT_STATUS_META.parsing;
    var progress = input.progress == null ? (status === "ready" ? 100 : 0) : Number(input.progress);
    var label = input.label || meta.label + (progress > 0 && progress < 100 ? " " + progress + "%" : "");
    documentItem.status = status;
    documentItem.statusLabel = label;
    documentItem.statusProgress = progress;
    documentItem.currentStage = status;
    documentItem.lifecycleStatus = meta.legacy;
    documentItem.lifecycleStatusLabel = label;
    if (status === "ready") documentItem.searchable = true;
    else if (!input.keepSearchable) documentItem.searchable = false;
    return documentItem;
  }

  function createImportedDocument(options) {
    var input = options || {};
    var documentId = input.id || OpsDemo.utils.id("DOC");
    var fileSizeBytes = Number(input.fileSizeBytes == null ? (input.size == null ? 1258291 : input.size) : input.fileSizeBytes);
    var documentItem = {
      id: documentId,
      localAssetId: input.localAssetId || documentId,
      knowledgeBaseId: input.knowledgeBaseId,
      name: input.name,
      documentType: input.documentType || "导入材料",
      pageCount: Number(input.pageCount || 12),
      fileSizeBytes: fileSizeBytes,
      fileSizeLabel: formatFileSize(fileSizeBytes),
      mimeType: input.mimeType || input.type || "application/octet-stream",
      lastModified: Number(input.lastModified || 0),
      contentHash: input.contentHash || null,
      characterCount: Number(input.characterCount == null ? 32000 : input.characterCount),
      chunkCount: Number(input.chunkCount == null ? 72 : input.chunkCount),
      chunkingEstimate: input.chunkingEstimate ? OpsDemo.utils.clone(input.chunkingEstimate) : null,
      upstreamAccessLevel: input.accessLevel,
      effectiveAccessLevel: input.accessLevel,
      searchable: false,
      countsTowardDocumentTotal: true,
      importedAt: input.importedAt || nowIso(),
      pendingVectorization: true
    };
    documentItem.sourceFile = input.sourceFile || null;
    documentItem.sourcePreview = String(input.sourcePreview || "");
    documentItem.sourceType = input.sourceType || "local_upload";
    documentItem.sourceTypeLabel = input.sourceTypeLabel || "本地上传";
    return setDocumentStatus(documentItem, input.status || "indexing", {
      progress: input.statusProgress,
      label: input.statusLabel
    });
  }

  function reusableLocalAssetId(state, contentHash) {
    if (!contentHash) return null;
    var match = (state.documents || []).find(function findDocument(documentItem) {
      var isLocal = !documentItem.sourceType || documentItem.sourceType === "local_upload";
      return isLocal && documentItem.contentHash === contentHash;
    });
    return match ? match.localAssetId || match.id : null;
  }

  function createKnowledgeBase(payload) {
    var input = payload || {};
    return commit("knowledge-base-created", function mutate(state) {
      var explicitEmbeddingModel = input.embeddingModelId ? find(state.rag.modelCatalog.embeddingModels, input.embeddingModelId) : null;
      if (input.embeddingModelId && !isRagModelReady(explicitEmbeddingModel)) return null;
      var embeddingModel = explicitEmbeddingModel || state.rag.modelCatalog.embeddingModels.find(isRagModelReady);
      var createdAt = nowIso();
      var knowledgeBase = {
        id: OpsDemo.utils.id("KB"),
        name: input.name || "新建知识库",
        purpose: input.purpose || "待补充知识库用途。",
        createdAt: createdAt,
        updatedAt: createdAt,
        enabled: false,
        enabledState: "disabled",
        enabledStateLabel: "检索已关闭",
        retrievalStatus: "disabled",
        retrievalStatusLabel: "已关闭",
        minAccessLevel: input.minAccessLevel || "L1",
        minAccessLevelLabel: input.minAccessLevelLabel || "基础内部",
        documentCounts: { total: 0, searchable: 0, firstImportProcessing: 0, pendingActivation: 0, updatingWithPreviousVersionAvailable: 0 },
        openImportIssueCount: 0,
        currentIngestionProfileId: null,
        currentIngestionProfileName: "待选择",
        processingProfileSnapshot: null,
        processingParametersSnapshot: null,
        boundEmbeddingModelId: embeddingModel ? embeddingModel.id : null,
        boundVectorDimension: embeddingModel ? embeddingModel.dimension : null,
        mineruParseConfig: normalizeMineruParseConfig(),
        currentKnowledgeVersionId: null,
        contentUpdatedAt: createdAt,
        availabilityCheckedAt: null,
        hint: "0 个文件，导入并完成索引构建后可启用检索"
      };
      state.knowledgeBases.push(knowledgeBase);
      record(state, {
        objectType: "knowledge_base",
        objectId: knowledgeBase.id,
        objectName: knowledgeBase.name,
        action: "created",
        actionLabel: "新建",
        before: null,
        after: {
          enabled: false,
          minAccessLevel: knowledgeBase.minAccessLevel,
          ingestionProfileId: knowledgeBase.currentIngestionProfileId
        },
        impact: "知识库已创建，当前未启用检索；下一步可导入文件。"
      });
      return knowledgeBase;
    });
  }

  function updateKnowledgeBase(id, payload) {
    var input = payload || {};
    return commit("knowledge-base-updated", function mutate(state) {
      var knowledgeBase = find(state.knowledgeBases, id);
      if (!knowledgeBase || knowledgeBase.benchmarkReadOnly) return null;
      var name = String(input.name == null ? knowledgeBase.name : input.name).trim();
      var purpose = String(input.purpose == null ? knowledgeBase.purpose : input.purpose).trim();
      if (!name || !purpose) return null;
      if (state.knowledgeBases.some(function some(item) { return item.id !== id && String(item.name || "").toLowerCase() === name.toLowerCase(); })) return null;
      var before = { name: knowledgeBase.name, purpose: knowledgeBase.purpose };
      knowledgeBase.name = name;
      knowledgeBase.purpose = purpose;
      knowledgeBase.updatedAt = nowIso();
      record(state, {
        objectType: "knowledge_base",
        objectId: knowledgeBase.id,
        objectName: knowledgeBase.name,
        action: "updated",
        actionLabel: "编辑",
        before: before,
        after: { name: knowledgeBase.name, purpose: knowledgeBase.purpose },
        impact: "更新知识库名称与描述；文件、索引、权限和检索状态未改变。"
      });
      return knowledgeBase;
    });
  }

  function deleteKnowledgeBase(id) {
    return commit("knowledge-base-deleted", function mutate(state) {
      var knowledgeBase = find(state.knowledgeBases, id);
      if (!knowledgeBase || knowledgeBase.enabled || knowledgeBase.benchmarkReadOnly) return null;
      var before = {
        name: knowledgeBase.name,
        purpose: knowledgeBase.purpose,
        documentCount: knowledgeBase.documentCounts && knowledgeBase.documentCounts.total || 0
      };
      state.knowledgeBases.splice(state.knowledgeBases.indexOf(knowledgeBase), 1);
      state.documents = (state.documents || []).filter(function filter(item) { return item.knowledgeBaseId !== id; });
      state.chunks = (state.chunks || []).filter(function filter(item) { return item.knowledgeBaseId !== id; });
      state.importBatches = (state.importBatches || []).filter(function filter(item) { return item.knowledgeBaseId !== id; });
      state.knowledgeVersions = (state.knowledgeVersions || []).filter(function filter(item) { return item.knowledgeBaseId !== id; });
      if (state.rag) state.rag.retrievalTests = (state.rag.retrievalTests || []).filter(function filter(item) { return item.knowledgeBaseId !== id; });
      if (state.overview && state.overview.pendingItems) {
        state.overview.pendingItems = state.overview.pendingItems.filter(function filter(item) {
          return String(item.route || "").indexOf("/knowledge/" + id) < 0;
        });
      }
      record(state, {
        objectType: "knowledge_base",
        objectId: id,
        objectName: before.name,
        action: "deleted",
        actionLabel: "删除",
        before: before,
        after: null,
        impact: "知识库及其文件、切片、向量和索引数据已删除。"
      });
      return knowledgeBase;
    });
  }

  function setKnowledgeBaseOnboardingConfig(id, payload) {
    var input = payload || {};
    var isLocal = id === "local-documents";
    return commit("knowledge-base-onboarding-configured", function mutate(state) {
      var knowledgeBase = isLocal ? getLocalDocumentImportContext(input.batchId) : find(state.knowledgeBases, id);
      if (!knowledgeBase || knowledgeBase.benchmarkReadOnly) return null;
      if (isLocal && !input.batchId) return null;
      if (input.completed && !isLocal && !isKnowledgeBaseEmbeddingReady(state, knowledgeBase)) return null;
      var before = {
        ingestionProfileId: knowledgeBase.currentIngestionProfileId,
        mineruParseConfig: Object.assign({}, knowledgeBase.mineruParseConfig || {})
      };
      var selectedProcessingProfile = find(state.rag.ingestionProfiles, input.ingestionProfileId || knowledgeBase.currentIngestionProfileId);
      var nextParseConfig = normalizeMineruParseConfig(null, knowledgeBase.mineruParseConfig || {}) || normalizeMineruParseConfig();
      var suppliedProcessingParameters = input.processingParameters || input.processingOverrides || null;
      var selectedProcessingSnapshot = selectedProcessingProfile ? processingProfileSnapshot(selectedProcessingProfile, suppliedProcessingParameters) : null;
      if (suppliedProcessingParameters && !selectedProcessingSnapshot) return null;

      if (input.mineruParseConfig) {
        nextParseConfig = normalizeMineruParseConfig(nextParseConfig, input.mineruParseConfig);
        if (!nextParseConfig) return null;
        if (selectedProcessingProfile && !getProcessingProfileCompatibility(selectedProcessingProfile, nextParseConfig).compatible) return null;
      }

      if (input.completed && (!selectedProcessingProfile || !getProcessingProfileCompatibility(selectedProcessingProfile, nextParseConfig).compatible)) return null;
      knowledgeBase.mineruParseConfig = nextParseConfig;

      if (input.ingestionProfileId) {
        var nextProfile = selectedProcessingProfile;
        var compatibility = getProcessingProfileCompatibility(nextProfile, knowledgeBase.mineruParseConfig);
        if (!nextProfile || !compatibility.compatible) return null;
        knowledgeBase.currentIngestionProfileId = nextProfile.id;
        knowledgeBase.currentIngestionProfileName = nextProfile.name;
        knowledgeBase.processingProfileSnapshot = OpsDemo.utils.clone(selectedProcessingSnapshot);
        knowledgeBase.processingParametersSnapshot = processingParametersSnapshot(selectedProcessingSnapshot);
      }

      if (input.completed) {
        selectedProcessingProfile = find(state.rag.ingestionProfiles, knowledgeBase.currentIngestionProfileId);
        var completionCompatibility = getProcessingProfileCompatibility(selectedProcessingProfile, knowledgeBase.mineruParseConfig);
        if (!selectedProcessingProfile || !completionCompatibility.compatible) return null;
        var completionSnapshot = selectedProcessingSnapshot && selectedProcessingSnapshot.id === selectedProcessingProfile.id ? selectedProcessingSnapshot : null;
        if (!completionSnapshot && !input.ingestionProfileId && knowledgeBase.processingProfileSnapshot && (knowledgeBase.processingProfileSnapshot.sourceProfileId === selectedProcessingProfile.id || knowledgeBase.processingProfileSnapshot.id === selectedProcessingProfile.id)) {
          completionSnapshot = OpsDemo.utils.clone(knowledgeBase.processingProfileSnapshot);
        }
        completionSnapshot = completionSnapshot || processingProfileSnapshot(selectedProcessingProfile, suppliedProcessingParameters);
        if (!completionSnapshot) return null;
        knowledgeBase.processingProfileSnapshot = OpsDemo.utils.clone(completionSnapshot);
        knowledgeBase.processingParametersSnapshot = processingParametersSnapshot(completionSnapshot);
        knowledgeBase.onboardingCompletedAt = nowIso();
        var pendingBatches = state.importBatches.filter(function filter(batch) {
          var sameScope = isLocal ? batch.processingScope === "local-documents" : batch.knowledgeBaseId === id;
          return sameScope && batch.status === "pending_configuration" && (!input.batchId || batch.id === input.batchId);
        });
        pendingBatches.forEach(function activate(batch) {
          batch.successCount = 0;
          batch.processingCount = 0;
          batch.activatedAt = nowIso();
          batch.ingestionProfileId = knowledgeBase.currentIngestionProfileId;
          batch.mineruParseConfig = Object.assign({}, knowledgeBase.mineruParseConfig || {});
          batch.processingProfileSnapshot = OpsDemo.utils.clone(knowledgeBase.processingProfileSnapshot);
          batch.processingParametersSnapshot = OpsDemo.utils.clone(knowledgeBase.processingParametersSnapshot);
          batch.embeddingModelIdSnapshot = isLocal ? null : knowledgeBase.boundEmbeddingModelId;
          var createdCount = 0;
          (batch.items || []).forEach(function startItem(item) {
            if (item.operation === "skip" || item.status === "skipped") return;
            if (isLocal && reusableLocalAssetId(state, item.contentHash)) {
              item.operation = "skip";
              item.status = "skipped";
              item.statusLabel = "内容相同，已跳过";
              batch.skippedCount += 1;
              return;
            }
            if (item.operation === "replace") {
              item.status = "replacement_staged";
              item.statusLabel = "待确认替换";
              item.availableActions = ["confirm_replacement"];
              return;
            }
            var documentId = OpsDemo.utils.id("DOC");
            var shape = estimateDocumentShape({ size: item.fileSizeBytes, characterCount: item.characterCount }, batch.processingProfileSnapshot);
            item.processingEstimate = OpsDemo.utils.clone(shape);
            item.documentId = documentId;
            item.status = "success";
            item.statusLabel = "处理完成";
            item.countsTowardDocumentTotal = !isLocal;
            item.availableActions = ["view_document"];
            item.pipeline = [
              { key: "receive", label: "文件接收", status: "success" },
              { key: "mineru", label: "MinerU 解析", status: "success" },
              { key: "chunk", label: "结构化切片", status: "success" },
              { key: "embedding", label: "向量化", status: "success" },
              { key: "index", label: "索引构建", status: "success" }
            ];
            if (isLocal) item.pipeline = item.pipeline.slice(0, 3);
            var documentItem = createImportedDocument({
              id: documentId,
              localAssetId: reusableLocalAssetId(state, item.contentHash) || documentId,
              knowledgeBaseId: isLocal ? null : id,
              accessLevel: knowledgeBase.minAccessLevel,
              name: item.fileName,
              size: item.fileSizeBytes,
              type: item.type,
              lastModified: item.lastModified,
              contentHash: item.contentHash,
              sourceFile: item.sourceFile,
              sourcePreview: item.sourcePreview,
              characterCount: shape.characterCount,
              chunkCount: shape.chunkCount,
              chunkingEstimate: shape,
              importedAt: batch.createdAt,
              status: isLocal ? "processed" : "indexing",
              statusProgress: isLocal ? 100 : 0
            });
            if (isLocal) {
              documentItem.pendingVectorization = false;
              documentItem.countsTowardDocumentTotal = false;
              documentItem.processingProfileSnapshot = OpsDemo.utils.clone(batch.processingProfileSnapshot);
              documentItem.mineruParseConfig = Object.assign({}, batch.mineruParseConfig);
              addImportPreviewChunks(state, documentItem, shape);
            }
            state.documents.unshift(documentItem);
            createdCount += 1;
            batch.successCount += 1;
          });
          if (!isLocal) {
            knowledgeBase.documentCounts.total += createdCount;
            knowledgeBase.documentCounts.pendingActivation += createdCount;
            knowledgeBase.contentUpdatedAt = nowIso();
          }
          if (createdCount && !isLocal) {
            var candidate = createCandidateVersion(state, knowledgeBase, createdCount, { sourceType: "import_batch", sourceBatchIds: [batch.id] });
            batch.candidateKnowledgeVersionId = candidate.id;
            makeKnowledgeVersionEffective(state, knowledgeBase, candidate);
          }
          batch.status = batch.pendingReplacementCount ? "awaiting_replacement_confirmation" : "completed";
          batch.statusLabel = batch.pendingReplacementCount ? "待确认替换" : "已完成";
        });
      }
      knowledgeBase.updatedAt = nowIso();
      record(state, {
        objectType: isLocal ? "local_document_import" : "knowledge_base",
        objectId: knowledgeBase.id,
        objectName: knowledgeBase.name,
        action: input.completed ? "onboarding_completed" : "parse_configured",
        actionLabel: input.completed ? (isLocal ? "完成文档处理" : "完成创建配置") : "配置文档解析",
        before: before,
        after: {
          ingestionProfileId: knowledgeBase.currentIngestionProfileId,
          mineruParseConfig: Object.assign({}, knowledgeBase.mineruParseConfig || {}),
          processingParametersSnapshot: knowledgeBase.processingParametersSnapshot ? OpsDemo.utils.clone(knowledgeBase.processingParametersSnapshot) : null
        },
        impact: input.completed ? (isLocal ? "文档已完成解析与切块，可查看处理结果。" : "解析配置已保存，已接收文件按系统预置方案完成处理并建立索引。") : "新导入文件将按所选 MinerU 解析配置进行结构化抽取。"
      });
      return knowledgeBase;
    });
  }

  function setKnowledgeBaseEnabled(id, enabled) {
    return commit("knowledge-base-enabled", function mutate(state) {
      var knowledgeBase = find(state.knowledgeBases, id);
      if (!knowledgeBase || knowledgeBase.benchmarkReadOnly) return null;
      if (enabled) {
        if (!knowledgeBase.currentKnowledgeVersionId || !isKnowledgeBaseEmbeddingReady(state, knowledgeBase)) return null;
      }
      var before = knowledgeBase.enabledStateLabel;
      if (!enabled && knowledgeBase.retrievalStatus !== "disabled") {
        knowledgeBase.retrievalStatusBeforeDisable = knowledgeBase.retrievalStatus;
        knowledgeBase.retrievalStatusLabelBeforeDisable = knowledgeBase.retrievalStatusLabel;
      }
      knowledgeBase.enabled = Boolean(enabled);
      knowledgeBase.enabledState = enabled ? "enabled" : "disabled";
      knowledgeBase.enabledStateLabel = enabled ? "检索已启用" : "检索已关闭";
      knowledgeBase.retrievalStatus = enabled ? (knowledgeBase.retrievalStatusBeforeDisable || (knowledgeBase.currentKnowledgeVersionId ? "available" : "unavailable")) : "disabled";
      knowledgeBase.retrievalStatusLabel = enabled ? (knowledgeBase.retrievalStatusLabelBeforeDisable || (knowledgeBase.currentKnowledgeVersionId ? "可检索" : "索引尚未就绪")) : "已关闭";
      knowledgeBase.updatedAt = nowIso();
      record(state, {
        objectType: "knowledge_base",
        objectId: id,
        objectName: knowledgeBase.name,
        action: enabled ? "enabled" : "disabled",
        actionLabel: enabled ? "启用检索" : "关闭检索",
        before: { state: before },
        after: { state: knowledgeBase.enabledStateLabel },
        impact: enabled ? "恢复接收符合访问等级的检索请求。" : "停止新检索请求，文件和权限配置均保留。"
      });
      return knowledgeBase;
    });
  }

  function normalizeFiles(payload) {
    var files = payload && payload.files ? Array.prototype.slice.call(payload.files) : [];
    if (!files.length && payload && payload.fileNames) files = payload.fileNames;
    if (!files.length) files = ["新供应商合规材料.pdf"];
    return files.map(function map(item) {
      var source = typeof item === "string" ? { name: item } : item || {};
      var name = String(source.name || "未命名文件").trim();
      var size = Number.isFinite(Number(source.size)) ? Number(source.size) : 1258291;
      var type = String(source.type || inferFileType(name));
      var lastModified = Number.isFinite(Number(source.lastModified)) ? Number(source.lastModified) : 0;
      var contentHash = String(source.contentHash || source.hash || simulatedContentHash(name, size, type, lastModified));
      return {
        name: name,
        size: size,
        type: type,
        lastModified: lastModified,
        contentHash: contentHash,
        characterCount: source.characterCount != null && Number.isFinite(Number(source.characterCount)) ? Number(source.characterCount) : (source.sourcePreview ? String(source.sourcePreview).length : null),
        sourceFile: source.sourceFile || (typeof source.arrayBuffer === "function" ? source : null),
        sourcePreview: String(source.sourcePreview || "")
      };
    });
  }

  function inferFileType(name) {
    var extension = String(name || "").split(".").pop().toLowerCase();
    return {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      txt: "text/plain"
    }[extension] || "application/octet-stream";
  }

  function simulatedContentHash(name, size, type, lastModified) {
    var source = [String(name || "").toLowerCase(), Number(size || 0), String(type || ""), Number(lastModified || 0)].join("|");
    var hash = 2166136261;
    for (var index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return "mock:" + ("00000000" + (hash >>> 0).toString(16)).slice(-8);
  }

  function existingDocumentContentHash(documentItem) {
    if (documentItem.contentHash) return String(documentItem.contentHash);
    return simulatedContentHash(
      documentItem.name,
      documentItem.fileSizeBytes,
      documentItem.mimeType,
      documentItem.lastModified
    );
  }

  function sameDocumentName(left, right) {
    return String(left || "").trim().toLocaleLowerCase() === String(right || "").trim().toLocaleLowerCase();
  }

  function estimateDocumentShape(candidate, processingProfile) {
    var chunking = processingProfile && processingProfile.chunking || {};
    var mode = chunking.mode || "smart";
    var maxChars = Number(chunking.maxChars || 1200);
    var characterCount = candidate.characterCount == null ? Math.max(800, Math.round(Number(candidate.size || 0) * 0.03)) : candidate.characterCount;
    var fillRate = 0.82;
    if (mode === "semantic") {
      fillRate = { low: 0.78, balanced: 0.68, high: 0.56 }[chunking.semanticSensitivity] || 0.68;
    }
    var estimatedChunkChars = Math.max(200, Math.round(maxChars * fillRate));
    var semantic = mode === "semantic";
    return {
      characterCount: characterCount,
      chunkCount: Math.max(1, Math.ceil(characterCount / estimatedChunkChars)),
      estimatedChunkChars: estimatedChunkChars,
      boundaryFillRate: fillRate,
      extraEmbeddingCostLevel: semantic ? "high" : "none",
      extraEmbeddingCostLabel: semantic ? "较高" : "无额外切片向量计算",
      embeddingStages: semantic ? [
        { key: "semantic_boundary_embedding", label: "语义边界向量计算", extraCost: true },
        { key: "final_chunk_embedding", label: "最终切片向量化", extraCost: false }
      ] : [
        { key: "final_chunk_embedding", label: "最终切片向量化", extraCost: false }
      ]
    };
  }

  function importItemFromCandidate(candidate, operation, existingDocument) {
    return {
      id: OpsDemo.utils.id("IMP-ITEM"),
      documentId: existingDocument ? existingDocument.id : null,
      existingDocumentId: existingDocument ? existingDocument.id : null,
      fileName: candidate.name,
      name: candidate.name,
      size: candidate.size,
      fileSizeBytes: candidate.size,
      type: candidate.type,
      lastModified: candidate.lastModified,
      contentHash: candidate.contentHash,
      characterCount: candidate.characterCount,
      sourceFile: candidate.sourceFile,
      sourcePreview: candidate.sourcePreview,
      operation: operation,
      countsTowardDocumentTotal: operation === "create",
      availableActions: operation === "replace" ? ["confirm_replacement"] : []
    };
  }

  function recursiveTextChunks(text, chunking) {
    var maxChars = chunking.maxChars;
    var overlapChars = Math.floor(maxChars * chunking.overlapPercent / 100);
    // Keep separators in the preceding piece; only oversized pieces descend.
    var boundaries = [/\r?\n(?:[ \t]*\r?\n)+/g, /\r\n|\r|\n/g, /[。！？]+|[.!?]+(?=\s|$)/g, /[^\S\r\n]+/g];
    function splitPieces(value, level) {
      if (value.length <= maxChars) return [value];
      if (level >= boundaries.length) return Array.from(value);
      var pattern = new RegExp(boundaries[level].source, "g");
      var pieces = [];
      var start = 0;
      var match;
      while ((match = pattern.exec(value))) {
        var end = match.index + match[0].length;
        pieces.push(value.slice(start, end));
        start = end;
      }
      if (!pieces.length) return splitPieces(value, level + 1);
      if (start < value.length) pieces.push(value.slice(start));
      return pieces.reduce(function descend(result, piece) {
        return result.concat(splitPieces(piece, level + 1));
      }, []);
    }
    var chunks = [];
    var pending = [];
    var length = 0;
    splitPieces(text, 0).forEach(function merge(piece) {
      if (length + piece.length > maxChars && pending.length) {
        chunks.push(pending.join(""));
        // Boundary-aligned overlap is a cap, not padding to a fixed length.
        while (pending.length && (length > overlapChars || length + piece.length > maxChars)) length -= pending.shift().length;
      }
      pending.push(piece);
      length += piece.length;
    });
    if (pending.length) chunks.push(pending.join(""));
    return chunks;
  }

  function addImportPreviewChunks(state, documentItem, shape) {
    var sourceText = String(documentItem.sourcePreview || "");
    var contents = [];
    var previewSize = shape.estimatedChunkChars;
    var chunking = documentItem.processingProfileSnapshot && documentItem.processingProfileSnapshot.chunking || {};
    if (sourceText && chunking.mode === "recursive") {
      contents = recursiveTextChunks(sourceText, chunking);
    } else if (sourceText) {
      for (var offset = 0; offset < sourceText.length; offset += previewSize) {
        contents.push(sourceText.slice(offset, offset + previewSize));
      }
    } else {
      contents = [
        documentItem.name + " · 文档解析内容示例。",
        "此处展示文件正文的切块效果，正式接入后将呈现解析得到的原文内容。",
        "切块保留文件名、章节与位置等关联信息，便于后续引用定位。"
      ];
    }
    state.chunks = state.chunks || [];
    contents.forEach(function addPreviewChunk(content, index) {
      state.chunks.push({
        id: OpsDemo.utils.id("CHK"),
        documentId: documentItem.id,
        knowledgeBaseId: documentItem.knowledgeBaseId,
        index: index + 1,
        characterCount: content.length,
        content: content,
        origin: "import",
        createdAt: nowIso(),
        status: "processed"
      });
    });
    documentItem.chunkCount = contents.length;
  }

  function markDocumentReplacementStaged(documentItem, batch, item) {
    documentItem.pendingReplacement = {
      batchId: batch.id,
      itemId: item.id,
      status: "staged",
      statusLabel: "待确认替换",
      name: item.fileName,
      size: item.fileSizeBytes,
      type: item.type,
      lastModified: item.lastModified,
      contentHash: item.contentHash,
      stagedAt: batch.createdAt
    };
  }

  function createCandidateVersion(state, knowledgeBase, addedCount, options) {
    var candidateOptions = options || {};
    var active = find(state.knowledgeVersions, knowledgeBase.currentKnowledgeVersionId);
    var candidate = candidateOptions.forceNew ? null : state.knowledgeVersions.find(function each(item) {
      return item.knowledgeBaseId === knowledgeBase.id && (item.status === "building" || item.status === "pending_validation" || item.status === "pending_activation");
    });
    if (!candidate) {
      candidate = {
        id: OpsDemo.utils.id("KV"),
        knowledgeBaseId: knowledgeBase.id,
        createdAt: nowIso(),
        sourceType: candidateOptions.sourceType || "ingestion_profile_change",
        sourceBatchIds: Array.from(new Set(candidateOptions.sourceBatchIds || [])),
        status: "pending_validation",
        statusLabel: "索引待验证",
        progress: 100,
        documentCount: knowledgeBase.documentCounts.total,
        chunkCount: (active ? active.chunkCount : 0) + addedCount * 72,
        indexSizeGb: Number(((active ? active.indexSizeGb : 0) + addedCount * 0.014).toFixed(2)),
        buildDurationMinutes: 3,
        ingestionProfileId: candidateOptions.ingestionProfileId || knowledgeBase.currentIngestionProfileId,
        canRollbackFrom: false,
        canActivate: false
      };
      state.knowledgeVersions.unshift(candidate);
    } else {
      candidate.status = "pending_validation";
      candidate.statusLabel = "索引待验证";
      candidate.progress = 100;
      candidate.documentCount = knowledgeBase.documentCounts.total;
      candidate.chunkCount += addedCount * 72;
      candidate.indexSizeGb = Number((candidate.indexSizeGb + addedCount * 0.014).toFixed(2));
      candidate.canActivate = false;
      if (candidateOptions.sourceType === "import_batch") candidate.sourceType = "import_batch";
      candidate.sourceBatchIds = Array.from(new Set((candidate.sourceBatchIds || []).concat(candidateOptions.sourceBatchIds || [])));
    }
    return candidate;
  }

  function makeKnowledgeVersionEffective(state, knowledgeBase, version) {
    var previousId = knowledgeBase.currentKnowledgeVersionId;
    state.knowledgeVersions.forEach(function archive(item) {
      if (item.knowledgeBaseId === knowledgeBase.id && item.id !== version.id && item.status === "effective") {
        item.status = "historical";
        item.statusLabel = "已归档索引";
        item.canRollbackFrom = true;
      }
    });
    version.status = "effective";
    version.statusLabel = "索引可用";
    version.progress = 100;
    version.canActivate = false;
    version.canRollbackFrom = true;
    knowledgeBase.currentKnowledgeVersionId = version.id;
    knowledgeBase.documentCounts.searchable = version.documentCount;
    knowledgeBase.documentCounts.pendingActivation = 0;
    knowledgeBase.documentCounts.firstImportProcessing = 0;
    knowledgeBase.retrievalStatus = knowledgeBase.enabled ? "available" : "disabled";
    knowledgeBase.retrievalStatusLabel = knowledgeBase.enabled ? "可检索" : "已关闭";
    knowledgeBase.hint = knowledgeBase.enabled ? "新导入文件已完成索引并可检索" : "新导入文件已完成索引，启用知识库后可检索";
    knowledgeBase.updatedAt = nowIso();
    state.importBatches.forEach(function linkResult(batch) {
      if (batch.knowledgeBaseId === knowledgeBase.id && batch.candidateKnowledgeVersionId === version.id) {
        batch.candidateKnowledgeVersionId = null;
        batch.resultingKnowledgeVersionId = version.id;
      }
    });
    state.documents.filter(function filter(item) {
      return item.knowledgeBaseId === knowledgeBase.id && item.countsTowardDocumentTotal;
    }).forEach(function publish(documentItem) {
      var pendingStatus = ["chunking", "embedding", "indexing"].indexOf(documentItem.status) >= 0 && documentItem.lifecycleStatus !== "updating";
      var pendingLegacyStatus = documentItem.lifecycleStatus === "pending_activation" || documentItem.lifecycleStatus === "processing";
      if (pendingStatus || pendingLegacyStatus) {
        setDocumentStatus(documentItem, "ready");
        documentItem.pendingVectorization = false;
      }
    });
    return previousId;
  }

  function startKnowledgeImport(knowledgeBaseId, payload) {
    var isLocal = knowledgeBaseId === "local-documents";
    if (isLocal && !(payload && payload.files && payload.files.length)) return null;
    var fileCandidates = normalizeFiles(payload || {});
    var deferredRequested = isLocal || Boolean(payload && payload.deferred);
    return commit("knowledge-import-started", function mutate(state) {
      var knowledgeBase = isLocal ? getLocalDocumentImportContext() : find(state.knowledgeBases, knowledgeBaseId);
      if (!knowledgeBase || knowledgeBase.benchmarkReadOnly) return null;
      var deferred = deferredRequested || !knowledgeBase.currentIngestionProfileId;
      if (!deferred && !isKnowledgeBaseEmbeddingReady(state, knowledgeBase)) return null;
      var currentProcessingProfile = deferred ? null : knowledgeBase.processingProfileSnapshot;
      var currentSnapshotSourceId = currentProcessingProfile && (currentProcessingProfile.sourceProfileId || currentProcessingProfile.id);
      if (!deferred && (!currentProcessingProfile || currentSnapshotSourceId !== knowledgeBase.currentIngestionProfileId)) return null;
      var effectiveParseConfig = normalizeMineruParseConfig(null, knowledgeBase.mineruParseConfig || {}) || normalizeMineruParseConfig();
      knowledgeBase.mineruParseConfig = effectiveParseConfig;
      if (!deferred && !getProcessingProfileCompatibility(currentProcessingProfile, effectiveParseConfig).compatible) return null;
      var batch = {
        id: OpsDemo.utils.id("IMP"),
        knowledgeBaseId: isLocal ? null : knowledgeBaseId,
        processingScope: isLocal ? "local-documents" : "knowledge-base",
        createdAt: nowIso(),
        candidateKnowledgeVersionId: null,
        resultingKnowledgeVersionId: null,
        sourceType: "manual_upload",
        ingestionProfileId: deferred ? null : knowledgeBase.currentIngestionProfileId,
        mineruParseConfig: deferred ? null : Object.assign({}, effectiveParseConfig),
        processingProfileSnapshot: deferred ? null : OpsDemo.utils.clone(currentProcessingProfile),
        processingParametersSnapshot: deferred ? null : OpsDemo.utils.clone(knowledgeBase.processingParametersSnapshot || processingParametersSnapshot(currentProcessingProfile)),
        embeddingModelIdSnapshot: deferred ? null : knowledgeBase.boundEmbeddingModelId,
        inputCount: fileCandidates.length,
        successCount: 0,
        processingCount: 0,
        failureCount: 0,
        skippedCount: 0,
        pendingReplacementCount: 0,
        replacementCompletedCount: 0,
        status: "processing",
        statusLabel: "处理中",
        items: []
      };
      function matchingDocument(candidate) {
        return (state.documents || []).find(function each(documentItem) {
          return documentItem.knowledgeBaseId === knowledgeBaseId && sameDocumentName(documentItem.name, candidate.name);
        });
      }
      function classifyCandidate(candidate) {
        if (isLocal) {
          var localAssetId = reusableLocalAssetId(state, candidate.contentHash);
          var stagedDuplicate = batch.items.some(function sameContent(item) { return item.contentHash === candidate.contentHash; });
          return { operation: localAssetId || stagedDuplicate ? "skip" : "create", existingDocument: localAssetId ? find(state.documents, localAssetId) : null };
        }
        var existingDocument = matchingDocument(candidate);
        if (!existingDocument) return { operation: "create", existingDocument: null };
        if (existingDocumentContentHash(existingDocument) === candidate.contentHash) return { operation: "skip", existingDocument: existingDocument };
        return { operation: "replace", existingDocument: existingDocument };
      }
      if (deferred) {
        fileCandidates.forEach(function stage(candidate) {
          var classification = classifyCandidate(candidate);
          var item = importItemFromCandidate(candidate, classification.operation, classification.existingDocument);
          if (classification.operation === "skip") {
            item.status = "skipped";
            item.statusLabel = "内容相同，已跳过";
            item.availableActions = [];
            batch.skippedCount += 1;
          } else if (classification.operation === "replace") {
            item.status = "replacement_staged";
            item.statusLabel = "待配置并确认替换";
            batch.pendingReplacementCount += 1;
            markDocumentReplacementStaged(classification.existingDocument, batch, item);
          } else {
            item.status = "staged";
            item.statusLabel = "待配置";
          }
          batch.items.push(item);
        });
        var pendingConfigurationCount = batch.items.filter(function filter(item) { return item.status === "staged" || item.status === "replacement_staged"; }).length;
        batch.status = pendingConfigurationCount ? "pending_configuration" : "completed";
        batch.statusLabel = pendingConfigurationCount ? "待配置" : "已完成 · 已跳过重复内容";
        state.importBatches.unshift(batch);
        if (isLocal) {
          localImportContexts[batch.id] = Object.assign({}, knowledgeBase, { importBatchId: batch.id, mineruParseConfig: Object.assign({}, knowledgeBase.mineruParseConfig) });
          delete localImportContexts.new;
        } else {
          knowledgeBase.contentUpdatedAt = nowIso();
          knowledgeBase.updatedAt = knowledgeBase.contentUpdatedAt;
          knowledgeBase.hint = pendingConfigurationCount ? pendingConfigurationCount + " 个文件已接收，待配置解析与处理策略" : batch.skippedCount + " 个同内容文件已跳过";
        }
        return batch;
      }
      var createdCount = 0;
      fileCandidates.forEach(function each(candidate) {
        var classification = classifyCandidate(candidate);
        var item = importItemFromCandidate(candidate, classification.operation, classification.existingDocument);
        if (classification.operation === "skip") {
          item.status = "skipped";
          item.statusLabel = "内容相同，已跳过";
          item.availableActions = [];
          batch.skippedCount += 1;
        } else if (classification.operation === "replace") {
          item.status = "replacement_staged";
          item.statusLabel = "待确认替换";
          batch.pendingReplacementCount += 1;
          markDocumentReplacementStaged(classification.existingDocument, batch, item);
        } else {
          var shape = estimateDocumentShape(candidate, batch.processingProfileSnapshot);
          item.processingEstimate = OpsDemo.utils.clone(shape);
          var documentId = OpsDemo.utils.id("DOC");
          state.documents.unshift(createImportedDocument({
            id: documentId,
            localAssetId: reusableLocalAssetId(state, candidate.contentHash) || documentId,
            knowledgeBaseId: knowledgeBaseId,
            accessLevel: knowledgeBase.minAccessLevel,
            name: candidate.name,
            size: candidate.size,
            type: candidate.type,
            lastModified: candidate.lastModified,
            contentHash: candidate.contentHash,
            sourceFile: candidate.sourceFile,
            sourcePreview: candidate.sourcePreview,
            characterCount: shape.characterCount,
            chunkCount: shape.chunkCount,
            chunkingEstimate: shape,
            status: "indexing"
          }));
          item.documentId = documentId;
          item.status = "success";
          item.statusLabel = "待建立索引";
          item.availableActions = ["view_document"];
          createdCount += 1;
          batch.successCount += 1;
        }
        batch.items.push(item);
      });
      state.importBatches.unshift(batch);
      knowledgeBase.documentCounts.total += createdCount;
      knowledgeBase.documentCounts.pendingActivation += createdCount;
      knowledgeBase.contentUpdatedAt = nowIso();
      knowledgeBase.updatedAt = knowledgeBase.contentUpdatedAt;
      if (createdCount) {
        var candidate = createCandidateVersion(state, knowledgeBase, createdCount, { sourceType: "import_batch", sourceBatchIds: [batch.id] });
        batch.candidateKnowledgeVersionId = candidate.id;
        makeKnowledgeVersionEffective(state, knowledgeBase, candidate);
        batch.items.filter(function filter(item) { return item.operation === "create"; }).forEach(function markIndexed(item) { item.statusLabel = "处理完成"; });
      }
      batch.status = batch.pendingReplacementCount ? "awaiting_replacement_confirmation" : "completed";
      batch.statusLabel = batch.pendingReplacementCount ? "待确认替换" : (batch.skippedCount && !createdCount ? "已完成 · 已跳过重复内容" : "已完成");
      if (batch.pendingReplacementCount) knowledgeBase.hint = batch.pendingReplacementCount + " 个同名文件待确认替换，原文件仍可检索";
      else if (createdCount) knowledgeBase.hint = createdCount + " 个新文件已完成处理并进入检索范围";
      else knowledgeBase.hint = batch.skippedCount + " 个同内容文件已跳过";
      return batch;
    });
  }

  function confirmDocumentReplacement(batchId, itemId) {
    return commit("document-replacement-confirmed", function mutate(state) {
      var batch = find(state.importBatches, batchId);
      var item = batch && find(batch.items, itemId);
      var documentItem = item && find(state.documents, item.existingDocumentId || item.documentId);
      var knowledgeBase = batch && find(state.knowledgeBases, batch.knowledgeBaseId);
      if (!batch || !item || !documentItem || !knowledgeBase || item.operation !== "replace" || item.status !== "replacement_staged") return null;
      if (!isKnowledgeBaseEmbeddingReady(state, knowledgeBase)) return null;
      var processingProfile = batch.processingProfileSnapshot || knowledgeBase.processingProfileSnapshot;
      if (!processingProfile || !getProcessingProfileCompatibility(processingProfile, batch.mineruParseConfig || knowledgeBase.mineruParseConfig).compatible) return null;

      if (existingDocumentContentHash(documentItem) === item.contentHash) {
        item.operation = "skip";
        item.status = "skipped";
        item.statusLabel = "内容相同，已跳过";
        item.availableActions = [];
        batch.pendingReplacementCount = Math.max(0, Number(batch.pendingReplacementCount || 0) - 1);
        batch.skippedCount = Number(batch.skippedCount || 0) + 1;
        batch.status = batch.pendingReplacementCount ? "awaiting_replacement_confirmation" : "completed";
        batch.statusLabel = batch.pendingReplacementCount ? "待确认替换" : "已完成";
        delete documentItem.pendingReplacement;
        return documentItem;
      }

      var before = {
        contentHash: documentItem.contentHash,
        fileSizeBytes: documentItem.fileSizeBytes,
        characterCount: documentItem.characterCount,
        chunkCount: documentItem.chunkCount,
        searchable: documentItem.searchable
      };
      var shape = estimateDocumentShape({
        size: item.fileSizeBytes,
        characterCount: item.characterCount
      }, processingProfile);
      item.processingEstimate = OpsDemo.utils.clone(shape);
      var completedAt = nowIso();
      var wasSearchable = Boolean(documentItem.searchable);
      state.chunks = (state.chunks || []).filter(function filter(chunk) { return chunk.documentId !== documentItem.id; });
      [
        item.fileName + " 已完成同名替换导入，当前切片来自新文件内容。",
        "系统沿用原文件标识，并重新执行文档解析、切片和向量化。",
        "新索引生效后，检索与引用继续定位到同一文件标识。"
      ].forEach(function addPreviewChunk(content, index) {
        state.chunks.push({
          id: OpsDemo.utils.id("CHK"),
          documentId: documentItem.id,
          knowledgeBaseId: knowledgeBase.id,
          index: index + 1,
          characterCount: content.length,
          content: content,
          origin: "replacement",
          createdAt: completedAt,
          status: "ready"
        });
      });

      documentItem.name = item.fileName;
      documentItem.fileSizeBytes = Number(item.fileSizeBytes || 0);
      documentItem.fileSizeLabel = formatFileSize(documentItem.fileSizeBytes);
      documentItem.mimeType = item.type || inferFileType(item.fileName);
      documentItem.lastModified = Number(item.lastModified || 0);
      documentItem.contentHash = item.contentHash;
      documentItem.characterCount = shape.characterCount;
      documentItem.chunkCount = shape.chunkCount;
      documentItem.chunkingEstimate = OpsDemo.utils.clone(shape);
      documentItem.importedAt = completedAt;
      documentItem.updatedAt = completedAt;
      documentItem.pendingVectorization = false;
      documentItem.replacementCompletedAt = completedAt;
      delete documentItem.pendingReplacement;
      setDocumentStatus(documentItem, "ready");

      if (!wasSearchable) knowledgeBase.documentCounts.searchable = Number(knowledgeBase.documentCounts.searchable || 0) + 1;
      knowledgeBase.updatedAt = completedAt;
      knowledgeBase.contentUpdatedAt = completedAt;
      knowledgeBase.hint = "同名文件已替换并完成向量化，检索继续使用原文件标识";

      item.documentId = documentItem.id;
      item.existingDocumentId = documentItem.id;
      item.status = "success";
      item.statusLabel = "替换完成";
      item.confirmedAt = completedAt;
      item.countsTowardDocumentTotal = false;
      item.availableActions = ["view_document"];
      item.vectorizationImpact = { requiresReembedding: true, consumesTokens: true };
      batch.pendingReplacementCount = Math.max(0, Number(batch.pendingReplacementCount || 0) - 1);
      batch.replacementCompletedCount = Number(batch.replacementCompletedCount || 0) + 1;
      batch.successCount = Number(batch.successCount || 0) + 1;
      batch.status = batch.pendingReplacementCount ? "awaiting_replacement_confirmation" : "completed";
      batch.statusLabel = batch.pendingReplacementCount ? "待确认替换" : "已完成";
      batch.completedAt = batch.pendingReplacementCount ? null : completedAt;

      record(state, {
        objectType: "document",
        objectId: documentItem.id,
        objectName: documentItem.name,
        action: "replaced",
        actionLabel: "替换同名文件",
        before: before,
        after: {
          contentHash: documentItem.contentHash,
          fileSizeBytes: documentItem.fileSizeBytes,
          characterCount: documentItem.characterCount,
          chunkCount: documentItem.chunkCount,
          documentIdReused: true
        },
        impact: "确认替换会重新解析、切片和生成向量，并产生 Token 消耗；新文件完成前原文件保持可检索，完成后沿用原文件 ID 切换到新内容。",
        effects: { vectorRegeneration: true, tokenConsumption: true, indexUpdate: true, documentIdReused: true }
      });
      return documentItem;
    });
  }

  function addDocumentChunk(documentId, payload) {
    var input = payload || {};
    var content = String(input.content || "").trim();
    if (!content || content.length > 20000) return null;
    return commit("document-chunk-added", function mutate(state) {
      var documentItem = find(state.documents, documentId);
      if (!documentItem) return null;
      var knowledgeBase = find(state.knowledgeBases, documentItem.knowledgeBaseId);
      if (!knowledgeBase || knowledgeBase.benchmarkReadOnly) return null;
      var documentChunks = (state.chunks || []).filter(function filter(item) { return item.documentId === documentId; });
      var visibleMaxIndex = documentChunks.reduce(function max(value, item) { return Math.max(value, Number(item.index || 0)); }, 0);
      var nextIndex = Math.max(Number(documentItem.chunkCount || 0), visibleMaxIndex) + 1;
      var createdAt = nowIso();
      var chunk = {
        id: OpsDemo.utils.id("CHK"),
        documentId: documentId,
        knowledgeBaseId: documentItem.knowledgeBaseId,
        index: nextIndex,
        characterCount: content.length,
        content: content,
        origin: "manual",
        createdAt: createdAt,
        status: "pending_embedding",
        vectorizationImpact: {
          requiresReembedding: true,
          consumesTokens: true
        }
      };
      state.chunks = state.chunks || [];
      state.chunks.push(chunk);
      documentItem.chunkCount = nextIndex;
      documentItem.characterCount = Number(documentItem.characterCount || 0) + content.length;
      documentItem.updatedAt = createdAt;
      documentItem.pendingVectorization = true;
      setDocumentStatus(documentItem, "embedding", {
        progress: 0,
        label: "等待向量化",
        keepSearchable: Boolean(documentItem.searchable)
      });
      if (knowledgeBase) {
        knowledgeBase.updatedAt = createdAt;
        knowledgeBase.contentUpdatedAt = createdAt;
        knowledgeBase.hint = "新增切片等待向量化，完成后进入检索范围";
      }
      record(state, {
        objectType: "document_chunk",
        objectId: chunk.id,
        objectName: documentItem.name + " · 切片 " + nextIndex,
        action: "created",
        actionLabel: "新增切片",
        before: null,
        after: { documentId: documentId, index: nextIndex, characterCount: content.length },
        impact: "新增切片会重新向量化并产生 Token 消耗；向量化完成前该切片不进入检索范围。",
        effects: { vectorRegeneration: true, tokenConsumption: true, indexUpdate: true }
      });
      return chunk;
    });
  }

  function deleteDocument(id) {
    return commit("document-deleted", function mutate(state) {
      var documentItem = find(state.documents, id);
      if (!documentItem) return null;
      var knowledgeBase = find(state.knowledgeBases, documentItem.knowledgeBaseId);
      if (knowledgeBase && knowledgeBase.benchmarkReadOnly) return null;
      var deletedChunks = (state.chunks || []).filter(function filter(item) { return item.documentId === id; });
      state.documents.splice(state.documents.indexOf(documentItem), 1);
      state.chunks = (state.chunks || []).filter(function filter(item) { return item.documentId !== id; });
      if (knowledgeBase && knowledgeBase.documentCounts) {
        if (documentItem.countsTowardDocumentTotal !== false) knowledgeBase.documentCounts.total = Math.max(0, Number(knowledgeBase.documentCounts.total || 0) - 1);
        if (documentItem.searchable) knowledgeBase.documentCounts.searchable = Math.max(0, Number(knowledgeBase.documentCounts.searchable || 0) - 1);
        if (documentItem.status === "indexing") knowledgeBase.documentCounts.pendingActivation = Math.max(0, Number(knowledgeBase.documentCounts.pendingActivation || 0) - 1);
        if (["parsing", "chunking", "embedding"].indexOf(documentItem.status) >= 0) knowledgeBase.documentCounts.firstImportProcessing = Math.max(0, Number(knowledgeBase.documentCounts.firstImportProcessing || 0) - 1);
        knowledgeBase.updatedAt = nowIso();
        knowledgeBase.contentUpdatedAt = knowledgeBase.updatedAt;
        knowledgeBase.hint = "文件已删除，检索索引将移除其内容与引用";
      }
      record(state, {
        objectType: "document",
        objectId: documentItem.id,
        objectName: documentItem.name,
        action: "deleted",
        actionLabel: "删除文件",
        before: { knowledgeBaseId: documentItem.knowledgeBaseId, chunkCount: documentItem.chunkCount, searchable: documentItem.searchable },
        after: null,
        impact: "文件、切片与对应向量将从检索索引移除，后续检索和引用不再返回该文件；删除本身不产生新的向量化 Token。",
        effects: { vectorRegeneration: false, tokenConsumption: false, indexUpdate: true, retrievalRemoval: true }
      });
      documentItem.deletedChunkCount = deletedChunks.length;
      return documentItem;
    });
  }

  function deleteLocalDocumentAsset(localAssetId) {
    return commit("local-document-deleted", function mutate(state) {
      var documents = (state.documents || []).filter(function filter(documentItem) {
        var isLocal = !documentItem.sourceType || documentItem.sourceType === "local_upload";
        return isLocal && (documentItem.localAssetId || documentItem.id) === localAssetId;
      });
      if (!documents.length) return null;
      var documentIds = documents.map(function map(documentItem) { return documentItem.id; });
      var deletedChunks = (state.chunks || []).filter(function filter(chunk) { return documentIds.indexOf(chunk.documentId) >= 0; });
      var removedAt = nowIso();

      documents.forEach(function updateKnowledgeBase(documentItem) {
        var knowledgeBase = find(state.knowledgeBases, documentItem.knowledgeBaseId);
        if (!knowledgeBase || !knowledgeBase.documentCounts) return;
        if (documentItem.countsTowardDocumentTotal !== false) knowledgeBase.documentCounts.total = Math.max(0, Number(knowledgeBase.documentCounts.total || 0) - 1);
        if (documentItem.searchable) knowledgeBase.documentCounts.searchable = Math.max(0, Number(knowledgeBase.documentCounts.searchable || 0) - 1);
        if (documentItem.status === "indexing") knowledgeBase.documentCounts.pendingActivation = Math.max(0, Number(knowledgeBase.documentCounts.pendingActivation || 0) - 1);
        if (["parsing", "chunking", "embedding"].indexOf(documentItem.status) >= 0) knowledgeBase.documentCounts.firstImportProcessing = Math.max(0, Number(knowledgeBase.documentCounts.firstImportProcessing || 0) - 1);
        knowledgeBase.updatedAt = removedAt;
        knowledgeBase.contentUpdatedAt = removedAt;
        knowledgeBase.hint = "文档已删除，检索索引将移除其内容与引用";
      });

      state.documents = (state.documents || []).filter(function keep(documentItem) { return documentIds.indexOf(documentItem.id) < 0; });
      state.chunks = (state.chunks || []).filter(function keep(chunk) { return documentIds.indexOf(chunk.documentId) < 0; });
      record(state, {
        objectType: "local_document",
        objectId: localAssetId,
        objectName: documents[0].name,
        action: "deleted",
        actionLabel: "删除文档",
        before: {
          localAssetId: localAssetId,
          knowledgeBaseIds: documents.map(function map(documentItem) { return documentItem.knowledgeBaseId; }),
          documentIds: documentIds,
          chunkCount: deletedChunks.length
        },
        after: null,
        impact: "原文件及其在全部知识库中的处理实例、切片和向量已删除；后续检索和引用不再返回该文件。",
        effects: { vectorRegeneration: false, tokenConsumption: false, indexUpdate: true, retrievalRemoval: true }
      });
      return {
        id: localAssetId,
        name: documents[0].name,
        deletedDocumentIds: documentIds,
        deletedChunkCount: deletedChunks.length
      };
    });
  }

  function retryImportItem(batchId, itemId) {
    return commit("import-item-retried", function mutate(state) {
      var batch = find(state.importBatches, batchId);
      var item = batch && find(batch.items, itemId);
      var knowledgeBase = batch && find(state.knowledgeBases, batch.knowledgeBaseId);
      if (!batch || !item || !knowledgeBase || item.status !== "failed") return null;
      if (!isKnowledgeBaseEmbeddingReady(state, knowledgeBase)) return null;
      item.status = "success";
      item.statusLabel = "重试成功 · 待建立索引";
      item.failedStep = null;
      item.reason = null;
      item.availableActions = ["view_document"];
      item.countsTowardDocumentTotal = true;
      item.pipeline = (item.pipeline || []).map(function map(step) { return Object.assign({}, step, { status: "success" }); });
      item.documentId = OpsDemo.utils.id("DOC");
      batch.failureCount = Math.max(0, batch.failureCount - 1);
      batch.successCount += 1;
      var processingItems = batch.items.filter(function filter(entry) { return entry.status === "processing"; });
      processingItems.forEach(function complete(entry) {
        entry.status = "success";
        entry.statusLabel = "待建立索引";
        entry.availableActions = ["view_document"];
        var existingDocument = find(state.documents, entry.documentId);
        if (existingDocument && (existingDocument.status === "embedding" || existingDocument.lifecycleStatus === "processing")) setDocumentStatus(existingDocument, "indexing");
      });
      batch.successCount += processingItems.length;
      batch.processingCount = Math.max(0, batch.processingCount - processingItems.length);
      batch.status = batch.failureCount ? "partial_failure" : batch.processingCount ? "processing" : "completed";
      batch.statusLabel = batch.failureCount ? "部分异常" : batch.processingCount ? "处理中" : "已完成";
      state.documents.unshift(createImportedDocument({
        id: item.documentId,
        knowledgeBaseId: knowledgeBase.id,
        accessLevel: knowledgeBase.minAccessLevel,
        name: item.fileName,
        documentType: "合规证明",
        pageCount: 8,
        status: "indexing"
      }));
      knowledgeBase.documentCounts.total += 1;
      knowledgeBase.documentCounts.pendingActivation += 1;
      knowledgeBase.documentCounts.pendingActivation += processingItems.length;
      knowledgeBase.documentCounts.firstImportProcessing = Math.max(0, knowledgeBase.documentCounts.firstImportProcessing - processingItems.length);
      knowledgeBase.openImportIssueCount = Math.max(0, knowledgeBase.openImportIssueCount - 1);
      knowledgeBase.hint = "重试成功，1 个新文件待建立并验证索引";
      knowledgeBase.contentUpdatedAt = nowIso();
      knowledgeBase.updatedAt = knowledgeBase.contentUpdatedAt;
      var candidate = createCandidateVersion(state, knowledgeBase, 1, { sourceType: "import_batch", sourceBatchIds: [batch.id] });
      batch.candidateKnowledgeVersionId = candidate.id;
      batch.resultingKnowledgeVersionId = null;
      makeKnowledgeVersionEffective(state, knowledgeBase, candidate);
      batch.items.filter(function filter(entry) { return entry.status === "success"; }).forEach(function markIndexed(entry) { entry.statusLabel = "处理完成"; });
      if (!state.importBatches.some(function some(candidate) { return candidate.items.some(function each(entry) { return entry.status === "failed"; }); })) {
        var todo = find(state.overview.pendingItems, "TODO-001");
        if (todo) todo.resolved = true;
      }
      return item;
    });
  }

  function removeImportItem(batchId, itemId) {
    return commit("import-item-removed", function mutate(state) {
      var batch = find(state.importBatches, batchId);
      var item = batch && find(batch.items, itemId);
      var knowledgeBase = batch && find(state.knowledgeBases, batch.knowledgeBaseId);
      if (!batch || !item || item.status !== "failed") return null;
      item.status = "removed";
      item.statusLabel = "已移除";
      item.availableActions = [];
      batch.failureCount = Math.max(0, batch.failureCount - 1);
      var processingItems = batch.items.filter(function filter(entry) { return entry.status === "processing"; });
      if (!batch.failureCount) {
        processingItems.forEach(function complete(entry) {
          entry.status = "success";
          entry.statusLabel = "处理完成";
          entry.availableActions = ["view_document"];
        });
        batch.successCount += processingItems.length;
        batch.processingCount = 0;
      }
      batch.status = batch.failureCount ? "partial_failure" : "resolved_removed";
      batch.statusLabel = batch.failureCount ? "部分异常" : "已完成 · 异常项已移除";
      if (knowledgeBase) {
        knowledgeBase.openImportIssueCount = Math.max(0, knowledgeBase.openImportIssueCount - 1);
        knowledgeBase.updatedAt = nowIso();
        if (!batch.failureCount) {
          var candidate = createCandidateVersion(state, knowledgeBase, 0, { sourceType: "import_batch", sourceBatchIds: [batch.id] });
          batch.candidateKnowledgeVersionId = candidate.id;
          batch.resultingKnowledgeVersionId = null;
          makeKnowledgeVersionEffective(state, knowledgeBase, candidate);
          batch.items.filter(function filter(entry) { return entry.status === "success"; }).forEach(function markIndexed(entry) { entry.statusLabel = "处理完成"; });
        }
      }
      var todo = find(state.overview.pendingItems, "TODO-001");
      if (todo && batch.failureCount === 0) todo.resolved = true;
      return item;
    });
  }

  function validateKnowledgeVersion(knowledgeBaseId, versionId) {
    return commit("knowledge-version-validated", function mutate(state) {
      var version = find(state.knowledgeVersions, versionId);
      var knowledgeBase = find(state.knowledgeBases, knowledgeBaseId);
      if (!version || version.knowledgeBaseId !== knowledgeBaseId || version.status !== "pending_validation") return null;
      var before = version.statusLabel;
      version.status = "pending_activation";
      version.statusLabel = "索引验证通过 · 待进入检索";
      version.progress = 100;
      version.canActivate = true;
      record(state, {
        objectType: "knowledge_version",
        objectId: version.id,
        objectName: version.id,
        action: "validated",
        actionLabel: "检索验证通过",
        before: { status: before },
        after: { status: version.statusLabel },
        impact: "当前可检索内容未变化；可确认让本次索引更新生效。"
      });
      if (knowledgeBase) {
        knowledgeBase.hint = "索引验证完成，等待进入检索范围";
        knowledgeBase.updatedAt = nowIso();
      }
      return version;
    });
  }

  function activateKnowledgeVersion(knowledgeBaseId, versionId) {
    return commit("knowledge-version-activated", function mutate(state) {
      var knowledgeBase = find(state.knowledgeBases, knowledgeBaseId);
      var version = find(state.knowledgeVersions, versionId);
      if (!knowledgeBase || !version || version.knowledgeBaseId !== knowledgeBaseId || !version.canActivate) return null;
      var previousId = makeKnowledgeVersionEffective(state, knowledgeBase, version);
      record(state, {
        objectType: "knowledge_version",
        objectId: version.id,
        objectName: knowledgeBase.name + " · " + version.id,
        action: "activated",
        actionLabel: "索引更新生效",
        before: { knowledgeVersionId: previousId },
        after: { knowledgeVersionId: version.id },
        impact: "新检索请求使用最新索引；原索引仅作技术追溯保留。",
        canCreateRollbackDraft: true
      });
      return version;
    });
  }

  function rollbackKnowledgeVersion(knowledgeBaseId, versionId) {
    return commit("knowledge-version-rollback-draft", function mutate(state) {
      var knowledgeBase = find(state.knowledgeBases, knowledgeBaseId);
      var historical = find(state.knowledgeVersions, versionId);
      if (!knowledgeBase || !historical || historical.knowledgeBaseId !== knowledgeBaseId || historical.status !== "historical") return null;
      var draft = Object.assign({}, OpsDemo.utils.clone(historical), {
        id: OpsDemo.utils.id("KV-RESTORE"),
        createdAt: nowIso(),
        sourceType: "restore",
        sourceBatchIds: [],
        status: "pending_validation",
        statusLabel: "回退索引待验证",
        basedOnVersionId: historical.id,
        canActivate: false,
        canRollbackFrom: false
      });
      state.knowledgeVersions.unshift(draft);
      knowledgeBase.updatedAt = nowIso();
      record(state, {
        objectType: "knowledge_version",
        objectId: draft.id,
        objectName: knowledgeBase.name + " · 索引回退",
        action: "rollback_draft_created",
        actionLabel: "创建索引回退",
        before: { current: knowledgeBase.currentKnowledgeVersionId },
        after: { basedOn: historical.id, draft: draft.id },
        impact: "当前可检索内容未改变；回退索引仍需检索验证后才能生效。"
      });
      return draft;
    });
  }

  function ragList(state, kind) {
    return kind === "ingestion" ? state.rag.ingestionProfiles : [];
  }

  function ragModelList(state, kind) {
    if (!state.rag || !state.rag.modelCatalog) return [];
    return kind === "embedding"
      ? state.rag.modelCatalog.embeddingModels
      : state.rag.modelCatalog.rerankerModels;
  }

  function findRagModel(state, kind, id) {
    return find(ragModelList(state, kind), id);
  }

  function isRagModelReady(model) {
    if (!model) return false;
    if (model.connectionStatus) return model.connectionStatus === "available";
    return Boolean(model.status === "available" && model.lastConnectionTest && model.lastConnectionTest.status === "passed");
  }

  function isKnowledgeBaseEmbeddingReady(state, knowledgeBase) {
    return Boolean(knowledgeBase && isRagModelReady(findRagModel(state, "embedding", knowledgeBase.boundEmbeddingModelId)));
  }

  function maskModelCredential(secret) {
    var value = String(secret || "").trim();
    if (!value) return "未配置";
    return "••••••••" + value.slice(-4).toUpperCase();
  }

  function normalizeModelApiConfig(input, current) {
    var source = input || {};
    var existing = current || {};
    var endpointInput = source.endpoint == null ? source.serviceAddress : source.endpoint;
    var endpoint = String(endpointInput == null ? existing.endpoint || existing.serviceAddress || "" : endpointInput).trim();
    var rawApiKey = String(source.apiKey == null ? source.credential || "" : source.apiKey).trim();
    var apiKeyMasked = existing.apiKeyMasked || existing.credentialMasked || "未配置";
    if (rawApiKey) apiKeyMasked = maskModelCredential(rawApiKey);
    if (!endpoint || !apiKeyMasked || apiKeyMasked === "未配置" || apiKeyMasked === "无需密钥") return null;
    return {
      endpoint: endpoint,
      apiKeyMasked: apiKeyMasked,
    };
  }

  function readEmbeddingDimension(input, apiConfig, current) {
    var endpoint = String(apiConfig && apiConfig.endpoint || "").toLowerCase();
    var presetMatch = endpoint.match(/(?:^|\/)(qwen3-embedding-8b|qwen3-embedding-4b|bge-m3)(?:\/|[?#]|$)/);
    if (presetMatch) return {
      "qwen3-embedding-8b": 4096,
      "qwen3-embedding-4b": 2560,
      "bge-m3": 1024
    }[presetMatch[1]];
    if (/(?:multilingual|mini|small|768)/.test(endpoint)) return 768;
    if (/(?:longtext|large|1536)/.test(endpoint)) return 1536;
    var explicit = Number(input && input.dimension);
    if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
    var stored = Number(current && current.dimension);
    if (Number.isFinite(stored) && stored > 0) return Math.round(stored);
    return 1024;
  }

  function modelKindFromId(state, id) {
    if (findRagModel(state, "embedding", id)) return "embedding";
    if (findRagModel(state, "reranker", id)) return "reranker";
    return null;
  }

  function modelConnectionResult(apiConfig, options) {
    var input = options || {};
    var shouldFail = Boolean(input.simulateFailure) || /(?:invalid|offline|fail)/i.test(apiConfig.endpoint);
    var testedAt = nowIso();
    return {
      connectionStatus: shouldFail ? "failed" : "available",
      connectionStatusLabel: shouldFail ? "连接失败" : "连接正常",
      lastTestAt: testedAt,
      testedAt: testedAt,
      passed: !shouldFail,
    };
  }

  function applyModelConnectionState(model, result) {
    model.connectionStatus = result.connectionStatus;
    model.connectionStatusLabel = result.connectionStatusLabel;
    model.lastTestAt = result.lastTestAt;

    // Compatibility fields remain synchronized while knowledge/RAG pages migrate to
    // connectionStatus. The model console itself uses the canonical fields above.
    model.status = result.passed ? "available" : "unavailable";
    model.statusLabel = result.passed ? "可用" : "连接失败";
    model.lastConnectionTest = {
      status: result.passed ? "passed" : "failed",
      statusLabel: result.connectionStatusLabel,
      testedAt: result.lastTestAt,
    };
    return model;
  }

  function testRagModelDraft(payload) {
    var input = payload || {};
    var state = store.getState();
    var currentKind = input.id ? modelKindFromId(state, input.id) : null;
    var kind = currentKind || (input.kind === "reranker" ? "reranker" : "embedding");
    var current = input.id ? findRagModel(state, kind, input.id) : null;
    if (input.id && !current) return null;
    var apiConfig = normalizeModelApiConfig(input.apiConfig || input, current && current.apiConfig);
    if (!apiConfig) return null;
    var result = modelConnectionResult(apiConfig, input);
    return Object.assign({
      kind: kind,
      apiConfig: apiConfig,
      dimension: kind === "embedding" ? readEmbeddingDimension(input, apiConfig, current) : null,
    }, result);
  }

  function saveRagModel(payload) {
    var input = payload || {};
    var snapshot = store.getState();
    var existingKind = input.id ? modelKindFromId(snapshot, input.id) : null;
    var kind = existingKind || (input.kind === "reranker" ? "reranker" : "embedding");
    if (existingKind && input.kind && input.kind !== existingKind) return null;
    var existingModel = input.id ? findRagModel(snapshot, kind, input.id) : null;
    if (input.id && !existingModel) return null;

    var name = String(input.name == null ? existingModel && existingModel.alias || "" : input.name).trim();
    var allModels = ragModelList(snapshot, "embedding").concat(ragModelList(snapshot, "reranker"));
    if (!name || allModels.some(function some(item) {
      return item.id !== (existingModel && existingModel.id) && String(item.alias || "").toLowerCase() === name.toLowerCase();
    })) return null;

    var apiConfig = normalizeModelApiConfig(input.apiConfig || input, existingModel && existingModel.apiConfig);
    if (!apiConfig) return null;
    var dimension = kind === "embedding" ? readEmbeddingDimension(input, apiConfig, existingModel) : null;
    var connection = modelConnectionResult(apiConfig, input);
    if (!connection.passed) return null;

    return commit("rag-model-saved", function mutate(state) {
      var model = input.id ? findRagModel(state, kind, input.id) : null;
      if (input.id && !model) return null;

      var created = !model;
      var timestamp = nowIso();
      if (!model) {
        model = {
          id: OpsDemo.utils.id(kind === "embedding" ? "MODEL-EMBEDDING" : "MODEL-RERANK"),
          createdAt: timestamp,
        };
        ragModelList(state, kind).push(model);
      }
      model.alias = name;
      model.apiConfig = apiConfig;
      model.updatedAt = timestamp;
      if (kind === "embedding") model.dimension = Math.round(dimension);
      else {
        delete model.dimension;
        delete model.capability;
      }
      applyModelConnectionState(model, connection);

      record(state, {
        objectType: "rag_model",
        objectId: model.id,
        objectName: model.alias,
        action: created ? "created" : "updated",
        actionLabel: created ? "新增模型" : "编辑模型",
        before: null,
        after: { kind: kind, connectionStatus: model.connectionStatus },
        impact: "保存时已自动复测连接，模型当前可用于新配置。",
      });
      return model;
    });
  }

  function createRagModel(payload) {
    return saveRagModel(payload);
  }

  function updateRagModel(kind, id, payload) {
    return saveRagModel(Object.assign({}, payload || {}, { id: id, kind: kind }));
  }

  function updateRagModelApi(kind, id, payload) {
    return saveRagModel({ id: id, kind: kind, apiConfig: payload || {} });
  }

  function testRagModelConnection(kind, id, payload) {
    return commit("rag-model-connection-tested", function mutate(state) {
      var model = findRagModel(state, kind, id);
      if (!model) return null;
      var input = payload || {};
      var apiConfig = normalizeModelApiConfig(input.apiConfig || input, model.apiConfig);
      if (!apiConfig) return null;
      var result = modelConnectionResult(apiConfig, input);
      applyModelConnectionState(model, result);
      model.updatedAt = nowIso();
      return model;
    });
  }

  function ragModelUsageFromState(state, kind, id) {
    if (kind === "embedding") {
      return state.knowledgeBases.filter(function filter(item) { return item.boundEmbeddingModelId === id; }).map(function map(item) {
        return { type: "knowledge_base", id: item.id, name: item.name };
      });
    }
    var settings = state.rag && state.rag.retrievalSettings;
    var operator = settings && settings.operator;
    return operator && operator.rerankEnabled && operator.rerankerModelId === id
      ? [{ type: "retrieval_settings", id: "QUERY-RUNTIME-01", name: "全局检索设置" }]
      : [];
  }

  function getRagModelUsage(kind, id) {
    return ragModelUsageFromState(store.getState(), kind, id);
  }

  function deleteRagModel(kind, id) {
    var snapshot = store.getState();
    if (!findRagModel(snapshot, kind, id) || ragModelUsageFromState(snapshot, kind, id).length) return null;
    return commit("rag-model-deleted", function mutate(state) {
      var list = ragModelList(state, kind);
      var model = find(list, id);
      if (!model || ragModelUsageFromState(state, kind, id).length) return null;
      list.splice(list.indexOf(model), 1);
      record(state, {
        objectType: "rag_model",
        objectId: model.id,
        objectName: model.alias,
        action: "deleted",
        actionLabel: "删除模型",
        before: { kind: kind },
        after: null,
        impact: "未被知识库或全局检索设置引用的模型已删除。",
      });
      return model;
    });
  }

  function retrievalLevelForThreshold(threshold) {
    if (threshold <= 0.5) return "loose";
    if (threshold <= 0.7) return "balanced";
    return "strict";
  }

  function retrievalThresholdForLevel(state, level) {
    var settings = state.rag && state.rag.retrievalSettings;
    var thresholdMap = settings && settings.system && settings.system.thresholdMap || { loose: 0.4, balanced: 0.6, strict: 0.8 };
    var threshold = Number(thresholdMap[level]);
    return Number.isFinite(threshold) ? threshold : null;
  }

  function normalizedRetrievalThreshold(state, source, current) {
    var hasThreshold = Object.prototype.hasOwnProperty.call(source, "relevanceThreshold");
    var hasLegacyLevel = Object.prototype.hasOwnProperty.call(source, "relevanceLevel");
    if (hasLegacyLevel && ["loose", "balanced", "strict"].indexOf(String(source.relevanceLevel)) < 0) return null;
    var candidate;
    if (hasThreshold) candidate = Number(source.relevanceThreshold);
    else if (hasLegacyLevel) candidate = retrievalThresholdForLevel(state, String(source.relevanceLevel));
    else if (current.relevanceThreshold != null) candidate = Number(current.relevanceThreshold);
    else if (current.relevanceLevel != null) candidate = retrievalThresholdForLevel(state, String(current.relevanceLevel));
    else candidate = 0.6;
    var scaled = Math.round(Number(candidate) * 10);
    if (!Number.isFinite(candidate) || Math.abs(Number(candidate) - scaled / 10) > 1e-9 || scaled < 4 || scaled > 9) return null;
    return scaled / 10;
  }

  function retrievalEvidenceScore(item, source) {
    var score = Number(source === "rerank" ? item.rerankScore : item.fusionScore);
    return Number.isFinite(score) ? score : null;
  }

  function normalizedKeywordWeight(state, source, current) {
    var candidate;
    if (source.keywordWeight != null) candidate = Number(source.keywordWeight);
    else if (source.semanticWeight != null) candidate = 100 - Number(source.semanticWeight);
    else if (current.keywordWeight != null) candidate = Number(current.keywordWeight);
    else if (current.semanticWeight != null) candidate = 100 - Number(current.semanticWeight);
    else {
      var weights = state.rag && state.rag.retrievalSettings && state.rag.retrievalSettings.system && state.rag.retrievalSettings.system.fusionWeights || {};
      candidate = Math.round(Number(weights.bm25 == null ? 0.5 : weights.bm25) * 100);
    }
    if (!Number.isInteger(candidate) || candidate < 10 || candidate > 90 || candidate % 5 !== 0) return null;
    if (source.semanticWeight != null && Number(source.semanticWeight) !== 100 - candidate) return null;
    return candidate;
  }

  function deriveRetrievalPlan(state, operator) {
    var system = state.rag && state.rag.retrievalSettings && state.rag.retrievalSettings.system || {};
    var keywordWeight = Number(operator.keywordWeight || 50);
    var totalBranchCandidates = Math.max(
      Number(operator.finalTopK || 10),
      Number(system.bm25Candidates || 30) + Number(system.denseCandidates || 30)
    );
    var keywordCandidates = Math.max(1, Math.round(totalBranchCandidates * keywordWeight / 100));
    var semanticCandidates = Math.max(1, totalBranchCandidates - keywordCandidates);
    var fusionCandidates = Math.max(
      Number(operator.finalTopK || 10),
      Math.min(totalBranchCandidates, Number(system.fusionCandidates || 30))
    );
    return {
      keywordCandidates: keywordCandidates,
      semanticCandidates: semanticCandidates,
      fusionCandidates: fusionCandidates,
      rerankCandidates: operator.rerankEnabled ? fusionCandidates : 0
    };
  }

  function normalizeRetrievalOperator(state, payload, base) {
    var source = payload || {};
    var current = base || {};
    var rerankEnabled = source.rerankEnabled == null ? Boolean(current.rerankEnabled) : Boolean(source.rerankEnabled);
    var rerankerModelId = source.rerankerModelId == null ? current.rerankerModelId : String(source.rerankerModelId || "");
    var finalTopK = Number(source.finalTopK == null ? current.finalTopK || 10 : source.finalTopK);
    var keywordWeight = normalizedKeywordWeight(state, source, current);
    var relevanceThreshold = normalizedRetrievalThreshold(state, source, current);
    if (!Number.isInteger(finalTopK) || finalTopK < 5 || finalTopK > 20) return null;
    if (keywordWeight == null) return null;
    if (relevanceThreshold == null) return null;
    if (rerankEnabled) {
      var model = findRagModel(state, "reranker", rerankerModelId);
      if (!isRagModelReady(model)) return null;
      rerankerModelId = model.id;
    }
    return {
      rerankEnabled: rerankEnabled,
      rerankerModelId: rerankEnabled ? rerankerModelId : null,
      keywordWeight: keywordWeight,
      semanticWeight: 100 - keywordWeight,
      finalTopK: finalTopK,
      relevanceThreshold: relevanceThreshold,
      relevanceLevel: retrievalLevelForThreshold(relevanceThreshold),
      updatedAt: current.updatedAt || null
    };
  }

  function updateRetrievalSettings(payload) {
    return commit("retrieval-settings-updated", function mutate(state) {
      var settings = state.rag && state.rag.retrievalSettings;
      if (!settings) return null;
      var normalized = normalizeRetrievalOperator(state, payload, settings.operator);
      if (!normalized) return null;
      var before = OpsDemo.utils.clone(settings.operator);
      normalized.updatedAt = nowIso();
      settings.operator = normalized;
      state.rag.retrievalTestDraft = null;
      record(state, {
        objectType: "retrieval_settings",
        objectId: "QUERY-RUNTIME-01",
        objectName: "全局检索设置",
        action: "updated",
        actionLabel: "保存检索设置",
        before: before,
        after: OpsDemo.utils.clone(normalized),
        impact: "后续 Query 检索立即使用新设置；不会重新切片、生成向量或消耗 Embedding Token。"
      });
      return settings;
    });
  }

  function previewRetrievalSettings(payload) {
    return commit("retrieval-settings-previewed", function mutate(state) {
      var settings = state.rag && state.rag.retrievalSettings;
      if (!settings) return null;
      var normalized = normalizeRetrievalOperator(state, payload, settings.operator);
      if (!normalized) return null;
      normalized.updatedAt = settings.operator.updatedAt;
      state.rag.retrievalTestDraft = {
        createdAt: nowIso(),
        operator: normalized
      };
      return state.rag.retrievalTestDraft;
    });
  }

  function clearRetrievalTestDraft() {
    return commit("retrieval-settings-preview-cleared", function mutate(state) {
      state.rag.retrievalTestDraft = null;
      return true;
    });
  }

  function createEmptyRetrievalTest(state, knowledgeBase, question) {
    return {
      id: OpsDemo.utils.id("RT"),
      name: knowledgeBase.name + "检索测试",
      createdAt: nowIso(),
      question: question,
      knowledgeBaseId: knowledgeBase.id,
      knowledgeVersionId: knowledgeBase.currentKnowledgeVersionId || null,
      comparison: { returnedCount: 0, expectedEvidenceHit: 0, expectedEvidenceTotal: 0, irrelevantCount: 0 },
      evidence: [],
      fixtureEvidence: [],
      fixtureAvailable: false,
      runtimeSnapshot: null,
      executionStages: [],
      answerGenerated: false,
      validationState: "not_run",
      validationStateLabel: "未运行",
      emptyReasonLabel: "尚无测试结果。"
    };
  }

  function rankedRetrievalFixture(state, fixtureEvidence, operator) {
    var fixture = OpsDemo.utils.clone(fixtureEvidence || []);
    var scoreSource = operator.rerankEnabled ? "rerank" : "fusion";
    fixture.sort(function sort(left, right) {
      var leftScore = retrievalEvidenceScore(left, "fusion");
      var rightScore = retrievalEvidenceScore(right, "fusion");
      if (leftScore == null && rightScore == null) return String(left.documentId || "").localeCompare(String(right.documentId || ""));
      if (leftScore == null) return 1;
      if (rightScore == null) return -1;
      return rightScore - leftScore || String(left.documentId || "").localeCompare(String(right.documentId || ""));
    });
    var derivedPlan = deriveRetrievalPlan(state, operator);
    fixture = fixture.slice(0, derivedPlan.fusionCandidates);
    if (operator.rerankEnabled) {
      fixture.sort(function sortReranked(left, right) {
        var leftScore = retrievalEvidenceScore(left, "rerank");
        var rightScore = retrievalEvidenceScore(right, "rerank");
        if (leftScore == null && rightScore == null) return String(left.documentId || "").localeCompare(String(right.documentId || ""));
        if (leftScore == null) return 1;
        if (rightScore == null) return -1;
        return rightScore - leftScore || String(left.documentId || "").localeCompare(String(right.documentId || ""));
      });
    }
    var evidence = fixture.filter(function filterEvidence(item) {
      var score = retrievalEvidenceScore(item, scoreSource);
      return score != null && score >= operator.relevanceThreshold;
    }).slice(0, operator.finalTopK).map(function mapEvidence(item, index) {
      item.rank = index + 1;
      item.retrievalScore = retrievalEvidenceScore(item, scoreSource);
      item.scoreSource = scoreSource;
      return item;
    });
    return {
      evidence: evidence,
      scoreSource: scoreSource,
      derivedPlan: derivedPlan,
      candidateCount: fixtureEvidence ? fixtureEvidence.length : 0
    };
  }

  function evaluateRetrievalCase(state, evaluationCase, operator) {
    var ranked = rankedRetrievalFixture(state, evaluationCase.fixtureEvidence, operator);
    var goldDocumentIds = evaluationCase.goldDocumentIds || [];
    var goldLookup = {};
    goldDocumentIds.forEach(function addGold(id) { goldLookup[id] = true; });
    ranked.evidence.forEach(function markEvidence(item) {
      var relevant = Boolean(goldLookup[item.documentId]);
      item.relevanceMark = relevant ? "relevant" : "irrelevant";
      item.relevanceMarkLabel = relevant ? "相关" : "非相关";
    });
    var hitLookup = {};
    ranked.evidence.forEach(function collectHit(item) {
      if (goldLookup[item.documentId]) hitLookup[item.documentId] = true;
    });
    var relevantCount = ranked.evidence.filter(function filter(item) { return item.relevanceMark === "relevant"; }).length;
    var irrelevantCount = ranked.evidence.length - relevantCount;
    var firstRelevant = ranked.evidence.find(function find(item) { return item.relevanceMark === "relevant"; });
    var precisionDenominator = Number(operator.finalTopK || 0);
    ranked.metrics = {
      returnedCount: ranked.evidence.length,
      relevantCount: relevantCount,
      irrelevantCount: irrelevantCount,
      goldHitCount: Object.keys(hitLookup).length,
      goldTotal: goldDocumentIds.length,
      precisionAtK: precisionDenominator ? relevantCount / precisionDenominator : 0,
      recallAtK: goldDocumentIds.length ? Object.keys(hitLookup).length / goldDocumentIds.length : null,
      reciprocalRankAtK: firstRelevant ? 1 / firstRelevant.rank : 0
    };
    return ranked;
  }

  function simulatedRetrievalLatency(evaluationCase, operator, candidateCount, derivedPlan) {
    var questionLength = String(evaluationCase && evaluationCase.question || "").length;
    var rerankCost = operator.rerankEnabled ? 28 + Math.min(candidateCount, Number(derivedPlan.rerankCandidates || candidateCount)) * 2 : 0;
    return 24 + Math.ceil(candidateCount * 1.8) + Math.ceil(questionLength * 0.35) + rerankCost;
  }

  function runRetrievalTest(payload) {
    var input = payload || {};
    return commit("retrieval-test-run", function mutate(state) {
      var requestedTest = input.testId ? find(state.rag.retrievalTests, input.testId) : null;
      var knowledgeBaseId = input.knowledgeBaseId || (requestedTest && requestedTest.knowledgeBaseId);
      var knowledgeBase = find(state.knowledgeBases, knowledgeBaseId);
      var searchableCount = knowledgeBase && knowledgeBase.documentCounts ? Number(knowledgeBase.documentCounts.searchable || 0) : 0;
      if (!knowledgeBase || !knowledgeBase.enabled || !searchableCount) return null;
      if (!isKnowledgeBaseEmbeddingReady(state, knowledgeBase)) return null;
      var online = state.rag && state.rag.retrievalSettings && state.rag.retrievalSettings.operator;
      var preview = input.useDraft === false ? null : state.rag && state.rag.retrievalTestDraft;
      var hasOperatorOverrides = Boolean(input.operatorOverrides && typeof input.operatorOverrides === "object");
      var operator = normalizeRetrievalOperator(state, hasOperatorOverrides ? input.operatorOverrides : preview && preview.operator || online, online);
      if (!operator) return null;
      var settingsKey = hasOperatorOverrides ? "test" : preview ? "preview" : "online";
      var question = String(input.question || "").trim();
      var test = state.rag.retrievalTests.find(function findTest(item) { return item.knowledgeBaseId === knowledgeBase.id; });
      if (!test) {
        if (!question) return null;
        test = createEmptyRetrievalTest(state, knowledgeBase, question);
        state.rag.retrievalTests.push(test);
      } else if (question) {
        test.question = question;
      }
      var scoreSource;
      var derivedPlan;
      var evidenceForRun;
      var relevantCount;
      var irrelevantCount;
      var expectedTotal;
      var evaluationCases = test.evaluationCases || [];
      if (evaluationCases.length) {
        var selectedCase = evaluationCases.find(function findCase(item) { return item.id === input.evaluationCaseId; }) ||
          evaluationCases.find(function findCase(item) { return item.id === test.activeEvaluationCaseId; }) ||
          evaluationCases.find(function findCase(item) { return item.question === question; }) || evaluationCases[0];
        if (!selectedCase) return null;
        test.activeEvaluationCaseId = selectedCase.id;
        test.question = selectedCase.question;
        test.fixtureEvidence = OpsDemo.utils.clone(selectedCase.fixtureEvidence || []);
        var selectedEvaluation = evaluateRetrievalCase(state, selectedCase, operator);
        evidenceForRun = selectedEvaluation.evidence;
        scoreSource = selectedEvaluation.scoreSource;
        derivedPlan = selectedEvaluation.derivedPlan;
        relevantCount = selectedEvaluation.metrics.goldHitCount;
        irrelevantCount = selectedEvaluation.metrics.irrelevantCount;
        expectedTotal = selectedEvaluation.metrics.goldTotal;
        var precisionTotal = 0;
        var recallTotal = 0;
        var reciprocalRankTotal = 0;
        var latencyTotal = 0;
        var validCaseCount = 0;
        evaluationCases.forEach(function evaluateSuiteCase(evaluationCase) {
          if (!(evaluationCase.goldDocumentIds || []).length) return;
          var result = evaluationCase.id === selectedCase.id ? selectedEvaluation : evaluateRetrievalCase(state, evaluationCase, operator);
          precisionTotal += result.metrics.precisionAtK;
          recallTotal += result.metrics.recallAtK;
          reciprocalRankTotal += result.metrics.reciprocalRankAtK;
          latencyTotal += simulatedRetrievalLatency(evaluationCase, operator, result.candidateCount, result.derivedPlan);
          validCaseCount += 1;
        });
        test.evaluationMetrics = {
          k: operator.finalTopK,
          precisionAtK: validCaseCount ? precisionTotal / validCaseCount : null,
          recallAtK: validCaseCount ? recallTotal / validCaseCount : null,
          mrrAtK: validCaseCount ? reciprocalRankTotal / validCaseCount : null,
          retrievalLatencyMs: validCaseCount ? Math.round(latencyTotal / validCaseCount) : null,
          latencyKind: "simulated",
          aggregation: "macro",
          sampleCount: validCaseCount,
          excludedCount: evaluationCases.length - validCaseCount
        };
      } else {
        if (!test.fixtureEvidence) test.fixtureEvidence = OpsDemo.utils.clone(test.evidence || []);
        var rankedFixture = rankedRetrievalFixture(state, test.fixtureAvailable === false ? [] : test.fixtureEvidence, operator);
        evidenceForRun = rankedFixture.evidence;
        scoreSource = rankedFixture.scoreSource;
        derivedPlan = rankedFixture.derivedPlan;
        relevantCount = evidenceForRun.filter(function filter(item) { return item.relevanceMark === "relevant"; }).length;
        irrelevantCount = evidenceForRun.filter(function filter(item) { return item.relevanceMark === "irrelevant"; }).length;
        expectedTotal = (test.fixtureEvidence || []).filter(function filter(item) { return item.relevanceMark === "relevant"; }).length;
        test.evaluationMetrics = null;
      }
      var runAt = nowIso();
      test.comparison = {
        returnedCount: evidenceForRun.length,
        expectedEvidenceHit: relevantCount,
        expectedEvidenceTotal: expectedTotal,
        irrelevantCount: irrelevantCount,
        validationState: "validated",
        lastRunAt: runAt
      };
      test.comparisons = [Object.assign({ settingsKey: settingsKey }, test.comparison)];
      test.evidence = evidenceForRun;
      test.runtimeSnapshot = {
        source: settingsKey,
        scoreSource: scoreSource,
        system: OpsDemo.utils.clone(state.rag.retrievalSettings.system),
        derivedPlan: derivedPlan,
        operator: OpsDemo.utils.clone(operator)
      };
      test.executionStages = ["hybrid_retrieval", "permission_filter", "metadata_filter", "deduplication"]
        .concat(operator.rerankEnabled ? ["rerank"] : [])
        .concat(["result_control"]);
      test.lastRunAt = runAt;
      test.validationState = "validated";
      test.validationStateLabel = "测试完成";
      test.emptyReasonLabel = evidenceForRun.length ? "" : "本次检索未返回符合相关性要求的证据片段。";
      return test;
    }, input.silentRender === true ? { silentRender: true } : null);
  }

  function capabilityList(state, type) {
    if (type === "tool" || type === "tools") return state.tools;
    if (type === "visualization" || type === "visualizations") return state.visualizations;
    return state.skills;
  }

  function capabilityKind(type) {
    if (type === "tool" || type === "tools") return "tool";
    if (type === "skill" || type === "skills") return "skill";
    return null;
  }

  function normalizedCapabilityToolIds(state, value) {
    if (!Array.isArray(value)) return null;
    var supplied = value.map(function map(id) { return String(id || "").trim(); }).filter(function filter(id, index, all) {
      return id && all.indexOf(id) === index;
    });
    return supplied.every(function every(id) { return Boolean(find(state.tools, id)); }) ? supplied : null;
  }

  function normalizedToolCode(value) {
    var code = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/^_+|_+$/g, "");
    return /^[a-z][a-z0-9_]{1,63}$/.test(code) ? code : null;
  }

  function nextUploadedToolCode(state, preferred, id) {
    var base = normalizedToolCode(preferred) || "uploaded_tool";
    var code = base;
    var suffix = 2;
    while (state.tools.some(function some(tool) { return tool.id !== id && tool.code === code; })) {
      code = base.slice(0, Math.max(1, 63 - String(suffix).length - 1)) + "_" + suffix;
      suffix += 1;
    }
    return code;
  }

  function uploadedPackageMetadata(input) {
    var source = input && input.file || {};
    var supplied = input && input.packageMeta || {};
    var fileName = String(input && (input.fileName || input.packageName) || supplied.fileName || source.name || "").trim();
    if (!fileName) return null;
    var fileCount = Number(input && input.fileCount != null ? input.fileCount : supplied.fileCount == null ? 1 : supplied.fileCount);
    var totalBytes = Number(input && input.totalBytes != null ? input.totalBytes : input && input.fileSize != null ? input.fileSize : supplied.totalBytes != null ? supplied.totalBytes : source.size);
    if (!Number.isFinite(fileCount) || fileCount < 1 || Math.floor(fileCount) !== fileCount) return null;
    return {
      fileName: fileName,
      rootName: String(input && input.rootName || supplied.rootName || fileName.replace(/\.[^.]+$/, "")).trim(),
      fileCount: fileCount,
      totalBytes: Number.isFinite(totalBytes) && totalBytes >= 0 ? totalBytes : 0,
      fileType: String(input && input.fileType || supplied.fileType || source.type || "application/octet-stream"),
      manifestPath: String(input && input.manifestPath || supplied.manifestPath || "").trim(),
      importedAt: nowIso()
    };
  }

  function statusLabel(status) {
    return status === "available" ? "可用" : status === "disabled" ? "已停用" : "不可用";
  }

  function recomputeCapabilityDependencies(state) {
    state.tools.forEach(function resetTool(tool) {
      if (tool.enabled === false) tool.status = "disabled";
      else if (!tool.status || tool.status === "disabled") tool.status = "available";
      tool.statusLabel = statusLabel(tool.status);
      tool.dependentSkillIds = [];
    });

    state.skills.forEach(function rebuildToolReferences(skill) {
      ((skill.dependencies && skill.dependencies.toolIds) || []).forEach(function each(toolId) {
        var tool = find(state.tools, toolId);
        if (tool && tool.dependentSkillIds.indexOf(skill.id) < 0) tool.dependentSkillIds.push(skill.id);
      });
    });

    state.skills.forEach(function reset(skill) {
      if (!skill.enabled) {
        skill.status = "disabled";
        skill.statusLabel = "已停用";
      } else {
        skill.status = "available";
        skill.statusLabel = "可用";
      }
    });

    for (var pass = 0; pass < 4; pass += 1) {
      state.skills.forEach(function derive(skill) {
        if (!skill.enabled) return;
        var toolDependencies = ((skill.dependencies && skill.dependencies.toolIds) || []).map(function map(id) { return find(state.tools, id); });
        var skillDependencies = ((skill.dependencies && skill.dependencies.skillIds) || []).map(function map(id) { return find(state.skills, id); });
        var statuses = toolDependencies.concat(skillDependencies).map(function map(item) { return !item || item.enabled === false ? "disabled" : item.status; });
        var derived = statuses.some(function some(value) { return value === "disabled" || value === "unavailable"; }) ? "unavailable" : "available";
        skill.status = derived;
        skill.statusLabel = statusLabel(derived);
      });
    }

    var visualizationSkill = find(state.skills, "SK-06");
    var visualizationToolsAvailable = Boolean(visualizationSkill) && ((visualizationSkill.dependencies && visualizationSkill.dependencies.toolIds) || []).every(function every(toolId) {
      var tool = find(state.tools, toolId);
      return Boolean(tool && tool.enabled !== false && tool.status === "available");
    });
    state.visualizations.forEach(function each(visualization) {
      if (visualization.integrationStatus !== "integrated") return;
      if (!visualizationSkill || !visualizationSkill.enabled) {
        visualization.runtimeStatus = "disabled_by_skill";
        visualization.runtimeStatusLabel = "上游 Skill 已停用";
      } else if (visualizationSkill.status !== "available" || !visualizationToolsAvailable) {
        visualization.runtimeStatus = "unavailable_by_dependency";
        visualization.runtimeStatusLabel = "依赖能力不可用";
      } else {
        visualization.runtimeStatus = "available";
        visualization.runtimeStatusLabel = "可用";
      }
    });
  }

  function toggleCapability(type, id, enabled) {
    return commit("capability-toggled", function mutate(state) {
      var kind = capabilityKind(type);
      var item = kind ? find(capabilityList(state, kind), id) : null;
      if (!item) return null;
      var nextEnabled = Boolean(enabled);
      if (item.enabled === nextEnabled) return item;
      if (!nextEnabled && kind === "tool") {
        var usedByEnabledSkill = state.skills.some(function some(skill) {
          if (!skill.enabled || skill.id === item.id) return false;
          var dependencyIds = ((skill.dependencies && skill.dependencies.toolIds) || []);
          return dependencyIds.indexOf(item.id) >= 0;
        });
        if (usedByEnabledSkill) return null;
      }
      if (nextEnabled && kind === "skill") {
        var dependencies = item.dependencies || {};
        var dependencyItems = (dependencies.toolIds || []).map(function map(toolId) { return find(state.tools, toolId); })
          .concat((dependencies.skillIds || []).map(function map(skillId) { return find(state.skills, skillId); }));
        if (dependencyItems.some(function some(dependency) { return !dependency || dependency.enabled === false || dependency.status !== "available"; })) return null;
      }
      var before = item.statusLabel;
      item.enabled = nextEnabled;
      if (kind === "tool" && nextEnabled) {
        item.status = "available";
        item.statusLabel = "可用";
      }
      recomputeCapabilityDependencies(state);
      record(state, {
        objectType: kind,
        objectId: item.id,
        objectName: item.name,
        action: nextEnabled ? "enabled" : "disabled",
        actionLabel: nextEnabled ? "启用" : "停用",
        before: { status: before },
        after: { status: item.statusLabel },
        impact: item.fallback || item.recoveryEffect || "相关依赖能力已同步更新状态。"
      });
      return item;
    });
  }

  function createCapabilityFromUpload(type, payload) {
    var input = payload || {};
    return commit("capability-uploaded", function mutate(state) {
      var kind = capabilityKind(type);
      var name = String(input.name || "").trim();
      var description = String(input.description || "").trim();
      var packageMeta = uploadedPackageMetadata(input);
      if (!kind || !name || !description || !packageMeta || !packageMeta.rootName) return null;
      if (capabilityList(state, kind).some(function some(item) { return String(item.name).toLowerCase() === name.toLowerCase(); })) return null;
      var enabled = false;
      var createdAt = nowIso();
      var item = {
        id: OpsDemo.utils.id(kind === "skill" ? "SK" : "TOOL"),
        name: name,
        description: description,
        icon: String(input.icon || (kind === "skill" ? "sparkles" : "wrench")),
        enabled: enabled,
        status: enabled ? "available" : "disabled",
        statusLabel: enabled ? "可用" : "已停用",
        callsThisMonth: 0,
        successRate: null,
        avgLatencyMs: null,
        sourceType: kind === "skill" ? "managed" : "uploaded",
        sourceTypeLabel: kind === "skill" ? "统一管理" : "上传",
        userUploaded: true,
        editable: true,
        deletable: true,
        packageMeta: packageMeta,
        upload: {
          name: packageMeta.fileName,
          size: packageMeta.totalBytes,
          type: packageMeta.fileType,
          uploadedAt: packageMeta.importedAt
        },
        createdAt: createdAt,
        updatedAt: createdAt
      };
      if (kind === "skill") {
        var toolIds = normalizedCapabilityToolIds(state, input.toolIds || []);
        if (!toolIds) return null;
        if (input.skillMarkdown != null || input.manifestSource != null) {
          item.skillMarkdown = String(input.skillMarkdown != null ? input.skillMarkdown : input.manifestSource);
        }
        item.category = String(input.category || "自定义能力").trim() || "自定义能力";
        item.dependencies = { toolIds: toolIds, skillIds: [] };
        item.inputSummary = String(input.inputSummary || "由上传的 Skill 定义");
        item.outputSummary = String(input.outputSummary || "由上传的 Skill 定义");
        state.skills.unshift(item);
      } else {
        item.code = nextUploadedToolCode(state, input.code || name);
        item.implementationType = String(input.implementationType || "上传 Tool").trim() || "上传 Tool";
        item.dataScope = String(input.dataScope || "由上传的 Tool 定义");
        item.actionType = String(input.actionType || "custom");
        item.dependentSkillIds = [];
        state.tools.unshift(item);
      }
      recomputeCapabilityDependencies(state);
      record(state, {
        objectType: kind,
        objectId: item.id,
        objectName: item.name,
        action: kind === "skill" ? "created" : "uploaded",
        actionLabel: kind === "skill" ? "添加" : "上传",
        before: null,
        after: { enabled: item.enabled, fileName: packageMeta.fileName, fileCount: packageMeta.fileCount },
        impact: kind === "skill" ? "该 Skill 已加入目录，并按绑定 Tool 状态决定是否可调用。" : "该 Tool 已加入目录，可供 Skill 绑定。"
      });
      return item;
    });
  }

  function updateCapability(type, id, patch) {
    var input = patch || {};
    return commit("capability-updated", function mutate(state) {
      var kind = capabilityKind(type);
      var item = kind ? find(capabilityList(state, kind), id) : null;
      if (!item) return null;
      if (kind === "tool" && (item.userUploaded !== true || item.enabled !== false || item.editable === false)) return null;
      var name = input.name == null ? item.name : String(input.name || "").trim();
      var description = input.description == null ? item.description : String(input.description || "").trim();
      if (!name || !description) return null;
      if (capabilityList(state, kind).some(function some(candidate) { return candidate.id !== id && String(candidate.name).toLowerCase() === name.toLowerCase(); })) return null;
      var nextToolCode = null;
      if (kind === "skill" && input.toolIds != null) {
        var suppliedToolIds = normalizedCapabilityToolIds(state, input.toolIds);
        var currentToolIds = ((item.dependencies && item.dependencies.toolIds) || []).slice();
        if (!suppliedToolIds || suppliedToolIds.length !== currentToolIds.length || suppliedToolIds.some(function some(toolId) { return currentToolIds.indexOf(toolId) < 0; })) return null;
      }
      if (kind === "tool" && input.code != null) {
        nextToolCode = normalizedToolCode(input.code);
        if (!nextToolCode || state.tools.some(function some(tool) { return tool.id !== id && tool.code === nextToolCode; })) return null;
      }
      var before = { name: item.name, description: item.description };
      item.name = name;
      item.description = description;
      if (kind === "tool") {
        if (input.icon != null) item.icon = String(input.icon || "wrench");
        if (input.code != null) item.code = nextToolCode;
        if (input.implementationType != null) item.implementationType = String(input.implementationType || "上传 Tool").trim() || "上传 Tool";
      }
      item.updatedAt = nowIso();
      recomputeCapabilityDependencies(state);
      record(state, {
        objectType: kind,
        objectId: item.id,
        objectName: item.name,
        action: "updated",
        actionLabel: "编辑",
        before: before,
        after: { name: item.name, description: item.description },
        impact: kind === "skill" ? "Skill 的名称与描述已更新，系统维护的 Tool 依赖保持不变。" : "目录中的基础信息已更新。"
      });
      return item;
    });
  }

  function deleteCapability(type, id) {
    return commit("capability-deleted", function mutate(state) {
      var kind = capabilityKind(type);
      var items = kind ? capabilityList(state, kind) : [];
      var item = find(items, id);
      if (!item || item.enabled !== false) return null;
      if (kind === "tool" && (item.userUploaded !== true || item.deletable === false)) return null;
      var referenced = kind === "tool" && state.skills.some(function some(skill) {
        return skill.enabled && ((skill.dependencies && skill.dependencies.toolIds) || []).indexOf(id) >= 0;
      });
      if (referenced) return null;
      items.splice(items.indexOf(item), 1);
      recomputeCapabilityDependencies(state);
      record(state, {
        objectType: kind,
        objectId: item.id,
        objectName: item.name,
        action: "deleted",
        actionLabel: "删除",
        before: { fileName: item.packageMeta && item.packageMeta.fileName },
        after: null,
        impact: kind === "skill" ? "Skill 已从目录移除。" : "用户上传的 Tool 已从目录移除。"
      });
      return item;
    });
  }

  function createApiKey(payload) {
    var input = payload || {};
    return commit("api-key-created", function mutate(state) {
      var name = String(input.name || input.applicationName || "").trim();
      var permissionLevel = String(input.permissionLevel || input.accessLevel || "").toUpperCase();
      var validPermissionLevels = (state.meta && state.meta.accessLevels || []).map(function map(level) { return level.code; });
      if (!validPermissionLevels.length) validPermissionLevels = ["L1", "L2", "L3"];
      var apiAccess = state.apiAccess || (state.apiAccess = { clients: [] });
      apiAccess.clients = apiAccess.clients || [];
      if (!name || validPermissionLevels.indexOf(permissionLevel) < 0 || apiAccess.clients.some(function some(item) { return String(item.name || "").toLowerCase() === name.toLowerCase(); })) return null;

      var key = apiSecret();
      var createdAt = nowIso();
      var apiKey = {
        id: OpsDemo.utils.id("API"),
        name: name,
        keyMasked: maskedApiSecret(key),
        createdAt: createdAt,
        lastUsedAt: null,
        permissionLevel: permissionLevel,
        enabled: true,
        status: "active",
        statusLabel: "已启用"
      };
      apiAccess.clients.unshift(apiKey);
      record(state, {
        objectType: "api_key",
        objectId: apiKey.id,
        objectName: apiKey.name,
        action: "created",
        actionLabel: "创建密钥",
        before: null,
        after: { status: apiKey.status, permissionLevel: apiKey.permissionLevel },
        impact: "新密钥仅在创建完成后显示一次。"
      });
      return { key: key };
    });
  }

  function setApiKeyEnabled(id, enabled) {
    return commit("api-key-status-changed", function mutate(state) {
      var apiKey = find(state.apiAccess && state.apiAccess.clients, id);
      if (!apiKey) return null;
      var nextEnabled = Boolean(enabled);
      if (!apiKey.permissionLevel || ["L1", "L2", "L3"].indexOf(apiKey.permissionLevel) < 0) apiKey.permissionLevel = "L1";
      if (apiKey.enabled === nextEnabled) return apiKey;
      var before = { status: apiKey.status, enabled: apiKey.enabled };
      apiKey.enabled = nextEnabled;
      apiKey.status = nextEnabled ? "active" : "disabled";
      apiKey.statusLabel = nextEnabled ? "已启用" : "已禁用";
      record(state, {
        objectType: "api_key",
        objectId: apiKey.id,
        objectName: apiKey.name,
        action: nextEnabled ? "enabled" : "disabled",
        actionLabel: nextEnabled ? "启用" : "禁用",
        before: before,
        after: { status: apiKey.status, enabled: apiKey.enabled },
        impact: nextEnabled ? "该密钥恢复调用。" : "该密钥停止接受新调用，记录保留。"
      });
      return apiKey;
    });
  }

  function deleteApiKey(id) {
    return commit("api-key-deleted", function mutate(state) {
      var clients = state.apiAccess && state.apiAccess.clients || [];
      var apiKey = find(clients, id);
      if (!apiKey) return null;
      clients.splice(clients.indexOf(apiKey), 1);
      record(state, {
        objectType: "api_key",
        objectId: apiKey.id,
        objectName: apiKey.name,
        action: "deleted",
        actionLabel: "删除密钥",
        before: { status: apiKey.status, keyMasked: apiKey.keyMasked, permissionLevel: apiKey.permissionLevel || "L1" },
        after: null,
        impact: "密钥已立即失效并从密钥列表删除。"
      });
      return apiKey;
    });
  }

  function enterpriseDatabaseEngineLabel(engine) {
    return {
      postgresql: "PostgreSQL",
      mysql: "MySQL",
      sqlserver: "SQL Server"
    }[engine] || "PostgreSQL";
  }

  function enterpriseDefaultPort(engine) {
    return {
      postgresql: 5432,
      mysql: 3306,
      sqlserver: 1433
    }[engine] || 5432;
  }

  function enterpriseDatabaseCatalog(engine) {
    var catalogs = {
      postgresql: ["supply_chain", "procurement_contract", "contract_analytics"],
      mysql: ["procurement_analytics", "supplier_quality", "commerce_dw"],
      sqlserver: ["logistics_ops", "logistics_reporting", "erp_reporting"]
    };
    return (catalogs[engine] || []).slice();
  }

  function enterpriseConnectionTestResult(payload) {
    var input = payload || {};
    var engine = String(input.databaseEngine || "").trim();
    var host = String(input.host || "").trim();
    var port = Number(input.port);
    var username = String(input.username || "").trim();
    var hasPassword = String(input.password == null ? "" : input.password).length > 0 || Boolean(input.passwordConfigured);
    var supported = ["postgresql", "mysql", "sqlserver"].indexOf(engine) >= 0;
    var failed = Boolean(input.simulateFailure) || /(?:invalid|offline|fail|不可用)/i.test(host);
    var testedAt = nowIso();
    if (!supported) return { passed: false, status: "unavailable", statusLabel: "连接失败", testedAt: testedAt, message: "请选择支持的数据库类型。" };
    if (!host) return { passed: false, status: "unavailable", statusLabel: "连接失败", testedAt: testedAt, message: "请填写服务器地址。" };
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { passed: false, status: "unavailable", statusLabel: "连接失败", testedAt: testedAt, message: "请填写有效端口。" };
    if (!username) return { passed: false, status: "unavailable", statusLabel: "连接失败", testedAt: testedAt, message: "请填写用户名。" };
    if (!hasPassword) return { passed: false, status: "unavailable", statusLabel: "连接失败", testedAt: testedAt, message: "请填写密码。" };
    if (failed) return { passed: false, status: "unavailable", statusLabel: "连接失败", testedAt: testedAt, message: "数据库无响应，请检查地址、端口、用户名或密码。" };
    var databases = enterpriseDatabaseCatalog(engine);
    return {
      passed: true,
      status: "available",
      statusLabel: "连接正常",
      testedAt: testedAt,
      databases: databases,
      message: "连接正常，已获取 " + databases.length + " 个可访问数据库。"
    };
  }

  function testEnterpriseConnectionDraft(payload) {
    return enterpriseConnectionTestResult(payload);
  }

  function saveEnterpriseConnection(payload) {
    var input = payload || {};
    if (!input.tested) return null;
    var existingState = store.getState();
    var existing = input.id ? find(existingState.enterpriseConnections || [], input.id) : null;
    var passwordConfigured = String(input.password == null ? "" : input.password).length > 0 || Boolean(existing && existing.passwordConfigured);
    var preflight = enterpriseConnectionTestResult(Object.assign({}, input, { passwordConfigured: passwordConfigured }));
    if (!preflight.passed) return null;
    return commit("enterprise-connection-saved", function mutate(state) {
      var list = state.enterpriseConnections || (state.enterpriseConnections = []);
      var current = input.id ? find(list, input.id) : null;
      if (input.id && !current) return null;
      var name = String(input.name || "").trim();
      var description = Object.prototype.hasOwnProperty.call(input, "description") ? String(input.description || "").trim() : String(current && current.description || "").trim();
      var databaseEngine = String(input.databaseEngine || "").trim();
      var host = String(input.host || "").trim();
      var port = Number(input.port);
      var databaseName = String(input.databaseName || "").trim();
      var username = String(input.username || "").trim();
      if (!name || !host || !databaseName || !username || !passwordConfigured) return null;
      if (preflight.databases.indexOf(databaseName) < 0) return null;
      if (list.some(function some(item) { return item !== current && String(item.name || "").toLowerCase() === name.toLowerCase(); })) return null;
      var timestamp = preflight.testedAt;
      var engineLabel = enterpriseDatabaseEngineLabel(databaseEngine);
      var endpoint = host + ":" + port + "/" + databaseName;
      var connection = current || {
        id: OpsDemo.utils.id("CONNECTION"),
        runtimeBinding: { id: "connection-managed-" + (list.length + 1), version: "v0.1" },
        protected: false,
      };
      var before = current ? { name: current.name, endpoint: current.endpoint, status: current.status } : null;
      connection.name = name;
      connection.description = description;
      connection.connectionType = "database";
      connection.databaseEngine = databaseEngine;
      connection.databaseEngineLabel = engineLabel;
      connection.connectionTypeLabel = engineLabel;
      connection.implementationType = engineLabel + " / 只读";
      connection.host = host;
      connection.port = port;
      connection.databaseName = databaseName;
      connection.endpoint = endpoint;
      connection.username = username;
      connection.passwordConfigured = true;
      connection.status = preflight.status;
      connection.statusLabel = preflight.statusLabel;
      connection.businessDomain = databaseName;
      connection.owner = "数据库管理员";
      connection.access = "read-only";
      connection.limits = {
        maxRows: Math.max(100, Math.min(10000, Number(input.maxRows || 1000))),
        timeoutSeconds: Math.max(5, Math.min(60, Number(input.timeoutSeconds || 20))),
        lookbackDays: 90,
        maskSensitiveFields: true,
        ssl: true
      };
      connection.lastCheck = { at: timestamp, result: "passed", message: preflight.message, sideEffectFree: true };
      connection.updatedAt = timestamp;
      if (!current) list.unshift(connection);
      record(state, {
        objectType: "enterprise_connection",
        objectId: connection.id,
        objectName: connection.name,
        action: current ? "updated" : "created",
        actionLabel: current ? "编辑数据库连接" : "登记数据库连接",
        before: before,
        after: { endpoint: connection.endpoint, username: connection.username, status: connection.status },
        impact: "数据库连接已保存，可在后续导入数据时选择 Schema、表和视图。"
      });
      return connection;
    });
  }

  function testEnterpriseConnection(id, options) {
    var state = store.getState();
    var connection = find(state.enterpriseConnections, id);
    if (!connection) return null;
    var result = enterpriseConnectionTestResult({
      databaseEngine: connection.databaseEngine,
      host: connection.host,
      port: connection.port,
      databaseName: connection.databaseName,
      username: connection.username,
      passwordConfigured: connection.passwordConfigured,
      simulateFailure: options && options.simulateFailure
    });
    return commit("enterprise-connection-tested", function mutate(currentState) {
      var current = find(currentState.enterpriseConnections, id);
      current.status = result.status;
      current.statusLabel = result.statusLabel;
      current.lastCheck = { at: result.testedAt, result: result.passed ? "passed" : "failed", message: result.message, sideEffectFree: true };
      current.updatedAt = result.testedAt;
      record(currentState, {
        objectType: "enterprise_connection",
        objectId: current.id,
        objectName: current.name,
        action: "tested",
        actionLabel: "测试数据库连接",
        before: null,
        after: { status: current.status },
        impact: result.message
      });
      return current;
    });
  }

  function deleteEnterpriseConnection(id) {
    return commit("enterprise-connection-deleted", function mutate(state) {
      var connection = find(state.enterpriseConnections, id);
      if (!connection || connection.protected) return null;
      state.enterpriseConnections.splice(state.enterpriseConnections.indexOf(connection), 1);
      record(state, {
        objectType: "enterprise_connection",
        objectId: connection.id,
        objectName: connection.name,
        action: "deleted",
        actionLabel: "删除数据库连接",
        before: { endpoint: connection.endpoint },
        after: null,
        impact: "数据库连接及其保存的账号信息已删除。"
      });
      return connection;
    });
  }

  var EXTERNAL_SOURCE_NAME_MAP = {
    "ustr.gov": "美国贸易代表办公室",
    "cbp.gov": "美国海关和边境保护局",
    "wto.org": "世界贸易组织",
    "stats.gov.cn": "国家统计局",
    "apple.com.cn": "Apple 中国"
  };

  function externalInformationState(state) {
    var external = state.externalInformation || (state.externalInformation = {});
    external.sources = external.sources || [];
    external.tags = external.tags || [];
    return external;
  }

  function normalizeExternalSourceUrl(value) {
    var cleaned = String(value || "").trim()
      .replace(/^[\s\u2022*-]+/, "")
      .replace(/^["'<]+|[>"',;]+$/g, "");
    var schemeMatch = cleaned.match(/^([a-z][a-z0-9+.-]*):\/\//i);
    if (schemeMatch && !/^https?$/i.test(schemeMatch[1])) return "";
    var candidate = schemeMatch ? cleaned : "http" + "://" + cleaned.replace(/^\/\//, "");
    var parsed;
    try {
      parsed = new URL(candidate);
    } catch (error) {
      return "";
    }
    if (parsed.username || parsed.password) return "";
    var normalized = String(parsed.hostname || "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    var labels = normalized.split(".");
    if (!normalized || normalized.length > 253 || labels.length < 2 || labels.some(function invalid(label) {
      return !label || label.length > 63 || !/^[a-z0-9-]+$/i.test(label) || /^-|-$/.test(label);
    })) return "";
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return "";
    return normalized;
  }

  function externalSourceDisplayUrl(value) {
    var normalized = normalizeExternalSourceUrl(value);
    return normalized ? "www." + normalized : "";
  }

  function inferExternalSourceName(url) {
    var normalized = normalizeExternalSourceUrl(url);
    if (EXTERNAL_SOURCE_NAME_MAP[normalized]) return EXTERNAL_SOURCE_NAME_MAP[normalized];
    var labels = normalized.split(".");
    var commonSecondLevel = { com: true, net: true, org: true, gov: true, edu: true, co: true };
    var nameIndex = labels.length - 2;
    if (labels.length > 2 && commonSecondLevel[labels[nameIndex]]) nameIndex -= 1;
    var identity = labels[nameIndex] || labels[0] || normalized;
    return identity.split(/[-_]/).filter(Boolean).map(function map(part) {
      return part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
    }).join(" ") || normalized;
  }

  function normalizedExternalTagName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function findExternalTagByName(external, name) {
    var normalized = normalizedExternalTagName(name).toLowerCase();
    return external.tags.find(function findTag(tag) {
      return String(tag.name || "").toLowerCase() === normalized;
    }) || null;
  }

  function ensureExternalTag(external, name) {
    var displayName = normalizedExternalTagName(name);
    if (!displayName) return null;
    var existing = findExternalTagByName(external, displayName);
    if (existing) return existing;
    var tag = { id: OpsDemo.utils.id("TAG"), name: displayName, createdAt: nowIso() };
    external.tags.push(tag);
    return tag;
  }

  function uniqueIds(items) {
    return (items || []).filter(function filter(id, index, list) {
      return id && list.indexOf(id) === index;
    });
  }

  function resolveExternalTagIds(external, ids, names, createMissing) {
    var knownIds = uniqueIds(ids).filter(function filter(id) { return Boolean(find(external.tags, id)); });
    (names || []).forEach(function each(name) {
      var tag = createMissing ? ensureExternalTag(external, name) : findExternalTagByName(external, name);
      if (tag && knownIds.indexOf(tag.id) < 0) knownIds.push(tag.id);
    });
    return knownIds;
  }

  function externalSourcePreview(state, text) {
    var external = externalInformationState(state);
    var existing = {};
    external.sources.forEach(function each(source) {
      var canonical = normalizeExternalSourceUrl(source.url);
      if (canonical) existing[canonical] = source;
    });
    var seen = {};
    var items = String(text || "").split(/\r?\n/).map(function map(line) { return line.trim(); }).filter(Boolean).map(function map(line) {
      var url = normalizeExternalSourceUrl(line);
      if (!url) return { input: line, url: "", name: "", status: "invalid", message: "网址格式无效" };
      if (seen[url]) return { input: line, url: externalSourceDisplayUrl(url), canonicalUrl: url, name: inferExternalSourceName(url), status: "duplicate", message: "本次粘贴中重复" };
      seen[url] = true;
      if (existing[url]) return {
        input: line,
        url: externalSourceDisplayUrl(url),
        canonicalUrl: url,
        name: existing[url].name,
        status: "duplicate",
        message: existing[url].enabled ? "已存在（启用中）" : "已存在（已停用）",
        existingId: existing[url].id
      };
      return { input: line, url: externalSourceDisplayUrl(url), canonicalUrl: url, name: inferExternalSourceName(url), status: "ready", message: "可添加" };
    });
    return {
      items: items,
      readyCount: items.filter(function filter(item) { return item.status === "ready"; }).length,
      duplicateCount: items.filter(function filter(item) { return item.status === "duplicate"; }).length,
      invalidCount: items.filter(function filter(item) { return item.status === "invalid"; }).length
    };
  }

  function previewExternalSourceUrls(text) {
    return externalSourcePreview(store.getState(), text);
  }

  function importExternalSources(text, payload) {
    var input = payload || {};
    var sourceNames = input.names || {};
    var sourceTagIds = input.tagIdsByUrl || {};
    var includedUrls = Array.isArray(input.includeUrls) ? uniqueIds(input.includeUrls.map(normalizeExternalSourceUrl).filter(Boolean)) : null;
    var preview = externalSourcePreview(store.getState(), text);
    var readyItems = preview.items.filter(function filter(item) {
      return item.status === "ready" && (!includedUrls || includedUrls.indexOf(item.canonicalUrl) >= 0);
    });
    if (!readyItems.length) {
      return {
        created: [],
        duplicateCount: preview.duplicateCount,
        invalidCount: preview.invalidCount,
        items: preview.items
      };
    }
    return commit("external-sources-imported", function mutate(state) {
      var external = externalInformationState(state);
      var created = [];
      readyItems.forEach(function each(item) {
        var recognizedName = String(sourceNames[item.canonicalUrl] || item.name).trim();
        var tagIds = resolveExternalTagIds(external, sourceTagIds[item.canonicalUrl] || [], [], false);
        var source = {
          id: OpsDemo.utils.id("SOURCE"),
          name: recognizedName,
          url: item.url,
          canonicalUrl: item.canonicalUrl,
          tagIds: tagIds,
          enabled: true,
          updatedAt: nowIso()
        };
        external.sources.unshift(source);
        created.push(source);
        record(state, {
          objectType: "external_source",
          objectId: source.id,
          objectName: source.name,
          action: "created",
          actionLabel: "添加外部信源",
          before: null,
          after: { url: source.url, tagIds: source.tagIds.slice(), enabled: true },
          impact: "信源已登记并默认启用。"
        });
      });
      return {
        created: created,
        duplicateCount: preview.duplicateCount,
        invalidCount: preview.invalidCount,
        items: preview.items
      };
    });
  }

  function saveExternalSource(payload) {
    var input = payload || {};
    var external = externalInformationState(store.getState());
    var current = input.id ? find(external.sources, input.id) : null;
    if (input.id && !current) return null;
    var url = normalizeExternalSourceUrl(input.url);
    var name = String(input.name || inferExternalSourceName(url)).trim();
    if (!name || !url) return null;
    if (external.sources.some(function some(item) {
      return item !== current && normalizeExternalSourceUrl(item.url) === url;
    })) return null;
    return commit("external-source-saved", function mutate(state) {
      var currentExternal = externalInformationState(state);
      var source = current || { id: OpsDemo.utils.id("SOURCE"), enabled: true, tagIds: [] };
      var before = current ? { name: current.name, url: current.url, tagIds: (current.tagIds || []).slice(), enabled: current.enabled } : null;
      source.name = name;
      source.url = externalSourceDisplayUrl(url);
      source.canonicalUrl = url;
      if (input.tagIds != null || input.tagNames != null) {
        source.tagIds = resolveExternalTagIds(currentExternal, input.tagIds || [], input.tagNames || [], true);
      } else {
        source.tagIds = source.tagIds || [];
      }
      source.updatedAt = nowIso();
      if (!current) currentExternal.sources.unshift(source);
      record(state, {
        objectType: "external_source",
        objectId: source.id,
        objectName: source.name,
        action: current ? "updated" : "created",
        actionLabel: current ? "编辑外部信源" : "新增外部信源",
        before: before,
        after: { url: source.url, tagIds: source.tagIds.slice(), enabled: source.enabled },
        impact: current ? "信源名称、网址或标签已更新。" : "信源已登记并默认启用。"
      });
      return source;
    });
  }

  function updateExternalSourceTags(ids, payload) {
    var input = payload || {};
    var external = externalInformationState(store.getState());
    var sourceIds = uniqueIds(ids);
    var sources = sourceIds.map(function map(id) { return find(external.sources, id); }).filter(Boolean);
    var mode = input.mode || "add";
    if (["add", "remove", "replace"].indexOf(mode) < 0) return [];
    var tagNames = (input.tagNames || []).map(normalizedExternalTagName).filter(Boolean);
    var validTagIds = uniqueIds(input.tagIds || []).filter(function filter(id) { return Boolean(find(external.tags, id)); });
    if (!sources.length || sources.length !== sourceIds.length) return [];
    if (mode === "remove") {
      validTagIds = resolveExternalTagIds(external, validTagIds, tagNames, false);
      if (!validTagIds.length) return [];
    }
    if (mode === "add" && !validTagIds.length && !tagNames.length) return [];
    return commit("external-source-tags-updated", function mutate(state) {
      var currentExternal = externalInformationState(state);
      var currentSources = sourceIds.map(function map(id) { return find(currentExternal.sources, id); }).filter(Boolean);
      var tagIds = resolveExternalTagIds(currentExternal, validTagIds, tagNames, mode !== "remove");
      currentSources.forEach(function each(source) {
        var before = (source.tagIds || []).slice();
        if (mode === "replace") source.tagIds = tagIds.slice();
        if (mode === "add") source.tagIds = uniqueIds(before.concat(tagIds));
        if (mode === "remove") source.tagIds = before.filter(function filter(id) { return tagIds.indexOf(id) < 0; });
        source.updatedAt = nowIso();
        record(state, {
          objectType: "external_source",
          objectId: source.id,
          objectName: source.name,
          action: "tags_updated",
          actionLabel: mode === "remove" ? "移除标签" : mode === "replace" ? "设置标签" : "添加标签",
          before: { tagIds: before },
          after: { tagIds: source.tagIds.slice() },
          impact: "信源标签已更新。"
        });
      });
      return currentSources;
    });
  }

  function createExternalTag(name) {
    var external = externalInformationState(store.getState());
    var displayName = normalizedExternalTagName(name);
    if (!displayName || findExternalTagByName(external, displayName)) return null;
    return commit("external-tag-created", function mutate(state) {
      var currentExternal = externalInformationState(state);
      var tag = { id: OpsDemo.utils.id("TAG"), name: displayName, createdAt: nowIso() };
      currentExternal.tags.push(tag);
      record(state, {
        objectType: "external_tag",
        objectId: tag.id,
        objectName: tag.name,
        action: "created",
        actionLabel: "新增标签",
        before: null,
        after: { name: tag.name },
        impact: "标签已创建，可用于信源标记。"
      });
      return tag;
    }, { silentRender: true });
  }

  function renameExternalTag(id, name) {
    var external = externalInformationState(store.getState());
    var tag = find(external.tags, id);
    var nextName = normalizedExternalTagName(name);
    if (!tag || !nextName || external.tags.some(function some(item) { return item !== tag && String(item.name || "").toLowerCase() === nextName.toLowerCase(); })) return null;
    return commit("external-tag-renamed", function mutate(state) {
      var before = tag.name;
      tag.name = nextName;
      record(state, {
        objectType: "external_tag",
        objectId: tag.id,
        objectName: tag.name,
        action: "renamed",
        actionLabel: "重命名标签",
        before: { name: before },
        after: { name: nextName },
        impact: "所有信源上的标签名称已同步更新。"
      });
      return tag;
    }, { silentRender: true });
  }

  function deleteExternalTag(id) {
    var external = externalInformationState(store.getState());
    var tag = find(external.tags, id);
    if (!tag) return null;
    return commit("external-tag-deleted", function mutate(state) {
      var usageCount = 0;
      external.sources.forEach(function each(source) {
        var before = (source.tagIds || []).length;
        source.tagIds = (source.tagIds || []).filter(function filter(tagId) { return tagId !== tag.id; });
        if (source.tagIds.length !== before) {
          usageCount += 1;
          source.updatedAt = nowIso();
        }
      });
      external.tags.splice(external.tags.indexOf(tag), 1);
      record(state, {
        objectType: "external_tag",
        objectId: tag.id,
        objectName: tag.name,
        action: "deleted",
        actionLabel: "删除标签",
        before: { usageCount: usageCount },
        after: null,
        impact: "标签已从相关信源移除，信源本身未删除。"
      });
      return tag;
    }, { silentRender: true });
  }

  function setExternalSourcesEnabled(ids, enabled) {
    var external = externalInformationState(store.getState());
    var sourceIds = uniqueIds(ids);
    var sources = sourceIds.map(function map(id) { return find(external.sources, id); }).filter(Boolean);
    if (!sources.length || sources.length !== sourceIds.length) return [];
    return commit("external-sources-toggled", function mutate(state) {
      var nextEnabled = Boolean(enabled);
      sources.forEach(function each(source) {
        var before = source.enabled;
        source.enabled = nextEnabled;
        source.updatedAt = nowIso();
        record(state, {
          objectType: "external_source",
          objectId: source.id,
          objectName: source.name,
          action: nextEnabled ? "enabled" : "disabled",
          actionLabel: nextEnabled ? "启用外部信源" : "停用外部信源",
          before: { enabled: before },
          after: { enabled: nextEnabled },
          impact: nextEnabled ? "该信源可用于外部检索。" : "该信源不再用于外部检索。"
        });
      });
      return sources;
    });
  }

  function setExternalSourceEnabled(id, enabled) {
    return setExternalSourcesEnabled([id], enabled)[0] || null;
  }

  function deleteExternalSources(ids) {
    var external = externalInformationState(store.getState());
    var sourceIds = uniqueIds(ids);
    var sources = sourceIds.map(function map(id) { return find(external.sources, id); }).filter(Boolean);
    if (!sources.length || sources.length !== sourceIds.length || sources.some(function some(source) { return source.enabled; })) return [];
    return commit("external-sources-deleted", function mutate(state) {
      sources.forEach(function each(source) {
        external.sources.splice(external.sources.indexOf(source), 1);
        record(state, {
          objectType: "external_source",
          objectId: source.id,
          objectName: source.name,
          action: "deleted",
          actionLabel: "删除外部信源",
          before: { url: source.url, tagIds: (source.tagIds || []).slice(), enabled: false },
          after: null,
          impact: "信源已从外部检索范围移除。"
        });
      });
      return sources;
    });
  }

  function deleteExternalSource(id) {
    return deleteExternalSources([id])[0] || null;
  }

  function externalSearchServiceState(state) {
    var external = state.externalInformation || (state.externalInformation = {});
    external.services = external.services || [];
    return external;
  }

  function externalSearchServiceTypeLabel(type) {
    return { elasticsearch: "Elasticsearch", opensearch: "OpenSearch", custom: "自定义接口" }[type] || "未知服务";
  }

  function externalSearchServiceMappingDefaults(type) {
    if (type === "custom") return { resultPath: "data.items", idField: "id", titleField: "title", urlField: "url", snippetField: "snippet", contentField: "content", sourceField: "sourceName", publishedAtField: "publishedAt", scoreField: "score" };
    return { resultPath: "hits.hits", idField: "_id", titleField: "_source.title", urlField: "_source.url", snippetField: "_source.snippet", contentField: "_source.content", sourceField: "_source.sourceName", publishedAtField: "_source.publishedAt", scoreField: "_score" };
  }

  function normalizeSearchServiceEndpoint(value) {
    var endpoint = String(value || "").trim().replace(/\/+$/, "");
    try {
      var parsed = new URL(endpoint);
      if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return "";
      return endpoint;
    } catch (error) {
      return "";
    }
  }

  function normalizeSearchServiceMapping(mapping, type) {
    var defaults = externalSearchServiceMappingDefaults(type);
    return Object.keys(defaults).reduce(function reduce(result, key) {
      result[key] = String(mapping && mapping[key] != null ? mapping[key] : defaults[key]).trim();
      return result;
    }, {});
  }

  function testExternalSearchServiceDraft(payload) {
    var input = payload || {};
    var serviceType = String(input.serviceType || "");
    var endpoint = normalizeSearchServiceEndpoint(input.endpoint);
    var authType = String(input.authType || "api_key");
    var mapping = normalizeSearchServiceMapping(input.mapping, serviceType);
    var credentialReady = authType === "none" || Boolean(input.credential || input.credentialConfigured);
    if (["elasticsearch", "opensearch", "custom"].indexOf(serviceType) < 0) return { passed: false, message: "请选择支持的检索服务类型。" };
    if (!endpoint) return { passed: false, message: "请填写有效的 HTTP 或 HTTPS 服务地址。" };
    if (serviceType === "custom" && (!String(input.path || "").trim().startsWith("/") || !mapping.resultPath)) return { passed: false, message: "自定义接口需要有效的请求路径和结果列表路径。" };
    if (serviceType !== "custom" && !String(input.indexName || "").trim()) return { passed: false, message: "请填写需要检索的索引或别名。" };
    if (!credentialReady || (authType === "basic" && !String(input.username || "").trim())) return { passed: false, message: "请完成当前鉴权方式所需的账号与访问凭证。" };
    if (!mapping.idField || !mapping.titleField || !mapping.contentField) return { passed: false, message: "返回格式无法自动适配，请检查高级配置中的字段映射。" };
    if (/offline|unavailable|invalid/i.test(endpoint)) return { passed: false, message: "服务不可达，请检查地址、网络和鉴权配置。" };
    return { passed: true, resultCount: 3, message: "自动测试通过，连接正常且返回格式可识别。", sample: { id: "doc-demo-01", title: "全球贸易政策更新", url: "https" + "://example.com/policy-update", snippet: "已识别标题、来源、发布时间与正文。", sourceName: "示例信源", publishedAt: "2026-09-02T10:00:00+08:00", score: 0.91 } };
  }

  function saveExternalSearchService(payload) {
    var input = payload || {};
    var external = externalSearchServiceState(store.getState());
    var current = input.id ? find(external.services, input.id) : null;
    var name = String(input.name || "").trim();
    var serviceType = String(input.serviceType || "");
    var endpoint = normalizeSearchServiceEndpoint(input.endpoint);
    var authType = String(input.authType || "api_key");
    var mapping = normalizeSearchServiceMapping(input.mapping, serviceType);
    var credentialConfigured = authType === "none" || Boolean(input.credential || input.credentialConfigured || current && current.credentialConfigured);
    if (input.id && !current) return null;
    if (!input.tested || !name || !endpoint || ["elasticsearch", "opensearch", "custom"].indexOf(serviceType) < 0 || !credentialConfigured) return null;
    if (serviceType === "custom" && (!String(input.path || "").trim().startsWith("/") || !mapping.resultPath)) return null;
    if (serviceType !== "custom" && !String(input.indexName || "").trim()) return null;
    if (authType === "basic" && !String(input.username || current && current.username || "").trim()) return null;
    if (!mapping.idField || !mapping.titleField || !mapping.contentField) return null;
    if (external.services.some(function some(item) { return item !== current && String(item.name || "").toLowerCase() === name.toLowerCase(); })) return null;
    return commit("external-search-service-saved", function mutate(state) {
      var currentExternal = externalSearchServiceState(state);
      var service = current || { id: OpsDemo.utils.id("SEARCH-SERVICE") };
      var before = current ? { name: current.name, serviceType: current.serviceType, endpoint: current.endpoint, indexName: current.indexName, path: current.path, mapping: Object.assign({}, current.mapping) } : null;
      service.name = name;
      service.description = String(input.description || "").trim();
      service.serviceType = serviceType;
      service.serviceTypeLabel = externalSearchServiceTypeLabel(serviceType);
      service.endpoint = endpoint;
      service.indexName = serviceType === "custom" ? "" : String(input.indexName || "").trim();
      service.path = serviceType === "custom" ? String(input.path || "").trim() : "";
      service.method = serviceType === "custom" && String(input.method || "").toUpperCase() === "GET" ? "GET" : "POST";
      service.authType = authType;
      service.username = authType === "basic" ? String(input.username || current && current.username || "").trim() : "";
      service.credentialConfigured = credentialConfigured;
      service.mapping = mapping;
      service.status = "available";
      service.statusLabel = "检索正常";
      service.lastCheck = { at: nowIso(), result: "passed", message: "自动测试通过，连接正常且返回格式可识别。", sideEffectFree: true };
      service.updatedAt = nowIso();
      if (!current) currentExternal.services.unshift(service);
      record(state, { objectType: "external_search_service", objectId: service.id, objectName: service.name, action: current ? "updated" : "created", actionLabel: current ? "编辑检索服务" : "接入检索服务", before: before, after: { serviceType: service.serviceType, endpoint: service.endpoint, indexName: service.indexName, path: service.path, mapping: Object.assign({}, service.mapping) }, impact: "该服务可通过统一检索协议供分析应用调用。" });
      return service;
    });
  }

  function testExternalSearchService(id, options) {
    var external = externalSearchServiceState(store.getState());
    var service = find(external.services, id);
    if (!service) return null;
    var result = options && options.simulateFailure ? { passed: false, message: "服务不可达，请检查地址、网络和鉴权配置。" } : testExternalSearchServiceDraft(Object.assign({}, service, { credentialConfigured: service.credentialConfigured }));
    return commit("external-search-service-tested", function mutate(state) {
      service.status = result.passed ? "available" : "unavailable";
      service.statusLabel = result.passed ? "检索正常" : "检索失败";
      service.lastCheck = { at: nowIso(), result: result.passed ? "passed" : "failed", message: result.message, sideEffectFree: true };
      service.updatedAt = nowIso();
      record(state, { objectType: "external_search_service", objectId: service.id, objectName: service.name, action: "tested", actionLabel: "测试检索服务", before: null, after: { status: service.status }, impact: result.message });
      return service;
    });
  }

  function deleteExternalSearchService(id) {
    var external = externalSearchServiceState(store.getState());
    var service = find(external.services, id);
    if (!service) return null;
    return commit("external-search-service-deleted", function mutate(state) {
      external.services.splice(external.services.indexOf(service), 1);
      record(state, { objectType: "external_search_service", objectId: service.id, objectName: service.name, action: "deleted", actionLabel: "删除检索服务", before: { serviceType: service.serviceType, endpoint: service.endpoint }, after: null, impact: "分析应用不再调用该检索服务。" });
      return service;
    });
  }

  function createRollbackDraft(recordId) {
    var state = store.getState();
    var sourceRecord = find(state.configurationRecords, recordId) || state.configurationRecords.find(function each(item) { return item.objectId === recordId; });
    if (!sourceRecord) return null;
    if (sourceRecord.objectType === "knowledge_version") {
      var restoreVersionId = sourceRecord.before && sourceRecord.before.knowledgeVersionId ? sourceRecord.before.knowledgeVersionId : sourceRecord.objectId;
      var version = find(state.knowledgeVersions, restoreVersionId);
      return version ? rollbackKnowledgeVersion(version.knowledgeBaseId, version.id) : null;
    }
    return null;
  }

  OpsDemo.core.actions = {
    createKnowledgeBase: createKnowledgeBase,
    updateKnowledgeBase: updateKnowledgeBase,
    deleteKnowledgeBase: deleteKnowledgeBase,
    setKnowledgeBaseOnboardingConfig: setKnowledgeBaseOnboardingConfig,
    getProcessingProfileCompatibility: getProcessingProfileCompatibility,
    setKnowledgeBaseEnabled: setKnowledgeBaseEnabled,
    startKnowledgeImport: startKnowledgeImport,
    getLocalDocumentImportContext: getLocalDocumentImportContext,
    confirmDocumentReplacement: confirmDocumentReplacement,
    addDocumentChunk: addDocumentChunk,
    deleteDocument: deleteDocument,
    deleteLocalDocumentAsset: deleteLocalDocumentAsset,
    retryImportItem: retryImportItem,
    removeImportItem: removeImportItem,
    validateKnowledgeVersion: validateKnowledgeVersion,
    activateKnowledgeVersion: activateKnowledgeVersion,
    rollbackKnowledgeVersion: rollbackKnowledgeVersion,
    saveRagModel: saveRagModel,
    updateRagModel: updateRagModel,
    testRagModelDraft: testRagModelDraft,
    createRagModel: createRagModel,
    updateRagModelApi: updateRagModelApi,
    testRagModelConnection: testRagModelConnection,
    getRagModelUsage: getRagModelUsage,
    deleteRagModel: deleteRagModel,
    updateRetrievalSettings: updateRetrievalSettings,
    previewRetrievalSettings: previewRetrievalSettings,
    clearRetrievalTestDraft: clearRetrievalTestDraft,
    runRetrievalTest: runRetrievalTest,
    toggleCapability: toggleCapability,
    setCapabilityEnabled: toggleCapability,
    createCapabilityFromUpload: createCapabilityFromUpload,
    updateCapability: updateCapability,
    deleteCapability: deleteCapability,
    createApiKey: createApiKey,
    setApiKeyEnabled: setApiKeyEnabled,
    deleteApiKey: deleteApiKey,
    createApiClient: createApiKey,
    setApiClientEnabled: setApiKeyEnabled,
    revokeApiClient: deleteApiKey,
    enterpriseDatabaseEngineLabel: enterpriseDatabaseEngineLabel,
    enterpriseDefaultPort: enterpriseDefaultPort,
    testEnterpriseConnectionDraft: testEnterpriseConnectionDraft,
    saveEnterpriseConnection: saveEnterpriseConnection,
    testEnterpriseConnection: testEnterpriseConnection,
    deleteEnterpriseConnection: deleteEnterpriseConnection,
    externalSearchServiceTypeLabel: externalSearchServiceTypeLabel,
    externalSearchServiceMappingDefaults: externalSearchServiceMappingDefaults,
    testExternalSearchServiceDraft: testExternalSearchServiceDraft,
    saveExternalSearchService: saveExternalSearchService,
    testExternalSearchService: testExternalSearchService,
    deleteExternalSearchService: deleteExternalSearchService,
    createRollbackDraft: createRollbackDraft,
    recalculateOverview: recalculateOverview
  };
})(window.OpsDemo);

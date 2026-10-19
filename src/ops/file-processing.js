(function defineFileProcessing(window, OpsDemo) {
  "use strict";

  var store = OpsDemo.core.store;
  var actions = OpsDemo.core.actions;
  var processing = OpsDemo.core.processing;
  var legacy = Object.assign({}, actions);
  var clone = OpsDemo.utils.clone;
  var id = OpsDemo.utils.id;
  var DEFAULT_DOCUMENT_FOLDERS = [
    { id: "FOLDER-SCM", name: "供应链管理", parentId: null, sortOrder: 10, system: true },
    { id: "FOLDER-SCM-GUIDES", name: "基础理论与流程", parentId: "FOLDER-SCM", sortOrder: 10, system: true },
    { id: "FOLDER-SCM-INSIGHTS", name: "趋势、案例与评估", parentId: "FOLDER-SCM", sortOrder: 20, system: true },
    { id: "FOLDER-SCM-DATA", name: "业务数据与培训", parentId: "FOLDER-SCM", sortOrder: 30, system: true },
    { id: "FOLDER-SUPPLIER", name: "供应商与合同", parentId: null, sortOrder: 20, system: true },
    { id: "FOLDER-POLICY", name: "贸易政策", parentId: null, sortOrder: 30, system: true },
    { id: "FOLDER-PROCUREMENT", name: "采购与运营", parentId: null, sortOrder: 40, system: true },
    { id: "FOLDER-ENTERPRISE", name: "企业数据", parentId: null, sortOrder: 50, system: true },
    { id: "FOLDER-UNCATEGORIZED", name: "未分类", parentId: null, sortOrder: 90, system: true }
  ];
  function now() { return new Date().toISOString(); }
  function find(list, key) { return (list || []).find(function each(item) { return item.id === key; }) || null; }
  function isAssetDocument(documentItem) { return Boolean(documentItem && documentItem.localAssetId); }
  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort().filter(function keep(key) { return key !== "snapshotAt"; }).map(function pair(key) { return JSON.stringify(key) + ":" + stable(value[key]); }).join(",") + "}";
    return JSON.stringify(value);
  }
  function textKey(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return "mock-input:" + (hash >>> 0).toString(16);
  }
  function fileSize(bytes) { return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB"; }
  function utf8Size(value) {
    var text = String(value || "");
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }
  function modelKey(model) { return stable({ id: model.id, modelId: model.modelId || model.alias, dimension: model.dimension, endpoint: model.apiConfig && model.apiConfig.endpoint }); }
  function statusLabel(status) {
    return ({ pending_configuration: "待配置", parsing: "正在解析", parsed: "解析完成", waiting_parse: "等待解析完成后切块", chunking: "正在切块", preview_ready: "切片预览已就绪", embedding: "正在向量化", indexing: "正在更新索引", completed: "处理完成", failed: "处理失败", cancelled: "已取消", awaiting_replacement_confirmation: "待确认替换", ready: "可检索", uploaded: "已上传", processed: "已切块", empty: "暂无切片" })[status] || status;
  }
  function setStatus(item, status) { item.status = status; item.statusLabel = statusLabel(status); item.updatedAt = now(); }
  function embeddingInput(source, set, version) {
    var fields = set.configSnapshot && set.configSnapshot.indexContent || {};
    return [fields.documentName ? version.name : "", fields.headingPath ? source.metadata && source.metadata.sectionPath || "" : "", source.content].filter(Boolean).join("\n");
  }
  function mutate(type, batchId, fn, silent) {
    var result;
    store.mutate(function change(state) { result = fn(state); actions.recalculateOverview(state); }, { type: type, batchId: batchId || null, silentRender: silent !== false });
    return result;
  }
  function record(state, action, object, impact) {
    state.configurationRecords.unshift({ id: id("CR"), occurredAt: now(), actor: state.meta.currentUser.displayName, objectType: "file_processing", objectId: object.id, objectName: object.name || object.id, action: action, actionLabel: impact, impact: impact });
  }
  function withMetadata(chunks, version, parseId, setId) {
    return chunks.map(function each(chunk, index) {
      return Object.assign({}, chunk, { index: index + 1, characterCount: String(chunk.content || "").length, createdAt: chunk.createdAt || now(), metadata: Object.assign({}, chunk.metadata || {}, {
        fileId: version.fileId, fileVersionId: version.id, parseResultId: parseId, chunkSetId: setId, sourceFile: version.name,
        contentType: chunk.metadata && chunk.metadata.contentType || "text",
        sectionPath: chunk.metadata && chunk.metadata.sectionPath || "正文", prevChunkId: index ? chunks[index - 1].id : null, nextChunkId: index + 1 < chunks.length ? chunks[index + 1].id : null
      }) });
    });
  }
  function withParentMetadata(parents, version, parseId, setId) {
    return (parents || []).map(function each(parent, index) {
      return Object.assign({}, parent, {
        index: index + 1,
        characterCount: String(parent.content || "").length,
        metadata: Object.assign({}, parent.metadata || {}, {
          fileId: version.fileId,
          fileVersionId: version.id,
          parseResultId: parseId,
          chunkSetId: setId,
          sourceFile: version.name,
          contentType: parent.metadata && parent.metadata.contentType || "text"
        })
      });
    });
  }
  function chunkSetReferences(state, setId) {
    return (state.documents || []).filter(function currentReference(doc) {
      return Boolean(doc.knowledgeBaseId && doc.chunkSetId === setId);
    });
  }
  function refreshChunkSetLifecycle(state, setIds) {
    var targets = Array.isArray(setIds) ? setIds : (state.chunkSets || []).map(function key(set) { return set.id; });
    targets.forEach(function refresh(setId) {
      var set = find(state.chunkSets, setId);
      if (!set) return;
      var references = chunkSetReferences(state, set.id);
      var isCurrentLocalResult = (state.fileAssets || []).some(function current(asset) { return asset.currentChunkSetId === set.id; });
      set.activeReferenceIds = references.map(function key(ref) { return ref.id; });
      set.activeKnowledgeBaseIds = Array.from(new Set(references.map(function key(ref) { return ref.knowledgeBaseId; })));
      if (references.length) {
        set.lifecycleStatus = "active";
        delete set.obsoleteAt;
        return;
      }
      if (isCurrentLocalResult && set.status === "ready") {
        set.lifecycleStatus = "current";
        delete set.obsoleteAt;
        return;
      }
      if (set.status === "running") {
        set.lifecycleStatus = "staging";
        return;
      }
      if (set.status === "failed" || set.status === "cancelled") {
        set.lifecycleStatus = "discarded";
        set.obsoleteAt = set.obsoleteAt || now();
        return;
      }
      if (set.lifecycleStatus === "staging" || set.lifecycleStatus === "active" || set.lifecycleStatus === "current" || set.supersededBindings && set.supersededBindings.length) {
        set.lifecycleStatus = "obsolete";
        set.obsoleteAt = set.obsoleteAt || now();
        return;
      }
      set.lifecycleStatus = "reusable";
    });
  }
  function switchChunkSetBinding(state, owner, nextSetId, previousSetId) {
    var switchedAt = now();
    if (previousSetId && previousSetId !== nextSetId) {
      var previous = find(state.chunkSets, previousSetId);
      if (previous) {
        previous.supersededBindings = previous.supersededBindings || [];
        previous.supersededBindings.push({
          knowledgeBaseId: owner.knowledgeBaseId || null,
          documentId: owner.knowledgeBaseId ? owner.id : null,
          fileId: owner.fileId || owner.id,
          replacedById: nextSetId,
          createdAt: switchedAt
        });
      }
    }
    refreshChunkSetLifecycle(state, [previousSetId, nextSetId].filter(Boolean));
  }
  function batchRetainsSnapshots(batch) {
    return Boolean(batch && ["completed", "cancelled"].indexOf(batch.status) < 0);
  }

  function initialFolderId(asset) {
    var fileId = String(asset && asset.id || "");
    if (asset && asset.sourceType === "enterprise_snapshot") return "FOLDER-ENTERPRISE";
    if (/^SCM-DOC-0[1-4]$/.test(fileId)) return "FOLDER-SCM-GUIDES";
    if (/^SCM-DOC-0[5-7]$/.test(fileId)) return "FOLDER-SCM-INSIGHTS";
    if (/^SCM-DOC-(?:0[89]|10)$/.test(fileId)) return "FOLDER-SCM-DATA";
    if (/^DOC-00[1-5]$/.test(fileId)) return "FOLDER-SUPPLIER";
    if (/^DOC-10[12]$/.test(fileId)) return "FOLDER-POLICY";
    if (/^DOC-20[1-9]$/.test(fileId)) return "FOLDER-PROCUREMENT";
    return "FOLDER-UNCATEGORIZED";
  }

  function ensureDocumentFolders(state) {
    var createdAt = "2026-09-07T14:54:00+08:00";
    state.documentFolders = state.documentFolders || [];
    DEFAULT_DOCUMENT_FOLDERS.forEach(function seed(folder) {
      if (!find(state.documentFolders, folder.id)) state.documentFolders.push(Object.assign({ createdAt: createdAt, updatedAt: createdAt }, clone(folder)));
    });
    (state.fileAssets || []).forEach(function place(asset) {
      if (!asset.folderId || !find(state.documentFolders, asset.folderId)) asset.folderId = initialFolderId(asset);
    });
  }
  function clearReferenceSync(reference) {
    if (!reference) return;
    delete reference.sourceSyncStatus;
    delete reference.sourceSyncTargetVersionId;
    delete reference.sourceSyncBatchId;
  }
  function settleAutoSyncReference(state, batch, status) {
    if (!batch || !batch.autoSync) return;
    activeItems(batch).forEach(function settle(item) {
      var reference = find(state.documents, item.existingDocumentId || item.documentId);
      if (!reference || reference.sourceSyncBatchId !== batch.id) return;
      if (status === "completed" || status === "cancelled" || status === "superseded") {
        clearReferenceSync(reference);
        return;
      }
      reference.sourceSyncStatus = status;
    });
  }
  function scrubBatchSourcePayload(batch) {
    if (!batch) return;
    batch.items.forEach(function scrub(item) {
      item.sourceFile = null;
      item.sourcePreview = "";
    });
  }
  function processingIntentId(asset, batch) {
    if (!asset || !batch) return null;
    if (!batch.knowledgeBaseId) return asset.localProcessingBatchId || null;
    return asset.knowledgeProcessingBatchIds && asset.knowledgeProcessingBatchIds[batch.knowledgeBaseId] || null;
  }
  function setProcessingIntent(asset, batch) {
    if (!asset || !batch) return;
    if (!batch.knowledgeBaseId) {
      asset.localProcessingBatchId = batch.id;
      return;
    }
    asset.knowledgeProcessingBatchIds = asset.knowledgeProcessingBatchIds || {};
    asset.knowledgeProcessingBatchIds[batch.knowledgeBaseId] = batch.id;
  }
  function clearProcessingIntent(asset, batch) {
    if (!asset || !batch || processingIntentId(asset, batch) !== batch.id) return;
    if (!batch.knowledgeBaseId) delete asset.localProcessingBatchId;
    else {
      delete asset.knowledgeProcessingBatchIds[batch.knowledgeBaseId];
      if (!Object.keys(asset.knowledgeProcessingBatchIds).length) delete asset.knowledgeProcessingBatchIds;
    }
  }
  function cancelBatchInState(state, batch, reason) {
    if (!batch || batch.status === "completed" || batch.status === "cancelled") return;
    batch.generation += 1;
    batch.error = reason || "处理任务已取消";
    state.processingJobs.filter(function own(job) {
      return job.batchId === batch.id && job.status === "running";
    }).forEach(function stop(job) { job.status = "cancelled"; });
    state.parseResults.concat(state.chunkSets).filter(function own(result) {
      return result.batchId === batch.id && result.status === "running";
    }).forEach(function stop(result) { result.status = "cancelled"; });
    batch.items.forEach(function stop(item) {
      var reference = find(state.documents, item.existingDocumentId || item.documentId);
      if (reference && reference.pendingReplacement && reference.pendingReplacement.batchId === batch.id) delete reference.pendingReplacement;
      if (item.status !== "success" && item.status !== "skipped") {
        item.status = "cancelled";
        item.statusLabel = "已取消";
      }
      clearProcessingIntent(find(state.fileAssets, item.fileId), batch);
    });
    setStatus(batch, "cancelled");
    settleAutoSyncReference(state, batch, "cancelled");
    refreshChunkSetLifecycle(state, state.chunkSets.filter(function own(set) {
      return set.batchId === batch.id;
    }).map(function key(set) { return set.id; }));
  }

  // One-time migration preserves existing document URLs and fixture identities.
  function initialize(state) {
    initializeEnterpriseResources(state);
    if (state.fileAssets) {
      ensureDocumentFolders(state);
      return;
    }
    state.fileAssets = []; state.fileVersions = []; state.parseResults = []; state.chunkSets = []; state.processingJobs = []; state.indexUpdates = []; state.embeddingRecords = [];
    (state.documents || []).filter(isAssetDocument).forEach(function migrate(doc) {
      var fileId = doc.localAssetId || doc.id;
      var asset = find(state.fileAssets, fileId);
      if (!asset) {
        asset = { id: fileId, name: doc.name, documentType: doc.documentType || "文档", sourceType: doc.sourceType || "local_upload", sourceMetadata: doc.sourceMetadata || null, createdAt: doc.importedAt, updatedAt: doc.importedAt, latestVersionId: null };
        state.fileAssets.push(asset);
      }
      var version = state.fileVersions.find(function match(candidate) { return candidate.fileId === fileId && candidate.contentHash === doc.contentHash; });
      var sampleChunks = doc.chunks || state.chunks.filter(function match(chunk) { return chunk.documentId === doc.id; });
      if (!version) {
        version = { id: fileId + "-V" + (state.fileVersions.filter(function match(v) { return v.fileId === fileId; }).length + 1), fileId: fileId, name: doc.name, mimeType: doc.mimeType, fileSizeBytes: doc.fileSizeBytes, fileSizeLabel: doc.fileSizeLabel, contentHash: doc.contentHash || "fixture:" + doc.id, hashKind: "fixture", lastModified: doc.lastModified || 0, sourceFile: doc.sourceFile || null, sourceUrl: doc.sourceUrl || "", sourcePreview: doc.sourcePreview || doc.extractedText || sampleChunks.map(function text(chunk) { return chunk.content || chunk.text || ""; }).join("\n\n"), sourceMetadata: doc.sourceMetadata || null, createdAt: doc.importedAt, sourceType: asset.sourceType, pageCount: doc.pageCount };
        version.versionNumber = state.fileVersions.filter(function own(v) { return v.fileId === fileId; }).length + 1;
        state.fileVersions.push(version); asset.latestVersionId = version.id;
      }
      var kb = find(state.knowledgeBases, doc.knowledgeBaseId);
      var config = processing.normalizeParseConfig(null, doc.mineruParseConfig || kb && kb.mineruParseConfig || {});
      var configKey = stable(config);
      var parse = state.parseResults.find(function match(p) { return p.fileVersionId === version.id && p.configKey === configKey; });
      if (!parse) {
        parse = { id: "PARSE-" + doc.id, fileId: fileId, fileVersionId: version.id, configSnapshot: config, configKey: configKey, status: sampleChunks.length || doc.searchable ? "ready" : "queued", content: version.sourcePreview, createdAt: doc.importedAt, error: null, fixture: true };
        state.parseResults.push(parse);
      }
      if (parse.status === "ready" && version.id === asset.latestVersionId) asset.currentParseResultId = parse.id;
      var profile = doc.processingProfileSnapshot || kb && kb.processingProfileSnapshot || find(state.rag.ingestionProfiles, kb && kb.currentIngestionProfileId) || state.rag.ingestionProfiles[0];
      var setId = "CHUNKSET-" + doc.id;
      var chunks = withMetadata(sampleChunks.map(function copy(chunk) { return { id: chunk.id, index: chunk.index, content: chunk.content || chunk.text || "", origin: chunk.origin || "import", createdAt: chunk.createdAt, metadata: clone(chunk.metadata || {}) }; }), version, parse.id, setId);
      var parentChunks = withParentMetadata(processing.buildParentHierarchy(chunks, profile && profile.chunking, { id: fileId, knowledgeBaseId: null }), version, parse.id, setId);
      var set = { id: setId, fileId: fileId, fileVersionId: version.id, parseResultId: parse.id, configSnapshot: clone(profile), configKey: stable({ chunking: profile && profile.chunking, indexContent: profile && profile.indexContent }), chunks: chunks, parentChunks: parentChunks, status: chunks.length || doc.searchable ? "ready" : "queued", lifecycleStatus: "active", createdAt: doc.importedAt, error: null, fixture: true };
      state.chunkSets.push(set);
      Object.assign(doc, { fileId: fileId, fileVersionId: version.id, parseResultId: parse.id, chunkSetId: set.id });
      state.chunks.filter(function match(chunk) { return chunk.documentId === doc.id; }).forEach(function link(chunk) {
        var source = find(chunks, chunk.id);
        chunk.sourceChunkId = chunk.id; chunk.chunkSetId = set.id; chunk.fileVersionId = version.id;
        chunk.metadata = Object.assign({}, source && source.metadata || {}, { knowledgeBaseId: doc.knowledgeBaseId });
        if (doc.searchable && kb) {
          chunk.embeddingRecordId = "EMB-" + chunk.id;
          chunk.embeddingModelId = kb.boundEmbeddingModelId;
          var inputText = embeddingInput(source || chunk, set, version);
          var seedModel = find(state.rag.modelCatalog.embeddingModels, kb.boundEmbeddingModelId);
          state.embeddingRecords.push({ id: chunk.embeddingRecordId, knowledgeBaseId: kb.id, documentId: doc.id, chunkId: chunk.id, inputText: inputText, inputHash: textKey(inputText), modelId: kb.boundEmbeddingModelId, modelConfigKey: seedModel && modelKey(seedModel), dimension: kb.boundVectorDimension, status: "ready", createdAt: doc.importedAt, fixture: true });
        }
      });
    });
    if (!find(state.fileAssets, "FILE-DEMO-FAILED-PARSE")) {
      var failedAsset = {
        id: "FILE-DEMO-FAILED-PARSE",
        name: "解析失败演示文件.pdf",
        documentType: "演示文件",
        sourceType: "local_upload",
        folderId: "FOLDER-UNCATEGORIZED",
        createdAt: "2026-09-08T09:30:00+08:00",
        updatedAt: "2026-09-08T09:32:00+08:00",
        latestVersionId: "FILEVER-DEMO-FAILED-PARSE"
      };
      var failedVersion = {
        id: "FILEVER-DEMO-FAILED-PARSE",
        fileId: failedAsset.id,
        versionNumber: 1,
        name: failedAsset.name,
        mimeType: "application/pdf",
        fileSizeBytes: 1572864,
        fileSizeLabel: "1.5 MB",
        contentHash: "fixture:demo-failed-parse",
        hashKind: "fixture",
        lastModified: 1787308800000,
        sourceFile: null,
        sourceUrl: "",
        sourcePreview: "",
        sourceMetadata: null,
        createdAt: failedAsset.createdAt,
        sourceType: "local_upload",
        pageCount: 1
      };
      var failedParse = {
        id: "PARSE-DEMO-FAILED-PARSE",
        fileId: failedAsset.id,
        fileVersionId: failedVersion.id,
        configSnapshot: processing.normalizeParseConfig(),
        configKey: "demo-failed-parse",
        status: "failed",
        content: "",
        createdAt: failedAsset.createdAt,
        error: "MinerU 解析服务响应超时",
        fixture: true
      };
      state.fileAssets.unshift(failedAsset);
      state.fileVersions.unshift(failedVersion);
      state.parseResults.unshift(failedParse);
      failedAsset.currentParseResultId = failedParse.id;
      state.importBatches.unshift({
        id: "IMP-DEMO-FAILED-PARSE",
        knowledgeBaseId: null,
        processingScope: "local-documents",
        sourceType: "manual_upload",
        createdAt: failedAsset.createdAt,
        completedAt: failedAsset.updatedAt,
        generation: 1,
        previewRevision: 0,
        ingestionProfileId: "ING-01",
        mineruParseConfig: processing.normalizeParseConfig(),
        processingProfileSnapshot: null,
        processingParametersSnapshot: null,
        inputCount: 1,
        successCount: 0,
        processingCount: 0,
        failureCount: 1,
        skippedCount: 0,
        pendingReplacementCount: 0,
        completionRequested: true,
        status: "failed",
        statusLabel: "处理失败",
        failedStage: "parse",
        error: "MinerU 解析服务响应超时",
        items: [{
          id: "IMP-ITEM-DEMO-FAILED-PARSE",
          fileId: failedAsset.id,
          fileVersionId: failedVersion.id,
          parseResultId: failedParse.id,
          chunkSetId: null,
          fileName: failedAsset.name,
          name: failedAsset.name,
          fileSizeBytes: failedVersion.fileSizeBytes,
          contentHash: failedVersion.contentHash,
          type: failedVersion.mimeType,
          sourcePreview: "",
          documentId: null,
          existingDocumentId: null,
          operation: "create",
          duplicateReason: null,
          status: "failed_demo",
          statusLabel: "MinerU 解析失败（演示）",
          error: "MinerU 解析服务响应超时",
          failedStep: "parse",
          reasonCode: "MINERU_TIMEOUT",
          reason: "MinerU 解析服务响应超时",
          countsTowardDocumentTotal: false,
          parseResultId: failedParse.id,
          chunkSetId: null,
          pipeline: [],
          availableActions: ["retry", "remove"]
        }]
      });
    }
    ensureDocumentFolders(state);
    refreshChunkSetLifecycle(state);
  }
  store.registerInitializer(initialize);

  async function prepareUploadFiles(files) {
    return Promise.all(Array.prototype.slice.call(files || []).map(async function prepare(file) {
      var bytes = await file.arrayBuffer();
      if (!window.crypto || !window.crypto.subtle) throw new Error("当前环境无法计算文件内容摘要，请通过本地 HTTP 页面上传。");
      var digest = await window.crypto.subtle.digest("SHA-256", bytes);
      var hash = Array.prototype.map.call(new Uint8Array(digest), function hex(b) { return b.toString(16).padStart(2, "0"); }).join("");
      return { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, sourceFile: file, sourcePreview: /\.(txt|csv|json|md)$/i.test(file.name) ? await file.text() : "", contentHash: "sha256:" + hash };
    }));
  }

  var ENTERPRISE_RESOURCE_CATALOG = {
    supply_chain: [
      { schemaName: "public", resourceName: "orders", resourceType: "table", label: "订单表", businessDomain: "订单与库存", rowCount: 2, content: "订单号,物料,数量,下单时间\nSO-2026-001,电解铜,12,2026-08-12\nSO-2026-002,铝锭,8,2026-08-18" },
      { schemaName: "public", resourceName: "inventory", resourceType: "table", label: "库存表", businessDomain: "订单与库存", rowCount: 2, content: "物料,可用库存(吨),在途数量(吨)\n电解铜,180,320\n铝锭,90,160" },
      { schemaName: "public", resourceName: "delivery_records", resourceType: "table", label: "交付记录表", businessDomain: "订单与库存", rowCount: 1, content: "订单号,交付状态,预计到达\nSO-2026-001,部分交付,2026-09-08" },
      { schemaName: "analytics", resourceName: "v_recent_delayed_orders", resourceType: "view", label: "近期延迟订单视图", businessDomain: "订单与库存", rowCount: 1, content: "订单号,延迟天数,原因\nSO-2026-002,3,海运延误" }
    ],
    procurement_contract: [
      { schemaName: "public", resourceName: "contracts", resourceType: "table", label: "合同表", businessDomain: "合同分析", rowCount: 1, content: "合同编号,供应商,签订日期\nCON-2026-088,海岳电子,2026-08-02" },
      { schemaName: "public", resourceName: "contract_payments", resourceType: "table", label: "合同付款表", businessDomain: "合同分析", rowCount: 1, content: "合同编号,付款阶段,金额(万元)\nCON-2026-088,第二期,128" },
      { schemaName: "risk", resourceName: "v_contract_exposure", resourceType: "view", label: "合同风险敞口视图", businessDomain: "合同分析", rowCount: 1, content: "合同编号,风险等级,敞口(万元)\nCON-2026-088,中,260" }
    ],
    contract_analytics: [
      { schemaName: "public", resourceName: "contract_parties", resourceType: "table", label: "合同主体表", businessDomain: "合同分析", rowCount: 1, content: "主体ID,主体名称,角色\nCP-001,海岳电子,供应商" },
      { schemaName: "public", resourceName: "contract_execution", resourceType: "table", label: "合同执行表", businessDomain: "合同分析", rowCount: 1, content: "合同编号,履约状态,完成率(%)\nCON-2026-088,履行中,68" },
      { schemaName: "finance", resourceName: "v_contract_payment_risk", resourceType: "view", label: "合同付款风险视图", businessDomain: "合同分析", rowCount: 1, content: "合同编号,逾期金额(万元),账期\nCON-2026-088,42,60天" }
    ],
    procurement_analytics: [
      { schemaName: "public", resourceName: "supplier_metrics", resourceType: "table", label: "供应商绩效表", businessDomain: "供应商绩效", rowCount: 1, content: "供应商,准时交付率(%),统计期\n海岳电子,96.8,2026-08" },
      { schemaName: "public", resourceName: "purchase_orders", resourceType: "table", label: "采购订单表", businessDomain: "供应商绩效", rowCount: 1, content: "订单号,供应商,采购金额(万元)\nPO-2026-091,海岳电子,320" },
      { schemaName: "analytics", resourceName: "v_supplier_risk", resourceType: "view", label: "供应商风险视图", businessDomain: "供应商绩效", rowCount: 1, content: "供应商,风险等级,主要原因\n海岳电子,低,交付稳定" }
    ],
    logistics_ops: [
      { schemaName: "public", resourceName: "shipment_tracks", resourceType: "table", label: "运输轨迹表", businessDomain: "物流在途", rowCount: 1, content: "运单号,当前位置,更新时间\nSH-2026-771,上海港,2026-09-07" },
      { schemaName: "public", resourceName: "transport_nodes", resourceType: "table", label: "运输节点表", businessDomain: "物流在途", rowCount: 1, content: "节点代码,节点名称,类型\nCNSHA,上海港,起运港" },
      { schemaName: "reporting", resourceName: "v_in_transit_orders", resourceType: "view", label: "在途订单视图", businessDomain: "物流在途", rowCount: 1, content: "物料,运输节点,预计到达\n电解铜,在途,2026-09-08" }
    ]
  };

  function enterpriseTargetDatabases(connection) {
    var values = Array.isArray(connection && connection.databaseNames) && connection.databaseNames.length
      ? connection.databaseNames
      : [connection && connection.databaseName];
    return Array.from(new Set(values.map(function map(value) {
      return String(value || "").trim();
    }).filter(Boolean)));
  }

  function stableEnterpriseSourceId(stableObjectKey) {
    var hash = 2166136261;
    for (var index = 0; index < stableObjectKey.length; index += 1) {
      hash ^= stableObjectKey.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return "SOURCE-" + hash.toString(16).toUpperCase().padStart(8, "0");
  }

  function enterpriseDirectoryId(kind, connectionId, databaseName, schemaName) {
    return "ENT-" + kind + "-" + stableEnterpriseSourceId([connectionId, databaseName, schemaName || ""].join("/"));
  }

  function enterpriseResourceCatalog(connection, databaseName) {
    var definitions = ENTERPRISE_RESOURCE_CATALOG[String(databaseName || "").trim()] || [
      {
        schemaName: "public", resourceName: String(databaseName || "enterprise") + "_records", resourceType: "table",
        label: String(databaseName || "企业数据") + "记录表", businessDomain: String(databaseName || "默认目录"),
        rowCount: 1, content: "字段,内容\n来源数据库," + String(databaseName || "enterprise") + "\n资源,table"
      },
      {
        schemaName: "analytics", resourceName: "v_" + String(databaseName || "enterprise") + "_summary", resourceType: "view",
        label: String(databaseName || "企业数据") + "汇总视图", businessDomain: String(databaseName || "默认目录"),
        rowCount: 1, content: "指标,数值\nresource_count,2\nsource," + String(databaseName || "enterprise")
      }
    ];
    return definitions.map(function clone(definition) {
      return Object.assign({}, definition, {
        schemaName: String(definition.schemaName || "public").trim() || "public",
        resourceName: String(definition.resourceName || "").trim(),
        resourceType: definition.resourceType === "view" ? "view" : "table"
      });
    }).filter(function valid(definition) {
      return Boolean(definition.resourceName);
    });
  }

  function enterpriseStableObjectKey(connection, databaseName, definition) {
    return [
      encodeURIComponent(String(connection.databaseEngine || "").trim().toLowerCase()),
      encodeURIComponent(String(connection.host || "").trim().toLowerCase()),
      encodeURIComponent(Number(connection.port) || 0),
      encodeURIComponent(String(databaseName || "").trim()),
      encodeURIComponent(String(definition.schemaName || "public").trim()),
      encodeURIComponent(String(definition.resourceType || "table").trim()),
      encodeURIComponent(String(definition.resourceName || "").trim())
    ].join("/");
  }

  function enterpriseFileToken(value) {
    return String(value || "").trim()
      .replace(/[\\/:*?"<>|\s（）()]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }

  function enterpriseResourceFileName(definition, databaseName) {
    return [definition.label, databaseName, definition.schemaName, definition.resourceName]
      .map(enterpriseFileToken)
      .filter(Boolean)
      .join("_") + ".csv";
  }

  function enterpriseResourceName(definition) {
    return definition.label + "（" + (definition.resourceType === "view" ? "视图" : "表") + "）";
  }

  function ensureEnterpriseResourceForObject(state, connection, databaseName, definition) {
    state.enterpriseResources = state.enterpriseResources || [];
    var stableObjectKey = enterpriseStableObjectKey(connection, databaseName, definition);
    var resource = state.enterpriseResources.find(function match(item) {
      return item.stableObjectKey === stableObjectKey;
    });
    if (!resource) {
      var createdAt = connection.updatedAt || now();
      resource = {
        id: stableEnterpriseSourceId(stableObjectKey),
        stableObjectKey: stableObjectKey,
        objectType: definition.resourceType,
        name: enterpriseResourceName(definition),
        resourceName: definition.resourceName,
        fileName: enterpriseResourceFileName(definition, databaseName),
        businessDomain: definition.businessDomain || databaseName || "默认目录",
        databaseName: databaseName,
        schemaName: definition.schemaName || "public",
        content: definition.content,
        contentHash: "fixture:" + textKey(definition.content),
        rowCount: definition.rowCount,
        status: "ready",
        createdAt: createdAt,
        snapshotAt: createdAt,
        updatedAt: createdAt
      };
      state.enterpriseResources.push(resource);
    }
    resource.connectionId = connection.id;
    return resource;
  }

  function ensureEnterpriseResource(state, connection) {
    if (!state || !connection) return [];
    return enterpriseTargetDatabases(connection).reduce(function collect(result, databaseName) {
      enterpriseResourceCatalog(connection, databaseName).forEach(function ensure(definition) {
        result.push(ensureEnterpriseResourceForObject(state, connection, databaseName, definition));
      });
      return result;
    }, []);
  }

  function initializeEnterpriseResources(state) {
    (state.enterpriseConnections || []).forEach(function each(connection) {
      ensureEnterpriseResource(state, connection);
    });
  }

  function enterpriseResourceDefinitions(connection) {
    return enterpriseTargetDatabases(connection).reduce(function collect(result, databaseName) {
      enterpriseResourceCatalog(connection, databaseName).forEach(function append(definition) {
        result.push({ databaseName: databaseName, definition: definition });
      });
      return result;
    }, []);
  }

  function refreshEnterpriseResources(state, connection, timestamp) {
    if (!state || !connection) return [];
    var policy = Object.assign(
      { updateFrequency: "daily", updateStrategy: "full_snapshot" },
      connection.updatePolicy
    );
    return enterpriseResourceDefinitions(connection).map(function refresh(item) {
      var stableObjectKey = enterpriseStableObjectKey(connection, item.databaseName, item.definition);
      var resource = (state.enterpriseResources || []).find(function match(candidate) {
        return candidate.stableObjectKey === stableObjectKey;
      }) || ensureEnterpriseResourceForObject(state, connection, item.databaseName, item.definition);
      var content = item.definition.content;
      if (policy.updateStrategy === "incremental_snapshot") {
        var rows = resource.content.split(/\r?\n/).filter(Boolean);
        var incrementalRow = "增量记录," + timestamp;
        var replaced = false;
        rows = rows.map(function map(row) {
          if (/^增量记录,/.test(row)) {
            replaced = true;
            return incrementalRow;
          }
          return row;
        });
        if (!replaced) rows.push(incrementalRow);
        content = rows.join("\n");
      }
      resource.content = content;
      resource.contentHash = "fixture:" + textKey(content);
      resource.rowCount = Math.max(0, content.split(/\r?\n/).filter(Boolean).length - 1);
      resource.status = "ready";
      resource.snapshotAt = timestamp;
      resource.updatedAt = timestamp;
      return resource;
    });
  }

  function listEnterpriseSourceObjects() {
    var state = store.getState();
    return (state.enterpriseConnections || []).reduce(function collect(result, connection) {
      enterpriseResourceDefinitions(connection).forEach(function each(item) {
        var databaseName = item.databaseName;
        var definition = item.definition;
        var stableObjectKey = enterpriseStableObjectKey(connection, databaseName, definition);
        var resource = (state.enterpriseResources || []).find(function match(candidate) {
          return candidate.stableObjectKey === stableObjectKey;
        }) || ensureEnterpriseResourceForObject(state, connection, databaseName, definition);
        var bytes = utf8Size(resource.content);
        var databaseDirectoryId = enterpriseDirectoryId("DB", connection.id, databaseName);
        var schemaDirectoryId = enterpriseDirectoryId("SCH", connection.id, databaseName, definition.schemaName);
        result.push({
          id: resource.id,
          stableObjectKey: resource.stableObjectKey,
          name: resource.name,
          resourceName: resource.resourceName,
          resourceType: resource.objectType,
          fileName: resource.fileName,
          description: connection.description,
          connectionId: connection.id,
          databaseName: databaseName,
          schemaName: definition.schemaName,
          databaseDirectoryId: databaseDirectoryId,
          directoryId: schemaDirectoryId,
          directoryName: definition.schemaName,
          directoryPath: databaseName + "/" + definition.schemaName,
          sourceType: "enterprise_snapshot",
          type: "text/csv",
          rowCount: resource.rowCount,
          fileSizeBytes: bytes,
          fileSizeLabel: fileSize(bytes),
          updatedAt: resource.updatedAt,
          snapshotAt: resource.snapshotAt || resource.updatedAt,
          contentHash: "fixture:" + textKey(resource.content),
          updatePolicy: Object.assign({ updateFrequency: "daily", updateStrategy: "full_snapshot" }, connection.updatePolicy),
          available: resource.status === "ready",
          content: resource.content,
          fixture: true
        });
      });
      return result;
    }, []);
  }

  function createVersion(state, candidate, preferredFileId, forceNewDocument) {
    // Product surfaces one current document. Internal versions remain processing
    // snapshots so a candidate can be built and published atomically.
    var forceNew = Boolean(forceNewDocument && !candidate.sourceObjectId);
    var resolvedFileId = forceNew ? null : preferredFileId || null;
    if (!resolvedFileId && candidate.sourceObjectId) {
      var sourceSnapshot = state.fileVersions.find(function sameSource(version) {
        return version.sourceObjectId === candidate.sourceObjectId;
      });
      if (sourceSnapshot) resolvedFileId = sourceSnapshot.fileId;
    }
    var existing = !forceNew && state.fileVersions.find(function match(version) {
      if (version.contentHash !== candidate.contentHash || version.lifecycleStatus === "retired") return false;
      if (resolvedFileId) return version.fileId === resolvedFileId;
      var owner = find(state.fileAssets, version.fileId);
      return Boolean(owner && owner.latestVersionId === version.id);
    });
    if (existing) {
      var existingAsset = find(state.fileAssets, existing.fileId);
      return { version: existing, reused: true, current: Boolean(existingAsset && existingAsset.latestVersionId === existing.id), reason: "same_content" };
    }
    var asset = find(state.fileAssets, resolvedFileId);
    var isNewAsset = !asset;
    if (!asset) {
      var requestedFolder = find(state.documentFolders, candidate.targetFolderId);
      asset = { id: resolvedFileId || id("FILE"), name: candidate.name, documentType: candidate.sourceObjectId ? "企业数据" : "文档", sourceType: candidate.sourceObjectId ? "enterprise_snapshot" : "local_upload", folderId: candidate.sourceObjectId ? "FOLDER-ENTERPRISE" : requestedFolder ? requestedFolder.id : "FOLDER-UNCATEGORIZED", createdAt: now(), updatedAt: now(), latestVersionId: null };
      state.fileAssets.unshift(asset);
    }
    var version = { id: id("FILEVER"), fileId: asset.id, name: candidate.name, contentHash: candidate.contentHash, hashKind: String(candidate.contentHash).startsWith("sha256:") ? "sha256" : "fixture", mimeType: candidate.type, fileSizeBytes: candidate.size, fileSizeLabel: fileSize(candidate.size), lastModified: candidate.lastModified || 0, sourceFile: candidate.sourceFile || null, sourceUrl: candidate.sourceUrl || "", sourcePreview: candidate.sourcePreview || "", sourceType: asset.sourceType, sourceObjectId: candidate.sourceObjectId || null, sourceUpdatedAt: candidate.sourceUpdatedAt || null, createdAt: now(), pageCount: 1 };
    version.versionNumber = state.fileVersions.filter(function own(v) { return v.fileId === asset.id; }).length + 1;
    version.sourceMetadata = candidate.sourceObjectId ? {
      sourceObjectId: candidate.sourceObjectId,
      stableObjectKey: candidate.stableObjectKey || null,
      connectionId: candidate.connectionId || null,
      directoryId: candidate.sourceDirectoryId || candidate.connectionId || null,
      directoryPath: candidate.sourceDirectoryPath || null,
      databaseName: candidate.databaseName || null,
      schemaName: candidate.schemaName || null,
      resourceName: candidate.resourceName || null,
      resourceType: candidate.resourceType || null,
      fileName: candidate.name,
      snapshotAt: candidate.sourceUpdatedAt || version.createdAt
    } : null;
    state.fileVersions.unshift(version);
    if (isNewAsset || !asset.latestVersionId) asset.latestVersionId = version.id;
    else asset.pendingVersionId = version.id;
    asset.updatedAt = version.createdAt;
    return { version: version, reused: false, current: isNewAsset, reason: resolvedFileId ? "content_update" : "new_document" };
  }
  function importContext(batchId, targetId) {
    var state = store.getState();
    var batch = find(state.importBatches, batchId);
    var target = batch ? batch.knowledgeBaseId : targetId;
    var kb = target && find(state.knowledgeBases, target);
    if (batchId && !batch) return null;
    var profile = find(state.rag.ingestionProfiles, batch && batch.ingestionProfileId || kb && kb.currentIngestionProfileId) || state.rag.ingestionProfiles.find(function available(p) { return p.visible !== false && p.chunking; });
    return Object.assign({}, kb || {}, { id: target || "local-documents", name: kb ? kb.name : "文档管理", isLocalDocumentFlow: !target, importBatchId: batchId || null, currentIngestionProfileId: profile && profile.id, currentIngestionProfileName: profile && profile.name, mineruParseConfig: clone(batch && batch.mineruParseConfig || kb && kb.mineruParseConfig || processing.normalizeParseConfig()) });
  }
  function startKnowledgeImport(targetId, payload) {
    var input = payload || {};
    var state = store.getState();
    var target = targetId === "local-documents" ? null : targetId;
    var kb = target && find(state.knowledgeBases, target);
    if (target && !kb) return null;
    var versions = (input.fileVersionIds || []).map(function lookup(key) { return find(state.fileVersions, key); });
    if (versions.some(function unavailable(version) {
      var asset = version && find(state.fileAssets, version.fileId);
      return !version || version.lifecycleStatus === "retired" || !asset || asset.latestVersionId !== version.id;
    })) return null;
    var libraryVersionIds = versions.map(function markLibrary(version) { return version.id; });
    var sourceCatalog = listEnterpriseSourceObjects();
    var sources = (input.sourceObjects || []).map(function lookup(source) { return find(sourceCatalog, typeof source === "string" ? source : source.id || source.sourceObjectId); });
    if (sources.some(function invalid(source) { return !source || !source.available; })) return null;
    var candidates = input.files && input.files.length ? processing.normalizeFiles(input) : [];
    sources.forEach(function snapshot(source) {
      candidates.push({
        name: source.fileName || source.name + ".csv",
        size: source.fileSizeBytes,
        type: "text/csv",
        contentHash: "fixture:" + textKey(source.content),
        sourcePreview: source.content,
        sourceObjectId: source.id,
        sourceUpdatedAt: source.updatedAt,
        connectionId: source.connectionId,
        sourceDirectoryId: source.directoryId,
        sourceDirectoryPath: source.directoryPath,
        databaseName: source.databaseName,
        schemaName: source.schemaName,
        resourceName: source.resourceName,
        resourceType: source.resourceType,
        stableObjectKey: source.stableObjectKey,
        targetFolderId: "FOLDER-ENTERPRISE"
      });
    });
    candidates.forEach(function assignTargetFolder(candidate) {
      if (!candidate.targetFolderId && input.targetFolderId) candidate.targetFolderId = input.targetFolderId;
    });
    if (!versions.length && !candidates.length) return null;
    var created = mutate("file-import-created", null, function create(current) {
      var duplicateVersionIds = [];
      candidates.forEach(function save(candidate) {
        var identityDecision = candidate.identityDecision || input.identityDecision;
        var forceNewDocument = candidate.forceNewDocument === true || input.forceNewDocument === true || identityDecision === "create_new" || identityDecision === "new_document";
        var requestedAsset = !forceNewDocument && candidate.targetFileId && find(current.fileAssets, candidate.targetFileId);
        var existing = kb && !candidate.sourceObjectId && !forceNewDocument && current.documents.find(function same(doc) {
          if (doc.knowledgeBaseId !== target) return false;
          if (requestedAsset) return doc.fileId === requestedAsset.id;
          return doc.name.toLowerCase() === candidate.name.toLowerCase();
        });
        var saved = createVersion(current, candidate, requestedAsset && requestedAsset.id || existing && existing.fileId, forceNewDocument);
        versions.push(saved.version);
        if (saved.reused && saved.current) duplicateVersionIds.push(saved.version.id);
      });
      versions = versions.filter(function unique(v, i) { return versions.findIndex(function match(other) { return other.fileId === v.fileId; }) === i; });
      var context = importContext(null, target);
      var batch = { id: id("IMP"), knowledgeBaseId: target, processingScope: target ? "knowledge-base" : "local-documents", sourceType: sources.length ? "enterprise_snapshot" : "manual_upload", createdAt: now(), generation: 0, previewRevision: 0, ingestionProfileId: context.currentIngestionProfileId, mineruParseConfig: clone(context.mineruParseConfig), processingProfileSnapshot: null, processingParametersSnapshot: null, items: [], inputCount: versions.length, successCount: 0, processingCount: 0, failureCount: 0, skippedCount: 0, pendingReplacementCount: 0, completionRequested: false, simulateFailureStage: input.simulateFailureStage || null, reprocess: Boolean(input.reprocess), autoSync: Boolean(input.autoSync), syncDocumentId: input.syncDocumentId || null, syncTargetVersionId: input.syncTargetVersionId || null };
      if (typeof input.returnRoute === "string" && /^(?:knowledge|local-documents)(?:[/?]|$)/.test(input.returnRoute) && input.returnRoute.indexOf("..") < 0) batch.returnRoute = input.returnRoute;
      versions.forEach(function item(version) {
        var existing = target && current.documents.find(function match(doc) {
          if (doc.knowledgeBaseId !== target || doc.fileId !== version.fileId) return false;
          return !input.syncDocumentId || doc.id === input.syncDocumentId;
        });
        var same = existing && existing.fileVersionId === version.id;
        var duplicateUpload = !target && duplicateVersionIds.indexOf(version.id) >= 0;
        var operation = same || duplicateUpload ? (input.reprocess && same ? "reprocess" : "skip") : (existing ? "replace" : "create");
        var skippedLabel = duplicateUpload ? "文档管理已存在相同内容" : "当前知识库已引用此文档";
        var entry = { id: id("IMP-ITEM"), fileId: version.fileId, fileVersionId: version.id, fileName: version.name, name: version.name, fileSizeBytes: version.fileSizeBytes, contentHash: version.contentHash, type: version.mimeType, sourceFile: version.sourceFile, sourcePreview: version.sourcePreview, documentId: existing && existing.id || null, existingDocumentId: existing && existing.id || null, operation: operation, duplicateReason: duplicateUpload ? "same_content" : null, status: operation === "skip" ? "skipped" : "staged", statusLabel: operation === "skip" ? skippedLabel : "待配置", parseResultId: null, chunkSetId: null, pipeline: [], availableActions: operation === "replace" ? ["confirm_replacement"] : [], countsTowardDocumentTotal: !existing && Boolean(target), sourceChannel: version.sourceType === "enterprise_snapshot" ? "enterprise" : (libraryVersionIds.indexOf(version.id) >= 0 ? "library" : "upload") };
        if (operation === "skip") batch.skippedCount += 1;
        if (!batch.autoSync && existing && operation !== "skip" && existing.sourceSyncStatus) {
          var sourceSyncBatch = existing.sourceSyncBatchId && find(current.importBatches, existing.sourceSyncBatchId);
          if (sourceSyncBatch && batchRetainsSnapshots(sourceSyncBatch)) cancelBatchInState(current, sourceSyncBatch, "用户已提交新的处理请求，后台同步任务已取消");
          clearReferenceSync(existing);
        }
        if (operation === "replace") { batch.pendingReplacementCount += 1; existing.pendingReplacement = { batchId: batch.id, itemId: entry.id, status: "staged", name: version.name }; }
        batch.items.push(entry);
      });
      activeItems(batch).forEach(function claimIntent(item) {
        var asset = find(current.fileAssets, item.fileId);
        var previousId = processingIntentId(asset, batch);
        var previousBatch = previousId && find(current.importBatches, previousId);
        if (previousBatch && previousBatch.id !== batch.id && batchRetainsSnapshots(previousBatch)) {
          cancelBatchInState(current, previousBatch, "已有更新的处理请求，旧任务已取消");
        }
        setProcessingIntent(asset, batch);
      });
      setStatus(batch, batch.skippedCount === batch.items.length ? "completed" : "pending_configuration");
      if (batch.status === "completed") scrubBatchSourcePayload(batch);
      current.importBatches.unshift(batch); record(current, "upload_registered", batch, target ? "文件已登记，可继续配置解析与切块" : "文件已登记到公共池，等待配置解析");
      return batch;
    });
    return created;
  }

  function activeItems(batch) { return batch.items.filter(function active(item) { return !item.deleted && item.operation !== "skip" && item.status !== "skipped"; }); }
  function schedule(state, batch, stage, item, callback, revision) {
    var generation = batch.generation;
    var job = { id: id("JOB"), batchId: batch.id, itemId: item && item.id, fileVersionId: item && item.fileVersionId, stage: stage, generation: generation, status: "running", createdAt: now(), error: null };
    state.processingJobs.unshift(job);
    window.setTimeout(function finish() {
      if (store.getState() !== state || !find(state.importBatches, batch.id) || batch.generation !== generation || batch.status === "cancelled" || job.status === "cancelled" || item && item.deleted || (revision != null && batch.previewRevision !== revision)) { job.status = "cancelled"; return; }
      mutate("file-processing-stage", batch.id, function advance() {
        if (batch.simulateFailureStage === stage) {
          batch.simulateFailureStage = null; job.status = "failed"; job.error = "模拟" + stage + "失败，可重试";
          if (item) { item.status = "failed"; item.error = job.error; var output = find(stage === "parse" ? state.parseResults : state.chunkSets, stage === "parse" ? item.parseResultId : item.chunkSetId); if (output && (stage === "parse" || stage === "chunk")) { output.status = "failed"; output.error = job.error; if (stage === "chunk") refreshChunkSetLifecycle(state, [output.id]); } }
          batch.failureCount += 1; batch.error = job.error; batch.failedStage = stage; setStatus(batch, "failed"); settleAutoSyncReference(state, batch, "failed"); return;
        }
        job.status = "ready"; job.completedAt = now(); callback(state);
      });
    }, stage === "parse" ? 850 : 420);
    return job;
  }
  function startImportParsing(batchId, payload) {
    var batch = find(store.getState().importBatches, batchId);
    if (!batch || batch.status === "completed" || batch.status === "cancelled") return batch;
    var config = processing.normalizeParseConfig(batch.mineruParseConfig, payload && (payload.mineruParseConfig || payload.parseConfig) || {});
    if (!config) return null;
    return mutate("file-parsing-started", batchId, function start(state) {
      batch.generation += 1; batch.completionRequested = false; batch.mineruParseConfig = config; batch.error = null; batch.failureCount = 0; batch.failedStage = null;
      state.processingJobs.filter(function obsolete(job) { return job.batchId === batchId && job.status === "running"; }).forEach(function cancel(job) { job.status = "cancelled"; });
      state.parseResults.concat(state.chunkSets).filter(function obsolete(result) { return result.batchId === batchId && result.status === "running"; }).forEach(function cancel(result) { result.status = "cancelled"; });
      refreshChunkSetLifecycle(state, state.chunkSets.filter(function cancelled(set) { return set.batchId === batchId && set.status === "cancelled"; }).map(function key(set) { return set.id; }));
      setStatus(batch, "parsing"); settleAutoSyncReference(state, batch, "running");
      activeItems(batch).forEach(function parseFile(item) {
        item.error = null; item.chunkSetId = null; item.status = "parsing";
        var configKey = stable(config);
        var parse = state.parseResults.find(function reusable(result) { return result.fileVersionId === item.fileVersionId && result.configKey === configKey && result.status === "ready"; });
        item.parseReused = Boolean(parse);
        if (parse) { item.parseResultId = parse.id; item.status = "parsed"; return; }
        parse = { id: id("PARSE"), fileId: item.fileId, fileVersionId: item.fileVersionId, configSnapshot: clone(config), configKey: configKey, status: "running", content: "", error: null, createdAt: now(), batchId: batchId, generation: batch.generation };
        state.parseResults.unshift(parse); item.parseResultId = parse.id;
        schedule(state, batch, "parse", item, function parsed(current) {
          var version = find(current.fileVersions, item.fileVersionId);
          var textual = /^text\//.test(version.mimeType || "") || /\.(txt|csv|json|md)$/i.test(version.name);
          parse.content = textual ? version.sourcePreview : version.sourcePreview || version.name + "\n\n文档解析内容示例。本地演示保留原文件，正式接入后由解析服务提供正文及定位信息。";
          parse.status = "ready"; parse.completedAt = now(); item.status = "parsed";
          var asset = find(current.fileAssets, version.fileId);
          if (asset && asset.latestVersionId === version.id) asset.currentParseResultId = parse.id;
          maybeChunk(current, batch);
        });
      });
      maybeChunk(state, batch); return batch;
    });
  }
  function resolveProfile(state, batch, payload) {
    var input = payload || {};
    var profile = find(state.rag.ingestionProfiles, input.ingestionProfileId || batch.ingestionProfileId);
    if (!profile) return null;
    return processing.profileSnapshot(profile, input.processingParameters || input.processingOverrides || batch.processingParametersSnapshot || {});
  }
  function configureChunk(batchId, payload, completed) {
    var state = store.getState(); var batch = find(state.importBatches, batchId);
    if (!batch || batch.status === "cancelled" || batch.status === "completed") return null;
    if (!batch.knowledgeBaseId) return null;
    var profile = resolveProfile(state, batch, payload);
    if (!profile) return null;
    if (processing.alignIndexWithParseConfig) profile = processing.alignIndexWithParseConfig(profile, batch.mineruParseConfig || {});
    if (batch.knowledgeBaseId && completed && !embeddingModel(state, batch.knowledgeBaseId)) return null;
    return mutate("file-chunk-configured", batchId, function configure(current) {
      var key = stable({ chunking: profile.chunking, indexContent: profile.indexContent });
      if (key !== batch.chunkConfigKey) {
        batch.previewRevision += 1;
        batch.completionRequested = false;
        current.chunkSets.filter(function obsolete(set) { return set.batchId === batchId && set.status === "running"; }).forEach(function cancel(set) { set.status = "cancelled"; });
        refreshChunkSetLifecycle(current, current.chunkSets.filter(function cancelled(set) { return set.batchId === batchId && set.status === "cancelled"; }).map(function id(set) { return set.id; }));
        activeItems(batch).forEach(function clear(item) { item.chunkSetId = null; });
      }
      batch.chunkConfigKey = key; batch.processingProfileSnapshot = profile; batch.processingParametersSnapshot = clone(processing.parametersSnapshot(profile)); batch.ingestionProfileId = profile.id;
      if (completed) batch.completionRequested = true;
      maybeChunk(current, batch); return batch;
    });
  }
  function maybeChunk(state, batch) {
    if (batch.status === "failed" || batch.status === "cancelled") return;
    var items = activeItems(batch);
    if (!items.every(function parsed(item) { var parse = find(state.parseResults, item.parseResultId); return parse && parse.status === "ready"; })) { setStatus(batch, batch.completionRequested ? "waiting_parse" : "parsing"); return; }
    if (!batch.knowledgeBaseId) { completeLocalParsing(state, batch); return; }
    if (!batch.processingProfileSnapshot) { setStatus(batch, "parsed"); return; }
    items.forEach(function chunkFile(item) {
      var currentSet = find(state.chunkSets, item.chunkSetId);
      if (currentSet && (currentSet.status === "ready" || currentSet.status === "running") && currentSet.configKey === batch.chunkConfigKey) return;
      var set = state.chunkSets.find(function reusable(candidate) { return candidate.parseResultId === item.parseResultId && candidate.configKey === batch.chunkConfigKey && candidate.status === "ready" && !candidate.manual; });
      item.chunkReused = Boolean(set);
      if (set) { item.chunkSetId = set.id; item.status = "processed"; return; }
      set = { id: id("CHUNKSET"), fileId: item.fileId, fileVersionId: item.fileVersionId, parseResultId: item.parseResultId, configSnapshot: clone(batch.processingProfileSnapshot), configKey: batch.chunkConfigKey, status: "running", lifecycleStatus: "staging", chunks: [], parentChunks: [], error: null, createdAt: now(), batchId: batch.id };
      state.chunkSets.unshift(set); item.chunkSetId = set.id; item.status = "chunking";
      var revision = batch.previewRevision;
      schedule(state, batch, "chunk", item, function chunked(current) {
        var version = find(current.fileVersions, item.fileVersionId); var parse = find(current.parseResults, item.parseResultId);
        var temporary = { chunks: [] }; var doc = { id: item.fileId, knowledgeBaseId: null, name: version.name, sourcePreview: parse.content, processingProfileSnapshot: set.configSnapshot };
        var shape = processing.estimateShape({ size: version.fileSizeBytes, characterCount: parse.content.length }, set.configSnapshot);
        if (parse.content.trim()) processing.buildPreviewChunks(temporary, doc, shape);
        set.chunks = withMetadata(temporary.chunks, version, parse.id, set.id);
        set.parentChunks = withParentMetadata(doc.parentChunks || [], version, parse.id, set.id);
        set.status = "ready"; set.completedAt = now(); item.status = "processed"; item.processingEstimate = shape;
        afterChunks(current, batch);
      }, revision);
    });
    afterChunks(state, batch);
  }
  function localParseCandidateIsCurrent(state, batch, item) {
    var version = find(state.fileVersions, item.fileVersionId);
    var parse = find(state.parseResults, item.parseResultId);
    var asset = version && find(state.fileAssets, version.fileId);
    return Boolean(version && parse && asset &&
      version.lifecycleStatus !== "retired" &&
      parse.status === "ready" &&
      processingIntentId(asset, batch) === batch.id &&
      (asset.latestVersionId === version.id || asset.pendingVersionId === version.id));
  }
  function completeLocalParsing(state, batch) {
    var localItems = activeItems(batch);
    if (localItems.some(function stale(item) { return !localParseCandidateIsCurrent(state, batch, item); })) {
      cancelBatchInState(state, batch, "候选内容已失效或被更新任务取代，未切换当前文件");
      localItems.forEach(function cleanup(item) { retireUnreferencedSnapshots(state, item.fileId); });
      return;
    }
    localItems.forEach(function ready(item) {
      var asset = find(state.fileAssets, item.fileId);
      var previousSetId = asset && asset.currentChunkSetId;
      if (asset) {
        asset.latestVersionId = item.fileVersionId;
        if (asset.pendingVersionId === item.fileVersionId) delete asset.pendingVersionId;
        asset.currentParseResultId = item.parseResultId;
        delete asset.currentChunkSetId;
        asset.updatedAt = now();
        clearProcessingIntent(asset, batch);
        if (previousSetId) refreshChunkSetLifecycle(state, [previousSetId]);
      }
      item.status = "success";
      item.statusLabel = "已解析";
      item.pipeline = ["receive", "parse"].map(function stage(key) { return { key: key, status: "success" }; });
    });
    batch.successCount = localItems.length;
    batch.completedAt = now();
    setStatus(batch, "completed");
    scrubBatchSourcePayload(batch);
    localItems.forEach(function syncReferences(item) {
      var version = find(state.fileVersions, item.fileVersionId);
      if (version) {
        queueReferencedDocumentSync(state, batch, version);
        retireUnreferencedSnapshots(state, version.fileId);
      }
    });
  }
  function afterChunks(state, batch) {
    if (batch.status === "failed" || batch.status === "cancelled") return;
    if (!activeItems(batch).every(function ready(item) { var set = find(state.chunkSets, item.chunkSetId); return set && set.status === "ready"; })) { setStatus(batch, "chunking"); return; }
    if (!batch.completionRequested) { setStatus(batch, "preview_ready"); return; }
    if (activeItems(batch).some(function pending(item) { return item.operation === "replace" && !item.replacementConfirmed; })) {
      activeItems(batch).filter(function pending(item) { return item.operation === "replace" && !item.replacementConfirmed; }).forEach(function staged(item) { item.status = "replacement_staged"; item.statusLabel = "待确认替换"; });
      setStatus(batch, "awaiting_replacement_confirmation"); return;
    }
    if (activeItems(batch).some(function empty(item) { return !find(state.chunkSets, item.chunkSetId).chunks.length; })) {
      batch.error = "解析结果没有可检索内容，请检查原文件或解析选项"; batch.failedStage = "parse"; setStatus(batch, "failed"); settleAutoSyncReference(state, batch, "failed"); return;
    }
    if (batch.indexJobGeneration === batch.generation + ":" + batch.previewRevision) return;
    var model = embeddingModel(state, batch.knowledgeBaseId);
    if (!model) { batch.error = "向量模型连接不可用"; batch.failedStage = "embedding"; setStatus(batch, "failed"); settleAutoSyncReference(state, batch, "failed"); return; }
    batch.indexJobGeneration = batch.generation + ":" + batch.previewRevision; batch.embeddingModelIdSnapshot = model.id; batch.embeddingDimensionSnapshot = model.dimension; batch.embeddingModelConfigKey = modelKey(model);
    setStatus(batch, "embedding");
    var revision = batch.previewRevision;
    schedule(state, batch, "embedding", null, function encoded(current) {
      setStatus(batch, "indexing");
      schedule(current, batch, "index", null, function indexed(finalState) { publishBatch(finalState, batch); }, revision);
    }, revision);
  }
  function embeddingModel(state, kbId) {
    var kb = find(state.knowledgeBases, kbId); var model = kb && find(state.rag.modelCatalog.embeddingModels, kb.boundEmbeddingModelId);
    return model && (model.connectionStatus ? model.connectionStatus === "available" : model.status === "available") ? model : null;
  }
  function projectChunks(state, doc, set, version, model) {
    var old = state.chunks.filter(function match(chunk) { return chunk.documentId === doc.id; });
    var sourceIds = set.chunks.map(function key(chunk) { return chunk.id; });
    var added = []; var retained = []; var updated = [];
    var projections = set.chunks.map(function project(source) {
      var inputText = embeddingInput(source, set, version);
      var key = textKey(inputText);
      function reusable(chunk) {
        var encoding = find(state.embeddingRecords, chunk.embeddingRecordId);
        return retained.indexOf(chunk.id) < 0 && chunk.content === source.content && encoding && encoding.inputText === inputText && encoding.modelId === model.id && encoding.modelConfigKey === modelKey(model) && encoding.dimension === model.dimension;
      }
      // Keep a chunk's projection identity stable when only its position changes.
      // Content-based reuse remains available for genuinely replaced source chunks.
      var same = old.find(function sameSource(chunk) { return chunk.sourceChunkId === source.id && reusable(chunk); }) || old.find(function sameContent(chunk) {
        return sourceIds.indexOf(chunk.sourceChunkId) < 0 && reusable(chunk);
      });
      var chunkId = same ? same.id : id("CHK"); (same ? retained : added).push(chunkId);
      var encodingId = same ? same.embeddingRecordId : id("EMB");
      if (!same) state.embeddingRecords.unshift({ id: encodingId, knowledgeBaseId: doc.knowledgeBaseId, documentId: doc.id, chunkId: chunkId, inputText: inputText, inputHash: key, modelId: model.id, modelConfigKey: modelKey(model), dimension: model.dimension, status: "ready", createdAt: now() });
      var prior = same || old.find(function match(chunk) { return chunk.sourceChunkId === source.id; });
      var projection = Object.assign({}, source, { id: chunkId, sourceChunkId: source.id, chunkSetId: set.id, documentId: doc.id, knowledgeBaseId: doc.knowledgeBaseId, fileVersionId: version.id, contentHash: key, embeddingRecordId: encodingId, embeddingModelId: model.id, embeddingDimension: model.dimension, status: "ready", metadata: Object.assign({}, prior && prior.metadata || {}, source.metadata, { knowledgeBaseId: doc.knowledgeBaseId }) });
      if (same && (Number(same.index || 0) !== Number(projection.index || 0) || (same.metadata || {}).prevChunkId !== (projection.metadata || {}).prevChunkId || (same.metadata || {}).nextChunkId !== (projection.metadata || {}).nextChunkId || (same.metadata || {}).parentChunkId !== (projection.metadata || {}).parentChunkId)) updated.push(chunkId);
      return projection;
    });
    var removed = old.filter(function missing(chunk) { return retained.indexOf(chunk.id) < 0; }).map(function key(chunk) { return chunk.id; });
    state.chunks = state.chunks.filter(function other(chunk) { return chunk.documentId !== doc.id; }).concat(projections);
    state.embeddingRecords = state.embeddingRecords.filter(function keep(record) { return record.documentId !== doc.id || projections.some(function used(chunk) { return chunk.embeddingRecordId === record.id; }); });
    state.indexUpdates.unshift({ id: id("INDEX-UPDATE"), knowledgeBaseId: doc.knowledgeBaseId, documentId: doc.id, fileVersionId: version.id, addedChunkIds: added, updatedChunkIds: updated, removedChunkIds: removed, retainedChunkIds: retained, embeddingModelId: model.id, embeddingCount: added.length, createdAt: now() });
  }
  function publishCandidateIsCurrent(state, batch, item) {
    var version = find(state.fileVersions, item.fileVersionId);
    var set = find(state.chunkSets, item.chunkSetId);
    var asset = version && find(state.fileAssets, version.fileId);
    if (!version || !set || !asset || version.lifecycleStatus === "retired" || set.status !== "ready" || set.lifecycleStatus === "discarded" || !set.chunks.length) return false;
    if (processingIntentId(asset, batch) !== batch.id) return false;
    if (asset.latestVersionId !== version.id && asset.pendingVersionId !== version.id) return false;
    if (!batch.autoSync) return true;
    var reference = find(state.documents, item.existingDocumentId || item.documentId);
    return Boolean(reference &&
      reference.fileId === version.fileId &&
      reference.sourceSyncStatus === "running" &&
      reference.sourceSyncTargetVersionId === version.id &&
      reference.sourceSyncBatchId === batch.id &&
      asset.latestVersionId === version.id);
  }
  function queueReferencedDocumentSync(state, batch, version) {
    if (batch.autoSync) return;
    var targets = state.documents.filter(function outdated(reference) {
      return reference.fileId === version.fileId && reference.knowledgeBaseId && reference.knowledgeBaseId !== batch.knowledgeBaseId && reference.fileVersionId !== version.id;
    }).map(function capture(reference) {
      var previousBatch = reference.sourceSyncBatchId && find(state.importBatches, reference.sourceSyncBatchId);
      var sameTargetPending = reference.sourceSyncTargetVersionId === version.id &&
        (["pending", "running"].indexOf(reference.sourceSyncStatus) >= 0 ||
          reference.sourceSyncStatus === "failed" && previousBatch && batchRetainsSnapshots(previousBatch));
      if (sameTargetPending) return null;
      if (previousBatch && batchRetainsSnapshots(previousBatch)) cancelBatchInState(state, previousBatch, "已有更新的文档内容，旧同步任务已取消");
      reference.sourceSyncStatus = "pending";
      reference.sourceSyncTargetVersionId = version.id;
      delete reference.sourceSyncBatchId;
      return { documentId: reference.id, knowledgeBaseId: reference.knowledgeBaseId };
    }).filter(Boolean);
    if (!targets.length) return;
    window.setTimeout(function syncReferences() {
      targets.forEach(function sync(target) {
        var current = store.getState();
        var reference = find(current.documents, target.documentId);
        var knowledgeBase = find(current.knowledgeBases, target.knowledgeBaseId);
        var asset = find(current.fileAssets, version.fileId);
        if (!reference) return;
        if (reference.fileVersionId === version.id) {
          mutate("file-source-sync-settled", null, function settled(liveState) {
            var liveReference = find(liveState.documents, target.documentId);
            if (liveReference && liveReference.sourceSyncTargetVersionId === version.id) clearReferenceSync(liveReference);
          });
          return;
        }
        if (!knowledgeBase || !asset || asset.latestVersionId !== version.id || reference.sourceSyncTargetVersionId !== version.id) {
          mutate("file-source-sync-superseded", null, function superseded(liveState) {
            var liveReference = find(liveState.documents, target.documentId);
            if (liveReference && liveReference.sourceSyncTargetVersionId === version.id) clearReferenceSync(liveReference);
          });
          return;
        }
        var syncBatch = actions.startKnowledgeImport(knowledgeBase.id, {
          fileVersionIds: [version.id],
          deferred: true,
          autoSync: true,
          syncDocumentId: reference.id,
          syncTargetVersionId: version.id,
          returnRoute: "knowledge/" + knowledgeBase.id + "?tab=documents"
        });
        if (!syncBatch || syncBatch.status === "completed") {
          mutate("file-source-sync-unavailable", null, function unavailable(liveState) {
            var liveReference = find(liveState.documents, target.documentId);
            if (!liveReference || liveReference.sourceSyncTargetVersionId !== version.id) return;
            if (liveReference.fileVersionId === version.id) clearReferenceSync(liveReference);
            else {
              liveReference.sourceSyncStatus = "failed";
              delete liveReference.sourceSyncBatchId;
            }
          });
          return;
        }
        mutate("file-source-sync-started", syncBatch.id, function markStarted(liveState) {
          var liveReference = find(liveState.documents, target.documentId);
          var liveAsset = find(liveState.fileAssets, version.fileId);
          if (!liveReference || !liveAsset || liveAsset.latestVersionId !== version.id || liveReference.sourceSyncTargetVersionId !== version.id) {
            cancelBatchInState(liveState, syncBatch, "文档已有更新内容，当前同步任务已取消");
            return null;
          }
          liveReference.sourceSyncStatus = "running";
          liveReference.sourceSyncBatchId = syncBatch.id;
          return liveReference;
        });
        if (syncBatch.status === "cancelled") return;
        var syncItem = activeItems(syncBatch)[0];
        if (syncItem && syncItem.operation === "replace") actions.confirmDocumentReplacement(syncBatch.id, syncItem.id);
        actions.startImportParsing(syncBatch.id, { mineruParseConfig: reference.mineruParseConfig || knowledgeBase.mineruParseConfig });
        actions.completeImportProcessing(syncBatch.id, {
          ingestionProfileId: reference.processingProfileSnapshot && reference.processingProfileSnapshot.sourceProfileId || knowledgeBase.currentIngestionProfileId,
          processingParameters: processing.parametersSnapshot(reference.processingProfileSnapshot) || knowledgeBase.processingParametersSnapshot || {}
        });
      });
    }, 0);
  }
  function retireUnreferencedSnapshots(state, fileId) {
    var asset = find(state.fileAssets, fileId);
    if (!asset) return;
    var activeVersionIds = new Set(state.documents.filter(function own(reference) {
      return reference.fileId === fileId;
    }).map(function key(reference) { return reference.fileVersionId; }));
    activeVersionIds.add(asset.latestVersionId);
    var localSet = find(state.chunkSets, asset.currentChunkSetId);
    if (localSet) activeVersionIds.add(localSet.fileVersionId);
    state.importBatches.filter(batchRetainsSnapshots).forEach(function keepBatch(batch) {
      batch.items.filter(function own(item) {
        return !item.deleted && item.operation !== "skip" && item.status !== "skipped" && item.fileId === fileId;
      }).forEach(function keepItem(item) { activeVersionIds.add(item.fileVersionId); });
    });
    state.processingJobs.filter(function running(job) { return job.status === "running"; }).forEach(function keep(job) {
      if (job.fileVersionId) activeVersionIds.add(job.fileVersionId);
    });
    state.fileVersions.filter(function old(version) {
      return version.fileId === fileId && !activeVersionIds.has(version.id);
    }).forEach(function retire(version) {
      version.lifecycleStatus = "retired";
      version.retiredAt = version.retiredAt || now();
      version.sourceFile = null;
      version.sourcePreview = "";
      state.importBatches.forEach(function scrubBatch(batch) {
        batch.items.filter(function derived(item) { return item.fileVersionId === version.id; }).forEach(function scrub(item) {
          item.sourceFile = null;
          item.sourcePreview = "";
        });
      });
      state.parseResults.filter(function derived(parse) { return parse.fileVersionId === version.id; }).forEach(function retireParse(parse) {
        if (parse.status === "running") return;
        parse.lifecycleStatus = "retired";
        parse.content = "";
      });
      state.chunkSets.filter(function derived(set) { return set.fileVersionId === version.id; }).forEach(function retireChunks(set) {
        if (set.status === "running" || chunkSetReferences(state, set.id).length || asset.currentChunkSetId === set.id) return;
        set.lifecycleStatus = "obsolete";
        set.obsoleteAt = set.obsoleteAt || now();
        set.chunks = [];
        set.parentChunks = [];
      });
    });
    if (asset.pendingVersionId) {
      var pending = find(state.fileVersions, asset.pendingVersionId);
      if (!pending || pending.lifecycleStatus === "retired") delete asset.pendingVersionId;
    }
  }
  function publishBatch(state, batch) {
    var kb = find(state.knowledgeBases, batch.knowledgeBaseId); var model = embeddingModel(state, batch.knowledgeBaseId);
    if (!kb || !model || modelKey(model) !== batch.embeddingModelConfigKey) { batch.error = "知识库或模型配置已改变，请重试"; batch.failedStage = "embedding"; setStatus(batch, "failed"); settleAutoSyncReference(state, batch, "failed"); return; }
    var items = activeItems(batch);
    var invalid = items.find(function invalidCandidate(item) { return !publishCandidateIsCurrent(state, batch, item); });
    if (invalid) {
      cancelBatchInState(state, batch, "候选内容已失效或被更新任务取代，未切换当前结果");
      items.forEach(function cleanup(item) { retireUnreferencedSnapshots(state, item.fileId); });
      return;
    }
    items.forEach(function publish(item) {
      var version = find(state.fileVersions, item.fileVersionId); var set = find(state.chunkSets, item.chunkSetId); var doc = find(state.documents, item.existingDocumentId || item.documentId) || state.documents.find(function currentReference(candidate) { return candidate.knowledgeBaseId === kb.id && candidate.fileId === version.fileId; });
      if (!doc) { doc = processing.createDocument({ knowledgeBaseId: kb.id, name: version.name, id: id("DOC") }); state.documents.unshift(doc); kb.documentCounts.total += 1; }
      var previousSetId = doc.chunkSetId || null;
      if (!doc.searchable) kb.documentCounts.searchable += 1;
      Object.assign(doc, { localAssetId: version.fileId, fileId: version.fileId, fileVersionId: version.id, parseResultId: item.parseResultId, chunkSetId: item.chunkSetId, name: version.name, mimeType: version.mimeType, fileSizeBytes: version.fileSizeBytes, fileSizeLabel: version.fileSizeLabel, sourceType: version.sourceType, sourceTypeLabel: version.sourceType === "enterprise_snapshot" ? "企业数据" : (doc.sourceTypeLabel || "本地上传"), sourceChannel: item.sourceChannel || (version.sourceType === "enterprise_snapshot" ? "enterprise" : "library"), sourceFile: version.sourceFile, sourceUrl: version.sourceUrl || "", sourcePreview: version.sourcePreview, sourceMetadata: version.sourceMetadata || null, contentHash: version.contentHash, characterCount: set.chunks.reduce(function sum(n, chunk) { return n + chunk.content.length; }, 0), chunkCount: set.chunks.length, parentChunkCount: (set.parentChunks || []).length, searchable: true, pendingVectorization: false, currentStage: "ready", lifecycleStatus: "effective", lifecycleStatusLabel: "可检索", processingProfileSnapshot: clone(set.configSnapshot), mineruParseConfig: clone(batch.mineruParseConfig), importedAt: doc.importedAt || batch.createdAt });
      delete doc.sourceSyncStatus;
      var asset = find(state.fileAssets, version.fileId);
      if (asset) {
        var previousLocalSetId = asset.currentChunkSetId;
        asset.latestVersionId = version.id;
        if (asset.pendingVersionId === version.id) delete asset.pendingVersionId;
        asset.currentParseResultId = item.parseResultId;
        delete asset.currentChunkSetId;
        if (previousLocalSetId) refreshChunkSetLifecycle(state, [previousLocalSetId]);
        asset.updatedAt = now();
        clearProcessingIntent(asset, batch);
      }
      setStatus(doc, "ready"); delete doc.pendingReplacement; clearReferenceSync(doc);
      projectChunks(state, doc, set, version, model);
      switchChunkSetBinding(state, doc, set.id, previousSetId);
      item.documentId = doc.id; item.status = "success"; item.statusLabel = "可检索"; item.availableActions = ["view_document"];
      item.pipeline = ["receive", "parse", "chunk", "embedding", "index"].map(function step(key) { return { key: key, status: "success" }; });
    });
    batch.successCount = items.length; batch.pendingReplacementCount = 0; batch.completedAt = now(); setStatus(batch, "completed"); settleAutoSyncReference(state, batch, "completed"); scrubBatchSourcePayload(batch);
    items.forEach(function syncReferences(item) {
      var currentVersion = find(state.fileVersions, item.fileVersionId);
      if (currentVersion) {
        queueReferencedDocumentSync(state, batch, currentVersion);
        retireUnreferencedSnapshots(state, currentVersion.fileId);
      }
    });
    var previous = find(state.knowledgeVersions, kb.currentKnowledgeVersionId); if (previous) previous.status = "historical";
    var index = { id: id("KV"), knowledgeBaseId: kb.id, status: "effective", statusLabel: "索引可用", progress: 100, documentCount: kb.documentCounts.total, chunkCount: state.chunks.filter(function own(chunk) { return chunk.knowledgeBaseId === kb.id; }).length, createdAt: now(), sourceType: "import_batch", sourceBatchIds: [batch.id] };
    state.knowledgeVersions.unshift(index); kb.currentKnowledgeVersionId = index.id; batch.resultingKnowledgeVersionId = index.id; kb.contentUpdatedAt = now(); kb.updatedAt = now(); kb.retrievalStatus = kb.enabled ? "available" : "disabled"; kb.retrievalStatusLabel = kb.enabled ? "可检索" : "已关闭";
  }

  function getFileAssetDetail(fileId, options) {
    var state = store.getState(); var input = options || {}; var asset = find(state.fileAssets, fileId);
    if (!asset) return null;
    var references = state.documents.filter(function match(doc) { return doc.fileId === fileId && doc.knowledgeBaseId; });
    var ref = input.knowledgeBaseId ? references.find(function match(doc) { return doc.knowledgeBaseId === input.knowledgeBaseId; }) : null;
    if (input.knowledgeBaseId && !ref) return null;
    var version = find(state.fileVersions, ref ? ref.fileVersionId : input.fileVersionId || asset.latestVersionId);
    if (!version || version.fileId !== fileId) return null;
    var set = ref ? find(state.chunkSets, ref.chunkSetId) : null;
    var parse = ref ? find(state.parseResults, ref.parseResultId) : find(state.parseResults, asset.currentParseResultId);
    if (set && set.fileVersionId !== version.id) return null;
    var stage;
    if (ref) {
      stage = set && set.status === "failed" || parse && parse.status === "failed" ? "failed" : set && set.status === "running" ? "chunking" : parse && parse.status === "running" ? "parsing" : set && set.status === "ready" ? "processed" : parse && parse.status === "ready" ? "parsed" : "uploaded";
    } else {
      var activeBatch = (state.importBatches || []).find(function processing(batch) {
        return batchRetainsSnapshots(batch) && (batch.items || []).some(function own(item) { return !item.deleted && item.fileId === fileId; });
      });
      var activeItem = activeBatch && activeBatch.items.find(function own(item) { return !item.deleted && item.fileId === fileId; });
      var activeParse = activeItem && find(state.parseResults, activeItem.parseResultId);
      stage = activeBatch && activeBatch.status === "failed" && activeBatch.failedStage === "parse" ? "failed" : activeParse && activeParse.status === "ready" ? "parsed" : activeBatch ? "parsing" : parse && parse.status === "failed" ? "failed" : parse && parse.status === "ready" ? "parsed" : "uploaded";
    }
    var activeBatch = (state.importBatches || []).find(function processing(batch) {
      return batchRetainsSnapshots(batch) && (batch.items || []).some(function own(item) { return !item.deleted && item.fileId === fileId; });
    });
    var activeItem = activeBatch && activeBatch.items.find(function own(item) { return !item.deleted && item.fileId === fileId; });
    var processingError = stage === "failed"
      ? activeBatch && activeBatch.error || activeItem && activeItem.error || parse && parse.error || null
      : null;
    var processingFailedStage = stage === "failed"
      ? activeBatch && activeBatch.failedStage || activeItem && (activeItem.failedStep || activeItem.failedStage) || "parse"
      : null;
    return { asset: asset, version: version, parseResult: parse || null, chunkSet: set || null, references: references, processingState: stage, processingError: processingError, processingFailedStage: processingFailedStage, versions: state.fileVersions.filter(function match(v) { return v.fileId === fileId; }) };
  }
  function getImportPreview(batchId, options) {
    var state = store.getState(); var batch = find(state.importBatches, batchId); if (!batch) return null;
    var items = batch.items.map(function detail(item) { return Object.assign({}, item, { asset: find(state.fileAssets, item.fileId), version: find(state.fileVersions, item.fileVersionId), parseResult: find(state.parseResults, item.parseResultId), chunkSet: find(state.chunkSets, item.chunkSetId) }); });
    var selected = items.find(function match(item) { return item.fileVersionId === (options && options.fileVersionId); }) || items[0];
    return Object.assign({ batch: batch, status: batch.status, statusLabel: batch.statusLabel, items: items, item: selected, error: batch.error || selected && selected.error || null, content: selected && selected.parseResult && selected.parseResult.content || "", chunks: selected && selected.chunkSet && selected.chunkSet.status === "ready" ? selected.chunkSet.chunks : [], parentChunks: selected && selected.chunkSet && selected.chunkSet.status === "ready" ? selected.chunkSet.parentChunks || [] : [] }, selected ? { asset: selected.asset, version: selected.version, parseResult: selected.parseResult, chunkSet: selected.chunkSet } : {});
  }
  function cancelImportProcessing(batchId) {
    var batch = find(store.getState().importBatches, batchId); if (!batch || batch.status === "completed") return null;
    return mutate("file-processing-cancelled", batchId, function cancel(state) {
      var fileIds = Array.from(new Set(batch.items.map(function key(item) { return item.fileId; }).filter(Boolean)));
      cancelBatchInState(state, batch, "处理任务已取消");
      fileIds.forEach(function cleanup(fileId) { retireUnreferencedSnapshots(state, fileId); });
      return batch;
    });
  }
  function retryImportProcessing(batchId) {
    var state = store.getState(); var batch = find(state.importBatches, batchId); if (!batch || batch.status !== "failed") return null;
    var completed = batch.completionRequested; var failedStage = batch.failedStage;
    batch.simulateFailureStage = null; batch.error = null; batch.failureCount = 0; batch.indexJobGeneration = null;
    if (failedStage === "parse") { startImportParsing(batchId, { mineruParseConfig: batch.mineruParseConfig }); batch.completionRequested = completed; return batch; }
    return mutate("file-processing-retried", batchId, function retry(current) { setStatus(batch, "parsed"); settleAutoSyncReference(current, batch, "running"); activeItems(batch).forEach(function clear(item) { item.error = null; if (failedStage === "chunk" && find(current.chunkSets, item.chunkSetId) && find(current.chunkSets, item.chunkSetId).status === "failed") item.chunkSetId = null; }); maybeChunk(current, batch); return batch; });
  }
  function confirmDocumentReplacement(batchId, itemId) {
    var state = store.getState(); var batch = find(state.importBatches, batchId); var item = batch && find(batch.items, itemId);
    if (!item || item.operation !== "replace" || batch.status === "completed" || batch.status === "cancelled") return null;
    return mutate("file-replacement-confirmed", batchId, function confirm(current) { item.replacementConfirmed = true; if (batch.completionRequested) afterChunks(current, batch); return find(current.documents, item.existingDocumentId) || item; });
  }
  function deleteLocalDocumentAsset(fileId) {
    var state = store.getState(); var asset = find(state.fileAssets, fileId);
    if (!asset || state.documents.some(function referenced(doc) { return doc.fileId === fileId && doc.knowledgeBaseId; })) return null;
    return mutate("file-asset-deleted", null, function remove(current) {
      var affected = current.importBatches.filter(function includes(batch) { return batch.items.some(function match(item) { return item.fileId === fileId; }); });
      affected.forEach(function invalidate(batch) {
        batch.items.filter(function match(item) { return item.fileId === fileId; }).forEach(function stop(item) { item.deleted = true; item.status = "cancelled"; });
        current.processingJobs.filter(function match(job) { return job.batchId === batch.id && batch.items.some(function own(item) { return item.deleted && item.id === job.itemId; }) && job.status === "running"; }).forEach(function stop(job) { job.status = "cancelled"; });
        if (!activeItems(batch).length) { batch.generation += 1; setStatus(batch, "cancelled"); }
      });
      current.fileAssets = current.fileAssets.filter(function keep(f) { return f.id !== fileId; }); current.fileVersions = current.fileVersions.filter(function keep(v) { return v.fileId !== fileId; }); current.parseResults = current.parseResults.filter(function keep(p) { return p.fileId !== fileId; }); current.chunkSets = current.chunkSets.filter(function keep(s) { return s.fileId !== fileId; });
      affected.filter(function ongoing(batch) { return ["completed", "cancelled", "failed"].indexOf(batch.status) < 0; }).forEach(function continueOtherFiles(batch) { maybeChunk(current, batch); });
      record(current, "file_deleted", asset, "未被知识库引用的原文件及处理产物已删除"); return asset;
    }, false);
  }

  function createDocumentFolder(input) {
    var payload = input || {};
    var name = String(payload.name || "").trim();
    if (!name || name.length > 40) return null;
    return mutate("document-folder-created", null, function create(state) {
      ensureDocumentFolders(state);
      var parentId = payload.parentId && find(state.documentFolders, payload.parentId) ? payload.parentId : null;
      var duplicate = state.documentFolders.some(function same(folder) {
        return folder.parentId === parentId && String(folder.name).toLocaleLowerCase() === name.toLocaleLowerCase();
      });
      if (duplicate) return null;
      var siblings = state.documentFolders.filter(function sibling(folder) { return (folder.parentId || null) === parentId; });
      var siblingOrders = siblings.map(function order(folder) { return Number(folder.sortOrder || 0); });
      var beforeFolder = payload.position === "before" && find(siblings, payload.beforeFolderId);
      var beforeOrder = beforeFolder && Number(beforeFolder.sortOrder || 0);
      var previousOrders = beforeFolder ? siblingOrders.filter(function previous(order) { return order < beforeOrder; }) : [];
      var sortOrder = beforeFolder
        ? (previousOrders.length ? (Math.max.apply(Math, previousOrders) + beforeOrder) / 2 : beforeOrder - 1)
        : payload.position === "first" ? Math.min.apply(Math, siblingOrders.concat([10])) - 1 : Date.now();
      var folder = { id: id("FOLDER"), name: name, parentId: parentId, sortOrder: sortOrder, createdAt: now(), updatedAt: now(), system: false };
      state.documentFolders.push(folder);
      record(state, "folder_created", folder, "已创建文档文件夹");
      return folder;
    }, false);
  }

  function renameDocumentFolder(folderId, name) {
    var nextName = String(name || "").trim();
    if (!nextName || nextName.length > 40) return null;
    return mutate("document-folder-renamed", null, function rename(state) {
      var folder = find(state.documentFolders, folderId);
      if (!folder) return null;
      var duplicate = state.documentFolders.some(function same(candidate) {
        return candidate.id !== folder.id && candidate.parentId === folder.parentId && String(candidate.name).toLocaleLowerCase() === nextName.toLocaleLowerCase();
      });
      if (duplicate) return null;
      folder.name = nextName;
      folder.updatedAt = now();
      record(state, "folder_renamed", folder, "已重命名文档文件夹");
      return folder;
    }, false);
  }

  function deleteDocumentFolder(folderId) {
    return mutate("document-folder-deleted", null, function remove(state) {
      var folder = find(state.documentFolders, folderId);
      if (!folder || folder.system) return null;
      var hasChildren = state.documentFolders.some(function child(candidate) { return candidate.parentId === folder.id; });
      var hasFiles = state.fileAssets.some(function file(asset) { return asset.folderId === folder.id; });
      if (hasChildren || hasFiles) return null;
      state.documentFolders = state.documentFolders.filter(function keep(candidate) { return candidate.id !== folder.id; });
      record(state, "folder_deleted", folder, "已删除空文件夹");
      return folder;
    }, false);
  }

  function moveLocalDocumentAsset(fileId, folderId) {
    return mutate("file-asset-moved", null, function move(state) {
      var asset = find(state.fileAssets, fileId);
      var folder = find(state.documentFolders, folderId);
      if (!asset || !folder) return null;
      asset.folderId = folder.id;
      record(state, "file_moved", asset, "已移动到文件夹“" + folder.name + "”");
      return asset;
    }, false);
  }
  function editChunk(documentId, chunkId, content, operation) {
    var state = store.getState(); var doc = find(state.documents, documentId); var kb = doc && find(state.knowledgeBases, doc.knowledgeBaseId); var model = doc && embeddingModel(state, doc.knowledgeBaseId);
    var text = String(content || "").trim(); if (!doc || !kb || !model || operation !== "delete" && (!text || text.length > 20000)) return null;
    var original = find(state.chunkSets, doc.chunkSetId); var version = find(state.fileVersions, doc.fileVersionId); if (!original || !version) return null;
    var projection = chunkId && find(state.chunks, chunkId); var sourceId = projection ? projection.sourceChunkId : chunkId;
    if (projection && projection.documentId !== documentId) return null;
    if (operation !== "add" && !original.chunks.some(function match(chunk) { return chunk.id === sourceId; })) return null;
    return mutate("document-chunk-" + operation, null, function change(current) {
      var previousMutation = doc.pendingChunkMutation;
      if (previousMutation && previousMutation.status === "running") {
        previousMutation.status = "cancelled";
        var previousJob = find(current.processingJobs, previousMutation.jobId);
        var previousCandidate = find(current.chunkSets, previousMutation.chunkSetId);
        if (previousJob && previousJob.status === "running") previousJob.status = "cancelled";
        if (previousCandidate) { previousCandidate.lifecycleStatus = "discarded"; previousCandidate.obsoleteAt = now(); }
      }
      var set = Object.assign({}, original, { id: id("CHUNKSET"), chunks: clone(original.chunks), parentChunks: clone(original.parentChunks || []), status: "ready", lifecycleStatus: "staging", createdAt: now(), manual: true, originKnowledgeBaseId: kb.id, derivedFrom: original.id });
      var changed = null;
      if (operation === "add") {
        changed = { id: id("SOURCE-CHUNK"), content: text, origin: "manual", manualOperation: "add", createdAt: now() };
        set.chunks.push(changed);
      }
      else if (operation === "delete") set.chunks = set.chunks.filter(function keep(chunk) { return chunk.id !== sourceId; });
      else { changed = find(set.chunks, sourceId); changed.content = text; changed.origin = "manual"; changed.manualOperation = "edit"; }
      set.chunks = withMetadata(set.chunks, version, set.parseResultId, set.id);
      set.parentChunks = withParentMetadata(processing.buildParentHierarchy(set.chunks, set.configSnapshot && set.configSnapshot.chunking, { id: version.fileId, knowledgeBaseId: null }), version, set.parseResultId, set.id);
      current.chunkSets.unshift(set);
      doc.chunkMutationGeneration = Number(doc.chunkMutationGeneration || 0) + 1;
      var generation = doc.chunkMutationGeneration;
      var pending = {
        id: changed ? changed.id : chunkId,
        sourceChunkId: changed ? changed.id : sourceId,
        documentId: doc.id,
        knowledgeBaseId: kb.id,
        fileVersionId: version.id,
        stagedChunkSetId: set.id,
        index: changed ? set.chunks.findIndex(function locate(chunk) { return chunk.id === changed.id; }) + 1 : projection && projection.index,
        characterCount: changed ? text.length : projection && projection.characterCount,
        status: operation === "delete" ? "pending_index" : "pending_embedding",
        deleted: false
      };
      var job = { id: id("JOB"), knowledgeBaseId: kb.id, documentId: doc.id, fileVersionId: version.id, chunkSetId: set.id, stage: operation === "delete" ? "index" : "embedding", generation: generation, status: "running", createdAt: now(), error: null };
      current.processingJobs.unshift(job);
      doc.pendingChunkMutation = { id: id("CHUNK-MUTATION"), chunkSetId: set.id, previousChunkSetId: original.id, operation: operation, generation: generation, jobId: job.id, status: "running", createdAt: now() };
      doc.pendingVectorization = true;
      setStatus(doc, operation === "delete" ? "indexing" : "embedding");
      window.setTimeout(function ready() {
        var liveDoc = find(current.documents, doc.id);
        if (store.getState() !== current || !liveDoc || liveDoc.chunkMutationGeneration !== generation || !liveDoc.pendingChunkMutation || liveDoc.pendingChunkMutation.chunkSetId !== set.id || liveDoc.chunkSetId !== original.id || job.status === "cancelled") {
          job.status = "cancelled"; set.lifecycleStatus = "discarded"; set.obsoleteAt = now(); pending.status = "cancelled"; return;
        }
        mutate("document-chunk-indexed", null, function finish(next) {
          var activeKb = find(next.knowledgeBases, kb.id);
          var activeModel = embeddingModel(next, kb.id);
          if (!activeKb || !activeModel || modelKey(activeModel) !== modelKey(model)) {
            job.status = "failed"; job.error = "知识库或向量模型配置已改变，请重新提交切片更新";
            set.lifecycleStatus = "discarded"; set.obsoleteAt = now(); pending.status = "failed";
            liveDoc.pendingVectorization = false; liveDoc.pendingChunkMutation.status = "failed"; setStatus(liveDoc, liveDoc.searchable ? "ready" : "empty");
            return;
          }
          var previousSetId = liveDoc.chunkSetId;
          projectChunks(next, liveDoc, set, version, activeModel);
          liveDoc.chunkSetId = set.id;
          liveDoc.chunkCount = set.chunks.length;
          liveDoc.parentChunkCount = set.parentChunks.length;
          liveDoc.characterCount = set.chunks.reduce(function sum(n, chunk) { return n + chunk.characterCount; }, 0);
          liveDoc.pendingVectorization = false;
          liveDoc.pendingChunkMutation.status = "completed";
          liveDoc.pendingChunkMutation.completedAt = now();
          job.status = "ready"; job.completedAt = now();
          var projected = changed && next.chunks.find(function match(chunk) { return chunk.documentId === liveDoc.id && chunk.sourceChunkId === changed.id; });
          if (projected) Object.assign(pending, projected, { status: "ready", deleted: false });
          else Object.assign(pending, { status: "ready", deleted: operation === "delete" });
          if (!set.chunks.length) {
            if (liveDoc.searchable) activeKb.documentCounts.searchable = Math.max(0, activeKb.documentCounts.searchable - 1);
            liveDoc.searchable = false; liveDoc.currentStage = "empty"; liveDoc.lifecycleStatus = "empty"; liveDoc.lifecycleStatusLabel = "暂无切片"; setStatus(liveDoc, "empty");
          } else {
            if (!liveDoc.searchable) activeKb.documentCounts.searchable += 1;
            liveDoc.searchable = true; liveDoc.currentStage = "ready"; liveDoc.lifecycleStatus = "effective"; liveDoc.lifecycleStatusLabel = "可检索"; setStatus(liveDoc, "ready");
          }
          switchChunkSetBinding(next, liveDoc, set.id, previousSetId);
          record(next, "chunk_" + operation, liveDoc, "仅更新当前知识库的当前切片与索引，原文件和其他知识库保持不变");
        });
      }, 600);
      return pending;
    }, false);
  }

  function removeDocument(documentId) {
    var state = store.getState(); var doc = find(state.documents, documentId); var fileId = doc && doc.fileId; var knowledgeBaseId = doc && doc.knowledgeBaseId; var setIds = doc ? [doc.chunkSetId, doc.pendingChunkMutation && doc.pendingChunkMutation.chunkSetId].filter(Boolean) : [];
    var recordIds = state.embeddingRecords.filter(function own(row) { return row.documentId === documentId; }).map(function key(row) { return row.id; });
    var result = legacy.deleteDocument(documentId);
    if (result) mutate("knowledge-reference-removed", null, function remove(current) {
      current.importBatches.filter(function related(batch) {
        return batchRetainsSnapshots(batch) && batch.knowledgeBaseId === knowledgeBaseId && batch.items.some(function match(item) {
          return item.existingDocumentId === documentId || item.documentId === documentId || item.fileId === fileId;
        });
      }).forEach(function cancel(batch) { cancelBatchInState(current, batch, "知识库中的文档引用已删除，相关处理任务已取消"); });
      current.embeddingRecords = current.embeddingRecords.filter(function keep(row) { return recordIds.indexOf(row.id) < 0; });
      current.processingJobs.filter(function own(job) { return job.documentId === documentId && job.status === "running"; }).forEach(function cancel(job) { job.status = "cancelled"; });
      setIds.forEach(function discard(setId) { var set = find(current.chunkSets, setId); if (set && set.lifecycleStatus === "staging") { set.status = "cancelled"; } });
      refreshChunkSetLifecycle(current, setIds);
      if (fileId) retireUnreferencedSnapshots(current, fileId);
    });
    return result;
  }
  function removeKnowledgeBase(kbId) {
    var before = store.getState();
    var references = before.documents.filter(function own(doc) { return doc.knowledgeBaseId === kbId; });
    var affectedBatches = before.importBatches.filter(function own(batch) { return batch.knowledgeBaseId === kbId; });
    var batchIds = affectedBatches.map(function key(batch) { return batch.id; });
    var fileIds = Array.from(new Set(references.map(function key(doc) { return doc.fileId; }).concat(affectedBatches.reduce(function collect(ids, batch) { return ids.concat(batch.items.map(function key(item) { return item.fileId; })); }, [])).filter(Boolean)));
    var activeSetIds = references.reduce(function collect(ids, doc) { return ids.concat([doc.chunkSetId, doc.pendingChunkMutation && doc.pendingChunkMutation.chunkSetId].filter(Boolean)); }, []);
    var batchSetIds = affectedBatches.reduce(function collect(ids, batch) { return ids.concat(batch.items.map(function key(item) { return item.chunkSetId; }).filter(Boolean)); }, []);
    var setIds = Array.from(new Set(activeSetIds.concat(batchSetIds)));
    var result = legacy.deleteKnowledgeBase(kbId);
    if (result) mutate("knowledge-assets-retained", null, function remove(state) {
      affectedBatches.filter(batchRetainsSnapshots).forEach(function cancel(batch) { cancelBatchInState(state, batch, "知识库已删除，相关处理任务已取消"); });
      state.embeddingRecords = state.embeddingRecords.filter(function keep(row) { return row.knowledgeBaseId !== kbId; });
      state.processingJobs.filter(function own(job) { return (job.knowledgeBaseId === kbId || batchIds.indexOf(job.batchId) >= 0) && job.status === "running"; }).forEach(function cancel(job) { job.status = "cancelled"; });
      state.parseResults.concat(state.chunkSets).filter(function own(result) { return batchIds.indexOf(result.batchId) >= 0 && result.status === "running"; }).forEach(function cancel(result) { result.status = "cancelled"; });
      setIds.forEach(function discard(setId) { var set = find(state.chunkSets, setId); if (set && set.lifecycleStatus === "staging") set.status = "cancelled"; });
      refreshChunkSetLifecycle(state, setIds);
      fileIds.forEach(function cleanup(fileId) { retireUnreferencedSnapshots(state, fileId); });
    });
    return result;
  }

  OpsDemo.core.processing.ensureEnterpriseResource = ensureEnterpriseResource;
  OpsDemo.core.processing.refreshEnterpriseResources = refreshEnterpriseResources;

  Object.assign(actions, {
    prepareUploadFiles: prepareUploadFiles,
    listEnterpriseSourceObjects: listEnterpriseSourceObjects,
    listFileAssets: function listFileAssets() { return store.getState().fileAssets; },
    listDocumentFolders: function listDocumentFolders() { return store.getState().documentFolders || []; },
    createDocumentFolder: createDocumentFolder,
    renameDocumentFolder: renameDocumentFolder,
    deleteDocumentFolder: deleteDocumentFolder,
    moveLocalDocumentAsset: moveLocalDocumentAsset,
    getFileAssetDetail: getFileAssetDetail,
    getImportPreview: getImportPreview,
    getLocalDocumentImportContext: function context(batchId) { return importContext(batchId, null); },
    getImportContext: function context(batchId) { return importContext(batchId, null); },
    startKnowledgeImport: startKnowledgeImport,
    startImportParsing: startImportParsing,
    requestImportChunkPreview: function preview(batchId, payload) { return configureChunk(batchId, payload, false); },
    completeImportProcessing: function complete(batchId, payload) { return configureChunk(batchId, payload, true); },
    retryImportProcessing: retryImportProcessing,
    cancelImportProcessing: cancelImportProcessing,
    confirmDocumentReplacement: confirmDocumentReplacement,
    deleteKnowledgeBase: removeKnowledgeBase,
    deleteDocument: removeDocument,
    deleteLocalDocumentAsset: deleteLocalDocumentAsset,
    addDocumentChunk: function add(documentId, payload) { return editChunk(documentId, null, payload && payload.content, "add"); },
    updateDocumentChunk: function update(documentId, chunkId, payload) { return editChunk(documentId, chunkId, payload && payload.content, "update"); },
    deleteDocumentChunk: function remove(documentId, chunkId) { return editChunk(documentId, chunkId, "", "delete"); },
    setKnowledgeBaseOnboardingConfig: function configure(targetId, payload) {
      if (payload && payload.batchId) return payload.completed ? configureChunk(payload.batchId, payload, true) : startImportParsing(payload.batchId, payload);
      return legacy.setKnowledgeBaseOnboardingConfig(targetId, payload);
    }
  });
})(window, window.OpsDemo);

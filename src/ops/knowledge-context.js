(function defineKnowledgeContext(window, OpsDemo) {
  "use strict";
  var store = OpsDemo.core.store;
  var actions = OpsDemo.core.actions;
  function find(items, id) { return (items || []).find(function match(item) { return item.id === id; }) || null; }
  function canRead(state, kb) { return Boolean(kb && kb.enabled); }
  function chunkContext(state, chunkId) {
    var chunk = find(state.chunks, chunkId);
    var reference = chunk && find(state.documents, chunk.documentId);
    var kb = reference && find(state.knowledgeBases, reference.knowledgeBaseId);
    return { chunk: chunk, reference: reference, knowledgeBase: kb };
  }
  function retrievalReady(state, ref, chunk) {
    var embedding = chunk && find(state.embeddingRecords, chunk.embeddingRecordId);
    return Boolean(ref && ref.searchable && chunk && (!chunk.status || chunk.status === "ready") && embedding && embedding.status === "ready");
  }
  function validTarget(state, kb, target) {
    var scope = chunkContext(state, target.targetChunkId);
    return Boolean(scope.chunk && scope.reference && scope.knowledgeBase && scope.knowledgeBase.id === kb.id &&
      scope.reference.fileVersionId === target.targetFileVersionId && scope.chunk.fileVersionId === scope.reference.fileVersionId &&
      scope.chunk.chunkSetId === scope.reference.chunkSetId && retrievalReady(state, scope.reference, scope.chunk) && canRead(state, kb, scope.chunk));
  }
  function getRelatedChunkContext(payload) {
    var input = payload || {};
    var state = store.getState();
    var scope = chunkContext(state, input.chunkId);
    var origin = scope.chunk;
    var ref = scope.reference;
    var kb = scope.knowledgeBase;
    var empty = { chunks: [], relations: [], blocked: true, reason: "该切片不在当前知识库版本中。" };
    if (kb && kb.id === input.knowledgeBaseId && !kb.enabled) return Object.assign({}, empty, { reason: "当前知识库已关闭检索，启用后可补取关联内容。" });
    if (kb && !retrievalReady(state, ref, origin)) return Object.assign({}, empty, { reason: "当前切片尚未进入检索范围，请等待向量化与索引完成。" });
    if (!origin || !ref || !kb || kb.id !== input.knowledgeBaseId || !canRead(state, kb, origin) || !retrievalReady(state, ref, origin)) return empty;
    if (input.fileVersionId && ref.fileVersionId !== input.fileVersionId) return empty;
    if (origin.fileVersionId !== ref.fileVersionId || origin.chunkSetId !== ref.chunkSetId) return empty;
    var metadata = origin.metadata || {};
    var limit = Math.min(5, Math.max(1, Number(input.maxChunks) || 3));
    var candidates = (state.chunks || []).filter(function inScope(chunk) {
      return chunk.id !== origin.id && chunk.documentId === ref.id && chunk.knowledgeBaseId === kb.id &&
        chunk.fileVersionId === ref.fileVersionId && chunk.chunkSetId === ref.chunkSetId && canRead(state, kb, chunk) && retrievalReady(state, ref, chunk);
    });
    var picked = [];
    function add(chunk, relation) {
      if (!chunk || picked.length >= limit || picked.some(function same(item) { return item.chunk.id === chunk.id; })) return;
      picked.push({ chunk: chunk, relation: relation });
    }
    (metadata.references || []).forEach(function explicit(target) {
      if (validTarget(state, kb, target)) add(find(state.chunks, target.targetChunkId), "显式关联（原文引用）");
    });
    [metadata.prevChunkId, metadata.nextChunkId].forEach(function neighbor(id, index) {
      if (!id) return;
      add(candidates.find(function match(chunk) { return chunk.id === id || chunk.sourceChunkId === id; }), index ? "下一片" : "上一片");
    });
    if (metadata.sectionPath) candidates.forEach(function section(chunk) {
      if (chunk.metadata && chunk.metadata.sectionPath === metadata.sectionPath) add(chunk, "同章节");
    });
    return { blocked: false, reason: picked.length ? "" : "当前版本没有可补充的相邻或同章节内容。", knowledgeBaseId: kb.id, fileVersionId: ref.fileVersionId, chunkSetId: ref.chunkSetId, origin: origin, chunks: picked.map(function item(value) { return value.chunk; }), relations: picked.map(function item(value) { return { chunkId: value.chunk.id, relation: value.relation }; }) };
  }
  function modelSignature(state, kb) {
    var model = find(state.rag && state.rag.modelCatalog && state.rag.modelCatalog.embeddingModels, kb.boundEmbeddingModelId);
    return [kb.boundEmbeddingModelId, kb.boundVectorDimension, model && model.dimension, model && model.modelId].join("|");
  }
  function contentSignature(state, kbId) {
    return (state.chunks || []).filter(function own(chunk) { return chunk.knowledgeBaseId === kbId; }).map(function signature(chunk) {
      return [chunk.id, chunk.fileVersionId, chunk.chunkSetId, chunk.contentHash, chunk.content].join("|");
    }).sort().join("\n");
  }
  function rebuildKnowledgeIndex(knowledgeBaseId) {
    var state = store.getState();
    var kb = find(state.knowledgeBases, knowledgeBaseId);
    if (!kb || !(state.chunks || []).some(function own(chunk) { return chunk.knowledgeBaseId === kb.id; })) return null;
    if ((state.documents || []).some(function pending(ref) { return ref.knowledgeBaseId === kb.id && (ref.pendingVectorization || ref.status === "embedding" || ref.status === "vectorizing"); })) return null;
    var existing = (state.knowledgeIndexJobs || []).find(function running(job) { return job.knowledgeBaseId === kb.id && job.status === "running"; });
    if (existing) return existing;
    var signature = contentSignature(state, kb.id);
    var model = modelSignature(state, kb);
    var job = { id: OpsDemo.utils.id("INDEX"), knowledgeBaseId: kb.id, status: "running", modelSignature: model, requiresEmbedding: false, previousIndexRevisionId: kb.indexRevisionId || kb.currentKnowledgeVersionId || null, createdAt: new Date().toISOString() };
    store.mutate(function start(next) {
      next.knowledgeIndexJobs = next.knowledgeIndexJobs || [];
      next.knowledgeIndexJobs.push(job);
    }, { type: "index-rebuild-started", silentRender: true, knowledgeBaseId: kb.id });
    window.setTimeout(function complete() {
      if (store.getState() !== state) return;
      var current = find(state.knowledgeBases, knowledgeBaseId);
      if (!current || !find(state.knowledgeIndexJobs, job.id)) return;
      store.mutate(function finish(next) {
        if (contentSignature(next, kb.id) !== signature || modelSignature(next, current) !== model) {
          job.status = "cancelled";
          job.error = "内容或模型配置已更新，请按最新版本重新建立索引。";
          return;
        }
        job.status = "completed";
        job.completedAt = new Date().toISOString();
        current.indexRevisionId = job.id;
        next.indexMaintenance = next.indexMaintenance || [];
        next.indexMaintenance.push({ jobId: job.id, knowledgeBaseId: kb.id, operation: "rebuild_structure", requiresEmbedding: false, createdAt: job.completedAt });
      }, { type: "index-rebuild-completed", silentRender: true, knowledgeBaseId: kb.id });
    }, 650);
    return job;
  }
  actions.getRelatedChunkContext = getRelatedChunkContext;
  actions.rebuildKnowledgeIndex = rebuildKnowledgeIndex;
})(window, window.OpsDemo);

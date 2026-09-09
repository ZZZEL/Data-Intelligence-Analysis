import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load the same core scripts in the same order as the delivered HTML, so a new
// lifecycle module cannot accidentally be omitted by the integration tests.
globalThis.window = globalThis;
const scripts = Array.from(fs.readFileSync(path.join(demoRoot, "index.html"), "utf8")
  .matchAll(/<script\b[^>]*src="([^"]+)"/g), (match) => match[1].split("?")[0]);
for (const script of scripts) {
  if (/^(?:src\/mock\/|src\/core\/(?!router\.js)|src\/ui\/(?:dom|preview|directory-tree)\.js)/.test(script)) {
    require(path.join(demoRoot, script));
  }
}

const { store, actions } = OpsDemo.core;
OpsDemo.ui.overlay = {};
OpsDemo.ui.charts = {};
OpsDemo.core.router = { navigate() {} };
require(path.join(demoRoot, "src/pages/knowledge.js"));
require(path.join(demoRoot, "src/pages/documents.js"));

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function waitFor(read, label, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = read();
    if (value) return value;
    await sleep(15);
  }
  assert.fail(`等待超时：${label}`);
}

const state = store.getState();
for (const method of ["prepareUploadFiles", "startKnowledgeImport", "startImportParsing", "requestImportChunkPreview", "completeImportProcessing", "getImportPreview", "getFileAssetDetail", "retryImportProcessing"]) {
  assert.equal(typeof actions[method], "function", `演示运行时必须加载 ${method}`);
}
for (const key of ["fileAssets", "fileVersions", "parseResults", "chunkSets", "processingJobs"]) {
  assert.ok(Array.isArray(state[key]), `应有独立的 ${key} 状态`);
}

const source = "供应商合同\n\n" + "供应商应在约定交期内交货，采购方按验收结果付款。\n".repeat(24);
const original = new File([source], "生命周期验收合同.txt", { type: "text/plain", lastModified: 1234 });
const renamed = new File([source], "相同内容新名称.txt", { type: "text/plain", lastModified: 5678 });
const changed = new File([source.replace("交货", "履约")], original.name, { type: "text/plain", lastModified: original.lastModified });
const [prepared, preparedRenamed, preparedChanged] = await actions.prepareUploadFiles([original, renamed, changed]);
assert.match(prepared.contentHash, /^(?:sha256:)?[a-f0-9]{64}$/i, "真实上传内容应计算 SHA-256 摘要");
assert.equal(prepared.contentHash, preparedRenamed.contentHash, "同内容改名、改变修改时间后摘要仍相同");
assert.notEqual(prepared.contentHash, preparedChanged.contentHash, "相同名称和修改时间不能掩盖内容变化");
assert.equal(prepared.sourceFile, original, "准备上传不能丢失真实原文件对象");
assert.equal(prepared.sourcePreview, source, "TXT 原文可供独立预览");

const kbCountsBefore = structuredClone(state.knowledgeBases.map((kb) => kb.documentCounts));
const indexesBefore = structuredClone(state.knowledgeVersions);
const local = actions.startKnowledgeImport("local-documents", { files: [prepared], targetFolderId: "FOLDER-SUPPLIER", deferred: true });
assert.ok(local && local.items.length === 1, "全局上传应返回一个可追踪批次");
assert.equal(local.knowledgeBaseId, null, "全局上传不要求知识库");
const localItem = local.items[0];
const fileVersion = state.fileVersions.find((version) => version.id === localItem.fileVersionId);
assert.ok(fileVersion, "上传成功立即登记独立文件版本，不能等完成处理才登记");
const asset = state.fileAssets.find((item) => item.id === fileVersion.fileId);
assert.ok(asset, "文件资产不依赖库内文档实例存在");
assert.equal(asset.folderId, "FOLDER-SUPPLIER", "从目录中上传的文档应直接存入选定文件夹");
assert.equal(actions.getFileAssetDetail(asset.id).version.id, fileVersion.id, "未解析文件也能通过稳定资产路径读取");
assert.ok(actions.getImportPreview(local.id, { fileVersionId: fileVersion.id }), "解析前也能打开预览，而非返回文件不存在");
assert.equal(state.parseResults.some((result) => result.fileVersionId === fileVersion.id && result.status === "ready"), false, "仅上传不能冒充解析成功");
const localParsePage = OpsDemo.pages.localDocuments.render({ name: "local-documents", id: "upload", query: { step: "parse", batch: local.id } }, state);
assert.match(localParsePage, /上传文档进度[\s\S]*<strong>上传<\/strong>[\s\S]*<strong>解析<\/strong>/, "公共池解析应复用通用步骤组件并只展示上传、解析两步");
assert.match(localParsePage, /parse-recognition[\s\S]*parse-table[\s\S]*parse-formula[\s\S]*parse-visual-understanding[\s\S]*data-parse-next/, "公共池第二步应直接复用原第 3 步文档解析内容");
assert.match(localParsePage, /开始解析/, "公共池解析步骤应以开始解析结束两步流程");
assert.doesNotMatch(localParsePage, /data-processing-finish|切片策略|data-import-preview|data-local-upload-progress|文档已解析|正在解析文档/, "公共池解析不得混入第 4 步或旧的专用进度完成页");
const renamedUpload = actions.startKnowledgeImport("local-documents", { files: [preparedRenamed], deferred: true });
assert.equal(renamedUpload.items[0].fileId, asset.id, "不同名称但完全相同的内容默认复用稳定文档，避免重复索引");
assert.equal(renamedUpload.items[0].operation, "skip", "文档管理重复上传应直接跳过后续处理");
assert.equal(renamedUpload.items[0].duplicateReason, "same_content");
assert.equal(renamedUpload.status, "completed", "整批都是重复内容时无需进入解析配置");

const globalPage = OpsDemo.pages.localDocuments.render({ name: "local-documents", id: asset.id, query: {} }, state);
assert.match(globalPage, /生命周期验收合同/, "未解析资产的独立预览页应可见");
assert.doesNotMatch(globalPage, /文件不存在/, "预览可用性不依赖已有切片");
assert.match(globalPage, /data-local-preview-kb-select[^>]*disabled[\s\S]*暂无知识库引用/, "未入库文件也应常驻知识库选择器并显示无引用占位");
assert.doesNotMatch(globalPage, /chunk-preview-card|文档处理结果|data-local-document-join|加入知识库/, "未入库文件不得提供切片预览或主动加入知识库入口");

const observed = [];
const unsubscribe = store.subscribe((current, meta) => {
  const batch = current.importBatches.find((item) => item.id === local.id);
  if (batch) observed.push({ status: batch.status, meta: { ...meta }, pipeline: structuredClone(batch.items[0].pipeline || []) });
});
assert.equal(local.status, "pending_configuration", "登记到公共池后应等待复用的解析步骤提交配置");
assert.equal(actions.completeImportProcessing(local.id, {
  ingestionProfileId: "ING-RECURSIVE",
  processingParameters: { mode: "recursive", maxChars: 200, overlapPercent: 0 },
}), null, "公共池批次不得接受切片配置");
assert.ok(actions.startImportParsing(local.id, { mineruParseConfig: local.mineruParseConfig }), "公共池解析应由第 2 步显式提交");
assert.equal(local.status, "parsing", "提交解析配置后应进入后台解析");
await waitFor(() => local.status === "completed", "公共池解析完成");
unsubscribe();
const detail = actions.getFileAssetDetail(asset.id);
assert.ok(detail.parseResult, "公共池应保存可复用的解析结果");
assert.equal(detail.chunkSet, null, "公共池不得生成或暴露独立切片结果");
assert.equal(asset.currentChunkSetId, undefined, "公共池资产不得保存切片指针");
assert.deepEqual(localItem.pipeline.map((step) => step.key), ["receive", "parse"], "公共池处理管线应在解析后结束");
assert.equal(localItem.sourceFile, null, "批次完成后不应继续重复持有原文件对象");
assert.equal(localItem.sourcePreview, "", "批次完成后不应继续重复持有原文正文");
assert.equal(fileVersion.sourceFile, original, "当前文件快照继续持有可预览、可下载的原文件");
assert.deepEqual(state.knowledgeBases.map((kb) => kb.documentCounts), kbCountsBefore, "全局上传处理不改变现有知识库计数");
assert.deepEqual(state.knowledgeVersions, indexesBefore, "公共池解析不产生知识库索引版本");
assert.ok(observed.some((item) => item.meta.silentRender === true), "后台状态通过局部刷新发布，避免重建正在编辑的表单");
const globalUpdateChoice = actions.startKnowledgeImport("local-documents", { files: [Object.assign({}, preparedChanged, { identityDecision: "update_existing", targetFileId: asset.id })], deferred: true });
assert.equal(globalUpdateChoice.items[0].fileId, asset.id, "文档管理选择更新时应沿用指定的稳定文档身份");
assert.equal(asset.latestVersionId, fileVersion.id, "全局更新候选完成前不得替换当前内容");
assert.ok(actions.cancelImportProcessing(globalUpdateChoice.id));
const globalNewChoice = actions.startKnowledgeImport("local-documents", { files: [Object.assign({}, preparedChanged, { identityDecision: "create_new" })], deferred: true });
assert.notEqual(globalNewChoice.items[0].fileId, asset.id, "文档管理选择作为新文档时应形成独立身份");
const globalNewAssetId = globalNewChoice.items[0].fileId;
assert.ok(actions.cancelImportProcessing(globalNewChoice.id));
assert.ok(actions.deleteLocalDocumentAsset(globalNewAssetId));

console.log("✓ 稳定文档身份、内容摘要、重复跳过与公共池异步解析");

const parseConfig = structuredClone(detail.parseResult.configSnapshot);
const processingConfig = (maxChars = 200) => ({ ingestionProfileId: "ING-RECURSIVE", processingParameters: { mode: "recursive", maxChars, overlapPercent: 0 } });
async function processBatch(batch, maxChars = 200) {
  assert.ok(actions.startImportParsing(batch.id, { mineruParseConfig: parseConfig }));
  assert.ok(actions.completeImportProcessing(batch.id, processingConfig(maxChars)));
  await waitFor(() => batch.status === "completed", `${batch.id} 完成`);
  return batch;
}
function newKnowledgeBase(name, embeddingModelId = "MODEL-EMBEDDING-PRIMARY") {
  const kb = actions.createKnowledgeBase({ name, purpose: "自动验收专用知识库", embeddingModelId });
  assert.ok(kb);
  return kb;
}
function referenceFor(batch) {
  const ref = state.documents.find((item) => item.id === batch.items[0].documentId);
  assert.ok(ref, "知识库批次必须建立可追踪的库内引用");
  return ref;
}

const kbA = newKnowledgeBase("异步验收 A");
const kbB = newKnowledgeBase("异步验收 B", "MODEL-EMBEDDING-MULTILINGUAL");
const kbC = newKnowledgeBase("异步验收 C", "MODEL-EMBEDDING-MULTILINGUAL");
const defaultParseA = structuredClone(kbA.mineruParseConfig);
const assetCountBeforeImport = state.fileAssets.length;
const batchA = actions.startKnowledgeImport(kbA.id, { fileVersionIds: [fileVersion.id], deferred: true });
assert.ok(batchA, "加入知识库应接受已有文件版本，不要求再次选择本地文件");
await processBatch(batchA);
const refA = referenceFor(batchA);
assert.equal(state.fileAssets.length, assetCountBeforeImport, "引用已有文件不制造新原文件资产");
assert.equal(refA.fileVersionId, fileVersion.id);
assert.equal(refA.parseResultId, detail.parseResult.id, "同版本同解析配置应复用已有解析产物");
assert.ok(refA.chunkSetId, "切片集合只应在知识库入库流程中生成");
assert.equal(refA.searchable, true, "库内引用经过索引后才能检索");
assert.deepEqual(kbA.mineruParseConfig, defaultParseA, "本次解析配置不得隐式改变知识库默认配置");
const repeated = actions.startKnowledgeImport(kbA.id, { fileVersionIds: [fileVersion.id] });
assert.equal(repeated.skippedCount, 1, "同库重复添加同版本应跳过，避免重复引用和索引");
assert.equal(state.documents.filter((ref) => ref.knowledgeBaseId === kbA.id && ref.fileVersionId === fileVersion.id).length, 1);
const identityCandidate = actions.startKnowledgeImport(kbA.id, { files: [Object.assign({}, preparedChanged, { identityDecision: "update_existing", targetFileId: asset.id })], deferred: true });
assert.equal(identityCandidate.items[0].operation, "replace", "同名异内容默认进入显式更新确认，不能静默覆盖或绑定");
assert.equal(identityCandidate.items[0].fileId, asset.id, "确认更新沿用稳定 document_id");
assert.equal(actions.startKnowledgeImport(kbB.id, { fileVersionIds: [identityCandidate.items[0].fileVersionId] }), null, "尚未发布的内部候选快照不能被其他知识库导入");
assert.ok(actions.cancelImportProcessing(identityCandidate.id));
const separateIdentity = actions.startKnowledgeImport(kbA.id, { files: [Object.assign({}, preparedChanged, { identityDecision: "create_new" }), Object.assign({}, preparedRenamed, { identityDecision: "reuse_existing", targetFileId: asset.id })], deferred: true });
const separateItem = separateIdentity.items.find((item) => item.operation === "create");
const repeatedItem = separateIdentity.items.find((item) => item.operation === "skip");
assert.ok(separateItem, "用户明确另存为新文档时，同名文件应建立独立身份");
assert.notEqual(separateItem.fileId, asset.id, "文件名不是 document_id 的唯一键");
assert.ok(repeatedItem && repeatedItem.fileId === asset.id, "逐候选身份选择不能让同批次的精确重复文件也另存一份");
const separateAssetId = separateItem.fileId;
assert.ok(actions.cancelImportProcessing(separateIdentity.id));
assert.ok(actions.deleteLocalDocumentAsset(separateAssetId));

const batchB = actions.startKnowledgeImport(kbB.id, { fileVersionIds: [fileVersion.id], deferred: true });
await processBatch(batchB, 400);
const refB = referenceFor(batchB);
assert.equal(refB.fileId, refA.fileId, "不同知识库继续引用同一独立文件身份");
assert.equal(refB.parseResultId, refA.parseResultId, "仅切块策略不同仍可复用解析结果");
assert.notEqual(refB.chunkSetId, refA.chunkSetId, "不同切块策略应生成独立切片集合");
const chunksA = state.chunks.filter((chunk) => chunk.documentId === refA.id);
const chunksB = state.chunks.filter((chunk) => chunk.documentId === refB.id);
assert.ok(chunksA.length > chunksB.length, "200 字与 400 字上限应影响实际切块结果");
assert.equal(new Set([...chunksA, ...chunksB].map((chunk) => chunk.id)).size, chunksA.length + chunksB.length, "各库检索投影应有独立身份");
assert.equal(batchA.embeddingModelIdSnapshot, kbA.boundEmbeddingModelId);
assert.equal(batchB.embeddingModelIdSnapshot, kbB.boundEmbeddingModelId);
assert.notEqual(batchA.embeddingModelIdSnapshot, batchB.embeddingModelIdSnapshot, "不同库向量空间不得混用");

const batchC = actions.startKnowledgeImport(kbC.id, { fileVersionIds: [fileVersion.id], deferred: true });
await processBatch(batchC);
const refC = referenceFor(batchC);
assert.equal(refC.chunkSetId, refA.chunkSetId, "模型不同不必重做完全相同的切片");
assert.equal(batchC.embeddingModelIdSnapshot, kbC.boundEmbeddingModelId, "复用切片后仍按当前知识库模型向量化");
const sharedCurrentSet = state.chunkSets.find((set) => set.id === refA.chunkSetId);
assert.equal(sharedCurrentSet.lifecycleStatus, "active");
assert.deepEqual(new Set(sharedCurrentSet.activeReferenceIds), new Set([refA.id, refC.id]), "底层切片可复用，但每个知识库引用各自只有一个当前指针");
assert.equal(actions.getFileAssetDetail(asset.id).references.length, 3, "文件详情应列出每个知识库引用");
assert.equal(actions.deleteLocalDocumentAsset(asset.id), null, "仍被引用的资产应阻止直接删除，不跨库级联");

console.log("✓ 已有文件入库、解析与切片复用、不同切块策略及模型空间隔离");

assert.ok(actions.setKnowledgeBaseEnabled(kbC.id, true));
const origin = state.chunks.find((chunk) => chunk.documentId === refC.id);
const attachmentBatch = actions.startKnowledgeImport(kbC.id, { files: await actions.prepareUploadFiles([new File(["附件一：验收地点为上海仓库，验收后确认付款。"], "合同附件.txt", { type: "text/plain" })]) });
await processBatch(attachmentBatch);
const attachmentRef = referenceFor(attachmentBatch);
const attachment = state.chunks.find((chunk) => chunk.documentId === attachmentRef.id);
const attachmentAsset = state.fileAssets.find((item) => item.id === attachmentRef.fileId);
assert.equal(attachmentAsset.currentChunkSetId, undefined, "仅在知识库内处理的文件不应伪造文档中心处理结果");
assert.equal(actions.getFileAssetDetail(attachmentAsset.id).chunkSet, null, "文档处理结果不得回退到任意知识库切片集合");
assert.equal(actions.getFileAssetDetail(attachmentAsset.id).processingState, "parsed", "知识库内上传应同步登记公共池，并回写原文件已解析状态");
assert.equal(actions.getFileAssetDetail(attachmentAsset.id, { knowledgeBaseId: kbC.id }).chunkSet.id, attachmentRef.chunkSetId, "指定知识库后应读取该库自己的当前切片集合");
assert.ok(state.embeddingRecords.length > 0 && origin.embeddingRecordId, "可检索切片应关联可验证的 Mock 编码记录");
const related = { knowledgeBaseId: kbC.id, chunkId: origin.id, fileVersionId: refC.fileVersionId };
const neighborResult = actions.getRelatedChunkContext(related);
assert.equal(neighborResult.blocked, false);
assert.ok(neighborResult.chunks.length > 0, "能够按真实邻接或章节关系补充上下文");
assert.equal(neighborResult.chunks.some((chunk) => chunk.id === attachment.id), false, "系统上下文规则不得自动混入无引用关系的其他文件");
assert.equal(typeof actions.listRelatedChunkTargets, "undefined", "运营端不得获得人工关联候选列表");
assert.equal(typeof actions.updateChunkRelations, "undefined", "运营端不得获得人工保存切片关联的动作");
assert.equal(actions.getRelatedChunkContext({ ...related, knowledgeBaseId: kbB.id }).blocked, true, "不能用其他库 ID 访问原始切片");
assert.equal(actions.getRelatedChunkContext({ ...related, fileVersionId: "过期版本" }).blocked, true, "原文版本不一致时阻止关系补取");

assert.equal(Object.prototype.hasOwnProperty.call(state.meta, "accessLevels"), false, "状态不应保留权限等级目录");
assert.equal(Object.prototype.hasOwnProperty.call(state.meta.currentUser, "accessLevel"), false, "当前账号不应携带权限等级");
assert.ok(state.knowledgeBases.every((item) => !Object.prototype.hasOwnProperty.call(item, "minAccessLevel")), "知识库不应携带最低访问等级");
assert.ok(state.documents.every((item) => !Object.prototype.hasOwnProperty.call(item, "upstreamAccessLevel") && !Object.prototype.hasOwnProperty.call(item, "effectiveAccessLevel")), "文档不应携带访问等级");
const currentVersion = refC.fileVersionId;
refC.fileVersionId = "已切换的新版本";
assert.equal(actions.getRelatedChunkContext(related).blocked, true, "文件换版后不得继续补取旧切片上下文");
refC.fileVersionId = currentVersion;
assert.ok(actions.getRelatedChunkContext({ ...related, maxChunks: 99 }).chunks.length <= 5, "上下文扩展有数量上限");

const encodingsBeforeRebuild = structuredClone(state.embeddingRecords);
const rebuild = actions.rebuildKnowledgeIndex(kbC.id);
assert.ok(rebuild && rebuild.status === "running");
await waitFor(() => rebuild.status === "completed", "索引结构独立重建");
assert.deepEqual(state.embeddingRecords, encodingsBeforeRebuild, "索引结构重建不重复计算兼容向量");
const staleRebuild = actions.rebuildKnowledgeIndex(kbC.id);
const boundModel = kbC.boundEmbeddingModelId;
kbC.boundEmbeddingModelId = kbA.boundEmbeddingModelId;
await waitFor(() => staleRebuild.status === "cancelled", "模型改变后取消旧索引构建");
kbC.boundEmbeddingModelId = boundModel;
assert.deepEqual(state.embeddingRecords, encodingsBeforeRebuild, "取消旧构建不应影响原有编码记录");
const immutableModelId = kbC.boundEmbeddingModelId;
const immutableDimension = kbC.boundVectorDimension;
assert.equal(typeof actions.changeKnowledgeBaseEmbeddingModel, "undefined", "运营动作层不应提供知识库向量模型切换能力");
assert.equal(actions.updateKnowledgeBase(kbC.id, {
  name: kbC.name,
  purpose: kbC.purpose,
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
}), null, "知识库编辑动作必须拒绝向量模型字段");
assert.equal(kbC.boundEmbeddingModelId, immutableModelId, "创建时绑定的向量模型不可通过编辑变更");
assert.equal(kbC.boundVectorDimension, immutableDimension, "向量维度应与创建时模型契约保持一致");
assert.ok(actions.setKnowledgeBaseEnabled(kbC.id, false));

console.log("✓ 系统上下文关联、版本约束、索引重建与向量模型不可变");

const bCurrentBeforeRechunk = refB.chunkSetId;
const rechunkB = actions.startKnowledgeImport(kbB.id, { fileVersionIds: [fileVersion.id], reprocess: true, deferred: true });
assert.ok(rechunkB && rechunkB.items[0].operation === "reprocess", "同库重新处理应创建后台候选任务，而不是第二个业务引用");
actions.startImportParsing(rechunkB.id, { mineruParseConfig: parseConfig });
actions.completeImportProcessing(rechunkB.id, processingConfig(300));
assert.equal(refB.chunkSetId, bCurrentBeforeRechunk, "重切开始后继续使用原当前切片");
await waitFor(() => ["embedding", "indexing"].includes(rechunkB.status), "候选切片完成并进入向量或索引阶段");
const stagedB = state.chunkSets.find((set) => set.id === rechunkB.items[0].chunkSetId);
assert.ok(stagedB && stagedB.lifecycleStatus === "staging", "候选切片只作为后台暂存产物存在");
assert.equal(refB.chunkSetId, bCurrentBeforeRechunk, "候选产物未完成索引前不能替换当前指针");
await waitFor(() => rechunkB.status === "completed", "同库重切原子发布");
assert.equal(refB.chunkSetId, stagedB.id, "完成后原子切换为新切片结果");
assert.equal(stagedB.lifecycleStatus, "active");
assert.equal(state.chunkSets.find((set) => set.id === bCurrentBeforeRechunk).lifecycleStatus, "obsolete", "无人继续引用的旧切片转为内部待回收产物");
assert.equal(state.documents.filter((ref) => ref.knowledgeBaseId === kbB.id && ref.fileId === fileVersion.fileId).length, 1, "同一知识库与文件只能有一个业务引用和当前切片");
const failedRechunkB = actions.startKnowledgeImport(kbB.id, { fileVersionIds: [fileVersion.id], reprocess: true, simulateFailureStage: "index" });
actions.startImportParsing(failedRechunkB.id, { mineruParseConfig: parseConfig });
actions.completeImportProcessing(failedRechunkB.id, processingConfig(350));
await waitFor(() => failedRechunkB.status === "failed", "同库候选索引失败");
const failedCandidateB = state.chunkSets.find((set) => set.id === failedRechunkB.items[0].chunkSetId);
assert.equal(refB.chunkSetId, stagedB.id, "候选处理失败不得切换当前切片");
assert.equal(failedCandidateB.lifecycleStatus, "staging", "可重试的失败候选仍是后台暂存，不是第二套当前切片");
assert.ok(actions.cancelImportProcessing(failedRechunkB.id));
assert.equal(failedCandidateB.lifecycleStatus, "obsolete", "放弃失败候选后将其标记为待回收");

const bBeforeEdit = structuredClone(state.chunks.filter((chunk) => chunk.documentId === refB.id));
const cBeforeEdit = structuredClone(state.chunks.filter((chunk) => chunk.documentId === refC.id));
const sharedSetBefore = JSON.stringify(state.chunkSets.find((set) => set.id === refA.chunkSetId));
const originalSetId = refA.chunkSetId;
assert.ok(actions.setKnowledgeBaseEnabled(kbA.id, true));
const manual = actions.addDocumentChunk(refA.id, { content: "仅适用于 A 的人工补充条款：货到三日内验收。" });
assert.ok(manual && manual.knowledgeBaseId === kbA.id);
assert.equal(actions.getRelatedChunkContext({ knowledgeBaseId: kbA.id, chunkId: manual.id }).blocked, true, "待索引的新切片不能作为关系检索起点");
const existingReadyChunk = state.chunks.find((chunk) => chunk.documentId === refA.id && chunk.status === "ready");
assert.equal(actions.getRelatedChunkContext({ knowledgeBaseId: kbA.id, chunkId: existingReadyChunk.id, maxChunks: 5 }).chunks.some((chunk) => chunk.id === manual.id), false, "关系扩展不能提前返回尚未索引的切片");
assert.equal(refA.searchable, true, "新增切片不能撤下当前库已可检索的旧内容");
assert.equal(refA.chunkSetId, originalSetId, "候选切片未完成向量和索引前不得替换当前切片");
assert.equal(state.chunkSets.find((set) => set.id === manual.stagedChunkSetId).lifecycleStatus, "staging");
assert.equal(JSON.stringify(state.chunkSets.find((set) => set.id === originalSetId)), sharedSetBefore, "共享原切片集合不能被原地覆盖");
assert.deepEqual(state.chunks.filter((chunk) => chunk.documentId === refB.id), bBeforeEdit);
assert.deepEqual(state.chunks.filter((chunk) => chunk.documentId === refC.id), cBeforeEdit, "共享切片的其他知识库必须保持不变");
await waitFor(() => manual.status === "ready", "人工切片增量向量化与索引完成");
assert.equal(manual.manualOperation, "add", "人工新增切片应保留新增来源，供各预览入口展示一致标签");
assert.equal(refA.chunkSetId, manual.stagedChunkSetId, "人工新增完成后原子切换当前切片");
assert.equal(state.chunkSets.find((set) => set.id === manual.stagedChunkSetId).lifecycleStatus, "active");
assert.equal(state.chunkSets.find((set) => set.id === originalSetId).lifecycleStatus, "active", "其他知识库或文档管理仍在引用时，旧底层产物继续有效");
const setBeforeQueuedAppend = refA.chunkSetId;
const projectionsBeforeQueuedAppend = state.chunks.filter((chunk) => chunk.documentId === refA.id).sort((left, right) => left.index - right.index);
const embeddingBeforeQueuedAppend = new Map(projectionsBeforeQueuedAppend.map((chunk) => [chunk.id, chunk.embeddingRecordId]));
const firstProjectionBeforeAppend = projectionsBeforeQueuedAppend[0];
const tailProjectionBeforeAppend = projectionsBeforeQueuedAppend.at(-1);
const appended = actions.addDocumentChunk(refA.id, { content: "追加到当前文档队尾的人工说明。", position: "before", relativeChunkId: firstProjectionBeforeAppend.id });
assert.ok(appended, "新增切片应仅校验内容并进入候选切片集");
assert.equal(appended.index, projectionsBeforeQueuedAppend.length + 1, "新增切片应直接返回队尾序号");
assert.equal(refA.chunkSetId, setBeforeQueuedAppend, "队尾候选切片未完成索引前不得替换当前结果");
const appendedCandidate = state.chunkSets.find((set) => set.id === appended.stagedChunkSetId);
assert.equal(appendedCandidate.chunks.at(-1).id, appended.sourceChunkId, "即使调用方传入历史位置字段，新切片也必须固定追加到队尾");
assert.equal(appendedCandidate.chunks[0].id, firstProjectionBeforeAppend.sourceChunkId, "历史位置字段不得重排现有切片");
assert.equal(appendedCandidate.chunks.at(-1).metadata.prevChunkId, tailProjectionBeforeAppend.sourceChunkId, "队尾新切片应自动关联原末片");
assert.equal(Object.prototype.hasOwnProperty.call(refA.pendingChunkMutation, "insertionPosition"), false, "切片变更记录不应继续保留插入位置");
assert.equal(Object.prototype.hasOwnProperty.call(refA.pendingChunkMutation, "relativeChunkId"), false, "切片变更记录不应继续保留参照切片");
await waitFor(() => appended.status === "ready", "队尾新增切片完成");
const orderedAfterPublish = state.chunks.filter((chunk) => chunk.documentId === refA.id).sort((left, right) => left.index - right.index);
assert.equal(orderedAfterPublish.at(-1).id, appended.id, "原子发布后新切片应保持在文档末尾");
assert.deepEqual(orderedAfterPublish.map((chunk) => chunk.index), orderedAfterPublish.map((_, index) => index + 1), "队尾追加后所有切片序号应连续");
projectionsBeforeQueuedAppend.forEach((chunk) => {
  const currentProjection = state.chunks.find((item) => item.id === chunk.id);
  assert.equal(currentProjection.embeddingRecordId, embeddingBeforeQueuedAppend.get(chunk.id), "队尾追加时既有切片应复用原向量记录");
});
const appendedIndexUpdate = state.indexUpdates.find((update) => update.documentId === refA.id && update.addedChunkIds.includes(appended.id));
assert.ok(appendedIndexUpdate && appendedIndexUpdate.updatedChunkIds.includes(tailProjectionBeforeAppend.id), "索引更新应记录队尾新片与原末片关系变化");
const setBeforeManualUpdate = refA.chunkSetId;
const updatedManual = actions.updateDocumentChunk(refA.id, manual.id, { content: "仅适用于 A 的人工补充条款：货到五日内验收。" });
assert.ok(updatedManual);
assert.equal(refA.chunkSetId, setBeforeManualUpdate, "编辑中的候选切片不提前替换当前结果");
await waitFor(() => updatedManual.status === "ready", "修改单个切片完成");
assert.equal(updatedManual.manualOperation, "edit", "编辑后的切片应与人工新增切片使用不同来源标签");
assert.equal(state.chunkSets.find((set) => set.id === setBeforeManualUpdate).lifecycleStatus, "obsolete", "编辑完成后上一套库内切片转为待回收");
const setBeforeManualDelete = refA.chunkSetId;
const deletedManual = actions.deleteDocumentChunk(refA.id, updatedManual.id);
assert.ok(deletedManual, "单个切片可独立从本库检索结果移除");
assert.equal(refA.chunkSetId, setBeforeManualDelete, "索引删除完成前保持旧切片可检索");
assert.equal(state.chunks.some((chunk) => chunk.id === updatedManual.id), true);
await waitFor(() => deletedManual.deleted === true, "单片删除索引原子提交");
assert.equal(state.chunks.some((chunk) => chunk.id === updatedManual.id), false);
assert.deepEqual(state.chunks.filter((chunk) => chunk.documentId === refC.id), cBeforeEdit, "增删改均不能使其他库重新索引或改变切片");

const aSetBeforeReplacement = refA.chunkSetId;
const replacement = actions.startKnowledgeImport(kbA.id, { files: [preparedChanged], deferred: true });
assert.ok(replacement);
assert.equal(refA.fileVersionId, fileVersion.id, "创建替换候选不能立即覆盖当前库的旧版本");
assert.equal(refA.sourceFile, original, "替换处理前预览和下载仍对应旧版本");
assert.equal(asset.latestVersionId, fileVersion.id, "候选内容处理完成前不能提前替换文档中心的当前原文件");
assert.ok(actions.confirmDocumentReplacement(replacement.id, replacement.items[0].id), "同名异内容应有显式替换确认");
await processBatch(replacement);
assert.notEqual(refA.fileVersionId, fileVersion.id, "新结果就绪后当前库切换到新文件版本");
const newVersion = state.fileVersions.find((version) => version.id === refA.fileVersionId);
assert.equal(newVersion.fileId, asset.id, "替换产生同一文件身份下的版本");
assert.equal(refA.sourceFile, changed, "原文件对象必须随新版本一致更新");
assert.equal(refA.sourcePreview, preparedChanged.sourcePreview, "原文件预览文本必须随新版本一致更新");
assert.equal(refA.contentHash, preparedChanged.contentHash);
assert.equal(state.parseResults.find((result) => result.id === refA.parseResultId).fileVersionId, newVersion.id, "解析产物必须追踪新版本");
assert.equal(state.chunkSets.find((set) => set.id === aSetBeforeReplacement).lifecycleStatus, "obsolete", "文件换版完成后，当前库上一套切片转为待回收");
assert.equal(state.chunkSets.find((set) => set.id === refA.chunkSetId).lifecycleStatus, "active", "新文件版本只有一套当前生效切片");
assert.equal(asset.latestVersionId, newVersion.id, "新结果发布后文档中心切换到当前内容");
await waitFor(() => refB.fileVersionId === newVersion.id && refC.fileVersionId === newVersion.id, "引用同一文档的知识库同步当前内容");
assert.equal(refB.sourceFile, changed, "知识库引用稳定 document_id，并在后台同步到当前原文件");
assert.equal(actions.getFileAssetDetail(asset.id, { knowledgeBaseId: kbB.id }).version.id, newVersion.id, "从 B 预览应读取同步后的当前内容");
assert.equal(fileVersion.lifecycleStatus, "retired", "所有引用完成切换后旧内部快照转为已回收状态");
assert.equal(fileVersion.sourceFile, null, "旧内部快照不长期保留原文件字节");
assert.equal(fileVersion.sourcePreview, "", "旧内部快照只保留 hash 与审计元数据，不长期保留全文");
assert.ok(state.parseResults.filter((result) => result.fileVersionId === fileVersion.id).every((result) => result.status === "running" || result.content === ""), "旧版本不再被任何引用和任务使用后清理解析正文");
assert.ok(state.chunkSets.filter((set) => set.fileVersionId === fileVersion.id).every((set) => set.status === "running" || set.chunks.length === 0), "旧版本不再被任何引用和任务使用后清理切片正文");
assert.ok(state.importBatches.flatMap((batch) => batch.items).filter((item) => item.fileVersionId === fileVersion.id).every((item) => item.sourceFile === null && item.sourcePreview === ""), "已完成批次不得成为旧原文的长期副本");
assert.equal(actions.startKnowledgeImport(kbB.id, { fileVersionIds: [fileVersion.id] }), null, "已回收或非当前内部快照不得重新导入");

const olderRace = actions.startKnowledgeImport(kbA.id, { files: [{ name: newVersion.name, type: "text/plain", size: 64, contentHash: "sha256:race-older", sourcePreview: "旧候选内容：不得覆盖更新请求。" }], deferred: true });
assert.ok(actions.confirmDocumentReplacement(olderRace.id, olderRace.items[0].id));
actions.startImportParsing(olderRace.id, { mineruParseConfig: parseConfig });
actions.completeImportProcessing(olderRace.id, processingConfig(250));
await sleep(600);
const newestRace = actions.startKnowledgeImport(kbB.id, { files: [{ name: newVersion.name, type: "text/plain", size: 72, contentHash: "sha256:race-newest", sourcePreview: "最新候选内容：所有知识库最终应同步到这里。" }], deferred: true });
assert.ok(actions.confirmDocumentReplacement(newestRace.id, newestRace.items[0].id));
actions.startImportParsing(newestRace.id, { mineruParseConfig: parseConfig });
actions.completeImportProcessing(newestRace.id, processingConfig(400));
const olderRaceVersion = state.fileVersions.find((version) => version.id === olderRace.items[0].fileVersionId);
const newestRaceVersion = state.fileVersions.find((version) => version.id === newestRace.items[0].fileVersionId);
await waitFor(() => olderRace.status === "cancelled", "旧内容候选在发布前被更新意图淘汰");
assert.notEqual(asset.latestVersionId, olderRaceVersion.id, "较旧候选不得按完成顺序覆盖文档中心当前内容");
assert.notEqual(newestRaceVersion.lifecycleStatus, "retired", "旧候选取消时不得提前回收仍在处理的新候选");
assert.match(newestRaceVersion.sourcePreview, /最新候选内容/, "新候选处理期间必须保留解析输入");
await waitFor(() => newestRace.status === "completed", "最新内容候选原子发布");
assert.equal(asset.latestVersionId, newestRaceVersion.id);
await waitFor(() => refC.sourceSyncStatus === "running" && refC.sourceSyncBatchId, "C 的后台引用同步开始");
const deletedSyncBatchId = refC.sourceSyncBatchId;
assert.ok(actions.deleteDocument(refC.id), "后台同步期间可以删除单个知识库引用");
await waitFor(() => state.importBatches.find((batch) => batch.id === deletedSyncBatchId)?.status === "cancelled", "删除引用会取消其后台同步批次");
await waitFor(() => refA.fileVersionId === newestRaceVersion.id, "未删除的知识库引用同步到最新内容");
await sleep(900);
assert.equal(state.documents.some((reference) => reference.id === refC.id), false, "已删除引用不能被延迟回调重新创建");
assert.equal(state.documents.some((reference) => reference.knowledgeBaseId === kbC.id && reference.fileId === asset.id), false, "删除后的同库同文件引用不能复活");
const newestSyncBatches = state.importBatches.filter((batch) => batch.autoSync && batch.syncTargetVersionId === newestRaceVersion.id);
assert.equal(new Set(newestSyncBatches.map((batch) => batch.syncDocumentId)).size, newestSyncBatches.length, "同一 document_id 与目标内容只能有一个后台同步批次");

const bBeforeIntentRace = refB.chunkSetId;
const staleReprocess = actions.startKnowledgeImport(kbB.id, { fileVersionIds: [newestRaceVersion.id], reprocess: true, deferred: true });
actions.startImportParsing(staleReprocess.id, { mineruParseConfig: parseConfig });
actions.completeImportProcessing(staleReprocess.id, processingConfig(275));
const latestReprocess = actions.startKnowledgeImport(kbB.id, { fileVersionIds: [newestRaceVersion.id], reprocess: true, deferred: true });
actions.startImportParsing(latestReprocess.id, { mineruParseConfig: parseConfig });
actions.completeImportProcessing(latestReprocess.id, processingConfig(450));
assert.equal(staleReprocess.status, "cancelled", "同文件同知识库的新处理意图应立即使旧任务失效");
assert.equal(refB.chunkSetId, bBeforeIntentRace, "新候选完成前继续使用原当前切片");
await waitFor(() => latestReprocess.status === "completed", "同版本最新切块意图发布");
assert.equal(refB.chunkSetId, latestReprocess.items[0].chunkSetId, "同知识库只发布最后一次切块配置");
assert.equal(state.documents.filter((reference) => reference.knowledgeBaseId === kbB.id && reference.fileId === asset.id).length, 1, "同知识库同文件仍只有一个当前引用");
const bAfterSourceSync = structuredClone(state.chunks.filter((chunk) => chunk.documentId === refB.id));

assert.ok(actions.setKnowledgeBaseEnabled(kbA.id, false));
assert.ok(actions.deleteKnowledgeBase(kbA.id));
assert.equal(state.documents.some((item) => item.knowledgeBaseId === kbA.id), false);
assert.equal(state.chunks.some((item) => item.knowledgeBaseId === kbA.id), false);
assert.equal(state.knowledgeVersions.some((item) => item.knowledgeBaseId === kbA.id), false);
assert.ok(state.fileAssets.some((item) => item.id === asset.id), "删除知识库必须保留独立原文件");
assert.deepEqual(state.chunks.filter((chunk) => chunk.documentId === refB.id), bAfterSourceSync, "删除 A 不影响 B 同步后的切片与引用");
assert.ok(actions.deleteKnowledgeBase(kbB.id));
assert.ok(actions.deleteKnowledgeBase(kbC.id));
assert.ok(state.fileAssets.some((item) => item.id === asset.id), "删除最后一个知识库引用后仍保留原文件");
assert.equal(actions.getFileAssetDetail(asset.id).references.length, 0);
assert.ok(actions.deleteLocalDocumentAsset(asset.id), "无引用资产可以通过单独操作删除");

console.log("✓ 共享切片写入隔离、单片增量、当前内容同步与删除范围");

const failureKb = newKnowledgeBase("失败与重试验收");
for (const stage of ["parse", "chunk", "embedding", "index"]) {
  const files = await actions.prepareUploadFiles([new File([`失败重试-${stage}\n` + source], `失败重试-${stage}.txt`, { type: "text/plain" })]);
  const batch = actions.startKnowledgeImport(failureKb.id, { files, simulateFailureStage: stage });
  actions.startImportParsing(batch.id, { mineruParseConfig: parseConfig });
  actions.completeImportProcessing(batch.id, processingConfig());
  await waitFor(() => batch.status === "failed", `${stage} 失败回执`);
  const item = batch.items[0];
  const preview = actions.getImportPreview(batch.id);
  assert.ok(preview, `${stage} 失败时仍可打开原文件与已有处理结果`);
  assert.ok(item.error || preview.error || batch.error, `${stage} 失败应提供可识别原因`);
  assert.equal(state.documents.find((ref) => ref.id === batch.items[0].documentId)?.searchable || false, false, `${stage} 首次失败不能被标为可检索`);
  const parseId = item.parseResultId;
  const chunkSetId = item.chunkSetId;
  assert.ok(actions.retryImportProcessing(batch.id), `${stage} 失败可重试`);
  await waitFor(() => batch.status === "completed", `${stage} 重试完成`);
  assert.equal(referenceFor(batch).searchable, true);
  if (stage === "embedding" || stage === "index") {
    assert.equal(item.parseResultId, parseId, "向量/索引重试不应重复解析");
    assert.equal(item.chunkSetId, chunkSetId, "向量/索引重试不应重复切块");
  }
}

const previewFiles = await actions.prepareUploadFiles([new File(["只预览，不发布。\n" + source], "预览分支.txt", { type: "text/plain" })]);
const previewBatch = actions.startKnowledgeImport(failureKb.id, { files: previewFiles });
actions.startImportParsing(previewBatch.id, { mineruParseConfig: parseConfig });
assert.ok(actions.requestImportChunkPreview(previewBatch.id, processingConfig()));
await waitFor(() => previewBatch.status === "preview_ready", "独立切块预览准备完成");
assert.equal(state.documents.find((ref) => ref.id === previewBatch.items[0].documentId)?.searchable || false, false, "生成预览不能代替最终向量化和索引提交");
assert.ok(actions.getImportPreview(previewBatch.id).chunks.length > 0);
assert.ok(actions.completeImportProcessing(previewBatch.id, processingConfig()));
await waitFor(() => previewBatch.status === "completed", "预览之后正式提交处理");

const draftFiles = await actions.prepareUploadFiles([new File(["取消和新配置\n" + source], "取消配置.txt", { type: "text/plain" })]);
const cancelled = actions.startKnowledgeImport("local-documents", { files: draftFiles });
actions.startImportParsing(cancelled.id, { mineruParseConfig: parseConfig });
assert.ok(actions.cancelImportProcessing(cancelled.id), "取消应停止该批次后续任务");
assert.equal(cancelled.status, "cancelled");
const cancelledVersion = state.fileVersions.find((version) => version.id === cancelled.items[0].fileVersionId);
assert.ok(cancelledVersion && state.fileAssets.some((item) => item.id === cancelledVersion.fileId), "取消处理不能撤销已上传原文件");

const removedDuringProcessingKb = newKnowledgeBase("处理中删除验收");
const removedDuringProcessing = actions.startKnowledgeImport(removedDuringProcessingKb.id, { files: await actions.prepareUploadFiles([new File(["删除库后保留文件。"], "处理中删除.txt", { type: "text/plain" })]) });
const retainedVersionId = removedDuringProcessing.items[0].fileVersionId;
actions.startImportParsing(removedDuringProcessing.id, { mineruParseConfig: parseConfig });
actions.completeImportProcessing(removedDuringProcessing.id, processingConfig());
assert.ok(actions.deleteKnowledgeBase(removedDuringProcessingKb.id));
assert.equal(removedDuringProcessing.status, "cancelled", "删除知识库应使已移出列表的处理批次本身失效");
assert.ok(state.processingJobs.filter((job) => job.batchId === removedDuringProcessing.id).every((job) => job.status !== "running"), "删除知识库后相关 batch job 均应终止");

const generationBatch = actions.startKnowledgeImport("local-documents", { files: await actions.prepareUploadFiles([new File(["新旧配置隔离\n" + source], "generation.txt", { type: "text/plain" })]) });
actions.startImportParsing(generationBatch.id, { mineruParseConfig: { parseMethod: "auto", imageAnalysisEnabled: false } });
const oldGeneration = generationBatch.generation;
const latestGenerationParseConfig = { ...parseConfig, parseMethod: "txt" };
actions.startImportParsing(generationBatch.id, { mineruParseConfig: latestGenerationParseConfig });
assert.ok(generationBatch.generation > oldGeneration, "修改解析配置必须建立新 generation");
await waitFor(() => generationBatch.status === "completed", "新配置生效且旧任务不得覆盖");
const generationPreview = actions.getImportPreview(generationBatch.id);
assert.equal(generationPreview.parseResult.configSnapshot.parseMethod, latestGenerationParseConfig.parseMethod, "完成结果必须来自最新解析配置");
assert.equal(cancelled.status, "cancelled", "其他批次完成期间，已取消批次不能被旧 timer 重新激活");
assert.equal(state.documents.some((ref) => ref.knowledgeBaseId === removedDuringProcessingKb.id), false, "已删除库的旧后台任务不能重新创建引用");
assert.equal(state.chunks.some((chunk) => chunk.knowledgeBaseId === removedDuringProcessingKb.id), false, "已删除库的旧任务不能重新发布切片");
assert.ok(state.fileVersions.some((version) => version.id === retainedVersionId), "处理中删除知识库仍保留已上传文件版本");

const untouchedDefaults = structuredClone(referenceFor(previewBatch));
assert.ok(actions.setKnowledgeBaseOnboardingConfig(failureKb.id, { mineruParseConfig: { parseMethod: "ocr", imageAnalysisEnabled: true } }));
assert.deepEqual(referenceFor(previewBatch), untouchedDefaults, "修改后续导入默认策略不能重写已经使用的文档结果");
const removedReference = referenceFor(previewBatch);
const removedReferenceFileId = removedReference.fileId;
const resurrectionBatch = actions.startKnowledgeImport(failureKb.id, { fileVersionIds: [removedReference.fileVersionId], reprocess: true, deferred: true });
actions.startImportParsing(resurrectionBatch.id, { mineruParseConfig: parseConfig });
actions.completeImportProcessing(resurrectionBatch.id, processingConfig(375));
assert.ok(actions.deleteDocument(removedReference.id));
assert.equal(resurrectionBatch.status, "cancelled", "删除引用必须同步取消其手工重处理批次");
await sleep(500);
assert.equal(state.documents.some((reference) => reference.knowledgeBaseId === failureKb.id && reference.fileId === removedReferenceFileId), false, "手工处理的延迟回调不能复活已删除引用");
assert.ok(state.processingJobs.filter((job) => job.batchId === resurrectionBatch.id).every((job) => job.status !== "running"), "删除引用后相关 batch job 均应终止");

const sources = actions.listEnterpriseSourceObjects();
assert.ok(sources.length > 0, "企业数据选择器应提供可追踪的演示快照对象");
assert.ok(sources.every((source) => source.directoryId === `ENT-DIR-${source.connectionId}` && source.directoryPath.includes("/") && source.fileName.endsWith(".csv")), "企业快照应在连接下使用独立业务文件目录");
const enterpriseBatch = actions.startKnowledgeImport(failureKb.id, { sourceObjects: [sources[0].id] });
assert.ok(enterpriseBatch, "企业资料与文件共用入库处理批次");
const enterpriseVersion = state.fileVersions.find((version) => version.id === enterpriseBatch.items[0].fileVersionId);
const enterpriseAsset = state.fileAssets.find((item) => item.id === enterpriseVersion.fileId);
assert.equal(enterpriseAsset.sourceType, "enterprise_snapshot", "统一选择体验必须保留企业快照来源类型");
assert.ok(enterpriseVersion.sourceMetadata || enterpriseAsset.sourceMetadata, "企业资料应保留连接/数据表/快照等来源信息");
assert.equal(enterpriseVersion.sourceMetadata.directoryPath, sources[0].directoryPath, "企业快照入库后应保留来源文件目录");
assert.equal(enterpriseVersion.sourceMetadata.fileName, sources[0].fileName, "企业快照入库后应保留目录中的文件名");
await processBatch(enterpriseBatch);
const enterpriseVersionCount = state.fileVersions.filter((version) => version.fileId === enterpriseAsset.id).length;
const enterpriseConnection = state.enterpriseConnections.find((connection) => connection.id === sources[0].connectionId);
enterpriseConnection.updatedAt = new Date(Date.now() + 60000).toISOString();
const refreshedSource = actions.listEnterpriseSourceObjects().find((sourceObject) => sourceObject.id === sources[0].id);
assert.notEqual(refreshedSource.updatedAt, sources[0].updatedAt, "测试前提：仅来源更新时间发生变化");
const unchangedEnterpriseBatch = actions.startKnowledgeImport(failureKb.id, { sourceObjects: [refreshedSource.id] });
assert.equal(unchangedEnterpriseBatch.items[0].fileId, enterpriseAsset.id, "企业来源按稳定 source_object_key 复用 document_id");
assert.equal(unchangedEnterpriseBatch.items[0].fileVersionId, enterpriseVersion.id, "updatedAt 不参与内容 hash，正文未变时复用当前快照");
assert.equal(unchangedEnterpriseBatch.skippedCount, 1, "企业正文未变化时跳过解析、切块与索引");
assert.equal(state.fileVersions.filter((version) => version.fileId === enterpriseAsset.id).length, enterpriseVersionCount, "时间戳变化不能制造伪版本");
assert.ok(state.enterpriseConnections.length > 1, "企业来源内容更新测试至少需要两个演示连接");
const sourceConnectionIndex = state.enterpriseConnections.findIndex((connection) => connection.id === sources[0].connectionId);
const swapIndex = sourceConnectionIndex === 0 ? 1 : 0;
[state.enterpriseConnections[sourceConnectionIndex], state.enterpriseConnections[swapIndex]] = [state.enterpriseConnections[swapIndex], state.enterpriseConnections[sourceConnectionIndex]];
const changedSource = actions.listEnterpriseSourceObjects().find((sourceObject) => sourceObject.id === sources[0].id);
assert.ok(changedSource && changedSource.content !== sources[0].content, "演示来源内容变化应保持 source_object_key 不变");
const changedEnterpriseBatch = actions.startKnowledgeImport(failureKb.id, { sourceObjects: [changedSource.id], deferred: true });
assert.equal(changedEnterpriseBatch.items[0].operation, "replace", "source_object_key 相同但内容变化时应进入当前文档更新");
assert.equal(changedEnterpriseBatch.items[0].fileId, enterpriseAsset.id, "企业来源内容更新不得创建第二个文档身份");
const enterpriseReference = referenceFor(enterpriseBatch);
assert.equal(enterpriseReference.fileVersionId, enterpriseVersion.id, "候选处理完成前应继续使用企业来源的当前内容");
assert.ok(actions.confirmDocumentReplacement(changedEnterpriseBatch.id, changedEnterpriseBatch.items[0].id));
await processBatch(changedEnterpriseBatch);
assert.equal(changedEnterpriseBatch.items[0].documentId, enterpriseReference.id, "企业来源更新应沿用当前知识库引用");
assert.notEqual(enterpriseReference.fileVersionId, enterpriseVersion.id, "企业来源更新成功后才切换当前内容");
[state.enterpriseConnections[sourceConnectionIndex], state.enterpriseConnections[swapIndex]] = [state.enterpriseConnections[swapIndex], state.enterpriseConnections[sourceConnectionIndex]];

console.log("✓ 分阶段失败与重试、独立预览、取消、任务代际隔离及企业快照来源");

const resetBatch = actions.startKnowledgeImport("local-documents", { files: await actions.prepareUploadFiles([new File(["刷新隔离"], "刷新隔离.txt", { type: "text/plain" })]), deferred: true });
assert.ok(actions.startImportParsing(resetBatch.id, { mineruParseConfig: resetBatch.mineruParseConfig }), "刷新隔离验收应先显式启动公共池解析");
const obsoleteJob = state.processingJobs.find((job) => job.batchId === resetBatch.id && job.status === "running");
assert.ok(obsoleteJob);
store.reset();
const resetState = store.getState();
const resetSnapshot = JSON.stringify(resetState);
await waitFor(() => obsoleteJob.status === "cancelled", "旧 store 的任务在重置后失效");
assert.equal(JSON.stringify(resetState), resetSnapshot, "刷新后旧定时任务不得污染新初始化状态");
assert.equal(resetState.fileAssets.some((file) => file.name === "刷新隔离.txt"), false);

console.log("✓ 删除中的任务隔离与内存重置后的陈旧回调保护");

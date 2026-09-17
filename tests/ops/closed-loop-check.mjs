import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoRoot, loadOpsRuntime } from "./runtime.mjs";

const OpsDemo = loadOpsRuntime({
  pages: ["knowledge", "documents", "data-access", "models", "rag", "api-access", "consumption"]
});

const store = globalThis.OpsDemo.core.store;
const actions = globalThis.OpsDemo.core.actions;
const state = store.getState();
const pages = globalThis.OpsDemo.pages;
const directoryTree = globalThis.OpsDemo.ui.directoryTree;
async function completeBatch(batch, options = {}) {
  assert.ok(batch, "应创建文件处理批次");
  const kb = store.getState().knowledgeBases.find((item) => item.id === batch.knowledgeBaseId);
  assert.ok(actions.startImportParsing(batch.id, { mineruParseConfig: options.mineruParseConfig || kb?.mineruParseConfig || { parseMethod: "txt", imageAnalysisEnabled: false } }));
  assert.ok(actions.completeImportProcessing(batch.id, {
    ingestionProfileId: options.ingestionProfileId || kb?.currentIngestionProfileId || "ING-01",
    processingParameters: options.processingParameters || kb?.processingParametersSnapshot,
  }));
  const until = Date.now() + 15000;
  while (batch.status !== "completed" && Date.now() < until) {
    assert.notEqual(batch.status, "failed", `批次处理失败：${batch.error || JSON.stringify(batch.items.map((item) => item.error))}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.equal(batch.status, "completed", "提交后台处理后应最终完成");
  return batch;
}

["toolManagement", "tools", "skills", "visualizations"].forEach((name) => {
  assert.equal(Object.prototype.hasOwnProperty.call(pages, name), false, `运营端不应注册 ${name} 管理页面`);
});
["skills", "tools", "visualizations"].forEach((name) => {
  assert.equal(Object.prototype.hasOwnProperty.call(state, name), false, `运营端状态不应保留 ${name}`);
});
["toggleCapability", "setCapabilityEnabled", "createCapabilityFromUpload", "updateCapability", "deleteCapability", "validateCapability", "validateVisualization"].forEach((name) => {
  assert.equal(typeof actions[name], "undefined", `运营端动作层不应保留 ${name}`);
});

const initialRecordCount = state.configurationRecords.length;
const kb = state.knowledgeBases.find((item) => item.id === "KB-001");
const seedPendingIndex = state.knowledgeVersions.find((item) => item.id === "KV-20260825-01");
const seedImportBatch = state.importBatches.find((item) => item.id === "IMP-0825-03");
const knowledgeListHtml = pages.knowledge.render({ name: "knowledge", id: null, query: {} }, state);
assert.doesNotMatch(knowledgeListHtml, /data-golden-case-trace|美国关税三情景研判|与调用侧 Demo 的任务配置快照一致/, "知识库首页不应展示跨 Demo 黄金案例追溯卡");
assert.doesNotMatch(knowledgeListHtml, /<th>描述<\/th>|class="knowledge-description"/, "知识库管理总览表格不应展示描述列");
assert.match(knowledgeListHtml, /<th>知识库名称 \/ ID<\/th><th>检索状态<\/th><th>文件数量<\/th>[\s\S]*<th>更新时间<\/th><th>创建时间<\/th><th>操作<\/th>/, "知识库列表应将检索状态放在文件数量之前");
assert.match(knowledgeListHtml, /page-header__top[\s\S]*data-kb-search[\s\S]*新建知识库/, "知识库标题、搜索与新建动作应在单行 PageHeader");
assert.doesNotMatch(knowledgeListHtml, /page-header__toolbar|data-kb-status|检索状态<\/span>/, "知识库首页不应保留第二行或状态筛选");
assert.equal(state.knowledgeBases[0].id, "KB-SCM-2024-V1", "供应链演示知识库应排在知识库列表第一位");
assert.ok(knowledgeListHtml.indexOf("KB-SCM-2024-V1") < knowledgeListHtml.indexOf("KB-001"), "供应链演示知识库在页面中应先于原有知识库展示");
assert.match(knowledgeListHtml, /data-kb-open="KB-SCM-2024-V1"[^>]*>全球供应链管理知识库<\/[^>]+>/, "供应链演示知识库名称应可点击进入详情");
assert.match(knowledgeListHtml, /data-kb-open="KB-001"[^>]*>详情<[\s\S]*data-kb-edit="KB-001"[^>]*>编辑<[\s\S]*data-kb-test="KB-001"[^>]*>测试<[\s\S]*data-kb-delete="KB-001"/, "知识库列表操作应按详情、编辑、测试、删除排列");
assert.match(knowledgeListHtml, /data-kb-open="KB-001"[^>]*>供应商合规与合同库<\/[^>]+>/, "知识库名称本身应可点击进入详情");
const closedKnowledgeTestAction = knowledgeListHtml.match(/<button[^>]*data-kb-test="KB-003"[^>]*>/)?.[0];
assert.ok(closedKnowledgeTestAction, "关闭检索的知识库应保留测试入口");
assert.doesNotMatch(closedKnowledgeTestAction, /disabled/, "测试入口不应受知识库检索开关限制");
const enabledKnowledgeDeleteAction = knowledgeListHtml.match(/<button[^>]*data-kb-delete="KB-001"[^>]*>/)?.[0];
assert.match(enabledKnowledgeDeleteAction || "", /disabled[^>]*title="请先关闭检索再删除"|title="请先关闭检索再删除"[^>]*disabled/, "检索已启用时应禁止删除并说明前置操作");
const closedKnowledgeDeleteAction = knowledgeListHtml.match(/<button[^>]*data-kb-delete="KB-003"[^>]*>/)?.[0];
assert.ok(closedKnowledgeDeleteAction, "关闭检索的知识库应提供删除入口");
assert.doesNotMatch(closedKnowledgeDeleteAction, /disabled/, "只有关闭检索后才应允许删除");
const closedKnowledgeTestHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-003" } }, state);
assert.doesNotMatch(closedKnowledgeTestHtml, /知识库已关闭检索/, "检索测试页不应将对外检索开关作为运行条件");
assert.match(closedKnowledgeTestHtml, /data-run-test-v2 data-base-runnable="true"/, "知识库关闭对外检索后仍应可运行检索测试");
assert.ok(actions.runRetrievalTest({ knowledgeBaseId: "KB-003", question: "关闭对外检索时能否独立测试？" }), "底层检索测试动作不应受知识库检索开关限制");
assert.equal(state.documents.filter((item) => item.knowledgeBaseId === "KB-SCM-2024-V1").length, 10, "供应链知识库应包含 10 份演示文件");
assert.equal(state.chunks.filter((item) => item.knowledgeBaseId === "KB-SCM-2024-V1").length, 90, "供应链知识库应包含清单中的 90 个切片");
const localDocumentsHtml = pages.localDocuments.render({ name: "local-documents", id: null, query: {} }, state);
assert.match(localDocumentsHtml, /<h1 class="page-header__title">文档管理<\/h1>[\s\S]*data-local-document-search[\s\S]*data-local-document-status-filter[\s\S]*data-local-document-upload[\s\S]*page-content creation-page local-documents-page[\s\S]*panel creation-panel local-documents/, "文档管理页应以单行页头承载操作，并复用上传流程的视口满高容器");
assert.doesNotMatch(localDocumentsHtml, /data-local-folder-create(?!-child)/, "页头不应重复提供新建文件夹入口");
assert.match(localDocumentsHtml, /data-directory-tree="local-documents"[\s\S]*data-directory-node="FOLDER-SCM"[\s\S]*供应链管理[\s\S]*data-directory-node="FOLDER-SCM-GUIDES"/, "文档管理应展示可折叠的多级文件目录");
assert.doesNotMatch(localDocumentsHtml, /data-directory-toggle="all"|data-directory-node="all"[^>]*aria-expanded=/, "全部文档根节点应固定展开，仅用于展示和选择");
assert.doesNotMatch(localDocumentsHtml, /data-directory-item=/, "文档管理左侧目录树应只展示文件夹，文件统一在右侧表格展示");
assert.match(localDocumentsHtml, /data-directory-node="FOLDER-SUPPLIER"[\s\S]*供应商与合同[\s\S]*5 个文件/, "隐藏文件节点后，目录树仍应展示后代文件数量");
assert.ok(["data-local-folder-create-child", "data-local-folder-upload"].every((marker) => localDocumentsHtml.includes(marker)), "文档目录工具区应提供内联新建和定向上传入口");
assert.match(localDocumentsHtml, /data-directory-edit="FOLDER-SCM" data-directory-select="FOLDER-SCM"[\s\S]*title="单击打开，双击重命名"/, "文件夹名称应单击打开，仅双击进入内联重命名");
assert.doesNotMatch(localDocumentsHtml, /data-local-folder-rename|data-document-folder-form/, "文档目录不应保留重命名按钮或文件夹编辑弹窗");
assert.ok(localDocumentsHtml.indexOf("document-directory-sidebar__toolbar") < localDocumentsHtml.indexOf("data-local-directory-tree-host"), "当前目录操作应位于左侧目录树上方");
assert.match(localDocumentsHtml, /document-directory-context[^>]*>[\s\S]*document-directory-breadcrumb/, "右侧目录标题应使用层级路径");
assert.doesNotMatch(localDocumentsHtml, /document-directory-context__actions/, "右侧目录路径区域不应保留目录操作");
assert.match(localDocumentsHtml, /<th>文档<\/th><th>状态<\/th><th>知识库引用<\/th><th>大小<\/th><th>上传时间<\/th><th>操作<\/th>/, "文档列表应提供统一状态和知识库引用");
assert.doesNotMatch(localDocumentsHtml, /<th>[\s\S]*存储|<th>处理结果<\/th>|file-storage-(?:heading|status)/, "存储是后端资产语义，不应占用文档列表列");
assert.match(localDocumentsHtml, /aria-label="筛选状态"/, "文档列表的状态筛选应使用统一状态口径");
assert.doesNotMatch(localDocumentsHtml, /所属知识库|data-local-document-kb|供应商合规与合同库|KB-001/, "本地文档列表不得把文件绑定到某一个知识库");
assert.match(localDocumentsHtml, /data-local-document-search[^>]*placeholder="搜索文档"|placeholder="搜索文档"[^>]*data-local-document-search/, "本地文档搜索口径不应继续包含知识库");
assert.match(localDocumentsHtml, /01_供应链管理基础理论手册\.docx[\s\S]*data-local-document-preview="SCM-DOC-01"[\s\S]*data-local-document-move="SCM-DOC-01"[\s\S]*data-local-document-delete="SCM-DOC-01"/, "文档管理应同步展示供应链演示原文件并提供预览、移动和删除闭环");
assert.match(localDocumentsHtml, /data-local-document-preview="SCM-DOC-01"[^>]*>详情<\/button>[\s\S]*data-local-document-move="SCM-DOC-01"[^>]*>移动<\/button>[\s\S]*data-local-document-delete="SCM-DOC-01"[^>]*>删除<\/button>/, "文档管理行操作应按详情、移动、删除排列");
assert.doesNotMatch(localDocumentsHtml, /data-local-document-download|>下载<\/button>/, "文档列表不应提供原文件下载快捷操作");
const localUploadHtml = pages.localDocuments.render({ name: "local-documents", id: "upload", query: { step: "upload" } }, state);
assert.match(localUploadHtml, /local-upload-stack[\s\S]*<details class="[^"]*\bupload-folder-picker\b[^"]*" data-upload-folder-picker>[\s\S]*upload-folder-picker__summary[\s\S]*目标位置[\s\S]*data-directory-tree="local-upload-target"[\s\S]*<\/details>[\s\S]*<label class="file-drop"/, "上传文档页应在上传区域上方使用可折叠的目标位置目录树");
assert.doesNotMatch(localUploadHtml, /<details[^>]*data-upload-folder-picker[^>]*\sopen(?:\s|=|>)/, "目标位置目录树应默认收起");
assert.match(localUploadHtml, /data-directory-node="FOLDER-UNCATEGORIZED"[^>]*class="[^"]*is-active|class="[^"]*is-active[^"]*"[^>]*data-directory-node="FOLDER-UNCATEGORIZED"/, "从根目录上传时应默认选择未分类");
assert.doesNotMatch(localUploadHtml, /data-directory-item=/, "上传目标目录树应只展示文件夹层级");
assert.match(localDocumentsHtml, /<time class="file-asset-date"[^>]*>\d{4}-\d{2}-\d{2} \d{2}:\d{2}<\/time>/, "文档管理的上传日期与时间应保持单行展示");
assert.doesNotMatch(localDocumentsHtml, /<time class="file-asset-date"[^>]*><span>/, "上传时间不应再拆成上下两行");
assert.ok(localDocumentsHtml.indexOf("01_供应链管理基础理论手册.docx") < localDocumentsHtml.indexOf("海岳电子供应商框架合同.pdf"), "供应链演示文件应排在文档管理前 10 位");
assert.match(localDocumentsHtml, /海岳电子供应商框架合同\.pdf[\s\S]*data-local-document-preview="DOC-001"[\s\S]*data-local-document-delete="DOC-001"/, "本地文档页应汇总本地原文件，并提供预览和删除闭环");
assert.equal((localDocumentsHtml.match(/data-local-document-id="DOC-004"/g) || []).length, 1, "同一本地原文件即使进入多个知识库，列表也只能出现一行");
assert.match(localDocumentsHtml, /当前目录 18 个文档/, "全部文档目录应按原文件去重，而不是按知识库处理实例计数");
assert.match(localDocumentsHtml, /data-local-document-pagination[\s\S]*data-local-document-page="previous"[\s\S]*data-local-document-page-status[\s\S]*data-local-document-page="next"/, "文档管理页脚右侧应提供实际分页控件");
assert.doesNotMatch(localDocumentsHtml, /原文件独立保存，各知识库按需引用|local-documents__scope/, "文档管理页脚不应重复展示公共池职责说明");
assert.doesNotMatch(localDocumentsHtml, /data-local-document-join|data-local-documents-join-selected|加入知识库|添加到知识库|data-local-document-select|批量操作/, "文档管理不得提供单个或批量加入知识库入口");
const draftTreeHtml = directoryTree.render({
  folders: [{ id: "FOLDER-A", name: "目录 A", parentId: null, sortOrder: 10 }, { id: "FOLDER-B", name: "目录 B", parentId: null, sortOrder: 20 }],
  items: [],
  selectedId: "FOLDER-B",
  rootId: "all",
  rootLabel: "全部文档",
  scope: "local-documents",
  editableFolders: true,
  draftFolder: { parentId: "all", beforeId: "FOLDER-B", value: "" }
});
assert.ok(draftTreeHtml.indexOf('data-directory-node="FOLDER-A"') < draftTreeHtml.indexOf("data-directory-draft") && draftTreeHtml.indexOf("data-directory-draft") < draftTreeHtml.indexOf('data-directory-node="FOLDER-B"'), "新建文件夹草稿应出现在当前文件夹之前并保持同级");
assert.match(draftTreeHtml, /data-directory-folder-mode="create"[\s\S]*data-directory-parent-id="all"[\s\S]*data-directory-before-id="FOLDER-B"/, "新建草稿应记录当前文件夹的父级与前置位置");
const renameTreeHtml = directoryTree.render({
  folders: [{ id: "FOLDER-A", name: "目录 A", parentId: null, sortOrder: 10 }],
  items: [],
  selectedId: "FOLDER-A",
  rootId: "all",
  scope: "local-documents",
  editableFolders: true,
  editingFolderId: "FOLDER-A",
  editingFolderValue: "目录 A"
});
assert.match(renameTreeHtml, /data-directory-folder-mode="rename"[\s\S]*data-directory-folder-id="FOLDER-A"/, "双击文件夹名称后应在原位置呈现重命名输入框");
const originalFolderId = state.fileAssets.find((item) => item.id === "SCM-DOC-10").folderId;
const firstFolder = actions.createDocumentFolder({ name: "同级目录验收", parentId: "FOLDER-SCM", position: "before", beforeFolderId: "FOLDER-SCM-INSIGHTS" });
const orderedSiblings = state.documentFolders.filter((item) => item.parentId === "FOLDER-SCM").sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
assert.equal(orderedSiblings[orderedSiblings.indexOf(firstFolder) + 1].id, "FOLDER-SCM-INSIGHTS", "内联新建的文件夹提交后应保持在当前文件夹前一位");
assert.equal(actions.deleteDocumentFolder(firstFolder.id).id, firstFolder.id, "同级目录验收数据应可清理");
const disposableFolder = actions.createDocumentFolder({ name: "目录操作验收", parentId: "FOLDER-SCM" });
assert.ok(disposableFolder && disposableFolder.parentId === "FOLDER-SCM", "文档管理应能在选定目录下创建子文件夹");
assert.equal(actions.renameDocumentFolder(disposableFolder.id, "目录操作验收已更新").name, "目录操作验收已更新", "文件夹应支持重命名");
assert.equal(actions.moveLocalDocumentAsset("SCM-DOC-10", disposableFolder.id).folderId, disposableFolder.id, "文档应能移入指定文件夹");
const movedFolderHtml = pages.localDocuments.render({ name: "local-documents", id: null, query: { folder: disposableFolder.id } }, state);
assert.match(movedFolderHtml, /10_供应链管理培训\.pptx/, "选中文件夹后右侧应展示其目录内文档");
assert.equal((movedFolderHtml.match(/data-local-document-row/g) || []).length, 1, "文件夹筛选后右侧列表不得混入其他目录文档");
assert.equal(actions.deleteDocumentFolder(disposableFolder.id), null, "非空文件夹不得删除");
assert.equal(actions.moveLocalDocumentAsset("SCM-DOC-10", originalFolderId).folderId, originalFolderId, "文档移动应支持返回原目录");
assert.equal(actions.deleteDocumentFolder(disposableFolder.id).id, disposableFolder.id, "用户创建的空文件夹应可删除");
const nestedFolderHtml = pages.localDocuments.render({ name: "local-documents", id: null, query: { folder: "FOLDER-SCM-GUIDES" } }, state);
assert.match(nestedFolderHtml, /document-directory-breadcrumb[\s\S]*全部文档[\s\S]*document-directory-breadcrumb__separator[\s\S]*供应链管理[\s\S]*document-directory-breadcrumb__separator[\s\S]*基础理论与流程/, "选中子目录后应从根目录开始展示完整的可回退路径");
assert.ok(state.documents.every((item) => item.sourceType === "local_upload"), "所有种子文件都应使用统一的本地上传来源模型");
assert.ok(state.documents.every((item) => item.localAssetId), "每个知识库文档实例都应指向稳定的本地原文件标识");
const supplyPdfKnowledgePreview = pages.knowledge.render({ name: "knowledge", id: "KB-SCM-2024-V1", query: { preview: "SCM-DOC-05" } }, state);
assert.match(supplyPdfKnowledgePreview, /05_2024全球供应链趋势白皮书\.pdf[\s\S]*src="assets\/documents\/supply-chain\/05_2024全球供应链趋势白皮书\.pdf"/, "知识库文件预览应能打开供应链 PDF 原文件");
assert.match(supplyPdfKnowledgePreview, /05-C01[\s\S]*data-chunk-expand[\s\S]*aria-expanded="false"/, "知识库文件预览应展示供应链切片并沿用折叠卡片交互");
const supplyLocalPreview = pages.localDocuments.render({ name: "local-documents", id: "SCM-DOC-01", query: { knowledgeBaseId: "KB-SCM-2024-V1" } }, state);
assert.match(supplyLocalPreview, /data-local-preview-kb-select[\s\S]*全球供应链管理知识库/, "供应链文件在文档管理预览中应能查看实际引用知识库的切片");
assert.doesNotMatch(supplyLocalPreview, /文档处理结果/, "文档管理不得提供脱离知识库的切片结果来源");
assert.doesNotMatch(supplyLocalPreview, /local-document-reference-list|local-document-reference-row/, "右侧不得重复展示选择器已有的知识库名称模块");
assert.match(supplyLocalPreview, /01-C01[\s\S]*data-chunk-expand/, "供应链文档管理预览应展示清单切片卡片");
assert.match(supplyLocalPreview, /data-chunk-metadata-trigger/, "文档管理预览应允许查看切片信息浮层");
assert.match(supplyLocalPreview, /data-chunk-copy-id[\s\S]*data-chunk-copy-all/, "文档管理只读预览应支持复制 Chunk ID 和全部切片信息");
assert.doesNotMatch(supplyLocalPreview, /data-local-preview-chunk-add|data-local-chunk-context|data-local-chunk-metadata|data-local-chunk-edit|data-local-chunk-delete|data-chunk-edit-trigger|data-chunk-context|data-chunk-metadata-edit|data-chunk-relation-edit|data-chunk-delete/, "文档管理预览不应暴露知识库切片编辑操作");
assert.doesNotMatch(supplyLocalPreview, /data-local-result-status/, "文档管理预览的结果来源旁不应重复展示知识库状态");
assert.doesNotMatch(supplyLocalPreview, /预置演示数据未内置原始二进制文件/, "供应链预置文件应保留可下载的原文件链接");
const sharedLocalDocumentInstances = state.documents.filter((item) => item.localAssetId === "DOC-004");
assert.deepEqual(sharedLocalDocumentInstances.map((item) => item.knowledgeBaseId).sort(), ["KB-001", "KB-003"], "代表样例应让同一本地原文件在两个知识库中拥有独立处理实例");
const localPreviewKb1 = pages.localDocuments.render({ name: "local-documents", id: "DOC-004", query: { knowledgeBaseId: "KB-001" } }, state);
assert.match(localPreviewKb1, /aria-label="返回文档管理"[\s\S]*href="#\/local-documents"|href="#\/local-documents"[\s\S]*aria-label="返回文档管理"/, "文件预览刷新后仍应明确返回文档管理列表");
assert.doesNotMatch(localPreviewKb1, /data-preview-document-select|id="preview-document-select"|>源文档<\/label>/, "从本地文档进入预览时不得出现同库文件快速切换");
assert.match(localPreviewKb1, /data-local-preview-kb-select[\s\S]*供应商合规与合同库[\s\S]*内控制度库/, "多库文件预览应只在实际引用知识库之间切换");
assert.doesNotMatch(localPreviewKb1, /<option value="">|文档处理结果/, "知识库切片选择器不得保留公共池处理结果选项");
assert.match(localPreviewKb1, /knowledge-preview-toolbar__result[\s\S]*知识库引用[\s\S]*data-local-preview-kb-select/, "知识库切片选择应位于引用栏工具区");
assert.match(localPreviewKb1, /<h1 class="page-header__title">海岳电子质量协议\.pdf<\/h1>/, "文档预览页标题应直接使用当前文件名");
assert.doesNotMatch(localPreviewKb1, /data-local-preview-tab|>解析结果<\/button>|file-asset-parsed/, "文档预览不应向用户展示解析器中间结果");
assert.match(localPreviewKb1, /<section class="file-asset-details" aria-label="文件信息">/, "文件信息应默认完整展示且不使用折叠标题");
assert.match(localPreviewKb1, /<dt>文件 ID<\/dt>[\s\S]*<dt>上传时间<\/dt>[\s\S]*<dt>文件状态<\/dt>[\s\S]*<dt>文件路径<\/dt>/, "文件详情信息应展示文件 ID、上传时间、文件状态和文件路径");
const localFilePathHtml = localPreviewKb1.match(/<dd class="file-asset-details__path">([\s\S]*?)<\/dd>/)?.[1] || "";
assert.match(localFilePathHtml, /全部文档[\s\S]*供应商与合同[\s\S]*海岳电子质量协议\.pdf/, "文件路径应从根目录展示至当前文件名");
assert.doesNotMatch(localFilePathHtml, /<button|data-directory-select|href=/, "文件路径应为只读展示，不提供跳转操作");
assert.doesNotMatch(localPreviewKb1, /<dt>来源<\/dt>|<dt>保存时间<\/dt>|data-local-document-process|>处理文件<\/button>/, "文件详情不应展示恒定来源、保存时间或作用域含糊的处理入口");
assert.doesNotMatch(localPreviewKb1, /local-document-reference-list|local-document-reference-row|>可检索</, "知识库选择器下方不应重复展示引用名称或状态列表");
assert.doesNotMatch(localPreviewKb1, /href="#\/local-documents\/DOC-004\?knowledgeBaseId=KB-001"/, "知识库引用不应继续指回文件预览路径");
assert.doesNotMatch(localPreviewKb1, /file-asset-context|<summary>文件信息与知识库引用<\/summary>|file-asset-tasks|data-file-task/, "文件预览不应保留独立范围层、折叠标题或重复文件处理任务模块");
assert.doesNotMatch(fs.readFileSync(path.join(demoRoot, "src/ops/documents.js"), "utf8"), /仅改变目录位置，不影响知识库引用/, "移动文档弹窗不应保留目录选择器下方的说明文字");
assert.doesNotMatch(localPreviewKb1, /贸易政策与关税库/, "切片知识库选择器不得混入未使用该文件的知识库");
assert.match(localPreviewKb1, /CHK-DOC-004-001/, "选择 KB-001 时应展示该库对应的切片");
const singleKnowledgeBasePreview = pages.localDocuments.render({ name: "local-documents", id: "DOC-102", query: { knowledgeBaseId: "KB-002" } }, state);
assert.match(singleKnowledgeBasePreview, /data-local-preview-kb-select[^>]*>[\s\S]*<option value="KB-002" selected>贸易政策与关税库<\/option>/, "只有一个知识库时选择器也应只包含实际引用知识库");
assert.doesNotMatch(singleKnowledgeBasePreview, /<option value="">|文档处理结果/, "单库文件也不得出现独立处理结果选项");
const localPreviewKb3 = pages.localDocuments.render({ name: "local-documents", id: "DOC-004", query: { knowledgeBaseId: "KB-003" } }, state);
assert.match(localPreviewKb3, /<option value="KB-003" selected>/, "选择 KB-003 后应持久展示该知识库上下文");
assert.match(localPreviewKb3, /CHK-DOC-301-001[\s\S]*本协议将来料检验、过程质量控制与关键变更审批合并为一个检索单元/, "KB-003 应显示自己的文档实例和专属切片内容");
assert.doesNotMatch(localPreviewKb3, /CHK-DOC-004-001/, "KB-003 切片区不得混入 KB-001 的切片卡片");
assert.match(localPreviewKb3, /data-chunk-metadata-trigger/, "文档管理预览即使选中知识库结果也可查看切片信息浮层");
assert.doesNotMatch(localPreviewKb3, /data-local-preview-chunk-add|data-local-chunk-context|data-local-chunk-metadata|data-local-chunk-edit|data-local-chunk-delete|data-chunk-edit-trigger|data-chunk-context|data-chunk-metadata-edit|data-chunk-relation-edit|data-chunk-delete/, "文档管理预览即使选中知识库结果也只做查看，不暴露切片编辑入口");
state.documents.push({ id: "REF-EXTERNAL-01", knowledgeBaseId: "KB-002", name: "仅供运行时访问的外部页面", sourceType: "external_reference", status: "ready" });
const localDocumentsWithoutReferences = pages.localDocuments.render({ name: "local-documents", id: null, query: {} }, state);
assert.doesNotMatch(localDocumentsWithoutReferences, /REF-EXTERNAL-01|仅供运行时访问的外部页面/, "企业或外部信源引用不得进入本地文档列表");
state.documents.pop();
const enterpriseConnectionsHtml = pages.enterpriseConnections.render({ name: "enterprise-connections", id: null, query: {} }, state);
assert.match(enterpriseConnectionsHtml, /<h1 class="page-header__title">企业数据<\/h1>[\s\S]*data-enterprise-create[\s\S]*接入数据库[\s\S]*enterprise-database-grid/, "企业数据页应直接展示数据库卡片并提供接入入口");
assert.doesNotMatch(enterpriseConnectionsHtml, /data-access-boundary|直接读取已有数据库，不复制整库数据/, "企业数据页不应保留顶部数据库接入说明条");
assert.doesNotMatch(enterpriseConnectionsHtml, /data-enterprise-search|data-enterprise-status|summary-strip|data-access-summary/, "企业数据列表不应展示搜索、状态筛选或摘要统计条");
assert.match(enterpriseConnectionsHtml, /class="enterprise-database-grid"[\s\S]*class="enterprise-database-card[^"]*"[\s\S]*数据库类型|class="enterprise-database-grid"[\s\S]*class="enterprise-database-card[^"]*"/, "企业数据页应以一库一卡的网格呈现已接入数据库");
assert.equal((enterpriseConnectionsHtml.match(/data-enterprise-card/g) || []).length, 3, "三个种子数据库应分别呈现为三张数据库卡片");
assert.doesNotMatch(enterpriseConnectionsHtml, /<table class="data-table data-access-table"|<th>连接名称<\/th>/, "数据库卡片页不应继续保留旧连接表格");
assert.doesNotMatch(enterpriseConnectionsHtml, /<th>(?:授权范围|Schema|表\/视图)<\/th>/, "数据库连接列表不应提前展示导入阶段的 Schema 或资源授权");
assert.doesNotMatch(enterpriseConnectionsHtml, /<th>启用状态<\/th>|data-enterprise-toggle|已启用|已停用/, "企业数据列表不应保留独立启用状态或开关");
assert.match(enterpriseConnectionsHtml, /data-enterprise-row="CONNECTION-01"[\s\S]*enterprise-database-card__title" data-enterprise-edit="CONNECTION-01"[\s\S]*data-enterprise-test="CONNECTION-01"[\s\S]*data-enterprise-edit="CONNECTION-01"[\s\S]*data-enterprise-delete="CONNECTION-01"/, "数据库标题与编辑动作应进入同一编辑弹窗，并保留测试和删除动作");
assert.match(enterpriseConnectionsHtml, /data-enterprise-test="CONNECTION-01"[^>]*>测试<\/button>[\s\S]*data-enterprise-edit="CONNECTION-01"[^>]*>配置<\/button>[\s\S]*data-enterprise-delete="CONNECTION-01"[^>]*>删除<\/button>/, "企业数据卡片操作应按测试、配置、删除显示");
assert.doesNotMatch(enterpriseConnectionsHtml, /data-enterprise-detail/, "企业数据卡片不应保留独立详情入口");
assert.match(enterpriseConnectionsHtml, /订单与库存数据库[\s\S]*连接正常/, "企业数据列表应回显黄金案例数据库及其连接状态");
assert.match(enterpriseConnectionsHtml, /覆盖供应链订单、库存与履约数据[\s\S]*目标数据库[\s\S]*supply_chain[\s\S]*服务器[\s\S]*supply-db\.internal:5432/, "数据库卡片应同时回显业务描述、目标数据库与服务器连接信息");
assert.ok(["PostgreSQL", "MySQL", "SQL Server"].every((label) => enterpriseConnectionsHtml.includes(label)), "企业连接列表应回显 PostgreSQL、MySQL、SQL Server 三类数据库");
const externalInformationHtml = pages.externalInformation.render({ name: "external-information", id: null, query: {} }, state);
assert.match(externalInformationHtml, /page-header__title">外部信源[\s\S]*data-search-service-create[\s\S]*接入服务/, "外部信源页应在 PageHeader 提供接入入口");
assert.equal((externalInformationHtml.match(/data-search-service-card/g) || []).length, 3, "三个种子检索服务应分别呈现为三张服务卡片");
assert.match(externalInformationHtml, /data-search-service-row="SEARCH-SERVICE-01"[\s\S]*全球贸易资讯检索[\s\S]*Elasticsearch[\s\S]*trade-news-v3[\s\S]*search\.trade\.internal[\s\S]*data-search-service-test="SEARCH-SERVICE-01"/, "Elasticsearch 服务卡应回显类型、索引、地址和测试动作");
assert.match(externalInformationHtml, /data-search-service-test="SEARCH-SERVICE-01"[^>]*>测试<\/button>[\s\S]*data-search-service-edit="SEARCH-SERVICE-01"[^>]*>配置<\/button>[\s\S]*data-search-service-delete="SEARCH-SERVICE-01"[^>]*>删除<\/button>/, "检索服务卡片操作应按测试、配置、删除显示");
assert.match(externalInformationHtml, /OpenSearch[\s\S]*自定义接口/, "服务列表应覆盖 OpenSearch 与自定义接口");
assert.doesNotMatch(externalInformationHtml, /添加信源|标签管理|批量停用|data-external-source/, "检索服务页不应继续暴露原始信源治理操作");
assert.equal(actions.deleteKnowledgeBase("KB-001"), null, "正在提供检索的知识库不得直接删除");
const disposableKnowledgeBase = actions.createKnowledgeBase({ name: "待删除演示库", purpose: "验证知识库编辑与删除闭环。", embeddingModelId: "MODEL-EMBEDDING-PRIMARY" });
const disposableEmbeddingModelId = disposableKnowledgeBase.boundEmbeddingModelId;
assert.equal(actions.updateKnowledgeBase(disposableKnowledgeBase.id, { name: "不应保存", purpose: "不应保存", embeddingModelId: "MODEL-EMBEDDING-SECONDARY" }), null, "知识库编辑动作不得接受向量模型变更");
assert.equal(disposableKnowledgeBase.boundEmbeddingModelId, disposableEmbeddingModelId, "拒绝敏感字段后必须保持原向量模型绑定");
assert.equal(actions.updateKnowledgeBase(disposableKnowledgeBase.id, { name: "已编辑演示库", purpose: "名称与描述已更新。" }).name, "已编辑演示库", "知识库名称和描述应可编辑");
assert.equal(actions.deleteKnowledgeBase(disposableKnowledgeBase.id), disposableKnowledgeBase, "关闭检索的知识库应可确认删除");
assert.equal(state.knowledgeBases.includes(disposableKnowledgeBase), false, "删除后知识库应从列表移除");
const modelsHtml = pages.models.render({ name: "models", id: null, query: {} }, state);
assert.match(modelsHtml, /page-header__top[\s\S]*page-header__actions[\s\S]*data-model-search[\s\S]*data-model-create/, "模型新增、搜索与筛选应共同位于单行 PageHeader 右侧");
assert.doesNotMatch(modelsHtml, /page-header__toolbar|page-header--has-toolbar/, "模型管理不应生成第二层 Header 工具栏");
assert.doesNotMatch(modelsHtml, /模型 ID|版本 \/ 规格|服务来源|引用配置|查看引用/, "模型列表不应暴露版本、ID、来源或引用关系");
assert.doesNotMatch(modelsHtml, /model-summary|class="model-identity"[^>]*>[\s\S]*?class="table-primary"[^>]*>[^<]*<\/div>\s*<(?:span|small)/, "模型名称下方不应显示预览说明小字");
assert.equal((modelsHtml.match(/<colgroup><col class="models-table__col models-table__col--name"><col class="models-table__col models-table__col--dimension"><col class="models-table__col models-table__col--connection"><col class="models-table__col models-table__col--actions"><\/colgroup>/g) || []).length, 1, "仅向量模型表应使用四列契约");
assert.equal((modelsHtml.match(/<colgroup><col class="models-table__col models-table__col--name"><col class="models-table__col models-table__col--connection"><col class="models-table__col models-table__col--actions"><\/colgroup>/g) || []).length, 2, "LLM 与 Rerank 表应使用三列契约");
const llmModelsHtml = modelsHtml.slice(modelsHtml.indexOf('data-model-group="llm"'), modelsHtml.indexOf('data-model-group="embedding"'));
const embeddingModelsHtml = modelsHtml.slice(modelsHtml.indexOf('data-model-group="embedding"'), modelsHtml.indexOf('data-model-group="reranker"'));
const rerankerModelsHtml = modelsHtml.slice(modelsHtml.indexOf('data-model-group="reranker"'));
assert.match(llmModelsHtml, /<th>模型名称<\/th><th>连接状态<\/th><th>操作<\/th>[\s\S]*DeepSeek-V4-Pro[\s\S]*Qwen3\.8-2\.4T-A95B[\s\S]*Qwen3\.5-397B-A17B/, "LLM 表应显示三个预置模型及三列基础信息");
assert.doesNotMatch(llmModelsHtml, /参数规模|models-table__dimension/, "LLM 表不应展示或预留参数规模列");
assert.match(embeddingModelsHtml, /<th>向量维度<\/th>[\s\S]*<td class="models-table__dimension"><div class="table-primary">[^<]+ 维<\/div><\/td>/, "向量表应展示向量维度");
assert.match(rerankerModelsHtml, /<th>模型名称<\/th><th>连接状态<\/th><th>操作<\/th>[\s\S]*<td><div class="model-connection">/, "Rerank 表应使用三列基础信息契约");
assert.doesNotMatch(rerankerModelsHtml, /向量维度|models-table__dimension/, "Rerank 表不应显示或预留向量维度列");
assert.equal("promptStrategy" in pages, false, "运营端不应注册 Prompt 与策略页面");
const consumptionHtml = pages.consumption.render({ name: "consumption", id: null, query: {} }, state);
const tokenConsumptionSummaryHtml = consumptionHtml.slice(consumptionHtml.indexOf('class="summary-strip consumption-summary '), consumptionHtml.indexOf('<section class="panel consumption-chart-panel"'));
assert.equal((tokenConsumptionSummaryHtml.match(/class="summary-cell"/g) || []).length, 3, "Token 消耗页签应展示三项 Token 指标");
assert.match(tokenConsumptionSummaryHtml, /Token 总量[\s\S]*输入 Token[\s\S]*输出 Token/, "Token 消耗摘要应按总量、输入和输出排列");
assert.doesNotMatch(tokenConsumptionSummaryHtml, /API 请求次数|推理调用次数/, "Token 消耗页签不应混入请求次数");
assert.match(consumptionHtml, /role="tablist" aria-label="消耗统计类型"[\s\S]*data-consumption-tab="tokens"[\s\S]*data-consumption-tab="requests"/, "消耗统计应提供 Token 和 API 请求两个页签");
assert.match(consumptionHtml, /data-consumption-model[\s\S]*全部模型|<option value="all" selected>全部模型[\s\S]*data-consumption-model/, "消耗统计应提供默认为全部模型的筛选控件");
assert.match(consumptionHtml, /<option value="MODEL-LLM-DEEPSEEK-V4-PRO">DeepSeek-V4-Pro<\/option>/, "消耗统计模型筛选应列出 LLM 名称");
assert.doesNotMatch(consumptionHtml, /Qwen3-Embedding-8B|Qwen3-Reranker-0\.6B|（生成模型）/, "消耗统计模型筛选不应列出向量、Rerank 模型或附加类型说明");
assert.match(consumptionHtml, /data-consumption-token/, "Token 页签应只渲染 Token 图表");
assert.doesNotMatch(consumptionHtml, /data-consumption-request/, "Token 页签不应同时渲染 API 请求图表");
const requestConsumptionHtml = pages.consumption.render({ name: "consumption", id: null, query: { metric: "requests" } }, state);
const requestConsumptionSummaryHtml = requestConsumptionHtml.slice(requestConsumptionHtml.indexOf('class="summary-strip consumption-summary '), requestConsumptionHtml.indexOf('<section class="panel consumption-chart-panel"'));
assert.equal((requestConsumptionSummaryHtml.match(/class="summary-cell"/g) || []).length, 3, "API 请求页签应展示三项请求指标");
assert.match(requestConsumptionSummaryHtml, /API 请求次数[\s\S]*日均请求次数[\s\S]*单日峰值/, "API 请求摘要应展示总量、日均与单日峰值");
assert.match(requestConsumptionHtml, /data-consumption-request/, "API 请求页签应只渲染请求图表");
assert.doesNotMatch(requestConsumptionHtml, /data-consumption-token/, "API 请求页签不应同时渲染 Token 图表");
const modelConsumptionHtml = pages.consumption.render({ name: "consumption", id: null, query: { model: "MODEL-LLM-DEEPSEEK-V4-PRO" } }, state);
assert.match(modelConsumptionHtml, /value="MODEL-LLM-DEEPSEEK-V4-PRO" selected/, "模型筛选应从路由恢复选中状态");
assert.notEqual(modelConsumptionHtml.match(/summary-cell__value">([^<]+)<\/div>/)?.[1], consumptionHtml.match(/summary-cell__value">([^<]+)<\/div>/)?.[1], "单模型筛选应改变聚合 Token 指标");
const retrievalConfigHtml = pages.rag.render({ name: "retrieval-config", id: null, query: {} }, state);
const retrievalSystemConfig = state.rag.retrievalSettings.system;
const retrievalOperatorConfig = state.rag.retrievalSettings.operator;
assert.equal(retrievalSystemConfig.fusionMethod, "rrf", "混合检索系统配置应固定使用 RRF");
assert.equal(retrievalSystemConfig.rrfK, 60, "RRF 的 k 参数应固定保存在代码配置中");
assert.equal(retrievalSystemConfig.bm25Candidates, 30, "关键词检索应保留独立的系统候选规模");
assert.equal(retrievalSystemConfig.denseCandidates, 30, "语义检索应保留独立的系统候选规模");
assert.equal(retrievalSystemConfig.deduplicationEnabled, true, "RRF 合并两路结果后应固定启用去重");
assert.equal(Object.prototype.hasOwnProperty.call(retrievalSystemConfig, "fusionWeights"), false, "RRF 系统配置不应残留加权融合参数");
assert.equal(Object.prototype.hasOwnProperty.call(retrievalOperatorConfig, "keywordWeight"), false, "运营设置不应保存关键词权重");
assert.equal(Object.prototype.hasOwnProperty.call(retrievalOperatorConfig, "semanticWeight"), false, "运营设置不应保存语义权重");
assert.deepEqual(state.rag.answerGeneration, { modelId: "MODEL-LLM-DEEPSEEK-V4-PRO", model: "DeepSeek-V4-Pro", temperature: 0.2, citationsEnabled: true }, "回答生成模型、温度与引用能力应由系统固定配置");
assert.match(retrievalConfigHtml, /data-open-retrieval-test/, "检索配置页头应提供检索测试快捷入口");
assert.match(retrievalConfigHtml, /data-save-retrieval-settings[^>]*disabled[\s\S]*更新配置|更新配置[\s\S]*data-save-retrieval-settings[^>]*disabled/, "检索配置主操作应命名为更新配置，并在初始无修改时禁用");
assert.doesNotMatch(retrievalConfigHtml, />保存设置<|>系统默认</, "检索配置不应残留“保存设置”文案或“系统默认”标签");
assert.match(retrievalConfigHtml, /panel__header[\s\S]*<h2>检索方式<\/h2><p>系统统一管理召回与融合策略<\/p>[\s\S]*panel__body[\s\S]*retrieval-system-heading__icon[\s\S]*<h3>混合检索<\/h3><p>同时使用关键词与语义检索，系统统一合并结果并去重。关键词检索按关键词与字段匹配召回证据。语义检索按向量语义相似度召回证据。<\/p>/, "面板头部应展示检索方式，正文将关键词与语义检索解释合并进带图标的混合检索说明");
assert.doesNotMatch(retrievalConfigHtml, /retrieval-method-copy|data-hybrid-composition|retrieval-method-lines|<dl|<dt|<dd>/, "混合检索说明不应保留独立说明行或表格化结构");
assert.doesNotMatch(retrievalConfigHtml, /retrieval-hybrid-sources|retrieval-hybrid-source|retrieval-hybrid-card|融合权重/, "检索方式不应继续使用旧来源卡片或权重布局");
assert.doesNotMatch(retrievalConfigHtml, /RRF|代码配置统一管理|运营人员无需调整/, "检索配置不应向运营人员展示 RRF 等技术实现说明");
assert.doesNotMatch(retrievalConfigHtml, /retrieval-keyword-weight|data-hybrid-weight-range|融合权重|关键词\s*\d+%|语义\s*\d+%|偏语义|偏关键词/, "检索配置不得再出现融合权重、百分比或 Slider");
assert.doesNotMatch(retrievalConfigHtml, /单文件最多返回|召回候选|retrieval-max-per-document|retrieval-rerank-candidates/, "运营配置不应暴露系统候选规模或不存在的单文件限制");
assert.doesNotMatch(retrievalConfigHtml, /retrieval-system-capabilities|retrieval-advanced|高级设置/, "检索配置不应使用零散能力标签或隐藏候选数量");
assert.match(retrievalConfigHtml, /相关度阈值[\s\S]*id="retrieval-relevance"[^>]*class="field"[^>]*type="number"[^>]*inputmode="decimal"[^>]*min="0\.40" max="0\.90" step="0\.01"[^>]*value="0\.60"[^>]*required aria-required="true"[^>]*aria-describedby="retrieval-relevance-description"[^>]*aria-valuetext="相关度阈值 0\.60，均衡"/, "全局相关度阈值应以默认 0.60 的百分位数字输入展示");
assert.match(retrievalConfigHtml, /≤ 0\.50 宽松（覆盖优先），0\.51–0\.70 均衡（兼顾数量与质量），≥ 0\.71 严格（质量优先，结果可能更少）。/, "最低相关度应在输入下方仅展示统一的三档区间参考");
assert.doesNotMatch(retrievalConfigHtml, /当前 0\.60（均衡）|仅返回相关度 ≥|开启 Rerank 时使用重排分，关闭时使用融合分/, "最低相关度说明不应重复当前值、过滤规则或 Rerank 分数来源");
assert.doesNotMatch(retrievalConfigHtml, /retrieval-relevance-(?:slider|cards?|fieldset)|data-relevance-range/, "最低相关度不应保留 Slider 或独立解释卡片层级");
const originalRerankEnabled = retrievalOperatorConfig.rerankEnabled;
retrievalOperatorConfig.rerankEnabled = false;
const rerankDisabledConfigHtml = pages.rag.render({ name: "retrieval-config", id: null, query: {} }, state);
retrievalOperatorConfig.rerankEnabled = originalRerankEnabled;
const disabledConfigRerankerTag = rerankDisabledConfigHtml.match(/<select\b[^>]*id="retrieval-reranker-model"[^>]*>/)?.[0] || "";
assert.match(rerankDisabledConfigHtml, /data-rerank-fields/, "关闭 Rerank 后配置页仍应展示模型字段");
assert.doesNotMatch(rerankDisabledConfigHtml, /data-rerank-fields[^>]*hidden/, "关闭 Rerank 后不得隐藏模型字段");
assert.match(disabledConfigRerankerTag, /\bdisabled\b/, "关闭 Rerank 后模型选择应不可操作");
assert.doesNotMatch(disabledConfigRerankerTag, /\brequired\b|aria-required/, "关闭 Rerank 后模型不再是必填项");
const retrievalWorkspaceHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001" } }, state);
assert.ok(retrievalWorkspaceHtml.indexOf('aria-label="RAG 对话与质量结果"') < retrievalWorkspaceHtml.indexOf('aria-label="检索测试设置"'), "检索测试应按主对话居左、测试参数居右的顺序渲染");
assert.doesNotMatch(retrievalWorkspaceHtml, /page-header__back|page-header--with-back/, "从侧边栏直接进入检索测试时不应显示上一级返回按钮");
const retrievalFromConfigHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", from: "retrieval-config" } }, state);
const retrievalFromListHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", from: "knowledge-list" } }, state);
const retrievalFromDetailHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", from: "knowledge-detail" } }, state);
assert.ok([retrievalFromConfigHtml, retrievalFromListHtml, retrievalFromDetailHtml].every((html) => !/page-header__back|page-header--with-back/.test(html)), "检索测试应始终视为侧边栏页面，不根据入口展示返回操作");
assert.doesNotMatch(retrievalWorkspaceHtml, /retrieval-chat__header|retrieval-chat__state|<h2>测试对话<\/h2>/, "检索测试主对话不应重复展示测试对话标题、当前配置或完成状态");
assert.doesNotMatch(retrievalWorkspaceHtml, /模拟访问等级|test-access|access-level-simulation/, "检索测试不得提供模拟访问等级");
const retrievalQuestionTag = retrievalWorkspaceHtml.match(/<textarea\b[^>]*id="test-question-v2"[^>]*>/)?.[0] || "";
assert.ok(retrievalQuestionTag, "检索测试应保留问题输入框");
assert.match(retrievalQuestionTag, /aria-label="[^"]+"/, "检索问题输入框移除可见标签后须保留 aria-label");
assert.match(retrievalQuestionTag, /(?:^|\s)required(?:\s|>|=)/, "检索问题输入框仍应为必填");
assert.match(retrievalQuestionTag, /aria-required="true"/, "检索问题输入框须向辅助技术声明必填");
const retrievalComposerHtml = retrievalWorkspaceHtml.match(/<footer class="retrieval-composer"[\s\S]*?<\/footer>/)?.[0] || "";
assert.doesNotMatch(retrievalComposerHtml, /<label[^>]*for="test-question-v2"|>\s*检索问题\s*</, "检索输入区不应重复显示“检索问题”标签");
assert.doesNotMatch(retrievalWorkspaceHtml, /id="test-profile"|检索配置<\/label>/, "V2 检索测试应直接使用全局检索设置，不再选择配置版本");
assert.match(retrievalWorkspaceHtml, /测试参数[\s\S]*id="test-kb-v2"[\s\S]*检索方式[\s\S]*混合检索[\s\S]*关键词检索与语义检索始终启用 · 系统统一合并排序并去重[\s\S]*>Rerank<[\s\S]*data-test-rerank-toggle[\s\S]*id="test-reranker-model"[\s\S]*Qwen3-Reranker-0\.6B[\s\S]*id="test-final-topk"[^>]*value="10"[\s\S]*相关度阈值[\s\S]*id="test-relevance"[^>]*type="number"[^>]*min="0\.40" max="0\.90" step="0\.01"[^>]*value="0\.60"[^>]*aria-valuetext="相关度阈值 0\.60，均衡"[\s\S]*回答生成[\s\S]*data-test-answer-toggle[\s\S]*id="test-answer-model"[^>]*disabled[\s\S]*<option selected>DeepSeek-V4-Pro<\/option>/, "检索测试应复用 Rerank 与召回参数，回答模型以同类下拉结构显示唯一且不可切换的默认 LLM");
assert.match(retrievalWorkspaceHtml, /data-test-answer-toggle[^>]*aria-checked="false"|aria-checked="false"[^>]*data-test-answer-toggle/, "首次进入检索测试时回答生成应默认关闭");
assert.match(retrievalWorkspaceHtml, /data-test-answer-fields[^>]*aria-disabled="true"[\s\S]*data-test-answer-model[^>]*disabled/, "回答生成默认关闭时模型应常显但不可操作");
assert.doesNotMatch(retrievalWorkspaceHtml, /混合检索（系统默认）/, "检索测试不应展示“系统默认”标签文案");
assert.doesNotMatch(retrievalWorkspaceHtml, /RRF/, "检索测试不应展示底层融合算法名称");
assert.doesNotMatch(retrievalWorkspaceHtml, /id="test-relevance"[^>]*aria-describedby=|data-relevance-description|≤ 0\.50 宽松（覆盖优先）/, "检索测试应隐藏相关度区间说明，并移除不存在说明节点的 aria-describedby");
assert.doesNotMatch(retrievalWorkspaceHtml, /关键词\s*\d+%|语义\s*\d+%|融合权重|retrieval-keyword-weight|data-hybrid-weight-range/, "检索测试不应展示或配置关键词／语义融合权重");
assert.doesNotMatch(retrievalWorkspaceHtml, /retrieval-relevance-(?:slider|cards?)|相关度分数区间说明/, "检索测试不应渲染旧相关度 Slider 或解释卡片");
assert.doesNotMatch(retrievalWorkspaceHtml, /测试范围|召回与结果|data-test-settings-source|data-use-online-settings|恢复全局设置|本次调整/, "检索测试不应展示冗余小标题、参数来源或恢复入口");
assert.match(retrievalComposerHtml, /^<footer class="retrieval-composer"><textarea[\s\S]*id="test-question-v2"[\s\S]*<\/textarea><button[\s\S]*data-run-test-v2[\s\S]*<\/button><\/footer>$/, "检索输入区应由单层 footer 直接承载输入框与按钮");
assert.match(retrievalComposerHtml, />发送<\/button>/, "检索输入区主操作应命名为发送");
assert.doesNotMatch(retrievalComposerHtml, /retrieval-composer__input-shell|retrieval-composer__send/, "检索输入区不应再嵌套输入壳或按钮定位容器");
assert.match(retrievalWorkspaceHtml, /<div class="retrieval-chat__body" aria-live="polite">[\s\S]*retrieval-chat-empty[\s\S]*开始一次完整 RAG 测试[\s\S]*<\/div>/, "首次进入检索测试时主对话应展示明确的空状态");
assert.match(retrievalWorkspaceHtml, /retrieval-chat__quality[\s\S]*retrieval-quality-dashboard is-retrieval-only[\s\S]*检索质量[\s\S]*返回切片数/, "知识库尚未运行时应默认展示检索质量");
assert.match(retrievalWorkspaceHtml, /data-answer-quality hidden/, "回答生成默认关闭时不应展示回答质量");
assert.doesNotMatch(retrievalWorkspaceHtml, /衡量证据是否找得全、排得准|基于生成回答与引用证据/, "质量分组标题不应显示右侧辅助说明");
assert.doesNotMatch(retrievalWorkspaceHtml, /class="retrieval-message|class="evidence-item/, "首次进入时不应预先展示历史模拟问题或证据");
assert.match(retrievalWorkspaceHtml, />海岳电子 Q3 交付风险是否已触发合同升级机制？<\/textarea>/, "预设问题应仅保留在底部输入框中");
assert.doesNotMatch(retrievalWorkspaceHtml, /workspace-section-heading|retrieval-profile-brief|retrieval-setting-note|<h[2-4][^>]*>测试设置<\/h[2-4]>|当前测试对象|权限过滤\s*\d|BM25\s*\d|Dense\s*\d|融合\s*\d|Rerank\s*\d|结果封装\s*\d|总耗时/, "检索测试不应展示冗余对象摘要或算法、耗时日志");
const defaultRetrievalRun = actions.runRetrievalTest({ knowledgeBaseId: "KB-001", question: "海岳电子 Q3 交付风险是否已触发合同升级机制？", generateAnswer: true });
assert.ok(defaultRetrievalRun && defaultRetrievalRun.lastRunAt, "不修改预设问题直接检索应产生本次运行结果");
assert.equal(defaultRetrievalRun.runtimeSnapshot.system.fusionMethod, "rrf", "检索运行快照应记录系统固定的 RRF 融合方法");
assert.equal(defaultRetrievalRun.runtimeSnapshot.system.rrfK, 60, "检索运行快照应记录本次使用的 RRF k 参数");
assert.equal(defaultRetrievalRun.runtimeSnapshot.derivedPlan.keywordCandidates, 30, "运行计划应独立保留关键词候选规模");
assert.equal(defaultRetrievalRun.runtimeSnapshot.derivedPlan.semanticCandidates, 30, "运行计划应独立保留语义候选规模");
assert.equal(defaultRetrievalRun.runtimeSnapshot.derivedPlan.fusionMethod, "rrf", "运行计划应明确以 RRF 合并两路排序");
assert.equal(defaultRetrievalRun.runtimeSnapshot.derivedPlan.fusionRankingSource, "computed_rrf", "同时具备两路分数时应实际计算 RRF 排名，而非继续按加权融合分排序");
assert.ok(defaultRetrievalRun.evidence.every((item) => item.rrfK === 60 && Number.isFinite(item.rrfScore)), "返回证据应保留本次实际计算的 RRF 分数与 k 参数用于验证");
assert.equal(Object.prototype.hasOwnProperty.call(defaultRetrievalRun.runtimeSnapshot.operator, "keywordWeight"), false, "检索运行快照不得携带关键词权重");
assert.equal(Object.prototype.hasOwnProperty.call(defaultRetrievalRun.runtimeSnapshot.operator, "semanticWeight"), false, "检索运行快照不得携带语义权重");
assert.equal(defaultRetrievalRun.answerGenerated, true, "明确开启回答生成后应在取回证据后生成回答");
assert.ok(defaultRetrievalRun.generatedAnswer.length > 0, "明确开启回答生成后应保存生成回答正文");
assert.equal(defaultRetrievalRun.answerCitations.length, defaultRetrievalRun.evidence.length, "生成回答应为本次使用的每条证据生成引用");
assert.ok(defaultRetrievalRun.answerCitations.every((citation) => citation.index > 0 && citation.rank > 0 && citation.documentId && citation.documentName && citation.locator && citation.excerpt && Number.isFinite(citation.retrievalScore)), "回答引用应携带排序、文档、位置、摘要与检索分数");
assert.deepEqual(
  {
    model: defaultRetrievalRun.generationSnapshot.model,
    temperature: defaultRetrievalRun.generationSnapshot.temperature,
    citationsEnabled: defaultRetrievalRun.generationSnapshot.citationsEnabled,
    sourceEvidenceCount: defaultRetrievalRun.generationSnapshot.sourceEvidenceCount,
    status: defaultRetrievalRun.generationSnapshot.status,
    simulated: defaultRetrievalRun.generationSnapshot.simulated,
  },
  { model: "DeepSeek-V4-Pro", temperature: 0.2, citationsEnabled: true, sourceEvidenceCount: 3, status: "completed", simulated: true },
  "回答生成快照应固化系统模型、温度、引用能力、证据数与模拟状态"
);
assert.ok(defaultRetrievalRun.generationSnapshot.generatedAt, "回答生成快照应记录生成时间");
assert.ok(["faithfulness", "answerRelevance", "citationCoverage", "generationLatencyMs"].every((key) => Object.prototype.hasOwnProperty.call(defaultRetrievalRun.answerMetrics, key)), "普通检索测试应生成忠实度、答案相关性、引用覆盖率与生成时延指标");
assert.ok(defaultRetrievalRun.executionStages.includes("answer_generation") && defaultRetrievalRun.executionStages.includes("answer_evaluation"), "开启回答生成时执行阶段应包含生成与回答评测");
const retrievalCompletedHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", run: "1" } }, state);
assert.match(retrievalCompletedHtml, /aria-label="生成回答"[\s\S]*class="retrieval-generated-answer"[\s\S]*aria-label="回答引用"[\s\S]*data-evidence-jump="1"/, "运行后应在检索证据之前展示生成回答及可定位引用");
assert.match(retrievalCompletedHtml, /返回切片数<\/span><strong>3[\s\S]*有效证据数<\/span><strong>3[\s\S]*证据覆盖度<\/span><strong>100%[\s\S]*结果相关性<\/span><strong>100%/, "点击检索后应以四项运营指标解释模拟结果");
assert.match(retrievalCompletedHtml, /海岳电子供应商框架合同/, "运行后应展示本库模拟证据");
assert.match(retrievalCompletedHtml, /相关度<\/span><strong>0\.94<\/strong><small>重排分<\/small>[\s\S]*相关度<\/span><strong>0\.92<\/strong><small>重排分<\/small>[\s\S]*相关度<\/span><strong>0\.86<\/strong><small>重排分<\/small>/, "每条返回证据应展示本次用于排序和过滤的重排分");
assert.doesNotMatch(retrievalCompletedHtml, /retrieval-run-snapshot|本次检索配置|本次检索方式：|召回候选数：/, "运行结果不应重复展示侧栏已有的检索配置");
const kb2RetrievalHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-002" } }, state);
assert.doesNotMatch(kb2RetrievalHtml, /海岳电子|Q3 交付风险/, "V2 检索测试应按知识库隔离问题与证据");
assert.match(kb2RetrievalHtml, /retrieval-chat-empty[\s\S]*开始一次完整 RAG 测试/, "切换知识库后仍应从主对话空状态开始");
assert.match(kb2RetrievalHtml, />东盟原产地规则更新后，出口申报需要补充哪些证明材料？<\/textarea>/, "KB-002 只应在输入框中预填自身问题");
const kb2Run = actions.runRetrievalTest({ knowledgeBaseId: "KB-002", question: "东盟原产地规则更新后，出口申报需要补充哪些证明材料？" });
const kb2CompletedHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-002", run: "1" } }, state);
assert.ok(kb2Run && kb2Run.knowledgeBaseId === "KB-002", "KB-002 应独立执行检索");
assert.match(kb2CompletedHtml, /2026 年东盟原产地规则更新/, "KB-002 运行后应展示自身模拟证据");
assert.match(kb2CompletedHtml, /返回切片数<\/span><strong>2[\s\S]*有效证据数<\/span><strong>2[\s\S]*证据覆盖度<\/span><strong>100%[\s\S]*结果相关性<\/span><strong>100%/, "KB-002 应基于自身证据独立计算运营指标");

assert.equal(state.knowledgeBases.some((item) => item.id === "KB-EVAL-SCIFACT"), false, "种子状态不应再包含预置评测知识库");
assert.equal(state.documents.some((item) => String(item.id || "").startsWith("SF-DOC-")), false, "种子状态不应再包含预置评测语料");
assert.equal(state.rag.retrievalTests.some((item) => String(item.id || "").includes("SCIFACT")), false, "检索测试不应再包含预置评测任务");
assert.doesNotMatch(retrievalWorkspaceHtml, /预置评测题|Recall@|Precision@|MRR@|答案正确性/, "通用检索测试不应展示评测库专属控件或指标");
assert.doesNotMatch(retrievalQuestionTag, /\breadonly\b/, "通用检索问题应始终允许编辑");
assert.deepEqual(Object.keys(defaultRetrievalRun.answerMetrics).sort(), ["answerRelevance", "citationCoverage", "faithfulness", "generationLatencyMs"], "回答质量只应保留通用的四项指标");
const invalidKnowledgeWorkspaceHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "DOES-NOT-EXIST" } }, state);
const fallbackRetrievalTest = state.rag.retrievalTests[0];
assert.equal(fallbackRetrievalTest.knowledgeBaseId, "KB-SCM-2024-V1", "供应链演示检索题应排在预置检索测试第一位");
assert.match(invalidKnowledgeWorkspaceHtml, /data-retrieval-kb-option="KB-SCM-2024-V1"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-retrieval-kb-option="KB-SCM-2024-V1"/, "无效知识库 URL 应回退到首个可用预置测试");
const processingModes = ["smart", "semantic", "structure", "separator", "fixed", "page", "whole_document"];
const visibleProcessingPresets = state.rag.ingestionProfiles.filter((profile) => profile.visible !== false && profile.chunking);
assert.ok(processingModes.every((mode) => visibleProcessingPresets.some((profile) => profile.chunking.mode === mode)), "代码预置方案应覆盖自动、语义及结构、分隔符、固定长度、按页和整篇五种自定义方式");
assert.equal(visibleProcessingPresets.length, 7, "新流程应提供两个顶层方案与五个自定义方法对应的七个代码预置");
assert.deepEqual(visibleProcessingPresets.slice().sort((left, right) => left.displayOrder - right.displayOrder).map((profile) => profile.id), ["ING-01", "ING-SEMANTIC", "ING-STRUCTURE", "ING-SEPARATOR", "ING-FIXED", "ING-PAGE", "ING-WHOLE"], "七个可见预置应使用稳定顺序支撑 3+5 信息层级");
assert.deepEqual(processingModes.slice(2).map((mode) => visibleProcessingPresets.find((profile) => profile.chunking.mode === mode).displayOrder), [3, 4, 5, 6, 7], "五个自定义预置应依次使用 displayOrder 3–7");
const fixedProfile = state.rag.ingestionProfiles.find((profile) => profile.id === "ING-FIXED");
assert.ok(fixedProfile && fixedProfile.chunking.mode === "fixed", "ING-FIXED 应作为正式固定长度算法预置");
assert.equal(fixedProfile.displayGroup, "primary", "固定长度应进入主预置组");
assert.equal(fixedProfile.visible, true, "固定长度应进入新的策略选择界面");
const legacyRecursivePreset = state.rag.ingestionProfiles.find((profile) => profile.id === "ING-RECURSIVE");
assert.ok(legacyRecursivePreset && legacyRecursivePreset.chunking.mode === "recursive", "ING-RECURSIVE 应保留旧模式以迁移历史快照");
assert.equal(legacyRecursivePreset.displayGroup, "internal", "旧递归预置应移入内部兼容组");
assert.equal(legacyRecursivePreset.visible, false, "旧递归预置不得进入新的策略选择界面");
const legacyLongDocumentPreset = state.rag.ingestionProfiles.find((profile) => profile.id === "ING-02");
assert.equal(legacyLongDocumentPreset.displayGroup, "internal", "ING-02 应明确标记为内部兼容预置");
assert.equal(visibleProcessingPresets.some((profile) => profile.id === "ING-02"), false, "ING-02 应保留既有数据兼容，但不进入新流程候选");
assert.equal(state.rag.ingestionProfiles.find((profile) => profile.id === "ING-01").chunking.usesSemanticModel, false, "自动切片应明确只组合结构、递归和长度兜底，不静默启用语义模型");
assert.equal(typeof actions.createDocumentProcessingProfile, "undefined", "运营动作层不应暴露新建文档处理策略能力");
assert.equal(typeof actions.updateDocumentProcessingProfile, "undefined", "运营动作层不应暴露编辑共享文档处理策略能力");
assert.equal(typeof actions.cloneDocumentProcessingProfile, "undefined", "运营动作层不应暴露复制共享文档处理策略能力");
assert.equal(typeof actions.setDocumentProcessingProfileEnabled, "undefined", "运营动作层不应暴露启停共享文档处理策略能力");
const imageAwarePreset = structuredClone(legacyLongDocumentPreset);
const compatibleWithDefaultParse = actions.getProcessingProfileCompatibility(imageAwarePreset, {
  effort: "high",
  tableEnabled: true,
  imageAnalysisEnabled: true,
  parseMethod: "auto",
});
assert.equal(compatibleWithDefaultParse.compatible, true, "精细解析且所需能力开启时，启用策略应可选");
const missingImageOutput = actions.getProcessingProfileCompatibility(imageAwarePreset, {
  effort: "medium",
  tableEnabled: true,
  imageAnalysisEnabled: false,
  parseMethod: "txt",
});
assert.equal(missingImageOutput.compatible, true, "解析产物缺项不应整卡禁用已启用的文档处理策略");
assert.equal(missingImageOutput.completeOutput, false, "解析产物缺项应作为结果完整度提示保留");
assert.deepEqual(missingImageOutput.missing, ["图片 / 图表内容理解"], "完整度提示应返回本次不会进入索引的合并视觉内容");
const ocrOnlyImageOutput = actions.getProcessingProfileCompatibility(imageAwarePreset, {
  effort: "medium",
  tableEnabled: true,
  imageAnalysisEnabled: false,
  parseMethod: "ocr",
});
assert.deepEqual(ocrOnlyImageOutput.missing, ["图片 / 图表内容理解"], "全文 OCR 只负责文字提取，不应冒充图片\/图表内容理解");
const commonProcessingProfile = state.rag.ingestionProfiles.find((item) => item.id === "ING-01");
const commonProfileCompatibility = actions.getProcessingProfileCompatibility(commonProcessingProfile, {
  effort: "medium",
  tableEnabled: true,
  imageAnalysisEnabled: false,
  parseMethod: "auto",
});
assert.equal(commonProfileCompatibility.compatible, true, "通用文档处理策略在标准解析下必须可选");
const kb3Seed = state.knowledgeBases.find((item) => item.id === "KB-003");
const kb3SeedProfile = state.rag.ingestionProfiles.find((item) => item.id === kb3Seed.currentIngestionProfileId);
assert.equal(actions.getProcessingProfileCompatibility(kb3SeedProfile, kb3Seed.mineruParseConfig).compatible, true, "种子知识库绑定的处理策略必须与 MinerU 默认输出兼容");
const seedParseSave = actions.setKnowledgeBaseOnboardingConfig("KB-001", { mineruParseConfig: Object.assign({}, state.knowledgeBases.find((item) => item.id === "KB-001").mineruParseConfig) });
assert.ok(seedParseSave, "旧知识库即使没有本次处理参数快照，也应能保存后续导入解析配置");
const processingCatalogHtml = pages.rag.render({ name: "document-processing", id: null, query: {} }, state);
assert.doesNotMatch(processingCatalogHtml, /文档处理策略|data-processing-(?:new|detail|preview|toggle)/, "旧地址不得继续呈现独立文档处理策略目录或管理动作");
assert.equal(typeof actions.applyDocumentProcessingProfile, "undefined", "处理策略不得提供从策略目录反向应用到知识库的动作");
assert.equal(kb3Seed.currentIngestionProfileId, kb3SeedProfile.id, "访问旧地址不得改变知识库已绑定的代码预置方案");

const expectedEmbeddingPresets = [
  { id: "MODEL-EMBEDDING-PRIMARY", alias: "Qwen3-Embedding-8B", dimension: 4096 },
  { id: "MODEL-EMBEDDING-MULTILINGUAL", alias: "Qwen3-Embedding-4B", dimension: 2560 },
  { id: "MODEL-EMBEDDING-LONGTEXT", alias: "bge-m3", dimension: 1024 },
];
const expectedLlmPresets = [
  { id: "MODEL-LLM-DEEPSEEK-V4-PRO", alias: "DeepSeek-V4-Pro" },
  { id: "MODEL-LLM-QWEN3-8-MAX", alias: "Qwen3.8-2.4T-A95B" },
  { id: "MODEL-LLM-QWEN3-5-LARGE", alias: "Qwen3.5-397B-A17B" },
];
assert.deepEqual(state.rag.modelCatalog.llmModels.map(({ id, alias }) => ({ id, alias })), expectedLlmPresets, "种子 LLM 应提供 DeepSeek V4 和两个 Qwen 预置");
assert.deepEqual(state.rag.modelCatalog.embeddingModels.map(({ id, alias, dimension }) => ({ id, alias, dimension })), expectedEmbeddingPresets, "种子向量模型应使用确认后的官方名称及默认维度");
assert.deepEqual(state.rag.modelCatalog.rerankerModels.map((item) => item.alias), ["Qwen3-Reranker-0.6B", "Qwen3-Reranker-4B", "bge-reranker-v2-m3", "jina-reranker-v3.5"], "种子 Rerank 模型应使用指定版本，并保留 Qwen 官方型号的大写 B");
const allSeedModels = state.rag.modelCatalog.llmModels.concat(state.rag.modelCatalog.embeddingModels, state.rag.modelCatalog.rerankerModels);
assert.ok(allSeedModels.every((item) => !Object.prototype.hasOwnProperty.call(item, "version")), "官方型号中的版本名应完整保留，数据契约不应另设版本字段");
assert.ok(allSeedModels.every((item) => item.connectionStatus === "available"), "十个预置模型默认均应可用于演示配置");
assert.ok(state.rag.modelCatalog.llmModels.every((item) => !Object.prototype.hasOwnProperty.call(item, "parameterCountB") && !Object.prototype.hasOwnProperty.call(item, "activeParameterCountB") && !Object.prototype.hasOwnProperty.call(item, "parameters")), "LLM 种子数据不应保留参数规模字段");
assert.ok(state.rag.modelCatalog.embeddingModels.every((item) => Number.isFinite(item.dimension) && item.dimension > 0), "每个向量模型都应明确向量维度");
assert.ok(state.rag.modelCatalog.rerankerModels.every((item) => !Object.prototype.hasOwnProperty.call(item, "dimension") && !Object.prototype.hasOwnProperty.call(item, "capability")), "Rerank 模型不应保留向量维度、规格或用途字段");
assert.ok(allSeedModels.every((item) => {
  const keys = Object.keys(item.apiConfig || {}).sort();
  return keys.join(",") === "apiKeyMasked,endpoint" && item.connectionStatus && Object.prototype.hasOwnProperty.call(item, "lastTestAt");
}), "LLM、向量与 Rerank API 配置仅保存地址和脱敏 API Key，连接结果统一使用 connectionStatus 与 lastTestAt");

expectedEmbeddingPresets.forEach((expected) => {
  const preset = state.rag.modelCatalog.embeddingModels.find((item) => item.id === expected.id);
  const testedPreset = actions.testRagModelDraft({ id: preset.id, apiConfig: preset.apiConfig });
  assert.equal(testedPreset.dimension, expected.dimension, `${preset.alias} 编辑测试应保留正确维度`);
  const testedNewEndpoint = actions.testRagModelDraft({ kind: "embedding", apiConfig: { endpoint: preset.apiConfig.endpoint, apiKey: "preset-dimension-check" } });
  assert.equal(testedNewEndpoint.dimension, expected.dimension, `${preset.alias} 的服务地址应能独立识别维度`);
  const savedPreset = actions.saveRagModel({ id: preset.id, name: preset.alias, apiConfig: preset.apiConfig });
  assert.equal(savedPreset.dimension, expected.dimension, `${preset.alias} 编辑保存后不得回退到其他维度`);
});

const disposableLlm = actions.saveRagModel({
  kind: "llm",
  name: "临时分析生成模型",
  apiConfig: { endpoint: "model-gateway.internal/v1/disposable-chat", apiKey: "llm-key-C6N8" },
});
assert.ok(disposableLlm, "LLM 应在不提供参数规模时通过统一测试与保存流程");
assert.equal(Object.prototype.hasOwnProperty.call(disposableLlm, "parameters"), false, "新增 LLM 不应写入参数规模字段");
assert.equal(actions.deleteRagModel("llm", disposableLlm.id), disposableLlm, "未被回答生成使用的 LLM 应允许删除");
assert.equal(actions.deleteRagModel("llm", "MODEL-LLM-DEEPSEEK-V4-PRO"), null, "默认回答生成使用的 LLM 不得删除");
assert.ok(actions.getRagModelUsage("llm", "MODEL-LLM-DEEPSEEK-V4-PRO").some((item) => item.type === "answer_generation"), "LLM 引用保护应返回默认回答生成配置");

const embeddingDraftPayload = {
  kind: "embedding",
  name: "采购语义向量模型",
  apiConfig: {
    endpoint: "model-gateway.internal/v1/procurement-multilingual-embeddings",
    apiKey: "demo-secret-K8P2",
  },
};
const embeddingCountBeforeDraftTest = state.rag.modelCatalog.embeddingModels.length;
const testedEmbeddingDraft = actions.testRagModelDraft(embeddingDraftPayload);
assert.equal(testedEmbeddingDraft.connectionStatus, "available", "模型草稿应能在保存前独立测试连通性");
assert.equal(testedEmbeddingDraft.dimension, 768, "连接向量服务后应读取向量维度，不由运营人员手工填写");
assert.equal(state.rag.modelCatalog.embeddingModels.length, embeddingCountBeforeDraftTest, "草稿测试不得提前写入模型目录");
const createdRagModel = actions.saveRagModel(embeddingDraftPayload);
assert.ok(createdRagModel, "新增模型保存时应自动复测并写入目录");
assert.equal(createdRagModel.connectionStatus, "available", "只有自动复测通过的模型才能保存");
assert.equal(Object.prototype.hasOwnProperty.call(createdRagModel.apiConfig, "apiKey"), false, "模型 API 配置不得保存明文密钥");
assert.equal(JSON.stringify(createdRagModel).includes("demo-secret-K8P2"), false, "状态中只应保留模型密钥脱敏值");
const editedRagModel = actions.saveRagModel({
  id: createdRagModel.id,
  kind: "embedding",
  name: "采购与合同语义向量模型",
  apiConfig: {
    endpoint: "model-gateway.internal/v2/procurement-longtext-embeddings",
    apiKey: "replacement-secret-P3K9",
  },
});
assert.equal(editedRagModel, createdRagModel, "新增与编辑应复用同一保存动作并原地更新对象");
assert.equal(createdRagModel.alias, "采购与合同语义向量模型", "统一保存动作应更新模型基础信息");
assert.equal(createdRagModel.dimension, 1536, "统一保存动作应使用服务连接返回的向量维度");
assert.equal(createdRagModel.apiConfig.endpoint, "model-gateway.internal/v2/procurement-longtext-embeddings", "统一保存动作应更新 API 地址");
assert.equal(createdRagModel.connectionStatus, "available", "编辑保存也必须自动复测并保持可用");
assert.equal(JSON.stringify(createdRagModel).includes("replacement-secret-P3K9"), false, "编辑模型时也不得把明文 API Key 写入状态");
const failedDraftTest = actions.testRagModelDraft({
  id: createdRagModel.id,
  kind: "embedding",
  apiConfig: { endpoint: "invalid-model.internal/v1/embeddings" },
});
assert.equal(failedDraftTest.connectionStatus, "failed", "草稿测试应返回连接失败结果供表单阻止保存");
assert.equal(actions.saveRagModel({
  id: createdRagModel.id,
  kind: "embedding",
  apiConfig: { endpoint: "invalid-model.internal/v1/embeddings" },
}), null, "自动复测失败时不得保存模型配置");
assert.equal(createdRagModel.apiConfig.endpoint, "model-gateway.internal/v2/procurement-longtext-embeddings", "保存失败不得污染现有配置");
actions.testRagModelConnection("embedding", createdRagModel.id, { simulateFailure: true });
assert.equal(createdRagModel.connectionStatus, "failed", "列表快捷测试应能更新统一连接状态");
assert.ok(createdRagModel.lastTestAt, "列表快捷测试应记录最近测试时间");
actions.testRagModelConnection("embedding", createdRagModel.id);
assert.equal(createdRagModel.connectionStatus, "available", "重新测试通过后模型应恢复可用");
assert.equal(actions.deleteRagModel("embedding", "MODEL-EMBEDDING-PRIMARY"), null, "被知识库引用的向量模型不得删除");
assert.ok(actions.getRagModelUsage("embedding", "MODEL-EMBEDDING-PRIMARY").some((item) => item.type === "knowledge_base"), "引用保护应返回绑定该向量模型的知识库");
const disposableReranker = actions.saveRagModel({
  kind: "reranker",
  name: "临时验证精排模型",
  apiConfig: {
    endpoint: "model-gateway.internal/v1/disposable-rerank",
    apiKey: "disposable-key-E7M3",
  },
});
assert.deepEqual(actions.getRagModelUsage("reranker", disposableReranker.id), [], "未被检索配置引用的新模型应可安全删除");
assert.equal(actions.deleteRagModel("reranker", disposableReranker.id), disposableReranker, "未被引用的模型应支持删除");
assert.equal(state.rag.modelCatalog.rerankerModels.includes(disposableReranker), false, "删除后模型应从目录移除");

const untestedReranker = actions.saveRagModel({
  kind: "reranker",
  name: "采购语义精排模型",
  apiConfig: {
    endpoint: "model-gateway.internal/v1/procurement-rerank",
    apiKey: "rerank-secret-R2Q8",
  },
});
assert.equal(Object.prototype.hasOwnProperty.call(untestedReranker, "capability"), false, "新增 Rerank 模型不应保存规格或用途");
actions.testRagModelConnection("reranker", untestedReranker.id, { simulateFailure: true });
assert.equal(actions.previewRetrievalSettings({ rerankerModelId: untestedReranker.id }), null, "连接失败的 Rerank 模型不得用于检索设置预览");
actions.testRagModelConnection("reranker", untestedReranker.id);
const rerankerPreview = actions.previewRetrievalSettings({
  rerankEnabled: true,
  rerankerModelId: untestedReranker.id,
});
assert.ok(rerankerPreview, "通过连通性测试的 Rerank 模型应可用于临时检索设置");
assert.equal(rerankerPreview.operator.rerankerModelId, untestedReranker.id, "临时设置应只保存已验证模型 ID");
assert.equal(state.rag.retrievalSettings.operator.rerankerModelId, "MODEL-RERANK-PRIMARY", "预览设置不得改写已保存的全局检索设置");
const previewRetrievalHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", settings: "preview" } }, state);
assert.match(previewRetrievalHtml, /采购语义精排模型/, "检索测试应继续载入配置页传入的临时 Rerank 模型");
assert.doesNotMatch(previewRetrievalHtml, /配置页临时参数|data-use-online-settings|恢复全局设置/, "检索测试不应额外展示临时参数来源或恢复入口");
assert.match(previewRetrievalHtml, /retrieval-chat-empty[\s\S]*开始一次完整 RAG 测试/, "切换到尚未运行的临时参数时主对话仍应展示空状态");
assert.doesNotMatch(previewRetrievalHtml, /class="evidence-item"/, "临时设置首次运行前不得展示来自其他设置快照的证据");
const previewRunResult = actions.runRetrievalTest({ knowledgeBaseId: "KB-001", question: "验证临时检索设置", useDraft: true });
assert.equal(previewRunResult.runtimeSnapshot.source, "preview", "使用临时设置运行时应固化 preview 来源");
assert.equal(previewRunResult.runtimeSnapshot.operator.rerankerModelId, untestedReranker.id, "运行快照应固化本次使用的 Rerank 模型");
assert.ok(previewRunResult.comparison.lastRunAt && previewRunResult.comparisons[0].settingsKey === "preview", "临时设置首次运行应保存指标、时间与设置来源");
actions.clearRetrievalTestDraft();

const primaryReranker = state.rag.modelCatalog.rerankerModels.find((item) => item.id === "MODEL-RERANK-PRIMARY");
assert.equal(actions.deleteRagModel("reranker", primaryReranker.id), null, "被全局检索设置引用的 Rerank 模型不得删除");
assert.ok(actions.getRagModelUsage("reranker", primaryReranker.id).some((item) => item.type === "retrieval_settings"), "引用保护应返回使用该 Rerank 模型的全局检索设置");
actions.testRagModelConnection("reranker", primaryReranker.id, { simulateFailure: true });
assert.equal(primaryReranker.connectionStatus, "failed", "Rerank 快捷测试失败后全局检索设置应识别模型不可用");
assert.equal(actions.runRetrievalTest({ testId: "RT-001", knowledgeBaseId: "KB-001" }), null, "全局设置引用不可用 Rerank 模型时不得运行检索测试");
assert.equal(actions.updateRetrievalSettings({ rerankEnabled: true, rerankerModelId: primaryReranker.id }), null, "不可用 Rerank 模型不得被重新保存到全局检索设置");
const unavailableRerankerConfigHtml = pages.rag.render({ name: "retrieval-config", id: null, query: {} }, state);
const availableRerankerOptionsHtml = unavailableRerankerConfigHtml.match(/<select\b[^>]*id="retrieval-reranker-model"[^>]*>([\s\S]*?)<\/select>/)?.[1] || "";
assert.doesNotMatch(availableRerankerOptionsHtml, /value="MODEL-RERANK-PRIMARY"/, "全局检索设置的模型选项应排除连接不可用的 Rerank 模型");
assert.match(availableRerankerOptionsHtml, new RegExp(`value="${untestedReranker.id}"`), "全局检索设置应保留其他已通过连通性测试的 Rerank 模型");
const unavailableRerankerWorkspaceHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001" } }, state);
assert.doesNotMatch(unavailableRerankerWorkspaceHtml, /当前 Rerank 模型连接不可用|id="test-question-v2"[^>]*disabled/, "全局 Rerank 模型异常时不应锁死问题输入，用户可切换模型或关闭 Rerank");
assert.match(unavailableRerankerWorkspaceHtml, /data-test-rerank-toggle[\s\S]*id="test-reranker-model"[\s\S]*采购语义精排模型/, "检索测试应继续提供 Rerank 开关和其他已测通模型");
actions.testRagModelConnection("reranker", primaryReranker.id);
assert.equal(primaryReranker.connectionStatus, "available", "Rerank 模型重新连通后全局检索设置应恢复可测试状态");
const noRerankPreview = actions.previewRetrievalSettings({
  rerankEnabled: false,
  finalTopK: 5,
  relevanceThreshold: 0.8,
});
assert.ok(noRerankPreview && noRerankPreview.operator.rerankEnabled === false, "V2 临时检索设置应支持显式关闭 Rerank");
const noRerankPreviewHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", settings: "preview" } }, state);
const noRerankPreviewModelTag = noRerankPreviewHtml.match(/<select\b[^>]*id="test-reranker-model"[^>]*>/)?.[0] || "";
assert.match(noRerankPreviewHtml, /aria-checked="false"[\s\S]*data-test-rerank-fields[\s\S]*id="test-final-topk"[^>]*value="5"[\s\S]*id="test-relevance"[^>]*type="number"[^>]*value="0\.80"[^>]*aria-valuetext="相关度阈值 0\.80，严格"/, "临时关闭 Rerank 时应保留模型字段并继续以两位小数回显 Top K 与 0.80 门槛");
assert.doesNotMatch(noRerankPreviewHtml, /data-test-rerank-fields[^>]*hidden/, "临时关闭 Rerank 时模型字段不应消失");
assert.match(noRerankPreviewModelTag, /\bdisabled\b/, "临时关闭 Rerank 时模型选择应不可操作");
assert.doesNotMatch(noRerankPreviewModelTag, /\brequired\b|aria-required/, "临时关闭 Rerank 时模型不应保留必填语义");
assert.doesNotMatch(noRerankPreviewHtml, /test-rerank-candidates|单文件最多返回/, "检索测试不应暴露系统候选规模或单文件限制");
const noRerankRunResult = actions.runRetrievalTest({ knowledgeBaseId: "KB-001", question: "验证不使用 Rerank 的临时设置", useDraft: true });
assert.equal(noRerankRunResult.runtimeSnapshot.operator.rerankEnabled, false, "检索测试快照应保留本次 Rerank 关闭状态");
assert.equal(noRerankRunResult.runtimeSnapshot.operator.relevanceThreshold, 0.8, "检索测试快照应固化本次最低相关度");
assert.equal(noRerankRunResult.runtimeSnapshot.scoreSource, "fusion", "Rerank 关闭时应固化融合分为本次结果分数来源");
assert.deepEqual(noRerankRunResult.evidence.map((item) => item.retrievalScore), [0.91, 0.89], "Rerank 关闭且门槛为 0.8 时应只保留满足门槛的融合分");
assert.equal(noRerankRunResult.executionStages.includes("rerank"), false, "Rerank 关闭时执行阶段不应包含重排");
actions.clearRetrievalTestDraft();

const globalOperatorBeforeQuickRun = JSON.stringify(state.rag.retrievalSettings.operator);
const quickRunResult = actions.runRetrievalTest({
  knowledgeBaseId: "KB-001",
  question: "验证测试页快捷参数不会改写全局设置",
  operatorOverrides: {
    rerankEnabled: false,
    rerankerModelId: null,
    finalTopK: 5,
    relevanceThreshold: 0.9,
  },
});
assert.ok(quickRunResult && quickRunResult.runtimeSnapshot.source === "test", "测试页快捷参数应固化为 test 来源快照");
assert.equal(quickRunResult.comparisons[0].settingsKey, "test", "测试页快捷参数运行指标应记录 test 设置来源");
assert.equal(quickRunResult.executionStages.includes("rerank"), false, "测试页关闭 Rerank 后执行阶段不应包含重排");
assert.deepEqual(quickRunResult.evidence.map((item) => item.retrievalScore), [0.91], "最低相关度 0.9 应按融合分只保留一条证据");
assert.equal(JSON.stringify(state.rag.retrievalSettings.operator), globalOperatorBeforeQuickRun, "测试页快捷参数不得改写全局检索设置");
const quickRunHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", settings: "test", run: "1" } }, state);
const quickRunModelTag = quickRunHtml.match(/<select\b[^>]*id="test-reranker-model"[^>]*>/)?.[0] || "";
assert.match(quickRunHtml, /aria-checked="false"[\s\S]*data-test-rerank-fields[\s\S]*id="test-final-topk"[^>]*value="5"[\s\S]*id="test-relevance"[^>]*type="number"[^>]*value="0\.90"[^>]*aria-valuetext="相关度阈值 0\.90，严格"/, "运行后应以两位小数回显本次快捷参数和 0.90 门槛，并常显 Rerank 模型字段");
assert.doesNotMatch(quickRunHtml, /data-test-rerank-fields[^>]*hidden/, "运行后关闭 Rerank 时模型字段不应消失");
assert.match(quickRunModelTag, /\bdisabled\b/, "运行后关闭 Rerank 时模型选择应不可操作");
assert.doesNotMatch(quickRunModelTag, /\brequired\b|aria-required/, "运行后关闭 Rerank 时模型不应保留必填语义");
assert.match(quickRunHtml, /相关度<\/span><strong>0\.91<\/strong><small>融合分<\/small>/, "快捷参数运行结果应展示本次真正用于排序和过滤的融合分");
assert.doesNotMatch(quickRunHtml, /retrieval-run-snapshot|本次检索配置|本次检索方式：|召回候选数：/, "快捷参数运行结果也不应重复展示配置快照");

const retrievalOnlyRun = actions.runRetrievalTest({
  knowledgeBaseId: "KB-001",
  question: "验证关闭回答生成后只执行检索",
  generateAnswer: false,
});
assert.equal(retrievalOnlyRun.answerGenerated, false, "关闭回答生成时不得生成回答");
assert.equal(retrievalOnlyRun.generatedAnswer, "", "关闭回答生成时回答正文应为空");
assert.deepEqual(retrievalOnlyRun.answerCitations, [], "关闭回答生成时不得生成引用");
assert.equal(retrievalOnlyRun.generationSnapshot, null, "关闭回答生成时不得生成模型运行快照");
assert.equal(retrievalOnlyRun.answerMetrics, null, "关闭回答生成时不得生成回答质量指标");
assert.equal(retrievalOnlyRun.executionStages.includes("answer_generation"), false, "关闭回答生成时执行阶段不应包含回答生成");
assert.equal(retrievalOnlyRun.executionStages.includes("answer_evaluation"), false, "关闭回答生成时执行阶段不应包含回答评测");
const retrievalOnlyHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", run: "1" } }, state);
assert.doesNotMatch(retrievalOnlyHtml, /aria-label="生成回答"|aria-label="回答引用"/, "只检索模式运行后不应渲染回答或引用消息");
assert.match(retrievalOnlyHtml, /class="retrieval-message retrieval-message--result"[\s\S]*class="evidence-item"/, "只检索模式仍应展示检索证据");
assert.match(retrievalOnlyHtml, /data-test-answer-toggle[^>]*aria-checked="false"|aria-checked="false"[^>]*data-test-answer-toggle/, "只检索模式运行后回答生成开关应回显关闭");
assert.match(retrievalOnlyHtml, /data-test-answer-fields[^>]*aria-disabled="true"[\s\S]*data-test-answer-model[^>]*disabled/, "只检索模式运行后回答模型应常显但不可操作");
assert.match(retrievalOnlyHtml, /data-answer-quality hidden/, "关闭回答生成后应隐藏回答质量板块");
assert.match(retrievalOnlyHtml, /retrieval-quality-dashboard is-retrieval-only[\s\S]*检索质量/, "关闭回答生成后检索质量仍应保持展示");

const knowledgeCreateHtml = pages.knowledge.render({ name: "knowledge", id: "new", query: {} }, state);
assert.equal((knowledgeCreateHtml.match(/class="creation-step(?:\s|is-|\")/g) || []).length, 4, "定义页应只渲染一组四步进度");
assert.equal((knowledgeCreateHtml.match(/class="form-required-mark"/g) || []).length, 3, "定义知识库的名称、描述与向量模型应统一显示必填星号");
assert.match(knowledgeCreateHtml, /id="kb-name"[^>]*required aria-required="true"[\s\S]*id="kb-purpose"[^>]*required aria-required="true"[\s\S]*id="kb-vector"[^>]*required aria-required="true"/, "必填星号必须与浏览器必填及无障碍语义同步");
assert.doesNotMatch(knowledgeCreateHtml, /kb-access|访问等级|权限等级/, "知识库创建不应配置权限等级");
assert.match(knowledgeCreateHtml, new RegExp(`value="${createdRagModel.id}"[^>]*data-dimension="1536"`), "新增且连通成功的向量模型应携带服务读取的维度并直接成为建库选项");
assert.match(knowledgeCreateHtml, /creation-model-row[\s\S]*id="kb-vector"[\s\S]*id="kb-vector-dimension"/, "向量模型和向量维度应在同一横向行内");
assert.match(knowledgeCreateHtml, /data-create-cancel[\s\S]*data-create-only[\s\S]*data-create-and-import/, "定义页应提供取消、仅创建和创建并导入三个明确动作");
const readyEmbeddingModels = state.rag.modelCatalog.embeddingModels.filter((item) => item.status === "available");
readyEmbeddingModels.forEach((item) => { item.status = "untested"; item.statusLabel = "待测试"; });
const noEmbeddingCreateHtml = pages.knowledge.render({ name: "knowledge", id: "new", query: {} }, state);
assert.match(noEmbeddingCreateHtml, /暂无可用向量模型[\s\S]*前往模型管理/, "无已测试向量模型时建库页应给出明确处置入口");
assert.match(noEmbeddingCreateHtml, /data-vector-dimension-field hidden[\s\S]*data-vector-dimension><\/div>[\s\S]*data-create-only[^>]*disabled[\s\S]*data-create-and-import[^>]*disabled/, "无可用向量模型时维度应隐藏并禁止创建");
readyEmbeddingModels.forEach((item) => { item.status = "available"; item.statusLabel = "可用"; });
const modelSourcedKnowledgeBase = actions.createKnowledgeBase({
  name: "采购模型直接建库",
  purpose: "验证建库模型选项直接来自模型管理。",
  embeddingModelId: createdRagModel.id,
});
assert.equal(modelSourcedKnowledgeBase.boundEmbeddingModelId, createdRagModel.id, "新增并测通的向量模型应可在建库时直接绑定");
assert.equal(modelSourcedKnowledgeBase.boundVectorDimension, 1536, "建库应从模型台账固化服务读取的向量维度");

modelSourcedKnowledgeBase.enabled = true;
modelSourcedKnowledgeBase.enabledState = "enabled";
modelSourcedKnowledgeBase.enabledStateLabel = "检索已启用";
modelSourcedKnowledgeBase.retrievalStatus = "available";
modelSourcedKnowledgeBase.currentKnowledgeVersionId = "KV-ISOLATED-TEST";
modelSourcedKnowledgeBase.documentCounts.searchable = 1;
const seedRetrievalTest = state.rag.retrievalTests.find((item) => item.id === "RT-001");
const seedRetrievalTestKnowledgeBaseId = seedRetrievalTest.knowledgeBaseId;
const isolatedPreRunHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: modelSourcedKnowledgeBase.id } }, state);
assert.match(isolatedPreRunHtml, /retrieval-chat-empty[\s\S]*开始一次完整 RAG 测试/, "没有测试记录的知识库应从独立空状态开始");
assert.doesNotMatch(isolatedPreRunHtml, /海岳电子|Q3 交付风险/, "新知识库未运行前不得展示其他知识库的问题或证据");
const isolatedRetrievalResult = actions.runRetrievalTest({ knowledgeBaseId: modelSourcedKnowledgeBase.id, question: "这是新知识库的首次独立检索测试吗？" });
assert.ok(isolatedRetrievalResult && isolatedRetrievalResult.id !== seedRetrievalTest.id, "首次运行应为当前知识库创建独立 retrievalTest 对象");
assert.equal(isolatedRetrievalResult.knowledgeBaseId, modelSourcedKnowledgeBase.id, "新测试对象必须绑定当前知识库");
assert.deepEqual(isolatedRetrievalResult.evidence, [], "未配置样例证据的新知识库不得复用其他库证据");
assert.equal(seedRetrievalTest.knowledgeBaseId, seedRetrievalTestKnowledgeBaseId, "新知识库测试不得改写 RT-001 归属");

const primaryEmbedding = state.rag.modelCatalog.embeddingModels.find((item) => item.id === "MODEL-EMBEDDING-PRIMARY");
actions.testRagModelConnection("embedding", primaryEmbedding.id, { simulateFailure: true });
const offlineModelUpload = actions.startKnowledgeImport("KB-001", { files: [{ name: "模型离线时登记.txt", size: 12, sourcePreview: "原文件仍可登记。" }] });
assert.ok(offlineModelUpload, "文件资产登记不必等待目标向量模型恢复");
assert.equal(actions.completeImportProcessing(offlineModelUpload.id, { ingestionProfileId: "ING-01" }), null, "目标向量模型未测通时不能提交入库向量与索引处理");
actions.cancelImportProcessing(offlineModelUpload.id);
assert.equal(actions.retryImportItem("IMP-0825-03", "IMP-ITEM-001"), null, "向量模型未测通时不得重试会进入向量化的文件");
assert.equal(actions.runRetrievalTest({ testId: "RT-001", knowledgeBaseId: "KB-001", question: "连接异常时能否运行？" }), null, "查询向量模型未测通时不得运行检索测试");
assert.equal(actions.setKnowledgeBaseEnabled("KB-003", true), null, "检索所需模型未测通时不得重新启用知识库");
const embeddingUnavailableDetailHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { tab: "documents" } }, state);
assert.match(embeddingUnavailableDetailHtml, /向量模型连接不可用[\s\S]*前往模型管理/, "知识库详情应基于真实绑定模型状态显示错误和处置入口");
const detailTestAction = embeddingUnavailableDetailHtml.match(/<button[^>]*data-test-kb="KB-001"[^>]*>/)?.[0];
assert.ok(detailTestAction, "知识库详情应始终提供检索测试入口");
assert.doesNotMatch(detailTestAction, /disabled/, "详情页测试入口不应受对外检索状态限制");
actions.testRagModelConnection("embedding", primaryEmbedding.id);
assert.equal(primaryEmbedding.connectionStatus, "available", "向量模型恢复连接后新文件处理与检索可继续");

const seedKnowledgeDetailHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: {} }, state);
assert.doesNotMatch(seedKnowledgeDetailHtml, /page-header__subtitle/, "知识库详情页头只应显示名称，不重复 ID 与描述副标题");
const knowledgeInfoMatch = seedKnowledgeDetailHtml.match(/<section class="panel knowledge-info">[\s\S]*?<\/section>/);
assert.ok(knowledgeInfoMatch, "知识库详情应渲染常驻知识库信息区");
assert.match(knowledgeInfoMatch[0], /知识库 ID[\s\S]*KB-001[\s\S]*描述[\s\S]*向量模型[\s\S]*创建时间[\s\S]*更新时间/, "知识库信息区应包含 ID、描述、模型与时间信息；检索设置由 V2 全局管理");
assert.doesNotMatch(knowledgeInfoMatch[0], /访问等级|权限等级|access-level/, "知识库详情不应展示权限等级");
assert.doesNotMatch(knowledgeInfoMatch[0], /knowledge-info__item--status|<div class="knowledge-info__label">检索状态<\/div>/, "知识库概要不应重复展示与下方检索节点相同的状态标签");
assert.doesNotMatch(knowledgeInfoMatch[0], /文件数量|文档处理策略/, "知识库常驻信息不应重复文件数量或展示文件级处理策略");
assert.match(knowledgeInfoMatch[0], /知识处理与检索状态[\s\S]*文档解析[\s\S]*切片处理[\s\S]*向量化[\s\S]*索引[\s\S]*检索/, "知识库信息第二行应整行展示处理与检索状态链");
assert.match(seedKnowledgeDetailHtml, /<th>文件<\/th>[\s\S]*<th>文件状态<\/th>[\s\S]*<th>切片数<\/th>[\s\S]*<th>更新时间<\/th>[\s\S]*<th>操作<\/th>/, "文件列表应使用单一生命周期、切片数、更新时间与必要操作列");
assert.doesNotMatch(seedKnowledgeDetailHtml, /当前修订|有效等级|<th>页数<\/th>|<th>处理状态<\/th>|<th>检索状态<\/th>/, "文件列表不得展示版本、文件等级、页数或双状态");
assert.match(seedKnowledgeDetailHtml, /data-document-preview="DOC-001"[\s\S]*data-document-delete="DOC-001"/, "文件列表应至少提供预览与删除操作");
assert.match(seedKnowledgeDetailHtml, /data-document-preview="DOC-001"[^>]*>详情<\/button>[\s\S]*data-document-delete="DOC-001"/, "知识库文件列表的行操作应使用详情命名");
assert.match(seedKnowledgeDetailHtml, /data-document-preview="DOC-001"[^>]*>海岳电子供应商框架合同\.pdf<\/[^>]+>/, "文件名称本身应可点击进入预览");
assert.match(seedKnowledgeDetailHtml, /role="tablist"[\s\S]*data-knowledge-content-tab="documents"[^>]*>文件<\/[\s\S]*data-knowledge-content-tab="chunks"[^>]*>切片<\//, "知识库详情应保留文件和切片两个页签");
assert.match(seedKnowledgeDetailHtml, /data-knowledge-content-tab="documents"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-knowledge-content-tab="documents"/, "知识库详情默认应选中文件页签");
assert.doesNotMatch(seedKnowledgeDetailHtml, /knowledge-chunk-(?:quick|all|group)|data-quick-chunk-document-select|data-chunk-full-preview|>全部文件</, "文件页签不应保留全库切片快览入口");

const defaultChunksHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { tab: "chunks" } }, state);
assert.match(defaultChunksHtml, /data-knowledge-content-tab="chunks"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-knowledge-content-tab="chunks"/, "切片页签应准确表达选中状态");
assert.match(defaultChunksHtml, /preview-workspace[\s\S]*data-preview-document-select="KB-001"/, "切片页签应直接复用单文件原文／切片双栏对照");
assert.match(defaultChunksHtml, /<option value="DOC-001" selected>/, "未指定 document 时，切片页签应默认选中当前知识库首个文件");
assert.match(defaultChunksHtml, /全部切片（\d+）[\s\S]*data-chunk-preview-card=/, "切片页签应显示当前单文件的真实切片卡片");
assert.doesNotMatch(defaultChunksHtml, /data-preview-origin|from=chunks|>全部文件<|knowledge-chunk-(?:quick|all|group)|data-quick-chunk-document-select|data-chunk-full-preview/, "切片页签不得汇总多文件切片或保留历史快览标记");

const requestedChunksHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { tab: "chunks", document: "DOC-001" } }, state);
assert.match(requestedChunksHtml, /preview-workspace[\s\S]*<option value="DOC-001" selected>/, "切片页签应按 document 参数选中指定文件并显示对照预览");
assert.doesNotMatch(requestedChunksHtml, />全部文件<|knowledge-chunk-(?:quick|all|group)|data-quick-chunk-document-select|data-chunk-full-preview/, "指定文件后仍不得回到全库聚合切片视图");

const legacyPreviewHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { preview: "DOC-001" } }, state);
assert.match(legacyPreviewHtml, /data-knowledge-content-tab="chunks"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-knowledge-content-tab="chunks"/, "历史 preview 地址应兼容渲染切片页签");
assert.match(legacyPreviewHtml, /preview-workspace[\s\S]*<option value="DOC-001" selected>/, "历史 preview 地址应复用同一单文件对照视图");
const legacyImportsRouteHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { tab: "imports" } }, state);
assert.doesNotMatch(legacyImportsRouteHtml, /导入记录|data-import-continue/, "历史 tab=imports 地址应回到文件详情，不恢复导入记录 UI");
assert.match(legacyImportsRouteHtml, /data-document-preview=/, "历史 tab=imports 地址应兼容显示当前文件列表");

const canonicalDocumentStatuses = new Set(["ready", "parsing", "chunking", "embedding", "indexing", "failed"]);
assert.ok(state.documents.every((item) => canonicalDocumentStatuses.has(item.status) && item.statusLabel && Number.isFinite(item.chunkCount)), "每个文件应提供唯一权威生命周期、状态文案与切片数");
assert.ok(state.documents.every((item) => typeof item.searchable === "boolean"), "searchable 只作为检索能力布尔值，不再渲染第二套状态");

assert.ok(state.knowledgeBases.every((item) => item.createdAt && item.updatedAt), "知识库列表必须有创建时间与更新时间");
assert.ok(state.knowledgeBases.every((item) => item.enabledStateLabel.includes("检索")), "知识库启停应明确表达为检索开关");
assert.equal(state.knowledgeBases.map((item) => item.hint).join(" ").match(/知识版本|候选版本|历史版本|生效版本|待生效/), null, "知识库可见提示应使用文件处理、索引和检索口径");
assert.equal(state.importBatches.flatMap((batch) => [batch.statusLabel, ...batch.items.map((item) => item.statusLabel)]).join(" ").match(/知识版本|候选版本|历史版本|生效版本|待生效/), null, "导入记录状态应表达文件处理或索引结果");
assert.deepEqual(seedPendingIndex.sourceBatchIds, ["IMP-0824-02", "IMP-0825-03"], "内部待生效索引应可追溯至两个导入批次");
assert.equal(seedImportBatch.candidateKnowledgeVersionId, seedPendingIndex.id, "导入批次应关联它参与构建的内部索引事务");
assert.equal(state.importBatches.find((item) => item.id === "IMP-0714-04").resultingKnowledgeVersionId, null, "失败后移除的批次不应产生可检索索引");
const unresolvedImportIssues = state.overview.pendingItems.filter((item) => !item.resolved);
assert.deepEqual(unresolvedImportIssues.map((item) => item.id), ["TODO-001"], "底层异常聚合只应保留真实的导入失败");
assert.ok(unresolvedImportIssues.every((item) => item.severity === "error"), "底层待处理项必须是真实错误");

const createdKnowledgeBase = actions.createKnowledgeBase({
  name: "测试长文档库",
  purpose: "验证创建流程的数据契约。",
  ingestionProfileId: "ING-02",
});
assert.equal(createdKnowledgeBase.currentIngestionProfileId, null, "新建知识库不应预绑默认文档处理策略，第 4 步必须显式选择");
assert.equal(createdKnowledgeBase.boundEmbeddingModelId, "MODEL-EMBEDDING-PRIMARY", "知识库应独立固化第 1 步选择的向量模型");
assert.equal(createdKnowledgeBase.boundVectorDimension, 4096, "知识库应独立固化向量维度");
assert.equal(createdKnowledgeBase.mineruParseConfig.returnImages, true, "新建知识库应默认保存原图且不依赖页面选项");
assert.ok(createdKnowledgeBase.createdAt && createdKnowledgeBase.updatedAt, "新建知识库应写入创建与更新时间");
assert.equal(state.rag.ingestionProfiles.some((item) => (item.usedByKnowledgeBaseIds || []).includes(createdKnowledgeBase.id)), false, "完成第 4 步前不应回写任何文档处理策略引用");
assert.equal(Object.prototype.hasOwnProperty.call(createdKnowledgeBase, "currentRetrievalProfileId"), false, "V2 全局检索设置不应向新知识库写入配置版本引用");
const knowledgeDetailHtml = pages.knowledge.render({ name: "knowledge", id: createdKnowledgeBase.id, query: { tab: "documents" } }, state);
assert.match(knowledgeDetailHtml, new RegExp(`data-test-kb="${createdKnowledgeBase.id}"`), "知识库详情页头应提供并带入当前对象的检索测试快捷入口");

const uploadHtml = pages.knowledge.render({ name: "knowledge", id: createdKnowledgeBase.id, query: { onboarding: "1", step: "upload" } }, state);
assert.match(uploadHtml, /local-upload-stack[\s\S]*<details class="[^"]*\bupload-folder-picker\b[^"]*" data-upload-folder-picker>[\s\S]*目标位置[\s\S]*data-directory-tree="local-upload-target"[\s\S]*<label class="file-drop"/, "知识库上传应复用文档管理的可折叠目标目录选择器");
assert.doesNotMatch(uploadHtml, /upload-folder-target|data-upload-folder-target-name/, "知识库上传不应保留单独设计的存放目录栏");
assert.match(uploadHtml, /data-upload-drop[\s\S]*type="file" multiple[\s\S]*data-upload-file-list/, "导入步骤应提供多选/拖放区和逐文件列表容器");
assert.match(uploadHtml, /creation-panel__body[\s\S]*creation-source-workspace[\s\S]*creation-actions/, "导入步骤应将可滚动的资料区与底部操作区分离");
assert.doesNotMatch(uploadHtml, /summary-cell|creation-summary|知识库摘要/, "导入步骤不应重复上一步的知识库信息摘要");
assert.match(uploadHtml, /class="import-source-toolbar"[\s\S]*data-import-source-tab="upload"[\s\S]*data-import-source-tab="assets"[\s\S]*data-import-source-tab="enterprise"[\s\S]*data-import-resource-search/, "上传文件、文档管理与企业数据应按顺序组成同一组资料来源页签");
assert.doesNotMatch(uploadHtml, /data-import-upload-mode|>上传文件<\/button>/, "上传文件不应继续作为页签外的独立操作按钮");
assert.doesNotMatch(uploadHtml, /import-resource-list__header|data-import-resource-title/, "资料列表不应重复当前来源页签标题");
assert.match(uploadHtml, /data-import-source-browser[\s\S]*data-import-local-directory[\s\S]*data-import-local-directory-list[\s\S]*data-import-enterprise-directory[\s\S]*data-import-enterprise-directory-list[\s\S]*class="table-wrap"/, "知识库选文件应提供文档管理目录和独立企业数据目录");
assert.doesNotMatch(uploadHtml, /enterprise-source-directory__heading|data-import-enterprise-location|enterprise-source-location|<span>文件目录<\/span>/, "企业数据目录不应重复展示左右标题栏");
assert.match(uploadHtml, /<colgroup>[\s\S]*import-resource-table__col-name[\s\S]*import-resource-table__col-size[\s\S]*import-resource-table__col-status[\s\S]*<th>名称<\/th>[\s\S]*<th>大小<\/th>[\s\S]*<th>状态<\/th>[\s\S]*<th>更新时间<\/th>[\s\S]*import-resource-table__action-heading/, "文档管理与企业数据应共用固定列宽的逐行资料表");
assert.doesNotMatch(uploadHtml, /import-resource-table__col-source|<th>来源<\/th>|<th>操作<\/th>|<td>文档管理<\/td>/, "来源已由 Tab 区分，资料列表不应再显示来源列或操作表头");
assert.match(uploadHtml, /data-upload-cancel[\s\S]*data-upload-start/, "导入步骤底部只保留取消和导入动作");
const enterpriseSnapshotChoices = actions.listEnterpriseSourceObjects();
assert.ok(enterpriseSnapshotChoices.length && enterpriseSnapshotChoices.every((item) => Number.isFinite(item.fileSizeBytes) && /(?:KB|MB)$/.test(item.fileSizeLabel)), "企业数据应按可导入文件快照提供统一文件大小");
assert.ok(enterpriseSnapshotChoices.every((item) => item.directoryId === `ENT-DIR-${item.connectionId}` && item.directoryPath.includes("/") && /\.csv$/.test(item.fileName)), "每个企业数据快照应归入独立业务目录并保留文件名");
assert.equal(new Set(enterpriseSnapshotChoices.map((item) => item.directoryId)).size, state.enterpriseConnections.length, "企业数据文件目录应覆盖所有已接入连接");

const parseHtml = pages.knowledge.render({ name: "knowledge", id: createdKnowledgeBase.id, query: { onboarding: "1", step: "parse" } }, state);
assert.doesNotMatch(parseHtml, /name="parse-effort"|解析精细度/, "MinerU 解析模式应由识别内容自动派生，不再要求用户选择精细度");
assert.doesNotMatch(parseHtml, /creation-section-intro"><h2>/, "第 3 步正文不应重复步骤条中的“文档解析策略”标题");
assert.match(parseHtml, /id="parse-text-content" type="checkbox" checked disabled[\s\S]*id="parse-layout-structure" type="checkbox" checked disabled/, "文本内容与版面结构必须固定开启且不可取消");
assert.match(parseHtml, /id="parse-visual-understanding" type="checkbox"/, "图片与图表内容理解应合并为一个可选项");
assert.doesNotMatch(parseHtml, /id="parse-visual-understanding"[^>]*checked/, "VLM 内容理解应默认关闭");
assert.doesNotMatch(parseHtml, /parse-return-images|parse-addon-title|附加输出|保留原图/, "原图保存应由系统默认处理，不应向运营人员提供选项");
assert.doesNotMatch(parseHtml, /value="flash"|value="advanced"|目标切片|重叠 Token/, "MinerU 解析步骤不得虚构第三档或混入切片参数");
assert.doesNotMatch(parseHtml, /endpoint|parse-location|data-remote|id="parse-remote/, "MinerU 解析步骤应固定本地执行，不暴露远程服务配置控件");
assert.match(parseHtml, /value="auto"[\s\S]*value="txt"[\s\S]*value="ocr"[\s\S]*parse-text-content[\s\S]*parse-layout-structure[\s\S]*parse-table[\s\S]*parse-formula[\s\S]*parse-visual-understanding/, "解析步骤应覆盖解析方法、必选基础内容与合并视觉理解");
assert.doesNotMatch(parseHtml, /保留结构化内容列表|保留页 \/ 块定位|parse-image-understanding|parse-chart-understanding/, "解析页面不应继续展示旧辅助开关或拆分视觉选项");
assert.doesNotMatch(parseHtml, /data-import-processing-status|data-import-inline-result|<h2>解析结果<\/h2>/, "第 3 步只展示解析配置，提交后再异步开始解析");
assert.match(parseHtml, /data-onboarding-cancel[\s\S]*data-parse-back[\s\S]*data-parse-next/, "解析配置页应提供返回当前批次资料选择的上一步操作");
const parseBackBatch = actions.startKnowledgeImport(createdKnowledgeBase.id, { files: [{ name: "解析返回链路.txt", size: 128, sourcePreview: "解析返回链路" }], deferred: true });
assert.ok(actions.startImportParsing(parseBackBatch.id, { mineruParseConfig: createdKnowledgeBase.mineruParseConfig }), "模拟解析页返回前应能启动异步解析");
assert.ok(actions.cancelImportProcessing(parseBackBatch.id), "返回资料选择前应取消当前异步批次");
const parseBackResumedBatch = actions.startKnowledgeImport(createdKnowledgeBase.id, { fileVersionIds: [parseBackBatch.items[0].fileVersionId], deferred: true });
const activeParseBackBatches = state.importBatches.filter((batch) => batch.items.some((item) => item.fileId === parseBackBatch.items[0].fileId) && !["completed", "cancelled", "failed"].includes(batch.status));
assert.deepEqual(activeParseBackBatches.map((batch) => batch.id), [parseBackResumedBatch.id], "返回后重新提交只能保留一个有效批次");
actions.cancelImportProcessing(parseBackResumedBatch.id);

const processingHtml = pages.knowledge.render({ name: "knowledge", id: createdKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
assert.doesNotMatch(processingHtml, /creation-section-intro"><h2>/, "第 4 步正文不应重复步骤条中的“文档处理策略”标题");
const renderedProcessingFamilies = Array.from(processingHtml.matchAll(/<input\b(?=[^>]*\bname="processing-family")(?=[^>]*\bvalue="([^"]+)")[^>]*>/g), (match) => match[1]);
const renderedCustomMethods = Array.from(processingHtml.matchAll(/<input\b(?=[^>]*\bname="processing-method")(?=[^>]*\bvalue="([^"]+)")[^>]*>/g), (match) => match[1]);
assert.deepEqual(renderedProcessingFamilies, ["smart", "semantic", "custom"], "文档处理首层应且仅应提供自动、语义和自定义三个 family");
assert.deepEqual(renderedCustomMethods, ["structure", "separator", "fixed", "page", "whole_document"], "自定义 family 应按稳定顺序提供结构、分隔符、固定长度、按页和整篇五种 method");
assert.match(processingHtml, /data-processing-family-list[\s\S]*value="smart"[\s\S]*<strong>自动切片<\/strong>[\s\S]*value="semantic"[\s\S]*<strong>语义切片<\/strong>[\s\S]*value="custom"[\s\S]*<strong>自定义切片<\/strong>/, "三个首层 family 应展示普通用户名称并保持顺序");
assert.match(processingHtml, /data-processing-method-list[\s\S]*value="structure"[\s\S]*<strong>结构切片<\/strong>[\s\S]*value="separator"[\s\S]*<strong>分隔符切片<\/strong>[\s\S]*value="fixed"[\s\S]*<strong>固定长度<\/strong>[\s\S]*value="page"[\s\S]*<strong>按页切片<\/strong>[\s\S]*value="whole_document"[\s\S]*<strong>整篇切片<\/strong>/, "五个自定义 method 应按顺序展示完整、可理解的普通名称");
assert.doesNotMatch(processingHtml, /name="processing-method" value="recursive"|data-processing-profile-id="ING-RECURSIVE"/, "新建流程不得再显示独立递归方法；逐级递归应作为分隔符切片的内置降级机制");
assert.match(processingHtml, /name="processing-family" value="smart"[^>]*data-processing-profile-id="ING-01"[^>]*checked/, "进入文档处理步骤应默认选中自动 family");
assert.match(processingHtml, /class="processing-method-picker" data-processing-method-picker hidden/, "默认选中自动 family 时应保持自定义 method 区隐藏");
assert.doesNotMatch(processingHtml, /data-processing-group=|processing-profile-more|更多策略|data-processing-profile-id="ING-02"/, "新信息架构不应残留旧的单层分组、更多策略或 ING-02 候选");
const processingCardsStart = processingHtml.indexOf("data-processing-family-list");
const processingCardsEnd = processingHtml.indexOf("data-processing-draft", processingCardsStart);
const processingCardsHtml = processingHtml.slice(processingCardsStart, processingCardsEnd);
assert.doesNotMatch(processingCardsHtml, /最大字符|重叠比例|索引内容|关联信息/, "family 与 method 卡片只应显示名称、描述和推荐关系，参数统一移入编辑区");
assert.match(processingCardsHtml, /data-processing-family="smart"[\s\S]*<strong>自动切片<\/strong>[\s\S]*依次按解析结构、逐级边界与长度上限生成切片，不调用语义模型。/, "自动切片的编排机制应直接写入对应卡片");
assert.match(processingCardsHtml, /data-processing-family="semantic"[\s\S]*<strong>语义切片<\/strong>[\s\S]*效果需用真实问题集验证，入库会增加句段 Embedding 消耗。/, "语义切片的效果与入库消耗应直接写入对应卡片");
assert.match(processingCardsHtml, /data-processing-method="structure"[\s\S]*<strong>结构切片<\/strong>[\s\S]*超长内容块仍按长度上限拆分。/, "结构切片的结构依据与长度边界应直接写入对应卡片");
assert.match(processingHtml, /data-processing-param="maxChars"[\s\S]*data-processing-param="overlapPercent"/, "默认策略的编辑区应覆盖切片参数");
assert.match(processingHtml, /父子块检索[\s\S]*通过上下文增强，在检索命中后补充更完整的内容[\s\S]*data-processing-param="parentChildEnabled"[\s\S]*子块：参与 Embedding、检索和评分[\s\S]*父块：命中后补充上下文/, "默认策略的编辑区应覆盖样式统一的父子块三行说明");
assert.match(processingHtml, /高级配置[\s\S]*data-processing-param="tableText"[\s\S]*将表格中的金额、指标、表头和单位用于检索与回答证据召回。[\s\S]*data-processing-param="formulaText"[\s\S]*将公式符号、LaTeX 表达和公式位置用于专业术语、参数和推导检索。[\s\S]*data-processing-param="imageText"[\s\S]*将图像、图表、图中文字和结构化描述用于跨模态内容召回。/, "默认策略的编辑区应覆盖高级配置正向说明");
assert.doesNotMatch(processingHtml, /以下解析内容不会进入索引|第 3 步未勾选|暂无可进入索引的解析产物|processing-parent-child-flow[^>]*aria-hidden|<span class="tag">(?:不适用|上下文增强)<\/span>|processing-strategy-note|semantic-cost-notice|系统自动编排|依据上一阶段的解析结构/, "处理页不应显示独立策略说明、特殊标签、兼容性提示或负向产物说明");
assert.doesNotMatch(processingHtml, /处理策略摘要|data-processing-param="contextPolicy"|保守 · 只保留来源定位/, "处理页不应展示处理策略摘要或低于系统底线的上下文策略");
assert.doesNotMatch(processingHtml, /data-processing-param="(?:documentName|headingPath|pageNumber|includeContext)"/, "来源定位和基础上下文不应作为普通运营复选项暴露");
assert.match(processingCardsHtml, /data-processing-family="semantic"[\s\S]*语义切片/, "流程应在首层提供可选的语义切片 family");
assert.doesNotMatch(processingHtml, /本次处理参数/, "参数区不应重复显示无信息量的标题");
assert.doesNotMatch(processingHtml, /向量模型不匹配/, "文档处理策略不应再绑定或按向量模型过滤");
assert.doesNotMatch(processingHtml, /processing-profile-card is-disabled|name="processing-(?:family|method)"[^>]*disabled/, "解析产物缺项不应让已启用 family 或 method 整卡不可选");
assert.doesNotMatch(processingHtml, /data-import-processing-status|data-import-inline-result|<h2>解析结果<\/h2>|data-import-preview(?:\s|=|>)/, "处理页应专注切片配置，不展示解析状态、解析内容或独立预览入口");

const semanticProfile = state.rag.ingestionProfiles.find((item) => item.id === "ING-SEMANTIC");
assert.ok(semanticProfile && semanticProfile.chunking.mode === "semantic", "语义切片应作为代码预置方案进入真实处理数据模型");
const semanticKnowledgeBase = actions.createKnowledgeBase({
  name: "语义切片闭环测试库",
  purpose: "验证语义切片参数、批次快照和消耗估算。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
});
assert.equal(actions.setKnowledgeBaseOnboardingConfig(semanticKnowledgeBase.id, {
  ingestionProfileId: "ING-SEMANTIC",
  processingParameters: { mode: "semantic", maxChars: 1600, semanticSensitivity: "unknown" },
}), null, "动作层应拒绝未定义的语义切分敏感度");
const semanticConfigured = actions.setKnowledgeBaseOnboardingConfig(semanticKnowledgeBase.id, {
  ingestionProfileId: "ING-SEMANTIC",
  processingParameters: {
    mode: "semantic",
    maxChars: 1600,
    overlapPercent: 30,
    semanticSensitivity: "high",
    includeContext: true,
  },
  completed: true,
});
assert.ok(semanticConfigured, "语义切片应能通过知识库文档处理步骤保存");
assert.equal(semanticConfigured.processingParametersSnapshot.semanticSensitivity, "high", "知识库快照应固化语义敏感度");
assert.equal(semanticConfigured.processingParametersSnapshot.breakpointPercentile, 75, "高敏感度应派生更容易触发的语义断点百分位");
assert.equal(semanticConfigured.processingParametersSnapshot.semanticMinChars, 320, "语义切片应按最大字符派生最小切片保护值");
assert.equal(semanticConfigured.processingParametersSnapshot.sentenceWindow, 1, "语义边界判断应固化句段窗口");
assert.equal(semanticConfigured.processingParametersSnapshot.fallbackMode, "smart", "语义处理不可用时应固化智能切片兜底");
assert.equal(semanticConfigured.processingParametersSnapshot.overlapPercent, 0, "语义切片不应继续应用固定重叠率");
const semanticProcessingHtml = pages.knowledge.render({ name: "knowledge", id: semanticKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
const semanticSensitivitySelect = semanticProcessingHtml.match(/<select\b(?=[^>]*\bdata-processing-param="semanticSensitivity")[^>]*>[\s\S]*?<\/select>/)?.[0] || "";
assert.deepEqual(Array.from(semanticSensitivitySelect.matchAll(/<option\b[^>]*\bvalue="([^"]+)"[^>]*>([^<]+)<\/option>/g), (match) => [match[1], match[2]]), [["low", "低"], ["balanced", "均衡"], ["high", "高"]], "语义敏感度下拉应且仅应显示三个简短档位");
assert.match(semanticProcessingHtml, /id="processing-semantic-sensitivity-help" class="form-help">低：较少切分；均衡：推荐；高：较多切分。敏感度越高，越容易在较小的主题变化处切分。<\/div>/, "语义敏感度差异应放在下拉后的灰色说明行");
assert.match(semanticProcessingHtml, /data-processing-family="semantic"[\s\S]*<strong>语义切片<\/strong>[\s\S]*效果需用真实问题集验证，入库会增加句段 Embedding 消耗。/, "语义边界效果和入库消耗应融入语义切片卡片");
assert.doesNotMatch(semanticProcessingHtml, /semantic-cost-notice|semantic-impact|semantic-impact__item|效果与消耗说明|语义边界质量较高（预期）|低 · 较少切分|均衡 · 推荐|高 · 较多切分/, "语义参数区不应重复展示策略说明或复合档位名称");
assert.doesNotMatch(semanticProcessingHtml, /data-processing-param="overlapPercent"/, "语义切片不应向运营人员展示无效的固定重叠率");
const semanticBatch = actions.startKnowledgeImport(semanticKnowledgeBase.id, {
  files: [{ name: "多主题研究材料.pdf", size: 1600000, characterCount: 16000 }],
});
await completeBatch(semanticBatch);
assert.equal(semanticBatch.processingParametersSnapshot.semanticSensitivity, "high", "导入批次应继承知识库的语义敏感度快照");
assert.equal(semanticBatch.items[0].processingEstimate.extraEmbeddingCostLevel, "high", "语义切片批次应记录额外句段 Embedding 消耗等级");
assert.deepEqual(semanticBatch.items[0].processingEstimate.embeddingStages.map((item) => item.key), ["semantic_boundary_embedding", "final_chunk_embedding"], "语义切片估算应区分边界向量计算与最终索引向量化");
const semanticDocument = state.documents.find((item) => item.id === semanticBatch.items[0].documentId);
assert.equal(semanticDocument.processingProfileSnapshot.chunking.mode, "semantic", "文档应保留本次语义切片配置");
assert.equal(state.chunks.filter((chunk) => chunk.documentId === semanticDocument.id).length, semanticDocument.chunkCount, "处理后的切片数量应反映实际生成的卡片，不能只展示估算值");
assert.equal(actions.deleteKnowledgeBase(semanticKnowledgeBase.id), semanticKnowledgeBase, "闭环测试完成后应能删除未启用的语义测试库");

const expectedRecursiveBoundaries = ["paragraph", "newline", "sentence", "whitespace", "character"];
function expectedSeparatorFallbacks(separatorType) {
  if (separatorType === "paragraph") return expectedRecursiveBoundaries;
  if (separatorType === "newline") return expectedRecursiveBoundaries.slice(1);
  if (separatorType === "sentence") return expectedRecursiveBoundaries.slice(2);
  return [separatorType, "whitespace", "character"];
}
const separatorProfile = state.rag.ingestionProfiles.find((item) => item.id === "ING-SEPARATOR");
assert.ok(separatorProfile && separatorProfile.chunking.mode === "separator", "ING-SEPARATOR 应作为统一的分隔符方法预置");
assert.equal(separatorProfile.chunking.separatorType, "paragraph", "分隔符方法默认应选择段落 / 空行边界");
assert.equal(separatorProfile.chunking.separator, "\n\n", "默认段落边界应保存精确的双换行符号");
assert.equal(separatorProfile.chunking.boundaryMode, undefined, "新分隔符预置不应再保存旧 boundaryMode");
assert.equal(separatorProfile.chunking.strategy, "separator_recursive_fallback", "分隔符方法应使用首选边界加递归降级算法");
assert.deepEqual(separatorProfile.chunking.recursiveBoundaries, expectedRecursiveBoundaries, "默认段落边界应按由粗到细的内置边界逐级拆分");
assert.equal(separatorProfile.chunking.keepSeparator, true, "递归降级拆分必须保留原分隔符");
assert.equal(separatorProfile.chunking.usesSemanticModel, false, "分隔符递归降级不得启用语义边界模型");
const separatorProfileBefore = structuredClone(separatorProfile);
const fixedProfileBefore = structuredClone(fixedProfile);
const automaticBoundaryKnowledgeBase = actions.createKnowledgeBase({
  name: "默认分隔符切片闭环测试库",
  purpose: "验证默认段落边界、递归降级、参数固化与旧数据迁移。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
});
for (const invalidParameters of [{ maxChars: 199 }, { maxChars: 10001 }, { maxChars: 1000.5 }, { maxChars: Infinity }, { overlapPercent: -1 }, { overlapPercent: 51 }, { overlapPercent: 10.5 }]) {
  assert.equal(actions.setKnowledgeBaseOnboardingConfig(automaticBoundaryKnowledgeBase.id, {
    ingestionProfileId: "ING-SEPARATOR",
    processingParameters: { mode: "separator", maxChars: 1000, overlapPercent: 10, ...invalidParameters },
  }), null, "分隔符切片必须校验整数最大字符与重叠率范围");
}
const automaticBoundaryConfigured = actions.setKnowledgeBaseOnboardingConfig(automaticBoundaryKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: {
    mode: "separator", maxChars: 1400, overlapPercent: 12,
    recursiveBoundaries: ["character"], keepSeparator: false, usesSemanticModel: true,
  },
  completed: true,
});
assert.ok(automaticBoundaryConfigured, "默认分隔符策略应能保存并完成知识库文档处理配置");
assert.equal(automaticBoundaryConfigured.processingParametersSnapshot.mode, "separator", "知识库参数快照应统一写入 separator 模式");
assert.equal(automaticBoundaryConfigured.processingParametersSnapshot.maxChars, 1400, "知识库参数快照应保存本次字符上限");
assert.equal(automaticBoundaryConfigured.processingParametersSnapshot.overlapPercent, 12, "知识库参数快照应保存本次重叠率");
assert.equal(automaticBoundaryConfigured.processingParametersSnapshot.parentChildEnabled, false, "未显式开启时父子块检索应默认关闭");
for (const snapshot of [automaticBoundaryConfigured.processingProfileSnapshot.chunking, automaticBoundaryConfigured.processingParametersSnapshot]) {
  assert.equal(snapshot.mode, "separator", "默认分隔符的两种快照均应使用统一 separator 模式");
  assert.equal(snapshot.boundaryMode, undefined, "新快照不得继续保存 boundaryMode");
  assert.equal(snapshot.separatorType, "paragraph", "未指定边界时两种快照都应默认使用段落 / 空行");
  assert.equal(snapshot.separator, "\n\n", "默认段落边界应派生双换行字面值");
  assert.equal(snapshot.strategy, "separator_recursive_fallback", "快照应标明首选边界加递归降级算法");
  assert.deepEqual(snapshot.recursiveBoundaries, expectedRecursiveBoundaries, "默认段落边界的递归降级链必须固化且不可被外部参数改写");
  assert.equal(snapshot.keepSeparator, true, "两种快照均应固化保留分隔符行为");
  assert.equal(snapshot.usesSemanticModel, false, "两种快照均应明确无语义模型计算");
  assert.equal(Object.hasOwn(snapshot, "semanticSensitivity"), false, "分隔符快照不得残留语义敏感度参数");
}
assert.deepEqual(separatorProfile, separatorProfileBefore, "本次分隔符参数不能改写共享代码预置");
const automaticBoundaryProcessingHtml = pages.knowledge.render({ name: "knowledge", id: automaticBoundaryKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
assert.match(automaticBoundaryProcessingHtml, /name="processing-family" value="custom"[^>]*checked/, "分隔符策略应回显自定义一级类型");
assert.match(automaticBoundaryProcessingHtml, /name="processing-method" value="separator"[^>]*data-processing-profile-id="ING-SEPARATOR"[^>]*checked/, "分隔符策略应回显统一的分隔符方法卡片");
assert.doesNotMatch(automaticBoundaryProcessingHtml, /name="processing-method" value="recursive"|data-processing-profile-id="ING-RECURSIVE"/, "历史递归预置不得重新出现在方法卡片中");
assert.match(automaticBoundaryProcessingHtml, /data-processing-separator-picker[\s\S]*优先切分边界[\s\S]*data-processing-param="separatorType"[\s\S]*data-processing-separator-trigger/, "分隔符策略应始终展示单个首选边界下拉");
assert.match(automaticBoundaryProcessingHtml, /<option\b[^>]*value="paragraph"[^>]*\bselected\b/, "未指定边界时 UI 应默认回显段落 / 空行");
assert.match(automaticBoundaryProcessingHtml, /优先按所选边界切分；片段超长时，系统自动按更细边界递归拆分，最后按字符上限兜底。/, "分隔符帮助文字应解释首选边界、递归降级和字符兜底");
assert.doesNotMatch(automaticBoundaryProcessingHtml, /name="processing-boundary-mode"|data-processing-boundary-mode/, "分隔符 UI 不应再展示自动／指定二级模式");
assert.match(automaticBoundaryProcessingHtml, /data-processing-param="maxChars"[\s\S]*data-processing-param="overlapPercent"/, "分隔符参数区应提供最大字符和重叠率");
assert.match(automaticBoundaryProcessingHtml, /父子块检索[\s\S]*通过上下文增强，在检索命中后补充更完整的内容[\s\S]*data-processing-param="parentChildEnabled"[\s\S]*子块：参与 Embedding、检索和评分[\s\S]*父块：命中后补充上下文/, "分隔符策略应展示独立父子块检索板块");
const defaultParentChildControl = automaticBoundaryProcessingHtml.match(/<input\b(?=[^>]*\bdata-processing-param="parentChildEnabled")[^>]*>/)?.[0] || "";
assert.ok(defaultParentChildControl, "分隔符策略应展示父子块检索开关");
assert.doesNotMatch(defaultParentChildControl, /\bchecked\b|\bdisabled\b/, "默认父子块检索开关应可编辑且未开启");
assert.doesNotMatch(automaticBoundaryProcessingHtml, /上下文补全策略|data-processing-param="contextPolicy"|保守 · 只保留来源定位/, "父子块不应再通过上下文策略下拉配置");
const automaticBoundaryBatch = actions.startKnowledgeImport(automaticBoundaryKnowledgeBase.id, {
  files: [{ name: "自动边界处理批次.txt", size: 5600, characterCount: 2800, sourcePreview: "自动边界资料".repeat(560) }],
});
await completeBatch(automaticBoundaryBatch);
assert.deepEqual(OpsDemo.utils.clone(automaticBoundaryBatch.processingParametersSnapshot), OpsDemo.utils.clone(automaticBoundaryConfigured.processingParametersSnapshot), "普通导入批次应继承完整自动边界参数快照");
assert.equal(automaticBoundaryBatch.items[0].processingEstimate.extraEmbeddingCostLevel, "none", "自动边界不得误报额外语义边界 Embedding 消耗");
assert.notEqual(automaticBoundaryBatch.processingProfileSnapshot.chunking.recursiveBoundaries, automaticBoundaryConfigured.processingProfileSnapshot.chunking.recursiveBoundaries, "批次内置边界列表应独立克隆");
const defaultAutomaticBoundarySet = state.chunkSets.find((item) => item.id === automaticBoundaryBatch.items[0].chunkSetId);
assert.ok(defaultAutomaticBoundarySet, "默认自动边界批次应产生可追踪的切片集合");
assert.equal((defaultAutomaticBoundarySet.parentChunks || []).length, 0, "默认关闭父子块时不应额外生成父块");
assert.ok(defaultAutomaticBoundarySet.chunks.every((chunk) => !chunk.metadata?.parentChunkId), "默认关闭时子块不应伪造父块引用");
const savedAutomaticBoundaryBatch = structuredClone(automaticBoundaryBatch.processingProfileSnapshot);
const parentChildKnowledgeBase = actions.createKnowledgeBase({
  name: "父子块检索闭环测试库",
  purpose: "验证父子块快照、独立存储与子块向量化边界。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
});
const parentChildConfigured = actions.setKnowledgeBaseOnboardingConfig(parentChildKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: { mode: "separator", separatorType: "paragraph", maxChars: 400, overlapPercent: 0, parentChildEnabled: true },
  completed: true,
});
assert.ok(parentChildConfigured, "自动边界切片应允许启用父子块检索");
for (const snapshot of [parentChildConfigured.processingProfileSnapshot.chunking, parentChildConfigured.processingParametersSnapshot]) {
  assert.equal(snapshot.parentChildEnabled, true, "处理策略与参数快照应同时固化父子块开关");
  assert.equal(snapshot.contextPolicy, "enhanced", "父子块开启时应固化为增强上下文补全策略");
}
assert.deepEqual(separatorProfile, separatorProfileBefore, "启用父子块不得回写共享分隔符预置");
const parentChildProcessingHtml = pages.knowledge.render({ name: "knowledge", id: parentChildKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
const enabledParentChildControl = parentChildProcessingHtml.match(/<input\b(?=[^>]*\bdata-processing-param="parentChildEnabled")[^>]*>/)?.[0] || "";
assert.match(enabledParentChildControl, /\bchecked\b/, "已保存的父子块选项应在处理页回显为开关开启");
assert.doesNotMatch(enabledParentChildControl, /\bdisabled\b/, "自动边界方法的父子块开关应可编辑");
const parentChildSource = "# 第一章\n\n" + "供应商应按合同约定履约并接受验收。\n".repeat(120) + "\n# 第二章\n\n" + "验收异常应记录证据并按流程处置。\n".repeat(120);
const parentChildBatch = actions.startKnowledgeImport(parentChildKnowledgeBase.id, {
  files: [{ name: "父子块检索验收.txt", size: parentChildSource.length * 2, characterCount: parentChildSource.length, sourcePreview: parentChildSource }],
});
await completeBatch(parentChildBatch);
assert.equal(parentChildBatch.processingParametersSnapshot.parentChildEnabled, true, "导入批次应继承知识库已启用的父子块快照");
const parentChildDocument = state.documents.find((item) => item.id === parentChildBatch.items[0].documentId);
const parentChildSet = state.chunkSets.find((item) => item.id === parentChildBatch.items[0].chunkSetId);
assert.ok(parentChildDocument && parentChildSet, "父子块批次应产生文档投影与切片集合");
assert.equal(parentChildDocument.processingProfileSnapshot.chunking.parentChildEnabled, true, "文档应保留本次父子块处理快照");
assert.ok(Array.isArray(parentChildSet.parentChunks) && parentChildSet.parentChunks.length > 0, "启用后父块应独立保存在 chunkSet.parentChunks");
const parentChunkIds = new Set(parentChildSet.parentChunks.map((chunk) => chunk.id));
assert.ok(parentChildSet.chunks.length > 1 && parentChildSet.chunks.every((chunk) => parentChunkIds.has(chunk.metadata?.parentChunkId)), "每个检索子块都应通过 metadata.parentChunkId 指向集合内真实父块");
assert.ok(parentChildSet.parentChunks.every((parent) => parent.fileVersionId === parentChildSet.fileVersionId || parent.metadata?.fileVersionId === parentChildSet.fileVersionId), "父块必须继承与子块相同的文件版本定位");
assert.equal(state.embeddingRecords.some((record) => parentChunkIds.has(record.chunkId)), false, "父块只用于命中后补充上下文，不应单独生成 Embedding");
assert.equal(actions.deleteKnowledgeBase(parentChildKnowledgeBase.id), parentChildKnowledgeBase, "父子块闭环测试后应清理临时知识库");
const fixedKnowledgeBase = actions.createKnowledgeBase({
  name: "固定长度切片闭环测试库",
  purpose: "验证正式固定长度方法的参数、快照与页面回显。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
});
for (const invalidParameters of [{ maxChars: 199 }, { maxChars: 10001 }, { maxChars: 1000.5 }, { overlapPercent: -1 }, { overlapPercent: 51 }, { overlapPercent: 10.5 }]) {
  assert.equal(actions.setKnowledgeBaseOnboardingConfig(fixedKnowledgeBase.id, {
    ingestionProfileId: "ING-FIXED",
    processingParameters: { mode: "fixed", maxChars: 1000, overlapPercent: 10, ...invalidParameters },
  }), null, "正式固定长度方法必须校验整数最大字符与重叠率范围");
}
const fixedConfigured = actions.setKnowledgeBaseOnboardingConfig(fixedKnowledgeBase.id, {
  ingestionProfileId: "ING-FIXED",
  processingParameters: { mode: "fixed", maxChars: 880, overlapPercent: 7 },
  completed: true,
});
assert.ok(fixedConfigured, "正式固定长度方法应能保存");
for (const snapshot of [fixedConfigured.processingProfileSnapshot.chunking, fixedConfigured.processingParametersSnapshot]) {
  assert.equal(snapshot.mode, "fixed", "固定长度快照应保留独立 fixed 模式");
  assert.equal(snapshot.maxChars, 880, "固定长度快照应保存每片字符数");
  assert.equal(snapshot.overlapPercent, 7, "固定长度快照应保存重叠比例");
  assert.equal(snapshot.boundaryMode, undefined, "固定长度快照不得混入分隔符边界模式");
  assert.equal(snapshot.recursiveBoundaries, undefined, "固定长度快照不得混入递归边界列表");
}
assert.equal(fixedConfigured.processingProfileSnapshot.chunking.strategy, "fixed_length", "固定长度快照必须标明真实算法");
assert.deepEqual(fixedProfile, fixedProfileBefore, "本次固定长度参数不得改写共享代码预置");
const fixedProcessingHtml = pages.knowledge.render({ name: "knowledge", id: fixedKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
assert.match(fixedProcessingHtml, /name="processing-method" value="fixed"[^>]*data-processing-profile-id="ING-FIXED"[^>]*checked/, "固定长度模式应回显正式方法卡片");
assert.match(fixedProcessingHtml, /每片字符数[\s\S]*data-processing-param="maxChars"[\s\S]*data-processing-param="overlapPercent"/, "固定长度参数区应展示字符窗口与重叠率");
assert.doesNotMatch(fixedProcessingHtml, /data-processing-boundary-mode|data-processing-separator-picker|data-processing-param="separatorType"/, "固定长度方法不得混入边界匹配控件");

const legacyRecursiveConfigured = actions.setKnowledgeBaseOnboardingConfig(automaticBoundaryKnowledgeBase.id, {
  ingestionProfileId: "ING-RECURSIVE",
  processingParameters: { mode: "recursive", maxChars: 880, overlapPercent: 0 },
  completed: true,
});
assert.ok(legacyRecursiveConfigured, "历史 ING-RECURSIVE 配置仍应被动作层读取");
for (const snapshot of [legacyRecursiveConfigured.processingProfileSnapshot.chunking, legacyRecursiveConfigured.processingParametersSnapshot]) {
  assert.equal(snapshot.mode, "separator", "旧 recursive 配置应迁移到统一 separator 模式");
  assert.equal(snapshot.boundaryMode, undefined, "旧 recursive 迁移后的新快照不应继续保存 boundaryMode");
  assert.equal(snapshot.separatorType, "paragraph", "旧 recursive 配置应迁移为以段落 / 空行为首选边界");
  assert.equal(snapshot.separator, "\n\n", "旧 recursive 配置迁移后应保存默认段落边界字面值");
  assert.equal(snapshot.strategy, "separator_recursive_fallback", "旧 recursive 迁移后应执行首选边界加递归降级算法");
  assert.deepEqual(snapshot.recursiveBoundaries, expectedRecursiveBoundaries, "旧 recursive 迁移后应固化完整内置边界");
}
assert.equal(legacyRecursiveConfigured.processingProfileSnapshot.sourceProfileId, "ING-RECURSIVE", "迁移快照应保留历史来源预置 ID 便于审计");
const migratedRecursiveSnapshot = structuredClone(legacyRecursiveConfigured.processingProfileSnapshot);
const migratedRecursiveHtml = pages.knowledge.render({ name: "knowledge", id: automaticBoundaryKnowledgeBase.id, query: { onboarding: "1", step: "processing", flow: "import" } }, state);
assert.match(migratedRecursiveHtml, /name="processing-method" value="separator"[^>]*checked/, "旧 recursive 配置打开时应映射到分隔符方法");
assert.match(migratedRecursiveHtml, /<option\b[^>]*value="paragraph"[^>]*\bselected\b/, "旧 recursive 配置打开时应在单层下拉回显段落 / 空行");
assert.doesNotMatch(migratedRecursiveHtml, /name="processing-boundary-mode"|data-processing-boundary-mode/, "旧 recursive 配置迁移后也不得恢复边界模式二级控件");
assert.doesNotMatch(migratedRecursiveHtml, /name="processing-method" value="recursive"/, "迁移回显不得恢复已隐藏的递归方法卡片");
assert.deepEqual(legacyRecursiveConfigured.processingProfileSnapshot, migratedRecursiveSnapshot, "打开新导入界面不得改写已固化的迁移快照");
const legacyRecursiveSource = "甲".repeat(120) + "\n\n" + "乙".repeat(120) + "\n\n" + "丙".repeat(120);
const legacyRecursiveBatch = actions.startKnowledgeImport(automaticBoundaryKnowledgeBase.id, {
  files: [{ name: "沿用历史递归配置.txt", size: legacyRecursiveSource.length * 2, characterCount: legacyRecursiveSource.length, sourcePreview: legacyRecursiveSource }],
});
await completeBatch(legacyRecursiveBatch);
assert.equal(legacyRecursiveBatch.processingParametersSnapshot.mode, "separator", "旧 recursive 的新批次应使用 canonical separator 快照");
assert.equal(legacyRecursiveBatch.processingParametersSnapshot.boundaryMode, undefined, "旧 recursive 的新批次不应继续保存 boundaryMode");
assert.equal(legacyRecursiveBatch.processingParametersSnapshot.separatorType, "paragraph", "旧 recursive 的新批次应以段落边界执行递归降级");
const legacyRecursiveSet = state.chunkSets.find((item) => item.id === legacyRecursiveBatch.items[0].chunkSetId);
assert.equal(legacyRecursiveSet.chunks.map((chunk) => chunk.content).join(""), legacyRecursiveSource, "旧 recursive 迁移后的实际切片应完整保留原文和分隔符");
assert.deepEqual(automaticBoundaryBatch.processingProfileSnapshot, savedAutomaticBoundaryBatch, "切换知识库当前策略不能改写既有自动边界批次");
assert.equal(actions.deleteKnowledgeBase(fixedKnowledgeBase.id), fixedKnowledgeBase, "固定长度闭环测试完成后应清理测试知识库");
assert.equal(actions.deleteKnowledgeBase(automaticBoundaryKnowledgeBase.id), automaticBoundaryKnowledgeBase, "自动边界闭环测试完成后应清理测试知识库");

const structureProfile = state.rag.ingestionProfiles.find((item) => item.id === "ING-STRUCTURE");
assert.ok(structureProfile && structureProfile.chunking.mode === "structure" && structureProfile.chunking.separatorType === "structure", "ING-STRUCTURE 应是独立的解析结构 method 预置");
assert.ok(separatorProfile && separatorProfile.chunking.mode === "separator" && separatorProfile.chunking.separatorType === "paragraph" && separatorProfile.chunking.boundaryMode === undefined, "ING-SEPARATOR 应以段落 / 空行作为单层分隔符 method 默认预置");
const customMethodKnowledgeBase = actions.createKnowledgeBase({
  name: "自定义切片方法闭环测试库",
  purpose: "验证结构与分隔符方法分离。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
});
const structureConfigured = actions.setKnowledgeBaseOnboardingConfig(customMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-STRUCTURE",
  processingParameters: { mode: "structure", maxChars: 1500, overlapPercent: 5 },
  completed: true,
});
assert.equal(structureConfigured.processingParametersSnapshot.mode, "structure", "结构 method 应以独立 mode 写入快照");
assert.equal(structureConfigured.processingParametersSnapshot.separatorType, "structure", "结构 method 应固定使用解析结构边界");
const structureProcessingHtml = pages.knowledge.render({ name: "knowledge", id: customMethodKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
assert.match(structureProcessingHtml, /name="processing-family" value="custom"[^>]*checked/, "使用结构 method 时首层应回显自定义 family");
assert.match(structureProcessingHtml, /name="processing-method" value="structure"[^>]*data-processing-profile-id="ING-STRUCTURE"[^>]*checked/, "使用结构 method 时应回显独立的 ING-STRUCTURE 选项");
assert.doesNotMatch(structureProcessingHtml, /data-processing-method-picker hidden/, "选中自定义 family 后 method 区应展开");
assert.doesNotMatch(structureProcessingHtml, /data-processing-separator-picker/, "结构 method 不应混入分隔符下拉");

const separatorMethodKnowledgeBase = actions.createKnowledgeBase({
  name: "分隔符切片方法闭环测试库",
  purpose: "验证首选分隔符、八个固定选项与递归降级的界面及快照契约。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
});
const separatorConfigured = actions.setKnowledgeBaseOnboardingConfig(separatorMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: { mode: "separator", maxChars: 1500, overlapPercent: 5, separatorType: "paragraph" },
  completed: true,
});
assert.equal(separatorConfigured.processingParametersSnapshot.mode, "separator", "分隔符 method 应以独立 mode 写入快照");
assert.equal(separatorConfigured.processingParametersSnapshot.boundaryMode, undefined, "新分隔符快照不应再写入 boundaryMode");
assert.equal(separatorConfigured.processingParametersSnapshot.separatorType, "paragraph", "首选边界应回显段落 / 空行");
assert.equal(separatorConfigured.processingParametersSnapshot.strategy, "separator_recursive_fallback", "分隔符快照应标明递归降级算法");
assert.deepEqual(separatorConfigured.processingParametersSnapshot.recursiveBoundaries, expectedRecursiveBoundaries, "段落首选边界应保存完整递归降级链");
const separatorProcessingHtml = pages.knowledge.render({ name: "knowledge", id: separatorMethodKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
assert.match(separatorProcessingHtml, /name="processing-family" value="custom"[^>]*checked/, "使用分隔符 method 时首层应回显自定义 family");
assert.match(separatorProcessingHtml, /name="processing-method" value="separator"[^>]*data-processing-profile-id="ING-SEPARATOR"[^>]*checked/, "使用分隔符 method 时应回显独立的 ING-SEPARATOR 选项");
assert.doesNotMatch(separatorProcessingHtml, /name="processing-boundary-mode"|data-processing-boundary-mode/, "分隔符 method 不应再出现自动／指定二级选项");
assert.match(separatorProcessingHtml, /data-processing-separator-picker[\s\S]*优先切分边界/, "分隔符 method 应始终展示首选边界下拉");
assert.match(separatorProcessingHtml, /优先按所选边界切分；片段超长时，系统自动按更细边界递归拆分，最后按字符上限兜底。/, "分隔符提示应准确解释首选边界与递归降级关系");
const separatorSelectHtml = separatorProcessingHtml.match(/<select\b(?=[^>]*\bdata-processing-param="separatorType")[^>]*>[\s\S]*?<\/select>/)?.[0] || "";
const separatorSelectValues = Array.from(separatorSelectHtml.matchAll(/<option\b[^>]*\bvalue="([^"]+)"[^>]*>/g), (match) => match[1]);
const expectedSeparatorChoices = [
  { value: "paragraph", token: "\\n\\n", name: "段落 / 空行", separator: "\n\n" },
  { value: "newline", token: "\\n", name: "每次换行", separator: "\n" },
  { value: "zh_period", token: "。", name: "中文句号", separator: "。" },
  { value: "zh_exclamation", token: "！", name: "中文感叹号", separator: "！" },
  { value: "zh_question", token: "？", name: "中文问号", separator: "？" },
  { value: "en_period", token: ".", name: "英文句点", separator: "." },
  { value: "en_exclamation", token: "!", name: "英文感叹号", separator: "!" },
  { value: "en_question", token: "?", name: "英文问号", separator: "?" },
];
assert.deepEqual(separatorSelectValues, expectedSeparatorChoices.map((choice) => choice.value), "分隔符下拉应且仅应按稳定顺序提供八个固定边界");
const renderedSeparatorChoices = Array.from(separatorProcessingHtml.matchAll(/<button\b(?=[^>]*\bclass="processing-separator-option")(?=[^>]*\bdata-processing-separator-option="([^"]+)")[^>]*>([\s\S]*?)<\/button>/g), (match) => ({ value: match[1], markup: match[2] }));
assert.deepEqual(renderedSeparatorChoices.map((choice) => choice.value), expectedSeparatorChoices.map((choice) => choice.value), "可见分隔符 listbox 也应且仅应渲染同样的八个选项");
expectedSeparatorChoices.forEach((expected) => {
  const rendered = renderedSeparatorChoices.find((choice) => choice.value === expected.value);
  assert.ok(rendered && rendered.markup.includes(`<code>${expected.token}</code>`), `${expected.value} 选项应使用 code pill 显示精确 token`);
  assert.ok(rendered && rendered.markup.includes(`<span>${expected.name}</span>`), `${expected.value} 选项应在 token 之外显示普通名称`);
});
assert.match(separatorSelectHtml, /<option\b[^>]*value="paragraph"[^>]*\bselected\b/, "已保存的段落 / 空行边界应在隐藏原生下拉中正确回显");
assert.doesNotMatch(separatorSelectHtml, /value="(?:structure|sentence|custom|literal)"/, "分隔符下拉不得混入结构方法、合并 sentence 或历史 custom/literal 值");
assert.doesNotMatch(separatorProcessingHtml, /data-processing-separator-option="(?:structure|sentence|custom|literal)"|data-custom-separator-field|data-processing-param="customSeparator"|自定义拆分标记/, "分隔符 listbox 不得显示非八项值或要求用户输入符号");
expectedSeparatorChoices.forEach((boundary) => {
  const configuredBoundary = actions.setKnowledgeBaseOnboardingConfig(separatorMethodKnowledgeBase.id, {
    ingestionProfileId: "ING-SEPARATOR",
    processingParameters: { mode: "separator", maxChars: 1500, overlapPercent: 5, separatorType: boundary.value },
  });
  assert.equal(configuredBoundary.processingParametersSnapshot.mode, "separator", `${boundary.value} 不应改变分隔符 method`);
  assert.equal(configuredBoundary.processingParametersSnapshot.boundaryMode, undefined, `${boundary.value} 新快照不应保存 boundaryMode`);
  assert.equal(configuredBoundary.processingParametersSnapshot.separatorType, boundary.value, `${boundary.value} 下拉选项应写入边界类型快照`);
  assert.equal(configuredBoundary.processingParametersSnapshot.separator, boundary.separator, `${boundary.value} 下拉选项应派生正确的底层分隔符`);
  assert.equal(configuredBoundary.processingParametersSnapshot.strategy, "separator_recursive_fallback", `${boundary.value} 应统一使用递归降级算法`);
  assert.deepEqual(configuredBoundary.processingParametersSnapshot.recursiveBoundaries, expectedSeparatorFallbacks(boundary.value), `${boundary.value} 应从所选边界开始固化更细降级链`);
});
const legacyAutomaticRuleConfigured = actions.setKnowledgeBaseOnboardingConfig(separatorMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: { mode: "separator", boundaryMode: "auto", maxChars: 1500, overlapPercent: 5, separatorType: "newline" },
});
assert.equal(legacyAutomaticRuleConfigured.processingParametersSnapshot.boundaryMode, undefined, "旧 boundaryMode=auto 迁移后不得继续写入新快照");
assert.equal(legacyAutomaticRuleConfigured.processingParametersSnapshot.separatorType, "paragraph", "旧 boundaryMode=auto 应迁移为默认段落首选边界");
assert.deepEqual(legacyAutomaticRuleConfigured.processingParametersSnapshot.recursiveBoundaries, expectedRecursiveBoundaries, "旧自动边界模式应迁移为完整递归降级链");
const legacySpecifiedRuleConfigured = actions.setKnowledgeBaseOnboardingConfig(separatorMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: { mode: "separator", boundaryMode: "specified", maxChars: 1500, overlapPercent: 5, separatorType: "newline" },
});
assert.equal(legacySpecifiedRuleConfigured.processingParametersSnapshot.boundaryMode, undefined, "旧 boundaryMode=specified 迁移后不得继续写入新快照");
assert.equal(legacySpecifiedRuleConfigured.processingParametersSnapshot.separatorType, "newline", "旧 specified 配置应保留原有首选分隔符");
assert.deepEqual(legacySpecifiedRuleConfigured.processingParametersSnapshot.recursiveBoundaries, expectedRecursiveBoundaries.slice(1), "旧 specified 换行配置应补齐更细递归降级链");
const legacySentenceRuleConfigured = actions.setKnowledgeBaseOnboardingConfig(separatorMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: { mode: "separator", maxChars: 1500, overlapPercent: 5, separatorType: "sentence" },
});
assert.equal(legacySentenceRuleConfigured.processingParametersSnapshot.separatorType, "sentence", "动作层仍应读取历史 sentence 规则快照");
assert.equal(legacySentenceRuleConfigured.processingParametersSnapshot.separator, "。！？.!?", "历史 sentence 快照应保留合并句末标点");
assert.equal(legacySentenceRuleConfigured.processingParametersSnapshot.boundaryMode, undefined, "无 boundaryMode 的旧 separator 规则应直接迁移为新单层快照");
assert.deepEqual(legacySentenceRuleConfigured.processingParametersSnapshot.recursiveBoundaries, ["sentence", "whitespace", "character"], "历史 sentence 规则应补齐空白与字符降级");
const legacyLiteralRuleConfigured = actions.setKnowledgeBaseOnboardingConfig(separatorMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: { mode: "separator", maxChars: 1500, overlapPercent: 5, separatorType: "literal", separator: "." },
});
assert.equal(legacyLiteralRuleConfigured.processingParametersSnapshot.separatorType, "en_period", "历史 literal 英文句点应归一为新的 en_period 类型");
assert.equal(legacyLiteralRuleConfigured.processingParametersSnapshot.separator, ".", "历史 literal 归一后应保留原分隔符");
const legacyCustomRuleConfigured = actions.setKnowledgeBaseOnboardingConfig(separatorMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: { mode: "separator", maxChars: 1500, overlapPercent: 5, separatorType: "custom", customSeparator: "---" },
});
assert.equal(legacyCustomRuleConfigured.processingParametersSnapshot.separatorType, "custom", "动作层仍应读取历史 custom 规则快照");
assert.equal(legacyCustomRuleConfigured.processingParametersSnapshot.customSeparator, "---", "历史 custom 拆分标记应在数据契约中完整保留");
const emptyLegacyCustomRule = actions.setKnowledgeBaseOnboardingConfig(separatorMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: { mode: "separator", maxChars: 1500, overlapPercent: 5, separatorType: "custom", customSeparator: "" },
});
assert.equal(emptyLegacyCustomRule.processingParametersSnapshot.separatorType, "paragraph", "空的历史 custom 值应安全回退为段落边界，不再阻断保存");
assert.equal(actions.deleteKnowledgeBase(customMethodKnowledgeBase.id), customMethodKnowledgeBase, "闭环测试完成后应能删除未启用的结构 method 测试库");
assert.equal(actions.deleteKnowledgeBase(separatorMethodKnowledgeBase.id), separatorMethodKnowledgeBase, "闭环测试完成后应能删除未启用的分隔符 method 测试库");

const pageProfile = state.rag.ingestionProfiles.find((item) => item.id === "ING-PAGE");
const wholeDocumentProfile = state.rag.ingestionProfiles.find((item) => item.id === "ING-WHOLE");
const pageProfileBefore = structuredClone(pageProfile);
const wholeDocumentProfileBefore = structuredClone(wholeDocumentProfile);
const pageMethodKnowledgeBase = actions.createKnowledgeBase({
  name: "按页切片参数闭环测试库",
  purpose: "验证连续分页参数、界面边界和零重叠快照。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
});
for (const pagesPerChunk of [0, 11, 1.5, Infinity]) {
  assert.equal(actions.setKnowledgeBaseOnboardingConfig(pageMethodKnowledgeBase.id, {
    ingestionProfileId: "ING-PAGE",
    processingParameters: { mode: "page", pagesPerChunk },
  }), null, "按页切片应拒绝 1–10 以外或非整数的每片页数");
}
const pageConfigured = actions.setKnowledgeBaseOnboardingConfig(pageMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-PAGE",
  processingParameters: { mode: "page", pagesPerChunk: 3, overlapPercent: 17, includeContext: true, separatorType: "paragraph", semanticSensitivity: "inactive", longDocumentFallback: "inactive" },
  completed: true,
});
assert.ok(pageConfigured, "按页切片应能保存专用页数参数");
for (const snapshot of [pageConfigured.processingProfileSnapshot.chunking, pageConfigured.processingParametersSnapshot]) {
  assert.equal(snapshot.mode, "page", "按页快照应保留独立模式");
  assert.equal(snapshot.pagesPerChunk, 3, "按页快照应保存每片连续页数");
  assert.equal(snapshot.overlapPercent, 0, "按页快照应规范化为零字符重叠，不继承无效重叠参数");
  assert.equal(snapshot.includeContext, true, "按页切片固定保留系统底线的相邻上下文");
  assert.equal(snapshot.contextPolicy, "standard", "按页切片默认应固化为标准上下文补全策略");
  assert.equal(snapshot.separatorType, "literal", "按页快照应恢复字面分页边界类型，不继承其他模式的段落选项");
  assert.equal(snapshot.separator, "\f", "按页快照应固定分页符，不被隐藏下拉的段落值污染");
}
const pageProcessingHtml = pages.knowledge.render({ name: "knowledge", id: pageMethodKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
assert.match(pageProcessingHtml, /name="processing-method" value="page"[^>]*data-processing-profile-id="ING-PAGE"[^>]*checked/, "按页模式应回显对应方法卡片");
assert.match(pageProcessingHtml, /<input\b(?=[^>]*\bdata-processing-param="pagesPerChunk")(?=[^>]*\bmin="1")(?=[^>]*\bmax="10")(?=[^>]*\bstep="1")(?=[^>]*\bvalue="3")[^>]*>/, "按页编辑区应以 1–10 的整数页数控件回显已保存参数");
assert.doesNotMatch(pageProcessingHtml, /data-processing-param="(?:maxChars|overlapPercent|separatorType|semanticSensitivity|longDocumentFallback)"/, "按页编辑区不得混入字符切片或整篇专用参数");
assert.match(pageProcessingHtml, /父子块检索[\s\S]*data-processing-param="parentChildEnabled"/, "按页切片应保留独立父子块检索开关");
assert.doesNotMatch(pageProcessingHtml, /data-processing-param="contextPolicy"|上下文补全策略/, "按页切片不应展示上下文补全策略下拉");
const pageProcessingHelp = pageProcessingHtml.match(/id="processing-pages-help"[^>]*>([\s\S]*?)<\/div>/)?.[1] || "";
assert.match(pageProcessingHelp, /连续/, "按页提示应解释按连续页面组成切片");
assert.match(pageProcessingHelp, /解析/, "按页提示应交代依赖解析结果的分页信息");
assert.match(pageProcessingHelp, /分页|页码/, "按页提示应明确依赖分页或页码边界");
assert.deepEqual(pageProfile, pageProfileBefore, "本次按页参数不得改写共享代码预置");
assert.equal(actions.deleteKnowledgeBase(pageMethodKnowledgeBase.id), pageMethodKnowledgeBase, "按页参数测试后应清理测试库");

for (const longDocumentFallback of ["smart", "stop"]) {
  const wholeMethodKnowledgeBase = actions.createKnowledgeBase({
    name: `整篇切片参数闭环测试库-${longDocumentFallback}`,
    purpose: "验证整篇阈值提示、超长处理选项与不适用参数隔离。",
    embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
  });
  assert.equal(actions.setKnowledgeBaseOnboardingConfig(wholeMethodKnowledgeBase.id, {
    ingestionProfileId: "ING-WHOLE",
    processingParameters: { mode: "whole_document", longDocumentFallback: "truncate" },
  }), null, "整篇切片不得接受自动切片或停止以外的超长处理值");
  const wholeConfigured = actions.setKnowledgeBaseOnboardingConfig(wholeMethodKnowledgeBase.id, {
    ingestionProfileId: "ING-WHOLE",
    processingParameters: { mode: "whole_document", longDocumentFallback, overlapPercent: 17, includeContext: true, separatorType: "paragraph", semanticSensitivity: "inactive", pagesPerChunk: 0 },
    completed: true,
  });
  assert.ok(wholeConfigured, `${longDocumentFallback} 超长处理选项应可保存`);
  for (const snapshot of [wholeConfigured.processingProfileSnapshot.chunking, wholeConfigured.processingParametersSnapshot]) {
    assert.equal(snapshot.mode, "whole_document", "整篇快照应保留独立模式");
    assert.equal(snapshot.longDocumentFallback, longDocumentFallback, "整篇快照应保存所选超长处理方式");
    assert.equal(snapshot.overlapPercent, 0, "整篇快照必须为零重叠，不继承字符切片的重叠参数");
    assert.equal(snapshot.includeContext, false, "整篇快照必须关闭不存在的相邻切片上下文");
    assert.equal(snapshot.contextPolicy, "none", "整篇快照应固化无上下文补全策略");
    assert.equal(snapshot.separatorType, "literal", "整篇快照应使用独立字面边界类型");
    assert.equal(snapshot.separator, "", "整篇快照必须保留空分隔符，不被隐藏下拉的段落值污染");
  }
  assert.equal(wholeConfigured.processingProfileSnapshot.chunking.maxDocumentChars, 20000, "整篇处理应保留 20000 字符的现有文档阈值");
  const wholeProcessingHtml = pages.knowledge.render({ name: "knowledge", id: wholeMethodKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
  assert.match(wholeProcessingHtml, /name="processing-method" value="whole_document"[^>]*data-processing-profile-id="ING-WHOLE"[^>]*checked/, "整篇模式应回显对应方法卡片");
  const wholeFallbackSelect = wholeProcessingHtml.match(/<select\b(?=[^>]*\bdata-processing-param="longDocumentFallback")[^>]*>[\s\S]*?<\/select>/)?.[0] || "";
  assert.deepEqual(Array.from(wholeFallbackSelect.matchAll(/<option\b[^>]*\bvalue="([^"]+)"/g), (match) => match[1]), ["smart", "stop"], "整篇超长处理下拉应且仅应保留自动切片与停止两项");
  assert.match(wholeFallbackSelect, new RegExp('<option\\b[^>]*value="' + longDocumentFallback + '"[^>]*\\bselected\\b'), "整篇超长处理应正确回显已保存的选项");
  assert.doesNotMatch(wholeProcessingHtml, /data-processing-param="(?:maxChars|overlapPercent|pagesPerChunk|separatorType|semanticSensitivity|includeContext)"/, "整篇编辑区不得展示不适用的切片参数和相邻上下文开关");
  const wholeParentChildControl = wholeProcessingHtml.match(/<input\b(?=[^>]*\bdata-processing-param="parentChildEnabled")[^>]*>/)?.[0] || "";
  assert.match(wholeProcessingHtml, /父子块检索[\s\S]*通过上下文增强，在检索命中后补充更完整的内容[\s\S]*子块：参与 Embedding、检索和评分[\s\S]*父块：命中后补充上下文/, "整篇模式应保留统一的父子块说明");
  assert.doesNotMatch(wholeProcessingHtml, /<span class="tag">(?:不适用|上下文增强)<\/span>|整篇切片本身就是完整上下文|父子块检索不适用于整篇切片|如需父子块检索/, "整篇模式只通过置灰开关表达不可用，不应额外展示标签或差异化说明");
  assert.match(wholeParentChildControl, /\bdisabled\b/, "整篇模式的父子块开关应禁用");
  assert.match(wholeProcessingHtml, /高级配置[\s\S]*data-processing-param="tableText"[\s\S]*data-processing-param="formulaText"[\s\S]*data-processing-param="imageText"/, "整篇模式仅在高级配置保留表格、公式和图片图表索引项");
  assert.doesNotMatch(wholeProcessingHtml, /处理策略摘要|data-processing-param="contextPolicy"|上下文补全策略/, "整篇模式不应展示摘要或上下文策略下拉");
  assert.doesNotMatch(wholeProcessingHtml, /data-processing-param="(?:documentName|headingPath|pageNumber|includeContext)"/, "整篇模式不得把来源定位或相邻上下文作为普通复选项");
  assert.match(wholeProcessingHtml, /20,?000\s*字符/, "整篇编辑区应显示现有 20000 字符阈值，解释超长处理的触发条件");
  assert.equal(actions.deleteKnowledgeBase(wholeMethodKnowledgeBase.id), wholeMethodKnowledgeBase, "整篇参数测试后应清理测试库");
}
assert.deepEqual(wholeDocumentProfile, wholeDocumentProfileBefore, "本次整篇参数不得改写共享代码预置");

const parameterIsolationKnowledgeBase = actions.createKnowledgeBase({
  name: "切片参数隔离闭环测试库",
  purpose: "验证整数参数、无关字段隔离与旧 Token 设置兼容。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
});
for (const profile of visibleProcessingPresets) {
  const mode = profile.chunking.mode;
  assert.equal(actions.setKnowledgeBaseOnboardingConfig(parameterIsolationKnowledgeBase.id, {
    ingestionProfileId: profile.id,
    processingParameters: { mode, maxChars: 1000.5 },
  }), null, `${mode} 新方案必须拒绝非整数的字符上限`);
  if (["smart", "structure", "separator", "fixed"].includes(mode)) {
    assert.equal(actions.setKnowledgeBaseOnboardingConfig(parameterIsolationKnowledgeBase.id, {
      ingestionProfileId: profile.id,
      processingParameters: { mode, maxChars: 1000, overlapPercent: 10.5 },
    }), null, `${mode} 新方案必须拒绝非整数的重叠百分比`);
  }
  const normalizedConfiguration = actions.setKnowledgeBaseOnboardingConfig(parameterIsolationKnowledgeBase.id, {
    ingestionProfileId: profile.id,
    processingParameters: {
      mode, maxChars: 1001, overlapPercent: 10,
      semanticSensitivity: mode === "semantic" ? "balanced" : "inactive",
      pagesPerChunk: mode === "page" ? 2 : 0,
      longDocumentFallback: mode === "whole_document" ? "smart" : "inactive",
      parentChildEnabled: true,
    },
  });
  assert.ok(normalizedConfiguration, `${mode} 应接受整数参数并忽略其他模式的无关字段`);
  for (const snapshot of [normalizedConfiguration.processingProfileSnapshot.chunking, normalizedConfiguration.processingParametersSnapshot]) {
    assert.equal(snapshot.maxChars, 1001, `${mode} 应保存非百位整数上限，不能只支持步长 100`);
    for (const key of ["targetTokens", "maxTokens", "overlapTokens"]) assert.equal(Object.hasOwn(snapshot, key), false, `${mode} 规范化快照不得残留旧 ${key} 设置`);
    assert.equal(snapshot.parentChildEnabled, mode !== "whole_document", `${mode} 应按适用性固化父子块开关`);
    assert.equal(snapshot.contextPolicy, mode === "whole_document" ? "none" : "enhanced", `${mode} 应按适用性固化上下文补全策略`);
  }
  if (mode === "whole_document") assert.equal(normalizedConfiguration.processingProfileSnapshot.chunking.maxDocumentChars, 1001, "整篇文档阈值应与其字符上限保持一致");
  const modeProcessingHtml = pages.knowledge.render({ name: "knowledge", id: parameterIsolationKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
  assert.equal((modeProcessingHtml.match(/<input\b(?=[^>]*\bdata-processing-param="parentChildEnabled")/g) || []).length, 1, `${mode} 应且仅应展示一个父子块检索开关`);
  const modeParentChildControl = modeProcessingHtml.match(/<input\b(?=[^>]*\bdata-processing-param="parentChildEnabled")[^>]*>/)?.[0] || "";
  assert.ok(modeParentChildControl, `${mode} 页面应保留父子块检索开关`);
  assert.doesNotMatch(modeProcessingHtml, /data-processing-param="contextPolicy"|上下文补全策略/, `${mode} 页面不应保留上下文策略下拉`);
  if (mode === "whole_document") {
    assert.match(modeParentChildControl, /\bdisabled\b/, "整篇模式下父子块开关应可见但不可操作");
    assert.doesNotMatch(modeParentChildControl, /\bchecked\b/, "整篇模式下不得伪回显已启用的父子块");
    assert.match(modeProcessingHtml, /父子块检索[\s\S]*通过上下文增强，在检索命中后补充更完整的内容[\s\S]*子块：参与 Embedding、检索和评分[\s\S]*父块：命中后补充上下文/, "整篇模式应保留统一的父子块说明");
    assert.doesNotMatch(modeProcessingHtml, /<span class="tag">(?:不适用|上下文增强)<\/span>|整篇切片本身就是完整上下文|父子块检索不适用于整篇切片|如需父子块检索/, "整篇模式不应额外展示标签或差异化说明");
  } else {
    assert.doesNotMatch(modeParentChildControl, /\bdisabled\b/, `${mode} 的父子块开关应可操作`);
    assert.match(modeParentChildControl, /\bchecked\b/, `${mode} 应回显已保存的父子块开关`);
  }
}
const fractionalFixedConfiguration = actions.setKnowledgeBaseOnboardingConfig(parameterIsolationKnowledgeBase.id, {
  ingestionProfileId: "ING-FIXED",
  processingParameters: { mode: "fixed", maxChars: 1000.5, overlapPercent: 10.5 },
});
assert.equal(fractionalFixedConfiguration, null, "正式 fixed 配置不得写入 UI 无法表达的小数字符或重叠参数");
assert.equal(actions.deleteKnowledgeBase(parameterIsolationKnowledgeBase.id), parameterIsolationKnowledgeBase, "参数隔离测试后应清理测试库");

const existingImportUploadHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { onboarding: "1", step: "upload", flow: "import" } }, state);
const existingImportParseHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { onboarding: "1", step: "parse", flow: "import" } }, state);
const existingImportProcessingHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { onboarding: "1", step: "processing", flow: "import" } }, state);
assert.match(existingImportUploadHtml, /page-header__title">导入文件[\s\S]*creation-steps[\s\S]*data-existing-import="true"/, "已有知识库导入应从完整四步流程的文件上传步骤进入");
assert.match(existingImportParseHtml, /page-header__title">导入文件[\s\S]*parse-recognition[\s\S]*parse-visual-understanding/, "已有知识库导入应完整保留文档解析编辑步骤");
assert.match(existingImportParseHtml, /data-parse-back/, "普通已有知识库导入的解析页应允许返回资料选择");
assert.doesNotMatch(existingImportParseHtml, /parse-return-images|parse-addon-title|附加输出|保留原图/, "已有知识库导入同样不应暴露原图保存选项");
assert.match(existingImportProcessingHtml, /page-header__title">导入文件[\s\S]*name="processing-family"[\s\S]*data-processing-method-list[\s\S]*data-processing-param="maxChars"[\s\S]*data-existing-import="true"/, "已有知识库导入应完整保留 family/method 选择和本次参数编辑");
const reprocessSourceDocument = state.documents.find((item) => item.knowledgeBaseId === "KB-SCM-2024-V1" && item.fileVersionId);
assert.ok(reprocessSourceDocument, "重新处理交互测试需要一个已在知识库中的文件");
const reprocessParseBatch = actions.startKnowledgeImport("KB-SCM-2024-V1", {
  fileVersionIds: [reprocessSourceDocument.fileVersionId],
  deferred: true,
  reprocess: true,
  returnRoute: "knowledge/KB-SCM-2024-V1?tab=documents",
});
assert.ok(reprocessParseBatch && reprocessParseBatch.reprocess, "重新处理入口应创建带明确语义的批次");
const reprocessParseHtml = pages.knowledge.render({ name: "knowledge", id: "KB-SCM-2024-V1", query: { onboarding: "1", step: "parse", batch: reprocessParseBatch.id, flow: "import" } }, state);
assert.match(reprocessParseHtml, /data-onboarding-cancel[\s\S]*data-parse-next/, "重新处理解析页应保留取消和下一步操作");
assert.doesNotMatch(reprocessParseHtml, /data-parse-back|>上一步<\/button>/, "重新处理直接从解析开始，不应提供返回资料选择的上一步操作");
assert.ok(actions.cancelImportProcessing(reprocessParseBatch.id), "重新处理解析页测试后应清理待处理批次");
assert.equal(actions.setKnowledgeBaseOnboardingConfig(createdKnowledgeBase.id, { mineruParseConfig: { effort: "flash", parseMethod: "auto" } }), null, "动作层应拒绝非官方 MinerU effort 值");
assert.equal(createdKnowledgeBase.mineruParseConfig.effort, "medium", "无效解析配置不得污染知识库状态");
const normalizedMediumParse = actions.setKnowledgeBaseOnboardingConfig(createdKnowledgeBase.id, { mineruParseConfig: { effort: "medium", parseMethod: "auto", imageAnalysisEnabled: true } });
assert.equal(normalizedMediumParse.mineruParseConfig.effort, "high", "开启 VLM Image Analysis 时动作层应自动切换为精细解析");
assert.equal(normalizedMediumParse.mineruParseConfig.imageAnalysisEnabled, true, "合并视觉配置应成为唯一权威字段");
assert.equal(Object.prototype.hasOwnProperty.call(normalizedMediumParse.mineruParseConfig, "imageUnderstandingEnabled"), false, "新配置不应继续写拆分的图片理解字段");
assert.equal(Object.prototype.hasOwnProperty.call(normalizedMediumParse.mineruParseConfig, "chartUnderstandingEnabled"), false, "新配置不应继续写拆分的图表理解字段");
const explicitVisualOff = actions.setKnowledgeBaseOnboardingConfig(createdKnowledgeBase.id, { mineruParseConfig: { imageAnalysisEnabled: false, imageUnderstandingEnabled: true, chartUnderstandingEnabled: true } });
assert.equal(explicitVisualOff.mineruParseConfig.imageAnalysisEnabled, false, "显式的新合并字段应优先于旧拆分字段");
assert.equal(explicitVisualOff.mineruParseConfig.effort, "medium", "关闭视觉理解后系统必须自动降回标准解析");
const normalizedRequiredOutputs = actions.setKnowledgeBaseOnboardingConfig(createdKnowledgeBase.id, { mineruParseConfig: {
  effort: "medium",
  parseMethod: "auto",
  imageAnalysisEnabled: false,
  textContentEnabled: false,
  layoutStructureEnabled: false,
  returnContentList: false,
  preserveLocators: false,
  returnImages: false,
} });
assert.equal(normalizedRequiredOutputs.mineruParseConfig.textContentEnabled, true, "动作层必须强制保留文本内容");
assert.equal(normalizedRequiredOutputs.mineruParseConfig.layoutStructureEnabled, true, "动作层必须强制保留版面结构");
assert.equal(normalizedRequiredOutputs.mineruParseConfig.returnContentList, true, "结构化内容列表应成为版面结构的固定底层产物");
assert.equal(normalizedRequiredOutputs.mineruParseConfig.preserveLocators, true, "页块定位应成为版面结构的固定底层产物");
assert.equal(normalizedRequiredOutputs.mineruParseConfig.returnImages, true, "动作层应忽略关闭请求并固定保存原图");
assert.equal(normalizedRequiredOutputs.mineruParseConfig.imageAnalysisEnabled, false, "固定保存原图不应开启 VLM 内容理解");
assert.equal(actions.setKnowledgeBaseOnboardingConfig(createdKnowledgeBase.id, {
  ingestionProfileId: "ING-01",
  processingParameters: { maxChars: 20, overlapPercent: 10 },
}), null, "本次处理参数应复用共享策略的边界校验");
assert.equal(createdKnowledgeBase.currentIngestionProfileId, null, "无效本次参数不得提前绑定处理策略");

const sharedIng01BeforeOnboarding = structuredClone(state.rag.ingestionProfiles.find((item) => item.id === "ING-01").chunking);
const onboardingConfigured = actions.setKnowledgeBaseOnboardingConfig(createdKnowledgeBase.id, {
  mineruParseConfig: {
    effort: "high",
    parseMethod: "auto",
    executionMode: "local",
    tableEnabled: true,
    formulaEnabled: true,
    imageAnalysisEnabled: true,
    textContentEnabled: true,
    layoutStructureEnabled: true,
    returnContentList: true,
    returnImages: true,
    preserveLocators: true,
  },
  ingestionProfileId: "ING-01",
  processingParameters: { maxChars: 1480, overlapPercent: 14 },
  completed: true,
});
assert.ok(onboardingConfigured, "四步建库流程应能保存 MinerU 解析与文档处理策略");
assert.equal(onboardingConfigured.mineruParseConfig.effort, "high", "应保存系统从视觉识别选择派生的解析模式");
assert.equal(onboardingConfigured.mineruParseConfig.parseMethod, "auto", "应保存 MinerU 公开支持的 auto/txt/ocr 识别方式");
assert.equal(onboardingConfigured.mineruParseConfig.imageAnalysisEnabled, true, "合并视觉理解开启时应启用 Image Analysis");
assert.equal(onboardingConfigured.mineruParseConfig.returnImages, true, "完成四步配置后仍应固定保存原图");
assert.equal(onboardingConfigured.currentIngestionProfileId, "ING-01", "第 4 步应应用任一生效的文档处理策略");
assert.equal(onboardingConfigured.processingProfileSnapshot.chunking.maxChars, 1480, "第 4 步应将本次最大字符数写入知识库快照");
assert.equal(onboardingConfigured.processingProfileSnapshot.chunking.overlapPercent, 14, "第 4 步应将本次重叠比例写入知识库快照");
assert.equal(onboardingConfigured.processingParametersSnapshot.mode, "smart", "知识库应固化本次切片方式");
assert.equal(Object.prototype.hasOwnProperty.call(onboardingConfigured.processingParametersSnapshot, "semanticSensitivity"), false, "自动切片快照不得混入语义断点参数");
assert.equal(onboardingConfigured.processingParametersSnapshot.maxChars, 1480, "知识库应固化本次最大字符数");
assert.equal(onboardingConfigured.processingParametersSnapshot.overlapPercent, 14, "知识库应固化本次重叠比例");
assert.equal(onboardingConfigured.processingParametersSnapshot.includeContext, true, "知识库应固化本次关联上下文设置");
assert.equal(onboardingConfigured.processingParametersSnapshot.indexContent.documentName, true, "知识库应固化本次文件名关联设置");
assert.equal(onboardingConfigured.processingParametersSnapshot.indexContent.tableText, true, "知识库应固化本次表格索引内容设置");
assert.equal(onboardingConfigured.processingParametersSnapshot.indexContent.formulaText, true, "知识库应固化本次公式索引内容设置");
assert.deepEqual(state.rag.ingestionProfiles.find((item) => item.id === "ING-01").chunking, sharedIng01BeforeOnboarding, "本次处理参数不得修改共享文档处理策略");
assert.equal(onboardingConfigured.boundEmbeddingModelId, "MODEL-EMBEDDING-PRIMARY", "切换文档处理策略不得改变知识库绑定的向量模型");
assert.equal(onboardingConfigured.boundVectorDimension, 4096, "切换文档处理策略不得改变知识库向量维度");
createdKnowledgeBase.mineruParseConfig.returnImages = false;
const createdImportBatch = actions.startKnowledgeImport(createdKnowledgeBase.id, { files: [{ name: "长文档示例.pdf", size: 1200 }] });
assert.equal(createdImportBatch.status, "pending_configuration", "导入只先登记文件，处理需要显式提交");
await completeBatch(createdImportBatch);
assert.equal(createdImportBatch.mineruParseConfig.returnImages, true, "直接导入批次快照不得继承旧配置中的原图关闭状态");
assert.deepEqual(createdImportBatch.items[0].processingEstimate.embeddingStages.map((item) => item.key), ["final_chunk_embedding"], "自动切片入库只应生成最终索引向量，不得静默增加语义边界 Embedding");
const createdIndexTransaction = state.knowledgeVersions.find((item) => item.id === createdImportBatch.resultingKnowledgeVersionId);
assert.ok(createdIndexTransaction.sourceBatchIds.includes(createdImportBatch.id), "常规导入批次应回写到内部索引事务来源");
assert.equal(createdImportBatch.ingestionProfileId, "ING-01", "索引来源批次应记录第 4 步显式选择的文档处理策略");
assert.equal(createdIndexTransaction.status, "effective", "常规导入应自动完成索引，不依赖运营人员处理隐藏版本");
assert.equal(createdImportBatch.processingProfileSnapshot.chunking.maxChars, 1480, "后续常规导入应沿用知识库已经固化的处理参数，而不是回退到共享预置");
assert.notEqual(createdImportBatch.processingProfileSnapshot, onboardingConfigured.processingProfileSnapshot, "导入批次必须深拷贝知识库处理快照，不能共享可变对象");
assert.equal(createdKnowledgeBase.documentCounts.searchable, createdKnowledgeBase.documentCounts.total, "无异常的新文件应在处理后直接进入可检索范围");
const documentTotalBeforeStaging = createdKnowledgeBase.documentCounts.total;
const stagedOnboardingBatch = actions.startKnowledgeImport(createdKnowledgeBase.id, { files: [{ name: "待配置文档.pdf", size: 1600 }], deferred: true });
assert.equal(stagedOnboardingBatch.status, "pending_configuration", "建库第 2 步只应接收并暂存文件");
assert.ok(state.fileVersions.some((item) => item.id === stagedOnboardingBatch.items[0].fileVersionId), "上传时立即登记原文件版本，不等处理完成");
assert.equal(state.documents.find((item) => item.id === stagedOnboardingBatch.items[0].documentId)?.searchable || false, false, "待配置文件不能提前可检索");
const pendingImportHtml = pages.knowledge.render({ name: "knowledge", id: createdKnowledgeBase.id, query: { tab: "documents" } }, state);
assert.doesNotMatch(pendingImportHtml, /处理任务|knowledge-import-task|data-import-task-/, "知识库详情页不应为待配置批次追加处理任务板块");
const pendingImportConfigurationHtml = pages.knowledge.render({ name: "knowledge", id: createdKnowledgeBase.id, query: { onboarding: "1", step: "parse", batch: stagedOnboardingBatch.id, flow: "import" } }, state);
assert.match(pendingImportConfigurationHtml, /page-header__title">导入文件[\s\S]*parse-recognition[\s\S]*data-parse-next/, "移除详情任务板块后，带批次的正常解析配置路径仍应可用");
assert.match(pendingImportConfigurationHtml, /data-parse-back/, "带批次的普通导入解析页仍应允许返回资料选择");
actions.testRagModelConnection("embedding", primaryEmbedding.id, { simulateFailure: true });
assert.equal(actions.completeImportProcessing(stagedOnboardingBatch.id, {
  ingestionProfileId: "ING-02",
  processingParameters: { maxChars: 1760, overlapPercent: 6, includeContext: false, documentName: true, headingPath: true, pageNumber: true, tableText: false },
}), null, "Step 2 可先暂存文件，但向量模型未测通时 Step 4 不得启动处理");
assert.equal(stagedOnboardingBatch.status, "pending_configuration", "模型连接未恢复时，暂存批次应保持待配置且不创建处理对象");
actions.testRagModelConnection("embedding", primaryEmbedding.id);
const sharedIng02BeforeOnboarding = structuredClone(state.rag.ingestionProfiles.find((item) => item.id === "ING-02").chunking);
const activatedOnboarding = await completeBatch(stagedOnboardingBatch, {
  ingestionProfileId: "ING-02",
  processingParameters: { maxChars: 1760, overlapPercent: 6, includeContext: false, documentName: true, headingPath: true, pageNumber: true, tableText: false },
});
assert.ok(activatedOnboarding, "完成第 4 步后应激活暂存批次");
assert.equal(stagedOnboardingBatch.status, "completed", "暂存批次应在策略完成后自动完成处理");
assert.equal(stagedOnboardingBatch.ingestionProfileId, "ING-02", "批次应快照第 4 步选择的文档处理策略");
assert.equal(stagedOnboardingBatch.mineruParseConfig.effort, "high", "批次应快照第 3 步的 MinerU 解析策略");
assert.equal(stagedOnboardingBatch.mineruParseConfig.returnImages, true, "批次快照应固定保存原图");
assert.equal(stagedOnboardingBatch.processingProfileSnapshot.chunking.maxChars, 1760, "暂存批次应固化本次最大字符数");
assert.equal(stagedOnboardingBatch.processingProfileSnapshot.chunking.overlapPercent, 6, "暂存批次应固化本次重叠比例");
assert.equal(stagedOnboardingBatch.processingParametersSnapshot.maxChars, 1760, "批次应提供独立的本次处理参数快照");
assert.equal(stagedOnboardingBatch.processingParametersSnapshot.includeContext, true, "批次应固定保留系统底线的基础上下文");
assert.equal(stagedOnboardingBatch.processingParametersSnapshot.indexContent.tableText, false, "批次应固化本次索引内容开关");
assert.deepEqual(state.rag.ingestionProfiles.find((item) => item.id === "ING-02").chunking, sharedIng02BeforeOnboarding, "批次本次参数不得回写共享处理策略");
assert.equal(stagedOnboardingBatch.items.every((item) => item.documentId && state.documents.find((document) => document.id === item.documentId)?.searchable), true, "完成索引后逐文件引用应进入检索范围");
assert.equal(stagedOnboardingBatch.items.every((item) => item.pipeline.every((step) => step.status === "success")), true, "建库首批文件应自动完成解析、切片、向量化与索引");
assert.ok(stagedOnboardingBatch.resultingKnowledgeVersionId, "建库首批文件应产生内部可追溯索引结果");
const parseSettingsHtml = pages.knowledge.render({ name: "knowledge", id: createdKnowledgeBase.id, query: { settings: "parse" } }, state);
assert.match(parseSettingsHtml, /page-header__title">文档解析策略[\s\S]*data-parse-settings-cancel[\s\S]*data-parse-settings-save/, "知识库应提供无创建进度条的后续导入解析策略设置页");
assert.doesNotMatch(parseSettingsHtml, /creation-steps/, "持续维护解析策略不应混入四步建库进度");
assert.match(parseSettingsHtml, /仅影响新导入文件，不会重新处理已有文件/, "解析策略设置页应明确只影响后续导入");
assert.doesNotMatch(parseSettingsHtml, /parse-return-images|parse-addon-title|附加输出|保留原图/, "后续导入解析策略同样不应暴露原图保存选项");
const parseConfigWithFewerOutputs = actions.setKnowledgeBaseOnboardingConfig(createdKnowledgeBase.id, {
  mineruParseConfig: { effort: "medium", parseMethod: "txt", imageAnalysisEnabled: false },
});
assert.ok(parseConfigWithFewerOutputs, "解析产物减少只影响可索引内容，不应阻止保存后续导入解析策略");
assert.equal(parseConfigWithFewerOutputs.mineruParseConfig.effort, "medium", "标准解析设置应按官方能力保存");
assert.equal(actions.getProcessingProfileCompatibility(state.rag.ingestionProfiles.find((item) => item.id === "ING-02"), parseConfigWithFewerOutputs.mineruParseConfig).completeOutput, false, "解析产物完整度应保留为内部提示而非选择门槛");
const parseLimitedKnowledgeBase = actions.createKnowledgeBase({
  name: "解析产物联动测试库",
  purpose: "验证第 4 步高级索引项只能选择第 3 步已解析产物。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
});
const parseLimitedConfigured = actions.setKnowledgeBaseOnboardingConfig(parseLimitedKnowledgeBase.id, {
  mineruParseConfig: { tableEnabled: false, formulaEnabled: false, imageAnalysisEnabled: false },
  ingestionProfileId: "ING-01",
  processingParameters: { maxChars: 1200, overlapPercent: 10, tableText: true, formulaText: true, imageText: true },
  completed: true,
});
assert.ok(parseLimitedConfigured, "解析产物减少不应阻断文档处理策略保存");
assert.equal(parseLimitedConfigured.processingParametersSnapshot.indexContent.tableText, false, "未启用表格解析时表格内容不能进入索引");
assert.equal(parseLimitedConfigured.processingParametersSnapshot.indexContent.formulaText, false, "未启用公式解析时公式内容不能进入索引");
assert.equal(parseLimitedConfigured.processingParametersSnapshot.indexContent.imageText, false, "未启用图片/图表内容理解时图片图表内容不能进入索引");
const parseLimitedProcessingHtml = pages.knowledge.render({ name: "knowledge", id: parseLimitedKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
for (const key of ["tableText", "formulaText", "imageText"]) {
  const control = parseLimitedProcessingHtml.match(new RegExp('<input\\b(?=[^>]*\\bdata-processing-param="' + key + '")[^>]*>'))?.[0] || "";
  assert.match(control, /\bdisabled\b/, `第 3 步未产生 ${key} 时第 4 步对应索引项应禁用`);
  assert.doesNotMatch(control, /\bchecked\b/, `第 3 步未产生 ${key} 时第 4 步对应索引项不得勾选`);
}
assert.doesNotMatch(parseLimitedProcessingHtml, /以下解析内容不会进入索引|第 3 步未勾选|暂无可进入索引的解析产物/, "处理策略卡片不应显示解析产物缺项提示或负向说明");
assert.equal(actions.deleteKnowledgeBase(parseLimitedKnowledgeBase.id), parseLimitedKnowledgeBase, "解析产物联动测试后应清理测试库");
const failedItem = state.importBatches
  .find((batch) => batch.id === "IMP-0825-03")
  .items.find((item) => item.id === "IMP-ITEM-001");

assert.equal(failedItem.countsTowardDocumentTotal, false, "首次解析失败不应计入文档总数");
const initialDocumentTotal = kb.documentCounts.total;
actions.retryImportItem("IMP-0825-03", "IMP-ITEM-001");
assert.equal(kb.documentCounts.total, initialDocumentTotal + 1, "重试成功后应计入文档总数");
assert.equal(kb.documentCounts.searchable, kb.documentCounts.total, "重试成功后应自动完成索引并进入可检索范围");
assert.equal(state.overview.metrics.importIssues.open, 0, "异常待办应随重试成功关闭");
assert.equal(state.overview.pendingItems.find((item) => item.id === "TODO-001").resolved, true, "真实导入失败处置成功后应闭环");
assert.equal(state.importBatches.find((item) => item.id === "IMP-0825-03").processingCount, 0, "批次完成前应同步推进剩余模拟处理项");

const automaticallyEffectiveIndex = state.knowledgeVersions.find((item) => item.id === seedImportBatch.resultingKnowledgeVersionId);
assert.ok(automaticallyEffectiveIndex && automaticallyEffectiveIndex.status === "effective", "重试成功后应自动产生已生效的内部索引结果");
assert.ok(automaticallyEffectiveIndex.sourceBatchIds.includes(seedImportBatch.id), "自动索引结果仍应保留导入批次来源");
assert.equal(kb.currentKnowledgeVersionId, automaticallyEffectiveIndex.id, "内部检索指针应在处理完成后自动切换");
assert.equal(seedImportBatch.candidateKnowledgeVersionId, null, "自动完成后导入批次不应留下需运营人工处置的候选索引");

const retrievalOperatorBeforeUpdate = { ...state.rag.retrievalSettings.operator };
const retrievalSystemBeforeUpdate = JSON.stringify(state.rag.retrievalSettings.system);
const ignoredLegacyWeightPreview = actions.previewRetrievalSettings({ keywordWeight: 5, semanticWeight: 80 });
assert.ok(ignoredLegacyWeightPreview, "历史或冲突的融合权重字段不应阻断其他有效运营设置");
assert.equal(Object.prototype.hasOwnProperty.call(ignoredLegacyWeightPreview.operator, "keywordWeight"), false, "预览归一化应忽略并移除旧关键词权重");
assert.equal(Object.prototype.hasOwnProperty.call(ignoredLegacyWeightPreview.operator, "semanticWeight"), false, "预览归一化应忽略并移除旧语义权重");
actions.clearRetrievalTestDraft();
assert.equal(actions.updateRetrievalSettings({ finalTopK: 21 }), null, "最终 Top K 不得超过 20");
assert.equal(actions.updateRetrievalSettings({ relevanceLevel: "unknown" }), null, "相关性要求只能使用宽松、均衡或严格三档");
assert.equal(actions.updateRetrievalSettings({ relevanceThreshold: 0.3 }), null, "最低相关度不得低于 0.4");
assert.equal(actions.updateRetrievalSettings({ relevanceThreshold: 1 }), null, "最低相关度不得高于 0.9");
assert.equal(actions.updateRetrievalSettings({ relevanceThreshold: 0.711 }), null, "最低相关度最多保留两位小数");
assert.equal(actions.updateRetrievalSettings({ relevanceThreshold: Number.NaN }), null, "最低相关度不得为非数值");
const hundredthRelevancePreview = actions.previewRetrievalSettings({ relevanceThreshold: 0.71 });
assert.equal(hundredthRelevancePreview.operator.relevanceThreshold, 0.71, "最低相关度应接受 0.71 这样的百分位数值");
assert.equal(hundredthRelevancePreview.operator.relevanceLevel, "strict", "0.71 应落入严格参考区间");
const hundredthRelevanceHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", settings: "preview" } }, state);
assert.match(hundredthRelevanceHtml, /id="test-relevance"[^>]*value="0\.71"[^>]*aria-valuetext="相关度阈值 0\.71，严格"/, "检索测试应以两位小数回显 0.71，并通过 aria-valuetext 表达当前区间");
assert.doesNotMatch(hundredthRelevanceHtml, /id="test-relevance"[^>]*aria-describedby=|data-relevance-description|当前 0\.71（严格）|仅返回相关度 ≥|开启 Rerank 时使用重排分，关闭时使用融合分/, "最低相关度变化不应在测试页显示区间说明、当前值或分数来源");
const nextHundredthRelevancePreview = actions.previewRetrievalSettings({ relevanceThreshold: 0.72 });
assert.equal(nextHundredthRelevancePreview.operator.relevanceThreshold, 0.72, "最低相关度应按 0.01 步长连续调整");
actions.clearRetrievalTestDraft();
const legacyRelevancePreview = actions.previewRetrievalSettings({ relevanceLevel: "strict" });
assert.equal(legacyRelevancePreview.operator.relevanceThreshold, 0.8, "旧版严格档 payload 应兼容迁移为 0.8 门槛");
actions.clearRetrievalTestDraft();
const savedRetrievalSettings = actions.updateRetrievalSettings({
  rerankEnabled: true,
  rerankerModelId: "MODEL-RERANK-PRIMARY",
  // 兼容旧调用方：即便传入冲突权重，动作层也应忽略，不能写回运营 operator。
  keywordWeight: 60,
  semanticWeight: 55,
  finalTopK: 8,
  relevanceThreshold: 0.7,
});
assert.ok(savedRetrievalSettings, "合法的 V2 全局检索设置应能直接保存");
assert.deepEqual(
  {
    rerankerModelId: savedRetrievalSettings.operator.rerankerModelId,
    finalTopK: savedRetrievalSettings.operator.finalTopK,
    relevanceThreshold: savedRetrievalSettings.operator.relevanceThreshold,
    relevanceLevel: savedRetrievalSettings.operator.relevanceLevel,
  },
  { rerankerModelId: "MODEL-RERANK-PRIMARY", finalTopK: 8, relevanceThreshold: 0.7, relevanceLevel: "balanced" },
  "全局检索设置应只保存运营人员可管理的 Rerank 与召回设置"
);
assert.equal(Object.prototype.hasOwnProperty.call(savedRetrievalSettings.operator, "keywordWeight"), false, "保存动作不得把旧关键词权重写入 operator");
assert.equal(Object.prototype.hasOwnProperty.call(savedRetrievalSettings.operator, "semanticWeight"), false, "保存动作不得把旧语义权重写入 operator");
assert.equal(Object.prototype.hasOwnProperty.call(savedRetrievalSettings.operator, "rerankCandidates"), false, "运营设置不应持久化系统派生候选数");
assert.equal(Object.prototype.hasOwnProperty.call(savedRetrievalSettings.operator, "maxChunksPerDocument"), false, "运营设置不应持久化不存在的单文件限制");
assert.equal(JSON.stringify(state.rag.retrievalSettings.system), retrievalSystemBeforeUpdate, "保存运营设置不得改写系统固定的混合检索链路");
assert.equal(Object.prototype.hasOwnProperty.call(kb, "currentRetrievalProfileId"), false, "V2 全局检索设置不应改写知识库为配置版本绑定");
assert.ok(actions.updateRetrievalSettings(retrievalOperatorBeforeUpdate), "验证后应能恢复原全局检索设置");

const kb2 = state.knowledgeBases.find((item) => item.id === "KB-002");
actions.setKnowledgeBaseEnabled(kb2.id, false);
actions.setKnowledgeBaseEnabled(kb2.id, true);
assert.equal(kb2.retrievalStatus, "available", "知识库重新启用后应恢复接收检索请求");
assert.equal(kb2.enabledStateLabel, "检索已启用", "开关状态应明确表达为检索已启用");

assert.equal(Object.prototype.hasOwnProperty.call(state, "analysisDefinitions"), false, "运营端状态不应保留分析口径数据");
assert.equal(Object.prototype.hasOwnProperty.call(pages, "definitions"), false, "运营端不应注册分析口径页面");
["createDefinition", "updateDefinition", "setDefinitionEnabled", "deleteDefinition"].forEach((name) => {
  assert.equal(typeof actions[name], "undefined", `运营端动作层不应保留 ${name}`);
});
assert.equal(state.configurationRecords.some((item) => item.objectType === "analysis_definition"), false, "运营端变更记录不应保留分析口径对象");
assert.doesNotMatch(JSON.stringify(state.managementFlows), /definitions|分析口径/, "运营端管理流程不应保留分析口径配置入口");

assert.equal(Object.prototype.hasOwnProperty.call(state, "outputProfiles"), false, "运营端状态不应保留报告模板数据");
assert.equal(Object.prototype.hasOwnProperty.call(pages, "outputProfiles"), false, "运营端页面注册不应保留报告模板页面");
["createOutputProfile", "updateOutputProfile", "setOutputProfileEnabled", "deleteOutputProfile", "setDefaultOutputProfile"].forEach((name) => {
  assert.equal(typeof actions[name], "undefined", `运营端动作层不应保留 ${name}`);
});
assert.equal(state.configurationRecords.some((item) => item.objectType === "output_profile"), false, "运营端变更记录不应保留报告模板对象");
assert.equal(state.managementFlows.some((item) => item.id === "FLOW-OUTPUT-PUBLISH"), false, "运营端管理流程不应保留报告模板发布流程");

const legacyApiFields = ["clientId", "credentialVersion", "scopes", "identityMode", "identityModeLabel", "ipAllowlist", "rpmLimit", "expiresAt", "revokedAt"];
assert.ok(state.apiAccess.clients.every((item) => legacyApiFields.every((field) => !Object.prototype.hasOwnProperty.call(item, field))), "API 密钥状态不应恢复旧通用 scopes、身份、IP、限流、到期或作废字段");
assert.equal(Object.prototype.hasOwnProperty.call(state.apiAccess, "products"), false, "单一检索 API 不应再维护产品选项");
assert.ok(state.apiAccess.clients.every((item) => item.name && item.apiType === "retrieval" && item.keyMasked.startsWith("sk_retrieval_") && item.createdAt && Object.prototype.hasOwnProperty.call(item, "lastUsedAt") && Array.isArray(item.knowledgeBaseIds) && item.knowledgeBaseIds.length && ["global", "custom"].includes(item.retrievalPolicy?.mode) && !Object.prototype.hasOwnProperty.call(item, "permissionLevel")), "API 密钥列表数据应包含知识库范围和检索策略，但不包含权限等级");
const apiAccessHtml = pages.apiAccess.render({ name: "api-access", id: null, query: {} }, state);
assert.match(apiAccessHtml, /<th>名称<\/th>[\s\S]*<th>API Key<\/th>[\s\S]*<th>知识库访问<\/th>[\s\S]*<th>检索策略<\/th>[\s\S]*<th>状态<\/th>[\s\S]*<th>最近使用时间<\/th>[\s\S]*<th>创建时间<\/th>[\s\S]*<th>操作<\/th>/, "API 密钥列表应回显知识库范围与检索策略");
assert.doesNotMatch(apiAccessHtml, /权限|permissionLevel|api-key-permission/, "API 密钥页面不应展示或配置权限等级");
assert.doesNotMatch(apiAccessHtml, /data-api-type-filter|data-api-type|<th>API 能力<\/th>|研判 Agent API/, "API 密钥页不应保留类型筛选、能力列或 Agent 选项");
assert.match(apiAccessHtml, /已启用[\s\S]*已禁用/, "API 密钥状态应统一显示为已启用或已禁用");
assert.doesNotMatch(apiAccessHtml, /table-footer|共\s*\d+\s*个 API 密钥/, "API 密钥列表不应显示数量 footer");

const apiKeyCustomPolicy = { mode: "custom", operator: { rerankEnabled: true, rerankerModelId: "MODEL-RERANK-MULTILINGUAL", finalTopK: 9, relevanceThreshold: 0.62 } };
const apiKeyGlobalConfig = { knowledgeBaseIds: ["KB-002"], retrievalPolicy: { mode: "global" } };
const createdRetrievalAccess = actions.createApiKey({ name: "质量检索门户", knowledgeBaseIds: ["KB-001"], retrievalPolicy: apiKeyCustomPolicy });
assert.deepEqual(Object.keys(createdRetrievalAccess), ["key"], "检索密钥只返回一次性明文 Key");
assert.ok(createdRetrievalAccess.key.startsWith("sk_retrieval_"), "检索密钥明文应使用独立前缀");
const createdRetrievalKey = state.apiAccess.clients.find((item) => item.name === "质量检索门户");
assert.ok(createdRetrievalKey && createdRetrievalKey.id, "新建检索密钥应写入内部 ID");
assert.equal(createdRetrievalKey.apiType, "retrieval", "缺省创建应固定写入 retrieval 类型");
assert.equal(createdRetrievalKey.status, "active", "新建检索密钥默认启用");
assert.deepEqual(createdRetrievalKey.knowledgeBaseIds, ["KB-001"], "新建检索密钥应保存知识库白名单");
assert.equal(createdRetrievalKey.retrievalPolicy.mode, "custom", "新建检索密钥应保存独立检索策略");
assert.equal(actions.resolveApiKeyRetrievalConfig(createdRetrievalKey.id, "KB-001")?.operator.finalTopK, 9, "独立策略应在运行时解析为该 Key 的参数");
assert.equal(actions.resolveApiKeyRetrievalConfig(createdRetrievalKey.id, "KB-002"), null, "未绑定知识库不得通过 Key 运行时校验");
assert.ok(actions.getRagModelUsage("reranker", "MODEL-RERANK-MULTILINGUAL").some((item) => item.id === createdRetrievalKey.id), "API Key 独立策略引用的 Rerank 模型应受删除保护");
assert.equal(Object.prototype.hasOwnProperty.call(createdRetrievalKey, "permissionLevel"), false, "检索 API 密钥不应保存权限等级");
assert.equal(Object.prototype.hasOwnProperty.call(createdRetrievalKey, "key"), false, "明文 Key 不得写入密钥对象");
assert.equal(JSON.stringify(state.apiAccess).includes(createdRetrievalAccess.key), false, "状态中只能保留检索密钥的脱敏值");
assert.equal(actions.createApiKey({ name: "", ...apiKeyGlobalConfig }), null, "名称是创建 API 密钥的必填项");
assert.equal(actions.createApiKey({ name: "缺少知识库", retrievalPolicy: { mode: "global" } }), null, "知识库范围是创建 API 密钥的必填项");
assert.equal(actions.createApiKey({ name: "缺少策略", knowledgeBaseIds: ["KB-001"] }), null, "检索策略是创建 API 密钥的必填项");
assert.equal(actions.createApiKey({ apiType: "other", name: "无效能力", ...apiKeyGlobalConfig }), null, "运营端 API 密钥只能绑定 retrieval");
assert.equal(actions.createApiKey({ apiType: "agent", name: "Agent 越界密钥", ...apiKeyGlobalConfig }), null, "运营端不得创建 Agent Key");
assert.equal(actions.createApiKey({ apiType: "", name: "空能力", ...apiKeyGlobalConfig }), null, "显式空 API 能力不得静默回退为检索 API");
assert.equal(actions.createApiKey({ apiType: "   ", name: "空白能力", ...apiKeyGlobalConfig }), null, "空白 API 能力不得静默回退为检索 API");
assert.equal(actions.createApiKey({ apiType: "retrieval", name: " 质量检索门户 ", ...apiKeyGlobalConfig }), null, "检索 API 名称去重应忽略首尾空格");

assert.equal(typeof actions.rotateApiKey, "undefined", "API 密钥不应存在轮换功能");

const unaffectedRetrievalKey = state.apiAccess.clients.find((item) => item.id === "API-003");
actions.setApiKeyEnabled(createdRetrievalKey.id, false);
assert.equal(createdRetrievalKey.status, "disabled", "检索 API 密钥应可停用");
assert.equal(unaffectedRetrievalKey.status, "active", "停用一条检索密钥不应影响其他记录");
actions.setApiKeyEnabled(createdRetrievalKey.id, true);
assert.equal(createdRetrievalKey.status, "active", "已停用检索密钥应可重新启用");
assert.equal(actions.deleteApiKey(createdRetrievalKey.id), createdRetrievalKey, "检索密钥应支持独立删除");
assert.equal(state.apiAccess.clients.includes(unaffectedRetrievalKey), true, "删除一条检索密钥不应影响其他记录");
assert.equal(actions.setApiKeyEnabled(createdRetrievalKey.id, true), null, "已删除密钥不可再次启用");
assert.equal(actions.deleteApiKey(createdRetrievalKey.id), null, "重复删除应安全返回空结果");
assert.ok(state.configurationRecords.some((item) => item.objectId === createdRetrievalKey.id && item.action === "deleted" && item.before.apiType === "retrieval"), "删除检索密钥应写入包含能力类型的内部配置记录");

const injectedAgentKey = { id: "API-AGENT-BOUNDARY", name: "用户端 Agent 密钥", apiType: "agent", keyMasked: "sk_agent_•••••••OLD1", createdAt: "2026-01-01T00:00:00+08:00", lastUsedAt: null, enabled: true, status: "active" };
state.apiAccess.clients.push(injectedAgentKey);
assert.doesNotMatch(pages.apiAccess.render({ name: "api-access", id: null, query: {} }, state), /用户端 Agent 密钥/, "运营端不得渲染混入的 Agent Key");
assert.equal(actions.setApiKeyEnabled(injectedAgentKey.id, false), null, "运营端启停动作必须拒绝 Agent Key");
assert.equal(injectedAgentKey.status, "active", "被拒绝的 Agent Key 不得被改写");
assert.equal(actions.deleteApiKey(injectedAgentKey.id), null, "运营端删除动作必须拒绝 Agent Key");
assert.ok(state.apiAccess.clients.includes(injectedAgentKey), "被拒绝的 Agent Key 不得从状态中移除");

const legacyRetrievalKey = { id: "API-LEGACY", applicationName: "旧版检索门户", apiType: "retrieval", keyMasked: "sk_retrieval_•••••••OLD2", createdAt: "2026-01-01T00:00:00+08:00", lastUsedAt: null, enabled: true, status: "active" };
state.apiAccess.clients.push(legacyRetrievalKey);
assert.equal(actions.createApiKey({ name: "旧版检索门户", ...apiKeyGlobalConfig }), null, "旧 retrieval 密钥应按 applicationName 参与同名校验");
actions.setApiKeyEnabled(legacyRetrievalKey.id, false);
assert.ok(state.configurationRecords.some((item) => item.objectId === legacyRetrievalKey.id && item.objectName === "旧版检索门户" && item.after.apiType === "retrieval"), "旧 retrieval 记录应兼容写入审计名称和固定类型");
actions.deleteApiKey(legacyRetrievalKey.id);
assert.equal(typeof actions.createApiClient, "function", "旧创建动作名应保留为兼容别名");
assert.equal(typeof actions.setApiClientEnabled, "function", "旧启停动作名应保留为兼容别名");
assert.equal(typeof actions.revokeApiClient, "function", "旧作废动作名应兼容映射为实际删除");
const aliasRetrievalAccess = actions.createApiClient({ name: "兼容检索调用方", ...apiKeyGlobalConfig });
assert.ok(aliasRetrievalAccess.key.startsWith("sk_retrieval_"), "旧创建别名也必须固定生成 retrieval Key");

const goldenEnterpriseConnection = state.enterpriseConnections.find((item) => item.id === "CONNECTION-01");
assert.deepEqual(goldenEnterpriseConnection.runtimeBinding, { id: "connection-order-inventory", version: "v0.5" }, "新增管理页不得改变黄金案例企业连接运行绑定");
assert.equal(goldenEnterpriseConnection.access, "read-only", "企业连接应明确限定为只读访问");
assert.equal(goldenEnterpriseConnection.username, "supply_ro", "种子数据库连接应保存只读用户名");
assert.equal(goldenEnterpriseConnection.passwordConfigured, true, "种子数据库连接只记录密码已配置状态");
assert.ok(state.enterpriseConnections.every((item) => item.connectionType === "database"), "三类数据库连接应统一保留 connectionType=database 兼容值");
assert.deepEqual([...new Set(state.enterpriseConnections.map((item) => item.databaseEngine))].sort(), ["mysql", "postgresql", "sqlserver"], "种子企业连接应且仅应覆盖 PostgreSQL、MySQL、SQL Server");
assert.ok(state.enterpriseConnections.every((item) => !Object.prototype.hasOwnProperty.call(item, "enabled")), "企业数据种子不应保留独立 enabled 状态");
assert.ok(state.enterpriseConnections.every((item) => !["selectedSchema", "allowedResources", "credentialMasked", "credentialStatus", "password", "passwordMasked"].some((key) => Object.prototype.hasOwnProperty.call(item, key))), "数据库连接状态不应保留导入范围或任何密码内容字段");
assert.equal(actions.deleteEnterpriseConnection(goldenEnterpriseConnection.id), null, "受保护的演示主连接仍不可删除");

const enterpriseEngineCases = [
  { engine: "postgresql", defaultPort: 5432, host: "pg-readonly.internal", databaseName: "procurement_contract" },
  { engine: "mysql", defaultPort: 3306, host: "mysql-readonly.internal", databaseName: "supplier_quality" },
  { engine: "sqlserver", defaultPort: 1433, host: "sqlserver-readonly.internal", databaseName: "logistics_reporting" },
];
enterpriseEngineCases.forEach((item) => {
  assert.equal(actions.enterpriseDefaultPort(item.engine), item.defaultPort, `${item.engine} 应返回正确默认端口`);
  const result = actions.testEnterpriseConnectionDraft({
    databaseEngine: item.engine,
    host: item.host,
    port: item.defaultPort,
    username: `${item.engine}_ro`,
    password: `secret-${item.engine}`,
  });
  assert.equal(result.passed, true, `${item.engine} 完成实例连接字段后应可测试连接`);
  assert.ok(Array.isArray(result.databases) && result.databases.includes(item.databaseName), `${item.engine} 测试通过后应返回账号可访问的数据库列表`);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "schemas"), false, `${item.engine} 接入测试不应提前发现 Schema`);
});
assert.equal(typeof actions.enterpriseSchemaCatalog, "undefined", "数据库接入动作层不应提前暴露 Schema 目录");
assert.equal(typeof actions.enterpriseResourceCatalog, "undefined", "数据库接入动作层不应提前暴露表或视图目录");
assert.equal(actions.testEnterpriseConnectionDraft({ databaseEngine: "oracle", host: "oracle.internal", port: 1521, username: "oracle_ro", password: "secret" }).passed, false, "企业连接不应接受三类数据库之外的引擎");
assert.equal(actions.testEnterpriseConnectionDraft({ databaseEngine: "postgresql", host: "offline.internal", port: 5432, username: "pg_ro", password: "secret" }).passed, false, "数据库草稿测试应识别不可用地址");
assert.equal(actions.testEnterpriseConnectionDraft({ databaseEngine: "postgresql", host: "pg.internal", port: 5432, username: "", password: "secret" }).passed, false, "数据库草稿测试应要求用户名");
assert.equal(actions.testEnterpriseConnectionDraft({ databaseEngine: "postgresql", host: "pg.internal", port: 5432, username: "pg_ro", password: "" }).passed, false, "数据库草稿测试应要求密码");

const enterprisePlainPassword = "secret-demo-1234";
const testedEnterpriseDraft = actions.testEnterpriseConnectionDraft({
  databaseEngine: "postgresql",
  host: "pg-contract.internal",
  port: 5432,
  username: "contract_ro",
  password: enterprisePlainPassword,
});
assert.equal(testedEnterpriseDraft.passed, true, "实例连接字段有效时应显式测试成功");
assert.deepEqual(testedEnterpriseDraft.databases, ["supply_chain", "procurement_contract", "contract_analytics"], "连接成功后应返回可选目标数据库，且不自动选中");
const validEnterprisePayload = {
  name: "合同分析测试连接",
  description: "用于合同履约、付款和风险分析。",
  databaseEngine: "postgresql",
  host: "pg-contract.internal",
  port: 5432,
  databaseName: "contract_analytics",
  username: "contract_ro",
  password: enterprisePlainPassword,
  tested: testedEnterpriseDraft.passed,
  ssl: false,
  maxRows: 800,
  timeoutSeconds: 12,
};
const enterpriseCountBeforeRejectedSaves = state.enterpriseConnections.length;
assert.equal(actions.saveEnterpriseConnection({ ...validEnterprisePayload, tested: false }), null, "未显式测试成功不得保存企业连接");
assert.equal(actions.saveEnterpriseConnection({ ...validEnterprisePayload, databaseName: "not_authorized" }), null, "不在测试返回目录中的数据库不得接入");
["name", "databaseEngine", "host", "port", "databaseName", "username", "password"].forEach((field) => {
  const missingFieldPayload = { ...validEnterprisePayload };
  delete missingFieldPayload[field];
  assert.equal(actions.saveEnterpriseConnection(missingFieldPayload), null, `缺少基础字段 ${field} 时不得保存企业连接`);
});
assert.equal(state.enterpriseConnections.length, enterpriseCountBeforeRejectedSaves, "被拒绝的保存不得产生半成品连接");

const disposableEnterpriseConnection = actions.saveEnterpriseConnection(validEnterprisePayload);
assert.ok(disposableEnterpriseConnection, "显式测试成功后应可接入目标数据库");
assert.equal(Object.prototype.hasOwnProperty.call(disposableEnterpriseConnection, "enabled"), false, "新数据库连接不应创建独立启用状态");
assert.equal(typeof actions.setEnterpriseConnectionEnabled, "undefined", "企业数据动作层不应保留启停动作");
assert.equal(disposableEnterpriseConnection.status, "available", "保存的企业连接应保留最近测试成功状态");
assert.equal(disposableEnterpriseConnection.connectionType, "database", "企业数据库连接应写入兼容类型 database");
assert.equal(disposableEnterpriseConnection.databaseEngine, "postgresql", "企业连接应保存数据库引擎");
assert.equal(disposableEnterpriseConnection.name, "合同分析测试连接", "企业数据库应保存平台内的数据库名称");
assert.equal(disposableEnterpriseConnection.description, "用于合同履约、付款和风险分析。", "企业数据库应保存用户填写的数据库描述");
assert.equal(disposableEnterpriseConnection.databaseName, "contract_analytics", "企业连接应保存目标数据库名称");
assert.equal(disposableEnterpriseConnection.username, "contract_ro", "企业连接应保存数据库用户名");
assert.equal(disposableEnterpriseConnection.passwordConfigured, true, "企业连接只应保存密码已配置状态");
assert.equal(Object.prototype.hasOwnProperty.call(disposableEnterpriseConnection, "selectedSchema"), false, "连接阶段不应保存 Schema");
assert.equal(Object.prototype.hasOwnProperty.call(disposableEnterpriseConnection, "allowedResources"), false, "连接阶段不应保存表或视图资源");
assert.equal(disposableEnterpriseConnection.limits.ssl, true, "企业连接应始终启用 SSL，不接受关闭参数");
assert.equal(disposableEnterpriseConnection.limits.timeoutSeconds, 12, "企业连接应在界面外沿用系统查询超时值");
assert.equal(disposableEnterpriseConnection.limits.maxRows, 800, "企业连接应在界面外沿用系统最大行数");
assert.equal(JSON.stringify(state).includes(enterprisePlainPassword), false, "企业数据库密码不得以明文写入 Demo 状态");
const editedEnterpriseConnection = actions.saveEnterpriseConnection({ ...validEnterprisePayload, id: disposableEnterpriseConnection.id, name: "合同分析数据库", description: "覆盖合同执行、回款与履约风险数据。", password: "", tested: true });
assert.equal(editedEnterpriseConnection, disposableEnterpriseConnection, "编辑数据库时留空密码应沿用已保存密码");
assert.equal(editedEnterpriseConnection.passwordConfigured, true, "编辑数据库不应丢失密码已配置状态");
assert.equal(editedEnterpriseConnection.description, "覆盖合同执行、回款与履约风险数据。", "编辑数据库时应更新平台描述信息");
const replacementEnterprisePassword = "replacement-secret-5678";
assert.equal(actions.saveEnterpriseConnection({ ...validEnterprisePayload, id: disposableEnterpriseConnection.id, password: replacementEnterprisePassword, tested: true }), disposableEnterpriseConnection, "编辑数据库时应允许替换密码");
assert.equal(JSON.stringify(state).includes(replacementEnterprisePassword), false, "替换后的数据库密码也不得写入 Demo 状态");
assert.equal(actions.testEnterpriseConnection(disposableEnterpriseConnection.id).status, "available", "已登记企业连接应支持无副作用复测");
const failedEnterpriseConnection = actions.testEnterpriseConnection(disposableEnterpriseConnection.id, { simulateFailure: true });
assert.equal(failedEnterpriseConnection.status, "unavailable", "已登记连接复测失败后应更新为连接失败");
assert.equal(failedEnterpriseConnection.statusLabel, "连接失败", "连接失败应由唯一连接状态直接表达");
assert.equal(actions.deleteEnterpriseConnection(disposableEnterpriseConnection.id), disposableEnterpriseConnection, "非保护数据库连接无需先停用即可删除");
assert.equal(state.enterpriseConnections.includes(disposableEnterpriseConnection), false, "删除后企业连接应从列表移除");
assert.ok(state.configurationRecords.some((item) => item.objectId === disposableEnterpriseConnection.id && item.action === "deleted"), "删除企业连接应写入内部配置记录");

assert.equal(Array.isArray(state.externalInformation.services), true, "外部信息应以检索服务实例列表管理");
assert.equal(state.externalInformation.services.length, 3, "种子应提供三类检索服务实例");
assert.deepEqual(state.externalInformation.services.map((item) => item.serviceType), ["elasticsearch", "opensearch", "custom"], "种子应覆盖 Elasticsearch、OpenSearch 和自定义接口");
assert.equal(Object.prototype.hasOwnProperty.call(state.externalInformation, "sources"), false, "检索服务页不应继续维护原始信源列表");
assert.equal(Object.prototype.hasOwnProperty.call(state.externalInformation, "tags"), false, "检索服务页不应继续维护信源标签");
assert.equal(state.externalInformation.services.every((item) => item.credentialConfigured === true), true, "检索服务只记录访问凭证已配置状态");

const searchServiceMapping = actions.externalSearchServiceMappingDefaults("elasticsearch");
const searchServiceCredential = "search-secret-demo";
const validSearchServicePayload = {
  name: "测试 Elasticsearch 服务",
  description: "用于验证检索服务接入闭环。",
  serviceType: "elasticsearch",
  endpoint: "https://search-contract.internal",
  indexName: "contract-news",
  authType: "api_key",
  credential: searchServiceCredential,
  mapping: searchServiceMapping,
};
assert.equal(actions.testExternalSearchServiceDraft({ ...validSearchServicePayload, serviceType: "unknown" }).passed, false, "检索服务不应接受三类之外的接入类型");
assert.equal(actions.testExternalSearchServiceDraft({ ...validSearchServicePayload, endpoint: "not-a-url" }).passed, false, "检索服务应拒绝无效地址");
assert.equal(actions.testExternalSearchServiceDraft({ ...validSearchServicePayload, endpoint: "https://offline.internal" }).passed, false, "检索测试应识别不可达地址");
assert.equal(actions.testExternalSearchServiceDraft({ ...validSearchServicePayload, credential: "" }).passed, false, "需要鉴权时必须填写访问凭证");
assert.equal(actions.testExternalSearchServiceDraft({ ...validSearchServicePayload, indexName: "" }).passed, false, "Elasticsearch 与 OpenSearch 必须填写索引或别名");
assert.equal(actions.testExternalSearchServiceDraft({ ...validSearchServicePayload, serviceType: "custom", indexName: "", path: "search", mapping: actions.externalSearchServiceMappingDefaults("custom") }).passed, false, "自定义接口必须填写有效请求路径");
const testedSearchServiceDraft = actions.testExternalSearchServiceDraft(validSearchServicePayload);
assert.equal(testedSearchServiceDraft.passed, true, "系统无需用户填写测试问题即可自动测试有效配置");
assert.equal(testedSearchServiceDraft.resultCount, 3, "测试应返回可预览的标准结果数量");
assert.equal(actions.saveExternalSearchService({ ...validSearchServicePayload, tested: false }), null, "未经显式测试不得保存检索服务");
const disposableSearchService = actions.saveExternalSearchService({ ...validSearchServicePayload, tested: true });
assert.ok(disposableSearchService, "测试通过后应可接入检索服务");
assert.equal(disposableSearchService.serviceType, "elasticsearch", "服务实例应保存接入类型");
assert.equal(disposableSearchService.indexName, "contract-news", "搜索引擎连接应保存索引或别名");
assert.equal(disposableSearchService.status, "available", "新接入服务应保存最近测试成功状态");
assert.equal(disposableSearchService.mapping.titleField, "_source.title", "服务实例应保存标准结果字段映射");
assert.equal(disposableSearchService.credentialConfigured, true, "服务实例只保存凭证已配置状态");
assert.equal(JSON.stringify(state).includes(searchServiceCredential), false, "访问凭证不得以明文写入 Demo 状态");
assert.equal(Object.prototype.hasOwnProperty.call(disposableSearchService, "credential"), false, "服务实例不得生成明文凭证字段");
const editedSearchService = actions.saveExternalSearchService({ ...validSearchServicePayload, id: disposableSearchService.id, name: "已编辑检索服务", credential: "", credentialConfigured: true, tested: true });
assert.equal(editedSearchService, disposableSearchService, "编辑时留空凭证应沿用已配置状态");
assert.equal(editedSearchService.name, "已编辑检索服务", "服务名称应可编辑");
assert.equal(actions.saveExternalSearchService({ ...validSearchServicePayload, name: "全球贸易资讯检索", tested: true }), null, "服务名称不应与已有实例重复");
assert.equal(actions.testExternalSearchService(disposableSearchService.id).status, "available", "已接入服务应支持无副作用复测");
assert.equal(actions.testExternalSearchService(disposableSearchService.id, { simulateFailure: true }).status, "unavailable", "复测失败后应更新连接状态");
assert.equal(disposableSearchService.statusLabel, "检索失败", "失败状态应由服务卡直接表达");
assert.equal(actions.deleteExternalSearchService(disposableSearchService.id), disposableSearchService, "检索服务应可确认删除");
assert.equal(state.externalInformation.services.includes(disposableSearchService), false, "删除后服务实例应从列表移除");
assert.ok(state.configurationRecords.some((item) => item.objectId === disposableSearchService.id && item.action === "deleted"), "删除检索服务应写入内部配置记录");

const currentVersionBeforeRestore = kb.currentKnowledgeVersionId;
const historical = state.knowledgeVersions.find((item) => item.knowledgeBaseId === kb.id && item.status === "historical");
const restoreDraft = actions.rollbackKnowledgeVersion(kb.id, historical.id);
assert.equal(kb.currentKnowledgeVersionId, currentVersionBeforeRestore, "创建内部索引回退不能直接覆盖当前检索指针");
assert.equal(restoreDraft.status, "pending_validation", "回退索引仍需验证");
assert.equal(actions.validateKnowledgeVersion(kb.id, currentVersionBeforeRestore), null, "当前索引不能重复走待生效验证");
assert.equal(actions.rollbackKnowledgeVersion(kb.id, currentVersionBeforeRestore), null, "当前索引不能被当作回退来源");

store.reset();
const resetState = store.getState();
const removedFailedItem = actions.removeImportItem("IMP-0825-03", "IMP-ITEM-001");
const removedFailureBatch = resetState.importBatches.find((item) => item.id === "IMP-0825-03");
const removedFailureKb = resetState.knowledgeBases.find((item) => item.id === "KB-001");
assert.equal(removedFailedItem.status, "removed", "运营人员可关闭不再处理的失败文件");
assert.equal(removedFailureBatch.processingCount, 0, "关闭失败项后其余处理中文件应自动完成");
assert.ok(removedFailureBatch.resultingKnowledgeVersionId, "关闭失败项不得让其余成功文件卡在候选索引");
assert.equal(removedFailureKb.documentCounts.searchable, removedFailureKb.documentCounts.total, "已移除失败文件不计入总数，其余文件应全部可检索");
const restoredFromRecord = actions.createRollbackDraft("CR-008");
assert.equal(restoredFromRecord.basedOnVersionId, "KV-20260814-01", "内部留痕回退应使用变更前的索引快照，而非当前结果");
const retrievalSettingsBeforeTest = JSON.stringify(resetState.rag.retrievalSettings.operator);
const retrievalTestResult = actions.runRetrievalTest({ knowledgeBaseId: "KB-002", question: "验证左右工作区只更新测试结果" });
assert.equal(retrievalTestResult.question, "验证左右工作区只更新测试结果", "检索测试动作应更新测试问题和结果状态");
assert.equal(retrievalTestResult.validationState, "validated", "运行检索后测试对象应进入已验证状态");
assert.equal(JSON.stringify(resetState.rag.retrievalSettings.operator), retrievalSettingsBeforeTest, "检索测试不得改写已保存的全局检索设置");
assert.equal(resetState.knowledgeBases.find((item) => item.id === "KB-002").retrievalStatus, "available", "检索对比验证不应改变知识库可用状态");
assert.equal(resetState.overview.pendingItems.some((item) => item.id === "TODO-002"), false, "检索对比验证不应生成模拟异常待办");

const resetPreviewDocument = resetState.documents.find((item) => item.id === "DOC-001");
const resetPreviewChunkCount = resetState.chunks.filter((item) => item.documentId === resetPreviewDocument.id).length;
const resetPreviewChunkOrder = resetState.chunks.filter((item) => item.documentId === resetPreviewDocument.id).sort((a, b) => a.index - b.index).map((item) => item.id);
const resetStoredChunkCount = resetPreviewDocument.chunkCount;
assert.ok(resetPreviewChunkCount > 0, "知识库文件应提供顶层 chunks 预览数据");
assert.equal(actions.addDocumentChunk(resetPreviewDocument.id, { content: "   " }), null, "新增切片内容为必填，空白内容不得写入");
const addedChunkContent = "新增人工核验切片：供应商须在重大风险发生后二十四小时内完成上报。";
const addedChunk = actions.addDocumentChunk(resetPreviewDocument.id, { content: addedChunkContent });
assert.ok(addedChunk && addedChunk.documentId === resetPreviewDocument.id, "运营人员应能为当前文件新增切片");
assert.equal(addedChunk.index, resetPreviewChunkCount + 1, "新增切片编号应接续当前实际切片集合");
assert.equal(addedChunk.characterCount, addedChunkContent.length, "新增切片应记录字符数量");
assert.equal(addedChunk.status, "pending_embedding", "新增切片保存后应进入待向量化状态");
assert.equal(resetPreviewDocument.status, "embedding", "新增切片后文件唯一生命周期应切换为向量化中");
assert.equal(resetPreviewDocument.chunkCount, resetStoredChunkCount, "向量与索引完成前应继续保留当前切片计数");
assert.equal(resetState.chunks.filter((item) => item.documentId === resetPreviewDocument.id).length, resetPreviewChunkCount, "候选切片不能提前进入当前检索投影");
const addChunkUntil = Date.now() + 3000;
while (addedChunk.status !== "ready" && Date.now() < addChunkUntil) await new Promise((resolve) => setTimeout(resolve, 15));
assert.equal(addedChunk.status, "ready", "新增切片完成向量与索引后应原子生效");
assert.equal(resetPreviewDocument.chunkCount, resetPreviewChunkCount + 1, "生效后文件切片数应随当前切片同步更新");
assert.equal(resetState.chunks.filter((item) => item.documentId === resetPreviewDocument.id).length, resetPreviewChunkCount + 1, "生效切片应写入顶层当前检索投影");
const resetPreviewChunksAfterAdd = resetState.chunks.filter((item) => item.documentId === resetPreviewDocument.id).sort((a, b) => a.index - b.index);
assert.deepEqual(resetPreviewChunksAfterAdd.slice(0, -1).map((item) => item.id), resetPreviewChunkOrder, "新增切片不得改变原有切片顺序");
assert.equal(resetPreviewChunksAfterAdd.at(-1).content, addedChunkContent, "新增切片只能追加到当前文档队尾");
assert.equal(Object.prototype.hasOwnProperty.call(resetPreviewDocument.pendingChunkMutation, "insertionPosition"), false, "新增切片任务不应保存可选插入位置");
assert.equal(Object.prototype.hasOwnProperty.call(resetPreviewDocument.pendingChunkMutation, "relativeChunkId"), false, "新增切片任务不应保存参照切片");
const addedChunkRecord = resetState.configurationRecords.find((item) => item.objectId === resetPreviewDocument.id && item.action === "chunk_add");
assert.match(addedChunkRecord.impact, /当前知识库[\s\S]*其他知识库保持不变/, "新增切片留痕必须明确当前知识库的修改范围");
const chunkPreviewHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { tab: "chunks", document: resetPreviewDocument.id } }, resetState);
assert.match(chunkPreviewHtml, /data-knowledge-content-tab="chunks"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-knowledge-content-tab="chunks"/, "切片编辑闭环应位于知识库切片页签");
assert.match(chunkPreviewHtml, /preview-workspace[\s\S]*data-preview-document-select="KB-001"[\s\S]*<option value="DOC-001" selected>/, "切片页签应复用通用双栏组件并保留当前文件");
assert.doesNotMatch(chunkPreviewHtml, /data-preview-document-download|下载原文件/, "知识库切片页签不应提供原文件下载");
assert.doesNotMatch(chunkPreviewHtml, /preview-workspace__pane--source"><header|源文档<\/h2>|status--(?:success|info|neutral|danger)|代表切片|chunk-preview-list__summary/, "文件预览不应重复源文档栏头、文件状态或代表切片汇总");
const renderedChunkCardCount = (chunkPreviewHtml.match(/data-chunk-preview-card=/g) || []).length;
const allChunksTitle = chunkPreviewHtml.match(/全部切片（(\d+)）/);
assert.ok(allChunksTitle, "文件预览右栏标题应使用“全部切片（N）”");
assert.equal(Number(allChunksTitle[1]), renderedChunkCardCount, "全部切片标题中的数量必须等于真实渲染卡片数");
assert.match(chunkPreviewHtml, /data-chunk-expand[^>]*aria-label="展开切片 [^"]+"[^>]*aria-expanded="false"[^>]*aria-controls="[^"]+"/, "切片展开图标应表达默认收起状态并关联受控正文");
const metadataTriggerCount = (chunkPreviewHtml.match(/data-chunk-metadata-trigger/g) || []).length;
assert.equal(metadataTriggerCount, renderedChunkCardCount, "两个预览入口复用的每张切片卡片都应提供信息入口");
const editTriggerCount = (chunkPreviewHtml.match(/data-chunk-edit-trigger/g) || []).length;
assert.equal(editTriggerCount, renderedChunkCardCount, "可编辑知识库中的每张切片卡片都应在右上角提供编辑图标");
assert.doesNotMatch(chunkPreviewHtml, /data-chunk-edit="[^"]+"[^>]*>编辑<\/button>/, "共享切片卡片不应在底部重复展示文字编辑按钮");
assert.match(chunkPreviewHtml, /data-chunk-metadata-trigger[^>]*aria-haspopup="dialog"[^>]*aria-controls="chunk-metadata-[^"]+"/, "切片信息入口应通过 aria-controls 关联非模态浮层");
assert.match(chunkPreviewHtml, /识别信息[\s\S]*来源定位[\s\S]*检索治理[\s\S]*技术信息/, "切片信息应按识别、来源、检索治理和技术信息组织");
assert.match(chunkPreviewHtml, /Chunk ID[\s\S]*data-chunk-copy-id[\s\S]*data-chunk-copy-all[\s\S]*复制全部信息/, "切片信息应支持单独复制 Chunk ID 和复制完整结构化信息");
assert.match(chunkPreviewHtml, /EMB-CHK-DOC-001-001[\s\S]*MODEL-EMBEDDING-PRIMARY/, "检索投影切片应展示真实向量记录和模型标识");
assert.doesNotMatch(chunkPreviewHtml, /file-asset-chunk__relations|来源与关系/, "元数据应收进右上角信息浮层，不再占用切片卡片文档流");
assert.match(chunkPreviewHtml, new RegExp(addedChunk.id + "[\\s\\S]*" + addedChunk.characterCount + " 字符[\\s\\S]*" + addedChunkContent), "切片卡片应展示切片 ID、字符数与内容");
assert.match(chunkPreviewHtml, new RegExp(addedChunk.id + "[\\s\\S]*人工新增"), "人工新增的切片应显示来源标签");
assert.match(chunkPreviewHtml, /data-chunk-add="DOC-001"/, "切片预览应提供当前文件的新增切片入口");
assert.doesNotMatch(chunkPreviewHtml, /data-chunk-relation-edit=|>关联切片</, "可写知识库的完整预览不应提供人工上下文关联入口");
assert.doesNotMatch(chunkPreviewHtml, /data-chunk-context=|data-chunk-metadata-edit=/, "可写知识库完整预览不应继续展示已移除的编辑入口");
assert.equal((chunkPreviewHtml.match(/data-chunk-delete=/g) || []).length, renderedChunkCardCount, "可写知识库的完整预览应为每张卡片提供删除入口");

const disposableDocument = resetState.documents.find((item) => item.id === "DOC-005");
// Duplicate content and version-safe replacement are covered by the asynchronous lifecycle suite.
const disposableDocumentChunkCount = resetState.chunks.filter((item) => item.documentId === disposableDocument.id).length;
const deletedDocument = actions.deleteDocument(disposableDocument.id);
assert.equal(deletedDocument.id, "DOC-005", "文件删除动作应返回被删除对象");
assert.equal(resetState.documents.some((item) => item.id === disposableDocument.id), false, "删除后文件应从知识库文件列表移除");
assert.equal(resetState.chunks.some((item) => item.documentId === disposableDocument.id), false, "删除文件应同步移除其切片与向量单元");
assert.equal(deletedDocument.deletedChunkCount, disposableDocumentChunkCount, "删除结果应记录同步移除的切片数量");
const deletedDocumentRecord = resetState.configurationRecords.find((item) => item.objectId === disposableDocument.id && item.action === "deleted");
assert.equal(deletedDocumentRecord.effects.tokenConsumption, false, "删除文件只移除索引内容，不应误报新的向量化 Token 消耗");

// Independent assets, upload registration, cross-library reuse, deletion, and
// replacement are exercised with asynchronous jobs in rag-lifecycle-check.mjs.
assert.equal(actions.deleteLocalDocumentAsset("DOC-004"), null, "仍被其他知识库引用的原文件不得级联删除");
assert.ok(resetState.fileAssets.some((item) => item.id === "DOC-004"), "禁止删除时资产保持存在");

const knowledgeCountsBeforeChunkingUploads = structuredClone(resetState.knowledgeBases.map((item) => item.documentCounts));
const knowledgeVersionsBeforeChunkingUploads = structuredClone(resetState.knowledgeVersions);
const chunkingValidationKb = actions.createKnowledgeBase({
  name: "切片算法验收库",
  purpose: "验证切片算法仅在知识库入库流程中执行",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
});
assert.ok(chunkingValidationKb, "应能创建临时知识库验证切片算法");
function cleanupChunkingResult(result, label) {
  assert.ok(actions.deleteDocument(result.reference.id), `${label} 应移除知识库引用`);
  assert.ok(actions.deleteLocalDocumentAsset(result.version.fileId), `${label} 测试原文件应可清理`);
}
async function importAutomaticBoundaryPreview(name, sourcePreview, overlapPercent = 0) {
  const batch = actions.startKnowledgeImport(chunkingValidationKb.id, {
    files: [{ name: `默认段落边界验收-${name}.txt`, size: sourcePreview.length * 2, sourcePreview }],
    deferred: true,
  });
  assert.ok(batch && batch.status === "pending_configuration", `${name} 应暂存为知识库入库批次`);
  await completeBatch(batch, {
    ingestionProfileId: "ING-SEPARATOR",
    processingParameters: { mode: "separator", maxChars: 200, overlapPercent },
  });
  const version = resetState.fileVersions.find((item) => item.id === batch.items[0].fileVersionId);
  const reference = resetState.documents.find((item) => item.id === batch.items[0].documentId);
  const detail = actions.getFileAssetDetail(version.fileId, { knowledgeBaseId: chunkingValidationKb.id });
  const documentItem = { ...version, localAssetId: version.fileId, chunkCount: detail.chunkSet.chunks.length, processingProfileSnapshot: batch.processingProfileSnapshot };
  const chunks = detail.chunkSet.chunks;
  assert.ok(chunks.length > 0, `${name} 应生成可预览的实际切片`);
  assert.ok(chunks.every((chunk) => chunk.content.length > 0 && chunk.content.length <= 200), `${name} 的所有切片必须非空且不超过字符上限`);
  assert.ok(chunks.every((chunk) => chunk.characterCount === chunk.content.length), `${name} 的字符计数必须与实际内容一致`);
  assert.ok(chunks.every((chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk.content)), `${name} 的字符兜底不能拆开 emoji 代理对`);
  assert.equal(documentItem.chunkCount, chunks.length, `${name} 的文档切片数应等于实际预览卡片数`);
  assert.equal(documentItem.sourcePreview, sourcePreview, `${name} 应保留原文供预览和下载`);
  assert.equal(batch.processingParametersSnapshot.mode, "separator", `${name} 应保存统一分隔符批次模式`);
  assert.equal(batch.processingParametersSnapshot.boundaryMode, undefined, `${name} 新批次不应保存 boundaryMode`);
  assert.equal(batch.processingParametersSnapshot.separatorType, "paragraph", `${name} 未指定时应默认选择段落 / 空行`);
  assert.equal(batch.processingParametersSnapshot.separator, "\n\n", `${name} 应保存默认双换行边界`);
  assert.equal(batch.processingParametersSnapshot.strategy, "separator_recursive_fallback", `${name} 应记录首选边界加递归降级算法`);
  assert.deepEqual(batch.processingParametersSnapshot.recursiveBoundaries, expectedRecursiveBoundaries, `${name} 应固化从段落开始的内置降级顺序`);
  assert.equal(documentItem.processingProfileSnapshot.chunking.mode, "separator", `${name} 的文档实例应保留统一分隔符策略快照`);
  assert.equal(documentItem.processingProfileSnapshot.chunking.boundaryMode, undefined, `${name} 的文档实例不应保存旧边界模式`);
  assert.equal(documentItem.processingProfileSnapshot.chunking.separatorType, "paragraph", `${name} 的文档实例应保留默认段落首选边界`);
  assert.deepEqual(batch.items[0].pipeline.map((item) => item.key), ["receive", "parse", "chunk", "embedding", "index"], `${name} 知识库入库应完成切片、向量化和索引`);
  assert.equal(actions.getFileAssetDetail(version.fileId).chunkSet, null, `${name} 不得把知识库切片挂到公共池资产`);
  if (overlapPercent === 0) assert.equal(chunks.map((chunk) => chunk.content).join(""), sourcePreview, `${name} 零重叠时拼接切片必须完整复原原文与全部分隔符`);
  return { batch, documentItem, chunks, reference, version };
}
const automaticBoundaryPreviewCases = [
  { name: "段落边界", source: "甲".repeat(120) + "\r\n\r\n" + "乙".repeat(120) + "\n\n" + "丙".repeat(120), endBoundary: /(?:\r?\n){2}$/, count: 3 },
  { name: "换行边界", source: "甲".repeat(120) + "\r\n" + "乙".repeat(120) + "\n" + "丙".repeat(120), endBoundary: /\r?\n$/, count: 3 },
  { name: "中英文句末", source: "甲".repeat(110) + "。" + "b".repeat(110) + "! " + "丙".repeat(110) + "？" + "d".repeat(110) + ".", endBoundary: /[。！？.!?]$/, count: 4 },
  { name: "空白边界", source: Array.from({ length: 90 }, (_, index) => `word${String(index).padStart(3, "0")}\t`).join(""), endBoundary: /\s$/ },
  { name: "无分隔符长文", source: "无分隔字符".repeat(131) },
  { name: "emoji兜底", source: "前" + "😀🧠".repeat(180) + "尾" },
  { name: "恰好达到上限", source: "边".repeat(200), count: 1 },
];
for (const example of automaticBoundaryPreviewCases) {
  const result = await importAutomaticBoundaryPreview(example.name, example.source);
  if (example.count) assert.equal(result.chunks.length, example.count, `${example.name} 应按有效的大粒度边界拆分，不额外按固定长度切碎`);
  if (example.endBoundary) assert.ok(result.chunks.slice(0, -1).every((chunk) => example.endBoundary.test(chunk.content)), `${example.name} 应优先在对应边界结束切片`);
  cleanupChunkingResult(result, example.name);
}
const automaticOverlapSource = Array.from({ length: 120 }, (_, index) => `token${String(index).padStart(3, "0")} `).join("");
const automaticOverlapResult = await importAutomaticBoundaryPreview("边界重叠", automaticOverlapSource, 25);
let automaticConsumed = 0;
let sawAutomaticOverlap = false;
for (const chunk of automaticOverlapResult.chunks) {
  const matchingOverlap = Array.from({ length: Math.min(50, automaticConsumed) + 1 }, (_, value) => value).find((overlap) => {
    const start = automaticConsumed - overlap;
    return chunk.content.length > overlap && automaticOverlapSource.slice(start, start + chunk.content.length) === chunk.content;
  });
  assert.notEqual(matchingOverlap, undefined, "分隔符递归降级的重叠切片必须源于原文且重叠字符数不能超过配置上限");
  if (matchingOverlap > 0) sawAutomaticOverlap = true;
  const start = automaticConsumed - matchingOverlap;
  assert.ok(start === 0 || /\s/.test(automaticOverlapSource[start - 1]), "存在可用单词边界时，重叠起点不能从单词中间截取");
  automaticConsumed += chunk.content.length - matchingOverlap;
}
assert.equal(automaticConsumed, automaticOverlapSource.length, "移除相邻重叠后应恰好覆盖全部原文，不丢失或额外重复内容");
assert.equal(sawAutomaticOverlap, true, "边界允许时非零重叠率必须生成实际上下文重叠");
cleanupChunkingResult(automaticOverlapResult, "默认段落边界重叠");

async function importSpecifiedBoundaryPreview(name, sourcePreview, separatorType) {
  const batch = actions.startKnowledgeImport(chunkingValidationKb.id, {
    files: [{ name: `首选边界验收-${name}.txt`, size: sourcePreview.length * 2, sourcePreview }],
    deferred: true,
  });
  await completeBatch(batch, {
    ingestionProfileId: "ING-SEPARATOR",
    processingParameters: { mode: "separator", separatorType, maxChars: 200, overlapPercent: 0 },
  });
  const version = resetState.fileVersions.find((item) => item.id === batch.items[0].fileVersionId);
  const reference = resetState.documents.find((item) => item.id === batch.items[0].documentId);
  const detail = actions.getFileAssetDetail(version.fileId, { knowledgeBaseId: chunkingValidationKb.id });
  const chunks = detail.chunkSet.chunks;
  assert.equal(batch.processingParametersSnapshot.mode, "separator", `${name} 应保存统一分隔符模式`);
  assert.equal(batch.processingParametersSnapshot.boundaryMode, undefined, `${name} 新批次不应保存 boundaryMode`);
  assert.equal(batch.processingParametersSnapshot.separatorType, separatorType, `${name} 应固化所选分隔符类型`);
  assert.equal(batch.processingParametersSnapshot.strategy, "separator_recursive_fallback", `${name} 应记录首选边界加递归降级算法`);
  assert.deepEqual(batch.processingParametersSnapshot.recursiveBoundaries, expectedSeparatorFallbacks(separatorType), `${name} 应固化从首选边界开始的降级链`);
  assert.ok(chunks.every((chunk) => chunk.content.length > 0 && chunk.content.length <= 200), `${name} 不得产生空切片或超过字符上限`);
  return { batch, version, chunks, reference };
}
const specifiedParagraphSource = "甲".repeat(120) + "\n\n" + "乙".repeat(120) + "\n\n" + "丙".repeat(120);
const specifiedParagraphResult = await importSpecifiedBoundaryPreview("段落空行", specifiedParagraphSource, "paragraph");
assert.equal(specifiedParagraphResult.chunks.length, 3, "段落作为首选边界且片段不超长时应直接按段落切分");
assert.ok(specifiedParagraphResult.chunks.slice(0, -1).every((chunk) => chunk.content.endsWith("\n\n")), "首选分隔符应保留在前一切片末尾");
assert.equal(specifiedParagraphResult.chunks.map((chunk) => chunk.content).join(""), specifiedParagraphSource, "首选分隔符零重叠时应完整复原原文");
cleanupChunkingResult(specifiedParagraphResult, "段落首选边界");
const selectedFallbackToSentenceSource = "甲".repeat(120) + "。" + "乙".repeat(120) + "。" + "丙".repeat(120);
const selectedFallbackToSentenceResult = await importSpecifiedBoundaryPreview("换行降级到句末", selectedFallbackToSentenceSource, "newline");
assert.equal(selectedFallbackToSentenceResult.chunks.length, 3, "首选换行不存在且片段超长时应递归降级到句末边界");
assert.ok(selectedFallbackToSentenceResult.chunks.slice(0, -1).every((chunk) => chunk.content.endsWith("。")), "递归降级使用的句末分隔符也应保留在前一切片末尾");
assert.equal(selectedFallbackToSentenceResult.chunks.map((chunk) => chunk.content).join(""), selectedFallbackToSentenceSource, "递归降级到句末时不得丢失内容");
cleanupChunkingResult(selectedFallbackToSentenceResult, "换行到句末降级");
const specifiedFallbackSource = "无换行边界".repeat(90);
const specifiedFallbackResult = await importSpecifiedBoundaryPreview("无匹配兜底", specifiedFallbackSource, "newline");
assert.deepEqual(specifiedFallbackResult.chunks.map((chunk) => chunk.content.length), [200, 200, 50], "首选及更细文本边界均不存在时应按字符上限兜底");
assert.equal(specifiedFallbackResult.chunks.map((chunk) => chunk.content).join(""), specifiedFallbackSource, "字符兜底不得丢失内容");
cleanupChunkingResult(specifiedFallbackResult, "首选边界字符兜底");

const fixedSource = Array.from({ length: 450 }, (_, index) => String(index % 10)).join("");
const fixedBatch = actions.startKnowledgeImport(chunkingValidationKb.id, {
  files: [{ name: "固定窗口验收.txt", size: fixedSource.length * 2, sourcePreview: fixedSource }],
  deferred: true,
});
await completeBatch(fixedBatch, {
  ingestionProfileId: "ING-FIXED",
  processingParameters: { mode: "fixed", maxChars: 200, overlapPercent: 25 },
});
const fixedVersion = resetState.fileVersions.find((item) => item.id === fixedBatch.items[0].fileVersionId);
const fixedReference = resetState.documents.find((item) => item.id === fixedBatch.items[0].documentId);
const fixedDetail = actions.getFileAssetDetail(fixedVersion.fileId, { knowledgeBaseId: chunkingValidationKb.id });
const fixedChunks = fixedDetail.chunkSet.chunks;
assert.equal(fixedBatch.processingParametersSnapshot.mode, "fixed", "固定窗口批次应保存独立 fixed 模式");
assert.equal(fixedBatch.processingParametersSnapshot.maxChars, 200, "固定窗口批次应保存每片字符数");
assert.equal(fixedBatch.processingParametersSnapshot.overlapPercent, 25, "固定窗口批次应保存重叠率");
assert.deepEqual(fixedChunks.map((chunk) => chunk.content.length), [200, 200, 150], "固定窗口应以 maxChars 输出等长窗口，尾片允许不足");
assert.deepEqual(fixedChunks.map((chunk) => chunk.content), [0, 150, 300].map((offset) => fixedSource.slice(offset, offset + 200)), "固定窗口应按 maxChars-overlapChars 的稳定步长切分");
cleanupChunkingResult({ reference: fixedReference, version: fixedVersion }, "固定窗口");

assert.ok(actions.deleteKnowledgeBase(chunkingValidationKb.id), "切片算法临时知识库应可清理");
assert.deepEqual(resetState.knowledgeBases.map((item) => item.documentCounts), knowledgeCountsBeforeChunkingUploads, "本地切片验收不得修改知识库文件计数");
assert.deepEqual(resetState.knowledgeVersions, knowledgeVersionsBeforeChunkingUploads, "本地切片验收不得生成知识库索引版本");

assert.ok(state.configurationRecords.length > initialRecordCount, "重要配置动作必须自动留痕");
console.log("管理闭环检查通过：知识库、文档解析与切片、RAG 检索、LLM/向量/Rerank 模型、企业数据、检索服务、API 密钥与消耗统计均已联动。")

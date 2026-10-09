import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { demoRoot, loadOpsRuntime } from "./runtime.mjs";

const OpsDemo = loadOpsRuntime({ pages: ["knowledge", "documents"] });

const { store, actions } = OpsDemo.core;
const { directoryTree } = OpsDemo.ui;
const { localDocuments, knowledge } = OpsDemo.pages;
const state = store.getState();

assert.ok(state.documentFolders.length >= 9, "文档管理应初始化业务文件夹");
assert.ok(state.fileAssets.every((asset) => state.documentFolders.some((folder) => folder.id === asset.folderId)), "每个本地文档必须归属有效文件夹");

const treeHtml = directoryTree.render({
  folders: state.documentFolders,
  items: state.fileAssets,
  selectedId: "all",
  scope: "document-folder-test",
  rootId: "all",
  rootLabel: "全部文档",
});
assert.match(treeHtml, /data-directory-node="FOLDER-SCM"[\s\S]*供应链管理[\s\S]*10 个文件[\s\S]*data-directory-toggle="FOLDER-SCM"/, "目录树应展示文件夹名、后代文件数和文件数右侧的折叠按钮");
assert.match(treeHtml, /data-directory-item="SCM-DOC-01"[\s\S]*01_供应链管理基础理论手册\.docx/, "目录树应在文件夹下展示文件名");
const firstItem = treeHtml.slice(treeHtml.indexOf('data-directory-item="SCM-DOC-01"'), treeHtml.indexOf("</div></div>", treeHtml.indexOf('data-directory-item="SCM-DOC-01"')) + 12);
assert.doesNotMatch(firstItem, /data-lucide=/, "目录树文件项不应显示图标");
const folderOnlyTreeHtml = directoryTree.render({
  folders: state.documentFolders,
  items: state.fileAssets,
  selectedId: "FOLDER-UNCATEGORIZED",
  scope: "local-upload-target",
  rootId: "all",
  rootLabel: "全部文档",
  showItems: false,
  rootSelectable: false,
});
assert.doesNotMatch(folderOnlyTreeHtml, /data-directory-item=|data-directory-select="all"/, "上传目录树应隐藏文件节点，且根层级仅展示不可选择");
assert.match(folderOnlyTreeHtml, /data-directory-node="FOLDER-SCM"[\s\S]*10 个文件/, "上传目录树隐藏文件名后仍应保留目录文件计数");
const emptyTreeHtml = directoryTree.render({ folders: state.documentFolders, items: [], selectedId: "all", scope: "empty-folder-test", rootId: "all", rootLabel: "全部文档" });
assert.doesNotMatch(emptyTreeHtml, /0 个文件|directory-tree__count[^>]*>0</, "空目录不应展示数字 0 或读出“0 个文件”");
const sharedPickerHtml = directoryTree.folderPicker({ folders: state.documentFolders, items: state.fileAssets, selectedId: "FOLDER-SCM-DATA", scope: "folder-picker-test", rootId: "all", rootLabel: "全部文档" });
assert.match(sharedPickerHtml, /upload-folder-picker__summary[\s\S]*目标位置[\s\S]*全部文档[\s\S]*供应链管理[\s\S]*业务数据与培训[\s\S]*data-directory-tree="folder-picker-test"/, "公用目标位置组件应展示完整路径和只含文件夹的目录树");
assert.doesNotMatch(sharedPickerHtml, /data-directory-item=|data-directory-select="all"/, "公用目标位置组件不应展示文件或允许选择虚拟根节点");

const listHtml = localDocuments.render({ name: "local-documents", id: null, query: {} }, state);
assert.match(listHtml, /page-content creation-page local-documents-page[\s\S]*panel creation-panel local-documents[\s\S]*document-directory-browser[\s\S]*data-local-directory-tree-host[\s\S]*data-local-document-table/, "文档管理应复用上传流程的视口满高容器，并使用左树右表布局");
assert.doesNotMatch(listHtml, /data-directory-item=/, "文档管理左侧目录树应止于文件夹层级，文件统一在右侧表格展示");
assert.ok(["data-local-folder-create-child", "data-local-folder-upload", "data-local-document-move"].every((marker) => listHtml.includes(marker)), "文档管理应在目录工具区提供内联新建、定向上传和移动入口");
assert.doesNotMatch(listHtml, /data-local-folder-create(?!-child)|data-local-folder-rename|data-document-folder-form/, "文档管理不应保留页头新建、重命名按钮或文件夹弹窗");
assert.match(listHtml, /data-directory-edit="FOLDER-SCM" data-directory-select="FOLDER-SCM"[\s\S]*title="单击打开，双击重命名"/, "文件夹名称应单击打开并仅在双击时进入原位编辑");
assert.match(listHtml, /data-local-document-pagination[\s\S]*data-local-document-page="previous"[\s\S]*data-local-document-page-status[\s\S]*data-local-document-page="next"/, "全部文档应在页脚右侧提供翻页控件");
assert.doesNotMatch(listHtml, /原文件独立保存，各知识库按需引用|local-documents__scope/, "页脚不应重复展示公共池职责说明");
const topFolderHtml = localDocuments.render({ name: "local-documents", id: null, query: { folder: "FOLDER-SCM" } }, state);
assert.match(topFolderHtml, /document-directory-breadcrumb[\s\S]*全部文档[\s\S]*document-directory-breadcrumb__separator[\s\S]*供应链管理/, "非根目录应在面包屑左侧展示可返回的根目录");
const readOnlyFilePath = directoryTree.breadcrumb({ folders: state.documentFolders, selectedId: "FOLDER-SCM-GUIDES", rootId: "all", rootLabel: "全部文档", leafLabel: "01_供应链管理基础理论手册.docx", interactive: false, ariaLabel: "文件路径" });
assert.match(readOnlyFilePath, /aria-label="文件路径"[\s\S]*全部文档[\s\S]*供应链管理[\s\S]*基础理论与流程[\s\S]*01_供应链管理基础理论手册\.docx/, "只读文件路径应复用目录层级并包含文件名");
assert.doesNotMatch(readOnlyFilePath, /<button|data-directory-select|href=/, "只读文件路径不得包含可点击入口");
const localUploadHtml = localDocuments.render({ name: "local-documents", id: "upload", query: { step: "upload" } }, state);
assert.match(localUploadHtml, /local-upload-stack[\s\S]*<details class="upload-folder-picker[^"]*" data-upload-folder-picker>[\s\S]*目标位置[\s\S]*data-directory-tree="local-upload-target"[\s\S]*<\/details>[\s\S]*<label class="file-drop"/, "本地上传页应在拖拽区上方提供可折叠的目标位置目录");
assert.doesNotMatch(localUploadHtml, /<details[^>]*data-upload-folder-picker[^>]*\sopen(?:\s|=|>)/, "目标位置目录应默认收起");
assert.doesNotMatch(localUploadHtml, /data-directory-item=/, "本地上传页的目录选择器应止于文件夹层级");
assert.match(localUploadHtml, /class="[^"]*is-active[^"]*"[^>]*data-directory-node="FOLDER-UNCATEGORIZED"/, "未指定目录时应默认存入未分类");

const originalFolderId = state.fileAssets.find((asset) => asset.id === "SCM-DOC-10").folderId;
const folder = actions.createDocumentFolder({ name: "目录专项验收", parentId: "FOLDER-SCM" });
assert.equal(folder.parentId, "FOLDER-SCM");
assert.equal(actions.renameDocumentFolder(folder.id, "目录专项验收已更新").name, "目录专项验收已更新");
assert.equal(actions.moveLocalDocumentAsset("SCM-DOC-10", folder.id).folderId, folder.id);
const folderHtml = localDocuments.render({ name: "local-documents", id: null, query: { folder: folder.id } }, state);
assert.equal((folderHtml.match(/data-local-document-row/g) || []).length, 1, "选定文件夹后右表应只展示其文档");
assert.equal(actions.deleteDocumentFolder(folder.id), null, "非空文件夹不得删除");
actions.moveLocalDocumentAsset("SCM-DOC-10", originalFolderId);
assert.equal(actions.deleteDocumentFolder(folder.id).id, folder.id, "空文件夹应可删除");

const [prepared] = await actions.prepareUploadFiles([new File(["目录定向上传"], "目录定向上传.txt", { type: "text/plain" })]);
const uploadBatch = actions.startKnowledgeImport("local-documents", { files: [prepared], targetFolderId: "FOLDER-SCM-DATA", deferred: true });
const uploadedAsset = state.fileAssets.find((asset) => asset.id === uploadBatch.items[0].fileId);
assert.equal(uploadedAsset.folderId, "FOLDER-SCM-DATA", "上传文档应存入选定目录");
assert.ok(actions.deleteLocalDocumentAsset(uploadedAsset.id), "测试资产应可在无知识库引用时清理");

const knowledgeUploadHtml = knowledge.render({ name: "knowledge", id: "KB-SCM-2024-V1", query: { onboarding: "1", step: "upload", flow: "import" } }, state);
assert.match(knowledgeUploadHtml, /data-import-local-directory[\s\S]*data-import-enterprise-directory/, "知识库选文件应提供本地与企业两套目录容器");
assert.doesNotMatch(knowledgeUploadHtml, /data-directory-item=/, "知识库选文件的左侧目录树应止于文件夹层级，文件统一在右侧列表展示");
assert.match(knowledgeUploadHtml, /local-upload-stack[\s\S]*<details class="upload-folder-picker[^"]*" data-upload-folder-picker>[\s\S]*data-upload-folder-path[\s\S]*data-directory-tree="local-upload-target"/, "新文件上传应复用文档管理的目标目录选择器");
const documentsSource = fs.readFileSync(path.join(demoRoot, "src/ops/documents.js"), "utf8");
assert.match(documentsSource, /data-document-move-picker[\s\S]*directoryTree\.folderPicker[\s\S]*scope:\s*"local-document-move-target"/, "移动文档应复用上传文件的目标位置组件");
assert.doesNotMatch(documentsSource, /data-document-move-target|<select[^>]+document-move-target/, "移动文档不应退回普通文件夹下拉选择");
const knowledgeSource = fs.readFileSync(path.join(demoRoot, "src/ops/knowledge.js"), "utf8");
assert.match(knowledgeSource, /existingKnowledgeImportSources[\s\S]*selectableLocalAssets[\s\S]*selectableEnterpriseObjects[\s\S]*pruneExistingSelections/, "知识库选文件应同时过滤本地文档与企业数据中的已入库文件");

const enterpriseSources = actions.listEnterpriseSourceObjects();
assert.ok(enterpriseSources.every((source) => source.directoryId === `ENT-DIR-${source.connectionId}`), "企业数据必须使用独立于本地文档的目录 ID");
assert.equal(new Set(enterpriseSources.map((source) => source.directoryId)).size, state.enterpriseConnections.length);

const documentStyles = fs.readFileSync(path.join(demoRoot, "assets/css/ops/documents.css"), "utf8");
assert.match(documentStyles, /\.document-directory-sidebar\[hidden\]\s*\{\s*display:\s*none;/, "非当前数据源的目录不得占用 Grid 布局");
assert.match(documentStyles, /\.local-documents > \.document-directory-browser\s*\{[\s\S]*min-height:\s*0;[\s\S]*flex:\s*1 1 auto;[\s\S]*\.local-documents \.document-directory-content > \.table-wrap,[\s\S]*overflow:\s*auto;/, "文档管理应让主面板适配视口，并在目录与表格内部滚动");
assert.match(documentStyles, /\.local-documents \.document-directory-content > \.table-wrap\s*\{[\s\S]*overflow-y:\s*hidden;/, "动态分页后表格不应继续出现纵向滚动条");
assert.match(documentStyles, /\.local-documents-pagination\s*\{[\s\S]*margin-left:\s*auto;[\s\S]*\.local-documents-pagination__button/, "分页控件应占据文档页脚右侧并使用紧凑图标按钮");

console.log("文件目录专项检查通过：目录树样式、层级折叠、内联文件夹编辑、文档移动、定向上传及两套来源目录均已覆盖。");

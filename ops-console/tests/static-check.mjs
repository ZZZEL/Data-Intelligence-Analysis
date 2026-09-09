import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(demoRoot, "index.html");
const failures = [];
const require = createRequire(import.meta.url);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function fail(message) {
  failures.push(message);
}

const indexHtml = fs.readFileSync(indexPath, "utf8");
const assetReferences = Array.from(indexHtml.matchAll(/(?:src|href)="([^"]+)"/g), (match) => match[1]);

assetReferences.forEach((reference) => {
  if (/^(?:https?:)?\/\//.test(reference)) {
    fail(`index.html 不应依赖外部资源：${reference}`);
    return;
  }
  const cleanReference = reference.split(/[?#]/)[0];
  if (cleanReference && !fs.existsSync(path.resolve(demoRoot, cleanReference))) {
    fail(`index.html 引用的本地文件不存在：${reference}`);
  }
});

const sourceFiles = walk(path.join(demoRoot, "src")).filter((file) => file.endsWith(".js"));
sourceFiles.forEach((file) => {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    fail(`JavaScript 语法检查失败：${path.relative(demoRoot, file)}\n${String(error.stderr || error.message)}`);
  }
});

const authoredFiles = [
  indexPath,
  ...walk(path.join(demoRoot, "assets", "css")),
  ...sourceFiles
];

authoredFiles.forEach((file) => {
  const content = fs.readFileSync(file, "utf8");
  if (/https?:\/\//.test(content)) {
    fail(`自有运行文件中发现外部 URL：${path.relative(demoRoot, file)}`);
  }
  if (/\bfetch\s*\(/.test(content)) {
    fail(`静态 Demo 不应使用 fetch：${path.relative(demoRoot, file)}`);
  }
  if (/type=["']module["']/.test(content)) {
    fail(`file:// 交付不应使用 ES Module：${path.relative(demoRoot, file)}`);
  }
});

// Execute the shared header renderer so this check covers its real generated
// DOM contract, rather than only looking for labels in individual page files.
globalThis.window = globalThis;
delete globalThis.OpsDemo;
require(path.join(demoRoot, "src", "core", "namespace.js"));
require(path.join(demoRoot, "src", "ui", "dom.js"));
const dom = globalThis.OpsDemo.ui.dom;
const headerHtml = dom.pageHeader({
  title: "契约测试",
  breadcrumbs: [{ label: "知识库", route: "knowledge" }],
  back: { label: "返回知识库", route: "knowledge" },
  actions: '<button data-primary-action>新建</button>',
  toolbar: {
    search: { placeholder: "搜索", attrs: "data-contract-search" },
    filters: dom.headerFilter("状态", '<select data-contract-filter></select>'),
    view: '<button data-contract-view>视图</button>',
  },
});
const topStart = headerHtml.indexOf('class="page-header__top"');
if (topStart < 0 || /page-header__toolbar|page-header--has-toolbar/.test(headerHtml)) {
  fail("PageHeader 必须保持单行，不应生成第二层工具栏");
}
if (!/page-header__title/.test(headerHtml) || !/data-primary-action/.test(headerHtml) || !/page-header__back/.test(headerHtml)) {
  fail("PageHeader 单行应承载返回、标题和主要操作");
}
if (!/page-header__actions[\s\S]*data-contract-search[\s\S]*data-contract-filter[\s\S]*data-contract-view[\s\S]*data-primary-action/.test(headerHtml)) {
  fail("搜索、筛选、视图控制和主要操作应共同位于 PageHeader 右侧");
}
if (/page-header__filter-label/.test(headerHtml) || !/class="sr-only">状态<\/span>/.test(headerHtml)) {
  fail("PageHeader 筛选控件不应显示额外说明小字，但应保留无障碍标签");
}
if (/page-header__tools/.test(dom.pageHeader({ title: "无工具页" }))) {
  fail("没有工具的页面不应生成空 PageHeader tools");
}

const knowledgePage = fs.readFileSync(path.join(demoRoot, "src", "pages", "knowledge.js"), "utf8");
const knowledgeContextSource = fs.readFileSync(path.join(demoRoot, "src", "core", "knowledge-context.js"), "utf8");
const fileProcessingPage = fs.readFileSync(path.join(demoRoot, "src", "core", "file-processing.js"), "utf8");
const localDocumentsPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "documents.js"), "utf8");
const referenceListStart = localDocumentsPage.indexOf("function renderReferenceList");
const referenceListEnd = localDocumentsPage.indexOf("\n  function render(", referenceListStart);
const referenceListSource = localDocumentsPage.slice(referenceListStart, referenceListEnd);
const previewUi = fs.readFileSync(path.join(demoRoot, "src", "ui", "preview.js"), "utf8");
const directoryTreeSource = fs.readFileSync(path.join(demoRoot, "src", "ui", "directory-tree.js"), "utf8");
const dataAccessPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "data-access.js"), "utf8");
const apiAccessPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "api-access.js"), "utf8");
const modelsPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "models.js"), "utf8");
const consumptionPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "consumption.js"), "utf8");
const ragPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "rag.js"), "utf8");
const appSource = fs.readFileSync(path.join(demoRoot, "src", "app.js"), "utf8");
const routerSource = fs.readFileSync(path.join(demoRoot, "src", "core", "router.js"), "utf8");
const actionsSource = fs.readFileSync(path.join(demoRoot, "src", "core", "actions.js"), "utf8");
const fileProcessingSource = fs.readFileSync(path.join(demoRoot, "src", "core", "file-processing.js"), "utf8");
const seedSource = fs.readFileSync(path.join(demoRoot, "src", "mock", "seed.js"), "utf8");
const supplyChainSource = fs.readFileSync(path.join(demoRoot, "src", "mock", "supply-chain-seed.js"), "utf8");
const domSource = fs.readFileSync(path.join(demoRoot, "src", "ui", "dom.js"), "utf8");
const overlaySource = fs.readFileSync(path.join(demoRoot, "src", "ui", "overlay.js"), "utf8");
const componentsStyles = fs.readFileSync(path.join(demoRoot, "assets", "css", "components.css"), "utf8");
const pagesStyles = fs.readFileSync(path.join(demoRoot, "assets", "css", "pages.css"), "utf8");
const documentsStyles = fs.readFileSync(path.join(demoRoot, "assets", "css", "documents.css"), "utf8");
const responsiveStyles = fs.readFileSync(path.join(demoRoot, "assets", "css", "responsive.css"), "utf8");
const permissionModelSource = [knowledgePage, knowledgeContextSource, fileProcessingSource, previewUi, apiAccessPage, appSource, actionsSource, seedSource, supplyChainSource, pagesStyles].join("\n");
if (/minAccessLevel|upstreamAccessLevel|effectiveAccessLevel|permissionLevel|permissionFilterEnabled|permission_filter|\baccessLevels\b|\baccessLevel\b|访问等级|权限等级|最低访问等级|上游访问等级/.test(permissionModelSource)) {
  fail("运营端运行代码、种子和样式不应保留权限等级模型");
}
const enterprisePageSource = dataAccessPage.slice(0, dataAccessPage.indexOf("function externalTagMap"));
const enterpriseListSource = enterprisePageSource.slice(enterprisePageSource.indexOf("function renderEnterpriseConnections"), enterprisePageSource.indexOf("function databaseEngineDefinitions"));
const enterpriseEngineDefinitionSource = enterprisePageSource.slice(enterprisePageSource.indexOf("function databaseEngineDefinitions"), enterprisePageSource.indexOf("function connectionEditorBody"));
const enterpriseEditorBodySource = enterprisePageSource.slice(enterprisePageSource.indexOf("function connectionEditorBody"), enterprisePageSource.indexOf("function readConnectionEditor"));
const enterpriseReadEditorSource = enterprisePageSource.slice(enterprisePageSource.indexOf("function readConnectionEditor"), enterprisePageSource.indexOf("function bindConnectionDraftControls"));
const enterpriseDraftControlSource = enterprisePageSource.slice(enterprisePageSource.indexOf("function bindConnectionDraftControls"), enterprisePageSource.indexOf("function openConnectionEditor"));
const enterpriseOpenEditorSource = enterprisePageSource.slice(enterprisePageSource.indexOf("function openConnectionEditor"), enterprisePageSource.indexOf("function rerenderEnterprise"));
const enterpriseActionsSource = actionsSource.slice(actionsSource.indexOf("function enterpriseDatabaseEngineLabel"), actionsSource.indexOf("var EXTERNAL_SOURCE_NAME_MAP"));
const enterpriseSeedSource = seedSource.slice(seedSource.indexOf("enterpriseConnections:"), seedSource.indexOf("externalInformation:"));
const externalSearchServiceSeedStart = seedSource.indexOf("externalInformation:");
const externalSearchServiceSeedSource = seedSource.slice(externalSearchServiceSeedStart, seedSource.indexOf("\n    apiAccess:", externalSearchServiceSeedStart));

if (!/sidebar-account-popover[\s\S]*<a class="sidebar-account-popover__action" role="menuitem" href="\.\.\/user-client\/#\/chat\/copper-decision">[\s\S]*用户端入口/.test(appSource) || /nav-item--demo-switch|renderDemoSwitch/.test(appSource)) {
  fail("运营端应仅在头像展开的账户菜单内提供用户端入口");
}

const retrievalNavigationSource = appSource.slice(appSource.indexOf('id: "retrieval"'), appSource.indexOf('id: "systemConfig"'));
const systemConfigNavigationSource = appSource.slice(appSource.indexOf('id: "systemConfig"'), appSource.indexOf("var accountNavigation"));
if (!/label:\s*"系统配置"[\s\S]*label:\s*"模型管理"[\s\S]*route:\s*"models"/.test(systemConfigNavigationSource) || /route:\s*"models"/.test(retrievalNavigationSource)) {
  fail("运营端侧栏应将模型管理放在独立的系统配置分组下");
}
if (/id:\s*"capabilities"|label:\s*"能力管理"|route:\s*"(?:skills|visualizations)"/.test(appSource)) {
  fail("运营端侧栏不应保留能力管理、Skill 目录或可视化能力入口");
}
if (/skills:\s*\{|visualizations:\s*\{/.test(routerSource) || /src\/pages\/capabilities\.js/.test(indexHtml) || fs.existsSync(path.join(demoRoot, "src", "pages", "capabilities.js"))) {
  fail("运营端不应保留 Skill 或可视化页面路由、脚本引用及页面文件");
}
if (!/routeName === "tools" \|\| routeName === "skills" \|\| routeName === "visualizations"[\s\S]*routeName = "knowledge"/.test(routerSource) || !/\(\?:tools\|skills\|visualizations\)/.test(routerSource)) {
  fail("历史 Tool、Skill 与可视化地址应安全返回知识库");
}
if (/route:\s*"definitions"|分析口径/.test(appSource) || /definitions:\s*\{/.test(routerSource) || /src\/pages\/judgment\.js/.test(indexHtml) || fs.existsSync(path.join(demoRoot, "src", "pages", "judgment.js"))) {
  fail("已移除的分析口径不应保留导航、页面路由、脚本引用或页面文件");
}
if (!/models:\s*\{\s*page:\s*"models",\s*title:\s*"模型管理",\s*group:\s*"systemConfig"/.test(routerSource)) {
  fail("模型管理路由应归属系统配置分组");
}
const knowledgeNavigationSource = appSource.slice(appSource.indexOf('id: "knowledge"'), appSource.indexOf('id: "dataAccess"'));
if (/文档处理策略|route:\s*"document-processing"/.test(knowledgeNavigationSource) || /"document-processing":\s*\{/.test(routerSource)) {
  fail("文档处理策略不应作为运营端导航或独立路由");
}
if (!/label:\s*"知识库"[\s\S]*label:\s*"知识库管理"[\s\S]*label:\s*"文档管理"[\s\S]*route:\s*"local-documents"/.test(knowledgeNavigationSource)) {
  fail("知识库分组应直接提供文档管理入口");
}
if (!/"local-documents":\s*\{\s*page:\s*"localDocuments",\s*title:\s*"文档管理",\s*group:\s*"knowledge"/.test(routerSource) || !/src\/pages\/documents\.js/.test(indexHtml)) {
  fail("文档管理页面应加载独立脚本并注册到知识库分组路由");
}
if (!/OpsDemo\.pages\.localDocuments/.test(localDocumentsPage) || !/data-local-document-upload/.test(localDocumentsPage) || !/data-local-document-search/.test(localDocumentsPage) || !/data-local-document-status-filter/.test(localDocumentsPage)) {
  fail("本地文档页面应注册页面并提供上传、搜索与状态筛选入口");
}
if (!/src\/ui\/directory-tree\.js/.test(indexHtml) || indexHtml.indexOf("src/ui/directory-tree.js") > indexHtml.indexOf("src/pages/knowledge.js")) {
  fail("通用文件目录组件应在文档管理与知识库页面前加载");
}
if (!/OpsDemo\.ui\.directoryTree/.test(directoryTreeSource) || !/data-directory-toggle/.test(directoryTreeSource) || !/data-directory-select/.test(directoryTreeSource) || !/directory-tree__count/.test(directoryTreeSource)) {
  fail("通用文件目录应提供折叠、选择、文件夹图标与数量展示");
}
if (!/function\s+breadcrumb/.test(directoryTreeSource) || !/\[rootNode\]\.concat\(result\)/.test(directoryTreeSource) || !/data-directory-item/.test(directoryTreeSource) || !/canExpand\s*=\s*Boolean\(nodeChildren\.length \|\| nodeItems\.length(?: \|\| ownsDraft)?\)/.test(directoryTreeSource) || !/expanded\s*=\s*isRoot \|\| (?:ownsDraft \|\| )?!collapsed\.has/.test(directoryTreeSource) || !/canExpand && !isRoot \?/.test(directoryTreeSource) || !/canExpand && !isRoot \? ' aria-expanded=/.test(directoryTreeSource)) {
  fail("通用目录树应固定展开根节点，以文件作为末级节点，并提供完整目录路径");
}
if (!/\.directory-tree__group::before\s*\{[\s\S]*background:/.test(documentsStyles) || !/\.document-directory-sidebar__toolbar\s*\{/.test(documentsStyles) || !/\.document-directory-breadcrumb\s*\{/.test(documentsStyles) || !/\.document-directory-sidebar\[hidden\]\s*\{\s*display:\s*none/.test(documentsStyles) || !/\.directory-tree__name-input\s*\{/.test(documentsStyles)) {
  fail("共享目录样式应提供层级竖线、左栏工具区、路径面包屑，并正确隐藏未选来源目录");
}
const directoryItemSource = directoryTreeSource.slice(directoryTreeSource.indexOf("function itemRow"), directoryTreeSource.indexOf("function folderInput", directoryTreeSource.indexOf("function itemRow")));
if (!/directory-tree__label--item/.test(directoryItemSource) || /dom\.icon/.test(directoryItemSource) || !/\.directory-tree__group::before/.test(documentsStyles)) {
  fail("目录树内的文件只展示文件名，文件夹之间应用缩进引导线表达层级");
}
if (!/src\/mock\/supply-chain-seed\.js/.test(indexHtml) || indexHtml.indexOf("src/mock/supply-chain-seed.js") > indexHtml.indexOf("src/mock/seed.js")) {
  fail("供应链演示数据应先于主种子数据加载");
}
if (!/var supplyChainDemo = dataNamespace\.supplyChainDemo/.test(seedSource) || !/TEMPLATE\.knowledgeBases\.unshift\(deepClone\(supplyChainDemo\.knowledgeBase\)\)/.test(seedSource) || !/TEMPLATE\.documents = deepClone\(supplyChainDocuments\)\.concat\(TEMPLATE\.documents\)/.test(seedSource)) {
  fail("主种子数据应将供应链知识库排在第一，并将 10 份原文件同步进入文档管理");
}
const supplyDocumentUrls = Array.from(supplyChainSource.matchAll(/"sourceUrl": "([^"]+)"/g), (match) => match[1]);
if (!/KB-SCM-2024-V1/.test(supplyChainSource) || (supplyChainSource.match(/"localAssetId": "SCM-DOC-/g) || []).length !== 10 || (supplyChainSource.match(/"origin": "import"/g) || []).length !== 90 || supplyDocumentUrls.length !== 10) {
  fail("供应链演示 seed 应包含 1 个知识库、10 个文档资产和 90 个预置切片");
}
supplyDocumentUrls.forEach((reference) => {
  if (!fs.existsSync(path.resolve(demoRoot, reference))) fail(`供应链原文件资源不存在：${reference}`);
});
if (!/sourceUrl:\s*doc\.sourceUrl/.test(fileProcessingSource) || !/sourceUrl = version\.sourceUrl/.test(knowledgePage) || !/sourceUrl = version\.sourceUrl/.test(localDocumentsPage) || !/version\.sourceUrl/.test(knowledgePage + localDocumentsPage)) {
  fail("供应链预置文件应通过 sourceUrl 支持原文件预览与下载");
}
if (!/state\.fileAssets/.test(localDocumentsPage) || !/getFileAssetDetail/.test(localDocumentsPage) || /state\.externalInformation/.test(localDocumentsPage)) {
  fail("文档管理应读取独立文件资产与版本；运行时外部检索引用不作为文件资产");
}
if (/data-local-upload-files|actions\.uploadLocalDocuments/.test(localDocumentsPage) || !/pages\.knowledge\.renderLocalImport/.test(localDocumentsPage) || !/pages\.knowledge\.mountLocalImport/.test(localDocumentsPage) || !/actions\.deleteLocalDocumentAsset/.test(localDocumentsPage)) {
  fail("文档管理应复用公共池上传处理界面，并保留资产删除入口");
}
if (!/DEFAULT_DOCUMENT_FOLDERS/.test(fileProcessingSource) || !/state\.documentFolders/.test(fileProcessingSource) || !/function createDocumentFolder/.test(fileProcessingSource) || !/function renameDocumentFolder/.test(fileProcessingSource) || !/function deleteDocumentFolder/.test(fileProcessingSource) || !/function moveLocalDocumentAsset/.test(fileProcessingSource)) {
  fail("文档资产层应保存文件夹归属，并提供创建、重命名、删除空目录与移动文档动作");
}
if (!/page-content creation-page local-documents-page/.test(localDocumentsPage) || !/panel creation-panel local-documents/.test(localDocumentsPage) || !/document-directory-browser/.test(localDocumentsPage) || !/data-local-directory-tree-host/.test(localDocumentsPage) || !/data-local-folder-create-child/.test(localDocumentsPage) || !/showItems:\s*false[\s\S]*editableFolders:\s*true/.test(localDocumentsPage) || !/data-directory-edit/.test(directoryTreeSource) || !/data-local-folder-delete/.test(localDocumentsPage) || !/\.document-directory-browser\s*\{[\s\S]*grid-template-columns:\s*250px minmax\(0, 1fr\)/.test(documentsStyles) || !/\.local-documents > \.document-directory-browser\s*\{[\s\S]*flex:\s*1 1 auto/.test(documentsStyles) || !/\.local-documents \.document-directory-content > \.table-wrap,[\s\S]*overflow:\s*auto/.test(documentsStyles)) {
  fail("文档管理应使用左侧文件目录和右侧无图标文件表，并提供目录管理入口");
}
if (!/document-directory-sidebar__toolbar[\s\S]*data-local-directory-tree-host/.test(localDocumentsPage) || !/renderDirectoryPath/.test(localDocumentsPage) || !/directoryTree\.breadcrumb/.test(localDocumentsPage) || /document-directory-context__actions/.test(localDocumentsPage)) {
  fail("文档目录操作应位于左侧目录树上方，右侧仅展示可回退的当前目录路径");
}
if (/data-local-folder-create(?!-child)|data-local-folder-rename|function\s+openFolderEditor|data-document-folder-form/.test(localDocumentsPage) || !/data-directory-folder-input/.test(directoryTreeSource) || !/data-directory-draft/.test(directoryTreeSource) || !/function\s+finishInlineFolderEdit/.test(localDocumentsPage) || !/addEventListener\("focusout"/.test(localDocumentsPage) || !/addEventListener\("dblclick"[\s\S]*beginInlineFolderRename/.test(localDocumentsPage) || !/event\.detail > 1[\s\S]*scheduleFolderSelection/.test(localDocumentsPage) || !/event\.key === "F2"/.test(localDocumentsPage) || !/单击打开，双击重命名/.test(directoryTreeSource) || !/position:\s*editor\.beforeId \? "before" : "first"/.test(localDocumentsPage) || !/beforeFolderId:\s*editor\.beforeId/.test(localDocumentsPage)) {
  fail("文档页不应保留页头重命名或文件夹弹窗；文件夹名称应单击打开、双击或 F2 内联重命名，并以失焦提交完成");
}
if (/data-local-document-join|data-local-documents-join-selected|function\s+(?:openJoin|joinPlan|renderJoinTarget)|knowledge-join-(?:dialog|option|targets)|data-local-document-select|local-documents-batch-actions/.test(localDocumentsPage + documentsStyles + pagesStyles)) {
  fail("文档管理不得保留单个或批量加入知识库的入口、事件、弹窗或遗留样式");
}
if (!/function\s+renderPagination/.test(localDocumentsPage) || !/function\s+paginateDocumentRows[\s\S]*tableWrap\.clientHeight[\s\S]*getBoundingClientRect\(\)\.height[\s\S]*pages\.push/.test(localDocumentsPage) || !/data-local-document-pagination/.test(localDocumentsPage) || !/data-local-document-page="previous"/.test(localDocumentsPage) || !/data-local-document-page="next"/.test(localDocumentsPage) || !/data-local-document-search[\s\S]*applyFilters\(root, true\)/.test(localDocumentsPage) || !/new window\.ResizeObserver[\s\S]*observe\(tableWrap\)/.test(localDocumentsPage) || !/\.local-documents \.document-directory-content > \.table-wrap\s*\{[\s\S]*overflow-y:\s*hidden/.test(documentsStyles) || !/\.local-documents-pagination\s*\{[\s\S]*margin-left:\s*auto/.test(documentsStyles) || /LOCAL_DOCUMENT_PAGE_SIZE|原文件独立保存，各知识库按需引用|local-documents__scope/.test(localDocumentsPage + documentsStyles + pagesStyles)) {
  fail("文档管理应按表格可用高度动态分页，搜索或筛选后回到第一页，且不重复展示职责说明");
}
if (!/data-import-version/.test(knowledgePage) || !/actions\.startKnowledgeImport/.test(knowledgePage)) {
  fail("公共池文件加入知识库的能力必须保留在知识库管理导入流程中");
}
if (!/sourceType\s*=\s*input\.sourceType\s*\|\|\s*"local_upload"/.test(actionsSource) || !/localAssetId:\s*input\.localAssetId\s*\|\|\s*documentId/.test(actionsSource) || !/TEMPLATE\.documents\.forEach[\s\S]*localAssetId\s*=\s*item\.localAssetId\s*\|\|\s*item\.id[\s\S]*sourceType\s*=\s*"local_upload"/.test(seedSource)) {
  fail("种子与新增文件都应以 localAssetId 标识本地原文件，并显式排除信源引用");
}
if (!/<th>文档<\/th><th>状态<\/th><th>知识库引用<\/th><th>大小<\/th><th>上传时间<\/th><th>操作<\/th>/.test(localDocumentsPage) || /data-local-document-select|<th>[\s\S]*存储|<th>处理结果<\/th>|file-storage-(?:heading|status)/.test(localDocumentsPage)) {
  fail("文档列表应只显示统一状态，不再单列原文件存储信息");
}
if (!/[\s\S]*<option value="uploaded">未处理<\/option>[\s\S]*<option value="processing">处理中<\/option>[\s\S]*<option value="parsed">已解析<\/option>[\s\S]*<option value="failed">异常<\/option>/.test(localDocumentsPage) || /已切块|处理失败/.test(localDocumentsPage)) {
  fail("文档管理状态应收敛为未处理、处理中、已解析和异常");
}
if (!/data-local-document-preview=[^\n]+>详情<\/button><button[^\n]+data-local-document-move=[^\n]+>移动<\/button><button[^\n]+data-local-document-delete=[^\n]+>删除<\/button>/.test(localDocumentsPage) || /data-local-document-download|downloadAsset\(details\(data\.localDocumentDownload\)\)/.test(localDocumentsPage) || !/data-local-preview-download/.test(localDocumentsPage)) {
  fail("文档管理列表应只保留详情、移动、删除，原文件下载仅保留在详情页");
}
if (!/function\s+folderPicker/.test(directoryTreeSource) || !/upload-folder-picker__summary/.test(directoryTreeSource) || !/showItems:\s*false/.test(directoryTreeSource) || !/rootSelectable:\s*false/.test(directoryTreeSource) || !/local-upload-stack/.test(knowledgePage) || !/<details class="upload-folder-picker" data-upload-folder-picker>/.test(knowledgePage) || !/directoryTree\.folderPicker/.test(knowledgePage) || !/scope:\s*"local-upload-target"/.test(knowledgePage) || !/data-document-move-picker/.test(localDocumentsPage) || !/scope:\s*"local-document-move-target"/.test(localDocumentsPage) || /data-document-move-target|<select[^>]+document-move-target|upload-folder-target|data-upload-folder-target-name/.test(knowledgePage + localDocumentsPage + documentsStyles)) {
  fail("文档管理与知识库上传应共用默认收起、只展示文件夹的目标位置选择器");
}
if (!/function\s+existingKnowledgeImportSources/.test(knowledgePage) || !/selectableLocalAssets/.test(knowledgePage) || !/selectableEnterpriseObjects/.test(knowledgePage) || !/pruneExistingSelections/.test(knowledgePage) || /dom\.status\(exists \? "已加入"/.test(knowledgePage)) {
  fail("知识库导入应在两类信息源的目录计数和右侧列表中同步排除已入库文件");
}
if (!/\.creation-page\s*\{[\s\S]*height:\s*calc\(100dvh - var\(--header-height\) - 1px\);[\s\S]*overflow:\s*hidden;/.test(pagesStyles) || !/\.creation-panel__scroll\s*\{[\s\S]*overflow-y:\s*auto;/.test(pagesStyles) || !/\.creation-source-workspace\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*overflow:\s*hidden;/.test(pagesStyles) || !/\.import-directory-browser \.table-wrap\s*\{[\s\S]*overflow:\s*auto;/.test(documentsStyles)) {
  fail("知识库创建流程应填满视口剩余高度，并将长表单与文档列表限制在内部滚动区");
}
if (!/refs\.length \? '<button[^\n]+data-local-document-references=[^\n]+ : '<span class="table-secondary file-asset-reference-empty">未被引用<\/span>'/.test(localDocumentsPage) || /未加入知识库/.test(localDocumentsPage)) {
  fail("未被知识库引用的文档应显示不可点击的辅助文字“未被引用”");
}
if (!/file-asset-date[^\n]*>[^<]*<\/time>/.test(localDocumentsPage) || /file-asset-date[^\n]*<span>/.test(localDocumentsPage) || !/\.file-assets-table tbody td:not\(:nth-child\(1\)\)\s*\{\s*white-space:\s*nowrap;/.test(documentsStyles) || !/\.file-assets-table \.knowledge-row-actions\s*\{\s*flex-wrap:\s*nowrap;/.test(documentsStyles)) {
  fail("文档列表除文档名称与 ID 外的状态、引用、大小、时间和操作都应保持单行");
}
if (!/function routeTo/.test(localDocumentsPage) || !/data-local-preview-kb-select/.test(localDocumentsPage) || /data-local-preview-version|原文件版本|版本身份/.test(localDocumentsPage) || !/back:\s*\{\s*label:\s*"返回文档管理",\s*route:\s*"local-documents"/.test(localDocumentsPage) || /data-preview-document-select/.test(localDocumentsPage)) {
  fail("文档预览应有稳定资产路径与查看范围选择，不向用户暴露内部版本");
}
if (!/renderChunkCards\(chunks\)/.test(localDocumentsPage) || !/href="#\/knowledge\/' \+ encodeURIComponent\(kb\.id\) \+ '\?tab=documents"/.test(localDocumentsPage) || /data-local-result-status/.test(localDocumentsPage)) {
  fail("文档管理预览应只读展示切片、保留信息浮层，知识库引用应跳转到知识库详情且结果来源旁不重复显示状态");
}
if (/data-local-document-process|function\s+startFileProcessing|dom\.button\("处理文件"/.test(localDocumentsPage) || !/data-document-reprocess/.test(knowledgePage) || !/actions\.startKnowledgeImport\(route\.id,[\s\S]*fileVersionIds:\s*\[item\.fileVersionId\][\s\S]*reprocess:\s*true[\s\S]*router\.navigate\("knowledge\/" \+ encodeURIComponent\(route\.id\) \+ "\/import\?step=parse&batch="/.test(knowledgePage) || /step=upload&reprocess=1&fileId=|reprocess=1&fileVersionId=/.test(localDocumentsPage + knowledgePage)) {
  fail("文档详情不应提供作用域含糊的处理入口；重新处理只保留在目标明确的知识库文件列表中");
}
if (!/local-document-preview__result-actions/.test(localDocumentsPage) || !/data-local-preview-kb-select/.test(localDocumentsPage) || !/<option value="" selected>暂无知识库引用<\/option>/.test(localDocumentsPage) || /文档处理结果|local-document-reference-list|local-document-reference-row/.test(localDocumentsPage + documentsStyles) || !/data-local-artifact-result/.test(localDocumentsPage) || /file-asset-context/.test(localDocumentsPage)) {
  fail("文档预览应常驻知识库选择器，以暂无引用占位，并只展示所选知识库切片");
}
if (/data-local-preview-tab|file-asset-result-tabs|file-asset-parsed|>解析结果<\/button>/.test(localDocumentsPage) || !/view === "parsed"[\s\S]*view: "chunks"/.test(localDocumentsPage)) {
  fail("文档预览只应面向用户展示原文件与切片，历史解析结果地址应归并到切片");
}
if (!/<section class="file-asset-details" aria-label="文件信息">[\s\S]*<dt>文件 ID<\/dt>[\s\S]*<dt>上传时间<\/dt>[\s\S]*<dt>文件状态<\/dt>[\s\S]*<dt>文件路径<\/dt>/.test(localDocumentsPage) || !/function\s+renderFilePath[\s\S]*leafLabel:\s*fileName[\s\S]*interactive:\s*false/.test(localDocumentsPage) || /<summary>文件信息与知识库引用<\/summary>|<dt>来源<\/dt>|<dt>保存时间<\/dt>/.test(localDocumentsPage)) {
  fail("文件详情应展示文件 ID、上传时间、公共池状态和不可点击的完整文件路径");
}
if (/仅改变目录位置，不影响知识库引用/.test(localDocumentsPage)) {
  fail("移动文档弹窗不应保留目录选择器下方的说明文字");
}
if (/renderFileTasks|file-asset-tasks|data-file-task/.test(localDocumentsPage + documentsStyles)) {
  fail("文档页不应再重复展示独立文件处理任务模块");
}
if (/function\s+renderKnowledgeTasks|knowledge-import-tasks|knowledge-import-task|data-import-task-|openDocumentReplacementConfirmation|取消处理任务/.test(knowledgePage + pagesStyles)) {
  fail("知识库详情页不应展示或绑定独立处理任务板块");
}
if (!/\.preview-page\s*\{[\s\S]*height:\s*calc\(100vh\s*-\s*var\(--header-height\)\)/.test(documentsStyles) || /\.file-asset-references/.test(documentsStyles)) {
  fail("文件预览应利用剩余视口高度，且不恢复旧引用摘要模块");
}
if (!/class="file-asset-reference-list"/.test(referenceListSource) || !/class="file-asset-reference-list__item"/.test(referenceListSource) || /renderReferenceLinks|关联知识库：|file-asset-reference-summary/.test(referenceListSource) || !/\.file-asset-reference-list\s*\{\s*display:\s*grid;/.test(documentsStyles) || !/\.file-asset-reference-list__item\s*\{[\s\S]*display:\s*flex;/.test(documentsStyles)) {
  fail("知识库引用弹窗应直接按行展示可点击的知识库链接，不再使用行内摘要");
}
if (!/routeName === "document-processing"[\s\S]*routeName = "knowledge"/.test(routerSource)) {
  fail("历史文档处理策略地址应安全返回知识库");
}

if (/goldenCaseTrace|renderGoldenCaseTrace|data-golden-case-trace|美国关税三情景研判|与调用侧 Demo 的任务配置快照一致/.test(seedSource + knowledgePage)) {
  fail("知识库首页不应保留跨 Demo 黄金案例追溯卡或专用种子数据");
}
if (!/src\/pages\/data-access\.js/.test(indexHtml) || !/label:\s*"数据接入"[\s\S]*label:\s*"企业数据"[\s\S]*route:\s*"enterprise-connections"[\s\S]*label:\s*"外部信源"[\s\S]*route:\s*"external-information"/.test(appSource)) {
  fail("运营端应加载数据接入页面，并在侧栏提供企业数据和外部信源入口");
}
if (!/"enterprise-connections":\s*\{\s*page:\s*"enterpriseConnections",\s*title:\s*"企业数据",\s*group:\s*"dataAccess"/.test(routerSource) || !/"external-information":\s*\{\s*page:\s*"externalInformation",\s*title:\s*"外部信源",\s*group:\s*"dataAccess"/.test(routerSource)) {
  fail("企业数据和外部信源应注册为数据接入分组下的独立路由");
}
if (!/OpsDemo\.pages\.enterpriseConnections/.test(dataAccessPage) || !/OpsDemo\.pages\.externalInformation/.test(dataAccessPage)) {
  fail("数据接入脚本应同时注册企业数据和检索服务页面");
}
if (/enterpriseBoundaryNotice|data-access-boundary|直接读取已有数据库，不复制整库数据/.test(enterprisePageSource + pagesStyles)) {
  fail("企业数据页不应保留顶部数据库接入说明条");
}
if (!/title:\s*"企业数据"/.test(enterpriseListSource) || !/data-enterprise-create/.test(enterpriseListSource) || !/接入数据库/.test(enterpriseListSource) || !/enterprise-database-grid/.test(enterpriseListSource) || !/enterprise-database-card/.test(enterpriseListSource) || !/data-enterprise-card/.test(enterpriseListSource)) {
  fail("企业数据页应保留标题、接入入口和一库一卡的数据库卡片网格");
}
if (/<table class="data-table data-access-table"|<th>连接名称<\/th>/.test(enterpriseListSource)) {
  fail("企业数据库不应继续使用连接列表表格呈现");
}
if (/data-enterprise-search|data-enterprise-status|summary-strip|data-access-summary|toolbar\s*:|调整搜索|状态筛选/.test(enterpriseListSource)) {
  fail("企业连接列表不应保留搜索、状态筛选、相关空态引导或摘要统计条");
}
if (!["data-enterprise-create", "data-enterprise-test", "data-enterprise-edit", "data-enterprise-delete", "data-enterprise-draft-test"].every((marker) => enterprisePageSource.includes(marker))) {
  fail("企业数据页面应提供接入、测试、编辑和删除闭环");
}
if (!/data-enterprise-test=[\s\S]*>测试<\/button>[\s\S]*data-enterprise-edit=[\s\S]*>配置<\/button>[\s\S]*data-enterprise-delete=[\s\S]*>删除<\/button>/.test(enterpriseListSource) || /重新测试|测试连接<\/button>|>编辑<\/button>/.test(enterpriseListSource)) {
  fail("企业数据卡片操作应统一为测试、配置、删除");
}
if (/data-enterprise-detail|openConnectionDetail|kind:\s*"drawer"/.test(enterprisePageSource) || /\.drawer-status-line|\.drawer-description/.test(pagesStyles) || !/enterprise-database-card__title" data-enterprise-edit/.test(enterpriseListSource)) {
  fail("数据库标题和编辑操作应统一打开同一个编辑弹窗，不应保留独立详情抽屉");
}
if (/data-enterprise-toggle|<th>启用状态<\/th>|item\.enabled|已启用|已停用|默认停用/.test(enterprisePageSource)) {
  fail("企业数据只使用连接状态，不应保留启用状态列、开关或隐藏启停文案");
}
const enterpriseBasicFields = ["name", "description", "host", "port", "databaseName", "username", "password"];
if (!enterpriseBasicFields.every((field) => enterprisePageSource.includes(`data-enterprise-field="${field}"`))) {
  fail("接入数据库表单应提供数据库名称与描述，以及类型、服务器、端口、用户名、密码和目标数据库字段");
}
if (!/数据库名称[\s\S]*数据库描述[\s\S]*data-enterprise-connection-fields/.test(enterpriseEditorBodySource) || /data-enterprise-profile|database-editor-section--profile|<h3>数据库信息<\/h3>|用于在平台内识别和说明这个数据库/.test(enterpriseEditorBodySource)) {
  fail("数据库名称与描述应直接放在弹窗内容区，不保留数据库信息卡片、标题或说明");
}
if (!/data-enterprise-connection-fields[\s\S]*<h3>连接信息<\/h3>[\s\S]*数据库类型[\s\S]*服务器地址[\s\S]*用户名[\s\S]*密码[\s\S]*目标数据库/.test(enterpriseEditorBodySource) || /用于建立数据库级只读连接/.test(enterpriseEditorBodySource)) {
  fail("连接信息应保留独立模块，并按连接参数、目标数据库的顺序呈现");
}
if (!/<select id=\"enterprise-database\" class=\"select-field\"[\s\S]*data-enterprise-field=\"databaseName\"[\s\S]*tested \? \"\" : \" disabled\"/.test(enterpriseEditorBodySource) || /<input[^>]*data-enterprise-field=\"databaseName\"/.test(enterpriseEditorBodySource) || !/请先测试连接/.test(enterpriseEngineDefinitionSource)) {
  fail("目标数据库应始终显示为下拉框，并在连接测试前保持禁用");
}
if (!/type="password" value=""[\s\S]*autocomplete="new-password"[\s\S]*data-enterprise-field="password"/.test(enterpriseEditorBodySource) || !/autocomplete="username"[\s\S]*data-enterprise-field="username"/.test(enterpriseEditorBodySource) || /value="' \+ esc\(item\.(?:password|passwordMasked)/.test(enterpriseEditorBodySource)) {
  fail("数据库密码必须使用密码输入框且不得回显，用户名应提供浏览器语义");
}
if (/data-enterprise-field="(?:ssl|timeoutSeconds|maxRows)"|高级设置（可选）/.test(enterpriseEditorBodySource)) {
  fail("企业连接弹窗不应展示 SSL、查询超时、最大行数或可见高级设置区");
}
if (!/currentLimits\s*=\s*connection\s*&&\s*connection\.limits\s*\|\|\s*\{\}/.test(enterpriseReadEditorSource) || !/maxRows:\s*Number\(currentLimits\.maxRows\s*\|\|\s*1000\)/.test(enterpriseReadEditorSource) || !/timeoutSeconds:\s*Number\(currentLimits\.timeoutSeconds\s*\|\|\s*20\)/.test(enterpriseReadEditorSource) || !/ssl:\s*true/.test(enterpriseReadEditorSource)) {
  fail("不可见的连接限制应沿用原连接值或系统默认值，并固定启用 SSL");
}
const enterpriseEngineIds = Array.from(enterpriseEngineDefinitionSource.matchAll(/\bid:\s*"([^"]+)"/g), (match) => match[1]);
if (JSON.stringify(enterpriseEngineIds) !== JSON.stringify(["postgresql", "mysql", "sqlserver"]) || !["model-type-card", "model-type-card__icon", "<strong>", "esc(item.label)", "data-enterprise-engine-card", 'type="radio"', 'name="database-engine"', 'value="\' + item.id'].every((marker) => enterpriseEngineDefinitionSource.includes(marker)) || /<select[^>]*data-enterprise-field="databaseEngine"/.test(enterpriseEditorBodySource)) {
  fail("数据库类型应使用复用 model-type-card 的三张 radio 卡片，且仅提供 PostgreSQL、MySQL、SQL Server");
}
if (!/\[name="database-engine"\]:checked/.test(enterpriseReadEditorSource) || !/databaseEngine:\s*engineField\s*\?\s*engineField\.value/.test(enterpriseReadEditorSource)) {
  fail("企业连接保存数据应从选中的 database-engine radio 读取数据库类型");
}
if (/<small>|\bsummary:\s*|\bdescription:\s*|data-enterprise-engine-(?:description|port|title)|默认端口|分析库与只读副本|业务库与数据仓库|ERP 与运营数据库|(?:PostgreSQL|MySQL|SQL Server) 连接配置/.test(enterpriseEngineDefinitionSource + enterpriseEditorBodySource + enterpriseDraftControlSource)) {
  fail("数据库类型卡片应只显示图标和标题，连接配置区不应重复展示类型说明或默认端口");
}
if (!/engineInputs\.forEach[\s\S]*addEventListener\("change"[\s\S]*portInput\.value\s*=\s*actions\.enterpriseDefaultPort\(selectedEngine\(\)\)[\s\S]*updateEnginePresentation\(\)/.test(enterpriseDraftControlSource) || !/hostInput\.placeholder\s*=\s*meta\.hostPlaceholder/.test(enterpriseDraftControlSource) || /databasePlaceholder|database(?:Input|Select)\.placeholder/.test(enterpriseEngineDefinitionSource + enterpriseDraftControlSource)) {
  fail("数据库类型变化应继续自动填写端口并切换服务器提示，不应要求手填实际库名");
}
if (!/\[\"host\", \"port\", \"username\", \"password\"\]/.test(enterpriseDraftControlSource) || /\[\"host\", \"port\", \"databaseName\"/.test(enterpriseDraftControlSource) || !/databaseSelect\.disabled\s*=\s*true/.test(enterpriseDraftControlSource) || !/setDatabaseOptions\(result\.databases, payload\.databaseName\)/.test(enterpriseDraftControlSource) || !/databaseSelect\.addEventListener\("change"[\s\S]*syncConfirmState\(\)/.test(enterpriseDraftControlSource) || !/confirmButton\.disabled\s*=\s*!\(editor\.dataset\.enterpriseTested\s*===\s*"true"\s*&&\s*databaseSelect\.value\)/.test(enterpriseDraftControlSource)) {
  fail("连接参数变化应清空并禁用目标数据库；测试成功后加载列表，选中目标数据库后才允许确认");
}
if (/data-enterprise-draft-(?:test|result)/.test(enterpriseEditorBodySource) || !/\.dialog__footer[\s\S]*data-enterprise-draft-test[\s\S]*测试并获取数据库[\s\S]*data-enterprise-draft-result[\s\S]*(?:insertBefore|prepend|appendChild|append|insertAdjacentHTML)\s*\(/.test(enterpriseOpenEditorSource)) {
  fail("测试连接按钮与测试结果应移入创建/编辑弹窗 footer，并保持原 marker");
}
if (/selectedSchema|resourceIds|allowedResources|enterpriseSchemaCatalog|enterpriseResourceCatalog|data-enterprise-resource|授权范围|凭据引用/.test(enterprisePageSource + enterpriseActionsSource + enterpriseSeedSource)) {
  fail("接入数据库只应保存数据库级连接，不应保留 Schema、资源授权或旧凭据引用逻辑");
}
if (!/description:\s*value\("description"\)/.test(enterpriseReadEditorSource) || !/connection\.description\s*=\s*description/.test(enterpriseActionsSource) || /connection\.description\s*=\s*"通过 /.test(enterpriseActionsSource)) {
  fail("数据库描述应由用户填写并原样保存，不应由技术连接参数自动覆盖");
}
if (!/title:\s*connection\s*\?\s*"编辑数据库"\s*:\s*"接入数据库"/.test(enterpriseOpenEditorSource) || !/confirmLabel:\s*connection\s*\?\s*"保存修改"\s*:\s*"确认接入"/.test(enterpriseOpenEditorSource)) {
  fail("数据库接入与编辑弹窗应使用统一、直接的标题和确认动作");
}
if (!["data-search-service-create", "data-search-service-card", "data-search-service-edit", "data-search-service-test", "data-search-service-delete", "data-search-service-editor", "data-search-service-type-card", "data-search-service-field", "data-search-service-mapping", "data-search-service-draft-test", "data-search-service-draft-result"].every((marker) => dataAccessPage.includes(marker))) {
  fail("检索服务页面应提供接入、编辑、测试、删除与字段映射闭环");
}
if (!/data-search-service-test=[\s\S]*>测试<\/button>[\s\S]*data-search-service-edit=[\s\S]*>配置<\/button>[\s\S]*data-search-service-delete=[\s\S]*>删除<\/button>/.test(dataAccessPage)) {
  fail("检索服务卡片操作应统一为测试、配置、删除");
}
if (!/id:\s*"elasticsearch"[\s\S]*id:\s*"opensearch"[\s\S]*id:\s*"custom"/.test(dataAccessPage) || !/OpsDemo\.pages\.externalInformation\s*=\s*\{\s*render:\s*renderSearchServices,\s*mount:\s*mountSearchServices\s*\}/.test(dataAccessPage)) {
  fail("检索服务页应只预置 Elasticsearch、OpenSearch 与自定义接口三类入口");
}
if (!/服务地址[\s\S]*索引或别名[\s\S]*请求路径[\s\S]*鉴权方式[\s\S]*<details[^>]*search-service-advanced[\s\S]*结果字段映射/.test(dataAccessPage) || !/["']idField["'][\s\S]*["']titleField["'][\s\S]*["']contentField["']/.test(dataAccessPage)) {
  fail("检索服务编辑器应覆盖连接、鉴权和目标资源，并将标准结果字段映射折叠为高级配置");
}
if (!/title:\s*service\s*\?\s*"编辑检索服务"\s*:\s*"接入检索服务"/.test(dataAccessPage) || !/confirmLabel:\s*service\s*\?\s*"保存修改"\s*:\s*"确认接入"/.test(dataAccessPage) || !/data-search-service-draft-test[\s\S]*自动测试/.test(dataAccessPage)) {
  fail("检索服务应复用数据库接入的统一编辑弹窗与 footer 测试交互");
}
if (/data-search-service-field="testQuery"|请输入用于验证标准结果的测试问题/.test(dataAccessPage + actionsSource) || !/\.search-service-dialog\s*\{[\s\S]*max-height:\s*min\(760px, calc\(100vh - 48px\)\)/.test(pagesStyles)) {
  fail("检索服务自动测试不应要求用户输入问题，接入弹窗应限制在视口内滚动");
}
if (!/search-service-identity-fields[\s\S]*data-search-service-field="name"[\s\S]*data-search-service-field="description"/.test(dataAccessPage) || /search-service-description" class="textarea-field/.test(dataAccessPage)) {
  fail("检索服务名称与描述应使用同一行紧凑布局，保证收起的高级配置无需滚动即可出现");
}
if (!/existingPanel[\s\S]*existingPanel\.innerHTML\s*=\s*panelHtml/.test(overlaySource)) {
  fail("通用弹窗应在已有遮罩和容器内更新内容，避免多步操作反复进场闪烁");
}
if (!/function\s+preserveDuring/.test(overlaySource) || !/active\.onCancel[\s\S]*current\s*===\s*active/.test(overlaySource)) {
  fail("通用弹窗应支持同步更新期间保留容器，并避免旧弹窗事件关闭已切换的新内容");
}
if (!/function\s+focusableControls/.test(overlaySource) || !/event\.key\s*===\s*["']Tab["'][\s\S]*panel\.contains\(document\.activeElement\)[\s\S]*last\.focus\(\)[\s\S]*first\.focus\(\)/.test(overlaySource)) {
  fail("通用弹窗应将键盘焦点约束在对话框内");
}
const enterpriseActionNames = ["enterpriseDefaultPort", "testEnterpriseConnectionDraft", "saveEnterpriseConnection", "testEnterpriseConnection", "deleteEnterpriseConnection"];
const externalSearchServiceActionNames = ["externalSearchServiceMappingDefaults", "testExternalSearchServiceDraft", "saveExternalSearchService", "testExternalSearchService", "deleteExternalSearchService"];
if (![...enterpriseActionNames, ...externalSearchServiceActionNames].every((name) => new RegExp(`function\\s+${name}`).test(actionsSource)) || ![...enterpriseActionNames, ...externalSearchServiceActionNames].every((name) => new RegExp(`${name}:\\s*${name}`).test(actionsSource))) {
  fail("数据接入动作层应实现企业连接与检索服务的管理闭环");
}
if (!/function enterpriseDatabaseCatalog[\s\S]*postgresql:[\s\S]*mysql:[\s\S]*sqlserver:/.test(enterpriseActionsSource) || !/databases:\s*databases/.test(enterpriseActionsSource) || /if \(!databaseName\)[^\n]*请填写实际库名/.test(enterpriseActionsSource) || !/preflight\.databases\.indexOf\(databaseName\)\s*<\s*0/.test(enterpriseActionsSource)) {
  fail("连接测试应先发现三类数据库的可访问 DB 列表，保存时再校验用户选择的目标数据库");
}
if (/setEnterpriseConnectionEnabled|enterprise-connection-toggled|\.enabled\s*=/.test(enterpriseActionsSource) || /\benabled:\s*(?:true|false)/.test(enterpriseSeedSource)) {
  fail("企业数据的动作层和种子数据不应保留独立 enabled 状态轴");
}
if (!/username:\s*"[^"]+"/.test(enterpriseSeedSource) || !/passwordConfigured:\s*true/.test(enterpriseSeedSource) || /credentialMasked|credentialStatus|\bpassword:\s*"/.test(enterpriseSeedSource) || /connection\.(?:password|passwordMasked)\s*=/.test(enterpriseActionsSource)) {
  fail("企业数据库种子应保存用户名与密码已配置标记，不得保存明文或伪装后的密码字段");
}
const seededDatabaseConnections = Array.from(enterpriseSeedSource.matchAll(/connectionType:\s*"database"/g));
if (seededDatabaseConnections.length !== 3 || !["postgresql", "mysql", "sqlserver"].every((engine) => new RegExp(`databaseEngine:\\s*\"${engine}\"`).test(enterpriseSeedSource)) || /connectionType:\s*"(?:mcp|api|service)"|status:\s*"untested"/.test(enterpriseSeedSource)) {
  fail("企业连接种子应且仅应提供 PostgreSQL、MySQL、SQL Server 三类数据库连接，并保留 connectionType=database 兼容值");
}
if (!/id:\s*"CONNECTION-01"[\s\S]*id:\s*"connection-order-inventory"[\s\S]*version:\s*"v0\.5"/.test(enterpriseSeedSource)) {
  fail("数据库连接改造不得改变 CONNECTION-01 黄金案例运行绑定");
}
if (!/services:\s*\[[\s\S]*id:\s*"SEARCH-SERVICE-01"[\s\S]*serviceType:\s*"elasticsearch"[\s\S]*serviceType:\s*"opensearch"[\s\S]*serviceType:\s*"custom"/.test(externalSearchServiceSeedSource) || /\b(?:tags|sources):\s*\[/.test(externalSearchServiceSeedSource)) {
  fail("数据接入种子应仅提供 Elasticsearch、OpenSearch 与自定义接口三类检索服务 Mock");
}
if (/\b(?:credential|password|apiKey|token):\s*"/.test(externalSearchServiceSeedSource) || !/credentialConfigured:\s*true/.test(externalSearchServiceSeedSource)) {
  fail("检索服务种子只能记录访问凭证已配置状态，不得保存明文凭证");
}
if (/\.golden-case-trace/.test(pagesStyles + fs.readFileSync(path.join(demoRoot, "assets", "css", "responsive.css"), "utf8"))) {
  fail("样式表不应保留已删除的黄金案例追溯卡专用样式");
}
globalThis.addEventListener = globalThis.addEventListener || function addEventListenerStub() {};
globalThis.document = globalThis.document || { addEventListener: function addEventListenerStub() {} };
globalThis.location = { hash: "#/output-profiles/new" };
require(path.join(demoRoot, "src", "core", "router.js"));
const retiredOutputProfileRoute = globalThis.OpsDemo.core.router.parse();
if (retiredOutputProfileRoute.name !== "knowledge" || retiredOutputProfileRoute.page !== "knowledge" || retiredOutputProfileRoute.path !== "knowledge" || retiredOutputProfileRoute.id !== null) {
  fail("已下线的报告模板深链必须安全回到知识库首页，不能误入知识库新建页");
}
globalThis.location.hash = "#/definitions/new";
const retiredDefinitionRoute = globalThis.OpsDemo.core.router.parse();
if (retiredDefinitionRoute.name !== "knowledge" || retiredDefinitionRoute.page !== "knowledge" || retiredDefinitionRoute.path !== "knowledge" || retiredDefinitionRoute.id !== null) {
  fail("已移除的分析口径深链必须安全回到知识库首页，不能误入知识库新建页");
}

[
  ["导航", appSource],
  ["路由", routerSource],
  ["动作", actionsSource],
  ["种子数据", seedSource],
  ["样式", pagesStyles],
].forEach(([label, source]) => {
  if (/output-profiles|outputProfiles|OutputProfile|output_profile|data-profile-|data-report-template|report-template|chapter-editor|FLOW-OUTPUT-PUBLISH/.test(source)) {
    fail(`运营端${label}不应保留报告模板模块实现`);
  }
});

if (/analysisDefinitions|definitionIds|analysis_definition|createDefinition|updateDefinition|setDefinitionEnabled|deleteDefinition|data-definition-|definition-card|definition-editor/.test(sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n") + pagesStyles)) {
  fail("分析口径的数据、Skill 依赖、管理动作、配置记录回滚分支与专属样式应完整移除");
}

if (/tab=versions|知识版本/.test(knowledgePage)) {
  fail("知识库详情不应暴露版本页签或版本管理文案");
}
if (/tab=imports|>导入记录<\//.test(knowledgePage)) {
  fail("知识库详情不应保留导入记录页签、入口或历史台账文案");
}
if (!/data-kb-test/.test(knowledgePage) || !/data-kb-open/.test(knowledgePage) || !/data-kb-edit/.test(knowledgePage) || !/data-kb-delete/.test(knowledgePage) || !/data-kb-open[^>]*>\s*详情\s*</.test(knowledgePage)) {
  fail("知识库列表应提供测试、详情、编辑和删除四个操作，且不再使用“查看”命名");
}
if (!/knowledge-row-actions[^\n]*data-kb-open[^\n]*>详情<[^\n]*data-kb-edit[^\n]*>编辑<[^\n]*data-kb-test[^\n]*>测试<[^\n]*data-kb-delete[^\n]*>删除</.test(knowledgePage)) {
  fail("知识库列表操作应固定按详情、编辑、测试、删除排列");
}
if (/\btestReady\b|disabled:\s*!retrievalReady/.test(knowledgePage) || !/data-kb-delete[^\n]*item\.enabled[^\n]*disabled title="请先关闭检索再删除"/.test(knowledgePage)) {
  fail("知识库测试不应受检索开关限制，删除则必须先关闭检索");
}
if (!/<th>知识库名称 \/ ID<\/th><th>检索状态<\/th><th>文件数量<\/th><th>更新时间<\/th><th>创建时间<\/th><th>操作<\/th>/.test(knowledgePage)) {
  fail("知识库列表应将检索状态放在文件数量之前");
}
if (/访问等级|权限等级|access-level|kb-access/.test(knowledgePage)) {
  fail("知识库列表、详情和创建流程不应保留权限等级展示或配置");
}
const knowledgeEditSource = knowledgePage.slice(knowledgePage.indexOf("function editKnowledgeBase"), knowledgePage.indexOf("function confirmDeleteKnowledgeBase"));
if (!/data-edit-kb-name/.test(knowledgeEditSource) || !/data-edit-kb-purpose/.test(knowledgeEditSource) || /data-edit-kb-model|embeddingModelId|modelMigration|向量模型/.test(knowledgeEditSource)) {
  fail("编辑知识库只应保留名称与描述，不得暴露向量模型变更");
}
if (!/Object\.keys\(input\)\.some\([\s\S]*key !== "name" && key !== "purpose"/.test(actionsSource) || /changeKnowledgeBaseEmbeddingModel|knowledge-model-migration|model_migration/.test(actionsSource + fileProcessingSource)) {
  fail("知识库更新动作应仅接受名称和描述，并完整移除向量模型迁移功能");
}
if (/<th>描述<\/th>|knowledge-description/.test(knowledgePage)) {
  fail("知识库管理总览表格不应展示描述列");
}
if (!/data-kb-open="' \+ esc\(item\.id\) \+ '"[^>]*>' \+ esc\(item\.name\)/.test(knowledgePage)) {
  fail("知识库名称本身应可点击进入详情，不能只依赖操作列");
}
if (/knowledgeInfoItem\("检索状态"/.test(knowledgePage)) {
  fail("知识库概要不应重复展示与处理管线检索节点相同的检索状态");
}
if (!/data-document-preview/.test(knowledgePage) || !/data-document-delete/.test(knowledgePage) || !/data-preview-document-select/.test(knowledgePage) || !/data-chunk-add/.test(knowledgePage) || !/data-chunk-content/.test(knowledgePage)) {
  fail("知识库文件应提供可切换文件的源文档/切片预览、新增切片和删除闭环");
}
if (!/data-document-preview="' \+ esc\(item\.id\) \+ '"[^>]*>' \+ esc\(item\.name\)/.test(knowledgePage)) {
  fail("文件名称本身应可点击进入预览，不能只依赖操作列");
}
if (!/data-document-preview="' \+ esc\(item\.id\) \+ '"[^>]*>详情<\/button>/.test(knowledgePage) || />预览<\/button><button[^>]*data-document-delete/.test(knowledgePage)) {
  fail("知识库文件列表的行操作应统一命名为详情");
}
if (!/data-knowledge-content-tab="documents"/.test(knowledgePage) || !/data-knowledge-content-tab="chunks"/.test(knowledgePage)) {
  fail("知识库详情应保留文件／切片两个页签");
}
if (/data-quick-chunk-document-select|data-chunk-full-preview|knowledge-chunk-(?:quick|all|group)/.test(knowledgePage)) {
  fail("切片页签不应保留全库聚合、分组或快览视图");
}
if (!/function\s+addDocumentChunk/.test(actionsSource) || !/pending_embedding/.test(actionsSource + seedSource) || !/生成向量/.test(knowledgePage) || !/Embedding Token 消耗/.test(knowledgePage + actionsSource)) {
  fail("新增切片应进入待向量化，并在提交前明确提示生成向量与 Embedding Token 消耗");
}
if (!/function\s+startKnowledgeImport/.test(actionsSource) || !/function\s+confirmDocumentReplacement/.test(actionsSource) || !/operation:\s*operation/.test(actionsSource) || !/operation === "skip"/.test(actionsSource) || !/operation === "replace"/.test(actionsSource) || !/contentHash/.test(actionsSource)) {
  fail("重名导入应按内容指纹分流为 create/skip/replace，并提供显式替换确认动作");
}
if (!/内容相同，已跳过/.test(actionsSource) || !/replacement_staged/.test(actionsSource) || !/documentIdReused:\s*true/.test(actionsSource) || !/vectorRegeneration:\s*true/.test(actionsSource) || !/tokenConsumption:\s*true/.test(actionsSource) || !/indexUpdate:\s*true/.test(actionsSource)) {
  fail("同内容应直接跳过；不同内容替换应复用文件 ID 并记录向量、Token 与索引影响");
}
if (!/var preview = OpsDemo\.ui\.preview/.test(knowledgePage) || !/preview\.split\s*\(\{/.test(knowledgePage) || !/data-preview-document-select/.test(knowledgePage) || !/preview\.chunkCards/.test(knowledgePage) || !/function chunkCards/.test(previewUi)) {
  fail("源文档与切片预览应复用通用 Preview 组件，并支持切换文件和显示切片卡片");
}
const knowledgeChunkTabSource = knowledgePage.slice(knowledgePage.indexOf("function renderChunksTab"), knowledgePage.indexOf("function renderCreationSteps"));
const knowledgeDetailSource = knowledgePage.slice(knowledgePage.indexOf("function renderKnowledgeDetail"), knowledgePage.indexOf("function render(route"));
const documentPreviewTriggerSource = knowledgePage.slice(knowledgePage.indexOf('root.querySelectorAll("[data-document-preview]")'), knowledgePage.indexOf('root.querySelectorAll("[data-document-reprocess]")'));
const previewDocumentSelectSource = knowledgePage.slice(knowledgePage.indexOf('var previewDocumentSelect = root.querySelector("[data-preview-document-select]")'), knowledgePage.indexOf("preview.bindChunkCards(root)"));
if (!/route\.query\.tab === "chunks"/.test(knowledgeDetailSource) || !/route\.query\.preview/.test(knowledgeDetailSource) || !/renderDocumentsTab/.test(knowledgeDetailSource) || !/renderChunksTab/.test(knowledgeDetailSource)) {
  fail("知识库详情应在切片页签复用单文件对照预览，并兼容历史 preview 地址");
}
if (/data-preview-origin|from=chunks|returnsToChunks|\?preview=/.test(knowledgeChunkTabSource + documentPreviewTriggerSource + previewDocumentSelectSource) || !/\?tab=chunks&document=" \+ encodeURIComponent\(previewDocumentSelect\.value\)/.test(previewDocumentSelectSource) || !/\?tab=chunks&document=" \+ encodeURIComponent\(button\.dataset\.documentPreview\)/.test(documentPreviewTriggerSource)) {
  fail("文件名称、详情操作与预览选择器应统一导航到 ?tab=chunks&document=...，不再生成 preview 或 from=chunks 地址");
}
const importTaskPreviewSource = knowledgePage.slice(knowledgePage.indexOf("function openImportPreview"), knowledgePage.indexOf('root.querySelectorAll("[data-import-preview]")'));
if (/data-import-preview-tab="parse"|>解析结果<\/button>/.test(importTaskPreviewSource) || !/renderImportPreviewContent\(view\)/.test(importTaskPreviewSource)) {
  fail("导入任务预览只应展示原文件和切片，不应向用户暴露解析器中间结果");
}
const documentPreviewSource = knowledgeChunkTabSource + knowledgePage.slice(knowledgePage.indexOf("function renderChunkCards"), knowledgePage.indexOf("function renderDocumentSource"));
if (/data-preview-document-download|下载原文件/.test(documentPreviewSource) || !/全部切片（/.test(documentPreviewSource)) {
  fail("知识库切片页签不应提供下载操作，并应以“全部切片（N）”展示真实卡片数量");
}
if (/new Blob/.test(localDocumentsPage) || !/if \(!source\)[\s\S]*演示原文件未内置/.test(localDocumentsPage)) {
  fail("文档管理下载原文件只能使用真实上传二进制，预置资料缺少原文件时应提示而不得生成替代文本");
}
if (!/preview\.chunkCards/.test(documentPreviewSource) || !/data-chunk-preview-card/.test(previewUi) || !/data-chunk-expand[^>]*aria-label=/.test(previewUi) || !/dom\.icon\("chevron-down"/.test(previewUi) || !/dom\.icon\(expanded \? "chevron-up" : "chevron-down"/.test(previewUi) || !/is-expanded/.test(previewUi) || !/button\.setAttribute\("aria-expanded"/.test(previewUi) || !/button\.setAttribute\("aria-label"/.test(previewUi)) {
  fail("切片右下角展开图标应支持单张展开与再次点击，并同步图标、可访问名称和 aria-expanded");
}
if (!/data-chunk-metadata-trigger[^>]*aria-expanded="false"[^>]*aria-haspopup="dialog"[^>]*aria-controls=/.test(previewUi) || !/role="dialog" aria-modal="false" aria-labelledby=/.test(previewUi) || !/识别信息/.test(previewUi) || !/来源定位/.test(previewUi) || !/检索治理/.test(previewUi) || !/技术信息/.test(previewUi)) {
  fail("共享切片卡片应以可访问信息按钮打开四组非模态元数据浮层");
}
if (/file-asset-chunk__relations|<summary>来源与关系<\/summary>/.test(previewUi) || !/data-chunk-copy-id/.test(previewUi) || !/data-chunk-copy-all/.test(previewUi) || !/data-chunk-copy-feedback[^>]*role="status"[^>]*aria-live="polite"/.test(previewUi)) {
  fail("切片元数据不应继续占用卡片文档流，并应支持 Chunk ID 与全部信息复制反馈");
}
if (!/navigator\.clipboard\.writeText/.test(previewUi) || !/document\.execCommand\("copy"\)/.test(previewUi) || !/event\.key !== "Escape"/.test(previewUi) || !/closeOnOutsidePointer/.test(previewUi) || !/data-chunk-metadata-pinned/.test(previewUi)) {
  fail("切片信息浮层应支持点击固定、点击外部或 Escape 关闭，并提供剪贴板降级复制");
}
if (!/function\s+dismissChunkMetadata/.test(previewUi) || !/dismissChunkMetadata:\s*dismissChunkMetadata/.test(previewUi) || !/preview\.dismissChunkMetadata/.test(knowledgePage) || !/OpsDemo\.ui\.preview\.dismissChunkMetadata/.test(localDocumentsPage)) {
  fail("页面卸载时应关闭切片信息浮层，避免跨页面残留");
}
if (!/data-chunk-edit-trigger/.test(previewUi) || !/chunk-delete-trigger/.test(previewUi) || !/chunk-preview-card__tools/.test(previewUi) || !/var tools = metadataControl \+ editControl \+ removeControl/.test(previewUi) || !/dom\.icon\("pencil"/.test(previewUi) || !/dom\.icon\("trash-2"/.test(previewUi) || !/edit:\s*editable/.test(knowledgePage) || !/remove:\s*editable/.test(knowledgePage) || !/data-chunk-edit=/.test(knowledgePage) || !/data-chunk-delete=/.test(knowledgePage) || !/actions\.updateDocumentChunk/.test(knowledgePage)) {
  fail("可编辑知识库的共享切片卡片应在右上角按信息、编辑、删除排列图标，并保留原子更新动作");
}
if (!/renderChunkCards\(chunks\)/.test(localDocumentsPage) || /data-local-chunk-edit|data-local-chunk-context|data-local-chunk-metadata|data-local-chunk-delete/.test(localDocumentsPage)) {
  fail("知识库详情应暴露切片编辑入口，文档管理预览应保持只读");
}
if (!/data-chunk-delete=/.test(knowledgePage) || !/actions\.deleteDocumentChunk/.test(knowledgePage) || !/actions\.getRelatedChunkContext/.test(knowledgeContextSource) || /data-chunk-relation-edit=|function\s+openChunkRelationEditor|actions\.listRelatedChunkTargets|actions\.updateChunkRelations|id="chunk-reference/.test(knowledgePage + knowledgeContextSource) || /data-chunk-context=|data-chunk-metadata-edit=|function\s+openRelatedChunkContext|function\s+openChunkMetadataEditor|actions\.updateChunkMetadata|id="chunk-tags"|id="chunk-access"/.test(knowledgePage)) {
  fail("可写知识库应保留切片正文编辑与删除，但上下文关联只能由系统规则维护，不得提供人工编辑动作");
}
if (!/tags:\s*"标签"/.test(previewUi) || /hiddenMetadataKeys|accessLevel|upstreamAccessLevel|effectiveAccessLevel/.test(previewUi)) {
  fail("切片信息应保留解析生成的只读标签，且不应保留权限等级字段兼容逻辑");
}
if (/chunkInsertionFields|bindChunkInsertion|chunkInsertionValue|chunk-insertion-fields|data-chunk-insertion|relativeChunkId|insertionPosition/.test(previewUi + knowledgePage + pagesStyles + fileProcessingPage) || !/actions\.addDocumentChunk\(documentId, \{ content: content \}\)/.test(knowledgePage) || !/set\.chunks\.push\(changed\)/.test(fileProcessingPage)) {
  fail("新增切片不应暴露或保留插入位置能力，应固定追加到当前文档末尾");
}
if (!/document\.body\.appendChild\(elements\.popover\)/.test(previewUi) || !/getBoundingClientRect\(\)/.test(previewUi) || !/positionMetadataPopover/.test(previewUi) || !/window\.addEventListener\("resize", requestMetadataPosition\)/.test(previewUi) || !/document\.addEventListener\("scroll", requestMetadataPosition, true\)/.test(previewUi) || !/\.chunk-metadata-popover\s*\{[\s\S]*?position:\s*fixed/.test(pagesStyles)) {
  fail("切片信息浮层应通过 body 门户脱离预览区裁剪，并随触发器、视口和滚动实时定位");
}
if (!/suppressedMetadataFocusTrigger\s*=\s*elements\.trigger[\s\S]*elements\.trigger\.focus\(\{ preventScroll: true \}\)/.test(previewUi) || !/trigger === suppressedMetadataFocusTrigger[\s\S]*suppressedMetadataFocusTrigger = null;[\s\S]*return;/.test(previewUi)) {
  fail("关闭切片信息后应在焦点返回触发器时抑制一次 focusin，避免浮层立即重新打开");
}
if (!/route\.query\.view\s*===\s*"parsed"[\s\S]*view:\s*"chunks"[\s\S]*history\.replaceState\(null, "",[\s\S]*normalizedHash/.test(localDocumentsPage)) {
  fail("旧解析结果地址应原位替换为切片地址，避免浏览器后退循环");
}
if (/currentLocalSet\s*\|\|\s*state\.chunkSets\.find/.test(fileProcessingSource) || /currentParseResultId\)\s*\|\|\s*state\.parseResults\.find/.test(fileProcessingSource)) {
  fail("文档处理结果不得回退到任意知识库的解析或切片产物");
}
if (/if \(!target && created && created\.status !== "completed"\)[\s\S]*startImportParsing\(created\.id/.test(fileProcessingSource) || !/文件已登记到公共池，等待配置解析/.test(fileProcessingSource) || !/if \(!batch\.knowledgeBaseId\) return null;/.test(fileProcessingSource) || !/function\s+completeLocalParsing[\s\S]*item\.pipeline = \["receive", "parse"\]/.test(fileProcessingSource) || /asset\.currentChunkSetId = item\.chunkSetId/.test(fileProcessingSource)) {
  fail("公共池上传应先登记并等待复用解析步骤显式提交，解析后结束且不得保存公共池切片指针");
}
if (!/if \(isLocalDocumentFlow\) steps = \[[\s\S]*\["file-up", "上传", "选择原文件"\][\s\S]*\["scan-text", "解析", "提取文档内容"\][\s\S]*\];/.test(knowledgePage) || /\["archive", "登记", "写入公共池"\]|\["circle-check", "完成", "可供知识库选择"\]/.test(knowledgePage) || !/renderCreationSteps\(kb\.isLocalDocumentFlow \? 2 : 3, kb\.isLocalDocumentFlow\)/.test(knowledgePage) || !/parseConfigFields\(kb\)[\s\S]*data-parse-next/.test(knowledgePage) || !/router\.navigate\(importStepRoute\(route\.id, "parse", batch\.id, !localUpload\)\)/.test(knowledgePage) || /renderLocalUploadProgress|data-local-upload-progress|local-upload-progress|data-local-upload-done|data-local-upload-retry|上传并解析/.test(knowledgePage + documentsStyles) || /完成后保存原文件与切片|切块结果将保存到文档管理/.test(knowledgePage)) {
  fail("文档管理上传应直接复用第 3 步解析内容且只呈现上传、解析两步，不得保留专用完成页、状态动效或切片配置");
}
if (/chunk-preview-list__summary|代表切片/.test(documentPreviewSource)) {
  fail("文件预览不得用代表切片汇总掩盖实际渲染数量");
}
if (!/confirmDocumentReplacement/.test(actionsSource + fileProcessingSource) || !/所选文件已经加入/.test(knowledgePage) || !/更新会保留稳定文档 ID/.test(knowledgePage) || !/重新处理受影响知识库/.test(knowledgePage) || !/Embedding Token 消耗/.test(knowledgePage) || !/新结果切换前继续使用原有检索结果/.test(knowledgePage) || /确认替换文件版本|所选文件版本已加入|仅更新当前知识库的引用及检索内容/.test(knowledgePage)) {
  fail("导入界面应继续处理重复文件和异内容更新，底层替换能力不得随详情任务板块移除");
}
if (!/function\s+uploadIdentityConflicts\(\)[\s\S]*current\.fileAssets[\s\S]*asset\.latestVersionId/.test(knowledgePage) || !/发现同名但内容不同的文档/.test(knowledgePage) || !/confirmLabel:\s*"更新原文档"/.test(knowledgePage) || !/cancelLabel:\s*"作为新文档"/.test(knowledgePage) || !/candidate\.identityDecision = "create_new"/.test(knowledgePage) || !/candidate\.targetFileId/.test(knowledgePage) || /route\.id === "local-documents"\) return \[\]/.test(knowledgePage)) {
  fail("文档管理与知识库上传都应按当前文档中心识别同名异内容，并逐候选选择更新原文档或作为新文档");
}
if (!/identityDecision:\s*source\.identityDecision/.test(actionsSource) || !/targetFileId:\s*source\.targetFileId/.test(actionsSource) || !/candidate\.identityDecision \|\| input\.identityDecision/.test(fileProcessingSource) || !/candidate\.targetFileId/.test(fileProcessingSource)) {
  fail("逐候选文档身份选择必须从上传候选透传到文件处理层，不能让批量选择互相污染");
}
if (!/function\s+requiredLabel/.test(domSource) || !/form-label--required/.test(domSource) || !/form-required-mark/.test(domSource) || !/aria-hidden="true">\*/.test(domSource) || !/\.form-required-mark\s*\{[\s\S]*?color:\s*var\(--danger\)/.test(componentsStyles)) {
  fail("所有必填项应复用 requiredLabel 与统一红色星号，不在页面中自行拼接");
}
if (/RAG 模型台账|服务信息边界|引用配置|查看引用|模型 ID|版本 \/ 规格|服务来源/.test(modelsPage)) {
  fail("模型管理不应展示版本、内部 ID、服务来源或引用关系等技术台账信息");
}
if (/model-summary/.test(modelsPage + pagesStyles)) {
  fail("模型名称下方不应保留预览说明小字或其专属样式");
}
if (!/data-model-group="' \+ group\.kind \+ '"/.test(modelsPage) || !/LLM 模型/.test(modelsPage) || !/向量模型/.test(modelsPage) || !/Rerank 模型/.test(modelsPage) || /kind:\s*"parser"|文档解析服务（非模型）/.test(modelsPage)) {
  fail("模型管理应将 LLM、向量模型与 Rerank 模型分为三个独立表格板块");
}
if (!/<th>连接状态<\/th>/.test(modelsPage) || /<th>状态<\/th>|<th>最近测试<\/th>/.test(modelsPage)) {
  fail("模型列表应将状态和最近测试合并为单一“连接状态”列");
}
if (!/var columns = '<colgroup><col class="models-table__col models-table__col--name"><col class="models-table__col models-table__col--dimension"><col class="models-table__col models-table__col--connection"><col class="models-table__col models-table__col--actions"><\/colgroup>'/.test(modelsPage) || !/var metricHeader = group\.kind === "embedding" \? "向量维度" : group\.kind === "llm" \? "参数规模" : ""/.test(modelsPage) || !/: '<td class="models-table__dimension" aria-label="不适用"><\/td>'/.test(modelsPage) || !/[?]\s*'<td class="models-table__dimension"><div class="table-primary">' \+ dom\.escape\(parameterScale\(model\)\)/.test(modelsPage) || !["name", "dimension", "connection", "actions"].every((column) => new RegExp(`\\.models-table__col--${column}\\s*\\{[\\s\\S]*?width:\\s*\\d+%`).test(pagesStyles)) || /\.models-table--embedding\s+(?:th|td):nth-child/.test(pagesStyles)) {
  fail("LLM、向量与 Rerank 表应复用同一四列宽度契约，第二列按类型展示参数规模或向量维度");
}
if (/[\s'\"]data-model-view/.test(modelsPage) || !/[\s'\"]data-model-test/.test(modelsPage) || !/[\s'\"]data-model-edit/.test(modelsPage) || !/[\s'\"]data-model-delete/.test(modelsPage)) {
  fail("模型列表应仅提供测试、编辑和删除动作，不再重复提供查看");
}
if (!/class="model-editor"/.test(modelsPage) || !/title:\s*current\s*\?\s*"编辑模型"\s*:\s*"新增模型"/.test(modelsPage) || /模型详情/.test(modelsPage)) {
  fail("新增与编辑应复用同一弹窗表单，不再保留独立详情弹窗");
}
if ((modelsPage.match(/data-model-kind-card/g) || []).length < 3 || !/name="model-kind" value="llm"/.test(modelsPage) || !/name="model-kind" value="embedding"/.test(modelsPage) || !/name="model-kind" value="reranker"/.test(modelsPage) || /name="model-kind" value="parser"/.test(modelsPage)) {
  fail("新增模型时应使用三张卡片选择 LLM、向量模型或 Rerank 模型");
}
if (!/model-editor__primary-row' \+ \(kind === "embedding" \|\| kind === "llm" \? " has-metric" : ""\)/.test(modelsPage) || !/primaryRow\.classList\.toggle\("has-metric", isEmbedding \|\| isLlm\)/.test(modelsPage) || !/\.model-editor__primary-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/.test(pagesStyles) || !/\.model-editor__primary-row\.has-metric\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 158px/.test(pagesStyles) || !/data-model-dimension-field aria-hidden="' \+ \(kind === "embedding" \? "false" : "true"\)/.test(modelsPage) || !/id="model-dimension"[^>]*readonly data-model-field="dimension"/.test(modelsPage) || !/data-model-parameter-field[\s\S]*id="model-parameters"[^>]*min="25"[^>]*data-model-field="parameterCountB"/.test(modelsPage) || /placeholder="[^"]*(?:连接|测试)[^"]*(?:读取|出现)[^"]*"|is-placeholder/.test(modelsPage)) {
  fail("模型名称应按类型自适应占满或让位；向量维度只读，LLM 总参数量不得低于 25B");
}
if (!/data-model-field="endpoint"/.test(modelsPage) || !/data-model-field="apiKey"/.test(modelsPage) || /data-model-field="(?:credentialRef|temperature|maxOutputTokens)"/.test(modelsPage) || /鉴权方式|请求超时|规格或用途|Rerank 能力/.test(modelsPage)) {
  fail("模型接入表单只应管理 API 地址与 API Key，不展示 LLM 运行参数、鉴权方式、超时或 Rerank 用途");
}
if (!/data-model-draft-test/.test(modelsPage) || !/invoke\("testRagModelDraft"/.test(modelsPage) || !/invoke\("saveRagModel"/.test(modelsPage)) {
  fail("模型弹窗应支持手动测试当前输入，保存时由 saveRagModel 自动复测后再落库");
}
if (!/footer\.classList\.add\("model-editor__footer"\)/.test(modelsPage) || !/footer\.insertBefore\(testGroup/.test(modelsPage)) {
  fail("模型连接测试应与取消、保存共同放置在弹窗底部操作区");
}
if (!/function\s+saveRagModel/.test(actionsSource) || !/function\s+testRagModelDraft/.test(actionsSource) || !/function\s+testRagModelConnection/.test(actionsSource) || !/function\s+deleteRagModel/.test(actionsSource)) {
  fail("模型动作层应提供保存自动测试、草稿测试、列表快捷测试和删除闭环");
}
if (!/connectionStatus/.test(actionsSource) || !/connectionStatusLabel/.test(actionsSource) || !/lastTestAt/.test(actionsSource) || !/endpoint/.test(actionsSource) || !/apiKeyMasked/.test(actionsSource)) {
  fail("模型动作层应使用统一的连接状态与脱敏 API 配置字段");
}
if (!/function\s+ragModelUsageFromState[\s\S]*boundEmbeddingModelId\s*===\s*id[\s\S]*generation\.modelId\s*===\s*id[\s\S]*operator\.rerankEnabled\s*&&\s*operator\.rerankerModelId\s*===\s*id/.test(actionsSource) || !/ragModelUsageFromState\(state, kind, id\)\.length/.test(actionsSource)) {
  fail("删除模型前必须阻断知识库、默认回答生成或全局检索设置正在使用的模型");
}
if (!/actions:\s*dom\.button\("新增模型"/.test(modelsPage) || !/toolbar:\s*\{\s*search:/.test(modelsPage) || /filters:/.test(modelsPage.slice(modelsPage.indexOf("function render"), modelsPage.indexOf("function applySearch")))) {
  fail("模型管理页头只应在右侧保留搜索和新增模型，不再提供类型/状态筛选");
}
if (/src\/pages\/prompt-strategy\.js/.test(indexHtml) || /Prompt 与策略|prompt-strategy|promptStrategy/.test(appSource + routerSource)) {
  fail("运营端不应加载未授权的 Prompt 与策略页面、导航或路由");
}
if (/金额|费用|人民币|estimatedCost|formatCurrency|\u00a5/.test(consumptionPage)) {
  fail("消耗统计页不应展示或聚合金额、费用与币种口径");
}
const consumptionSeedStart = seedSource.indexOf("\n    consumption:");
const consumptionSeedSource = seedSource.slice(consumptionSeedStart, seedSource.indexOf("\n    configurationRecords:", consumptionSeedStart));
if (/estimatedCost|costCny|消耗金额/.test(consumptionSeedSource + actionsSource + fs.readFileSync(path.join(demoRoot, "src", "core", "selectors.js"), "utf8"))) {
  fail("消耗数据种子、动作层和选择器不应保留金额字段");
}
const consumptionRenderSource = consumptionPage.slice(consumptionPage.indexOf("function renderConsumption"), consumptionPage.indexOf("function rerender"));
const tokenPanelSource = consumptionPage.slice(consumptionPage.indexOf("function renderTokenPanel"), consumptionPage.indexOf("function renderRequestPanel"));
const requestPanelSource = consumptionPage.slice(consumptionPage.indexOf("function renderRequestPanel"), consumptionPage.indexOf("function renderRangeControl"));
const tokenSummaryLabels = Array.from(tokenPanelSource.matchAll(/summaryCell\("([^"]+)"/g), (match) => match[1]);
const requestSummaryLabels = Array.from(requestPanelSource.matchAll(/summaryCell\("([^"]+)"/g), (match) => match[1]);
if (JSON.stringify(tokenSummaryLabels) !== JSON.stringify(["Token 总量", "输入 Token", "输出 Token"]) || JSON.stringify(requestSummaryLabels) !== JSON.stringify(["API 请求次数", "日均请求次数", "单日峰值"]) || /推理调用次数/.test(consumptionRenderSource)) {
  fail("消耗统计应在 Token 与 API 请求页签中分别展示各自的三项摘要");
}
if (!/METRIC_TABS\s*=\s*\[[\s\S]*key:\s*"tokens"[\s\S]*key:\s*"requests"/.test(consumptionPage) || !/role="tablist" aria-label="消耗统计类型"/.test(consumptionPage) || !/data-consumption-tab=/.test(consumptionPage) || !/metric === "requests" \? renderRequestPanel/.test(consumptionRenderSource)) {
  fail("消耗统计应用 Token 消耗与 API 请求次数两个页签分离展示");
}
if (!/data-consumption-model/.test(consumptionPage) || !/全部模型/.test(consumptionPage) || !/dailyForModel/.test(consumptionPage) || !/usageRatio/.test(consumptionSeedSource) || !/model\.kind === "llm" \|\| model\.type === "llm" \|\| model\.typeLabel === "生成模型"/.test(consumptionPage) || /model\.name \+ \(model\.typeLabel/.test(consumptionPage)) {
  fail("消耗统计应只提供全部/单个 LLM 筛选，选项只显示模型名称并共用模型级聚合数据");
}
if (!/data-consumption-token/.test(consumptionPage) || !/data-consumption-request/.test(consumptionPage) || !/stack:\s*"token"/.test(consumptionPage) || !/<h2 class="panel__title">Token 消耗<\/h2>/.test(tokenPanelSource) || !/<h2 class="panel__title">API 请求次数<\/h2>/.test(requestPanelSource) || /dom\.escape\(range\.label\) \+ ' (?:Token 消耗|API 请求)/.test(consumptionPage)) {
  fail("两个消耗页签应分别以固定标题展示 Token 堆叠柱状图和 API 请求次数折线图");
}
if (!/role="group" aria-label="自定义日期范围"/.test(consumptionPage) || !/data-consumption-start/.test(consumptionPage) || !/data-consumption-end/.test(consumptionPage) || !/addEventListener\("change"/.test(consumptionPage) || /data-consumption-apply/.test(consumptionPage)) {
  fail("自定义日期应使用单一组合框，并在选择日期后直接生效，不保留应用按钮");
}
if (!/"today"[\s\S]*"yesterday"[\s\S]*"last7"[\s\S]*"last30"[\s\S]*"week"[\s\S]*"month"[\s\S]*"custom"/.test(consumptionPage) || /每日明细/.test(consumptionPage)) {
  fail("消耗统计应保留全部时间范围并不提供每日明细表");
}

const creationStepLabels = ["定义知识库", "导入文件", "文档解析", "文档处理"];
const knowledgeCreationStepCalls = [1, 2, 4].every((step) => new RegExp(`renderCreationSteps\\(${step}(?:,|\\))`).test(knowledgePage)) && /renderCreationSteps\(kb\.isLocalDocumentFlow \? 2 : 3, kb\.isLocalDocumentFlow\)/.test(knowledgePage);
if (!creationStepLabels.every((label) => knowledgePage.includes(label)) || !knowledgeCreationStepCalls) {
  fail("知识库创建应提供四个全页步骤并共用唯一进度组件");
}
if (!/creation-model-row[\s\S]*kb-vector[\s\S]*kb-vector-dimension/.test(knowledgePage) || !/data-create-cancel/.test(knowledgePage) || !/data-create-only/.test(knowledgePage) || !/data-create-and-import/.test(knowledgePage)) {
  fail("定义知识库应包含模型/维度并列行以及取消、仅创建、创建并导入三个动作");
}
if (!/id="kb-vector-dimension" class="field field--static"/.test(knowledgePage) || !/\.field--static\s*\{[^}]*color:\s*var\(--text(?:-2)?\)/.test(pagesStyles) || /\.field--static\s*\{[^}]*color:\s*var\(--muted\)/.test(pagesStyles)) {
  fail("知识库向量维度虽然只读，文字颜色仍应与其他表单值保持一致");
}
if (!/modelCatalog[\s\S]*embeddingModels[\s\S]*model\.status === "available"/.test(knowledgePage) || !/embeddingModelId:\s*vectorSelect\.value/.test(knowledgePage)) {
  fail("定义知识库的向量模型应直接来自可用模型目录并独立写入创建动作");
}
const createKnowledgeSource = knowledgePage.slice(knowledgePage.indexOf("function vectorModelOptions"), knowledgePage.indexOf("function renderKnowledgeUpload"));
if (!/id="kb-name"[^>]*placeholder="请输入知识库名称"[^>]*\/>/.test(createKnowledgeSource) || /id="kb-name"[^>]*\bvalue=/.test(createKnowledgeSource) || !/id="kb-purpose"[^>]*placeholder=/.test(createKnowledgeSource) || /id="kb-purpose"[^>]*>[^<]+<\/textarea>/.test(createKnowledgeSource)) {
  fail("新建知识库第 1 步的名称和描述必须为空，仅提供占位提示");
}
if (!/<option value="" selected disabled>请选择向量模型<\/option>/.test(createKnowledgeSource) || /models\.map[\s\S]*index === 0 \? " selected"/.test(createKnowledgeSource)) {
  fail("新建知识库第 1 步的向量模型不得预选默认值");
}
if (!/type="file"[^>]*multiple[^>]*accept=/.test(knowledgePage) || !/addEventListener\("drop"/.test(knowledgePage) || !/upload-file-row__icon[\s\S]*upload-file-row__name[\s\S]*upload-file-row__status[\s\S]*data-upload-remove/.test(knowledgePage)) {
  fail("导入步骤应支持多选/拖放，并生成含格式图标、名称、状态和删除动作的逐文件行");
}
if (!/status:\s*"preparing"/.test(knowledgePage) || !/prepareUploadFiles/.test(knowledgePage) || !/entry\.status = entry\.candidate \? "prepared" : "error"/.test(knowledgePage) || !/syncSelectionUi/.test(knowledgePage)) {
  fail("选择文件后应读取内容并准备真实摘要，再通过共享选择状态控制下一步");
}
if (!/class="import-source-toolbar"[\s\S]*class="import-source-tabs"[\s\S]*data-import-source-tab="upload"[\s\S]*data-import-source-tab="assets"[\s\S]*data-import-source-tab="enterprise"[\s\S]*data-import-resource-search/.test(knowledgePage) || /data-import-upload-mode|<h2 data-import-resource-title>/.test(knowledgePage) || !/data-import-file-preview/.test(knowledgePage) || !/data-import-enterprise-preview/.test(knowledgePage)) {
  fail("导入步骤应将上传文件作为首个来源页签、保留列表搜索，并为每行资料提供快速预览");
}
if (!/class="document-directory-browser import-directory-browser"[\s\S]*data-import-local-directory[\s\S]*data-import-local-directory-list[\s\S]*data-import-enterprise-directory[\s\S]*data-import-enterprise-directory-list[\s\S]*class="table-wrap"/.test(knowledgePage) || /enterprise-source-directory__heading|data-import-enterprise-location|enterprise-source-location|enterprise-source-browser/.test(knowledgePage + pagesStyles) || !/function\s+enterpriseDirectories/.test(knowledgePage) || !/selection\.localFolderId/.test(knowledgePage) || !/selection\.enterpriseDirectoryId/.test(knowledgePage) || !/directoryTree\.includesFolder\(enterpriseFolders, source\.directoryId, selection\.enterpriseDirectoryId/.test(knowledgePage) || !/directoryTree\.includesFolder\(localFolders\(current\), asset\.folderId, selection\.localFolderId/.test(knowledgePage) || (knowledgePage.match(/scope:\s*"knowledge-(?:local|enterprise)"[\s\S]{0,260}?showItems:\s*false/g) || []).length !== 2) {
  fail("知识库文件选择应复用文档管理目录树，企业数据应以独立树模型复用相同样式");
}
if (!/data-import-directory-path/.test(knowledgePage) || !/directoryTree\.breadcrumb\(\{[\s\S]*rootLabel:\s*enterprise \? "全部企业数据" : "全部文档"/.test(knowledgePage)) {
  fail("知识库资料目录应展示数据库到文件夹的完整路径，文件统一在右侧列表展示");
}
if (!/fileName:\s*name \+ "\.csv"/.test(fileProcessingPage) || !/directoryId:\s*"ENT-DIR-" \+ connection\.id/.test(fileProcessingPage) || !/directoryPath:\s*\(connection\.databaseName \|\| connection\.name\) \+ "\/"/.test(fileProcessingPage) || !/sourceDirectoryPath:\s*source\.directoryPath/.test(fileProcessingPage) || !/directoryPath:\s*candidate\.sourceDirectoryPath/.test(fileProcessingPage)) {
  fail("企业数据快照应保留文件名、数据库目录及入库后的目录来源元数据");
}
const importChoicePreviewSource = knowledgePage.slice(knowledgePage.indexOf("function openImportChoicePreview"), knowledgePage.indexOf("function renderImportResult"));
const importChoicePreviewBinding = knowledgePage.slice(knowledgePage.indexOf('root.addEventListener("click", function previewImportResource'), knowledgePage.indexOf('root.addEventListener("change", function selectExisting'));
if (!/kind:\s*"dialog"/.test(importChoicePreviewSource) || /kind:\s*"drawer"/.test(importChoicePreviewSource) || !/panelClass:\s*"import-choice-preview-dialog"/.test(importChoicePreviewSource) || !/title:\s*title/.test(importChoicePreviewSource) || !/headerActions:[\s\S]*import-choice-preview-dialog__size/.test(importChoicePreviewSource) || !/onCancel:[\s\S]*trigger\.focus\(\)/.test(importChoicePreviewSource) || (importChoicePreviewBinding.match(/openImportChoicePreview\(/g) || []).length !== 2 || /import-choice-preview__meta/.test(importChoicePreviewBinding) || !/\.import-choice-preview-dialog \.dialog__body\s*\{[^}]*height:\s*min\(62vh, 620px\)[^}]*overflow:\s*auto/.test(pagesStyles)) {
  fail("资料选择的文档与企业数据预览应以文件名和大小作为居中弹窗标题，正文可滚动，关闭后恢复行操作焦点");
}
const uploadStepSource = knowledgePage.slice(knowledgePage.indexOf("function renderKnowledgeUpload"), knowledgePage.indexOf("function importStatusLabel"));
if (!/<colgroup>[\s\S]*import-resource-table__col-name[\s\S]*import-resource-table__col-size[\s\S]*import-resource-table__col-status/.test(uploadStepSource) || /import-resource-table__col-source|<th>来源<\/th>|<th>操作<\/th>/.test(uploadStepSource) || !/<th>名称<\/th>[\s\S]*<th>大小<\/th>[\s\S]*<th>状态<\/th>[\s\S]*<th>更新时间<\/th>[\s\S]*import-resource-table__action-heading/.test(uploadStepSource) || !/\.import-resource-table\s*\{[^}]*table-layout:\s*fixed/.test(pagesStyles)) {
  fail("文档管理与企业数据页签应复用固定列宽表格，并统一使用大小和状态列");
}
if (!/importChoicePreviewButton/.test(knowledgePage) || !/dom\.icon\("eye",\s*15\)/.test(knowledgePage) || !/import-resource-preview-action/.test(knowledgePage) || /data-import-(?:file|enterprise)-preview[^>]*>预览<\/button>/.test(knowledgePage)) {
  fail("资料选择列表的预览动作应以眼睛图标轻量呈现，不能保留可见文字按钮");
}
if (!/fileSizeBytes:[\s\S]*fileSizeLabel:/.test(fileProcessingPage) || /number\(source\.rowCount \|\| 0\) \+ ' 行'/.test(knowledgePage)) {
  fail("企业数据应按文件快照大小展示，不再以行数替代文件大小");
}
if (/name="parse-effort"|解析精细度/.test(knowledgePage)) {
  fail("MinerU 解析模式应由识别内容自动派生，不再暴露精细度选择");
}
if (!/value="auto"/.test(knowledgePage) || !/value="txt"/.test(knowledgePage) || !/value="ocr"/.test(knowledgePage) || !["parse-text-content", "parse-layout-structure", "parse-table", "parse-formula", "parse-visual-understanding"].every((id) => knowledgePage.includes(id))) {
  fail("MinerU 解析步骤应覆盖解析方法、必选基础内容与可选增强内容");
}
if (!/data-parse-back/.test(knowledgePage) || !/actions\.cancelImportProcessing\(currentBatch\.id\)/.test(knowledgePage) || !/importSelectionFromBatch/.test(knowledgePage)) {
  fail("解析步骤返回资料选择时应恢复选择并取消旧异步批次");
}
if (!/文字提取方式[\s\S]*自动判断（推荐）[\s\S]*优先原生文本[\s\S]*全文 OCR[\s\S]*扫描型、图片型 PDF 或文字层异常时自动使用 OCR/.test(knowledgePage)) {
  fail("文档解析应明确自动判断优先原生文本，并在扫描型或文字层异常时使用 OCR");
}
if (!/requiredParseOutput\("parse-text-content"[\s\S]*requiredParseOutput\("parse-layout-structure"/.test(knowledgePage) || !/type="checkbox" checked disabled aria-label=/.test(knowledgePage)) {
  fail("文本内容与版面结构必须以高对比的必选只读项呈现");
}
if (!/parseVisualUnderstanding[\s\S]*data-parse-mode-status[\s\S]*精细解析 · VLM 已开启/.test(knowledgePage) || !/imageAnalysisEnabled:\s*imageAnalysisEnabled/.test(knowledgePage)) {
  fail("合并的图片\/图表内容理解开关应驱动被动解析模式状态并提交 Image Analysis");
}
if (/parse-return-images|parse-addon-title|附加输出|保留原图|querySelector\("#parse-return-images"\)/.test(knowledgePage)) {
  fail("原图保存应由系统固定处理，不得在文档解析页面暴露选项");
}
if (/保留结构化内容列表|保留页 \/ 块定位|parse-image-understanding|parse-chart-understanding/.test(knowledgePage)) {
  fail("解析页面不应继续暴露旧结构化列表、页块定位或拆分的图片\/图表理解开关");
}
if (!/next\.textContentEnabled = true[\s\S]*next\.layoutStructureEnabled = true[\s\S]*next\.returnContentList = true[\s\S]*next\.preserveLocators = true[\s\S]*next\.returnImages = true/.test(actionsSource) || !/next\.imageAnalysisEnabled = visualUnderstanding[\s\S]*next\.effort = visualUnderstanding \? "high" : "medium"/.test(actionsSource)) {
  fail("动作层必须固定基础产物与原图保存，并双向派生 VLM 与解析模式");
}
if (!/function\s+renderKnowledgeParseSettings/.test(knowledgePage) || !/data-mineru-detail/.test(knowledgePage) || !/data-mineru-edit/.test(knowledgePage) || !/data-parse-settings-save/.test(knowledgePage) || !/route\.query\.settings === "parse"/.test(knowledgePage)) {
  fail("知识库详情应支持查看 MinerU 当前配置，并进入知识库内全页编辑后续导入解析策略");
}
const parseStepSource = knowledgePage.slice(knowledgePage.indexOf("function renderKnowledgeParse"), knowledgePage.indexOf("function availableProcessingProfiles"));
if (/目标切片|重叠 Token|分隔符/.test(parseStepSource)) {
  fail("MinerU 文档解析步骤不应混入切片策略参数");
}
if (/endpoint|parse-location|data-remote|id="parse-remote/.test(parseStepSource)) {
  fail("MinerU 文档解析步骤应固定本地执行，不暴露 endpoint 或远程上传开关");
}
const processingStepSource = knowledgePage.slice(knowledgePage.indexOf("function availableProcessingProfiles"), knowledgePage.indexOf("function renderChunkCards"));
if (![
  /function\s+createProcessingDraft/,
  /group:\s*"processing-family"/,
  /group:\s*"processing-method"/,
  /data-processing-param="maxChars"/,
  /data-processing-param="overlapPercent"/,
  /父子块检索/,
  /data-processing-param="parentChildEnabled"/,
  /高级配置/,
  /表格解析内容进入索引/,
  /advancedIndexToggle\("tableText", "表格解析内容进入索引", "将表格中的金额、指标、表头和单位用于检索与回答证据召回。"/,
  /公式解析内容进入索引/,
  /advancedIndexToggle\("formulaText", "公式解析内容进入索引", "将公式符号、LaTeX 表达和公式位置用于专业术语、参数和推导检索。"/,
  /图片 \/ 图表内容理解进入索引/,
  /advancedIndexToggle\("imageText", "图片 \/ 图表内容理解进入索引", "将图像、图表、图中文字和结构化描述用于跨模态内容召回。"/,
  /processingParseAvailability/,
  /syncProcessingDraftParseAvailability/
].every((pattern) => pattern.test(processingStepSource))) {
  fail("文档处理必须只在知识库导入流程中完整保留策略选择与本次参数编辑");
}
if (/以下解析内容不会进入索引|第 3 步未勾选|暂无可进入索引的解析产物|<span class="tag">(?:不适用|上下文增强)<\/span>|processing-strategy-note|semantic-cost-notice|processing-profile-card__meta/.test(processingStepSource) || /\.processing-context-option:not\(:has\(input:checked\)\) \.processing-parent-child-flow|\.processing-parent-child-flow (?:strong|small)/.test(pagesStyles)) {
  fail("文档处理页不应展示独立策略提示、解析兼容性提示或父子块特殊标签，父子块说明行也必须常驻且样式统一");
}
if (/处理策略摘要|data-processing-param="contextPolicy"|保守 · 只保留来源定位/.test(processingStepSource)) {
  fail("文档处理页不得展示处理策略摘要或允许低于系统底线的上下文策略");
}
if (!["smart", "semantic", "structure", "separator", "fixed", "page", "whole_document"].every((mode) => processingStepSource.includes(mode)) || !/data-processing-separator-picker/.test(processingStepSource) || !/data-processing-param="separatorType"/.test(processingStepSource) || !/data-processing-param="pagesPerChunk"/.test(processingStepSource) || !/data-processing-param="semanticSensitivity"/.test(processingStepSource)) {
  fail("流程内文档处理应完整覆盖自动、语义及自定义下的结构、分隔符、固定长度、按页和整篇方案");
}
if (!processingStepSource.includes("依次按解析结构、逐级边界与长度上限生成切片，不调用语义模型。") || !processingStepSource.includes("比较相邻句段的语义变化，在主题切换处生成边界；效果需用真实问题集验证，入库会增加句段 Embedding 消耗。") || !processingStepSource.includes("依据解析得到的标题、段落、列表和表格等结构切分；超长内容块仍按长度上限拆分。")) {
  fail("自动、语义和结构切片的必要机制说明应直接融入对应选项卡片");
}
if (!/<option value="low"[\s\S]*>低<\/option><option value="balanced"[\s\S]*>均衡<\/option><option value="high"[\s\S]*>高<\/option>[\s\S]*低：较少切分；均衡：推荐；高：较多切分/.test(processingStepSource) || /低 · 较少切分|均衡 · 推荐|高 · 较多切分/.test(processingStepSource)) {
  fail("语义敏感度下拉应只显示低、均衡、高，并在灰色说明行解释各档差异");
}
if (/renderImportProgress\(kb\.importBatchId\)|renderInlineParsePanel\(kb\.importBatchId\)/.test(processingStepSource) || !/overlay\.toast\("解析已开始"/.test(knowledgePage)) {
  fail("文档处理步骤应专注配置，不展示解析状态或结果；解析从上一步提交时给出提示");
}
if (!/flow=import/.test(knowledgePage) || !/data-existing-import/.test(knowledgePage) || !/importStepRoute\([^\n]*"parse"/.test(knowledgePage)) {
  fail("向已有知识库新增文件也应统一经过导入、解析和可编辑的文档处理步骤");
}
const knowledgeDocumentsSource = knowledgePage.slice(knowledgePage.indexOf("function renderDocumentsTab"), knowledgePage.indexOf("function renderCreationSteps"));
if (!/<th>文件<\/th>[\s\S]*<th>文件状态<\/th>[\s\S]*<th>切片数<\/th>[\s\S]*<th>更新时间<\/th>[\s\S]*<th>操作<\/th>/.test(knowledgeDocumentsSource) || /当前修订|有效等级|<th>页数<\/th>|<th>处理状态<\/th>|<th>检索状态<\/th>/.test(knowledgeDocumentsSource)) {
  fail("知识库文件列表应只显示单一文件生命周期、切片数与更新时间，不展示版本、文件等级、页数或双状态");
}
if (/>全部文件<|documents\.reduce\(function collect|knowledge-chunk-(?:quick|all|group)|data-quick-chunk-document-select|data-chunk-full-preview/.test(knowledgePage + pagesStyles)) {
  fail("知识库不应保留全库切片聚合视图的渲染、交互或样式标记");
}
if (!/manualLabel[\s\S]*人工新增[\s\S]*chunk\.origin === "manual"/.test(previewUi)) {
  fail("复用的单文件切片卡片应继续标记人工新增来源");
}
if (!/knowledge-detail-page/.test(knowledgePage) || !/\.knowledge-detail-page\s*>\s*\.knowledge-assets\s*\{[^}]*flex:\s*1/.test(pagesStyles)) {
  fail("知识库资产板块应自适应填满详情页剩余高度");
}
const knowledgeInfoSource = knowledgePage.slice(knowledgePage.indexOf("function renderKnowledgeInfo"), knowledgePage.indexOf("function renderDocumentsTab"));
if (!/知识库 ID/.test(knowledgeInfoSource) || !/描述/.test(knowledgeInfoSource) || !/向量模型/.test(knowledgeInfoSource) || !/renderKnowledgePipeline/.test(knowledgeInfoSource) || /文件数量|文档处理策略|访问等级|权限等级/.test(knowledgeInfoSource)) {
  fail("知识库详情信息应采用基础信息加处理状态链两行结构，且不重复文件数量、文件级策略或权限等级");
}
if (!/data-test-kb/.test(knowledgePage) || !/data-open-retrieval-test/.test(ragPage)) {
  fail("知识库详情与检索配置都应提供检索测试快捷入口");
}
if (!/retrieval-chat[\s\S]*aria-label="RAG 对话与质量结果"[\s\S]*retrieval-studio__settings[\s\S]*aria-label="检索测试设置"/.test(ragPage) || /模拟访问等级/.test(ragPage)) {
  fail("检索测试应以主对话居左、测试参数居右组成工作区，且不得提供模拟访问等级");
}
if (/retrieval-chat__header|retrieval-chat__state|<h2>测试对话<\/h2>/.test(ragPage)) {
  fail("检索测试右侧不应重复展示测试对话标题、当前配置或完成状态");
}
const retrievalSettingsSource = ragPage.slice(ragPage.indexOf("function renderRetrievalSettings"), ragPage.indexOf("function renderRag"));
const retrievalTestSource = ragPage.slice(ragPage.indexOf("function retrievalResultSummary"), ragPage.indexOf("OpsDemo.pages.rag"));
if (!/返回切片数[\s\S]*有效证据数[\s\S]*证据覆盖度[\s\S]*结果相关性/.test(retrievalTestSource)) {
  fail("检索测试应以返回切片数、有效证据数、证据覆盖度和结果相关性四项运营指标解释结果");
}
if (!/function\s+answerQualitySummary[\s\S]*回答质量[\s\S]*忠实度[\s\S]*答案相关性[\s\S]*引用覆盖率[\s\S]*生成时延/.test(retrievalTestSource) || !/function\s+qualityDashboard[\s\S]*检索质量[\s\S]*answerQualitySummary/.test(retrievalTestSource)) {
  fail("检索测试应将检索质量与回答质量分组，并提供忠实度、答案相关性、引用覆盖率与生成时延");
}
if (/衡量证据是否找得全、排得准|基于生成回答与引用证据/.test(retrievalTestSource)) {
  fail("检索质量与回答质量标题右侧不应保留辅助说明");
}
if (!/var qualitySummary = '<div class="retrieval-chat__quality"/.test(retrievalTestSource)) {
  fail("检索质量板块应对所有知识库默认展示");
}
if (!/data-answer-quality'[\s\S]*generationEnabled\s*\?\s*""\s*:\s*" hidden"/.test(retrievalTestSource) || !/answerQuality\.hidden\s*=\s*!answerEnabled/.test(retrievalTestSource)) {
  fail("回答质量板块必须仅在回答生成开关开启时展示");
}
if (!/\.retrieval-result-summary--quality\s*>\s*div\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;[\s\S]*?grid-template-rows:\s*auto auto;/.test(pagesStyles) || !/\.retrieval-result-summary--quality\s*>\s*div\s*>\s*strong\s*\{[\s\S]*?grid-row:\s*1 \/ -1;[\s\S]*?justify-self:\s*end;/.test(pagesStyles) || !/@container\s*\(max-width:\s*620px\)[\s\S]*?\.retrieval-result-summary--quality\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/.test(pagesStyles)) {
  fail("回答质量卡应采用左侧标题、右侧分数，并在工作区变窄时切换为两列");
}
const retrievalTestControlOrder = ['retrievalKnowledgeBasePicker(state.knowledgeBases, kbId)', "检索方式", "<h3>Rerank</h3>", 'id="test-final-topk"', 'relevanceNumberInput("test-relevance"', "<h3>回答生成</h3>"].map((label) => retrievalTestSource.indexOf(label));
if (retrievalTestControlOrder.some((index) => index < 0) || !retrievalTestControlOrder.every((index, position) => position === 0 || retrievalTestControlOrder[position - 1] < index)) {
  fail("检索测试侧栏应按知识库、检索方式、Rerank、召回设置与回答生成的顺序组织");
}
if (/测试范围|召回与结果|data-test-settings-source|retrieval-test-quick-reset|data-use-online-settings|恢复全局设置|本次调整|基于全局设置|配置页临时参数|本次测试参数/.test(retrievalTestSource)) {
  fail("检索测试侧栏不应展示冗余小标题、参数来源或恢复入口");
}
const testRerankFieldsStart = retrievalTestSource.indexOf("data-test-rerank-fields");
const testRerankFieldsEnd = retrievalTestSource.indexOf("</div></section>", testRerankFieldsStart);
const testRerankModelIndex = retrievalTestSource.indexOf('id="test-reranker-model"');
const testTopKIndex = retrievalTestSource.indexOf('id="test-final-topk"');
if (!(testRerankFieldsStart >= 0 && testRerankModelIndex > testRerankFieldsStart && testRerankModelIndex < testRerankFieldsEnd && testTopKIndex > testRerankFieldsEnd)) {
  fail("Rerank 开关只应控制模型字段，Top K 必须位于常显的召回设置");
}
if (/data-test-rerank-fields[^>]*hidden/.test(retrievalTestSource) || !/function\s+syncRetrievalTestControls[\s\S]*control\.disabled\s*=\s*!enabled[\s\S]*control\.required\s*=\s*enabled/.test(retrievalTestSource)) {
  fail("检索测试关闭 Rerank 时模型字段必须常显，仅禁用控件并移除必填语义");
}
if (!/data-test-answer-toggle/.test(retrievalTestSource) || !/<select id="test-answer-model"[^>]*data-test-answer-model disabled[^>]*>[\s\S]*<option selected>/.test(retrievalTestSource) || !/data-test-answer-fields/.test(retrievalTestSource) || !/generateAnswer:\s*Boolean\(/.test(retrievalTestSource) || !/generateAnswer:\s*quickSettings\.generateAnswer/.test(retrievalTestSource) || !/answerFields\.classList\.toggle\("is-disabled",\s*!answerEnabled\)/.test(retrievalTestSource) || !/answerModel\.disabled\s*=\s*true/.test(retrievalTestSource) || !/var\s+generationEnabled\s*=\s*Boolean\(hasRun\s*&&\s*isAnswerGenerationEnabled\(test\)\)/.test(retrievalTestSource)) {
  fail("检索测试应默认关闭回答生成，并提供独立开关；回答模型复用 Rerank 字段结构且仅显示不可切换的默认 LLM");
}
if (!/dom\.pageHeader\(\{\s*title:\s*"检索测试"\s*\}\)/.test(retrievalTestSource) || !/if \(route\.query\.from\)[\s\S]*router\.navigate\(retrievalTestLocation/.test(retrievalTestSource) || /retrievalTest(?:Back|Origin)|back:\s*retrievalTestBack|from=(?:retrieval-config|knowledge-list|knowledge-detail)/.test(retrievalTestSource + ragPage + knowledgePage)) {
  fail("检索测试应始终作为独立侧边栏页面，入口只传递预选知识库而不生成返回目标");
}
if (/retrievalRunSnapshot|retrieval-run-snapshot|本次检索配置|本次检索方式：|召回候选数：/.test(retrievalTestSource)) {
  fail("检索结果区不应重复展示侧栏已经提供的本次检索配置");
}
if (!/rerankerModelId:\s*rerankEnabled\s*\?[^:]+:\s*null/.test(retrievalTestSource) || !/deriveRetrievalPlan[\s\S]*fusionCandidates[\s\S]*fixture\s*=\s*fixture\.slice\(0,\s*derivedPlan\.fusionCandidates\)/.test(actionsSource)) {
  fail("关闭 Rerank 时应清空模型覆盖值，候选规模由系统派生计划约束");
}
if (!/\.retrieval-test-page\s*\{[\s\S]*?height:\s*calc\(100(?:d)?vh\s*-\s*var\(--header-height\)\s*-\s*1px\);[\s\S]*?overflow:\s*hidden;/.test(pagesStyles) || !/\.retrieval-studio\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+(?:340|360)px;[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/.test(pagesStyles) || !/\.retrieval-studio__settings\s*\{[\s\S]*?border-left:\s*1px solid var\(--border\);/.test(pagesStyles) || !/\.retrieval-message--result \.retrieval-message__content\s*\{[\s\S]*?max-width:\s*none;/.test(pagesStyles)) {
  fail("检索测试页应锁定在视口内，主对话填满左侧，测试参数以窄侧栏居右");
}
if (!/<h2>检索方式<\/h2><p>系统统一管理召回与融合策略<\/p>[\s\S]*panel__body[\s\S]*retrieval-system-heading__icon[\s\S]*dom\.icon\("git-merge", 18\)[\s\S]*<h3>混合检索<\/h3><p>同时使用关键词与语义检索，系统统一合并结果并去重。关键词检索按关键词与字段匹配召回证据。语义检索按向量语义相似度召回证据。<\/p>/.test(retrievalSettingsSource) || /hybridRetrievalComposition|retrieval-method-copy|data-hybrid-composition|retrieval-method-lines|<dl|<dt|<dd|系统默认|retrieval-hybrid-sources|retrieval-hybrid-source__title|<article class="retrieval-hybrid-source"|RRF|retrieval-system-flow__connector|retrieval-keyword-weight|data-hybrid-weight-range|融合权重|关键词检索权重/.test(retrievalSettingsSource + pagesStyles)) {
  fail("检索方式应作为面板头部，正文将关键词与语义检索解释合并进带图标的混合检索说明");
}
if (/retrieval-system-capabilities|retrieval-advanced|<summary>高级设置<\/summary>/.test(retrievalSettingsSource)) {
  fail("系统检索能力不应使用零散小标签，召回候选也不应藏在高级设置中");
}
if (!/data-rerank-toggle/.test(retrievalSettingsSource) || !/id="retrieval-reranker-model"/.test(retrievalSettingsSource) || !/id="retrieval-final-topk"/.test(retrievalSettingsSource) || !/relevanceNumberInput\("retrieval-relevance"/.test(retrievalSettingsSource) || /retrieval-rerank-candidates|retrieval-max-per-document|retrieval-keyword-weight|data-hybrid-weight-range|keywordWeight|semanticWeight/.test(retrievalSettingsSource + retrievalTestSource)) {
  fail("运营可配置项应只包含 Rerank 开关／模型、Top K 和相关性阈值，不包含融合权重");
}
if (!/data-rerank-fields>/.test(retrievalSettingsSource) || /data-rerank-fields[^>]*hidden/.test(retrievalSettingsSource) || !/function\s+syncRetrievalSettingsControls[\s\S]*control\.disabled\s*=\s*!enabled[\s\S]*control\.required\s*=\s*enabled/.test(retrievalSettingsSource)) {
  fail("关闭 Rerank 后模型字段必须保持展示，仅禁用控件并移除必填语义");
}
if (!/RETRIEVAL_FUSION_CONFIG\s*=\s*Object\.freeze\(\{\s*method:\s*"rrf",\s*rrfK:\s*60\s*\}\)/.test(actionsSource) || !/applyFixedRetrievalFusion[\s\S]*fusionMethod\s*=\s*RETRIEVAL_FUSION_CONFIG\.method[\s\S]*rrfK\s*=\s*RETRIEVAL_FUSION_CONFIG\.rrfK[\s\S]*delete settings\.system\.fusionWeights/.test(actionsSource) || !/deriveRetrievalPlan[\s\S]*Math\.max\(finalTopK, Math\.floor\(Number\(system\.bm25Candidates[\s\S]*Math\.max\(finalTopK, Math\.floor\(Number\(system\.denseCandidates[\s\S]*fusionMethod:\s*RETRIEVAL_FUSION_CONFIG\.method[\s\S]*rrfK:\s*RETRIEVAL_FUSION_CONFIG\.rrfK/.test(actionsSource)) {
  fail("RRF 方法与 k=60 应由代码固定，并让关键词、语义两路分别使用系统候选规模");
}
if (!/function\s+applyRrfRankingScores[\s\S]*1\s*\/\s*\(rrfK \+ rank\)[\s\S]*item\.rrfScore[\s\S]*item\.rrfK\s*=\s*rrfK/.test(actionsSource) || !/rankedRetrievalFixture[\s\S]*applyRrfRankingScores\(fixture, derivedPlan\.rrfK\)[\s\S]*computed_rrf/.test(actionsSource)) {
  fail("Mock 检索应按两路名次实际计算 RRF 分数，并在运行计划中记录计算来源");
}
if (!/function\s+relevanceNumberInput\(id, selected, options\)[\s\S]*showDescription[\s\S]*class="field" type="number" inputmode="decimal" min="0\.40" max="0\.90" step="0\.01"[\s\S]*required aria-required="true"[\s\S]*aria-describedby=[\s\S]*aria-valuetext=[\s\S]*data-relevance-input/.test(ragPage) || !/function\s+syncRelevanceInput[\s\S]*setCustomValidity[\s\S]*aria-invalid[\s\S]*toFixed\(2\)/.test(ragPage) || !/function\s+relevanceInputValue/.test(ragPage) || !/relevanceNumberInput\("test-relevance"[\s\S]*\{ showDescription: false \}/.test(ragPage)) {
  fail("相关度阈值应复用数字输入，支持 0.40–0.90 的百分位步长并保留标签、说明与校验语义");
}
if (!/相关度阈值/.test(ragPage) || /最低相关度/.test(ragPage) || !/value: "loose", label: "宽松", range: "≤ 0\.50"[\s\S]*description: "覆盖优先"/.test(ragPage) || !/value: "balanced", label: "均衡", range: "0\.51–0\.70"[\s\S]*description: "兼顾数量与质量"/.test(ragPage) || !/value: "strict", label: "严格", range: "≥ 0\.71"[\s\S]*description: "质量优先，结果可能更少"/.test(ragPage) || !/function\s+relevanceDescription\(\)[\s\S]*item\.range \+ " " \+ item\.label[\s\S]*join\("，"\) \+ "。"/.test(ragPage) || /当前 [\s\S]*仅返回相关度 ≥|开启 Rerank 时使用重排分，关闭时使用融合分/.test(ragPage)) {
  fail("相关度阈值的行内说明应仅展示统一的宽松、均衡、严格区间参考");
}
if (/relevanceChoice|relevanceOptions|retrieval-level-card|retrieval-relevance-card|retrieval-relevance-slider|data-relevance-range|name="retrieval-relevance"/.test(ragPage + pagesStyles)) {
  fail("相关度阈值不应残留旧的单选、下拉、等级卡或 Slider 实现");
}
if (!/relevanceThreshold:\s*relevanceThreshold/.test(ragPage) || !/relevanceThresholdFromOperator\(value\)\.toFixed\(2\)/.test(ragPage) || !/Math\.round\(Number\(candidate\) \* 100\)/.test(actionsSource) || !/operator\.relevanceThreshold/.test(actionsSource)) {
  fail("检索配置、测试快照与运行参数比较必须保留精确到百分位的相关度门槛");
}
if (!/evidence-item__score/.test(ragPage) || !/item\.retrievalScore/.test(ragPage) || !/scoreSource/.test(ragPage + actionsSource) || !/\.evidence-item__score/.test(pagesStyles)) {
  fail("每条检索证据必须展示本次实际用于排序和过滤的相关度及分数来源");
}
if (!/dom\.button\("更新配置"[\s\S]*data-save-retrieval-settings[\s\S]*disabled:\s*true/.test(retrievalSettingsSource) || /dom\.button\("保存设置"/.test(retrievalSettingsSource) || !/previewRetrievalSettings/.test(retrievalSettingsSource) || !/settings=preview/.test(retrievalSettingsSource) || !/不会重新解析文件、切片或生成向量/.test(retrievalSettingsSource)) {
  fail("全局检索设置应以“更新配置”为主操作，支持未保存设置测试，并明确不触发知识库重新处理");
}
const unsavedNavigationSource = retrievalSettingsSource.slice(retrievalSettingsSource.indexOf("function confirmUnsavedNavigation"), retrievalSettingsSource.indexOf("function syncDirtyState"));
if (!/function\s+retrievalSettingsDraftKey/.test(retrievalSettingsSource) || !/function\s+syncDirtyState[\s\S]*data-retrieval-settings-dirty[\s\S]*router\.block\(confirmUnsavedNavigation\)[\s\S]*window\.addEventListener\("beforeunload",\s*beforeUnload\)/.test(retrievalSettingsSource) || !/继续编辑[\s\S]*更新配置并离开/.test(unsavedNavigationSource) || /不保存并离开|data-discard-retrieval-settings/.test(unsavedNavigationSource) || !/function\s+releaseDirtyGuard[\s\S]*window\.removeEventListener\("beforeunload",\s*beforeUnload\)/.test(retrievalSettingsSource) || !/unmount:\s*unmountRetrievalSettings/.test(ragPage)) {
  fail("检索配置修改后必须拦截离开，确认弹窗只提供继续编辑与更新配置并离开，并在卸载时清理导航与 beforeunload 监听");
}
if (!/function\s+block\(handler\)[\s\S]*navigationBlocker/.test(routerSource) || !/document\.addEventListener\("click"[\s\S]*requestNavigation\(nextHash,\s*"link"\)/.test(routerSource) || !/function\s+notify\(\)[\s\S]*requestNavigation\(attemptedHash,\s*"history"\)/.test(routerSource) || !/window\.addEventListener\("hashchange",\s*notify\)/.test(routerSource)) {
  fail("路由器应统一拦截程序调用、站内链接与浏览器历史导航，供未保存配置确认复用");
}
if (!/function\s+retrievalKnowledgeBasePicker[\s\S]*id="test-kb-v2"/.test(ragPage) || !/retrievalKnowledgeBasePicker\(state\.knowledgeBases, kbId\)/.test(retrievalTestSource) || /id="test-profile"|retrievalProfileOptions|comparisonProfileId|currentRetrievalProfile/.test(ragPage)) {
  fail("检索测试应选择知识库并基于全局设置快捷调参，不再选择配置版本或绑定知识库");
}
if (!/data-test-rerank-toggle/.test(retrievalTestSource) || !/id="test-reranker-model"/.test(retrievalTestSource) || !/id="test-final-topk"/.test(retrievalTestSource) || !/relevanceNumberInput\("test-relevance"/.test(retrievalTestSource) || /id="test-rerank-candidates"/.test(retrievalTestSource)) {
  fail("检索测试右侧应复用 Rerank、模型、Top K 和相关性快捷控件，不暴露系统候选规模");
}
if (!/retrieval-chat__quality[\s\S]*retrieval-chat__body/.test(retrievalTestSource) || /retrieval-message__label">测试问题/.test(retrievalTestSource)) {
  fail("质量指标应固定在主对话工作区顶部，问题气泡不得重复显示测试问题标题");
}
if (!/route\.query\.run[\s\S]*test\.lastRunAt/.test(retrievalTestSource) || !/operatorOverrides/.test(retrievalTestSource) || !/silentRender:\s*true/.test(retrievalTestSource)) {
  fail("检索测试应在用户点击检索后才展示结果，并以单次提交运行快捷参数");
}
const retrievalQuestionTag = retrievalTestSource.match(/<textarea\b[^>]*id="test-question-v2"[^>]*>/)?.[0] || "";
if (!retrievalQuestionTag || !/aria-label="[^"]+"/.test(retrievalQuestionTag) || !/(?:^|\s)required(?:\s|>|=)/.test(retrievalQuestionTag) || !/aria-required="true"/.test(retrievalQuestionTag)) {
  fail("移除可见问题标签后，检索问题输入框仍须保留 aria-label、required 与 aria-required");
}
if (/dom\.requiredLabel\(\s*["']检索问题["']|<label[^>]*for="test-question-v2"/.test(retrievalTestSource)) {
  fail("检索输入区不应重复显示“检索问题”标签");
}
if (!/<footer class="retrieval-composer"><textarea[\s\S]*id="test-question-v2"[\s\S]*<\/textarea>'\s*\+\s*dom\.button\("发送"[\s\S]*data-run-test-v2/.test(retrievalTestSource) || /retrieval-composer__input-shell|retrieval-composer__send/.test(retrievalTestSource + pagesStyles)) {
  fail("检索输入区应由 footer 直接承载输入框与按钮，不再重复嵌套容器");
}
if (!/function\s+generatedAnswerMessage[\s\S]*data-evidence-jump[\s\S]*aria-label="生成回答"[\s\S]*test\.generatedAnswer[\s\S]*aria-label="回答引用"/.test(retrievalTestSource) || !/root\.querySelectorAll\("\[data-evidence-jump\]"\)[\s\S]*scrollIntoView[\s\S]*evidence\.focus/.test(retrievalTestSource)) {
  fail("生成回答应展示可定位到证据的引用，并为引用跳转提供滚动与焦点反馈");
}
if (!/ANSWER_GENERATION_CONFIG\s*=\s*Object\.freeze\(\{[\s\S]*modelId:\s*"MODEL-LLM-DEEPSEEK-V4-PRO"[\s\S]*model:\s*"DeepSeek-V4-Pro"[\s\S]*temperature:\s*0\.2[\s\S]*citationsEnabled:\s*true/.test(actionsSource) || !/function\s+applyFixedAnswerGeneration[\s\S]*rag\.answerGeneration/.test(actionsSource) || !/answerGenerationEnabled:\s*false/.test(actionsSource) || !/var\s+generateAnswer\s*=\s*input\.generateAnswer\s*===\s*true/.test(actionsSource) || !/test\.answerGenerated\s*=\s*true[\s\S]*test\.generatedAnswer\s*=\s*answerResult\.text[\s\S]*test\.answerCitations\s*=\s*answerResult\.citations[\s\S]*test\.answerMetrics\s*=\s*answerQualityMetrics[\s\S]*test\.generationSnapshot\s*=/.test(actionsSource) || !/test\.answerGenerated\s*=\s*false[\s\S]*test\.generatedAnswer\s*=\s*""[\s\S]*test\.answerCitations\s*=\s*\[\][\s\S]*test\.answerMetrics\s*=\s*null[\s\S]*test\.generationSnapshot\s*=\s*null/.test(actionsSource) || !/concat\(generateAnswer\s*\?\s*\["answer_generation",\s*"answer_evaluation"\]\s*:\s*\[\]\)/.test(actionsSource)) {
  fail("动作层应固定回答生成配置，默认关闭生成，并仅在明确开启时生成回答、引用及回答指标");
}
if (!/\.retrieval-composer\s*\{[\s\S]*?display:\s*flex;[\s\S]*?border:\s*1px solid var\(--border\);/.test(pagesStyles) || !/\.retrieval-composer__input\s*\{[\s\S]*?border:\s*0;/.test(pagesStyles)) {
  fail("检索输入区应使用单层边框，并让内部输入框保持无边框");
}
if (/workspace-section-heading|retrieval-profile-brief|retrieval-setting-note|<h[2-4][^>]*>测试设置<\/h[2-4]>|当前测试对象|retrieval-stage-list|retrieval-score-list/.test(retrievalTestSource)) {
  fail("检索测试不应恢复设置说明、当前对象摘要或算法与阶段日志");
}
if (/retrievalProfiles|retrieval_profile|currentRetrievalProfile|RET-0/.test(ragPage + actionsSource + seedSource)) {
  fail("全局 Query 检索设置重构后不得残留配置版本、应用到知识库或旧 Profile 数据契约");
}
if (/processingTableRows|renderProcessingStrategies|data-processing-(?:new|detail|preview|toggle)|文档处理策略/.test(ragPage)) {
  fail("检索配置页面不得残留独立文档处理策略目录或管理入口");
}
if (/function\s+(?:createDocumentProcessingProfile|updateDocumentProcessingProfile|cloneDocumentProcessingProfile|setDocumentProcessingProfileEnabled|applyDocumentProcessingProfile)|(?:createDocumentProcessingProfile|updateDocumentProcessingProfile|cloneDocumentProcessingProfile|setDocumentProcessingProfileEnabled|applyDocumentProcessingProfile)\s*:/.test(actionsSource)) {
  fail("动作层不得再向运营人员暴露文档处理策略的创建、编辑、复制、启停或反向应用能力");
}
const processingModesSource = actionsSource.match(/var PROCESSING_MODES\s*=\s*\[([^\]]+)\]/)?.[1] || "";
if (!["smart", "semantic", "structure", "separator", "recursive", "fixed", "page", "whole_document"].every((mode) => processingModesSource.includes('"' + mode + '"')) || !/function\s+getProcessingProfileCompatibility/.test(actionsSource)) {
  fail("动作层应校验五个可见方法及顶层方案，并继续读取历史 recursive 模式");
}
if (!/value:\s*"fixed",\s*title:\s*"固定长度"/.test(processingStepSource) || /value:\s*"recursive",\s*title:/.test(processingStepSource)) {
  fail("自定义方法卡片必须展示固定长度，并移除独立递归卡片");
}
const customProcessingMethods = Array.from(processingStepSource.matchAll(/value:\s*"(structure|separator|fixed|page|whole_document)",\s*title:\s*"([^"]+)"/g), (match) => [match[1], match[2]]);
if (JSON.stringify(customProcessingMethods) !== JSON.stringify([["structure", "结构切片"], ["separator", "分隔符切片"], ["fixed", "固定长度"], ["page", "按页切片"], ["whole_document", "整篇切片"]])) {
  fail("自定义方法定义必须按结构、分隔符、固定长度、按页、整篇排序，并使用完整名称");
}
if (!/<input\b(?=[^>]*\bdata-processing-param="maxChars")(?=[^>]*\bmin="200")(?=[^>]*\bmax="10000")(?=[^>]*\bstep="1")[^>]*>/.test(processingStepSource) || !/每片字符数[\s\S]*processing-fixed-max-help/.test(processingStepSource)) {
  fail("字符上限与固定窗口控件应使用 200–10000 的整数步长契约");
}
const fixedPresetStart = seedSource.indexOf('id: "ING-FIXED"');
const fixedPresetEnd = seedSource.indexOf('\n          id:', fixedPresetStart + 1);
const fixedPresetSource = seedSource.slice(fixedPresetStart, fixedPresetEnd < 0 ? undefined : fixedPresetEnd);
if (fixedPresetStart < 0 || !/mode:\s*"fixed"/.test(fixedPresetSource) || !/visible:\s*true/.test(fixedPresetSource) || !/displayGroup:\s*"primary"/.test(fixedPresetSource) || !/displayOrder:\s*5/.test(fixedPresetSource) || !/strategy:\s*"fixed_length"/.test(fixedPresetSource)) {
  fail("ING-FIXED 必须作为第五顺位的可见主预置并使用固定窗口算法");
}
const legacyRecursivePresetStart = seedSource.indexOf('id: "ING-RECURSIVE"');
const legacyRecursivePresetEnd = seedSource.indexOf('\n          id:', legacyRecursivePresetStart + 1);
const legacyRecursivePresetSource = seedSource.slice(legacyRecursivePresetStart, legacyRecursivePresetEnd < 0 ? undefined : legacyRecursivePresetEnd);
if (legacyRecursivePresetStart < 0 || !/mode:\s*"recursive"/.test(legacyRecursivePresetSource) || !/visible:\s*false/.test(legacyRecursivePresetSource) || !/displayGroup:\s*"internal"/.test(legacyRecursivePresetSource) || !/internal:\s*true/.test(legacyRecursivePresetSource)) {
  fail("ING-RECURSIVE 必须隐藏在内部组，仅供历史配置迁移");
}
const separatorPresetStart = seedSource.indexOf('id: "ING-SEPARATOR"');
const separatorPresetEnd = seedSource.indexOf('\n          id:', separatorPresetStart + 1);
const separatorPresetSource = seedSource.slice(separatorPresetStart, separatorPresetEnd < 0 ? undefined : separatorPresetEnd);
if (separatorPresetStart < 0 || !/mode:\s*"separator"/.test(separatorPresetSource) || !/displayOrder:\s*4/.test(separatorPresetSource) || !/separatorType:\s*"paragraph"/.test(separatorPresetSource) || !/separator:\s*"\\n\\n"/.test(separatorPresetSource) || !/strategy:\s*"separator_recursive_fallback"/.test(separatorPresetSource) || !/recursiveBoundaries:\s*\["paragraph", "newline", "sentence", "whitespace", "character"\]/.test(separatorPresetSource) || !/keepSeparator:\s*true/.test(separatorPresetSource) || /boundaryMode\s*:/.test(separatorPresetSource)) {
  fail("ING-SEPARATOR 必须作为第四顺位可见预置，默认选择段落／空行并固化递归降级算法");
}
if (!/class="processing-profile-list processing-family-list"[\s\S]*data-processing-family-list/.test(knowledgePage) || !/data-processing-method-picker/.test(knowledgePage) || !/value:\s*"custom"[\s\S]*title:\s*"自定义切片"/.test(processingStepSource) || /processing-profile-more|更多策略/.test(processingStepSource)) {
  fail("文档处理步骤应以自动、语义、自定义为第一层，并仅在自定义下展示具体方法");
}
const legacyProcessingPresetStart = seedSource.indexOf('id: "ING-02"');
const legacyProcessingPresetEnd = seedSource.indexOf('id: "ING-SEMANTIC"', legacyProcessingPresetStart);
const legacyProcessingPresetSource = seedSource.slice(legacyProcessingPresetStart, legacyProcessingPresetEnd);
if (legacyProcessingPresetStart < 0 || !/visible:\s*false/.test(legacyProcessingPresetSource) || !/displayGroup:\s*"internal"/.test(legacyProcessingPresetSource)) {
  fail("历史 ING-02 预置必须保留为内部兼容数据，并从新流程候选中隐藏");
}
if (!/\.processing-family-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(pagesStyles) || !/@container\s*\(min-width:\s*720px\)[\s\S]*?\.processing-method-list\s*\{[\s\S]*?repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(pagesStyles) || !/@container\s*\(min-width:\s*1100px\)[\s\S]*?\.processing-method-list\s*\{[\s\S]*?repeat\(5,\s*minmax\(0,\s*1fr\)\)/.test(pagesStyles)) {
  fail("首层三类应固定三列，自定义方法应随容器空间从三列扩展到五列");
}
const processingSeparatorBranchStart = processingStepSource.indexOf('var separatorHelp =');
const processingSeparatorBranchEnd = processingStepSource.indexOf('if (mode === "page")', processingSeparatorBranchStart);
const processingSeparatorPickerSource = processingStepSource.slice(processingSeparatorBranchStart, processingSeparatorBranchEnd);
const processingWholeBranchStart = processingStepSource.indexOf('if (mode === "whole_document")', processingSeparatorBranchEnd);
const processingPageParameterSource = processingStepSource.slice(processingSeparatorBranchEnd, processingWholeBranchStart);
const processingWholeParameterSource = processingStepSource.slice(processingWholeBranchStart, processingStepSource.indexOf("return '<section", processingWholeBranchStart));
if (processingWholeBranchStart < 0 || !/data-processing-param="pagesPerChunk"/.test(processingPageParameterSource) || /data-processing-param="(?:maxChars|overlapPercent)"/.test(processingPageParameterSource) || !/连续/.test(processingPageParameterSource) || !/解析/.test(processingPageParameterSource)) {
  fail("按页切片应提供专用连续页数参数和解析分页前提，不显示字符上限或重叠率");
}
if (!/data-processing-param="longDocumentFallback"/.test(processingWholeParameterSource) || !/value="smart"[\s\S]*value="stop"/.test(processingWholeParameterSource) || !/maxDocumentChars/.test(processingWholeParameterSource) || /data-processing-param="(?:maxChars|overlapPercent|pagesPerChunk)"/.test(processingWholeParameterSource)) {
  fail("整篇切片应解释已有文档长度阈值，并只提供自动切片或停止的超长处理选项");
}
const processingSeparatorOptionValues = Array.from(processingSeparatorPickerSource.matchAll(/\{\s*value:\s*"([^"]+)",\s*token:/g), (match) => match[1]);
const expectedProcessingSeparatorValues = ["paragraph", "newline", "zh_period", "zh_exclamation", "zh_question", "en_period", "en_exclamation", "en_question"];
if (processingSeparatorBranchStart < 0 || processingSeparatorBranchEnd < 0 || JSON.stringify(processingSeparatorOptionValues) !== JSON.stringify(expectedProcessingSeparatorValues) || !/<select id="processing-separator-type" hidden data-processing-param="separatorType"[\s\S]*?data-processing-separator-source/.test(processingSeparatorPickerSource) || !/data-processing-separator-picker/.test(processingSeparatorPickerSource) || !/data-processing-separator-trigger/.test(processingSeparatorPickerSource) || !/role="combobox"[\s\S]*?aria-required="true"/.test(processingSeparatorPickerSource) || !/role="listbox"/.test(processingSeparatorPickerSource) || !/优先切分边界/.test(processingSeparatorPickerSource) || !/优先按所选边界切分；片段超长时，系统自动按更细边界递归拆分，最后按字符上限兜底。/.test(processingSeparatorPickerSource) || /data-processing-boundary-mode|boundaryModeOption/.test(processingSeparatorPickerSource)) {
  fail("分隔符切片应直接展示含八个常用边界的单一下拉，并解释首选边界后的递归降级");
}
if (!/value:\s*"paragraph",\s*token:\s*"\\\\n\\\\n",\s*name:\s*"段落\s*\/\s*空行"/.test(processingSeparatorPickerSource) ||
    !/value:\s*"newline",\s*token:\s*"\\\\n",\s*name:\s*"每次换行"/.test(processingSeparatorPickerSource) ||
    !/value:\s*"zh_period",\s*token:\s*"。",\s*name:\s*"中文句号"/.test(processingSeparatorPickerSource) ||
    !/value:\s*"zh_exclamation",\s*token:\s*"！",\s*name:\s*"中文感叹号"/.test(processingSeparatorPickerSource) ||
    !/value:\s*"zh_question",\s*token:\s*"？",\s*name:\s*"中文问号"/.test(processingSeparatorPickerSource) ||
    !/value:\s*"en_period",\s*token:\s*"\.",\s*name:\s*"英文句点"/.test(processingSeparatorPickerSource) ||
    !/value:\s*"en_exclamation",\s*token:\s*"!",\s*name:\s*"英文感叹号"/.test(processingSeparatorPickerSource) ||
    !/value:\s*"en_question",\s*token:\s*"\?",\s*name:\s*"英文问号"/.test(processingSeparatorPickerSource) ||
    !/<code>' \+ esc\(option\.token\) \+ '<\/code>[\s\S]*processing-separator-choice__divider[\s\S]*esc\(option\.name\)/.test(processingSeparatorPickerSource)) {
  fail("八个下拉选项必须以代码胶囊展示 token，并以普通文字展示中文含义");
}
if (/value:\s*"(?:structure|sentence|custom|literal)"|自定义拆分标记/.test(processingSeparatorPickerSource)) {
  fail("分隔符下拉不应混入结构切片、合并 sentence 或历史 custom/literal 选项");
}
if (/data-custom-separator-field|data-processing-param="customSeparator"|自定义拆分标记/.test(processingStepSource)) {
  fail("结构／分隔符切片 UI 不应要求用户输入自定义符号");
}
if (!/SEPARATOR_BY_TYPE\s*=\s*\{[\s\S]*zh_period:\s*"。"[\s\S]*zh_exclamation:\s*"！"[\s\S]*zh_question:\s*"？"[\s\S]*en_period:\s*"\."[\s\S]*en_exclamation:\s*"!"[\s\S]*en_question:\s*"\?"/.test(actionsSource) || !/"sentence", "custom", "literal"/.test(actionsSource) || !/separatorType === "custom"[\s\S]*customSeparator/.test(actionsSource)) {
  fail("动作层应将六种中英文标点类型映射为单个字符，并继续兼容历史 sentence/custom/literal 值");
}
if (!/requestedMode === "recursive"\s*\?\s*"separator"/.test(actionsSource) || !/legacyAutomaticSeparator[\s\S]*input\.boundaryMode === "auto"/.test(actionsSource) || !/delete source\.chunking\.boundaryMode/.test(actionsSource) || !/strategy:\s*"separator_recursive_fallback"[\s\S]*recursiveBoundaries:\s*separatorFallbackBoundaries\(separatorType\)[\s\S]*keepSeparator:\s*true/.test(actionsSource)) {
  fail("动作层应将旧 recursive／boundaryMode 迁移到单层 separator 快照，并按首选边界固化递归降级链");
}
if (!/function\s+separatorFallbackBoundaries[\s\S]*paragraph[\s\S]*newline[\s\S]*sentence[\s\S]*whitespace[\s\S]*character/.test(actionsSource) || !/function\s+separatorBoundaryPlan/.test(actionsSource) || !/function\s+separatorTextChunks[\s\S]*splitPieces\(value, level\)[\s\S]*splitPieces\(piece, level \+ 1\)/.test(actionsSource) || !/sourceText && mode === "separator"[\s\S]*separatorTextChunks\(sourceText, chunking\)[\s\S]*mode === "fixed"[\s\S]*fixedTextChunks\(sourceText, chunking\)/.test(actionsSource)) {
  fail("预览处理必须执行首选分隔符到更细边界的递归降级，并继续保留独立固定窗口算法");
}
if (!/usesSemanticModel:\s*false/.test(seedSource) || !/依次按解析结构、逐级边界与长度上限生成切片，不调用语义模型/.test(knowledgePage)) {
  fail("自动切片必须明确组合结构、递归和长度兜底，且不得静默启用语义模型");
}
if (!/semanticSensitivity[\s\S]*breakpointPercentile[\s\S]*semanticMinChars[\s\S]*sentenceWindow/.test(actionsSource) || !/mode === "semantic"[\s\S]*overlapPercent = 0/.test(actionsSource)) {
  fail("动作层必须规范化语义敏感度并派生语义断点、最小切片、句段窗口与零重叠参数");
}
if (!/function\s+processingProfileSnapshot/.test(actionsSource) || !/input\.processingParameters \|\| input\.processingOverrides/.test(actionsSource) || !/batch\.processingParametersSnapshot/.test(actionsSource) || !/processingProfileSnapshot:\s*deferred \? null/.test(actionsSource)) {
  fail("四步建库动作层应将本次处理参数固化为知识库/导入批次快照，不修改共享策略");
}
const processingPayloadSource = knowledgePage.slice(knowledgePage.indexOf("function processingPayload"), knowledgePage.indexOf("function renderVersionSource"));
const normalizedProcessingProfileSource = actionsSource.slice(actionsSource.indexOf("function normalizedProcessingProfile"), actionsSource.indexOf("function processingProfileSnapshot"));
const processingParametersSnapshotSource = actionsSource.slice(actionsSource.indexOf("function processingParametersSnapshot"), actionsSource.indexOf("function normalizeMineruParseConfig"));
const previewChunkBuilderSource = actionsSource.slice(actionsSource.indexOf("function addImportPreviewChunks"), actionsSource.indexOf("function markDocumentReplacementStaged"));
const chunkMetadataSource = fileProcessingSource.slice(fileProcessingSource.indexOf("function withMetadata"), fileProcessingSource.indexOf("function chunkSetReferences"));
if (!/parentChildEnabled/.test(processingPayloadSource) || !/parentChildEnabled/.test(normalizedProcessingProfileSource) || !/parentChildEnabled/.test(processingParametersSnapshotSource)) {
  fail("父子块开关必须从处理页提交到动作层，并固化到处理参数快照");
}
if (!/父子块检索/.test(processingStepSource) || !/data-processing-param="parentChildEnabled"/.test(processingStepSource) || !/通过上下文增强，在检索命中后补充更完整的内容/.test(processingStepSource) || !/子块：参与 Embedding、检索和评分[\s\S]*细粒度证据/.test(processingStepSource) || !/父块：命中后补充上下文[\s\S]*同父去重/.test(processingStepSource)) {
  fail("文档处理页应将父子块作为独立上下文增强板块和开关展示");
}
if (!/whole_document/.test(normalizedProcessingProfileSource) || !/var includeContext = mode !== "whole_document"/.test(normalizedProcessingProfileSource) || !/contextPolicy = mode === "whole_document" \? "none" : parentChildEnabled \? "enhanced" : "standard"/.test(normalizedProcessingProfileSource) || !/parentChildEnabled\s*=\s*false|parentChildEnabled:\s*false/.test(normalizedProcessingProfileSource) || !/整篇切片/.test(processingStepSource) || !/disabled/.test(processingStepSource)) {
  fail("整篇切片应保留可见但禁用的父子块说明，动作层必须强制关闭该选项并固定非整篇基础上下文");
}
if (!/parentChunks/.test(previewChunkBuilderSource + fileProcessingSource) || !/parentChunkId/.test(previewChunkBuilderSource + chunkMetadataSource + fileProcessingSource)) {
  fail("启用父子块后必须将父块独立保存在 chunkSet.parentChunks，子块通过 metadata.parentChunkId 建立引用");
}
if (!/compatible:\s*profileAvailable/.test(actionsSource) || !/completeOutput:\s*profileAvailable && !missing\.length/.test(actionsSource)) {
  fail("解析产物完整度只能作为提示，不能禁用已启用的文档处理策略");
}
if (/\b(?:skills|tools|visualizations):\s*(?:\[|\{)/.test(seedSource)
  || /state\.(?:skills|tools|visualizations)/.test(actionsSource)
  || /function\s+(?:toggleCapability|setCapabilityEnabled|createCapabilityFromUpload|updateCapability|deleteCapability)\b/.test(actionsSource)) {
  fail("运营端种子数据与动作层不应保留 Skill、Tool 或可视化管理状态及 CRUD");
}
if (/skill-catalog-table|capability-package|capability-row-actions|visualization-grid|visual-drawer|visual-data-editor/.test(pagesStyles + responsiveStyles)) {
  fail("运营端样式表不应保留 Skill 或可视化管理页面专属样式");
}
const apiSeedStart = seedSource.indexOf("apiAccess:");
const apiSeedSource = seedSource.slice(apiSeedStart, seedSource.indexOf("\n    consumption:", apiSeedStart));
const apiActionSource = actionsSource.slice(actionsSource.indexOf("function createApiKey"), actionsSource.indexOf("function createRollbackDraft"));
if (!/function\s+createApiKey/.test(apiActionSource) || !/apiType\s*=\s*"retrieval"/.test(apiActionSource) || !/isRetrievalApiKey/.test(apiActionSource) || !/knowledgeBaseIds:\s*knowledgeBaseIds/.test(apiActionSource) || !/retrievalPolicy:\s*retrievalPolicy/.test(apiActionSource) || /permissionLevel|accessLevels/.test(apiActionSource) || /function\s+rotateApiKey/.test(apiActionSource) || !/function\s+setApiKeyEnabled/.test(apiActionSource) || !/function\s+deleteApiKey/.test(apiActionSource) || !/clients\.splice/.test(apiActionSource) || !/sk_retrieval_/.test(actionsSource) || /sk_agent_/.test(actionsSource)) {
  fail("API 密钥动作层应固定为 retrieval，保存知识库范围与检索策略，移除权限等级并保留启停和真正删除闭环");
}
if (/normalizeApiScopes|normalizeIpAllowlist|apiClientId|\bscopes\b|identityMode|ipAllowlist|rpmLimit|expiresAt|revokedAt|status\s*=\s*"revoked"/.test(apiActionSource)) {
  fail("API 密钥动作层不应恢复旧通用 scopes、身份、IP、限流、到期或作废状态逻辑");
}
if (/products:\s*\[|apiType:\s*"agent"|sk_agent_|研判 Agent API/.test(apiSeedSource) || !/name:\s*"供应链知识检索服务"/.test(apiSeedSource) || !/apiType:\s*"retrieval"/.test(apiSeedSource) || !/sk_retrieval_/.test(apiSeedSource) || !/keyMasked:/.test(apiSeedSource) || !/knowledgeBaseIds:/.test(apiSeedSource) || !/retrievalPolicy:/.test(apiSeedSource) || !/lastUsedAt:/.test(apiSeedSource) || /permissionLevel|accessLevel|clientId|credentialVersion|\bscopes\b|identityMode|ipAllowlist|rpmLimit|expiresAt|revokedAt|永久作废/.test(apiSeedSource)) {
  fail("API 密钥种子应仅保留 retrieval 记录，并包含知识库范围、检索策略、脱敏 Key、启用状态与使用时间");
}
if (!/createApiKey/.test(apiAccessPage) || !/deleteApiKey/.test(apiAccessPage) || /data-api-rotate|rotateApiKey/.test(apiAccessPage) || !/confirmButton\.disabled = true/.test(apiAccessPage) || !/data-api-secret-copy/.test(apiAccessPage) || /data-api-field="apiType"|data-api-type-filter|data-api-type-card/.test(apiAccessPage) || !/data-api-field="name"/.test(apiAccessPage) || !/data-api-kb-option/.test(apiAccessPage) || !/api-key-policy-mode/.test(apiAccessPage) || !/data-api-rerank-toggle/.test(apiAccessPage) || !/api-key-final-topk/.test(apiAccessPage) || !/api-key-relevance/.test(apiAccessPage) || !/data-api-wizard-step="1"/.test(apiAccessPage) || !/data-api-wizard-step="2"/.test(apiAccessPage) || !/data-api-wizard-step="3"/.test(apiAccessPage) || !/confirmLabel:\s*"下一步"/.test(apiAccessPage) || !/confirmLabel:\s*"生成 API Key"/.test(apiAccessPage) || /permissionLevel|api-key-permission|>权限</.test(apiAccessPage) || !/检索 API/.test(apiAccessPage) || /研判 Agent API/.test(apiAccessPage) || /data-api-field="(?:scopes|rpmLimit|expiresAt|ipAllowlist)"/.test(apiAccessPage)) {
  fail("API 密钥创建应固定为检索 API，并按基本配置、检索策略、获取 Key 三步完成");
}
if (!/<th>名称<\/th>[\s\S]*<th>API Key<\/th>[\s\S]*<th>可访问知识库<\/th>[\s\S]*<th>检索策略<\/th>[\s\S]*<th>状态<\/th>[\s\S]*<th>最近使用时间<\/th>[\s\S]*<th>创建时间<\/th>[\s\S]*<th>操作<\/th>/.test(apiAccessPage) || /<th>API 能力<\/th>|<th>权限<\/th>/.test(apiAccessPage)) {
  fail("API 密钥列表应回显知识库范围与检索策略，不展示能力或权限等级列");
}
if (!/return '<div class="table-primary">' \+ scoped\.length \+ '<\/div>'/.test(apiAccessPage) || !/policy\.mode === "custom" \? "独立" : "全局"/.test(apiAccessPage) || /api-key-scope-names|api-key-policy-summary/.test(apiAccessPage)) {
  fail("API 密钥列表的知识库列只应显示数量，检索策略列只应显示全局或独立");
}
if (!/api-key-view-fields/.test(apiAccessPage) || /api-key-view-name|api-key-view-value|api-key-detail-policy-heading|<dt>检索方式<\/dt>/.test(apiAccessPage) || !/<dt>Rerank 模型<\/dt>[\s\S]*<dt>最终 Top K<\/dt>[\s\S]*<dt>相关度阈值<\/dt>/.test(apiAccessPage) || !/<li class="api-key-detail-kb">' \+ dom\.escape\(knowledgeBase\.name\)/.test(apiAccessPage)) {
  fail("API 密钥查看弹窗应以静态文本展示名称和脱敏 Key；知识库只列名称；策略只列 Rerank 模型、Top K 与相关度阈值");
}
if (/table-footer|共 ['"]?\s*\+?\s*keys\.length|个 API 密钥/.test(apiAccessPage)) {
  fail("API 密钥列表不应展示无决策价值的数量 footer");
}
if (!/data-api-detail/.test(apiAccessPage) || !/data-api-toggle/.test(apiAccessPage) || !/data-api-delete/.test(apiAccessPage) || !/已启用/.test(apiAccessPage) || !/已禁用/.test(apiAccessPage)) {
  fail("API 密钥列表应统一显示已启用/已禁用，并仅提供查看、启用或禁用、删除操作");
}
if (!/\.knowledge-table\s*\{[\s\S]*?min-width:\s*99\dpx/.test(pagesStyles) || !/\.knowledge-table th:first-child,[\s\S]*?position:\s*sticky/.test(pagesStyles) || !/\.knowledge-table th:last-child,[\s\S]*?position:\s*sticky/.test(pagesStyles) || !/right:\s*0/.test(pagesStyles)) {
  fail("1024 桌面宽度下，知识库列表应收敛最小宽度并固定首列与操作列");
}

if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}

console.log(`静态检查通过：${assetReferences.length} 个资源引用、${sourceFiles.length} 个脚本。`);

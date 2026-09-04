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
const localDocumentsPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "documents.js"), "utf8");
const dataAccessPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "data-access.js"), "utf8");
const capabilitiesPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "capabilities.js"), "utf8");
const apiAccessPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "api-access.js"), "utf8");
const modelsPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "models.js"), "utf8");
const consumptionPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "consumption.js"), "utf8");
const ragPage = fs.readFileSync(path.join(demoRoot, "src", "pages", "rag.js"), "utf8");
const appSource = fs.readFileSync(path.join(demoRoot, "src", "app.js"), "utf8");
const routerSource = fs.readFileSync(path.join(demoRoot, "src", "core", "router.js"), "utf8");
const actionsSource = fs.readFileSync(path.join(demoRoot, "src", "core", "actions.js"), "utf8");
const seedSource = fs.readFileSync(path.join(demoRoot, "src", "mock", "seed.js"), "utf8");
const domSource = fs.readFileSync(path.join(demoRoot, "src", "ui", "dom.js"), "utf8");
const overlaySource = fs.readFileSync(path.join(demoRoot, "src", "ui", "overlay.js"), "utf8");
const componentsStyles = fs.readFileSync(path.join(demoRoot, "assets", "css", "components.css"), "utf8");
const pagesStyles = fs.readFileSync(path.join(demoRoot, "assets", "css", "pages.css"), "utf8");
const responsiveStyles = fs.readFileSync(path.join(demoRoot, "assets", "css", "responsive.css"), "utf8");
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
const externalSearchServiceSeedSource = seedSource.slice(externalSearchServiceSeedStart, seedSource.indexOf("\n    tools:", externalSearchServiceSeedStart));

if (!/sidebar-account-popover[\s\S]*<a class="sidebar-account-popover__action" role="menuitem" href="\.\.\/user-client\/#\/chat\/copper-decision">[\s\S]*用户端入口/.test(appSource) || /nav-item--demo-switch|renderDemoSwitch/.test(appSource)) {
  fail("运营端应仅在头像展开的账户菜单内提供用户端入口");
}

const retrievalNavigationSource = appSource.slice(appSource.indexOf('id: "retrieval"'), appSource.indexOf('id: "capabilities"'));
const capabilitiesNavigationSource = appSource.slice(appSource.indexOf('id: "capabilities"'), appSource.indexOf('id: "systemConfig"'));
const systemConfigNavigationSource = appSource.slice(appSource.indexOf('id: "systemConfig"'), appSource.indexOf("var accountNavigation"));
if (!/label:\s*"系统配置"[\s\S]*label:\s*"模型管理"[\s\S]*route:\s*"models"/.test(systemConfigNavigationSource) || /route:\s*"models"/.test(retrievalNavigationSource)) {
  fail("运营端侧栏应将模型管理放在独立的系统配置分组下");
}
if (!/label:\s*"能力管理"[\s\S]*route:\s*"skills"[\s\S]*route:\s*"visualizations"/.test(capabilitiesNavigationSource) || /analysisOutput|分析与输出/.test(appSource)) {
  fail("运营端能力管理分组应保留 Skill 与可视化能力入口");
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
if (!/state\.documents/.test(localDocumentsPage) || /state\.(?:enterpriseConnections|externalInformation)/.test(localDocumentsPage)) {
  fail("本地文档页面只能聚合本地上传文件，不得读取企业连接或外部信源内容");
}
if (/local-document-target-kb|目标知识库|继续上传|data-local-upload-files|actions\.uploadLocalDocuments/.test(localDocumentsPage) || !/pages\.knowledge\.renderLocalImport/.test(localDocumentsPage) || !/pages\.knowledge\.mountLocalImport/.test(localDocumentsPage) || !/actions\.deleteLocalDocumentAsset/.test(localDocumentsPage)) {
  fail("文档管理应从上传步骤直接复用知识库导入页及事件，不保留目标知识库选择或独立上传弹窗；删除覆盖全部处理实例");
}
if (!/sourceType\s*=\s*input\.sourceType\s*\|\|\s*"local_upload"/.test(actionsSource) || !/localAssetId:\s*input\.localAssetId\s*\|\|\s*documentId/.test(actionsSource) || !/TEMPLATE\.documents\.forEach[\s\S]*localAssetId\s*=\s*item\.localAssetId\s*\|\|\s*item\.id[\s\S]*sourceType\s*=\s*"local_upload"/.test(seedSource)) {
  fail("种子与新增文件都应以 localAssetId 标识本地原文件，并显式排除信源引用");
}
if (/所属知识库|data-local-document-kb/.test(localDocumentsPage) || !/<th>文档<\/th><th>状态<\/th><th>大小<\/th><th>上传时间<\/th><th>操作<\/th>/.test(localDocumentsPage)) {
  fail("本地文档列表不得展示所属知识库，应保持五列文件资产视图");
}
if (!/local-documents\/"\s*\+\s*button\.dataset\.localDocumentPreview/.test(localDocumentsPage) || !/data-local-preview-kb-select/.test(localDocumentsPage) || !/back:\s*\{\s*label:\s*"返回文档管理",\s*route:\s*"local-documents"/.test(localDocumentsPage) || /data-preview-document-select/.test(localDocumentsPage)) {
  fail("文档预览应使用独立路径、返回文档管理，并以知识库切换替代同库文件切换");
}
if (!/var disabled = bindings\.length <= 1 \? " disabled" : ""/.test(localDocumentsPage) || !/data-local-preview-kb-select=[\s\S]*disabled \+/.test(localDocumentsPage)) {
  fail("知识库切换应始终使用同一下拉组件，只有一个选项时禁用展示");
}
if (!/routeName === "document-processing"[\s\S]*routeName = "knowledge"/.test(routerSource)) {
  fail("历史文档处理策略地址应安全返回知识库");
}

if (/label:\s*"Tool 目录"|route:\s*"tools"/.test(appSource) || /tools:\s*\{\s*page:\s*"tools"/.test(routerSource) || /OpsDemo\.pages\.tools/.test(capabilitiesPage)) {
  fail("运营端不应保留 Tool 目录导航、独立页面路由或页面注册");
}
if (/Tool 目录|接入 Tool|tool\.json|data-capability-kind="tools"/.test(capabilitiesPage)) {
  fail("Skill 页面脚本不应残留不可达的 Tool 接入、编辑或独立目录 UI 分支");
}
if (!/routeName === "tools"[\s\S]*routeName = "skills"/.test(routerSource) || !/normalizeLegacyHash/.test(routerSource)) {
  fail("历史 Tool 目录地址应归并到 Skill 目录，不能留下死页面");
}
if (!/<th>包含的 Tool<\/th>/.test(capabilitiesPage) || !/calledToolTags/.test(capabilitiesPage) || !/tools:\s*\[/.test(seedSource)) {
  fail("删除独立 Tool 目录后仍须保留 Tool 数据及 Skill 列表中的只读依赖信息");
}
if (/goldenCaseTrace|renderGoldenCaseTrace|data-golden-case-trace|美国关税三情景研判|与调用侧 Demo 的任务配置快照一致/.test(seedSource + knowledgePage)) {
  fail("知识库首页不应保留跨 Demo 黄金案例追溯卡或专用种子数据");
}
if (!/src\/pages\/data-access\.js/.test(indexHtml) || !/label:\s*"数据接入"[\s\S]*label:\s*"企业数据"[\s\S]*route:\s*"enterprise-connections"[\s\S]*label:\s*"检索服务"[\s\S]*route:\s*"external-information"/.test(appSource)) {
  fail("运营端应加载数据接入页面，并在侧栏提供企业数据和检索服务入口");
}
if (!/"enterprise-connections":\s*\{\s*page:\s*"enterpriseConnections",\s*title:\s*"企业数据",\s*group:\s*"dataAccess"/.test(routerSource) || !/"external-information":\s*\{\s*page:\s*"externalInformation",\s*title:\s*"检索服务",\s*group:\s*"dataAccess"/.test(routerSource)) {
  fail("企业数据和检索服务应注册为数据接入分组下的独立路由");
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
if (/toolPickerHtml|data-capability-tool-id|选择该 Skill 在执行时调用的系统 Tool|添加后默认停用/.test(capabilitiesPage)) {
  fail("Skill 上传和编辑不应要求运营人员手工绑定 Tool，也不应显示默认停用提示");
}
if (!/data-capability-package-empty/.test(capabilitiesPage) || !/data-capability-package-selected/.test(capabilitiesPage) || !/data-capability-package-remove/.test(capabilitiesPage) || !/resetSelection/.test(capabilitiesPage)) {
  fail("Skill 上传应在选择单个目录后收起上传区，并支持删除已选目录后重新选择");
}
if (!/\.capability-package-summary\[hidden\]\s*\{[\s\S]*?display:\s*none;/.test(pagesStyles)) {
  fail("Skill 尚未选择目录时不应显示空的已选目录摘要容器");
}
const skillListSource = capabilitiesPage.slice(capabilitiesPage.indexOf("function skillRowActions"), capabilitiesPage.indexOf("function skillById"));
if (!/data-capability-detail/.test(skillListSource) || !/data-capability-toggle/.test(skillListSource) || !/data-capability-delete/.test(skillListSource) || /uploadedSkillActions|data-capability-edit/.test(skillListSource)) {
  fail("Skill 列表不应区分内置与上传来源；每项均应提供查看、启停和删除，不再放独立编辑入口");
}
if (!/data-capability-delete[\s\S]*enabled\(item\)[\s\S]*disabled/.test(skillListSource)) {
  fail("Skill 删除必须在启用时置灰，停用后才允许执行");
}
const skillDrawerSource = capabilitiesPage.slice(capabilitiesPage.indexOf("function skillEditorHtml"), capabilitiesPage.indexOf("function confirmSkillToggle"));
const skillDrawerHeaderSource = capabilitiesPage.slice(capabilitiesPage.indexOf("function mountSkillDrawerHeader"), capabilitiesPage.indexOf("function openSkillDetail"));
if (!/item\.name/.test(skillDrawerHeaderSource) || !/<small>Skill<\/small>/.test(skillDrawerHeaderSource) || !/本月调用/.test(skillDrawerHeaderSource) || !/role="switch"/.test(skillDrawerHeaderSource) || !/data-skill-drawer-toggle/.test(skillDrawerHeaderSource)) {
  fail("Skill 抽屉 header 应展示实际名称、灰色 Skill、本月调用和与列表同款的启停开关");
}
if (!/data-skill-name/.test(skillDrawerSource) || !/data-skill-description/.test(skillDrawerSource) || !/required aria-required="true"/.test(skillDrawerSource) || !/confirmLabel:\s*["']保存修改["']/.test(skillDrawerSource) || !/data-overlay-confirm/.test(skillDrawerSource) || !/SKILL\.md/.test(skillDrawerSource) || !/data-skill-markdown-content/.test(skillDrawerSource) || !/renderSkillMarkdownHtml/.test(skillDrawerSource) || !/markdown\.innerHTML/.test(skillDrawerSource) || !/footer\.hidden\s*=\s*!dirty/.test(skillDrawerSource) || !/save\.hidden\s*=\s*!dirty/.test(skillDrawerSource)) {
  fail("Skill 抽屉正文应直排名称、描述和渲染后的 SKILL.md，并仅在编辑后显示保存操作");
}
if (/基本信息|section class="panel|skill-markdown-panel|skill-markdown-preview|<code data-skill-markdown-content/.test(skillDrawerSource)) {
  fail("Skill 抽屉不应嵌套基本信息卡片或展示 SKILL.md 原始源码");
}
if (!/\.drawer__footer\[hidden\][\s\S]*?display:\s*none;/.test(componentsStyles)) {
  fail("Skill 未编辑时必须完整隐藏抽屉保存区域");
}
if (/calledToolTags|包含的 Tool|调用的 Tool|data-capability-edit|data-capability-delete|来源|产品内置|运营端添加|包信息|添加时间|dom\.status\s*\(/.test(skillDrawerSource)) {
  fail("Skill 抽屉不应展示 Tool、来源或包技术信息，也不应放独立编辑、删除或文字状态");
}
if (/#\/tools|上传 Skill 或 Tool/.test(seedSource)) {
  fail("运营流程数据不应再指向 Tool 目录或表达 Tool 上传入口");
}

globalThis.addEventListener = globalThis.addEventListener || function addEventListenerStub() {};
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
if (/tab=imports|导入记录/.test(knowledgePage)) {
  fail("知识库详情不应保留导入记录页签、入口或历史台账文案");
}
if (!/data-kb-test/.test(knowledgePage) || !/data-kb-open/.test(knowledgePage) || !/data-kb-edit/.test(knowledgePage) || !/data-kb-delete/.test(knowledgePage) || !/data-kb-open[^>]*>\s*详情\s*</.test(knowledgePage)) {
  fail("知识库列表应提供测试、详情、编辑和删除四个操作，且不再使用“查看”命名");
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
if (!/function\s+renderKnowledgeContentTabs/.test(knowledgePage) || !/data-knowledge-content-tab="documents"/.test(knowledgePage) || !/data-knowledge-content-tab="chunks"/.test(knowledgePage) || !/data-quick-chunk-document-select/.test(knowledgePage) || !/data-chunk-full-preview/.test(knowledgePage)) {
  fail("知识库详情应使用文件/切片页签，并提供文件切换与完整切片预览快入口");
}
if (/knowledge-files"><div class="panel__header"><h2 class="panel__title">文件/.test(knowledgePage)) {
  fail("文件页签外不应保留重复的文件面板标题行");
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
if (!/var preview = OpsDemo\.ui\.preview/.test(knowledgePage) || !/preview\.split\s*\(\{/.test(knowledgePage) || !/data-preview-document-select/.test(knowledgePage) || !/chunk-preview-card/.test(knowledgePage)) {
  fail("源文档与切片预览应复用通用 Preview 组件，并支持切换文件和显示切片卡片");
}
const documentPreviewSource = knowledgePage.slice(knowledgePage.indexOf("function renderChunkCards"), knowledgePage.indexOf("function openCreateKnowledgeBase"));
if (!/data-preview-document-download/.test(documentPreviewSource) || !/下载原文件/.test(documentPreviewSource) || !/全部切片（/.test(documentPreviewSource)) {
  fail("文件预览工具区应支持下载原文件，并以“全部切片（N）”展示真实卡片数量");
}
if (!/data-chunk-preview-card/.test(documentPreviewSource) || !/aria-expanded="false"/.test(documentPreviewSource) || !/is-expanded/.test(knowledgePage) || !/setAttribute\("aria-expanded"/.test(knowledgePage)) {
  fail("切片卡片应支持单张展开、再次点击及点击外部收起，并同步 aria-expanded");
}
if (/chunk-preview-list__summary|代表切片/.test(documentPreviewSource)) {
  fail("文件预览不得用代表切片汇总掩盖实际渲染数量");
}
if (!/confirmDocumentReplacement/.test(knowledgePage) || !/data-confirm-document-replacement/.test(knowledgePage) || !/内容相同，已跳过/.test(knowledgePage) || !/重新生成向量/.test(knowledgePage) || !/Embedding Token 消耗/.test(knowledgePage)) {
  fail("导入界面应回显同内容跳过，并为异内容替换提供确认及向量 Token 影响提示");
}
if (!/function\s+requiredLabel/.test(domSource) || !/form-label--required/.test(domSource) || !/form-required-mark/.test(domSource) || !/aria-hidden="true">\*/.test(domSource) || !/\.form-required-mark\s*\{[\s\S]*?color:\s*var\(--danger\)/.test(componentsStyles)) {
  fail("所有必填项应复用 requiredLabel 与统一红色星号，不在页面中自行拼接");
}
if (/function\s+capabilitySummary\b|capabilitySummary\s*\(/.test(capabilitiesPage)) {
  fail("Skill 目录不应恢复汇总指标条");
}
const visualizationV2Source = capabilitiesPage.slice(capabilitiesPage.indexOf("function renderVisualCardV2"));
if (!/数据样例/.test(visualizationV2Source) || !/data-visual-data/.test(visualizationV2Source)) {
  fail("可视化详情应以可编辑的“数据样例”提供预览交互");
}
if (/toolCode:\s*["']generate_spreadsheet["']|toolCode:\s*["']generate_gauge_chart["']/.test(seedSource)) {
  fail("可视化种子数据不应包含 generate.js 未映射的表格或仪表盘");
}
if (/RAG 模型台账|服务信息边界|引用配置|查看引用|模型 ID|版本 \/ 规格|服务来源/.test(modelsPage)) {
  fail("模型管理不应展示版本、内部 ID、服务来源或引用关系等技术台账信息");
}
if (/model-summary/.test(modelsPage + pagesStyles)) {
  fail("模型名称下方不应保留预览说明小字或其专属样式");
}
if (!/data-model-group="' \+ group\.kind \+ '"/.test(modelsPage) || !/向量模型/.test(modelsPage) || !/Rerank 模型/.test(modelsPage) || /title:\s*"LLM"|kind:\s*"parser"|文档解析服务（非模型）/.test(modelsPage)) {
  fail("模型管理应只将向量模型与 Rerank 模型分为上下两个独立表格板块");
}
if (!/<th>连接状态<\/th>/.test(modelsPage) || /<th>状态<\/th>|<th>最近测试<\/th>/.test(modelsPage)) {
  fail("模型列表应将状态和最近测试合并为单一“连接状态”列");
}
if (!/var columns = '<colgroup><col class="models-table__col models-table__col--name"><col class="models-table__col models-table__col--dimension"><col class="models-table__col models-table__col--connection"><col class="models-table__col models-table__col--actions"><\/colgroup>'/.test(modelsPage) || !/var dimensionHeader = group\.kind === "embedding" \? "向量维度" : ""/.test(modelsPage) || !/: '<td class="models-table__dimension" aria-label="不适用"><\/td>'/.test(modelsPage) || !["name", "dimension", "connection", "actions"].every((column) => new RegExp(`\\.models-table__col--${column}\\s*\\{[\\s\\S]*?width:\\s*\\d+%`).test(pagesStyles)) || /\.models-table--embedding\s+(?:th|td):nth-child/.test(pagesStyles)) {
  fail("向量与 Rerank 表应复用同一四列宽度契约，Rerank 以空维度单元格保留连接状态对齐位置");
}
if (/[\s'\"]data-model-view/.test(modelsPage) || !/[\s'\"]data-model-test/.test(modelsPage) || !/[\s'\"]data-model-edit/.test(modelsPage) || !/[\s'\"]data-model-delete/.test(modelsPage)) {
  fail("模型列表应仅提供测试、编辑和删除动作，不再重复提供查看");
}
if (!/class="model-editor"/.test(modelsPage) || !/title:\s*current\s*\?\s*"编辑模型"\s*:\s*"新增模型"/.test(modelsPage) || /模型详情/.test(modelsPage)) {
  fail("新增与编辑应复用同一弹窗表单，不再保留独立详情弹窗");
}
if ((modelsPage.match(/data-model-kind-card/g) || []).length < 2 || !/name="model-kind" value="embedding"/.test(modelsPage) || !/name="model-kind" value="reranker"/.test(modelsPage) || /name="model-kind" value="(?:llm|parser)"/.test(modelsPage)) {
  fail("新增模型时应使用两张卡片选择向量模型或 Rerank 模型");
}
if (!/model-editor__primary-row' \+ \(kind === "embedding" \? " has-dimension" : ""\)/.test(modelsPage) || !/primaryRow\.classList\.toggle\("has-dimension", isEmbedding\)/.test(modelsPage) || !/\.model-editor__primary-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/.test(pagesStyles) || !/\.model-editor__primary-row\.has-dimension\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 142px/.test(pagesStyles) || !/data-model-dimension-field aria-hidden="' \+ \(kind === "embedding" \? "false" : "true"\)/.test(modelsPage) || !/id="model-dimension"[^>]*readonly data-model-field="dimension"/.test(modelsPage) || /placeholder="[^"]*(?:连接|测试)[^"]*(?:读取|出现)[^"]*"|is-placeholder/.test(modelsPage)) {
  fail("模型名称应按维度字段是否出现自适应占满或让位；维度只读且不显示“连接/测试后出现”占位文案");
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
if (!/function\s+ragModelUsageFromState[\s\S]*boundEmbeddingModelId\s*===\s*id[\s\S]*operator\.rerankEnabled\s*&&\s*operator\.rerankerModelId\s*===\s*id/.test(actionsSource) || !/ragModelUsageFromState\(state, kind, id\)\.length/.test(actionsSource)) {
  fail("删除模型前必须阻断知识库绑定的向量模型和全局检索设置正在使用的 Rerank 模型");
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
const consumptionSummaryLabels = Array.from(consumptionRenderSource.matchAll(/summaryCell\("([^"]+)"/g), (match) => match[1]);
if (JSON.stringify(consumptionSummaryLabels) !== JSON.stringify(["API 请求次数", "输入 Token", "输出 Token"]) || /推理调用次数/.test(consumptionRenderSource)) {
  fail("消耗统计摘要应且仅应按 API 请求次数、输入 Token、输出 Token 三项展示");
}
if (!/data-consumption-token/.test(consumptionPage) || !/data-consumption-request/.test(consumptionPage) || !/stack:\s*"token"/.test(consumptionPage) || !/<h2 class="panel__title">Token 消耗<\/h2>/.test(consumptionRenderSource) || !/<h2 class="panel__title">API 请求次数<\/h2>/.test(consumptionRenderSource) || /dom\.escape\(range\.label\) \+ ' (?:Token 消耗|API 请求)/.test(consumptionRenderSource)) {
  fail("消耗统计应以固定标题展示 Token 堆叠柱状图和 API 请求次数折线图，标题不随时间范围变化");
}
if (!/role="group" aria-label="自定义日期范围"/.test(consumptionPage) || !/data-consumption-start/.test(consumptionPage) || !/data-consumption-end/.test(consumptionPage) || !/addEventListener\("change"/.test(consumptionPage) || /data-consumption-apply/.test(consumptionPage)) {
  fail("自定义日期应使用单一组合框，并在选择日期后直接生效，不保留应用按钮");
}
if (!/"today"[\s\S]*"yesterday"[\s\S]*"last7"[\s\S]*"last30"[\s\S]*"week"[\s\S]*"month"[\s\S]*"custom"/.test(consumptionPage) || /每日明细/.test(consumptionPage)) {
  fail("消耗统计应保留全部时间范围并不提供每日明细表");
}

const creationStepLabels = ["定义知识库", "导入文件", "文档解析", "文档处理"];
if (!creationStepLabels.every((label) => knowledgePage.includes(label)) || ![1, 2, 3, 4].every((step) => new RegExp(`renderCreationSteps\\(${step}(?:,|\\))`).test(knowledgePage))) {
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
if (!/<option value="" selected disabled>请选择向量模型<\/option>/.test(createKnowledgeSource) || !/<option value="" selected disabled>请选择访问等级<\/option>/.test(createKnowledgeSource) || /models\.map[\s\S]*index === 0 \? " selected"/.test(createKnowledgeSource)) {
  fail("新建知识库第 1 步的向量模型和访问等级均不得预选默认值");
}
if (!/type="file"[^>]*multiple[^>]*accept=/.test(knowledgePage) || !/addEventListener\("drop"/.test(knowledgePage) || !/upload-file-row__icon[\s\S]*upload-file-row__name[\s\S]*upload-file-row__status[\s\S]*data-upload-remove/.test(knowledgePage)) {
  fail("导入步骤应支持多选/拖放，并生成含格式图标、名称、状态和删除动作的逐文件行");
}
if (!/status:\s*"importing"/.test(knowledgePage) || !/finishLocalImport[\s\S]*entry\.status = "imported"/.test(knowledgePage) || !/allImported[\s\S]*uploadStart\.disabled/.test(knowledgePage)) {
  fail("文件选择后应先显示导入中，再变为已导入，并在全部完成前禁用导入动作");
}
if (/name="parse-effort"|解析精细度/.test(knowledgePage)) {
  fail("MinerU 解析模式应由识别内容自动派生，不再暴露精细度选择");
}
if (!/value="auto"/.test(knowledgePage) || !/value="txt"/.test(knowledgePage) || !/value="ocr"/.test(knowledgePage) || !["parse-text-content", "parse-layout-structure", "parse-table", "parse-formula", "parse-visual-understanding"].every((id) => knowledgePage.includes(id))) {
  fail("MinerU 解析步骤应覆盖解析方法、必选基础内容与可选增强内容");
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
if (!/function\s+createProcessingDraft/.test(processingStepSource) || !/group:\s*"processing-family"/.test(processingStepSource) || !/group:\s*"processing-method"/.test(processingStepSource) || !/data-processing-param="maxChars"[\s\S]*data-processing-param="overlapPercent"[\s\S]*关联信息[\s\S]*索引内容/.test(processingStepSource)) {
  fail("文档处理必须只在知识库导入流程中完整保留策略选择与本次参数编辑");
}
if (!["smart", "semantic", "structure", "recursive", "separator", "page", "whole_document"].every((mode) => processingStepSource.includes(mode)) || !/data-processing-param="separatorType"/.test(processingStepSource) || !/data-processing-param="pagesPerChunk"/.test(processingStepSource) || !/data-processing-param="semanticSensitivity"/.test(processingStepSource)) {
  fail("流程内文档处理应完整覆盖自动、语义及自定义下的结构、递归、分隔符、按页和整篇方案");
}
if (!/class="vector-cost-notice semantic-cost-notice" role="note">[\s\S]*语义边界效果需用真实问题集验证[\s\S]*入库时会增加句段 Embedding 消耗与处理耗时[\s\S]*查询阶段不会新增这类切片模型调用/.test(processingStepSource) || /semantic-impact|semantic-impact__item|效果与消耗说明/.test(processingStepSource)) {
  fail("语义切片只应使用一行轻提示说明效果验证、入库 Embedding 消耗和查询阶段边界");
}
if (!/flow=import/.test(knowledgePage) || !/data-existing-import/.test(knowledgePage) || !/importStepRoute\([^\n]*"parse"/.test(knowledgePage)) {
  fail("向已有知识库新增文件也应统一经过导入、解析和可编辑的文档处理步骤");
}
const knowledgeDocumentsSource = knowledgePage.slice(knowledgePage.indexOf("function renderDocumentsTab"), knowledgePage.indexOf("function renderCreationSteps"));
if (!/<th>文件<\/th>[\s\S]*<th>文件状态<\/th>[\s\S]*<th>切片数<\/th>[\s\S]*<th>导入时间<\/th>[\s\S]*<th>操作<\/th>/.test(knowledgeDocumentsSource) || /当前修订|有效等级|<th>页数<\/th>|<th>处理状态<\/th>|<th>检索状态<\/th>/.test(knowledgeDocumentsSource)) {
  fail("知识库文件列表应只显示单一文件生命周期与切片数，不展示版本、文件等级、页数或双状态");
}
const knowledgeInfoSource = knowledgePage.slice(knowledgePage.indexOf("function renderKnowledgeInfo"), knowledgePage.indexOf("function renderDocumentsTab"));
if (!/知识库 ID/.test(knowledgeInfoSource) || !/访问等级/.test(knowledgeInfoSource) || !/描述/.test(knowledgeInfoSource) || !/向量模型/.test(knowledgeInfoSource) || !/renderKnowledgePipeline/.test(knowledgeInfoSource) || /文件数量|文档处理策略/.test(knowledgeInfoSource)) {
  fail("知识库详情信息应采用基础信息加处理状态链两行结构，包含访问等级且不重复文件数量或文件级策略");
}
if (!/data-test-kb/.test(knowledgePage) || !/data-open-retrieval-test/.test(ragPage)) {
  fail("知识库详情与检索配置都应提供检索测试快捷入口");
}
if (!/retrieval-studio__settings[\s\S]*aria-label="检索测试设置"/.test(ragPage) || !/retrieval-chat[\s\S]*aria-label="检索测试结果"/.test(ragPage) || /模拟访问等级/.test(ragPage)) {
  fail("检索测试应为设置/结果左右工作区，且不得提供模拟访问等级");
}
if (/retrieval-chat__header|retrieval-chat__state|<h2>测试对话<\/h2>/.test(ragPage)) {
  fail("检索测试右侧不应重复展示测试对话标题、当前配置或完成状态");
}
const retrievalSettingsSource = ragPage.slice(ragPage.indexOf("function renderRetrievalSettings"), ragPage.indexOf("function renderRag"));
const retrievalTestSource = ragPage.slice(ragPage.indexOf("function retrievalResultSummary"), ragPage.indexOf("OpsDemo.pages.rag"));
if (!/返回切片数[\s\S]*有效证据数[\s\S]*证据覆盖度[\s\S]*结果相关性/.test(retrievalTestSource)) {
  fail("检索测试应以返回切片数、有效证据数、证据覆盖度和结果相关性四项运营指标解释结果");
}
if (!/\.retrieval-kb-option--evaluation\s*\{[\s\S]*?color:\s*#[0-9a-f]+;[\s\S]*?background:\s*#[0-9a-f]+;/.test(pagesStyles)) {
  fail("检索测试的评测库首项应使用稳定的专属前景色和背景色");
}
if (!/\.retrieval-result-summary--evaluation\s*>\s*div\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;[\s\S]*?grid-template-rows:\s*auto auto;/.test(pagesStyles) || !/\.retrieval-result-summary--evaluation\s*>\s*div\s*>\s*strong\s*\{[\s\S]*?grid-row:\s*1 \/ -1;[\s\S]*?justify-self:\s*end;/.test(pagesStyles) || !/@container\s*\(max-width:\s*760px\)[\s\S]*?\.retrieval-result-summary--evaluation\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/.test(pagesStyles)) {
  fail("检索评测卡应采用左侧标题、右侧分数，并在右侧工作区变窄时切换为两列");
}
const retrievalTestControlOrder = ['retrievalKnowledgeBasePicker(state.knowledgeBases, kbId)', "检索方式", "<h3>Rerank</h3>", 'id="test-final-topk"', 'relevanceSlider("test-relevance"'].map((label) => retrievalTestSource.indexOf(label));
if (retrievalTestControlOrder.some((index) => index < 0) || !retrievalTestControlOrder.every((index, position) => position === 0 || retrievalTestControlOrder[position - 1] < index)) {
  fail("检索测试侧栏应按知识库、检索方式、Rerank 与通用结果参数的顺序组织");
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
if (/retrievalRunSnapshot|retrieval-run-snapshot|本次检索配置|本次检索方式：|召回候选数：/.test(retrievalTestSource)) {
  fail("检索结果区不应重复展示侧栏已经提供的本次检索配置");
}
if (!/rerankerModelId:\s*rerankEnabled\s*\?[^:]+:\s*null/.test(retrievalTestSource) || !/deriveRetrievalPlan[\s\S]*fusionCandidates[\s\S]*fixture\s*=\s*fixture\.slice\(0,\s*derivedPlan\.fusionCandidates\)/.test(actionsSource)) {
  fail("关闭 Rerank 时应清空模型覆盖值，候选规模由系统派生计划约束");
}
if (!/\.retrieval-test-page\s*\{[\s\S]*?height:\s*calc\(100(?:d)?vh\s*-\s*var\(--header-height\)\s*-\s*1px\);[\s\S]*?overflow:\s*hidden;/.test(pagesStyles) || !/\.retrieval-studio\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/.test(pagesStyles) || !/\.retrieval-message--result \.retrieval-message__content\s*\{[\s\S]*?max-width:\s*none;/.test(pagesStyles)) {
  fail("检索测试页应锁定在视口内，并让结果内容自适应使用可用宽度");
}
if (!/function\s+hybridRetrievalComposition[\s\S]*混合检索[\s\S]*retrieval-keyword-weight[\s\S]*关键词检索[\s\S]*语义检索/.test(ragPage) || !/检索方式[\s\S]*hybridRetrievalComposition\(operator, system\)/.test(retrievalSettingsSource) || /retrieval-system-flow__connector/.test(ragPage)) {
  fail("混合检索应以包含关系展示，并提供关键词\/语义融合权重 Slider");
}
if (/retrieval-system-capabilities|retrieval-advanced|<summary>高级设置<\/summary>/.test(retrievalSettingsSource)) {
  fail("系统检索能力不应使用零散小标签，召回候选也不应藏在高级设置中");
}
if (!/data-rerank-toggle/.test(retrievalSettingsSource) || !/id="retrieval-reranker-model"/.test(retrievalSettingsSource) || !/id="retrieval-keyword-weight"/.test(ragPage) || !/id="retrieval-final-topk"/.test(retrievalSettingsSource) || !/relevanceSlider\("retrieval-relevance"/.test(retrievalSettingsSource) || /retrieval-rerank-candidates|retrieval-max-per-document/.test(ragPage)) {
  fail("运营可配置项应只包含混合权重、Rerank 开关\/模型、Top K 和相关性阈值");
}
if (!/function\s+relevanceSlider[\s\S]*type="range"[\s\S]*min="0\.4" max="0\.9" step="0\.1"[\s\S]*aria-valuetext=[\s\S]*data-relevance-range/.test(ragPage) || !/function\s+syncRelevanceSlider[\s\S]*data-relevance-value[\s\S]*aria-valuetext/.test(ragPage) || !/function\s+relevanceSliderValue/.test(ragPage)) {
  fail("相关性要求应复用可键盘操作的 0.4–0.9 分数 Slider，并同步可访问值说明");
}
if (!/最低相关度/.test(ragPage) || !/仅返回相关度 ≥/.test(ragPage) || !/开启 Rerank 时使用重排分，关闭时使用融合分/.test(ragPage) || !/宽松[\s\S]*0\.4–0\.5[\s\S]*均衡[\s\S]*0\.6–0\.7[\s\S]*严格[\s\S]*0\.8–0\.9/.test(ragPage)) {
  fail("相关性 Slider 应配套三张分数解释卡，并说明门槛与 Rerank 开关下的分数来源");
}
if (/relevanceChoice|relevanceOptions|retrieval-level-card|name="retrieval-relevance"/.test(ragPage + pagesStyles)) {
  fail("相关性要求不应残留旧的单选、下拉或等级卡控件");
}
if (!/\.retrieval-relevance-cards[\s\S]*repeat\(3/.test(pagesStyles) || !/\.retrieval-relevance-card\.is-active/.test(pagesStyles) || !/\.retrieval-relevance-slider__input::-webkit-slider-runnable-track[\s\S]*var\(--relevance-progress\)/.test(pagesStyles) || !/\.retrieval-relevance-slider__input:focus-visible/.test(pagesStyles) || !/\.retrieval-relevance-slider__scale/.test(pagesStyles)) {
  fail("相关性控件应展示三张解释卡、六档刻度、进度和清晰的键盘焦点样式");
}
if (!/relevanceThreshold:\s*relevanceThreshold/.test(ragPage) || !/relevanceThresholdFromOperator\(value\)\.toFixed\(1\)/.test(ragPage) || !/operator\.relevanceThreshold/.test(actionsSource)) {
  fail("检索配置、测试快照与运行参数比较必须使用精确的数值相关度门槛");
}
if (!/evidence-item__score/.test(ragPage) || !/item\.retrievalScore/.test(ragPage) || !/scoreSource/.test(ragPage + actionsSource) || !/\.evidence-item__score/.test(pagesStyles)) {
  fail("每条检索证据必须展示本次实际用于排序和过滤的相关度及分数来源");
}
if (!/data-save-retrieval-settings/.test(retrievalSettingsSource) || !/previewRetrievalSettings/.test(retrievalSettingsSource) || !/settings=preview/.test(retrievalSettingsSource) || !/不会重新解析文件、切片或生成向量/.test(retrievalSettingsSource)) {
  fail("全局检索设置应支持直接保存与未保存设置测试，并明确不触发知识库重新处理");
}
if (!/function\s+retrievalKnowledgeBasePicker[\s\S]*id="test-kb-v2"/.test(ragPage) || !/retrievalKnowledgeBasePicker\(state\.knowledgeBases, kbId\)/.test(retrievalTestSource) || /id="test-profile"|retrievalProfileOptions|comparisonProfileId|currentRetrievalProfile/.test(ragPage)) {
  fail("检索测试应选择知识库并基于全局设置快捷调参，不再选择配置版本或绑定知识库");
}
if (!/data-test-rerank-toggle/.test(retrievalTestSource) || !/id="test-reranker-model"/.test(retrievalTestSource) || !/id="test-final-topk"/.test(retrievalTestSource) || !/relevanceSlider\("test-relevance"/.test(retrievalTestSource) || /id="test-rerank-candidates"/.test(retrievalTestSource)) {
  fail("检索测试左侧应复用 Rerank、模型、Top K 和相关性快捷控件，不暴露系统候选规模");
}
if (!/\(compact \? "" : relevanceCards\(band\)\)/.test(ragPage)) {
  fail("相关度区间解释卡只应出现在检索配置页，紧凑测试控件不得重复渲染");
}
if (!/retrieval-chat__evaluation[\s\S]*retrieval-chat__body/.test(retrievalTestSource) || /retrieval-message__label">测试问题/.test(retrievalTestSource)) {
  fail("评测指标应固定在右侧工作区顶部，问题气泡不得重复显示测试问题标题");
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
if (!/<footer class="retrieval-composer"><textarea[\s\S]*id="test-question-v2"[\s\S]*<\/textarea>'\s*\+\s*dom\.button\("检索"[\s\S]*data-run-test-v2/.test(retrievalTestSource) || /retrieval-composer__input-shell|retrieval-composer__send/.test(retrievalTestSource + pagesStyles)) {
  fail("检索输入区应由 footer 直接承载输入框与按钮，不再重复嵌套容器");
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
  fail("动作层应校验新递归模式与既有方案，并继续读取历史 fixed 模式");
}
if (!/value:\s*"recursive",\s*title:\s*"递归切块"/.test(processingStepSource) || /value:\s*"fixed"/.test(processingStepSource)) {
  fail("自定义方法卡片必须以递归切块替代固定长度");
}
const customProcessingMethods = Array.from(processingStepSource.matchAll(/value:\s*"(structure|recursive|separator|page|whole_document)",\s*title:\s*"([^"]+)"/g), (match) => [match[1], match[2]]);
if (JSON.stringify(customProcessingMethods) !== JSON.stringify([["structure", "结构切片"], ["recursive", "递归切块"], ["separator", "分隔符切片"], ["page", "按页切片"], ["whole_document", "整篇切片"]])) {
  fail("自定义方法定义必须按结构、递归、分隔符、按页、整篇排序，并使用完整名称");
}
if (!/<input\b(?=[^>]*\bdata-processing-param="maxChars")(?=[^>]*\bmin="200")(?=[^>]*\bmax="10000")(?=[^>]*\bstep="1")[^>]*>/.test(processingStepSource) || !/重叠率为上限[\s\S]*完整边界/.test(processingStepSource)) {
  fail("字符上限控件应支持整数步长，并保留递归重叠率上限和完整边界提示");
}
const legacyFixedPresetStart = seedSource.indexOf('id: "ING-FIXED"');
const legacyFixedPresetEnd = seedSource.indexOf('\n          id:', legacyFixedPresetStart + 1);
const legacyFixedPresetSource = seedSource.slice(legacyFixedPresetStart, legacyFixedPresetEnd < 0 ? undefined : legacyFixedPresetEnd);
if (legacyFixedPresetStart < 0 || !/mode:\s*"fixed"/.test(legacyFixedPresetSource) || !/visible:\s*false/.test(legacyFixedPresetSource) || !/displayGroup:\s*"internal"/.test(legacyFixedPresetSource)) {
  fail("ING-FIXED 必须保留原模式并隐藏，仅供历史记录兼容");
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
const processingSeparatorBranchStart = processingStepSource.indexOf('if (mode === "separator")');
const processingSeparatorBranchEnd = processingStepSource.indexOf('if (mode === "page")', processingSeparatorBranchStart);
const processingSeparatorRadioSource = processingStepSource.slice(processingSeparatorBranchStart, processingSeparatorBranchEnd);
const processingWholeBranchStart = processingStepSource.indexOf('if (mode === "whole_document")', processingSeparatorBranchEnd);
const processingPageParameterSource = processingStepSource.slice(processingSeparatorBranchEnd, processingWholeBranchStart);
const processingWholeParameterSource = processingStepSource.slice(processingWholeBranchStart, processingStepSource.indexOf("return '<section", processingWholeBranchStart));
if (processingWholeBranchStart < 0 || !/data-processing-param="pagesPerChunk"/.test(processingPageParameterSource) || /data-processing-param="(?:maxChars|overlapPercent)"/.test(processingPageParameterSource) || !/连续/.test(processingPageParameterSource) || !/解析/.test(processingPageParameterSource)) {
  fail("按页切片应提供专用连续页数参数和解析分页前提，不显示字符上限或重叠率");
}
if (!/data-processing-param="longDocumentFallback"/.test(processingWholeParameterSource) || !/value="smart"[\s\S]*value="stop"/.test(processingWholeParameterSource) || !/maxDocumentChars/.test(processingWholeParameterSource) || /data-processing-param="(?:maxChars|overlapPercent|pagesPerChunk)"/.test(processingWholeParameterSource)) {
  fail("整篇切片应解释已有文档长度阈值，并只提供自动切片或停止的超长处理选项");
}
const processingSeparatorOptionValues = Array.from(processingSeparatorRadioSource.matchAll(/\{\s*value:\s*"([^"]+)",\s*token:/g), (match) => match[1]);
const expectedProcessingSeparatorValues = ["paragraph", "newline", "zh_period", "zh_exclamation", "zh_question", "en_period", "en_exclamation", "en_question"];
if (processingSeparatorBranchStart < 0 || processingSeparatorBranchEnd < 0 || JSON.stringify(processingSeparatorOptionValues) !== JSON.stringify(expectedProcessingSeparatorValues) || !/<select id="processing-separator-type" hidden data-processing-param="separatorType"[\s\S]*?data-processing-separator-source/.test(processingSeparatorRadioSource) || !/data-processing-separator-trigger/.test(processingSeparatorRadioSource) || !/role="combobox"[\s\S]*?aria-required="true"/.test(processingSeparatorRadioSource) || !/role="listbox"/.test(processingSeparatorRadioSource)) {
  fail("分隔符切片应使用一个保留标准表单值的自定义下拉，并按稳定顺序提供八个字符边界");
}
if (!/value:\s*"paragraph",\s*token:\s*"\\\\n\\\\n",\s*name:\s*"段落\s*\/\s*空行"/.test(processingSeparatorRadioSource) ||
    !/value:\s*"newline",\s*token:\s*"\\\\n",\s*name:\s*"每次换行"/.test(processingSeparatorRadioSource) ||
    !/value:\s*"zh_period",\s*token:\s*"。",\s*name:\s*"中文句号"/.test(processingSeparatorRadioSource) ||
    !/value:\s*"zh_exclamation",\s*token:\s*"！",\s*name:\s*"中文感叹号"/.test(processingSeparatorRadioSource) ||
    !/value:\s*"zh_question",\s*token:\s*"？",\s*name:\s*"中文问号"/.test(processingSeparatorRadioSource) ||
    !/value:\s*"en_period",\s*token:\s*"\.",\s*name:\s*"英文句点"/.test(processingSeparatorRadioSource) ||
    !/value:\s*"en_exclamation",\s*token:\s*"!",\s*name:\s*"英文感叹号"/.test(processingSeparatorRadioSource) ||
    !/value:\s*"en_question",\s*token:\s*"\?",\s*name:\s*"英文问号"/.test(processingSeparatorRadioSource) ||
    !/<code>' \+ esc\(option\.token\) \+ '<\/code>[\s\S]*processing-separator-choice__divider[\s\S]*esc\(option\.name\)/.test(processingSeparatorRadioSource)) {
  fail("八个下拉选项必须以代码胶囊展示 token，并以普通文字展示中文含义");
}
if (/value:\s*"(?:structure|sentence|custom|literal)"|自定义拆分标记/.test(processingSeparatorRadioSource)) {
  fail("分隔符下拉不应混入结构切片、合并 sentence 或历史 custom/literal 选项");
}
if (/data-custom-separator-field|data-processing-param="customSeparator"|自定义拆分标记/.test(processingStepSource)) {
  fail("结构／分隔符切片 UI 不应要求用户输入自定义符号");
}
if (!/separatorByType\s*=\s*\{[\s\S]*zh_period:\s*"。"[\s\S]*zh_exclamation:\s*"！"[\s\S]*zh_question:\s*"？"[\s\S]*en_period:\s*"\."[\s\S]*en_exclamation:\s*"!"[\s\S]*en_question:\s*"\?"/.test(actionsSource) || !/"sentence", "custom", "literal"/.test(actionsSource) || !/separatorType === "custom"[\s\S]*customSeparator/.test(actionsSource)) {
  fail("动作层应将六种中英文标点类型映射为单个字符，并继续兼容历史 sentence/custom/literal 值");
}
if (!/usesSemanticModel:\s*false/.test(seedSource) || !/系统自动编排[\s\S]*不调用语义模型/.test(knowledgePage)) {
  fail("自动切片必须明确组合结构、递归和长度兜底，且不得静默启用语义模型");
}
if (!/semanticSensitivity[\s\S]*breakpointPercentile[\s\S]*semanticMinChars[\s\S]*sentenceWindow/.test(actionsSource) || !/mode === "semantic"[\s\S]*overlapPercent = 0/.test(actionsSource)) {
  fail("动作层必须规范化语义敏感度并派生语义断点、最小切片、句段窗口与零重叠参数");
}
if (!/function\s+processingProfileSnapshot/.test(actionsSource) || !/input\.processingParameters \|\| input\.processingOverrides/.test(actionsSource) || !/batch\.processingParametersSnapshot/.test(actionsSource) || !/processingProfileSnapshot:\s*deferred \? null/.test(actionsSource)) {
  fail("四步建库动作层应将本次处理参数固化为知识库/导入批次快照，不修改共享策略");
}
if (!/compatible:\s*profileAvailable/.test(actionsSource) || !/completeOutput:\s*profileAvailable && !missing\.length/.test(actionsSource)) {
  fail("解析产物完整度只能作为提示，不能禁用已启用的文档处理策略");
}
if (!/dependencyBlockers/.test(capabilitiesPage) || !/请先处理依赖关系/.test(capabilitiesPage) || /<th>依赖的 Skill<\/th>/.test(capabilitiesPage)) {
  fail("Skill 上游依赖应只在真实启停阻断中呈现，不扩展列表或常规详情");
}
if (!/function\s+createCapabilityFromUpload/.test(actionsSource) || !/function\s+updateCapability/.test(actionsSource) || !/function\s+deleteCapability/.test(actionsSource) || /validateCapability:\s*validateCapability|validateVisualization:/.test(actionsSource)) {
  fail("Skill 动作层应提供上传、编辑、删除闭环，并保留底层 Tool 依赖校验、移除产品验证动作");
}
if (!/sourceType = "built_in"/.test(seedSource) || !/item\.deletable = false/.test(seedSource) || !/packageMeta: packageMeta/.test(actionsSource)) {
  fail("能力目录应明确区分内置与上传对象，并保留上传包元数据");
}
const apiSeedStart = seedSource.indexOf("apiAccess:");
const apiSeedSource = seedSource.slice(apiSeedStart, seedSource.indexOf("\n    consumption:", apiSeedStart));
const apiActionSource = actionsSource.slice(actionsSource.indexOf("function createApiKey"), actionsSource.indexOf("function createRollbackDraft"));
if (!/function\s+createApiKey/.test(apiActionSource) || !/permissionLevel/.test(apiActionSource) || !/accessLevels/.test(apiActionSource) || /function\s+rotateApiKey/.test(apiActionSource) || !/function\s+setApiKeyEnabled/.test(apiActionSource) || !/function\s+deleteApiKey/.test(apiActionSource) || !/clients\.splice/.test(apiActionSource)) {
  fail("API 密钥动作层应使用现有访问等级校验名称与权限，并提供启停和真正删除闭环");
}
if (/normalizeApiScopes|normalizeIpAllowlist|apiClientId|\bscopes\b|identityMode|ipAllowlist|rpmLimit|expiresAt|revokedAt|status\s*=\s*"revoked"/.test(apiActionSource)) {
  fail("API 密钥动作层不应保留授权范围、身份、IP、限流、到期或作废状态逻辑");
}
if (!/name:\s*"供应商风险工作台"/.test(apiSeedSource) || !/keyMasked:/.test(apiSeedSource) || !/lastUsedAt:/.test(apiSeedSource) || !/permissionLevel:\s*"L[123]"/.test(apiSeedSource) || /accessLevel|clientId|credentialVersion|\bscopes\b|identityMode|ipAllowlist|rpmLimit|expiresAt|revokedAt|永久作废/.test(apiSeedSource)) {
  fail("API 密钥种子应保留名称、脱敏 Key、启用状态、访问等级与使用时间，不恢复旧授权范围字段");
}
if (!/createApiKey/.test(apiAccessPage) || !/deleteApiKey/.test(apiAccessPage) || /data-api-rotate|rotateApiKey/.test(apiAccessPage) || !/confirmButton\.disabled = true/.test(apiAccessPage) || !/data-api-secret-copy/.test(apiAccessPage) || !/data-api-field="name"/.test(apiAccessPage) || !/data-api-field="permissionLevel"/.test(apiAccessPage) || /data-api-field="(?:scopes|rpmLimit|expiresAt|ipAllowlist)"/.test(apiAccessPage)) {
  fail("API 密钥创建应收集名称与现有访问等级，并保留复制后完成与删除闭环");
}
if (!/<th>名称<\/th>[\s\S]*<th>API Key<\/th>[\s\S]*<th>状态<\/th>[\s\S]*<th>权限<\/th>[\s\S]*<th>最近使用时间<\/th>[\s\S]*<th>创建时间<\/th>[\s\S]*<th>操作<\/th>/.test(apiAccessPage)) {
  fail("API 密钥列表字段顺序应为名称、API Key、状态、权限、最近使用时间、创建时间和操作");
}
if (/table-footer|共 ['"]?\s*\+?\s*keys\.length|个 API 密钥/.test(apiAccessPage)) {
  fail("API 密钥列表不应展示无决策价值的数量 footer");
}
if (!/data-api-detail/.test(apiAccessPage) || !/data-api-toggle/.test(apiAccessPage) || !/data-api-delete/.test(apiAccessPage) || !/已启用/.test(apiAccessPage) || !/已禁用/.test(apiAccessPage)) {
  fail("API 密钥列表应统一显示已启用/已禁用，并仅提供查看、启用或禁用、删除操作");
}
if (!/<div class="page-content">' \+ renderVisualGroups\(items\)/.test(visualizationV2Source) || /visualizations?-panel|visualization-catalog-panel/.test(visualizationV2Source)) {
  fail("可视化目录应直接使用开放 page-content，不应恢复无意义的整页 Panel");
}
if (!/data-visual-view-v2="category"[\s\S]*list-tree/.test(visualizationV2Source) || !/data-visual-view-v2="cards"[\s\S]*layout-grid/.test(visualizationV2Source)) {
  fail("可视化分类/卡片视图应使用两个图标按钮表达");
}
const visualizationDefinitionSource = capabilitiesPage.slice(capabilitiesPage.indexOf("var VISUAL_META"), capabilitiesPage.indexOf("function visualizationCatalog"));
const visualizationRendererSource = capabilitiesPage.slice(capabilitiesPage.indexOf("function visualChartOption"), capabilitiesPage.indexOf("function renderVisualPlaceholder"));
const visualizationMindMapSource = visualizationRendererSource.slice(visualizationRendererSource.indexOf('item.renderer === "mindmap"'), visualizationRendererSource.indexOf('item.renderer === "radar"'));
const visualizationDualSource = visualizationRendererSource.slice(visualizationRendererSource.indexOf('item.renderer === "dual"'), visualizationRendererSource.indexOf('item.renderer === "bar"'));
const visualizationRenderEntrySource = capabilitiesPage.slice(capabilitiesPage.indexOf("function renderVisualChart"), capabilitiesPage.indexOf("function renderVisualCardV2"));
if (!/\["generate_mind_map", "思维导图", "层级与树", "mindmap"/.test(visualizationDefinitionSource) || !/layout:\s*"radial"/.test(visualizationMindMapSource)) {
  fail("思维导图应使用独立的中心向外布局，不应复用组织架构树");
}
if (!/generate_area_chart:\s*\{[\s\S]*?stack:\s*true[\s\S]*?generate_dual_axes_chart:/.test(visualizationDefinitionSource)
  || !/generate_histogram_chart:\s*\{[\s\S]*?binNumber:\s*6[\s\S]*?generate_pie_chart:/.test(visualizationDefinitionSource)
  || !/generate_pie_chart:\s*\{[\s\S]*?innerRadius:\s*0\.58[\s\S]*?generate_treemap_chart:/.test(visualizationDefinitionSource)
  || !/generate_sankey_chart:\s*\{[\s\S]*?nodeAlign:\s*"justify"[\s\S]*?generate_venn_chart:/.test(visualizationDefinitionSource)) {
  fail("数据样例应显式包含决定面积、直方、环图与桑基布局的参数，保证样例可复现预览");
}
if (!/generate_dual_axes_chart[\s\S]*axisYTitle/.test(visualizationDefinitionSource) || !/var dualSeries[\s\S]*axisYTitle/.test(visualizationDualSource) || !/name:\s*compact\s*\?\s*""\s*:\s*leftAxisTitle[\s\S]*name:\s*compact\s*\?\s*""\s*:\s*rightAxisTitle/.test(visualizationDualSource)) {
  fail("双轴图预览应把两个 series.axisYTitle 显示为左右轴单位");
}
if (!/params\s*=\s*Object\.assign\(\{\},\s*params\s*\|\|\s*\{\},[\s\S]{0,180}\bpayload\b/.test(visualizationRenderEntrySource)) {
  fail("数据样例中的显示参数必须真正参与预览绘制");
}
if (!/generate_line_chart:\s*\{\s*axisXTitle:\s*"月份",\s*axisYTitle:\s*"交付量"/.test(visualizationDefinitionSource)
  || !/generate_area_chart:\s*\{[\s\S]{0,100}axisXTitle:\s*"月份",\s*axisYTitle:\s*"工作量"/.test(visualizationDefinitionSource)
  || !/generate_bar_chart:\s*\{\s*axisXTitle:\s*"完成量",\s*axisYTitle:\s*"区域"/.test(visualizationDefinitionSource)
  || !/generate_histogram_chart:\s*\{[\s\S]{0,100}axisXTitle:\s*"交付周期（天）",\s*axisYTitle:\s*"频数"/.test(visualizationDefinitionSource)
  || !/generate_scatter_chart:\s*\{\s*axisXTitle:\s*"交付评分",\s*axisYTitle:\s*"质量评分"/.test(visualizationDefinitionSource)) {
  fail("折线、面积、条形、直方与散点图的数据样例应使用符合数据语义的轴标题");
}
if (!/JSON 格式正确/.test(visualizationV2Source) || /数据格式正确/.test(visualizationV2Source)) {
  fail("可视化编辑器仅做 JSON 解析时，状态文案应准确写为“JSON 格式正确”");
}
const visualizationCatalogSource = visualizationV2Source.slice(visualizationV2Source.indexOf("function renderVisualizationCatalog"), visualizationV2Source.indexOf("function drawVisualDrawer"));
if (/toolbar:|data-visual-search|data-visual-category|统一控制 Agent 是否生成图表/.test(visualizationCatalogSource)) {
  fail("可视化能力页不应保留筛选器或重复的总控说明");
}
const visualizationSkillStatusSource = visualizationV2Source.slice(visualizationV2Source.indexOf("function renderVisualizationSkillStatus"), visualizationV2Source.indexOf("function drawVisualDrawer"));
if (!/报告图表生成 Skill 已启用/.test(visualizationSkillStatusSource) || !/href="#\/skills"/.test(visualizationSkillStatusSource) || /data-visual-skill-toggle-v2|role="switch"|允许 Agent 在报告中生成图表/.test(visualizationSkillStatusSource)) {
  fail("可视化能力页只能轻量提示报告图表 Skill 状态，并将实际管理统一收口到 Skill 目录");
}
const visualizationDrawerSource = visualizationV2Source.slice(visualizationV2Source.indexOf("function drawVisualDrawer"), visualizationV2Source.indexOf("function rerenderVisualizationCatalog"));
if (!/mountVisualDrawerHeader[\s\S]*item\.category[\s\S]*callsThisMonth/.test(visualizationDrawerSource) || /·\s*数据试绘|所属分类|数据要求|试绘方法|数据试绘预览|显示参数/.test(visualizationDrawerSource)) {
  fail("图表 Drawer 应把分类和调用次数收进标题区，并移除重复说明与显示参数");
}
if (!/panel__header[\s\S]*data-visual-render[\s\S]*refresh-cw/.test(visualizationDrawerSource) || !/panel__title">数据样例/.test(visualizationDrawerSource)) {
  fail("图表 Drawer 应在数据样例面板标题区提供刷新图标按钮");
}
if (!/renderVisualCardV2\(item, false\)/.test(visualizationV2Source) || !/showCategory \?/.test(visualizationV2Source)) {
  fail("分类视图中的图表卡片不应重复展示分类名称");
}
if (!/\.knowledge-table\s*\{[\s\S]*?min-width:\s*99\dpx/.test(pagesStyles) || !/\.knowledge-table th:first-child,[\s\S]*?position:\s*sticky/.test(pagesStyles) || !/\.knowledge-table th:last-child,[\s\S]*?position:\s*sticky/.test(pagesStyles) || !/right:\s*0/.test(pagesStyles)) {
  fail("1024 桌面宽度下，知识库列表应收敛最小宽度并固定首列与操作列");
}

if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}

console.log(`静态检查通过：${assetReferences.length} 个资源引用、${sourceFiles.length} 个脚本。`);

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

globalThis.window = globalThis;
require(path.join(demoRoot, "src/core/namespace.js"));
require(path.join(demoRoot, "data/evaluation/scifact-mini/dataset.js"));
require(path.join(demoRoot, "src/mock/seed.js"));
require(path.join(demoRoot, "src/core/store.js"));
require(path.join(demoRoot, "src/core/selectors.js"));
require(path.join(demoRoot, "src/core/actions.js"));
require(path.join(demoRoot, "src/ui/dom.js"));
require(path.join(demoRoot, "src/ui/preview.js"));

// Page renderers only need these collaborators when mounted. Stubbing them
// lets the test execute the real render functions and inspect their DOM output.
globalThis.OpsDemo.ui.overlay = {};
globalThis.OpsDemo.ui.charts = {};
globalThis.OpsDemo.core.router = { navigate() {} };
require(path.join(demoRoot, "src/pages/knowledge.js"));
require(path.join(demoRoot, "src/pages/documents.js"));
require(path.join(demoRoot, "src/pages/data-access.js"));
require(path.join(demoRoot, "src/pages/models.js"));
require(path.join(demoRoot, "src/pages/rag.js"));
require(path.join(demoRoot, "src/pages/capabilities.js"));
require(path.join(demoRoot, "src/pages/api-access.js"));
require(path.join(demoRoot, "src/pages/consumption.js"));

const store = globalThis.OpsDemo.core.store;
const actions = globalThis.OpsDemo.core.actions;
const state = store.getState();
const pages = globalThis.OpsDemo.pages;

assert.equal("toolManagement" in pages, false, "运营端不应注册独立 Tool / MCP 管理页面");
const skillsCatalogHtml = pages.skills.render({ name: "skills", id: null, query: {} }, state);
assert.match(skillsCatalogHtml, /包含的 Tool[\s\S]*知识检索[\s\S]*知识原文读取/, "Skill 目录仍应显示每个 Skill 包含的 Tool 信息");
const skillDetailControls = Array.from(skillsCatalogHtml.matchAll(/<[^>]+\bdata-capability-detail="([^"]+)"[^>]*>/g));
const skillToggleControls = Array.from(skillsCatalogHtml.matchAll(/<[^>]+\bdata-capability-toggle="([^"]+)"[^>]*>/g));
const skillDeleteControls = Array.from(skillsCatalogHtml.matchAll(/<[^>]+\bdata-capability-delete="([^"]+)"[^>]*>/g));
assert.equal(skillDetailControls.length, state.skills.length, "每个 Skill 均应提供统一查看入口，不区分内置或上传来源");
assert.equal(skillToggleControls.length, state.skills.length, "每个 Skill 均应提供统一启停入口，不区分内置或上传来源");
assert.equal(skillDeleteControls.length, state.skills.length, "每个 Skill 均应保留停用后可用的删除入口");
assert.equal(new Set(skillDetailControls.map((match) => match[1])).size, state.skills.length, "Skill 查看入口应与每条 Skill 一一对应");
assert.equal(new Set(skillToggleControls.map((match) => match[1])).size, state.skills.length, "Skill 启停入口应与每条 Skill 一一对应");
assert.equal(new Set(skillDeleteControls.map((match) => match[1])).size, state.skills.length, "Skill 删除入口应与每条 Skill 一一对应");
assert.doesNotMatch(skillsCatalogHtml, /data-capability-edit=/, "Skill 列表不应再提供独立编辑入口");
state.skills.forEach((skill) => {
  const deleteControl = skillDeleteControls.find((match) => match[1] === skill.id)?.[0] || "";
  assert.ok(deleteControl, `${skill.name} 应有删除入口`);
  if (skill.enabled) {
    assert.match(deleteControl, /\bdisabled\b/, `${skill.name} 启用时删除入口应置灰`);
  } else {
    assert.doesNotMatch(deleteControl, /\bdisabled\b/, `${skill.name} 停用后删除入口应可用`);
  }
});

const initialRecordCount = state.configurationRecords.length;
const kb = state.knowledgeBases.find((item) => item.id === "KB-001");
const seedPendingIndex = state.knowledgeVersions.find((item) => item.id === "KV-20260825-01");
const seedImportBatch = state.importBatches.find((item) => item.id === "IMP-0825-03");
const expectedVisualizationTools = [
  "generate_area_chart",
  "generate_bar_chart",
  "generate_boxplot_chart",
  "generate_column_chart",
  "generate_district_map",
  "generate_dual_axes_chart",
  "generate_fishbone_diagram",
  "generate_flow_diagram",
  "generate_funnel_chart",
  "generate_histogram_chart",
  "generate_line_chart",
  "generate_liquid_chart",
  "generate_mind_map",
  "generate_network_graph",
  "generate_organization_chart",
  "generate_path_map",
  "generate_pie_chart",
  "generate_pin_map",
  "generate_radar_chart",
  "generate_sankey_chart",
  "generate_scatter_chart",
  "generate_treemap_chart",
  "generate_venn_chart",
  "generate_violin_chart",
  "generate_word_cloud_chart"
].sort();
const expectedVisualizationCategories = ["占比构成", "专项图表", "分类比较", "关系与流向", "地理地图", "层级与树", "时间趋势"].sort();

assert.equal(state.visualizations.length, 25, "可视化目录应严格对齐 generate.js 的 25 种实际映射");
assert.deepEqual(state.visualizations.map((item) => item.toolCode).sort(), expectedVisualizationTools, "可视化目录不得缺少或额外增加 generate.js 之外的类型");
assert.deepEqual(Array.from(new Set(state.visualizations.map((item) => item.category))).sort(), expectedVisualizationCategories, "25 种图表应按 Skill 选型逻辑归入 7 个中文类别");
assert.equal(state.visualizations.some((item) => item.toolCode === "generate_spreadsheet"), false, "generate_spreadsheet 未进入 generate.js 映射，不得展示为可用图表");
assert.equal(state.visualizations.some((item) => item.toolCode === "generate_gauge_chart" || item.name.includes("仪表")), false, "原始 Skill 不包含仪表盘，不得自行扩充");
assert.equal(state.skills.find((item) => item.id === "SK-06").disableImpact.visualizationCount, 25, "Skill 启停影响数应与可视化目录一致");

const knowledgeListHtml = pages.knowledge.render({ name: "knowledge", id: null, query: {} }, state);
assert.doesNotMatch(knowledgeListHtml, /data-golden-case-trace|美国关税三情景研判|与调用侧 Demo 的任务配置快照一致/, "知识库首页不应展示跨 Demo 黄金案例追溯卡");
assert.match(knowledgeListHtml, /page-header__top[\s\S]*data-kb-search[\s\S]*新建知识库/, "知识库标题、搜索与新建动作应在单行 PageHeader");
assert.doesNotMatch(knowledgeListHtml, /page-header__toolbar|data-kb-status|检索状态<\/span>/, "知识库首页不应保留第二行或状态筛选");
assert.match(knowledgeListHtml, /data-kb-test="KB-001"[\s\S]*data-kb-open="KB-001"[\s\S]*>详情<[\s\S]*data-kb-edit="KB-001"[\s\S]*data-kb-delete="KB-001"/, "知识库列表应提供测试、详情、编辑与删除动作");
assert.match(knowledgeListHtml, /data-kb-open="KB-001"[^>]*>供应商合规与合同库<\/[^>]+>/, "知识库名称本身应可点击进入详情");
assert.match(knowledgeListHtml, /data-kb-test="KB-003"[^>]*disabled/, "不可检索的知识库应保留灰置测试入口并说明原因");
assert.match(knowledgeListHtml, /SciFact Mini 检索评测库[\s\S]*只读评测基准[\s\S]*data-kb-edit="KB-EVAL-SCIFACT"[^>]*disabled[\s\S]*data-kb-delete="KB-EVAL-SCIFACT"[^>]*disabled/, "SciFact Mini 应作为可测试但不可编辑、删除的只读知识库展示");
const localDocumentsHtml = pages.localDocuments.render({ name: "local-documents", id: null, query: {} }, state);
assert.match(localDocumentsHtml, /<h1 class="page-header__title">文档管理<\/h1>[\s\S]*data-local-document-search[\s\S]*data-local-document-status-filter[\s\S]*data-local-document-upload/, "文档管理页应以单行页头承载搜索、状态筛选和上传入口");
assert.match(localDocumentsHtml, /<th>文档<\/th><th>状态<\/th><th>大小<\/th><th>上传时间<\/th><th>操作<\/th>/, "本地文档列表应只展示文件资产字段，不展示所属知识库");
assert.doesNotMatch(localDocumentsHtml, /所属知识库|data-local-document-kb|供应商合规与合同库|KB-001/, "本地文档列表不得把文件绑定到某一个知识库");
assert.match(localDocumentsHtml, /data-local-document-search[^>]*placeholder="搜索文档"|placeholder="搜索文档"[^>]*data-local-document-search/, "本地文档搜索口径不应继续包含知识库");
assert.match(localDocumentsHtml, /海岳电子供应商框架合同\.pdf[\s\S]*data-local-document-preview="DOC-001"[\s\S]*data-local-document-delete="DOC-001"/, "本地文档页应汇总本地原文件，并提供预览和删除闭环");
assert.equal((localDocumentsHtml.match(/data-local-document-id="DOC-004"/g) || []).length, 1, "同一本地原文件即使进入多个知识库，列表也只能出现一行");
assert.match(localDocumentsHtml, /共 8 个文档/, "文档总数应按原文件去重，而不是按知识库处理实例计数");
assert.match(localDocumentsHtml, /不包含企业数据和检索服务引用/, "文档管理页应明确不管理企业数据和检索服务内容");
assert.ok(state.documents.filter((item) => item.sourceType !== "evaluation_dataset").every((item) => item.sourceType === "local_upload"), "普通种子文件都应显式标记为本地上传");
assert.equal(state.documents.filter((item) => item.sourceType === "evaluation_dataset").length, 11, "SciFact Mini 应以独立评测数据源保存 11 篇本地语料");
assert.doesNotMatch(localDocumentsHtml, /SciFact|SF-DOC-/, "只读评测语料不应混入用户上传的文档管理列表");
assert.ok(state.documents.every((item) => item.localAssetId), "每个知识库文档实例都应指向稳定的本地原文件标识");
const sharedLocalDocumentInstances = state.documents.filter((item) => item.localAssetId === "DOC-004");
assert.deepEqual(sharedLocalDocumentInstances.map((item) => item.knowledgeBaseId).sort(), ["KB-001", "KB-003"], "代表样例应让同一本地原文件在两个知识库中拥有独立处理实例");
const localPreviewKb1 = pages.localDocuments.render({ name: "local-documents", id: "DOC-004", query: { knowledgeBaseId: "KB-001" } }, state);
assert.match(localPreviewKb1, /aria-label="返回文档管理"[\s\S]*href="#\/local-documents"|href="#\/local-documents"[\s\S]*aria-label="返回文档管理"/, "文件预览刷新后仍应明确返回文档管理列表");
assert.doesNotMatch(localPreviewKb1, /data-preview-document-select|id="preview-document-select"|>源文档<\/label>/, "从本地文档进入预览时不得出现同库文件快速切换");
assert.match(localPreviewKb1, /data-local-preview-kb-select="DOC-004"[\s\S]*供应商合规与合同库[\s\S]*内控制度库/, "多库文件的切片区域应提供知识库切换组件，且只列出实际使用该文件的知识库");
assert.doesNotMatch(localPreviewKb1, /贸易政策与关税库/, "切片知识库选择器不得混入未使用该文件的知识库");
assert.match(localPreviewKb1, /全部切片（3）[\s\S]*CHK-DOC-004-001/, "默认应展示 KB-001 对应的三条代表切片");
const singleKnowledgeBasePreview = pages.localDocuments.render({ name: "local-documents", id: "DOC-102", query: { knowledgeBaseId: "KB-002" } }, state);
assert.match(singleKnowledgeBasePreview, /data-local-preview-kb-select="DOC-102" disabled>[\s\S]*<option value="KB-002" selected>贸易政策与关税库<\/option>/, "只有一个知识库时也应复用下拉组件并禁用切换");
const localPreviewKb3 = pages.localDocuments.render({ name: "local-documents", id: "DOC-004", query: { knowledgeBaseId: "KB-003" } }, state);
assert.match(localPreviewKb3, /<option value="KB-003" selected>[\s\S]*全部切片（2）|全部切片（2）[\s\S]*<option value="KB-003" selected>/, "选择 KB-003 后应持久展示该知识库的切片结果");
assert.match(localPreviewKb3, /CHK-DOC-301-001[\s\S]*本协议将来料检验、过程质量控制与关键变更审批合并为一个检索单元/, "KB-003 应显示自己的文档实例和专属切片内容");
assert.doesNotMatch(localPreviewKb3, /CHK-DOC-004-001/, "KB-003 切片区不得混入 KB-001 的切片卡片");
assert.match(localPreviewKb3, /data-local-preview-chunk-add="DOC-301"[\s\S]*data-kb-id="KB-003"/, "本地预览新增切片必须绑定当前选中的知识库文档实例");
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
assert.doesNotMatch(enterpriseConnectionsHtml, /data-enterprise-detail/, "企业数据卡片不应保留独立详情入口");
assert.match(enterpriseConnectionsHtml, /订单与库存数据库[\s\S]*连接正常/, "企业数据列表应回显黄金案例数据库及其连接状态");
assert.match(enterpriseConnectionsHtml, /覆盖供应链订单、库存与履约数据[\s\S]*目标数据库[\s\S]*supply_chain[\s\S]*服务器[\s\S]*supply-db\.internal:5432/, "数据库卡片应同时回显业务描述、目标数据库与服务器连接信息");
assert.ok(["PostgreSQL", "MySQL", "SQL Server"].every((label) => enterpriseConnectionsHtml.includes(label)), "企业连接列表应回显 PostgreSQL、MySQL、SQL Server 三类数据库");
const externalInformationHtml = pages.externalInformation.render({ name: "external-information", id: null, query: {} }, state);
assert.match(externalInformationHtml, /page-header__title">检索服务[\s\S]*data-search-service-create[\s\S]*接入服务/, "检索服务页应在 PageHeader 提供接入入口");
assert.equal((externalInformationHtml.match(/data-search-service-card/g) || []).length, 3, "三个种子检索服务应分别呈现为三张服务卡片");
assert.match(externalInformationHtml, /data-search-service-row="SEARCH-SERVICE-01"[\s\S]*全球贸易资讯检索[\s\S]*Elasticsearch[\s\S]*trade-news-v3[\s\S]*search\.trade\.internal[\s\S]*data-search-service-test="SEARCH-SERVICE-01"/, "Elasticsearch 服务卡应回显类型、索引、地址和测试动作");
assert.match(externalInformationHtml, /OpenSearch[\s\S]*自定义接口/, "服务列表应覆盖 OpenSearch 与自定义接口");
assert.doesNotMatch(externalInformationHtml, /添加信源|标签管理|批量停用|data-external-source/, "检索服务页不应继续暴露原始信源治理操作");
assert.equal(actions.deleteKnowledgeBase("KB-001"), null, "正在提供检索的知识库不得直接删除");
const disposableKnowledgeBase = actions.createKnowledgeBase({ name: "待删除演示库", purpose: "验证知识库编辑与删除闭环。", embeddingModelId: "MODEL-EMBEDDING-PRIMARY", minAccessLevel: "L1" });
assert.equal(actions.updateKnowledgeBase(disposableKnowledgeBase.id, { name: "已编辑演示库", purpose: "名称与描述已更新。" }).name, "已编辑演示库", "知识库名称和描述应可编辑");
assert.equal(actions.deleteKnowledgeBase(disposableKnowledgeBase.id), disposableKnowledgeBase, "关闭检索的知识库应可确认删除");
assert.equal(state.knowledgeBases.includes(disposableKnowledgeBase), false, "删除后知识库应从列表移除");
const visualizationHtml = pages.visualizations.render({ name: "visualizations", id: null, query: {} }, state);
assert.match(visualizationHtml, /<div class="page-content">[\s\S]*visual-category|<div class="page-content">[\s\S]*visualization-grid/, "可视化应直接使用开放 page-content");
assert.doesNotMatch(visualizationHtml, /visualizations?-panel|visualization-catalog-panel/, "可视化目录不应恢复无业务意义的整页 Panel");
const renderedVisualizationCodes = Array.from(visualizationHtml.matchAll(/data-visual-preview-v2="([^"]+)"/g), (match) => match[1]);
assert.equal(renderedVisualizationCodes.length, 25, "实际页面应完整渲染 25 张可视化能力卡片");
assert.deepEqual(renderedVisualizationCodes.slice().sort(), expectedVisualizationTools, "实际页面卡片应与 25 个可执行图表工具逐一对应");
[
  ["generate_pie_chart", "饼图与环图"],
  ["generate_district_map", "中国行政区地图"],
  ["generate_pin_map", "中国点标地图"],
  ["generate_path_map", "中国路径地图"]
].forEach(([code, name]) => {
  const marker = visualizationHtml.indexOf(`data-visual-preview-v2="${code}"`);
  const articleEnd = visualizationHtml.indexOf("</article>", marker);
  assert.ok(marker >= 0 && visualizationHtml.slice(marker, articleEnd).includes(name), `${code} 应显示约定的中文名称“${name}”`);
});
const modelsHtml = pages.models.render({ name: "models", id: null, query: {} }, state);
assert.match(modelsHtml, /page-header__top[\s\S]*page-header__actions[\s\S]*data-model-search[\s\S]*data-model-create/, "模型新增、搜索与筛选应共同位于单行 PageHeader 右侧");
assert.doesNotMatch(modelsHtml, /page-header__toolbar|page-header--has-toolbar/, "模型管理不应生成第二层 Header 工具栏");
assert.doesNotMatch(modelsHtml, /模型 ID|版本 \/ 规格|服务来源|引用配置|查看引用/, "模型列表不应暴露版本、ID、来源或引用关系");
assert.doesNotMatch(modelsHtml, /model-summary|class="model-identity"[^>]*>[\s\S]*?class="table-primary"[^>]*>[^<]*<\/div>\s*<(?:span|small)/, "模型名称下方不应显示预览说明小字");
assert.equal((modelsHtml.match(/<colgroup><col class="models-table__col models-table__col--name"><col class="models-table__col models-table__col--dimension"><col class="models-table__col models-table__col--connection"><col class="models-table__col models-table__col--actions"><\/colgroup>/g) || []).length, 2, "向量与 Rerank 两个表格应复用同一列宽组件契约");
const embeddingModelsHtml = modelsHtml.slice(modelsHtml.indexOf('data-model-group="embedding"'), modelsHtml.indexOf('data-model-group="reranker"'));
const rerankerModelsHtml = modelsHtml.slice(modelsHtml.indexOf('data-model-group="reranker"'));
assert.match(embeddingModelsHtml, /<th aria-label="向量维度">向量维度<\/th>[\s\S]*<td class="models-table__dimension"><div class="table-primary">[^<]+ 维<\/div><\/td>/, "向量表应在统一第二列展示维度");
assert.match(rerankerModelsHtml, /<th aria-label="不适用"><\/th>[\s\S]*<td class="models-table__dimension" aria-label="不适用"><\/td>[\s\S]*<td><div class="model-connection">/, "Rerank 表应保留空维度列，使连接状态与其他模型表对齐");
assert.doesNotMatch(rerankerModelsHtml, />向量维度<\//, "Rerank 表不应显示向量维度标题或数值");
assert.equal("promptStrategy" in pages, false, "运营端不应注册 Prompt 与策略页面");
const consumptionHtml = pages.consumption.render({ name: "consumption", id: null, query: {} }, state);
const consumptionSummaryHtml = consumptionHtml.slice(consumptionHtml.indexOf('class="summary-strip consumption-summary"'), consumptionHtml.indexOf('class="consumption-chart-grid"'));
assert.equal((consumptionSummaryHtml.match(/class="summary-cell"/g) || []).length, 3, "消耗统计摘要应只保留三项指标");
assert.match(consumptionSummaryHtml, /API 请求次数[\s\S]*输入 Token[\s\S]*输出 Token/, "消耗统计三项摘要应按 API 请求、输入 Token、输出 Token 排列");
assert.doesNotMatch(consumptionSummaryHtml, /推理调用次数/, "消耗统计不应再展示推理调用次数");
assert.match(consumptionHtml, /<h2 class="panel__title">Token 消耗<\/h2>[\s\S]*<h2 class="panel__title">API 请求次数<\/h2>/, "两张消耗图表应使用不随时间范围变化的固定标题");
const retrievalConfigHtml = pages.rag.render({ name: "retrieval-config", id: null, query: {} }, state);
assert.match(retrievalConfigHtml, /data-open-retrieval-test/, "检索配置页头应提供检索测试快捷入口");
assert.match(retrievalConfigHtml, /混合检索[\s\S]*id="retrieval-keyword-weight"[^>]*min="10" max="90" step="5" value="45"[\s\S]*关键词检索[\s\S]*45%[\s\S]*语义检索[\s\S]*55%/, "检索配置应以混合检索包含两路能力，并提供融合权重 Slider");
assert.doesNotMatch(retrievalConfigHtml, /单文件最多返回|召回候选|retrieval-max-per-document|retrieval-rerank-candidates/, "运营配置不应暴露系统候选规模或不存在的单文件限制");
assert.doesNotMatch(retrievalConfigHtml, /retrieval-system-capabilities|retrieval-advanced|高级设置/, "检索配置不应使用零散能力标签或隐藏候选数量");
assert.match(retrievalConfigHtml, /id="retrieval-relevance"[^>]*type="range"[^>]*min="0\.4" max="0\.9" step="0\.1"[^>]*value="0\.6"[^>]*aria-labelledby="retrieval-relevance-label"[^>]*aria-valuetext="最低相关度 0\.6，均衡"/, "全局相关性要求应以默认 0.6 的六档分数 Slider 展示");
assert.match(retrievalConfigHtml, /宽松[\s\S]*0\.4–0\.5[\s\S]*覆盖优先[\s\S]*均衡[\s\S]*0\.6–0\.7[\s\S]*平衡结果数量与相关质量[\s\S]*严格[\s\S]*0\.8–0\.9[\s\S]*质量优先/, "相关性要求应展示三张带分数区间的解释卡片");
assert.match(retrievalConfigHtml, /最低相关度[\s\S]*0\.6[\s\S]*0\.4[\s\S]*0\.5[\s\S]*0\.6[\s\S]*0\.7[\s\S]*0\.8[\s\S]*0\.9[\s\S]*仅返回相关度 ≥ 0\.6 的结果。[\s\S]*开启 Rerank 时使用重排分，关闭时使用融合分。/, "相关性 Slider 应直接解释当前门槛、六档刻度和分数来源");
const retrievalWorkspaceHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001" } }, state);
assert.match(retrievalWorkspaceHtml, /aria-label="检索测试设置"[\s\S]*aria-label="检索测试结果"/, "检索测试应渲染设置/结果左右工作区");
assert.doesNotMatch(retrievalWorkspaceHtml, /retrieval-chat__header|retrieval-chat__state|<h2>测试对话<\/h2>/, "检索测试右侧不应重复展示测试对话标题、当前配置或完成状态");
assert.doesNotMatch(retrievalWorkspaceHtml, /模拟访问等级|test-access|access-level-simulation/, "检索测试不得提供模拟访问等级");
const retrievalQuestionTag = retrievalWorkspaceHtml.match(/<textarea\b[^>]*id="test-question-v2"[^>]*>/)?.[0] || "";
assert.ok(retrievalQuestionTag, "检索测试应保留问题输入框");
assert.match(retrievalQuestionTag, /aria-label="[^"]+"/, "检索问题输入框移除可见标签后须保留 aria-label");
assert.match(retrievalQuestionTag, /(?:^|\s)required(?:\s|>|=)/, "检索问题输入框仍应为必填");
assert.match(retrievalQuestionTag, /aria-required="true"/, "检索问题输入框须向辅助技术声明必填");
const retrievalComposerHtml = retrievalWorkspaceHtml.match(/<footer class="retrieval-composer"[\s\S]*?<\/footer>/)?.[0] || "";
assert.doesNotMatch(retrievalComposerHtml, /<label[^>]*for="test-question-v2"|>\s*检索问题\s*</, "检索输入区不应重复显示“检索问题”标签");
assert.doesNotMatch(retrievalWorkspaceHtml, /id="test-profile"|检索配置<\/label>/, "V2 检索测试应直接使用全局检索设置，不再选择配置版本");
assert.match(retrievalWorkspaceHtml, /测试参数[\s\S]*id="test-kb-v2"[\s\S]*检索方式[\s\S]*混合检索（系统默认）[\s\S]*关键词 45% · 语义 55%[\s\S]*>Rerank<[\s\S]*data-test-rerank-toggle[\s\S]*id="test-reranker-model"[\s\S]*Qwen3-Reranker-0\.6B[\s\S]*id="test-final-topk"[^>]*value="10"[\s\S]*id="test-relevance"[^>]*type="range"[^>]*min="0\.4" max="0\.9" step="0\.1"[^>]*value="0\.6"[^>]*aria-labelledby="test-relevance-label"[^>]*aria-valuetext="最低相关度 0\.6，均衡"/, "检索测试应展示混合权重并复用 Rerank、Top K 与相关性 Slider");
assert.doesNotMatch(retrievalWorkspaceHtml, /retrieval-relevance-cards|相关度分数区间说明/, "检索测试不应重复展示检索配置页已有的三张相关度区间说明卡");
assert.doesNotMatch(retrievalWorkspaceHtml, /测试范围|召回与结果|data-test-settings-source|data-use-online-settings|恢复全局设置|本次调整/, "检索测试不应展示冗余小标题、参数来源或恢复入口");
assert.match(retrievalComposerHtml, /^<footer class="retrieval-composer"><textarea[\s\S]*id="test-question-v2"[\s\S]*<\/textarea><button[\s\S]*data-run-test-v2[\s\S]*<\/button><\/footer>$/, "检索输入区应由单层 footer 直接承载输入框与按钮");
assert.doesNotMatch(retrievalComposerHtml, /retrieval-composer__input-shell|retrieval-composer__send/, "检索输入区不应再嵌套输入壳或按钮定位容器");
assert.match(retrievalWorkspaceHtml, /<div class="retrieval-chat__body" aria-live="polite"><\/div>/, "首次进入检索测试时右侧对话区应保持空白并支持结果播报");
assert.doesNotMatch(retrievalWorkspaceHtml, /class="retrieval-message|class="evidence-item|class="retrieval-result-summary"/, "首次进入时不应预先展示历史模拟问题、指标或证据");
assert.match(retrievalWorkspaceHtml, />海岳电子 Q3 交付风险是否已触发合同升级机制？<\/textarea>/, "预设问题应仅保留在底部输入框中");
assert.doesNotMatch(retrievalWorkspaceHtml, /workspace-section-heading|retrieval-profile-brief|retrieval-setting-note|<h[2-4][^>]*>测试设置<\/h[2-4]>|当前测试对象|权限过滤\s*\d|BM25\s*\d|Dense\s*\d|融合\s*\d|Rerank\s*\d|结果封装\s*\d|总耗时/, "检索测试不应展示冗余对象摘要或算法、耗时日志");
const defaultRetrievalRun = actions.runRetrievalTest({ knowledgeBaseId: "KB-001", question: "海岳电子 Q3 交付风险是否已触发合同升级机制？" });
assert.ok(defaultRetrievalRun && defaultRetrievalRun.lastRunAt, "不修改预设问题直接检索应产生本次运行结果");
const retrievalCompletedHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", run: "1" } }, state);
assert.match(retrievalCompletedHtml, /返回切片数<\/span><strong>3[\s\S]*有效证据数<\/span><strong>3[\s\S]*证据覆盖度<\/span><strong>100%[\s\S]*结果相关性<\/span><strong>100%/, "点击检索后应以四项运营指标解释模拟结果");
assert.match(retrievalCompletedHtml, /海岳电子供应商框架合同/, "运行后应展示本库模拟证据");
assert.match(retrievalCompletedHtml, /相关度<\/span><strong>0\.94<\/strong><small>重排分<\/small>[\s\S]*相关度<\/span><strong>0\.92<\/strong><small>重排分<\/small>[\s\S]*相关度<\/span><strong>0\.86<\/strong><small>重排分<\/small>/, "每条返回证据应展示本次用于排序和过滤的重排分");
assert.doesNotMatch(retrievalCompletedHtml, /retrieval-run-snapshot|本次检索配置|本次检索方式：|召回候选数：/, "运行结果不应重复展示侧栏已有的检索配置");
const kb2RetrievalHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-002" } }, state);
assert.doesNotMatch(kb2RetrievalHtml, /海岳电子|Q3 交付风险/, "V2 检索测试应按知识库隔离问题与证据");
assert.match(kb2RetrievalHtml, /<div class="retrieval-chat__body" aria-live="polite"><\/div>/, "切换知识库后仍应从空白对话区开始");
assert.match(kb2RetrievalHtml, />东盟原产地规则更新后，出口申报需要补充哪些证明材料？<\/textarea>/, "KB-002 只应在输入框中预填自身问题");
const kb2Run = actions.runRetrievalTest({ knowledgeBaseId: "KB-002", question: "东盟原产地规则更新后，出口申报需要补充哪些证明材料？" });
const kb2CompletedHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-002", run: "1" } }, state);
assert.ok(kb2Run && kb2Run.knowledgeBaseId === "KB-002", "KB-002 应独立执行检索");
assert.match(kb2CompletedHtml, /2026 年东盟原产地规则更新/, "KB-002 运行后应展示自身模拟证据");
assert.match(kb2CompletedHtml, /返回切片数<\/span><strong>2[\s\S]*有效证据数<\/span><strong>2[\s\S]*证据覆盖度<\/span><strong>100%[\s\S]*结果相关性<\/span><strong>100%/, "KB-002 应基于自身证据独立计算运营指标");

const evaluationKnowledgeBase = state.knowledgeBases.find((item) => item.id === "KB-EVAL-SCIFACT");
const evaluationDocument = state.documents.find((item) => item.knowledgeBaseId === "KB-EVAL-SCIFACT");
assert.ok(evaluationKnowledgeBase && evaluationKnowledgeBase.benchmarkReadOnly, "SciFact Mini 应以只读评测知识库进入种子状态");
assert.equal(evaluationKnowledgeBase.evaluationDataset.caseCount, 6, "评测库应声明 6 条带 Gold 的预置题");
assert.equal(evaluationKnowledgeBase.evaluationDataset.documentCount, 11, "评测库应声明 11 篇本地语料");
assert.equal(actions.updateKnowledgeBase(evaluationKnowledgeBase.id, { name: "不可改名", purpose: "不可修改" }), null, "动作层必须拒绝编辑只读评测库");
assert.equal(actions.setKnowledgeBaseEnabled(evaluationKnowledgeBase.id, false), null, "动作层必须拒绝停用只读评测库");
assert.equal(actions.startKnowledgeImport(evaluationKnowledgeBase.id, { files: [{ name: "inject.txt", size: 12 }] }), null, "动作层必须拒绝向只读评测库导入文件");
assert.equal(actions.addDocumentChunk(evaluationDocument.id, { content: "不可写入的切片" }), null, "动作层必须拒绝修改评测切片");
assert.equal(actions.deleteDocument(evaluationDocument.id), null, "动作层必须拒绝删除评测语料");
assert.equal(actions.deleteKnowledgeBase(evaluationKnowledgeBase.id), null, "动作层必须拒绝删除只读评测库");

const evaluationDetailHtml = pages.knowledge.render({ name: "knowledge", id: evaluationKnowledgeBase.id, query: { tab: "documents" } }, state);
assert.match(evaluationDetailHtml, /SciFact Mini 检索评测集[\s\S]*CC BY 4\.0[\s\S]*ODC-By 1\.0[\s\S]*内容与标注只读/, "评测库详情应展示来源许可、Mini 口径和只读状态");
assert.match(evaluationDetailHtml, /导入文件[\s\S]*disabled[\s\S]*基准已锁定/, "评测库详情应保留可理解的灰置变更入口");
assert.match(evaluationDetailHtml, /data-document-delete="SF-DOC-[^"]+" disabled/, "评测语料应可预览但不可删除");
const evaluationChunksHtml = pages.knowledge.render({ name: "knowledge", id: evaluationKnowledgeBase.id, query: { tab: "chunks" } }, state);
assert.match(evaluationChunksHtml, /data-chunk-add="SF-DOC-[^"]+"[^>]*disabled/, "评测切片应可查看但不可新增");

const evaluationWorkspaceHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: evaluationKnowledgeBase.id } }, state);
assert.match(evaluationWorkspaceHtml, /id="test-evaluation-case"[\s\S]*SF-Q-49[\s\S]*SF-Q-53/, "评测检索页应提供全部预置 Gold 题选择器");
assert.match(evaluationWorkspaceHtml, /id="test-question-v2"[^>]*readonly/, "预置评测题正文应只读，避免问题与 Gold 错配");
assert.ok(evaluationWorkspaceHtml.indexOf('class="retrieval-chat__evaluation"') < evaluationWorkspaceHtml.indexOf('class="retrieval-chat__body"'), "评测指标应固定渲染在右侧滚动结果区之前");
assert.match(evaluationWorkspaceHtml, /class="retrieval-chat__evaluation"[\s\S]*Recall@10[\s\S]*<strong>—<\/strong>[\s\S]*Precision@10[\s\S]*<strong>—<\/strong>[\s\S]*MRR@10[\s\S]*<strong>—<\/strong>[\s\S]*Retrieval latency[\s\S]*<strong>—<\/strong>/, "评测尚未运行时顶部四项指标应以当前 Top K 标题和占位符展示");
assert.doesNotMatch(evaluationWorkspaceHtml, /class="retrieval-message/, "评测尚未运行时结果滚动区仍应保持空白");
const firstBusinessKnowledgeBase = state.knowledgeBases.find((item) => item.benchmarkReadOnly !== true);
assert.ok(evaluationWorkspaceHtml.indexOf('data-retrieval-kb-option="' + evaluationKnowledgeBase.id + '"') < evaluationWorkspaceHtml.indexOf('data-retrieval-kb-option="' + firstBusinessKnowledgeBase.id + '"'), "检索测试下拉应仅在本页将评测库稳定置顶");
assert.match(evaluationWorkspaceHtml, /retrieval-kb-option--evaluation[\s\S]*评测库/, "评测库选项应使用可识别的专属颜色与标签");
const invalidEvaluationWorkspaceHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "DOES-NOT-EXIST" } }, state);
assert.match(invalidEvaluationWorkspaceHtml, /data-retrieval-kb-option="KB-EVAL-SCIFACT"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-retrieval-kb-option="KB-EVAL-SCIFACT"/, "无效知识库 URL 应回退到首个可用评测库，而不是显示失配的选择值");
const evaluationRun = actions.runRetrievalTest({
  knowledgeBaseId: evaluationKnowledgeBase.id,
  evaluationCaseId: "SF-Q-49",
  question: "ADAR1 binds to Dicer to cleave pre-miRNA."
});
assert.ok(evaluationRun && evaluationRun.evaluationMetrics, "SciFact Mini 运行后应生成整套检索评测指标");
assert.equal(evaluationRun.evaluationMetrics.k, 10, "评测指标的 K 应跟随本次最终 Top K");
assert.equal(evaluationRun.evaluationMetrics.sampleCount, 6, "宏平均应覆盖 6 条有效 Gold 题");
assert.ok(Math.abs(evaluationRun.evaluationMetrics.recallAtK - 11 / 12) < 1e-9, "默认 Rerank 应保留一项可解释漏召回，避免演示满分");
assert.ok(Math.abs(evaluationRun.evaluationMetrics.precisionAtK - 6 / 60) < 1e-9, "Precision@10 应按逐题 Top K 宏平均实时计算");
assert.ok(Math.abs(evaluationRun.evaluationMetrics.mrrAtK - 11 / 12) < 1e-9, "默认 Rerank 应保留一项非首位命中，避免演示满分");
assert.equal(evaluationRun.evaluationMetrics.latencyKind, "simulated", "静态 Demo 时延必须明确标为模拟值");
assert.ok(evaluationRun.evaluationMetrics.retrievalLatencyMs > 0, "静态 Demo 应生成可重复的模拟检索时延");
const evaluationCompletedHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: evaluationKnowledgeBase.id, run: "1" } }, state);
assert.match(evaluationCompletedHtml, /召回率[\s\S]*Recall@10[\s\S]*91\.7%[\s\S]*精确率[\s\S]*Precision@10[\s\S]*10\.0%[\s\S]*平均倒数排名[\s\S]*MRR@10[\s\S]*0\.917[\s\S]*检索时延[\s\S]*Retrieval latency[\s\S]*119 ms/, "运行后应按中文标题、英文辅助文字和非满分结果展示四项评测指标");
assert.equal((evaluationCompletedHtml.match(/retrieval-result-summary--evaluation/g) || []).length, 1, "运行后评测指标只应在右侧固定顶部出现一次");
assert.ok(evaluationCompletedHtml.indexOf('class="retrieval-result-summary retrieval-result-summary--evaluation"') < evaluationCompletedHtml.indexOf('class="retrieval-chat__body"'), "运行后评测指标不得回到检索结果消息流内");
assert.match(evaluationCompletedHtml, /class="retrieval-message retrieval-message--user" aria-label="测试问题"/, "问题气泡应保留无障碍语义");
assert.doesNotMatch(evaluationCompletedHtml, />测试问题<\//, "问题气泡不应显示重复的测试问题标题");
assert.match(evaluationCompletedHtml, /检索时延为静态 Demo 模拟均值/, "静态 Demo 应在指标口径中明确时延不是生产实测值");
assert.match(evaluationCompletedHtml, /宏平均 · N=6[\s\S]*Gold 只用于评分，不参与排序/, "指标区应说明聚合样本数和防止 Gold 泄漏的口径");
const topTwentyEvaluationRun = actions.runRetrievalTest({
  knowledgeBaseId: evaluationKnowledgeBase.id,
  evaluationCaseId: "SF-Q-49",
  question: "ADAR1 binds to Dicer to cleave pre-miRNA.",
  operatorOverrides: {
    rerankEnabled: true,
    rerankerModelId: "MODEL-RERANK-PRIMARY",
    keywordWeight: 45,
    semanticWeight: 55,
    finalTopK: 20,
    relevanceThreshold: 0.6,
    relevanceLevel: "balanced"
  }
});
assert.ok(Math.abs(topTwentyEvaluationRun.evaluationMetrics.precisionAtK - 6 / 120) < 1e-9, "Precision@K 应始终以 K 为分母，候选或阈值造成的缺位按非相关计");
const noRerankEvaluationRun = actions.runRetrievalTest({
  knowledgeBaseId: evaluationKnowledgeBase.id,
  evaluationCaseId: "SF-Q-49",
  question: "ADAR1 binds to Dicer to cleave pre-miRNA.",
  operatorOverrides: {
    rerankEnabled: false,
    rerankerModelId: null,
    keywordWeight: 45,
    semanticWeight: 55,
    finalTopK: 5,
    relevanceThreshold: 0.4,
    relevanceLevel: "loose"
  }
});
assert.ok(Math.abs(noRerankEvaluationRun.evaluationMetrics.mrrAtK - 53 / 90) < 1e-9, "关闭 Rerank 后 MRR@K 应按固定融合排序精确重算，而非使用硬编码分数");

const processingModes = ["smart", "semantic", "structure", "recursive", "separator", "page", "whole_document"];
const visibleProcessingPresets = state.rag.ingestionProfiles.filter((profile) => profile.visible !== false && profile.chunking);
assert.ok(processingModes.every((mode) => visibleProcessingPresets.some((profile) => profile.chunking.mode === mode)), "代码预置方案应覆盖自动、语义及结构、递归、分隔符、按页和整篇五种自定义方式");
assert.equal(visibleProcessingPresets.length, 7, "新流程应提供两个顶层方案与五个自定义方法对应的七个代码预置");
assert.deepEqual(visibleProcessingPresets.slice().sort((left, right) => left.displayOrder - right.displayOrder).map((profile) => profile.id), ["ING-01", "ING-SEMANTIC", "ING-STRUCTURE", "ING-RECURSIVE", "ING-SEPARATOR", "ING-PAGE", "ING-WHOLE"], "七个可见预置应使用稳定顺序支撑 3+5 信息层级");
assert.deepEqual(processingModes.slice(2).map((mode) => visibleProcessingPresets.find((profile) => profile.chunking.mode === mode).displayOrder), [3, 4, 5, 6, 7], "五个自定义预置应依次使用 displayOrder 3–7");
const legacyFixedPreset = state.rag.ingestionProfiles.find((profile) => profile.id === "ING-FIXED");
assert.ok(legacyFixedPreset && legacyFixedPreset.chunking.mode === "fixed", "ING-FIXED 应保留原固定长度模式，不能把历史记录解释为递归切块");
assert.equal(legacyFixedPreset.displayGroup, "internal", "固定长度旧预置应移入内部兼容组");
assert.equal(legacyFixedPreset.visible, false, "固定长度旧预置不得进入新的策略选择界面");
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
assert.deepEqual(state.rag.modelCatalog.embeddingModels.map(({ id, alias, dimension }) => ({ id, alias, dimension })), expectedEmbeddingPresets, "种子向量模型应使用确认后的官方名称及默认维度");
assert.deepEqual(state.rag.modelCatalog.rerankerModels.map((item) => item.alias), ["Qwen3-Reranker-0.6B", "Qwen3-Reranker-4B", "bge-reranker-v2-m3", "jina-reranker-v3.5"], "种子 Rerank 模型应使用指定版本，并保留 Qwen 官方型号的大写 B");
const allSeedModels = state.rag.modelCatalog.embeddingModels.concat(state.rag.modelCatalog.rerankerModels);
assert.ok(allSeedModels.every((item) => !Object.prototype.hasOwnProperty.call(item, "version")), "官方型号中的版本名应完整保留，数据契约不应另设版本字段");
assert.ok(allSeedModels.every((item) => item.connectionStatus === "available"), "七个预置模型默认均应可用于演示配置");
assert.ok(state.rag.modelCatalog.embeddingModels.every((item) => Number.isFinite(item.dimension) && item.dimension > 0), "每个向量模型都应明确向量维度");
assert.ok(state.rag.modelCatalog.rerankerModels.every((item) => !Object.prototype.hasOwnProperty.call(item, "dimension") && !Object.prototype.hasOwnProperty.call(item, "capability")), "Rerank 模型不应保留向量维度、规格或用途字段");
assert.ok(state.rag.modelCatalog.embeddingModels.concat(state.rag.modelCatalog.rerankerModels).every((item) => {
  const keys = Object.keys(item.apiConfig || {}).sort();
  return keys.join(",") === "apiKeyMasked,endpoint" && item.connectionStatus && Object.prototype.hasOwnProperty.call(item, "lastTestAt");
}), "向量与 Rerank API 配置仅保存地址和脱敏 API Key，连接结果统一使用 connectionStatus 与 lastTestAt");

expectedEmbeddingPresets.forEach((expected) => {
  const preset = state.rag.modelCatalog.embeddingModels.find((item) => item.id === expected.id);
  const testedPreset = actions.testRagModelDraft({ id: preset.id, apiConfig: preset.apiConfig });
  assert.equal(testedPreset.dimension, expected.dimension, `${preset.alias} 编辑测试应保留正确维度`);
  const testedNewEndpoint = actions.testRagModelDraft({ kind: "embedding", apiConfig: { endpoint: preset.apiConfig.endpoint, apiKey: "preset-dimension-check" } });
  assert.equal(testedNewEndpoint.dimension, expected.dimension, `${preset.alias} 的服务地址应能独立识别维度`);
  const savedPreset = actions.saveRagModel({ id: preset.id, name: preset.alias, apiConfig: preset.apiConfig });
  assert.equal(savedPreset.dimension, expected.dimension, `${preset.alias} 编辑保存后不得回退到其他维度`);
});

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
assert.match(previewRetrievalHtml, /<div class="retrieval-chat__body" aria-live="polite"><\/div>/, "切换到尚未运行的临时参数时右侧仍应保持空白");
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
  keywordWeight: 45,
  semanticWeight: 55,
  finalTopK: 5,
  relevanceThreshold: 0.8,
});
assert.ok(noRerankPreview && noRerankPreview.operator.rerankEnabled === false, "V2 临时检索设置应支持显式关闭 Rerank");
const noRerankPreviewHtml = pages.retrievalTest.render({ name: "retrieval-test", id: null, query: { knowledgeBaseId: "KB-001", settings: "preview" } }, state);
assert.match(noRerankPreviewHtml, /aria-checked="false"[\s\S]*data-test-rerank-fields hidden[\s\S]*id="test-reranker-model"[^>]*disabled[\s\S]*id="test-final-topk"[^>]*value="5"[\s\S]*id="test-relevance"[^>]*type="range"[^>]*value="0\.8"[^>]*aria-valuetext="最低相关度 0\.8，严格"/, "临时关闭 Rerank 时应隐藏模型并继续回显 Top K 与 0.8 门槛");
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
    keywordWeight: 45,
    semanticWeight: 55,
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
assert.match(quickRunHtml, /aria-checked="false"[\s\S]*data-test-rerank-fields hidden[\s\S]*id="test-reranker-model"[^>]*disabled[\s\S]*id="test-final-topk"[^>]*value="5"[\s\S]*id="test-relevance"[^>]*type="range"[^>]*value="0\.9"[^>]*aria-valuetext="最低相关度 0\.9，严格"/, "运行后应回显本次快捷参数和 0.9 门槛，且关闭 Rerank 时只隐藏模型");
assert.match(quickRunHtml, /相关度<\/span><strong>0\.91<\/strong><small>融合分<\/small>/, "快捷参数运行结果应展示本次真正用于排序和过滤的融合分");
assert.doesNotMatch(quickRunHtml, /retrieval-run-snapshot|本次检索配置|本次检索方式：|召回候选数：/, "快捷参数运行结果也不应重复展示配置快照");

const knowledgeCreateHtml = pages.knowledge.render({ name: "knowledge", id: "new", query: {} }, state);
assert.equal((knowledgeCreateHtml.match(/class="creation-step(?:\s|is-|\")/g) || []).length, 4, "定义页应只渲染一组四步进度");
assert.equal((knowledgeCreateHtml.match(/class="form-required-mark"/g) || []).length, 4, "定义知识库的名称、描述、向量模型与访问等级应统一显示必填星号");
assert.match(knowledgeCreateHtml, /id="kb-name"[^>]*required aria-required="true"[\s\S]*id="kb-purpose"[^>]*required aria-required="true"[\s\S]*id="kb-vector"[^>]*required aria-required="true"[\s\S]*id="kb-access"[^>]*required aria-required="true"/, "必填星号必须与浏览器必填及无障碍语义同步");
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
  minAccessLevel: "L1",
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
assert.match(isolatedPreRunHtml, /<div class="retrieval-chat__body" aria-live="polite"><\/div>/, "没有测试记录的知识库应从独立空白对话区开始");
assert.doesNotMatch(isolatedPreRunHtml, /海岳电子|Q3 交付风险/, "新知识库未运行前不得展示其他知识库的问题或证据");
const isolatedRetrievalResult = actions.runRetrievalTest({ knowledgeBaseId: modelSourcedKnowledgeBase.id, question: "这是新知识库的首次独立检索测试吗？" });
assert.ok(isolatedRetrievalResult && isolatedRetrievalResult.id !== seedRetrievalTest.id, "首次运行应为当前知识库创建独立 retrievalTest 对象");
assert.equal(isolatedRetrievalResult.knowledgeBaseId, modelSourcedKnowledgeBase.id, "新测试对象必须绑定当前知识库");
assert.deepEqual(isolatedRetrievalResult.evidence, [], "未配置样例证据的新知识库不得复用其他库证据");
assert.equal(seedRetrievalTest.knowledgeBaseId, seedRetrievalTestKnowledgeBaseId, "新知识库测试不得改写 RT-001 归属");

const primaryEmbedding = state.rag.modelCatalog.embeddingModels.find((item) => item.id === "MODEL-EMBEDDING-PRIMARY");
actions.testRagModelConnection("embedding", primaryEmbedding.id, { simulateFailure: true });
assert.equal(actions.startKnowledgeImport("KB-001", { fileNames: ["不应开始处理.pdf"] }), null, "已绑定向量模型未测通时不得启动新文件处理");
assert.equal(actions.retryImportItem("IMP-0825-03", "IMP-ITEM-001"), null, "向量模型未测通时不得重试会进入向量化的文件");
assert.equal(actions.runRetrievalTest({ testId: "RT-001", knowledgeBaseId: "KB-001", question: "连接异常时能否运行？" }), null, "查询向量模型未测通时不得运行检索测试");
assert.equal(actions.setKnowledgeBaseEnabled("KB-003", true), null, "检索所需模型未测通时不得重新启用知识库");
const embeddingUnavailableDetailHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { tab: "documents" } }, state);
assert.match(embeddingUnavailableDetailHtml, /向量模型连接不可用[\s\S]*前往模型管理/, "知识库详情应基于真实绑定模型状态显示错误和处置入口");
assert.match(embeddingUnavailableDetailHtml, /data-test-kb="KB-001"[\s\S]*disabled|disabled[\s\S]*data-test-kb="KB-001"/, "向量模型连接不可用时详情页应禁止检索测试");
actions.testRagModelConnection("embedding", primaryEmbedding.id);
assert.equal(primaryEmbedding.connectionStatus, "available", "向量模型恢复连接后新文件处理与检索可继续");

const seedKnowledgeDetailHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: {} }, state);
assert.doesNotMatch(seedKnowledgeDetailHtml, /page-header__subtitle/, "知识库详情页头只应显示名称，不重复 ID 与描述副标题");
const knowledgeInfoMatch = seedKnowledgeDetailHtml.match(/<section class="panel knowledge-info">[\s\S]*?<\/section>/);
assert.ok(knowledgeInfoMatch, "知识库详情应渲染常驻知识库信息区");
assert.match(knowledgeInfoMatch[0], /知识库 ID[\s\S]*KB-001[\s\S]*访问等级[\s\S]*描述[\s\S]*向量模型[\s\S]*创建时间[\s\S]*更新时间/, "知识库信息区应包含 ID、访问等级、描述、模型与时间信息；检索设置由 V2 全局管理");
assert.doesNotMatch(knowledgeInfoMatch[0], /knowledge-info__item--status|<div class="knowledge-info__label">检索状态<\/div>/, "知识库概要不应重复展示与下方检索节点相同的状态标签");
assert.doesNotMatch(knowledgeInfoMatch[0], /文件数量|文档处理策略/, "知识库常驻信息不应重复文件数量或展示文件级处理策略");
assert.match(knowledgeInfoMatch[0], /知识处理与检索状态[\s\S]*文档解析[\s\S]*切片处理[\s\S]*向量化[\s\S]*索引[\s\S]*检索/, "知识库信息第二行应整行展示处理与检索状态链");
assert.match(seedKnowledgeDetailHtml, /<th>文件<\/th>[\s\S]*<th>文件状态<\/th>[\s\S]*<th>切片数<\/th>[\s\S]*<th>导入时间<\/th>[\s\S]*<th>操作<\/th>/, "文件列表应使用单一生命周期、切片数与必要操作列");
assert.doesNotMatch(seedKnowledgeDetailHtml, /当前修订|有效等级|<th>页数<\/th>|<th>处理状态<\/th>|<th>检索状态<\/th>/, "文件列表不得展示版本、文件等级、页数或双状态");
assert.match(seedKnowledgeDetailHtml, /data-document-preview="DOC-001"[\s\S]*data-document-delete="DOC-001"/, "文件列表应至少提供预览与删除操作");
assert.match(seedKnowledgeDetailHtml, /data-document-preview="DOC-001"[^>]*>海岳电子供应商框架合同\.pdf<\/[^>]+>/, "文件名称本身应可点击进入预览");
assert.match(seedKnowledgeDetailHtml, /role="tablist"[\s\S]*data-knowledge-content-tab="documents"[^>]*>文件<\/[\s\S]*data-knowledge-content-tab="chunks"[^>]*>切片<\//, "知识库内容区应以文件和切片两个页签替代重复面板标题");
assert.match(seedKnowledgeDetailHtml, /data-knowledge-content-tab="documents"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-knowledge-content-tab="documents"/, "知识库详情默认应选中文件页签");
const quickChunksHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { tab: "chunks", document: "DOC-001" } }, state);
const quickChunkCardCount = (quickChunksHtml.match(/data-chunk-preview-card=/g) || []).length;
const quickChunkTitle = quickChunksHtml.match(/全部切片（(\d+)）/);
assert.match(quickChunksHtml, /data-knowledge-content-tab="chunks"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-knowledge-content-tab="chunks"/, "切片页签应准确表达选中状态");
assert.match(quickChunksHtml, /data-quick-chunk-document-select="KB-001"[\s\S]*<option value="DOC-001" selected>/, "切片快览应支持在知识库文件之间切换并保留当前文件");
assert.ok(quickChunkTitle && Number(quickChunkTitle[1]) === quickChunkCardCount, "切片快览标题应使用当前真实渲染卡片数量");
assert.match(quickChunksHtml, /data-chunk-full-preview="DOC-001"[\s\S]*完整预览[\s\S]*data-chunk-add="DOC-001"[\s\S]*新增切片/, "切片快览应打通完整预览与新增切片入口");
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
  minAccessLevel: "L2",
  minAccessLevelLabel: "敏感业务"
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
assert.match(uploadHtml, /data-upload-drop[\s\S]*type="file" multiple[\s\S]*data-upload-file-list/, "导入步骤应提供多选/拖放区和逐文件列表容器");
assert.doesNotMatch(uploadHtml, /summary-cell|creation-summary|知识库摘要/, "导入步骤不应重复上一步的知识库信息摘要");
assert.match(uploadHtml, /data-upload-cancel[\s\S]*data-upload-start/, "导入步骤底部只保留取消和导入动作");

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

const processingHtml = pages.knowledge.render({ name: "knowledge", id: createdKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
assert.doesNotMatch(processingHtml, /creation-section-intro"><h2>/, "第 4 步正文不应重复步骤条中的“文档处理策略”标题");
const renderedProcessingFamilies = Array.from(processingHtml.matchAll(/<input\b(?=[^>]*\bname="processing-family")(?=[^>]*\bvalue="([^"]+)")[^>]*>/g), (match) => match[1]);
const renderedCustomMethods = Array.from(processingHtml.matchAll(/<input\b(?=[^>]*\bname="processing-method")(?=[^>]*\bvalue="([^"]+)")[^>]*>/g), (match) => match[1]);
assert.deepEqual(renderedProcessingFamilies, ["smart", "semantic", "custom"], "文档处理首层应且仅应提供自动、语义和自定义三个 family");
assert.deepEqual(renderedCustomMethods, ["structure", "recursive", "separator", "page", "whole_document"], "自定义 family 应按稳定顺序提供结构、递归、分隔符、按页和整篇五种 method");
assert.match(processingHtml, /data-processing-family-list[\s\S]*value="smart"[\s\S]*<strong>自动切片<\/strong>[\s\S]*value="semantic"[\s\S]*<strong>语义切片<\/strong>[\s\S]*value="custom"[\s\S]*<strong>自定义切片<\/strong>/, "三个首层 family 应展示普通用户名称并保持顺序");
assert.match(processingHtml, /data-processing-method-list[\s\S]*value="structure"[\s\S]*<strong>结构切片<\/strong>[\s\S]*value="recursive"[\s\S]*<strong>递归切块<\/strong>[\s\S]*value="separator"[\s\S]*<strong>分隔符切片<\/strong>[\s\S]*value="page"[\s\S]*<strong>按页切片<\/strong>[\s\S]*value="whole_document"[\s\S]*<strong>整篇切片<\/strong>/, "五个自定义 method 应按顺序展示完整、可理解的普通名称");
assert.doesNotMatch(processingHtml, /value="fixed"|data-processing-profile-id="ING-FIXED"|<strong>固定长度<\/strong>/, "新建流程中递归切块应完全替代固定长度选项");
assert.match(processingHtml, /name="processing-family" value="smart"[^>]*data-processing-profile-id="ING-01"[^>]*checked/, "进入文档处理步骤应默认选中自动 family");
assert.match(processingHtml, /class="processing-method-picker" data-processing-method-picker hidden/, "默认选中自动 family 时应保持自定义 method 区隐藏");
assert.doesNotMatch(processingHtml, /data-processing-group=|processing-profile-more|更多策略|data-processing-profile-id="ING-02"/, "新信息架构不应残留旧的单层分组、更多策略或 ING-02 候选");
const processingCardsStart = processingHtml.indexOf("data-processing-family-list");
const processingCardsEnd = processingHtml.indexOf("data-processing-draft", processingCardsStart);
const processingCardsHtml = processingHtml.slice(processingCardsStart, processingCardsEnd);
assert.doesNotMatch(processingCardsHtml, /最大字符|重叠比例|索引内容|关联信息/, "family 与 method 卡片只应显示名称、描述和推荐关系，参数统一移入编辑区");
assert.match(processingHtml, /data-processing-param="maxChars"[\s\S]*data-processing-param="overlapPercent"[\s\S]*关联信息[\s\S]*索引内容/, "默认策略的编辑区应覆盖切片参数、关联信息和索引内容");
assert.match(processingHtml, /系统自动编排[\s\S]*结构[\s\S]*递归拆分[\s\S]*长度上限兜底[\s\S]*不调用语义模型/, "自动切片应解释内部组合逻辑，并明确不会静默启用语义计算");
assert.match(processingCardsHtml, /data-processing-family="semantic"[\s\S]*语义切片/, "流程应在首层提供可选的语义切片 family");
assert.doesNotMatch(processingHtml, /本次处理参数/, "参数区不应重复显示无信息量的标题");
assert.doesNotMatch(processingHtml, /向量模型不匹配/, "文档处理策略不应再绑定或按向量模型过滤");
assert.doesNotMatch(processingHtml, /processing-profile-card is-disabled|name="processing-(?:family|method)"[^>]*disabled/, "解析产物缺项不应让已启用 family 或 method 整卡不可选");
assert.match(processingHtml, /Demo 说明[\s\S]*仅递归切块[\s\S]*实际拆分[\s\S]*其他策略[\s\S]*配置演示/, "处理页应明确当前实际拆分与配置演示的能力边界");

const semanticProfile = state.rag.ingestionProfiles.find((item) => item.id === "ING-SEMANTIC");
assert.ok(semanticProfile && semanticProfile.chunking.mode === "semantic", "语义切片应作为代码预置方案进入真实处理数据模型");
const semanticKnowledgeBase = actions.createKnowledgeBase({
  name: "语义切片闭环测试库",
  purpose: "验证语义切片参数、批次快照和消耗估算。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
  minAccessLevel: "L1",
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
const semanticCostNotices = semanticProcessingHtml.match(/class="vector-cost-notice semantic-cost-notice"/g) || [];
assert.equal(semanticCostNotices.length, 1, "选中语义切片时只应展示一条轻量效果与消耗提示");
assert.match(semanticProcessingHtml, /data-processing-param="semanticSensitivity"[\s\S]*<div class="vector-cost-notice semantic-cost-notice" role="note">[\s\S]*<span>语义边界效果需用真实问题集验证；入库时会增加句段 Embedding 消耗与处理耗时，查询阶段不会新增这类切片模型调用。<\/span><\/div>/, "语义切片的单行提示应说明真实问题集验证、入库 Embedding 消耗与查询阶段边界");
assert.doesNotMatch(semanticProcessingHtml, /semantic-impact|semantic-impact__item|效果与消耗说明|语义边界质量较高（预期）/, "语义提示不应再扩展为标题加四张 impact 卡片");
assert.doesNotMatch(semanticProcessingHtml, /data-processing-param="overlapPercent"/, "语义切片不应向运营人员展示无效的固定重叠率");
const semanticBatch = actions.startKnowledgeImport(semanticKnowledgeBase.id, {
  files: [{ name: "多主题研究材料.pdf", size: 1600000, characterCount: 16000 }],
});
assert.equal(semanticBatch.processingParametersSnapshot.semanticSensitivity, "high", "导入批次应继承知识库的语义敏感度快照");
assert.equal(semanticBatch.items[0].processingEstimate.extraEmbeddingCostLevel, "high", "语义切片批次应记录额外句段 Embedding 消耗等级");
assert.deepEqual(semanticBatch.items[0].processingEstimate.embeddingStages.map((item) => item.key), ["semantic_boundary_embedding", "final_chunk_embedding"], "语义切片估算应区分边界向量计算与最终索引向量化");
const semanticDocument = state.documents.find((item) => item.id === semanticBatch.items[0].documentId);
assert.equal(semanticDocument.chunkingEstimate.extraEmbeddingCostLabel, "较高", "文档实例应保留本次语义切片消耗估算");
assert.equal(semanticDocument.chunkingEstimate.chunkCount, semanticDocument.chunkCount, "文档切片数应由语义模式的估算结果生成");
assert.equal(actions.deleteKnowledgeBase(semanticKnowledgeBase.id), semanticKnowledgeBase, "闭环测试完成后应能删除未启用的语义测试库");

const recursiveProfile = state.rag.ingestionProfiles.find((item) => item.id === "ING-RECURSIVE");
const expectedRecursiveBoundaries = ["paragraph", "newline", "sentence", "whitespace", "character"];
assert.ok(recursiveProfile && recursiveProfile.chunking.mode === "recursive", "递归切块应使用独立的 ING-RECURSIVE 预置与 recursive 模式");
assert.equal(recursiveProfile.chunking.strategy, "recursive_character", "递归预置不能残留固定长度算法");
assert.deepEqual(recursiveProfile.chunking.recursiveBoundaries, expectedRecursiveBoundaries, "递归预置应按由粗到细的内置边界逐级拆分");
assert.equal(recursiveProfile.chunking.keepSeparator, true, "递归拆分必须保留原分隔符");
assert.equal(recursiveProfile.chunking.usesSemanticModel, false, "递归切块不得启用语义边界模型");
const recursiveProfileBefore = structuredClone(recursiveProfile);
const recursiveKnowledgeBase = actions.createKnowledgeBase({
  name: "递归切块闭环测试库",
  purpose: "验证参数固化、内置边界和历史固定长度兼容。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
  minAccessLevel: "L1",
});
for (const invalidParameters of [{ maxChars: 199 }, { maxChars: 10001 }, { maxChars: 1000.5 }, { maxChars: Infinity }, { overlapPercent: -1 }, { overlapPercent: 51 }, { overlapPercent: 10.5 }]) {
  assert.equal(actions.setKnowledgeBaseOnboardingConfig(recursiveKnowledgeBase.id, {
    ingestionProfileId: "ING-RECURSIVE",
    processingParameters: { mode: "recursive", maxChars: 1000, overlapPercent: 10, ...invalidParameters },
  }), null, "递归模式必须复用最大字符与重叠率的有效范围校验");
}
const recursiveConfigured = actions.setKnowledgeBaseOnboardingConfig(recursiveKnowledgeBase.id, {
  ingestionProfileId: "ING-RECURSIVE",
  processingParameters: {
    mode: "recursive", maxChars: 1400, overlapPercent: 12,
    recursiveBoundaries: ["character"], keepSeparator: false, usesSemanticModel: true,
  },
  completed: true,
});
assert.ok(recursiveConfigured, "递归模式应能保存并完成知识库文档处理配置");
assert.equal(recursiveConfigured.processingParametersSnapshot.mode, "recursive", "知识库参数快照应写入递归模式");
assert.equal(recursiveConfigured.processingParametersSnapshot.maxChars, 1400, "知识库参数快照应保存本次字符上限");
assert.equal(recursiveConfigured.processingParametersSnapshot.overlapPercent, 12, "知识库参数快照应保存本次重叠率");
for (const snapshot of [recursiveConfigured.processingProfileSnapshot.chunking, recursiveConfigured.processingParametersSnapshot]) {
  assert.deepEqual(snapshot.recursiveBoundaries, expectedRecursiveBoundaries, "内置递归边界必须固化且不可被外部参数改写");
  assert.equal(snapshot.keepSeparator, true, "两种快照均应固化保留分隔符行为");
  assert.equal(snapshot.usesSemanticModel, false, "两种快照均应明确无语义模型计算");
  assert.equal(Object.hasOwn(snapshot, "semanticSensitivity"), false, "递归快照不得残留语义敏感度参数");
}
assert.deepEqual(recursiveProfile, recursiveProfileBefore, "本次递归参数不能改写共享代码预置");
const recursiveProcessingHtml = pages.knowledge.render({ name: "knowledge", id: recursiveKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
assert.match(recursiveProcessingHtml, /name="processing-family" value="custom"[^>]*checked/, "递归模式应回显自定义一级类型");
assert.match(recursiveProcessingHtml, /name="processing-method" value="recursive"[^>]*data-processing-profile-id="ING-RECURSIVE"[^>]*checked/, "递归模式应回显独立方法卡片");
assert.match(recursiveProcessingHtml, /data-processing-param="maxChars"[\s\S]*data-processing-param="overlapPercent"/, "递归参数区应提供最大字符和重叠率");
assert.match(recursiveProcessingHtml, /<input\b(?=[^>]*\bdata-processing-param="maxChars")(?=[^>]*\bmin="200")(?=[^>]*\bmax="10000")(?=[^>]*\bstep="1")[^>]*>/, "递归字符上限应以整数步长覆盖 200–10000 的有效范围");
assert.doesNotMatch(recursiveProcessingHtml, /data-processing-param="(?:separatorType|customSeparator|semanticSensitivity|recursiveBoundaries|pagesPerChunk)"/, "递归模式不得暴露无关参数或要求手工配置内置边界");
assert.match(recursiveProcessingHtml, /段落[\s\S]*换行[\s\S]*句[\s\S]*空[\s\S]*字符/, "递归说明应展示由粗到细的边界顺序");
assert.match(recursiveProcessingHtml, /不调用语义模型/, "递归说明应明确不会产生语义边界模型调用");
assert.match(recursiveProcessingHtml, /重叠率为上限[\s\S]*完整边界/, "递归说明应继续明确重叠率是上限并优先保留完整边界");
const recursiveBatch = actions.startKnowledgeImport(recursiveKnowledgeBase.id, {
  files: [{ name: "递归处理批次.txt", size: 5600, characterCount: 2800 }],
});
assert.deepEqual(recursiveBatch.processingParametersSnapshot, OpsDemo.utils.clone(recursiveConfigured.processingParametersSnapshot), "普通导入批次应继承完整递归参数快照");
assert.equal(recursiveBatch.items[0].processingEstimate.extraEmbeddingCostLevel, "none", "递归切块不得误报额外语义边界 Embedding 消耗");
assert.notEqual(recursiveBatch.processingProfileSnapshot.chunking.recursiveBoundaries, recursiveConfigured.processingProfileSnapshot.chunking.recursiveBoundaries, "批次内置边界列表应独立克隆");
const savedRecursiveBatch = structuredClone(recursiveBatch.processingProfileSnapshot);
const legacyFixedConfigured = actions.setKnowledgeBaseOnboardingConfig(recursiveKnowledgeBase.id, {
  ingestionProfileId: "ING-FIXED",
  processingParameters: { mode: "fixed", maxChars: 880, overlapPercent: 7 },
  completed: true,
});
assert.ok(legacyFixedConfigured, "历史 ING-FIXED 配置仍应被动作层读取");
assert.equal(legacyFixedConfigured.processingProfileSnapshot.chunking.strategy, "fixed_length", "历史固定长度快照不能被重标为递归算法");
const legacyFixedSnapshot = structuredClone(legacyFixedConfigured.processingProfileSnapshot);
const legacyFixedParameters = structuredClone(legacyFixedConfigured.processingParametersSnapshot);
pages.knowledge.render({ name: "knowledge", id: recursiveKnowledgeBase.id, query: { onboarding: "1", step: "processing", flow: "import" } }, state);
assert.deepEqual(legacyFixedConfigured.processingProfileSnapshot, legacyFixedSnapshot, "打开新导入界面不得改写已固化的固定长度历史快照");
const legacyFixedBatch = actions.startKnowledgeImport(recursiveKnowledgeBase.id, {
  files: [{ name: "沿用历史固定长度.txt", size: 8000, characterCount: 4000 }],
});
assert.deepEqual(legacyFixedBatch.processingProfileSnapshot, legacyFixedSnapshot, "普通导入仍应能继承旧 fixed 处理快照");
assert.deepEqual(legacyFixedBatch.processingParametersSnapshot, legacyFixedParameters, "旧模式参数不能在新批次中被静默迁移");
assert.deepEqual(recursiveBatch.processingProfileSnapshot, savedRecursiveBatch, "切换知识库当前策略不能改写既有递归批次");
assert.equal(actions.deleteKnowledgeBase(recursiveKnowledgeBase.id), recursiveKnowledgeBase, "递归闭环测试完成后应清理测试知识库");

const structureProfile = state.rag.ingestionProfiles.find((item) => item.id === "ING-STRUCTURE");
const separatorProfile = state.rag.ingestionProfiles.find((item) => item.id === "ING-SEPARATOR");
assert.ok(structureProfile && structureProfile.chunking.mode === "structure" && structureProfile.chunking.separatorType === "structure", "ING-STRUCTURE 应是独立的解析结构 method 预置");
assert.ok(separatorProfile && separatorProfile.chunking.mode === "separator" && separatorProfile.chunking.separatorType === "paragraph", "ING-SEPARATOR 应是独立的显式分隔符 method 预置");
const customMethodKnowledgeBase = actions.createKnowledgeBase({
  name: "自定义切片方法闭环测试库",
  purpose: "验证结构与分隔符方法分离，以及八个固定分隔符选项。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
  minAccessLevel: "L1",
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
  purpose: "验证八个固定分隔符选项的界面与快照契约。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
  minAccessLevel: "L1",
});
const separatorConfigured = actions.setKnowledgeBaseOnboardingConfig(separatorMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: { mode: "separator", maxChars: 1500, overlapPercent: 5, separatorType: "paragraph" },
  completed: true,
});
assert.equal(separatorConfigured.processingParametersSnapshot.mode, "separator", "分隔符 method 应以独立 mode 写入快照");
assert.equal(separatorConfigured.processingParametersSnapshot.separatorType, "paragraph", "分隔符 method 默认应回显段落 / 空行边界");
const separatorProcessingHtml = pages.knowledge.render({ name: "knowledge", id: separatorMethodKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
assert.match(separatorProcessingHtml, /name="processing-family" value="custom"[^>]*checked/, "使用分隔符 method 时首层应回显自定义 family");
assert.match(separatorProcessingHtml, /name="processing-method" value="separator"[^>]*data-processing-profile-id="ING-SEPARATOR"[^>]*checked/, "使用分隔符 method 时应回显独立的 ING-SEPARATOR 选项");
assert.match(separatorProcessingHtml, /仅匹配所选分隔符[\s\S]*不智能识别句子[\s\S]*小数[\s\S]*缩写/, "分隔符提示应说明逐字符匹配边界，不把标点匹配宣传成语义分句");
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
  assert.equal(configuredBoundary.processingParametersSnapshot.separatorType, boundary.value, `${boundary.value} 下拉选项应写入边界类型快照`);
  assert.equal(configuredBoundary.processingParametersSnapshot.separator, boundary.separator, `${boundary.value} 下拉选项应派生正确的底层分隔符`);
});
const legacySentenceRuleConfigured = actions.setKnowledgeBaseOnboardingConfig(separatorMethodKnowledgeBase.id, {
  ingestionProfileId: "ING-SEPARATOR",
  processingParameters: { mode: "separator", maxChars: 1500, overlapPercent: 5, separatorType: "sentence" },
});
assert.equal(legacySentenceRuleConfigured.processingParametersSnapshot.separatorType, "sentence", "动作层仍应读取历史 sentence 规则快照");
assert.equal(legacySentenceRuleConfigured.processingParametersSnapshot.separator, "。！？.!?", "历史 sentence 快照应保留合并句末标点");
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
  minAccessLevel: "L1",
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
  assert.equal(snapshot.includeContext, true, "按页切片仍可选择关联相邻切片上下文");
  assert.equal(snapshot.separatorType, "literal", "按页快照应恢复字面分页边界类型，不继承其他模式的段落选项");
  assert.equal(snapshot.separator, "\f", "按页快照应固定分页符，不被隐藏下拉的段落值污染");
}
const pageProcessingHtml = pages.knowledge.render({ name: "knowledge", id: pageMethodKnowledgeBase.id, query: { onboarding: "1", step: "processing" } }, state);
assert.match(pageProcessingHtml, /name="processing-method" value="page"[^>]*data-processing-profile-id="ING-PAGE"[^>]*checked/, "按页模式应回显对应方法卡片");
assert.match(pageProcessingHtml, /<input\b(?=[^>]*\bdata-processing-param="pagesPerChunk")(?=[^>]*\bmin="1")(?=[^>]*\bmax="10")(?=[^>]*\bstep="1")(?=[^>]*\bvalue="3")[^>]*>/, "按页编辑区应以 1–10 的整数页数控件回显已保存参数");
assert.doesNotMatch(pageProcessingHtml, /data-processing-param="(?:maxChars|overlapPercent|separatorType|semanticSensitivity|longDocumentFallback)"/, "按页编辑区不得混入字符切片或整篇专用参数");
assert.match(pageProcessingHtml, /data-processing-param="includeContext" checked/, "按页切片应保留可配置的相邻上下文关联");
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
    minAccessLevel: "L1",
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
  assert.match(wholeProcessingHtml, /data-processing-param="documentName"[\s\S]*data-processing-param="headingPath"[\s\S]*data-processing-param="pageNumber"[\s\S]*data-processing-param="tableText"/, "整篇模式应继续保留文件关联信息和索引内容配置");
  assert.match(wholeProcessingHtml, /20,?000\s*字符/, "整篇编辑区应显示现有 20000 字符阈值，解释超长处理的触发条件");
  assert.equal(actions.deleteKnowledgeBase(wholeMethodKnowledgeBase.id), wholeMethodKnowledgeBase, "整篇参数测试后应清理测试库");
}
assert.deepEqual(wholeDocumentProfile, wholeDocumentProfileBefore, "本次整篇参数不得改写共享代码预置");

const parameterIsolationKnowledgeBase = actions.createKnowledgeBase({
  name: "切片参数隔离闭环测试库",
  purpose: "验证整数参数、无关字段隔离与旧 Token 设置兼容。",
  embeddingModelId: "MODEL-EMBEDDING-PRIMARY",
  minAccessLevel: "L1",
});
for (const profile of visibleProcessingPresets) {
  const mode = profile.chunking.mode;
  assert.equal(actions.setKnowledgeBaseOnboardingConfig(parameterIsolationKnowledgeBase.id, {
    ingestionProfileId: profile.id,
    processingParameters: { mode, maxChars: 1000.5 },
  }), null, `${mode} 新方案必须拒绝非整数的字符上限`);
  if (["smart", "structure", "recursive", "separator"].includes(mode)) {
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
    },
  });
  assert.ok(normalizedConfiguration, `${mode} 应接受整数参数并忽略其他模式的无关字段`);
  for (const snapshot of [normalizedConfiguration.processingProfileSnapshot.chunking, normalizedConfiguration.processingParametersSnapshot]) {
    assert.equal(snapshot.maxChars, 1001, `${mode} 应保存非百位整数上限，不能只支持步长 100`);
    for (const key of ["targetTokens", "maxTokens", "overlapTokens"]) assert.equal(Object.hasOwn(snapshot, key), false, `${mode} 规范化快照不得残留旧 ${key} 设置`);
  }
  if (mode === "whole_document") assert.equal(normalizedConfiguration.processingProfileSnapshot.chunking.maxDocumentChars, 1001, "整篇文档阈值应与其字符上限保持一致");
}
const legacyFractionalConfiguration = actions.setKnowledgeBaseOnboardingConfig(parameterIsolationKnowledgeBase.id, {
  ingestionProfileId: "ING-FIXED",
  processingParameters: { mode: "fixed", maxChars: 1000.5, overlapPercent: 10.5 },
});
assert.ok(legacyFractionalConfiguration, "历史 fixed 小数参数不应被新方案的整数要求阻断");
for (const key of ["targetTokens", "maxTokens", "overlapTokens"]) assert.equal(legacyFractionalConfiguration.processingProfileSnapshot.chunking[key], legacyFixedPreset.chunking[key], `历史 fixed 应继续保留原 ${key} 设置`);
assert.equal(actions.deleteKnowledgeBase(parameterIsolationKnowledgeBase.id), parameterIsolationKnowledgeBase, "参数隔离测试后应清理测试库");

const existingImportUploadHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { onboarding: "1", step: "upload", flow: "import" } }, state);
const existingImportParseHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { onboarding: "1", step: "parse", flow: "import" } }, state);
const existingImportProcessingHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { onboarding: "1", step: "processing", flow: "import" } }, state);
assert.match(existingImportUploadHtml, /page-header__title">导入文件[\s\S]*creation-steps[\s\S]*data-existing-import="true"/, "已有知识库导入应从完整四步流程的文件上传步骤进入");
assert.match(existingImportParseHtml, /page-header__title">导入文件[\s\S]*parse-recognition[\s\S]*parse-visual-understanding/, "已有知识库导入应完整保留文档解析编辑步骤");
assert.doesNotMatch(existingImportParseHtml, /parse-return-images|parse-addon-title|附加输出|保留原图/, "已有知识库导入同样不应暴露原图保存选项");
assert.match(existingImportProcessingHtml, /page-header__title">导入文件[\s\S]*name="processing-family"[\s\S]*data-processing-method-list[\s\S]*data-processing-param="maxChars"[\s\S]*data-existing-import="true"/, "已有知识库导入应完整保留 family/method 选择和本次参数编辑");
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
assert.deepEqual(state.rag.ingestionProfiles.find((item) => item.id === "ING-01").chunking, sharedIng01BeforeOnboarding, "本次处理参数不得修改共享文档处理策略");
assert.equal(onboardingConfigured.boundEmbeddingModelId, "MODEL-EMBEDDING-PRIMARY", "切换文档处理策略不得改变知识库绑定的向量模型");
assert.equal(onboardingConfigured.boundVectorDimension, 4096, "切换文档处理策略不得改变知识库向量维度");
createdKnowledgeBase.mineruParseConfig.returnImages = false;
const createdImportBatch = actions.startKnowledgeImport(createdKnowledgeBase.id, { fileNames: ["长文档示例.pdf"] });
assert.equal(createdKnowledgeBase.mineruParseConfig.returnImages, true, "直接导入应迁移旧配置并恢复系统默认原图保存");
assert.equal(createdImportBatch.mineruParseConfig.returnImages, true, "直接导入批次快照不得继承旧配置中的原图关闭状态");
assert.deepEqual(createdImportBatch.items[0].processingEstimate.embeddingStages.map((item) => item.key), ["final_chunk_embedding"], "自动切片入库只应生成最终索引向量，不得静默增加语义边界 Embedding");
const createdIndexTransaction = state.knowledgeVersions.find((item) => item.id === createdImportBatch.resultingKnowledgeVersionId);
assert.ok(createdIndexTransaction.sourceBatchIds.includes(createdImportBatch.id), "常规导入批次应回写到内部索引事务来源");
assert.equal(createdIndexTransaction.ingestionProfileId, "ING-01", "常规导入索引应使用第 4 步显式选择的文档处理策略");
assert.equal(createdIndexTransaction.status, "effective", "常规导入应自动完成索引，不依赖运营人员处理隐藏版本");
assert.equal(createdImportBatch.processingProfileSnapshot.chunking.maxChars, 1480, "后续常规导入应沿用知识库已经固化的处理参数，而不是回退到共享预置");
assert.notEqual(createdImportBatch.processingProfileSnapshot, onboardingConfigured.processingProfileSnapshot, "导入批次必须深拷贝知识库处理快照，不能共享可变对象");
assert.equal(createdKnowledgeBase.documentCounts.searchable, createdKnowledgeBase.documentCounts.total, "无异常的新文件应在处理后直接进入可检索范围");
const documentTotalBeforeStaging = createdKnowledgeBase.documentCounts.total;
const stagedOnboardingBatch = actions.startKnowledgeImport(createdKnowledgeBase.id, { fileNames: ["待配置文档.pdf"], deferred: true });
assert.equal(stagedOnboardingBatch.status, "pending_configuration", "建库第 2 步只应接收并暂存文件");
assert.equal(stagedOnboardingBatch.items[0].documentId, null, "解析策略尚未完成时不应创建处理中文档");
assert.equal(stagedOnboardingBatch.items[0].status, "staged", "上传 UI 的 loading 完成后，动作层应记录为已接收待配置而非长期处理中");
assert.equal(createdKnowledgeBase.documentCounts.total, documentTotalBeforeStaging, "暂存文件不得提前计入知识库文件总数");
const pendingImportHtml = pages.knowledge.render({ name: "knowledge", id: createdKnowledgeBase.id, query: { tab: "imports" } }, state);
assert.doesNotMatch(pendingImportHtml, /导入记录|data-import-continue|继续配置/, "待配置批次不应在运营端恢复导入记录台账");
actions.testRagModelConnection("embedding", primaryEmbedding.id, { simulateFailure: true });
assert.equal(actions.setKnowledgeBaseOnboardingConfig(createdKnowledgeBase.id, {
  ingestionProfileId: "ING-02",
  batchId: stagedOnboardingBatch.id,
  processingParameters: { maxChars: 1760, overlapPercent: 6, includeContext: false, documentName: true, headingPath: true, pageNumber: true, tableText: false },
  completed: true,
}), null, "Step 2 可先暂存文件，但向量模型未测通时 Step 4 不得启动处理");
assert.equal(stagedOnboardingBatch.status, "pending_configuration", "模型连接未恢复时，暂存批次应保持待配置且不创建处理对象");
actions.testRagModelConnection("embedding", primaryEmbedding.id);
const sharedIng02BeforeOnboarding = structuredClone(state.rag.ingestionProfiles.find((item) => item.id === "ING-02").chunking);
const activatedOnboarding = actions.setKnowledgeBaseOnboardingConfig(createdKnowledgeBase.id, {
  ingestionProfileId: "ING-02",
  batchId: stagedOnboardingBatch.id,
  processingParameters: { maxChars: 1760, overlapPercent: 6, includeContext: false, documentName: true, headingPath: true, pageNumber: true, tableText: false },
  completed: true,
});
assert.ok(activatedOnboarding, "完成第 4 步后应激活暂存批次");
assert.equal(stagedOnboardingBatch.status, "completed", "暂存批次应在策略完成后自动完成处理");
assert.equal(stagedOnboardingBatch.ingestionProfileId, "ING-02", "批次应快照第 4 步选择的文档处理策略");
assert.equal(stagedOnboardingBatch.mineruParseConfig.effort, "high", "批次应快照第 3 步的 MinerU 解析策略");
assert.equal(stagedOnboardingBatch.mineruParseConfig.returnImages, true, "批次快照应固定保存原图");
assert.equal(stagedOnboardingBatch.processingProfileSnapshot.chunking.maxChars, 1760, "暂存批次应固化本次最大字符数");
assert.equal(stagedOnboardingBatch.processingProfileSnapshot.chunking.overlapPercent, 6, "暂存批次应固化本次重叠比例");
assert.equal(stagedOnboardingBatch.processingParametersSnapshot.maxChars, 1760, "批次应提供独立的本次处理参数快照");
assert.equal(stagedOnboardingBatch.processingParametersSnapshot.includeContext, false, "批次应固化本次上下文开关");
assert.equal(stagedOnboardingBatch.processingParametersSnapshot.indexContent.tableText, false, "批次应固化本次索引内容开关");
assert.deepEqual(state.rag.ingestionProfiles.find((item) => item.id === "ING-02").chunking, sharedIng02BeforeOnboarding, "批次本次参数不得回写共享处理策略");
assert.equal(stagedOnboardingBatch.items.every((item) => item.status === "success" && item.documentId), true, "完成策略配置后应为逐文件创建处理结果");
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
assert.equal(actions.updateRetrievalSettings({ keywordWeight: 5, semanticWeight: 95 }), null, "关键词权重不得低于 10%");
assert.equal(actions.updateRetrievalSettings({ keywordWeight: 92, semanticWeight: 8 }), null, "混合权重只能按 5% 步长调整");
assert.equal(actions.updateRetrievalSettings({ keywordWeight: 60, semanticWeight: 50 }), null, "关键词与语义权重之和必须为 100%");
assert.equal(actions.updateRetrievalSettings({ finalTopK: 21 }), null, "最终 Top K 不得超过 20");
assert.equal(actions.updateRetrievalSettings({ relevanceLevel: "unknown" }), null, "相关性要求只能使用宽松、均衡或严格三档");
assert.equal(actions.updateRetrievalSettings({ relevanceThreshold: 0.3 }), null, "最低相关度不得低于 0.4");
assert.equal(actions.updateRetrievalSettings({ relevanceThreshold: 1 }), null, "最低相关度不得高于 0.9");
assert.equal(actions.updateRetrievalSettings({ relevanceThreshold: 0.65 }), null, "最低相关度只能按 0.1 步长调整");
assert.equal(actions.updateRetrievalSettings({ relevanceThreshold: Number.NaN }), null, "最低相关度不得为非数值");
const legacyRelevancePreview = actions.previewRetrievalSettings({ relevanceLevel: "strict" });
assert.equal(legacyRelevancePreview.operator.relevanceThreshold, 0.8, "旧版严格档 payload 应兼容迁移为 0.8 门槛");
actions.clearRetrievalTestDraft();
const savedRetrievalSettings = actions.updateRetrievalSettings({
  rerankEnabled: true,
  rerankerModelId: "MODEL-RERANK-PRIMARY",
  keywordWeight: 60,
  semanticWeight: 40,
  finalTopK: 8,
  relevanceThreshold: 0.7,
});
assert.ok(savedRetrievalSettings, "合法的 V2 全局检索设置应能直接保存");
assert.deepEqual(
  {
    rerankerModelId: savedRetrievalSettings.operator.rerankerModelId,
    keywordWeight: savedRetrievalSettings.operator.keywordWeight,
    semanticWeight: savedRetrievalSettings.operator.semanticWeight,
    finalTopK: savedRetrievalSettings.operator.finalTopK,
    relevanceThreshold: savedRetrievalSettings.operator.relevanceThreshold,
    relevanceLevel: savedRetrievalSettings.operator.relevanceLevel,
  },
  { rerankerModelId: "MODEL-RERANK-PRIMARY", keywordWeight: 60, semanticWeight: 40, finalTopK: 8, relevanceThreshold: 0.7, relevanceLevel: "balanced" },
  "全局检索设置应保存运营人员可管理的混合权重、Rerank 与召回设置"
);
assert.equal(Object.prototype.hasOwnProperty.call(savedRetrievalSettings.operator, "rerankCandidates"), false, "运营设置不应持久化系统派生候选数");
assert.equal(Object.prototype.hasOwnProperty.call(savedRetrievalSettings.operator, "maxChunksPerDocument"), false, "运营设置不应持久化不存在的单文件限制");
assert.equal(JSON.stringify(state.rag.retrievalSettings.system), retrievalSystemBeforeUpdate, "保存运营设置不得改写系统固定的混合检索链路");
assert.equal(Object.prototype.hasOwnProperty.call(kb, "currentRetrievalProfileId"), false, "V2 全局检索设置不应改写知识库为配置版本绑定");
assert.ok(actions.updateRetrievalSettings(retrievalOperatorBeforeUpdate), "验证后应能恢复原全局检索设置");

assert.equal("validateCapability" in actions, false, "Skill 目录不应保留产品验证动作");
assert.equal("validateVisualization" in actions, false, "可视化数据样例不应被包装成能力验证动作");
const builtInSkill = state.skills.find((item) => item.id === "SK-01");
const builtInSkillOriginal = {
  name: builtInSkill.name,
  description: builtInSkill.description,
  toolIds: builtInSkill.dependencies.toolIds.slice(),
};
assert.equal(actions.deleteCapability("skill", builtInSkill.id), null, "启用中的 Skill 不得删除，与来源无关");
const editedBuiltInSkill = actions.updateCapability("skill", builtInSkill.id, {
  name: "文档检索与证据引用",
  description: "从当前可检索内容中读取可定位证据，并返回引用位置。",
});
assert.ok(editedBuiltInSkill, "内置 Skill 与上传 Skill 应使用相同的名称、描述保存动作");
assert.equal(editedBuiltInSkill.name, "文档检索与证据引用", "启用中的 Skill 也应允许保存名称");
assert.equal(editedBuiltInSkill.description, "从当前可检索内容中读取可定位证据，并返回引用位置。", "启用中的 Skill 也应允许保存描述");
assert.deepEqual(editedBuiltInSkill.dependencies.toolIds, builtInSkillOriginal.toolIds, "编辑 Skill 名称和描述不得改写只读 Tool 依赖");
assert.ok(actions.updateCapability("skill", builtInSkill.id, {
  name: builtInSkillOriginal.name,
  description: builtInSkillOriginal.description,
}), "内置 Skill 编辑结果应可恢复，且不要求先停用");
assert.deepEqual(builtInSkill.dependencies.toolIds, builtInSkillOriginal.toolIds, "恢复基础信息时同样必须保留原 Tool 依赖");

const stoppedBuiltInSkill = state.skills.find((item) => item.id === "SK-07");
assert.equal(stoppedBuiltInSkill.enabled, false, "验收样例须使用已停用 Skill");
assert.equal(actions.deleteCapability("skill", stoppedBuiltInSkill.id), stoppedBuiltInSkill, "任何来源的 Skill 停用后都应允许删除");
assert.equal(state.skills.includes(stoppedBuiltInSkill), false, "删除后 Skill 应从目录移除");

const uploadedSkill = actions.createCapabilityFromUpload("skill", {
  name: "供应计划研判",
  description: "结合供应计划数据生成研判结论。",
  category: "专项研判",
  icon: "sparkles",
  toolIds: ["TOOL-01"],
  fileName: "supply-plan-skill.zip",
  rootName: "supply-plan-skill",
  fileCount: 3,
  fileSize: 3072,
  fileType: "application/zip",
  manifestPath: "SKILL.md",
});
assert.ok(uploadedSkill && uploadedSkill.id.startsWith("SK-"), "上传 Skill 应生成唯一 Skill ID");
assert.equal(uploadedSkill.enabled, false, "上传 Skill 默认停用");
assert.deepEqual(uploadedSkill.dependencies.toolIds, ["TOOL-01"], "上传包中的 Tool 依赖应作为只读数据保存");
assert.ok(actions.toggleCapability("skill", uploadedSkill.id, true), "依赖就绪后 Skill 可启用");
assert.equal(uploadedSkill.status, "available", "启用状态与可调用状态应保持一致");
assert.equal(actions.deleteCapability("skill", uploadedSkill.id), null, "启用中的上传 Skill 同样不得删除");
const editedSkill = actions.updateCapability("skill", uploadedSkill.id, {
  name: "供应计划风险研判",
  description: "识别计划缺口并生成研判结论。",
});
assert.ok(editedSkill, "启用中的上传 Skill 也应允许在统一抽屉保存名称和描述");
assert.equal(editedSkill.name, "供应计划风险研判", "运营人员可编辑 Skill 名称");
assert.equal(editedSkill.description, "识别计划缺口并生成研判结论。", "运营人员可编辑 Skill 描述");
assert.deepEqual(editedSkill.dependencies.toolIds, ["TOOL-01"], "编辑上传 Skill 也不得改写只读 Tool 依赖");
assert.ok(actions.toggleCapability("skill", uploadedSkill.id, false), "Skill 停用后进入可删除状态");
assert.equal(actions.deleteCapability("skill", uploadedSkill.id), uploadedSkill, "停用的上传 Skill 可删除");
assert.equal(state.skills.includes(uploadedSkill), false, "删除后 Skill 应从目录移除");

actions.toggleCapability("skill", "SK-06", false);
assert.ok(state.visualizations.filter((item) => item.integrationStatus === "integrated").every((item) => item.runtimeStatus === "disabled_by_skill"), "停用图表 Skill 应同步影响可视化目录");
assert.ok(actions.toggleCapability("tool", "TOOL-07", false), "先停用调用方 Skill 后才可停用图表 Tool");
assert.equal(actions.toggleCapability("skill", "SK-06", true), null, "依赖 Tool 未启用时不可启用图表 Skill");
assert.ok(actions.toggleCapability("tool", "TOOL-07", true), "图表 Tool 可恢复启用");
assert.ok(actions.toggleCapability("skill", "SK-06", true), "图表 Tool 就绪后可恢复 Skill");
assert.ok(state.visualizations.filter((item) => item.integrationStatus === "integrated").every((item) => item.runtimeStatus === "available"), "恢复后所有已接入图表应可用");
assert.equal(actions.toggleCapability("tool", "TOOL-07", false), null, "启用中的图表 Skill 会阻止依赖 Tool 被停用");
assert.ok(actions.toggleCapability("skill", "SK-02", false), "所有 Skill 均应使用统一停用动作，依赖影响由状态重算承接");
assert.ok(actions.toggleCapability("skill", "SK-02", true), "底层 Tool 就绪时应可从同一入口重新启用 Skill");

const kb2 = state.knowledgeBases.find((item) => item.id === "KB-002");
actions.setKnowledgeBaseEnabled(kb2.id, false);
actions.setKnowledgeBaseEnabled(kb2.id, true);
assert.equal(kb2.retrievalStatus, "available", "知识库重新启用后应恢复接收符合权限的检索请求");
assert.equal(kb2.enabledStateLabel, "检索已启用", "开关状态应明确表达为检索已启用");

assert.equal(Object.prototype.hasOwnProperty.call(state, "analysisDefinitions"), false, "运营端状态不应保留分析口径数据");
assert.equal(Object.prototype.hasOwnProperty.call(pages, "definitions"), false, "运营端不应注册分析口径页面");
assert.ok(state.skills.every((item) => !Object.prototype.hasOwnProperty.call(item.dependencies || {}, "definitionIds")), "Skill 依赖不应保留分析口径引用字段");
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
assert.ok(state.apiAccess.clients.every((item) => legacyApiFields.every((field) => !Object.prototype.hasOwnProperty.call(item, field))), "API 密钥状态不应保留权限范围、身份、IP、限流、到期或作废字段");
const validApiPermissionLevels = state.meta.accessLevels.map((item) => item.code);
assert.ok(state.apiAccess.clients.every((item) => item.name && item.keyMasked && item.createdAt && Object.prototype.hasOwnProperty.call(item, "lastUsedAt") && validApiPermissionLevels.includes(item.permissionLevel)), "API 密钥列表数据应包含名称、脱敏 Key、状态、访问等级与时间");
const apiAccessHtml = pages.apiAccess.render({ name: "api-access", id: null, query: {} }, state);
assert.match(apiAccessHtml, /<th>名称<\/th>[\s\S]*<th>API Key<\/th>[\s\S]*<th>状态<\/th>[\s\S]*<th>权限<\/th>[\s\S]*<th>最近使用时间<\/th>[\s\S]*<th>创建时间<\/th>[\s\S]*<th>操作<\/th>/, "API 密钥列表应按名称、Key、状态、权限、最近使用、创建时间和操作排序");
assert.match(apiAccessHtml, /已启用[\s\S]*已禁用/, "API 密钥状态应统一显示为已启用或已禁用");
assert.doesNotMatch(apiAccessHtml, /table-footer|共\s*\d+\s*个 API 密钥/, "API 密钥列表不应显示数量 footer");

const createdApiAccess = actions.createApiKey({ name: "质量分析门户", permissionLevel: "L2" });
assert.deepEqual(Object.keys(createdApiAccess), ["key"], "创建结果只返回一次性明文 Key");
const createdApiKey = state.apiAccess.clients.find((item) => item.name === "质量分析门户");
assert.ok(createdApiKey && createdApiKey.id, "创建后的密钥对象应以内部 ID 写入列表");
assert.equal(createdApiKey.status, "active", "新建密钥默认启用");
assert.equal(createdApiKey.permissionLevel, "L2", "新建 API 密钥应保存所选访问等级");
assert.equal(Object.prototype.hasOwnProperty.call(createdApiKey, "key"), false, "明文 Key 不得写入密钥对象");
assert.equal(JSON.stringify(state.apiAccess).includes(createdApiAccess.key), false, "状态中只能保留脱敏 Key");
assert.equal(actions.createApiKey({ name: "", permissionLevel: "L1" }), null, "名称是创建 API 密钥的必填项");
assert.equal(actions.createApiKey({ name: "缺少权限" }), null, "访问等级是创建 API 密钥的必填项");
assert.equal(actions.createApiKey({ name: "无效权限", permissionLevel: "L4" }), null, "API 密钥只能使用现有访问等级");
assert.equal(actions.createApiKey({ name: "质量分析门户", permissionLevel: "L2" }), null, "API 密钥名称应保持唯一，避免运营误认");

assert.equal(typeof actions.rotateApiKey, "undefined", "API 密钥不应存在轮换功能");

actions.setApiKeyEnabled(createdApiKey.id, false);
assert.equal(createdApiKey.status, "disabled", "API 密钥应可停用");
actions.setApiKeyEnabled(createdApiKey.id, true);
assert.equal(createdApiKey.status, "active", "已停用密钥应可重新启用");
assert.equal(actions.deleteApiKey(createdApiKey.id), createdApiKey, "删除动作应返回被删除的密钥对象");
assert.equal(state.apiAccess.clients.includes(createdApiKey), false, "删除后密钥不再保留在列表中");
assert.equal(actions.setApiKeyEnabled(createdApiKey.id, true), null, "已删除密钥不可再次启用");
assert.equal(actions.deleteApiKey(createdApiKey.id), null, "重复删除应安全返回空结果");
assert.ok(state.configurationRecords.some((item) => item.objectId === createdApiKey.id && item.action === "deleted"), "删除密钥应写入内部配置记录");
assert.equal(typeof actions.createApiClient, "function", "旧创建动作名应保留为兼容别名");
assert.equal(typeof actions.revokeApiClient, "function", "旧作废动作名应兼容映射为实际删除");

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
assert.ok(resetPreviewChunkCount > 0, "知识库文件应提供顶层 chunks 预览数据");
assert.equal(actions.addDocumentChunk(resetPreviewDocument.id, { content: "   " }), null, "新增切片内容为必填，空白内容不得写入");
const addedChunkContent = "新增人工核验切片：供应商须在重大风险发生后二十四小时内完成上报。";
const addedChunk = actions.addDocumentChunk(resetPreviewDocument.id, { content: addedChunkContent });
assert.ok(addedChunk && addedChunk.documentId === resetPreviewDocument.id, "运营人员应能为当前文件新增切片");
assert.equal(addedChunk.index, 313, "新增切片编号应接续文件完整切片总数");
assert.equal(addedChunk.characterCount, addedChunkContent.length, "新增切片应记录字符数量");
assert.equal(addedChunk.status, "pending_embedding", "新增切片保存后应进入待向量化状态");
assert.equal(resetPreviewDocument.status, "embedding", "新增切片后文件唯一生命周期应切换为向量化中");
assert.equal(resetPreviewDocument.chunkCount, 313, "文件切片数应随新增切片同步更新");
assert.equal(resetState.chunks.filter((item) => item.documentId === resetPreviewDocument.id).length, resetPreviewChunkCount + 1, "新增切片应写入顶层 chunks，而不是隐藏在文件版本中");
const addedChunkRecord = resetState.configurationRecords.find((item) => item.objectId === addedChunk.id && item.action === "created");
assert.match(addedChunkRecord.impact, /重新向量化[\s\S]*Token 消耗/, "新增切片留痕必须明确向量重建与 Token 消耗影响");
const chunkPreviewHtml = pages.knowledge.render({ name: "knowledge", id: "KB-001", query: { preview: resetPreviewDocument.id } }, resetState);
assert.match(chunkPreviewHtml, /preview-workspace[\s\S]*data-preview-document-select="KB-001"/, "文件预览应复用通用双栏组件并支持切换文件");
assert.match(chunkPreviewHtml, /data-preview-document-download="DOC-001"[^>]*>[\s\S]*下载原文件/, "文件预览页头应提供原文件下载");
assert.doesNotMatch(chunkPreviewHtml, /preview-workspace__pane--source"><header|源文档<\/h2>|status--(?:success|info|neutral|danger)|代表切片|chunk-preview-list__summary/, "文件预览不应重复源文档栏头、文件状态或代表切片汇总");
const renderedChunkCardCount = (chunkPreviewHtml.match(/data-chunk-preview-card=/g) || []).length;
const allChunksTitle = chunkPreviewHtml.match(/全部切片（(\d+)）/);
assert.ok(allChunksTitle, "文件预览右栏标题应使用“全部切片（N）”");
assert.equal(Number(allChunksTitle[1]), renderedChunkCardCount, "全部切片标题中的数量必须等于真实渲染卡片数");
assert.match(chunkPreviewHtml, /data-chunk-preview-card="[^"]+"[^>]*aria-expanded="false"/, "每张切片卡应以 aria-expanded=false 表达默认收起状态");
assert.match(chunkPreviewHtml, new RegExp(addedChunk.id + "[\\s\\S]*" + addedChunk.characterCount + " 字符[\\s\\S]*" + addedChunkContent), "切片卡片应展示切片 ID、字符数与内容");
assert.match(chunkPreviewHtml, /data-chunk-add="DOC-001"/, "切片预览应提供当前文件的新增切片入口");

const disposableDocument = resetState.documents.find((item) => item.id === "DOC-005");
const duplicateImportKnowledgeBase = resetState.knowledgeBases.find((item) => item.id === disposableDocument.knowledgeBaseId);
const documentTotalBeforeDuplicateImport = duplicateImportKnowledgeBase.documentCounts.total;
const disposableHashBeforeReplacement = disposableDocument.contentHash;
const sameContentBatch = actions.startKnowledgeImport(duplicateImportKnowledgeBase.id, {
  files: [{
    name: disposableDocument.name,
    size: disposableDocument.fileSizeBytes,
    type: disposableDocument.mimeType,
    lastModified: disposableDocument.lastModified,
    contentHash: disposableDocument.contentHash,
  }],
});
const skippedDuplicate = sameContentBatch.items[0];
assert.equal(skippedDuplicate.operation, "skip", "同库同名同内容文件应识别为跳过，而不是新建或覆盖");
assert.equal(skippedDuplicate.status, "skipped", "同内容文件应直接进入已跳过状态");
assert.equal(skippedDuplicate.statusLabel, "内容相同，已跳过", "跳过回执应清楚说明内容相同");
assert.equal(skippedDuplicate.existingDocumentId, disposableDocument.id, "跳过结果应关联已存在文件，便于解释去重对象");
assert.equal(sameContentBatch.skippedCount, 1, "批次应汇总同内容跳过数量");
assert.equal(duplicateImportKnowledgeBase.documentCounts.total, documentTotalBeforeDuplicateImport, "同内容跳过不得增加知识库文件数量");
assert.equal(disposableDocument.contentHash, disposableHashBeforeReplacement, "同内容跳过不得改写现有文件");

const replacementHash = "mock:replacement-different-content";
const differentContentBatch = actions.startKnowledgeImport(duplicateImportKnowledgeBase.id, {
  files: [{
    name: disposableDocument.name,
    size: Number(disposableDocument.fileSizeBytes || 1024) + 2048,
    type: disposableDocument.mimeType,
    lastModified: Number(disposableDocument.lastModified || 0) + 1,
    contentHash: replacementHash,
    characterCount: Number(disposableDocument.characterCount || 1200) + 320,
  }],
});
const stagedReplacement = differentContentBatch.items[0];
assert.equal(stagedReplacement.operation, "replace", "同库同名但内容不同的文件应默认进入替换流程");
assert.equal(stagedReplacement.status, "replacement_staged", "不同内容不能在用户确认前直接覆盖原文件");
assert.equal(stagedReplacement.documentId, disposableDocument.id, "替换候选应预先绑定并复用原文件 ID");
assert.equal(differentContentBatch.pendingReplacementCount, 1, "批次应汇总待确认替换数量");
assert.equal(disposableDocument.contentHash, disposableHashBeforeReplacement, "替换确认前原文件内容与索引必须保持不变");
assert.equal(disposableDocument.searchable, true, "替换确认前原文件应继续可检索");
const confirmedReplacement = actions.confirmDocumentReplacement(differentContentBatch.id, stagedReplacement.id);
assert.equal(confirmedReplacement.id, disposableDocument.id, "确认替换后必须沿用原文件 ID");
assert.equal(confirmedReplacement.contentHash, replacementHash, "确认替换后文件内容指纹应切换为新内容");
assert.equal(stagedReplacement.status, "success", "替换项确认后应进入成功状态");
assert.equal(stagedReplacement.statusLabel, "替换完成", "替换项应提供清晰完成回执");
assert.equal(differentContentBatch.replacementCompletedCount, 1, "批次应汇总已完成替换数量");
assert.equal(duplicateImportKnowledgeBase.documentCounts.total, documentTotalBeforeDuplicateImport, "原地替换不得增加知识库文件数量");
const replacementRecord = resetState.configurationRecords.find((item) => item.objectId === disposableDocument.id && item.action === "replaced");
assert.deepEqual(replacementRecord.effects, { vectorRegeneration: true, tokenConsumption: true, indexUpdate: true, documentIdReused: true }, "替换留痕应精确记录向量重建、Token、索引更新与 ID 复用影响");
assert.deepEqual(stagedReplacement.vectorizationImpact, { requiresReembedding: true, consumesTokens: true }, "替换回执应明确需要重新向量化并产生 Token 消耗");

const disposableDocumentChunkCount = resetState.chunks.filter((item) => item.documentId === disposableDocument.id).length;
const deletedDocument = actions.deleteDocument(disposableDocument.id);
assert.equal(deletedDocument.id, "DOC-005", "文件删除动作应返回被删除对象");
assert.equal(resetState.documents.some((item) => item.id === disposableDocument.id), false, "删除后文件应从知识库文件列表移除");
assert.equal(resetState.chunks.some((item) => item.documentId === disposableDocument.id), false, "删除文件应同步移除其切片与向量单元");
assert.equal(deletedDocument.deletedChunkCount, disposableDocumentChunkCount, "删除结果应记录同步移除的切片数量");
const deletedDocumentRecord = resetState.configurationRecords.find((item) => item.objectId === disposableDocument.id && item.action === "deleted");
assert.equal(deletedDocumentRecord.effects.tokenConsumption, false, "删除文件只移除索引内容，不应误报新的向量化 Token 消耗");

const sharedAssetDocumentIds = resetState.documents.filter((item) => item.localAssetId === "DOC-004").map((item) => item.id).sort();
const sharedAssetKb1Total = resetState.knowledgeBases.find((item) => item.id === "KB-001").documentCounts.total;
const sharedAssetKb3Total = resetState.knowledgeBases.find((item) => item.id === "KB-003").documentCounts.total;
const deletedLocalAsset = actions.deleteLocalDocumentAsset("DOC-004");
assert.deepEqual(deletedLocalAsset.deletedDocumentIds.sort(), sharedAssetDocumentIds, "删除本地原文件应覆盖其全部知识库处理实例");
assert.equal(resetState.documents.some((item) => item.localAssetId === "DOC-004"), false, "本地原文件删除后不得残留其他知识库实例");
assert.equal(resetState.chunks.some((item) => sharedAssetDocumentIds.includes(item.documentId)), false, "本地原文件删除后应清理所有知识库的切片与向量单元");
assert.equal(resetState.knowledgeBases.find((item) => item.id === "KB-001").documentCounts.total, sharedAssetKb1Total - 1, "删除共享原文件应更新 KB-001 文件计数");
assert.equal(resetState.knowledgeBases.find((item) => item.id === "KB-003").documentCounts.total, sharedAssetKb3Total - 1, "删除共享原文件应更新 KB-003 文件计数");
const deletedLocalAssetRecord = resetState.configurationRecords.find((item) => item.objectType === "local_document" && item.objectId === "DOC-004" && item.action === "deleted");
assert.deepEqual(deletedLocalAssetRecord.before.knowledgeBaseIds.sort(), ["KB-001", "KB-003"], "本地原文件删除留痕应记录全部受影响知识库");

const localUploadSource = { name: "文档管理上传资料.txt", type: "text/plain" };
const localUploadInput = { name: localUploadSource.name, size: 39, type: localUploadSource.type, lastModified: 1234, sourceFile: localUploadSource, sourcePreview: "待整理的本地原文件内容。" };
const knowledgeCountsBeforeLocalUpload = resetState.knowledgeBases.map((item) => structuredClone(item.documentCounts));
const knowledgeVersionsBeforeLocalUpload = structuredClone(resetState.knowledgeVersions);
const chunksBeforeLocalUpload = resetState.chunks.length;
const localImportUploadHtml = pages.localDocuments.render({ name: "local-documents", id: "upload", query: { step: "upload" } }, resetState);
assert.match(localImportUploadHtml, /creation-steps[\s\S]*data-upload-files[\s\S]*data-upload-start="local-documents"/, "文档管理应从知识库流程的上传界面开始");
assert.doesNotMatch(localImportUploadHtml, /目标知识库|data-local-upload-files|kb-definition|向量模型未连接/, "文档管理上传无需定义、选择或绑定知识库");
const standaloneUpload = actions.startKnowledgeImport("local-documents", { files: [localUploadInput], deferred: true });
assert.equal(standaloneUpload.status, "pending_configuration", "文档管理上传后应暂存文件，继续解析和切块配置");
assert.equal(standaloneUpload.knowledgeBaseId, null, "上传批次不得静默关联任意知识库");
assert.equal(standaloneUpload.processingScope, "local-documents", "上传批次应与知识库导入范围隔离");
assert.equal(standaloneUpload.items[0].documentId, null, "完成配置前不得提前产生处理结果");
assert.equal(resetState.chunks.length, chunksBeforeLocalUpload, "暂存文件尚不生成切片");
const secondLocalBatch = actions.startKnowledgeImport("local-documents", { files: [{ ...localUploadInput, name: "另一批次.txt" }], deferred: true });
const secondLocalContextBefore = structuredClone(actions.getLocalDocumentImportContext(secondLocalBatch.id));
const localImportParseHtml = pages.localDocuments.render({ name: "local-documents", id: "upload", query: { step: "parse", batch: standaloneUpload.id } }, resetState);
assert.match(localImportParseHtml, /parse-recognition[\s\S]*parse-visual-understanding[\s\S]*data-parse-next="local-documents"/, "文档管理应复用原有文档解析界面和下一步事件");
assert.ok(actions.setKnowledgeBaseOnboardingConfig("local-documents", { batchId: standaloneUpload.id, mineruParseConfig: { parseMethod: "auto", imageAnalysisEnabled: true } }), "文档管理应复用解析配置保存动作");
const localImportProcessingHtml = pages.localDocuments.render({ name: "local-documents", id: "upload", query: { step: "processing", batch: standaloneUpload.id } }, resetState);
assert.match(localImportProcessingHtml, /name="processing-family"[\s\S]*data-processing-method-list[\s\S]*data-processing-finish="local-documents"/, "文档管理应复用既有切片方案与完成动作");
assert.ok(actions.setKnowledgeBaseOnboardingConfig("local-documents", { batchId: standaloneUpload.id, ingestionProfileId: "ING-01", processingParameters: { maxChars: 1200, overlapPercent: 8 }, completed: true }), "文档管理应完成上传、解析、切块的同一配置流程");
assert.equal(standaloneUpload.status, "completed", "完成配置后本批文件应已处理");
assert.equal(secondLocalBatch.status, "pending_configuration", "完成一批不得自动处理另一个文档管理批次");
assert.deepEqual(actions.getLocalDocumentImportContext(secondLocalBatch.id), secondLocalContextBefore, "本批解析和切块参数不得改写另一批次");
const standaloneDocument = resetState.documents.find((item) => item.id === standaloneUpload.items[0].documentId);
assert.ok(standaloneDocument, "完成配置应创建文档管理中的处理结果");
assert.equal(standaloneDocument.knowledgeBaseId, null, "文档处理结果不得静默关联任意知识库");
assert.equal(standaloneDocument.status, "processed", "文档管理处理完成后应显示已切块状态");
assert.equal(standaloneDocument.searchable, false, "未关联知识库的原文件不得误报为可检索");
assert.equal(standaloneDocument.pendingVectorization, false, "文档管理切块不得进入无目标的向量化队列");
assert.equal(standaloneDocument.sourceFile, localUploadSource, "完成处理后应保留原文件供预览和下载");
assert.equal(standaloneDocument.sourcePreview, localUploadInput.sourcePreview, "完成处理后应保留读取的原文内容");
const standaloneChunks = resetState.chunks.filter((item) => item.documentId === standaloneDocument.id);
assert.ok(standaloneChunks.length > 0 && standaloneChunks.every((item) => item.knowledgeBaseId === null), "处理结果应包含归属于该文档的本地切块");
assert.equal(standaloneChunks.map((item) => item.content).join(""), localUploadInput.sourcePreview, "文本切块预览应使用读取的原文");
assert.deepEqual(standaloneUpload.items[0].pipeline.map((item) => item.key), ["receive", "mineru", "chunk"], "文档管理仅执行接收、解析、切块，不执行知识库向量化或索引");
assert.deepEqual(resetState.knowledgeVersions, knowledgeVersionsBeforeLocalUpload, "文档管理处理不得创建或修改知识库索引版本");
assert.deepEqual(resetState.knowledgeBases.map((item) => item.documentCounts), knowledgeCountsBeforeLocalUpload, "文档管理处理不得影响现有知识库文件计数");
assert.equal(actions.addDocumentChunk(standaloneDocument.id, { content: "未关联知识库，不允许向量化" }), null, "原文件必须进入明确知识库后才能新增索引切片");
const standaloneListHtml = pages.localDocuments.render({ name: "local-documents", id: null, query: {} }, resetState);
assert.match(standaloneListHtml, new RegExp('data-local-document-id="' + standaloneDocument.id + '" data-local-document-status="processed"'), "处理后的文件应出现在文档管理并可按已切块筛选");
const standalonePreviewHtml = pages.localDocuments.render({ name: "local-documents", id: standaloneDocument.id, query: {} }, resetState);
assert.match(standalonePreviewHtml, /待整理的本地原文件内容。/, "文档管理预览应展示上传原文");
assert.match(standalonePreviewHtml, /全部切片（1）/, "文档管理预览应展示本次切块结果");
assert.doesNotMatch(standalonePreviewHtml, /data-local-preview-kb-select|data-local-preview-chunk-add/, "未入库原文件不应生成虚构的知识库或切片管理控件");
assert.equal(actions.startKnowledgeImport("local-documents", { files: [localUploadInput], deferred: true }).skippedCount, 1, "重复上传相同文件应跳过，不制造重复资产");
assert.equal(actions.startKnowledgeImport("local-documents", { files: [] }), null, "空上传不得自动制造演示文档");
const explicitKnowledgeImport = actions.startKnowledgeImport("KB-002", { files: [localUploadInput] });
assert.ok(explicitKnowledgeImport && explicitKnowledgeImport.successCount === 1, "本地处理后的文件仍可在明确知识库中完成既有导入处理");
const importedStandaloneDocument = resetState.documents.find((item) => item.knowledgeBaseId === "KB-002" && item.name === localUploadInput.name);
assert.equal(importedStandaloneDocument.localAssetId, standaloneDocument.localAssetId, "知识库后续导入应复用已上传原文件标识");
const deletedStandalone = actions.deleteLocalDocumentAsset(standaloneDocument.localAssetId);
assert.equal(deletedStandalone.deletedDocumentIds.length, 2, "删除原文件应一并删除后续明确入库的处理实例");
assert.deepEqual(resetState.knowledgeBases.map((item) => item.documentCounts), knowledgeCountsBeforeLocalUpload, "显式导入再删除后知识库计数应恢复");
const availableKnowledgeBases = resetState.knowledgeBases;
resetState.knowledgeBases = [];
const uploadWithoutKnowledgeBases = actions.startKnowledgeImport("local-documents", { files: [{ ...localUploadInput, name: "无知识库也能上传.txt" }], deferred: true });
assert.ok(actions.setKnowledgeBaseOnboardingConfig("local-documents", { batchId: uploadWithoutKnowledgeBases.id, ingestionProfileId: "ING-01", completed: true }), "没有任何知识库时也应允许完成原文件解析和切块");
resetState.knowledgeBases = availableKnowledgeBases;
assert.ok(actions.deleteLocalDocumentAsset(uploadWithoutKnowledgeBases.items[0].documentId), "未关联知识库的原文件应可独立删除");

const knowledgeCountsBeforeRecursiveUploads = structuredClone(resetState.knowledgeBases.map((item) => item.documentCounts));
const knowledgeVersionsBeforeRecursiveUploads = structuredClone(resetState.knowledgeVersions);
function importRecursivePreview(name, sourcePreview, overlapPercent = 0) {
  const batch = actions.startKnowledgeImport("local-documents", {
    files: [{ name: `递归验收-${name}.txt`, size: sourcePreview.length * 2, sourcePreview }],
    deferred: true,
  });
  assert.ok(batch && batch.status === "pending_configuration", `${name} 应暂存为独立文档管理批次`);
  const configured = actions.setKnowledgeBaseOnboardingConfig("local-documents", {
    batchId: batch.id,
    ingestionProfileId: "ING-RECURSIVE",
    processingParameters: { mode: "recursive", maxChars: 200, overlapPercent },
    completed: true,
  });
  assert.ok(configured && batch.status === "completed", `${name} 应使用递归模式完成本地切块`);
  const documentItem = resetState.documents.find((item) => item.id === batch.items[0].documentId);
  const chunks = resetState.chunks.filter((item) => item.documentId === documentItem.id).sort((left, right) => left.index - right.index);
  assert.ok(chunks.length > 0, `${name} 应生成可预览的实际切片`);
  assert.ok(chunks.every((chunk) => chunk.content.length > 0 && chunk.content.length <= 200), `${name} 的所有切片必须非空且不超过字符上限`);
  assert.ok(chunks.every((chunk) => chunk.characterCount === chunk.content.length), `${name} 的字符计数必须与实际内容一致`);
  assert.ok(chunks.every((chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk.content)), `${name} 的字符兜底不能拆开 emoji 代理对`);
  assert.equal(documentItem.chunkCount, chunks.length, `${name} 的文档切片数应等于实际预览卡片数`);
  assert.equal(documentItem.sourcePreview, sourcePreview, `${name} 应保留原文供预览和下载`);
  assert.equal(batch.processingParametersSnapshot.mode, "recursive", `${name} 应保存独立递归批次模式`);
  assert.deepEqual(batch.processingParametersSnapshot.recursiveBoundaries, expectedRecursiveBoundaries, `${name} 应固化内置边界顺序`);
  assert.equal(documentItem.processingProfileSnapshot.chunking.mode, "recursive", `${name} 的文档实例应保留递归策略快照`);
  assert.deepEqual(batch.items[0].pipeline.map((item) => item.key), ["receive", "mineru", "chunk"], `${name} 本地处理不得执行向量化或索引`);
  if (overlapPercent === 0) assert.equal(chunks.map((chunk) => chunk.content).join(""), sourcePreview, `${name} 零重叠时拼接切片必须完整复原原文与全部分隔符`);
  return { batch, documentItem, chunks };
}
const recursivePreviewCases = [
  { name: "段落边界", source: "甲".repeat(120) + "\r\n\r\n" + "乙".repeat(120) + "\n\n" + "丙".repeat(120), endBoundary: /(?:\r?\n){2}$/, count: 3 },
  { name: "换行边界", source: "甲".repeat(120) + "\r\n" + "乙".repeat(120) + "\n" + "丙".repeat(120), endBoundary: /\r?\n$/, count: 3 },
  { name: "中英文句末", source: "甲".repeat(110) + "。" + "b".repeat(110) + "! " + "丙".repeat(110) + "？" + "d".repeat(110) + ".", endBoundary: /[。！？.!?]$/, count: 4 },
  { name: "空白边界", source: Array.from({ length: 90 }, (_, index) => `word${String(index).padStart(3, "0")}\t`).join(""), endBoundary: /\s$/ },
  { name: "纯空白保留", source: (" \t\r\n\n").repeat(70) },
  { name: "无分隔符长文", source: "无分隔字符".repeat(131) },
  { name: "emoji兜底", source: "前" + "😀🧠".repeat(180) + "尾" },
  { name: "恰好达到上限", source: "边".repeat(200), count: 1 },
];
for (const example of recursivePreviewCases) {
  const result = importRecursivePreview(example.name, example.source);
  if (example.count) assert.equal(result.chunks.length, example.count, `${example.name} 应按有效的大粒度边界拆分，不额外按固定长度切碎`);
  if (example.endBoundary) assert.ok(result.chunks.slice(0, -1).every((chunk) => example.endBoundary.test(chunk.content)), `${example.name} 应优先在对应边界结束切片`);
  assert.ok(actions.deleteLocalDocumentAsset(result.documentItem.localAssetId), `${example.name} 测试原文件应可清理`);
}
const recursiveOverlapSource = Array.from({ length: 120 }, (_, index) => `token${String(index).padStart(3, "0")} `).join("");
const recursiveOverlapResult = importRecursivePreview("边界重叠", recursiveOverlapSource, 25);
let recursiveConsumed = 0;
let sawRecursiveOverlap = false;
for (const chunk of recursiveOverlapResult.chunks) {
  const matchingOverlap = Array.from({ length: Math.min(50, recursiveConsumed) + 1 }, (_, value) => value).find((overlap) => {
    const start = recursiveConsumed - overlap;
    return chunk.content.length > overlap && recursiveOverlapSource.slice(start, start + chunk.content.length) === chunk.content;
  });
  assert.notEqual(matchingOverlap, undefined, "递归重叠切片必须源于原文且重叠字符数不能超过配置上限");
  if (matchingOverlap > 0) sawRecursiveOverlap = true;
  const start = recursiveConsumed - matchingOverlap;
  assert.ok(start === 0 || /\s/.test(recursiveOverlapSource[start - 1]), "存在可用单词边界时，重叠起点不能从单词中间截取");
  recursiveConsumed += chunk.content.length - matchingOverlap;
}
assert.equal(recursiveConsumed, recursiveOverlapSource.length, "移除相邻重叠后应恰好覆盖全部原文，不丢失或额外重复内容");
assert.equal(sawRecursiveOverlap, true, "边界允许时非零重叠率必须生成实际上下文重叠");
assert.ok(actions.deleteLocalDocumentAsset(recursiveOverlapResult.documentItem.localAssetId), "重叠测试原文件应可清理");
assert.deepEqual(resetState.knowledgeBases.map((item) => item.documentCounts), knowledgeCountsBeforeRecursiveUploads, "本地递归切块不得修改知识库文件计数");
assert.deepEqual(resetState.knowledgeVersions, knowledgeVersionsBeforeRecursiveUploads, "本地递归切块不得生成知识库索引版本");

assert.ok(state.configurationRecords.length > initialRecordCount, "重要配置动作必须自动留痕");
console.log("管理闭环检查通过：知识库、文档解析与切片、RAG 检索、向量/Rerank 模型、企业数据、检索服务、Skill、可视化、API 密钥与消耗统计均已联动。")

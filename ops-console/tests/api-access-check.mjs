import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

globalThis.window = globalThis;
require(path.join(demoRoot, "src/core/namespace.js"));
require(path.join(demoRoot, "src/mock/supply-chain-seed.js"));
require(path.join(demoRoot, "src/mock/seed.js"));
require(path.join(demoRoot, "src/core/store.js"));
require(path.join(demoRoot, "src/core/actions.js"));
require(path.join(demoRoot, "src/ui/dom.js"));

globalThis.OpsDemo.ui.overlay = {};
require(path.join(demoRoot, "src/pages/api-access.js"));

const store = globalThis.OpsDemo.core.store;
const actions = globalThis.OpsDemo.core.actions;
const state = store.getState();
const page = globalThis.OpsDemo.pages.apiAccess;

assert.equal(Object.prototype.hasOwnProperty.call(state.apiAccess, "products"), false, "单一检索 API 不应再维护可选产品列表");
assert.ok(state.apiAccess.clients.length >= 2, "检索 API 应保留可验证独立操作的种子密钥");
state.apiAccess.clients.forEach((item) => {
  assert.equal(item.apiType, "retrieval", "运营端每条密钥都必须固定绑定检索 API");
  assert.ok(item.keyMasked.startsWith("sk_retrieval_"), "脱敏 Key 应使用检索 API 前缀");
  assert.equal(Object.prototype.hasOwnProperty.call(item, "permissionLevel"), false, "检索 API 密钥不应保存权限等级");
  assert.ok(Array.isArray(item.knowledgeBaseIds) && item.knowledgeBaseIds.length > 0, "每条检索 API 密钥都应显式绑定知识库范围");
  assert.ok(item.knowledgeBaseIds.every((id) => state.knowledgeBases.some((knowledgeBase) => knowledgeBase.id === id)), "知识库范围只能引用现存知识库");
  assert.ok(["global", "custom"].includes(item.retrievalPolicy?.mode), "每条检索 API 密钥都应保存检索策略模式");
});

const html = page.render({ name: "api-access", id: null, query: {} }, state);
assert.match(html, /<th>名称<\/th>[\s\S]*<th>API Key<\/th>[\s\S]*<th>可访问知识库<\/th>[\s\S]*<th>检索策略<\/th>[\s\S]*<th>状态<\/th>[\s\S]*<th>最近使用时间<\/th>[\s\S]*<th>创建时间<\/th>[\s\S]*<th>操作<\/th>/, "单表应回显知识库范围和检索策略");
assert.doesNotMatch(html, /权限|permissionLevel|api-key-permission/, "检索 API 密钥页面不应展示或配置权限等级");
assert.doesNotMatch(html, /data-api-type-filter|data-api-type|API 能力|研判 Agent API/, "单一检索 API 页不应出现能力筛选、能力列或 Agent 选项");
assert.match(html, /<td><div class="table-primary">全局<\/div><\/td>[\s\S]*<td><div class="table-primary">独立<\/div><\/td>/, "列表应只区分全局与独立检索策略");
assert.doesNotMatch(html, /个知识库|api-key-scope-names|api-key-policy-summary|Rerank 开启 · Top K/, "列表不应展开知识库名称或检索参数详情");

const customPolicy = {
  mode: "custom",
  operator: {
    rerankEnabled: true,
    rerankerModelId: "MODEL-RERANK-MULTILINGUAL",
    finalTopK: 7,
    relevanceThreshold: 0.64
  }
};
const retrievalResult = actions.createApiKey({ name: "合同检索门户", knowledgeBaseIds: ["KB-001"], retrievalPolicy: customPolicy });
assert.ok(retrievalResult.key.startsWith("sk_retrieval_"), "检索 API 应生成专属前缀");
const retrievalKey = state.apiAccess.clients.find((item) => item.name === "合同检索门户");
assert.equal(retrievalKey.apiType, "retrieval", "缺省创建也应在内部固定写入 retrieval 类型");
assert.deepEqual(retrievalKey.knowledgeBaseIds, ["KB-001"], "新建密钥应保存显式知识库白名单");
assert.equal(retrievalKey.retrievalPolicy.mode, "custom", "新建密钥应保存独立检索策略");
assert.equal(retrievalKey.retrievalPolicy.operator.finalTopK, 7, "独立策略应保存最终 Top K");
assert.equal(retrievalKey.retrievalPolicy.operator.relevanceThreshold, 0.64, "独立策略应保存相关度阈值");
assert.equal(JSON.stringify(state.apiAccess).includes(retrievalResult.key), false, "完整 Key 不得写入状态");
assert.equal(actions.resolveApiKeyRetrievalConfig(retrievalKey.id, "KB-001")?.operator.finalTopK, 7, "运行时应解析 Key 的独立策略");
assert.equal(actions.resolveApiKeyRetrievalConfig(retrievalKey.id, "KB-002"), null, "运行时必须拒绝未绑定知识库");
assert.ok(actions.getRagModelUsage("reranker", "MODEL-RERANK-MULTILINGUAL").some((item) => item.id === retrievalKey.id), "独立策略引用的 Rerank 模型应受删除保护");

const validGlobalConfig = { knowledgeBaseIds: ["KB-002"], retrievalPolicy: { mode: "global" } };
assert.equal(actions.createApiKey({ apiType: "retrieval", name: " 合同检索门户 ", ...validGlobalConfig }), null, "检索 API 密钥名称去除首尾空格后必须唯一");
assert.equal(actions.createApiKey({ name: "缺少知识库", retrievalPolicy: { mode: "global" } }), null, "创建密钥必须配置知识库范围");
assert.equal(actions.createApiKey({ name: "未知知识库", knowledgeBaseIds: ["KB-UNKNOWN"], retrievalPolicy: { mode: "global" } }), null, "知识库范围不得引用未知 ID");
assert.equal(actions.createApiKey({ name: "缺少策略", knowledgeBaseIds: ["KB-001"] }), null, "创建密钥必须配置检索策略");
assert.equal(actions.createApiKey({ name: "无效策略", knowledgeBaseIds: ["KB-001"], retrievalPolicy: { mode: "custom", operator: { rerankEnabled: false, finalTopK: 30, relevanceThreshold: 0.6 } } }), null, "独立策略必须通过召回参数校验");
assert.equal(actions.createApiKey({ apiType: "agent", name: "Agent 越界密钥", ...validGlobalConfig }), null, "运营端动作不得创建 Agent Key");
assert.equal(actions.createApiKey({ apiType: "", name: "空能力", ...validGlobalConfig }), null, "显式空能力不得回退为检索 API");
assert.equal(actions.createApiKey({ apiType: "unknown", name: "未知能力", ...validGlobalConfig }), null, "未知能力不得创建 Key");

const globalResult = actions.createApiKey({ name: "全局策略调用方", ...validGlobalConfig });
assert.ok(globalResult, "应支持创建跟随全局配置的检索密钥");
const globalKey = state.apiAccess.clients.find((item) => item.name === "全局策略调用方");
const originalTopK = state.rag.retrievalSettings.operator.finalTopK;
state.rag.retrievalSettings.operator.finalTopK = 13;
assert.equal(actions.resolveApiKeyRetrievalConfig(globalKey.id, "KB-002")?.operator.finalTopK, 13, "跟随全局策略应在调用时读取最新配置");
state.rag.retrievalSettings.operator.finalTopK = originalTopK;
assert.equal(actions.resolveApiKeyRetrievalConfig(globalKey.id, "KB-003"), null, "知识库关闭检索时不得生成运行时配置");

const unaffectedRetrievalKey = state.apiAccess.clients.find((item) => item.id === "API-003");
actions.setApiKeyEnabled(retrievalKey.id, false);
assert.equal(retrievalKey.status, "disabled", "检索 Key 应可停用");
assert.equal(unaffectedRetrievalKey.status, "active", "停用一条检索 Key 不应影响其他检索 Key");
actions.setApiKeyEnabled(retrievalKey.id, true);
assert.equal(actions.deleteApiKey(retrievalKey.id), retrievalKey, "检索 Key 应可独立删除");
assert.ok(state.apiAccess.clients.includes(unaffectedRetrievalKey), "删除一条检索 Key 不应删除其他记录");

const injectedAgent = {
  id: "API-AGENT-BOUNDARY",
  name: "用户端 Agent 密钥",
  apiType: "agent",
  keyMasked: "sk_agent_•••••••OLD1",
  createdAt: "2026-01-01T00:00:00+08:00",
  lastUsedAt: null,
  enabled: true,
  status: "active"
};
state.apiAccess.clients.push(injectedAgent);
assert.doesNotMatch(page.render({ name: "api-access", id: null, query: {} }, state), /用户端 Agent 密钥/, "运营端列表不得渲染混入的 Agent Key");
assert.equal(actions.setApiKeyEnabled(injectedAgent.id, false), null, "运营端启停动作必须拒绝 Agent Key");
assert.equal(injectedAgent.status, "active", "被拒绝的 Agent Key 状态不得变化");
assert.equal(actions.deleteApiKey(injectedAgent.id), null, "运营端删除动作必须拒绝 Agent Key");
assert.ok(state.apiAccess.clients.includes(injectedAgent), "被拒绝的 Agent Key 不得从共享状态中移除");

const legacyRetrieval = {
  id: "API-LEGACY-RETRIEVAL",
  applicationName: "旧检索调用方",
  apiType: "retrieval",
  keyMasked: "sk_retrieval_•••••••OLD2",
  createdAt: "2026-01-01T00:00:00+08:00",
  lastUsedAt: null,
  enabled: true,
  status: "active"
};
state.apiAccess.clients.push(legacyRetrieval);
assert.equal(actions.createApiKey({ name: "旧检索调用方", ...validGlobalConfig }), null, "旧 retrieval 记录的 applicationName 应继续参与去重");
actions.setApiKeyEnabled(legacyRetrieval.id, false);
assert.ok(state.configurationRecords.some((item) => item.objectId === legacyRetrieval.id && item.objectName === "旧检索调用方" && item.after.apiType === "retrieval"), "旧 retrieval 记录审计应保留名称与固定类型");

const aliasResult = actions.createApiClient({ name: "兼容调用方", ...validGlobalConfig });
assert.ok(aliasResult.key.startsWith("sk_retrieval_"), "旧创建别名在运营端也必须固定生成检索 Key");
assert.equal(typeof actions.setApiClientEnabled, "function", "旧启停别名应继续可用");
assert.equal(typeof actions.revokeApiClient, "function", "旧删除别名应继续可用");

console.log("检索 API 密钥检查通过：只创建和管理 retrieval Key，并拒绝操作 Agent Key。");

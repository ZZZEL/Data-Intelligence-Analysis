import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const fixtureSource = await readFile(resolve(root, 'src/fixture.js'), 'utf8');
const appSource = await readFile(resolve(root, 'src/app.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(fixtureSource, context);

const data = context.window.CHAT_DEMO_DATA;
const scenario = data.scenario;

function resultCitationIds(result) {
  const text = [
    result.conclusion,
    ...(result.summary || []),
    ...(result.premises || []),
    ...(result.actions || []),
    ...(result.positionPrinciples || []),
    ...(result.limits || []),
    ...(result.paths || []).flatMap((path) => [path.body, ...(path.details || [])])
  ].filter(Boolean).join('\n');
  const inlineIds = Array.from(text.matchAll(/\[\^([a-z0-9-]+)\]/gi), (match) => match[1]);
  const metricIds = (result.metrics || []).flatMap((metric) => metric.sourceId ? [metric.sourceId] : (metric.sourceIds || []));
  return inlineIds.concat(metricIds);
}

assert.deepEqual(
  Array.from(data.sessions, (session) => session.id),
  ['copper-decision', 'supply-chain-kb-qa', 'general-qa', 'report-reading-qa'],
  'the client must seed the copper demonstration and three ordinary conversations'
);
assert.deepEqual(
  Array.from(data.sessions.filter((session) => session.pinned), (session) => session.id),
  ['copper-decision'],
  'only the copper demonstration must be pinned by default'
);
const ordinarySessions = data.sessions.filter((session) => !session.pinned);
assert.equal(ordinarySessions.length, 3, 'the conversation history must start with three ordinary conversations');
assert.equal(ordinarySessions.find((session) => session.id === 'supply-chain-kb-qa').title, '供应链知识库问答');
assert.equal(ordinarySessions.find((session) => session.id === 'general-qa').title, '通用问答');
assert.equal(ordinarySessions.find((session) => session.id === 'report-reading-qa').title, '分析结果解读');
for (const session of ordinarySessions) {
  assert.deepEqual(
    Array.from(session.messages, (message) => message.role),
    ['user', 'assistant', 'user', 'assistant'],
    `${session.id} must contain two complete conversation turns`
  );
  assert.ok(session.messages.every((message) => typeof message.text === 'string' && message.text.trim()), `${session.id} messages must provide readable text`);
}
assert.ok(!('createdAt' in scenario), 'the conversation fixture must not retain header time metadata');

assert.ok(!('outputProfiles' in data), 'the retired report-template fixture must not remain in the user client');
assert.ok(data.agentApiAccess, 'the user client must own the judgment Agent API key store');
assert.equal(data.agentApiAccess.clients.length, 2, 'the judgment Agent API page must seed two user-owned keys');
assert.ok(data.agentApiAccess.clients.every((item) => item.apiType === 'agent'), 'the user API page must never expose retrieval keys');
assert.ok(data.agentApiAccess.clients.every((item) => item.keyMasked.startsWith('sk_agent_')), 'every seeded Agent key must use the Agent prefix');
assert.ok(!('permissionLevels' in data.agentApiAccess), 'Agent API must not define permission levels');
assert.ok(data.agentApiAccess.clients.every((item) => !('permissionLevel' in item)), 'Agent API keys must not persist permission levels');

const visiblePrimary = scenario.capabilities.filter((item) => scenario.displayCapabilityIds.includes(item.id));
const visibleContinuation = scenario.continuation.filter((item) => scenario.displayCapabilityIds.includes(item.id));
const visibleExecutions = [...visiblePrimary, ...visibleContinuation];
assert.equal(visibleExecutions.length, 3, 'the demonstration must show the three requested capability nodes');
assert.equal(visiblePrimary.length, 3, 'three capability nodes should appear before the thought revision');
assert.equal(visibleContinuation.length, 0, 'no capability node should be appended after the reasoning completes');
assert.equal(scenario.analysisRun.thoughtSegments.length, visiblePrimary.length + 2, 'the initial response must open with thought text, add a post-plan bridge, and place one thought segment after each visible node');
assert.ok(scenario.analysisRun.thoughtSegments[0].length > 500, 'the response must open with a substantial user-visible thought segment');
const thoughtLengths = scenario.analysisRun.thoughtSegments.map((text) => text.length);
assert.ok(thoughtLengths.every((length) => length > 180), 'every thought segment must contain enough reasoning to explain the next transition');
assert.ok(thoughtLengths.reduce((total, length) => total + length, 0) > 2200, 'the completed thought flow must be meaningfully detailed');
assert.ok(Math.max(...thoughtLengths) > Math.min(...thoughtLengths) * 1.8, 'thought segments must use visibly varied lengths instead of an even rhythm');
assert.ok(appSource.includes('renderAnalysisFlow'), 'reasoning and capability calls must share one chronological analysis flow');
assert.ok(appSource.includes('data-thought-segment'), 'the response must expose inline thought-segment hooks');
assert.ok(!appSource.includes('data-thought-revision'), 'thought editing must not add a detached revision section');
assert.ok(appSource.includes('data-answer-body'), 'the response must expose a direct answer-body hook');
assert.ok(!appSource.includes("'执行过程'"), 'the response must not add a synthetic execution-process heading');
assert.ok(!appSource.includes("'分析结论'"), 'the response must not add a synthetic final-answer heading');

assert.ok(!appSource.includes('copy-link'), 'the conversation header must not keep the retired copy-link action');
assert.ok(!appSource.includes("action === 'more'"), 'the conversation header must not keep the retired more action');
assert.ok(!appSource.includes("icon('message-circle'"), 'conversation history must not render per-row icons');

assert.equal(scenario.plan.length, 5, 'analysis plan must contain five analysis-only steps');
assert.deepEqual(
  Array.from(scenario.plan, (item) => item.id),
  [1, 2, 3, 4, 5],
  'analysis plan step ids must be continuous'
);
assert.ok(scenario.plan.every((item) => !/编辑|修订|思维链|思考/.test(item.title + item.detail)), 'editing the initial thought must not be represented as a Plan step');

assert.ok(scenario.revisionOutcome, 'editing the initial thought must provide a complete regenerated outcome');
assert.equal(scenario.revisionOutcome.plan.length, 5, 'the regenerated plan must preserve a focused five-step analysis path');
assert.notDeepEqual(
  Array.from(scenario.revisionOutcome.plan, (item) => item.title),
  Array.from(scenario.plan, (item) => item.title),
  'editing the initial thought must regenerate the downstream Plan'
);
assert.ok(scenario.revisionOutcome.plan.every((item) => !/编辑|修订|思维链|思考/.test(item.title + item.detail)), 'thought editing must remain outside the regenerated Plan');
assert.deepEqual(
  Array.from(scenario.revisionOutcome.capabilities, (item) => item.id),
  ['knowledge', 'web', 'calculation'],
  'the revised flow must rerun internal knowledge retrieval, Web Search, and calculation'
);
assert.deepEqual(
  Array.from(scenario.revisionOutcome.capabilities, (item) => item.stage),
  [10, 11, 12],
  'the revised capability calls must form a fresh ordered sequence'
);
for (const revisedItem of scenario.revisionOutcome.capabilities) {
  const originalItem = visiblePrimary.find((item) => item.id === revisedItem.id);
  assert.ok(originalItem, `${revisedItem.id} must correspond to an original visible capability`);
  assert.notDeepEqual(Array.from(revisedItem.progress), Array.from(originalItem.progress), `${revisedItem.id} must execute with regenerated progress content`);
}
assert.equal(scenario.revisionOutcome.followUpThoughtSegments.length, 4, 'the regenerated Plan and three rerun calls must each be followed by thought text');
const revisedThoughtLengths = scenario.revisionOutcome.followUpThoughtSegments.map((text) => text.length);
assert.ok(revisedThoughtLengths.every((length) => length > 220), 'every regenerated downstream thought segment must be substantial');
assert.ok(revisedThoughtLengths.reduce((total, length) => total + length, 0) > 1500, 'the regenerated downstream thought flow must be detailed');
assert.notEqual(scenario.revisionOutcome.result.conclusion, scenario.result.conclusion, 'the final conclusion must regenerate after the thought revision');
assert.notDeepEqual(Array.from(scenario.revisionOutcome.result.actions), Array.from(scenario.result.actions), 'the final action list must regenerate after the thought revision');
for (const sourceToken of [
  'function createRevisionOutcome(value, versionNumber)',
  'function captureResponseVersion()',
  'state.currentOutcome = createRevisionOutcome(text, state.versionNumber)',
  'state.versionHistory.push(captureResponseVersion())',
  'plan: copyData(activePlan())',
  'capabilities: copyData(activeCapabilities())',
  'thoughtSegments: scenario.analysisRun.thoughtSegments.map',
  'result: copyData(activeResult())'
]) {
  assert.ok(appSource.includes(sourceToken), `repeated revisions must preserve and regenerate complete response versions: ${sourceToken}`);
}

assert.equal(scenario.capabilities.length, 6, 'six capability executions are expected before user input');
assert.deepEqual(
  Array.from(scenario.capabilities, (item) => item.stage),
  [3, 4, 5, 6, 7, 8],
  'first-round capability stages must be continuous'
);
assert.equal(scenario.interaction.stage, 9);
assert.equal(scenario.interaction.resumeStage, 10);
assert.ok(scenario.interaction.presetInput.length > 0, 'the inline revision gate must provide editable demo input');
assert.ok(!scenario.interaction.presetInput.includes('不要只比较'), 'the preset must contain user facts rather than analysis instructions');
assert.ok(scenario.interaction.originalText.length > 0, 'the revision diff must keep the original thought text');
assert.equal(scenario.interaction.target, 'primary-0', 'only the initial thought before the Plan may be revised');
assert.equal(scenario.interaction.originalText, scenario.analysisRun.thoughtSegments[0], 'the revision must target the initial thought paragraph rather than a detached editor value');
assert.ok(scenario.interaction.editHint.length > 0, 'the revision gate must explain that the thought text is editable');
assert.equal(scenario.continuation.length, 4, 'four capability executions are expected after user input');
assert.deepEqual(
  Array.from(scenario.continuation, (item) => item.stage),
  [10, 11, 12, 13],
  'continued capability stages must be continuous'
);
assert.equal(scenario.result.stage, 14, 'the completed result must be stage 14');

assert.deepEqual(
  [
    ...Array.from(scenario.capabilities, (item) => item.stage),
    scenario.interaction.stage,
    ...Array.from(scenario.continuation, (item) => item.stage),
    scenario.result.stage
  ],
  [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  'capability, interaction, continuation, and result stages must form one ordered sequence'
);

const executionItems = [...Array.from(scenario.capabilities), ...Array.from(scenario.continuation)];
for (const item of executionItems) {
  assert.ok(item.id, 'every execution item must have a stable id');
  assert.ok(item.runName, `${item.id} must expose a user-visible run name`);
  assert.ok(item.runType, `${item.id} must expose a user-visible run type`);
  assert.ok(item.planStep >= 1 && item.planStep <= 7, `${item.id} must map to one of the seven plan steps`);
  assert.ok(Array.isArray(item.progress) && item.progress.length > 0, `${item.id} must expose running progress copy`);
}

const requiredRunTypes = ['Tool', 'RAG'];
const actualRunTypes = new Set(visibleExecutions.map((item) => item.runType));
for (const runType of requiredRunTypes) {
  assert.ok(actualRunTypes.has(runType), `missing capability run type: ${runType}`);
}
assert.deepEqual(Array.from(actualRunTypes).sort(), requiredRunTypes.slice().sort(), 'the selected nodes should use Tool and RAG card types');
assert.deepEqual(Array.from(visibleExecutions, (item) => item.id), ['knowledge', 'web', 'calculation'], 'the visible calls must be internal knowledge retrieval, Web Search, and calculation');
assert.deepEqual(Array.from(visibleExecutions, (item) => item.runName), ['内部知识检索', 'Web Search', '数值计算'], 'the three node labels must use concise capability names');
assert.ok(!fixtureSource.includes('MCP'), 'MCP must not appear in capability data');

const webExecutions = [
  visibleExecutions.find((item) => item.id === 'web'),
  scenario.revisionOutcome.capabilities.find((item) => item.id === 'web')
];
for (const [index, webExecution] of webExecutions.entries()) {
  assert.ok(webExecution, `Web Search run ${index + 1} must exist`);
  assert.ok(Array.isArray(webExecution.searchResults) && webExecution.searchResults.length >= 3, `Web Search run ${index + 1} must expose at least three inspectable results`);
  assert.equal(new Set(webExecution.searchResults.map((result) => result.id)).size, webExecution.searchResults.length, `Web Search run ${index + 1} result ids must be unique`);
  for (const result of webExecution.searchResults) {
    assert.ok(result.title && result.snippet, `${result.id} must provide a title and second-line summary`);
    const urls = Object.values(result).filter((value) => typeof value === 'string' && /^https?:\/\//.test(value));
    assert.equal(urls.length, 1, `${result.id} must map to exactly one URL`);
  }
}

assert.equal(scenario.result.documents.length, 1, 'the result must expose exactly one report');
assert.equal(scenario.result.documents[0].id, 'report');
assert.equal(scenario.result.documents[0].size, '1.8 MB', 'the report attachment must show file size only');
assert.ok(!('meta' in scenario.result.documents[0]), 'the report attachment must not mix page count into its size metadata');

const attachmentIds = new Set(Array.from(scenario.attachments, (attachment) => attachment.id));
assert.equal(attachmentIds.size, scenario.attachments.length, 'every uploaded asset must have a stable unique id for citation back-links');
assert.ok(Array.from(scenario.attachments).every((attachment) => attachment.id && attachment.name), 'every uploaded asset must expose identity and display metadata');

const effectiveRevisionResult = Object.assign({}, scenario.result, scenario.revisionOutcome.result);
for (const [label, result] of [['original', scenario.result], ['revised', effectiveRevisionResult]]) {
  assert.ok(Array.isArray(result.sources) && result.sources.length > 0, `${label} result must carry its traceability sources inside the versioned result`);
  const sourceIds = Array.from(result.sources, (source) => source.id);
  assert.equal(new Set(sourceIds).size, sourceIds.length, `${label} result source ids must be unique and stable`);
  assert.deepEqual(
    Array.from(new Set(result.sources.map((source) => source.kind))).sort(),
    ['rag', 'upload', 'web'],
    `${label} result source registry must contain only inspectable uploaded files, internal RAG, and public web evidence`
  );
  assert.ok(!sourceIds.includes('visible-loss'), `${label} result source registry must not promote a derived calculation to a reference source`);
  assert.ok(sourceIds.includes('bid-notice'), `${label} result source registry must retain the uploaded bid notice as inspectable evidence`);
  const sourceIdSet = new Set(sourceIds);
  for (const source of result.sources) {
    assert.ok(source.title, `${label} source ${source.id} must expose a readable title`);
    if (source.kind === 'upload') assert.ok(attachmentIds.has(source.assetId), `${label} upload source ${source.id} must identify the source file that can be previewed`);
    if (source.kind === 'rag' || source.kind === 'web') {
      assert.ok(source.chunk || source.excerpt, `${label} ${source.kind} source ${source.id} must provide its recalled chunk`);
    }
  }
  for (const metric of result.metrics || []) {
    const metricSourceIds = metric.sourceId ? [metric.sourceId] : (metric.sourceIds || []);
    assert.ok(metricSourceIds.length >= 1, `${label} metric ${metric.label} must cite at least one original input source`);
    assert.equal(new Set(metricSourceIds).size, metricSourceIds.length, `${label} metric ${metric.label} must not repeat a source`);
    for (const sourceId of metricSourceIds) {
      assert.ok(sourceIdSet.has(sourceId), `${label} metric ${metric.label} must cite only inspectable registry sources rather than a derived calculation`);
    }
  }
  const citedIds = resultCitationIds(result);
  assert.ok(citedIds.length >= result.sources.length, `${label} result must provide paper-style citations for its visible evidence`);
  for (const citedId of citedIds) assert.ok(sourceIdSet.has(citedId), `${label} citation ${citedId} must resolve in the same version source registry`);
  for (const sourceId of sourceIds) assert.ok(citedIds.includes(sourceId), `${label} indexed source ${sourceId} must support at least one visible claim`);
}

for (const action of [
  'new-chat',
  'select-session',
  'replay-demo',
  'adjust-analysis-direction',
  'toggle-version-menu',
  'select-analysis-version',
  'cancel-thought-edit',
  'apply-thought-edit',
  'attach-file',
  'toggle-web-search',
  'toggle-deep-thinking',
  'send-message',
  'open-document',
  'open-source',
  'open-search-results',
  'export-report'
]) {
  assert.ok(appSource.includes("action === '" + action + "'"), 'missing interaction handler: ' + action);
}

for (const sourceToken of [
  "function agentApiRoute()",
  "function renderAgentApiShell()",
  "function requestCreateAgentApiKey()",
  "function confirmCreateAgentApiKey()",
  "function copyAgentApiSecret()",
  "function requestAgentApiKeyToggle(item)",
  "function requestAgentApiKeyDelete(item)",
  "global.location.hash === agentApiRoute()",
  "apiType: 'agent'",
  "'sk_agent_'",
  "dismissible: false",
  "state.dialog.secretCopied = true"
]) {
  assert.ok(appSource.includes(sourceToken), 'missing judgment Agent API behavior: ' + sourceToken);
}
const agentApiPageBody = appSource.slice(
  appSource.indexOf('function renderAgentApiPage()'),
  appSource.indexOf('function renderAgentApiShell()')
);
const sidebarBody = appSource.slice(
  appSource.indexOf('function renderSidebar()'),
  appSource.indexOf('function sessionMenuTrigger(')
);
assert.ok(agentApiPageBody.includes('<h1 class="settings-page-title">API 密钥</h1>'), 'the Agent API page title must be API 密钥');
assert.ok(appSource.includes("document.title = 'API 密钥 · ' + DATA.productName"), 'the Agent API document title must use API 密钥');
assert.doesNotMatch(agentApiPageBody, /返回对话|arrow-left/, 'the Agent API page must not render a redundant back-to-chat button');
assert.ok(sidebarBody.includes('<span>API 密钥</span>'), 'the account menu must use the same API 密钥 title as the destination page');
assert.ok(!sidebarBody.includes('<span>研判 Agent API</span>'), 'the retired account-menu label must not remain visible');
assert.ok(appSource.includes('<th>名称</th><th>API Key</th><th>状态</th><th>最近使用时间</th><th>创建时间</th><th>操作</th>'), 'the Agent API table must keep lifecycle columns without API type or permission columns');
assert.ok(!appSource.includes('<th>API 能力</th>'), 'the single-capability user page must not repeat an API capability column');
assert.ok(!appSource.includes('data-api-type-filter'), 'the single-capability user page must not expose an API capability filter');
assert.ok(appSource.includes("'思维链'"), 'the composer mode control must be named 思维链');
assert.ok(!appSource.includes("'深度思考'"), 'the retired composer label 深度思考 must be removed from application copy');

for (const sourceToken of [
  'state.stage = 0',
  'state.thoughtRevision = text',
  'state.versionHistory.push(captureResponseVersion())',
  'renderShell({ focusAnalysis: true })',
  'reportSlot.innerHTML = renderDocuments()',
  'runRevisedReplay(runId)',
  'await runContinuationReplay(runId)',
  "updatePlanProgress(activePlan().length, 'complete')",
  'clearThoughtAttention()',
  'focusVersionControl: true'
]) {
  assert.ok(appSource.includes(sourceToken), 'missing gated replay behavior: ' + sourceToken);
}

for (const sourceToken of [
  'function renderThoughtSegment(group, content, index, visible)',
  'function renderInitialThoughtHeader(key, editing, applied, canEdit)',
  'function renderThoughtSegmentContent(group, content, index)',
  'function renderThoughtRevisionDiff(original, revised)',
  'function activeSources()',
  'function safeReferenceUrl(value)',
  'function renderReportReferences()',
  'function locateReportReference(link)',
  'function renderSourceIndex()',
  'function renderSourceDetail(source)',
  'function openSource(sourceId)',
  'function renderComposerModeToggle(action, enabled, iconName, label)',
  'function renderDeepThinkingToggle()',
  'function setDeepThinkingEnabled(enabled)',
  'async function revealRevisedInitialThought(runId)',
  'function applyThoughtRevision()',
  'function resizeComposerTextarea(input)',
  'function renderMarkdown(markdown, options)',
  'function renderPlanTrack(complete, visible)',
  'function renderExecutionRow(item, group, complete)',
  'function renderAnalysisFlow(items, options)',
  'function renderAnswerBody(group, bodyHtml, visible, extraHtml)',
  'function runExecutionItem(group, item, runId)',
  'function setExecutionRowState(group, item, nextState)',
  'function updateExecutionDetail(group, item, text)',
  'async function runInitialReplay(runId)',
  'async function runRevisedReplay(runId)',
  'async function runContinuationReplay(runId)',
  'function typeMarkdownChunk(chunk, runId, options)',
  "new global.Intl.Segmenter('zh-CN'",
  "global.requestAnimationFrame(frame)",
  "global.cancelAnimationFrame(state.streamFrame)"
]) {
  assert.ok(appSource.includes(sourceToken), 'missing stream or message behavior: ' + sourceToken);
}

assert.ok(!appSource.includes('toggle-execution-details'), 'capability calls must not expose output expansion controls');
assert.ok(!appSource.includes('data-execution-details'), 'capability calls must not render tool outputs');
assert.ok(!appSource.includes('data-execution-toggle-copy'), 'capability calls must not render output-toggle copy');

const initialReplayBody = appSource.slice(
  appSource.indexOf('async function runInitialReplay'),
  appSource.indexOf('async function runContinuationReplay')
);
const continuationReplayBody = appSource.slice(
  appSource.indexOf('async function runContinuationReplay'),
  appSource.indexOf('function startReplay')
);
const executionReplayBody = appSource.slice(
  appSource.indexOf('async function runExecutionItem'),
  appSource.indexOf('async function runInitialReplay')
);
assert.ok(!initialReplayBody.includes('renderShell('), 'initial replay must update stable DOM rather than rebuild the shell');
assert.ok(!continuationReplayBody.includes('renderShell('), 'continued replay must update stable DOM rather than rebuild the shell');
assert.ok(!executionReplayBody.includes('renderShell('), 'individual capability progress must update stable DOM rather than rebuild the shell');

assert.ok(!appSource.includes('advanceReplay'), 'timer stages must be replaced by an awaitable stable streaming sequence');
assert.match(
  appSource,
  /var state = \{[\s\S]*?stage:\s*scenario\.result\.stage,/,
  'the default scenario state must open at the configured completed stage'
);
assert.ok(!appSource.includes('renderFinalMessage'), 'the final result must stay inside the same assistant response');
assert.ok(!appSource.includes('renderSupplementalUserMessage'), 'a thought revision must not create a new user message');
assert.ok(!appSource.includes('renderContinuationMessage'), 'continued analysis must not create a second assistant message');
assert.ok(!appSource.includes('scenarioInput'), 'the retired supplemental composer state must be removed');
assert.ok(!appSource.includes('research-user-input'), 'thought editing must use the inline revision surface');
assert.ok(appSource.includes("id=\"thought-inline-input\""), 'thought editing must replace the selected original paragraph in place');
assert.ok(appSource.includes('thought-inline-revision'), 'the original and revised thought must remain together in the edited paragraph');
assert.ok(appSource.includes('thought-diff-delete') && appSource.includes('thought-diff-insert'), 'thought revisions must render inline deletions and insertions at their original positions');
assert.ok(!appSource.includes('thought-inline-old') && !appSource.includes('thought-inline-new'), 'thought revisions must not render detached old and new summary blocks');
assert.ok(!appSource.includes('thought-revision-editor'), 'thought editing must not open a detached editor below the reasoning flow');
assert.ok(!appSource.includes('thought-inline-label'), 'the in-place edit must not add a second editor heading');
assert.ok(!appSource.includes('修改只会重生成此处之后的内容'), 'the in-place edit must not add redundant helper copy');
assert.ok(appSource.includes('调整分析方向'), 'the revision affordance must use user-facing analysis-direction language');
assert.ok(appSource.includes('更新并生成'), 'the inline edit must use the concise update-and-generate action label');
assert.ok(!appSource.includes('保存并重新生成'), 'the previous verbose thought-update label must be removed');
assert.ok(initialReplayBody.includes('paintEditableThoughtSegments()') && initialReplayBody.includes('paintAnalysisDirectionGuide()') && initialReplayBody.includes('await runContinuationReplay(runId)'), 'answer streaming and both section-specific editing entries must begin from the same reasoning-complete boundary');
assert.ok(appSource.includes('analysis-direction-guide') && appSource.includes('thought-inline-edit'), 'composer and initial-thought revision affordances must both exist');
assert.ok(appSource.includes("analysisVersion: 'latest'") && appSource.includes('versionHistory: []'), 'the response must track the latest response and every completed historical snapshot');
assert.ok(appSource.includes('analysis-version-trigger') && appSource.includes('analysis-version-popover'), 'version switching must use one icon and a compact popover');
assert.ok(appSource.includes('历史版本仅供查看') && appSource.includes('继续提问时将自动回到最新版本'), 'the version popover must explain read-only history and latest-version continuation');
assert.ok(appSource.includes('state.versionHistory.slice().reverse().map'), 'the version popover must render the full completed history in newest-first order');
assert.ok(appSource.includes("renderVersionOption('latest'") && appSource.includes("renderVersionOption(String(version.number)"), 'the version popover must expose the latest response plus every historical version');
assert.ok(appSource.includes('renderAnalysisFlow(activeCapabilities()'), 'version switching must replace the complete analysis flow rather than only the final body');
assert.ok(appSource.includes('state.versionHistory.push(captureResponseVersion())') && appSource.includes("state.analysisVersion = 'latest'"), 'saving each revision must append the complete current response and keep the regenerated version active');
assert.ok(!appSource.includes('setAnswerRegenerationStatus'), 'the previous body must disappear instead of remaining stale during regeneration');
assert.ok(!appSource.includes('previous-result-collapse'), 'the previous response must not be rendered as a folded block');
assert.ok(appSource.includes('state.stage = 0') && appSource.includes('renderShell({ focusAnalysis: true })'), 'saving a thought revision must synchronously clear the whole prior response');
assert.ok(initialReplayBody.includes('revealRevisedInitialThought(runId)') && initialReplayBody.includes('showPlanPanel()'), 'the revised response must restart with the edited initial thought before regenerating its Plan');
assert.ok(appSource.includes('runRevisedReplay(runId)'), 'saving a thought revision must trigger the regenerated analysis chain before the final answer');
assert.ok(appSource.includes('result: copyData(activeResult())'), 'version snapshots must retain citations, source metadata, final prose, and the generated report as one result payload');
assert.ok(appSource.includes("['report-preview', 'source-preview', 'search-results'].includes(state.dialog.kind)"), 'switching versions or regenerating must close any stale report, source, or search-results drawer');
assert.ok(appSource.includes("citationMode: 'document'") && appSource.includes('renderReportReferences()'), 'generated report preview must keep linked citation numbers and a static References list');
assert.ok(appSource.includes('data-source-chunk') && appSource.includes('data-source-preview'), 'the source drawer must expose only explicit chunk and preview content regions');
assert.ok(appSource.includes('data-action="open-search-results"') && appSource.includes('data-search-result'), 'completed Web Search nodes must open a row-based search-results drawer');
assert.ok(appSource.includes("kind: 'search-results'"), 'Web Search results must use a dedicated drawer state');
assert.ok(!appSource.includes("title: '来源预览'"), 'source drawers must not retain a placeholder topbar title');
assert.ok(!appSource.includes('data-source-ids'), 'each citation control must address exactly one source id');
assert.ok(!appSource.includes('function locateSourceTarget'), 'source citations must not retain jump-to-asset or jump-to-execution handlers');
assert.ok(appSource.includes('function locateReportReference'), 'the report preview may retain its same-document citation-to-References anchor handler');
assert.ok(!appSource.includes('locate-source-asset') && !appSource.includes('locate-source-execution'), 'the source drawer must not expose jump buttons');
assert.ok(!appSource.includes('composer-tool-check'), 'composer selected states must rely on icon, text, border, and color without a check glyph');

const initialThoughtHeaderBody = appSource.slice(
  appSource.indexOf('function renderInitialThoughtHeader'),
  appSource.indexOf('function renderThoughtSegmentContent')
);
const composerGuideBody = appSource.slice(
  appSource.indexOf('function renderAnalysisDirectionGuide()'),
  appSource.indexOf('function renderComposer()')
);
const composerBody = appSource.slice(
  appSource.indexOf('function renderComposer()'),
  appSource.indexOf('function resizeComposerTextarea')
);
const sendMessageBody = appSource.slice(
  appSource.indexOf('function sendMessage()'),
  appSource.indexOf('function reportBody()')
);
const analysisVersionBody = appSource.slice(
  appSource.indexOf('function renderAnalysisVersionControl()'),
  appSource.indexOf('function renderAnalysisHeading(')
);
const analysisHeadingBody = appSource.slice(
  appSource.indexOf('function renderAnalysisHeading('),
  appSource.indexOf('function renderAnalysisMessage()')
);
const analysisLabelBody = appSource.slice(
  appSource.indexOf('function analysisLabelCopy('),
  appSource.indexOf('function renderVersionOption(')
);
const scrollToLatestBody = appSource.slice(
  appSource.indexOf('function scrollToLatest('),
  appSource.indexOf('function collectTextNodes(')
);
const paintEditableThoughtSegmentsBody = appSource.slice(
  appSource.indexOf('function paintEditableThoughtSegments('),
  appSource.indexOf('function resizeThoughtTextarea(')
);
assert.ok(initialThoughtHeaderBody.includes('adjust-analysis-direction'), 'the initial-thought header must expose one local edit entry');
assert.ok(initialThoughtHeaderBody.includes('cancel-thought-edit') && initialThoughtHeaderBody.includes('apply-thought-edit'), 'the initial-thought header must own the editing cancel and save controls');
assert.ok(initialThoughtHeaderBody.includes('renderAnalysisVersionControl()'), 'the initial-thought header must own the version control');
assert.ok(composerGuideBody.includes('adjust-analysis-direction'), 'the composer section must expose one contextual edit entry');
assert.ok(composerBody.includes('composer-input-row') && composerBody.includes('composer-toolbar'), 'the composer must separate its input and operation rows');
assert.ok(composerBody.indexOf('composer-input-row') < composerBody.indexOf('composer-toolbar'), 'the input row must render before the operation row');
assert.ok(composerBody.includes('renderWebSearchToggle()'), 'the composer operation row must expose the web search toggle');
assert.ok(appSource.includes('webSearchEnabled: false'), 'the composer must track web search as explicit state');
assert.equal((appSource.match(/if \(action === 'toggle-web-search'\)/g) || []).length, 1, 'the web search toggle must have exactly one delegated action handler');
assert.ok(sendMessageBody.includes('webSearchRequested') && sendMessageBody.includes('state.webSearchEnabled = false'), 'web search must be captured for the outgoing message and reset afterward');
assert.ok(sendMessageBody.indexOf('var webSearchRequested') < sendMessageBody.indexOf('state.webSearchEnabled = false'), 'the outgoing message must capture web search before the composer resets it');
assert.ok(sendMessageBody.includes('continueFromLatestAnalysisVersion()') && sendMessageBody.includes('wasEmptyChat || switchedFromHistory'), 'sending from a historical view must return the visible thread to the latest analysis before continuing');
assert.ok(!analysisVersionBody.includes('adjust-analysis-direction'), 'the version control must not introduce another edit entry');
assert.ok(!analysisHeadingBody.includes('analysis-version-trigger') && !analysisHeadingBody.includes('data-version-control') && !analysisHeadingBody.includes('assistant-response-actions'), 'the overall assistant heading must not own version controls');
assert.ok(!analysisLabelBody.includes('state.versionNumber') && !analysisLabelBody.includes('上一版 · v') && !analysisLabelBody.includes('基于调整生成 · v'), 'the overall assistant status must not duplicate version identity');
assert.equal((appSource.match(/data-action="apply-thought-edit"/g) || []).length, 1, 'the interface must expose one save action while editing');
assert.equal((appSource.match(/data-action="cancel-thought-edit"/g) || []).length, 1, 'the interface must expose one cancel action while editing');
assert.ok(!appSource.includes('thought-inline-edit-footer') && !appSource.includes('thought-inline-actions'), 'editing actions must not create a second footer action area');
assert.equal((appSource.match(/if \(action === 'adjust-analysis-direction'\)/g) || []).length, 1, 'both edit entries must converge on one action handler');
assert.ok(appSource.includes('function locateInitialThought(key)'), 'the composer edit entry must have a dedicated initial-thought locator');
assert.ok(appSource.includes("segment.scrollIntoView({ block: 'start', inline: 'nearest' })"), 'the initial-thought locator must align the target text at the top of the scroll area');
assert.ok(appSource.includes('input.focus({ preventScroll: true })'), 'focusing the inline editor must not undo the explicit jump position');
assert.ok(scrollToLatestBody.includes('if (state.thoughtEditorOpen) return'), 'streaming output must not pull the viewport away while the initial thought editor is open');
assert.ok(paintEditableThoughtSegmentsBody.includes('state.thoughtEditorOpen && key === state.thoughtEditorTarget'), 'replay completion must preserve the active initial-thought editor instead of repainting it');
assert.ok(!appSource.includes('data-action="edit-thought"') && !appSource.includes("action === 'edit-thought'"), 'a second thought-edit action must not exist');
assert.ok(!appSource.includes('event.metaKey || event.ctrlKey'), 'thought editing must not keep a second keyboard-only save path');

console.log('flow-check: passed');

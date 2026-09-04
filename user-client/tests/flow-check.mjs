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

assert.deepEqual(
  Array.from(data.sessions, (session) => session.id),
  ['copper-decision', 'general-qa', 'report-reading-qa'],
  'the client must seed the copper demonstration and two ordinary conversations'
);
assert.deepEqual(
  Array.from(data.sessions.filter((session) => session.pinned), (session) => session.id),
  ['copper-decision'],
  'only the copper demonstration must be pinned by default'
);
const ordinarySessions = data.sessions.filter((session) => !session.pinned);
assert.equal(ordinarySessions.length, 2, 'the conversation history must start with two ordinary conversations');
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

assert.equal(data.outputProfiles.length, 3, 'the user client must seed three report templates');
for (const profile of data.outputProfiles) {
  assert.ok(profile.id && profile.name && profile.description, 'every report template must expose identity and description');
  assert.ok(!('scenario' in profile), `${profile.id} must use a description rather than a scenario field`);
  assert.ok(!('enabled' in profile), `${profile.id} must be active by definition rather than carry a status field`);
  assert.ok(!('isDefault' in profile), `${profile.id} must not carry a default selection`);
  assert.ok(Array.isArray(profile.sections) && profile.sections.length > 0, `${profile.id} must contain report sections`);
  for (const section of profile.sections) {
    assert.ok(section.title, `${profile.id} must name every report section`);
    assert.equal(typeof section.includeChart, 'boolean', `${profile.id} must define chart inclusion per section`);
  }
}

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
assert.ok(appSource.includes('data-thought-revision'), 'the response must expose an inline thought-revision hook');
assert.ok(appSource.includes('data-answer-body'), 'the response must expose a direct answer-body hook');
assert.ok(!appSource.includes("'执行过程'"), 'the response must not add a synthetic execution-process heading');
assert.ok(!appSource.includes("'分析结论'"), 'the response must not add a synthetic final-answer heading');

assert.ok(!fixtureSource.includes('outputFormats'), 'report templates must not keep retired output-format data');
assert.ok(!appSource.includes('data-template-format'), 'template editing must not keep retired output-format controls');
assert.ok(!fixtureSource.includes('visualizationRules'), 'report templates must not keep retired global chart rules');
assert.ok(!appSource.includes('minimumCharts'), 'template editing must not keep a global minimum-chart control');
assert.ok(!appSource.includes('failureFallback'), 'template editing must not keep chart fallback controls');
assert.ok(!appSource.includes('toggle-template'), 'template management must not expose activation toggles');
assert.ok(!appSource.includes('toggleTemplate'), 'template management must not keep activation-toggle logic');
assert.ok(!appSource.includes('default-template'), 'template management must not expose a set-default action');
assert.ok(!appSource.includes('setDefaultTemplate'), 'template management must not keep set-default logic');
assert.ok(!appSource.includes('isDefault'), 'template management must not retain default flags or deletion protection');
assert.ok(!appSource.includes('copy-link'), 'the conversation header must not keep the retired copy-link action');
assert.ok(!appSource.includes("action === 'more'"), 'the conversation header must not keep the retired more action');
assert.ok(!appSource.includes("icon('message-circle'"), 'conversation history must not render per-row icons');
assert.ok(!appSource.includes('适用场景'), 'template management must use description language consistently');
assert.ok(appSource.includes('data-template-chapter-chart'), 'template chapters must expose per-section chart controls');

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

assert.equal(scenario.result.documents.length, 1, 'the result must expose exactly one report');
assert.equal(scenario.result.documents[0].id, 'report');

for (const action of [
  'new-chat',
  'select-session',
  'replay-demo',
  'edit-thought',
  'cancel-thought-edit',
  'apply-thought-edit',
  'attach-file',
  'send-message',
  'open-document',
  'export-report',
  'create-template',
  'edit-template',
  'delete-template',
  'save-template',
  'add-template-chapter',
  'move-template-chapter-up',
  'move-template-chapter-down',
  'remove-template-chapter',
  'confirm-delete-template'
]) {
  assert.ok(appSource.includes("action === '" + action + "'"), 'missing interaction handler: ' + action);
}

for (const sourceToken of [
  "function templateRoute(id)",
  "function renderTemplateList()",
  "function renderTemplateEditor(routeId)",
  "function syncTemplateEditor()",
  "function collectTemplatePayload(editor)",
  "function saveTemplate()",
  "function requestDeleteTemplate(profile)",
  "item.name.toLowerCase() === payload.name.toLowerCase()",
  "state.outputProfiles.splice(state.outputProfiles.indexOf(profile), 1)",
  "global.location.hash.match(/^#\\/templates"
]) {
  assert.ok(appSource.includes(sourceToken), 'missing report-template behavior: ' + sourceToken);
}

for (const sourceToken of [
  'state.stage = scenario.interaction.resumeStage',
  'state.thoughtRevision = text',
  'paintThoughtRevision()',
  'reportSlot.hidden = false',
  'runRevisedReplay(runId)',
  'await runContinuationReplay(runId)',
  "updatePlanProgress(activePlan().length, 'complete')"
]) {
  assert.ok(appSource.includes(sourceToken), 'missing gated replay behavior: ' + sourceToken);
}

for (const sourceToken of [
  'function renderThoughtSegment(group, content, index, visible)',
  'function renderThoughtSegmentContent(group, content, index)',
  'function renderThoughtRevision()',
  'function renderThoughtRevisionDiff(original, revised)',
  'function applyThoughtRevision()',
  'function resizeComposerTextarea(input)',
  'function renderMarkdown(markdown)',
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
assert.ok(appSource.includes('编辑初始思考'), 'the revision affordance must name the exact editable content');
assert.ok(appSource.includes('thought-revision-hint'), 'the completed reasoning surface must use informational text rather than a footer action');
assert.ok(!appSource.includes('class="thought-revision-edit"'), 'the completed reasoning hint must not be rendered as a button');
assert.ok(initialReplayBody.includes('revealThoughtRevision()') && initialReplayBody.includes('await runContinuationReplay(runId)'), 'answer streaming and thought editing must begin from the same reasoning-complete boundary');
assert.ok(appSource.includes('resetPrimaryForRevision(items)'), 'saving a thought revision must reset downstream Plan, capability nodes, and thought segments');
assert.ok(appSource.includes('runRevisedReplay(runId)'), 'saving a thought revision must trigger the regenerated analysis chain before the final answer');

console.log('flow-check: passed');

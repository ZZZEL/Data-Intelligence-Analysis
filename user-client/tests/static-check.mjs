import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = {
  index: await readFile(resolve(root, 'index.html'), 'utf8'),
  app: await readFile(resolve(root, 'src/app.js'), 'utf8'),
  fixture: await readFile(resolve(root, 'src/fixture.js'), 'utf8'),
  css: [
    await readFile(resolve(root, 'assets/css/app.css'), 'utf8'),
    await readFile(resolve(root, 'assets/css/responsive.css'), 'utf8')
  ].join('\n')
};

const required = [
  [files.index, '数据智能分析轻量用户端演示'],
  [files.app, '#/chat/'],
  [files.app, '#/templates'],
  [files.app, '../ops-console/#/knowledge'],
  [files.app, 'renderMarkdown'],
  [files.app, 'renderInlineMarkdown'],
  [files.app, 'escapeHtml'],
  [files.app, 'markdown-body'],
  [files.app, 'markdown-table-wrap'],
  [files.app, 'appendMarkdownChunk'],
  [files.app, 'typeMarkdownChunk'],
  [files.app, 'requestAnimationFrame'],
  [files.app, 'Intl.Segmenter'],
  [files.app, "matchMedia('(prefers-reduced-motion: reduce)')"],
  [files.app, 'runInitialReplay'],
  [files.app, 'runRevisedReplay'],
  [files.app, 'runContinuationReplay'],
  [files.app, 'renderPlanTrack'],
  [files.app, 'renderExecutionRow'],
  [files.app, 'renderAnalysisFlow'],
  [files.app, 'renderThoughtSegment'],
  [files.app, 'renderThoughtRevision'],
  [files.app, 'applyThoughtRevision'],
  [files.app, 'renderAnswerBody'],
  [files.app, 'runExecutionItem'],
  [files.app, 'updatePlanProgress'],
  [files.app, 'setExecutionRowState'],
  [files.app, 'updateExecutionDetail'],
  [files.app, 'data-process-panel'],
  [files.app, 'data-plan-step'],
  [files.app, 'data-execution-group'],
  [files.app, 'data-execution-id'],
  [files.app, 'runId'],
  [files.app, 'cancelPendingWork'],
  [files.app, 'data-stream-status'],
  [files.app, 'data-report-slot'],
  [files.app, 'data-thought-segment'],
  [files.app, 'data-thought-revision'],
  [files.app, 'thought-inline-input'],
  [files.app, 'thought-inline-revision'],
  [files.app, 'thought-diff-delete'],
  [files.app, 'thought-diff-insert'],
  [files.app, 'resizeComposerTextarea'],
  [files.app, 'openDocument'],
  [files.app, 'renderTemplateList'],
  [files.app, 'renderTemplateEditor'],
  [files.app, 'renderTemplateShell'],
  [files.app, 'syncTemplateEditor'],
  [files.app, 'saveTemplate'],
  [files.app, 'setDefaultTemplate'],
  [files.app, 'requestDeleteTemplate'],
  [files.app, 'data-template-editor'],
  [files.app, 'data-template-preview-sections'],
  [files.app, 'data-template-chapter-drag'],
  [files.app, 'data-template-chapter-chart'],
  [files.fixture, 'outputProfiles'],
  [files.fixture, 'analysisRun'],
  [files.fixture, 'interaction'],
  [files.fixture, 'revisionOutcome'],
  [files.fixture, 'presetInput'],
  [files.css, '.markdown-body'],
  [files.css, '.stream-status'],
  [files.css, '.markdown-chunk.is-streaming::after'],
  [files.css, '.analysis-process'],
  [files.css, '.analysis-flow'],
  [files.css, '.thinking-surface'],
  [files.css, '.thought-segment'],
  [files.css, '.thought-revision'],
  [files.css, '.thought-inline-input'],
  [files.css, '.thought-inline-revision'],
  [files.css, '.thought-inline-diff'],
  [files.css, '.thought-diff-delete'],
  [files.css, '.thought-diff-insert'],
  [files.css, '.analysis-answer'],
  [files.css, '.analysis-plan-track'],
  [files.css, '.execution-row'],
  [files.css, '.execution-call-line'],
  [files.css, '.sidebar-feature-link'],
  [files.css, '.sidebar-primary-actions'],
  [files.css, '.template-table'],
  [files.css, '.template-editor'],
  [files.css, '.template-preview'],
  [files.css, '.template-page-title'],
  [files.css, '.template-chapter-chart'],
  [files.css, '.template-preview-chart'],
  [files.css, '@media (prefers-reduced-motion: reduce)']
];

for (const [source, token] of required) {
  assert.ok(source.includes(token), 'missing required token: ' + token);
}

const applicationAssetVersions = Array.from(
  files.index.matchAll(/(?:assets\/css\/app\.css|src\/fixture\.js|src\/app\.js)\?v=([^"']+)/g),
  (match) => match[1]
);
assert.equal(applicationAssetVersions.length, 3, 'app stylesheet, fixture, and app script must be cache-versioned');
assert.equal(new Set(applicationAssetVersions).size, 1, 'app stylesheet, fixture, and app script must share one cache version');

const forbiddenEverywhere = [
  '#/call',
  '#/workspace',
  '调用演示',
  '调用评估',
  '任务基线',
  '权限与基础校验',
  'receipt_id',
  'entryMode',
  '任务理解',
  '主要意图',
  '分析思路调整',
  '你的调整',
  '生成文件',
  '你在分析过程中补充',
  '已发送',
  'research-user-input',
  'thought-revision-editor',
  'thought-revision-input',
  'thought-revision-state',
  'thought-revision-icon',
  'thought-inline-label',
  'thought-inline-old',
  'thought-inline-new',
  '修改只会重生成此处之后的内容',
  'report-note',
  'composer-hint',
  '<h3>分析报告</h3>',
  'renderFinalMessage',
  'renderClarificationAnswer',
  'transition: all',
  'setInterval(',
  'session-preview',
  'session-copy'
];

for (const token of forbiddenEverywhere) {
  assert.ok(
    !files.index.includes(token) && !files.app.includes(token) && !files.fixture.includes(token) && !files.css.includes(token),
    'forbidden token remains: ' + token
  );
}

const retiredOutputComponents = [
  'renderResearchProcess',
  'renderResearchEvent',
  'renderMetricTable',
  'renderDecisionPaths',
  'renderResult',
  'research-plan-path',
  'research-events',
  'research-checkpoint',
  'metric-table',
  'decision-paths',
  'numbered-actions',
  'result-hero'
];

for (const token of retiredOutputComponents) {
  assert.ok(!files.app.includes(token), 'custom output component remains active: ' + token);
}

assert.match(files.app, /function renderInlineMarkdown[\s\S]+escapeHtml\(value\)/, 'Markdown inline rendering must escape HTML first');
assert.ok(!files.app.includes('toggle-execution-details'), 'capability calls must not expose output expansion controls');
assert.ok(!files.app.includes('data-execution-details'), 'capability calls must not render output detail containers');
assert.ok(!files.app.includes('data-execution-toggle-copy'), 'capability calls must not render output toggle copy');
assert.ok(!files.css.includes('.execution-details'), 'retired capability output styles must be removed');
assert.ok(!files.css.includes('.analysis-note-mark'), 'reasoning notes must not add a second nested icon layer');
assert.ok(!files.app.includes('renderSupplementalUserMessage'), 'thinking edits must not create supplemental user messages');
assert.ok(!files.app.includes('renderContinuationMessage'), 'continued analysis must remain inside the same assistant response');
assert.ok(!files.fixture.includes('MCP'), 'capability cards must not expose MCP as a node type');
assert.match(files.css, /\.thread-scroll\s*\{[\s\S]*?scroll-behavior:\s*auto;/, 'thread scrolling must not animate after DOM updates');
assert.doesNotMatch(files.css, /\.message\s*\{[^}]*animation:/, 'existing messages must not replay entrance animations');
assert.ok(!files.app.includes("'执行过程'"), 'capability calls must not be grouped under an execution-process title');
assert.ok(!files.app.includes("'分析结论'"), 'the final body must not be preceded by an analysis-result title');
assert.ok(!files.app.includes("'阶段结论'"), 'the clarification body must not be preceded by a stage-result title');

console.log('static-check: passed');

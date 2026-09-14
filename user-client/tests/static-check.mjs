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
  [files.app, '#/agent-api'],
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
  [files.app, 'renderThoughtRevisionDiff'],
  [files.app, 'revealRevisedInitialThought'],
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
  [files.app, 'data-source-index-slot'],
  [files.app, 'data-thought-segment'],
  [files.app, 'thought-inline-input'],
  [files.app, 'thought-inline-revision'],
  [files.app, 'thought-diff-delete'],
  [files.app, 'thought-diff-insert'],
  [files.app, 'analysisVersion'],
  [files.app, 'versionHistory'],
  [files.app, 'currentOutcome'],
  [files.app, 'createRevisionOutcome'],
  [files.app, 'captureResponseVersion'],
  [files.app, 'renderAnalysisDirectionGuide'],
  [files.app, 'renderInitialThoughtHeader'],
  [files.app, 'setAnalysisVersion'],
  [files.app, 'toggleVersionMenu'],
  [files.app, 'focusInitialThoughtEditor'],
  [files.app, 'clearThoughtAttention'],
  [files.app, 'resizeComposerTextarea'],
  [files.app, 'renderComposerModeToggle'],
  [files.app, 'renderDeepThinkingToggle'],
  [files.app, 'setDeepThinkingEnabled'],
  [files.app, 'openDocument'],
  [files.app, 'activeSources'],
  [files.app, 'safeReferenceUrl'],
  [files.app, 'renderReportReferences'],
  [files.app, 'locateReportReference'],
  [files.app, 'renderSourceIndex'],
  [files.app, 'renderSourceDetail'],
  [files.app, 'openSource'],
  [files.app, 'data-action="open-search-results"'],
  [files.app, "kind: 'search-results'"],
  [files.app, 'data-search-result'],
  [files.app, 'search-result-title-line'],
  [files.app, 'search-result-snippet'],
  [files.app, 'source-index-title'],
  [files.app, 'data-source-chunk'],
  [files.app, 'data-source-preview'],
  [files.app, 'has-report-preview'],
  [files.app, 'has-source-preview'],
  [files.app, 'renderAgentApiPage'],
  [files.app, 'renderAgentApiShell'],
  [files.app, 'requestCreateAgentApiKey'],
  [files.app, 'confirmCreateAgentApiKey'],
  [files.app, 'copyAgentApiSecret'],
  [files.app, 'confirmAgentApiKeyToggle'],
  [files.app, 'confirmAgentApiKeyDelete'],
  [files.fixture, 'agentApiAccess'],
  [files.fixture, 'analysisRun'],
  [files.fixture, 'interaction'],
  [files.fixture, 'revisionOutcome'],
  [files.fixture, 'presetInput'],
  [files.css, '.markdown-body'],
  [files.css, '.stream-status'],
  [files.css, '.agent-api-table'],
  [files.css, '.markdown-chunk.is-streaming::after'],
  [files.css, '.analysis-process'],
  [files.css, '.analysis-flow'],
  [files.css, '.thinking-surface'],
  [files.css, '.thought-segment'],
  [files.css, '.initial-thought-header'],
  [files.css, '.initial-thought-actions'],
  [files.css, '.thought-inline-input'],
  [files.css, '.thought-inline-revision'],
  [files.css, '.thought-inline-diff'],
  [files.css, '.thought-diff-delete'],
  [files.css, '.thought-diff-insert'],
  [files.css, '.assistant-response-heading'],
  [files.css, '.analysis-version-trigger'],
  [files.css, '.analysis-version-popover'],
  [files.css, '.analysis-version-note'],
  [files.css, '.analysis-version-options'],
  [files.css, '.analysis-version-option'],
  [files.css, '.analysis-direction-guide'],
  [files.css, '.composer-input-row'],
  [files.css, '.composer-toolbar'],
  [files.css, '.composer-tool-control'],
  [files.css, '.composer-tool-toggle'],
  [files.css, '.composer-upload-button'],
  [files.css, '.source-citation'],
  [files.css, '.report-citation'],
  [files.css, '.report-reference-list'],
  [files.css, '.source-index'],
  [files.css, '.source-index-item'],
  [files.css, '.source-index-title'],
  [files.css, '.source-drawer'],
  [files.css, '.search-result-title-line'],
  [files.css, '.search-result-snippet'],
  [files.css, '.source-detail'],
  [files.css, '.analysis-answer'],
  [files.css, '.analysis-plan-track'],
  [files.css, '.execution-row'],
  [files.css, '.execution-call-line'],
  [files.css, '.sidebar-primary-actions'],
  [files.css, '.settings-table'],
  [files.css, '.settings-page-title'],
  [files.css, '@media (prefers-reduced-motion: reduce)']
];

for (const [source, token] of required) {
  assert.ok(source.includes(token), 'missing required token: ' + token);
}

const reportTemplateRuntime = files.app + '\n' + files.fixture;
assert.doesNotMatch(reportTemplateRuntime, /#\/templates|报告模板|outputProfiles|data-template-/, 'retired report-template routes, fixture data, copy, and DOM hooks must stay removed');
assert.doesNotMatch(
  files.app,
  /\b(?:templateRoute(?:Id)?|[A-Za-z]+Template[A-Za-z]*|findOutputProfile|outputProfiles|draggedChapter)\b/,
  'retired report-template state, helpers, and handlers must stay removed'
);
assert.doesNotMatch(
  files.app,
  /(?:create|edit|delete|save)-template|cancel-template-edit|(?:add|remove)-template-chapter|move-template-chapter-(?:up|down)|confirm-delete-template/,
  'retired report-template actions must stay removed'
);
assert.doesNotMatch(files.css, /\.template-[a-z0-9_-]+|\.sidebar-feature-link\b/i, 'retired report-template and sidebar-link selectors must stay removed from user-client CSS');

assert.match(files.css, /\.composer\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s, 'the composer must stack its input and operation areas');
assert.doesNotMatch(files.css, /\.composer-toolbar\s*\{[^}]*border-top\s*:/s, 'the composer must read as one surface without a dividing rule between input and controls');
assert.match(files.css, /\.composer-toolbar\s*\{[^}]*background:\s*transparent;/s, 'the composer toolbar must share the input surface rather than form a second visual band');
assert.match(files.css, /\.composer-tool-control\s*\{[^}]*border:\s*1px\s+solid/s, 'upload, web search, and deep thinking must share a bordered button treatment');
assert.match(files.css, /\.composer-tool-toggle\.is-active\s*\{[^}]*border-color:/s, 'toggle buttons must expose a visible selected state');
assert.match(files.css, /\.composer-upload-button\.has-value\s*\{[^}]*border-color:/s, 'the upload button must expose a visible selected state when files are attached');
assert.doesNotMatch(files.css, /\.composer\s*\{[^}]*grid-template-columns:/s, 'the composer must no longer force input and actions into one grid row');
for (const property of ['overflow:\\s*hidden', 'text-overflow:\\s*ellipsis', 'white-space:\\s*nowrap']) {
  assert.match(files.css, new RegExp('\\.search-result-snippet\\s*\\{[^}]*' + property, 's'), 'each Web Search summary must stay on the second line and truncate with an ellipsis');
  assert.match(files.css, new RegExp('\\.source-index-title\\s*\\{[^}]*' + property, 's'), 'each source filename must remain on one compact reference row');
}

assert.doesNotMatch(files.app, /composer-tool-check/, 'selected composer modes must not render a redundant check icon');
assert.doesNotMatch(files.app, /plan-current-detail|data-plan-current-copy|execution-live-detail|data-execution-live(?:=|\s)/, 'the analysis flow must not render redundant realtime explanatory copy');
assert.doesNotMatch(files.app, /copy\.hint|initial-thought-header-copy[^<]*<span/, 'the initial-thought header must not render a secondary explanatory hint');
assert.doesNotMatch(files.css, /\.plan-current-detail|\.execution-live-detail|\.initial-thought-header-copy span/, 'removed realtime copy must not retain dedicated visual styles');
assert.match(files.app, /function reportMarkdown\(\)[\s\S]*?return \[/, 'generated report Markdown must retain semantic citation markers for static rendering');
assert.match(files.app, /renderMarkdown\(reportMarkdown\(\), \{ citationMode: 'document' \}\) \+ renderReportReferences\(\)/, 'report preview must render static linked citations and its References list together');
assert.match(files.app, /data-action="open-source"[^>]*data-source-id=/, 'inline citations and source-index rows must identify the source they open');
assert.ok(!files.app.includes('data-source-ids'), 'one citation control must never address a bundle of sources');
assert.match(files.app, /state\.dialog\s*=\s*\{\s*kind:\s*'source-preview'/, 'opening a source must use the dedicated source-preview drawer state');
assert.match(files.app, /\['report-preview',\s*'source-preview',\s*'search-results'\]/, 'report, source, and search-results drawers must share non-modal lifecycle handling');
assert.doesNotMatch(files.app, /kind:\s*'source-preview'[\s\S]{0,240}?title:\s*'\u6765\u6e90\u9884\u89c8'/, 'a source drawer must derive its topbar from the source instead of using a placeholder title');
assert.match(files.app, /data-action="open-search-results"[^>]*data-execution-id=/, 'the Web Search execution node must identify the completed search run it opens');
assert.match(files.app, /state\.dialog\s*=\s*\{\s*kind:\s*'search-results'/, 'opening a completed Web Search node must use a dedicated search-results drawer state');

const sourceIndexBody = files.app.slice(
  files.app.indexOf('function renderSourceIndex'),
  files.app.indexOf('function renderDocuments')
);
assert.ok(sourceIndexBody.includes('source-index-number') && sourceIndexBody.includes('source-index-title') && sourceIndexBody.includes('source-index-kind'), 'each source index row must expose number, filename, and source tag in one compact structure');
assert.ok(!sourceIndexBody.includes("icon('link-2'") && !sourceIndexBody.includes("icon('chevron-right'"), 'the source index must omit both the header link icon and per-row trailing chevrons');

const searchResultsBody = files.app.slice(
  files.app.indexOf('function renderSearchResults'),
  files.app.indexOf('function openSearchResults')
);
assert.ok(searchResultsBody.indexOf('search-result-title-line') < searchResultsBody.indexOf('search-result-snippet'), 'each search result must render its icon-title line before its summary line');
assert.ok(!searchResultsBody.includes('search-result-source'), 'a search result must not introduce a third source-label line');

const reportReferencesBody = files.app.slice(
  files.app.indexOf('function renderReportReferences'),
  files.app.indexOf('function renderUnavailableRoute')
);
assert.ok(reportReferencesBody.includes('report-reference-number'), 'static References must retain numbered entries');
assert.ok(reportReferencesBody.includes('safeReferenceUrl(source.url)'), 'static References must preserve a normal source URL when one exists');
assert.ok(!reportReferencesBody.includes('sourceKindMeta(source)'), 'static References must not repeat the in-product source tag');
assert.ok(!reportReferencesBody.includes('source.locator'), 'static References must not append locator metadata');
assert.ok(!reportReferencesBody.includes('source.sourceVersion'), 'static References must not append source-version metadata');
assert.ok(!reportReferencesBody.includes('source.retrievedAt'), 'static References must not append retrieval-time metadata');
assert.ok(!reportReferencesBody.includes('<small>'), 'static References entries must contain only their number and title or URL');

const sourceDetailBody = files.app.slice(
  files.app.indexOf('function renderSourceDetail'),
  files.app.indexOf('function openSource')
);
for (const retiredSourceDetailToken of [
  'activeAnalysisVersionNumber()',
  'viewingHistoricalVersion()',
  'source-version-chip',
  'source-detail-header',
  'source-metadata',
  'source-snapshot-note',
  'source-detail-actions',
  'source-dependency',
  'source-formula',
  'source.locator',
  'source.sourceVersion',
  'source.retrievedAt',
  'source.dependsOn',
  'locate-source-asset',
  'locate-source-execution',
  '精确定位',
  '来源版本',
  '获取时间',
  '输入依据'
]) {
  assert.ok(!sourceDetailBody.includes(retiredSourceDetailToken), 'the minimal source drawer must omit retired detail: ' + retiredSourceDetailToken);
}
assert.ok(!sourceDetailBody.includes('class="source-kind"'), 'the source tag must live in the drawer topbar rather than repeat inside the body');
assert.ok(!files.app.includes('function locateSourceTarget'), 'the source drawer must not retain jump-to-asset or jump-to-execution behavior');
assert.ok(files.app.includes('function locateReportReference'), 'the report preview may keep its same-document citation-to-References anchor handler');

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
  'thought-revision-badge',
  'thought-inline-edit-footer',
  'thought-inline-actions',
  '保存并重新生成',
  'assistant-response-actions',
  'data-analysis-heading-actions',
  'data-action="edit-thought"',
  'previousVersion',
  '上一版 · v',
  '基于调整生成 · v',
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

assert.ok(!files.fixture.includes('12 页'), 'the report attachment subtitle must omit page count');
assert.ok(!files.app.includes('report-drawer-backdrop'), 'the report preview must not render a covering backdrop');

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
assert.doesNotMatch(files.app + files.fixture + files.css, /permissionLevel|permissionLevels|agent-api-permission|<th>权限<\/th>/, 'Agent API must not expose or persist permission levels');

console.log('static-check: passed');

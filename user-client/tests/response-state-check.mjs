import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const fixtureSource = await readFile(resolve(root, 'src/fixture.js'), 'utf8');
const appSource = await readFile(resolve(root, 'src/app.js'), 'utf8');
const fixtureContext = { window: {} };
vm.runInNewContext(fixtureSource, fixtureContext);
const data = fixtureContext.window.CHAT_DEMO_DATA;
const scenario = data.scenario;

const classList = { add() {}, remove() {}, toggle() {} };
function rootElement() {
  return {
    classList,
    innerHTML: '',
    style: {},
    value: '',
    scrollHeight: 40,
    scrollTop: 0,
    clientHeight: 40,
    appendChild() {},
    focus() {},
    setAttribute() {},
    setSelectionRange() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

const roots = new Map();
const documentListeners = new Map();
const documentStub = {
  body: rootElement(),
  title: '',
  activeElement: null,
  addEventListener(type, listener) { documentListeners.set(type, listener); },
  getElementById(id) {
    if (!roots.has(id)) roots.set(id, rootElement());
    return roots.get(id);
  },
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const windowStub = {
  CHAT_DEMO_DATA: data,
  Intl,
  NodeFilter: { SHOW_TEXT: 4 },
  location: { hash: '#/chat/copper-decision' },
  history: { replaceState() {} },
  addEventListener() {},
  setTimeout,
  clearTimeout,
  requestAnimationFrame(callback) { callback(16); return 1; },
  cancelAnimationFrame() {},
  matchMedia() { return { matches: true }; }
};

const instrumented = appSource.replace(
  /\n  handleRoute\(\);\n\}\)\(window, document\);\s*$/,
  `
  global.__RESPONSE_TEST__ = {
    state: state,
    renderAnalysisMessage: renderAnalysisMessage,
    renderComposer: renderComposer,
    captureResponseVersion: captureResponseVersion,
    createRevisionOutcome: createRevisionOutcome,
    activePlan: activePlan,
    activeCapabilities: activeCapabilities,
    activeResult: activeResult,
    activeSources: activeSources,
    renderExecutionRow: renderExecutionRow,
    setExecutionRowState: setExecutionRowState,
    renderSourceIndex: renderSourceIndex,
    renderSourceDetail: renderSourceDetail,
    openSource: openSource,
    reportMarkdown: reportMarkdown,
    reportBody: reportBody,
    renderReportReferences: renderReportReferences,
    setAnalysisVersion: setAnalysisVersion,
    continueFromLatestAnalysisVersion: continueFromLatestAnalysisVersion,
    thoughtSource: thoughtSource
  };
})(window, document);`
);
assert.notEqual(instrumented, appSource, 'the response harness must instrument the application entry point');
vm.runInNewContext(instrumented, { window: windowStub, document: documentStub });
const harness = windowStub.__RESPONSE_TEST__;
const state = harness.state;

function count(source, token) {
  return source.split(token).length - 1;
}

function headerMarkup(source, token) {
  const start = source.indexOf(token);
  if (start < 0) return '';
  const end = source.indexOf('</header>', start);
  return end < 0 ? source.slice(start) : source.slice(start, end + '</header>'.length);
}

function sliceBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  if (start < 0) return '';
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

function openingTagForAction(markup, action) {
  const marker = `data-action="${action}"`;
  const markerIndex = markup.indexOf(marker);
  if (markerIndex < 0) return '';
  const start = markup.lastIndexOf('<', markerIndex);
  const end = markup.indexOf('>', markerIndex);
  return start < 0 || end < 0 ? '' : markup.slice(start, end + 1);
}

function dispatchRenderedAction(markup, action) {
  const openingTag = openingTagForAction(markup, action);
  assert.ok(openingTag, `rendered markup must expose ${action}`);
  assert.ok(!/\sdisabled(?:\s|=|>)/.test(openingTag), `${action} must be enabled before it is clicked`);
  const dataset = {};
  for (const match of openingTag.matchAll(/data-([a-z0-9-]+)="([^"]*)"/g)) {
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    dataset[key] = match[2];
  }
  const control = {
    dataset,
    closest(selector) { return selector === '[data-action]' ? this : null; },
    getAttribute() { return null; }
  };
  const clickListener = documentListeners.get('click');
  assert.equal(typeof clickListener, 'function', 'the application click handler must be registered');
  clickListener({ target: control, preventDefault() {} });
}

function searchResultFragments(markup) {
  const starts = Array.from(markup.matchAll(/<[^>]*\bdata-search-result(?=[\s=>])[^>]*>/g), (match) => match.index);
  return starts.map((start, index) => markup.slice(start, starts[index + 1] ?? markup.length));
}

function sourceIndexItemFragments(markup) {
  const starts = Array.from(markup.matchAll(/<[^>]*class="[^"]*\bsource-index-item\b[^"]*"[^>]*>/g), (match) => match.index);
  return starts.map((start, index) => markup.slice(start, starts[index + 1] ?? markup.length));
}

state.activeSessionId = 'new';
const newChatComposer = harness.renderComposer();
assert.equal(count(newChatComposer, 'composer-tool-control'), 3, 'the new-chat composer must present upload, web search, and deep thinking as one control family');
assert.equal(count(newChatComposer, 'data-action="attach-file"'), 1, 'the new-chat composer must render exactly one upload button');
assert.equal(count(newChatComposer, 'data-action="toggle-web-search"'), 1, 'the new-chat composer must render exactly one web search toggle');
assert.equal(count(newChatComposer, 'data-action="toggle-deep-thinking"'), 1, 'the new-chat composer must render exactly one deep thinking toggle');
assert.equal(count(newChatComposer, 'aria-pressed="false"'), 2, 'both mode toggles must initially expose their unselected state');
assert.ok(!newChatComposer.includes('composer-tool-check'), 'mode toggles must not add a check glyph to their selected state');
assert.ok(newChatComposer.includes('class="composer-input-row"') && newChatComposer.includes('class="composer-toolbar"'), 'the new-chat composer must use the shared two-row structure');

state.activeSessionId = scenario.id;
state.stage = scenario.result.stage;
state.replaying = false;
const completedAnalysis = harness.renderAnalysisMessage();
const completedComposer = harness.renderComposer();
let completed = completedAnalysis + completedComposer;
assert.doesNotMatch(completed, /Plan、调用、正文与报告均已基于本段内容重新生成。|分析步骤已完成，正文与报告已生成。/, 'completed analysis must omit redundant explanatory copy');
assert.doesNotMatch(completed, /plan-current-detail|execution-live-detail|data-execution-live/, 'completed analysis must omit realtime tracking copy');
const completedThoughtHeader = headerMarkup(completedAnalysis, 'data-initial-thought-header');
assert.match(completedThoughtHeader, /<div class="initial-thought-header-copy"><strong>初始思考<\/strong><\/div>/, 'the initial-thought header must keep only its title in the copy container');
assert.equal(count(completedComposer, 'composer-tool-control'), 3, 'the existing-chat composer must use the same three-button control family');
assert.equal(count(completedComposer, 'data-action="attach-file"'), 1, 'the existing-chat composer must render exactly one upload button');
assert.equal(count(completedComposer, 'data-action="toggle-web-search"'), 1, 'the existing-chat composer must render exactly one web search toggle');
assert.equal(count(completedComposer, 'data-action="toggle-deep-thinking"'), 1, 'the existing-chat composer must render exactly one deep thinking toggle');
assert.ok(completedComposer.includes('class="composer-input-row"') && completedComposer.includes('class="composer-toolbar"'), 'the composer must render distinct input and operation rows');
assert.ok(completedComposer.indexOf('class="composer-input-row"') < completedComposer.indexOf('class="composer-toolbar"'), 'the input row must precede the operation row');
assert.ok(completedComposer.includes('aria-pressed="false"') && completedComposer.includes('aria-label="开启联网搜索"'), 'web search must initially render off with an accessible action label');
state.webSearchEnabled = true;
const searchEnabledComposer = harness.renderComposer();
assert.ok(searchEnabledComposer.includes('composer-tool-toggle is-active'), 'the enabled web search state must have a visible active treatment');
assert.ok(searchEnabledComposer.includes('aria-pressed="true"') && searchEnabledComposer.includes('aria-label="关闭联网搜索"'), 'the enabled web search state must expose its state and inverse action');
state.webSearchEnabled = false;
state.deepThinkingEnabled = true;
const deepThinkingEnabledComposer = harness.renderComposer();
assert.ok(deepThinkingEnabledComposer.includes('data-action="toggle-deep-thinking" aria-pressed="true"'), 'deep thinking must expose a selected state independently of web search');
assert.ok(deepThinkingEnabledComposer.includes('aria-label="关闭思维链"'), 'the selected chain-of-thought control must expose its inverse action');
state.deepThinkingEnabled = false;
state.pendingFiles = [{ name: '补充材料.pdf', size: '10 KB', type: 'pdf' }];
const uploadSelectedComposer = harness.renderComposer();
assert.ok(uploadSelectedComposer.includes('composer-upload-button has-value'), 'the upload button must expose its selected state when files are attached');
assert.ok(uploadSelectedComposer.includes('已添加 1 个文件，继续添加'), 'the selected upload control must announce its attached-file count');
state.pendingFiles = [];

const sourceIndexMarkup = sliceBetween(completedAnalysis, 'class="source-index"', '</section>');
const sourceIndexHeader = headerMarkup(completedAnalysis, 'class="source-index-heading"');
assert.ok(scenario.result.sources.every((source) => ['upload', 'rag', 'web'].includes(source.kind)), 'the source registry must contain only inspectable uploaded, internal, or Web evidence');
assert.ok(!scenario.result.sources.some((source) => source.id === 'visible-loss'), 'the source registry must not include the derived visible-loss calculation');
const indexedSources = scenario.result.sources;
const indexedSourceRows = sourceIndexItemFragments(sourceIndexMarkup);
const resultBodyMarkup = sliceBetween(completedAnalysis, 'id="final-result-markdown"', 'data-source-index-slot');
assert.ok(count(completedAnalysis, 'class="source-citation"') >= scenario.result.sources.length, 'the completed answer must retain compact paper-style citations across its evidence-backed claims');
assert.equal(count(resultBodyMarkup, 'class="source-citation"'), count(resultBodyMarkup, 'data-source-id='), 'each inline citation control must carry exactly one source id');
assert.ok(!resultBodyMarkup.includes('data-source-ids'), 'an inline citation must not address a source bundle');
assert.equal(indexedSourceRows.length, indexedSources.length, 'the answer must render one compact source-index row for every inspectable registry source');
assert.ok(sourceIndexHeader.includes(`${indexedSources.length} 项`) && !sourceIndexHeader.includes('link-2'), 'the source-index header must show the filtered count without a trailing link icon');
assert.ok(!sourceIndexMarkup.includes('data-source-id="visible-loss"') && !sourceIndexMarkup.includes('数值计算'), 'calculation evidence must not appear in the in-product source index');
for (const [index, sourceRow] of indexedSourceRows.entries()) {
  const source = indexedSources[index];
  const expectedKind = source.kind === 'rag' ? '内部数据' : source.kind === 'web' ? '联网搜索' : '上传文件';
  assert.equal(count(sourceRow, 'source-index-number'), 1, `${source.id} reference row must contain one number`);
  assert.equal(count(sourceRow, 'source-index-title'), 1, `${source.id} reference row must contain one filename`);
  assert.equal(count(sourceRow, 'source-index-kind'), 1, `${source.id} reference row must contain one source tag`);
  assert.ok(sourceRow.includes(source.title) && sourceRow.includes(expectedKind), `${source.id} reference row must retain its filename and source tag`);
  assert.ok(sourceRow.indexOf('source-index-number') < sourceRow.indexOf('source-index-title') && sourceRow.indexOf('source-index-title') < sourceRow.indexOf('source-index-kind'), `${source.id} reference row must read number, filename, then source tag`);
  assert.ok(!sourceRow.includes('chevron-right'), `${source.id} reference row must not render a trailing chevron`);
}
assert.ok(completedAnalysis.includes('data-source-index-slot') && completedAnalysis.includes('参考依据'), 'the source index must sit inside the completed answer before generated files');
assert.ok(!completedAnalysis.includes('[^'), 'raw citation markers must never leak into rendered answer HTML');
const staticReportMarkdown = harness.reportMarkdown();
const staticReportBody = harness.reportBody();
const staticReferences = sliceBetween(staticReportBody, 'class="report-reference-list"', '</section>');
assert.ok(staticReportMarkdown.includes('[^'), 'generated report Markdown must retain semantic citation markers');
assert.ok(staticReportBody.includes('class="report-citation"') && staticReportBody.includes('href="#report-reference-'), 'static report citations must link to their matching References entries');
assert.equal(count(staticReferences, '<li id="report-reference-'), scenario.result.sources.length, 'the generated report must retain one References entry per cited source');
assert.ok(staticReferences.includes('target="_blank"') && staticReferences.includes('https://www.shfe.com.cn/'), 'a source URL must remain a normal clickable link in the static report');
assert.ok(!staticReferences.includes('<small>'), 'static References entries must contain only their number and title or URL');
for (const source of scenario.result.sources) {
  assert.ok(staticReferences.includes(source.title), `static References must retain the source title: ${source.title}`);
  if (source.locator) assert.ok(!staticReferences.includes(source.locator), `static References must omit locator metadata for ${source.id}`);
  if (source.sourceVersion) assert.ok(!staticReferences.includes(source.sourceVersion), `static References must omit source-version metadata for ${source.id}`);
  if (source.retrievedAt) assert.ok(!staticReferences.includes(source.retrievedAt), `static References must omit retrieval-time metadata for ${source.id}`);
}
assert.ok(!staticReferences.includes('source-kind') && !staticReferences.includes('data-source-chunk') && !staticReferences.includes('data-source-preview'), 'static References must not embed in-product source drawer content');
assert.ok(!staticReportBody.includes('data-action="open-source"'), 'the static report must not depend on the in-product source drawer interaction');

function sourceDrawerFor(sourceId) {
  harness.openSource(sourceId);
  return roots.get('dialog-root').innerHTML;
}

function assertMinimalSourceDrawer(sourceDrawer, source, expectedKindLabel) {
  const drawerHeader = headerMarkup(sourceDrawer, 'class="dialog-header"');
  const drawerBody = sliceBetween(sourceDrawer, 'class="dialog-body"', '</aside>');
  assert.ok(sourceDrawer.includes('source-drawer') && sourceDrawer.includes('aria-modal="false"'), `${source.id} must use the non-modal side drawer`);
  assert.ok(drawerHeader.includes('class="source-kind"') && drawerHeader.includes(expectedKindLabel), `${source.id} must put its source tag directly in the drawer topbar`);
  assert.ok(drawerHeader.includes(source.title), `${source.id} must put its source title directly in the drawer topbar`);
  assert.equal(count(sourceDrawer, 'class="source-kind"'), 1, `${source.id} must render exactly one source tag`);
  assert.equal(count(sourceDrawer, source.title), 1, `${source.id} must not repeat its title inside the drawer body`);
  assert.ok(!drawerBody.includes('class="source-kind"') && !drawerBody.includes('source-detail-header'), `${source.id} must not render a second internal header`);
  assert.ok(count(sourceDrawer, 'data-source-chunk') <= 1, `${source.id} must render at most one chunk region`);
  assert.ok(count(sourceDrawer, 'data-source-preview') <= 1, `${source.id} must render at most one original-content preview`);
  for (const forbidden of [
    '来源预览',
    '分析版本',
    '来源版本',
    '获取时间',
    '精确定位',
    '输入依据',
    'source-version-chip',
    'source-metadata',
    'source-snapshot-note',
    'source-detail-actions',
    'source-dependency',
    'source-formula',
    'data-action="locate-source-asset"',
    'data-action="locate-source-execution"'
  ]) {
    assert.ok(!sourceDrawer.includes(forbidden), `${source.id} drawer must omit retired metadata, duplicate header, or action: ${forbidden}`);
  }
}

const uploadSource = scenario.result.sources.find((source) => source.id === 'position-ledger');
const uploadDrawer = sourceDrawerFor(uploadSource.id);
assert.equal(state.dialog.kind, 'source-preview', 'opening an inline citation or index row must enter source-preview state');
assertMinimalSourceDrawer(uploadDrawer, uploadSource, '上传文件');
assert.ok(uploadDrawer.includes('上传文件') && uploadDrawer.includes('CU2401持仓明细.xlsx'), 'uploaded evidence must identify its source file');
assert.equal(count(uploadDrawer, 'data-source-chunk'), 0, 'uploaded files must not render a RAG/Web chunk');
assert.equal(count(uploadDrawer, 'data-source-preview'), 1, 'uploaded evidence must render one source-file preview');
assert.ok(!/<h[1-6][^>]*>\s*原文预览\s*<\/h[1-6]>/.test(uploadDrawer), 'an uploaded file without a recalled chunk must not show a redundant original-preview heading');

const ragSource = scenario.result.sources.find((source) => source.id === 'internal-rules');
const ragDrawer = sourceDrawerFor(ragSource.id);
assertMinimalSourceDrawer(ragDrawer, ragSource, '内部数据');
assert.ok(ragDrawer.includes('内部数据') && ragDrawer.includes('data-source-chunk'), 'RAG evidence must render its source tag and recalled chunk');
assert.ok(ragDrawer.includes(ragSource.chunk || ragSource.excerpt), 'the RAG drawer must show the recalled chunk text');
assert.ok(ragDrawer.includes('原文预览') && ragDrawer.indexOf('data-source-chunk') < ragDrawer.indexOf('data-source-preview'), 'RAG evidence with a chunk must place the recalled passage before the labeled original preview');

const webSource = scenario.result.sources.find((source) => source.id === 'market-signal');
const webDrawer = sourceDrawerFor(webSource.id);
assertMinimalSourceDrawer(webDrawer, webSource, '联网搜索');
assert.ok(webDrawer.includes('联网搜索') && webDrawer.includes('data-source-chunk'), 'Web evidence must render its source tag and recalled chunk');
assert.ok(webDrawer.includes(webSource.chunk || webSource.excerpt), 'the Web drawer must show the recalled chunk text');
assert.equal(count(webDrawer, 'data-source-preview'), 1, 'a Web source with a URL must render one original-page preview');
assert.ok(webDrawer.includes('原文预览') && webDrawer.indexOf('data-source-chunk') < webDrawer.indexOf('data-source-preview'), 'Web evidence with a chunk must place the recalled passage before the labeled original preview');

const bidNoticeSource = scenario.result.sources.find((source) => source.id === 'bid-notice');
const bidNoticeDrawer = sourceDrawerFor(bidNoticeSource.id);
assertMinimalSourceDrawer(bidNoticeDrawer, bidNoticeSource, '上传文件');
assert.equal(count(bidNoticeDrawer, 'data-source-chunk'), 0, 'the uploaded bid notice must not render a RAG/Web chunk');
assert.equal(count(bidNoticeDrawer, 'data-source-preview'), 1, 'the uploaded bid notice must render its file preview');
assert.ok(!/<h[1-6][^>]*>\s*原文预览\s*<\/h[1-6]>/.test(bidNoticeDrawer), 'the uploaded bid notice must not show a redundant original-preview heading');

const webExecution = harness.activeCapabilities().find((item) => item.id === 'web');
const pendingWebRow = harness.renderExecutionRow(webExecution, 'primary', false);
const completedWebRow = harness.renderExecutionRow(webExecution, 'primary', true);
assert.equal(count(pendingWebRow, 'data-action="open-search-results"'), 1, 'the Web Search node must keep one stable results affordance while pending');
assert.match(openingTagForAction(pendingWebRow, 'open-search-results'), /\sdisabled(?:\s|=|>)/, 'the pending Web Search results affordance must be disabled');
assert.equal(count(completedWebRow, 'data-action="open-search-results"'), 1, 'the completed Web Search node must expose one results affordance');
assert.doesNotMatch(openingTagForAction(completedWebRow, 'open-search-results'), /\sdisabled(?:\s|=|>)/, 'the completed Web Search results affordance must be clickable');

const previousDocumentQuerySelector = documentStub.querySelector;
const liveCopy = { hidden: true, textContent: '', classList };
const stateCopy = { textContent: '' };
const transitionWebRow = {
  hidden: true,
  disabled: true,
  classList,
  matches(selector) { return selector === '[data-action="open-search-results"]'; },
  setAttribute(name, value) { if (name === 'aria-disabled') this.ariaDisabled = value; },
  removeAttribute(name) { if (name === 'aria-disabled') this.ariaDisabled = null; },
  querySelector(selector) {
    if (selector === '[data-execution-live]') return liveCopy;
    if (selector === '[data-execution-state-copy]') return stateCopy;
    if (selector === '[data-action="open-search-results"]') return this;
    return null;
  }
};
documentStub.querySelector = (selector) => selector.includes('data-execution-group="primary"') && selector.includes('data-execution-id="web"') ? transitionWebRow : null;
harness.setExecutionRowState('primary', webExecution, 'running');
assert.equal(transitionWebRow.disabled, true, 'the Web Search node must remain non-interactive while running');
harness.setExecutionRowState('primary', webExecution, 'done');
assert.equal(transitionWebRow.disabled, false, 'finishing a replayed Web Search must enable its existing results affordance without requiring a rerender');
documentStub.querySelector = previousDocumentQuerySelector;

dispatchRenderedAction(completedWebRow, 'open-search-results');
const searchResultsDrawer = roots.get('dialog-root').innerHTML;
assert.equal(state.dialog.kind, 'search-results', 'clicking a completed Web Search node must enter the dedicated search-results drawer state');
assert.ok(searchResultsDrawer.includes('aria-modal="false"'), 'Web Search results must use a non-modal side drawer');
const renderedSearchRows = searchResultFragments(searchResultsDrawer);
assert.ok(renderedSearchRows.length >= 3, 'the search-results drawer must show at least three rows');
assert.equal(renderedSearchRows.length, webExecution.searchResults.length, 'the search-results drawer must render every result from the selected Web Search run');
assert.ok(!searchResultsDrawer.includes('search-result-source'), 'search results must not add a third source-label line');
for (const [index, resultRow] of renderedSearchRows.entries()) {
  const expectedResult = webExecution.searchResults[index];
  const titleLineStart = resultRow.indexOf('search-result-title-line');
  const snippetStart = resultRow.indexOf('search-result-snippet');
  const titleLine = titleLineStart < 0 || snippetStart < 0 ? '' : resultRow.slice(titleLineStart, snippetStart);
  const snippetLine = sliceBetween(resultRow, 'class="search-result-snippet"', '</span>');
  assert.equal(count(resultRow, 'search-result-title-line'), 1, `search result row ${index + 1} must contain one icon-title line`);
  assert.equal(count(resultRow, 'search-result-snippet'), 1, `search result row ${index + 1} must contain one summary line`);
  assert.ok(titleLine.includes('search-result-icon') && titleLine.includes(expectedResult.title), `search result row ${index + 1} must keep only its icon and title on the first line`);
  assert.ok(titleLineStart < snippetStart && snippetLine.includes(expectedResult.snippet.slice(0, 12)), `search result row ${index + 1} must put its summary on the second line`);
  if (expectedResult.snippet.length > 26) assert.ok(snippetLine.includes('…'), `search result row ${index + 1} must visibly ellipsize a long summary`);
  const links = Array.from(resultRow.matchAll(/\shref="(https?:\/\/[^\"]+)"/g), (match) => match[1]);
  assert.deepEqual(links, [expectedResult.url], `search result row ${index + 1} must map to its single URL`);
}
state.dialog = null;
roots.get('dialog-root').innerHTML = '';
assert.equal(count(completed, 'data-action="adjust-analysis-direction"'), 2, 'completed output must expose one composer entry and one initial-thought entry');
assert.equal(count(completedAnalysis, 'data-action="adjust-analysis-direction"'), 1, 'the initial-thought header must expose exactly one edit entry');
assert.equal(count(completedComposer, 'data-action="adjust-analysis-direction"'), 1, 'the composer guide must expose exactly one edit entry');
assert.equal(count(completedAnalysis, 'data-initial-thought-header'), 1, 'the analysis must render one semantic initial-thought header');
assert.equal(count(completed, 'data-action="apply-thought-edit"'), 0, 'completed output must not render save controls before editing');
assert.equal(count(completed, 'analysis-version-trigger'), 0, 'version history must not appear before a revision exists');

state.thoughtEditorOpen = true;
state.thoughtEditorTarget = scenario.interaction.target;
state.thoughtDraft = scenario.interaction.presetInput;
const editingAnalysis = harness.renderAnalysisMessage();
const editingComposer = harness.renderComposer();
const editingHeader = headerMarkup(editingAnalysis, 'data-initial-thought-header');
const editingAnalysisWithoutHeader = editingAnalysis.replace(editingHeader, '');
let editing = editingAnalysis + editingComposer;
assert.equal(count(editing, 'data-action="adjust-analysis-direction"'), 0, 'both entries must hide while the shared editor is open');
assert.equal(count(editing, 'id="thought-inline-input"'), 1, 'editing must happen in one original thought editor');
assert.equal(count(editing, 'data-action="apply-thought-edit"'), 1, 'editing must expose one save action');
assert.equal(count(editing, 'data-action="cancel-thought-edit"'), 1, 'editing must expose one cancel action');
assert.equal(count(editingHeader, 'data-action="apply-thought-edit"'), 1, 'the save action must live in the initial-thought header');
assert.equal(count(editingHeader, 'data-action="cancel-thought-edit"'), 1, 'the cancel action must live in the initial-thought header');
assert.equal(count(editingAnalysisWithoutHeader, 'data-action="apply-thought-edit"'), 0, 'the thought body must not duplicate the save action below the editor');
assert.equal(count(editingAnalysisWithoutHeader, 'data-action="cancel-thought-edit"'), 0, 'the thought body must not duplicate the cancel action below the editor');
assert.equal(count(editingComposer, 'data-action="apply-thought-edit"'), 0, 'the composer must not render a second save action');
assert.ok(editingHeader.indexOf('data-action="cancel-thought-edit"') < editingHeader.indexOf('data-action="apply-thought-edit"'), 'the header must keep cancel before the primary save action');
assert.ok(!editingAnalysis.includes('thought-inline-edit-footer'), 'the editing surface must not render a detached footer action area');
assert.ok(editing.includes('正在调整初始思考'), 'the inline header must retain a compact editing state');
assert.ok(editing.includes('更新并生成'), 'the inline header must use the concise update action');
assert.ok(!editing.includes('保存并重新生成'), 'the inline header must not retain the previous verbose action label');
assert.ok(!editing.includes('保存后会清空现有过程与正文，并重新生成完整分析。'), 'the editing header must not repeat explanatory copy');

state.thoughtEditorOpen = false;
state.thoughtEditorTarget = null;
state.versionHistory.push(harness.captureResponseVersion());
state.versionNumber = 2;
state.thoughtRevision = scenario.interaction.presetInput;
state.thoughtBaseText = scenario.interaction.originalText;
state.currentOutcome = harness.createRevisionOutcome(state.thoughtRevision, state.versionNumber);
state.analysisVersion = 'latest';
state.stage = 0;
state.replaying = true;
let regenerating = harness.renderAnalysisMessage() + harness.renderComposer();
assert.ok(regenerating.includes('data-process-panel="primary"') && regenerating.includes('data-process-panel="primary" aria-label="分析过程" hidden'), 'saving must hide the prior reasoning process immediately');
assert.ok(regenerating.includes('data-answer-body="result" hidden'), 'saving must hide the prior final body and report immediately');
assert.ok(!regenerating.includes(scenario.result.conclusion), 'the previous final answer must not remain in the regeneration frame');
assert.equal(count(regenerating, 'data-action="adjust-analysis-direction"'), 0, 'editing entries must stay hidden until regenerated thinking completes');

state.stage = scenario.interaction.stage;
state.replaying = false;
const reasoningComplete = harness.renderAnalysisMessage() + harness.renderComposer();
assert.equal(count(reasoningComplete, 'analysis-version-trigger'), 0, 'version history must wait until the complete analysis result has finished generating');

state.stage = scenario.result.stage;
state.replaying = false;
let latest = harness.renderAnalysisMessage() + harness.renderComposer();
const latestAssistantHeading = sliceBetween(latest, 'class="assistant-response-heading"', 'class="thinking-surface"');
const latestThoughtHeader = headerMarkup(latest, 'data-initial-thought-header');
assert.equal(count(latest, 'analysis-version-trigger'), 1, 'the initial-thought header must expose one history icon');
assert.equal(count(latestThoughtHeader, 'analysis-version-trigger'), 1, 'the history icon must live inside the initial-thought header');
assert.equal(count(latestAssistantHeading, 'analysis-version-trigger'), 0, 'the overall assistant heading must not expose version controls');
assert.equal(count(latest, 'data-action="select-analysis-version"'), 2, 'the first revision must expose versions 2 and 1');
assert.ok(latest.includes('历史版本仅供查看') && latest.includes('继续提问时将自动回到最新版本'), 'the version menu must explain both read-only history and latest-version continuation');
assert.ok(latest.includes('最新版本') && latest.includes('仅查看'), 'version options must distinguish the latest response from read-only snapshots');
assert.ok(!latest.includes('基于调整生成 · v2'), 'the overall assistant status must not duplicate the active version');
assert.ok(latest.includes('铜采购签约决策分析报告_v2.pdf'), 'the latest response must include its regenerated report file');
assert.ok(latest.includes(state.currentOutcome.result.conclusion), 'the latest response must include its regenerated final answer');
assert.ok(!harness.renderSourceDetail(harness.activeSources().find((source) => source.id === 'position-ledger')).includes('分析版本'), 'source details must not expose the active complete-analysis version');
assert.ok(harness.reportBody().includes('report-reference-list'), 'the regenerated report must retain its static References list');

const versionTwoSnapshot = harness.captureResponseVersion();
state.versionHistory.push(versionTwoSnapshot);
state.versionNumber = 3;
state.thoughtBaseText = state.thoughtRevision;
state.thoughtRevision = scenario.interaction.presetInput + '\n\n还需把客户可接受的升贴水上限作为签约边界。';
state.currentOutcome = harness.createRevisionOutcome(state.thoughtRevision, state.versionNumber);
state.analysisVersion = 'latest';
let versionThree = harness.renderAnalysisMessage() + harness.renderComposer();
assert.equal(count(versionThree, 'data-action="select-analysis-version"'), 3, 'the second revision must retain the complete versions 3, 2, and 1 chain');
assert.ok(versionThree.indexOf('版本 3') < versionThree.indexOf('版本 2') && versionThree.indexOf('版本 2') < versionThree.indexOf('版本 1'), 'the version menu must list all snapshots newest first');
assert.ok(versionThree.includes('铜采购签约决策分析报告_v3.pdf'), 'version 3 must include its own report file');
assert.ok(versionThree.includes(state.currentOutcome.result.conclusion), 'version 3 must include its own regenerated answer');
assert.equal(harness.activePlan()[0].title, '重新校准分析焦点', 'version 3 must use its newly generated Plan');
assert.ok(harness.activeCapabilities()[0].progress[0].includes('正在读取本轮调整'), 'version 3 must use its newly generated call payload');

state.analysisVersion = '2';
let versionTwo = harness.renderAnalysisMessage() + harness.renderComposer();
assert.ok(versionTwo.includes('历史版本'), 'a selected snapshot must be identified as historical');
assert.ok(versionTwo.includes('铜采购签约决策分析报告_v2.pdf'), 'version 2 must restore its report file');
assert.ok(versionTwo.includes(versionTwoSnapshot.result.conclusion), 'version 2 must restore its answer');
assert.ok(!versionTwo.includes('铜采购签约决策分析报告_v3.pdf'), 'version 3 files must not leak into version 2');
assert.equal(count(versionTwo, 'data-action="adjust-analysis-direction"'), 0, 'historical snapshots must remain read-only');
assert.equal(harness.activePlan()[0].title, scenario.revisionOutcome.plan[0].title, 'version 2 must restore its Plan');
assert.equal(harness.activeCapabilities()[0].progress[0], scenario.revisionOutcome.capabilities[0].progress[0], 'version 2 must restore its call payload');
assert.ok(!harness.renderSourceDetail(harness.activeSources().find((source) => source.id === 'position-ledger')).includes('历史快照'), 'historical source details must not expose version metadata');

state.analysisVersion = '1';
let versionOne = harness.renderAnalysisMessage() + harness.renderComposer();
const versionOneThoughtHeader = headerMarkup(versionOne, 'data-initial-thought-header');
assert.equal(count(versionOneThoughtHeader, 'analysis-version-trigger'), 1, 'version 1 must retain the same local history control');
assert.ok(versionOne.includes('铜采购签约决策分析报告.pdf'), 'version 1 must restore its original report file');
assert.ok(versionOne.includes(scenario.result.conclusion), 'version 1 must restore its original answer');
assert.ok(!versionOne.includes('铜采购签约决策分析报告_v2.pdf') && !versionOne.includes('铜采购签约决策分析报告_v3.pdf'), 'newer files must not leak into version 1');
assert.equal(count(versionOne, 'data-action="adjust-analysis-direction"'), 0, 'version 1 must remain read-only');
assert.equal(harness.activePlan()[0].title, scenario.plan[0].title, 'version 1 must restore its original Plan');
assert.equal(harness.activeCapabilities()[0].progress[0], scenario.capabilities.find((item) => item.id === 'knowledge').progress[0], 'version 1 must restore its original call payload');
assert.ok(versionOne.includes('参考依据') && versionOne.includes('data-source-index-slot'), 'version 1 must restore its source index together with process, answer, and report');
assert.ok(harness.reportBody().includes('report-reference-list') && harness.reportBody().includes('分析版本') === false, 'historical report output must keep static references without in-product version controls');

state.versionMenuOpen = true;
assert.equal(harness.continueFromLatestAnalysisVersion(), true, 'continuing from a historical view must report that the UI needs to return to latest');
assert.equal(state.analysisVersion, 'latest', 'continuing the conversation must always restore the latest analysis version');
assert.equal(state.versionMenuOpen, false, 'continuing the conversation must close the version menu');

harness.openSource('market-signal');
assert.equal(state.dialog.kind, 'source-preview', 'a source drawer may be opened for the selected historical version');
harness.setAnalysisVersion('latest');
assert.equal(state.dialog, null, 'switching versions must close a source drawer whose content belongs to the prior snapshot');

console.log('response-state-check: passed');

(function chatApplication(global, document) {
  'use strict';

  var DATA = global.CHAT_DEMO_DATA;
  var scenario = DATA.scenario;
  var displayedCapabilityIds = scenario.displayCapabilityIds || [];
  var primaryCapabilities = scenario.capabilities.filter(function visiblePrimary(item) { return displayedCapabilityIds.includes(item.id); });
  var continuationCapabilities = scenario.continuation.filter(function visibleContinuation(item) { return displayedCapabilityIds.includes(item.id); });
  var app = document.getElementById('app');
  var dialogRoot = document.getElementById('dialog-root');
  var toastRoot = document.getElementById('toast-root');
  var sessionMenuRoot = document.getElementById('session-menu-root');
  var sessionMenuId = null;
  var homeSession = { id: 'new', title: '新对话', isNew: true };
  var sessionSequence = 0;
  var dialogReturnFocus = null;
  var reportReferenceHighlightTimer = null;

  var state = {
    view: 'chat',
    activeSessionId: homeSession.id,
    agentApiAccess: JSON.parse(JSON.stringify(DATA.agentApiAccess || { clients: [] })),
    stage: scenario.result.stage,
    replaying: false,
    replayTimer: null,
    replayResolve: null,
    streamFrame: null,
    streamResolve: null,
    runId: 0,
    waitingFor: null,
    composerDraft: '',
    webSearchEnabled: false,
    deepThinkingEnabled: false,
    thoughtRevision: '',
    thoughtDraft: scenario.interaction.originalText,
    thoughtEditorOpen: false,
    thoughtEditorOrigin: null,
    thoughtRevisionTarget: scenario.interaction.target,
    thoughtBaseText: scenario.interaction.originalText,
    thoughtEditorTarget: null,
    analysisVersion: 'latest',
    versionNumber: 1,
    versionHistory: [],
    currentOutcome: null,
    versionMenuOpen: false,
    thoughtAttentionTimer: null,
    pendingFiles: [],
    sessions: DATA.sessions.map(function copySession(session) { return Object.assign({}, session); }),
    customSessions: [],
    sessionMessages: Object.create(null),
    customMessages: [],
    dialog: null
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeReferenceUrl(value) {
    var url = String(value == null ? '' : value).trim();
    return /^https?:\/\//i.test(url) ? url : '';
  }

  function renderInlineMarkdown(value, options) {
    var citationMode = options && options.citationMode === 'document' ? 'document' : 'interactive';
    var codeTokens = [];
    var output = escapeHtml(value).replace(/`([^`]+)`/g, function protectCode(match, content) {
      var token = '@@INLINE_CODE_' + codeTokens.length + '@@';
      codeTokens.push('<code>' + content + '</code>');
      return token;
    });
    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    output = output.replace(/\[\^([a-z0-9-]+)\]/gi, function renderCitation(match, sourceId) {
      var source = sourceById(sourceId);
      if (!source) return '';
      var number = sourceNumber(sourceId);
      var label = '查看依据 ' + number + '：' + source.title + '，' + source.locator;
      if (citationMode === 'document') {
        return '<a class="report-citation" href="#report-reference-' + number + '" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '">[' + number + ']</a>';
      }
      return '<button class="source-citation" type="button" data-action="open-source" data-source-id="' + escapeHtml(sourceId) + '" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '"><span aria-hidden="true">[' + number + ']</span></button>';
    });
    codeTokens.forEach(function restoreCode(code, index) {
      output = output.replace('@@INLINE_CODE_' + index + '@@', code);
    });
    return output;
  }

  function tableCells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function normalizeCell(cell) {
      return cell.trim();
    });
  }

  function isTableDivider(line) {
    var cells = tableCells(line);
    return cells.length > 0 && cells.every(function validDivider(cell) {
      return /^:?-{3,}:?$/.test(cell);
    });
  }

  function renderMarkdown(markdown, options) {
    var lines = String(markdown == null ? '' : markdown).replace(/\r/g, '').trim().split('\n');
    var html = [];
    var paragraph = [];
    var listType = '';

    function renderInline(value) {
      return renderInlineMarkdown(value, options);
    }

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push('<p>' + renderInline(paragraph.join(' ')) + '</p>');
      paragraph = [];
    }
    function closeList() {
      if (!listType) return;
      html.push('</' + listType + '>');
      listType = '';
    }
    function flushBlocks() {
      flushParagraph();
      closeList();
    }

    for (var index = 0; index < lines.length; index += 1) {
      var line = lines[index];
      var trimmed = line.trim();
      var nextLine = lines[index + 1] || '';
      if (!trimmed) {
        flushBlocks();
        continue;
      }
      if (trimmed.includes('|') && isTableDivider(nextLine)) {
        flushBlocks();
        var headings = tableCells(trimmed);
        var bodyRows = [];
        index += 2;
        while (index < lines.length && lines[index].trim().includes('|')) {
          bodyRows.push(tableCells(lines[index]));
          index += 1;
        }
        index -= 1;
        html.push('<div class="markdown-table-wrap"><table><thead><tr>' + headings.map(function headingCell(cell) {
          return '<th>' + renderInline(cell) + '</th>';
        }).join('') + '</tr></thead><tbody>' + bodyRows.map(function bodyRow(row) {
          return '<tr>' + headings.map(function bodyCell(heading, cellIndex) {
            return '<td>' + renderInline(row[cellIndex] || '') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>');
        continue;
      }
      var headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        flushBlocks();
        var level = headingMatch[1].length;
        html.push('<h' + level + '>' + renderInline(headingMatch[2]) + '</h' + level + '>');
        continue;
      }
      var quoteMatch = trimmed.match(/^>\s?(.+)$/);
      if (quoteMatch) {
        flushBlocks();
        html.push('<blockquote><p>' + renderInline(quoteMatch[1]) + '</p></blockquote>');
        continue;
      }
      var orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      var unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (orderedMatch || unorderedMatch) {
        flushParagraph();
        var nextListType = orderedMatch ? 'ol' : 'ul';
        if (listType !== nextListType) {
          closeList();
          listType = nextListType;
          html.push('<' + listType + '>');
        }
        html.push('<li>' + renderInline((orderedMatch || unorderedMatch)[1]) + '</li>');
        continue;
      }
      closeList();
      paragraph.push(trimmed);
    }
    flushBlocks();
    return html.join('');
  }

  function icon(name, size, className) {
    var iconSize = size || 18;
    return '<i data-lucide="' + escapeHtml(name) + '" width="' + iconSize + '" height="' + iconSize + '" class="' + escapeHtml(className || '') + '" aria-hidden="true"></i>';
  }

  function hydrateIcons(root) {
    if (!global.lucide || !global.lucide.createIcons) return;
    global.lucide.createIcons({ attrs: { 'stroke-width': 1.75 }, root: root || document });
    (root || document).querySelectorAll('svg[data-lucide]').forEach(function markHydrated(svg) {
      svg.removeAttribute('data-lucide');
    });
  }

  function allSessions() {
    return state.customSessions.concat(state.sessions);
  }

  function activeSession() {
    return findSession(state.activeSessionId) || homeSession;
  }

  function findSession(id) {
    return allSessions().find(function find(item) { return item.id === id; });
  }

  function sessionRoute(id) {
    return '#/chat/' + encodeURIComponent(id);
  }

  function agentApiRoute() {
    return '#/agent-api';
  }

  function syncRoute() {
    var next = sessionRoute(state.activeSessionId);
    if (global.location.hash !== next) global.history.replaceState(null, '', next);
  }

  function markdownList(items, ordered) {
    return items.map(function markdownListItem(item, index) {
      return (ordered ? index + 1 + '. ' : '- ') + item;
    }).join('\n');
  }

  function selectedVersionSnapshot() {
    if (state.analysisVersion === 'latest') return null;
    var selectedNumber = Number(state.analysisVersion);
    return state.versionHistory.find(function findVersion(version) {
      return version.number === selectedNumber;
    }) || null;
  }

  function viewingHistoricalVersion() {
    return Boolean(selectedVersionSnapshot());
  }

  function copyData(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function revisionFocus(value) {
    var compact = String(value || '').replace(/\s+/g, ' ').trim();
    return compact.length > 42 ? compact.slice(0, 42) + '…' : compact;
  }

  function createRevisionOutcome(value, versionNumber) {
    var outcome = copyData(scenario.revisionOutcome);
    if (!outcome) return outcome;
    outcome.result.documents = [
      { id: 'report', name: '铜采购签约决策分析报告_v' + versionNumber + '.pdf', size: '1.9 MB', icon: 'file-text' }
    ];
    if (versionNumber <= 2) return outcome;
    var focus = revisionFocus(value) || '最新补充的分析边界';
    outcome.plan[0] = {
      id: 1,
      title: '重新校准分析焦点',
      detail: '围绕“' + focus + '”重排第 ' + versionNumber + ' 版判断顺序'
    };
    outcome.plan[outcome.plan.length - 1] = {
      id: 5,
      title: '形成更新后的条件建议',
      detail: '把本轮调整同步写入签约、协商、退出与头寸动作'
    };
    outcome.capabilities.forEach(function reviseCapability(item, index) {
      item.runningTitle = '正在按第 ' + versionNumber + ' 版方向' + (index === 0 ? '复核内部边界…' : index === 1 ? '重新检索外部信号…' : '更新计算口径…');
      item.progress.unshift('正在读取本轮调整：“' + focus + '”');
    });
    (outcome.result.sources || []).forEach(function reviseSourceSnapshot(source) {
      if (source.id === 'position-ledger') source.sourceVersion = '持仓快照 v' + versionNumber;
      if (source.id === 'spot-quotes') source.sourceVersion = '报价快照 v' + versionNumber;
      if (source.id === 'market-signal') source.sourceVersion = '检索快照 v' + versionNumber;
      if (source.id !== 'bid-notice' && source.id !== 'bid-terms') source.retrievedAt = '第 ' + versionNumber + ' 版重新分析时复核';
    });
    var transitionCopies = [
      '本轮初始判断进一步补充了“' + focus + '”。这会改变问题的优先级，因此 Plan、检索问题和计算口径需要从该位置重新生成，而不是沿用上一版结论。',
      '内部知识检索将本轮调整与授权、交割和客户准入边界重新交叉核对。只有新方向与制度约束同时成立，后续货源与损益判断才可执行。',
      'Web Search 也按新的分析焦点重组检索条件，优先确认会直接改变签约门槛的价格、仓单、规格和时效信号。',
      '数值计算据此更新敏感性边界，并把本轮新增条件同步带入最终建议、行动清单和头寸处理原则。'
    ];
    outcome.followUpThoughtSegments = outcome.followUpThoughtSegments.map(function reviseThought(text, index) {
      return transitionCopies[index] + '\n\n' + text;
    });
    outcome.result.conclusion = '基于第 ' + versionNumber + ' 版分析方向，建议仍以可执行条件为核心推进协商与锁货，并将“' + focus + '”纳入签约或退出的触发边界。';
    outcome.result.summary = [
      '本轮重新分析已将“' + focus + '”同步纳入 Plan、内部知识检索、Web Search 和数值计算；它不是附加备注，而是更新后续判断顺序与证据要求的输入。'
    ].concat(outcome.result.summary.slice(1));
    outcome.result.actions = [
      '先验证“' + focus + '”对应的事实、授权与可执行条件'
    ].concat(outcome.result.actions.slice(1));
    return outcome;
  }

  function activeThoughtRevision() {
    var snapshot = selectedVersionSnapshot();
    if (snapshot) return snapshot.thoughtRevision || '';
    return state.thoughtRevision;
  }

  function activeThoughtRevisionTarget() {
    var snapshot = selectedVersionSnapshot();
    if (snapshot) return snapshot.thoughtRevisionTarget || scenario.interaction.target;
    return state.thoughtRevisionTarget;
  }

  function activeThoughtBaseText() {
    var snapshot = selectedVersionSnapshot();
    if (snapshot) return snapshot.thoughtBaseText || scenario.interaction.originalText;
    return state.thoughtBaseText || scenario.interaction.originalText;
  }

  function revisionActive() {
    return Boolean(activeThoughtRevision());
  }

  function thoughtEditingAvailable() {
    if (viewingHistoricalVersion() || state.stage < scenario.interaction.stage) return false;
    if (!state.replaying || !state.thoughtRevision) return true;
    return state.stage === scenario.interaction.stage;
  }

  function activePlan() {
    var snapshot = selectedVersionSnapshot();
    if (snapshot) return snapshot.plan;
    if (!revisionActive()) return scenario.plan;
    return (state.currentOutcome || scenario.revisionOutcome).plan;
  }

  function revisedCapabilities() {
    var outcome = state.currentOutcome || scenario.revisionOutcome;
    return outcome ? outcome.capabilities : primaryCapabilities;
  }

  function activeCapabilities() {
    var snapshot = selectedVersionSnapshot();
    if (snapshot) return snapshot.capabilities;
    return revisionActive() ? revisedCapabilities() : primaryCapabilities;
  }

  function activeCapabilityById(capabilityId) {
    return activeCapabilities().find(function findCapability(capability) {
      return capability.id === capabilityId;
    }) || null;
  }

  function activeResult() {
    var snapshot = selectedVersionSnapshot();
    if (snapshot) return snapshot.result;
    if (!revisionActive()) return scenario.result;
    return Object.assign({}, scenario.result, (state.currentOutcome || scenario.revisionOutcome).result || {});
  }

  function activeSources() {
    return activeResult().sources || [];
  }

  function sourceById(sourceId) {
    return activeSources().find(function findSource(source) { return source.id === sourceId; }) || null;
  }

  function sourceNumber(sourceId) {
    var index = activeSources().findIndex(function findSourceIndex(source) { return source.id === sourceId; });
    return index < 0 ? 0 : index + 1;
  }

  function activeAnalysisVersionNumber() {
    var snapshot = selectedVersionSnapshot();
    return snapshot ? snapshot.number : state.versionNumber;
  }

  function captureResponseVersion() {
    return {
      number: state.versionNumber,
      thoughtRevision: state.thoughtRevision,
      thoughtRevisionTarget: state.thoughtRevisionTarget,
      thoughtBaseText: state.thoughtBaseText,
      plan: copyData(activePlan()),
      capabilities: copyData(activeCapabilities()),
      thoughtSegments: scenario.analysisRun.thoughtSegments.map(function captureThought(content, index) {
        return thoughtSource(thoughtKey('primary', index)) || content;
      }),
      continuationThoughtSegments: scenario.continuationThoughtSegments.map(function captureContinuationThought(content, index) {
        return thoughtSource(thoughtKey('continuation', index)) || content;
      }),
      result: copyData(activeResult())
    };
  }

  function renderAnswerBody(group, bodyHtml, visible, extraHtml) {
    var markdownId = group === 'result' ? 'final-result-markdown' : group + '-answer-markdown';
    return '<div class="analysis-answer ' + (visible ? 'is-visible' : '') + '" data-answer-body="' + escapeHtml(group) + '" ' + (visible ? '' : 'hidden') + '>' +
      '<div id="' + markdownId + '" class="markdown-body" aria-busy="false">' + bodyHtml + '</div>' +
      (extraHtml || '') +
    '</div>';
  }

  function renderPlanTrack(complete, visible) {
    var planItems = activePlan();
    return '<div class="process-section process-plan-section" data-plan-panel ' + (visible ? '' : 'hidden') + '>' +
      '<div class="process-subheading"><strong>分析路径</strong><span data-plan-summary>' + (complete ? planItems.length + ' / ' + planItems.length + ' 已完成' : '等待开始') + '</span></div>' +
      '<ol class="analysis-plan-track" aria-label="分析路径">' + planItems.map(function planItem(item) {
        return '<li class="plan-track-item ' + (complete ? 'done' : 'pending') + '" data-plan-step="' + item.id + '" title="' + escapeHtml(item.detail) + '">' +
          '<span class="plan-track-marker"><span data-plan-number>' + item.id + '</span><span data-plan-check>' + icon('check', 11) + '</span></span>' +
          '<span class="plan-track-title">' + escapeHtml(item.title) + '</span>' +
        '</li>';
      }).join('') + '</ol>' +
    '</div>';
  }

  function thoughtKey(group, index) {
    return group + '-' + index;
  }

  function thoughtSource(key) {
    var match = String(key || '').match(/^(primary|continuation)-(\d+)$/);
    if (!match) return '';
    var index = Number(match[2]);
    var snapshot = selectedVersionSnapshot();
    if (snapshot) {
      var snapshotThoughts = match[1] === 'primary' ? snapshot.thoughtSegments : snapshot.continuationThoughtSegments;
      var fallbackThoughts = match[1] === 'primary' ? scenario.analysisRun.thoughtSegments : scenario.continuationThoughtSegments;
      return (snapshotThoughts && snapshotThoughts[index]) || fallbackThoughts[index] || '';
    }
    var outcome = revisionActive() ? (state.currentOutcome || scenario.revisionOutcome) : null;
    if (match[1] === 'primary' && outcome && index > 0) {
      return outcome.followUpThoughtSegments[index - 1] || scenario.analysisRun.thoughtSegments[index] || '';
    }
    var collection = match[1] === 'primary' ? scenario.analysisRun.thoughtSegments : scenario.continuationThoughtSegments;
    return collection[index] || '';
  }

  function thoughtDiffTokens(value) {
    if (global.Intl && global.Intl.Segmenter) {
      return Array.from(new global.Intl.Segmenter('zh-CN', { granularity: 'word' }).segment(String(value || '')), function segmentToken(part) {
        return part.segment;
      });
    }
    return Array.from(String(value || ''));
  }

  function renderThoughtRevisionDiff(original, revised) {
    var before = thoughtDiffTokens(original);
    var after = thoughtDiffTokens(revised);
    var rows = Array.from({ length: before.length + 1 }, function createRow() {
      return new Uint16Array(after.length + 1);
    });
    for (var beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
      for (var afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
        rows[beforeIndex][afterIndex] = before[beforeIndex] === after[afterIndex]
          ? rows[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(rows[beforeIndex + 1][afterIndex], rows[beforeIndex][afterIndex + 1]);
      }
    }
    var parts = [];
    var left = 0;
    var right = 0;
    function appendPart(type, text) {
      if (!text) return;
      var last = parts[parts.length - 1];
      if (last && last.type === type) last.text += text;
      else parts.push({ type: type, text: text });
    }
    while (left < before.length && right < after.length) {
      if (before[left] === after[right]) {
        appendPart('same', before[left]);
        left += 1;
        right += 1;
      } else if (rows[left + 1][right] >= rows[left][right + 1]) {
        appendPart('delete', before[left]);
        left += 1;
      } else {
        appendPart('insert', after[right]);
        right += 1;
      }
    }
    while (left < before.length) appendPart('delete', before[left++]);
    while (right < after.length) appendPart('insert', after[right++]);
    return parts.map(function renderPart(part) {
      var copy = escapeHtml(part.text);
      if (part.type === 'delete') return '<del class="thought-diff-delete">' + copy + '</del>';
      if (part.type === 'insert') return '<ins class="thought-diff-insert">' + copy + '</ins>';
      return '<span class="thought-diff-same">' + copy + '</span>';
    }).join('');
  }

  function initialThoughtHeaderCopy(editing, applied) {
    if (editing) {
      return {
        title: '正在调整初始思考'
      };
    }
    if (state.replaying && state.thoughtRevision) {
      return {
        title: '正在重新分析'
      };
    }
    if (viewingHistoricalVersion()) {
      return {
        title: '历史版本'
      };
    }
    if (applied) {
      return {
        title: '已调整分析方向'
      };
    }
    return {
      title: '初始思考'
    };
  }

  function renderInitialThoughtHeader(key, editing, applied, canEdit) {
    if (key !== scenario.interaction.target) return '';
    var copy = initialThoughtHeaderCopy(editing, applied);
    var editAction = canEdit && !editing
      ? '<button class="thought-inline-edit" type="button" data-action="adjust-analysis-direction" data-edit-origin="thought" aria-label="编辑初始思考">' + icon('pencil-line', 13) + '<span>编辑</span></button>'
      : '';
    var editControls = editing
      ? '<button class="thought-revision-cancel" type="button" data-action="cancel-thought-edit">取消</button><button class="thought-revision-submit" type="button" data-action="apply-thought-edit">' + icon('rotate-ccw', 13) + '更新并生成</button>'
      : '';
    var versionControl = editing ? '' : renderAnalysisVersionControl();
    return '<header class="initial-thought-header' + (editing ? ' is-editing' : '') + '" data-initial-thought-header><div class="initial-thought-header-copy"><strong>' + escapeHtml(copy.title) + '</strong></div><div class="initial-thought-actions">' + (editing ? editControls : editAction + versionControl) + '</div></header>';
  }

  function renderThoughtSegmentContent(group, content, index) {
    var key = thoughtKey(group, index);
    var revision = activeThoughtRevision();
    var applied = key === activeThoughtRevisionTarget() && Boolean(revision);
    var editing = key === state.thoughtEditorTarget && state.thoughtEditorOpen;
    var canEdit = key === scenario.interaction.target && thoughtEditingAvailable();
    var header = renderInitialThoughtHeader(key, editing, applied, canEdit);
    if (editing) {
      return header + '<textarea class="thought-inline-input" id="thought-inline-input" aria-label="调整初始分析方向" maxlength="1800">' + escapeHtml(state.thoughtDraft) + '</textarea>';
    }
    if (applied) {
      return header + '<div class="thought-inline-revision"><div class="thought-inline-diff">' + renderThoughtRevisionDiff(activeThoughtBaseText(), revision) + '</div></div>';
    }
    return header + '<div class="thought-copy">' + renderMarkdown(content || '') + '</div>';
  }

  function renderThoughtSegment(group, content, index, visible) {
    var key = thoughtKey(group, index);
    var editing = key === state.thoughtEditorTarget && state.thoughtEditorOpen;
    var applied = key === activeThoughtRevisionTarget() && Boolean(activeThoughtRevision());
    return '<div class="thought-segment markdown-body ' + (visible ? 'is-visible ' : '') + (editing ? 'is-editing ' : '') + (applied ? 'is-revised ' : '') + '" data-thought-segment="' + escapeHtml(key) + '" ' + (visible ? '' : 'hidden') + '>' + (visible ? renderThoughtSegmentContent(group, thoughtSource(key) || content, index) : '') + '</div>';
  }

  function renderExecutionRow(item, group, complete) {
    var opensSearchResults = item.id === 'web';
    var element = opensSearchResults ? 'button' : 'div';
    var attributes = opensSearchResults
      ? ' type="button" data-action="open-search-results" aria-label="查看 Web Search 的全部检索结果" ' + (complete ? '' : 'disabled ')
      : ' tabindex="-1" ';
    return '<' + element + ' class="execution-row ' + (opensSearchResults ? 'is-inspectable ' : '') + (complete ? 'done' : 'pending') + '" data-execution-group="' + group + '" data-execution-id="' + escapeHtml(item.id) + '"' + attributes + (complete ? '' : 'hidden') + '>' +
      '<span class="execution-icon">' + icon(item.icon || 'sparkles', 16) + '</span>' +
      '<div class="execution-copy">' +
        '<div class="execution-call-line"><div class="execution-meta"><strong>' + escapeHtml(item.runName) + '</strong><span class="execution-kind">' + escapeHtml(item.runType) + '</span></div>' +
        '<span class="execution-row-end"><span class="execution-state"><span class="execution-state-dot"></span><span data-execution-state-copy>' + (complete ? '已完成' : '待执行') + '</span></span>' + (opensSearchResults ? '<span class="execution-open-indicator" aria-hidden="true">' + icon('chevron-right', 14) + '</span>' : '') + '</span></div>' +
      '</div>' +
    '</' + element + '>';
  }

  function renderAnalysisFlow(items, options) {
    var settings = options || {};
    var complete = Boolean(settings.complete);
    var group = settings.group;
    var thoughtSegments = settings.thoughtSegments || [];
    var opening = settings.showPlan ? renderThoughtSegment(group, thoughtSegments[0], 0, complete) : '';
    var prelude = settings.showPlan ? renderThoughtSegment(group, thoughtSegments[1], 1, complete) : '';
    var entries = items.map(function analysisEntry(item, index) {
      var segmentIndex = index + (settings.showPlan ? 2 : 0);
      return '<div class="analysis-flow-entry" data-flow-entry="' + escapeHtml(group) + '-' + escapeHtml(item.id) + '">' + renderExecutionRow(item, group, complete) + '</div>' +
        renderThoughtSegment(group, thoughtSegments[segmentIndex], segmentIndex, complete);
    }).join('');
    return '<section class="analysis-process analysis-process--' + group + ' ' + (settings.visible ? 'is-visible' : '') + '" data-process-panel="' + group + '" aria-label="分析过程" ' + (settings.visible ? '' : 'hidden') + '>' +
      opening +
      (settings.showPlan ? renderPlanTrack(complete, complete) : '') +
      prelude +
      '<div class="analysis-flow">' + entries + '</div>' +
    '</section>';
  }

  function resultSummaryMarkdown() {
    var result = activeResult();
    return result.conclusion + '\n\n' + result.summary.join('\n\n');
  }

  function resultMetricsMarkdown() {
    var rows = activeResult().metrics.map(function metricRow(metric) {
      var citations = (metric.sourceIds || []).map(function metricCitation(sourceId) { return '[^' + sourceId + ']'; }).join('');
      return '| ' + metric.label + ' | `' + metric.formula + '` | **' + metric.value + '**' + citations + ' |';
    }).join('\n');
    return '### 当前损益\n\n| 项目 | 计算 | 结果 |\n| --- | --- | --- |\n' + rows;
  }

  function resultPremisesMarkdown() {
    return '### 核心前提与数据校准\n\n' + markdownList(activeResult().premises, true);
  }

  function resultPathsMarkdown() {
    var sections = activeResult().paths.map(function pathSection(path) {
      return '#### ' + path.title + ' · ' + path.label + '\n\n' + path.body + '\n\n' + markdownList(path.details || [], false);
    }).join('\n\n');
    return '### 三种方案详细对比\n\n' + sections;
  }

  function resultActionsMarkdown() {
    return '### 签约前行动\n\n' + markdownList(activeResult().actions, true);
  }

  function resultMarkdown() {
    return [resultSummaryMarkdown(), resultPremisesMarkdown(), resultMetricsMarkdown(), resultPathsMarkdown(), resultActionsMarkdown()].join('\n\n');
  }

  function reportMarkdown() {
    var result = activeResult();
    return [
      '## 一、报告摘要',
      '**' + result.conclusion + '**\n\n' + result.summary.join('\n\n'),
      '## 二、核心前提与数据校准\n\n' + markdownList(result.premises, true),
      '## 三、当前损益\n\n' + resultMetricsMarkdown().replace('### 当前损益\n\n', ''),
      '## 四、三种方案详细对比\n\n' + resultPathsMarkdown().replace('### 三种方案详细对比\n\n', ''),
      '## 五、签约前行动\n\n' + markdownList(result.actions, true),
      '## 六、期现头寸处理原则\n\n' + markdownList(result.positionPrinciples, false),
      '## 七、当前限制\n\n' + markdownList(result.limits, false)
    ].join('\n\n');
  }

  function renderReportReferences() {
    var sources = activeSources();
    if (!sources.length) return '';
    return '<section class="report-reference-list" aria-labelledby="report-reference-title"><h2 id="report-reference-title">八、参考依据</h2><ol>' + sources.map(function reportReference(source, index) {
      var number = index + 1;
      var url = safeReferenceUrl(source.url);
      var title = url
        ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(source.title) + icon('external-link', 13) + '</a>'
        : '<strong>' + escapeHtml(source.title) + '</strong>';
      return '<li id="report-reference-' + number + '" tabindex="-1"><span class="report-reference-number">[' + number + ']</span><div class="report-reference-copy">' + title + '</div></li>';
    }).join('') + '</ol></section>';
  }

  function renderSessionGroup(sessions, title, pinned) {
    return '<section class="session-group" aria-label="' + title + '"><div class="sidebar-label">' + title + '</div><ol class="session-list' + (pinned ? ' session-list--pinned' : '') + '">' + sessions.map(function sessionRow(session) {
      var active = state.view === 'chat' && session.id === state.activeSessionId;
      var id = escapeHtml(session.id);
      return '<li class="session-row' + (active ? ' active' : '') + '"><button class="session-button' + (active ? ' active' : '') + '" type="button" data-action="select-session" data-session-id="' + id + '" aria-current="' + (active ? 'page' : 'false') + '" title="' + escapeHtml(session.title) + '"><span class="session-title">' + escapeHtml(session.title) + '</span></button><button class="session-more-button" type="button" data-action="session-menu" data-session-id="' + id + '" aria-label="' + escapeHtml(session.title) + '的更多操作" aria-haspopup="menu" aria-expanded="false" aria-controls="session-popover">' + icon('ellipsis', 16) + '</button></li>';
    }).join('') + '</ol></section>';
  }

  function renderSessionGroups() {
    var sessions = allSessions();
    var pinned = sessions.filter(function pinnedSession(session) { return session.pinned; });
    var recent = sessions.filter(function recentSession(session) { return !session.pinned; });
    return (pinned.length ? renderSessionGroup(pinned, '置顶', true) : '') + renderSessionGroup(recent, '对话记录', false);
  }

  function sessionSearchText(session) {
    var parts = [session && session.title];
    if (session && Array.isArray(session.messages)) {
      session.messages.forEach(function collectMessage(message) {
        parts.push(message && message.text);
      });
    }
    if (session && session.id === scenario.id) {
      parts.push(scenario.originalQuestion, scenario.rewrittenQuery);
    }
    return parts.filter(Boolean).join(' ').toLocaleLowerCase();
  }

  function conversationSearchResults(query) {
    var normalizedQuery = String(query || '').trim().toLocaleLowerCase();
    return allSessions().filter(function matchSession(session) {
      return !normalizedQuery || sessionSearchText(session).includes(normalizedQuery);
    });
  }

  function renderConversationSearchResults(query) {
    var results = conversationSearchResults(query);
    if (!results.length) {
      return '<div class="conversation-search-empty" role="status">' + icon('search-x', 20) + '<strong>没有找到匹配的对话</strong><span>换个关键词试试。</span></div>';
    }
    return '<div class="conversation-search-result-count" aria-live="polite">找到 ' + results.length + ' 个对话</div><ol class="conversation-search-results" data-search-results>' + results.map(function renderSearchSession(session) {
      var active = session.id === state.activeSessionId;
      return '<li><button class="conversation-search-result' + (active ? ' is-active' : '') + '" type="button" data-action="select-search-session" data-session-id="' + escapeHtml(session.id) + '">' +
        '<span class="conversation-search-result-icon">' + icon(active ? 'message-circle' : 'message-square', 16) + '</span>' +
        '<span class="conversation-search-result-copy"><strong>' + escapeHtml(session.title) + '</strong></span>' +
        '<span class="conversation-search-result-arrow" aria-hidden="true">' + icon('arrow-up-right', 14) + '</span>' +
      '</button></li>';
    }).join('') + '</ol>';
  }

  function renderConversationSearchBody(query) {
    return '<div class="conversation-search-body">' +
      '<label class="conversation-search-input-wrap" for="session-search-input"><span class="conversation-search-input-icon">' + icon('search', 17) + '</span><input id="session-search-input" class="conversation-search-input" type="search" autocomplete="off" placeholder="搜索对话标题或内容" value="' + escapeHtml(query || '') + '" /></label>' +
      '<div class="conversation-search-results-wrap" data-search-results-wrap>' + renderConversationSearchResults(query) + '</div>' +
    '</div>';
  }

  function requestSearchSessions() {
    closeSessionMenu();
    setUserMenuOpen(false);
    state.dialog = {
      kind: 'conversation-search',
      title: '搜索对话',
      query: ''
    };
    renderDialog();
    var input = document.getElementById('session-search-input');
    if (input) input.focus();
  }

  function paintConversationSearchResults() {
    var wrap = dialogRoot.querySelector('[data-search-results-wrap]');
    if (!wrap || !state.dialog || state.dialog.kind !== 'conversation-search') return;
    wrap.innerHTML = renderConversationSearchResults(state.dialog.query || '');
    hydrateIcons(wrap);
  }

  function renderSidebar() {
    var agentApiActive = state.view === 'agent-api';
    return '<aside class="sidebar" aria-label="用户端导航">' +
      '<a class="brand-row" href="' + sessionRoute(homeSession.id) + '" data-action="new-chat" aria-label="数据智能分析首页"><span class="brand-mark">' + icon('chart-no-axes-combined', 19) + '</span><span class="brand-name">' + escapeHtml(DATA.productName) + '</span></a>' +
      '<nav class="sidebar-primary-actions" aria-label="主要功能"><button class="new-chat-button" type="button" data-action="new-chat">' + icon('plus', 18) + '<span>新建对话</span></button><button class="sidebar-search-button" type="button" data-action="search-sessions">' + icon('search', 17) + '<span>搜索</span></button></nav>' +
      '<div class="sidebar-conversations">' + renderSessionGroups() + '</div>' +
      '<div class="user-account-menu" data-user-account-menu><button class="user-menu" type="button" data-action="user-menu" aria-expanded="false" aria-controls="user-account-popover" aria-label="打开账户菜单"><span class="avatar user">' + escapeHtml(DATA.user.name.slice(0, 1)) + '</span><span><strong>' + escapeHtml(DATA.user.name) + '</strong></span>' + icon('chevron-down', 16) + '</button>' +
      '<nav class="user-account-popover" id="user-account-popover" aria-label="账户操作" hidden><a class="user-account-popover__action' + (agentApiActive ? ' is-active' : '') + '" href="' + agentApiRoute() + '" aria-current="' + (agentApiActive ? 'page' : 'false') + '">' + icon('key-round', 16) + '<span>API 密钥</span></a><a class="user-account-popover__action" href="#/knowledge">' + icon('settings-2', 16) + '<span>运营端</span></a><span class="user-account-popover__divider" aria-hidden="true"></span><button class="user-account-popover__action" type="button" data-action="logout">' + icon('log-out', 16) + '<span>退出登录</span></button></nav></div></aside>';
  }

  function sessionMenuTrigger(id) {
    return Array.from(document.querySelectorAll('[data-action="session-menu"]')).find(function find(button) { return button.dataset.sessionId === id; });
  }

  function closeSessionMenu(restoreFocus) {
    var trigger = sessionMenuTrigger(sessionMenuId);
    sessionMenuRoot.innerHTML = '';
    sessionMenuId = null;
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.closest('.session-row').classList.remove('is-menu-open');
      if (restoreFocus) trigger.focus();
    }
  }

  function openSessionMenu(id, trigger) {
    if (sessionMenuId === id) { closeSessionMenu(true); return; }
    closeSessionMenu();
    var session = findSession(id);
    if (!session) return;
    sessionMenuId = id;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.closest('.session-row').classList.add('is-menu-open');
    sessionMenuRoot.innerHTML = '<nav id="session-popover" class="session-popover" role="menu" aria-label="对话操作"><button class="session-menu-action" type="button" role="menuitem" data-action="pin-session">' + icon(session.pinned ? 'pin-off' : 'pin', 16) + '<span>' + (session.pinned ? '取消置顶' : '置顶') + '</span></button><button class="session-menu-action" type="button" role="menuitem" data-action="rename-session">' + icon('pencil', 16) + '<span>重命名</span></button><button class="session-menu-action danger" type="button" role="menuitem" data-action="delete-session">' + icon('trash-2', 16) + '<span>删除</span></button></nav>';
    hydrateIcons(sessionMenuRoot);
    var menu = sessionMenuRoot.firstElementChild;
    var rect = trigger.getBoundingClientRect();
    var left = rect.right + 4;
    menu.style.maxWidth = Math.max(0, global.innerWidth - left - 8) + 'px';
    var top = Math.max(8, Math.min(rect.top, global.innerHeight - menu.offsetHeight - 8));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.maxHeight = Math.max(80, global.innerHeight - top - 8) + 'px';
    menu.querySelector('button').focus();
  }

  function refreshSessionSidebar(focusId) {
    closeSessionMenu();
    var container = document.querySelector('.sidebar-conversations');
    if (!container) return;
    var scrollTop = container.scrollTop;
    container.innerHTML = renderSessionGroups();
    container.scrollTop = scrollTop;
    hydrateIcons(container);
    if (focusId) {
      var trigger = sessionMenuTrigger(focusId);
      if (trigger) trigger.focus();
    }
  }

  function requestRenameSession(session) {
    if (!session) return;
    closeSessionMenu(true);
    state.dialog = { kind: 'rename-session', sessionId: session.id, title: '重命名对话', body: '<label class="session-rename-label" for="session-name">名称</label><input class="session-rename-input" id="session-name" maxlength="80" autocomplete="off" value="' + escapeHtml(session.title) + '" />' };
    renderDialog();
    var input = document.getElementById('session-name');
    input.focus();
    input.select();
  }

  function confirmRenameSession() {
    var session = state.dialog && findSession(state.dialog.sessionId);
    var input = document.getElementById('session-name');
    if (!session || !input) return;
    var name = input.value.trim();
    if (!name) { showToast('请输入对话名称'); input.focus(); return; }
    session.title = name.slice(0, 80);
    var heading = state.view === 'chat' && state.activeSessionId === session.id && document.querySelector('.conversation-heading strong');
    if (heading) heading.textContent = session.title;
    state.dialog = null;
    renderDialog();
    refreshSessionSidebar(session.id);
    showToast('对话已重命名');
  }

  function requestDeleteSession(session) {
    if (!session) return;
    closeSessionMenu(true);
    state.dialog = { kind: 'confirm-session-delete', sessionId: session.id, title: '删除对话', body: '<p class="confirm-dialog-copy">确定删除“<strong>' + escapeHtml(session.title) + '</strong>”？删除后无法恢复。</p>' };
    renderDialog();
  }

  function confirmDeleteSession() {
    var session = state.dialog && findSession(state.dialog.sessionId);
    if (!session) return;
    state.sessions = state.sessions.filter(function keep(item) { return item.id !== session.id; });
    state.customSessions = state.customSessions.filter(function keep(item) { return item.id !== session.id; });
    delete state.sessionMessages[session.id];
    state.dialog = null;
    renderDialog();
    if (state.view === 'chat' && state.activeSessionId === session.id) newChat();
    else {
      if (state.activeSessionId === session.id) { state.activeSessionId = homeSession.id; state.customMessages = []; }
      refreshSessionSidebar();
    }
    showToast('对话已删除');
  }

  function renderTopbar() {
    var session = activeSession();
    var isScenario = session.id === scenario.id;
    var replayButton = '';
    if (isScenario) {
      var replayCopy = state.waitingFor ? '等待调整' : state.replaying ? (state.thoughtRevision ? '重新分析中' : '演示进行中') : '重新演示';
      replayButton = '<button class="text-button" type="button" data-action="replay-demo" ' + (state.replaying ? 'disabled' : '') + '>' + icon('refresh-cw', 16) + '<span data-replay-copy>' + replayCopy + '</span></button>';
    }
    return '<header class="topbar"><div class="conversation-heading"><strong>' + escapeHtml(session.title) + '</strong></div>' + (replayButton ? '<div class="topbar-actions">' + replayButton + '</div>' : '') + '</header>';
  }

  function agentApiClients() {
    var clients = state.agentApiAccess && state.agentApiAccess.clients;
    return (Array.isArray(clients) ? clients : []).filter(function agentOnly(item) {
      return item && item.apiType === 'agent';
    });
  }

  function findAgentApiKey(id) {
    return agentApiClients().find(function findKey(item) { return item.id === id; });
  }

  function displayApiTime(value, emptyLabel) {
    if (!value) return emptyLabel || '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date).replaceAll('/', '-');
  }

  function renderAgentApiRows() {
    return agentApiClients().map(function renderAgentKey(item) {
      return '<tr data-agent-api-row data-agent-api-id="' + escapeHtml(item.id) + '"><td><strong class="agent-api-name">' + escapeHtml(item.name) + '</strong></td><td><code class="agent-api-masked">' + escapeHtml(item.keyMasked) + '</code></td><td>' + escapeHtml(displayApiTime(item.lastUsedAt, '尚未使用')) + '</td><td>' + escapeHtml(displayApiTime(item.createdAt)) + '</td><td><div class="agent-api-row-actions"><button type="button" data-action="view-agent-api-key" data-api-key-id="' + escapeHtml(item.id) + '">查看</button><button class="is-danger" type="button" data-action="delete-agent-api-key" data-api-key-id="' + escapeHtml(item.id) + '">删除</button></div></td></tr>';
    }).join('');
  }

  function renderAgentApiPage() {
    var rows = renderAgentApiRows();
    var heading = '<h1 class="settings-page-title">API 密钥</h1>';
    var actions = '<button class="button primary" type="button" data-action="create-agent-api-key">' + icon('plus', 16) + '创建 API Key</button>';
    var table = rows
      ? '<section class="settings-table-surface agent-api-table-surface" aria-label="API 密钥列表"><div class="settings-table-wrap"><table class="settings-table agent-api-table"><thead><tr><th>名称</th><th>API Key</th><th>最近使用时间</th><th>创建时间</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>'
      : '<section class="agent-api-empty" aria-label="暂无 API 密钥">' + icon('key-round', 24) + '<strong>暂无 API Key</strong><p>创建后，外部应用即可调用研判 Agent。</p></section>';
    return '<header class="topbar settings-topbar agent-api-topbar">' + heading + '<div class="topbar-actions">' + actions + '</div></header><div class="settings-page-scroll agent-api-page-scroll"><div class="settings-page agent-api-page"><p class="agent-api-intro">为外部应用创建并管理调用研判 Agent 的 API Key。</p>' + table + '</div></div>';
  }

  function renderAgentApiShell() {
    closeSessionMenu();
    state.view = 'agent-api';
    state.dialog = null;
    dialogRoot.innerHTML = '';
    document.title = 'API 密钥 · ' + DATA.productName;
    app.innerHTML = '<div class="chat-shell">' + renderSidebar() + '<main class="main-pane settings-main-pane agent-api-main-pane">' + renderAgentApiPage() + '</main></div>';
    hydrateIcons();
  }

  function requestCreateAgentApiKey() {
    state.dialog = {
      kind: 'api-key-create',
      title: '创建 API Key',
      body: '<div class="agent-api-form"><label class="agent-api-form-field" for="agent-api-key-name"><span>名称 <b aria-hidden="true">*</b></span><input class="settings-field" id="agent-api-key-name" maxlength="48" required aria-required="true" autocomplete="off" placeholder="例如：供应商风险工作台"></label></div>'
    };
    renderDialog();
    var name = document.getElementById('agent-api-key-name');
    if (name) name.focus();
  }

  function createAgentApiSecret() {
    var alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var bytes = new Uint8Array(24);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') global.crypto.getRandomValues(bytes);
    else bytes.forEach(function fill(value, index) { bytes[index] = Math.floor(Math.random() * 256); });
    return 'sk_agent_' + Array.from(bytes, function character(value) { return alphabet[value % alphabet.length]; }).join('');
  }

  function maskedAgentApiSecret(secret) {
    return 'sk_agent_•••••••' + String(secret || '').slice(-4).toUpperCase();
  }

  function confirmCreateAgentApiKey() {
    var nameInput = document.getElementById('agent-api-key-name');
    var name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      showToast('请输入名称');
      if (nameInput) nameInput.focus();
      return;
    }
    if (agentApiClients().some(function duplicate(item) { return item.name.toLowerCase() === name.toLowerCase(); })) {
      showToast('名称已存在，请使用其他名称');
      if (nameInput) nameInput.select();
      return;
    }
    var secret = createAgentApiSecret();
    var client = {
      id: 'AGENT-API-' + Date.now().toString(36).toUpperCase(),
      name: name,
      apiType: 'agent',
      keyMasked: maskedAgentApiSecret(secret),
      lastUsedAt: null,
      createdAt: new Date().toISOString()
    };
    state.agentApiAccess.clients.unshift(client);
    state.dialog = {
      kind: 'api-key-secret',
      title: 'API Key 已创建',
      dismissible: false,
      secretCopied: false,
      body: '<div class="agent-api-secret"><p class="agent-api-once-notice">请立即复制并安全保存。关闭后将无法再次查看完整 Key。</p><label class="agent-api-form-field" for="agent-api-secret-value"><span>API Key</span><span class="agent-api-secret-row"><input class="settings-field agent-api-secret-value" id="agent-api-secret-value" readonly value="' + escapeHtml(secret) + '"><button class="button" type="button" data-action="copy-agent-api-secret">' + icon('copy', 15) + '<span data-copy-agent-api-label>复制</span></button></span></label></div>'
    };
    renderDialog();
  }

  function copyAgentApiSecret() {
    var input = document.getElementById('agent-api-secret-value');
    if (!input) return;
    function copied() {
      if (!state.dialog || state.dialog.kind !== 'api-key-secret') return;
      state.dialog.secretCopied = true;
      var button = dialogRoot.querySelector('[data-action="copy-agent-api-secret"]');
      var label = dialogRoot.querySelector('[data-copy-agent-api-label]');
      var complete = dialogRoot.querySelector('[data-action="complete-agent-api-secret"]');
      if (button) button.classList.add('is-copied');
      if (label) label.textContent = '已复制';
      if (complete) {
        complete.disabled = false;
        complete.removeAttribute('aria-disabled');
        complete.focus();
      }
      showToast('密钥已复制');
    }
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(input.value).then(copied).catch(function fallbackCopy() {
        input.select();
        document.execCommand('copy');
        copied();
      });
      return;
    }
    input.select();
    document.execCommand('copy');
    copied();
  }

  function completeAgentApiSecret() {
    if (!state.dialog || state.dialog.kind !== 'api-key-secret' || !state.dialog.secretCopied) {
      showToast('请先复制并安全保存密钥');
      return;
    }
    state.dialog = null;
    renderDialog();
    renderAgentApiShell();
  }

  function requestAgentApiKeyDetail(item) {
    if (!item) return;
    state.dialog = {
      kind: 'api-key-detail',
      title: '查看 API Key',
      body: '<div class="agent-api-form agent-api-detail-form"><label class="agent-api-form-field"><span>名称</span><input class="settings-field" readonly value="' + escapeHtml(item.name) + '"></label><label class="agent-api-form-field"><span>API Key</span><input class="settings-field agent-api-secret-value" readonly value="' + escapeHtml(item.keyMasked) + '"></label></div>'
    };
    renderDialog();
  }

  function requestAgentApiKeyDelete(item) {
    if (!item) return;
    state.dialog = {
      kind: 'confirm-api-key-delete',
      title: '删除 API Key',
      apiKeyId: item.id,
      body: '<p class="confirm-dialog-copy">删除后，“<strong>' + escapeHtml(item.name) + '</strong>”的 API Key 将立即失效且无法恢复。</p>'
    };
    renderDialog();
  }

  function confirmAgentApiKeyDelete() {
    var item = state.dialog && findAgentApiKey(state.dialog.apiKeyId);
    if (!item) return;
    state.agentApiAccess.clients.splice(state.agentApiAccess.clients.indexOf(item), 1);
    state.dialog = null;
    renderDialog();
    renderAgentApiShell();
    showToast('密钥已删除');
  }

  function renderAttachment(file) {
    var iconName = file.type === 'pdf' ? 'file-text' : file.type === 'xlsx' ? 'sheet' : 'file';
    var assetHook = file.id ? ' data-asset-id="' + escapeHtml(file.id) + '" tabindex="-1"' : '';
    return '<span class="attachment-chip" data-type="' + escapeHtml(file.type) + '"' + assetHook + '><span class="file-icon">' + icon(iconName, 17) + '</span><span><strong title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</strong><small>' + escapeHtml(file.size) + '</small></span></span>';
  }

  function renderUserQuestion() {
    return '<article class="message user-message initial-user-message" aria-label="用户消息"><div class="user-bubble"><p>' + escapeHtml(scenario.originalQuestion) + '</p><div class="attachment-grid">' + scenario.attachments.map(renderAttachment).join('') + '</div></div></article>';
  }

  function renderStreamStatus(kind, text) {
    return '<div class="stream-status" data-stream-status="' + kind + '" role="status" aria-live="polite" ' + (text ? '' : 'hidden') + '><span class="stream-status-dot" aria-hidden="true"></span><span data-stream-status-copy>' + escapeHtml(text || '') + '</span></div>';
  }

  function analysisLabelCopy(initialComplete, finalComplete) {
    if (finalComplete) return '已完成';
    if (initialComplete) return state.thoughtRevision ? '正在重新生成' : '正文生成中';
    return state.replaying ? (state.thoughtRevision ? '重新分析中' : '深度分析中') : '分析过程';
  }

  function renderVersionOption(version, number, relation) {
    var selected = state.analysisVersion === version;
    return '<button class="analysis-version-option' + (selected ? ' is-selected' : '') + '" type="button" role="menuitemradio" aria-checked="' + String(selected) + '" data-action="select-analysis-version" data-version="' + escapeHtml(version) + '"><strong>分析版本 ' + escapeHtml(number) + '</strong><small>' + escapeHtml(relation) + '</small></button>';
  }

  function renderAnalysisVersionControl() {
    if (state.stage < scenario.result.stage || !state.versionHistory.length || state.replaying) return '';
    var historyOptions = state.versionHistory.slice().reverse().map(function renderHistoricalVersion(version) {
      return renderVersionOption(String(version.number), version.number, '仅查看');
    }).join('');
    return '<div class="analysis-version-control" data-version-control><button class="analysis-version-trigger" type="button" data-action="toggle-version-menu" aria-label="查看完整分析版本，最新为分析版本 ' + escapeHtml(state.versionNumber) + '" aria-haspopup="menu" aria-controls="analysis-version-menu" aria-expanded="' + String(state.versionMenuOpen) + '" title="查看完整分析版本">' + icon('history', 15) + '</button>' +
      '<div class="analysis-version-popover" ' + (state.versionMenuOpen ? '' : 'hidden') + '>' +
        '<p class="analysis-version-note" id="analysis-version-note">历史版本仅供查看。继续提问时将自动回到最新版本，并基于最新内容回答。</p>' +
        '<div class="analysis-version-options" id="analysis-version-menu" role="menu" aria-label="完整分析版本" aria-describedby="analysis-version-note">' +
          renderVersionOption('latest', state.versionNumber, '最新版本') + historyOptions +
        '</div>' +
      '</div></div>';
  }

  function renderAnalysisHeading(label) {
    return '<div class="assistant-response-heading"><div class="assistant-label">数据智能分析 <span data-primary-label-status>' + escapeHtml(label) + '</span></div></div>';
  }

  function renderAnalysisMessage() {
    var initialComplete = state.stage >= scenario.interaction.stage;
    var finalComplete = state.stage >= scenario.result.stage;
    var label = analysisLabelCopy(initialComplete, finalComplete);
    var sourceSlot = '<div data-source-index-slot ' + (finalComplete ? '' : 'hidden') + '>' + renderSourceIndex() + '</div>';
    var reportSlot = '<div data-report-slot ' + (finalComplete ? '' : 'hidden') + '>' + renderDocuments() + '</div>';
    return '<article class="message assistant-message research-run-message" aria-label="数据智能分析回复"><span class="avatar assistant">' + icon('sparkles', 17) + '</span><div class="assistant-content">' + renderAnalysisHeading(label) + '<div class="thinking-surface">' + renderStreamStatus('primary', '') + renderAnalysisFlow(activeCapabilities(), {
      group: 'primary',
      thoughtSegments: scenario.analysisRun.thoughtSegments,
      showPlan: true,
      visible: initialComplete,
      complete: initialComplete,
      busy: state.replaying
    }) + '</div>' + renderAnswerBody('result', finalComplete ? renderMarkdown(resultMarkdown()) : '', finalComplete, sourceSlot + reportSlot) + '</div></article>';
  }

  function sourceKindMeta(source) {
    if (source.kind === 'rag') return { label: '内部数据', icon: 'database' };
    if (source.kind === 'web') return { label: '联网搜索', icon: 'globe-2' };
    return { label: '上传文件', icon: String(source.title || '').endsWith('.xlsx') ? 'sheet' : 'file-text' };
  }

  function renderSourceIndex() {
    var sources = activeSources();
    if (!sources.length) return '';
    return '<section class="source-index" aria-labelledby="source-index-title"><header class="source-index-heading"><div><strong id="source-index-title">参考依据</strong><span>' + sources.length + ' 项</span></div></header><ol class="source-index-list">' + sources.map(function sourceIndexItem(source, index) {
      var meta = sourceKindMeta(source);
      var label = '预览来源 ' + (index + 1) + '：' + source.title;
      return '<li><button class="source-index-item" type="button" data-action="open-source" data-source-id="' + escapeHtml(source.id) + '" aria-label="' + escapeHtml(label) + '"><span class="source-index-number">[' + (index + 1) + ']</span><strong class="source-index-title">' + escapeHtml(source.title) + '</strong><small class="source-index-kind">' + icon(meta.icon, 12) + escapeHtml(meta.label) + '</small></button></li>';
    }).join('') + '</ol></section>';
  }

  function renderDocuments() {
    return '<div class="document-list" aria-label="生成的报告">' + activeResult().documents.map(function documentButton(item) {
      return '<button class="document-button" type="button" data-action="open-document" data-document-id="' + escapeHtml(item.id) + '"><span class="file-icon">' + icon(item.icon, 17) + '</span><span><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.size) + '</small></span>' + icon('arrow-up-right', 15) + '</button>';
    }).join('') + '</div>';
  }

  function renderCustomMessage(message) {
    if (message.role === 'user') {
      var files = message.files && message.files.length ? '<div class="attachment-grid">' + message.files.map(renderAttachment).join('') + '</div>' : '';
      return '<article class="message user-message"><div class="user-bubble"><p>' + escapeHtml(message.text) + '</p>' + files + '</div></article>';
    }
    return '<article class="message assistant-message"><span class="avatar assistant">' + icon('sparkles', 17) + '</span><div class="assistant-content"><div class="assistant-label">数据智能分析</div><div class="markdown-body">' + renderMarkdown(message.text) + '</div></div></article>';
  }

  function renderCustomMessages() {
    return state.customMessages.map(renderCustomMessage).join('');
  }

  function renderScenarioThread() {
    return '<div class="thread">' + renderUserQuestion() + renderAnalysisMessage() + renderCustomMessages() + '</div>';
  }

  function renderSessionThread() {
    var session = activeSession();
    return '<div class="thread">' + (session.messages || []).map(renderCustomMessage).join('') + renderCustomMessages() + '</div>';
  }

  function isEmptyChat() {
    return state.activeSessionId === homeSession.id;
  }

  function renderChatWelcome() {
    return '<section class="chat-welcome" aria-labelledby="chat-welcome-title"><span class="empty-mark">' + icon('sparkles', 22) + '</span><h1 id="chat-welcome-title">开始一次数据智能分析</h1><p>输入问题并上传资料，我会先理解目标、确认分析思路，再制定执行计划。</p>' + renderComposer() + '</section>';
  }

  function renderPendingFileItems() {
    return state.pendingFiles.map(function pendingFile(file, index) {
      return '<span class="pending-file">' + icon('paperclip', 13) + '<span>' + escapeHtml(file.name) + '</span><button class="icon-button" type="button" data-action="remove-pending-file" data-file-index="' + index + '" aria-label="移除文件" style="width:22px;height:22px">' + icon('x', 12) + '</button></span>';
    }).join('');
  }

  function analysisDirectionGuideCopy() {
    if (state.thoughtRevision && state.replaying && !thoughtEditingAvailable()) return '正在重新生成完整分析，Plan、调用、正文和文件将依次更新。';
    if (state.replaying && state.stage < scenario.result.stage) return '正文正在生成；若初始判断有误，可以直接调整后重新分析。';
    return '若初始判断或分析方向有误，可以调整后重新生成完整结果。';
  }

  function renderAnalysisDirectionGuide() {
    var regenerating = Boolean(state.thoughtRevision) && state.replaying && !thoughtEditingAvailable() && !viewingHistoricalVersion();
    var visible = state.activeSessionId === scenario.id && !viewingHistoricalVersion() && (regenerating || thoughtEditingAvailable());
    var canAdjust = visible && !regenerating && !state.thoughtEditorOpen;
    return '<aside class="analysis-direction-guide ' + (visible ? 'is-visible' : '') + '" data-analysis-direction-guide role="status" aria-live="polite" ' + (visible ? '' : 'hidden') + '>' +
      '<span class="analysis-direction-guide-icon">' + icon(regenerating ? 'loader-circle' : 'route', 14, regenerating ? 'spin' : '') + '</span><span class="analysis-direction-guide-copy">' + analysisDirectionGuideCopy() + '</span>' +
      (canAdjust ? '<button class="analysis-direction-guide-action" type="button" data-action="adjust-analysis-direction" data-edit-origin="composer">调整初始思考</button>' : '') + '</aside>';
  }

  function renderComposerModeToggle(action, enabled, iconName, label) {
    var actionLabel = (enabled ? '关闭' : '开启') + label;
    return '<button class="composer-tool-control composer-tool-toggle' + (enabled ? ' is-active' : '') + '" type="button" data-action="' + escapeHtml(action) + '" aria-pressed="' + String(enabled) + '" aria-label="' + actionLabel + '" title="' + actionLabel + '">' + icon(iconName, 16) + '<span>' + label + '</span></button>';
  }

  function renderWebSearchToggle() {
    return renderComposerModeToggle('toggle-web-search', Boolean(state.webSearchEnabled), 'globe-2', '联网搜索');
  }

  function renderDeepThinkingToggle() {
    return renderComposerModeToggle('toggle-deep-thinking', Boolean(state.deepThinkingEnabled), 'brain-circuit', '思维链');
  }

  function renderUploadButton() {
    var count = state.pendingFiles.length;
    var label = count ? '已添加 ' + count + ' 个文件，继续添加' : '上传文件';
    return '<button class="composer-tool-control composer-upload-button' + (count ? ' has-value' : '') + '" type="button" data-action="attach-file" aria-label="' + label + '" title="' + label + '">' + icon('paperclip', 17) + (count ? '<span class="composer-upload-count" aria-hidden="true">' + count + '</span>' : '') + '</button>';
  }

  function renderComposer() {
    var waiting = Boolean(state.waitingFor);
    return '<footer class="composer-region composer-shell ' + (waiting ? 'awaiting-input' : '') + '">' + renderAnalysisDirectionGuide() + '<div id="pending-attachments" class="pending-attachments" ' + (state.pendingFiles.length ? '' : 'hidden') + '>' + renderPendingFileItems() + '</div><div class="composer"><input id="file-input" type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.png,.jpg,.jpeg" /><div class="composer-input-row"><textarea id="composer-input" rows="1" maxlength="3000" aria-label="输入问题或补充信息；Enter 发送，Shift 加 Enter 换行" placeholder="输入问题，或继续补充信息">' + escapeHtml(state.composerDraft) + '</textarea></div><div class="composer-toolbar" role="group" aria-label="输入操作"><div class="composer-toolbar-start">' + renderUploadButton() + renderWebSearchToggle() + renderDeepThinkingToggle() + '</div><button class="icon-button primary" type="button" data-action="send-message" aria-label="发送">' + icon('arrow-up', 20) + '</button></div></div></footer>';
  }

  function resizeComposerTextarea(input) {
    if (!input) return;
    var maxHeight = 160;
    input.style.height = 'auto';
    input.style.height = Math.max(40, Math.min(input.scrollHeight, maxHeight)) + 'px';
    input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function renderShell(options) {
    closeSessionMenu();
    var settings = options || {};
    state.view = 'chat';
    var isScenario = state.activeSessionId === scenario.id;
    var emptyChat = isEmptyChat();
    document.title = DATA.productName;
    var content = emptyChat ? renderChatWelcome() : renderTopbar() + '<div class="thread-scroll" id="thread-scroll">' + (isScenario ? renderScenarioThread() : renderSessionThread()) + '</div>' + renderComposer();
    app.innerHTML = '<div class="chat-shell">' + renderSidebar() + '<main class="main-pane' + (emptyChat ? ' is-empty-chat' : '') + '">' + content + '</main></div>';
    hydrateIcons();
    syncRoute();
    global.requestAnimationFrame(function finishRender() {
      var input = document.getElementById('composer-input');
      resizeComposerTextarea(input);
      if (settings.scrollToBottom) scrollToLatest(true);
      if (settings.focusAnalysis) {
        var analysis = document.querySelector('.research-run-message');
        if (analysis) analysis.scrollIntoView({ block: 'start' });
      }
      if (settings.focusComposer && input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      if (settings.focusVersionControl) {
        var versionControl = document.querySelector('[data-initial-thought-header] [data-action="toggle-version-menu"]');
        if (versionControl) versionControl.focus();
      }
    });
  }

  function prefersReducedMotion() {
    return Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function isNearBottom(scroller) {
    if (!scroller) return false;
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
  }

  function scrollToLatest(force) {
    if (state.thoughtEditorOpen) return;
    var scroller = document.getElementById('thread-scroll');
    if (!scroller || (!force && !isNearBottom(scroller))) return;
    scroller.scrollTop = scroller.scrollHeight;
  }

  function collectTextNodes(root) {
    var walker = document.createTreeWalker(root, global.NodeFilter.SHOW_TEXT);
    var nodes = [];
    var node = walker.nextNode();
    while (node) {
      nodes.push({ node: node, text: node.nodeValue, characters: [] });
      node = walker.nextNode();
    }
    return nodes;
  }

  function segmentText(text) {
    if (global.Intl && global.Intl.Segmenter) {
      return Array.from(new global.Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text), function segmentValue(item) {
        return item.segment;
      });
    }
    return Array.from(text);
  }

  function typeMarkdownChunk(chunk, runId, options) {
    var settings = options || {};
    var textNodes = collectTextNodes(chunk);
    var total = 0;
    textNodes.forEach(function prepareNode(item) {
      item.characters = segmentText(item.text);
      total += item.characters.length;
      item.node.nodeValue = '';
    });
    if (!total || prefersReducedMotion()) {
      textNodes.forEach(function restoreNode(item) { item.node.nodeValue = item.text; });
      return Promise.resolve(runId === state.runId);
    }
    var scroller = document.getElementById('thread-scroll');
    var followOutput = isNearBottom(scroller);
    var duration = Math.min(settings.maxDuration || 1800, Math.max(320, total * (settings.msPerCharacter || 10)));
    chunk.classList.add('is-streaming');
    return new Promise(function streamPromise(resolve) {
      var startTime = 0;
      state.streamResolve = resolve;
      function paint(visibleCount) {
        var remaining = visibleCount;
        textNodes.forEach(function paintNode(item) {
          var count = Math.max(0, Math.min(item.characters.length, remaining));
          item.node.nodeValue = item.characters.slice(0, count).join('');
          remaining -= count;
        });
      }
      function frame(timestamp) {
        if (runId !== state.runId) {
          chunk.classList.remove('is-streaming');
          state.streamFrame = null;
          state.streamResolve = null;
          resolve(false);
          return;
        }
        if (!startTime) startTime = timestamp;
        var progress = Math.min(1, (timestamp - startTime) / duration);
        paint(Math.max(1, Math.floor(total * progress)));
        if (followOutput) scrollToLatest(true);
        if (progress < 1) {
          state.streamFrame = global.requestAnimationFrame(frame);
          return;
        }
        paint(total);
        chunk.classList.remove('is-streaming');
        state.streamFrame = null;
        state.streamResolve = null;
        resolve(true);
      }
      state.streamFrame = global.requestAnimationFrame(frame);
    });
  }

  function appendMarkdownChunk(target, markdown, runId, options) {
    if (!target || runId !== state.runId) return Promise.resolve(false);
    var chunk = document.createElement('div');
    chunk.className = 'markdown-chunk';
    chunk.innerHTML = renderMarkdown(markdown);
    target.appendChild(chunk);
    return typeMarkdownChunk(chunk, runId, options);
  }

  function pauseReplay(milliseconds, runId) {
    var duration = prefersReducedMotion() ? Math.min(milliseconds, 80) : milliseconds;
    return new Promise(function pausePromise(resolve) {
      if (runId !== state.runId) {
        resolve(false);
        return;
      }
      state.replayResolve = resolve;
      state.replayTimer = global.setTimeout(function finishPause() {
        state.replayTimer = null;
        state.replayResolve = null;
        resolve(runId === state.runId);
      }, duration);
    });
  }

  function cancelPendingWork() {
    if (state.replayTimer) global.clearTimeout(state.replayTimer);
    state.replayTimer = null;
    if (state.replayResolve) {
      var replayResolve = state.replayResolve;
      state.replayResolve = null;
      replayResolve(false);
    }
    if (state.streamFrame) global.cancelAnimationFrame(state.streamFrame);
    state.streamFrame = null;
    if (state.streamResolve) {
      var streamResolve = state.streamResolve;
      state.streamResolve = null;
      streamResolve(false);
    }
    clearThoughtAttention();
  }

  function stopReplay() {
    cancelPendingWork();
    state.runId += 1;
    state.replaying = false;
  }

  function updateReplayButton() {
    var button = document.querySelector('[data-action="replay-demo"]');
    if (!button) return;
    var copy = button.querySelector('[data-replay-copy]');
    button.disabled = state.replaying;
    if (copy) copy.textContent = state.replaying ? (state.thoughtRevision ? '重新分析中' : '演示进行中') : '重新演示';
    var svg = button.querySelector('svg');
    if (svg) svg.classList.toggle('spin', state.replaying);
  }

  function updateAssistantLabel(kind, copy) {
    var label = document.querySelector('[data-' + kind + '-label-status]');
    if (label) label.textContent = copy;
  }

  function paintAnalysisVersionControl() {
    var control = document.querySelector('[data-version-control]');
    if (!control) return;
    var markup = renderAnalysisVersionControl();
    if (!markup) {
      control.remove();
      return;
    }
    control.outerHTML = markup;
    hydrateIcons(document.querySelector('[data-version-control]'));
  }

  function paintAnalysisDirectionGuide() {
    var guide = document.querySelector('[data-analysis-direction-guide]');
    if (!guide) return;
    guide.outerHTML = renderAnalysisDirectionGuide();
    hydrateIcons(document.querySelector('[data-analysis-direction-guide]'));
  }

  function setAnalysisVersion(nextVersion) {
    if (state.replaying || state.thoughtEditorOpen || !state.versionHistory.length) return;
    var requestedVersion = nextVersion === 'latest' ? 'latest' : String(Number(nextVersion));
    if (requestedVersion !== 'latest' && !state.versionHistory.some(function hasVersion(version) { return String(version.number) === requestedVersion; })) return;
    state.analysisVersion = requestedVersion;
    state.versionMenuOpen = false;
    state.thoughtEditorOpen = false;
    state.thoughtEditorTarget = null;
    state.thoughtEditorOrigin = null;
    if (state.dialog && ['report-preview', 'source-preview', 'search-results'].includes(state.dialog.kind)) {
      state.dialog = null;
      renderDialog();
    }
    renderShell({ focusVersionControl: true });
  }

  function toggleVersionMenu(forceOpen) {
    if (state.replaying || state.thoughtEditorOpen || !state.versionHistory.length) return;
    state.versionMenuOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.versionMenuOpen;
    paintAnalysisVersionControl();
    global.requestAnimationFrame(function focusVersionMenu() {
      var target = state.versionMenuOpen
        ? document.querySelector('.analysis-version-option[aria-checked="true"]')
        : document.querySelector('[data-action="toggle-version-menu"]');
      if (target) target.focus();
    });
  }

  function continueFromLatestAnalysisVersion() {
    var switchedFromHistory = viewingHistoricalVersion();
    state.analysisVersion = 'latest';
    state.versionMenuOpen = false;
    return switchedFromHistory;
  }

  function focusInitialThoughtEditor(origin) {
    state.versionMenuOpen = false;
    if (viewingHistoricalVersion()) return;
    setThoughtEditorOpen(true, scenario.interaction.target, origin);
  }

  function updateStreamStatus(kind, copy, busy) {
    var status = document.querySelector('[data-stream-status="' + kind + '"]');
    var panel = processPanel(kind);
    if (status) {
      status.hidden = true;
      status.classList.remove('is-busy');
      var statusCopy = status.querySelector('[data-stream-status-copy]');
      if (statusCopy) statusCopy.textContent = copy || '';
    }
    if (panel) panel.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function revealAnswerBody(group) {
    var body = document.querySelector('[data-answer-body="' + group + '"]');
    if (!body) return;
    body.hidden = false;
    global.requestAnimationFrame(function animateAnswerBody() { body.classList.add('is-visible'); });
  }

  function paintThoughtSegment(key) {
    var segment = document.querySelector('[data-thought-segment="' + key + '"]');
    var match = String(key || '').match(/^(primary|continuation)-(\d+)$/);
    if (!segment || !match || segment.hidden) return;
    var group = match[1];
    var index = Number(match[2]);
    var editing = key === state.thoughtEditorTarget && state.thoughtEditorOpen;
    var applied = key === activeThoughtRevisionTarget() && Boolean(activeThoughtRevision());
    segment.classList.toggle('is-editing', editing);
    segment.classList.toggle('is-revised', applied);
    segment.innerHTML = renderThoughtSegmentContent(group, thoughtSource(key), index);
    hydrateIcons(segment);
  }

  function paintEditableThoughtSegments() {
    document.querySelectorAll('[data-thought-segment^="primary-"]').forEach(function paintEditable(segment) {
      var key = segment.dataset.thoughtSegment;
      if (segment.hidden || (state.thoughtEditorOpen && key === state.thoughtEditorTarget)) return;
      paintThoughtSegment(key);
    });
  }

  function resizeThoughtTextarea(input) {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.max(input.scrollHeight, 92) + 'px';
  }

  function locateInitialThought(key) {
    global.requestAnimationFrame(function locateRenderedInitialThought() {
      var segment = document.querySelector('[data-thought-segment="' + key + '"]');
      if (!segment) return;
      clearThoughtAttention();
      segment.classList.add('is-guided');
      segment.scrollIntoView({ block: 'start', inline: 'nearest' });
      var input = document.getElementById('thought-inline-input');
      if (input) {
        resizeThoughtTextarea(input);
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      }
      state.thoughtAttentionTimer = global.setTimeout(function removeThoughtAttention() {
        clearThoughtAttention();
      }, 1600);
    });
  }

  function setThoughtEditorOpen(open, key, origin) {
    var previousTarget = state.thoughtEditorTarget;
    var nextTarget = scenario.interaction.target;
    var previousOrigin = state.thoughtEditorOrigin;
    state.thoughtEditorOpen = open;
    state.thoughtEditorTarget = open ? nextTarget : null;
    state.thoughtEditorOrigin = open ? (origin === 'composer' ? 'composer' : 'thought') : null;
    if (open) {
      var appliedAtTarget = nextTarget === activeThoughtRevisionTarget() && Boolean(activeThoughtRevision());
      state.thoughtDraft = appliedAtTarget ? activeThoughtRevision() : thoughtSource(nextTarget);
    }
    if (previousTarget && previousTarget !== nextTarget) paintThoughtSegment(previousTarget);
    paintThoughtSegment(nextTarget);
    paintAnalysisDirectionGuide();
    if (!open) {
      global.requestAnimationFrame(function restoreThoughtEditFocus() {
        var selector = previousOrigin === 'composer'
          ? '[data-analysis-direction-guide] [data-action="adjust-analysis-direction"]'
          : '[data-thought-segment="' + nextTarget + '"] [data-action="adjust-analysis-direction"]';
        var trigger = document.querySelector(selector);
        if (trigger) trigger.focus();
      });
      return;
    }
    if (open) {
      locateInitialThought(nextTarget);
    }
  }

  function clearThoughtAttention() {
    if (state.thoughtAttentionTimer) global.clearTimeout(state.thoughtAttentionTimer);
    state.thoughtAttentionTimer = null;
    document.querySelectorAll('.thought-segment.is-guided').forEach(function clearGuidedThought(segment) {
      segment.classList.remove('is-guided');
    });
  }

  function applyThoughtRevision() {
    var input = document.getElementById('thought-inline-input');
    var text = input ? input.value.trim() : state.thoughtDraft.trim();
    if (!text) {
      showToast('请先写入要修改的思考内容');
      if (input) input.focus();
      return;
    }
    cancelPendingWork();
    state.runId += 1;
    var runId = state.runId;
    var priorThought = activeThoughtRevision() || thoughtSource(state.thoughtEditorTarget || scenario.interaction.target);
    state.versionHistory.push(captureResponseVersion());
    state.versionNumber += 1;
    state.analysisVersion = 'latest';
    state.versionMenuOpen = false;
    state.thoughtRevision = text;
    state.thoughtBaseText = priorThought || scenario.interaction.originalText;
    state.currentOutcome = createRevisionOutcome(text, state.versionNumber);
    state.thoughtDraft = text;
    state.thoughtRevisionTarget = state.thoughtEditorTarget || scenario.interaction.target;
    state.thoughtEditorOpen = false;
    state.thoughtEditorTarget = null;
    state.thoughtEditorOrigin = null;
    state.stage = 0;
    state.replaying = true;
    if (state.dialog && ['report-preview', 'source-preview', 'search-results'].includes(state.dialog.kind)) {
      state.dialog = null;
      renderDialog();
    }
    renderShell({ focusAnalysis: true });
    updateReplayButton();
    runRevisedReplay(runId);
  }

  function updateComposer(options) {
    var settings = options || {};
    var shell = document.querySelector('.composer-shell');
    var input = document.getElementById('composer-input');
    if (shell) shell.classList.toggle('awaiting-input', Boolean(state.waitingFor));
    if (input) {
      input.value = state.composerDraft;
      resizeComposerTextarea(input);
      if (settings.focus) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
    paintComposerModeToggle('toggle-web-search', Boolean(state.webSearchEnabled), '联网搜索');
    paintComposerModeToggle('toggle-deep-thinking', Boolean(state.deepThinkingEnabled), '思维链');
    paintUploadButton();
  }

  function paintComposerModeToggle(action, enabled, label) {
    var control = document.querySelector('[data-action="' + action + '"]');
    if (!control) return;
    var actionLabel = (enabled ? '关闭' : '开启') + label;
    control.classList.toggle('is-active', enabled);
    control.setAttribute('aria-pressed', String(enabled));
    control.setAttribute('aria-label', actionLabel);
    control.setAttribute('title', actionLabel);
  }

  function setWebSearchEnabled(enabled) {
    state.webSearchEnabled = Boolean(enabled);
    paintComposerModeToggle('toggle-web-search', state.webSearchEnabled, '联网搜索');
  }

  function setDeepThinkingEnabled(enabled) {
    state.deepThinkingEnabled = Boolean(enabled);
    paintComposerModeToggle('toggle-deep-thinking', state.deepThinkingEnabled, '思维链');
  }

  function paintUploadButton() {
    var control = document.querySelector('[data-action="attach-file"]');
    if (!control) return;
    var count = state.pendingFiles.length;
    var label = count ? '已添加 ' + count + ' 个文件，继续添加' : '上传文件';
    control.classList.toggle('has-value', count > 0);
    control.setAttribute('aria-label', label);
    control.setAttribute('title', label);
    var countNode = control.querySelector('.composer-upload-count');
    if (count && !countNode) {
      control.insertAdjacentHTML('beforeend', '<span class="composer-upload-count" aria-hidden="true">' + count + '</span>');
    } else if (countNode) {
      if (count) countNode.textContent = String(count);
      else countNode.remove();
    }
  }

  function updatePendingFiles() {
    var container = document.getElementById('pending-attachments');
    if (!container) return;
    container.innerHTML = renderPendingFileItems();
    container.hidden = state.pendingFiles.length === 0;
    hydrateIcons(container);
    paintUploadButton();
  }

  function processPanel(group) {
    return document.querySelector('[data-process-panel="' + group + '"]');
  }

  function executionRow(group, id) {
    return document.querySelector('[data-execution-group="' + group + '"][data-execution-id="' + id + '"]');
  }

  function showProcessPanel(group) {
    var panel = processPanel(group);
    if (!panel) return;
    panel.hidden = false;
    panel.classList.add('is-visible');
  }

  function showPlanPanel() {
    var plan = document.querySelector('[data-plan-panel]');
    if (plan) plan.hidden = false;
  }

  async function revealThoughtSegment(group, index, runId) {
    var segment = document.querySelector('[data-thought-segment="' + group + '-' + index + '"]');
    var content = thoughtSource(thoughtKey(group, index));
    if (!segment || !content || runId !== state.runId) return false;
    segment.innerHTML = '';
    segment.hidden = false;
    global.requestAnimationFrame(function animateThoughtSegment() { segment.classList.add('is-visible'); });
    segment.setAttribute('aria-busy', 'true');
    var completed = await appendMarkdownChunk(segment, content, runId, { maxDuration: 2400 });
    segment.setAttribute('aria-busy', 'false');
    return completed;
  }

  async function revealRevisedInitialThought(runId) {
    var key = scenario.interaction.target;
    var segment = document.querySelector('[data-thought-segment="' + key + '"]');
    if (!segment || runId !== state.runId) return false;
    segment.hidden = false;
    segment.classList.add('is-visible', 'is-revised');
    segment.innerHTML = renderThoughtSegmentContent('primary', scenario.analysisRun.thoughtSegments[0], 0);
    segment.setAttribute('aria-busy', 'false');
    hydrateIcons(segment);
    scrollToLatest(false);
    return pauseReplay(420, runId);
  }

  function resetExecutionGroup(group) {
    var panel = processPanel(group);
    if (!panel) return;
    panel.classList.remove('is-visible');
    panel.hidden = true;
    panel.querySelectorAll('[data-thought-segment]').forEach(function resetThoughtSegment(segment) {
      segment.hidden = true;
      segment.innerHTML = '';
      segment.classList.remove('is-visible');
      segment.setAttribute('aria-busy', 'false');
    });
    var plan = panel.querySelector('[data-plan-panel]');
    if (plan) plan.hidden = true;
    panel.querySelectorAll('.execution-row').forEach(function resetRow(row) {
      row.hidden = true;
      row.classList.remove('running', 'done', 'is-revealed');
      row.classList.add('pending');
      if (row.matches('[data-action="open-search-results"]')) row.disabled = true;
      var live = row.querySelector('[data-execution-live]');
      var stateCopy = row.querySelector('[data-execution-state-copy]');
      if (live) {
        live.textContent = '';
        live.hidden = true;
        live.classList.remove('is-updating');
      }
      if (stateCopy) stateCopy.textContent = '待执行';
    });
  }

  function resetExecutionPanels() {
    resetExecutionGroup('primary');
    resetExecutionGroup('continuation');
    updatePlanProgress(1, 'pending');
  }

  function updatePlanProgress(activeStep, mode) {
    var panel = processPanel('primary');
    if (!panel) return;
    var planItems = activePlan();
    var planMode = mode || 'running';
    var doneCount = 0;
    panel.querySelectorAll('[data-plan-step]').forEach(function updatePlanItem(item) {
      var step = Number(item.dataset.planStep);
      var nextState = 'pending';
      if (planMode === 'complete') nextState = 'done';
      else if (planMode === 'waiting') nextState = step < activeStep ? 'done' : step === activeStep ? 'waiting' : 'pending';
      else if (planMode === 'pending') nextState = 'pending';
      else nextState = step < activeStep ? 'done' : step === activeStep ? 'active' : 'pending';
      item.classList.remove('pending', 'active', 'waiting', 'done');
      item.classList.add(nextState);
      if (nextState === 'done') doneCount += 1;
    });
    var summary = panel.querySelector('[data-plan-summary]');
    if (planMode === 'complete') {
      if (summary) summary.textContent = planItems.length + ' / ' + planItems.length + ' 已完成';
      return;
    }
    if (summary) summary.textContent = planMode === 'pending' ? '等待开始' : doneCount + ' / ' + planItems.length + ' 已完成';
  }

  function setExecutionRowState(group, item, nextState) {
    var row = executionRow(group, item.id);
    if (!row) return;
    row.hidden = nextState === 'pending';
    row.classList.remove('pending', 'running', 'done');
    row.classList.add(nextState);
    if (nextState !== 'pending') row.classList.add('is-revealed');
    var live = row.querySelector('[data-execution-live]');
    var stateCopy = row.querySelector('[data-execution-state-copy]');
    if (live) live.hidden = nextState !== 'running';
    if (stateCopy) stateCopy.textContent = nextState === 'done' ? '已完成' : nextState === 'running' ? '执行中' : '待执行';
    if (row.matches('[data-action="open-search-results"]')) row.disabled = nextState !== 'done';
  }

  function updateExecutionDetail(group, item, text) {
    var row = executionRow(group, item.id);
    var live = row && row.querySelector('[data-execution-live]');
    if (!live) return;
    live.classList.add('is-updating');
    live.textContent = text;
    global.requestAnimationFrame(function revealExecutionDetail() {
      live.classList.remove('is-updating');
    });
  }

  async function runExecutionItem(group, item, runId) {
    if (runId !== state.runId) return false;
    showProcessPanel(group);
    setExecutionRowState(group, item, 'running');
    var progress = item.progress || [];
    for (var index = 0; index < progress.length; index += 1) {
      updateExecutionDetail(group, item, progress[index]);
      scrollToLatest(false);
      if (!await pauseReplay(260, runId)) return false;
    }
    setExecutionRowState(group, item, 'done');
    scrollToLatest(false);
    return pauseReplay(180, runId);
  }

  async function runInitialReplay(runId) {
    resetExecutionPanels();
    updateAssistantLabel('primary', '深度分析中');
    updateStreamStatus('primary', '正在理解问题并梳理分析目标…', true);
    showProcessPanel('primary');
    if (!await pauseReplay(260, runId)) return;
    state.stage = 1;
    if (!await revealThoughtSegment('primary', 0, runId)) return;
    state.stage = 2;
    showPlanPanel();
    updatePlanProgress(1, 'running');
    updateStreamStatus('primary', '', false);
    if (!await pauseReplay(220, runId)) return;
    if (!await revealThoughtSegment('primary', 1, runId)) return;
    for (var index = 0; index < primaryCapabilities.length; index += 1) {
      var capability = primaryCapabilities[index];
      state.stage = capability.stage;
      updatePlanProgress(capability.planStep, 'running');
      if (!await runExecutionItem('primary', capability, runId)) return;
      if (!await revealThoughtSegment('primary', index + 2, runId)) return;
    }
    updatePlanProgress(scenario.plan.length, 'complete');
    state.stage = scenario.interaction.stage;
    state.thoughtEditorOpen = false;
    state.thoughtEditorTarget = null;
    state.thoughtEditorOrigin = null;
    paintEditableThoughtSegments();
    paintAnalysisDirectionGuide();
    updateAssistantLabel('primary', '正文生成中');
    updateStreamStatus('primary', '', false);
    updateReplayButton();
    scrollToLatest(true);
    await runContinuationReplay(runId);
  }

  async function runRevisedReplay(runId) {
    var items = revisedCapabilities();
    resetExecutionPanels();
    updateAssistantLabel('primary', '重新分析中');
    updateStreamStatus('primary', '正在根据初始思考重新规划分析路径…', true);
    showProcessPanel('primary');
    if (!await pauseReplay(260, runId)) return;
    state.stage = 1;
    if (!await revealRevisedInitialThought(runId)) return;
    state.stage = 2;
    showPlanPanel();
    updatePlanProgress(1, 'running');
    updateStreamStatus('primary', '', false);
    if (!await pauseReplay(220, runId)) return;
    if (!await revealThoughtSegment('primary', 1, runId)) return;
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      state.stage = item.stage;
      updatePlanProgress(item.planStep, 'running');
      if (!await runExecutionItem('primary', item, runId)) return;
      if (!await revealThoughtSegment('primary', index + 2, runId)) return;
    }
    updatePlanProgress(activePlan().length, 'complete');
    state.stage = scenario.interaction.stage;
    updateStreamStatus('primary', '', false);
    paintEditableThoughtSegments();
    paintAnalysisDirectionGuide();
    updateAssistantLabel('primary', '正文生成中');
    scrollToLatest(true);
    await runContinuationReplay(runId);
  }

  async function runContinuationReplay(runId) {
    var resultTarget = document.getElementById('final-result-markdown');
    if (!resultTarget) return;
    resultTarget.innerHTML = '';
    updateAssistantLabel('primary', state.thoughtRevision ? '根据修订生成正文中' : '正文生成中');
    revealAnswerBody('result');
    resultTarget.setAttribute('aria-busy', 'true');
    if (!await appendMarkdownChunk(resultTarget, resultSummaryMarkdown(), runId, { maxDuration: 2800 })) return;
    if (!await appendMarkdownChunk(resultTarget, resultPremisesMarkdown(), runId, { maxDuration: 2800 })) return;
    if (!await appendMarkdownChunk(resultTarget, resultMetricsMarkdown(), runId, { maxDuration: 2400 })) return;
    if (!await appendMarkdownChunk(resultTarget, resultPathsMarkdown(), runId, { maxDuration: 3600 })) return;
    if (!await appendMarkdownChunk(resultTarget, resultActionsMarkdown(), runId, { maxDuration: 2600 })) return;
    resultTarget.setAttribute('aria-busy', 'false');
    state.stage = scenario.result.stage;
    state.replaying = false;
    state.versionMenuOpen = false;
    paintAnalysisDirectionGuide();
    paintEditableThoughtSegments();
    updatePlanProgress(activePlan().length, 'complete');
    var sourceSlot = document.querySelector('[data-source-index-slot]');
    if (sourceSlot) {
      sourceSlot.innerHTML = renderSourceIndex();
      sourceSlot.hidden = false;
      hydrateIcons(sourceSlot);
    }
    var reportSlot = document.querySelector('[data-report-slot]');
    if (reportSlot) {
      reportSlot.innerHTML = renderDocuments();
      reportSlot.hidden = false;
      hydrateIcons(reportSlot);
    }
    updateAssistantLabel('primary', '已完成');
    updateReplayButton();
    scrollToLatest(true);
    showToast('分析与报告已生成');
  }

  function startReplay() {
    stopReplay();
    state.dialog = null;
    renderDialog();
    state.view = 'chat';
    state.activeSessionId = scenario.id;
    state.stage = 0;
    state.replaying = true;
    state.waitingFor = null;
    state.composerDraft = '';
    state.webSearchEnabled = false;
    state.deepThinkingEnabled = false;
    state.thoughtRevision = '';
    state.thoughtDraft = scenario.interaction.originalText;
    state.thoughtRevisionTarget = scenario.interaction.target;
    state.thoughtBaseText = scenario.interaction.originalText;
    state.thoughtEditorOpen = false;
    state.thoughtEditorTarget = null;
    state.thoughtEditorOrigin = null;
    state.analysisVersion = 'latest';
    state.versionNumber = 1;
    state.versionHistory = [];
    state.currentOutcome = null;
    state.versionMenuOpen = false;
    renderShell();
    runInitialReplay(state.runId);
  }

  function selectSession(id, focusComposer) {
    stopReplay();
    closeSessionMenu();
    state.dialog = null;
    renderDialog();
    state.view = 'chat';
    state.activeSessionId = id;
    state.customMessages = id === homeSession.id ? [] : (state.sessionMessages[id] || (state.sessionMessages[id] = []));
    state.pendingFiles = [];
    state.stage = scenario.result.stage;
    state.waitingFor = null;
    state.composerDraft = '';
    state.webSearchEnabled = false;
    state.deepThinkingEnabled = false;
    state.thoughtRevision = '';
    state.thoughtDraft = scenario.interaction.originalText;
    state.thoughtRevisionTarget = scenario.interaction.target;
    state.thoughtBaseText = scenario.interaction.originalText;
    state.thoughtEditorOpen = false;
    state.thoughtEditorTarget = null;
    state.thoughtEditorOrigin = null;
    state.analysisVersion = 'latest';
    state.versionNumber = 1;
    state.versionHistory = [];
    state.currentOutcome = null;
    state.versionMenuOpen = false;
    renderShell({ focusComposer: Boolean(focusComposer) });
  }

  function newChat() {
    selectSession(homeSession.id, true);
  }

  function fileType(name) {
    var extension = name.split('.').pop().toLowerCase();
    if (extension === 'pdf') return 'pdf';
    if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') return 'xlsx';
    return 'file';
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function appendMessageHtml(html) {
    var thread = document.querySelector('.thread');
    if (!thread) return null;
    var template = document.createElement('template');
    template.innerHTML = html.trim();
    var message = template.content.firstElementChild;
    thread.appendChild(message);
    hydrateIcons(message);
    scrollToLatest(true);
    return message;
  }

  function patchActiveSessionCopy(session) {
    var button = document.querySelector('[data-session-id="' + session.id + '"]');
    if (!button) return;
    var title = button.querySelector('.session-title');
    if (title) title.textContent = session.title;
    var heading = document.querySelector('.conversation-heading strong');
    if (heading) heading.textContent = session.title;
  }

  function sendMessage() {
    var input = document.getElementById('composer-input');
    var text = input ? input.value.trim() : '';
    if (!text && !state.pendingFiles.length) {
      showToast('请输入问题或上传文件');
      if (input) input.focus();
      return;
    }
    var files = state.pendingFiles.map(function copyFile(file) { return Object.assign({}, file); });
    var webSearchRequested = Boolean(state.webSearchEnabled);
    var deepThinkingRequested = Boolean(state.deepThinkingEnabled);
    var switchedFromHistory = continueFromLatestAnalysisVersion();
    var wasEmptyChat = isEmptyChat();
    if (wasEmptyChat) {
      var newId = 'session-' + Date.now() + '-' + (++sessionSequence);
      state.customSessions.unshift({ id: newId, title: (text || (files[0] && files[0].name) || '新对话').slice(0, 18) });
      state.activeSessionId = newId;
      state.customMessages = [];
      state.sessionMessages[newId] = state.customMessages;
    }
    var userMessage = { role: 'user', text: text || '请分析这些文件。', files: files, webSearch: webSearchRequested, deepThinking: deepThinkingRequested };
    state.customMessages.push(userMessage);
    state.pendingFiles = [];
    state.composerDraft = '';
    state.webSearchEnabled = false;
    state.deepThinkingEnabled = false;
    var session = activeSession();
    if (wasEmptyChat || switchedFromHistory) {
      renderShell({ scrollToBottom: true, focusComposer: true });
    } else {
      appendMessageHtml(renderCustomMessage(userMessage));
      updatePendingFiles();
      updateComposer();
      patchActiveSessionCopy(session);
    }
    global.setTimeout(function simulatedReply() {
      if (!findSession(session.id)) return;
      var reply = webSearchRequested && deepThinkingRequested
        ? '已收到补充内容。在真实接入中，我会先深度梳理问题与证据缺口，并通过联网搜索核验最新公开信息后完成分析。'
        : webSearchRequested
        ? '已收到补充内容。在真实接入中，我会先通过联网搜索核验最新公开信息，再结合当前会话资料完成分析。'
        : deepThinkingRequested
        ? '已收到补充内容。在真实接入中，我会开启思维链，完整梳理判断链与不确定性，再形成分析结果。'
        : '已收到补充内容。在真实接入中，我会把它并入当前会话上下文，重新判断是否需要调整分析思路或更新后续计划。';
      var replies = state.sessionMessages[session.id];
      if (!replies) return;
      replies.push({ role: 'assistant', text: reply });
      if (state.view !== 'chat' || state.activeSessionId !== session.id) return;
      var message = appendMessageHtml('<article class="message assistant-message"><span class="avatar assistant">' + icon('sparkles', 17) + '</span><div class="assistant-content"><div class="assistant-label">数据智能分析</div><div class="markdown-body" data-custom-stream></div></div></article>');
      var target = message && message.querySelector('[data-custom-stream]');
      if (target) appendMarkdownChunk(target, reply, state.runId, { maxDuration: 1600 });
    }, 500);
  }

  function reportBody() {
    return '<div class="markdown-body report-markdown">' + renderMarkdown(reportMarkdown(), { citationMode: 'document' }) + renderReportReferences() + '</div>';
  }

  function openDocument(documentId) {
    var documentItem = activeResult().documents.find(function item(value) { return value.id === documentId; });
    state.dialog = { kind: 'report-preview', title: documentItem ? documentItem.name : '铜采购签约决策分析报告', body: reportBody() };
    renderDialog();
  }

  function renderSourceFilePreview(source, showHeading) {
    var excerpt = escapeHtml(source.excerpt || '');
    var url = safeReferenceUrl(source.url);
    var preview = '';

    if (source.id === 'bid-notice') {
      preview = '<div class="source-document-page"><p class="source-document-eyebrow">中标结果</p><h5>首批供货与中标价</h5><p><mark>' + excerpt + '</mark></p><p>具体供货与签约条件以合同定稿为准。</p></div>';
    } else if (source.id === 'bid-terms') {
      preview = '<div class="source-document-page"><p class="source-document-eyebrow">2.1 签约与违约</p><h5>签约期限与违约责任</h5><p><mark>' + excerpt + '</mark></p><p>履约安排以双方最终签署的合同条款为准。</p></div>';
    } else if (source.id === 'position-ledger') {
      preview = '<div class="source-sheet-wrap"><table class="source-sheet" aria-label="CU2401 持仓明细"><thead><tr><th>合约</th><th>方向</th><th>手数</th><th>均价</th><th>当前价</th><th>对应吨数</th><th>浮盈</th></tr></thead><tbody><tr class="is-source-row"><td>CU2401</td><td>多头</td><td>400</td><td>68,440</td><td>68,500</td><td>2,000</td><td>12 万元</td></tr></tbody></table></div>';
    } else if (source.id === 'spot-quotes') {
      preview = '<div class="source-sheet-wrap"><table class="source-sheet" aria-label="华东现货报价汇总"><thead><tr><th>区域</th><th>有效报盘</th><th>指定规格</th><th>可交付库存</th></tr></thead><tbody><tr class="is-source-row"><td>华东</td><td>&gt; 69,500</td><td>部分断档</td><td>需逐笔确认</td></tr></tbody></table></div>';
    } else if (source.id === 'internal-rules') {
      preview = '<div class="source-document-page"><p class="source-document-eyebrow">4.2 套保头寸调整</p><p><mark>' + excerpt + '</mark></p><p class="source-document-eyebrow">7.1 交割审批</p><p>申请交割前，应完成交割品资格、仓库和资金审批。</p></div>';
    } else if (source.id === 'market-signal') {
      preview = '<div class="source-web-document">' + (url ? '<a class="source-preview-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(url) + icon('external-link', 13) + '</a>' : '') + '<h5>华东现货与仓单观察</h5><p><mark>' + excerpt + '</mark></p><p>品牌、仓库与交割时点仍需以可成交询价核验。</p></div>';
    } else {
      preview = '<div class="source-document-page"><p><mark>' + excerpt + '</mark></p></div>';
    }

    var heading = showHeading ? '<h4 id="source-original-title">原文预览</h4>' : '';
    var accessibleLabel = showHeading ? ' aria-labelledby="source-original-title"' : ' aria-label="原文预览"';
    return '<section class="source-original"' + accessibleLabel + '>' + heading + '<article class="source-original-preview source-original-preview--' + escapeHtml(source.kind) + '" data-source-preview>' + preview + '</article></section>';
  }

  function renderSourceDetail(source) {
    var hasChunk = source.kind === 'rag' || source.kind === 'web';
    var chunk = hasChunk
      ? '<section class="source-chunk" data-source-chunk aria-labelledby="source-chunk-title"><h4 id="source-chunk-title">召回片段</h4><blockquote>' + escapeHtml(source.excerpt) + '</blockquote></section>'
      : '';
    return '<div class="source-detail">' + chunk + renderSourceFilePreview(source, hasChunk) + '</div>';
  }

  function openSource(sourceId) {
    var source = sourceById(sourceId);
    if (!source) return;
    var meta = sourceKindMeta(source);
    state.dialog = {
      kind: 'source-preview',
      sourceId: source.id,
      title: source.title,
      sourceKind: meta.label,
      sourceIcon: meta.icon,
      body: renderSourceDetail(source)
    };
    renderDialog();
  }

  function renderSearchResults(capability) {
    var results = capability.searchResults || [];
    var resultRows = results.map(function renderSearchResult(result) {
      var url = safeReferenceUrl(result.url);
      var title = escapeHtml(result.title || result.url || '搜索结果');
      var rawSnippet = String(result.snippet || '暂无摘要').trim();
      var snippet = rawSnippet.length > 26 ? rawSnippet.slice(0, 26).trim() + '…' : rawSnippet;
      var copy = '<span class="search-result-title-line"><span class="search-result-icon" aria-hidden="true">' + icon('globe-2', 17) + '</span><strong>' + title + '</strong></span><span class="search-result-snippet">' + escapeHtml(snippet) + '</span>';
      return '<li data-search-result>' + (url ? '<a class="search-result-row" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + copy + '</a>' : '<div class="search-result-row">' + copy + '</div>') + '</li>';
    }).join('');
    return '<div class="search-results-summary"><span class="search-results-dot" aria-hidden="true"></span><strong>已识别到 ' + results.length + ' 个相关结果</strong></div><ol class="search-results-list">' + resultRows + '</ol>';
  }

  function openSearchResults(capabilityId) {
    var capability = activeCapabilityById(capabilityId);
    if (!capability || capability.id !== 'web') return;
    state.dialog = {
      kind: 'search-results',
      title: '检索 ' + (capability.searchQuery || '外部市场信息'),
      eyebrow: '检索结果',
      body: renderSearchResults(capability)
    };
    renderDialog();
  }

  function requestLogout() {
    setUserMenuOpen(false, true);
    state.dialog = {
      kind: 'confirm-logout',
      title: '退出登录',
      body: '<p class="confirm-dialog-copy">确认退出当前账户？</p><p class="confirm-dialog-copy">当前为演示模式，退出操作不会结束本地会话。</p>'
    };
    renderDialog();
  }

  function renderDialog() {
    var reportPreview = Boolean(state.dialog && state.dialog.kind === 'report-preview');
    var sourcePreview = Boolean(state.dialog && state.dialog.kind === 'source-preview');
    var searchResults = Boolean(state.dialog && state.dialog.kind === 'search-results');
    var conversationSearch = Boolean(state.dialog && state.dialog.kind === 'conversation-search');
    document.body.classList.toggle('has-report-preview', reportPreview);
    document.body.classList.toggle('has-source-preview', sourcePreview || searchResults);
    if (!state.dialog) {
      dialogRoot.innerHTML = '';
      if (dialogReturnFocus && dialogReturnFocus.isConnected) dialogReturnFocus.focus();
      dialogReturnFocus = null;
      return;
    }
    if (!dialogRoot.querySelector('[role="dialog"]')) dialogReturnFocus = document.activeElement;
    var confirmLogout = state.dialog.kind === 'confirm-logout';
    var confirmSessionDelete = state.dialog.kind === 'confirm-session-delete';
    var renameSession = state.dialog.kind === 'rename-session';
    var apiKeyCreate = state.dialog.kind === 'api-key-create';
    var apiKeySecret = state.dialog.kind === 'api-key-secret';
    var apiKeyDetail = state.dialog.kind === 'api-key-detail';
    var confirmApiKeyDelete = state.dialog.kind === 'confirm-api-key-delete';
    var apiKeyDialog = apiKeyCreate || apiKeySecret || apiKeyDetail || confirmApiKeyDelete;
    var footer = apiKeyCreate
      ? '<button class="button" type="button" data-action="close-dialog">取消</button><button class="button primary" type="button" data-action="confirm-create-agent-api-key">创建</button>'
      : apiKeySecret
      ? '<button class="button primary" type="button" data-action="complete-agent-api-secret" disabled aria-disabled="true">完成</button>'
      : apiKeyDetail
      ? '<button class="button primary" type="button" data-action="close-dialog">完成</button>'
      : confirmApiKeyDelete
      ? '<button class="button" type="button" data-action="close-dialog">取消</button><button class="button danger" type="button" data-action="confirm-delete-agent-api-key">删除</button>'
      : renameSession
      ? '<button class="button" type="button" data-action="close-dialog">取消</button><button class="button primary" type="button" data-action="confirm-rename-session">保存</button>'
      : confirmSessionDelete
      ? '<button class="button" type="button" data-action="close-dialog">取消</button><button class="button danger" type="button" data-action="confirm-delete-session">删除</button>'
      : confirmLogout
      ? '<button class="button" type="button" data-action="close-dialog">取消</button><button class="button primary" type="button" data-action="confirm-logout">确认退出</button>'
      : '';
    var closeAction = state.dialog.dismissible === false ? '' : '<button class="icon-button" type="button" data-action="close-dialog" aria-label="关闭">' + icon('x', 19) + '</button>';
    var headerActions = reportPreview
      ? '<div class="report-drawer__actions"><button class="button" type="button" data-action="export-report">' + icon('download', 15) + '下载报告</button>' + closeAction + '</div>'
      : closeAction;
    if (reportPreview || sourcePreview || searchResults) {
      var drawerClass = sourcePreview ? ' source-drawer' : searchResults ? ' search-results-drawer' : '';
      var bodyLabel = sourcePreview ? '来源文件内容' : searchResults ? '检索结果列表' : '报告内容';
      var titleMarkup = sourcePreview
        ? '<div class="drawer-file-heading"><h2 id="dialog-title">' + escapeHtml(state.dialog.title) + '</h2><span class="source-kind">' + icon(state.dialog.sourceIcon || 'file-text', 13) + escapeHtml(state.dialog.sourceKind || '来源') + '</span></div>'
        : searchResults
        ? '<div class="drawer-search-heading"><span>' + escapeHtml(state.dialog.eyebrow || '检索结果') + '</span><h2 id="dialog-title">' + escapeHtml(state.dialog.title) + '</h2></div>'
        : '<h2 id="dialog-title">' + escapeHtml(state.dialog.title) + '</h2>';
      dialogRoot.innerHTML = '<aside class="dialog report-drawer' + drawerClass + '" role="dialog" aria-modal="false" aria-labelledby="dialog-title"><header class="dialog-header">' + titleMarkup + headerActions + '</header><div class="dialog-body" tabindex="0" aria-label="' + bodyLabel + '">' + state.dialog.body + '</div></aside>';
    } else if (conversationSearch) {
      dialogRoot.innerHTML = '<div class="dialog-backdrop" data-action="close-dialog" role="presentation"><section class="dialog dialog--conversation-search" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog-header"><h2 id="dialog-title">' + escapeHtml(state.dialog.title) + '</h2>' + closeAction + '</header><div class="dialog-body">' + renderConversationSearchBody(state.dialog.query || '') + '</div></section></div>';
    } else {
      dialogRoot.innerHTML = '<div class="dialog-backdrop" data-action="close-dialog" role="presentation"><section class="dialog dialog--confirm' + (apiKeyDialog ? ' dialog--api-key' : '') + '" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog-header"><h2 id="dialog-title">' + escapeHtml(state.dialog.title) + '</h2>' + headerActions + '</header><div class="dialog-body">' + state.dialog.body + '</div><footer class="dialog-footer">' + footer + '</footer></section></div>';
    }
    hydrateIcons(dialogRoot);
    var closeButton = dialogRoot.querySelector('.dialog-header .icon-button');
    if (closeButton) closeButton.focus();
    else {
      var firstField = dialogRoot.querySelector('input:not([disabled]), button:not([disabled])');
      if (firstField) firstField.focus();
    }
  }

  function showToast(message) {
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastRoot.appendChild(toast);
    global.setTimeout(function removeToast() { toast.remove(); }, 2600);
  }

  function exportReport() {
    showToast('报告下载已开始（演示）');
  }

  function locateReportReference(link) {
    var href = link.getAttribute('href') || '';
    if (!href.startsWith('#report-reference-')) return;
    var target = dialogRoot.querySelector(href);
    if (!target) return;
    if (reportReferenceHighlightTimer) global.clearTimeout(reportReferenceHighlightTimer);
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
    target.classList.add('is-located');
    reportReferenceHighlightTimer = global.setTimeout(function clearReportReferenceHighlight() {
      target.classList.remove('is-located');
      reportReferenceHighlightTimer = null;
    }, 1800);
  }

  function setUserMenuOpen(open, restoreFocus) {
    var menu = document.querySelector('[data-user-account-menu]');
    if (!menu) return;
    var trigger = menu.querySelector('[data-action="user-menu"]');
    trigger.setAttribute('aria-expanded', String(open));
    menu.querySelector('.user-account-popover').hidden = !open;
    if (restoreFocus) trigger.focus();
  }

  document.addEventListener('click', function handleClick(event) {
    if (!event.target.closest('[data-user-account-menu]')) setUserMenuOpen(false);
    if (!event.target.closest('#session-menu-root, [data-action="session-menu"]')) closeSessionMenu();
    if (state.versionMenuOpen && !event.target.closest('[data-version-control]')) {
      state.versionMenuOpen = false;
      paintAnalysisVersionControl();
    }
    var reportCitation = event.target.closest('.report-citation');
    if (reportCitation) {
      event.preventDefault();
      locateReportReference(reportCitation);
      return;
    }
    var control = event.target.closest('[data-action]');
    if (!control) return;
    var action = control.dataset.action;
    if (action === 'session-menu') { openSessionMenu(control.dataset.sessionId, control); return; }
    if (action === 'pin-session') {
      var session = findSession(sessionMenuId);
      if (!session) return;
      session.pinned = !session.pinned;
      refreshSessionSidebar(session.id);
      return;
    }
    if (action === 'rename-session') { requestRenameSession(findSession(sessionMenuId)); return; }
    if (action === 'delete-session') { requestDeleteSession(findSession(sessionMenuId)); return; }
    if (action === 'confirm-rename-session') { confirmRenameSession(); return; }
    if (action === 'confirm-delete-session') { confirmDeleteSession(); return; }
    if (action === 'user-menu') {
      setUserMenuOpen(control.getAttribute('aria-expanded') !== 'true');
      return;
    }
    if (action === 'logout') {
      requestLogout();
      return;
    }
    if (action === 'confirm-logout') {
      state.dialog = null;
      renderDialog();
      showToast('演示模式未接入登录，当前会话保持不变');
      return;
    }
    if (action === 'create-agent-api-key') {
      requestCreateAgentApiKey();
      return;
    }
    if (action === 'confirm-create-agent-api-key') {
      confirmCreateAgentApiKey();
      return;
    }
    if (action === 'copy-agent-api-secret') {
      copyAgentApiSecret();
      return;
    }
    if (action === 'complete-agent-api-secret') {
      completeAgentApiSecret();
      return;
    }
    if (action === 'view-agent-api-key') {
      requestAgentApiKeyDetail(findAgentApiKey(control.dataset.apiKeyId));
      return;
    }
    if (action === 'delete-agent-api-key') {
      requestAgentApiKeyDelete(findAgentApiKey(control.dataset.apiKeyId));
      return;
    }
    if (action === 'confirm-delete-agent-api-key') {
      confirmAgentApiKeyDelete();
      return;
    }
    if (action === 'new-chat') {
      event.preventDefault();
      newChat();
      return;
    }
    if (action === 'search-sessions') {
      requestSearchSessions();
      return;
    }
    if (action === 'select-search-session') {
      var searchSession = findSession(control.dataset.sessionId);
      if (searchSession) selectSession(searchSession.id, true);
      return;
    }
    if (action === 'select-session') {
      if (findSession(control.dataset.sessionId)) selectSession(control.dataset.sessionId);
      return;
    }
    if (action === 'replay-demo') {
      startReplay();
      return;
    }
    if (action === 'adjust-analysis-direction') {
      focusInitialThoughtEditor(control.dataset.editOrigin);
      return;
    }
    if (action === 'toggle-version-menu') {
      toggleVersionMenu();
      return;
    }
    if (action === 'select-analysis-version') {
      setAnalysisVersion(control.dataset.version);
      return;
    }
    if (action === 'cancel-thought-edit') {
      setThoughtEditorOpen(false);
      return;
    }
    if (action === 'apply-thought-edit') {
      applyThoughtRevision();
      return;
    }
    if (action === 'attach-file') {
      var fileInput = document.getElementById('file-input');
      if (fileInput) fileInput.click();
      return;
    }
    if (action === 'toggle-web-search') {
      setWebSearchEnabled(!state.webSearchEnabled);
      return;
    }
    if (action === 'toggle-deep-thinking') {
      setDeepThinkingEnabled(!state.deepThinkingEnabled);
      return;
    }
    if (action === 'remove-pending-file') {
      state.pendingFiles.splice(Number(control.dataset.fileIndex), 1);
      updatePendingFiles();
      return;
    }
    if (action === 'send-message') {
      sendMessage();
      return;
    }
    if (action === 'open-document') {
      openDocument(control.dataset.documentId);
      return;
    }
    if (action === 'open-source') {
      openSource(control.dataset.sourceId);
      return;
    }
    if (action === 'open-search-results') {
      openSearchResults(control.dataset.executionId);
      return;
    }
    if (action === 'close-dialog') {
      var requestedClose = event.target === control || control.closest('.dialog-header') || control.closest('.dialog-footer');
      if (requestedClose && state.dialog && state.dialog.dismissible === false) {
        showToast('请先复制并安全保存密钥');
        return;
      }
      if (requestedClose) {
        state.dialog = null;
        renderDialog();
      }
      return;
    }
    if (action === 'export-report') {
      exportReport();
      return;
    }
  });

  document.addEventListener('focusin', function handleAccountFocus(event) {
    if (!event.target.closest('[data-user-account-menu]')) setUserMenuOpen(false);
    if (!event.target.closest('#session-menu-root, [data-action="session-menu"]')) closeSessionMenu();
    if (state.versionMenuOpen && !event.target.closest('[data-version-control]')) {
      state.versionMenuOpen = false;
      paintAnalysisVersionControl();
    }
  });

  document.addEventListener('change', function handleChange(event) {
    if (event.target.id !== 'file-input') return;
    var files = Array.from(event.target.files || []);
    state.pendingFiles.push.apply(state.pendingFiles, files.map(function normalizeFile(file) {
      return { name: file.name, size: formatFileSize(file.size), type: fileType(file.name) };
    }));
    event.target.value = '';
    updatePendingFiles();
  });

  document.addEventListener('input', function handleInput(event) {
    if (event.target.id === 'thought-inline-input') {
      state.thoughtDraft = event.target.value;
      resizeThoughtTextarea(event.target);
      return;
    }
    if (event.target.id === 'session-search-input') {
      if (!state.dialog || state.dialog.kind !== 'conversation-search') return;
      state.dialog.query = event.target.value;
      paintConversationSearchResults();
      return;
    }
    if (event.target.id !== 'composer-input') return;
    state.composerDraft = event.target.value;
    resizeComposerTextarea(event.target);
  });

  document.addEventListener('keydown', function handleKeydown(event) {
    if (sessionMenuId) {
      if (event.key === 'Escape') { event.preventDefault(); closeSessionMenu(true); return; }
      if (event.key === 'Tab') { closeSessionMenu(true); return; }
      var menuButtons = Array.from(sessionMenuRoot.querySelectorAll('[role="menuitem"]'));
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        var index = menuButtons.indexOf(document.activeElement);
        var next = event.key === 'Home' ? 0 : event.key === 'End' ? menuButtons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + menuButtons.length) % menuButtons.length;
        if (menuButtons[next]) menuButtons[next].focus();
        return;
      }
    }
    if (event.target.id === 'session-name' && event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); confirmRenameSession(); return; }
    if (event.target.id === 'session-search-input' && event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
      var firstSearchResult = dialogRoot.querySelector('[data-action="select-search-session"]');
      if (firstSearchResult) {
        event.preventDefault();
        firstSearchResult.click();
      }
      return;
    }
    if (state.versionMenuOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        toggleVersionMenu(false);
        return;
      }
      var versionButtons = Array.from(document.querySelectorAll('.analysis-version-popover [role="menuitemradio"]'));
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        var versionIndex = versionButtons.indexOf(document.activeElement);
        var nextVersionIndex = event.key === 'Home' ? 0 : event.key === 'End' ? versionButtons.length - 1 : (versionIndex + (event.key === 'ArrowDown' ? 1 : -1) + versionButtons.length) % versionButtons.length;
        if (versionButtons[nextVersionIndex]) versionButtons[nextVersionIndex].focus();
        return;
      }
      if (event.key === 'Tab') {
        global.setTimeout(function closeVersionMenuAfterTab() {
          if (!document.activeElement || !document.activeElement.closest('[data-version-control]')) {
            state.versionMenuOpen = false;
            paintAnalysisVersionControl();
          }
        }, 0);
      }
    }
    if (event.key === 'Escape' && document.querySelector('[data-action="user-menu"][aria-expanded="true"]')) {
      setUserMenuOpen(false, true);
      return;
    }
    if (event.key === 'Escape' && state.dialog) {
      event.preventDefault();
      if (state.dialog.dismissible === false) {
        showToast('请先复制并安全保存密钥');
        return;
      }
      state.dialog = null;
      renderDialog();
      return;
    }
    if (event.key === 'Tab' && state.dialog && !['report-preview', 'source-preview', 'search-results'].includes(state.dialog.kind)) {
      var dialog = dialogRoot.querySelector('[role="dialog"]');
      var focusable = dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]');
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    if (event.target.id === 'composer-input' && event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      sendMessage();
    }
    if (event.target.id === 'agent-api-key-name' && event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      confirmCreateAgentApiKey();
    }
  });

  function handleRoute() {
    closeSessionMenu();
    state.dialog = null;
    renderDialog();
    if (/^#\/?(?:knowledge|local-documents|enterprise-connections|external-information|models|retrieval-config|retrieval-test|api-access|consumption)(?:[/?]|$)/.test(global.location.hash || '')) return;
    if (!global.location.hash || global.location.hash === '#' || global.location.hash === '#/' || global.location.hash === sessionRoute(homeSession.id)) {
      selectSession(homeSession.id);
      return;
    }
    if (global.location.hash === agentApiRoute()) {
      stopReplay();
      renderAgentApiShell();
      return;
    }
    var match = global.location.hash.match(/^#\/chat\/(.+)$/);
    if (!match) { selectSession(homeSession.id); return; }
    var id;
    try { id = decodeURIComponent(match[1]); }
    catch (error) { selectSession(homeSession.id); return; }
    if (!findSession(id)) { selectSession(homeSession.id); return; }
    selectSession(id);
  }

  global.addEventListener('resize', function closeMenuOnResize() { closeSessionMenu(); });
  document.addEventListener('scroll', function closeMenuOnScroll(event) {
    if (sessionMenuId && !sessionMenuRoot.contains(event.target)) closeSessionMenu();
  }, true);

  global.addEventListener('hashchange', handleRoute);
  handleRoute();
})(window, document);

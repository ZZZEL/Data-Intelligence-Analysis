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

  var state = {
    view: 'chat',
    activeSessionId: scenario.id,
    templateRouteId: null,
    outputProfiles: JSON.parse(JSON.stringify(DATA.outputProfiles || [])),
    draggedChapter: null,
    stage: scenario.result.stage,
    replaying: false,
    replayTimer: null,
    replayResolve: null,
    streamFrame: null,
    streamResolve: null,
    runId: 0,
    waitingFor: null,
    composerDraft: '',
    thoughtRevision: '',
    thoughtDraft: scenario.interaction.originalText,
    thoughtEditorOpen: false,
    thoughtRevisionTarget: scenario.interaction.target,
    thoughtEditorTarget: null,
    pendingFiles: [],
    customSessions: [],
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

  function renderInlineMarkdown(value) {
    var codeTokens = [];
    var output = escapeHtml(value).replace(/`([^`]+)`/g, function protectCode(match, content) {
      var token = '@@INLINE_CODE_' + codeTokens.length + '@@';
      codeTokens.push('<code>' + content + '</code>');
      return token;
    });
    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
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

  function renderMarkdown(markdown) {
    var lines = String(markdown == null ? '' : markdown).replace(/\r/g, '').trim().split('\n');
    var html = [];
    var paragraph = [];
    var listType = '';

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push('<p>' + renderInlineMarkdown(paragraph.join(' ')) + '</p>');
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
          return '<th>' + renderInlineMarkdown(cell) + '</th>';
        }).join('') + '</tr></thead><tbody>' + bodyRows.map(function bodyRow(row) {
          return '<tr>' + headings.map(function bodyCell(heading, cellIndex) {
            return '<td>' + renderInlineMarkdown(row[cellIndex] || '') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>');
        continue;
      }
      var headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        flushBlocks();
        var level = headingMatch[1].length;
        html.push('<h' + level + '>' + renderInlineMarkdown(headingMatch[2]) + '</h' + level + '>');
        continue;
      }
      var quoteMatch = trimmed.match(/^>\s?(.+)$/);
      if (quoteMatch) {
        flushBlocks();
        html.push('<blockquote><p>' + renderInlineMarkdown(quoteMatch[1]) + '</p></blockquote>');
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
        html.push('<li>' + renderInlineMarkdown((orderedMatch || unorderedMatch)[1]) + '</li>');
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
    return state.customSessions.concat(DATA.sessions);
  }

  function activeSession() {
    return allSessions().find(function findSession(item) {
      return item.id === state.activeSessionId;
    }) || DATA.sessions[0];
  }

  function sessionRoute(id) {
    return '#/chat/' + encodeURIComponent(id);
  }

  function templateRoute(id) {
    return '#/templates' + (id ? '/' + encodeURIComponent(id) : '');
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

  function revisionActive() {
    return Boolean(state.thoughtRevision) && state.stage >= scenario.interaction.resumeStage;
  }

  function activePlan() {
    return revisionActive() && scenario.revisionOutcome ? scenario.revisionOutcome.plan : scenario.plan;
  }

  function revisedCapabilities() {
    return scenario.revisionOutcome ? scenario.revisionOutcome.capabilities : primaryCapabilities;
  }

  function activeResult() {
    if (!revisionActive() || !scenario.revisionOutcome) return scenario.result;
    return Object.assign({}, scenario.result, scenario.revisionOutcome.result || {});
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
    var completeCopy = state.stage >= scenario.result.stage ? '分析步骤已完成，正文与报告已生成。' : '分析步骤已完成，正在生成正文。';
    return '<div class="process-section process-plan-section" data-plan-panel ' + (visible ? '' : 'hidden') + '>' +
      '<div class="process-subheading"><strong>分析路径</strong><span data-plan-summary>' + (complete ? planItems.length + ' / ' + planItems.length + ' 已完成' : '等待开始') + '</span></div>' +
      '<ol class="analysis-plan-track" aria-label="分析路径">' + planItems.map(function planItem(item) {
        return '<li class="plan-track-item ' + (complete ? 'done' : 'pending') + '" data-plan-step="' + item.id + '" title="' + escapeHtml(item.detail) + '">' +
          '<span class="plan-track-marker"><span data-plan-number>' + item.id + '</span><span data-plan-check>' + icon('check', 11) + '</span></span>' +
          '<span class="plan-track-title">' + escapeHtml(item.title) + '</span>' +
        '</li>';
      }).join('') + '</ol>' +
      '<p class="plan-current-detail"><strong data-plan-current-title>' + (complete ? '分析路径已完成' : '等待开始') + '</strong><span data-plan-current-copy>' + (complete ? completeCopy : '开始后将按顺序展示每一步使用的能力和当前动作。') + '</span></p>' +
    '</div>';
  }

  function thoughtKey(group, index) {
    return group + '-' + index;
  }

  function thoughtSource(key) {
    var match = String(key || '').match(/^(primary|continuation)-(\d+)$/);
    if (!match) return '';
    var index = Number(match[2]);
    if (match[1] === 'primary' && revisionActive() && index > 0 && scenario.revisionOutcome) {
      return scenario.revisionOutcome.followUpThoughtSegments[index - 1] || scenario.analysisRun.thoughtSegments[index] || '';
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

  function renderThoughtSegmentContent(group, content, index) {
    var key = thoughtKey(group, index);
    var applied = key === state.thoughtRevisionTarget && Boolean(state.thoughtRevision) && state.stage >= scenario.interaction.resumeStage;
    var editing = key === state.thoughtEditorTarget && state.thoughtEditorOpen;
    var canEdit = key === scenario.interaction.target && state.stage >= scenario.interaction.stage;
    if (editing) {
      return '<textarea class="thought-inline-input" id="thought-inline-input" aria-label="编辑初始思考" maxlength="1800">' + escapeHtml(state.thoughtDraft) + '</textarea>' +
        '<div class="thought-inline-actions"><button class="thought-revision-cancel" type="button" data-action="cancel-thought-edit">取消</button><button class="thought-revision-submit" type="button" data-action="apply-thought-edit">' + icon('rotate-ccw', 13) + '应用修改</button></div>';
    }
    if (applied) {
      return '<div class="thought-inline-revision"><span class="thought-revision-badge">思考已修订</span><div class="thought-inline-diff">' + renderThoughtRevisionDiff(content || '', state.thoughtRevision) + '</div></div>' +
        (canEdit ? '<button class="thought-inline-edit" type="button" data-action="edit-thought" data-thought-key="' + escapeHtml(key) + '">' + icon('pencil-line', 13) + '<span>重新编辑初始思考</span></button>' : '');
    }
    return '<div class="thought-copy">' + renderMarkdown(content || '') + '</div>' +
      (canEdit ? '<button class="thought-inline-edit" type="button" data-action="edit-thought" data-thought-key="' + escapeHtml(key) + '">' + icon('pencil-line', 13) + '<span>编辑初始思考</span></button>' : '');
  }

  function renderThoughtSegment(group, content, index, visible) {
    var key = thoughtKey(group, index);
    var editing = key === state.thoughtEditorTarget && state.thoughtEditorOpen;
    var applied = key === state.thoughtRevisionTarget && Boolean(state.thoughtRevision) && state.stage >= scenario.interaction.resumeStage;
    return '<div class="thought-segment markdown-body ' + (visible ? 'is-visible ' : '') + (editing ? 'is-editing ' : '') + (applied ? 'is-revised ' : '') + '" data-thought-segment="' + escapeHtml(key) + '" ' + (visible ? '' : 'hidden') + '>' + (visible ? renderThoughtSegmentContent(group, content, index) : '') + '</div>';
  }

  function renderExecutionRow(item, group, complete) {
    return '<div class="execution-row ' + (complete ? 'done' : 'pending') + '" data-execution-group="' + group + '" data-execution-id="' + escapeHtml(item.id) + '" ' + (complete ? '' : 'hidden') + '>' +
      '<span class="execution-icon">' + icon(item.icon || 'sparkles', 16) + '</span>' +
      '<div class="execution-copy">' +
        '<div class="execution-call-line"><div class="execution-meta"><strong>' + escapeHtml(item.runName) + '</strong><span class="execution-kind">' + escapeHtml(item.runType) + '</span></div>' +
        '<span class="execution-state"><span class="execution-state-dot"></span><span data-execution-state-copy>' + (complete ? '已完成' : '待执行') + '</span></span></div>' +
        '<p class="execution-live-detail" data-execution-live ' + (complete ? 'hidden' : '') + '></p>' +
      '</div>' +
    '</div>';
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

  function renderThoughtRevisionContent() {
    var applied = Boolean(state.thoughtRevision) && state.stage >= scenario.interaction.resumeStage;
    return '<p class="thought-revision-hint">' + (applied ? '初始思考已修订；再次修改会重新生成后续内容。' : '思考已完成，可点击开头的初始思考直接修改；正文将继续生成。') + '</p>';
  }

  function renderThoughtRevision() {
    var visible = state.stage >= scenario.interaction.stage;
    var applied = Boolean(state.thoughtRevision) && state.stage >= scenario.interaction.resumeStage;
    return '<section class="thought-revision ' + (applied ? 'is-applied' : '') + '" data-thought-revision ' + (visible ? '' : 'hidden') + '>' +
      renderThoughtRevisionContent() +
    '</section>';
  }

  function resultSummaryMarkdown() {
    var result = activeResult();
    return result.conclusion + '\n\n' + result.summary.join('\n\n');
  }

  function resultMetricsMarkdown() {
    var rows = activeResult().metrics.map(function metricRow(metric) {
      return '| ' + metric.label + ' | `' + metric.formula + '` | **' + metric.value + '** |';
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

  function renderUnavailableRoute() {
    stopReplay();
    state.dialog = null;
    document.title = '页面不存在 · ' + DATA.productName;
    dialogRoot.innerHTML = '';
    toastRoot.innerHTML = '';
    app.innerHTML = '<main class="route-unavailable" aria-labelledby="route-unavailable-title"><span class="route-unavailable-icon">' + icon('file-question', 26) + '</span><p class="route-unavailable-code">404</p><h1 id="route-unavailable-title">页面不存在</h1><p>该地址没有可用页面。请进入轻量用户端继续使用。</p><a class="route-home-button" href="' + sessionRoute(scenario.id) + '">' + icon('message-square', 17) + '<span>进入轻量用户端</span></a></main>';
    hydrateIcons();
  }

  function renderSidebar() {
    var sessions = allSessions().map(function sessionRow(session) {
      var active = state.view === 'chat' && session.id === state.activeSessionId;
      return '<li><button class="session-button ' + (active ? 'active' : '') + '" type="button" data-action="select-session" data-session-id="' + escapeHtml(session.id) + '" aria-current="' + (active ? 'page' : 'false') + '"><span class="session-title">' + escapeHtml(session.title) + '</span></button></li>';
    }).join('');
    return '<aside class="sidebar" aria-label="用户端导航"><div class="brand-row"><span class="brand-mark">' + icon('chart-no-axes-combined', 19) + '</span><span class="brand-name">' + escapeHtml(DATA.productName) + '</span></div><nav class="sidebar-primary-actions" aria-label="主要功能"><button class="new-chat-button" type="button" data-action="new-chat">' + icon('plus', 18) + '<span>新建对话</span></button><a class="sidebar-feature-link ' + (state.view === 'templates' ? 'active' : '') + '" href="' + templateRoute() + '" aria-current="' + (state.view === 'templates' ? 'page' : 'false') + '">' + icon('layout-template', 18) + '<span>报告模板</span>' + icon('chevron-right', 15) + '</a></nav><div class="sidebar-label">对话记录</div><ol class="session-list">' + sessions + '</ol><div class="user-account-menu" data-user-account-menu><button class="user-menu" type="button" data-action="user-menu" aria-expanded="false" aria-controls="user-account-popover" aria-label="打开账户菜单"><span class="avatar user">' + escapeHtml(DATA.user.name.slice(0, 1)) + '</span><span><strong>' + escapeHtml(DATA.user.name) + '</strong><small>' + escapeHtml(DATA.user.role) + '</small></span>' + icon('chevron-down', 16) + '</button><nav class="user-account-popover" id="user-account-popover" aria-label="账户操作" hidden><a class="user-account-popover__action" href="../ops-console/#/knowledge">' + icon('settings-2', 16) + '<span>运营端</span></a></nav></div></aside>';
  }

  function renderTopbar() {
    var session = activeSession();
    var isScenario = session.id === scenario.id;
    var replayButton = '';
    if (isScenario) {
      var replayCopy = state.waitingFor ? '等待思考修订' : state.replaying ? '演示进行中' : '重新演示';
      replayButton = '<button class="text-button" type="button" data-action="replay-demo" ' + (state.replaying ? 'disabled' : '') + '>' + icon('refresh-cw', 16) + '<span data-replay-copy>' + replayCopy + '</span></button>';
    }
    return '<header class="topbar"><div class="conversation-heading"><strong>' + escapeHtml(session.title) + '</strong><span>' + (isScenario ? escapeHtml(scenario.createdAt) : '当前对话') + '</span></div><div class="topbar-actions">' + replayButton + '<button class="icon-button" type="button" data-action="copy-link" aria-label="复制当前对话链接" title="复制当前对话链接">' + icon('link-2', 18) + '</button><button class="icon-button" type="button" data-action="more" aria-label="更多选项" title="更多选项">' + icon('ellipsis', 19) + '</button></div></header>';
  }

  function normalizeTemplateSection(section) {
    if (typeof section === 'string') return { title: section, includeChart: false };
    return {
      title: section && section.title ? section.title : '',
      includeChart: Boolean(section && section.includeChart)
    };
  }

  function findOutputProfile(id) {
    return state.outputProfiles.find(function findProfile(item) { return item.id === id; });
  }

  function renderTemplateTopbar(title, actions, back) {
    var heading = '<h1 class="template-page-title">' + escapeHtml(title) + '</h1>';
    if (back) {
      heading = '<div class="template-heading-with-back"><a class="icon-button" href="' + templateRoute() + '" aria-label="返回报告模板" title="返回报告模板">' + icon('arrow-left', 18) + '</a>' + heading + '</div>';
    }
    return '<header class="topbar template-topbar">' + heading + '<div class="topbar-actions">' + (actions || '') + '</div></header>';
  }

  function renderTemplateActions(profile) {
    return '<div class="template-row-actions">' +
      '<button type="button" data-action="edit-template" data-template-id="' + escapeHtml(profile.id) + '">编辑</button>' +
      (profile.isDefault ? '' : '<button type="button" data-action="default-template" data-template-id="' + escapeHtml(profile.id) + '">设默认</button>') +
      '<button class="is-danger" type="button" data-action="delete-template" data-template-id="' + escapeHtml(profile.id) + '"' + (profile.isDefault ? ' disabled title="默认模板不能删除"' : '') + '>删除</button></div>';
  }

  function renderTemplateList() {
    var rows = state.outputProfiles.map(function renderProfile(profile) {
      var sections = (profile.sections || []).map(normalizeTemplateSection);
      var sectionNames = sections.map(function sectionTitle(section) { return section.title; });
      return '<tr><td><div class="template-name-cell"><strong>' + escapeHtml(profile.name) + '</strong>' + (profile.isDefault ? '<span class="template-tag is-default">默认</span>' : '') + '</div></td><td>' + escapeHtml(profile.description) + '</td><td><strong>' + sections.length + ' 节</strong><small>' + escapeHtml(sectionNames.slice(0, 3).join('、')) + (sections.length > 3 ? '…' : '') + '</small></td><td>' + renderTemplateActions(profile) + '</td></tr>';
    }).join('');
    var actions = '<button class="button primary" type="button" data-action="create-template">' + icon('plus', 16) + '新建模板</button>';
    return renderTemplateTopbar('报告模板', actions, false) +
      '<div class="template-page-scroll"><div class="template-page"><div class="template-list-intro"><p>在生成分析报告时选择模板，系统会按设定的章节结构输出。</p><span>共 ' + state.outputProfiles.length + ' 个模板</span></div><section class="template-table-surface" aria-label="报告模板列表"><div class="template-table-wrap"><table class="template-table"><thead><tr><th>模板</th><th>描述</th><th>章节</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table></div></section></div></div>';
  }

  function renderTemplateChapterRows(sections) {
    var values = (sections && sections.length ? sections : [{ title: '摘要', includeChart: false }]).map(normalizeTemplateSection);
    return values.map(function renderChapter(section, index) {
      return '<div class="template-chapter-row" data-template-chapter-row draggable="true" role="listitem"><button type="button" class="template-chapter-handle" draggable="true" data-template-chapter-drag aria-label="拖动调整第 ' + (index + 1) + ' 章顺序">' + icon('grip-vertical', 15) + '</button><input class="template-field" maxlength="30" value="' + escapeHtml(section.title) + '" data-template-chapter-name aria-label="章节 ' + (index + 1) + '"><label class="template-chapter-chart" title="此章节需要生成图表"><input type="checkbox" data-template-chapter-chart aria-label="第 ' + (index + 1) + ' 章需要图表"' + (section.includeChart ? ' checked' : '') + '><span>图表</span></label><span class="template-chapter-move"><button type="button" data-action="move-template-chapter-up" aria-label="上移一位">' + icon('chevron-up', 12) + '</button><button type="button" data-action="move-template-chapter-down" aria-label="下移一位">' + icon('chevron-down', 12) + '</button></span><button type="button" class="template-chapter-remove" data-action="remove-template-chapter" aria-label="删除章节">' + icon('trash-2', 14) + '</button></div>';
    }).join('');
  }

  function renderTemplatePreviewSections(sections) {
    return (sections || []).map(function renderSection(section, index) {
      var current = normalizeTemplateSection(section);
      var chart = current.includeChart ? '<div class="template-preview-chart"><strong>图表区域</strong><span>该章节将根据分析数据生成图表</span></div>' : '';
      return '<section><h3>' + (index + 1) + '. ' + escapeHtml(current.title) + '</h3><p>' + (index === 0 ? '本章将汇总研判结论与重要依据。' : '本章内容将由 Agent 根据分析结果生成。') + '</p>' + chart + '</section>';
    }).join('');
  }

  function renderTemplateEditor(routeId) {
    var editing = routeId !== 'new';
    var profile = editing ? findOutputProfile(routeId) : null;
    if (editing && !profile) {
      return renderTemplateTopbar('报告模板不存在', '', true) + '<div class="template-page-scroll"><div class="template-not-found">' + icon('file-question', 28) + '<h1>未找到该模板</h1><p>请返回模板列表重新选择。</p><a class="button primary" href="' + templateRoute() + '">返回报告模板</a></div></div>';
    }
    var current = profile || {
      name: '',
      description: '',
      sections: [
        { title: '摘要', includeChart: false },
        { title: '关键事实', includeChart: false },
        { title: '研判结论', includeChart: false },
        { title: '建议', includeChart: false }
      ]
    };
    var actions = '<button class="button" type="button" data-action="cancel-template-edit">取消</button><button class="button primary" type="button" data-action="save-template" data-template-id="' + escapeHtml(profile ? profile.id : '') + '">' + icon('check', 15) + (editing ? '保存' : '创建') + '</button>';
    return renderTemplateTopbar(editing ? '编辑报告模板' : '新建报告模板', actions, true) +
      '<div class="template-page-scroll is-editor"><div class="template-editor" data-template-editor data-template-id="' + escapeHtml(profile ? profile.id : '') + '"><section class="template-editor-form"><div class="template-form-field"><label for="template-name">模板名称 <span aria-hidden="true">*</span></label><input id="template-name" class="template-field" maxlength="50" value="' + escapeHtml(current.name) + '" placeholder="例如：供应商风险研判报告" required aria-required="true" data-template-field="name"></div><div class="template-form-field"><label for="template-description">模板描述 <span aria-hidden="true">*</span></label><textarea id="template-description" class="template-field template-description-field" maxlength="160" rows="3" placeholder="简要说明模板的用途与内容，例如：用于评估供应商交付、履约及经营风险…" required aria-required="true" data-template-field="description">' + escapeHtml(current.description) + '</textarea></div><div class="template-form-field"><div class="template-chapter-heading"><label>章节 <span aria-hidden="true">*</span></label><button class="button" type="button" data-action="add-template-chapter">' + icon('plus', 14) + '新增章节</button></div><div class="template-chapter-list" data-template-chapter-list role="list" aria-label="报告章节">' + renderTemplateChapterRows(current.sections) + '</div></div></section><aside class="template-preview"><div class="template-preview-label">实时预览</div><article><h2 data-template-preview-title>' + escapeHtml(current.name || '报告标题') + '</h2><p data-template-preview-description>' + escapeHtml(current.description || '模板描述') + '</p><div data-template-preview-sections>' + renderTemplatePreviewSections(current.sections) + '</div></article></aside></div></div>';
  }

  function syncTemplateEditor() {
    var editor = document.querySelector('[data-template-editor]');
    if (!editor) return;
    var rows = Array.from(editor.querySelectorAll('[data-template-chapter-row]'));
    rows.forEach(function syncChapter(row, index) {
      var up = row.querySelector('[data-action="move-template-chapter-up"]');
      var down = row.querySelector('[data-action="move-template-chapter-down"]');
      var remove = row.querySelector('[data-action="remove-template-chapter"]');
      var field = row.querySelector('[data-template-chapter-name]');
      var chart = row.querySelector('[data-template-chapter-chart]');
      if (up) up.disabled = index === 0;
      if (down) down.disabled = index === rows.length - 1;
      if (remove) remove.disabled = rows.length === 1;
      if (field) field.setAttribute('aria-label', '章节 ' + (index + 1));
      if (chart) chart.setAttribute('aria-label', '第 ' + (index + 1) + ' 章需要图表');
      row.setAttribute('aria-posinset', String(index + 1));
      row.setAttribute('aria-setsize', String(rows.length));
    });
    var name = editor.querySelector('[data-template-field="name"]').value.trim() || '报告标题';
    var description = editor.querySelector('[data-template-field="description"]').value.trim() || '模板描述';
    var sections = rows.map(function chapterValue(row) {
      return {
        title: row.querySelector('[data-template-chapter-name]').value.trim(),
        includeChart: row.querySelector('[data-template-chapter-chart]').checked
      };
    }).filter(function namedChapter(section) { return section.title; });
    editor.querySelector('[data-template-preview-title]').textContent = name;
    editor.querySelector('[data-template-preview-description]').textContent = description;
    editor.querySelector('[data-template-preview-sections]').innerHTML = renderTemplatePreviewSections(sections);
  }

  function renderTemplateShell(routeId) {
    state.view = 'templates';
    state.templateRouteId = routeId || null;
    state.dialog = null;
    dialogRoot.innerHTML = '';
    document.title = (routeId ? (routeId === 'new' ? '新建报告模板' : '编辑报告模板') : '报告模板') + ' · ' + DATA.productName;
    app.innerHTML = '<div class="chat-shell">' + renderSidebar() + '<main class="main-pane template-main-pane">' + (routeId ? renderTemplateEditor(routeId) : renderTemplateList()) + '</main></div>';
    hydrateIcons();
    syncTemplateEditor();
  }

  function renderAttachment(file) {
    var iconName = file.type === 'pdf' ? 'file-text' : file.type === 'xlsx' ? 'sheet' : 'file';
    return '<span class="attachment-chip" data-type="' + escapeHtml(file.type) + '"><span class="file-icon">' + icon(iconName, 17) + '</span><span><strong title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</strong><small>' + escapeHtml(file.size) + '</small></span></span>';
  }

  function renderUserQuestion() {
    return '<article class="message user-message initial-user-message" aria-label="用户消息"><div class="user-bubble"><p>' + escapeHtml(scenario.originalQuestion) + '</p><div class="attachment-grid">' + scenario.attachments.map(renderAttachment).join('') + '</div></div></article>';
  }

  function renderStreamStatus(kind, text) {
    return '<div class="stream-status" data-stream-status="' + kind + '" role="status" aria-live="polite" ' + (text ? '' : 'hidden') + '><span class="stream-status-dot" aria-hidden="true"></span><span data-stream-status-copy>' + escapeHtml(text || '') + '</span></div>';
  }

  function renderAnalysisMessage() {
    var initialComplete = state.stage >= scenario.interaction.stage;
    var finalComplete = state.stage >= scenario.result.stage;
    var label = finalComplete ? '已完成' : initialComplete ? '正文生成中' : state.replaying ? '深度分析中' : '分析过程';
    var reportSlot = '<div data-report-slot ' + (finalComplete ? '' : 'hidden') + '>' + renderDocuments() + '</div>';
    return '<article class="message assistant-message research-run-message" aria-label="数据智能分析回复"><span class="avatar assistant">' + icon('sparkles', 17) + '</span><div class="assistant-content"><div class="assistant-label">数据智能分析 <span data-primary-label-status>' + label + '</span></div><div class="thinking-surface">' + renderStreamStatus('primary', '') + renderAnalysisFlow(primaryCapabilities, {
      group: 'primary',
      thoughtSegments: scenario.analysisRun.thoughtSegments,
      showPlan: true,
      visible: initialComplete,
      complete: initialComplete,
      busy: state.replaying
    }) + renderThoughtRevision() + '</div>' + renderAnswerBody('result', finalComplete ? renderMarkdown(resultMarkdown()) : '', finalComplete, reportSlot) + '</div></article>';
  }

  function renderDocuments() {
    return '<div class="document-list" aria-label="生成的报告">' + activeResult().documents.map(function documentButton(item) {
      return '<button class="document-button" type="button" data-action="open-document" data-document-id="' + escapeHtml(item.id) + '"><span class="file-icon">' + icon(item.icon, 17) + '</span><span><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.meta) + '</small></span>' + icon('arrow-up-right', 15) + '</button>';
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

  function renderEmptyThread() {
    var session = activeSession();
    if (session.id !== scenario.id && !session.isNew) {
      return '<div class="thread"><article class="message user-message"><div class="user-bubble"><p>请继续分析“' + escapeHtml(session.title) + '”，并给出可执行的下一步建议。</p></div></article><article class="message assistant-message"><span class="avatar assistant">' + icon('sparkles', 17) + '</span><div class="assistant-content"><div class="assistant-label">数据智能分析 <span>历史记录</span></div><div class="markdown-body">' + renderMarkdown('该对话用于展示会话切换。铜采购案例包含连续的深度分析过程、必要补充和报告生成流程。') + '</div></div></article></div>';
    }
    return '<div class="thread"><div class="empty-chat"><span class="empty-mark">' + icon('sparkles', 22) + '</span><h1>开始一次数据智能分析</h1><p>输入问题并上传资料，我会先理解目标、确认分析思路，再制定执行计划。</p></div>' + renderCustomMessages() + '</div>';
  }

  function renderPendingFileItems() {
    return state.pendingFiles.map(function pendingFile(file, index) {
      return '<span class="pending-file">' + icon('paperclip', 13) + '<span>' + escapeHtml(file.name) + '</span><button class="icon-button" type="button" data-action="remove-pending-file" data-file-index="' + index + '" aria-label="移除文件" style="width:22px;height:22px">' + icon('x', 12) + '</button></span>';
    }).join('');
  }

  function renderComposer() {
    var waiting = Boolean(state.waitingFor);
    return '<footer class="composer-region composer-shell ' + (waiting ? 'awaiting-input' : '') + '"><div id="pending-attachments" class="pending-attachments" ' + (state.pendingFiles.length ? '' : 'hidden') + '>' + renderPendingFileItems() + '</div><div class="composer"><input id="file-input" type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.png,.jpg,.jpeg" /><button class="icon-button" type="button" data-action="attach-file" aria-label="上传文件" title="上传文件">' + icon('paperclip', 20) + '</button><textarea id="composer-input" rows="1" maxlength="3000" aria-label="输入问题或补充信息；Enter 发送，Shift 加 Enter 换行" placeholder="输入问题，或继续补充信息">' + escapeHtml(state.composerDraft) + '</textarea><button class="icon-button primary" type="button" data-action="send-message" aria-label="发送">' + icon('arrow-up', 20) + '</button></div></footer>';
  }

  function resizeComposerTextarea(input) {
    if (!input) return;
    var maxHeight = 160;
    input.style.height = 'auto';
    input.style.height = Math.max(40, Math.min(input.scrollHeight, maxHeight)) + 'px';
    input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function renderShell(options) {
    var settings = options || {};
    state.view = 'chat';
    state.templateRouteId = null;
    var isScenario = state.activeSessionId === scenario.id;
    document.title = DATA.productName;
    app.innerHTML = '<div class="chat-shell">' + renderSidebar() + '<main class="main-pane">' + renderTopbar() + '<div class="thread-scroll" id="thread-scroll">' + (isScenario ? renderScenarioThread() : renderEmptyThread()) + '</div>' + renderComposer() + '</main></div>';
    hydrateIcons();
    syncRoute();
    global.requestAnimationFrame(function finishRender() {
      var input = document.getElementById('composer-input');
      resizeComposerTextarea(input);
      if (settings.scrollToBottom) scrollToLatest(true);
      if (settings.focusComposer && input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
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
    if (copy) copy.textContent = state.replaying ? '演示进行中' : '重新演示';
    var svg = button.querySelector('svg');
    if (svg) svg.classList.toggle('spin', state.replaying);
  }

  function updateAssistantLabel(kind, copy) {
    var label = document.querySelector('[data-' + kind + '-label-status]');
    if (label) label.textContent = copy;
  }

  function updateStreamStatus(kind, copy, busy) {
    var status = document.querySelector('[data-stream-status="' + kind + '"]');
    var panel = processPanel(kind);
    if (status) {
      status.hidden = !copy;
      status.classList.toggle('is-busy', Boolean(busy));
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

  function paintThoughtRevision() {
    var panel = document.querySelector('[data-thought-revision]');
    if (!panel) return;
    var applied = Boolean(state.thoughtRevision) && state.stage >= scenario.interaction.resumeStage;
    panel.hidden = state.stage < scenario.interaction.stage;
    panel.classList.toggle('is-applied', applied);
    panel.innerHTML = renderThoughtRevisionContent();
    hydrateIcons(panel);
  }

  function paintThoughtSegment(key) {
    var segment = document.querySelector('[data-thought-segment="' + key + '"]');
    var match = String(key || '').match(/^(primary|continuation)-(\d+)$/);
    if (!segment || !match || segment.hidden) return;
    var group = match[1];
    var index = Number(match[2]);
    var editing = key === state.thoughtEditorTarget && state.thoughtEditorOpen;
    var applied = key === state.thoughtRevisionTarget && Boolean(state.thoughtRevision) && state.stage >= scenario.interaction.resumeStage;
    segment.classList.toggle('is-editing', editing);
    segment.classList.toggle('is-revised', applied);
    segment.innerHTML = renderThoughtSegmentContent(group, thoughtSource(key), index);
    hydrateIcons(segment);
  }

  function paintEditableThoughtSegments() {
    document.querySelectorAll('[data-thought-segment^="primary-"]').forEach(function paintEditable(segment) {
      if (!segment.hidden) paintThoughtSegment(segment.dataset.thoughtSegment);
    });
  }

  function revealThoughtRevision() {
    var panel = document.querySelector('[data-thought-revision]');
    if (!panel) return;
    panel.hidden = false;
    paintThoughtRevision();
    paintEditableThoughtSegments();
    global.requestAnimationFrame(function animateThoughtRevision() { panel.classList.add('is-visible'); });
  }

  function resizeThoughtTextarea(input) {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.max(input.scrollHeight, 92) + 'px';
  }

  function setThoughtEditorOpen(open, key) {
    var previousTarget = state.thoughtEditorTarget;
    var nextTarget = scenario.interaction.target;
    state.thoughtEditorOpen = open;
    state.thoughtEditorTarget = open ? nextTarget : null;
    if (open) {
      var appliedAtTarget = nextTarget === state.thoughtRevisionTarget && Boolean(state.thoughtRevision) && state.stage >= scenario.interaction.resumeStage;
      state.thoughtDraft = appliedAtTarget ? state.thoughtRevision : thoughtSource(nextTarget);
    }
    if (previousTarget && previousTarget !== nextTarget) paintThoughtSegment(previousTarget);
    paintThoughtSegment(nextTarget);
    paintThoughtRevision();
    if (open) {
      var input = document.getElementById('thought-inline-input');
      if (input) {
        resizeThoughtTextarea(input);
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      var segment = document.querySelector('[data-thought-segment="' + nextTarget + '"]');
      if (segment) segment.scrollIntoView({ block: 'center' });
    }
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
    state.thoughtRevision = text;
    state.thoughtDraft = text;
    state.thoughtRevisionTarget = state.thoughtEditorTarget || scenario.interaction.target;
    state.thoughtEditorOpen = false;
    state.thoughtEditorTarget = null;
    state.stage = scenario.interaction.resumeStage;
    state.replaying = true;
    paintEditableThoughtSegments();
    paintThoughtRevision();
    var answer = document.querySelector('[data-answer-body="result"]');
    if (answer) {
      answer.hidden = true;
      answer.classList.remove('is-visible');
    }
    var reportSlot = document.querySelector('[data-report-slot]');
    if (reportSlot) reportSlot.hidden = true;
    updateReplayButton();
    scrollToLatest(true);
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
  }

  function updatePendingFiles() {
    var container = document.getElementById('pending-attachments');
    if (!container) return;
    container.innerHTML = renderPendingFileItems();
    container.hidden = state.pendingFiles.length === 0;
    hydrateIcons(container);
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

  function resetPrimaryForRevision(items) {
    var panel = processPanel('primary');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.add('is-visible');
    var plan = panel.querySelector('[data-plan-panel]');
    if (plan) plan.outerHTML = renderPlanTrack(false, true);
    items.forEach(function replaceExecutionRow(item) {
      var row = executionRow('primary', item.id);
      if (row) row.outerHTML = renderExecutionRow(item, 'primary', false);
    });
    panel.querySelectorAll('[data-thought-segment]').forEach(function resetDownstreamThought(segment) {
      if (segment.dataset.thoughtSegment === scenario.interaction.target) return;
      segment.hidden = true;
      segment.innerHTML = '';
      segment.classList.remove('is-visible', 'is-editing', 'is-revised');
      segment.setAttribute('aria-busy', 'false');
    });
    paintThoughtSegment(scenario.interaction.target);
    hydrateIcons(panel);
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
    var title = panel.querySelector('[data-plan-current-title]');
    var copy = panel.querySelector('[data-plan-current-copy]');
    var planItem = planItems.find(function findPlanItem(item) { return item.id === activeStep; });
    if (planMode === 'complete') {
      if (summary) summary.textContent = planItems.length + ' / ' + planItems.length + ' 已完成';
      if (title) title.textContent = '分析路径已完成';
      if (copy) copy.textContent = state.stage >= scenario.result.stage ? '分析步骤已完成，正文与报告已生成。' : '分析步骤已完成，正在生成正文。';
      return;
    }
    if (summary) summary.textContent = planMode === 'pending' ? '等待开始' : doneCount + ' / ' + planItems.length + ' 已完成';
      if (title) title.textContent = planMode === 'pending' ? '等待开始' : planMode === 'waiting' ? '等待思考修订：' + planItem.title : '正在执行：' + planItem.title;
    if (copy) copy.textContent = planMode === 'pending' ? '开始后将按顺序展示每一步使用的能力和当前动作。' : planItem.detail;
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
    revealThoughtRevision();
    updateAssistantLabel('primary', '正文生成中');
    updateStreamStatus('primary', '', false);
    updateReplayButton();
    scrollToLatest(true);
    await runContinuationReplay(runId);
  }

  async function runRevisedReplay(runId) {
    var items = revisedCapabilities();
    resetPrimaryForRevision(items);
    updateAssistantLabel('primary', '根据修订重新分析中');
    updateStreamStatus('primary', '正在根据初始思考重新规划分析路径…', true);
    updatePlanProgress(1, 'running');
    if (!await pauseReplay(260, runId)) return;
    if (!await revealThoughtSegment('primary', 1, runId)) return;
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      state.stage = item.stage;
      updatePlanProgress(item.planStep, 'running');
      if (!await runExecutionItem('primary', item, runId)) return;
      if (!await revealThoughtSegment('primary', index + 2, runId)) return;
    }
    updatePlanProgress(activePlan().length, 'complete');
    updateStreamStatus('primary', '', false);
    paintThoughtRevision();
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
    updatePlanProgress(activePlan().length, 'complete');
    var reportSlot = document.querySelector('[data-report-slot]');
    if (reportSlot) reportSlot.hidden = false;
    updateAssistantLabel('primary', '已完成');
    updateReplayButton();
    scrollToLatest(true);
    showToast('分析与报告已生成');
  }

  function startReplay() {
    stopReplay();
    state.view = 'chat';
    state.activeSessionId = scenario.id;
    state.stage = 0;
    state.replaying = true;
    state.waitingFor = null;
    state.composerDraft = '';
    state.thoughtRevision = '';
    state.thoughtDraft = scenario.interaction.originalText;
    state.thoughtRevisionTarget = scenario.interaction.target;
    state.thoughtEditorOpen = false;
    state.thoughtEditorTarget = null;
    renderShell();
    runInitialReplay(state.runId);
  }

  function newChat() {
    stopReplay();
    state.view = 'chat';
    var id = 'new-' + Date.now();
    state.customSessions.unshift({ id: id, title: '新对话', isNew: true });
    state.activeSessionId = id;
    state.customMessages = [];
    state.pendingFiles = [];
    state.waitingFor = null;
    state.composerDraft = '';
    renderShell({ focusComposer: true });
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
    var userMessage = { role: 'user', text: text || '请分析这些文件。', files: files };
    state.customMessages.push(userMessage);
    state.pendingFiles = [];
    state.composerDraft = '';
    appendMessageHtml(renderCustomMessage(userMessage));
    updatePendingFiles();
    updateComposer();
    var session = activeSession();
    if (session.isNew && session.title === '新对话') {
      session.title = (text || (files[0] && files[0].name) || '新分析').slice(0, 18);
    patchActiveSessionCopy(session);
    }
    global.setTimeout(function simulatedReply() {
      if (state.activeSessionId !== session.id) return;
      var reply = '已收到补充内容。在真实接入中，我会把它并入当前会话上下文，重新判断是否需要调整分析思路或更新后续计划。';
      state.customMessages.push({ role: 'assistant', text: reply });
      var message = appendMessageHtml('<article class="message assistant-message"><span class="avatar assistant">' + icon('sparkles', 17) + '</span><div class="assistant-content"><div class="assistant-label">数据智能分析</div><div class="markdown-body" data-custom-stream></div></div></article>');
      var target = message && message.querySelector('[data-custom-stream]');
      if (target) appendMarkdownChunk(target, reply, state.runId, { maxDuration: 1600 });
    }, 500);
  }

  function navigateToTemplate(id) {
    global.location.hash = templateRoute(id);
  }

  function collectTemplatePayload(editor) {
    return {
      name: editor.querySelector('[data-template-field="name"]').value.trim(),
      description: editor.querySelector('[data-template-field="description"]').value.trim(),
      sections: Array.from(editor.querySelectorAll('[data-template-chapter-row]')).map(function mapChapter(row) {
        return {
          title: row.querySelector('[data-template-chapter-name]').value.trim(),
          includeChart: row.querySelector('[data-template-chapter-chart]').checked
        };
      }).filter(function namedChapter(section) { return section.title; })
    };
  }

  function saveTemplate() {
    var editor = document.querySelector('[data-template-editor]');
    if (!editor) return;
    var profileId = editor.dataset.templateId;
    var current = profileId ? findOutputProfile(profileId) : null;
    var payload = collectTemplatePayload(editor);
    if (!payload.name || !payload.description || !payload.sections.length) {
      showToast('请完善模板名称、模板描述和至少一个章节');
      return;
    }
    var duplicate = state.outputProfiles.some(function sameName(item) {
      return item.id !== profileId && item.name.toLowerCase() === payload.name.toLowerCase();
    });
    if (duplicate) {
      showToast('模板名称需保持唯一');
      editor.querySelector('[data-template-field="name"]').focus();
      return;
    }
    if (current) {
      current.name = payload.name;
      current.description = payload.description;
      current.sections = payload.sections;
    } else {
      var numericIds = state.outputProfiles.map(function profileNumber(item) {
        var match = String(item.id).match(/(\d+)$/);
        return match ? Number(match[1]) : 0;
      });
      var nextNumber = Math.max.apply(Math, numericIds.concat([0])) + 1;
      state.outputProfiles.push({
        id: 'OUT-' + String(nextNumber).padStart(2, '0'),
        name: payload.name,
        description: payload.description,
        isDefault: state.outputProfiles.length === 0,
        sections: payload.sections
      });
    }
    navigateToTemplate();
    showToast(current ? '模板已更新' : '模板已创建');
  }

  function setDefaultTemplate(profile) {
    if (!profile) return;
    state.outputProfiles.forEach(function updateDefault(item) { item.isDefault = item.id === profile.id; });
    renderTemplateShell();
    showToast(profile.name + ' 已设为默认模板');
  }

  function requestDeleteTemplate(profile) {
    if (!profile) return;
    if (profile.isDefault) {
      showToast('默认模板不能删除');
      return;
    }
    state.dialog = {
      kind: 'confirm-template-delete',
      templateId: profile.id,
      title: '删除报告模板',
      body: '<p class="confirm-dialog-copy">确定删除“<strong>' + escapeHtml(profile.name) + '</strong>”？删除后无法恢复。</p>'
    };
    renderDialog();
  }

  function confirmDeleteTemplate() {
    var profile = state.dialog && findOutputProfile(state.dialog.templateId);
    if (!profile || profile.isDefault) return;
    state.outputProfiles.splice(state.outputProfiles.indexOf(profile), 1);
    state.dialog = null;
    renderDialog();
    renderTemplateShell();
    showToast('模板已删除');
  }

  function reportBody() {
    return '<div class="markdown-body report-markdown">' + renderMarkdown(reportMarkdown()) + '</div>';
  }

  function openDocument(documentId) {
    var documentItem = activeResult().documents.find(function item(value) { return value.id === documentId; });
    state.dialog = { title: documentItem ? documentItem.name : '铜采购签约决策分析报告', body: reportBody() };
    renderDialog();
  }

  function renderDialog() {
    if (!state.dialog) {
      dialogRoot.innerHTML = '';
      return;
    }
    var confirmDelete = state.dialog.kind === 'confirm-template-delete';
    var footer = confirmDelete
      ? '<button class="button" type="button" data-action="close-dialog">取消</button><button class="button danger" type="button" data-action="confirm-delete-template">删除</button>'
      : '<button class="button" type="button" data-action="close-dialog">关闭</button><button class="button primary" type="button" data-action="export-report">' + icon('download', 15) + '下载报告</button>';
    dialogRoot.innerHTML = '<div class="dialog-backdrop" data-action="close-dialog" role="presentation"><section class="dialog ' + (confirmDelete ? 'dialog--confirm' : '') + '" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog-header"><h2 id="dialog-title">' + escapeHtml(state.dialog.title) + '</h2><button class="icon-button" type="button" data-action="close-dialog" aria-label="关闭">' + icon('x', 19) + '</button></header><div class="dialog-body">' + state.dialog.body + '</div><footer class="dialog-footer">' + footer + '</footer></section></div>';
    hydrateIcons(dialogRoot);
    var closeButton = dialogRoot.querySelector('.dialog-header .icon-button');
    if (closeButton) closeButton.focus();
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
    var control = event.target.closest('[data-action]');
    if (!control) return;
    var action = control.dataset.action;
    if (action === 'user-menu') {
      setUserMenuOpen(control.getAttribute('aria-expanded') !== 'true');
      return;
    }
    if (action === 'create-template') {
      navigateToTemplate('new');
      return;
    }
    if (action === 'edit-template') {
      navigateToTemplate(control.dataset.templateId);
      return;
    }
    if (action === 'default-template') {
      setDefaultTemplate(findOutputProfile(control.dataset.templateId));
      return;
    }
    if (action === 'delete-template') {
      requestDeleteTemplate(findOutputProfile(control.dataset.templateId));
      return;
    }
    if (action === 'confirm-delete-template') {
      confirmDeleteTemplate();
      return;
    }
    if (action === 'cancel-template-edit') {
      navigateToTemplate();
      return;
    }
    if (action === 'save-template') {
      saveTemplate();
      return;
    }
    if (action === 'add-template-chapter') {
      var chapterList = document.querySelector('[data-template-chapter-list]');
      if (!chapterList) return;
      chapterList.insertAdjacentHTML('beforeend', renderTemplateChapterRows([{ title: '新章节', includeChart: false }]));
      hydrateIcons(chapterList.lastElementChild);
      syncTemplateEditor();
      chapterList.lastElementChild.querySelector('[data-template-chapter-name]').select();
      return;
    }
    if (action === 'move-template-chapter-up' || action === 'move-template-chapter-down' || action === 'remove-template-chapter') {
      var chapterRow = control.closest('[data-template-chapter-row]');
      if (!chapterRow) return;
      if (action === 'move-template-chapter-up' && chapterRow.previousElementSibling) chapterRow.parentNode.insertBefore(chapterRow, chapterRow.previousElementSibling);
      if (action === 'move-template-chapter-down' && chapterRow.nextElementSibling) chapterRow.parentNode.insertBefore(chapterRow.nextElementSibling, chapterRow);
      if (action === 'remove-template-chapter' && chapterRow.parentNode.children.length > 1) chapterRow.remove();
      syncTemplateEditor();
      return;
    }
    if (action === 'new-chat') {
      newChat();
      return;
    }
    if (action === 'select-session') {
      stopReplay();
      state.activeSessionId = control.dataset.sessionId;
      state.customMessages = [];
      state.pendingFiles = [];
      state.stage = scenario.result.stage;
      state.waitingFor = null;
      state.composerDraft = '';
      state.thoughtRevision = '';
      state.thoughtDraft = scenario.interaction.originalText;
      state.thoughtRevisionTarget = scenario.interaction.target;
      state.thoughtEditorOpen = false;
      state.thoughtEditorTarget = null;
      renderShell();
      return;
    }
    if (action === 'replay-demo') {
      startReplay();
      return;
    }
    if (action === 'edit-thought') {
      setThoughtEditorOpen(true, control.dataset.thoughtKey || scenario.interaction.target);
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
    if (action === 'close-dialog') {
      if (event.target === control || control.closest('.dialog-header') || control.closest('.dialog-footer')) {
        state.dialog = null;
        renderDialog();
      }
      return;
    }
    if (action === 'export-report') {
      exportReport();
      return;
    }
    if (action === 'copy-link') {
      if (navigator.clipboard) navigator.clipboard.writeText(global.location.href);
      showToast('当前对话链接已复制');
      return;
    }
    if (action === 'more') showToast('演示中暂不提供更多设置');
  });

  document.addEventListener('focusin', function handleAccountFocus(event) {
    if (!event.target.closest('[data-user-account-menu]')) setUserMenuOpen(false);
  });

  document.addEventListener('change', function handleChange(event) {
    if (event.target.closest('[data-template-editor]')) {
      syncTemplateEditor();
      return;
    }
    if (event.target.id !== 'file-input') return;
    var files = Array.from(event.target.files || []);
    state.pendingFiles.push.apply(state.pendingFiles, files.map(function normalizeFile(file) {
      return { name: file.name, size: formatFileSize(file.size), type: fileType(file.name) };
    }));
    event.target.value = '';
    updatePendingFiles();
  });

  document.addEventListener('input', function handleInput(event) {
    if (event.target.closest('[data-template-editor]')) {
      syncTemplateEditor();
      return;
    }
    if (event.target.id === 'thought-inline-input') {
      state.thoughtDraft = event.target.value;
      resizeThoughtTextarea(event.target);
      return;
    }
    if (event.target.id !== 'composer-input') return;
    state.composerDraft = event.target.value;
    resizeComposerTextarea(event.target);
  });

  document.addEventListener('keydown', function handleKeydown(event) {
    if (event.key === 'Escape' && document.querySelector('[data-action="user-menu"][aria-expanded="true"]')) {
      setUserMenuOpen(false, true);
      return;
    }
    if (event.key === 'Escape' && state.dialog) {
      state.dialog = null;
      renderDialog();
      return;
    }
    if (event.target.id === 'composer-input' && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
    if (event.target.id === 'thought-inline-input' && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      applyThoughtRevision();
    }
  });

  function clearTemplateChapterDrag() {
    document.querySelectorAll('.is-template-dragging, .is-template-drop-before, .is-template-drop-after').forEach(function clearDragClass(row) {
      row.classList.remove('is-template-dragging', 'is-template-drop-before', 'is-template-drop-after');
    });
    state.draggedChapter = null;
  }

  document.addEventListener('dragstart', function handleTemplateDragStart(event) {
    var handle = event.target.closest('[data-template-chapter-drag]');
    if (!handle) return;
    state.draggedChapter = handle.closest('[data-template-chapter-row]');
    if (!state.draggedChapter) return;
    state.draggedChapter.classList.add('is-template-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', state.draggedChapter.querySelector('[data-template-chapter-name]').value || '章节');
    }
  });

  document.addEventListener('dragover', function handleTemplateDragOver(event) {
    if (!state.draggedChapter) return;
    var targetRow = event.target.closest('[data-template-chapter-row]');
    if (!targetRow || targetRow === state.draggedChapter) return;
    event.preventDefault();
    document.querySelectorAll('.is-template-drop-before, .is-template-drop-after').forEach(function clearDrop(row) {
      row.classList.remove('is-template-drop-before', 'is-template-drop-after');
    });
    var rect = targetRow.getBoundingClientRect();
    targetRow.classList.add(event.clientY > rect.top + rect.height / 2 ? 'is-template-drop-after' : 'is-template-drop-before');
  });

  document.addEventListener('drop', function handleTemplateDrop(event) {
    if (!state.draggedChapter) return;
    var targetRow = event.target.closest('[data-template-chapter-row]');
    if (targetRow && targetRow !== state.draggedChapter) {
      event.preventDefault();
      if (targetRow.classList.contains('is-template-drop-after')) targetRow.parentNode.insertBefore(state.draggedChapter, targetRow.nextElementSibling);
      else targetRow.parentNode.insertBefore(state.draggedChapter, targetRow);
    }
    clearTemplateChapterDrag();
    syncTemplateEditor();
  });

  document.addEventListener('dragend', function handleTemplateDragEnd() {
    if (!state.draggedChapter) return;
    clearTemplateChapterDrag();
    syncTemplateEditor();
  });

  function handleRoute() {
    if (!global.location.hash || global.location.hash === '#') {
      stopReplay();
      state.activeSessionId = scenario.id;
      state.stage = scenario.result.stage;
      state.waitingFor = null;
      state.composerDraft = '';
      state.thoughtRevision = '';
      state.thoughtDraft = scenario.interaction.originalText;
      state.thoughtRevisionTarget = scenario.interaction.target;
      state.thoughtEditorOpen = false;
      state.thoughtEditorTarget = null;
      renderShell();
      return;
    }
    var templateMatch = global.location.hash.match(/^#\/templates(?:\/([^/]+))?$/);
    if (templateMatch) {
      stopReplay();
      renderTemplateShell(templateMatch[1] ? decodeURIComponent(templateMatch[1]) : null);
      return;
    }
    var match = global.location.hash.match(/^#\/chat\/(.+)$/);
    if (!match) {
      renderUnavailableRoute();
      return;
    }
    var id = decodeURIComponent(match[1]);
    var exists = allSessions().some(function sessionExists(item) { return item.id === id; });
    if (!exists) {
      renderUnavailableRoute();
      return;
    }
    stopReplay();
    state.activeSessionId = id;
    state.stage = scenario.result.stage;
    state.waitingFor = null;
    state.composerDraft = '';
    state.thoughtRevision = '';
    state.thoughtDraft = scenario.interaction.originalText;
    state.thoughtRevisionTarget = scenario.interaction.target;
    state.thoughtEditorOpen = false;
    state.thoughtEditorTarget = null;
    renderShell();
  }

  global.addEventListener('hashchange', handleRoute);
  handleRoute();
})(window, document);

(function definePreviewUi(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var activeMetadataCard = null;
  var metadataCloseTimer = null;
  var metadataPositionFrame = null;
  var suppressedMetadataFocusTrigger = null;
  var metadataDocumentEventsBound = false;

  var metadataLabels = {
    chunkId: "Chunk ID", index: "序号", order: "序号", origin: "生成来源", manualOperation: "人工操作", characterCount: "字符数", status: "状态", statusLabel: "状态说明",
    fileName: "文件名", documentName: "文件名", sectionPath: "章节路径", headingPath: "标题路径", pageNumber: "页码", tableId: "表格 ID", coordinates: "页面坐标", prevChunkId: "上一片", nextChunkId: "下一片", parentChunkId: "父块 ID",
    knowledgeBaseId: "知识库 ID", indexId: "索引 ID", indexRevisionId: "索引版本 ID", indexStatus: "索引状态", vectorStatus: "向量状态", tags: "标签", relations: "关系", relationCount: "关系数", chunkType: "层级类型", hierarchyLevel: "层级", retrievalRole: "检索角色", contextExpansion: "上下文扩展",
    sourceChunkId: "源切片 ID", sourceDocumentId: "源文档 ID", chunkSetId: "切片集 ID", fileId: "文件 ID", fileVersionId: "文件版本 ID", documentId: "知识库文档 ID", parseResultId: "解析结果 ID", embeddingRecordId: "向量记录 ID", embeddingModelId: "向量模型 ID", embeddingModelAlias: "向量模型", embeddingDimension: "向量维度", vectorDimension: "向量维度", modelId: "模型 ID", modelConfigKey: "模型配置标识", contentHash: "内容指纹", inputHash: "向量输入指纹", createdAt: "创建时间", updatedAt: "更新时间"
  };

  var identificationKeys = ["chunkType", "hierarchyLevel"];
  var documentLevelKeys = ["origin", "manualOperation", "status", "statusLabel"];
  var locationKeys = ["fileName", "documentName", "sectionPath", "headingPath", "pageNumber", "tableId", "coordinates", "prevChunkId", "nextChunkId", "parentChunkId"];
  var retrievalKeys = ["knowledgeBaseId", "indexId", "indexRevisionId", "indexStatus", "vectorStatus", "tags", "relations", "relationCount", "retrievalRole", "contextExpansion"];
  var technicalKeys = ["sourceChunkId", "sourceDocumentId", "chunkSetId", "fileId", "fileVersionId", "documentId", "parseResultId", "embeddingRecordId", "embeddingModelId", "embeddingModelAlias", "embeddingDimension", "vectorDimension", "modelId", "modelConfigKey", "contentHash", "inputHash", "createdAt", "updatedAt"];

  function split(options) {
    var opts = options || {};
    var toolbar = opts.toolbar ? '<div class="preview-workspace__toolbar">' + opts.toolbar + "</div>" : "";
    var sourceHeader = opts.sourceHeader === false ? "" : '<header class="preview-workspace__pane-header"><h2>' + dom.escape(opts.sourceTitle || "源内容") + '</h2>' + (opts.sourceMeta ? '<span>' + dom.escape(opts.sourceMeta) + "</span>" : "") + "</header>";
    var resultHeader = opts.resultHeader === false ? "" : '<header class="preview-workspace__pane-header"><h2>' + dom.escape(opts.resultTitle || "预览") + '</h2>' + (opts.resultActions || "") + "</header>";
    return '<section class="preview-workspace' + (opts.className ? " " + dom.escape(opts.className) : "") + '">' + toolbar + '<div class="preview-workspace__panes">' +
      '<section class="preview-workspace__pane preview-workspace__pane--source">' + sourceHeader + '<div class="preview-workspace__pane-body">' + (opts.source || "") + "</div></section>" +
      '<section class="preview-workspace__pane preview-workspace__pane--result">' + resultHeader + '<div class="preview-workspace__pane-body">' + (opts.result || "") + "</div></section></div></section>";
  }

  function hasMetadataValue(value) { return value !== undefined && value !== null && value !== ""; }
  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") return Object.keys(value).sort().reduce(function sortObject(result, key) {
      if (typeof value[key] !== "function" && value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
    return value;
  }
  function stableJson(value) {
    try { return JSON.stringify(stableValue(value), null, 2); }
    catch (error) { return JSON.stringify({ error: "当前信息无法序列化" }, null, 2); }
  }
  function metadataValue(value) {
    if (typeof value === "boolean") return value ? "是" : "否";
    if (value && typeof value === "object") return stableJson(value).replace(/\n\s*/g, " ");
    return String(value);
  }
  function chunkMetadataGroups(chunk, index, characterCount) {
    var metadata = chunk.metadata || {};
    var values = {};
    Object.keys(metadata).forEach(function fromMetadata(key) { values[key] = metadata[key]; });
    Object.keys(chunk).forEach(function fromChunk(key) {
      if (["content", "text", "metadata", "id", "index", "order", "characterCount"].indexOf(key) < 0) values[key] = chunk[key];
    });
    var consumed = {};
    var groups = [
      { key: "identification", title: "识别信息", empty: "暂无识别信息", fields: [] },
      { key: "location", title: "来源定位", empty: "暂无原文定位信息", fields: [] },
      { key: "retrieval", title: "检索治理", empty: "当前切片未关联检索信息", fields: [] },
      { key: "technical", title: "技术信息", empty: "暂无其他技术信息", fields: [] }
    ];
    function add(group, key, value, display) {
      consumed[key] = true;
      if (!hasMetadataValue(value)) return;
      group.fields.push({ key: key, label: metadataLabels[key] || key, value: value, display: display });
    }
    function addKeys(group, keys) {
      keys.forEach(function addKnown(key) {
        var display = key === "chunkType" ? (values[key] === "child" ? "子块" : values[key] === "parent" ? "父块" : null) :
          key === "retrievalRole" ? (values[key] === "search" ? "参与检索" : values[key] === "context" ? "仅补充上下文" : null) :
          key === "contextExpansion" && values[key] === "parent" ? "命中后补充父块" : null;
        add(group, key, values[key], display);
      });
    }
    consumed.id = true; consumed.index = true; consumed.order = true; consumed.characterCount = true;
    documentLevelKeys.forEach(function skipDocumentLevel(key) { consumed[key] = true; });
    add(groups[0], "chunkId", chunk.id);
    add(groups[0], "index", chunk.index == null ? (chunk.order == null ? index + 1 : chunk.order) : chunk.index);
    add(groups[0], "characterCount", characterCount);
    addKeys(groups[0], identificationKeys);
    addKeys(groups[1], locationKeys);
    addKeys(groups[2], retrievalKeys);
    addKeys(groups[3], technicalKeys);
    Object.keys(values).sort().forEach(function addRemaining(key) {
      if (consumed[key] || !hasMetadataValue(values[key])) return;
      var lower = key.toLowerCase();
      var target = /(?:page|section|heading|table|coordinate|locator|position)/.test(lower) ? groups[1] :
        /(?:knowledge|index|vector|retriev|tag|relation)/.test(lower) ? groups[2] : groups[3];
      add(target, key, values[key]);
    });
    return groups;
  }

  function metadataPayload(groups) {
    return groups.reduce(function groupPayload(result, group) {
      result[group.key] = group.fields.reduce(function fieldPayload(fields, field) { fields[field.key] = field.value; return fields; }, {});
      return result;
    }, {});
  }
  function renderMetadataField(field) {
    var displayed = hasMetadataValue(field.display) ? field.display : metadataValue(field.value);
    var copy = field.key === "chunkId" ? '<button class="chunk-metadata-popover__copy" type="button" data-chunk-copy-id data-copy-value="' + dom.escape(String(field.value)) + '" aria-label="复制 Chunk ID">' + dom.icon("copy", 13) + '<span>复制</span></button>' : "";
    return '<div class="chunk-metadata-popover__row"><dt>' + dom.escape(field.label) + '</dt><dd><span>' + dom.escape(displayed) + "</span>" + copy + "</dd></div>";
  }
  function renderMetadataPopover(chunk, index, characterCount, popoverId, titleId) {
    var groups = chunkMetadataGroups(chunk, index, characterCount);
    var payload = stableJson(metadataPayload(groups));
    return '<section class="chunk-metadata-popover" id="' + dom.escape(popoverId) + '" role="dialog" aria-modal="false" aria-labelledby="' + dom.escape(titleId) + '" hidden data-chunk-metadata-popover>' +
      '<header class="chunk-metadata-popover__header"><strong id="' + dom.escape(titleId) + '">切片信息</strong><button type="button" class="chunk-metadata-popover__close" data-chunk-metadata-close aria-label="关闭切片信息">' + dom.icon("x", 15) + "</button></header>" +
      '<div class="chunk-metadata-popover__groups">' + groups.map(function renderGroup(group) {
        return '<section class="chunk-metadata-popover__group"><h3>' + group.title + '</h3>' + (group.fields.length ? '<dl>' + group.fields.map(renderMetadataField).join("") + "</dl>" : '<p class="chunk-metadata-popover__empty">' + group.empty + "</p>") + "</section>";
      }).join("") + '</div><footer class="chunk-metadata-popover__footer"><span class="chunk-metadata-popover__feedback" data-chunk-copy-feedback role="status" aria-live="polite"></span><button class="btn btn--secondary btn--sm" type="button" data-chunk-copy-all>' + dom.icon("copy", 14) + '复制全部信息</button></footer>' +
      '<textarea class="chunk-metadata-popover__payload" tabindex="-1" aria-hidden="true" data-chunk-copy-payload>' + dom.escape(payload) + "</textarea></section>";
  }

  function chunkCards(chunks, options) {
    var opts = options || {};
    var items = chunks || [];
    return '<div class="chunk-preview-list' + (opts.grid ? " chunk-preview-list--responsive-grid" : "") + '">' + items.map(function renderChunk(chunk, index) {
      var content = chunk.content || chunk.text || "";
      var metadata = chunk.metadata || {};
      var chunkId = chunk.id || "";
      var cardKey = chunkId || String(opts.itemId || "chunk") + "-item-" + (index + 1);
      var idPrefix = String(opts.itemId || "list").replace(/[^a-zA-Z0-9_-]/g, "-") + "-" + (index + 1);
      var contentId = "chunk-content-" + idPrefix;
      var popoverId = "chunk-metadata-" + idPrefix;
      var titleId = popoverId + "-title";
      var characterCount = chunk.characterCount == null ? content.length : chunk.characterCount;
      var structure = [metadata.sectionPath, metadata.tableId && "表格 " + metadata.tableId, metadata.pageNumber && "第 " + metadata.pageNumber + " 页"].filter(Boolean).join(" · ");
      var manualLabel = chunk.manualOperation === "edit" ? "人工编辑" : "人工新增";
      var origin = chunk.origin === "manual" ? '<span class="tag chunk-preview-card__origin">' + manualLabel + "</span>" : "";
      var parentChunkId = chunk.parentChunkId || metadata.parentChunkId;
      var hierarchy = parentChunkId ? '<span class="tag chunk-preview-card__hierarchy" title="父块 ID：' + dom.escape(parentChunkId) + '">子块</span>' : "";
      var badges = '<span class="chunk-preview-card__badges">' + origin + hierarchy + '</span>';
      var metaLabel = structure || (chunk.origin === "manual" ? "" : "原文件切片");
      var actions = typeof opts.actions === "function" ? opts.actions(chunk, index) : "";
      var edit = typeof opts.edit === "function" ? opts.edit(chunk, index) : null;
      var editControl = edit ? '<button class="chunk-card-icon-button chunk-edit-trigger" type="button" data-chunk-edit-trigger ' + (edit.attrs || "") + ' aria-label="' + dom.escape(edit.label || "编辑切片") + '" title="' + dom.escape(edit.label || "编辑切片") + '">' + dom.icon("pencil", 14) + "</button>" : "";
      var remove = typeof opts.remove === "function" ? opts.remove(chunk, index) : null;
      var removeControl = remove ? '<button class="chunk-card-icon-button chunk-delete-trigger" type="button" ' + (remove.attrs || "") + ' aria-label="' + dom.escape(remove.label || "删除切片") + '" title="' + dom.escape(remove.label || "删除切片") + '">' + dom.icon("trash-2", 14) + "</button>" : "";
      var metadataLabel = chunkId ? "查看切片 " + chunkId + " 的信息" : "查看第 " + (index + 1) + " 个切片的信息";
      var metadataEnabled = opts.metadata !== false;
      var metadataControl = metadataEnabled ? '<button class="chunk-card-icon-button chunk-metadata-trigger" type="button" data-chunk-metadata-trigger aria-label="' + dom.escape(metadataLabel) + '" title="' + dom.escape(metadataLabel) + '" aria-expanded="false" aria-haspopup="dialog" aria-controls="' + dom.escape(popoverId) + '">' + dom.icon("info", 15) + "</button>" : "";
      var tools = metadataControl + editControl + removeControl;
      var expandSubject = chunkId ? "切片 " + chunkId : "第 " + (index + 1) + " 个切片";
      var expandLabel = "展开" + expandSubject;
      var expandControl = '<button class="chunk-card-icon-button chunk-expand-trigger" type="button" data-chunk-expand data-chunk-expand-subject="' + dom.escape(expandSubject) + '" aria-label="' + dom.escape(expandLabel) + '" title="' + dom.escape(expandLabel) + '" aria-expanded="false" aria-controls="' + dom.escape(contentId) + '">' + dom.icon("chevron-down", 15) + "</button>";
      return '<article class="chunk-preview-card file-asset-chunk' + (edit || remove ? " chunk-preview-card--editable" : "") + '" data-chunk-preview-card="' + dom.escape(cardKey) + '" data-section-path="' + dom.escape(String(chunk.metadata && (chunk.metadata.sectionPath || chunk.metadata.headingPath) || "")) + '"><header><span class="chunk-preview-card__number">#' + String(chunk.index || chunk.order || index + 1).padStart(2, "0") + '</span><strong>' + dom.escape(chunkId || "未分配 ID") + '</strong>' + badges + '<span class="chunk-preview-card__characters">' + dom.formatNumber(characterCount) + ' 字符</span></header>' + (tools ? '<div class="chunk-preview-card__tools">' + tools + "</div>" : "") + (metadataEnabled ? renderMetadataPopover(chunk, index, characterCount, popoverId, titleId) : "") +
        (metaLabel ? '<div class="file-asset-chunk__meta">' + dom.escape(metaLabel) + "</div>" : "") + '<p class="chunk-preview-card__content" id="' + dom.escape(contentId) + '">' + dom.escape(content) + '</p><div class="file-asset-chunk__actions">' + actions + expandControl + "</div></article>";
    }).join("") + "</div>";
  }

  function metadataElements(card) {
    var trigger = card && card.querySelector("[data-chunk-metadata-trigger]");
    var popoverId = trigger && trigger.getAttribute("aria-controls");
    return { trigger: trigger, popover: popoverId && document.getElementById(popoverId) || card && card.querySelector("[data-chunk-metadata-popover]") };
  }
  function cancelMetadataClose() { if (metadataCloseTimer) window.clearTimeout(metadataCloseTimer); metadataCloseTimer = null; }
  function cancelMetadataPosition() {
    if (metadataPositionFrame) window.cancelAnimationFrame(metadataPositionFrame);
    metadataPositionFrame = null;
  }
  function positionMetadataPopover(card) {
    if (!card || card !== activeMetadataCard) return;
    var elements = metadataElements(card);
    if (!elements.trigger || !elements.trigger.isConnected || !elements.popover || elements.popover.hidden) {
      closeMetadata(card, false);
      return;
    }
    var triggerRect = elements.trigger.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    var viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    var viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    if (triggerRect.bottom < 0 || triggerRect.top > viewportHeight || triggerRect.right < 0 || triggerRect.left > viewportWidth) {
      closeMetadata(card, false);
      return;
    }
    var margin = 12;
    var gap = 8;
    var availableWidth = Math.max(160, viewportWidth - margin * 2);
    var width = Math.min(570, Math.max(280, cardRect.width - 24), availableWidth);
    elements.popover.style.visibility = "hidden";
    elements.popover.style.width = Math.floor(width) + "px";
    elements.popover.style.maxHeight = Math.max(160, viewportHeight - margin * 2) + "px";
    var naturalHeight = Math.min(640, elements.popover.scrollHeight);
    var availableBelow = viewportHeight - triggerRect.bottom - gap - margin;
    var availableAbove = triggerRect.top - gap - margin;
    var placeAbove = availableBelow < naturalHeight && availableAbove > availableBelow;
    var availableHeight = Math.max(160, placeAbove ? availableAbove : availableBelow);
    var maxHeight = Math.min(640, availableHeight);
    elements.popover.style.maxHeight = Math.floor(maxHeight) + "px";
    var renderedHeight = Math.min(elements.popover.scrollHeight, maxHeight);
    var top = placeAbove ? triggerRect.top - gap - renderedHeight : triggerRect.bottom + gap;
    top = Math.max(margin, Math.min(top, viewportHeight - margin - renderedHeight));
    var left = Math.max(margin, Math.min(triggerRect.right - width, viewportWidth - margin - width));
    elements.popover.style.top = Math.round(top) + "px";
    elements.popover.style.left = Math.round(left) + "px";
    elements.popover.style.visibility = "";
    elements.popover.dataset.placement = placeAbove ? "top" : "bottom";
  }
  function requestMetadataPosition() {
    if (!activeMetadataCard || metadataPositionFrame) return;
    metadataPositionFrame = window.requestAnimationFrame(function positionOnFrame() {
      metadataPositionFrame = null;
      positionMetadataPopover(activeMetadataCard);
    });
  }
  function bindMetadataPopoverEvents(card, popover) {
    if (!popover || popover.getAttribute("data-chunk-metadata-events-bound") === "true") return;
    popover.setAttribute("data-chunk-metadata-events-bound", "true");
    popover.addEventListener("mouseenter", cancelMetadataClose);
    popover.addEventListener("mouseleave", function leavePopover() { scheduleMetadataClose(card); });
    popover.addEventListener("focusin", cancelMetadataClose);
    popover.addEventListener("focusout", function leavePopoverFocus(event) {
      if (!isMetadataControl(card, event.relatedTarget)) scheduleMetadataClose(card);
    });
  }
  function closeMetadata(card, restoreFocus) {
    if (!card) return;
    cancelMetadataClose();
    cancelMetadataPosition();
    var elements = metadataElements(card);
    card.classList.remove("is-metadata-open");
    card.removeAttribute("data-chunk-metadata-pinned");
    if (elements.popover) {
      elements.popover.hidden = true;
      elements.popover.removeAttribute("data-placement");
      elements.popover.removeAttribute("style");
      if (elements.trigger && elements.trigger.isConnected) elements.trigger.insertAdjacentElement("afterend", elements.popover);
      else elements.popover.remove();
    }
    if (elements.trigger) {
      elements.trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus && elements.trigger.isConnected && document.activeElement !== elements.trigger) {
        suppressedMetadataFocusTrigger = elements.trigger;
        elements.trigger.focus({ preventScroll: true });
        window.setTimeout(function releaseFocusSuppression() {
          if (suppressedMetadataFocusTrigger === elements.trigger) suppressedMetadataFocusTrigger = null;
        }, 0);
      }
    }
    if (activeMetadataCard === card) activeMetadataCard = null;
  }
  function dismissChunkMetadata() {
    if (activeMetadataCard) closeMetadata(activeMetadataCard, false);
  }
  function openMetadata(card, pinned) {
    if (!card) return;
    cancelMetadataClose();
    if (activeMetadataCard && activeMetadataCard !== card) closeMetadata(activeMetadataCard, false);
    var elements = metadataElements(card);
    if (!elements.trigger || !elements.popover) return;
    activeMetadataCard = card;
    card.classList.add("is-metadata-open");
    if (pinned) card.setAttribute("data-chunk-metadata-pinned", "true"); else card.removeAttribute("data-chunk-metadata-pinned");
    bindMetadataPopoverEvents(card, elements.popover);
    document.body.appendChild(elements.popover);
    elements.popover.hidden = false;
    elements.trigger.setAttribute("aria-expanded", "true");
    positionMetadataPopover(card);
  }
  function scheduleMetadataClose(card) {
    cancelMetadataClose();
    if (!card || card.getAttribute("data-chunk-metadata-pinned") === "true") return;
    metadataCloseTimer = window.setTimeout(function closePreview() { closeMetadata(card, false); }, 140);
  }
  function isMetadataControl(card, node) {
    var elements = metadataElements(card);
    return Boolean(node && (elements.trigger && elements.trigger.contains(node) || elements.popover && elements.popover.contains(node)));
  }
  function legacyCopy(text) {
    var field = document.createElement("textarea");
    field.value = text; field.setAttribute("readonly", ""); field.style.position = "fixed"; field.style.opacity = "0"; document.body.appendChild(field); field.select();
    var copied = false;
    try { copied = document.execCommand("copy"); } catch (error) { copied = false; }
    field.remove();
    return copied;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function copied() { return true; }).catch(function fallback() { return legacyCopy(text); });
    return Promise.resolve(legacyCopy(text));
  }
  function copyFeedback(card, message) {
    var elements = metadataElements(card);
    var feedback = elements.popover && elements.popover.querySelector("[data-chunk-copy-feedback]");
    if (!feedback) return;
    feedback.textContent = message;
    window.setTimeout(function clearFeedback() { if (feedback.isConnected && feedback.textContent === message) feedback.textContent = ""; }, 1800);
  }
  function bindMetadataDocumentEvents() {
    if (metadataDocumentEventsBound) return;
    metadataDocumentEventsBound = true;
    document.addEventListener("pointerdown", function closeOnOutsidePointer(event) {
      if (!activeMetadataCard || isMetadataControl(activeMetadataCard, event.target)) return;
      var focusableTarget = event.target.closest && event.target.closest("button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])");
      closeMetadata(activeMetadataCard, !focusableTarget);
    }, true);
    document.addEventListener("click", function handleMetadataPopoverAction(event) {
      var close = event.target.closest && event.target.closest("[data-chunk-metadata-close]");
      if (close && activeMetadataCard) { closeMetadata(activeMetadataCard, true); return; }
      var copyId = event.target.closest && event.target.closest("[data-chunk-copy-id]");
      var copyAll = event.target.closest && event.target.closest("[data-chunk-copy-all]");
      if (!activeMetadataCard || !copyId && !copyAll) return;
      var copyButton = copyId || copyAll;
      var elements = metadataElements(activeMetadataCard);
      if (!elements.popover || !elements.popover.contains(copyButton)) return;
      var copyCard = activeMetadataCard;
      var payload = elements.popover.querySelector("[data-chunk-copy-payload]");
      var text = copyId ? copyId.getAttribute("data-copy-value") : payload && payload.value;
      copyText(text || "").then(function copied(success) { copyFeedback(copyCard, success ? (copyId ? "Chunk ID 已复制" : "全部信息已复制") : "复制失败，请手动复制"); });
    });
    document.addEventListener("keydown", function closeOnEscape(event) {
      if (event.key !== "Escape" || !activeMetadataCard) return;
      event.preventDefault();
      event.stopPropagation();
      closeMetadata(activeMetadataCard, true);
    }, true);
    window.addEventListener("resize", requestMetadataPosition);
    document.addEventListener("scroll", requestMetadataPosition, true);
  }

  function bindChunkCards(root) {
    if (!root || root.getAttribute("data-chunk-cards-bound") === "true") return;
    root.setAttribute("data-chunk-cards-bound", "true");
    bindMetadataDocumentEvents();
    function setExpanded(card, expanded) {
      card.classList.toggle("is-expanded", expanded);
      var button = card.querySelector("[data-chunk-expand]");
      if (button) {
        var label = (expanded ? "收起" : "展开") + (button.getAttribute("data-chunk-expand-subject") || "切片");
        button.setAttribute("aria-expanded", expanded ? "true" : "false");
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
        button.innerHTML = dom.icon(expanded ? "chevron-up" : "chevron-down", 15);
        dom.hydrateIcons(button);
      }
    }
    function toggle(card, button) {
      var expanded = button.getAttribute("aria-expanded") === "true";
      root.querySelectorAll("[data-chunk-preview-card]").forEach(function collapse(other) { if (other !== card) setExpanded(other, false); });
      setExpanded(card, !expanded);
    }
    root.addEventListener("click", function handleChunkAction(event) {
      var trigger = event.target.closest("[data-chunk-metadata-trigger]");
      if (trigger && root.contains(trigger)) {
        event.preventDefault();
        var triggerCard = trigger.closest("[data-chunk-preview-card]");
        if (triggerCard && triggerCard.getAttribute("data-chunk-metadata-pinned") === "true") closeMetadata(triggerCard, true);
        else {
          openMetadata(triggerCard, true);
          var opened = metadataElements(triggerCard);
          var closeButton = opened.popover && opened.popover.querySelector("[data-chunk-metadata-close]");
          if (closeButton) closeButton.focus({ preventScroll: true });
        }
        return;
      }
      var button = event.target.closest("[data-chunk-expand]");
      if (!button) return;
      var card = button.closest("[data-chunk-preview-card]");
      if (card) toggle(card, button);
    });
    root.addEventListener("mouseover", function previewMetadata(event) {
      var target = event.target.closest("[data-chunk-metadata-trigger], [data-chunk-metadata-popover]");
      if (!target || !root.contains(target)) return;
      var card = target.closest("[data-chunk-preview-card]");
      cancelMetadataClose();
      if (target.matches("[data-chunk-metadata-trigger]") && card && card.getAttribute("data-chunk-metadata-pinned") !== "true") openMetadata(card, false);
    });
    root.addEventListener("mouseout", function stopMetadataPreview(event) {
      var target = event.target.closest("[data-chunk-metadata-trigger], [data-chunk-metadata-popover]");
      if (!target || !root.contains(target)) return;
      var card = target.closest("[data-chunk-preview-card]");
      if (!isMetadataControl(card, event.relatedTarget)) scheduleMetadataClose(card);
    });
    root.addEventListener("focusin", function focusMetadata(event) {
      var trigger = event.target.closest("[data-chunk-metadata-trigger]");
      if (!trigger || !root.contains(trigger)) return;
      if (trigger === suppressedMetadataFocusTrigger) {
        suppressedMetadataFocusTrigger = null;
        return;
      }
      openMetadata(trigger.closest("[data-chunk-preview-card]"), false);
    });
    root.addEventListener("focusout", function blurMetadata(event) {
      var card = event.target.closest("[data-chunk-preview-card]");
      if (card && !isMetadataControl(card, event.relatedTarget)) scheduleMetadataClose(card);
    });
  }

  OpsDemo.ui.preview = { split: split, chunkCards: chunkCards, bindChunkCards: bindChunkCards, dismissChunkMetadata: dismissChunkMetadata };
})(window.OpsDemo);

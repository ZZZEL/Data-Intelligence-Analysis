(function defineLocalDocumentsPage(window, OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;
  var router = OpsDemo.core.router;
  var store = OpsDemo.core.store;
  var actions = OpsDemo.core.actions;
  var directoryTree = OpsDemo.ui.directoryTree;
  var sourcePreviewUrl = null;
  var unsubscribe = null;
  var activeRoute = null;
  var collapsedFolderIds = new Set();
  var inlineFolderEditor = null;
  var pendingFolderNameClick = null;
  var FOLDER_NAME_CLICK_DELAY = 260;
  var localDocumentPage = 1;
  var paginationResizeObserver = null;
  var paginationResizeHandler = null;
  var paginationResizeFrame = null;

  function esc(value) { return dom.escape(value); }
  function number(value) { return dom.formatNumber(value); }
  function find(items, id) { return (items || []).find(function match(item) { return item.id === id; }) || null; }
  function displayDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return esc(value);
    var pad = function pad(part) { return String(part).padStart(2, "0"); };
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }
  function dateCell(value) {
    var label = displayDate(value);
    return '<time class="file-asset-date" datetime="' + esc(value || "") + '" title="' + label + '">' + label + '</time>';
  }
  function details(fileId, route) {
    return actions.getFileAssetDetail(fileId);
  }
  function stateLabel(status) {
    var labels = {
      uploaded: ["未处理", "neutral"], processing: ["处理中", "info"],
      parsed: ["已解析", "success"], failed: ["异常", "danger"]
    };
    return labels[status] || labels.uploaded;
  }
  function globalStatus(detail) {
    var processing = detail.processingState;
    var status = typeof processing === "string" ? processing : processing && processing.status;
    if (status === "failed") return "failed";
    if (["queued", "waiting_parse", "parsing", "processing"].indexOf(status) >= 0) return "processing";
    if (status === "parsed" || detail.parseResult && detail.parseResult.status === "ready") return "parsed";
    return "uploaded";
  }
  function badge(status) {
    var label = stateLabel(status);
    return dom.status(label[0], label[1]);
  }
  function localAssets(state) {
    return (state.fileAssets || []).slice().sort(function newest(a, b) {
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
  }
  function localFolders(state) {
    return (state.documentFolders || []).slice();
  }
  function selectedFolderId(state, route) {
    var requested = route && route.query && route.query.folder;
    return requested && find(localFolders(state), requested) ? requested : "all";
  }
  function clearPendingFolderNameClick() {
    if (!pendingFolderNameClick) return;
    window.clearTimeout(pendingFolderNameClick);
    pendingFolderNameClick = null;
  }
  function navigateToFolder(folderId) {
    if (folderId && folderId !== "all") collapsedFolderIds.delete(folderId);
    router.navigate(folderId === "all" ? "local-documents" : "local-documents?folder=" + encodeURIComponent(folderId));
  }
  function scheduleFolderSelection(folderId) {
    clearPendingFolderNameClick();
    pendingFolderNameClick = window.setTimeout(function openFolder() {
      pendingFolderNameClick = null;
      navigateToFolder(folderId);
    }, FOLDER_NAME_CLICK_DELAY);
  }
  function assetsForFolder(state, folderId) {
    var assets = localAssets(state);
    if (folderId === "all") return assets;
    return assets.filter(function inFolder(asset) {
      return directoryTree.includesFolder(localFolders(state), asset.folderId, folderId, "all");
    });
  }
  function folderLabel(state, folderId) {
    var folder = find(localFolders(state), folderId);
    return folder ? folder.name : "全部文档";
  }
  function renderDirectoryTree(state, folderId) {
    return directoryTree.render({
      folders: localFolders(state),
      items: localAssets(state),
      itemLabel: function itemName(asset) { return asset.name; },
      selectedId: folderId,
      collapsedIds: Array.from(collapsedFolderIds),
      scope: "local-documents",
      rootId: "all",
      rootLabel: "全部文档",
      rootIcon: "files",
      ariaLabel: "本地文档目录",
      showItems: false,
      editableFolders: true,
      editingFolderId: inlineFolderEditor && inlineFolderEditor.mode === "rename" ? inlineFolderEditor.folderId : null,
      editingFolderValue: inlineFolderEditor && inlineFolderEditor.mode === "rename" ? inlineFolderEditor.value : "",
      draftFolder: inlineFolderEditor && inlineFolderEditor.mode === "create" ? { parentId: inlineFolderEditor.parentId, beforeId: inlineFolderEditor.beforeId, value: inlineFolderEditor.value } : null
    });
  }
  function refreshDirectoryTree(root, state, folderId, focusEditor) {
    var treeHost = root.querySelector("[data-local-directory-tree-host]");
    if (!treeHost) return;
    treeHost.innerHTML = renderDirectoryTree(state, folderId);
    dom.hydrateIcons(treeHost);
    if (focusEditor) {
      var input = treeHost.querySelector("[data-directory-folder-input]");
      if (input) { input.focus(); input.select(); }
    }
  }
  function beginInlineFolderCreate(root, state, folderId) {
    var selected = find(localFolders(state), folderId);
    var parentId = selected ? selected.parentId || "all" : "all";
    inlineFolderEditor = { mode: "create", parentId: parentId, beforeId: selected && selected.id || null, value: "" };
    if (parentId !== "all") collapsedFolderIds.delete(parentId);
    refreshDirectoryTree(root, state, folderId, true);
  }
  function beginInlineFolderRename(root, state, folderId, selectedId) {
    var folder = find(localFolders(state), folderId);
    if (!folder) return;
    clearPendingFolderNameClick();
    inlineFolderEditor = { mode: "rename", folderId: folder.id, value: folder.name };
    refreshDirectoryTree(root, state, selectedId, true);
  }
  function folderNameExists(state, editor, name) {
    var current = editor.mode === "rename" ? find(localFolders(state), editor.folderId) : null;
    var parentId = editor.mode === "create" ? (editor.parentId === "all" ? null : editor.parentId) : current && current.parentId || null;
    return localFolders(state).some(function duplicate(folder) {
      return folder.id !== (current && current.id) && (folder.parentId || null) === parentId && String(folder.name).toLocaleLowerCase() === name.toLocaleLowerCase();
    });
  }
  function finishInlineFolderEdit(root, route, input) {
    var editor = inlineFolderEditor;
    if (!editor || !input || input.dataset.directoryFolderMode !== editor.mode) return;
    var state = store.getState();
    var folderId = selectedFolderId(state, route);
    var name = input.value.trim();
    editor.value = input.value;
    if (!name) {
      inlineFolderEditor = null;
      refreshDirectoryTree(root, state, folderId, false);
      return;
    }
    if (folderNameExists(state, editor, name)) {
      input.setAttribute("aria-invalid", "true");
      overlay.toast("文件夹名称已存在", "请使用当前层级内未使用的名称。", "warning");
      window.setTimeout(function restoreFocus() { if (input.isConnected) { input.focus(); input.select(); } }, 0);
      return;
    }
    var current = editor.mode === "rename" ? find(localFolders(state), editor.folderId) : null;
    if (current && current.name === name) {
      inlineFolderEditor = null;
      refreshDirectoryTree(root, state, folderId, false);
      return;
    }
    inlineFolderEditor = null;
    var result = editor.mode === "create"
      ? actions.createDocumentFolder({ name: name, parentId: editor.parentId === "all" ? null : editor.parentId, position: editor.beforeId ? "before" : "first", beforeFolderId: editor.beforeId })
      : actions.renameDocumentFolder(editor.folderId, name);
    if (!result) overlay.toast("无法保存文件夹", "请检查文件夹名称后重试。", "warning");
  }
  function renderDirectoryPath(state, folderId) {
    return directoryTree.breadcrumb({ folders: localFolders(state), selectedId: folderId, scope: "local-documents", rootId: "all", rootLabel: "全部文档" });
  }
  function renderFilePath(state, asset, fileName) {
    return directoryTree.breadcrumb({
      folders: localFolders(state),
      selectedId: asset.folderId,
      rootId: "all",
      rootLabel: "全部文档",
      leafId: asset.id,
      leafLabel: fileName,
      interactive: false,
      ariaLabel: "文件路径"
    });
  }
  function renderRow(state, asset) {
    var detail = details(asset.id);
    if (!detail || !detail.version) return "";
    var version = detail.version;
    var status = globalStatus(detail);
    var refs = detail.references || [];
    var name = version.name || asset.name;
    var referenceCell = refs.length ? '<button class="table-action" type="button" data-local-document-references="' + esc(asset.id) + '">' + number(refs.length) + ' 个知识库</button>' : '<span class="table-secondary file-asset-reference-empty">未被引用</span>';
    return '<tr data-local-document-row data-local-document-id="' + esc(asset.id) + '" data-local-document-status="' + esc(status) + '" data-local-document-search="' + esc((name + " " + asset.id).toLowerCase()) + '">' +
      '<td><button class="table-primary table-primary--link" type="button" data-local-document-preview="' + esc(asset.id) + '">' + esc(name) + '</button>' + (asset.sourceType === "enterprise_snapshot" ? '<div class="table-secondary">企业数据快照</div>' : "") + '</td>' +
      '<td>' + badge(status) + '</td><td>' + referenceCell + '</td>' +
      '<td>' + esc(version.fileSizeLabel || "—") + '</td><td>' + dateCell(version.createdAt || asset.createdAt) + '</td>' +
      '<td><div class="knowledge-row-actions"><button class="table-action" type="button" data-local-document-preview="' + esc(asset.id) + '">详情</button><button class="table-action" type="button" data-local-document-move="' + esc(asset.id) + '">移动</button><button class="table-action table-action--danger" type="button" data-local-document-delete="' + esc(asset.id) + '">删除</button></div></td></tr>';
  }
  function renderPagination(totalItems) {
    var currentPage = totalItems ? 1 : 0;
    var totalPages = currentPage;
    return '<nav class="local-documents-pagination" aria-label="文档分页" data-local-document-pagination>' +
      '<button type="button" class="local-documents-pagination__button" data-local-document-page="previous" aria-label="上一页" title="上一页" disabled>' + dom.icon("chevron-left", 15) + '</button>' +
      '<span class="local-documents-pagination__status" data-local-document-page-status aria-live="polite">第 ' + currentPage + " / " + totalPages + ' 页</span>' +
      '<button type="button" class="local-documents-pagination__button" data-local-document-page="next" aria-label="下一页" title="下一页"' + (totalPages > 1 ? "" : " disabled") + '>' + dom.icon("chevron-right", 15) + "</button></nav>";
  }
  function renderList(state, route) {
    var folderId = selectedFolderId(state, route);
    var assets = assetsForFolder(state, folderId);
    var folder = find(localFolders(state), folderId);
    var uploadLabel = folder ? "上传到当前文件夹" : "上传文档";
    var createLabel = "新建文件夹";
    var folderActions = '<button type="button" class="document-directory-icon-action" data-local-folder-upload aria-label="' + uploadLabel + '" title="' + uploadLabel + '">' + dom.icon("upload", 15) + '</button><button type="button" class="document-directory-icon-action" data-local-folder-create-child aria-label="' + createLabel + '" title="' + createLabel + '">' + dom.icon("folder-plus", 15) + "</button>";
    if (folder && !folder.system) folderActions += '<button type="button" class="document-directory-icon-action document-directory-icon-action--danger" data-local-folder-delete="' + esc(folder.id) + '" aria-label="删除文件夹" title="删除空文件夹">' + dom.icon("trash-2", 15) + "</button>";
    return dom.pageHeader({
      title: "文档管理",
      actions: dom.button("上传文档", { variant: "primary", icon: "upload", attrs: "data-local-document-upload" }),
      toolbar: { search: { placeholder: "搜索文档", attrs: "data-local-document-search" }, filters: dom.headerFilter("状态", '<select class="select-field local-documents__status-filter" data-local-document-status-filter aria-label="筛选状态"><option value="all">全部状态</option><option value="uploaded">未处理</option><option value="processing">处理中</option><option value="parsed">已解析</option><option value="failed">异常</option></select>') }
    }) + '<div class="page-content creation-page local-documents-page"><section class="panel creation-panel local-documents"><div class="document-directory-browser"><aside class="document-directory-sidebar"><div class="document-directory-sidebar__toolbar" aria-label="目录操作">' + folderActions + '</div><div data-local-directory-tree-host>' + renderDirectoryTree(state, folderId) + '</div></aside><div class="document-directory-content"><div class="document-directory-context">' + renderDirectoryPath(state, folderId) + '</div><div class="table-wrap" data-local-document-table-wrap' + (assets.length ? "" : " hidden") + '><table class="data-table knowledge-table local-documents-table file-assets-table"><thead><tr><th>文档</th><th>状态</th><th>知识库引用</th><th>大小</th><th>上传时间</th><th>操作</th></tr></thead><tbody data-local-document-table>' + assets.map(function row(asset) { return renderRow(state, asset); }).join("") + '</tbody></table></div><div class="local-documents__empty document-directory-empty" data-local-document-empty' + (assets.length ? " hidden" : "") + '>' + dom.empty("当前文件夹为空", "可上传文档，或将已有文档移动到此文件夹。", "folder-open") + '</div></div></div><div class="table-footer local-documents__footer"><span data-local-document-count>当前目录 ' + number(assets.length) + ' 个文档</span>' + renderPagination(assets.length) + "</div></section></div>";
  }
  function openMoveDocument(state, fileId) {
    var detail = details(fileId);
    if (!detail || !detail.asset) return;
    var targetFolderId = detail.asset.folderId;
    var collapsedIds = [];
    function picker(current, open) {
      return '<details class="upload-folder-picker" data-document-move-picker' + (open ? " open" : "") + '>' + directoryTree.folderPicker({ folders: localFolders(current), items: localAssets(current), selectedId: targetFolderId, collapsedIds: collapsedIds, scope: "local-document-move-target", rootId: "all", rootLabel: "全部文档", rootIcon: "files", ariaLabel: "选择文档移动的目标位置", pathAttrs: "data-document-move-path", treeAttrs: "data-document-move-tree" }) + "</details>";
    }
    overlay.confirm({
      title: "移动文档",
      confirmLabel: "移动",
      body: '<div class="document-folder-form"><div data-document-move-picker-host>' + picker(state, false) + "</div></div>",
      onConfirm: function move() {
        if (targetFolderId === detail.asset.folderId) {
          overlay.toast("请选择其他位置", "当前文档已在该文件夹中。", "warning");
          return false;
        }
        var result = actions.moveLocalDocumentAsset(fileId, targetFolderId);
        if (!result) { overlay.toast("无法移动文档", "请选择有效的目标文件夹。", "warning"); return false; }
        overlay.toast("文档已移动", folderLabel(store.getState(), result.folderId), "success");
        return true;
      }
    });
    var pickerHost = document.querySelector("#overlay-root [data-document-move-picker-host]");
    if (!pickerHost) return;
    pickerHost.addEventListener("click", function selectMoveTarget(event) {
      var button = event.target.closest("[data-directory-select], [data-directory-toggle]");
      if (!button || button.dataset.directoryScope !== "local-document-move-target") return;
      var current = store.getState();
      if (button.dataset.directoryToggle) {
        var index = collapsedIds.indexOf(button.dataset.directoryToggle);
        if (index >= 0) collapsedIds.splice(index, 1);
        else collapsedIds.push(button.dataset.directoryToggle);
        pickerHost.innerHTML = picker(current, true);
      } else {
        var requested = find(localFolders(current), button.dataset.directorySelect);
        if (!requested) return;
        targetFolderId = requested.id;
        var collapsedIndex = collapsedIds.indexOf(targetFolderId);
        if (collapsedIndex >= 0) collapsedIds.splice(collapsedIndex, 1);
        pickerHost.innerHTML = picker(current, false);
      }
      dom.hydrateIcons(pickerHost);
    });
  }
  function sourceText(detail) {
    return detail.version && detail.version.sourcePreview || "";
  }
  function releasePreview() {
    if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
    sourcePreviewUrl = null;
  }
  function renderSource(detail) {
    var version = detail.version;
    var source = version.sourceFile;
    var sourceUrl = version.sourceUrl || "";
    var mime = version.mimeType || "";
    var name = version.name || detail.asset.name;
    if (source && /^(application\/pdf|image\/)/.test(mime)) {
      sourcePreviewUrl = URL.createObjectURL(source);
      if (mime === "application/pdf") return '<iframe class="local-document-source__pdf" src="' + esc(sourcePreviewUrl) + '" title="' + esc(name) + '原文件预览"></iframe>';
      return '<div class="local-document-source__image"><img src="' + esc(sourcePreviewUrl) + '" alt="' + esc(name) + '" /></div>';
    }
    if (sourceUrl && /^(application\/pdf|image\/)/.test(mime)) {
      if (mime === "application/pdf") return '<iframe class="local-document-source__pdf" src="' + esc(sourceUrl) + '" title="' + esc(name) + '原文件预览"></iframe>';
      return '<div class="local-document-source__image"><img src="' + esc(sourceUrl) + '" alt="' + esc(name) + '" /></div>';
    }
    var text = sourceText(detail);
    if (!text) return dom.empty("原文件已保存", source || sourceUrl ? "此格式暂不支持在线预览，可下载原文件查看。" : "此预置文件未内置原始二进制文件。", "file-text");
    return '<article class="document-source-preview"><div class="document-source-preview__page"><div class="document-source-preview__file">' + dom.icon("file-text", 17) + '<span>' + esc(name) + '</span></div><div class="document-source-preview__content">' + esc(text) + '</div></div></article>';
  }
  function activeReference(detail, route) {
    var refs = detail.references || [];
    return refs.find(function match(ref) { return ref.knowledgeBaseId === (route.query || {}).knowledgeBaseId; }) || refs[0] || null;
  }
  function chunksFor(state, detail, route) {
    var ref = activeReference(detail, route);
    if (ref) return (state.chunks || []).filter(function same(chunk) { return chunk.documentId === ref.id; }).sort(function order(a, b) { return (a.index || 0) - (b.index || 0); });
    return [];
  }
  function renderChunkCards(chunks, options) {
    return OpsDemo.ui.preview.chunkCards(chunks, {
      metadata: options && options.metadata === false ? false : undefined
    });
  }
  function referenceState(ref) {
    var status = ref && (ref.status || ref.lifecycleStatus || ref.currentStage) || "pending";
    if (ref && (ref.searchable || status === "ready" || status === "effective" || status === "completed")) return ["可检索", "success", "ready"];
    if (status === "failed" || status === "partial_failure") return ["异常", "danger", "failed"];
    if (status === "parsing") return ["解析中", "info", "processing"];
    if (status === "chunking") return ["切片中", "info", "processing"];
    if (status === "embedding" || status === "vectorizing") return ["向量化中", "info", "processing"];
    if (status === "indexing" || status === "pending_activation") return ["索引中", "info", "processing"];
    return ["待处理", "neutral", "pending"];
  }
  function renderResult(state, detail, route) {
    var refs = detail.references || [];
    if (!refs.length) return dom.empty("暂无知识库引用", "该文件尚未被知识库引用，请从知识库管理中选择文件并完成入库。", "book-open");
    var selected = activeReference(detail, route);
    var chunks = chunksFor(state, detail, route);
    var selectedState = referenceState(selected);
    var chunkContent = chunks.length ? renderChunkCards(chunks) : dom.empty(selectedState[2] === "failed" ? "入库异常" : selectedState[2] === "processing" ? "正在处理" : "暂无切片", selectedState[2] === "failed" ? "请进入对应知识库检查并重新处理。" : selectedState[2] === "processing" ? "完成解析、切片、向量化和索引后即可查看。" : "该知识库尚未生成可查看的切片。", selectedState[2] === "failed" ? "circle-alert" : "blocks");
    return '<section class="local-document-reference-chunks" aria-label="所选知识库切片"><header><h3>切片</h3><span>' + number(chunks.length) + ' 个</span></header>' + chunkContent + '</section>';
  }
  function routeTo(assetId, query) {
    var params = new URLSearchParams();
    Object.keys(query || {}).forEach(function add(key) { if (query[key]) params.set(key, query[key]); });
    return "local-documents/" + encodeURIComponent(assetId) + (String(params) ? "?" + params : "");
  }
  function renderPreview(state, route) {
    var detail = details(route.id, route);
    if (!detail || !detail.asset || !detail.version) return dom.pageHeader({ title: "文件预览", back: { label: "返回文档管理", route: "local-documents" } }) + '<div class="page-content">' + dom.empty("文件或引用不存在", "原文件或知识库引用可能已移除，请返回文档管理重新选择。", "file-x") + '</div>';
    var asset = detail.asset;
    var version = detail.version;
    var refs = detail.references || [];
    var ref = activeReference(detail, route);
    var options = refs.map(function option(item) { var kb = find(state.knowledgeBases, item.knowledgeBaseId); return kb ? '<option value="' + esc(kb.id) + '"' + (ref && ref.id === item.id ? " selected" : "") + '>' + esc(kb.name) + '</option>' : ""; }).filter(Boolean).join("");
    var contextSelect = '<label class="file-asset-select"><span>查看切片</span><select class="select-field" data-local-preview-kb-select aria-label="查看知识库切片"' + (options ? "" : " disabled") + '>' + (options || '<option value="" selected>暂无知识库引用</option>') + '</select></label>';
    var resultTitle = '<h2>知识库引用</h2>';
    var resultActions = '<div class="local-document-preview__result-actions">' + contextSelect + '</div>';
    var toolbar = '<div class="knowledge-preview-toolbar"><div class="knowledge-preview-toolbar__source"><h2>原文件</h2></div><div class="knowledge-preview-toolbar__result">' + resultTitle + resultActions + '</div></div>';
    var panel = OpsDemo.ui.preview.split({ className: "knowledge-chunk-preview local-document-preview", toolbar: toolbar, sourceHeader: false, source: renderSource(detail), resultHeader: false, result: '<div data-local-artifact-result>' + renderResult(state, detail, route) + '</div>' });
    var fileName = version.name || asset.name;
    var metadata = '<section class="file-asset-details" aria-label="文件信息"><dl><dt>文件 ID</dt><dd>' + esc(asset.id) + '</dd><dt>上传时间</dt><dd>' + displayDate(version.createdAt) + '</dd><dt>文件状态</dt><dd data-local-file-status>' + badge(globalStatus(detail)) + '</dd><dt>文件路径</dt><dd class="file-asset-details__path">' + renderFilePath(state, asset, fileName) + '</dd></dl></section>';
    return dom.pageHeader({ title: version.name || asset.name, back: { label: "返回文档管理", route: "local-documents" }, actions: dom.button("下载原文件", { icon: "download", attrs: 'data-local-preview-download' + (version.sourceFile || version.sourceUrl ? "" : ' title="预置演示数据未内置原始二进制文件"') }) }) + '<div class="page-content preview-page">' + metadata + panel + '</div>';
  }
  function renderReferenceList(state, detail) {
    var refs = detail && detail.references || [];
    var links = refs.map(function row(ref) {
      var kb = find(state.knowledgeBases, ref.knowledgeBaseId);
      if (!kb) return "";
      return '<a class="file-asset-reference-list__item" href="#/knowledge/' + encodeURIComponent(kb.id) + '?tab=documents"><span>' + esc(kb.name) + '</span>' + dom.icon("chevron-right", 15) + '</a>';
    }).filter(Boolean);
    if (!links.length) return '<p class="file-asset-reference-list__empty">暂无关联知识库</p>';
    return '<nav class="file-asset-reference-list" aria-label="关联知识库">' + links.join("") + '</nav>';
  }
  function render(route, state) {
    releasePreview();
    activeRoute = route;
    if (route.id === "upload") return OpsDemo.pages.knowledge.renderLocalImport(route, state);
    return route.id ? renderPreview(state, route) : renderList(state, route);
  }
  function confirmDeleteDocument(detail) {
    if (!detail) return;
    if ((detail.references || []).length) {
      overlay.open({ title: "文档正在被引用", confirmLabel: "知道了", cancelLabel: false, body: '<p>请先从以下知识库移除引用，再删除原文件。</p>' + renderReferenceList(store.getState(), detail) });
      return;
    }
    overlay.confirm({ title: "删除文档", confirmLabel: "确认删除", confirmVariant: "danger", body: '<p>确认删除“' + esc(detail.asset.name) + '”及其未被引用的解析记录？</p>', onConfirm: function confirm() {
      var result = actions.deleteLocalDocumentAsset(detail.asset.id);
      if (!result) { overlay.toast("无法删除", "请检查是否存在知识库引用或正在执行的任务。", "warning"); return false; }
      overlay.toast("文档已删除", "原文件及其未被引用的解析记录已移除。", "success");
      return true;
    } });
  }
  function downloadAsset(detail) {
    if (!detail || !detail.version) return false;
    var version = detail.version;
    var source = version.sourceFile;
    var name = version.name || detail.asset.name;
    if (version.sourceUrl) {
      var staticLink = document.createElement("a");
      staticLink.href = version.sourceUrl;
      staticLink.download = name;
      document.body.appendChild(staticLink);
      staticLink.click();
      staticLink.remove();
      return true;
    }
    if (!source) {
      overlay.toast("演示原文件未内置", "预置数据仅保留了可预览内容；上传真实文件后可下载原文件。", "info");
      return false;
    }
    var url = URL.createObjectURL(source);
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function release() { URL.revokeObjectURL(url); }, 0);
    return true;
  }
  function paginateDocumentRows(root, matchedRows) {
    if (!matchedRows.length) return [];
    var tableWrap = root.querySelector("[data-local-document-table-wrap]");
    var tableHead = root.querySelector(".local-documents-table thead");
    var matchedSet = new Set(matchedRows);
    Array.prototype.forEach.call(root.querySelectorAll("[data-local-document-row]"), function prepare(row) {
      row.hidden = !matchedSet.has(row);
    });
    if (!tableWrap || tableWrap.hidden) return [matchedRows];
    var headerHeight = tableHead ? tableHead.getBoundingClientRect().height : 0;
    var availableHeight = Math.floor(tableWrap.clientHeight - headerHeight);
    if (availableHeight <= 0) return [matchedRows];
    var pages = [];
    var page = [];
    var usedHeight = 0;
    matchedRows.forEach(function group(row) {
      var rowHeight = Math.max(1, Math.ceil(row.getBoundingClientRect().height || 52));
      if (page.length && usedHeight + rowHeight > availableHeight) {
        pages.push(page);
        page = [];
        usedHeight = 0;
      }
      page.push(row);
      usedHeight += rowHeight;
    });
    if (page.length) pages.push(page);
    return pages;
  }
  function applyFilters(root, resetPage) {
    var search = root.querySelector("[data-local-document-search]");
    var filter = root.querySelector("[data-local-document-status-filter]");
    var query = search ? search.value.trim().toLowerCase() : "";
    var value = filter ? filter.value : "all";
    var rows = Array.prototype.slice.call(root.querySelectorAll("[data-local-document-row]"));
    var matchedRows = rows.filter(function matches(row) {
      var status = row.dataset.localDocumentStatus;
      var match = value === "all" || status === value;
      return match && (!query || row.dataset.localDocumentSearch.indexOf(query) >= 0);
    });
    var table = root.querySelector("[data-local-document-table-wrap]");
    if (table) table.hidden = matchedRows.length === 0;
    var pages = paginateDocumentRows(root, matchedRows);
    var totalPages = pages.length;
    if (resetPage) localDocumentPage = 1;
    localDocumentPage = totalPages ? Math.min(Math.max(localDocumentPage || 1, 1), totalPages) : 0;
    var pageRows = totalPages ? pages[localDocumentPage - 1] : [];
    rows.forEach(function hide(row) { row.hidden = true; });
    pageRows.forEach(function show(row) { row.hidden = false; });
    var empty = root.querySelector("[data-local-document-empty]");
    var count = root.querySelector("[data-local-document-count]");
    var previous = root.querySelector('[data-local-document-page="previous"]');
    var next = root.querySelector('[data-local-document-page="next"]');
    var pageStatus = root.querySelector("[data-local-document-page-status]");
    if (empty) {
      empty.hidden = matchedRows.length > 0;
      if (matchedRows.length === 0 && rows.length > 0) {
        empty.innerHTML = dom.empty("未找到匹配文档", "请调整搜索关键词或状态筛选。", "search-x");
        dom.hydrateIcons(empty);
      }
    }
    if (count) count.textContent = matchedRows.length === rows.length ? "当前目录 " + number(rows.length) + " 个文档" : "当前目录匹配 " + number(matchedRows.length) + " / " + number(rows.length) + " 个文档";
    if (previous) previous.disabled = totalPages <= 1 || localDocumentPage <= 1;
    if (next) next.disabled = totalPages <= 1 || localDocumentPage >= totalPages;
    if (pageStatus) pageStatus.textContent = "第 " + localDocumentPage + " / " + totalPages + " 页";
  }
  function releasePaginationResize() {
    if (paginationResizeObserver) paginationResizeObserver.disconnect();
    if (paginationResizeHandler) window.removeEventListener("resize", paginationResizeHandler);
    if (paginationResizeFrame) window.cancelAnimationFrame(paginationResizeFrame);
    paginationResizeObserver = null;
    paginationResizeHandler = null;
    paginationResizeFrame = null;
  }
  function bindPaginationResize(root) {
    releasePaginationResize();
    var tableWrap = root.querySelector("[data-local-document-table-wrap]");
    if (!tableWrap) return;
    paginationResizeHandler = function resizePagination() {
      if (paginationResizeFrame) window.cancelAnimationFrame(paginationResizeFrame);
      paginationResizeFrame = window.requestAnimationFrame(function reflowPagination() {
        paginationResizeFrame = null;
        if (root.isConnected && activeRoute && !activeRoute.id) applyFilters(root, false);
      });
    };
    if (typeof window.ResizeObserver === "function") {
      paginationResizeObserver = new window.ResizeObserver(paginationResizeHandler);
      paginationResizeObserver.observe(tableWrap);
    } else {
      window.addEventListener("resize", paginationResizeHandler);
    }
  }
  function mount(root, route) {
    activeRoute = route;
    if (route.id && route.query && route.query.view === "parsed") {
      var normalizedQuery = Object.assign({}, route.query, { view: "chunks" });
      var normalizedHash = "#/" + routeTo(route.id, normalizedQuery);
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + normalizedHash);
        route = Object.assign({}, route, { query: normalizedQuery });
        activeRoute = route;
      } else {
        router.navigate(routeTo(route.id, normalizedQuery));
        return;
      }
    }
    if (route.id === "upload") { OpsDemo.pages.knowledge.mountLocalImport(root, route, store.getState()); return; }
    root.addEventListener("input", function input(event) {
      if (event.target.matches("[data-directory-folder-input]") && inlineFolderEditor) {
        inlineFolderEditor.value = event.target.value;
        event.target.removeAttribute("aria-invalid");
        return;
      }
      if (event.target.matches("[data-local-document-search]")) applyFilters(root, true);
    });
    root.addEventListener("focusout", function finishFolderName(event) {
      if (event.target.matches("[data-directory-folder-input]")) finishInlineFolderEdit(root, route, event.target);
    });
    root.addEventListener("keydown", function handleFolderNameKey(event) {
      var renameButton = event.target.closest && event.target.closest("[data-directory-edit]");
      if (renameButton && renameButton.dataset.directoryScope === "local-documents" && event.key === "F2") {
        event.preventDefault();
        beginInlineFolderRename(root, store.getState(), renameButton.dataset.directoryEdit, selectedFolderId(store.getState(), route));
        return;
      }
      if (!event.target.matches("[data-directory-folder-input]")) return;
      if (event.key === "Enter") {
        event.preventDefault();
        event.target.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        inlineFolderEditor = null;
        refreshDirectoryTree(root, store.getState(), selectedFolderId(store.getState(), route), false);
      }
    });
    root.addEventListener("change", function change(event) {
      if (event.target.matches("[data-local-document-status-filter]")) applyFilters(root, true);
      if (event.target.matches("[data-local-preview-kb-select]")) router.navigate(routeTo(route.id, { knowledgeBaseId: event.target.value, view: route.query.view }));
    });
    root.addEventListener("dblclick", function renameFolder(event) {
      var nameButton = event.target.closest && event.target.closest("[data-directory-edit]");
      if (!nameButton || nameButton.dataset.directoryScope !== "local-documents") return;
      event.preventDefault();
      event.stopPropagation();
      beginInlineFolderRename(root, store.getState(), nameButton.dataset.directoryEdit, selectedFolderId(store.getState(), route));
    });
    root.addEventListener("click", function click(event) {
      var button = event.target.closest("button");
      if (!button) { clearPendingFolderNameClick(); return; }
      var data = button.dataset;
      var currentFolderId = selectedFolderId(store.getState(), route);
      if (data.localDocumentPage) {
        localDocumentPage += data.localDocumentPage === "next" ? 1 : -1;
        applyFilters(root, false);
        var tableWrap = root.querySelector("[data-local-document-table-wrap]");
        if (tableWrap) tableWrap.scrollTop = 0;
        return;
      }
      if (data.directoryEdit && data.directoryScope === "local-documents") {
        event.preventDefault();
        if (event.detail > 1) {
          clearPendingFolderNameClick();
          return;
        }
        if (event.detail === 0) {
          clearPendingFolderNameClick();
          navigateToFolder(data.directorySelect || data.directoryEdit);
          return;
        }
        scheduleFolderSelection(data.directorySelect || data.directoryEdit);
        return;
      }
      clearPendingFolderNameClick();
      if (button.matches("[data-local-document-upload], [data-local-folder-upload]")) router.navigate("local-documents/upload?step=upload" + (currentFolderId === "all" ? "" : "&folder=" + encodeURIComponent(currentFolderId)));
      if (button.matches("[data-local-folder-create-child]")) beginInlineFolderCreate(root, store.getState(), currentFolderId);
      if (data.localFolderDelete) {
        var deleteFolder = find(localFolders(store.getState()), data.localFolderDelete);
        if (deleteFolder) overlay.confirm({ title: "删除文件夹", confirmLabel: "确认删除", confirmVariant: "danger", body: '<p>仅空文件夹可以删除。确认删除“' + esc(deleteFolder.name) + '”吗？</p>', onConfirm: function remove() {
          var removed = actions.deleteDocumentFolder(deleteFolder.id);
          if (!removed) { overlay.toast("无法删除文件夹", "请先移动其中的文件或删除子文件夹。", "warning"); return false; }
          router.navigate("local-documents");
          overlay.toast("文件夹已删除", deleteFolder.name, "success");
          return true;
        } });
      }
      if (data.directorySelect && data.directoryScope === "local-documents") navigateToFolder(data.directorySelect);
      if (data.directoryToggle && data.directoryScope === "local-documents") {
        if (collapsedFolderIds.has(data.directoryToggle)) collapsedFolderIds.delete(data.directoryToggle);
        else collapsedFolderIds.add(data.directoryToggle);
        refreshDirectoryTree(root, store.getState(), currentFolderId, false);
      }
      if (data.localDocumentPreview) router.navigate(routeTo(data.localDocumentPreview));
      if (data.localDocumentMove) openMoveDocument(store.getState(), data.localDocumentMove);
      if (data.localDocumentDelete) confirmDeleteDocument(details(data.localDocumentDelete));
      if (data.localDocumentReferences) {
        var listed = details(data.localDocumentReferences);
        overlay.open({ title: "知识库引用", body: renderReferenceList(store.getState(), listed), footer: false });
      }
      if (button.matches("[data-local-preview-download]")) downloadAsset(details(route.id, route));
    });
    OpsDemo.ui.preview.bindChunkCards(root);
    unsubscribe = store.subscribe(function onBackground(nextState, meta) {
      if (!meta || !meta.silentRender || !root.isConnected) return;
      if (!route.id) {
        var tbody = root.querySelector("[data-local-document-table]");
        var currentFolderId = selectedFolderId(nextState, route);
        if (tbody) tbody.innerHTML = assetsForFolder(nextState, currentFolderId).map(function row(asset) { return renderRow(nextState, asset); }).join("");
        refreshDirectoryTree(root, nextState, currentFolderId, Boolean(inlineFolderEditor));
        applyFilters(root);
        dom.hydrateIcons(root);
        return;
      }
      var detail = details(route.id, route);
      if (!detail || !detail.version) return;
      var target = root.querySelector("[data-local-artifact-result]");
      if (target) { target.innerHTML = renderResult(nextState, detail, route); dom.hydrateIcons(target); }
    });
    if (!route.id) {
      localDocumentPage = 1;
      applyFilters(root, true);
      bindPaginationResize(root);
    }
  }
  function unmount() {
    if (OpsDemo.ui.preview.dismissChunkMetadata) OpsDemo.ui.preview.dismissChunkMetadata();
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    clearPendingFolderNameClick();
    releasePaginationResize();
    inlineFolderEditor = null;
    releasePreview();
    if (activeRoute && activeRoute.id === "upload" && OpsDemo.pages.knowledge.unmount) OpsDemo.pages.knowledge.unmount();
    activeRoute = null;
  }
  OpsDemo.pages.localDocuments = { render: render, mount: mount, unmount: unmount };
})(window, window.OpsDemo);

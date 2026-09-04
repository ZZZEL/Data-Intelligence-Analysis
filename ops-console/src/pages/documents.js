(function defineLocalDocumentsPage(window, OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;
  var preview = OpsDemo.ui.preview;
  var router = OpsDemo.core.router;
  var store = OpsDemo.core.store;
  var actions = OpsDemo.core.actions;

  function esc(value) { return dom.escape(value); }
  function number(value) { return dom.formatNumber(value); }

  function displayDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return esc(value);
    var pad = function pad(part) { return String(part).padStart(2, "0"); };
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function isLocalDocument(item) {
    return Boolean(item && (!item.sourceType || item.sourceType === "local_upload"));
  }

  function localAssetId(item) {
    return item && (item.localAssetId || item.id);
  }

  function documentChunks(state, item) {
    if (!item) return [];
    if (item.chunks) return item.chunks;
    return (state.chunks || []).filter(function filter(chunk) { return chunk.documentId === item.id; }).sort(function sort(left, right) {
      return Number(left.index || left.order || 0) - Number(right.index || right.order || 0);
    });
  }

  function localDocumentAssets(state) {
    var assets = [];
    (state.documents || []).filter(isLocalDocument).forEach(function group(item) {
      var id = localAssetId(item);
      var asset = assets.find(function find(candidate) { return candidate.id === id; });
      if (!asset) {
        asset = { id: id, instances: [] };
        assets.push(asset);
      }
      asset.instances.push(item);
    });
    assets.forEach(function finalize(asset) {
      asset.representative = asset.instances.find(function find(item) { return item.id === asset.id; }) || asset.instances[0];
      asset.importedAt = asset.representative.importedAt;
    });
    return assets.sort(function sort(left, right) {
      return new Date(right.importedAt || 0).getTime() - new Date(left.importedAt || 0).getTime();
    });
  }

  function findLocalAsset(state, id) {
    return localDocumentAssets(state).find(function find(asset) { return asset.id === id; }) || null;
  }

  function findKnowledgeBase(state, id) {
    return (state.knowledgeBases || []).find(function find(item) { return item.id === id; }) || null;
  }

  function assetBindings(state, asset) {
    var bindings = [];
    (asset && asset.instances || []).forEach(function add(item) {
      var knowledgeBase = findKnowledgeBase(state, item.knowledgeBaseId);
      if (!knowledgeBase || bindings.some(function some(binding) { return binding.knowledgeBase.id === knowledgeBase.id; })) return;
      bindings.push({ document: item, knowledgeBase: knowledgeBase });
    });
    return bindings;
  }

  function itemStatus(item) {
    var status = item && item.status || "indexing";
    var label = item && (item.statusLabel || item.lifecycleStatusLabel) || "等待处理";
    if (status === "ready") return { key: "ready", label: label, tone: "success" };
    if (status === "failed") return { key: "failed", label: label, tone: "danger" };
    return { key: "processing", label: label, tone: "info" };
  }

  function assetStatus(asset) {
    var failed = asset.instances.find(function find(item) { return item.status === "failed"; });
    var processing = asset.instances.find(function find(item) { return item.status !== "ready"; });
    var ready = asset.instances.some(function some(item) { return item.status === "ready"; });
    if (failed) return { key: "failed", label: asset.instances.length > 1 ? "存在处理失败" : itemStatus(failed).label, tone: "danger" };
    if (processing && ready) return { key: "processing", label: "部分处理中", tone: "info" };
    return itemStatus(processing || asset.representative);
  }

  function hasPreview(state, asset) {
    return asset.instances.some(function some(item) { return documentChunks(state, item).length > 0; });
  }

  function renderRow(state, asset) {
    var item = asset.representative;
    var status = assetStatus(asset);
    var previewReady = hasPreview(state, asset);
    var searchText = [item.name, asset.id, item.documentType].filter(Boolean).join(" ").toLowerCase();
    return '<tr data-local-document-row data-local-document-id="' + esc(asset.id) + '" data-local-document-status="' + esc(status.key) + '" data-local-document-search="' + esc(searchText) + '">' +
      '<td><button type="button" class="table-primary table-primary--link" data-local-document-preview="' + esc(asset.id) + '"' + (previewReady ? "" : ' disabled title="切片生成后可预览"') + '>' + esc(item.name) + '</button><div class="table-secondary">' + esc(asset.id) + " · " + esc(item.documentType || "文档") + "</div></td>" +
      "<td>" + dom.status(status.label, status.tone) + "</td>" +
      "<td>" + esc(item.fileSizeLabel || "—") + "</td>" +
      "<td>" + displayDate(asset.importedAt) + "</td>" +
      '<td><div class="knowledge-row-actions"><button type="button" class="table-action" data-local-document-preview="' + esc(asset.id) + '"' + (previewReady ? "" : ' disabled title="切片生成后可预览"') + '>预览</button><button type="button" class="table-action table-action--danger" data-local-document-delete="' + esc(asset.id) + '">删除</button></div></td>' +
      "</tr>";
  }

  function renderList(state) {
    var assets = localDocumentAssets(state);
    var rows = assets.map(function map(asset) { return renderRow(state, asset); }).join("");
    var statusFilter = '<select class="select-field local-documents__status-filter" data-local-document-status-filter aria-label="筛选文件状态"><option value="all">全部状态</option><option value="ready">可检索</option><option value="processing">处理中</option><option value="failed">处理失败</option></select>';
    return dom.pageHeader({
      title: "文档管理",
      actions: dom.button("上传文档", { variant: "primary", icon: "upload", attrs: "data-local-document-upload" }),
      toolbar: {
        search: { placeholder: "搜索文档", attrs: "data-local-document-search" },
        filters: dom.headerFilter("文件状态", statusFilter)
      }
    }) + '<div class="page-content"><section class="panel local-documents">' +
      '<div class="table-wrap" data-local-document-table-wrap' + (assets.length ? "" : " hidden") + '><table class="data-table knowledge-table local-documents-table"><thead><tr><th>文档</th><th>状态</th><th>大小</th><th>上传时间</th><th>操作</th></tr></thead><tbody data-local-document-table>' + rows + "</tbody></table></div>" +
      '<div class="local-documents__empty" data-local-document-empty' + (assets.length ? " hidden" : "") + '>' + dom.empty("暂无文档", "上传到知识库的文档会集中显示在这里。", "files") + "</div>" +
      '<div class="table-footer local-documents__footer"><span data-local-document-count>共 ' + number(assets.length) + ' 个文档</span><span class="local-documents__scope">不包含企业数据和检索服务引用</span></div>' +
      "</section></div>";
  }

  function renderChunkCards(chunks, item) {
    if (!chunks.length) return dom.empty("暂无切片", "该文件在当前知识库完成文档处理后，切片会显示在这里。", "blocks");
    return '<div class="chunk-preview-list">' + chunks.map(function map(chunk, index) {
      var content = chunk.content || chunk.text || "";
      var characterCount = chunk.characterCount == null ? content.length : chunk.characterCount;
      var chunkId = chunk.id || item.id + "-CH-" + (index + 1);
      return '<article class="chunk-preview-card" data-chunk-preview-card="' + esc(chunkId) + '" tabindex="0" role="button" aria-expanded="false"><header><span class="chunk-preview-card__number">#' + String(chunk.index || chunk.order || index + 1).padStart(2, "0") + '</span><strong>' + esc(chunkId) + '</strong><span>' + number(characterCount) + ' 字符</span></header><p>' + esc(content) + '</p><span class="chunk-preview-card__hint">点击展开全文</span></article>';
    }).join("") + "</div>";
  }

  function sourceText(state, asset) {
    var item = asset && asset.representative;
    if (!item) return "";
    return item.sourcePreview || item.extractedText || documentChunks(state, item).filter(function filter(chunk) { return chunk.origin !== "manual"; }).map(function map(chunk) {
      return chunk.content || chunk.text || "";
    }).join("\n\n");
  }

  function renderDocumentSource(state, asset) {
    var item = asset.representative;
    return '<article class="document-source-preview"><div class="document-source-preview__page"><div class="document-source-preview__file">' + dom.icon("file-text", 17) + '<span>' + esc(item.name) + '</span></div><div class="document-source-preview__content">' + esc(sourceText(state, asset) || "暂无可预览的源内容。") + "</div></div></article>";
  }

  function renderKnowledgeBaseControl(asset, bindings, selectedBinding) {
    var options = selectedBinding ? bindings.map(function map(binding) {
      return '<option value="' + esc(binding.knowledgeBase.id) + '"' + (binding.knowledgeBase.id === selectedBinding.knowledgeBase.id ? " selected" : "") + '>' + esc(binding.knowledgeBase.name) + "</option>";
    }).join("") : '<option value="" selected>暂无可用知识库</option>';
    var disabled = bindings.length <= 1 ? " disabled" : "";
    return '<label class="local-document-preview__knowledge-base" for="local-preview-knowledge-base"><span>知识库</span><select id="local-preview-knowledge-base" class="select-field" data-local-preview-kb-select="' + esc(asset.id) + '"' + disabled + ">" + options + "</select></label>";
  }

  function renderPreview(state, route) {
    var asset = findLocalAsset(state, route.id);
    if (!asset) {
      return dom.pageHeader({ title: "文件预览", back: { label: "返回文档管理", route: "local-documents" } }) + '<div class="page-content">' + dom.empty("文件不存在", "该文档可能已被删除。", "file-x") + "</div>";
    }
    var bindings = assetBindings(state, asset);
    var selectedBinding = bindings.find(function find(binding) { return binding.knowledgeBase.id === route.query.knowledgeBaseId; }) || bindings[0] || null;
    var selectedDocument = selectedBinding && selectedBinding.document;
    var chunks = selectedDocument ? documentChunks(state, selectedDocument) : [];
    var controls = renderKnowledgeBaseControl(asset, bindings, selectedBinding) + (selectedDocument ? dom.button("新增切片", {
      variant: "primary",
      icon: "plus",
      size: "small",
      attrs: 'data-local-preview-chunk-add="' + esc(selectedDocument.id) + '" data-local-asset-id="' + esc(asset.id) + '" data-kb-id="' + esc(selectedBinding.knowledgeBase.id) + '"'
    }) : "");
    var toolbar = '<div class="knowledge-preview-toolbar local-document-preview__toolbar"><div class="knowledge-preview-toolbar__source local-document-preview__source"><span>源文件</span><strong title="' + esc(asset.representative.name) + '">' + esc(asset.representative.name) + '</strong></div><div class="knowledge-preview-toolbar__result local-document-preview__result"><h2>全部切片（' + number(chunks.length) + '）</h2><div class="local-document-preview__controls">' + controls + "</div></div></div>";
    var body = preview.split({
      className: "knowledge-chunk-preview local-document-preview",
      toolbar: toolbar,
      sourceHeader: false,
      source: renderDocumentSource(state, asset),
      resultHeader: false,
      result: selectedDocument ? renderChunkCards(chunks, selectedDocument) : dom.empty("暂无切片", "该文件尚未加入可用知识库。", "blocks")
    });
    return dom.pageHeader({
      title: "文件预览",
      back: { label: "返回文档管理", route: "local-documents" },
      actions: dom.button("下载原文件", { variant: "secondary", icon: "download", attrs: 'data-local-preview-download="' + esc(asset.id) + '"' })
    }) + '<div class="page-content preview-page">' + body + "</div>";
  }

  function render(route, state) {
    return route.id ? renderPreview(state, route) : renderList(state);
  }

  function openUploadDialog(state) {
    var options = (state.knowledgeBases || []).map(function map(item) {
      return '<option value="' + esc(item.id) + '">' + esc(item.name) + " · " + esc(item.id) + "</option>";
    }).join("");
    var hasKnowledgeBase = Boolean(options);
    overlay.confirm({
      title: "上传文档",
      confirmLabel: "继续上传",
      body: '<div class="stack"><p class="local-documents__dialog-copy">选择要将文档加入的知识库，随后继续完成文件上传、解析和文档处理。</p>' +
        '<div class="form-field">' + dom.requiredLabel("目标知识库", { forId: "local-document-target-kb" }) + '<select id="local-document-target-kb" class="select-field" required aria-required="true"' + (hasKnowledgeBase ? "" : " disabled") + '><option value="" selected disabled>' + (hasKnowledgeBase ? "请选择知识库" : "暂无可用知识库") + "</option>" + options + '</select><div class="form-help">企业数据和检索服务通过各自的访问配置调用，不在这里上传。</div></div></div>',
      onConfirm: function onConfirm(root) {
        var select = root.querySelector("#local-document-target-kb");
        if (!select || !select.value) {
          overlay.toast("尚未选择知识库", hasKnowledgeBase ? "请选择目标知识库。" : "请先创建知识库。", "warning");
          return false;
        }
        router.navigate("knowledge/" + select.value + "?onboarding=1&step=upload&flow=import");
        return true;
      }
    });
  }

  function confirmDeleteDocument(asset) {
    if (!asset) return;
    var knowledgeBaseCount = asset.instances.reduce(function count(ids, item) {
      if (ids.indexOf(item.knowledgeBaseId) < 0) ids.push(item.knowledgeBaseId);
      return ids;
    }, []).length;
    overlay.confirm({
      title: "删除文档",
      confirmLabel: "确认删除",
      confirmVariant: "danger",
      body: '<div class="notice notice--warning">' + dom.icon("triangle-alert", 17) + '<div class="notice__content"><div class="notice__title">将从所有使用位置删除</div>删除“' + esc(asset.representative.name) + '”后，原文件及其在 ' + number(knowledgeBaseCount) + " 个知识库中的切片和向量索引将全部移除，且无法恢复。</div></div>",
      onConfirm: function onConfirm() {
        var deleted = actions.deleteLocalDocumentAsset ? actions.deleteLocalDocumentAsset(asset.id) : actions.deleteDocument(asset.representative.id);
        if (deleted) overlay.toast("文档已删除", "原文件及其全部知识库处理结果已移除。", "success");
        return Boolean(deleted);
      }
    });
  }

  function openAddChunk(documentId, assetId, knowledgeBaseId) {
    overlay.open({
      title: "新增切片",
      confirmLabel: "生成向量并保存",
      wide: true,
      body: '<div class="stack"><div class="form-field">' + dom.requiredLabel("切片内容", { forId: "new-local-chunk-content" }) + '<textarea id="new-local-chunk-content" class="textarea-field chunk-content-editor" maxlength="5000" placeholder="输入需要纳入检索的内容" data-local-chunk-content required aria-required="true"></textarea></div><div class="vector-cost-notice">' + dom.icon("circle-alert", 15) + '<span>保存后只会更新当前知识库中的切片和向量索引，并产生 Embedding Token 消耗。</span></div></div>',
      onConfirm: function onConfirm(scope) {
        var content = scope.querySelector("[data-local-chunk-content]").value.trim();
        if (!content) {
          overlay.toast("切片内容为空", "请输入需要纳入检索的内容。", "warning");
          return false;
        }
        var result = actions.addDocumentChunk && actions.addDocumentChunk(documentId, { content: content });
        if (!result) {
          overlay.toast("切片未保存", "请确认向量模型连接正常后重试。", "warning");
          return false;
        }
        overlay.toast("切片已新增", "已进入当前知识库的向量化队列。", "success");
        window.setTimeout(function refreshPreview() {
          router.navigate("local-documents/" + assetId + "?knowledgeBaseId=" + encodeURIComponent(knowledgeBaseId));
        }, 0);
        return true;
      }
    });
  }

  function applyFilters(root) {
    var search = root.querySelector("[data-local-document-search]");
    var status = root.querySelector("[data-local-document-status-filter]");
    var query = search ? search.value.trim().toLowerCase() : "";
    var statusValue = status ? status.value : "all";
    var rows = Array.prototype.slice.call(root.querySelectorAll("[data-local-document-row]"));
    var visible = 0;
    rows.forEach(function each(row) {
      var matchesQuery = !query || String(row.dataset.localDocumentSearch || "").indexOf(query) >= 0;
      var matchesStatus = statusValue === "all" || row.dataset.localDocumentStatus === statusValue;
      row.hidden = !(matchesQuery && matchesStatus);
      if (!row.hidden) visible += 1;
    });
    var tableWrap = root.querySelector("[data-local-document-table-wrap]");
    var empty = root.querySelector("[data-local-document-empty]");
    var count = root.querySelector("[data-local-document-count]");
    if (tableWrap) tableWrap.hidden = visible === 0;
    if (empty) empty.hidden = visible > 0;
    if (count) count.textContent = visible === rows.length ? "共 " + number(rows.length) + " 个文档" : "显示 " + number(visible) + " / 共 " + number(rows.length) + " 个文档";
  }

  function bindChunkCards(root) {
    var cards = Array.prototype.slice.call(root.querySelectorAll("[data-chunk-preview-card]"));
    function setExpanded(card, expanded) {
      card.classList.toggle("is-expanded", expanded);
      card.setAttribute("aria-expanded", expanded ? "true" : "false");
      var hint = card.querySelector(".chunk-preview-card__hint");
      if (hint) hint.textContent = expanded ? "点击收起" : "点击展开全文";
    }
    function toggle(card) {
      var expanded = card.getAttribute("aria-expanded") === "true";
      cards.forEach(function collapse(other) { if (other !== card) setExpanded(other, false); });
      setExpanded(card, !expanded);
    }
    cards.forEach(function bind(card) {
      card.addEventListener("click", function handle() {
        var selection = window.getSelection && window.getSelection();
        if (selection && String(selection).trim()) return;
        toggle(card);
      });
      card.addEventListener("keydown", function handle(event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle(card);
      });
    });
  }

  function downloadAsset(state, asset) {
    if (!asset) return;
    var item = asset.representative;
    var blob = new Blob([sourceText(state, asset) || item.name], { type: item.mimeType || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = item.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function release() { URL.revokeObjectURL(url); }, 0);
    overlay.toast("已开始下载", item.name, "success");
  }

  function mount(root, route) {
    var search = root.querySelector("[data-local-document-search]");
    var status = root.querySelector("[data-local-document-status-filter]");
    if (search) search.addEventListener("input", function handle() { applyFilters(root); });
    if (status) status.addEventListener("change", function handle() { applyFilters(root); });

    var upload = root.querySelector("[data-local-document-upload]");
    if (upload) upload.addEventListener("click", function handle() { openUploadDialog(store.getState()); });

    root.querySelectorAll("[data-local-document-preview]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        if (button.disabled) return;
        var asset = findLocalAsset(store.getState(), button.dataset.localDocumentPreview);
        var binding = assetBindings(store.getState(), asset).find(function find(candidate) { return documentChunks(store.getState(), candidate.document).length > 0; }) || assetBindings(store.getState(), asset)[0];
        var query = binding ? "?knowledgeBaseId=" + encodeURIComponent(binding.knowledgeBase.id) : "";
        router.navigate("local-documents/" + button.dataset.localDocumentPreview + query);
      });
    });
    root.querySelectorAll("[data-local-document-delete]").forEach(function bind(button) {
      button.addEventListener("click", function handle() {
        confirmDeleteDocument(findLocalAsset(store.getState(), button.dataset.localDocumentDelete));
      });
    });

    var knowledgeBaseSelect = root.querySelector("[data-local-preview-kb-select]");
    if (knowledgeBaseSelect) knowledgeBaseSelect.addEventListener("change", function handle() {
      router.navigate("local-documents/" + knowledgeBaseSelect.dataset.localPreviewKbSelect + "?knowledgeBaseId=" + encodeURIComponent(knowledgeBaseSelect.value));
    });
    var previewDownload = root.querySelector("[data-local-preview-download]");
    if (previewDownload) previewDownload.addEventListener("click", function handle() {
      var state = store.getState();
      downloadAsset(state, findLocalAsset(state, previewDownload.dataset.localPreviewDownload));
    });
    var chunkAdd = root.querySelector("[data-local-preview-chunk-add]");
    if (chunkAdd) chunkAdd.addEventListener("click", function handle() {
      openAddChunk(chunkAdd.dataset.localPreviewChunkAdd, chunkAdd.dataset.localAssetId, chunkAdd.dataset.kbId);
    });
    if (route.id) bindChunkCards(root);
  }

  OpsDemo.pages.localDocuments = {
    render: render,
    mount: mount
  };
})(window, window.OpsDemo);

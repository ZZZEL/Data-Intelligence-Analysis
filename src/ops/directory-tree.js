(function defineDirectoryTree(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;

  function esc(value) { return dom.escape(value); }
  function number(value) { return dom.formatNumber(value); }
  function sortFolders(left, right) {
    return Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
  }

  function folderMap(folders) {
    return (folders || []).reduce(function index(map, folder) {
      map[folder.id] = folder;
      return map;
    }, {});
  }

  function includesFolder(folders, itemFolderId, selectedFolderId, rootId) {
    if (!selectedFolderId || selectedFolderId === (rootId || "all")) return true;
    if (!itemFolderId) return selectedFolderId === "unfiled";
    var index = folderMap(folders);
    var current = itemFolderId;
    var visited = {};
    while (current && !visited[current]) {
      if (current === selectedFolderId) return true;
      visited[current] = true;
      current = index[current] && index[current].parentId;
    }
    return false;
  }

  function countItems(folders, items, folderId, rootId, itemFolderId) {
    if (folderId === (rootId || "all")) return (items || []).length;
    return (items || []).filter(function inFolder(item) {
      return includesFolder(folders, itemFolderId(item), folderId, rootId);
    }).length;
  }

  function path(folders, selectedId, rootId, rootLabel) {
    var resolvedRootId = rootId || "all";
    var rootNode = { id: resolvedRootId, name: rootLabel || "全部文件", isRoot: true };
    if (!selectedId || selectedId === resolvedRootId) return [rootNode];
    var index = folderMap(folders);
    var current = index[selectedId];
    var result = [];
    var visited = {};
    while (current && !visited[current.id]) {
      result.unshift(current);
      visited[current.id] = true;
      current = current.parentId && index[current.parentId];
    }
    return result.length ? [rootNode].concat(result) : [rootNode];
  }

  function breadcrumb(options) {
    var opts = options || {};
    var nodes = path(opts.folders || [], opts.selectedId, opts.rootId, opts.rootLabel);
    if (opts.leafLabel) nodes = nodes.concat([{ id: opts.leafId || "leaf", name: opts.leafLabel, isLeaf: true }]);
    var scope = opts.scope || "directory";
    return '<nav class="document-directory-breadcrumb" aria-label="' + esc(opts.ariaLabel || "当前目录") + '"><ol>' + nodes.map(function segment(node, index) {
      var current = index === nodes.length - 1;
      var rootSelectable = opts.rootSelectable !== false;
      var interactive = opts.interactive !== false;
      var label = current
        ? '<span class="document-directory-breadcrumb__current" aria-current="page" title="' + esc(node.name) + '">' + esc(node.name) + '</span>'
        : !interactive || node.isRoot && !rootSelectable
          ? '<span class="document-directory-breadcrumb__ancestor" title="' + esc(node.name) + '">' + esc(node.name) + '</span>'
          : '<button type="button" data-directory-select="' + esc(node.id) + '" data-directory-scope="' + esc(scope) + '" title="' + esc(node.name) + '">' + esc(node.name) + '</button>';
      var separator = current ? "" : '<span class="document-directory-breadcrumb__separator" aria-hidden="true">' + dom.icon("chevron-right", 13) + "</span>";
      return "<li>" + label + separator + "</li>";
    }).join("") + "</ol></nav>";
  }

  function folderPicker(options) {
    var opts = options || {};
    var folders = opts.folders || [];
    var rootId = opts.rootId || "all";
    var rootLabel = opts.rootLabel || "全部文档";
    var nodes = path(folders, opts.selectedId, rootId, rootLabel);
    var pathLabel = nodes.map(function folderName(folder) { return folder.name; }).join(" / ");
    var pathContent = nodes.map(function segment(folder, index) {
      return (index ? '<span class="upload-folder-picker__separator" aria-hidden="true">' + dom.icon("chevron-right", 13) + "</span>" : "") + '<span class="upload-folder-picker__segment">' + esc(folder.name) + "</span>";
    }).join("");
    return '<summary class="upload-folder-picker__summary"><span class="upload-folder-picker__label">' + esc(opts.label || "目标位置") + '</span><span class="upload-folder-picker__path" data-folder-picker-path' + (opts.pathAttrs ? " " + opts.pathAttrs : "") + ' aria-label="当前目标位置：' + esc(pathLabel) + '" title="' + esc(pathLabel) + '">' + pathContent + '</span><span class="upload-folder-picker__disclosure" aria-hidden="true">' + dom.icon("chevron-down", 16) + '</span></summary><div class="upload-folder-picker__tree" data-folder-picker-tree' + (opts.treeAttrs ? " " + opts.treeAttrs : "") + '>' + render({ folders: folders, items: opts.items || [], itemFolderId: opts.itemFolderId, itemLabel: opts.itemLabel, selectedId: opts.selectedId, collapsedIds: opts.collapsedIds || [], scope: opts.scope || "folder-picker", rootId: rootId, rootLabel: rootLabel, rootIcon: opts.rootIcon || "files", ariaLabel: opts.ariaLabel || "选择目标位置", showItems: false, rootSelectable: false }) + "</div>";
  }

  function render(options) {
    var opts = options || {};
    var folders = (opts.folders || []).slice().sort(sortFolders);
    var items = opts.items || [];
    var itemFolderId = opts.itemFolderId || function getFolderId(item) { return item.folderId || null; };
    var itemId = opts.itemId || function getItemId(item) { return item.id; };
    var itemLabel = opts.itemLabel || function getItemLabel(item) { return item.name || item.fileName || item.id; };
    var rootId = opts.rootId || "all";
    var selectedId = opts.selectedId || rootId;
    var collapsed = new Set(opts.collapsedIds || []);
    var scope = opts.scope || "directory";
    var editableFolders = opts.editableFolders;
    var editingFolderId = opts.editingFolderId || null;
    var editingFolderValue = opts.editingFolderValue || "";
    var draftFolder = opts.draftFolder || null;
    var showItems = opts.showItems !== false;
    var rootSelectable = opts.rootSelectable !== false;
    var draftParentId = draftFolder ? (draftFolder.parentId || rootId) : null;
    var draftBeforeId = draftFolder && draftFolder.beforeId || null;
    var children = folders.reduce(function group(map, folder) {
      var parentId = folder.parentId || rootId;
      (map[parentId] || (map[parentId] = [])).push(folder);
      return map;
    }, {});
    Object.keys(children).forEach(function order(key) { children[key].sort(sortFolders); });
    var folderIndex = folderMap(folders);
    var itemsByParent = items.reduce(function groupItems(map, item) {
      var requestedParent = itemFolderId(item);
      var parentId = requestedParent && folderIndex[requestedParent] ? requestedParent : rootId;
      (map[parentId] || (map[parentId] = [])).push(item);
      return map;
    }, {});
    Object.keys(itemsByParent).forEach(function orderItems(key) {
      itemsByParent[key].sort(function compare(left, right) { return String(itemLabel(left) || "").localeCompare(String(itemLabel(right) || ""), "zh-CN"); });
    });

    function indentTrack(depth) {
      var slots = "";
      for (var i = 0; i < depth; i++) {
        slots += '<span class="directory-tree__indent-slot" aria-hidden="true"></span>';
      }
      return '<span class="directory-tree__indent-track">' + slots + "</span>";
    }

    function itemRow(item, depth) {
      var label = itemLabel(item) || "未命名文件";
      return '<div class="directory-tree__item' + (item.available === false ? " is-unavailable" : "") + '" role="treeitem" aria-level="' + (depth + 1) + '" data-directory-item="' + esc(itemId(item)) + '"><div class="directory-tree__row directory-tree__row--item" style="--directory-depth:' + depth + '">' + indentTrack(depth) + '<span class="directory-tree__label directory-tree__label--item" title="' + esc(label) + '"><span class="directory-tree__name">' + esc(label) + '</span></span><span class="directory-tree__toggle directory-tree__toggle--placeholder" aria-hidden="true"></span></div></div>';
    }

    function folderInput(mode, folder, parentId, beforeId, value) {
      var label = mode === "create" ? "新建文件夹名称" : "重命名“" + folder.name + "”";
      return '<input class="directory-tree__name-input" type="text" maxlength="40" autocomplete="off" spellcheck="false" value="' + esc(value) + '" aria-label="' + esc(label) + '" data-directory-folder-input data-directory-folder-mode="' + mode + '"' + (folder ? ' data-directory-folder-id="' + esc(folder.id) + '"' : "") + (parentId ? ' data-directory-parent-id="' + esc(parentId) + '"' : "") + (beforeId ? ' data-directory-before-id="' + esc(beforeId) + '"' : "") + ' placeholder="文件夹名称">';
    }

    function draftRow(depth) {
      return '<div class="directory-tree__node directory-tree__node--draft" role="treeitem" aria-level="' + (depth + 1) + '" data-directory-draft><div class="directory-tree__row" style="--directory-depth:' + depth + '">' + indentTrack(depth) + '<div class="directory-tree__label directory-tree__label--editing"><span class="directory-tree__folder-icon">' + dom.icon("folder", 17) + '</span>' + folderInput("create", null, draftParentId, draftBeforeId, draftFolder.value || "") + '<span class="directory-tree__count" aria-hidden="true"></span></div><span class="directory-tree__toggle directory-tree__toggle--placeholder" aria-hidden="true"></span></div></div>';
    }

    function canEdit(folder, isRoot) {
      if (isRoot || !editableFolders) return false;
      return typeof editableFolders === "function" ? editableFolders(folder) : true;
    }

    function folderLabel(folder, icon, count, isRoot) {
      var countText = count > 0 ? number(count) : "";
      var countSpan = countText ? '<span class="directory-tree__count" aria-label="' + countText + ' 个文件">' + countText + "</span>" : "";
      if (editingFolderId === folder.id && canEdit(folder, isRoot)) {
        return '<div class="directory-tree__label directory-tree__label--editing"><span class="directory-tree__folder-icon">' + dom.icon(icon, 17) + '</span>' + folderInput("rename", folder, null, null, editingFolderValue || folder.name) + countSpan + "</div>";
      }
      var selectAttributes = 'data-directory-select="' + esc(folder.id) + '" data-directory-scope="' + esc(scope) + '"';
      if (isRoot && !rootSelectable) {
        return '<div class="directory-tree__label directory-tree__label--static" title="' + esc(folder.name) + '"><span class="directory-tree__folder-icon">' + dom.icon(icon, 17) + '</span><span class="directory-tree__name">' + esc(folder.name) + "</span>" + countSpan + "</div>";
      }
      if (canEdit(folder, isRoot)) {
        var editableCount = countText ? '<button type="button" class="directory-tree__count directory-tree__count--select" ' + selectAttributes + ' aria-label="打开' + esc(folder.name) + '，' + countText + ' 个文件">' + countText + "</button>" : "";
        return '<div class="directory-tree__label directory-tree__label--editable"><button type="button" class="directory-tree__folder-icon directory-tree__folder-select" ' + selectAttributes + ' aria-label="打开' + esc(folder.name) + '" title="打开文件夹">' + dom.icon(icon, 17) + '</button><button type="button" class="directory-tree__name directory-tree__name--editable" data-directory-edit="' + esc(folder.id) + '" ' + selectAttributes + ' aria-label="打开' + esc(folder.name) + '，双击或按 F2 重命名" title="单击打开，双击重命名">' + esc(folder.name) + "</button>" + editableCount + "</div>";
      }
      return '<button type="button" class="directory-tree__label" ' + selectAttributes + ' title="' + esc(folder.name) + '"><span class="directory-tree__folder-icon">' + dom.icon(icon, 17) + '</span><span class="directory-tree__name">' + esc(folder.name) + "</span>" + countSpan + "</button>";
    }

    function row(folder, depth, isRoot) {
      var nodeChildren = children[folder.id] || [];
      var nodeItems = showItems ? itemsByParent[folder.id] || [] : [];
      var ownsDraft = Boolean(draftFolder && draftParentId === folder.id);
      var expanded = isRoot || ownsDraft || !collapsed.has(folder.id);
      var canExpand = Boolean(nodeChildren.length || nodeItems.length || ownsDraft);
      var active = selectedId === folder.id;
      var unavailable = folder.available === false;
      var icon = folder.icon || (expanded && canExpand ? "folder-open" : "folder");
      var count = countItems(folders, items, folder.id, rootId, itemFolderId);
      var level = depth + 1;
      var draftHasAnchor = ownsDraft && draftBeforeId && nodeChildren.some(function matchesDraftAnchor(child) { return child.id === draftBeforeId; });
      var childRows = nodeChildren.map(function child(item) { return (draftHasAnchor && item.id === draftBeforeId ? draftRow(depth + 1) : "") + row(item, depth + 1, false); }).join("");
      var branch = canExpand && expanded ? '<div class="directory-tree__group" role="group" style="--directory-parent-depth:' + depth + '">' + (ownsDraft && !draftHasAnchor ? draftRow(depth + 1) : "") + childRows + nodeItems.map(function childItem(item) { return itemRow(item, depth + 1); }).join("") + "</div>" : "";
      var toggle = canExpand && !isRoot ? '<button type="button" class="directory-tree__toggle" data-directory-toggle="' + esc(folder.id) + '" data-directory-scope="' + esc(scope) + '" aria-label="' + esc((expanded ? "收起" : "展开") + folder.name) + '" aria-expanded="' + (expanded ? "true" : "false") + '">' + dom.icon("chevron-right", 15) + "</button>" : '<span class="directory-tree__toggle directory-tree__toggle--placeholder" aria-hidden="true"></span>';
      return '<div class="directory-tree__node' + (isRoot ? " directory-tree__node--root" : "") + (active ? " is-active" : "") + (editingFolderId === folder.id ? " is-editing" : "") + (unavailable ? " is-unavailable" : "") + '" role="treeitem" aria-level="' + level + '" aria-selected="' + (active ? "true" : "false") + '"' + (canExpand && !isRoot ? ' aria-expanded="' + (expanded ? "true" : "false") + '"' : "") + ' data-directory-node="' + esc(folder.id) + '"><div class="directory-tree__row" style="--directory-depth:' + depth + '">' + indentTrack(depth) + folderLabel(folder, icon, count, isRoot) + toggle + "</div>" + branch + "</div>";
    }

    var root = {
      id: rootId,
      name: opts.rootLabel || "全部文件",
      icon: opts.rootIcon || "folders",
      available: true
    };
    return '<nav class="directory-tree" role="tree" aria-label="' + esc(opts.ariaLabel || "文件目录") + '" data-directory-tree="' + esc(scope) + '">' + row(root, 0, true) + "</nav>";
  }

  OpsDemo.ui.directoryTree = {
    render: render,
    breadcrumb: breadcrumb,
    folderPicker: folderPicker,
    path: path,
    includesFolder: includesFolder,
    countItems: countItems
  };
})(window.OpsDemo);

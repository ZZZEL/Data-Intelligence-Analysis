(function defineCapabilityPages(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;
  var charts = OpsDemo.ui.charts;
  var skillQuery = "";
  var visualView = "category";

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value, fallback) {
    return value == null || value === "" ? (fallback || "—") : String(value);
  }

  function valueOf(item, names, fallback) {
    var found;
    list(names).some(function find(name) {
      if (item && item[name] != null) {
        found = item[name];
        return true;
      }
      return false;
    });
    return found == null ? fallback : found;
  }

  function action(name, args) {
    var actions = OpsDemo.core.actions || {};
    if (typeof actions[name] === "function") return actions[name].apply(actions, args || []);
    overlay.toast("演示动作未就绪", "动作接口 " + name + " 尚未加载。", "warning");
    return null;
  }

  function capabilityCalls(item) {
    return Number(valueOf(item, ["callsThisMonth", "calls7d", "usage7d", "calls", "usageCount"], 0));
  }

  function enabled(item) {
    return item && item.enabled !== false;
  }

  function formatBytes(value) {
    var bytes = Number(value || 0);
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KB";
    return (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + " MB";
  }

  function calledToolTags(state, item) {
    var toolIds = list(item.dependencies && item.dependencies.toolIds);
    if (!toolIds.length) return '<span class="table-secondary">未包含 Tool</span>';
    return '<div class="dependency-chips">' + toolIds.map(function map(toolId) {
      var matched = list(state.tools).find(function find(tool) { return tool.id === toolId; });
      return '<span class="tag">' + dom.escape(matched ? matched.name : toolId) + '</span>';
    }).join("") + '</div>';
  }

  function dependencyBlockers(state, item) {
    var dependencies = item && item.dependencies || {};
    var references = list(dependencies.toolIds).map(function map(id) {
      return { id: id, item: list(state.tools).find(function find(tool) { return tool.id === id; }) };
    }).concat(list(dependencies.skillIds).map(function map(id) {
      return { id: id, item: list(state.skills).find(function find(skill) { return skill.id === id; }) };
    }));
    return references.filter(function filter(reference) {
      return !reference.item || !enabled(reference.item) || reference.item.status !== "available";
    }).map(function map(reference) {
      return reference.item ? reference.item.name : reference.id;
    }).filter(Boolean);
  }

  function enabledSkillDependents(state, item) {
    return list(state.skills).filter(function filter(skill) {
      if (!enabled(skill) || skill.id === item.id) return false;
      var ids = list(skill.dependencies && skill.dependencies.skillIds);
      return ids.indexOf(item.id) >= 0;
    });
  }

  function capabilityIcon(item, kind) {
    return text(item && item.icon, kind === "skills" ? "sparkles" : "wrench");
  }

  function skillRowActions(item) {
    return '<button type="button" class="table-action" data-capability-detail="' + dom.escape(item.id) + '">查看</button>' +
      '<button type="button" class="table-action table-action--danger" data-capability-delete="' + dom.escape(item.id) + '"' + (enabled(item) ? ' disabled title="请先停用后删除"' : '') + '>删除</button>';
  }

  function skillTable(items, state) {
    if (!items.length) return dom.empty("没有匹配的 Skill", "请调整搜索条件。", "search-x");
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Skill</th><th>包含的 Tool</th><th>本月调用</th><th>启用状态</th><th>操作</th>' +
      '</tr></thead><tbody>' + items.map(function row(item) {
        var description = text(valueOf(item, ["description", "summary"], "暂无说明"));
        var realError = enabled(item) && item.status && item.status !== "available" ? '<div class="table-secondary table-secondary--danger">当前能力不可用</div>' : "";
        return '<tr data-capability-row><td><div class="capability-name"><span class="capability-icon">' + dom.icon(capabilityIcon(item, "skills"), 16) + '</span><div><div class="table-primary">' + dom.escape(item.name) + '</div><div class="table-secondary">' + dom.escape(description) + '</div>' + realError + '</div></div></td>' +
          '<td>' + calledToolTags(state, item) + '</td>' +
          '<td>' + dom.formatNumber(capabilityCalls(item)) + '</td>' +
          '<td><button type="button" class="switch' + (enabled(item) ? " is-on" : "") + '" role="switch" aria-checked="' + enabled(item) + '" aria-label="' + (enabled(item) ? "停用" : "启用") + dom.escape(item.name) + '" data-capability-toggle="' + dom.escape(item.id) + '"></button></td>' +
          '<td><div class="capability-row-actions">' + skillRowActions(item) + '</div></td></tr>';
      }).join("") + '</tbody></table></div><div class="table-footer">共 ' + items.length + ' 项</div>';
  }

  function renderSkillPage(state) {
    var source = list(state.skills);
    var query = skillQuery.trim().toLowerCase();
    var items = source.filter(function filter(item) {
      return !query || [item.name, item.description].join(" ").toLowerCase().indexOf(query) >= 0;
    });
    return dom.pageHeader({
      title: "Skill 目录",
      actions: dom.button("上传 Skill", {
        variant: "primary",
        icon: "folder-up",
        attrs: "data-capability-upload"
      }),
      toolbar: {
        search: {
          value: skillQuery,
          placeholder: "搜索名称或描述",
          attrs: "data-capability-search"
        }
      }
    }) +
      '<div class="page-content">' +
      '<section class="table-surface" aria-label="Skill 目录">' + skillTable(items, state) + "</section></div>";
  }

  function skillById(state, id) {
    return list(state.skills).find(function find(item) { return item.id === id; });
  }

  function skillMarkdownText(item, name, description) {
    var source = String(item && item.skillMarkdown || "").trim();
    if (source) {
      source = /^name\s*:/mi.test(source) ? source.replace(/^name\s*:\s*.*$/mi, "name: " + JSON.stringify(name)) : source;
      source = /^description\s*:/mi.test(source) ? source.replace(/^description\s*:\s*.*$/mi, "description: " + JSON.stringify(description)) : source;
      return source;
    }
    return [
      "---",
      "name: " + JSON.stringify(name),
      "description: " + JSON.stringify(description),
      "---",
      "",
      "# " + name,
      "",
      description,
      "",
      "## 输入",
      text(item && item.inputSummary, "由业务请求提供必要参数。"),
      "",
      "## 输出",
      text(item && item.outputSummary, "返回该能力定义的处理结果。"),
      "",
      "## 异常处理",
      text(item && item.fallback, "信息不足时明确说明限制，不补造结果。")
    ].join("\n");
  }

  function renderSkillMarkdownInline(value) {
    return String(value || "").split(/(`[^`]*`)/g).map(function render(segment) {
      if (segment.charAt(0) === "`" && segment.charAt(segment.length - 1) === "`") {
        return "<code>" + dom.escape(segment.slice(1, -1)) + "</code>";
      }
      return dom.escape(segment)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    }).join("");
  }

  function renderSkillMarkdownHtml(source) {
    var markdown = String(source || "").replace(/\r\n?/g, "\n").trim();
    if (/^---\n/.test(markdown)) markdown = markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    var lines = markdown.split("\n");
    var output = [];
    var paragraph = [];
    var listType = "";
    var listItems = [];
    var codeLines = [];
    var inCode = false;

    function flushParagraph() {
      if (!paragraph.length) return;
      output.push('<p>' + renderSkillMarkdownInline(paragraph.join(" ")) + '</p>');
      paragraph = [];
    }

    function flushList() {
      if (!listItems.length) return;
      output.push("<" + listType + ">" + listItems.map(function renderItem(item) {
        return "<li>" + renderSkillMarkdownInline(item) + "</li>";
      }).join("") + "</" + listType + ">");
      listType = "";
      listItems = [];
    }

    function flushCode() {
      if (!codeLines.length) return;
      output.push('<pre><code>' + dom.escape(codeLines.join("\n")) + '</code></pre>');
      codeLines = [];
    }

    lines.forEach(function parseLine(line) {
      var heading = line.match(/^(#{1,6})\s+(.+)$/);
      var unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      var ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      var quote = line.match(/^>\s?(.*)$/);
      if (/^```/.test(line.trim())) {
        flushParagraph();
        flushList();
        if (inCode) flushCode();
        inCode = !inCode;
        return;
      }
      if (inCode) {
        codeLines.push(line);
        return;
      }
      if (!line.trim()) {
        flushParagraph();
        flushList();
        return;
      }
      if (heading) {
        flushParagraph();
        flushList();
        var level = Math.min(5, Math.max(3, heading[1].length + 2));
        output.push("<h" + level + ">" + renderSkillMarkdownInline(heading[2]) + "</h" + level + ">");
        return;
      }
      if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
        flushParagraph();
        flushList();
        output.push("<hr>");
        return;
      }
      if (quote) {
        flushParagraph();
        flushList();
        output.push("<blockquote>" + renderSkillMarkdownInline(quote[1]) + "</blockquote>");
        return;
      }
      if (unordered || ordered) {
        flushParagraph();
        var nextType = unordered ? "ul" : "ol";
        if (listType && listType !== nextType) flushList();
        listType = nextType;
        listItems.push((unordered || ordered)[1]);
        return;
      }
      flushList();
      paragraph.push(line.trim());
    });
    flushParagraph();
    flushList();
    flushCode();
    return output.join("") || '<p class="table-secondary">暂无内容</p>';
  }

  function skillEditorHtml(item) {
    var description = text(valueOf(item, ["description", "summary"], ""), "");
    return '<div class="skill-drawer-editor" data-skill-editor>' +
      '<div class="form-field">' + dom.requiredLabel("名称", { forId: "skill-detail-name" }) + '<input id="skill-detail-name" class="field" type="text" maxlength="60" value="' + dom.escape(item.name) + '" required aria-required="true" data-skill-name></div>' +
      '<div class="form-field">' + dom.requiredLabel("描述", { forId: "skill-detail-description" }) + '<textarea id="skill-detail-description" class="textarea-field skill-detail-description" maxlength="240" required aria-required="true" data-skill-description>' + dom.escape(description) + '</textarea></div>' +
      '<div class="form-field skill-markdown-field"><div class="form-label">SKILL.md</div><div class="skill-markdown-rendered" aria-label="SKILL.md 内容" data-skill-markdown-content>' + renderSkillMarkdownHtml(skillMarkdownText(item, item.name, description)) + '</div></div>' +
      '</div>';
  }

  function mountSkillDrawerHeader(drawer, item) {
    var header = drawer && drawer.querySelector(".drawer__header");
    var heading = header && header.querySelector(".drawer__title");
    var close = header && header.querySelector(".drawer__close");
    if (!header || !heading) return;
    header.classList.add("skill-drawer__header");
    heading.innerHTML = '<span data-skill-drawer-name>' + dom.escape(item.name) + '</span><small>Skill</small>';
    var meta = document.createElement("div");
    meta.className = "skill-drawer__header-meta";
    meta.innerHTML = '<span class="skill-drawer__calls"><small>本月调用</small><strong>' + dom.formatNumber(capabilityCalls(item)) + ' 次</strong></span>' +
      '<button type="button" class="switch' + (enabled(item) ? " is-on" : "") + '" role="switch" aria-checked="' + enabled(item) + '" aria-label="' + (enabled(item) ? "停用" : "启用") + dom.escape(item.name) + '" data-skill-drawer-toggle="' + dom.escape(item.id) + '"></button>';
    header.insertBefore(meta, close || null);
    dom.hydrateIcons(header);
  }

  function openSkillDetail(item, state) {
    if (!item) return;
    var originalName = item.name;
    var originalDescription = text(valueOf(item, ["description", "summary"], ""), "");
    overlay.open({
      kind: "drawer",
      title: item.name,
      cancelLabel: false,
      confirmLabel: "保存修改",
      body: skillEditorHtml(item),
      onConfirm: function onConfirm(root) {
        var name = root.querySelector("[data-skill-name]").value.trim();
        var description = root.querySelector("[data-skill-description]").value.trim();
        if (!name || !description) {
          overlay.toast("信息不完整", "请填写名称和描述。", "warning");
          return false;
        }
        var result = action("updateCapability", ["skill", item.id, { name: name, description: description }]);
        if (!result) {
          overlay.toast("未能保存", "请检查名称是否与现有 Skill 重复。", "warning");
          return false;
        }
        overlay.toast("信息已更新", result.name + " 已保存。", "success");
        return true;
      }
    });
    var drawer = document.querySelector("#overlay-root .drawer");
    if (!drawer) return;
    mountSkillDrawerHeader(drawer, item);
    var nameInput = drawer.querySelector("[data-skill-name]");
    var descriptionInput = drawer.querySelector("[data-skill-description]");
    var markdown = drawer.querySelector("[data-skill-markdown-content]");
    var save = drawer.querySelector("[data-overlay-confirm]");
    var footer = save && save.closest(".drawer__footer");
    if (save) {
      save.hidden = true;
      save.disabled = true;
    }
    if (footer) footer.hidden = true;
    function updatePreview() {
      var name = nameInput.value.trim();
      var description = descriptionInput.value.trim();
      var dirty = name !== originalName || description !== originalDescription;
      var headerName = drawer.querySelector("[data-skill-drawer-name]");
      if (headerName) headerName.textContent = name || originalName;
      if (markdown) markdown.innerHTML = renderSkillMarkdownHtml(skillMarkdownText(item, name || originalName, description || originalDescription));
      if (footer) footer.hidden = !dirty;
      if (save) {
        save.hidden = !dirty;
        save.disabled = !name || !description;
      }
    }
    nameInput.addEventListener("input", updatePreview);
    descriptionInput.addEventListener("input", updatePreview);
    var toggle = drawer.querySelector("[data-skill-drawer-toggle]");
    if (toggle) toggle.addEventListener("click", function handle() {
      var currentState = OpsDemo.core.store.getState();
      confirmSkillToggle(skillById(currentState, item.id), currentState);
    });
  }

  function confirmSkillToggle(item, state) {
    var next = !enabled(item);
    var blockers = next ? dependencyBlockers(state, item) : [];
    var dependents = !next ? enabledSkillDependents(state, item) : [];
    if (blockers.length || dependents.length) {
      var names = blockers.length ? blockers : dependents.map(function map(skill) { return skill.name; });
      overlay.open({
        kind: "dialog",
        title: next ? "暂不能启用" : "暂不能停用",
        footer: false,
        body: '<div class="stack"><div class="notice notice--danger"><div class="notice__content"><div class="notice__title">请先处理依赖关系</div>' + (next ? "尚未启用或不可用：" : "仍被已启用 Skill 使用：") + dom.escape(names.join("、")) + '</div></div><div class="dialog-inline-actions">' + dom.button("知道了", { variant: "primary", attrs: "data-overlay-close" }) + '</div></div>'
      });
      return;
    }
    var skillToolIds = list(item.dependencies && item.dependencies.toolIds);
    var skillToolNames = skillToolIds.map(function map(id) { return list(state.tools).find(function find(tool) { return tool.id === id; }); }).filter(Boolean).map(function map(tool) { return tool.name; });
    var calledToolsImpact = '<div class="impact-item">' + dom.icon("git-branch", 15) + '<span>调用的 Tool：' + dom.escape(skillToolNames.join("、") || "无") + '</span></div>';
    overlay.confirm({
      title: (next ? "启用" : "停用") + item.name,
      confirmLabel: next ? "确认启用" : "确认停用",
      confirmVariant: next ? "primary" : "danger",
      body: '<div class="stack"><div class="notice"><span>' + dom.icon(next ? "circle-check" : "info", 17) + '</span><div class="notice__content"><div class="notice__title">影响范围</div>' +
        (next ? "启用后，数据智能分析 Agent 可以调用该能力。" : "停用后，新任务将不再调用该能力；已生成产物不受影响。") + '</div></div>' +
        '<div class="impact-list">' + calledToolsImpact + '</div></div>',
      onConfirm: function onConfirm() {
        var result = action("toggleCapability", ["skill", item.id, next]);
        if (!result) { overlay.toast("状态未更新", "依赖关系已经变化，请刷新后重试。", "warning"); return false; }
        overlay.toast("状态已更新", item.name + " 已" + (next ? "启用" : "停用") + "。", next ? "success" : "info");
        return true;
      }
    });
  }

  function yamlValue(source, key) {
    var match = String(source || "").match(new RegExp("^" + key + "\\s*:\\s*(.+)$", "mi"));
    return match ? match[1].trim().replace(/^['\"]|['\"]$/g, "") : "";
  }

  function packageDropHtml() {
    return '<div class="form-field capability-package-field">' + dom.requiredLabel("Skill 目录", { forId: "capability-package-file" }) + '<div data-capability-package-empty><label class="file-drop capability-package-drop" for="capability-package-file" data-capability-package-drop>' + dom.icon("folder-up", 28) +
      '<strong>选择或拖入 Skill 目录</strong><span>目录中必须包含唯一的 SKILL.md</span><span class="btn btn--secondary file-drop__choose">选择目录</span>' +
      '<input id="capability-package-file" class="sr-only" type="file" required aria-required="true" webkitdirectory directory multiple data-capability-package-input /></label></div>' +
      '<div class="capability-package-summary" data-capability-package-selected hidden><div class="capability-package-summary__content" data-capability-package-summary></div><button type="button" class="icon-button capability-package-remove" aria-label="删除已选 Skill 目录" title="删除后重新选择" data-capability-package-remove>' + dom.icon("trash-2", 16) + '</button></div>' +
      '<div class="form-error capability-package-error" data-capability-package-error hidden></div></div>';
  }

  function skillFormHtml() {
    return '<div class="stack capability-form" data-capability-form>' + packageDropHtml() +
      '<div class="form-field">' + dom.requiredLabel("名称", { forId: "capability-name" }) + '<input id="capability-name" class="field" type="text" maxlength="60" value="" required aria-required="true" data-capability-name></div>' +
      '<div class="form-field">' + dom.requiredLabel("描述", { forId: "capability-description" }) + '<textarea id="capability-description" class="textarea-field capability-description" maxlength="240" required aria-required="true" data-capability-description></textarea></div></div>';
  }

  function setPackageError(root, message) {
    var error = root.querySelector("[data-capability-package-error]");
    if (!error) return;
    error.hidden = !message;
    error.textContent = message || "";
  }

  function setPackageSummary(root, icon, title, detail) {
    var summary = root.querySelector("[data-capability-package-summary]");
    if (!summary) return;
    summary.innerHTML = dom.icon(icon, 17) + '<span><strong>' + dom.escape(title) + '</strong><small>' + dom.escape(detail) + '</small></span>';
    dom.hydrateIcons(summary);
  }

  function bindSkillPackage(root, uploadState) {
    var input = root.querySelector("[data-capability-package-input]");
    var drop = root.querySelector("[data-capability-package-drop]");
    var empty = root.querySelector("[data-capability-package-empty]");
    var selected = root.querySelector("[data-capability-package-selected]");
    var remove = root.querySelector("[data-capability-package-remove]");
    var confirm = root.querySelector("[data-overlay-confirm]");
    if (!input) return;
    if (confirm) confirm.disabled = true;

    async function acceptFiles(fileList) {
      var files = Array.from(fileList || []);
      uploadState.valid = false;
      uploadState.meta = null;
      setPackageError(root, "");
      if (!files.length) return;
      var manifests = files.filter(function filter(file) { return String(file.name).toLowerCase() === "skill.md"; });
      var roots = files.map(function map(file) { return String(file.webkitRelativePath || "").split("/")[0]; }).filter(Boolean).filter(function unique(value, index, all) { return all.indexOf(value) === index; });
      if (manifests.length !== 1 || roots.length > 1) {
        setPackageError(root, manifests.length !== 1 ? "所选目录必须包含且只包含一个 SKILL.md。" : "一次只能添加一个 Skill 目录。");
        if (confirm) confirm.disabled = true;
        return;
      }
      var manifest = manifests[0];
      var source = await manifest.text();
      var parsedName = yamlValue(source, "name");
      var parsedDescription = yamlValue(source, "description");
      if (!parsedName || !parsedDescription) {
        setPackageError(root, "SKILL.md 缺少 name 或 description。");
        if (confirm) confirm.disabled = true;
        return;
      }
      var rootName = roots[0] || parsedName;
      uploadState.meta = { fileName: rootName, rootName: rootName, fileCount: files.length, totalBytes: files.reduce(function sum(total, file) { return total + Number(file.size || 0); }, 0), fileType: "directory", manifestPath: manifest.webkitRelativePath || "SKILL.md" };
      uploadState.markdown = source;
      root.querySelector("[data-capability-name]").value = parsedName;
      root.querySelector("[data-capability-description]").value = parsedDescription;
      setPackageSummary(root, "folder-check", rootName, files.length + " 个文件 · " + formatBytes(uploadState.meta.totalBytes) + " · 已读取 SKILL.md");
      if (empty) empty.hidden = true;
      if (selected) selected.hidden = false;
      uploadState.valid = true;
      if (confirm) confirm.disabled = false;
    }

    function resetSelection() {
      input.value = "";
      uploadState.valid = false;
      uploadState.meta = null;
      uploadState.markdown = "";
      root.querySelector("[data-capability-name]").value = "";
      root.querySelector("[data-capability-description]").value = "";
      setPackageError(root, "");
      if (selected) selected.hidden = true;
      if (empty) empty.hidden = false;
      if (confirm) confirm.disabled = true;
    }

    input.addEventListener("change", function handle() { acceptFiles(input.files); });
    if (remove) remove.addEventListener("click", resetSelection);
    if (drop) {
      ["dragenter", "dragover"].forEach(function each(name) { drop.addEventListener(name, function handle(event) { event.preventDefault(); drop.classList.add("is-dragover"); }); });
      ["dragleave", "dragend"].forEach(function each(name) { drop.addEventListener(name, function handle() { drop.classList.remove("is-dragover"); }); });
      drop.addEventListener("drop", function handle(event) { event.preventDefault(); drop.classList.remove("is-dragover"); acceptFiles(event.dataTransfer.files); });
    }
  }

  function openSkillForm() {
    var uploadState = { valid: false, meta: null, markdown: "" };
    overlay.open({
      kind: "dialog",
      wide: true,
      title: "上传 Skill",
      confirmLabel: "添加到目录",
      body: skillFormHtml(),
      onConfirm: function onConfirm(root) {
        var name = root.querySelector("[data-capability-name]").value.trim();
        var description = root.querySelector("[data-capability-description]").value.trim();
        if (!name || !description) { overlay.toast("信息不完整", "请填写名称和描述。", "warning"); return false; }
        if (!uploadState.valid) { overlay.toast("尚未选择有效内容", "请选择包含 SKILL.md 的目录。", "warning"); return false; }
        var payload = { name: name, description: description, toolIds: [], skillMarkdown: uploadState.markdown };
        Object.assign(payload, uploadState.meta || {}, { packageMeta: uploadState.meta || {} });
        var result = action("createCapabilityFromUpload", ["skill", payload]);
        if (!result) { overlay.toast("未能保存", "请检查名称是否重复或目录内容是否有效。", "warning"); return false; }
        overlay.toast("已添加到目录", result.name + " 已加入目录。", "success");
        return true;
      }
    });
    var root = document.getElementById("overlay-root");
    bindSkillPackage(root, uploadState);
  }

  function confirmSkillDelete(item, state) {
    if (!item) return;
    if (enabled(item)) { overlay.toast("请先停用", "停用后才能删除该能力。", "warning"); return; }
    var dependents = enabledSkillDependents(state, item);
    if (dependents.length) { overlay.toast("暂不能删除", "仍被已启用 Skill 使用：" + dependents.map(function map(skill) { return skill.name; }).join("、"), "warning"); return; }
    overlay.confirm({
      title: "删除" + item.name,
      confirmLabel: "确认删除",
      confirmVariant: "danger",
      body: '<div class="notice notice--danger"><div class="notice__content"><div class="notice__title">从目录中移除</div>删除后，该 Skill 将无法再被新任务调用；已经生成的报告不受影响。</div></div>',
      onConfirm: function onConfirm() {
        var result = action("deleteCapability", ["skill", item.id]);
        if (!result) { overlay.toast("未能删除", "请确认能力已停用且未被使用。", "warning"); return false; }
        overlay.toast("已删除", item.name + " 已从目录移除。", "info");
        return true;
      }
    });
  }

  function mountSkillPage(root) {
    root.addEventListener("input", function onInput(event) {
      var target = event.target.closest("[data-capability-search]");
      if (!target) return;
      skillQuery = target.value;
      var query = target.value.trim().toLowerCase();
      root.querySelectorAll("[data-capability-row]").forEach(function filterRow(row) {
        row.hidden = Boolean(query) && row.textContent.toLowerCase().indexOf(query) < 0;
      });
    });
    root.addEventListener("click", function onClick(event) {
      var state = OpsDemo.core.store.getState();
      var upload = event.target.closest("[data-capability-upload]");
      if (upload) return openSkillForm();
      var detail = event.target.closest("[data-capability-detail]");
      if (detail) return openSkillDetail(skillById(state, detail.getAttribute("data-capability-detail")), state);
      var toggle = event.target.closest("[data-capability-toggle]");
      if (toggle) return confirmSkillToggle(skillById(state, toggle.getAttribute("data-capability-toggle")), state);
      var remove = event.target.closest("[data-capability-delete]");
      if (remove) return confirmSkillDelete(skillById(state, remove.getAttribute("data-capability-delete")), state);
    });
  }

  function visualizationSkill(state) {
    return list(state.skills).find(function find(item) {
      return /图表|可视化|chart|visual/i.test([item.id, item.name, item.description].join(" "));
    });
  }

  function visualizationRuntimeAvailable(state, skill) {
    if (!skill || !enabled(skill) || skill.status !== "available") return false;
    return list(skill.dependencies && skill.dependencies.toolIds).every(function every(toolId) {
      var tool = list(state.tools).find(function find(item) { return item.id === toolId; });
      return Boolean(tool && enabled(tool) && tool.status === "available");
    });
  }

  /*
   * The catalog below follows deer-flow's chart-visualization tool mapping.
   * Previews are lightweight local ECharts approximations and do not invoke
   * AntV at runtime. Only the 25 tools present in scripts/generate.js are
   * exposed; generate_spreadsheet is omitted because it has no mapping.
   */
  var VISUAL_CATEGORIES = ["时间序列", "对比", "占比构成", "关系与流向", "地图", "层级与树", "专用图表"];

  var VISUAL_META = [
    ["generate_line_chart", "折线图", "时间序列", "line", "chart-no-axes-combined", "展示时间或连续自变量的趋势。", "时间、数值；多系列时增加分组。", "修改某个时间点或新增分组，观察趋势与图例是否同步。"],
    ["generate_area_chart", "面积图", "时间序列", "area", "chart-area", "展示指标随时间的变化和累计贡献。", "时间、数值；堆叠时必须提供分组。", "切换堆叠开关，并调整两个分组的数值比例。"],
    ["generate_dual_axes_chart", "双轴图", "时间序列", "dual", "chart-spline", "在同一画布对比两类不同量纲的指标。", "共享类目和柱状或折线系列，数组长度一致。", "修改两个系列的量级，检查左右坐标轴是否分别适配。"],
    ["generate_bar_chart", "条形图", "对比", "bar", "chart-bar", "用横向条形比较类别表现，适合排名和长标签。", "类别、数值；分组或堆叠时增加分组。", "调整类别名称长度和排名数值，检查标签可读性。"],
    ["generate_column_chart", "柱状图", "对比", "column", "chart-column", "用纵向柱体对比少量类别或时间段。", "类别、数值；分组或堆叠时增加分组。", "增减类别或切换分组、堆叠，检查柱体间距。"],
    ["generate_histogram_chart", "直方图", "对比", "histogram", "chart-column-stacked", "通过分箱展示连续数值的频数分布。", "连续数值数组，正式分析建议不少于 30 个样本。", "修改分箱数量并增加离群值，观察分布轮廓变化。"],
    ["generate_pie_chart", "饼图与环图", "占比构成", "pie", "chart-pie", "展示整体中各组成部分的占比。", "类别和非负数值，类别建议不超过 6 个。", "调整内径生成饼图或环图，并修改各分类占比。"],
    ["generate_treemap_chart", "矩形树图", "占比构成", "treemap", "layout-grid", "用嵌套矩形表达层级结构与节点权重。", "节点名称和非负数值，可递归嵌套子节点。", "增加子节点或改变权重，观察面积和层级的变化。"],
    ["generate_scatter_chart", "散点图", "关系与流向", "scatter", "scatter-chart", "展示两个连续变量的关系和异常点。", "X、Y 数值，可选提供分组。", "增加一个离群点或分组，检查点位置与分组颜色。"],
    ["generate_sankey_chart", "桑基图", "关系与流向", "sankey", "git-fork", "展示资源或用户在节点间的流向和数量。", "起点、终点和流量数值。", "修改某条连线流量或增加节点，观察流带宽度。"],
    ["generate_venn_chart", "维恩图", "关系与流向", "placeholder", "circle-dot-dashed", "展示多个集合之间的交集、并集与差异。", "权重和集合名数组，建议不超过 4 个集合。", "修改交集权重或增加集合，检查集合定义是否完整。"],
    ["generate_district_map", "中国行政区地图", "地图", "placeholder", "map", "展示中国境内省、市、区县的指标分布。", "标题不超过 16 字，行政区名需精确到省市区县。", "修改子行政区数值与色带，检查数据层级和单位。"],
    ["generate_pin_map", "中国点标地图", "地图", "placeholder", "map-pin", "在中国地图上标注多个地理位置。", "标题不超过 16 字，点位需为中国境内具体地标。", "增删城市与地标名称，检查每个点位的地理限定。"],
    ["generate_path_map", "中国路径地图", "地图", "placeholder", "route", "在中国地图上按顺序连接地点展示路线。", "标题不超过 16 字，每条路线提供有序的 POI 名。", "调整地点顺序或新增路线，检查路线先后关系。"],
    ["generate_organization_chart", "组织架构图", "层级与树", "tree", "network", "展示组织、团队或项目的严格层级关系。", "根节点名称和递归子节点，建议不超过 3 层。", "增加部门或切换水平、垂直方向，检查上下级关系。"],
    ["generate_mind_map", "思维导图", "层级与树", "mindmap", "git-branch", "围绕中心主题展开多级分支。", "根节点名称和递归子节点，建议不超过 3 层。", "修改中心主题并增加二级分支，检查结构是否清晰。"],
    ["generate_radar_chart", "雷达图", "专用图表", "radar", "radar", "在多维坐标系中对比一个或多个对象。", "维度名和数值，多对象时增加分组。", "修改某个维度或增加对象，检查各维度量纲是否统一。"],
    ["generate_funnel_chart", "漏斗图", "专用图表", "funnel", "funnel", "展示多阶段转化或流失情况。", "按流程顺序排列的阶段名和数值。", "修改中间阶段数值，观察宽度与阶段顺序。"],
    ["generate_liquid_chart", "水波图", "专用图表", "placeholder", "circle-percent", "用液面高度强调单一百分比或进度。", "0 到 1 之间的单一比例数值。", "在 0 到 1 之间修改百分比，并切换容器形状。"],
    ["generate_word_cloud_chart", "词云图", "专用图表", "placeholder", "cloud", "根据词频或权重展示文本主题和热点。", "词语和数值权重。", "增删关键词或调整权重，检查主次关系。"],
    ["generate_boxplot_chart", "箱型图", "专用图表", "boxplot", "chart-candlestick", "展示最值、四分位和中位数。", "类别和原始数值，单类建议至少 5 个样本。", "向某一类别增加极端值，观察四分位的变化。"],
    ["generate_violin_chart", "小提琴图", "专用图表", "placeholder", "audio-waveform", "对比不同类别的分布形态。", "类别和原始数值，正式分析单类建议不少于 30 个样本。", "调整两组样本的集中区间，检查样本数是否充足。"],
    ["generate_network_graph", "网络关系图", "专用图表", "network", "share-2", "用节点和连线展示实体间关联。", "名称唯一的节点；连线引用已有节点。", "增加节点与连线，检查起终点是否能正确对应。"],
    ["generate_fishbone_diagram", "鱼骨图", "专用图表", "placeholder", "git-compare-arrows", "围绕中心问题展开原因类别和细化节点。", "根节点描述问题，递归子节点展开原因。", "在某个原因类别下增加叶子节点，检查层级。"],
    ["generate_flow_diagram", "流程图", "专用图表", "placeholder", "workflow", "用节点和有向连线展示业务流程。", "唯一节点名；连线起终点引用已有节点。", "增加一个分支和连线文本，检查流向是否清晰。"]
  ];

  var VISUAL_SAMPLES = {
    generate_line_chart: { axisXTitle: "月份", axisYTitle: "交付量", data: [{ time: "1月", value: 82 }, { time: "2月", value: 91 }, { time: "3月", value: 86 }, { time: "4月", value: 102 }] },
    generate_area_chart: { stack: true, axisXTitle: "月份", axisYTitle: "工作量", data: [{ time: "1月", value: 42, group: "已完成" }, { time: "1月", value: 18, group: "进行中" }, { time: "2月", value: 56, group: "已完成" }, { time: "2月", value: 22, group: "进行中" }, { time: "3月", value: 68, group: "已完成" }, { time: "3月", value: 19, group: "进行中" }] },
    generate_dual_axes_chart: { axisXTitle: "季度", categories: ["一季度", "二季度", "三季度", "四季度"], series: [{ name: "营收", type: "column", data: [320, 380, 420, 510], axisYTitle: "万元" }, { name: "利润率", type: "line", data: [12, 16, 15, 21], axisYTitle: "%" }] },
    generate_bar_chart: { axisXTitle: "完成量", axisYTitle: "区域", data: [{ category: "华东", value: 86 }, { category: "华南", value: 72 }, { category: "华北", value: 64 }, { category: "西南", value: 51 }] },
    generate_column_chart: { axisXTitle: "供应商分类", axisYTitle: "数量", data: [{ category: "A 类", value: 92 }, { category: "B 类", value: 76 }, { category: "C 类", value: 58 }, { category: "D 类", value: 44 }] },
    generate_histogram_chart: { binNumber: 6, axisXTitle: "交付周期（天）", axisYTitle: "频数", data: [61, 64, 66, 68, 69, 71, 72, 72, 73, 74, 74, 75, 77, 78, 79, 81, 82, 82, 84, 86, 87, 89, 91, 93, 95, 98, 101, 104, 108, 112] },
    generate_pie_chart: { innerRadius: 0.58, data: [{ category: "正常", value: 68 }, { category: "关注", value: 22 }, { category: "高风险", value: 10 }] },
    generate_treemap_chart: { data: [{ name: "原材料", value: 46, children: [{ name: "金属", value: 28 }, { name: "化工", value: 18 }] }, { name: "零部件", value: 34 }, { name: "服务", value: 20 }] },
    generate_scatter_chart: { axisXTitle: "交付评分", axisYTitle: "质量评分", data: [{ x: 82, y: 94, group: "A 类" }, { x: 76, y: 88, group: "A 类" }, { x: 64, y: 72, group: "B 类" }, { x: 55, y: 68, group: "B 类" }, { x: 91, y: 97, group: "A 类" }] },
    generate_sankey_chart: { nodeAlign: "justify", data: [{ source: "总预算", target: "原材料", value: 46 }, { source: "总预算", target: "服务", value: 30 }, { source: "原材料", target: "生产", value: 38 }, { source: "服务", target: "运维", value: 24 }] },
    generate_venn_chart: { data: [{ sets: ["高风险"], value: 28 }, { sets: ["延迟交付"], value: 34 }, { sets: ["高风险", "延迟交付"], value: 12, label: "双重风险" }] },
    generate_district_map: { data: { name: "上海市", dataType: "number", dataLabel: "供应商数量", dataValueUnit: "家", showAllSubdistricts: true, subdistricts: [{ name: "浦东新区", dataValue: "42" }, { name: "闵行区", dataValue: "28" }, { name: "徐汇区", dataValue: "19" }] } },
    generate_pin_map: { data: ["上海市徐汇区西岸智能谷", "苏州市工业园区金鸡湖大道", "杭州市余杭区未来科技城"] },
    generate_path_map: { data: [{ data: ["上海洋山深水港", "苏州工业园区", "合肥新桥机场"] }] },
    generate_organization_chart: { data: { name: "数据智能中心", description: "运营与研判", children: [{ name: "知识运营组" }, { name: "分析口径组" }, { name: "能力管理组" }] } },
    generate_mind_map: { data: { name: "供应商风险", children: [{ name: "交付", children: [{ name: "准时率" }, { name: "产能" }] }, { name: "质量", children: [{ name: "退货率" }, { name: "整改" }] }, { name: "合规" }] } },
    generate_radar_chart: { data: [{ name: "交付", value: 86, group: "A 供应商" }, { name: "质量", value: 92, group: "A 供应商" }, { name: "合规", value: 78, group: "A 供应商" }, { name: "产能", value: 84, group: "A 供应商" }, { name: "交付", value: 72, group: "B 供应商" }, { name: "质量", value: 81, group: "B 供应商" }, { name: "合规", value: 88, group: "B 供应商" }, { name: "产能", value: 69, group: "B 供应商" }] },
    generate_funnel_chart: { data: [{ category: "全部供应商", value: 240 }, { category: "完成初审", value: 176 }, { category: "进入复审", value: 108 }, { category: "通过认证", value: 72 }] },
    generate_liquid_chart: { percent: 0.82 },
    generate_word_cloud_chart: { data: [{ text: "交付延迟", value: 86 }, { text: "质量整改", value: 64 }, { text: "产能不足", value: 52 }, { text: "合同风险", value: 38 }, { text: "资料缺失", value: 26 }] },
    generate_boxplot_chart: { axisXTitle: "批次", axisYTitle: "数值", data: [{ category: "A 批次", value: 72 }, { category: "A 批次", value: 78 }, { category: "A 批次", value: 81 }, { category: "A 批次", value: 86 }, { category: "A 批次", value: 94 }, { category: "B 批次", value: 61 }, { category: "B 批次", value: 69 }, { category: "B 批次", value: 76 }, { category: "B 批次", value: 83 }, { category: "B 批次", value: 91 }] },
    generate_violin_chart: { data: [{ category: "A 组", value: 68 }, { category: "A 组", value: 72 }, { category: "A 组", value: 75 }, { category: "A 组", value: 79 }, { category: "A 组", value: 88 }, { category: "B 组", value: 58 }, { category: "B 组", value: 67 }, { category: "B 组", value: 74 }, { category: "B 组", value: 84 }, { category: "B 组", value: 96 }] },
    generate_network_graph: { data: { nodes: [{ name: "集团" }, { name: "供应商 A" }, { name: "供应商 B" }, { name: "物流商" }], edges: [{ source: "集团", target: "供应商 A", name: "采购" }, { source: "集团", target: "供应商 B", name: "采购" }, { source: "供应商 A", target: "物流商", name: "承运" }] } },
    generate_fishbone_diagram: { data: { name: "交付延迟", children: [{ name: "人员", children: [{ name: "排班不足" }] }, { name: "设备", children: [{ name: "停机频繁" }] }, { name: "物料", children: [{ name: "到货滞后" }] }] } },
    generate_flow_diagram: { data: { nodes: [{ name: "提交材料" }, { name: "形式检查" }, { name: "业务复核" }, { name: "完成准入" }], edges: [{ source: "提交材料", target: "形式检查" }, { source: "形式检查", target: "业务复核", name: "通过" }, { source: "业务复核", target: "完成准入" }] } }
  };

  /*
   * Only schemas that explicitly accept `title` receive it in their editable
   * sample payload. Diagram schemas use their root node/name instead.
   */
  var VISUAL_SAMPLE_TITLES = {
    generate_line_chart: "月度交付趋势",
    generate_area_chart: "工作量累计趋势",
    generate_dual_axes_chart: "营收与利润率",
    generate_bar_chart: "各区域完成量",
    generate_column_chart: "供应商分类数量",
    generate_histogram_chart: "交付周期分布",
    generate_pie_chart: "供应商风险构成",
    generate_treemap_chart: "供应链支出构成",
    generate_scatter_chart: "交付与质量关系",
    generate_sankey_chart: "预算流向",
    generate_venn_chart: "风险集合重叠",
    generate_district_map: "供应商地域分布",
    generate_pin_map: "华东供应商点位",
    generate_path_map: "华东配送路径",
    generate_radar_chart: "供应商能力对比",
    generate_funnel_chart: "供应商认证漏斗",
    generate_liquid_chart: "年度目标完成率",
    generate_word_cloud_chart: "风险关键词",
    generate_boxplot_chart: "批次数据分布",
    generate_violin_chart: "批次数据分布"
  };

  function visualParam(key, label, type, value, options) {
    return { key: key, label: label, type: type || "text", value: value, options: options || [] };
  }

  function standardParams(extras, noPalette) {
    var params = [
      visualParam("theme", "主题", "select", "default", [["default", "默认"], ["academy", "学术"], ["dark", "深色"]]),
      visualParam("width", "输出宽度", "number", 600),
      visualParam("height", "输出高度", "number", 400),
      visualParam("backgroundColor", "背景色", "color", "#ffffff")
    ];
    if (!noPalette) params.push(visualParam("palette", "系列配色", "text", "#1769e8, #76a8ee, #15a37d"));
    return params.concat(extras || []);
  }

  function diagramParams(extras) {
    return [
      visualParam("theme", "主题", "select", "default", [["default", "默认"], ["academy", "学术"], ["dark", "深色"]]),
      visualParam("width", "输出宽度", "number", 600),
      visualParam("height", "输出高度", "number", 400)
    ].concat(extras || []);
  }

  function mapParams(extras) {
    return [visualParam("width", "输出宽度", "number", 1600), visualParam("height", "输出高度", "number", 1000)].concat(extras || []);
  }

  function visualAxes(axisXTitle, axisYTitle) {
    return [visualParam("axisXTitle", "横轴标题", "text", axisXTitle), visualParam("axisYTitle", "纵轴标题", "text", axisYTitle)];
  }

  function paramsFor(code) {
    if (code === "generate_line_chart") return standardParams([visualParam("lineWidth", "折线宽度", "number", 2)].concat(visualAxes("月份", "交付量")));
    if (code === "generate_area_chart") return standardParams([visualParam("stack", "堆叠显示", "checkbox", false), visualParam("lineWidth", "边界线宽", "number", 2)].concat(visualAxes("月份", "工作量")));
    if (code === "generate_dual_axes_chart") return standardParams([visualAxes("类别", "")[0]]);
    if (code === "generate_bar_chart") return standardParams([visualParam("arrangement", "分组方式", "select", "stacked", [["grouped", "并排"], ["stacked", "堆叠"]])].concat(visualAxes("完成量", "区域")));
    if (code === "generate_column_chart") return standardParams([visualParam("arrangement", "分组方式", "select", "grouped", [["grouped", "并排"], ["stacked", "堆叠"]])].concat(visualAxes("供应商分类", "数量")));
    if (code === "generate_histogram_chart") return standardParams([visualParam("binNumber", "分箱数量", "number", 6)].concat(visualAxes("交付周期（天）", "频数")));
    if (code === "generate_pie_chart") return standardParams([visualParam("innerRadius", "内径比例", "number", 0)]);
    if (code === "generate_scatter_chart") return standardParams(visualAxes("X 值", "Y 值"));
    if (code === "generate_sankey_chart") return standardParams([visualParam("nodeAlign", "节点对齐", "select", "center", [["left", "左对齐"], ["right", "右对齐"], ["justify", "两端对齐"], ["center", "居中"]])]);
    if (code === "generate_radar_chart") return standardParams([visualParam("lineWidth", "边界线宽", "number", 2)]);
    if (code === "generate_liquid_chart") return standardParams([visualParam("shape", "容器形状", "select", "circle", [["circle", "圆形"], ["rect", "矩形"], ["pin", "标记"], ["triangle", "三角形"]]), visualParam("color", "水波颜色", "color", "#1769e8")], true);
    if (code === "generate_boxplot_chart" || code === "generate_violin_chart") return standardParams(visualAxes("类别", "数值"));
    if (code === "generate_organization_chart") return diagramParams([visualParam("orient", "排布方向", "select", "vertical", [["vertical", "垂直"], ["horizontal", "水平"]])]);
    if (code === "generate_mind_map" || code === "generate_network_graph" || code === "generate_fishbone_diagram" || code === "generate_flow_diagram") return diagramParams();
    if (code === "generate_district_map") return mapParams();
    if (code === "generate_pin_map") return mapParams([visualParam("markerPopupWidth", "弹图宽度", "number", 40), visualParam("markerPopupHeight", "弹图高度", "number", 40), visualParam("markerPopupRadius", "弹图圆角", "number", 8)]);
    if (code === "generate_path_map") return mapParams();
    return standardParams();
  }

  function visualizationCatalog(state) {
    var seeded = list(state.visualizations);
    return VISUAL_META.map(function map(row) {
      var match = seeded.find(function find(item) { return item.toolCode === row[0]; }) || {};
      var title = VISUAL_SAMPLE_TITLES[row[0]];
      var sample = Object.assign(title ? { title: title } : {}, VISUAL_SAMPLES[row[0]]);
      return { toolCode: row[0], name: row[1], category: row[2], renderer: row[3], icon: row[4], description: row[5], sample: sample, params: paramsFor(row[0]), callsThisMonth: capabilityCalls(match) };
    });
  }

  function visualDefaults(item) {
    var values = {};
    list(item.params).forEach(function each(parameter) { values[parameter.key] = parameter.value; });
    return values;
  }

  function visualPalette(params) {
    var colors = String(params.palette || "").split(",").map(function trim(color) { return color.trim(); }).filter(Boolean);
    return colors.length ? colors : ["#1769e8", "#76a8ee", "#15a37d", "#ed8b16"];
  }

  function visualUnique(values) {
    return values.filter(function keep(value, index) { return values.indexOf(value) === index; });
  }

  function visualBaseOption(params, compact, title) {
    var dark = params.theme === "dark";
    return {
      animationDuration: compact ? 0 : 280,
      backgroundColor: dark ? "#172033" : params.backgroundColor || "#ffffff",
      color: visualPalette(params),
      textStyle: { color: dark ? "#dbe4f3" : "#475467", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" },
      title: compact || !title ? undefined : { text: title, left: 10, top: 7, textStyle: { color: dark ? "#f3f6fb" : "#202939", fontSize: 13, fontWeight: 650 } },
      tooltip: { trigger: "item", borderWidth: 1, borderColor: "#e3e8ef", backgroundColor: "#fff", textStyle: { color: "#344054", fontSize: 11 } }
    };
  }

  function visualGrid(compact) {
    return compact ? { left: 10, right: 10, top: 10, bottom: 10 } : { left: 52, right: 24, top: 54, bottom: 42 };
  }

  function groupedValues(data, dimensionKey, valueKey, params, area, compact) {
    var dimensions = visualUnique(data.map(function map(row) { return row[dimensionKey]; }));
    var groups = visualUnique(data.map(function map(row) { return row.group || "数值"; }));
    return {
      dimensions: dimensions,
      groups: groups,
      series: groups.map(function map(group) {
        return {
          name: group,
          type: area ? "line" : "bar",
          data: dimensions.map(function map(dimension) {
            var found = data.find(function find(row) { return row[dimensionKey] === dimension && (row.group || "数值") === group; });
            return found ? Number(found[valueKey]) : 0;
          }),
          smooth: false,
          symbol: compact ? "none" : "circle",
          stack: params.stack || params.arrangement === "stacked" ? "合计" : undefined,
          areaStyle: area ? { opacity: 0.18 } : undefined,
          lineStyle: area ? { width: Number(params.lineWidth) || 2 } : undefined,
          itemStyle: area ? undefined : { borderRadius: [3, 3, 0, 0] }
        };
      })
    };
  }

  function visualQuantile(values, ratio) {
    if (!values.length) return 0;
    var position = (values.length - 1) * ratio;
    var base = Math.floor(position);
    var rest = position - base;
    return values[base + 1] == null ? values[base] : values[base] + rest * (values[base + 1] - values[base]);
  }

  function histogramBins(values, requestedCount) {
    var numbers = values.map(Number).filter(Number.isFinite);
    if (!numbers.length) return { labels: [], values: [] };
    var min = Math.min.apply(Math, numbers);
    var max = Math.max.apply(Math, numbers);
    var count = Math.max(1, Math.min(20, Number(requestedCount) || 6));
    var width = (max - min || 1) / count;
    var bins = Array.from({ length: count }, function make() { return 0; });
    numbers.forEach(function each(value) { bins[Math.min(count - 1, Math.floor((value - min) / width))] += 1; });
    return { labels: bins.map(function map(value, index) { return (min + index * width).toFixed(0) + "–" + (min + (index + 1) * width).toFixed(0); }), values: bins };
  }

  function visualChartOption(item, payload, params, compact) {
    var option = visualBaseOption(params, compact, payload && payload.title);
    var data = list(payload && payload.data);
    var dark = params.theme === "dark";
    var axisLabel = { show: !compact, color: dark ? "#aebbd0" : "#7a8493", fontSize: 10 };
    var splitLine = { show: !compact, lineStyle: { color: dark ? "#2d3950" : "#edf1f5" } };
    var grouped;

    if (item.renderer === "line" || item.renderer === "area") {
      grouped = groupedValues(data, "time", "value", params, true, compact);
      grouped.series.forEach(function each(series) { if (item.renderer === "line") series.areaStyle = undefined; });
      return Object.assign(option, { tooltip: { trigger: "axis" }, legend: compact || grouped.groups.length < 2 ? undefined : { top: 31, right: 14 }, grid: visualGrid(compact), xAxis: { type: "category", boundaryGap: false, data: grouped.dimensions, name: compact ? "" : params.axisXTitle, axisLabel: axisLabel, axisTick: { show: false } }, yAxis: { type: "value", name: compact ? "" : params.axisYTitle, axisLabel: axisLabel, splitLine: splitLine }, series: grouped.series });
    }
    if (item.renderer === "dual") {
      var dualSeries = list(payload.series);
      var leftAxisTitle = dualSeries[0] && dualSeries[0].axisYTitle || "";
      var rightAxisTitle = dualSeries[1] && dualSeries[1].axisYTitle || "";
      return Object.assign(option, { tooltip: { trigger: "axis" }, legend: compact ? undefined : { top: 31, right: 14 }, grid: compact ? visualGrid(true) : { left: 52, right: 52, top: 54, bottom: 42 }, xAxis: { type: "category", data: list(payload.categories), name: compact ? "" : params.axisXTitle, axisLabel: axisLabel, axisTick: { show: false } }, yAxis: [{ type: "value", name: compact ? "" : leftAxisTitle, axisLabel: axisLabel, splitLine: splitLine }, { type: "value", name: compact ? "" : rightAxisTitle, axisLabel: axisLabel, splitLine: { show: false } }], series: dualSeries.map(function map(series, index) { return { name: series.name || "系列 " + (index + 1), type: series.type === "column" ? "bar" : "line", yAxisIndex: index ? 1 : 0, data: list(series.data), symbol: compact ? "none" : "circle", itemStyle: series.type === "column" ? { borderRadius: [3, 3, 0, 0] } : undefined }; }) });
    }
    if (item.renderer === "bar" || item.renderer === "column") {
      grouped = groupedValues(data, "category", "value", params, false, compact);
      var horizontal = item.renderer === "bar";
      return Object.assign(option, { tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: compact || grouped.groups.length < 2 ? undefined : { top: 31, right: 14 }, grid: visualGrid(compact), xAxis: horizontal ? { type: "value", name: compact ? "" : params.axisXTitle, axisLabel: axisLabel, splitLine: splitLine } : { type: "category", data: grouped.dimensions, name: compact ? "" : params.axisXTitle, axisLabel: axisLabel, axisTick: { show: false } }, yAxis: horizontal ? { type: "category", inverse: true, data: grouped.dimensions, name: compact ? "" : params.axisYTitle, axisLabel: axisLabel, axisTick: { show: false } } : { type: "value", name: compact ? "" : params.axisYTitle, axisLabel: axisLabel, splitLine: splitLine }, series: grouped.series });
    }
    if (item.renderer === "histogram") {
      var histogram = histogramBins(data, params.binNumber);
      return Object.assign(option, { tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, grid: visualGrid(compact), xAxis: { type: "category", data: histogram.labels, name: compact ? "" : params.axisXTitle, axisLabel: axisLabel, axisTick: { show: false } }, yAxis: { type: "value", name: compact ? "" : params.axisYTitle, axisLabel: axisLabel, splitLine: splitLine }, series: [{ type: "bar", data: histogram.values, barCategoryGap: "4%", itemStyle: { borderRadius: [3, 3, 0, 0] } }] });
    }
    if (item.renderer === "pie") return Object.assign(option, { legend: compact ? undefined : { bottom: 7, textStyle: { color: dark ? "#aebbd0" : "#667085", fontSize: 10 } }, series: [{ type: "pie", radius: [Math.max(0, Math.min(1, Number(params.innerRadius) || 0)) * 54 + "%", compact ? "72%" : "66%"], center: ["50%", compact ? "50%" : "48%"], label: { show: !compact, fontSize: 10 }, data: data.map(function map(row) { return { name: row.category, value: Number(row.value) }; }) }] });
    if (item.renderer === "treemap") return Object.assign(option, { series: [{ type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false }, label: { show: true, fontSize: compact ? 9 : 11 }, upperLabel: { show: true, height: compact ? 14 : 20, fontSize: compact ? 8 : 10 }, itemStyle: { gapWidth: 2, borderColor: "#fff" }, data: data }] });
    if (item.renderer === "scatter") {
      var scatterGroups = visualUnique(data.map(function map(row) { return row.group || "数值"; }));
      return Object.assign(option, { legend: compact || scatterGroups.length < 2 ? undefined : { top: 31, right: 14 }, grid: visualGrid(compact), xAxis: { type: "value", name: compact ? "" : params.axisXTitle, axisLabel: axisLabel, splitLine: splitLine }, yAxis: { type: "value", name: compact ? "" : params.axisYTitle, axisLabel: axisLabel, splitLine: splitLine }, series: scatterGroups.map(function map(group) { return { name: group, type: "scatter", symbolSize: compact ? 6 : 10, data: data.filter(function filter(row) { return (row.group || "数值") === group; }).map(function map(row) { return [Number(row.x), Number(row.y)]; }) }; }) });
    }
    if (item.renderer === "sankey") {
      var nodeNames = visualUnique(data.reduce(function reduce(result, row) { return result.concat([row.source, row.target]); }, []));
      return Object.assign(option, { series: [{ type: "sankey", left: compact ? 6 : 24, right: compact ? 6 : 24, top: compact ? 8 : 48, bottom: compact ? 8 : 16, nodeAlign: params.nodeAlign || "justify", emphasis: { focus: "adjacency" }, label: { show: !compact, color: dark ? "#dbe4f3" : "#475467", fontSize: 10 }, data: nodeNames.map(function map(name) { return { name: name }; }), links: data.map(function map(row) { return { source: row.source, target: row.target, value: Number(row.value) }; }) }] });
    }
    if (item.renderer === "tree") {
      var horizontalTree = params.orient === "horizontal";
      return Object.assign(option, { series: [{ type: "tree", data: payload.data ? [payload.data] : [], orient: horizontalTree ? "LR" : "TB", top: compact ? 22 : 64, left: compact ? 20 : "12%", right: compact ? 20 : "12%", bottom: compact ? 22 : 32, symbolSize: compact ? 5 : 8, label: { position: horizontalTree ? "left" : "top", align: horizontalTree ? "right" : "center", distance: 5, fontSize: compact ? 8 : 10, color: dark ? "#dbe4f3" : "#475467", formatter: function formatTreeLabel(info) { var description = info.data && info.data.description; return !compact && description ? info.name + "\n" + description : info.name; } }, leaves: { label: { position: horizontalTree ? "right" : "bottom", align: horizontalTree ? "left" : "center", distance: 5 } }, lineStyle: { color: "#9db8df", width: 1.2 }, expandAndCollapse: false, animationDuration: 0 }] });
    }
    if (item.renderer === "mindmap") {
      return Object.assign(option, { series: [{ type: "tree", layout: "radial", data: payload.data ? [payload.data] : [], top: compact ? 14 : 54, left: compact ? 14 : 40, right: compact ? 14 : 40, bottom: compact ? 14 : 28, symbol: "circle", symbolSize: compact ? 5 : 8, label: { rotate: 0, distance: compact ? 4 : 7, fontSize: compact ? 8 : 10, color: dark ? "#dbe4f3" : "#475467" }, leaves: { label: { rotate: 0 } }, lineStyle: { color: "#9db8df", width: 1.2, curveness: 0.25 }, expandAndCollapse: false, animationDuration: 0 }] });
    }
    if (item.renderer === "radar") {
      var indicators = visualUnique(data.map(function map(row) { return row.name; }));
      var radarGroups = visualUnique(data.map(function map(row) { return row.group || "对象"; }));
      var maxValue = Math.max.apply(Math, data.map(function map(row) { return Number(row.value) || 0; }).concat([100]));
      return Object.assign(option, { legend: compact || radarGroups.length < 2 ? undefined : { bottom: 7 }, radar: { center: ["50%", compact ? "50%" : "52%"], radius: compact ? "64%" : "58%", indicator: indicators.map(function map(name) { return { name: name, max: maxValue }; }), axisName: { show: !compact, color: dark ? "#aebbd0" : "#667085", fontSize: 10 }, splitLine: { lineStyle: { color: dark ? "#2d3950" : "#e6ebf2" } } }, series: [{ type: "radar", symbol: compact ? "none" : "circle", lineStyle: { width: Number(params.lineWidth) || 2 }, data: radarGroups.map(function map(group) { return { name: group, value: indicators.map(function map(indicator) { var found = data.find(function find(row) { return row.name === indicator && (row.group || "对象") === group; }); return found ? Number(found.value) : 0; }) }; }) }] });
    }
    if (item.renderer === "funnel") return Object.assign(option, { series: [{ type: "funnel", left: compact ? "12%" : "18%", right: compact ? "12%" : "18%", top: compact ? 8 : 50, bottom: compact ? 8 : 20, gap: 2, label: { show: !compact, color: dark ? "#dbe4f3" : "#475467", fontSize: 10 }, data: data.map(function map(row) { return { name: row.category, value: Number(row.value) }; }) }] });
    if (item.renderer === "boxplot") {
      var categories = visualUnique(data.map(function map(row) { return row.category; }));
      var boxes = categories.map(function map(category) { var values = data.filter(function filter(row) { return row.category === category; }).map(function map(row) { return Number(row.value); }).filter(Number.isFinite).sort(function sort(a, b) { return a - b; }); return values.length ? [values[0], visualQuantile(values, 0.25), visualQuantile(values, 0.5), visualQuantile(values, 0.75), values[values.length - 1]] : [0, 0, 0, 0, 0]; });
      return Object.assign(option, { grid: visualGrid(compact), xAxis: { type: "category", data: categories, name: compact ? "" : params.axisXTitle, axisLabel: axisLabel, axisTick: { show: false } }, yAxis: { type: "value", name: compact ? "" : params.axisYTitle, axisLabel: axisLabel, splitLine: splitLine }, series: [{ type: "boxplot", data: boxes, itemStyle: { color: "#dce9fb", borderColor: "#1769e8" } }] });
    }
    if (item.renderer === "network") {
      var graph = payload.data || {};
      return Object.assign(option, { series: [{ type: "graph", layout: "force", roam: false, label: { show: !compact, position: "right", color: dark ? "#dbe4f3" : "#475467", fontSize: 10 }, edgeLabel: { show: !compact, color: dark ? "#aebbd0" : "#667085", fontSize: 9, formatter: function formatEdge(info) { return info.data && info.data.name || ""; } }, force: { repulsion: compact ? 55 : 110, edgeLength: compact ? 34 : 68 }, data: list(graph.nodes).map(function map(node, index) { return { name: node.name, symbolSize: compact ? 9 : 15 + (index === 0 ? 5 : 0) }; }), links: list(graph.edges).map(function map(edge) { return { source: edge.source, target: edge.target, name: edge.name }; }), lineStyle: { color: "#9db8df", width: 1.4, curveness: 0.08 }, emphasis: { focus: "adjacency" } }] });
    }
    return null;
  }

  function renderVisualPlaceholder(element, item, compact, params) {
    element.innerHTML = '<div class="visual-placeholder' + (compact ? " visual-placeholder--compact" : "") + '"><span class="visual-placeholder__icon">' + dom.icon(item.icon, compact ? 24 : 30) + '</span>' + (compact ? "" : '<strong>' + dom.escape(item.name) + "</strong>") + "</div>";
    dom.hydrateIcons(element);
  }

  function renderVisualChart(element, item, payload, params, compact) {
    if (!element) return;
    params = Object.assign({}, params || {}, payload && typeof payload === "object" ? payload : {});
    if (!compact) {
      var sourceWidth = Math.max(320, Number(params.width) || 600);
      var sourceHeight = Math.max(220, Number(params.height) || 400);
      var previewWidth = Math.min(860, sourceWidth);
      var previewHeight = Math.max(240, Math.min(680, Math.round(previewWidth * sourceHeight / sourceWidth)));
      element.style.width = previewWidth + "px";
      element.style.maxWidth = "100%";
      element.style.height = previewHeight + "px";
      element.style.marginInline = "auto";
    }
    var existing = window.echarts && window.echarts.getInstanceByDom ? window.echarts.getInstanceByDom(element) : null;
    if (existing) existing.dispose();
    var option = item.renderer === "placeholder" ? null : visualChartOption(item, payload, params, compact);
    if (!option) return renderVisualPlaceholder(element, item, compact, params);
    element.innerHTML = "";
    charts.init(element, option);
  }

  /* Earlier versions called this interaction “数据试绘”; the user-facing name is now “数据样例”. */
  function renderVisualCardV2(item, showCategory) {
    return '<article class="visual-card" data-visual-card-v2><div class="visual-card__preview"><div data-visual-preview-v2="' + dom.escape(item.toolCode) + '"></div></div><div class="visual-card__body"><div class="visual-card__title">' + dom.escape(item.name) + '</div><p class="visual-card__description">' + dom.escape(item.description) + '</p><div class="visual-card__meta' + (showCategory ? "" : " visual-card__meta--action-only") + '">' + (showCategory ? '<span>' + dom.escape(item.category) + '</span>' : "") + '<button type="button" class="visual-card__action" data-visual-code-v2="' + dom.escape(item.toolCode) + '">数据样例</button></div></div></article>';
  }

  function renderVisualGroups(items) {
    if (visualView === "cards") return '<div class="visualization-grid">' + items.map(function map(item) { return renderVisualCardV2(item, true); }).join("") + '</div>';
    return VISUAL_CATEGORIES.map(function map(category) {
      var group = items.filter(function filter(item) { return item.category === category; });
      if (!group.length) return "";
      var icon = category === "地图" ? "map" : category === "时间序列" ? "clock-3" : category === "层级与树" ? "git-branch" : "shapes";
      return '<section class="visual-category"><div class="visual-category__header"><span class="visual-category__icon">' + dom.icon(icon, 16) + '</span><h2>' + dom.escape(category) + '</h2></div><div class="visualization-grid">' + group.map(function map(item) { return renderVisualCardV2(item, false); }).join("") + '</div></section>';
    }).join("");
  }

  function renderVisualizationSkillStatus(state) {
    var skill = visualizationSkill(state);
    var isEnabled = Boolean(skill && enabled(skill));
    var runtimeReady = visualizationRuntimeAvailable(state, skill);
    var tone = "muted";
    var label = "报告图表生成 Skill 未配置";
    if (skill && !isEnabled) label = "报告图表生成 Skill 已停用";
    if (skill && isEnabled && runtimeReady) {
      tone = "success";
      label = "报告图表生成 Skill 已启用";
    }
    if (skill && isEnabled && !runtimeReady) {
      tone = "danger";
      label = "报告图表生成 Skill 依赖不可用";
    }
    return '<a class="visual-skill-status visual-skill-status--' + tone + '" href="#/skills" title="前往 Skill 目录管理" aria-label="' + dom.escape(label) + '，前往 Skill 目录管理"><span class="visual-skill-status__dot" aria-hidden="true"></span><span>' + dom.escape(label) + '</span></a>';
  }

  function renderVisualizationCatalog(route, state) {
    var items = visualizationCatalog(state);
    var skillStatus = renderVisualizationSkillStatus(state);
    var viewSwitch = '<div class="segmented visual-view-switch" aria-label="视图方式"><button type="button" class="segmented__item' + (visualView === "category" ? " is-active" : "") + '" data-visual-view-v2="category" aria-label="按分类查看" title="按分类查看" aria-pressed="' + (visualView === "category") + '">' + dom.icon("list-tree", 16) + '</button><button type="button" class="segmented__item' + (visualView === "cards" ? " is-active" : "") + '" data-visual-view-v2="cards" aria-label="按卡片查看" title="按卡片查看" aria-pressed="' + (visualView === "cards") + '">' + dom.icon("layout-grid", 16) + '</button></div>';
    return dom.pageHeader({
      title: "可视化能力",
      actions: '<div class="visual-page-actions">' + skillStatus + viewSwitch + '</div>'
    }) + '<div class="page-content">' + renderVisualGroups(items) + '</div>';
  }

  function drawVisualDrawer(drawer, item, notify) {
    var editor = drawer.querySelector("[data-visual-data]");
    var message = drawer.querySelector("[data-visual-data-message]");
    var payload;
    try {
      payload = JSON.parse(editor.value);
      editor.classList.remove("is-invalid");
      message.textContent = "JSON 格式正确";
      message.className = "visual-data-message is-valid";
    } catch (error) {
      editor.classList.add("is-invalid");
      message.textContent = "JSON 格式错误，请检查逗号、引号和括号。";
      message.className = "visual-data-message is-invalid";
      return false;
    }
    var params = visualDefaults(item);
    renderVisualChart(drawer.querySelector("[data-visual-drawer-chart]"), item, payload, params, false);
    if (notify) overlay.toast("预览已更新", item.name + "已按当前数据样例重新绘制。", "success");
    return true;
  }

  function mountVisualDrawerHeader(drawer, item) {
    var shell = drawer.closest(".drawer");
    var header = shell && shell.querySelector(".drawer__header");
    var heading = header && header.querySelector(".drawer__title");
    if (!header || !heading) return;
    var group = document.createElement("div");
    group.className = "visual-drawer__header-main";
    heading.parentNode.insertBefore(group, heading);
    group.appendChild(heading);
    var meta = document.createElement("div");
    meta.className = "visual-drawer__header-meta";
    var category = document.createElement("span");
    category.textContent = item.category;
    var calls = document.createElement("span");
    calls.textContent = "本月 " + dom.formatNumber(item.callsThisMonth) + " 次调用";
    meta.appendChild(category);
    meta.appendChild(calls);
    group.appendChild(meta);
  }

  function openVisualizationV2(item) {
    if (!item) return;
    overlay.open({ kind: "drawer", title: item.name, footer: false, body: '<div class="visual-drawer" data-visual-drawer><section class="visual-preview-panel"><div class="visual-drawer__chart" data-visual-drawer-chart></div></section><section class="panel"><div class="panel__header"><h3 class="panel__title">数据样例</h3><span class="panel__description">JSON</span><div class="panel__actions"><button type="button" class="btn btn--secondary btn--icon visual-refresh-button" data-visual-render aria-label="刷新预览" title="刷新预览">' + dom.icon("refresh-cw", 15) + '</button></div></div><div class="panel__body"><textarea class="textarea-field visual-data-editor" spellcheck="false" data-visual-data>' + dom.escape(JSON.stringify(item.sample, null, 2)) + '</textarea><div class="visual-data-message is-valid" data-visual-data-message>JSON 格式正确</div></div></section></div>' });
    var drawer = document.querySelector("[data-visual-drawer]");
    if (!drawer) return;
    mountVisualDrawerHeader(drawer, item);
    drawVisualDrawer(drawer, item, false);
    drawer.addEventListener("click", function onClick(event) { if (event.target.closest("[data-visual-render]")) drawVisualDrawer(drawer, item, true); });
  }

  function rerenderVisualizationCatalog() {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function mountVisualizationCatalog(root) {
    var state = OpsDemo.core.store.getState();
    var items = visualizationCatalog(state);
    root.querySelectorAll("[data-visual-preview-v2]").forEach(function each(element) {
      var item = items.find(function find(candidate) { return candidate.toolCode === element.getAttribute("data-visual-preview-v2"); });
      if (item) renderVisualChart(element, item, item.sample, visualDefaults(item), true);
    });
    root.addEventListener("click", function onClick(event) {
      var card = event.target.closest("[data-visual-code-v2]");
      if (card) return openVisualizationV2(visualizationCatalog(OpsDemo.core.store.getState()).find(function find(item) { return item.toolCode === card.getAttribute("data-visual-code-v2"); }));
      var view = event.target.closest("[data-visual-view-v2]");
      if (view) { visualView = view.getAttribute("data-visual-view-v2"); return rerenderVisualizationCatalog(); }
    });
  }

  OpsDemo.pages.skills = {
    render: function render(route, state) { return renderSkillPage(state); },
    mount: mountSkillPage
  };
  OpsDemo.pages.visualizations = { render: renderVisualizationCatalog, mount: mountVisualizationCatalog };
})(window.OpsDemo);

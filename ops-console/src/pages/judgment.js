(function defineJudgmentPages(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function invoke(name, args) {
    var actions = OpsDemo.core.actions || {};
    if (typeof actions[name] === "function") return actions[name].apply(actions, args || []);
    overlay.toast("演示动作未就绪", "动作接口 " + name + " 尚未加载。", "warning");
    return null;
  }

  function byId(items, id) {
    return list(items).find(function find(item) { return item.id === id; });
  }

  function skillNames(state, ids) {
    return list(ids).map(function map(id) {
      var skill = byId(state.skills, id);
      return skill ? skill.name : id;
    });
  }

  function thresholdText(definition) {
    return list(definition.thresholds).map(function map(item) { return item.label + " " + item.condition; }).join("；") || "未设置";
  }

  function definitionActions(item) {
    return '<div class="judgment-row-actions">' +
      '<button type="button" class="table-action" data-definition-edit="' + dom.escape(item.id) + '">编辑</button>' +
      '<button type="button" class="table-action" data-definition-toggle="' + dom.escape(item.id) + '">' + (item.enabled === false ? "启用" : "停用") + '</button>' +
      '<button type="button" class="table-action table-action--danger" data-definition-delete="' + dom.escape(item.id) + '">删除</button></div>';
  }

  function renderDefinitions(route, state) {
    var definitions = list(state.analysisDefinitions);
    return dom.pageHeader({
      title: "分析口径",
      actions: dom.button("新建口径", { variant: "primary", icon: "plus", attrs: "data-definition-create" })
    }) +
      '<div class="page-content"><section class="table-surface"><div class="table-wrap"><table class="data-table"><thead><tr><th>口径名称</th><th>公式</th><th>周期 / 单位</th><th>风险阈值</th><th>使用该口径的 Skill</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      definitions.map(function row(item) {
        var references = skillNames(state, item.referencedBySkillIds);
        return '<tr><td><div class="table-primary">' + dom.escape(item.name) + '</div></td>' +
          '<td><span class="formula">' + dom.escape(item.formula) + '</span></td><td><div>' + dom.escape(item.statisticalPeriod) + '</div><div class="table-secondary">单位：' + dom.escape(item.unit) + '</div></td>' +
          '<td>' + dom.escape(thresholdText(item)) + '</td><td>' + (references.length ? '<div class="dependency-chips">' + references.map(function tag(name) { return '<span class="tag">' + dom.escape(name) + '</span>'; }).join("") + '</div>' : '<span class="table-secondary">未被 Skill 使用</span>') + '</td>' +
          '<td>' + dom.status(item.enabled === false ? "已停用" : "启用", item.enabled === false ? "neutral" : "success") + '</td><td>' + definitionActions(item) + '</td></tr>';
      }).join("") + '</tbody></table></div><div class="table-footer">共 ' + definitions.length + ' 个口径</div></section></div>';
  }

  function definitionEditor(item) {
    var editing = Boolean(item);
    var current = item || {
      name: "",
      definition: "",
      formula: "",
      statisticalPeriod: "",
      unit: "",
      thresholds: [{ label: "高风险", condition: "" }]
    };
    var firstThreshold = list(current.thresholds)[0] || { label: "高风险", condition: "" };
    overlay.open({
      title: editing ? "编辑分析口径" : "新建分析口径",
      wide: true,
      confirmLabel: editing ? "保存" : "创建",
      body: '<div class="form-grid">' +
        '<div class="form-field form-field--full">' + dom.requiredLabel("口径名称", { forId: "definition-name" }) + '<input id="definition-name" class="field" maxlength="40" value="' + dom.escape(current.name) + '" required aria-required="true" data-definition-field="name" placeholder="例如：库存覆盖天数"></div>' +
        '<div class="form-field form-field--full">' + dom.requiredLabel("定义", { forId: "definition-description" }) + '<textarea id="definition-description" class="textarea-field" required aria-required="true" data-definition-field="definition" placeholder="说明该口径表达的业务含义">' + dom.escape(current.definition) + '</textarea></div>' +
        '<div class="form-field form-field--full">' + dom.requiredLabel("公式", { forId: "definition-formula" }) + '<input id="definition-formula" class="field" value="' + dom.escape(current.formula) + '" required aria-required="true" data-definition-field="formula" placeholder="例如：可用库存 ÷ 近 30 日平均日需求"></div>' +
        '<div class="form-field">' + dom.requiredLabel("统计周期", { forId: "definition-period" }) + '<input id="definition-period" class="field" value="' + dom.escape(current.statisticalPeriod) + '" required aria-required="true" data-definition-field="statisticalPeriod" placeholder="例如：滚动 30 日"></div>' +
        '<div class="form-field">' + dom.requiredLabel("单位", { forId: "definition-unit" }) + '<input id="definition-unit" class="field" value="' + dom.escape(current.unit) + '" required aria-required="true" data-definition-field="unit" placeholder="例如：天"></div>' +
        '<div class="form-field">' + dom.requiredLabel("风险等级", { forId: "definition-threshold-label" }) + '<input id="definition-threshold-label" class="field" value="' + dom.escape(firstThreshold.label) + '" required aria-required="true" data-definition-field="thresholdLabel" placeholder="例如：高风险"></div>' +
        '<div class="form-field">' + dom.requiredLabel("触发条件", { forId: "definition-threshold-condition" }) + '<input id="definition-threshold-condition" class="field" value="' + dom.escape(firstThreshold.condition) + '" required aria-required="true" data-definition-field="thresholdCondition" placeholder="例如：≤ 7"></div></div>',
      onConfirm: function onConfirm(root) {
        var payload = {};
        root.querySelectorAll("[data-definition-field]").forEach(function each(field) {
          payload[field.getAttribute("data-definition-field")] = field.value.trim();
        });
        if (!payload.name || !payload.definition || !payload.formula || !payload.statisticalPeriod || !payload.unit || !payload.thresholdLabel || !payload.thresholdCondition) {
          overlay.toast("请完善必填信息", "口径名称、定义、公式、周期、单位和风险阈值均需填写。", "warning");
          return false;
        }
        var result = editing ? invoke("updateDefinition", [item.id, payload]) : invoke("createDefinition", [payload]);
        if (!result) {
          overlay.toast("无法保存", "口径名称需保持唯一。", "warning");
          return false;
        }
        overlay.toast(editing ? "口径已更新" : "口径已创建", result.name + " 已保存。", "success");
      }
    });
  }

  function toggleDefinition(item) {
    var nextEnabled = item.enabled === false;
    var result = invoke("setDefinitionEnabled", [item.id, nextEnabled]);
    if (result) overlay.toast(nextEnabled ? "口径已启用" : "口径已停用", item.name, "success");
  }

  function deleteDefinition(item, state) {
    var references = skillNames(state, item.referencedBySkillIds);
    overlay.confirm({
      title: "删除分析口径",
      confirmLabel: "删除",
      confirmVariant: "danger",
      body: '<p class="confirm-copy">删除“' + dom.escape(item.name) + '”后无法恢复' + (references.length ? '，同时会从 ' + references.length + ' 个 Skill 中移除该口径' : '') + '。</p>',
      onConfirm: function onConfirm() {
        var result = invoke("deleteDefinition", [item.id]);
        if (!result) return false;
        overlay.toast("口径已删除", item.name + " 已移除。", "success");
      }
    });
  }

  function mountDefinitions(root) {
    root.addEventListener("click", function onClick(event) {
      var state = OpsDemo.core.store.getState();
      if (event.target.closest("[data-definition-create]")) return definitionEditor(null);
      var edit = event.target.closest("[data-definition-edit]");
      if (edit) return definitionEditor(byId(state.analysisDefinitions, edit.getAttribute("data-definition-edit")));
      var toggle = event.target.closest("[data-definition-toggle]");
      if (toggle) return toggleDefinition(byId(state.analysisDefinitions, toggle.getAttribute("data-definition-toggle")));
      var remove = event.target.closest("[data-definition-delete]");
      if (remove) return deleteDefinition(byId(state.analysisDefinitions, remove.getAttribute("data-definition-delete")), state);
    });
  }

  OpsDemo.pages.definitions = { render: renderDefinitions, mount: mountDefinitions };
})(window.OpsDemo);

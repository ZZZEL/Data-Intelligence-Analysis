(function defineApiAccessPage(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var overlay = OpsDemo.ui.overlay;

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value, fallback) {
    return value == null || value === "" ? (fallback || "—") : String(value);
  }

  function invoke(name, args) {
    var actions = OpsDemo.core.actions || {};
    if (typeof actions[name] === "function") return actions[name].apply(actions, args || []);
    overlay.toast("演示动作未就绪", "动作接口 " + name + " 尚未加载。", "warning");
    return null;
  }

  function findKey(state, id) {
    return list(state.apiAccess && state.apiAccess.clients).find(function find(item) { return item.id === id; });
  }

  function keyName(item) {
    return text(item && (item.name || item.applicationName), "未命名密钥");
  }

  function maskedKey(item) {
    return text(item && (item.keyMasked || item.secretMasked));
  }

  function displayTime(value, emptyLabel) {
    if (!value) return emptyLabel || "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date).replace(/\//g, "-");
  }

  function keyEnabled(item) {
    return Boolean(item) && item.enabled !== false && item.status !== "disabled";
  }

  function statusTone(item) {
    return keyEnabled(item) ? "success" : "neutral";
  }

  function statusLabel(item) {
    return keyEnabled(item) ? "已启用" : "已禁用";
  }

  function accessLevels(state) {
    var configured = list(state.meta && state.meta.accessLevels);
    return configured.length ? configured : [
      { code: "L1", name: "基础内部", rank: 1 },
      { code: "L2", name: "敏感业务", rank: 2 },
      { code: "L3", name: "受限业务", rank: 3 }
    ];
  }

  function permissionCode(item) {
    var code = String(item && (item.permissionLevel || item.accessLevel) || "L1").toUpperCase();
    return ["L1", "L2", "L3"].indexOf(code) >= 0 ? code : "L1";
  }

  function permissionMeta(state, item) {
    var code = permissionCode(item);
    return accessLevels(state).find(function find(level) { return level.code === code; }) || { code: code, name: "基础内部", rank: 1 };
  }

  function permissionDescription(level) {
    if (level.code === "L3") return "可访问 L1–L3 数据";
    if (level.code === "L2") return "可访问 L1–L2 数据";
    return "可访问 L1 数据";
  }

  function permissionOptions(state) {
    return accessLevels(state).map(function map(level) {
      return '<label class="api-key-permission-option"><input type="radio" name="api-key-permission" value="' + dom.escape(level.code) + '" data-api-field="permissionLevel" required aria-required="true">' +
        '<span class="api-key-permission-option__copy"><span><strong>' + dom.escape(level.code) + '</strong>' + dom.escape(level.name) + '</span><small>' + dom.escape(permissionDescription(level)) + '</small></span></label>';
    }).join("");
  }

  function keyActions(item) {
    var id = dom.escape(item.id);
    return '<div class="api-key-row-actions"><button type="button" class="table-action" data-api-detail="' + id + '">查看</button>' +
      '<button type="button" class="table-action" data-api-toggle="' + id + '">' + (keyEnabled(item) ? "禁用" : "启用") + "</button>" +
      '<button type="button" class="table-action table-action--danger" data-api-delete="' + id + '">删除</button></div>';
  }

  function renderApiAccess(route, state) {
    var keys = list(state.apiAccess && state.apiAccess.clients);
    var rows = keys.map(function row(item) {
      var permission = permissionMeta(state, item);
      return '<tr><td><div class="table-primary">' + dom.escape(keyName(item)) + '</div></td>' +
        '<td><span class="api-key-masked">' + dom.escape(maskedKey(item)) + '</span></td>' +
        '<td>' + dom.status(statusLabel(item), statusTone(item)) + '</td>' +
        '<td><span class="api-key-permission" title="' + dom.escape(permission.name + " · " + permissionDescription(permission)) + '">' + dom.escape(permission.code) + '</span></td>' +
        '<td>' + dom.escape(displayTime(item.lastUsedAt || item.lastCalledAt, "尚未使用")) + '</td>' +
        '<td>' + dom.escape(displayTime(item.createdAt)) + '</td>' +
        '<td>' + keyActions(item) + '</td></tr>';
    }).join("");

    return dom.pageHeader({
      title: "API密钥",
      actions: dom.button("创建API Key", { variant: "primary", icon: "plus", attrs: "data-api-create" })
    }) +
      '<div class="page-content"><section class="table-surface" aria-label="API 密钥列表">' +
      (keys.length ? '<div class="table-wrap"><table class="data-table api-key-table"><thead><tr><th>名称</th><th>API Key</th><th>状态</th><th>权限</th><th>最近使用时间</th><th>创建时间</th><th>操作</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : dom.empty("暂无 API 密钥", "创建后即可用于调用。", "key-round")) +
      '</section></div>';
  }

  function showSecret(result) {
    var key = result && (result.key || result.secret);
    if (!key) return;
    var copied = false;
    overlay.open({
      title: "查看密钥",
      dismissible: false,
      cancelLabel: false,
      confirmLabel: "完成",
      confirmVariant: "primary",
      body: '<div class="stack"><div class="api-key-once-notice"><p>请立即复制并安全保存该密钥，完成后将无法再次查看完整内容。</p></div>' +
        '<div class="form-field"><label class="form-label" for="api-key-secret-value">API Key</label><div class="api-key-secret-row"><input id="api-key-secret-value" class="field api-key-secret-value" readonly value="' + dom.escape(key) + '" data-api-secret-value>' + dom.button("复制", { variant: "secondary", icon: "copy", attrs: "data-api-secret-copy" }) + '</div></div></div>',
      onConfirm: function onConfirm() {
        if (copied) return true;
        overlay.toast("请先复制密钥", "安全保存后才能完成。", "warning");
        return false;
      }
    });
    var scope = document.getElementById("overlay-root");
    var input = scope && scope.querySelector("[data-api-secret-value]");
    var copyButton = scope && scope.querySelector("[data-api-secret-copy]");
    var confirmButton = scope && scope.querySelector("[data-overlay-confirm]");
    if (confirmButton) {
      confirmButton.disabled = true;
      confirmButton.setAttribute("aria-disabled", "true");
    }
    if (copyButton && input) copyButton.addEventListener("click", function handle() {
      copyVisibleSecret(input, function copiedSecret() {
        copied = true;
        copyButton.innerHTML = dom.icon("check", 15) + "已复制";
        dom.hydrateIcons(copyButton);
        if (confirmButton) {
          confirmButton.disabled = false;
          confirmButton.removeAttribute("aria-disabled");
          confirmButton.focus();
        }
      });
    });
  }

  function createKey(state) {
    overlay.open({
      title: "创建API Key",
      confirmLabel: "创建",
      body: '<div class="api-key-create-form"><div class="form-field">' + dom.requiredLabel("名称", { forId: "api-key-name" }) + '<input id="api-key-name" class="field" maxlength="48" required aria-required="true" placeholder="例如：供应商风险工作台" data-api-field="name"></div>' +
        '<fieldset class="api-key-permission-group" aria-required="true">' + dom.requiredLabel("权限", { tag: "legend" }) + '<div class="api-key-permission-grid">' + permissionOptions(state) + '</div></fieldset></div>',
      onConfirm: function onConfirm(root) {
        var name = root.querySelector('[data-api-field="name"]').value.trim();
        var permission = root.querySelector('[data-api-field="permissionLevel"]:checked');
        if (!name) {
          overlay.toast("请输入名称", "名称为必填项。", "warning");
          return false;
        }
        if (!permission) {
          overlay.toast("请选择权限", "API Key 必须绑定一个数据权限等级。", "warning");
          return false;
        }
        var result = invoke("createApiKey", [{ name: name, permissionLevel: permission.value }]);
        if (!result) return false;
        window.setTimeout(function reveal() { showSecret(result); }, 80);
        return true;
      }
    });
  }

  function showDetail(item, state) {
    if (!item) return;
    var permission = permissionMeta(state, item);
    overlay.open({
      title: "查看密钥",
      cancelLabel: false,
      confirmLabel: "完成",
      body: '<div class="api-key-view-form"><div class="form-field"><label class="form-label" for="api-key-view-name">名称</label><input id="api-key-view-name" class="field" readonly value="' + dom.escape(keyName(item)) + '"></div>' +
        '<div class="form-field"><label class="form-label" for="api-key-view-value">API Key</label><input id="api-key-view-value" class="field api-key-secret-value" readonly value="' + dom.escape(maskedKey(item)) + '"></div>' +
        '<div class="form-field"><label class="form-label" for="api-key-view-permission">权限</label><input id="api-key-view-permission" class="field" readonly value="' + dom.escape(permission.code + " · " + permission.name) + '"></div></div>'
    });
  }

  function toggleKey(item) {
    if (!item) return;
    var nextEnabled = !keyEnabled(item);
    overlay.confirm({
      title: (nextEnabled ? "启用" : "禁用") + " API Key",
      confirmLabel: "确认" + (nextEnabled ? "启用" : "禁用"),
      confirmVariant: nextEnabled ? "primary" : "danger",
      body: '<p class="api-key-confirm-copy">' + (nextEnabled ? "启用后，该密钥可恢复调用。" : "禁用后，使用该密钥的新调用将被拒绝，之后可重新启用。") + '</p>',
      onConfirm: function onConfirm() {
        var result = invoke("setApiKeyEnabled", [item.id, nextEnabled]);
        if (!result) return false;
        overlay.toast("密钥状态已更新", keyName(item) + " 已" + (nextEnabled ? "启用。" : "禁用。"), nextEnabled ? "success" : "warning");
        return true;
      }
    });
  }

  function deleteKey(item) {
    if (!item) return;
    overlay.confirm({
      title: "删除密钥",
      confirmLabel: "删除",
      confirmVariant: "danger",
      body: '<p class="api-key-confirm-copy">删除后，“' + dom.escape(keyName(item)) + '”的 API Key 将立即失效且无法恢复。</p>',
      onConfirm: function onConfirm() {
        var result = invoke("deleteApiKey", [item.id]);
        if (!result) return false;
        overlay.toast("密钥已删除", keyName(item) + " 已从列表中删除。", "success");
        return true;
      }
    });
  }

  function copyVisibleSecret(input, onCopied) {
    if (!input) return;
    var copied = function copied() {
      if (typeof onCopied === "function") onCopied();
      overlay.toast("密钥已复制", "请安全保存并按需配置到业务系统。", "success");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(copied).catch(function fallback() {
        input.select();
        document.execCommand("copy");
        copied();
      });
      return;
    }
    input.select();
    document.execCommand("copy");
    copied();
  }

  function mountApiAccess(root) {
    root.addEventListener("click", function onClick(event) {
      var state = OpsDemo.core.store.getState();
      if (event.target.closest("[data-api-create]")) return createKey(state);
      var detail = event.target.closest("[data-api-detail]");
      if (detail) return showDetail(findKey(state, detail.getAttribute("data-api-detail")), state);
      var toggle = event.target.closest("[data-api-toggle]");
      if (toggle) return toggleKey(findKey(state, toggle.getAttribute("data-api-toggle")));
      var remove = event.target.closest("[data-api-delete]");
      if (remove) return deleteKey(findKey(state, remove.getAttribute("data-api-delete")));
    });
  }

  OpsDemo.pages.apiAccess = { render: renderApiAccess, mount: mountApiAccess };
})(window.OpsDemo);

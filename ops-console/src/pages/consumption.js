(function defineConsumptionPage(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var charts = OpsDemo.ui.charts;
  var router = OpsDemo.core.router;
  var rangeState = {
    key: "month",
    customStart: "",
    customEnd: ""
  };

  var METRIC_TABS = [
    { key: "tokens", label: "Token 消耗" },
    { key: "requests", label: "API 请求次数" }
  ];

  var RANGE_OPTIONS = [
    { key: "today", label: "今天" },
    { key: "yesterday", label: "昨天" },
    { key: "last7", label: "近7日" },
    { key: "last30", label: "近30日" },
    { key: "week", label: "本周" },
    { key: "month", label: "本月" },
    { key: "custom", label: "自定义" }
  ];

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value, fallback) {
    return value == null || value === "" ? (fallback || "—") : String(value);
  }

  function parseDate(value) {
    var parts = String(value || "").split("-").map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }

  function dateKey(value) {
    var date = value instanceof Date ? value : parseDate(value);
    return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "";
  }

  function shiftDate(value, amount) {
    var date = value instanceof Date ? new Date(value.getTime()) : parseDate(value);
    if (!date) return null;
    date.setUTCDate(date.getUTCDate() + amount);
    return date;
  }

  function shortDate(value) {
    return text(value).slice(5).replace("-", "/");
  }

  function latestAvailableDate(daily) {
    var values = daily.map(function map(item) { return item.date; }).filter(Boolean).sort();
    return values.length ? values[values.length - 1] : "";
  }

  function earliestAvailableDate(daily) {
    var values = daily.map(function map(item) { return item.date; }).filter(Boolean).sort();
    return values.length ? values[0] : "";
  }

  function optionLabel(key) {
    var option = RANGE_OPTIONS.find(function find(item) { return item.key === key; });
    return option ? option.label : "本月";
  }

  function resolveRange(daily) {
    var latestKey = latestAvailableDate(daily);
    var earliestKey = earliestAvailableDate(daily);
    var latest = parseDate(latestKey);
    var start = latest;
    var end = latest;
    var label = optionLabel(rangeState.key);

    if (!latest) return { start: "", end: "", label: label };

    if (!rangeState.customStart) rangeState.customStart = dateKey(new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), 1)));
    if (!rangeState.customEnd) rangeState.customEnd = latestKey;

    if (rangeState.key === "yesterday") {
      start = shiftDate(latest, -1);
      end = start;
    } else if (rangeState.key === "last7") {
      start = shiftDate(latest, -6);
    } else if (rangeState.key === "last30") {
      start = shiftDate(latest, -29);
    } else if (rangeState.key === "week") {
      start = shiftDate(latest, -((latest.getUTCDay() + 6) % 7));
    } else if (rangeState.key === "month") {
      start = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), 1));
    } else if (rangeState.key === "custom") {
      start = parseDate(rangeState.customStart) || parseDate(earliestKey) || latest;
      end = parseDate(rangeState.customEnd) || latest;
      label = dateKey(start) + " 至 " + dateKey(end);
    }

    return { start: dateKey(start), end: dateKey(end), label: label };
  }

  function rowsInRange(daily, range) {
    return daily.filter(function filter(item) {
      return item.date >= range.start && item.date <= range.end;
    });
  }

  function round(value, decimals) {
    var factor = Math.pow(10, decimals || 0);
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function aggregate(daily) {
    var result = daily.reduce(function reduce(total, item) {
      total.apiRequests += Number(item.apiRequests) || 0;
      total.inputTokensM += Number(item.inputTokensM) || 0;
      total.outputTokensM += Number(item.outputTokensM) || 0;
      total.peakApiRequests = Math.max(total.peakApiRequests, Number(item.apiRequests) || 0);
      return total;
    }, { apiRequests: 0, inputTokensM: 0, outputTokensM: 0, peakApiRequests: 0 });

    result.inputTokensM = round(result.inputTokensM, 1);
    result.outputTokensM = round(result.outputTokensM, 1);
    result.totalTokensM = round(result.inputTokensM + result.outputTokensM, 1);
    result.averageApiRequests = daily.length ? round(result.apiRequests / daily.length, 0) : 0;
    return result;
  }

  function activeMetric(route) {
    return route && route.query && route.query.metric === "requests" ? "requests" : "tokens";
  }

  function availableModels(consumption) {
    return list(consumption && consumption.models).filter(function filter(model) {
      return Boolean(model) && (model.kind === "llm" || model.type === "llm" || model.typeLabel === "生成模型");
    });
  }

  function selectedModel(consumption, route) {
    var selectedId = route && route.query ? route.query.model : "";
    return availableModels(consumption).find(function find(model) { return model.id === selectedId; }) || null;
  }

  function dailyForModel(daily, model) {
    if (!model) return daily;
    var ratio = model.usageRatio || {};
    return daily.map(function map(item) {
      var inputTokensM = round((Number(item.inputTokensM) || 0) * (Number(ratio.inputTokensM) || 0), 1);
      var outputTokensM = round((Number(item.outputTokensM) || 0) * (Number(ratio.outputTokensM) || 0), 1);
      return {
        date: item.date,
        apiRequests: round((Number(item.apiRequests) || 0) * (Number(ratio.apiRequests) || 0), 0),
        inputTokensM: inputTokensM,
        outputTokensM: outputTokensM,
        totalTokensM: round(inputTokensM + outputTokensM, 1)
      };
    });
  }

  function tokenValue(value) {
    return round(value, 1).toLocaleString("zh-CN", { maximumFractionDigits: 1 }) + "M";
  }

  function summaryCell(label, value) {
    return '<div class="summary-cell"><div class="summary-cell__label">' + dom.escape(label) + '</div><div class="summary-cell__value">' + dom.escape(value) + "</div></div>";
  }

  function routeWithFilters(route, updates) {
    var query = Object.assign({}, route && route.query || {}, updates || {});
    if (query.metric === "tokens") delete query.metric;
    if (!query.model || query.model === "all") delete query.model;
    var queryText = Object.keys(query).sort().map(function map(key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(query[key]);
    }).join("&");
    return "consumption" + (queryText ? "?" + queryText : "");
  }

  function renderMetricTabs(metric) {
    return '<div class="tabs consumption-tabs" role="tablist" aria-label="消耗统计类型">' + METRIC_TABS.map(function map(item) {
      var active = item.key === metric;
      return '<button type="button" id="consumption-tab-' + item.key + '" class="tab' + (active ? " is-active" : "") + '" role="tab" aria-selected="' + (active ? "true" : "false") + '" aria-controls="consumption-' + item.key + '-panel" data-consumption-tab="' + item.key + '">' + item.label + "</button>";
    }).join("") + "</div>";
  }

  function renderModelControl(consumption, route) {
    var current = selectedModel(consumption, route);
    var options = ['<option value="all"' + (!current ? " selected" : "") + '>全部模型</option>'].concat(availableModels(consumption).map(function map(model) {
      return '<option value="' + dom.escape(model.id) + '"' + (current && current.id === model.id ? " selected" : "") + ">" + dom.escape(model.name) + "</option>";
    })).join("");

    return '<label class="consumption-model-control"><span class="consumption-model-label">模型</span>' +
      '<select class="select-field consumption-model-select" aria-label="筛选模型" data-consumption-model>' + options + "</select></label>";
  }

  function renderTokenPanel(summary, range) {
    return '<div class="consumption-view-content" id="consumption-tokens-panel" role="tabpanel" aria-labelledby="consumption-tab-tokens">' +
      '<div class="summary-strip consumption-summary consumption-summary--tokens">' +
        summaryCell("Token 总量", tokenValue(summary.totalTokensM)) +
        summaryCell("输入 Token", tokenValue(summary.inputTokensM)) +
        summaryCell("输出 Token", tokenValue(summary.outputTokensM)) +
      "</div>" +
      '<section class="panel consumption-chart-panel"><div class="panel__header"><h2 class="panel__title">Token 消耗</h2></div><div class="panel__body"><div class="chart-box consumption-chart" role="img" aria-label="' + dom.escape(range.label + " 输入与输出 Token 消耗柱状图") + '" data-consumption-token></div></div></section>' +
    "</div>";
  }

  function renderRequestPanel(summary, range) {
    return '<div class="consumption-view-content" id="consumption-requests-panel" role="tabpanel" aria-labelledby="consumption-tab-requests">' +
      '<div class="summary-strip consumption-summary consumption-summary--requests">' +
        summaryCell("API 请求次数", dom.formatNumber(summary.apiRequests)) +
        summaryCell("日均请求次数", dom.formatNumber(summary.averageApiRequests)) +
        summaryCell("单日峰值", dom.formatNumber(summary.peakApiRequests)) +
      "</div>" +
      '<section class="panel consumption-chart-panel"><div class="panel__header"><h2 class="panel__title">API 请求次数</h2></div><div class="panel__body"><div class="chart-box consumption-chart" role="img" aria-label="' + dom.escape(range.label + " API 请求次数折线图") + '" data-consumption-request></div></div></section>' +
    "</div>";
  }

  function renderRangeControl(daily) {
    var earliest = earliestAvailableDate(daily);
    var latest = latestAvailableDate(daily);
    var range = resolveRange(daily);
    var options = RANGE_OPTIONS.map(function map(item) {
      return '<option value="' + item.key + '"' + (rangeState.key === item.key ? " selected" : "") + ">" + item.label + "</option>";
    }).join("");
    var custom = rangeState.key === "custom" ?
      '<div class="consumption-custom-range" role="group" aria-label="自定义日期范围" data-consumption-custom-range>' +
        '<input type="date" class="consumption-date-field" value="' + dom.escape(range.start) + '" min="' + dom.escape(earliest) + '" max="' + dom.escape(range.end || latest) + '" aria-label="开始日期" data-consumption-start>' +
        '<span class="consumption-range-separator" aria-hidden="true">—</span>' +
        '<input type="date" class="consumption-date-field" value="' + dom.escape(range.end) + '" min="' + dom.escape(range.start || earliest) + '" max="' + dom.escape(latest) + '" aria-label="结束日期" data-consumption-end>' +
      "</div>" : "";

    return '<div class="consumption-range-control">' + dom.icon("calendar-range", 16) +
      '<select class="select-field consumption-range-select" aria-label="统计时间范围" data-consumption-range>' + options + "</select>" + custom + "</div>";
  }

  function renderConsumption(route, state) {
    var consumption = state.consumption || {};
    var daily = list(consumption.daily);
    var range = resolveRange(daily);
    var metric = activeMetric(route);
    var filteredDaily = dailyForModel(daily, selectedModel(consumption, route));
    var selectedDaily = rowsInRange(filteredDaily, range);
    var summary = aggregate(selectedDaily);

    return dom.pageHeader({
      title: "消耗统计",
      toolbar: { end: renderRangeControl(daily) }
    }) +
      '<div class="page-content page-content--flush-top consumption-page">' +
      '<div class="consumption-view-header">' + renderMetricTabs(metric) + renderModelControl(consumption, route) + "</div>" +
      (metric === "requests" ? renderRequestPanel(summary, range) : renderTokenPanel(summary, range)) +
      "</div>";
  }

  function rerender(root, route, state) {
    charts.clear();
    dom.setContent(root, renderConsumption(route, state));
    mountConsumption(root, route, state);
  }

  function mountConsumption(root, route, state) {
    var consumption = state.consumption || {};
    var daily = list(consumption.daily);
    var range = resolveRange(daily);
    var filteredDaily = dailyForModel(daily, selectedModel(consumption, route));
    var selectedDaily = rowsInRange(filteredDaily, range);
    var rangeSelect = root.querySelector("[data-consumption-range]");
    var modelSelect = root.querySelector("[data-consumption-model]");
    var tokenChart = root.querySelector("[data-consumption-token]");
    var requestChart = root.querySelector("[data-consumption-request]");
    var labels = selectedDaily.map(function map(item) { return shortDate(item.date); });
    var labelInterval = labels.length <= 7 ? 0 : Math.max(1, Math.ceil(labels.length / 8) - 1);

    if (tokenChart) charts.bar(tokenChart, labels, selectedDaily.map(function map(item) { return item.inputTokensM; }), {
      color: ["#1769e8", "#9abcf0"],
      grid: { left: 54, right: 18, top: 42, bottom: 34, containLabel: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        borderWidth: 1,
        borderColor: "#e4e7ec",
        backgroundColor: "#fff",
        textStyle: { color: "#344054", fontSize: 11 },
        valueFormatter: function formatToken(value) { return round(value, 1) + "M"; }
      },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: "#667085", fontSize: 10 }
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: "#dfe4eb" } },
        axisTick: { show: false },
        axisLabel: { color: "#7a8493", fontSize: 10, interval: labelInterval }
      },
      yAxis: {
        type: "value",
        name: "百万 Token",
        nameTextStyle: { color: "#98a2b3", fontSize: 10, padding: [0, 0, 4, -5] },
        splitNumber: 4,
        axisLabel: { color: "#7a8493", fontSize: 10 },
        splitLine: { lineStyle: { color: "#eef1f5" } }
      },
      series: [{
        name: "输入 Token",
        type: "bar",
        stack: "token",
        barMaxWidth: 28,
        data: selectedDaily.map(function map(item) { return item.inputTokensM; }),
        itemStyle: { color: "#1769e8" }
      }, {
        name: "输出 Token",
        type: "bar",
        stack: "token",
        barMaxWidth: 28,
        data: selectedDaily.map(function map(item) { return item.outputTokensM; }),
        itemStyle: { color: "#9abcf0", borderRadius: [3, 3, 0, 0] }
      }]
    });

    if (requestChart) charts.line(requestChart, labels, selectedDaily.map(function map(item) { return item.apiRequests; }), {
      grid: { left: 54, right: 18, top: 28, bottom: 34, containLabel: false },
      tooltip: {
        trigger: "axis",
        borderWidth: 1,
        borderColor: "#e4e7ec",
        backgroundColor: "#fff",
        textStyle: { color: "#344054", fontSize: 11 },
        valueFormatter: function formatRequests(value) { return dom.formatNumber(value) + " 次"; }
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: "#dfe4eb" } },
        axisTick: { show: false },
        axisLabel: { color: "#7a8493", fontSize: 10, interval: labelInterval }
      },
      yAxis: {
        type: "value",
        name: "次",
        nameTextStyle: { color: "#98a2b3", fontSize: 10, padding: [0, 0, 4, -5] },
        splitNumber: 4,
        axisLabel: { color: "#7a8493", fontSize: 10 },
        splitLine: { lineStyle: { color: "#eef1f5" } }
      },
      series: [{
        name: "API 请求次数",
        type: "line",
        data: selectedDaily.map(function map(item) { return item.apiRequests; }),
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { width: 2, color: "#1769e8" },
        itemStyle: { color: "#1769e8", borderColor: "#fff", borderWidth: 1 }
      }]
    });

    Array.from(root.querySelectorAll("[data-consumption-tab]")).forEach(function each(tab) {
      tab.addEventListener("click", function selectMetric() {
        if (tab.getAttribute("aria-selected") === "true") return;
        router.navigate(routeWithFilters(route, { metric: tab.getAttribute("data-consumption-tab") }));
      });
    });

    if (modelSelect) {
      modelSelect.addEventListener("change", function changeModel(event) {
        router.navigate(routeWithFilters(route, { model: event.target.value }));
      });
    }

    if (rangeSelect) {
      rangeSelect.addEventListener("change", function changeRange(event) {
        rangeState.key = event.target.value;
        rerender(root, route, state);
      });
    }

    var startInput = root.querySelector("[data-consumption-start]");
    var endInput = root.querySelector("[data-consumption-end]");
    var customRange = root.querySelector("[data-consumption-custom-range]");
    function applyCustomRange() {
      var start = startInput ? startInput.value : "";
      var end = endInput ? endInput.value : "";
      if (!start || !end) return;
      var valid = start <= end && startInput.checkValidity() && endInput.checkValidity();
      if (!valid) {
        if (customRange) {
          customRange.classList.add("is-invalid");
          customRange.setAttribute("aria-invalid", "true");
        }
        return;
      }
      rangeState.customStart = start;
      rangeState.customEnd = end;
      rerender(root, route, state);
    }
    if (startInput) startInput.addEventListener("change", applyCustomRange);
    if (endInput) endInput.addEventListener("change", applyCustomRange);
  }

  OpsDemo.pages.consumption = { render: renderConsumption, mount: mountConsumption };
})(window.OpsDemo);

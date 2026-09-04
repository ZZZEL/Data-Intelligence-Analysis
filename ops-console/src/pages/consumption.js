(function defineConsumptionPage(OpsDemo) {
  "use strict";

  var dom = OpsDemo.ui.dom;
  var charts = OpsDemo.ui.charts;
  var rangeState = {
    key: "month",
    customStart: "",
    customEnd: ""
  };

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
      return total;
    }, { apiRequests: 0, inputTokensM: 0, outputTokensM: 0 });

    result.inputTokensM = round(result.inputTokensM, 1);
    result.outputTokensM = round(result.outputTokensM, 1);
    return result;
  }

  function tokenValue(value) {
    return round(value, 1).toLocaleString("zh-CN", { maximumFractionDigits: 1 }) + "M";
  }

  function summaryCell(label, value) {
    return '<div class="summary-cell"><div class="summary-cell__label">' + dom.escape(label) + '</div><div class="summary-cell__value">' + dom.escape(value) + "</div></div>";
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
    var selectedDaily = rowsInRange(daily, range);
    var summary = aggregate(selectedDaily);

    return dom.pageHeader({
      title: "消耗统计",
      toolbar: { end: renderRangeControl(daily) }
    }) +
      '<div class="page-content consumption-page">' +
      '<div class="summary-strip consumption-summary">' +
        summaryCell("API 请求次数", dom.formatNumber(summary.apiRequests)) +
        summaryCell("输入 Token", tokenValue(summary.inputTokensM)) +
        summaryCell("输出 Token", tokenValue(summary.outputTokensM)) +
      "</div>" +
      '<div class="consumption-chart-grid">' +
        '<section class="panel consumption-chart-panel"><div class="panel__header"><h2 class="panel__title">Token 消耗</h2></div><div class="panel__body"><div class="chart-box consumption-chart" role="img" aria-label="' + dom.escape(range.label + " 输入与输出 Token 消耗柱状图") + '" data-consumption-token></div></div></section>' +
        '<section class="panel consumption-chart-panel"><div class="panel__header"><h2 class="panel__title">API 请求次数</h2></div><div class="panel__body"><div class="chart-box consumption-chart" role="img" aria-label="' + dom.escape(range.label + " API 请求次数折线图") + '" data-consumption-request></div></div></section>' +
      "</div>" +
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
    var selectedDaily = rowsInRange(daily, range);
    var rangeSelect = root.querySelector("[data-consumption-range]");
    var labels = selectedDaily.map(function map(item) { return shortDate(item.date); });
    var labelInterval = labels.length <= 7 ? 0 : Math.max(1, Math.ceil(labels.length / 8) - 1);

    charts.bar(root.querySelector("[data-consumption-token]"), labels, selectedDaily.map(function map(item) { return item.inputTokensM; }), {
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

    charts.line(root.querySelector("[data-consumption-request]"), labels, selectedDaily.map(function map(item) { return item.apiRequests; }), {
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

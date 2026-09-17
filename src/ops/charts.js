(function defineCharts(OpsDemo) {
  "use strict";

  var instances = [];

  function clear() {
    instances.forEach(function each(instance) {
      if (instance && !instance.isDisposed()) instance.dispose();
    });
    instances = [];
  }

  function init(element, option) {
    if (!window.echarts || !element) return null;
    var chart = window.echarts.init(element, null, { renderer: "svg" });
    chart.setOption(option, true);
    instances.push(chart);
    return chart;
  }

  function baseGrid() {
    return { left: 48, right: 18, top: 20, bottom: 34, containLabel: false };
  }

  function line(element, labels, values, extra) {
    return init(element, {
      animationDuration: 350,
      color: ["#1769e8"],
      grid: baseGrid(),
      tooltip: { trigger: "axis", borderWidth: 1, borderColor: "#e4e7ec", backgroundColor: "#fff", textStyle: { color: "#344054", fontSize: 11 } },
      xAxis: { type: "category", boundaryGap: false, data: labels, axisLine: { lineStyle: { color: "#dfe4eb" } }, axisTick: { show: false }, axisLabel: { color: "#7a8493", fontSize: 10 } },
      yAxis: { type: "value", splitNumber: 4, axisLabel: { color: "#7a8493", fontSize: 10 }, splitLine: { lineStyle: { color: "#eef1f5" } } },
      series: [{ type: "line", data: values, smooth: false, symbol: "circle", symbolSize: 5, lineStyle: { width: 2 }, itemStyle: { borderColor: "#fff", borderWidth: 1 } }],
      ...(extra || {})
    });
  }

  function bar(element, labels, values, extra) {
    return init(element, {
      animationDuration: 350,
      color: ["#1769e8"],
      grid: baseGrid(),
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, borderWidth: 1, borderColor: "#e4e7ec", backgroundColor: "#fff", textStyle: { color: "#344054", fontSize: 11 } },
      xAxis: { type: "category", data: labels, axisLine: { lineStyle: { color: "#dfe4eb" } }, axisTick: { show: false }, axisLabel: { color: "#7a8493", fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { color: "#7a8493", fontSize: 10 }, splitLine: { lineStyle: { color: "#eef1f5" } } },
      series: [{ type: "bar", data: values, barMaxWidth: 24, itemStyle: { borderRadius: [3, 3, 0, 0] } }],
      ...(extra || {})
    });
  }

  function donut(element, labels, values) {
    return init(element, {
      animationDuration: 350,
      color: ["#1769e8", "#159a74", "#ed8b16", "#98a2b3"],
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: "#667085", fontSize: 10 } },
      series: [{ type: "pie", radius: ["48%", "70%"], center: ["50%", "43%"], avoidLabelOverlap: true, label: { show: false }, data: labels.map(function map(label, index) { return { name: label, value: values[index] }; }) }]
    });
  }

  function mini(element, type, seed) {
    var values = [12, 18, 15, 24, 20, 29];
    var rotated = values.map(function map(value, index) { return value + ((seed || 0) % 5) * (index % 2 ? 1 : -1); });
    if (type === "pie" || type === "liquid" || type === "treemap") {
      return init(element, { animation: false, color: ["#1769e8", "#76a8ee", "#c2d7f7"], series: [{ type: "pie", radius: type === "liquid" ? ["0%", "55%"] : ["30%", "62%"], center: ["50%", "50%"], label: { show: false }, data: rotated.slice(0, 4) }] });
    }
    if (type === "scatter" || type === "network") {
      return init(element, { animation: false, grid: { left: 15, right: 15, top: 15, bottom: 15 }, xAxis: { show: false }, yAxis: { show: false }, series: [{ type: "scatter", symbolSize: 7, data: rotated.map(function map(value, index) { return [index, value]; }), itemStyle: { color: "#1769e8" } }] });
    }
    return init(element, { animation: false, grid: { left: 12, right: 12, top: 14, bottom: 12 }, xAxis: { type: "category", show: false, data: [1, 2, 3, 4, 5, 6] }, yAxis: { type: "value", show: false }, series: [{ type: type === "bar" ? "bar" : "line", data: rotated, smooth: type !== "bar", symbol: "none", lineStyle: { width: 2, color: "#1769e8" }, itemStyle: { color: "#1769e8", borderRadius: [2, 2, 0, 0] }, areaStyle: type === "area" ? { color: "rgba(23,105,232,.08)" } : undefined }] });
  }

  window.addEventListener("resize", function resize() {
    instances.forEach(function each(instance) { if (instance && !instance.isDisposed()) instance.resize(); });
  });

  OpsDemo.ui.charts = { clear: clear, init: init, line: line, bar: bar, donut: donut, mini: mini };
})(window.OpsDemo);

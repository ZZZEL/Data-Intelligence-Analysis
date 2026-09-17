import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { demoRoot, loadOpsRuntime } from "./runtime.mjs";

const read = (path) => readFile(resolve(demoRoot, path), "utf8");
const index = await read("index.html");
const launcher = await read("src/launcher.js");

assert.match(index, /assets\/css\/tokens\.css/);
assert.match(index, /src\/launcher\.js/);
assert.match(launcher, /ops:\s*\{/);
assert.match(launcher, /src\/ops\/app\.js/);
assert.doesNotMatch(index, /src\/(?:core|pages|ui|mock)\//, "统一入口不应再直接维护旧分层路径");

const assetPaths = [
  "assets/favicon.svg",
  "assets/vendor/lucide.min.js",
  "assets/vendor/echarts.min.js",
  "assets/css/tokens.css",
  "assets/css/ops/base.css",
  "assets/css/ops/shell.css",
  "assets/css/ops/components.css",
  "assets/css/ops/pages.css",
  "assets/css/ops/documents.css",
  "assets/css/ops/responsive.css"
];
for (const path of assetPaths) assert.ok(existsSync(resolve(demoRoot, path)), `缺少统一资源：${path}`);

const scriptPaths = Array.from(launcher.matchAll(/"(src\/ops\/[^"?]+\.js)"/g), (match) => match[1]);
assert.ok(scriptPaths.length >= 20, "运营端清单应覆盖核心、UI、页面和入口脚本");
for (const path of scriptPaths) assert.ok(existsSync(resolve(demoRoot, path)), `启动清单引用了不存在的脚本：${path}`);

async function walk(directory) {
  const entries = await readdir(resolve(demoRoot, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const sourceFiles = await walk("src/ops");
for (const path of sourceFiles.filter((item) => item.endsWith(".js"))) {
  const absolute = resolve(demoRoot, path);
  execFileSync(process.execPath, ["--check", absolute], { stdio: "pipe" });
  const source = await read(path);
  assert.doesNotMatch(source, /\bfetch\s*\(/, `静态 Demo 不应发起网络请求：${path}`);
  assert.doesNotMatch(source, /type=["']module["']/);
}

const seed = await read("src/ops/supply-chain-seed.js");
const sourceUrls = Array.from(seed.matchAll(/"sourceUrl":\s*"([^"]+)"/g), (match) => match[1]);
assert.equal(sourceUrls.length, 10, "供应链样例应保留 10 份可预览原文件");
for (const path of sourceUrls) assert.ok(existsSync(resolve(demoRoot, path)), `样例原文件不存在：${path}`);

assert.ok(!existsSync(resolve(demoRoot, "src/core")), "旧 core 目录应已收敛到 src/ops");
assert.ok(!existsSync(resolve(demoRoot, "src/pages")), "旧 pages 目录应已收敛到 src/ops");
assert.ok(!existsSync(resolve(demoRoot, "ops-console/assets")), "运营端不应再保留重复资源目录");
assert.ok(!existsSync(resolve(demoRoot, "user-client/assets")), "用户端不应再保留重复资源目录");

const OpsDemo = loadOpsRuntime({ pages: ["knowledge", "documents", "data-access", "models", "rag", "api-access", "consumption"] });
const state = OpsDemo.core.store.getState();
assert.ok(state.knowledgeBases.length >= 4, "知识库样例未加载");
assert.equal(state.fileAssets.filter((asset) => String(asset.id || "").startsWith("SCM-DOC-")).length, 10, "供应链文档资产未完整装载");
for (const page of ["knowledge", "localDocuments", "enterpriseConnections", "externalInformation", "models", "rag", "retrievalTest", "apiAccess", "consumption"]) {
  assert.ok(OpsDemo.pages[page], `页面模块未注册：${page}`);
}

console.log(`ops static-check: passed (${sourceFiles.length} source files, ${relative(demoRoot, resolve(demoRoot, "src/ops")) || "."})`);

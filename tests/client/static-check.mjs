import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [index, launcher, app, fixture, css, wrapper] = await Promise.all([
  read("index.html"),
  read("src/launcher.js"),
  read("src/client/app.js"),
  read("src/client/fixture.js"),
  Promise.all([read("assets/css/tokens.css"), read("assets/css/client/app.css"), read("assets/css/client/responsive.css")]).then((parts) => parts.join("\n")),
  read("user-client/index.html")
]);

assert.match(index, /assets\/css\/tokens\.css/);
assert.match(index, /src\/launcher\.js/);
for (const mount of ["app", "session-menu-root", "dialog-root", "overlay-root", "toast-root"]) {
  assert.match(index, new RegExp(`id=["']${mount}["']`), `统一入口缺少挂载点：${mount}`);
}
assert.match(launcher, /client:\s*\{/);
assert.match(launcher, /ops:\s*\{/);
assert.match(launcher, /src\/client\/fixture\.js/);
assert.match(launcher, /src\/ops\/namespace\.js/);
assert.match(launcher, /reload\(\)/);
assert.doesNotMatch(launcher + app, /\.\.\/(?:ops-console|user-client)\//, "运行时不应再依赖跨子应用相对路径");
assert.doesNotMatch(app, /#\/templates(?:[/'"]|$)|outputProfiles|data-template-/, "已移除的模板能力不能回流");
assert.doesNotMatch(app + fixture, /MCP/);
assert.doesNotMatch(app, /\bfetch\s*\(/, "静态 Demo 不应发起网络请求");
assert.doesNotMatch(app, /type=["']module["']/);
assert.ok(fixture.includes("agentApiAccess") && fixture.includes("analysisRun"));
assert.match(css, /\.markdown-body/);
assert.match(css, /\.composer\s*\{/);
assert.match(css, /\.analysis-flow/);
assert.match(css, /\.source-drawer/);
assert.match(css, /prefers-reduced-motion/);
assert.match(wrapper, /new URL\("\.\.\//);
assert.match(wrapper, /#\/chat\/new/);

console.log("client static-check: passed");

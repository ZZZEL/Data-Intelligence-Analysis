import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

const checks = [
  ['用户端 Fixture 语法', ['--check', 'src/client/fixture.js']],
  ['用户端应用语法', ['--check', 'src/client/app.js']],
  ['统一启动器语法', ['--check', 'src/launcher.js']],
  ['用户端静态检查', ['tests/client/static-check.mjs']],
  ['用户端流程检查', ['tests/client/flow-check.mjs']],
  ['用户端响应状态检查', ['tests/client/response-state-check.mjs']],
  ['运营端静态检查', ['tests/ops/static-check.mjs']],
  ['运营端文档目录检查', ['tests/ops/document-folders-check.mjs']],
  ['运营端检索 API 检查', ['tests/ops/api-access-check.mjs']],
  ['运营端管理闭环检查', ['tests/ops/closed-loop-check.mjs']],
  ['RAG 文件生命周期与异步闭环检查', ['tests/ops/rag-lifecycle-check.mjs']]
];

for (const [label, args] of checks) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `${label}未通过`);
  console.log(`✓ ${label}`);
}

const launcher = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
const manifest = readFileSync(resolve(projectRoot, 'src/launcher.js'), 'utf8');
const userApp = readFileSync(resolve(projectRoot, 'src/client/app.js'), 'utf8');
const opsApp = readFileSync(resolve(projectRoot, 'src/ops/app.js'), 'utf8');

assert.match(launcher, /src\/launcher\.js/);
assert.match(manifest, /client:\s*\{/);
assert.match(manifest, /ops:\s*\{/);
assert.match(userApp, /href="#\/knowledge"/);
assert.match(opsApp, /href="#\/chat\/copper-decision"/);

console.log('✓ 统一入口与双向模式切换检查');
console.log('统一 Demo 项目检查全部通过。');

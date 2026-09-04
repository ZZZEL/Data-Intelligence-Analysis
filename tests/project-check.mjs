import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

const checks = [
  ['用户端 Fixture 语法', ['--check', 'user-client/src/fixture.js']],
  ['用户端应用语法', ['--check', 'user-client/src/app.js']],
  ['用户端静态检查', ['user-client/tests/static-check.mjs']],
  ['用户端流程检查', ['user-client/tests/flow-check.mjs']],
  ['运营端静态检查', ['ops-console/tests/static-check.mjs']],
  ['运营端管理闭环检查', ['ops-console/tests/closed-loop-check.mjs']]
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
const userApp = readFileSync(resolve(projectRoot, 'user-client/src/app.js'), 'utf8');
const opsApp = readFileSync(resolve(projectRoot, 'ops-console/src/app.js'), 'utf8');

assert.match(launcher, /\.\/user-client\/#\/chat\/new/);
assert.doesNotMatch(launcher, /\.\/ops-console\//);
assert.match(userApp, /\.\.\/ops-console\/#\/knowledge/);
assert.match(opsApp, /\.\.\/user-client\/#\/chat\/copper-decision/);

console.log('✓ 默认进入用户端与双向跳转检查');
console.log('统一 Demo 项目检查全部通过。');

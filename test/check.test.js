// 架构检查自己的测试：造一个坏仓，每条规则都要抓到；本仓现在的样子要全过
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { run } from '../scripts/check.js';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'yugioh-check-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
};
const RULES = ['deps-whitelist', 'outbound', 'test-isolation', 'boundary'];

test('本仓现在的样子过所有规则', () => {
  for (const rule of RULES) assert.deepEqual(run(rule, HERE), [], rule);
});

test('deps-whitelist：别的依赖、devDependencies、旧应用的文件都抓得到', () => {
  const root = repo({ 'package.json': JSON.stringify({ dependencies: { 'ocgcore-wasm': '1', next: '16' }, devDependencies: { eslint: '9' } }), 'wrangler.toml': '' });
  const problems = run('deps-whitelist', root).join('\n');
  assert.match(problems, /dependencies 里有 next/);
  assert.match(problems, /devDependencies/);
  assert.match(problems, /wrangler\.toml/);
  assert.deepEqual(run('deps-whitelist', repo({ 'package.json': JSON.stringify({ dependencies: { 'ocgcore-wasm': '1' } }) })), []);
});

test('boundary：src/ 里别的文件读环境变量、取现在、起子进程、写文件都抓得到，server.js 里的不算', () => {
  const root = repo({
    'src/server.js': 'const a = process.env.X; const n = Date.now();',
    'src/rules.js': 'const a = process.env.X; const n = new Date(); import cp from "node:child_process"; fetch("x"); writeFileSync("a"); import fs from "node:fs";',
  });
  const problems = run('boundary', root).join('\n');
  for (const what of ['process.env', 'new Date()', 'node:child_process', 'node:https / fetch', '写文件', 'node:fs']) assert.match(problems, new RegExp(`src/rules.js 用了 ${what.replace(/[()]/g, '\\$&')}`));
  assert.doesNotMatch(problems, /src\/server\.js/);
});

test('outbound：src/ 里的外部地址抓得到，本机的不算，注释不算', () => {
  const root = repo({ 'src/a.js': 'const u = "https://example.com/x"; const l = "http://127.0.0.1:1";\n// https://comment.example', 'src/b.js': 'const l = "http://localhost:2";' });
  assert.deepEqual(run('outbound', root), ['src/a.js 里有外部地址 example.com：服务只连本机']);
});

test('test-isolation：测试里写常驻端口、tailnet 地址、真实数据目录都抓得到', () => {
  const root = repo({ 'test/a.test.js': 'fetch("http://127.0.0.1:4519/health"); const d = "~/.mimi-yugioh"; const t = "mini.tail597608.ts.net";' });
  assert.equal(run('test-isolation', root).length, 3);
});

test('不认识的规则名报错', () => {
  assert.match(run('nope', HERE)[0], /没有这条检查/);
});

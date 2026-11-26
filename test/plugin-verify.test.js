// 验证技能的 plugin-verify up：Node 太旧时立刻说清楚怎么修，不去起服务（不然要等 yv launch 15 秒超时）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PV = new URL('../.claude/skills/verify-yugioh/scripts/plugin-verify', import.meta.url).pathname;

test('plugin-verify up：PATH 上的 node 低于 22 就立刻停，说怎么修', (t) => {
  const bin = mkdtempSync(join(tmpdir(), 'pv-node-'));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  // 假的旧 node：只会报版本，别的什么都不做（真起服务的话这里会失败得很慢）
  writeFileSync(join(bin, 'node'), '#!/bin/sh\n[ "$1" = --version ] && echo v20.11.0 && exit 0\nexit 1\n');
  chmodSync(join(bin, 'node'), 0o755);
  const t0 = Date.now();
  const r = spawnSync(PV, ['up'], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, timeout: 10000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /v20\.11\.0/);
  assert.match(r.stderr, /Node 22\+/);
  assert.match(r.stderr, /PATH/);
  assert.ok(Date.now() - t0 < 5000, `用了 ${Date.now() - t0} ms`);
});

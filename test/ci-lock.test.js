// scripts/ci-lock.sh：同一个检出同时只跑一份 ./ci，第二份等前一份结束（锁的主人是 ./ci 的进程，进程没了锁就算放了）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOCK = new URL('../scripts/ci-lock.sh', import.meta.url).pathname;

// 一个活着的「./ci」：sleep 进程，杀掉它就等于那份 ./ci 结束了
const fakeCi = () => spawn('sleep', ['60'], { stdio: 'ignore' });
const lock = (dir, owner, t) => {
  const child = spawn('sh', [LOCK], { env: { ...process.env, YUGIOH_CI_LOCK_DIR: dir, YUGIOH_CI_LOCK_OWNER: String(owner), YUGIOH_CI_LOCK_POLL: '0.2' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const done = new Promise((resolve) => child.on('exit', (code) => resolve({ code, out })));
  t.after(() => child.kill()); // 改坏的锁会一直等：测试结束时停掉，不留进程
  return { child, done };
};
const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r('还在等'), ms))]);

test('没人占着就立刻拿到锁，锁里记着主人的进程号', async (t) => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ci-lock-')), 'ci-lock');
  const a = fakeCi();
  t.after(() => { a.kill(); rmSync(join(dir, '..'), { recursive: true, force: true }); });
  const r = await within(lock(dir, a.pid, t).done, 5000);
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(dir, 'owner'), 'utf8'), new RegExp(`^${a.pid} `));
});

test('前一份还在跑：第二份等着；前一份结束后第二份拿到锁', async (t) => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ci-lock-')), 'ci-lock');
  const a = fakeCi();
  const b = fakeCi();
  t.after(() => { a.kill(); b.kill(); rmSync(join(dir, '..'), { recursive: true, force: true }); });
  assert.equal((await lock(dir, a.pid, t).done).code, 0);
  const second = lock(dir, b.pid, t);
  assert.equal(await within(second.done, 1500), '还在等');
  a.kill();
  const r = await within(second.done, 5000);
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(dir, 'owner'), 'utf8'), new RegExp(`^${b.pid} `));
});

test('锁的主人早没了（上次被杀掉留下的）：直接接手', async (t) => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ci-lock-')), 'ci-lock');
  const gone = fakeCi();
  const goneExit = new Promise((r) => gone.on('exit', r));
  gone.kill();
  await goneExit;
  mkdirSync(dir);
  writeFileSync(join(dir, 'owner'), `${gone.pid} Thu Jan  1 00:00:00 2026\n`);
  const b = fakeCi();
  t.after(() => { b.kill(); rmSync(join(dir, '..'), { recursive: true, force: true }); });
  const r = await within(lock(dir, b.pid, t).done, 5000);
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(dir, 'owner'), 'utf8'), new RegExp(`^${b.pid} `));
});

test('进程号被别的进程重用了（开始时间对不上）：也算锁放了', async (t) => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ci-lock-')), 'ci-lock');
  const other = fakeCi();
  const b = fakeCi();
  t.after(() => { other.kill(); b.kill(); rmSync(join(dir, '..'), { recursive: true, force: true }); });
  mkdirSync(dir);
  writeFileSync(join(dir, 'owner'), `${other.pid} Thu Jan  1 00:00:00 2026\n`);
  const r = await within(lock(dir, b.pid, t).done, 5000);
  assert.equal(r.code, 0, r.out);
});

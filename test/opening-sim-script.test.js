import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BRANDED } from '../src/decks/branded.js';
import { deal, handSeeds } from '../src/opening-sim.js';
import { ENGINE_DIR } from './helpers.js';

const SCRIPT = fileURLToPath(new URL('../scripts/opening-sim.js', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'yugioh-opening-'));
after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
const newOut = () => join(dir, `run-${n++}.jsonl`);
const sim = (out, ...args) => spawnSync(process.execPath, [SCRIPT, '--engine', ENGINE_DIR, '--out', out, '--seed', '99', '--max-nodes', '40', ...args], { encoding: 'utf8' });
const rows = (out) => readFileSync(out, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
const noMs = (list) => list.map(({ ms: _ms, ...rest }) => rest);

describe('scripts/opening-sim.js：固定种子、中途停下能续', () => {
  test('每手一行：index 从 0 起，种子是总种子派生的，起手是这个种子发的牌', () => {
    const out = newOut();
    const r = sim(out, '--count', '3');
    assert.equal(r.status, 0, r.stderr);
    const got = rows(out);
    assert.deepEqual(got.map((x) => x.index), [0, 1, 2]);
    assert.deepEqual(got.map((x) => x.seed), handSeeds(99, 3));
    assert.deepEqual(got.map((x) => x.hand), handSeeds(99, 3).map((s) => deal(BRANDED, s)));
    assert.ok(got.every((x) => x.maxNodes === 40 && typeof x.value === 'number' && Array.isArray(x.steps)));
  });

  test('同样的参数跑两次，JSONL 一样（毫秒除外）', () => {
    const a = newOut(); const b = newOut();
    assert.equal(sim(a, '--count', '3').status, 0);
    assert.equal(sim(b, '--count', '3').status, 0);
    assert.deepEqual(noMs(rows(a)), noMs(rows(b)));
  });

  test('续跑：先跑一半再续，和一口气跑完一样；已完成的手不重跑', () => {
    const whole = newOut(); const split = newOut();
    assert.equal(sim(whole, '--count', '4').status, 0);
    assert.equal(sim(split, '--count', '2').status, 0);
    const firstTwo = readFileSync(split, 'utf8');
    const resumed = sim(split, '--count', '4');
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.ok(readFileSync(split, 'utf8').startsWith(firstTwo), '前两行（含毫秒）原样保留，没有重跑');
    assert.deepEqual(noMs(rows(split)), noMs(rows(whole)));
  });

  test('续跑：最后一行写了一半（中途被杀），丢掉它重写，结果和一口气跑完一样', () => {
    const whole = newOut(); const cut = newOut();
    assert.equal(sim(whole, '--count', '3').status, 0);
    assert.equal(sim(cut, '--count', '3').status, 0);
    const text = readFileSync(cut, 'utf8');
    truncateSync(cut, text.lastIndexOf('\n', text.length - 2) + 1 + 20); // 最后一行只留 20 个字符，没有换行
    assert.ok(!readFileSync(cut, 'utf8').endsWith('\n'));
    const resumed = sim(cut, '--count', '3');
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.deepEqual(noMs(rows(cut)), noMs(rows(whole)));
  });

  test('已有的 JSONL 是别的种子或别的上限跑的：报错退出，文件不动', () => {
    const out = newOut();
    assert.equal(sim(out, '--count', '2').status, 0);
    const before = readFileSync(out, 'utf8');
    const other = spawnSync(process.execPath, [SCRIPT, '--engine', ENGINE_DIR, '--out', out, '--seed', '99', '--max-nodes', '41', '--count', '3'], { encoding: 'utf8' });
    assert.notEqual(other.status, 0);
    assert.match(other.stderr, /max-nodes|种子/);
    const otherSeed = spawnSync(process.execPath, [SCRIPT, '--engine', ENGINE_DIR, '--out', out, '--seed', '98', '--max-nodes', '40', '--count', '3'], { encoding: 'utf8' });
    assert.notEqual(otherSeed.status, 0);
    assert.equal(readFileSync(out, 'utf8'), before);
  });

  test('--shard i/K：只跑 index 对 K 取余等于 i 的手，各分片合起来和不分片一样', () => {
    const whole = newOut(); const s0 = newOut(); const s1 = newOut();
    assert.equal(sim(whole, '--count', '4').status, 0);
    assert.equal(sim(s0, '--count', '4', '--shard', '0/2').status, 0);
    assert.equal(sim(s1, '--count', '4', '--shard', '1/2').status, 0);
    assert.deepEqual(rows(s0).map((x) => x.index), [0, 2]);
    assert.deepEqual(rows(s1).map((x) => x.index), [1, 3]);
    const merged = [...rows(s0), ...rows(s1)].sort((a, b) => a.index - b.index);
    assert.deepEqual(noMs(merged), noMs(rows(whole)));
  });

  test('坏的参数：--count 不是正整数、--shard 写错，报错退出', () => {
    assert.notEqual(sim(newOut(), '--count', '0').status, 0);
    assert.notEqual(sim(newOut(), '--count', '2', '--shard', '2/2').status, 0);
  });
});

describe('scripts/opening-replay.js：把记录里的步骤在引擎里重放，和记录对照', () => {
  const REPLAY = fileURLToPath(new URL('../scripts/opening-replay.js', import.meta.url));
  const replay = (file, ...args) => spawnSync(process.execPath, [REPLAY, '--engine', ENGINE_DIR, '--file', file, ...args], { encoding: 'utf8' });

  test('按 --index 或 --seed 找到那一手，重放出和记录一致的场面值，退出码 0', () => {
    const out = newOut();
    assert.equal(sim(out, '--count', '2', '--max-nodes', '800').status, 0);
    const [first, second] = rows(out);
    assert.ok(first.steps.length && second.steps.length, '这两手在上限内都搜到了终场');
    const byIndex = replay(out, '--index', '1');
    assert.equal(byIndex.status, 0, byIndex.stderr);
    assert.match(byIndex.stdout, /一致/);
    assert.match(byIndex.stdout, new RegExp(`打断数 ${second.interrupts}`));
    assert.match(byIndex.stdout, new RegExp(`种子 ${second.seed}`));
    const bySeed = replay(out, '--seed', String(first.seed));
    assert.equal(bySeed.status, 0, bySeed.stderr);
    assert.match(bySeed.stdout, new RegExp(`种子 ${first.seed}`));
  });

  test('记录被改过（搜索值对不上重放）：退出码 1，说出差在哪', () => {
    const out = newOut();
    assert.equal(sim(out, '--count', '1', '--max-nodes', '800').status, 0);
    const [row] = rows(out);
    writeFileSync(out, `${JSON.stringify({ ...row, searchValue: row.searchValue + 10 })}\n`);
    const r = replay(out, '--index', '0');
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /不一致.*场面值/s);
  });

  test('这手在上限内没搜到终场（steps 是空的）：说明没有可重放的路线，退出码 1，不崩', () => {
    const out = newOut();
    assert.equal(sim(out, '--count', '1', '--max-nodes', '1').status, 0);
    const r = replay(out, '--index', '0');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /没有搜出/);
  });

  test('没有这个种子、没给 --seed 也没给 --index：退出码 2', () => {
    const out = newOut();
    assert.equal(sim(out, '--count', '1').status, 0);
    assert.equal(replay(out, '--seed', '1').status, 2);
    assert.equal(replay(out).status, 2);
  });
});

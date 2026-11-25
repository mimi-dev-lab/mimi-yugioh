import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BRANDED } from '../src/decks/branded.js';
import { checkReplay, replayRow } from '../src/opening-sim.js';
import { analyze, buildReport, candidateDetails, parseJsonl } from '../src/opening-report.js';
import { MAX_BRANCH, MAX_COMBOS, MAX_DISCREPANCY } from '../src/search.js';
import { openTestEngine } from './helpers.js';

// 编的小 JSONL：8 手，数字都能手算。A 白之落胤、B 烙印融合、C 阿卢绯尔、E 白之圣女；手坑：灰流丽、增殖的Z、原初之神 法拉、抽牌小丑与封锁鸟
const A = 73819701; const B = 44362883; const C = 62962630; const E = 55273560;
const ASH = 14558127; const G = 23434538; const SUP = 48130397; const FARA = 82344137; const LOCK = 94145021;
const MIRROR = 44146295; const QUEM = 45883110;
const step = (text) => ({ text, do: [{ idle: 'activate', code: A }, 'end-turn'] });
const row = (index, hand, keys, interrupts, handLeft, extra = {}) => ({
  masterSeed: 20261126, index, seed: 1000 + index, hand, keys, value: 10 * interrupts + handLeft, interrupts, handLeft,
  end: { monsters: interrupts ? [MIRROR] : [], spellTraps: [], hand: Array(handLeft).fill(ASH) }, source: 'search',
  searchValue: 10 * interrupts + handLeft, routeValue: null, bestRoute: null, routeValues: { 'white-albaz': null }, capped: false, nodes: 100 * (index + 1), maxNodes: 5000, ms: 1000, searchReplayOk: true, steps: [step(`第 ${index} 手`)], ...extra,
});
const ROWS = [
  row(0, [A, ASH, G, SUP, LOCK], [A], 3, 2, { routeValue: 24, bestRoute: 'white-albaz', routeValues: { 'white-albaz': 24 } }),
  row(1, [A, ASH, ASH, FARA, LOCK], [A], 2, 3, { source: 'white-albaz', searchValue: 22, routeValue: 24, bestRoute: 'white-albaz', routeValues: { 'white-albaz': 24 }, value: 24, capped: true }),
  row(2, [B, SUP, SUP, LOCK, FARA], [B], 2, 3, { routeValue: 23, bestRoute: 'branded-fusion' }),
  row(3, [A, C, G, FARA, LOCK], [A, C], 4, 1, { routeValue: 24, bestRoute: 'white-albaz' }),
  row(4, [ASH, ASH, G, FARA, LOCK], [], 0, 5),
  row(5, [ASH, G, FARA, LOCK, LOCK], [], 0, 5),
  row(6, [ASH, SUP, FARA, G, LOCK], [], 1, 4),
  row(7, [E, ASH, G, FARA, LOCK], [E], 0, 5),
];

describe('报告的统计：全部由 JSONL 的行算出', () => {
  const stats = analyze(ROWS, BRANDED, { minLiftHands: 1 });

  test('打断数分布：0 / 1 / 2 / 3+，卡手率 = 0 打断的占比，平均打断数', () => {
    assert.equal(stats.total, 8);
    assert.deepEqual(stats.distribution, { 0: 3, 1: 1, 2: 2, '3+': 2 });
    assert.equal(stats.brickRate, 3 / 8);
    assert.equal(stats.avgInterrupts, (3 + 2 + 2 + 4 + 0 + 0 + 1 + 0) / 8);
  });

  test('按关键卡分组：单张关键卡归它那组，两张以上归多张组合，没有归都没有；每组手数、平均、最好、卡手数', () => {
    const by = Object.fromEntries(stats.groups.map((g) => [g.name, g]));
    assert.deepEqual(stats.groups.map((g) => g.name), ['白之落胤', '烙印融合', '惨绝戏之导化 阿卢绯尔', '天底的使徒', '白之圣女 艾克利西亚', '烙印之气炎', '多张组合', '都没有']);
    assert.deepEqual([by['白之落胤'].n, by['白之落胤'].avg, by['白之落胤'].best, by['白之落胤'].bricks], [2, 2.5, 3, 0]);
    assert.deepEqual([by['烙印融合'].n, by['烙印融合'].avg, by['烙印融合'].best], [1, 2, 2]);
    assert.deepEqual([by['惨绝戏之导化 阿卢绯尔'].n, by['天底的使徒'].n, by['烙印之气炎'].n], [0, 0, 0]);
    assert.deepEqual([by['白之圣女 艾克利西亚'].n, by['白之圣女 艾克利西亚'].avg, by['白之圣女 艾克利西亚'].bricks], [1, 0, 1]);
    assert.deepEqual([by['多张组合'].n, by['多张组合'].avg, by['多张组合'].best], [1, 4, 4]);
    assert.deepEqual([by['都没有'].n, by['都没有'].avg, by['都没有'].best, by['都没有'].bricks], [3, 1 / 3, 1, 2]);
    assert.equal(stats.groups.reduce((s, g) => s + g.n, 0), 8);
  });

  test('常见终场：按终场在场的卡（名字排序）合并，空场单独写', () => {
    const none = stats.groups.find((g) => g.name === '都没有');
    assert.deepEqual(none.commonEnds, [{ text: '（空场）', n: 2 }, { text: '冰剑龙 镜翠幻种', n: 1 }]);
  });

  test('新路线候选：搜索值高于走得通的最好路线值的手，按差距从大到小；路线都走不通但搜索有打断的单列', () => {
    assert.deepEqual(stats.candidates.better.map((r) => [r.index, r.searchValue, r.routeValue]), [[3, 41, 24], [0, 32, 24]]);
    assert.deepEqual(stats.candidates.uncovered.map((r) => r.index), [6]);
  });

  test('每张卡在手时的平均打断数：有它的手平均 − 没有它的手平均，按提升从高到低', () => {
    const lift = Object.fromEntries(stats.lift.map((c) => [c.code, c]));
    assert.equal(lift[C].n, 1);
    assert.equal(lift[C].withAvg, 4);
    assert.ok(Math.abs(lift[C].withoutAvg - 8 / 7) < 1e-9);
    assert.ok(Math.abs(lift[C].lift - (4 - 8 / 7)) < 1e-9);
    assert.ok(Math.abs(lift[A].lift - 2.4) < 1e-9); // 有 A 的手 3 张：(3+2+4)/3 = 3；没有的 5 张：(2+0+0+1+0)/5 = 0.6
    assert.ok(Math.abs(lift[ASH].lift - -2) < 1e-9); // 有灰流丽的 6 张：(3+2+0+0+1+0)/6 = 1；没有的 2 张：(2+4)/2 = 3
    assert.equal(stats.lift[0].code, C);
    assert.deepEqual(stats.lift.map((c) => c.lift), [...stats.lift.map((c) => c.lift)].sort((a, b) => b - a));
    assert.equal(lift[QUEM], undefined, '没有手里出现过的卡不列');
  });

  test('每张卡手数不到 minLiftHands 的不列', () => {
    const strict = analyze(ROWS, BRANDED, { minLiftHands: 4 });
    assert.ok(strict.lift.every((c) => c.n >= 4));
    assert.ok(!strict.lift.some((c) => c.code === C));
  });

  test('卡手的共同点：卡手里没有关键卡的比例、手坑张数（卡手 vs 全部）', () => {
    assert.equal(stats.bricks.n, 3);
    assert.equal(stats.bricks.withoutKey, 2);
    assert.ok(Math.abs(stats.bricks.avgHandTraps - 14 / 3) < 1e-9);
    assert.ok(Math.abs(stats.avgHandTraps - 30 / 8) < 1e-9);
  });

  test('搜索上限：用的上限、超上限的手数、重放对不上的手数、来源统计', () => {
    assert.equal(stats.maxNodes, 5000);
    assert.equal(stats.masterSeed, 20261126);
    assert.equal(stats.cappedCount, 1);
    assert.equal(stats.replayBad, 0);
    assert.deepEqual(stats.sources, { search: 7, 'white-albaz': 1 });
    assert.equal(stats.avgNodes, 450);
    assert.equal(stats.totalMs, 8000);
  });
});

describe('报告文字：同一份 JSONL 同一份报告', () => {
  const text = buildReport(ROWS, BRANDED, { minLiftHands: 1 });

  test('确定：同样的行生成同样的文字', () => {
    assert.equal(buildReport(structuredClone(ROWS), BRANDED, { minLiftHands: 1 }), text);
  });

  test('写明手数、总种子、上限、超上限手数，和重算、重放的命令', () => {
    assert.match(text, /8 手/);
    assert.match(text, /20261126/);
    assert.match(text, /5000/);
    assert.match(text, /超上限（capped）的手：1 手/);
    assert.match(text, /node scripts\/opening-report\.js/);
    assert.match(text, /node scripts\/opening-sim\.js --count 8 --seed 20261126 --max-nodes 5000/);
    assert.match(text, /node scripts\/opening-replay\.js --seed 1003/);
  });

  test('搜索范围的说明引用 search.js 导出的上限，不是写死的数字', () => {
    assert.ok(text.includes(`每条路线最多 ${MAX_DISCREPANCY} 处不走排在第一的回应，选卡时最多试 ${MAX_BRANCH} 个不同的卡、${MAX_COMBOS} 种组合`));
  });

  test('打断数分布和卡手率的数字在文字里', () => {
    assert.match(text, /\| 0 \| 3 \| 37\.5% \|/);
    assert.match(text, /\| 3\+ \| 2 \| 25\.0% \|/);
    assert.match(text, /卡手率[^\n]*37\.5%/);
  });

  test('新路线候选写出种子；前几个附完整步骤（每步的说明和回应）', () => {
    assert.match(text, /种子 1003/);
    assert.match(text, /种子 1000/);
    assert.match(text, /第 3 手/);
    assert.match(text, /\{"idle":"activate","code":73819701\}/);
  });

  test('返工说明：总种子、上限、手数和第一版一样时，第一版的分布原样列出并和这次对照；对不上就不写', () => {
    const fv = { commit: 'abc1234', masterSeed: 20261126, maxNodes: 5000, total: 8, distribution: { 0: 1, 1: 1, 2: 2, '3+': 4 }, avgInterrupts: 2.5, avgHandLeft: 3, better: 5, uncovered: 2, mercurierOnField: 3 };
    const text = buildReport(ROWS, BRANDED, { firstVersion: fv });
    assert.match(text, /## 返工说明/);
    assert.match(text, /commit abc1234/);
    assert.match(text, /\| 0 \| 1 \| 12\.5% \| 3 \| 37\.5% \|/);
    assert.match(text, /\| 3\+ \| 4 \| 50\.0% \| 2 \| 25\.0% \|/);
    assert.match(text, /\| 平均打断数 \| 2\.50 \| 1\.50 \|/);
    assert.ok(text.indexOf('## 返工说明') < text.indexOf('## 打断数分布'));
    assert.doesNotMatch(buildReport(ROWS, BRANDED, { firstVersion: { ...fv, maxNodes: 100000 } }), /返工说明/);
    assert.doesNotMatch(buildReport(ROWS, BRANDED), /返工说明/); // 默认的第一版是 500 手、上限 100000
  });

  test('没有任何手超上限、没有候选时也能生成（写「没有」）', () => {
    const plain = ROWS.filter((r) => r.index >= 4).map((r) => ({ ...r, capped: false }));
    const t = buildReport(plain, BRANDED, { minLiftHands: 1 });
    assert.match(t, /超上限（capped）的手：0 手/);
    assert.match(t, /没有/);
  });
});

describe('行里的总种子或上限不止一个值：报错，不拼出一个不存在的数', () => {
  test('上限不一样（5000 和 100000）：analyze 和 buildReport 都报错，信息里有字段名和两个值', () => {
    const mixed = [ROWS[0], { ...ROWS[1], maxNodes: 100000 }];
    for (const run of [() => analyze(mixed, BRANDED), () => buildReport(mixed, BRANDED)]) assert.throws(run, /maxNodes[\s\S]*5000[\s\S]*100000/);
  });

  test('总种子不一样：报错', () => {
    const mixed = [ROWS[0], { ...ROWS[1], masterSeed: 1 }];
    assert.throws(() => buildReport(mixed, BRANDED), /masterSeed[\s\S]*1[\s\S]*20261126/);
  });
});

describe('JSONL 读入', () => {
  test('一行一手，按 index 排序，空行跳过；同一个 index 出现两次报错', () => {
    const text = `${JSON.stringify(ROWS[1])}\n\n${JSON.stringify(ROWS[0])}\n`;
    assert.deepEqual(parseJsonl(text).map((r) => r.index), [0, 1]);
    assert.throws(() => parseJsonl(`${JSON.stringify(ROWS[0])}\n${JSON.stringify(ROWS[0])}\n`), /index 0/);
  });
});

// 全量跑完、报告提交以后才有这两个文件
const MD = fileURLToPath(new URL('../docs/opening-analysis.md', import.meta.url));
const JSONL = fileURLToPath(new URL('../docs/opening-analysis.jsonl', import.meta.url));
describe('提交的报告', { skip: !existsSync(MD) || !existsSync(JSONL) }, () => {
  test('docs/opening-analysis.md 等于用 scripts/opening-report.js 从 docs/opening-analysis.jsonl 重新生成的', () => {
    assert.equal(readFileSync(MD, 'utf8'), buildReport(parseJsonl(readFileSync(JSONL, 'utf8')), BRANDED));
  });
});

// 报告里附完整步骤的新路线候选（至少 3 个）：用 replayRow 在引擎里重放，和记录对照应当一致
describe('提交的 JSONL 里的新路线候选能在引擎里重放', { skip: !existsSync(JSONL) }, () => {
  test('报告附完整步骤的候选：至少 3 个，每个重放的场面值（和来自搜索时的终场）与记录一致', async () => {
    const details = candidateDetails(analyze(parseJsonl(readFileSync(JSONL, 'utf8')), BRANDED));
    assert.ok(details.length >= 3, `候选只有 ${details.length} 个`);
    const engine = await openTestEngine();
    for (const r of details) assert.deepEqual(checkReplay(r, await replayRow(engine, BRANDED, r)), [], `种子 ${r.seed}（第 ${r.index} 手）`);
  });
});

describe('scripts/opening-report.js', () => {
  const SCRIPT = fileURLToPath(new URL('../scripts/opening-report.js', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'yugioh-report-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (name, list) => { const p = join(dir, name); writeFileSync(p, list.map((r) => `${JSON.stringify(r)}\n`).join('')); return p; };
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

  test('JSONL → 报告：输出和 buildReport 一样', () => {
    const jsonl = write('all.jsonl', ROWS);
    const md = join(dir, 'all.md');
    const r = run(jsonl, '--out', md);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(md, 'utf8'), buildReport(ROWS, BRANDED));
  });

  test('--merge：几个分片合成一份按 index 排好的 JSONL，报告和不分片的一样', () => {
    const a = write('s0.jsonl', ROWS.filter((r) => r.index % 2 === 0));
    const b = write('s1.jsonl', ROWS.filter((r) => r.index % 2 === 1));
    const merged = join(dir, 'merged.jsonl'); const md = join(dir, 'merged.md');
    const r = run(a, b, '--merge', merged, '--out', md);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(parseJsonl(readFileSync(merged, 'utf8')), ROWS);
    assert.equal(readFileSync(md, 'utf8'), buildReport(ROWS, BRANDED));
  });

  test('各行的上限不一样：报错退出，不写报告也不写合并文件', () => {
    const mixed = write('mixed.jsonl', [ROWS[0], { ...ROWS[1], maxNodes: 100000 }]);
    const md = join(dir, 'mixed.md'); const merged = join(dir, 'mixed-merged.jsonl');
    const r = run(mixed, '--out', md, '--merge', merged);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /maxNodes/);
    assert.ok(!existsSync(md) && !existsSync(merged));
  });

  test('找不到输入文件、分片里同一手出现两次：报错退出', () => {
    assert.notEqual(run(join(dir, 'nope.jsonl'), '--out', join(dir, 'x.md')).status, 0);
    const dup = run(write('d0.jsonl', ROWS), write('d1.jsonl', ROWS.slice(0, 1)), '--out', join(dir, 'x.md'));
    assert.notEqual(dup.status, 0);
    assert.match(dup.stderr, /index 0/);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { classifyHand } from '../src/deck.js';
import { deal, handKey } from '../src/hand.js';
import { BENCHMARK_EVERY, benchmarkHands, homeStats, nextDeal, pickPractice, typeWeights } from '../src/practice.js';

const rec = (over) => ({ type: 'hand', handType: 'other', benchmarkHand: false, durationMs: 100000, fieldScore: 100, speedBonus: 0, total: 100, ...over });
const typeCounts = (history, seeds = 3000) => {
  const counts = {};
  for (let s = 0; s < seeds; s++) { const t = classifyHand(BRANDED, pickPractice(BRANDED, history, { seed: s }).hand); counts[t] = (counts[t] ?? 0) + 1; }
  return counts;
};

describe('隐藏基准手', () => {
  const benchmarks = benchmarkHands(BRANDED);
  test('固定的一组：每个起手类型 2 手，起手牌互不相同，种子写死（同一份代码每次都一样）', () => {
    assert.deepEqual(benchmarks.map((b) => [b.seed, b.handType]), [
      [700000, 'other'], [700001, 'other'], [700002, 'brick'], [700003, 'brick'], [700013, 'white-albaz'], [700021, 'white-albaz'], [700048, 'branded-fusion'], [700067, 'branded-fusion'],
    ]);
    assert.equal(new Set(benchmarks.map((b) => handKey(b.hand))).size, benchmarks.length);
    for (const b of benchmarks) assert.deepEqual(b.hand, deal(BRANDED, b.seed).hand);
  });

  test(`每打满 ${BENCHMARK_EVERY - 1} 手练习手，下一手（第 5、10、15、20 手）是基准手，按顺序轮着发；别的手是练习手`, () => {
    const history = [];
    const seen = [];
    for (let n = 1; n <= 20; n++) {
      const next = nextDeal(BRANDED, history, { seed: n * 1000, benchmarks });
      seen.push(next.benchmark);
      if (next.benchmark) assert.equal(next.seed, benchmarks[(n / BENCHMARK_EVERY - 1) % benchmarks.length].seed);
      history.push(rec({ benchmarkHand: next.benchmark }), { type: 'void' }); // 作废的一手不占位
    }
    assert.deepEqual(seen.flatMap((b, i) => (b ? [i + 1] : [])), [5, 10, 15, 20]);
  });

  test('作废的基准手不推进：重开还是同一手基准手', () => {
    const history = Array.from({ length: 4 }, () => rec({}));
    const first = nextDeal(BRANDED, history, { seed: 1, benchmarks });
    assert.deepEqual(first, { seed: benchmarks[0].seed, benchmark: true });
    assert.deepEqual(nextDeal(BRANDED, [...history, { type: 'void', benchmark: true }], { seed: 99, benchmarks }), first);
  });

  test('基准手的起手牌不会作为练习手发出：把每个种子本来会发的起手设成基准，换成了别的起手', () => {
    for (let s = 0; s < 200; s++) {
      const would = pickPractice(BRANDED, [], { seed: s }); // 没有历史时第一个候选就被接受
      const got = pickPractice(BRANDED, [], { seed: s, benchmarkKeys: new Set([handKey(would.hand)]) });
      assert.notEqual(handKey(got.hand), handKey(would.hand));
    }
    for (let s = 0; s < 2000; s++) assert.ok(!benchmarks.some((b) => handKey(b.hand) === handKey(pickPractice(BRANDED, [], { seed: s, benchmarkKeys: new Set(benchmarks.map((x) => handKey(x.hand))) }).hand)));
  });
});

describe('按弱点发牌', () => {
  test('权重：没打过是 1；平均场面分 100 是 1；40 分是 1 + 3 × 0.6 = 2.8；只看最近 10 手；基准手不算', () => {
    const w = typeWeights(BRANDED, [
      ...Array.from({ length: 5 }, () => rec({ handType: 'branded-fusion', fieldScore: 40 })),
      rec({ handType: 'white-albaz', fieldScore: 100 }),
      rec({ handType: 'brick', fieldScore: 0, benchmarkHand: true }),
    ]);
    assert.deepEqual([...w], [['white-albaz', 1], ['branded-fusion', 2.8], ['other', 1], ['brick', 1]]);
    const old = [...Array.from({ length: 10 }, () => rec({ handType: 'other', fieldScore: 0 })), ...Array.from({ length: 10 }, () => rec({ handType: 'other', fieldScore: 100 }))];
    assert.equal(typeWeights(BRANDED, old).get('other'), 1);
  });

  test('固定种子 0–2999：没有历史时烙印融合起手 284 次（9.5%）；烙印融合场面分都是 40 时 683 次（22.8%），其他类型各自下降', () => {
    const base = typeCounts([]);
    const weak = typeCounts([
      ...Array.from({ length: 5 }, () => rec({ handType: 'branded-fusion', fieldScore: 40 })),
      ...['white-albaz', 'other', 'brick'].map((handType) => rec({ handType, fieldScore: 100 })),
    ]);
    assert.deepEqual(base, { 'white-albaz': 711, brick: 476, other: 1529, 'branded-fusion': 284 });
    assert.deepEqual(weak, { 'white-albaz': 611, brick: 389, other: 1317, 'branded-fusion': 683 });
    assert.ok(weak['branded-fusion'] / base['branded-fusion'] > 2);
  });
});

describe('首页统计', () => {
  test('0 手：都是空的，不报错', () => {
    assert.deepEqual(homeStats(BRANDED, []), { hands: 0, points: [], best: null, last: null, types: [], tip: null, progress: { points: [], average: null } });
    assert.equal(homeStats(BRANDED, [{ type: 'void', seed: 1 }]).hands, 0); // 作废的不算
  });

  test('1 手：一个点、个人最好就是它、刚才就是它；不够 3 手不下「最值得练」的结论', () => {
    const s = homeStats(BRANDED, [rec({ handType: 'white-albaz', durationMs: 112000, fieldScore: 100, speedBonus: 13, total: 113 })]);
    const p = { number: 1, handType: 'white-albaz', handTypeName: '白之落胤 1 卡初动', durationMs: 112000, fieldScore: 100, speedBonus: 13, total: 113 };
    assert.deepEqual(s, { hands: 1, points: [p], best: p, last: p, tip: null, progress: { points: [], average: null },
      types: [{ id: 'white-albaz', name: '白之落胤 1 卡初动', count: 1, avgFieldScore: 100, avgDurationMs: 112000 }] });
  });

  test('很多手：基准手占号但不画点；类型按平均场面从高到低；个人最好取总分最高；最值得练是平均场面最低且打过 3 手的类型；基准手只进进步曲线', () => {
    const history = [
      rec({ handType: 'white-albaz', fieldScore: 100, speedBonus: 10, total: 110, durationMs: 90000 }),
      rec({ handType: 'branded-fusion', fieldScore: 50, total: 50, durationMs: 200000 }),
      rec({ handType: 'branded-fusion', fieldScore: 70, total: 70, durationMs: 220000 }),
      { type: 'void', seed: 5 },
      rec({ handType: 'other', fieldScore: 80, total: 80, durationMs: 150000 }),
      rec({ handType: 'other', benchmarkHand: true, fieldScore: 60, total: 60, durationMs: 160000 }), // 第 5 手：基准手
      rec({ handType: 'branded-fusion', fieldScore: 60, total: 60, durationMs: 240000 }),
      rec({ handType: 'white-albaz', fieldScore: 90, speedBonus: 5, total: 95, durationMs: 100000 }),
      rec({ handType: 'brick', fieldScore: 100, total: 100, durationMs: 30000 }),
      rec({ handType: 'brick', benchmarkHand: true, fieldScore: 100, speedBonus: 20, total: 120, durationMs: 40000 }),
    ];
    const s = homeStats(BRANDED, history);
    assert.equal(s.hands, 9);
    assert.deepEqual(s.points.map((p) => p.number), [1, 2, 3, 4, 6, 7, 8]); // 5 号是基准手，不画
    assert.deepEqual(s.best && [s.best.number, s.best.total], [1, 110]);
    assert.equal(s.last.number, 8);
    assert.deepEqual(s.types, [
      { id: 'brick', name: '烂手', count: 1, avgFieldScore: 100, avgDurationMs: 30000 },
      { id: 'white-albaz', name: '白之落胤 1 卡初动', count: 2, avgFieldScore: 95, avgDurationMs: 95000 },
      { id: 'other', name: '其他起手', count: 1, avgFieldScore: 80, avgDurationMs: 150000 },
      { id: 'branded-fusion', name: '烙印融合 1 卡初动', count: 3, avgFieldScore: 60, avgDurationMs: 220000 },
    ]);
    assert.deepEqual(s.tip, { type: 'branded-fusion', name: '烙印融合 1 卡初动', avgFieldScore: 60, avgDurationMs: 220000 });
    assert.deepEqual(s.progress, { points: [{ index: 1, handType: 'other', durationMs: 160000, fieldScore: 60, total: 60 }, { index: 2, handType: 'brick', durationMs: 40000, fieldScore: 100, total: 120 }], average: 90 });
  });

  test('各类起手的平均场面都是 100 时没有「最值得练」', () => {
    assert.equal(homeStats(BRANDED, Array.from({ length: 4 }, () => rec({}))).tip, null);
  });
});

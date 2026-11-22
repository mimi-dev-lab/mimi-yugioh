// 模拟学习者（src/sim-learner.js）和一个学习者的实验（src/simulation.js）：固定种子可复现、学到的决定点会用上、复盘学的是走偏那步；
// 练习的两个新开关（候选种子的来源、不按弱点发牌）；搜索缓存的 ensure 能等。经服务的 handle() 打牌，数据目录是临时目录，搜索缓存是空的（基准只有 Game8 和个人最好）。
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { benchmarkHands, nextDeal, pickPractice } from '../src/practice.js';
import { openSearchCache } from '../src/search-cache.js';
import { openService } from '../src/service.js';
import { PARAMS, PROFILES, createLearner, decide, knows, learnFromReview, learnFromScore, stepItems, study } from '../src/sim-learner.js';
import { REGIMENS, runLearner } from '../src/simulation.js';
import { openStore } from '../src/store.js';
import { rngFrom } from '../src/hand.js';
import { ID, dataDir, openTestEngine } from './helpers.js';

const engine = openTestEngine();
const NOW = Date.UTC(2026, 11, 1);
const md = (code) => BRANDED.cards[code].md;

// 一个学习者跑两天：每次都是新的临时数据目录
async function runOnce({ seed = 3, regimen = 'full', profile = 'player' } = {}) {
  const root = await dataDir();
  let n = 0;
  const open = (now) => {
    const side = () => { const store = openStore(`${root}/${++n}`); let t = 0; return { store, service: openService({ deck: BRANDED, store, engine: () => engine, now, searchMs: 0, hintBudgetMs: 300, searchNow: () => ++t }) }; };
    return { practice: side(), exam: side() };
  };
  return runLearner({ deck: BRANDED, open, profile: PROFILES[profile], params: PARAMS, regimen: REGIMENS[regimen], seed, days: 2, examDays: [0, 2], pool: [11, 12, 13, 14, 15] });
}

describe('模拟学习者的实验', () => {
  test('同一个种子同一个结果（两次各用新的数据目录），换种子结果不同', async () => {
    const a = await runOnce();
    const b = await runOnce();
    assert.deepEqual(a, b);
    assert.equal(a.exams.length, 2);
    assert.equal(a.exams[0].totals.length, benchmarkHands(BRANDED).length);
    assert.ok(a.hands > 0 && a.answers > 0); // 完整系统：打了练习手，也记了卡
    assert.notDeepEqual(await runOnce({ seed: 4 }), a);
  });

  test('只随机打只给分：不记卡、不要提示、不看复盘；练习里没有基准手（基准手只在考试里打）', async () => {
    const r = await runOnce({ regimen: 'random' });
    assert.deepEqual([r.answers, r.hints, r.reviews, r.studied], [0, 0, 0, 0]);
    assert.ok(r.hands >= 5);
    assert.equal(r.benchmarkHands, 0);
  });
});

describe('遇到服务还不支持的引擎提示', () => {
  test('考试里这一手没法结算：记 0 分并计数（用户在这里也只能开下一手）', async () => {
    const service = {
      benchmarks: benchmarkHands(BRANDED),
      handle: async (method, path) => (path === '/hand/start' ? [200, { status: 'playing', prompt: { kind: 'unsupported', options: [] } }] : [500, { error: `不该调 ${method} ${path}` }]),
    };
    const open = () => ({ practice: { service, store: { readHands: () => [] } }, exam: { service } });
    const r = await runLearner({ deck: BRANDED, open, profile: PROFILES.player, params: PARAMS, regimen: REGIMENS.random, seed: 1, days: 0, examDays: [0], pool: [1] });
    assert.deepEqual(r.exams[0], { day: 0, mean: 0, totals: Array(8).fill(0), abandoned: 8 });
  });
});

describe('模拟学习者的模型', () => {
  const prompt = { kind: 'idle', options: [{ action: 'activate', code: ID.aluber, md: md(ID.aluber) }, { action: 'summon', code: ID.quem, md: md(ID.quem) }, { action: 'end-turn' }] };

  test('复盘、路线上的一步拆成决定点：发起的动作 + 这一步选的卡（「等 n 张」去掉）', () => {
    assert.deepEqual(stepItems('发动 X · 选 A、B 等 4 张'), ['|发动 X', '发动 X|选 A', '发动 X|选 B']);
    assert.deepEqual(stepItems('结束回合'), ['|结束回合']);
  });

  test('学会的决定点会用上：学过「发动 阿鲁伯」之后，主阶段 100 次都选它，而且比不会时快', () => {
    const params = { ...PARAMS, slip: 0, cardFloor: 1 };
    const learner = createLearner(PROFILES.novice, params, rngFrom(1));
    const before = Array.from({ length: 100 }, () => decide(learner, BRANDED, prompt, NOW));
    study(learner, [`|发动 ${md(ID.aluber)}`], NOW, 1);
    const after = Array.from({ length: 100 }, () => decide(learner, BRANDED, prompt, NOW + 1000));
    assert.ok(before.some((d) => d.indices[0] !== 0)); // 不会时乱选
    assert.ok(after.every((d) => d.indices[0] === 0 && d.known && !d.stuck));
    const avg = (list) => list.reduce((s, d) => s + d.ms, 0) / list.length;
    assert.ok(avg(after) < avg(before));
  });

  test('会忘：记性差的画像隔 30 天想起来的概率比普通画像低', () => {
    const normal = createLearner(PROFILES.player, PARAMS, rngFrom(1));
    const weak = createLearner(PROFILES.forgetful, PARAMS, rngFrom(1));
    for (const l of [normal, weak]) study(l, ['|发动 X'], NOW, 1);
    const later = NOW + 30 * 86400000;
    assert.ok(knows(weak, '|发动 X', later) < knows(normal, '|发动 X', later));
    assert.ok(knows(normal, '|发动 X', later) < knows(normal, '|发动 X', NOW + 1000));
  });

  test('复盘学的是走偏的那一步；一直没走偏但停得早就学最好路线的下一步；场面分 100 不学', () => {
    const settle = (over) => ({ fieldScore: 50, steps: [{}, {}], bestSteps: [{ summary: '发动 A' }, { summary: '发动 B · 选 C' }, { summary: '发动 D' }], divergeStep: 2, ...over });
    const learner = () => createLearner(PROFILES.player, { ...PARAMS, learnP: 1 }, rngFrom(1));
    const l1 = learner();
    assert.equal(learnFromReview(l1, settle(), NOW), '发动 B · 选 C');
    assert.deepEqual([...l1.decisions.keys()], ['|发动 B', '发动 B|选 C']);
    assert.equal(learnFromReview(learner(), settle({ divergeStep: null }), NOW), '发动 D');
    assert.equal(learnFromReview(learner(), settle({ fieldScore: 100 }), NOW), null);
    assert.equal(learnFromReview(learner(), settle({ bestSteps: null }), NOW), null);
  });

  test('只看分数：总分到 80 才回想自己的做法', () => {
    const l = createLearner(PROFILES.player, { ...PARAMS, selfP: 1 }, rngFrom(1));
    learnFromScore(l, 79, ['|发动 X'], NOW);
    assert.equal(l.decisions.size, 0);
    learnFromScore(l, 80, ['|发动 X'], NOW);
    assert.equal(l.decisions.size, 1);
  });
});

describe('练习的开关（模拟用）', () => {
  test('候选种子从给的一组里抽：发出的练习手都在里面', () => {
    const pool = [101, 202, 303, 404];
    for (let s = 0; s < 50; s++) assert.ok(pool.includes(pickPractice(BRANDED, [], { seed: s, candidateSeed: (r) => pool[Math.floor(r() * pool.length)] }).seed));
    const benchmarks = benchmarkHands(BRANDED);
    assert.ok(pool.includes(nextDeal(BRANDED, [], { seed: 1, benchmarks, candidateSeed: () => 303 }).seed));
  });

  test('不按弱点发牌：某类起手一直打得差，发牌也和没有历史时一样', () => {
    const fusion = Array.from({ length: 10 }, () => ({ type: 'hand', handType: 'branded-fusion', benchmarkHand: false, fieldScore: 0 }));
    let differs = 0;
    for (let s = 0; s < 300; s++) {
      assert.deepEqual(pickPractice(BRANDED, fusion, { seed: s, weakDealing: false }), pickPractice(BRANDED, [], { seed: s }));
      if (pickPractice(BRANDED, fusion, { seed: s }).seed !== pickPractice(BRANDED, [], { seed: s }).seed) differs++;
    }
    assert.ok(differs > 0); // 按弱点发时确实不一样
  });

  test('搜索缓存的 ensure 返回能等的 Promise：等完缓存里就有了；已有条目返回 null', async () => {
    const files = new Map();
    const store = { readSearch: (k) => files.get(k) ?? null, writeSearch: (k, e) => files.set(k, e) };
    const cache = openSearchCache({ store, deck: { name: 't' }, now: () => 1, budgetMs: 10, search: async () => ({ value: 1, steps: [{ text: 'x', do: ['end-turn'] }], timedOut: false }) });
    const running = cache.ensure([1, 2, 3, 4, 5], 9);
    assert.ok(running instanceof Promise);
    await running;
    assert.equal(cache.state([1, 2, 3, 4, 5]).status, 'done');
    assert.equal(cache.ensure([1, 2, 3, 4, 5], 9), null);
  });
});

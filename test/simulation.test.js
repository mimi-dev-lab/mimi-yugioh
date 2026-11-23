// 模拟学习者（src/sim-learner.js）和一个学习者的实验（src/simulation.js）：固定种子可复现、学到的决定点会用上、复盘学的是走偏那步；
// 练习的两个新开关（候选种子的来源、不按弱点发牌）；搜索缓存的 ensure 能等。经服务的 handle() 打牌，数据目录是临时目录，搜索缓存是空的（基准只有 Game8 和个人最好）。
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { benchmarkHands, nextDeal, pickPractice } from '../src/practice.js';
import { openSearchCache } from '../src/search-cache.js';
import { openService } from '../src/service.js';
import { PARAMS, PROFILES, createLearner, decide, knows, learnFromQuiz, learnFromReview, learnFromScore, stepUnits, study } from '../src/sim-learner.js';
import { REGIMENS, runLearner } from '../src/simulation.js';
import { openStore } from '../src/store.js';
import { rngFrom } from '../src/hand.js';
import { ID, dataDir, openTestEngine } from './helpers.js';

const engine = openTestEngine();
const NOW = Date.UTC(2026, 11, 1);
const md = (code) => BRANDED.cards[code].md;

// 一个学习者跑两天：每次都是新的临时数据目录
async function runOnce({ seed = 3, regimen = 'full', profile = 'player', examDays = [0, 2] } = {}) {
  const root = await dataDir();
  let n = 0;
  const open = (now) => {
    const side = () => { const store = openStore(`${root}/${++n}`); let t = 0; return { store, service: openService({ deck: BRANDED, store, engine: () => engine, now, searchMs: 0, hintBudgetMs: 300, searchNow: () => ++t }) }; };
    return { practice: side(), openExam: side };
  };
  return runLearner({ deck: BRANDED, open, profile: PROFILES[profile], params: PARAMS, regimen: REGIMENS[regimen], seed, days: 2, examDays, pool: [11, 12, 13, 14, 15] });
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

  test('考试分数不随考了几次变：第 2 天的考试，前面考没考第 1 天都一样（每次考试新开数据目录，个人最好不带到下一次）', async () => {
    const twice = await runOnce({ examDays: [0, 2] });
    const thrice = await runOnce({ examDays: [0, 1, 2] });
    assert.deepEqual(thrice.exams.find((e) => e.day === 2), twice.exams.find((e) => e.day === 2));
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
      handle: async (method, path) => (path === '/hand/start' ? [200, { status: 'playing', board: { hand: [] }, prompt: { kind: 'unsupported', options: [] } }] : [500, { error: `不该调 ${method} ${path}` }]),
    };
    const open = () => ({ practice: { service, store: { readHands: () => [] } }, openExam: () => ({ service }) });
    const r = await runLearner({ deck: BRANDED, open, profile: PROFILES.player, params: PARAMS, regimen: REGIMENS.random, seed: 1, days: 0, examDays: [0], pool: [1] });
    assert.deepEqual(r.exams[0], { day: 0, mean: 0, totals: Array(8).fill(0), abandoned: 8 });
  });
});

describe('模拟学习者的模型（可迁移的知识单位）', () => {
  const opt = (action, code) => ({ action, code, md: md(code) });
  const idle = (...options) => ({ kind: 'idle', options: [...options, { action: 'end-turn' }] });
  const sure = (profile = PROFILES.novice) => createLearner(profile, { ...PARAMS, slip: 0, cardFloor: 1 }, rngFrom(1));
  const many = (learner, prompt, ctx, t = NOW + 1000) => Array.from({ length: 100 }, () => decide(learner, BRANDED, prompt, t, ctx));

  test('一步拆成知识单位：这张卡该用（带步序）、开头两步还学「这类起手先从它开始」、选的卡是它该拿的；结束回合是原则；盖放不算「该用」', () => {
    assert.deepEqual(stepUnits(BRANDED, `发动 ${md(ID.aluber)} · 选 ${md(ID.bfusion)} 等 3 张`, 1, 'other'), [
      { key: `use:${ID.aluber}`, code: ID.aluber, index: 1 }, { key: `open:other:${ID.aluber}`, code: ID.aluber }, { key: `pick:${ID.aluber}:${ID.bfusion}`, code: ID.bfusion, source: ID.aluber }]);
    assert.deepEqual(stepUnits(BRANDED, `连锁发动 ${md(ID.albaz)}`, 5, 'other'), [{ key: `use:${ID.albaz}`, code: ID.albaz, index: 5 }]);
    assert.deepEqual(stepUnits(BRANDED, '结束回合', 6, 'other'), [{ key: 'principle:end-when-done' }]);
    assert.deepEqual(stepUnits(BRANDED, `盖放 ${md(ID.ash)}`, 2), []);
  });

  test('学到的「该用」在没见过的局面里也用上，并且按学到的步序先用早的；比不会时快', () => {
    const learner = sure();
    const prompt = idle(opt('summon', ID.quem), opt('activate', ID.aluber), opt('activate', ID.bfusion));
    const before = many(learner, prompt, { step: 3 }, NOW);
    study(learner, [{ key: `use:${ID.bfusion}`, code: ID.bfusion, index: 4 }, { key: `use:${ID.aluber}`, code: ID.aluber, index: 1 }], NOW, 1);
    const after = many(learner, prompt, { step: 3 });
    assert.ok(before.some((d) => d.indices[0] !== 1)); // 不会时乱选
    assert.ok(after.every((d) => d.indices[0] === 1 && d.known && !d.stuck)); // 阿卢绯尔学到的步序更早
    assert.ok(many(learner, idle(opt('summon', ID.quem), opt('activate', ID.bfusion)), { step: 3 }).every((d) => d.indices[0] === 1)); // 没有阿卢绯尔的局面：用烙印融合
    const avg = (list) => list.reduce((x, d) => x + d.ms, 0) / list.length;
    assert.ok(avg(after) < avg(before));
  });

  test('「这类起手先从哪张开始」只在这一手的第一步、起手类型对得上时用', () => {
    const learner = sure();
    study(learner, [{ key: `open:other:${ID.bfusion}`, code: ID.bfusion }], NOW, 1);
    const prompt = idle(opt('summon', ID.quem), opt('activate', ID.bfusion));
    assert.ok(many(learner, prompt, { step: 0, handType: 'other' }).every((d) => d.indices[0] === 1));
    assert.ok(many(learner, prompt, { step: 0, handType: 'brick' }).some((d) => d.indices[0] !== 1));
    assert.ok(many(learner, prompt, { step: 1, handType: 'other' }).some((d) => d.indices[0] !== 1)); // 走过一步以后不再按开局走
  });

  test('选卡：学到「这张卡该拿什么」就拿它，换了别的选项组合也一样', () => {
    const learner = sure();
    study(learner, [{ key: `pick:${ID.aluber}:${ID.bfusion}`, code: ID.bfusion, source: ID.aluber }], NOW, 1);
    const source = { code: ID.aluber, md: md(ID.aluber), action: '发动' };
    assert.ok(many(learner, { kind: 'pick-one', source, options: [opt('select', ID.ash), opt('select', ID.albaz), opt('select', ID.bfusion)] }).every((d) => d.indices[0] === 2));
    assert.ok(many(learner, { kind: 'cards', min: 1, max: 1, source, options: [opt('select', ID.bfusion), opt('select', ID.quem)] }).every((d) => d.indices.join() === '0'));
  });

  test('原则：想起「手坑留在手里」、认识灰流丽时，不召唤它；想起「用完就结束」时，走过一步以后想不起别的就结束回合', () => {
    const learner = sure();
    for (let i = 0; i < 3; i++) learnFromQuiz(learner, ID.ash, 'Easy', NOW + i * 1000);
    study(learner, [{ key: 'principle:keep-handtraps' }], NOW, 1);
    const prompt = idle(opt('summon', ID.ash), opt('summon', ID.quem));
    assert.ok(many(learner, prompt, { step: 1 }, NOW + 5000).every((d) => d.indices[0] !== 0));
    study(learner, [{ key: 'principle:end-when-done' }], NOW, 1);
    assert.ok(many(learner, prompt, { step: 1 }, NOW + 5000).every((d) => d.indices[0] === 2));
    assert.ok(many(learner, prompt, { step: 0 }, NOW + 5000).some((d) => d.indices[0] !== 2)); // 一步都没走时不结束
  });

  test('会忘：记性差的画像隔 30 天想起来的概率比普通画像低', () => {
    const normal = createLearner(PROFILES.player, PARAMS, rngFrom(1));
    const weak = createLearner(PROFILES.forgetful, PARAMS, rngFrom(1));
    for (const l of [normal, weak]) study(l, [{ key: 'use:1', code: 1, index: 1 }], NOW, 1);
    const later = NOW + 30 * 86400000;
    assert.ok(knows(weak, 'use:1', later) < knows(normal, 'use:1', later));
    assert.ok(knows(normal, 'use:1', later) < knows(normal, 'use:1', NOW + 1000));
  });

  test('复盘学走偏的那一步（停得早就学下一步，场面分 100 不学）；自己那步用了认得出的手坑，还学「手坑留在手里」', () => {
    const best = [{ summary: `发动 ${md(ID.aluber)}` }, { summary: `发动 ${md(ID.bfusion)} · 选 ${md(ID.albaz)}` }, { summary: '结束回合' }];
    const settle = (over) => ({ fieldScore: 50, handTypeStats: { type: 'other' }, steps: [{ summary: `发动 ${md(ID.aluber)}` }, { summary: `召唤 ${md(ID.ash)}` }], bestSteps: best, divergeStep: 2, ...over });
    const learner = () => { const l = createLearner(PROFILES.player, { ...PARAMS, learnP: 1 }, rngFrom(1)); for (let i = 0; i < 3; i++) learnFromQuiz(l, ID.ash, 'Easy', NOW - 5000 + i * 1000); return l; };
    const l1 = learner();
    assert.equal(learnFromReview(l1, BRANDED, settle(), NOW), best[1].summary);
    assert.deepEqual([...l1.decisions.keys()].sort(), [`open:other:${ID.bfusion}`, `pick:${ID.bfusion}:${ID.albaz}`, 'principle:keep-handtraps', `use:${ID.bfusion}`].sort());
    const l2 = learner();
    assert.equal(learnFromReview(l2, BRANDED, settle({ divergeStep: null, steps: settle().steps.slice(0, 2) }), NOW), '结束回合');
    assert.ok(l2.decisions.has('principle:end-when-done'));
    assert.equal(learnFromReview(learner(), BRANDED, settle({ fieldScore: 100 }), NOW), null);
    assert.equal(learnFromReview(learner(), BRANDED, settle({ bestSteps: null }), NOW), null);
  });

  test('只看分数：总分到 80 才回想自己这手的做法', () => {
    const l = createLearner(PROFILES.player, { ...PARAMS, selfP: 1 }, rngFrom(1));
    const units = [{ key: 'use:1', code: 1, index: 1 }];
    learnFromScore(l, 79, units, NOW);
    assert.equal(l.decisions.size, 0);
    learnFromScore(l, 80, units, NOW);
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

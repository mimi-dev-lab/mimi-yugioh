import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { indicesFor } from '../src/route.js';
import { benchmarkHands } from '../src/practice.js';
import { WHITE_ALBAZ_SEED, dataDir, withServer as withServerEnv } from './helpers.js';

// 首页统计和基准手：不搜索（YUGIOH_SEARCH_MS=0），结算里基准只剩 Game8 和个人最好
const withServer = (fn, env = {}) => withServerEnv(fn, { YUGIOH_SEARCH_MS: '0', ...env });
const rec = (over) => ({ type: 'hand', handType: 'other', benchmarkHand: false, hand: [1, 2, 3, 4, 5], durationMs: 100000, fieldScore: 100, speedBonus: 0, total: 100, ...over });
const seedLog = async (rows) => { const dir = await dataDir(); await writeFile(join(dir, 'hands.jsonl'), `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`); return dir; };

describe('首页统计：HTTP 接口', () => {
  test('0 手：空的', () => withServer(async (call) => {
    const home = await call('GET', '/home');
    assert.equal(home.status, 200);
    assert.deepEqual(home.body, { hands: 0, points: [], best: null, last: null, types: [], tip: null, progress: { points: [], average: null } });
  }));

  test('1 手：按 Game8 路线打完一手白之落胤，首页有这一个点，个人最好和刚才都是它', () => withServer(async (call, data) => {
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    let state = (await call('GET', '/hand')).body;
    for (const step of BRANDED.routes.find((r) => r.id === 'white-albaz').steps) {
      for (const response of step.do) {
        if (response === 'finish') continue;
        state = (await call('POST', '/hand/choose', { indices: indicesFor(state.prompt, response) })).body;
      }
    }
    const settled = (await call('POST', '/hand/end')).body;
    const { body } = await call('GET', '/home');
    assert.equal(body.hands, 1);
    assert.equal(body.points.length, 1);
    assert.deepEqual(body.points[0], { number: 1, handType: 'white-albaz', handTypeName: '白之落胤 1 卡初动', durationMs: settled.durationMs, fieldScore: 100, speedBonus: settled.speedBonus, total: settled.total });
    assert.deepEqual([body.best, body.last], [body.points[0], body.points[0]]);
    assert.deepEqual(body.types, [{ id: 'white-albaz', name: '白之落胤 1 卡初动', count: 1, avgFieldScore: 100, avgDurationMs: settled.durationMs }]);
    assert.equal(body.tip, null);
    assert.equal(data.length > 0, true);
  }));

  test('很多手（日志里 40 手，4 种起手，其中 8 手是基准手）：点数、各类平均、最值得练、基准手曲线', async () => {
    const types = ['white-albaz', 'branded-fusion', 'other', 'brick'];
    const rows = Array.from({ length: 40 }, (_, i) => rec({
      handType: types[i % 4], benchmarkHand: i % 5 === 4, durationMs: (60 + i * 5) * 1000, fieldScore: types[i % 4] === 'branded-fusion' ? 50 : 100,
      speedBonus: 0, total: types[i % 4] === 'branded-fusion' ? 50 : 100,
    }));
    const data = await seedLog([...rows.slice(0, 20), { type: 'void', seed: 9 }, ...rows.slice(20)]);
    await withServer(async (call) => {
      const { body } = await call('GET', '/home');
      assert.equal(body.hands, 40);
      assert.equal(body.points.length, 32);
      assert.equal(body.progress.points.length, 8);
      assert.deepEqual(body.progress.points.map((p) => p.index), [1, 2, 3, 4, 5, 6, 7, 8]);
      assert.ok(!body.points.some((p) => p.number % 5 === 0)); // 第 5、10…手是基准手，不在散点里
      assert.equal(body.tip.type, 'branded-fusion');
      assert.equal(body.types.at(-1).id, 'branded-fusion');
      assert.equal(body.types.at(-1).avgFieldScore, 50);
      assert.equal(body.last.number, 39);
    }, { YUGIOH_DATA: data });
  });
});

describe('隐藏基准手：HTTP 接口', () => {
  test('每打满 4 手练习手，下一手是基准手：提示接口拒绝，结算和普通一手一样，日志标出，首页只在进步曲线里有它', async () => {
    const data = await seedLog(Array.from({ length: 4 }, () => rec({})));
    await withServer(async (call) => {
      const started = await call('POST', '/hand/start');
      assert.equal(started.status, 200);
      assert.equal(started.body.number, 5);
      const benchmark = benchmarkHands(BRANDED)[0];
      assert.deepEqual([...started.body.board.hand.map((c) => c.code)].sort(), [...benchmark.hand].sort());
      const hint = await call('POST', '/hand/hint');
      assert.equal(hint.status, 409);
      assert.match(hint.body.error, /不能用提示/);
      assert.equal((await call('GET', '/hand')).body.hints, 0); // 被拒绝的提示不计数
      const settled = (await call('POST', '/hand/end')).body;
      assert.ok(!('benchmarkHand' in settled)); // 外观和普通一手相同
      assert.equal(settled.hints, 0);
      const home = (await call('GET', '/home')).body;
      assert.equal(home.hands, 5);
      assert.equal(home.points.length, 4);
      assert.equal(home.progress.points.length, 1);
      assert.equal(home.progress.points[0].index, 1);
      // 下一手又是练习手：提示可用（0 手可提示的局面也算：不是 409）
      const next = await call('POST', '/hand/start');
      assert.equal(next.body.number, 6);
      assert.notEqual((await call('POST', '/hand/hint')).status, 409);
    }, { YUGIOH_DATA: data });
  });

  test('练习手不会发出基准手的起手牌，发了 30 手也一样；给种子重打普通手可以用提示；重打基准手仍是基准手，不能用提示', async () => {
    await withServer(async (call) => {
      const keys = new Set(benchmarkHands(BRANDED).map((b) => [...b.hand].sort((a, b2) => a - b2).join('-')));
      for (let i = 0; i < 4; i++) {
        const { body } = await call('POST', '/hand/start');
        assert.ok(!keys.has(body.board.hand.map((c) => c.code).sort((a, b) => a - b).join('-')));
        await call('POST', '/hand/end');
      }
      const fifth = await call('POST', '/hand/start'); // 第 5 手：基准手
      assert.ok(keys.has(fifth.body.board.hand.map((c) => c.code).sort((a, b) => a - b).join('-')));
      assert.equal((await call('POST', '/hand/hint')).status, 409);
      const replay = await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
      assert.equal(replay.status, 200);
      assert.notEqual((await call('POST', '/hand/hint')).status, 409);
      const again = await call('POST', '/hand/start', { seed: benchmarkHands(BRANDED)[0].seed }); // 重打基准手（结算里的 seed）
      assert.equal(again.status, 200);
      assert.equal((await call('POST', '/hand/hint')).status, 409);
    });
  });
});

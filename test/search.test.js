import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { openHandSession } from '../src/duel-session.js';
import { deal, startHand } from '../src/hand.js';
import { indicesFor, playRoute } from '../src/route.js';
import { boardValue } from '../src/scoring.js';
import { SEARCH_BUDGET_MS, searchHand } from '../src/search.js';
import { openTestEngine } from './helpers.js';

describe('最好场面搜索', () => {
  let engine;
  before(async () => { engine = await openTestEngine(); });
  const SEED = 1;

  for (const route of BRANDED.routes) {
    test(`${route.name}的起手：搜出的最好场面值不低于 Game8 路线的，搜出的路线重放得到同一个终场，引擎脚本报错 0`, async () => {
      const game8 = await playRoute(engine, BRANDED, route, { seed: SEED });
      const found = await searchHand(engine, BRANDED, { hand: route.hand, seed: SEED, now: Date.now, budgetMs: SEARCH_BUDGET_MS });
      assert.equal(found.timedOut, false);
      assert.ok(found.value >= boardValue(BRANDED, game8.endBoard), `搜索 ${found.value}，Game8 ${boardValue(BRANDED, game8.endBoard)}`);
      const replay = await playRoute(engine, BRANDED, { id: 'search', name: '搜索', steps: found.steps }, { seed: SEED, hand: route.hand });
      assert.deepEqual(replay.scriptErrors, []);
      assert.equal(boardValue(BRANDED, replay.endBoard), found.value);
      assert.equal(replay.boards.length, found.steps.length); // 搜索的路线按「一步」切，和 Game8 同一种切法
    });
  }

  test('没有起手卡的烂手：很快搜完，最好值不低于手牌数', async () => {
    const hand = [94145021, 94145021, 48130397, 48130397, 75500286]; // 封锁鸟 ×2、超融合 ×2、黄金柜
    const found = await searchHand(engine, BRANDED, { hand, seed: SEED, now: Date.now, budgetMs: SEARCH_BUDGET_MS });
    assert.equal(found.timedOut, false);
    assert.ok(found.value >= 5);
  });

  test('时间上限到了就停，标超时；停之前找到的路线仍然可用', async () => {
    const route = BRANDED.routes[0];
    const found = await searchHand(engine, BRANDED, { hand: route.hand, seed: SEED, now: Date.now, budgetMs: 1500 });
    assert.equal(found.timedOut, true);
    assert.ok(found.steps && found.value >= 5); // 第一轮（只走排在第一的）很快就有结果
    assert.ok(found.elapsedMs < 4000, String(found.elapsedMs));
  });

  test('搜索把事件循环让出来：搜着的时候别的定时器照常触发', async () => {
    const route = BRANDED.routes[0];
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 10);
    await searchHand(engine, BRANDED, { hand: route.hand, seed: SEED, now: Date.now, budgetMs: 1000 });
    clearInterval(timer);
    assert.ok(ticks >= 20, `1 秒里只触发了 ${ticks} 次`);
  });

  // 用户打牌（startHand）、搜索、重放路线三处都经 openHandSession 开会话：同一个种子，搜出的路线在用户的会话里一步步走下来，终场值和搜索的一样
  for (const seed of [5, 6, 8]) {
    test(`种子 ${seed}：搜出的路线交给用户的会话逐步提交，得到同一个终场值`, async () => {
      const { hand } = deal(BRANDED, seed);
      const found = await searchHand(engine, BRANDED, { hand, seed, now: Date.now, budgetMs: SEARCH_BUDGET_MS });
      assert.equal(found.timedOut, false);
      const user = await startHand(engine, BRANDED, { id: 't', seed, now: 0 });
      for (const response of found.steps.flatMap((x) => x.do)) {
        const prompt = user.view(0).prompt;
        assert.ok(prompt, `提示没了，还有回应 ${JSON.stringify(response)}`);
        user.submit(indicesFor(prompt, response), 0);
      }
      const { settlement } = await user.end(1000, [], { status: 'none' });
      assert.equal(settlement.userValue, found.value);
    });
  }

  // 引擎洗牌看卡组的初始顺序：用户的会话、搜索、重放的卡组顺序不一样，同一个种子打出来的局面就会不一样（抽到的牌不同）。按同一个规则走一串选择，两边的局面得一样
  test('用户的会话和 openHandSession 开的会话，同一个种子按同一个规则走，局面一样', async () => {
    const codes = (zone) => zone.map((c) => c.code).sort((a, b) => a - b);
    const shape = (b) => JSON.stringify([b.hand, b.monsters, b.spellTraps, b.grave, b.banished].map(codes));
    const pick = (prompt) => (prompt.kind === 'cards' ? [...Array(prompt.min).keys()] : [Math.max(0, prompt.options.findIndex((o) => o.action !== 'end-turn' && o.action !== 'to-battle'))]);
    for (let seed = 1; seed <= 12; seed++) {
      const { hand } = deal(BRANDED, seed);
      const user = await startHand(engine, BRANDED, { id: 't', seed, now: 0 });
      const other = await openHandSession(engine, BRANDED, hand, seed);
      for (let i = 0; i < 40 && other.prompt() && !other.endBoard; i++) {
        user.submit(pick(user.view(0).prompt), 0);
        other.choose(pick(other.prompt()));
        assert.equal(shape(user.view(0).board), shape(other.board()), `种子 ${seed} 第 ${i + 1} 个选择之后`);
      }
      other.close();
      user.close();
    }
  });

  test('被叫停的搜索：等待的时间不计进用时和上限', async () => {
    const hand = deal(BRANDED, 6).hand;
    const startedAt = Date.now();
    const found = await searchHand(engine, BRANDED, { hand, seed: 6, now: Date.now, budgetMs: SEARCH_BUDGET_MS, isPaused: () => Date.now() - startedAt < 600 });
    const wall = Date.now() - startedAt;
    assert.ok(wall >= 600, String(wall));
    assert.ok(found.elapsedMs < wall - 500, `elapsedMs ${found.elapsedMs}，墙钟 ${wall}`);
    assert.equal(found.timedOut, false);
  });
});

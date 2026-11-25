import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { playRoute } from '../src/route.js';
import { boardValue, searchHand } from '../src/search.js';
import { openTestEngine } from './helpers.js';

const WHITE_ALBAZ = BRANDED.routes.find((r) => r.id === 'white-albaz');

describe('最好场面搜索：上限按节点数，结果可复现', () => {
  let engine;
  before(async () => { engine = await openTestEngine(); });

  test('场面值 = 10 × 终场在场各卡的打断数之和 + 剩余手牌数', () => {
    const board = { hand: [{ code: 1 }, { code: 2 }], monsters: [{ code: 44146295 }, { code: 95515789 }], spellTraps: [{ code: 17751597 }], grave: [], banished: [] };
    assert.equal(boardValue(BRANDED, board), 10 * 3 + 2);
  });

  test('节点数用完就停：capped 为真，节点数正好等于上限', async () => {
    const r = await searchHand(engine, BRANDED, { hand: WHITE_ALBAZ.hand, seed: 7, maxNodes: 5 });
    assert.equal(r.capped, true);
    assert.equal(r.nodes, 5);
  });

  test('同一手、同一种子、同一上限，两次搜出一样的结果（不看时间）', async () => {
    const a = await searchHand(engine, BRANDED, { hand: WHITE_ALBAZ.hand, seed: 7, maxNodes: 60 });
    const b = await searchHand(engine, BRANDED, { hand: WHITE_ALBAZ.hand, seed: 7, maxNodes: 60 });
    assert.deepEqual(a, b);
  });

  test('没有已知路线可照的起手（排序全靠默认顺序）：两次搜出一样的结果，节点数和步骤都相同', async () => {
    const hand = [19096726, 36637374, 55273560, 19304410, 48130397]; // 铁兽鸟、烙印开幕、白之圣女、炎工之姬特、超融合
    const a = await searchHand(engine, BRANDED, { hand, seed: 3456687457, maxNodes: 500 });
    const b = await searchHand(engine, BRANDED, { hand, seed: 3456687457, maxNodes: 500 });
    assert.equal(a.nodes, 500);
    assert.deepEqual(a, b);
  });

  test('起手含白之落胤时，上限给够就搜到不低于这条路线的场面值，且搜出的步骤能被 playRoute 重放出同一个终场', async () => {
    const route = await playRoute(engine, BRANDED, WHITE_ALBAZ, { seed: 7 });
    const routeValue = boardValue(BRANDED, route.endBoard);
    const r = await searchHand(engine, BRANDED, { hand: WHITE_ALBAZ.hand, seed: 7, maxNodes: 600 });
    assert.ok(r.value >= routeValue, `搜索 ${r.value} 低于路线 ${routeValue}`);
    const replay = await playRoute(engine, BRANDED, { hand: WHITE_ALBAZ.hand, steps: r.steps }, { seed: 7 });
    assert.equal(boardValue(BRANDED, replay.endBoard), r.value);
    assert.deepEqual(replay.endBoard.monsters.map((c) => c.code).sort(), r.endBoard.monsters.map((c) => c.code).sort());
  });
});

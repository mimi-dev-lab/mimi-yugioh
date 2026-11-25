import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { expand } from '../src/deck.js';
import { BRANDED } from '../src/decks/branded.js';
import { deal, handSeeds, keyCardsIn, replayRow, simulateHand } from '../src/opening-sim.js';
import { openTestEngine } from './helpers.js';

const WHITE_ALBAZ = BRANDED.routes.find((r) => r.id === 'white-albaz');
const ASH = 14558127; const G = 23434538; const FARA = 82344137;

describe('发牌：固定种子，同一个种子同一手', () => {
  test('5 张都来自主卡组，每张不超过卡组里的张数', () => {
    const copies = new Map(BRANDED.main.map((e) => [e.code, e.count]));
    for (const seed of [1, 2, 3, 4294967295]) {
      const hand = deal(BRANDED, seed);
      assert.equal(hand.length, 5);
      for (const code of new Set(hand)) assert.ok(hand.filter((c) => c === code).length <= copies.get(code));
    }
  });

  test('同一个种子发出同一手，换种子大多不同', () => {
    assert.deepEqual(deal(BRANDED, 12345), deal(BRANDED, 12345));
    const hands = new Set(Array.from({ length: 20 }, (_, i) => deal(BRANDED, i + 1).join()));
    assert.ok(hands.size >= 18, `20 个种子只发出 ${hands.size} 种起手`);
  });

  test('每手的种子由总种子派生：同一个总种子同一串，手数少的是手数多的前缀', () => {
    const a = handSeeds(20261126, 10);
    assert.equal(a.length, 10);
    assert.deepEqual(handSeeds(20261126, 4), a.slice(0, 4));
    assert.notDeepEqual(handSeeds(1, 10), a);
    assert.ok(a.every((s) => Number.isInteger(s) && s >= 0 && s < 2 ** 32));
    assert.equal(new Set(a).size, 10);
  });

  test('关键卡 = 起手速查里的那几张，按出现的卡去重', () => {
    assert.deepEqual(keyCardsIn(BRANDED, [73819701, 73819701, ASH, G, FARA]), [73819701]);
    assert.deepEqual(keyCardsIn(BRANDED, [ASH, G, FARA, ASH, ASH]), []);
    assert.equal(keyCardsIn(BRANDED, [1984618, 44362883, 62962630, 55273560, 29948294]).length, 5);
  });
});

describe('一手的模拟：搜索 + 已知路线取更好的', () => {
  let engine;
  before(async () => { engine = await openTestEngine(); });
  let ticks = 0;
  const now = () => (ticks += 7);

  test('起手是白之落胤线的牌：路线值 24（2 个打断 + 4 张手牌），最好值不低于它，记下关键卡、来源和重放用的步骤', async () => {
    const row = await simulateHand(engine, BRANDED, { index: 3, seed: 7, hand: WHITE_ALBAZ.hand, maxNodes: 600, now });
    assert.equal(row.index, 3);
    assert.equal(row.seed, 7);
    assert.deepEqual(row.hand, WHITE_ALBAZ.hand);
    assert.deepEqual(row.keys, [73819701]);
    assert.equal(row.routeValues['white-albaz'], 24);
    assert.equal(row.routeValue, 24);
    assert.equal(row.bestRoute, 'white-albaz');
    assert.ok(row.value >= 24);
    assert.equal(row.value, Math.max(row.searchValue, row.routeValue));
    assert.equal(row.value, 10 * row.interrupts + row.handLeft);
    assert.equal(row.end.hand.length, row.handLeft);
    assert.ok(['search', 'white-albaz'].includes(row.source));
    assert.equal(row.maxNodes, 600);
    assert.ok(row.nodes <= 600);
    assert.equal(row.ms, 7);
    assert.equal(row.searchReplayOk, true);
    assert.ok(row.steps.length > 0 && row.steps.every((s) => typeof s.text === 'string' && Array.isArray(s.do)));
  });

  test('全是手坑的烂手：没有一条路线走得通，最好值就是 5 张手牌，来源是搜索', async () => {
    const row = await simulateHand(engine, BRANDED, { index: 0, seed: 11, hand: [ASH, ASH, ASH, G, FARA], maxNodes: 300, now });
    assert.deepEqual(row.keys, []);
    assert.equal(row.bestRoute, null);
    assert.equal(row.routeValue, null);
    assert.ok(Object.values(row.routeValues).every((v) => v === null));
    assert.equal(row.value, 5);
    assert.equal(row.interrupts, 0);
    assert.equal(row.source, 'search');
  });

  test('记下的步骤能原样重放：打断数、剩余手牌和记录一致', async () => {
    const row = await simulateHand(engine, BRANDED, { index: 3, seed: 7, hand: WHITE_ALBAZ.hand, maxNodes: 300, now });
    const replay = await replayRow(engine, BRANDED, row);
    assert.equal(replay.value, row.searchValue);
    assert.equal(10 * replay.interrupts + replay.handLeft, row.searchValue);
  });

  test('同一手、同一种子、同一上限，结果一样（毫秒除外）', async () => {
    const run = () => simulateHand(engine, BRANDED, { index: 3, seed: 7, hand: WHITE_ALBAZ.hand, maxNodes: 200, now: () => 0 });
    assert.deepEqual(await run(), await run());
  });
});

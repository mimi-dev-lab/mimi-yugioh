import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { boardValue, curve, fieldScore, hintFactor, score, speedBonus } from '../src/scoring.js';

const board = (monsters, hand, spellTraps = []) => ({ monsters: monsters.map((code) => ({ code })), spellTraps: spellTraps.map((code) => ({ code })), hand: Array(hand).fill({ code: 0 }) });

describe('场面值', () => {
  test('10 × 在场的卡的打断数之和 + 手牌数：冰剑龙 1 次打断 + 手牌 4 = 14', () => {
    const mirrorjade = Number(Object.keys(BRANDED.cards).find((c) => BRANDED.cards[c].jp.startsWith('氷剣竜')));
    assert.equal(BRANDED.cards[mirrorjade].interrupts, 1);
    assert.equal(boardValue(BRANDED, board([mirrorjade], 4)), 14);
  });
  test('空场、手牌 5 张 = 5；手牌里的卡自己不算打断', () => {
    assert.equal(boardValue(BRANDED, board([], 5)), 5);
  });
});

describe('场面分', () => {
  test('用户 ÷ 最好，取整，封顶 100', () => {
    assert.equal(fieldScore(14, 14), 100);
    assert.equal(fieldScore(9, 10), 90);
    assert.equal(fieldScore(2, 3), 67);
    assert.equal(fieldScore(20, 10), 100);
  });
  test('最好场面值为 0 的烂手：用户也是 0 记 100', () => {
    assert.equal(fieldScore(0, 0), 100);
  });
});

describe('速度加成', () => {
  test('场面分 89 不计，90 计（90 分边界）', () => {
    assert.equal(speedBonus(30, 89), 0);
    assert.equal(speedBonus(30, 90), 20);
  });
  test('60 秒内 +20，300 秒起 0，中间线性取整', () => {
    assert.equal(speedBonus(0, 100), 20);
    assert.equal(speedBonus(60, 100), 20);
    assert.equal(speedBonus(61, 100), 20); // 20 × 239/240 = 19.9
    assert.equal(speedBonus(180, 100), 10);
    assert.equal(speedBonus(299, 100), 0); // 20 × 1/240 = 0.08
    assert.equal(speedBonus(300, 100), 0);
    assert.equal(speedBonus(900, 100), 0);
  });
});

describe('提示系数和总分', () => {
  test('0.8 的提示次数次方：1、0.8、0.64', () => {
    assert.deepEqual([0, 1, 2].map(hintFactor), [1, 0.8, 0.8 ** 2]);
  });
  test('总分 = (场面分 + 速度加成) × 提示系数，取整：提示 0/1/2 次', () => {
    const base = { userValue: 14, bestValue: 14, seconds: 60 };
    assert.equal(score({ ...base, hints: 0 }).total, 120);
    assert.equal(score({ ...base, hints: 1 }).total, 96);
    assert.equal(score({ ...base, hints: 2 }).total, 77); // 120 × 0.64 = 76.8
  });
  test('场面分不到 90：速度加成不计，写明没计', () => {
    const r = score({ userValue: 5, bestValue: 14, seconds: 10, hints: 0 });
    assert.deepEqual([r.fieldScore, r.speedBonus, r.speedCounted, r.total], [36, 0, false, 36]);
  });
  test('烂手最好值 0、用户 0、慢到 300 秒：总分 100', () => {
    const r = score({ userValue: 0, bestValue: 0, seconds: 300, hints: 0 });
    assert.deepEqual([r.fieldScore, r.speedBonus, r.total], [100, 0, 100]);
  });
});

test('每一步之后的场面：每步的场面值 ÷ 最好', () => {
  assert.deepEqual(curve(BRANDED, [board([], 5), board([], 4), board([], 3)], 10), [0.5, 0.4, 0.3]);
  assert.deepEqual(curve(BRANDED, [board([], 5)], 0), [1]);
});

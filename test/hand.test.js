import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { classifyHand, expand } from '../src/deck.js';
import { deal, handKey, rngFrom } from '../src/hand.js';
import { startsStep } from '../src/route.js';

describe('发牌', () => {
  test('同一个种子同一手，起手是主卡组里的 5 张', () => {
    const a = deal(BRANDED, 37);
    assert.deepEqual(deal(BRANDED, 37), a);
    assert.equal(a.hand.length, 5);
    const rest = expand(BRANDED.main);
    for (const code of a.hand) rest.splice(rest.indexOf(code), 1); // 每张都在主卡组里（抽不到就是 -1，splice 会多删一张，张数对不上）
    assert.equal(rest.length, 35);
  });
  test('固定例子：种子 37 含白之落胤，种子 1 是烂手，种子 26 含烙印融合', () => {
    assert.equal(classifyHand(BRANDED, deal(BRANDED, 37).hand), 'white-albaz');
    assert.equal(classifyHand(BRANDED, deal(BRANDED, 1).hand), 'brick');
    assert.equal(classifyHand(BRANDED, deal(BRANDED, 26).hand), 'branded-fusion');
  });
  test('随机源均匀：5000 个种子里白之落胤（2 张）入手的比例接近 1 − C(38,5)/C(40,5) ≈ 23.7%', () => {
    let n = 0;
    for (let s = 0; s < 5000; s++) if (deal(BRANDED, s).hand.includes(73819701)) n++;
    assert.ok(Math.abs(n / 5000 - 0.237) < 0.03, String(n / 5000));
  });
  test('rngFrom 同种子同序列，值在 [0,1)', () => {
    const a = rngFrom(9); const b = rngFrom(9);
    for (let i = 0; i < 20; i++) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1); }
  });
  test('handKey 与顺序无关', () => assert.equal(handKey([3, 1, 2]), handKey([2, 3, 1])));
});

describe('一步怎么切', () => {
  const chain = { kind: 'chain', options: [{ action: 'chain' }, { action: 'pass' }] };
  test('主阶段的命令和连锁窗口里发动一个效果开新的一步；放行、选卡、选格子不开', () => {
    assert.equal(startsStep({ kind: 'idle', options: [{ action: 'summon' }] }, [0]), true);
    assert.equal(startsStep(chain, [0]), true);
    assert.equal(startsStep(chain, [1]), false);
    assert.equal(startsStep({ kind: 'cards', options: [{}] }, [0]), false);
    assert.equal(startsStep({ kind: 'place', options: [{}] }, [0]), false);
  });
});

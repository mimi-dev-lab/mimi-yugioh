import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stepLedger } from '../src/ledger.js';

const md = (code) => ({ 1: '白之落胤', 2: '艾克利西亚', 3: '烙印龙 阿尔比昂', 4: '灰流丽' }[code]);
const board = (o = {}) => ({ hand: [], monsters: [], spellTraps: [], grave: [], banished: [], extra: [], deck: 30, ...o });
const c = (...codes) => codes.map((code) => ({ code }));

test('白之落胤从手牌特召：手牌少一张（花了），额外少一只、场上多一只、墓地多一只（换来）', () => {
  const before = board({ hand: c(1, 4), extra: c(3, 3) });
  const after = board({ hand: c(4), monsters: c(1), grave: c(3), extra: c(3) });
  assert.deepEqual(stepLedger(before, after, md), {
    spent: '手牌 −1（白之落胤），额外 −1（烙印龙 阿尔比昂）',
    gained: '场上 +1（白之落胤），墓地 +1（烙印龙 阿尔比昂）',
  });
});

test('检索：卡组少一张、手牌多一张', () => {
  const r = stepLedger(board({ deck: 30 }), board({ deck: 29, hand: c(1) }), md);
  assert.deepEqual(r, { spent: '卡组 −1', gained: '手牌 +1（白之落胤）' });
});

test('三张以上只写张数，不列名字', () => {
  const r = stepLedger(board({ hand: c(1, 2, 4) }), board({ grave: c(1, 2, 4) }), md);
  assert.equal(r.spent, '手牌 −3');
  assert.equal(r.gained, '墓地 +3');
});

test('场上换位（怪兽区到魔陷区）或什么都没变：写「无」', () => {
  assert.deepEqual(stepLedger(board({ monsters: c(1) }), board({ spellTraps: c(1) }), md), { spent: '无', gained: '无' });
  assert.deepEqual(stepLedger(board(), board(), md), { spent: '无', gained: '无' });
});

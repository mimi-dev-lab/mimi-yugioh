import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { checkLookup } from '../src/lookup.js';

const clone = () => structuredClone(BRANDED);
const ALBAZ = 73819701; const ALUBER = 62962630;

describe('起手速查数据检查', () => {
  test('烙印的速查没有问题', () => {
    assert.deepEqual(checkLookup(BRANDED), []);
  });

  test('指向不存在的路线是错误（关键卡的路线和缺卡改走的路线都查）', () => {
    const a = clone();
    a.lookup[0].routes[0].route = 'no-such-route';
    assert.deepEqual(checkLookup(a).map((p) => p.includes('no-such-route')), [true]);
    const b = clone();
    b.lookup[1].fallbacks[0].route = 'also-missing';
    assert.ok(checkLookup(b).some((p) => p.includes('also-missing')));
  });

  test('关键卡、搭的卡、手里有的卡不在被指向路线的起手里是错误；缺的卡在起手里也是错误', () => {
    const a = clone();
    a.lookup[0].routes[0].route = 'branded-fusion'; // 白之落胤不在烙印融合线的起手里
    assert.ok(checkLookup(a).some((p) => p.includes('起手里没有')));
    const b = clone();
    b.lookup[1].fallbacks[0].have = [ALBAZ]; // 阿卢绯尔线的起手里没有白之落胤
    assert.ok(checkLookup(b).some((p) => p.includes('起手里没有')));
    const c = clone();
    c.lookup[1].fallbacks[0].lack = ALUBER; // 缺阿卢绯尔，却指向以阿卢绯尔起手的线
    assert.ok(checkLookup(c).some((p) => p.includes('起手里有')));
  });

  test('卡不在卡表里、没写为什么、关键卡写两次，都是错误', () => {
    const a = clone();
    a.lookup[0].fallbacks[0].have = [123];
    assert.ok(checkLookup(a).some((p) => p.includes('123')));
    const b = clone();
    b.lookup[0].fallbacks[0].how = ' ';
    assert.ok(checkLookup(b).some((p) => p.includes('为什么')));
    const c = clone();
    c.lookup.push(structuredClone(c.lookup[1]));
    assert.ok(checkLookup(c).some((p) => p.includes('写了两次')));
  });
});

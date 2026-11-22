import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openEngineFiles } from '../src/engine-files.js';
import { BANLIST_DATE, maxCopies } from '../src/banlist.js';
import { BRANDED } from '../src/decks/branded.js';
import { checkDeck, classifyHand, expand } from '../src/deck.js';
import { ENGINE_DIR } from './helpers.js';

const ALBAZ = 73819701; const FUSION = 44362883; const ALUBER = 62962630; const ASH = 14558127; const LOCK_BIRD = 94145021;
const SUPER_POLY = 48130397; const MAXX_C = 23434538; const FUWALOS = 42141493; const ALBAZ_PLAIN = 68468459; const SARCOPHAGUS = 75500286;
const clone = () => structuredClone(BRANDED);

describe('烙印卡组数据', () => {
  test('主卡组 40 张、额外卡组 15 张，数据完整，张数符合 2026-11-05 禁限表', () => {
    assert.equal(expand(BRANDED.main).length, 40);
    assert.equal(expand(BRANDED.extra).length, 15);
    assert.equal(BANLIST_DATE, '2026-11-05');
    assert.deepEqual(checkDeck(BRANDED), []);
  });

  test('每张卡都有简中名、日文名、角色、三件事、打断数', () => {
    for (const [code, card] of Object.entries(BRANDED.cards)) {
      for (const key of ['jp', 'md', 'does', 'cost', 'limit']) assert.ok(card[key]?.trim(), `${code} 缺 ${key}`);
      assert.ok(BRANDED.roles.includes(card.role), `${code} 角色 ${card.role}`);
      assert.ok(Number.isInteger(card.interrupts) && card.interrupts >= 0, `${code} 打断数`);
    }
  });

  test('卡表里的每个密码在引擎卡库里都有', () => {
    const files = openEngineFiles(ENGINE_DIR);
    for (const code of Object.keys(BRANDED.cards)) assert.ok(files.cardReader(Number(code)), `${code} ${BRANDED.cards[code].jp} 不在引擎卡库里`);
    files.close();
  });

  test('「库妸㽗」按 ygocdb 的字符写：U+5E93 U+59B8 U+3F57', () => {
    const quem = BRANDED.cards[45883110].md;
    assert.deepEqual([...quem.split(' ')[1]].map((c) => c.codePointAt(0).toString(16)), ['5e93', '59b8', '3f57']);
    assert.equal(quem, '引导之圣女 库妸㽗');
  });

  test('禁限表：烙印融合限 1、The Fallen ＆ The Virtuous 准限 2，没写的 3 张', () => {
    assert.equal(maxCopies(FUSION), 1);
    assert.equal(maxCopies(30271097), 2);
    assert.equal(maxCopies(ALBAZ), 3);
  });

  test('检查会抓出问题：烙印融合 2 张、少一张主卡、缺简中名、角色不在表里、打断数不是整数', () => {
    const over = clone(); over.main.find((e) => e.code === FUSION).count = 2; over.main.find((e) => e.code === ASH).count = 1;
    assert.match(checkDeck(over).join('\n'), /烙印融合.*2 张，禁限表上限 1/);
    assert.match(checkDeck(over).join('\n'), /主卡组 39 张/);
    const noName = clone(); noName.cards[ALBAZ].md = '';
    assert.match(checkDeck(noName).join('\n'), /白き竜の落胤 缺 md/);
    const badRole = clone(); badRole.cards[ALBAZ].role = '乱写';
    assert.match(checkDeck(badRole).join('\n'), /角色 乱写/);
    const badInterrupts = clone(); badInterrupts.cards[ALBAZ].interrupts = '1';
    assert.match(checkDeck(badInterrupts).join('\n'), /打断数/);
    const missing = clone(); delete missing.cards[ALBAZ];
    assert.match(checkDeck(missing).join('\n'), /不在卡表里/);
  });

  test('路线的起手都在主卡组里，必要卡在起手里，起手 5 张', () => {
    const main = expand(BRANDED.main);
    for (const route of BRANDED.routes) {
      assert.equal(route.hand.length, 5);
      assert.ok(route.hand.includes(route.needs));
      for (const code of route.hand) assert.ok(main.includes(code));
    }
  });
});

describe('起手分类', () => {
  const hand = (...codes) => codes;
  test('含白之落胤 → 白之落胤 1 卡初动', () => {
    assert.equal(classifyHand(BRANDED, hand(ALBAZ, ASH, LOCK_BIRD, SUPER_POLY, SARCOPHAGUS)), 'white-albaz');
  });
  test('含烙印融合 → 烙印融合 1 卡初动', () => {
    assert.equal(classifyHand(BRANDED, hand(FUSION, ASH, LOCK_BIRD, SUPER_POLY, SARCOPHAGUS)), 'branded-fusion');
  });
  test('同时有白之落胤和烙印融合，白之落胤优先', () => {
    assert.equal(classifyHand(BRANDED, hand(FUSION, ALBAZ, ASH, LOCK_BIRD, SUPER_POLY)), 'white-albaz');
  });
  test('只有别的起手卡（阿卢绯尔、阿尔白斯之落胤）→ 其他', () => {
    assert.equal(classifyHand(BRANDED, hand(ALUBER, ASH, LOCK_BIRD, SUPER_POLY, SARCOPHAGUS)), 'other');
    assert.equal(classifyHand(BRANDED, hand(ALBAZ_PLAIN, ASH, ASH, MAXX_C, FUWALOS)), 'other');
  });
  test('一张起手卡都没有（手坑、超融合、黄金柜）→ 烂手', () => {
    assert.equal(classifyHand(BRANDED, hand(ASH, ASH, MAXX_C, LOCK_BIRD, FUWALOS)), 'brick');
    assert.equal(classifyHand(BRANDED, hand(SUPER_POLY, SUPER_POLY, SARCOPHAGUS, ASH, LOCK_BIRD)), 'brick');
  });
});

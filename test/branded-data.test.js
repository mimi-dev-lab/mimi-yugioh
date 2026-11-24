import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openEngineFiles } from '../src/engine-files.js';
import { BANLIST_DATE, maxCopies } from '../src/banlist.js';
import { BRANDED } from '../src/decks/branded.js';
import { checkDeck, expand } from '../src/deck.js';
import { checkLookup } from '../src/lookup.js';
import { ENGINE_DIR } from './helpers.js';

const ALBAZ = 73819701; const FUSION = 44362883; const ASH = 14558127; const MIRRORJADE = 44146295;
const clone = () => structuredClone(BRANDED);

describe('烙印卡组数据', () => {
  test('主卡组 40 张、额外卡组 15 张，数据完整，张数符合 2026-11-05 禁限表', () => {
    assert.equal(expand(BRANDED.main).length, 40);
    assert.equal(expand(BRANDED.extra).length, 15);
    assert.equal(BANLIST_DATE, '2026-11-05');
    assert.deepEqual(checkDeck(BRANDED), []);
    assert.deepEqual(checkLookup(BRANDED), []);
  });

  test('每张卡都有简中名、日文名、作用、三件事、打断数；有打断的写了怎么打断，没有的留空', () => {
    assert.deepEqual(BRANDED.roles.map((r) => r.name), ['启动', '检索', '融合素材', '终场', '手坑']);
    for (const r of BRANDED.roles) assert.ok(r.note?.trim(), `${r.name} 缺含义`);
    for (const [code, card] of Object.entries(BRANDED.cards)) {
      for (const key of ['jp', 'md', 'does', 'cost', 'limit']) assert.ok(card[key]?.trim(), `${code} 缺 ${key}`);
      assert.ok(BRANDED.roles.some((r) => r.name === card.role), `${code} 作用 ${card.role}`);
      assert.ok(Number.isInteger(card.interrupts) && card.interrupts >= 0, `${code} 打断数`);
      assert.equal(card.interrupts > 0, card.interruptHow.trim() !== '', `${code} 打断数和怎么打断`);
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

  test('检查会抓出问题：烙印融合 2 张、少一张主卡、缺简中名、作用不在表里、打断数不是整数、打断数和怎么打断对不上', () => {
    const over = clone(); over.main.find((e) => e.code === FUSION).count = 2; over.main.find((e) => e.code === ASH).count = 1;
    assert.match(checkDeck(over).join('\n'), /烙印融合.*2 张，禁限表上限 1/);
    assert.match(checkDeck(over).join('\n'), /主卡组 39 张/);
    const noName = clone(); noName.cards[ALBAZ].md = '';
    assert.match(checkDeck(noName).join('\n'), /白き竜の落胤 缺 md/);
    const badRole = clone(); badRole.cards[ALBAZ].role = '乱写';
    assert.match(checkDeck(badRole).join('\n'), /作用 乱写/);
    const badInterrupts = clone(); badInterrupts.cards[ALBAZ].interrupts = '1';
    assert.match(checkDeck(badInterrupts).join('\n'), /打断数/);
    const noHow = clone(); noHow.cards[MIRRORJADE].interruptHow = '';
    assert.match(checkDeck(noHow).join('\n'), /氷剣竜ミラジェイド.*打断数 1 和「对手回合怎么打断」对不上/);
    const strayHow = clone(); strayHow.cards[ALBAZ].interruptHow = '乱写';
    assert.match(checkDeck(strayHow).join('\n'), /白き竜の落胤.*打断数 0 和「对手回合怎么打断」对不上/);
    const missing = clone(); delete missing.cards[ALBAZ];
    assert.match(checkDeck(missing).join('\n'), /不在卡表里/);
  });

  test('终场里的卡和超融合、卡尔塔西亚能在对手回合打断，落胤与圣女留到对手回合发动；阿尔白斯之落胤自己不打断', () => {
    const c = BRANDED.cards;
    assert.deepEqual([c[30271097].role, c[30271097].interrupts], ['终场', 1]);
    assert.match(c[30271097].interruptHow, /盖着留到对手回合/);
    assert.deepEqual([c[48130397].role, c[48130397].interrupts], ['融合素材', 1]);
    assert.match(c[48130397].interruptHow, /盖着留到对手回合/);
    assert.equal(c[95515789].interrupts, 1);
    assert.match(c[95515789].interruptHow, /对手回合/);
    assert.doesNotMatch(c[68468459].limit, /打断/);
  });

  test('效果说明里的名字和 md 名一致：没有「阿不思」「艾克莉西娅」', () => {
    for (const [code, card] of Object.entries(BRANDED.cards)) for (const key of ['does', 'cost', 'limit', 'interruptHow']) assert.doesNotMatch(card[key], /阿不思|艾克莉西娅/, `${code} 的 ${key}`);
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

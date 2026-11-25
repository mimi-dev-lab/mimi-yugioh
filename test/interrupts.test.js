import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { checkDeck } from '../src/deck.js';
import { checkInterruptFields, countInterrupts } from '../src/interrupts.js';

const ID = {
  mercurier: 19096726, superPoly: 48130397, retribution: 17751597, mirrorjade: 44146295, fallen: 30271097, cartesia: 95515789,
  rindbrumm: 51409648, swordsoul: 74405783, albion: 87746184, sanctifire: 38811586, granguignol: 24915933, garura: 11765832,
  dorogon: 54757758, ecclesiaDark: 78397661, albaz: 68468459, blackAlbion: 25451383, ash: 14558127, droll: 94145021,
};
// 编的终场：只写用到的区域，每张卡一个新对象（同一张卡的两张是两个对象）
const board = ({ hand = [], monsters = [], spellTraps = [], grave = [], extra = [] } = {}) => {
  const cards = (codes) => codes.map((code, sequence) => ({ code, sequence }));
  return { hand: cards(hand), monsters: cards(monsters), spellTraps: cards(spellTraps), grave: cards(grave), banished: [], extra: cards(extra) };
};
const total = (b) => countInterrupts(BRANDED, b).total;

describe('终场打断数按卡片条件算', () => {
  test('第一版的反例（种子 3852336396 的终场）：铁兽鸟在场、没有融合怪兽，盖两张超融合、剩两张手牌 → 2，不是 3', () => {
    assert.equal(total(board({ monsters: [ID.mercurier], spellTraps: [ID.superPoly, ID.superPoly], hand: [ID.ash, ID.droll] })), 2);
  });

  test('铁兽鸟 墨丘利耶：场上有以阿尔白斯之落胤为素材的融合怪兽才算；在手牌、在场上都算', () => {
    assert.equal(total(board({ monsters: [ID.mercurier] })), 0);
    assert.equal(total(board({ hand: [ID.mercurier] })), 0);
    assert.equal(total(board({ hand: [ID.mercurier], monsters: [ID.granguignol] })), 0); // 赫焉龙不以阿尔白斯之落胤为素材
    assert.equal(total(board({ hand: [ID.mercurier], monsters: [ID.albion] })), 1);
    assert.equal(total(board({ monsters: [ID.mercurier, ID.albion] })), 1);
    assert.equal(total(board({ hand: [ID.mercurier], grave: [ID.albion, ID.albion] })), 0); // 只看场上
  });

  test('超融合：每张要弃一张手牌，算的张数 = min(盖放张数, 终场手牌数)', () => {
    assert.equal(total(board({ spellTraps: [ID.superPoly, ID.superPoly] })), 0);
    assert.equal(total(board({ spellTraps: [ID.superPoly, ID.superPoly], hand: [ID.ash] })), 1);
    assert.equal(total(board({ spellTraps: [ID.superPoly, ID.superPoly], hand: [ID.ash, ID.droll, ID.ash] })), 2);
    assert.equal(total(board({ hand: [ID.superPoly, ID.ash] })), 0); // 在手牌里不算
  });

  test('手牌发动的铁兽鸟占掉自己那张，不能再拿去给超融合弃', () => {
    assert.equal(total(board({ hand: [ID.mercurier], monsters: [ID.albion], spellTraps: [ID.superPoly] })), 1);
    assert.equal(total(board({ hand: [ID.mercurier, ID.ash], monsters: [ID.albion], spellTraps: [ID.superPoly] })), 2);
    // 前提不满足的铁兽鸟只是一张普通手牌，可以弃
    assert.equal(total(board({ hand: [ID.mercurier], spellTraps: [ID.superPoly] })), 1);
  });

  test('烙印断罪：场上一只或墓地两只以阿尔白斯之落胤为素材的融合怪兽才算', () => {
    assert.equal(total(board({ spellTraps: [ID.retribution] })), 0);
    assert.equal(total(board({ spellTraps: [ID.retribution], monsters: [ID.granguignol] })), 0);
    assert.equal(total(board({ spellTraps: [ID.retribution], grave: [ID.albion] })), 0);
    assert.equal(total(board({ spellTraps: [ID.retribution], monsters: [ID.albion] })), 1);
    assert.equal(total(board({ spellTraps: [ID.retribution], grave: [ID.albion, ID.sanctifire] })), 1);
  });

  test('冰剑龙 镜翠幻种：额外卡组要还有以阿尔白斯之落胤为素材的融合怪兽可送', () => {
    assert.equal(total(board({ monsters: [ID.mirrorjade] })), 0);
    assert.equal(total(board({ monsters: [ID.mirrorjade], extra: [ID.granguignol, ID.garura] })), 0);
    assert.equal(total(board({ monsters: [ID.mirrorjade], extra: [ID.albion] })), 1);
  });

  test('落胤与圣女：额外卡组要有记述阿尔白斯之落胤的怪兽可送；同名卡每回合只能发动 1 张', () => {
    assert.equal(total(board({ spellTraps: [ID.fallen], extra: [ID.granguignol] })), 0);
    assert.equal(total(board({ spellTraps: [ID.fallen], extra: [ID.ecclesiaDark] })), 1);
    assert.equal(total(board({ spellTraps: [ID.fallen, ID.fallen], extra: [ID.ecclesiaDark, ID.albion] })), 1);
  });

  test('冰剑龙和落胤与圣女抢额外卡组的卡：符合的少的先付，各挑标签最少的', () => {
    // 额外卡组只剩一只阿尔比昂：只够付一个
    assert.equal(total(board({ monsters: [ID.mirrorjade], spellTraps: [ID.fallen], extra: [ID.albion] })), 1);
    // 阿尔比昂给冰剑龙，黑衣龙之艾克利西亚给落胤与圣女
    assert.equal(total(board({ monsters: [ID.mirrorjade], spellTraps: [ID.fallen], extra: [ID.albion, ID.ecclesiaDark] })), 2);
    assert.equal(total(board({ monsters: [ID.mirrorjade], spellTraps: [ID.fallen], extra: [ID.ecclesiaDark, ID.albion] })), 2);
  });

  test('赫之圣女 卡尔塔西亚：要凑得出 8 星以上的融合（赫焉龙 = 她 + 光暗怪兽；烙印龙/真炎龙 = 阿尔白斯之落胤 + 她）；同名每回合 1 次', () => {
    assert.equal(total(board({ monsters: [ID.cartesia] })), 0);
    assert.equal(total(board({ monsters: [ID.cartesia], extra: [ID.granguignol] })), 0); // 没有另一只光暗怪兽
    assert.equal(total(board({ monsters: [ID.cartesia], hand: [ID.ash], extra: [ID.granguignol] })), 0); // 灰流丽是炎属性
    assert.equal(total(board({ monsters: [ID.cartesia], hand: [ID.mercurier], extra: [ID.granguignol] })), 1);
    assert.equal(total(board({ monsters: [ID.cartesia, ID.dorogon], extra: [ID.granguignol] })), 0); // 沼地泥龙是水属性
    assert.equal(total(board({ monsters: [ID.cartesia], hand: [ID.albaz], extra: [ID.albion] })), 1);
    assert.equal(total(board({ monsters: [ID.cartesia], hand: [ID.blackAlbion], extra: [ID.sanctifire] })), 0); // 黑衣龙在手牌不算阿尔白斯之落胤
    assert.equal(total(board({ monsters: [ID.cartesia, ID.blackAlbion], extra: [ID.sanctifire] })), 1);
    assert.equal(total(board({ monsters: [ID.cartesia, ID.cartesia], extra: [ID.granguignol] })), 1); // 两张互为光暗素材，但效果同名每回合 1 次
  });

  test('击铁龙 猎宝机装、三英的相剑师：原文没有额外前提，在场就算', () => {
    assert.equal(total(board({ monsters: [ID.rindbrumm, ID.swordsoul] })), 2);
  });

  test('breakers：每张卡算进去几张、几个打断，按场上先后', () => {
    const b = countInterrupts(BRANDED, board({ monsters: [ID.albion], spellTraps: [ID.superPoly, ID.superPoly, ID.retribution], hand: [ID.mercurier, ID.ash] }));
    assert.deepEqual(b.breakers, [{ code: ID.superPoly, copies: 1, interrupts: 1 }, { code: ID.retribution, copies: 1, interrupts: 1 }, { code: ID.mercurier, copies: 1, interrupts: 1 }]);
    assert.equal(b.total, 3);
  });
});

describe('卡组数据里的打断字段', () => {
  test('烙印的数据写法都对', () => {
    assert.deepEqual(checkInterruptFields(BRANDED), []);
  });

  test('写错的字段被 checkDeck 查出来', () => {
    const bad = (edit) => { const d = structuredClone(BRANDED); edit(d.cards); return checkDeck(d).join('\n'); };
    assert.match(bad((c) => { c[ID.mercurier].needs = { field: 'noSuchTag' }; }), /noSuchTag/);
    assert.match(bad((c) => { c[ID.mercurier].needs = { board: 'albazFusion' }; }), /不认识的键 board/);
    assert.match(bad((c) => { c[ID.superPoly].pay = { discard: 0 }; }), /弃牌张数/);
    assert.match(bad((c) => { c[ID.superPoly].pay = { banish: 1 }; }), /pay 只能是/);
    assert.match(bad((c) => { c[ID.mercurier].from = ['grave']; }), /from 只能是/);
    assert.match(bad((c) => { c[ID.ash].perTurn = 1; }), /打断数是 0，不该写打断条件/);
    assert.match(bad((c) => { c[ID.fallen].pay = { extra: { of: 'mentionsAlbaz', n: 0 } }; }), /张数 0/);
  });
});

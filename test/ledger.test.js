import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkDeck } from '../src/deck.js';
import { BRANDED } from '../src/decks/branded.js';
import { FEATURE_NAMES, featuresFrom } from '../src/features.js';
import { descriptionOf, effectIndexOf } from '../src/interrupts.js';
import { buildLedger, checkLedger, effectOf } from '../src/ledger.js';

describe('账本数据和开关（纯函数）', () => {
  test('烙印的账本数据没有问题，卡组检查也带上它；查得出重复、缺 label、卡不在卡表里', () => {
    assert.deepEqual(checkLedger(BRANDED), []);
    const bad = structuredClone(BRANDED);
    bad.ledger.oncePerTurn.push({ ...bad.ledger.oncePerTurn[0] });
    bad.ledger.oncePerTurn.push({ code: 1, n: 0, label: 'x', gist: '' });
    const problems = checkDeck(bad).join('\n');
    assert.match(problems, /重复/);
    assert.match(problems, /缺 label/);
    assert.match(problems, /不在卡表里/);
  });

  test('认得出引擎的一次发动：描述号低位 n，同一个 n 两个效果靠发动时的区分开', () => {
    const saint = 55273560;
    assert.equal(effectOf(BRANDED, { code: saint, description: descriptionOf(saint, 1), zone: 'monsters' }).label, '②');
    assert.equal(effectOf(BRANDED, { code: saint, description: descriptionOf(saint, 1), zone: 'grave' }).label, '③');
    assert.equal(effectOf(BRANDED, { code: 44362883, description: '1170', zone: 'spellTraps' }).label, '①');
    assert.equal(effectOf(BRANDED, { code: saint, description: descriptionOf(saint, 9), zone: 'grave' }), undefined);
  });

  test('开关：默认全开，关掉的名字是 false，拼错的名字抛错', () => {
    assert.ok(FEATURE_NAMES.every((n) => featuresFrom()[n] === true));
    assert.equal(featuresFrom(['ledger']).ledger, false);
    assert.equal(featuresFrom(['ledger']).tree, true);
    assert.throws(() => featuresFrom(['legder']), /没有这个功能开关/);
  });
});

describe('效果描述号的编码和解码（一处）', () => {
  test('descriptionOf(code, n) 是引擎报的描述号字串，effectIndexOf 取回 n；系统字串（如 1170）原样是 n', () => {
    assert.equal(descriptionOf(55273560, 1), '57958528450561');
    assert.equal(effectIndexOf(descriptionOf(55273560, 1)), 1);
    assert.equal(effectIndexOf('1170'), 1170);
  });
});

describe('buildLedger：这一步之前用过的和这一步新用的分两组', () => {
  const card = 55273560;
  const deck = { cards: { [card]: { jp: 'j', md: 'm', interrupts: 0 } }, extra: [], ledger: { oncePerTurn: [{ code: card, n: 0, label: '①', gist: 'a' }, { code: card, n: 1, label: '②', gist: 'b' }] } };
  const board = { extra: [], hand: [], monsters: [], spellTraps: [], grave: [], banished: [] };
  const act = (n, zone = 'hand') => ({ code: card, description: descriptionOf(card, n), zone });
  const run = (stepActivations) => buildLedger(deck, { startBoard: board, stepBoards: stepActivations.map(() => board), stepActivations, stepNormalSummon: stepActivations.map(() => false) });
  const names = (list) => list.map((e) => e.label);

  test('before = 前面步骤用过的，now = 这一步新用的；同一个效果再发动不重复列', () => {
    const l = run([[act(0)], [act(0), act(1)], []]);
    assert.deepEqual([names(l[0].effects.before), names(l[0].effects.now)], [[], ['①']]);
    assert.deepEqual([names(l[1].effects.before), names(l[1].effects.now)], [['①'], ['②']]);
    assert.deepEqual([names(l[2].effects.before), names(l[2].effects.now)], [['①', '②'], []]);
    assert.deepEqual(l[2].effects.before.map((e) => e.step), [1, 2]);
    assert.ok(l[1].effects.now.every((e) => e.fresh === undefined));
  });

  test('发动了表里没有的效果：报错说清是哪张卡哪一步，不悄悄丢掉', () => {
    assert.throws(() => run([[act(0)], [act(7)]]), /表里没有.*55273560.*第 2 步/);
  });
});

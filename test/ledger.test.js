import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkDeck } from '../src/deck.js';
import { BRANDED } from '../src/decks/branded.js';
import { FEATURE_NAMES, featuresFrom } from '../src/features.js';
import { checkLedger, effectOf } from '../src/ledger.js';

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
    assert.equal(effectOf(BRANDED, { code: saint, description: String(saint * 2 ** 20 + 1), zone: 'monsters' }).label, '②');
    assert.equal(effectOf(BRANDED, { code: saint, description: String(saint * 2 ** 20 + 1), zone: 'grave' }).label, '③');
    assert.equal(effectOf(BRANDED, { code: 44362883, description: '1170', zone: 'spellTraps' }).label, '①');
    assert.equal(effectOf(BRANDED, { code: saint, description: String(saint * 2 ** 20 + 9), zone: 'grave' }), undefined);
  });

  test('开关：默认全开，关掉的名字是 false，拼错的名字抛错', () => {
    assert.ok(FEATURE_NAMES.every((n) => featuresFrom()[n] === true));
    assert.equal(featuresFrom(['ledger']).ledger, false);
    assert.equal(featuresFrom(['ledger']).tree, true);
    assert.throws(() => featuresFrom(['legder']), /没有这个功能开关/);
  });
});

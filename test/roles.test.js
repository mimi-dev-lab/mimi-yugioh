import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkDeck } from '../src/deck.js';
import { checkRoleTags, defaultRoleOf, resolveRoles } from '../src/roles.js';
import { BRANDED } from '../src/decks/branded.js';

describe('作用数据的检查（纯函数，不起服务）', () => {
  test('烙印的作用数据没有问题，卡组检查也带上它', () => {
    assert.deepEqual(checkRoleTags(BRANDED), []);
    const bad = structuredClone(BRANDED);
    bad.roleTags.defaults[73819701].tags = ['瞎写'];
    assert.match(checkDeck(bad).join('\n'), /瞎写 不在术语表里/);
  });

  test('查得出：作用词不在术语表、缺默认作用、原因太短、原因重复、步号越界', () => {
    const bad = structuredClone(BRANDED);
    bad.roleTags.defaults[73819701].tags = ['瞎写'];
    delete bad.roleTags.defaults[62962630];
    bad.roleTags.routes['white-albaz'][1][73819701].why = '太短';
    bad.roleTags.routes['white-albaz'][2][55273560].why = bad.roleTags.routes['white-albaz'][1][Object.keys(bad.roleTags.routes['white-albaz'][1])[0]].why;
    bad.roleTags.routes['white-albaz'][99] = { 55273560: { tags: ['素材'], why: '这一步不存在的步号' } };
    const problems = checkRoleTags(bad).join('\n');
    assert.match(problems, /瞎写 不在术语表里/);
    assert.match(problems, /缺默认作用/);
    assert.match(problems, /缺原因/);
    assert.match(problems, /一字不差/);
    assert.match(problems, /没有第 99 步/);
  });

  test('默认作用的原因也不许重复：和别的默认、和某一步的覆盖一字不差都查得出', () => {
    const sameDefault = structuredClone(BRANDED);
    sameDefault.roleTags.defaults[62962630].why = sameDefault.roleTags.defaults[73819701].why;
    assert.match(checkRoleTags(sameDefault).join('\n'), /一字不差/);
    const sameAsStep = structuredClone(BRANDED);
    sameAsStep.roleTags.routes['white-albaz'][1][73819701].why = sameAsStep.roleTags.defaults[62962630].why;
    assert.match(checkRoleTags(sameAsStep).join('\n'), /一字不差/);
  });

  test('不同路线走同一步棋，原因可以一字不差', () => {
    const shared = structuredClone(BRANDED);
    shared.roleTags.routes['white-albaz'][2][55273560].why = shared.roleTags.routes.aluber[10][55273560].why;
    assert.deepEqual(checkRoleTags(shared), []);
  });

  test('每条路线都有作用数据', () => {
    assert.deepEqual(Object.keys(BRANDED.roleTags.routes).sort(), BRANDED.routes.map((r) => r.id).sort());
  });

  test('resolveRoles：这一步写了的用这一步的，没写的沿用最近写的并带 since，中途离场再回来回到默认', () => {
    const [code] = Object.keys(BRANDED.roleTags.routes['white-albaz'][1]).map(Number);
    const deck = structuredClone(BRANDED);
    deck.roleTags.routes = { x: { 1: { [code]: { tags: ['素材'], why: '第一步写的原因，只有测试里有' } } } };
    const [a, b, c, d] = resolveRoles(deck, 'x', [[code], [code], [], [code]]).map((step) => step[0]);
    assert.deepEqual([a.from, b.from, b.since, b.tags], ['step', 'carried', 1, ['素材']]);
    assert.equal(c, undefined);
    assert.deepEqual([d.from, d.tags], ['default', defaultRoleOf(deck, code).tags]);
  });
});

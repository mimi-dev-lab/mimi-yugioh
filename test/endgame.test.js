import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { checkDeck } from '../src/deck.js';
import { buildEndgames, checkEndgames, endHas, rankEndgames } from '../src/endgame.js';

const clone = () => structuredClone(BRANDED);

describe('终场目标数据的检查（纯函数，不起服务）', () => {
  test('烙印的终场目标没有问题，卡组检查也带上它；2–3 个', () => {
    assert.deepEqual(checkEndgames(BRANDED), []);
    assert.ok(BRANDED.endgames.list.length >= 2 && BRANDED.endgames.list.length <= 3);
    const bad = clone(); bad.endgames.list[0].route = 'nope';
    assert.match(checkDeck(bad).join('\n'), /不存在的路线 nope/);
  });

  test('终场目标引用的积木、路线都存在，积木和那条路线的分段一致', () => {
    for (const e of BRANDED.endgames.list) {
      assert.ok(BRANDED.routes.some((r) => r.id === e.route), `${e.id} 的路线 ${e.route}`);
      for (const b of e.blocks) assert.ok(BRANDED.blocks.list.some((x) => x.id === b), `${e.id} 的积木 ${b}`);
      assert.deepEqual(BRANDED.blocks.segments[e.route].map((s) => s.block), e.blocks, `${e.id} 的积木按路线分段的先后`);
    }
  });

  test('查得出：路线不存在、积木不存在、积木和路线分段不一致、没写积木 / 关键卡、关键卡不提供打断、id 或名字重复、个数不对', () => {
    const t = (edit) => { const d = clone(); edit(d.endgames.list); return checkEndgames(d).join('\n'); };
    assert.match(t((l) => { l[0].route = 'nope'; }), /不存在的路线 nope/);
    assert.match(t((l) => { l[0].blocks = [...l[0].blocks, 'nope']; }), /不存在的积木 nope/);
    assert.match(t((l) => { l[0].blocks = [...l[0].blocks].reverse(); }), /和路线 .* 的分段 .* 不一致/);
    assert.match(t((l) => { l[0].blocks = []; }), /没有写需要哪几块积木/);
    assert.match(t((l) => { l[0].keyCards = []; }), /没有写关键卡/);
    assert.match(t((l) => { l[0].keyCards = [73819701]; }), /不提供打断/);
    assert.match(t((l) => { l[1].id = l[0].id; }), /id .* 重复/);
    assert.match(t((l) => { l[1].name = l[0].name; }), /名字 .* 重复/);
    assert.match(t((l) => { l.pop(); l.pop(); }), /要 2–3 个/);
    assert.match(t((l) => { l.push({ ...l[0], id: 'x1', name: 'x1' }, { ...l[0], id: 'x2', name: 'x2' }); }), /要 2–3 个/);
    assert.match(t((l) => { l[0].seen = -1; }), /seen/);
  });
});

const card = (code) => ({ code, md: `卡${code}`, jp: `卡${code}`, interrupts: 1, interruptHow: '' });
const route = (id, needs, blocks, breakers, interrupts = breakers.length) => ({
  id, name: `路线${id}`, needs: card(needs), steps: Array.from({ length: 9 }, (_, i) => ({ n: i + 1 })),
  end: { interrupts, breakers: breakers.map((code) => ({ code, interrupts: 1, interruptHow: '' })) },
  blocks: blocks.map((b, i) => ({ id: b, name: b, color: '#fff', needs: 'n', gives: 'g', from: i * 2 + 1, to: i * 2 + 2 })),
});
const fakeDeck = (ids, list, hands = 500) => ({ cards: {}, blocks: { list: ids.map((id) => ({ id, name: id, color: '#fff', needs: 'n', gives: 'g' })) }, endgames: { hands, list } });

describe('rankEndgames：怎么挑', () => {
  const row = (monsters, spellTraps = [], hand = []) => ({ end: { monsters, spellTraps, hand } });
  test('按提供打断的卡合并路线，按打断数、手数排，手数 0 的去掉；手里的卡也算', () => {
    const routes = [route('a', 1, ['x'], [10, 11]), route('b', 1, ['x'], [11, 10]), route('c', 1, ['x'], [12, 13, 14]), route('d', 1, ['x'], [15]), route('e', 1, ['x'], [16, 17, 18])];
    const rows = [row([10, 11]), row([11], [], [10]), row([12], [13], [14]), row([15]), row([15]), row([15]), row([1])];
    const ranked = rankEndgames(routes, rows);
    assert.deepEqual(ranked.map((c) => [c.keys, c.interrupts, c.seen, c.routes]), [
      [[12, 13, 14], 3, 1, ['c']], [[10, 11], 2, 2, ['a', 'b']], [[15], 1, 3, ['d']],
    ]);
    assert.ok(endHas(row([1], [], [2]), [1, 2]));
    assert.ok(!endHas(row([1]), [1, 2]));
  });
});

describe('缺一块积木时的补法（从路线数据推）', () => {
  // 目标 t：x → y → z。别的路线：u：x → w → z（换 y 成 w）；v：x → z（跳过 y）；q：y → z（x 在开头，跳过 x 直接 y）；r：只有 m（谁也补不了）
  const routes = [route('t', 1, ['x', 'y', 'z'], [10]), route('u', 2, ['x', 'w', 'z'], [11], 5), route('v', 3, ['x', 'z'], [12], 2), route('q', 4, ['y', 'z'], [13], 3), route('r', 5, ['m'], [14], 4), route('p', 6, ['m'], [15], 6)];
  const deck = fakeDeck(['x', 'y', 'z', 'w', 'm'], [{ id: 'g', name: 'g', route: 't', blocks: ['x', 'y', 'z'], keyCards: [10], seen: 3 }]);
  const view = buildEndgames(deck, routes);
  const [x, y, z] = view.endgames[0].blocks;

  test('换一块：同样夹在前一块和后一块之间，别的路线放的是另一块；指向那块在那条路线里的第一步', () => {
    assert.deepEqual(y.missing.swaps.map((s) => [s.block.id, s.routes.map((r) => [r.id, r.step])]), [['w', [['u', 3]]]]);
  });
  test('跳过：别的路线前一块后面直接是后一块；开头的块跳过就是那条路线从后一块起，要的起手卡跟着给', () => {
    assert.deepEqual(y.missing.skips[0].routes.map((r) => [r.id, r.step]), [['v', 3]]);
    assert.equal(y.missing.skips[0].next.id, 'z');
    assert.deepEqual(x.missing.skips[0].routes.map((r) => [r.id, r.step, r.needs.code]), [['q', 1, 4]]);
    assert.equal(x.missing.swaps.length, 0);
  });
  test('最后一块缺了：跳过 = 停在前一块，改用那条路线的终场（最后一步）；两个都没有时列不用这块的路线，打断数高的在前', () => {
    assert.equal(z.missing.skips.length, 0);
    assert.deepEqual(z.missing.swaps, []);
    assert.deepEqual(z.missing.without.map((r) => r.id), ['p', 'r']);
    const tail = buildEndgames(fakeDeck(['x', 'y'], [{ route: 'a', keyCards: [10] }]), [route('a', 1, ['x', 'y'], [10]), route('b', 2, ['x'], [11])]).endgames[0].blocks[1];
    assert.deepEqual([tail.missing.skips[0].next, tail.missing.skips[0].routes.map((r) => [r.id, r.step])], [null, [['b', 9]]]);
  });
  test('同一条路线里同一块出现两次：换一块、跳过都只列一次，按路线 id 和步去重', () => {
    // 目标 t：x → y → z。u：x → w → z → x → w → z（x 后面接 w 再接 z 出现两次）；v：x → z → x → z（x 后面直接 z 出现两次）
    const rs = [route('t', 1, ['x', 'y', 'z'], [10]), route('u', 2, ['x', 'w', 'z', 'x', 'w', 'z'], [11]), route('v', 3, ['x', 'z', 'x', 'z'], [12])];
    const d = fakeDeck(['x', 'y', 'z', 'w'], [{ id: 'g', name: 'g', route: 't', blocks: ['x', 'y', 'z'], keyCards: [10], seen: 3 }]);
    const m = buildEndgames(d, rs).endgames[0].blocks[1].missing;
    assert.deepEqual(m.swaps.map((s) => [s.block.id, s.routes.map((r) => r.id)]), [['w', ['u']]]);
    assert.deepEqual(m.skips[0].routes.map((r) => r.id), ['v']);
  });
  test('有补法时不再列「改走别的路线」', () => {
    assert.deepEqual(y.missing.without, []);
    assert.deepEqual(x.missing.without, []);
  });
  test('手数（模拟了多少手）来自卡组数据 endgames.hands', () => {
    assert.equal(buildEndgames(fakeDeck(['x'], [{ id: 'g', name: 'g', route: 't', blocks: ['x'], keyCards: [10], seen: 1 }], 123), [route('t', 1, ['x'], [10])]).hands, 123);
  });
  test('页面要的字段：打断数、手数、起手卡、关键卡、每块的几条路线用、走到同一终场的别的路线', () => {
    const e = view.endgames[0];
    assert.equal(view.hands, 500);
    assert.deepEqual([e.interrupts, e.seen, e.route.steps, e.start.code, e.keyCards.map((c) => c.code)], [1, 3, 9, 1, [10]]);
    assert.deepEqual(e.blocks.map((b) => [b.id, b.usedBy]), [['x', 3], ['y', 2], ['z', 4]]);
    assert.deepEqual(e.alsoRoutes, []);
  });
});

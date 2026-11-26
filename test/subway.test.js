import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildSubway } from '../src/subway.js';

const card = (code) => ({ code, md: `卡${code}` });
const route = (id, needs, blocks, steps = 4) => ({
  id, name: id, needs: card(needs), end: { interrupts: 1, monsters: [] },
  blocks: blocks.map(([b, from, to]) => ({ id: b, name: b, color: '#fff', needs: 'n', gives: 'g', from, to })),
  steps: Array.from({ length: steps }, (_, i) => ({ n: i + 1, activated: [], moves: [] })),
});

describe('buildSubway', () => {
  test('两条路线共用一块积木：它是枢纽，边合并，列按最长距离', () => {
    const g = buildSubway({ cards: {} }, [route('a', 1, [['x', 1, 2], ['y', 3, 4]]), route('b', 2, [['x', 1, 4]])]);
    const x = g.stations.find((s) => s.id === 'block:x');
    assert.equal(x.kind, 'hub');
    assert.equal(g.stations.find((s) => s.id === 'block:y').kind, 'stop');
    assert.deepEqual(x.stops.map((s) => s.route), ['a', 'b']);
    assert.equal(g.edges.filter((e) => e.to === 'block:x').length, 2);
    assert.equal(x.layer, 1);
    assert.equal(g.stations.find((s) => s.id === 'block:y').layer, 2);
    assert.ok(g.stations.filter((s) => s.kind === 'end').every((s) => s.layer === g.layers - 1));
  });

  test('起手卡第一次用上的那一步：发动了它或它离开手牌；都没有就第 1 步', () => {
    const r = route('a', 7, [['x', 1, 4]]);
    r.steps[2].activated = [card(7)];
    r.steps[1].moves = [{ code: 7, from: 'deck' }];
    assert.equal(buildSubway({ cards: {} }, [r]).stations[0].stops[0].step, 3);
    r.steps[1].moves = [{ code: 7, from: 'hand' }];
    assert.equal(buildSubway({ cards: {} }, [r]).stations[0].stops[0].step, 2);
    assert.equal(buildSubway({ cards: {} }, [route('b', 8, [['x', 1, 4]])]).stations[0].stops[0].step, 1);
  });

  test('两条路线里两块积木的先后相反：有环，抛错', () => {
    assert.throws(() => buildSubway({ cards: {} }, [route('a', 1, [['x', 1, 2], ['y', 3, 4]]), route('b', 2, [['y', 1, 2], ['x', 3, 4]])]), /环/);
  });
});

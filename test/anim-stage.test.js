import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderComposition } from '../src/anim-render.js';
import { planRoute } from '../src/anim-plan.js';
import { CH, CW, NAME_H, NOTICE, NOTICE_BANNER_H, NOTICE_SPOT_H, PITCH, SIDEWAYS_SCALE, STAGE, intersects, slotPos, zoneRects } from '../src/anim-stage.js';

describe('舞台几何', () => {
  test('横幅和发动牌的专用条不和任何区的卡、卡名、标签相交（含额外怪兽区 5、6 和手牌最多 8 张），也都在舞台里', () => {
    for (const r of zoneRects({ emz: true, hand: 8 })) {
      assert.ok(!intersects(NOTICE, r), `${r.kind} (${r.x}, ${r.y}, ${r.w}×${r.h}) 压到了横幅条`);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= STAGE.w && r.y + r.h <= STAGE.h, `${r.kind} 超出舞台`);
    }
    assert.ok(NOTICE.y >= 0 && NOTICE.h >= NOTICE_SPOT_H && NOTICE.h >= NOTICE_BANNER_H && NOTICE.x + NOTICE.w <= STAGE.w);
  });

  test('任何两个区的卡 / 卡名 / 标签里，卡和卡名互不相交（额外怪兽区的卡名不压手牌）', () => {
    const rects = zoneRects({ emz: true, hand: 8 }).filter((r) => /卡$|卡名$/.test(r.kind));
    for (const a of rects) for (const b of rects) {
      if (a === b || (a.kind.startsWith('手牌') && b.kind.startsWith('手牌'))) continue;
      assert.ok(!intersects(a, b), `${a.kind} 和 ${b.kind} 相交`);
    }
  });

  test('守备横放的卡：缩放后横着的宽度比一格的间距窄，不碰相邻格的框；两张相邻的守备卡互不相碰', () => {
    const [x, y] = slotPos('monsters', 2);
    const cx = x + CW / 2;
    const cy = y + CH / 2;
    const w = CH * SIDEWAYS_SCALE;
    const h = CW * SIDEWAYS_SCALE;
    const card = { x: cx - w / 2, y: cy - h / 2, w, h };
    for (const dx of [-1, 1]) {
      const [nx, ny] = slotPos('monsters', 2 + dx);
      assert.ok(!intersects(card, { x: nx, y: ny, w: CW, h: CH }), '碰到相邻格的框');
      const neighbour = { x: card.x + dx * PITCH, y: card.y, w, h };
      assert.ok(!intersects(card, neighbour), '两张守备卡相碰');
    }
    assert.ok(card.w < PITCH && card.y >= y && card.y + card.h <= y + CH);
    assert.ok(NAME_H > 0);
  });

  test('合成页里横幅和发动牌的位置取自专用条（样式里的 top 在条内）', () => {
    const plan = planRoute({
      start: { hand: [], deck: [], extra: [], monsters: [], spellTraps: [], grave: [], banished: [] }, end: { breakers: [] },
      steps: [{ n: 1, text: '过阶段', activated: [], moves: [], board: { hand: [], deck: [], extra: [], monsters: [], spellTraps: [], grave: [], banished: [] } }],
    });
    const html = renderComposition(plan, { runtime: '/* runtime */' });
    const banner = Number(html.match(/class="bn" style="[^"]*top:([\d.]+)px/)[1]);
    assert.ok(banner >= NOTICE.y && banner + NOTICE_BANNER_H <= NOTICE.y + NOTICE.h, `横幅 top ${banner}`);
    const spot = Number(html.match(/\.spot\{[^}]*top:([\d.]+)px/)[1]);
    assert.ok(spot >= NOTICE.y && spot + NOTICE_SPOT_H <= NOTICE.y + NOTICE.h, `发动牌 top ${spot}`);
  });
});

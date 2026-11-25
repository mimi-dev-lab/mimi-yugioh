import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { planRoute } from '../src/anim-plan.js';
import { renderComposition } from '../src/anim-render.js';
import { EMZ_Y, HY, MY, PILE, PITCH, SIDEWAYS_SCALE, SX0, SY, slotPos } from '../src/anim-stage.js';
import { replayRoute } from '../src/route-view.js';
import { frameAt, textAt } from './anim-helpers.js';
import { openTestEngine } from './helpers.js';

const WHITE_ALBAZ = 'white-albaz';

// 一张卡在结束帧里的位置落在哪个区（按舞台的几何反推，和生成器的摆位公式无关：只看行、列）
function zoneAt(f) {
  if (f.y === HY) return ['hand'];
  if (f.x >= PILE.grave[0] && f.x < PILE.grave[0] + 30) return [f.y === PILE.grave[1] ? 'grave' : 'deck'];
  if (f.x < 60) return [f.y === PILE.banished[1] ? 'banished' : 'extra'];
  const slot = (f.x - SX0) / PITCH;
  if (f.y === EMZ_Y) return ['monsters', 5 + (slot - 1) / 2]; // 额外怪兽区：第 1 / 3 个间距处，sequence 5、6
  return [f.y === MY ? 'monsters' : f.y === SY ? 'spellTraps' : '?', slot];
}

describe('路线动画生成器：每条路线每一步的动作和引擎一致', () => {
  const routes = new Map();
  const plans = new Map();
  before(async () => {
    const engine = await openTestEngine();
    for (const def of BRANDED.routes) {
      const route = await replayRoute(engine, BRANDED, def);
      routes.set(def.id, route);
      plans.set(def.id, planRoute(route));
    }
  });

  test('每步的卡片移动（密码、起点区→终点区、顺序）和引擎的 moves 一一对应；起手是 5 张从卡组到手牌', () => {
    assert.equal(plans.size, 7);
    for (const [id, route] of routes) {
      const plan = plans.get(id);
      assert.equal(plan.moves.length, route.steps.length + 1, id);
      assert.deepEqual(plan.moves[0].map((m) => [m.code, m.from, m.to]), route.start.hand.map((c) => [c.code, 'deck', 'hand']), `${id} 起手`);
      route.steps.forEach((step, i) => {
        assert.deepEqual(plan.moves[i + 1].map((m) => [m.code, m.from, m.to]), step.moves.map((m) => [m.code, m.from, m.to]), `${id} 第 ${step.n} 步`);
      });
    }
  });

  test('每一次移动的落点来自引擎：怪兽区 / 魔陷区的格子和坐标 = 引擎 move.sequence 对应的格子（含这一步里还会再动的中途落点）', () => {
    let mid = 0;
    for (const [id, route] of routes) {
      const plan = plans.get(id);
      route.steps.forEach((step, i) => {
        step.moves.forEach((m, j) => {
          const planned = plan.moves[i + 1][j];
          if (m.to !== 'monsters' && m.to !== 'spellTraps') return;
          assert.equal(planned.slot, m.sequence, `${id} 第 ${step.n} 步 ${m.md} 的格子`);
          assert.deepEqual(planned.pos, slotPos(m.to, m.sequence), `${id} 第 ${step.n} 步 ${m.md} 的坐标`);
          if (step.moves.slice(j + 1).some((n) => n.code === m.code && n.from === m.to && n.fromSequence === m.sequence)) mid += 1;
        });
      });
    }
    assert.ok(mid > 0, '数据里要有至少一次中途落点（落胤与圣女发动后又进墓地），否则这条测试什么都没查');
  });

  test('每一步的结束帧：看得见的卡恰好是快照里的卡，各在快照说的区和格子，张数标签等于快照', () => {
    for (const [id, route] of routes) {
      const plan = plans.get(id);
      const boards = [route.start, ...route.steps.map((s) => s.board)];
      plan.segments.forEach((seg, k) => {
        const board = boards[k];
        const shown = frameAt(plan, seg.mark).filter((f) => f.opacity > 0.99);
        const got = { hand: [], monsters: [], spellTraps: [], grave: [], banished: [] };
        for (const f of shown) {
          const [zone, slot] = zoneAt(f);
          assert.ok(got[zone], `${id} 位置 ${k}：${f.md} 在 (${f.x}, ${f.y})，不是任何区`);
          got[zone].push({ code: f.code, slot, rotation: f.rotation });
        }
        for (const zone of Object.keys(got)) {
          assert.deepEqual(got[zone].map((c) => c.code).sort(), board[zone].map((c) => c.code).sort(), `${id} 位置 ${k} 的${zone}`);
        }
        for (const c of board.monsters.concat(board.spellTraps)) {
          const zone = board.monsters.includes(c) ? 'monsters' : 'spellTraps';
          const hit = got[zone].find((g) => g.slot === c.sequence && g.code === c.code);
          assert.ok(hit, `${id} 位置 ${k}：${c.md} 应在${zone}第 ${c.sequence} 格`);
          assert.equal(hit.rotation, zone === 'monsters' && c.position !== 'attack' ? 90 : 0, `${id} 位置 ${k}：${c.md} 的转角`);
        }
        assert.equal(textAt(plan, 'lb-deck', seg.mark), `卡组 ${board.deck.length}`, `${id} 位置 ${k}`);
        assert.equal(textAt(plan, 'lb-extra', seg.mark), `额外 ${board.extra.length}`);
        assert.equal(textAt(plan, 'lb-grave', seg.mark), `墓地 ${board.grave.length}`);
        assert.equal(textAt(plan, 'lb-banished', seg.mark), `除外 ${board.banished.length}`);
        assert.equal(textAt(plan, 'lb-hand', seg.mark), `手牌 ${board.hand.length}`);
      });
    }
  });

  test('第 9 步阿卢绯尔守备表示：结束帧横放（转角 90），攻击表示的怪兽不转', () => {
    const plan = plans.get(WHITE_ALBAZ);
    const f = frameAt(plan, plan.segments[9].mark).find((x) => x.code === 62962630 && x.opacity > 0.99);
    assert.equal(f.rotation, 90);
    assert.equal(f.tilt, SIDEWAYS_SCALE);
    for (const g of frameAt(plan, plan.segments[9].mark).filter((x) => x.code === 45883110 && x.opacity > 0.99)) { assert.equal(g.rotation, 0); assert.equal(g.tilt, 1); }
  });

  test('同调光环的星数 = 召唤出来的怪兽的真实等级；融合没有星', () => {
    const route = routes.get(WHITE_ALBAZ);
    const html = renderComposition(plans.get(WHITE_ALBAZ), { runtime: '/* runtime */' });
    const groups = [...html.matchAll(/<div id="(dg\d+)" class="dg" data-stars="(\d+)"[^>]*>([\s\S]*?)<\/div>/g)];
    const synchro = route.steps.flatMap((s) => s.moves).filter((m) => m.summon === 'synchro');
    assert.equal(groups.length, synchro.length);
    assert.equal(synchro[0].level, 8);
    groups.forEach((g, i) => {
      assert.equal(Number(g[2]), synchro[i].level);
      assert.equal([...g[3].matchAll(/<i /g)].length, synchro[i].level);
    });
    assert.ok(route.steps.flatMap((s) => s.moves).some((m) => m.summon === 'fusion'));
    assert.equal([...html.matchAll(/class="rg dia"/g)].length % 3, 0);
  });

  test('每一步的时间点单调、结束帧之后才是下一步；所有轨道在整条时间轴内', () => {
    for (const plan of plans.values()) {
      plan.segments.forEach((s, i) => {
        assert.ok(s.start < s.mark && s.mark < s.end);
        if (i) assert.equal(s.start, plan.segments[i - 1].end);
      });
      assert.equal(plan.segments.at(-1).end, plan.duration);
      for (const props of Object.values(plan.tracks)) for (const segs of Object.values(props)) for (const [t0, t1] of segs) assert.ok(t0 >= 0 && t1 <= plan.duration && t1 >= t0);
    }
  });

  test('每步的动作都落在这一步里：所有卡和特效的轨道都在这一步的结束帧之前停稳（特效没有拖到下一帧）', () => {
    const plan = plans.get(WHITE_ALBAZ);
    for (const [id, props] of Object.entries(plan.tracks)) {
      
      for (const segs of Object.values(props)) for (const [t0, t1] of segs) {
        const seg = plan.segments.find((s) => t0 >= s.start && t0 < s.end);
        assert.ok(seg && t1 <= seg.mark, `${id} 的一段 ${t0}–${t1} 跨过了结束帧`);
      }
    }
  });

  test('没有图的卡画卡名牌：合成页里有卡名；有图的用 data: 地址，页面里没有任何网址', () => {
    const plan = plans.get(WHITE_ALBAZ);
    const bare = renderComposition(plan, { runtime: '/* runtime */' });
    assert.match(bare, /class="pt">白之落胤</);
    const withImage = renderComposition(plan, { images: new Map([[73819701, 'data:image/webp;base64,AAAA']]), runtime: '/* runtime */' });
    assert.match(withImage, /\.a\.i73819701,\.sth\.i73819701\{background-image:url\(data:image\/webp;base64,AAAA\)\}/);
    assert.doesNotMatch(withImage, /https?:\/\//);
  });
});

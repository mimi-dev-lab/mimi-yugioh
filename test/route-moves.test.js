import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { openEngineFiles } from '../src/engine-files.js';
import { BRANDED } from '../src/decks/branded.js';
import { ZONES, replayRoute } from '../src/route-view.js';
import { ENGINE_DIR, openTestEngine } from './helpers.js';

const ALBAZ = 73819701; const MIRRORJADE = 44146295; const LUBLION = 70534340; const ALUBER = 62962630;
const ZONE_NAMES = ['hand', 'monsters', 'spellTraps', 'grave', 'banished', 'deck', 'extra'];

describe('路线快照：引擎给出的卡片移动和区的变化一一对应', () => {
  let engine;
  const views = new Map();
  before(async () => {
    engine = await openTestEngine();
    for (const route of BRANDED.routes) views.set(route.id, await replayRoute(engine, BRANDED, route));
  });

  test('快照有 7 个区：卡组和额外卡组是每一张的列表，diff 也有 deck / extra', () => {
    assert.deepEqual(ZONES, ZONE_NAMES);
    for (const view of views.values()) {
      assert.equal(view.start.deck.length, 35);
      assert.equal(view.start.extra.length, 15);
      for (const step of view.steps) {
        for (const zone of ZONE_NAMES) { assert.ok(Array.isArray(step.board[zone]), zone); assert.ok(step.diff[zone].in && step.diff[zone].out, zone); }
        const total = ZONE_NAMES.reduce((n, z) => n + step.board[z].length, 0);
        assert.equal(total, 55, `${view.id} 第 ${step.n} 步：我方的卡总数不变（没有 token、Xyz 素材）`);
      }
    }
  });

  test('每条路线每一步：moves 按密码数出来的每个区净进出 = diff 的 in / out（7 个区）', () => {
    for (const view of views.values()) {
      for (const step of view.steps) {
        for (const zone of ZONE_NAMES) {
          const net = new Map();
          const bump = (code, d) => net.set(code, (net.get(code) ?? 0) + d);
          for (const m of step.moves) { if (m.to === zone) bump(m.code, 1); if (m.from === zone) bump(m.code, -1); }
          const fromDiff = new Map();
          for (const c of step.diff[zone].in) fromDiff.set(c.code, (fromDiff.get(c.code) ?? 0) + 1);
          for (const c of step.diff[zone].out) fromDiff.set(c.code, (fromDiff.get(c.code) ?? 0) - 1);
          for (const [code, n] of [...net, ...fromDiff]) assert.equal(net.get(code) ?? 0, fromDiff.get(code) ?? 0, `${view.id} 第 ${step.n} 步 ${zone} ${code}（moves ${n}）`);
        }
        for (const m of step.moves) {
          assert.ok(ZONE_NAMES.includes(m.from) && ZONE_NAMES.includes(m.to), `${view.id} 第 ${step.n} 步 区名 ${m.from}→${m.to}`);
          assert.ok(m.md && m.jp);
        }
      }
    }
  });

  test('白之落胤线第 14 步冰剑龙：素材卢绯里昂回额外卡组、除外的白之落胤回卡组，冰剑龙从额外卡组到怪兽区，是融合', () => {
    const step = views.get('white-albaz').steps[13];
    assert.match(step.text, /冰剑龙/);
    const lublion = step.moves.find((m) => m.code === LUBLION);
    assert.equal(`${lublion.from}→${lublion.to}`, 'monsters→extra');
    const albaz = step.moves.find((m) => m.code === ALBAZ);
    assert.equal(`${albaz.from}→${albaz.to}`, 'banished→deck');
    const jade = step.moves.find((m) => m.code === MIRRORJADE);
    assert.equal(`${jade.from}→${jade.to}`, 'extra→monsters');
    assert.equal(jade.summon, 'fusion');
    assert.equal(step.moves.length, 3);
    assert.deepEqual(step.diff.deck.in.map((c) => c.code), [ALBAZ]);
    assert.deepEqual(step.diff.extra.out.map((c) => c.code), [MIRRORJADE]);
  });

  test('召唤种类取自引擎：第 3 步黑衣龙之艾克利西亚是同调，素材进墓地；同调的怪兽带等级', () => {
    const step = views.get('white-albaz').steps[2];
    const summoned = step.moves.find((m) => m.to === 'monsters');
    assert.equal(summoned.summon, 'synchro');
    assert.equal(summoned.from, 'extra');
    assert.ok(summoned.level > 4, '同调的星数用真实等级');
    assert.deepEqual(step.moves.filter((m) => m.from === 'monsters').map((m) => m.to), ['grave', 'grave']);
  });

  test('素材标记取自引擎：融合 / 同调的素材带 material，召唤出来的怪兽和别的移动没有', () => {
    const wa = views.get('white-albaz').steps;
    assert.deepEqual(wa[2].moves.map((m) => !!m.material), [true, true, false]); // 同调：两个素材，再是黑衣龙
    assert.deepEqual(wa[11].moves.map((m) => !!m.material), [true, true, false, false]); // 融合：两个素材、卢绯里昂、烙印用完进墓地
    assert.deepEqual(wa[13].moves.map((m) => !!m.material), [true, true, false]); // 冰剑龙：素材回额外卡组 / 卡组
    assert.ok(wa[4].moves.every((m) => !m.material)); // 第 5 步只是送墓
  });

  test('第 9 步阿卢绯尔从卡组守备表示出场：move 和场上的卡都是 defense', () => {
    const step = views.get('white-albaz').steps[8];
    const move = step.moves.find((m) => m.code === ALUBER && m.to === 'monsters');
    assert.equal(move.from, 'deck');
    assert.equal(move.position, 'defense');
    assert.equal(move.summon, 'special');
    assert.equal(step.board.monsters.find((c) => c.code === ALUBER).position, 'defense');
    const first = views.get('white-albaz').steps[0].board.monsters[0];
    assert.equal(first.position, 'attack');
  });

  test('连锁号：发动效果带来的移动带 chain', () => {
    const step = views.get('white-albaz').steps[0];
    assert.ok(step.moves.every((m) => m.chain === 1));
    const kaimaku = views.get('white-albaz').steps[8].moves; // 烙印开幕：先从手牌发动上场（还没连锁），再支付弃牌、叫出阿卢绯尔、用完进墓地（都在连锁 1 里）
    assert.deepEqual(kaimaku.map((m) => [m.from, m.to, m.chain]), [['hand', 'spellTraps', undefined], ['hand', 'grave', 1], ['deck', 'monsters', 1], ['spellTraps', 'grave', 1]]);
  });
});

describe('等级 / 阶级写在 branded-levels.js，和引擎卡库一致', () => {
  test('卡库里的每只怪兽都有一行，数值和 cards.cdb 一致；魔法陷阱没有', () => {
    const files = openEngineFiles(ENGINE_DIR);
    for (const code of Object.keys(BRANDED.cards)) {
      const c = files.cardReader(Number(code));
      const expected = !(c.type & 0x1) ? undefined : c.type & 0x800000 ? { rank: c.level } : c.type & 0x4000000 ? { link: c.level } : { level: c.level };
      assert.deepEqual(BRANDED.levels[code], expected, `${code} ${BRANDED.cards[code].jp}`);
    }
    for (const code of Object.keys(BRANDED.levels)) assert.ok(BRANDED.cards[code], `${code} 不在卡表里`);
    files.close();
  });
});

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { startSession } from '../src/duel-session.js';
import { ID, PROBE_DUEL, drive, openTestEngine } from './helpers.js';

const PLAN = () => [
  { idle: 'summon', code: ID.aluber },        // 通招阿鲁伯
  { pick: [ID.bfusion] },                     // 检索烙印融合
  { idle: 'activate', code: ID.bfusion },     // 发动烙印融合
  { pick: [ID.albion] },                      // 融合出烙印龙 阿尔比昂
  { pick: [ID.albaz, ID.bystialLub] },        // 素材
];

describe('决斗会话', () => {
  let engine;
  before(async () => { engine = await openTestEngine(); });

  test('开局：起手 5 张，提示是主阶段，合法项里有通招阿鲁伯', async () => {
    const s = await startSession(engine, PROBE_DUEL);
    assert.equal(s.board().hand.length, 5);
    assert.equal(s.prompt().kind, 'idle');
    assert.ok(s.prompt().options.some((o) => o.action === 'summon' && o.code === ID.aluber));
    s.close();
  });

  test('重放探针那条线：终场怪兽区有阿鲁伯和阿尔比昂，脚本报错 0', async () => {
    const s = await startSession(engine, PROBE_DUEL);
    assert.equal(drive(s, PLAN()), PLAN().length);
    const monsters = s.board().monsters.map((c) => c.code);
    assert.ok(monsters.includes(ID.aluber), `终场怪兽区 ${monsters}`);
    assert.ok(monsters.includes(ID.albion), `终场怪兽区 ${monsters}`);
    assert.deepEqual(s.scriptErrors, []);
    s.close();
  });

  test('选了不合法的选项抛错，状态不变', async () => {
    const s = await startSession(engine, PROBE_DUEL);
    const before = JSON.stringify(s.prompt());
    assert.throws(() => s.choose([999]), /下标/);
    assert.throws(() => s.choose([]), /要选/);
    assert.throws(() => s.choose([0, 1]), /要选/);
    assert.equal(JSON.stringify(s.prompt()), before);
    s.close();
  });

  test('存档回滚：回滚后合法选项和存档时一致，之后还能走别的线', async () => {
    const s = await startSession(engine, PROBE_DUEL);
    const plan = PLAN();
    drive(s, plan.slice(0, 2)); // 通招阿鲁伯、检索烙印融合，停在主阶段
    assert.equal(s.prompt().kind, 'idle');
    const cp = s.checkpoint();
    const saved = JSON.stringify({ prompt: s.prompt(), board: s.board() });
    drive(s, plan.slice(2)); // 走完融合
    assert.notEqual(JSON.stringify({ prompt: s.prompt(), board: s.board() }), saved);
    s.rollback(cp);
    assert.equal(JSON.stringify({ prompt: s.prompt(), board: s.board() }), saved);
    // 回滚后继续：改成不发动烙印融合、直接结束回合
    const end = s.prompt().options.findIndex((o) => o.action === 'end-turn');
    s.choose([end]);
    assert.ok(!s.board().monsters.some((c) => c.code === ID.albion));
    assert.throws(() => s.rollback(cp + 100), /存档/);
    s.close();
  });

  test('endBoard：我方回合结束前是 null，结束时记下当时的场面（之后的抽牌不算）', async () => {
    const s = await startSession(engine, PROBE_DUEL);
    drive(s, PLAN().slice(0, 2));
    assert.equal(s.endBoard, null);
    const handBefore = s.board().hand.length;
    s.choose([s.prompt().options.findIndex((o) => o.action === 'end-turn')]);
    for (let guard = 0; guard < 50 && !s.endBoard && s.prompt()?.kind === 'chain'; guard++) s.choose([s.prompt().options.length - 1]);
    assert.ok(s.endBoard);
    assert.equal(s.endBoard.hand.length, handBefore);
    s.close();
  });
});

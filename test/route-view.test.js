import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { endSummary, replayRoute } from '../src/route-view.js';
import { openTestEngine } from './helpers.js';

describe('路线展示数据：教程和引擎不一致、重放不通', () => {
  let engine;
  before(async () => { engine = await openTestEngine(); });
  const albaz = BRANDED.routes[0];

  test('教程写的终场和引擎重放不一致：engineDiff 列出差异，路线上写的 mismatch 原样带出', async () => {
    const wrong = { ...albaz, end: { ...albaz.end, hand: 5 }, mismatch: '教程写手牌 5 张，引擎重放是 4 张' };
    const view = await replayRoute(engine, BRANDED, wrong);
    assert.equal(view.mismatch, '教程写手牌 5 张，引擎重放是 4 张');
    assert.equal(view.engineDiff.length, 1);
    assert.match(view.engineDiff[0], /手牌 4 张/);
    assert.equal(view.steps.at(-1).board.hand.length, 4); // 场面是引擎的结果，不跟着教程改
  });

  test('一致的路线没有 mismatch 和 engineDiff；步骤的动作文字带发动的卡', async () => {
    const view = await replayRoute(engine, BRANDED, albaz);
    assert.equal(view.mismatch, '');
    assert.deepEqual(view.engineDiff, []);
    assert.deepEqual(view.steps[0].actions, ['发动 白之落胤', '选 烙印龙 阿尔比昂']);
  });

  test('步骤走不通：重放抛错并带步号', async () => {
    const broken = { ...albaz, steps: [{ text: '故意写错', do: [{ idle: 'activate', code: 62962630 }] }] };
    await assert.rejects(replayRoute(engine, BRANDED, broken), /第 1 步「故意写错」/);
  });

  test('同一张卡有几张能发动：打断数按张数算，合成一条说明', async () => {
    const board = { hand: [{ code: 14558127, sequence: 0 }, { code: 14558127, sequence: 1 }], monsters: [], spellTraps: [{ code: 48130397, sequence: 0 }, { code: 48130397, sequence: 1 }], grave: [], banished: [], extra: [] };
    const end = endSummary(BRANDED, board);
    assert.equal(end.interrupts, 2);
    assert.deepEqual(end.breakers.map((b) => [b.md, b.copies, b.interrupts]), [['超融合', 2, 2]]);
  });

  test('卡组外的卡（token）在场：不抛错，打断当 0，名字退回密码', () => {
    const board = { hand: [], monsters: [{ code: 44146295, sequence: 0 }, { code: 99999999, sequence: 1 }], spellTraps: [], grave: [], banished: [], extra: [{ code: 87746184, sequence: 0 }] };
    const end = endSummary(BRANDED, board);
    assert.equal(end.interrupts, 1);
    assert.deepEqual(end.breakers.map((b) => b.code), [44146295]);
    assert.equal(end.monsters[1].md, '99999999');
  });
});

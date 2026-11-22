import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { diffEnd, playRoute } from '../src/route.js';
import { openTestEngine } from './helpers.js';

describe('烙印的两条 Game8 路线在引擎里重放', () => {
  let engine;
  before(async () => { engine = await openTestEngine(); });

  for (const route of BRANDED.routes) {
    test(`${route.name}：走通，终场和 Game8 一致，脚本报错 0`, async () => {
      const { endBoard, scriptErrors } = await playRoute(engine, BRANDED, route);
      assert.deepEqual(scriptErrors, []);
      assert.deepEqual(diffEnd(route, endBoard), []);
    });
  }

  test('白之落胤线终场：冰剑龙 + 引导之圣女 + 赫之圣女 + 黑衣龙之艾克利西亚，手牌 4', async () => {
    const { endBoard } = await playRoute(engine, BRANDED, BRANDED.routes[0]);
    assert.deepEqual(endBoard.monsters.map((c) => BRANDED.cards[c.code].md).sort(), ['冰剑龙 镜翠幻种', '引导之圣女 \u5E93\u59B8\u3F57', '赫之圣女 卡尔塔西亚', '黑衣龙之艾克利西亚'].sort());
    assert.equal(endBoard.hand.length, 4);
  });

  test('换种子洗牌，路线照样走通（路线不依赖卡组顺序）', async () => {
    for (const route of BRANDED.routes) {
      const { endBoard } = await playRoute(engine, BRANDED, route, { seed: 5 });
      assert.deepEqual(diffEnd(route, endBoard), []);
    }
  });

  test('步骤对不上引擎提示时报出第几步和合法项', async () => {
    const broken = { ...BRANDED.routes[0], steps: [{ text: '故意写错', do: [{ idle: 'activate', code: 62962630 }] }] };
    await assert.rejects(playRoute(engine, BRANDED, broken), /第 1 步「故意写错」.*合法项里没有它/);
  });
});

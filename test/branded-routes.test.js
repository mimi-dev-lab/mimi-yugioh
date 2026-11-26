import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { diffEnd, playRoute } from '../src/route.js';
import { openTestEngine } from './helpers.js';

describe('烙印的展开路线在引擎里重放', () => {
  let engine;
  before(async () => { engine = await openTestEngine(); });

  for (const route of BRANDED.routes) {
    test(`${route.name}：走通，终场和出处教程一致，脚本报错 0`, async () => {
      const { endBoard, scriptErrors } = await playRoute(engine, BRANDED, route);
      assert.deepEqual(scriptErrors, []);
      assert.deepEqual(diffEnd(route, endBoard), []);
    });
  }

  test('终场的 used 只留还在原来那一格的卡的发动（发动后移走的，例如发动完进墓地的魔法，不留）', async () => {
    const spellsToGrave = [44362883, 82738008, 30271097]; // 烙印融合、赫之烙印、落胤与圣女：发动完就进墓地
    let spells = 0;
    for (const route of BRANDED.routes) {
      const { endBoard, stepActivated } = await playRoute(engine, BRANDED, route);
      for (const u of endBoard.used) assert.ok(endBoard[u.zone]?.some((c) => c.code === u.code && c.sequence === u.sequence), `${route.id}：${JSON.stringify(u)} 那一格已经不是这张卡`);
      spells += stepActivated.flat().filter((code) => spellsToGrave.includes(code)).length;
    }
    assert.ok(spells > 0); // 路线里确实发动过这样的魔法，上面的检查才有意义
  });

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

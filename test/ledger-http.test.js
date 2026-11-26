import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { effectOf } from '../src/ledger.js';
import { playRoute } from '../src/route.js';
import { ENGINE_DIR, openTestEngine, start } from './helpers.js';

const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };
const names = (ledger) => ledger.effects.map((e) => `${e.md}${e.label}`);

describe('资源账本：GET /route 每步的 ledger', () => {
  test('白之落胤路线：账本和引擎重放的状态一致（额外卡组张数、每步用掉的效果、召唤权）', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    const engine = await openTestEngine();
    try {
      const def = BRANDED.routes.find((r) => r.id === 'white-albaz');
      const { status, body } = await get(server.url, `/route?id=${def.id}`);
      assert.equal(status, 200);
      const played = await playRoute(engine, BRANDED, def);
      assert.equal(body.steps.length, played.stepBoards.length);
      // 引擎说的：每步之后额外卡组里的卡、召唤权、到这一步为止发动过的效果
      let activations = 0;
      body.steps.forEach((s, i) => {
        activations += played.stepActivations[i].length;
        const { ledger } = s;
        assert.equal(ledger.extra.remaining, played.stepBoards[i].extra.length, `第 ${s.n} 步的额外卡组张数`);
        assert.equal(ledger.extra.start, played.startBoard.extra.length);
        assert.equal(ledger.normalSummon.used, played.stepNormalSummon[i], `第 ${s.n} 步的召唤权`);
        for (const k of ledger.extra.key) assert.equal(k.inExtra, played.stepBoards[i].extra.filter((c) => c.code === k.code).length, `${k.md} 在不在额外卡组`);
      });
      assert.ok(activations > 10);
      // 对着路线写的步骤：已知的几步
      const at = (n) => body.steps[n - 1].ledger;
      assert.deepEqual(names(at(1)), ['白之落胤①']);
      assert.deepEqual(names(at(2)), ['白之落胤①', '白之落胤②']);
      assert.deepEqual(at(2).effects.filter((e) => e.fresh).map((e) => e.label), ['②'], '只有这一步新用的标 fresh');
      assert.equal(at(1).extra.remaining, 14, '白之落胤①送走一只额外卡组的怪兽');
      assert.equal(at(3).extra.remaining, 13, '同调召唤黑衣龙之艾克利西亚');
      assert.equal(at(14).extra.remaining, 12);
      assert.ok(names(at(7)).includes('白之圣女 艾克利西亚③') && names(at(7)).includes('赫之圣女 卡尔塔西亚③'), '结束阶段回手的是各自的③');
      assert.ok(!names(at(6)).includes('白之圣女 艾克利西亚③'));
      const ice = (n) => at(n).extra.key.find((k) => k.md === '冰剑龙 镜翠幻种');
      assert.equal(ice(13).inExtra, 1);
      assert.equal(ice(14).inExtra, 0);
      assert.deepEqual(ice(14).elsewhere, { monsters: 1 }, '冰剑龙融合召唤后在怪兽区');
      assert.equal(at(17).effects.length, 12);
      assert.equal(at(17).normalSummon.used, false, '这条路线没有通常召唤');
    } finally { server.stop(); }
  });

  test('召唤权：用掉了就不会恢复，写明是第几步用的', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      let seen = 0;
      for (const def of BRANDED.routes) {
        const { body } = await get(server.url, `/route?id=${def.id}`);
        const flags = body.steps.map((s) => s.ledger.normalSummon.used);
        assert.deepEqual(flags, [...flags].sort(), `${def.id}：召唤权用掉了就不会恢复`);
        const first = flags.indexOf(true);
        if (first >= 0) { seen++; assert.equal(body.steps[first].ledger.normalSummon.step, first + 1); }
      }
      assert.ok(seen >= 1, '至少有一条路线用到通常召唤');
    } finally { server.stop(); }
  });

  test('每条路线发动的每个效果都认得出是哪张卡的第几个效果（新路线用到新效果要补账本数据）', async () => {
    const engine = await openTestEngine();
    for (const def of BRANDED.routes) {
      const played = await playRoute(engine, BRANDED, def);
      for (const a of played.stepActivations.flat()) assert.ok(effectOf(BRANDED, a), `${def.id}：认不出 ${a.code} 的效果描述 ${a.description}（${a.zone}）`);
    }
  });

  test('关掉 ledger：每步没有 ledger，/routes 说它关了，别的数据照旧', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR, YUGIOH_FEATURES_OFF: 'ledger' });
    try {
      const { body: list } = await get(server.url, '/routes');
      assert.equal(list.features.ledger, false);
      assert.equal(list.features.tree, true);
      const { body } = await get(server.url, '/route?id=white-albaz');
      assert.ok(body.steps.every((s) => s.ledger === undefined));
      assert.ok(body.blocks.length > 0 && body.steps.every((s) => s.roles && s.block));
    } finally { server.stop(); }
  });

  test('默认全开：/routes 的 features 全是 true，每步有 ledger', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const { body: list } = await get(server.url, '/routes');
      assert.ok(Object.values(list.features).every((v) => v === true));
      const { body } = await get(server.url, '/route?id=white-albaz');
      assert.ok(body.steps.every((s) => s.ledger));
    } finally { server.stop(); }
  });
});

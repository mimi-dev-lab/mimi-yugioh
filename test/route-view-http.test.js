import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { ZONES } from '../src/route-view.js';
import { ENGINE_DIR, start } from './helpers.js';

const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };

describe('路线接口：GET /routes、GET /route?id=', () => {
  test('GET /routes：两条路线，各写需要的起手卡、终场打断数、来源和引擎验证日期', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const { status, body } = await get(server.url, '/routes');
      assert.equal(status, 200);
      assert.deepEqual(body.routes.map((r) => r.id), ['white-albaz', 'branded-fusion']);
      const albaz = body.routes[0];
      assert.deepEqual([albaz.name, albaz.needs.code, albaz.needs.md, albaz.needs.jp], ['基本展开｜白之落胤初动', 73819701, '白之落胤', '白き竜の落胤']);
      assert.equal(albaz.interrupts, 2); // 终场：冰剑龙 镜翠幻种 1 + 赫之圣女 卡尔塔西亚 1，另两只 0
      assert.equal(body.routes[1].needs.md, '烙印融合');
      for (const r of body.routes) {
        assert.match(r.source.url, /^https:\/\/game8\.jp\//);
        assert.equal(r.source.date, '2026-11-20');
        assert.equal(r.verified, '2026-11-24');
      }
    } finally { server.stop(); }
  });

  test('GET /route：每一步都由引擎重放出完整场面，和上一步的差异对得上场面的增减', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      for (const def of BRANDED.routes) {
        const { status, body } = await get(server.url, `/route?id=${def.id}`);
        assert.equal(status, 200, def.id);
        assert.equal(body.steps.length, def.steps.length, `${def.id} 每个路线步骤一个快照`);
        assert.equal(body.steps[0].text, def.steps[0].text);
        let before = body.start; // 起手
        assert.equal(before.hand.length, 5);
        for (const step of body.steps) {
          for (const zone of ZONES) {
            const codes = (cards) => cards.map((c) => c.code).sort((a, b) => a - b);
            const expected = codes(before[zone]);
            for (const c of step.diff[zone].out) expected.splice(expected.indexOf(c.code), 1);
            expected.push(...step.diff[zone].in.map((c) => c.code));
            assert.deepEqual(expected.sort((a, b) => a - b), codes(step.board[zone]), `${def.id} 第 ${step.n} 步 ${zone}：上一步 − 离开 + 进来 应等于这一步`);
            for (const c of step.board[zone]) assert.ok(c.md && c.jp && Number.isInteger(c.sequence), `${def.id} 第 ${step.n} 步 ${zone} 的卡缺名字或位置`);
          }
          before = step.board;
        }
        // 白之落胤线第 1 步：白之落胤从手牌出到场上，额外卡组的阿尔比昂被送去墓地
        if (def.id === 'white-albaz') {
          const first = body.steps[0];
          assert.deepEqual(first.diff.hand.out.map((c) => c.md), ['白之落胤']);
          assert.deepEqual(first.diff.monsters.in.map((c) => c.md), ['白之落胤']);
          assert.deepEqual(first.diff.grave.in.map((c) => c.md), ['烙印龙 阿尔比昂']);
          assert.ok(first.board.monsters.find((c) => c.code === 73819701).fresh, '刚进场的卡带 fresh 标记');
          assert.deepEqual(first.activated.map((c) => c.md), ['白之落胤']);
        }
      }
    } finally { server.stop(); }
  });

  test('末步快照的场上卡和手牌数等于路线写的终场，否则路线必须带 mismatch', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      for (const def of BRANDED.routes) {
        const { body } = await get(server.url, `/route?id=${def.id}`);
        const last = body.steps.at(-1).board;
        const sorted = (cards) => cards.map((c) => c.code).sort((a, b) => a - b);
        const same = sorted(last.monsters).join() === [...def.end.monsters].sort((a, b) => a - b).join()
          && sorted(last.spellTraps).join() === [...def.end.spellTraps].sort((a, b) => a - b).join()
          && last.hand.length === def.end.hand;
        assert.ok(same || body.mismatch, `${def.id} 终场和教程不一致，却没有 mismatch`);
        assert.ok(body.engineDiff.length === 0 || body.mismatch, `${def.id} 引擎重放和教程有差异，却没有 mismatch`);
      }
    } finally { server.stop(); }
  });

  test('终场汇总：打断数等于终场在场各卡打断数之和，每个打断说明靠哪张卡、怎么打断', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const deck = (await get(server.url, '/deck')).body;
      const per = new Map(deck.cards.map((c) => [c.code, c.interrupts]));
      const routes = (await get(server.url, '/routes')).body.routes;
      for (const def of BRANDED.routes) {
        const { body } = await get(server.url, `/route?id=${def.id}`);
        const onField = [...body.end.monsters, ...body.end.spellTraps];
        const sum = onField.reduce((n, c) => n + per.get(c.code), 0);
        assert.equal(body.end.interrupts, sum, def.id);
        assert.equal(routes.find((r) => r.id === def.id).interrupts, sum, `${def.id} 列表和单条的打断数一致`);
        assert.deepEqual(body.end.hand.length, body.steps.at(-1).board.hand.length);
        assert.equal(body.end.breakers.reduce((n, b) => n + b.interrupts, 0), sum);
        for (const b of body.end.breakers) { assert.ok(b.md && b.interruptHow, `${def.id} ${b.code} 的打断说明`); assert.ok(b.interrupts > 0); }
      }
      const fusion = (await get(server.url, '/route?id=branded-fusion')).body;
      assert.ok(fusion.end.spellTraps.some((c) => c.md === '烙印断罪'), '烙印融合线终场盖着烙印断罪');
    } finally { server.stop(); }
  });

  test('没有的路线 id 是 404；缺 id 也是 404', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      assert.equal((await get(server.url, '/route?id=nope')).status, 404);
      assert.equal((await get(server.url, '/route')).status, 404);
    } finally { server.stop(); }
  });

  test('引擎数据缺失：/routes 和 /route 回明确的 503，/deck 照常', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'yugioh-noengine-'));
    const server = await start({ YUGIOH_ENGINE: empty });
    try {
      for (const path of ['/routes', '/route?id=white-albaz']) {
        const { status, body } = await get(server.url, path);
        assert.equal(status, 503, path);
        assert.match(body.error, /引擎数据/);
        assert.match(body.error, /prepare-engine/);
      }
      assert.equal((await get(server.url, '/deck')).status, 200);
      assert.equal((await get(server.url, '/health')).status, 200);
    } finally { server.stop(); }
  });
});

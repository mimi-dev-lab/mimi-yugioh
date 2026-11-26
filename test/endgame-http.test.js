import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { endHas, rankEndgames } from '../src/endgame.js';
import { parseJsonl } from '../src/opening-report.js';
import { ENGINE_DIR, start } from './helpers.js';

const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };
const rows = parseJsonl(readFileSync(new URL('../docs/opening-analysis.jsonl', import.meta.url), 'utf8'));

async function load(env = {}) {
  const server = await start({ YUGIOH_ENGINE: ENGINE_DIR, ...env });
  const { status, body } = await get(server.url, '/endgames');
  const routes = {};
  if (status === 200) for (const def of BRANDED.routes) routes[def.id] = (await get(server.url, `/route?id=${def.id}`)).body;
  return { server, status, body, routes };
}

describe('终场倒推：GET /endgames', () => {
  test('每个目标终场的路线、积木、关键卡都对得上引擎重放的路线：积木按路线的分段、关键卡是那条路线终场里提供打断的卡、打断数一致', async () => {
    const { server, body, routes } = await load();
    try {
      assert.equal(body.hands, BRANDED.endgames.hands);
      assert.equal(body.endgames.length, BRANDED.endgames.list.length);
      for (const e of body.endgames) {
        const r = routes[e.route.id];
        assert.ok(r, `${e.name} 的路线 ${e.route.id}`);
        assert.equal(e.route.steps, r.steps.length);
        assert.equal(e.interrupts, r.end.interrupts);
        assert.equal(e.start.code, r.needs.code);
        assert.deepEqual(e.blocks.map((b) => [b.id, b.from, b.to]), r.blocks.map((b) => [b.id, b.from, b.to]));
        assert.deepEqual(e.keyCards.map((c) => c.code).sort(), r.end.breakers.map((b) => b.code).sort());
        for (const c of e.keyCards) assert.ok(c.md && c.interruptHow, `${c.md} 要写怎么打断`);
      }
    } finally { server.stop(); }
  });

  test('缺一块的补法指向的路线、步、积木都存在；每块不是有补法就是有改走的路线', async () => {
    const { server, body, routes } = await load();
    try {
      const pointer = (p) => { const r = routes[p.id]; assert.ok(r, `路线 ${p.id}`); assert.ok(p.step >= 1 && p.step <= r.steps.length, `${p.id} 第 ${p.step} 步`); return r; };
      for (const e of body.endgames) {
        for (const b of e.blocks) {
          const m = b.missing;
          assert.ok(m.swaps.length + m.skips.length + m.without.length > 0, `${e.name} 缺 ${b.name} 没有任何补法`);
          for (const s of m.swaps) {
            assert.ok(BRANDED.blocks.list.some((x) => x.id === s.block.id) && s.block.id !== b.id);
            for (const p of s.routes) assert.equal(pointer(p).blocks.find((x) => x.id === s.block.id).from, p.step, '换上的积木在那条路线里的第一步');
          }
          for (const s of m.skips) for (const p of s.routes) pointer(p);
          for (const w of m.without) { assert.ok(routes[w.id]); assert.ok(!routes[w.id].blocks.some((x) => x.id === b.id), '改走的路线不用这块'); }
        }
      }
    } finally { server.stop(); }
  });

  test('挑得对：数据里的三个就是按「打断数、500 手里的手数」排出来的前 3，手数是从 JSONL 重算的', async () => {
    const { server, routes } = await load();
    try {
      assert.equal(rows.length, BRANDED.endgames.hands);
      const ranked = rankEndgames(Object.values(routes), rows).slice(0, 3);
      assert.deepEqual(BRANDED.endgames.list.map((e) => [e.keyCards.slice().sort((a, b) => a - b), e.seen]), ranked.map((c) => [c.keys, c.seen]));
      for (const [i, c] of ranked.entries()) {
        assert.ok(c.routes.includes(BRANDED.endgames.list[i].route), `${BRANDED.endgames.list[i].id} 的路线是走到它的路线之一`);
        assert.equal(rows.filter((row) => endHas(row, BRANDED.endgames.list[i].keyCards)).length, BRANDED.endgames.list[i].seen);
      }
    } finally { server.stop(); }
  });

  test('关掉 endgame：/endgames 404，/routes 说它关了，别的功能和路线照旧', async () => {
    const { server, status } = await load({ YUGIOH_FEATURES_OFF: 'endgame' });
    try {
      assert.equal(status, 404);
      const { body: list } = await get(server.url, '/routes');
      assert.equal(list.features.endgame, false);
      assert.equal(list.features.subway, true);
      assert.equal((await get(server.url, '/subway')).status, 200);
      const { body: route } = await get(server.url, '/route?id=white-albaz');
      assert.ok(route.steps[0].ledger, '账本不受影响');
    } finally { server.stop(); }
  });
});

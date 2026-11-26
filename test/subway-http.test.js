import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { ENGINE_DIR, start } from './helpers.js';

const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };

// 服务起一次，取地铁图和每条路线
async function load(env = {}) {
  const server = await start({ YUGIOH_ENGINE: ENGINE_DIR, ...env });
  const { status, body: subway } = await get(server.url, '/subway');
  const routes = {};
  if (status === 200) for (const def of BRANDED.routes) routes[def.id] = (await get(server.url, `/route?id=${def.id}`)).body;
  return { server, status, subway, routes };
}

describe('汇流地铁图：GET /subway', () => {
  test('图里每个站都对应存在的路线步骤：stops 里的路线存在、步号在 1..步数里，枢纽的步是那块积木在那条路线里的第一步，终场站是最后一步', async () => {
    const { server, subway, routes } = await load();
    try {
      assert.ok(subway.stations.length > 15);
      for (const s of subway.stations) {
        assert.ok(s.stops.length >= 1, `${s.label} 没有可跳的步骤`);
        for (const { route: id, step } of s.stops) {
          const r = routes[id];
          assert.ok(r, `${s.label} 指向不存在的路线 ${id}`);
          assert.ok(Number.isInteger(step) && step >= 1 && step <= r.steps.length, `${s.label} 指向 ${id} 的第 ${step} 步，路线只有 ${r.steps.length} 步`);
          if (s.block) assert.equal(r.blocks.find((b) => b.id === s.block)?.from, step, `${s.label} 在 ${id} 里的第一步`);
          if (s.kind === 'end') { assert.equal(step, r.steps.length); assert.equal(s.interrupts, r.end.interrupts); }
        }
        if (s.kind === 'start') for (const { route: id } of s.stops) assert.equal(routes[id].needs.md, s.label, '起手站是这条路线要的起手卡');
      }
    } finally { server.stop(); }
  });

  test('每条路线都走得通：起手站 → 它的每块积木 → 终场站，每一段都有一条记着这条路线的边，边都是从左往右', async () => {
    const { server, subway, routes } = await load();
    try {
      const at = new Map(subway.stations.map((s) => [s.id, s]));
      for (const [id, r] of Object.entries(routes)) {
        const path = [subway.stations.find((s) => s.kind === 'start' && s.stops.some((p) => p.route === id)).id,
          ...r.blocks.map((b) => `block:${b.id}`), `end:${id}`];
        for (let i = 0; i + 1 < path.length; i++) assert.ok(subway.edges.some((e) => e.from === path[i] && e.to === path[i + 1] && e.routes.includes(id)), `${id}：${path[i]} → ${path[i + 1]} 没有边`);
      }
      for (const e of subway.edges) {
        assert.ok(at.get(e.from) && at.get(e.to), '边的两头都是站');
        assert.ok(at.get(e.from).layer < at.get(e.to).layer, `${e.from} → ${e.to} 要从左往右`);
      }
      for (const s of subway.stations) assert.ok(s.layer >= 0 && s.layer < subway.layers && s.row >= 0 && s.row <= subway.rows - 1, `${s.label} 的位置在图里`);
    } finally { server.stop(); }
  });

  test('枢纽是几条路线汇到的站：每个枢纽至少 2 条路线用，起手站和终场站数对得上路线', async () => {
    const { server, subway } = await load();
    try {
      const hubs = subway.stations.filter((s) => s.kind === 'hub');
      assert.ok(hubs.length >= 3);
      for (const h of hubs) assert.ok(h.stops.length >= 2, `${h.label} 只有一条路线用，不是枢纽`);
      assert.equal(subway.stations.filter((s) => s.kind === 'end').length, BRANDED.routes.length);
      const starts = new Set(BRANDED.routes.map((r) => r.needs));
      assert.equal(subway.stations.filter((s) => s.kind === 'start').length, starts.size);
      assert.ok(subway.stations.find((s) => s.label === '落胤起跳').stops.length >= 4, '白之落胤上场这个枢纽汇了好几条路线');
    } finally { server.stop(); }
  });

  test('关掉 subway：/subway 404，/routes 说它关了，路线照旧', async () => {
    const { server, status, routes } = await load({ YUGIOH_FEATURES_OFF: 'subway' });
    try {
      assert.equal(status, 404);
      assert.deepEqual(routes, {});
      const { body: list } = await get(server.url, '/routes');
      assert.equal(list.features.subway, false);
      assert.equal(list.features.ledger, true);
      assert.equal((await get(server.url, '/route?id=white-albaz')).status, 200);
    } finally { server.stop(); }
  });
});

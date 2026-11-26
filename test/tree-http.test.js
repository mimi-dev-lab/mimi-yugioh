import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { leavesOf, walkTree } from '../src/tree.js';
import { ENGINE_DIR, start } from './helpers.js';

const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };

describe('决策树：GET /tree', () => {
  test('叶子的路线都在 /routes 里，每条路线至少一个叶子；回答路径和数据里的树一致；问题有措辞', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const { status, body } = await get(server.url, '/tree');
      assert.equal(status, 200);
      const { body: list } = await get(server.url, '/routes');
      const ids = list.routes.map((r) => r.id);
      for (const l of body.leaves) assert.ok(ids.includes(l.route.id));
      for (const id of ids) assert.ok(body.leaves.some((l) => l.route.id === id), `路线 ${id} 没有叶子`);
      assert.equal(body.leaves.length, leavesOf(BRANDED.tree).length);
      for (const l of body.leaves) {
        const hand = l.path.filter((p) => p.has).map((p) => p.card.code);
        assert.equal(walkTree(BRANDED.tree, hand), l.route.id, '按这条路径上的「有」的卡走，到这个叶子');
        for (const p of l.path) assert.match(p.question, /吗？/);
      }
      for (const l of body.leaves) assert.ok(l.route.name && l.route.steps > 0 && l.route.needs.md);
    } finally { server.stop(); }
  });

  test('关掉 tree：/tree 404，/routes 说它关了，别的功能照旧', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR, YUGIOH_FEATURES_OFF: 'tree' });
    try {
      assert.equal((await get(server.url, '/tree')).status, 404);
      const { body: list } = await get(server.url, '/routes');
      assert.equal(list.features.tree, false);
      assert.equal(list.features.endgame, true);
      assert.equal((await get(server.url, '/endgames')).status, 200);
      assert.equal((await get(server.url, '/subway')).status, 200);
    } finally { server.stop(); }
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { ENGINE_DIR, start } from './helpers.js';

const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };

describe('路线动画接口：GET /route-anim?id=', () => {
  test('每条路线一个 data: 页面和每个位置的开始 / 结束帧；位置数 = 步数 + 1（起手）', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      for (const def of BRANDED.routes) {
        const { status, body } = await get(server.url, `/route-anim?id=${def.id}`);
        assert.equal(status, 200, def.id);
        assert.equal(body.id, def.id);
        assert.match(body.src, /^data:text\/html;base64,/);
        assert.equal(body.starts.length, def.steps.length + 1);
        assert.equal(body.ends.length, def.steps.length + 1);
        body.ends.forEach((end, i) => { assert.ok(end > body.starts[i] && end <= body.duration); if (i) assert.ok(body.starts[i] >= body.ends[i - 1]); });
        const html = Buffer.from(body.src.split(',')[1], 'base64').toString('utf8');
        assert.ok(html.includes('Content-Security-Policy') && html.includes('__hyperframes='), def.id);
        assert.deepEqual(body.stage, { w: 800, h: 700 });
      }
    } finally { server.stop(); }
  });

  test('没有这条路线和缺 id 都是 404；没有卡图时画卡名牌（页面里没有 data:image）', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      assert.equal((await get(server.url, '/route-anim?id=nope')).status, 404);
      assert.equal((await get(server.url, '/route-anim')).status, 404);
      const { body } = await get(server.url, '/route-anim?id=aluber');
      assert.ok(!Buffer.from(body.src.split(',')[1], 'base64').toString('utf8').includes('url(data:image'));
    } finally { server.stop(); }
  });
});

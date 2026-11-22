import assert from 'node:assert/strict';
import { test } from 'node:test';
import { start } from './helpers.js';

test('服务起在 PORT=0：/health 返回 200，没有的路径 404', async () => {
  const server = await start();
  try {
    const res = await fetch(`${server.url}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal((await fetch(`${server.url}/nope`)).status, 404);
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:/);
  } finally {
    server.stop();
  }
});

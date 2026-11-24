import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { dataDir, start } from './helpers.js';

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

// 打牌、提示、结算、首页统计、记卡这些旧功能删掉了：它们的接口都是 404，数据目录里已有的旧文件留在原地，服务不读不写
test('旧接口都是 404，数据目录里的旧日志不动', async () => {
  const data = await dataDir();
  const old = '{"type":"hand"}\n';
  await writeFile(join(data, 'hands.jsonl'), old);
  await writeFile(join(data, 'active.json'), '{"id":"x","seed":1,"hand":[],"startedAt":0}');
  const server = await start({ YUGIOH_DATA: data });
  try {
    const gone = [
      ['POST', '/hand/start'], ['GET', '/hand'], ['POST', '/hand/choose'], ['POST', '/hand/hint'], ['POST', '/hand/end'],
      ['GET', '/home'], ['GET', '/cards'], ['GET', '/quiz'], ['POST', '/quiz/next'], ['POST', '/quiz/answer'],
    ];
    for (const [method, path] of gone) {
      const res = await fetch(`${server.url}${path}`, { method, ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}) });
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.ok((await res.json()).error, `${method} ${path} 回 { error }`);
    }
    assert.deepEqual((await readdir(data)).sort(), ['active.json', 'hands.jsonl']);
    assert.equal(await readFile(join(data, 'hands.jsonl'), 'utf8'), old);
  } finally {
    server.stop();
  }
});

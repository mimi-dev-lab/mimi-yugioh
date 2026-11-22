import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { dataDir, start } from './helpers.js';

const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };

describe('卡信息和卡图：HTTP 接口', () => {
  test('GET /cards：卡组里每张卡有 Master Duel 简中名、角色和三件事', async () => {
    const server = await start();
    try {
      const { status, body } = await get(server.url, '/cards');
      assert.equal(status, 200);
      assert.equal(Object.keys(body.cards).length, Object.keys(BRANDED.cards).length);
      assert.deepEqual(Object.keys(body.cards['73819701']).sort(), ['cost', 'does', 'limit', 'md', 'role']);
      assert.equal(body.cards['73819701'].md, '白之落胤');
      assert.equal(body.cards['73819701'].role, '起手');
      assert.equal(body.cards['45883110'].md, '引导之圣女 库妸㽗'); // 生僻字照 md_name 的码位
    } finally { server.stop(); }
  });

  test('GET /card-image：数据目录 images/ 里有就返回 base64，没有 404，卡号不是纯数字也 404（路径出不了 images/）', async () => {
    const data = await dataDir();
    await mkdir(join(data, 'images'));
    await writeFile(join(data, 'images', '73819701.webp'), Buffer.from('RIFF....WEBP'));
    await writeFile(join(data, 'secret.webp'), 'x');
    const server = await start({ YUGIOH_DATA: data });
    try {
      const ok = await get(server.url, '/card-image?code=73819701');
      assert.equal(ok.status, 200);
      assert.equal(ok.body.type, 'image/webp');
      assert.equal(Buffer.from(ok.body.base64, 'base64').toString(), 'RIFF....WEBP');
      assert.equal((await get(server.url, '/card-image?code=44146295')).status, 404);
      assert.equal((await get(server.url, '/card-image?code=..%2Fsecret')).status, 404);
      assert.equal((await get(server.url, '/card-image')).status, 404);
    } finally { server.stop(); }
  });
});

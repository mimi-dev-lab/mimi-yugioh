import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { dataDir, start } from './helpers.js';

const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };

describe('卡组一览和卡图：HTTP 接口', () => {
  test('GET /deck：主卡组 40 张、额外 15 张，每张卡有简中名、日文名、作用、张数、效果说明和打断能力', async () => {
    const server = await start();
    try {
      const { status, body } = await get(server.url, '/deck');
      assert.equal(status, 200);
      assert.equal(body.name, '烙印');
      assert.deepEqual(body.roles.map((r) => r.name), ['启动', '检索', '融合素材', '终场', '手坑']);
      for (const r of body.roles) {
        assert.deepEqual(Object.keys(r).sort(), ['name', 'note'], '作用的字段');
        assert.ok(r.note.trim(), `${r.name} 缺含义`);
      }
      assert.match(body.source.url, /^https:\/\/game8\.jp\//);
      const count = (zone) => body.cards.filter((c) => c.zone === zone).reduce((n, c) => n + c.count, 0);
      assert.equal(count('main'), 40);
      assert.equal(count('extra'), 15);
      for (const c of body.cards) {
        assert.deepEqual(Object.keys(c).sort(), ['code', 'cost', 'count', 'does', 'interruptHow', 'interrupts', 'jp', 'limit', 'md', 'role', 'zone'], `${c.code} 的字段`);
        assert.ok(body.roles.some((r) => r.name === c.role), `${c.md} 的作用 ${c.role}`);
        // 打断能力：有打断次数就写了怎么打断，没有就是空的
        assert.equal(c.interrupts > 0, c.interruptHow !== '', `${c.md} 的打断数 ${c.interrupts} 和说明「${c.interruptHow}」对不上`);
      }
      const albaz = body.cards.find((c) => c.code === 73819701);
      assert.deepEqual([albaz.md, albaz.jp, albaz.role, albaz.zone, albaz.count, albaz.interrupts, albaz.interruptHow], ['白之落胤', '白き竜の落胤', '启动', 'main', 1, 0, '']);
      const mirrorjade = body.cards.find((c) => c.code === 44146295);
      assert.deepEqual([mirrorjade.role, mirrorjade.zone, mirrorjade.interrupts], ['终场', 'extra', 1]);
      assert.match(mirrorjade.interruptHow, /除外/);
      assert.equal(body.cards.find((c) => c.code === 14558127).role, '手坑'); // 灰流丽
      assert.equal(body.cards.find((c) => c.code === 45883110).md, '引导之圣女 库妸㽗'); // 生僻字照 md_name 的码位
      // 按作用分组排好：同一作用的卡挨在一起，组的先后照 roles
      const order = body.cards.map((c) => body.roles.findIndex((r) => r.name === c.role));
      assert.deepEqual(order, [...order].sort((a, b) => a - b));
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

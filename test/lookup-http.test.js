import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { ENGINE_DIR, start } from './helpers.js';

const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };
const handOf = (id) => BRANDED.routes.find((r) => r.id === id).hand;

describe('起手速查：GET /routes 的 lookup', () => {
  test('关键卡各一项：白之落胤、烙印融合、阿卢绯尔、天底的使徒，加两卡展开的白之圣女、烙印之气炎', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const { status, body } = await get(server.url, '/routes');
      assert.equal(status, 200);
      assert.deepEqual(body.lookup.map((e) => e.card.md), ['白之落胤', '烙印融合', '惨绝戏之导化 阿卢绯尔', '天底的使徒', '白之圣女 艾克利西亚', '烙印之气炎']);
      for (const e of body.lookup) assert.ok(e.card.code && e.card.jp, `${e.card.md} 要带密码和日文名`);
      const by = (md) => body.lookup.find((e) => e.card.md === md);
      assert.deepEqual(by('白之落胤').routes.map((r) => r.id), ['white-albaz']);
      assert.deepEqual(by('烙印融合').routes.map((r) => r.id), ['branded-fusion']);
      assert.deepEqual(by('惨绝戏之导化 阿卢绯尔').routes.map((r) => r.id), ['aluber']);
      assert.deepEqual(by('天底的使徒').routes.map((r) => r.id), ['nadir-servant']);
      assert.deepEqual(by('白之圣女 艾克利西亚').routes.map((r) => r.id), ['white-saint']);
      // 烙印之气炎要搭一张怪兽：搭软绵雀精走一条，搭黑衣龙 阿尔比昂走另一条
      assert.deepEqual(by('烙印之气炎').routes.map((r) => [r.id, r.with.md]), [['high-spirits-fuwalos', '多多迷宝・软绵雀精'], ['high-spirits-shrouded', '黑衣龙 阿尔比昂']]);
      assert.equal(by('烙印融合').routes[0].with, null, '单卡起手没有搭配的卡');
    } finally { server.stop(); }
  });

  test('速查指向的每条路线都在 /routes 里，名字、终场打断数、步数和路线列表一致', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const { body } = await get(server.url, '/routes');
      const listed = new Map(body.routes.map((r) => [r.id, r]));
      const targets = body.lookup.flatMap((e) => [...e.routes, ...e.fallbacks.map((f) => f.route)]);
      assert.ok(targets.length >= 8);
      for (const t of targets) {
        const r = listed.get(t.id);
        assert.ok(r, `速查指向的路线 ${t.id} 不在 /routes 里`);
        assert.deepEqual([t.name, t.interrupts, t.steps], [r.name, r.interrupts, r.steps], t.id);
      }
      // 写死一个值核对：白之落胤线终场 2 个打断（和路线接口测试同一个数）
      assert.equal(body.lookup[0].routes[0].interrupts, 2);
    } finally { server.stop(); }
  });

  test('缺卡改走：每条都写明缺哪张、手里有哪几张、走哪条、为什么；手里的卡在那条路线的起手里，缺的卡不在', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const { body } = await get(server.url, '/routes');
      const by = (md) => body.lookup.find((e) => e.card.md === md);
      const fallbacks = body.lookup.flatMap((e) => e.fallbacks);
      assert.ok(fallbacks.length >= 6);
      for (const f of fallbacks) {
        const hand = handOf(f.route.id);
        assert.ok(f.lack.md && f.how.trim(), f.route.id);
        assert.ok(f.have.length > 0 && f.have.every((c) => hand.includes(c.code)), `${f.route.id}：手里的 ${f.have.map((c) => c.md)} 要在路线起手里`);
        assert.ok(!hand.includes(f.lack.code), `${f.route.id}：缺的 ${f.lack.md} 不该在路线起手里`);
      }
      // 缺烙印融合但有阿卢绯尔 → 阿卢绯尔线（它自己检索烙印融合）
      const noFusion = by('烙印融合').fallbacks.find((f) => f.route.id === 'aluber');
      assert.deepEqual([noFusion.lack.md, noFusion.have.map((c) => c.md)], ['烙印融合', ['惨绝戏之导化 阿卢绯尔']]);
      assert.match(noFusion.how, /检索烙印融合/);
      // 缺白之落胤但有白之圣女 → 白之圣女线
      assert.ok(by('白之落胤').fallbacks.some((f) => f.route.id === 'white-saint' && f.have.some((c) => c.md === '白之圣女 艾克利西亚')));
    } finally { server.stop(); }
  });

  test('引擎数据缺失：/routes 照旧 503，不带半截速查', async () => {
    const server = await start({ YUGIOH_ENGINE: '/nonexistent-yugioh-engine' });
    try {
      const { status, body } = await get(server.url, '/routes');
      assert.equal(status, 503);
      assert.equal(body.lookup, undefined);
    } finally { server.stop(); }
  });
});

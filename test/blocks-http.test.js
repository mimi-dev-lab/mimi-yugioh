import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { ENGINE_DIR, start } from './helpers.js';

const glossary = readFileSync(new URL('../GLOSSARY.md', import.meta.url), 'utf8');
const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };

describe('积木：GET /route 返回的分段', () => {
  test('每条路线的每一步都归到恰好一块积木：分段从第 1 步接到最后一步，不漏不重叠；步骤自己也带着积木 id', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      for (const def of BRANDED.routes) {
        const { status, body } = await get(server.url, `/route?id=${def.id}`);
        assert.equal(status, 200);
        let next = 1;
        for (const b of body.blocks) {
          assert.equal(b.from, next, `${def.id}：积木 ${b.name} 应从第 ${next} 步起`);
          assert.ok(b.to >= b.from && b.to <= body.steps.length, `${def.id}：积木 ${b.name} 的步号 ${b.from}–${b.to}`);
          next = b.to + 1;
        }
        assert.equal(next, body.steps.length + 1, `${def.id}：积木没覆盖到最后一步`);
        for (const step of body.steps) {
          const owners = body.blocks.filter((b) => b.from <= step.n && step.n <= b.to);
          assert.equal(owners.length, 1, `${def.id} 第 ${step.n} 步`);
          assert.equal(step.block, owners[0].id, `${def.id} 第 ${step.n} 步的 block`);
        }
      }
    } finally { server.stop(); }
  });

  test('积木名唯一；同一块积木在所有路线里名字、要什么、给什么都一样；每块都写了要什么 → 给什么；每块用在 2 条以上路线', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const byId = new Map();
      const routesOf = new Map();
      for (const def of BRANDED.routes) {
        const { body } = await get(server.url, `/route?id=${def.id}`);
        for (const b of body.blocks) {
          const { from, to, ...info } = b;
          if (byId.has(b.id)) assert.deepEqual(byId.get(b.id), info, `${def.id} 里的 ${b.name} 和别处不一样`);
          byId.set(b.id, info);
          routesOf.set(b.id, new Set([...(routesOf.get(b.id) ?? []), def.id]));
        }
      }
      const blocks = [...byId.values()];
      assert.ok(blocks.length >= 6 && blocks.length <= 10, `${blocks.length} 块积木`);
      assert.equal(new Set(blocks.map((b) => b.name)).size, blocks.length, '积木名有重复');
      for (const b of blocks) {
        assert.ok(b.needs.trim().length >= 8 && b.gives.trim().length >= 8, `${b.name} 缺要什么 / 给什么`);
        assert.ok(routesOf.get(b.id).size >= 2, `${b.name} 只在 ${routesOf.get(b.id).size} 条路线里`);
      }
      for (const b of blocks) assert.match(b.color, /^#[0-9a-f]{6}$/i, b.name);
      assert.equal(new Set(blocks.map((b) => b.color)).size, blocks.length, '积木颜色有重复');
      assert.ok(['落胤起跳', '圣女接力', '结束阶段大回收'].every((n) => blocks.some((b) => b.name === n)));
    } finally { server.stop(); }
  });

  test('GLOSSARY.md 解释了「积木」；覆盖率报告列出每块积木', () => {
    assert.ok(glossary.includes('**积木**'));
    const report = readFileSync(new URL('../docs/opening-analysis.md', import.meta.url), 'utf8');
    for (const b of BRANDED.blocks.list) assert.ok(report.includes(`| ${b.name} |`), `报告里没有积木 ${b.name}`);
  });
});

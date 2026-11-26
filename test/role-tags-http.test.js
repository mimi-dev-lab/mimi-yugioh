import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { checkDeck } from '../src/deck.js';
import { checkRoleTags } from '../src/roles.js';
import { ENGINE_DIR, start } from './helpers.js';

const get = async (url, path) => { const res = await fetch(`${url}${path}`); return { status: res.status, body: await res.json() }; };
const glossary = readFileSync(new URL('../GLOSSARY.md', import.meta.url), 'utf8');
const midfield = (step) => [...step.board.monsters, ...step.board.spellTraps];

describe('卡的作用标签：接口返回的数据', () => {
  test('GET /deck：带术语表（词、解释、颜色），每张卡带默认作用和原因；术语表的词都写进了 GLOSSARY.md', async () => {
    const server = await start();
    try {
      const { body } = await get(server.url, '/deck');
      assert.ok(body.roleTerms.length >= 10);
      const names = body.roleTerms.map((t) => t.name);
      for (const term of body.roleTerms) {
        assert.ok(term.note.trim() && /^#[0-9a-f]{6}$/i.test(term.color), term.name);
        assert.ok(glossary.includes(`**${term.name}**`), `GLOSSARY.md 没有解释「${term.name}」`);
      }
      for (const c of body.cards) {
        assert.ok(c.roleTags.length >= 1 && c.roleTags.length <= 2, `${c.md} 的默认作用`);
        for (const tag of c.roleTags) assert.ok(names.includes(tag), `${c.md} 的 ${tag} 不在术语表里`);
        assert.ok(c.roleWhy.length >= 10, `${c.md} 的默认原因`);
      }
      assert.deepEqual(body.cards.find((c) => c.md === '白之落胤').roleTags, ['初动', '展开点']);
    } finally { server.stop(); }
  });

  test('GET /route：每一步中场（怪兽区和魔陷区）的每张卡都有作用和原因，刚上场的卡这一步自己写了原因', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const names = BRANDED.roleTags.terms.map((t) => t.name);
      for (const def of BRANDED.routes) {
        const { body } = await get(server.url, `/route?id=${def.id}`);
        for (const step of body.steps) {
          const mid = midfield(step);
          assert.deepEqual(step.roles.map((r) => r.code).sort(), [...new Set(mid.map((c) => c.code))].sort(), `${def.id} 第 ${step.n} 步的作用列表和中场对不上`);
          for (const r of step.roles) {
            assert.ok(r.md && r.tags.length >= 1 && r.tags.length <= 2 && r.why.length >= 10, `${def.id} 第 ${step.n} 步 ${r.md}`);
            for (const tag of r.tags) assert.ok(names.includes(tag), `${def.id} 第 ${step.n} 步 ${r.md} 的 ${tag} 不在术语表里`);
          }
          for (const c of mid.filter((x) => x.fresh)) {
            assert.equal(step.roles.find((r) => r.code === c.code).from, 'step', `${def.id} 第 ${step.n} 步刚上场的 ${c.md} 要写这一步的作用`);
          }
        }
      }
    } finally { server.stop(); }
  });

  test('同一张卡在不同路线、不同步骤作用不同：白之落胤、白之圣女、赫之圣女 卡尔塔西亚、阿卢绯尔、引导之圣女 库妸㽗', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const routes = {};
      for (const def of BRANDED.routes) routes[def.id] = (await get(server.url, `/route?id=${def.id}`)).body;
      const roleOf = (id, n, md) => routes[id].steps[n - 1].roles.find((r) => r.md === md).tags.join('+');
      // 白之落胤：白之落胤线是起点并堆墓，烙印融合线里是第二轮展开的开头
      assert.equal(roleOf('white-albaz', 1, '白之落胤'), '初动+堆墓');
      assert.equal(roleOf('branded-fusion', 7, '白之落胤'), '展开点');
      // 白之圣女：同调的素材，或者只是留场
      assert.equal(roleOf('white-albaz', 2, '白之圣女 艾克利西亚'), '素材');
      assert.equal(roleOf('branded-fusion', 8, '白之圣女 艾克利西亚'), '留场');
      // 卡尔塔西亚：从手牌特召躲灰流丽，或者被库妸㽗从墓地叫回
      assert.equal(roleOf('white-saint', 6, '赫之圣女 卡尔塔西亚'), '打断+防手坑');
      assert.equal(roleOf('white-albaz', 15, '赫之圣女 卡尔塔西亚'), '打断+资源回收');
      // 阿卢绯尔：同一条线里先是检索，再变成素材；三卡线里变成诱饵和留场
      assert.equal(roleOf('aluber', 2, '惨绝戏之导化 阿卢绯尔'), '检索');
      assert.equal(roleOf('aluber', 3, '惨绝戏之导化 阿卢绯尔'), '素材');
      assert.equal(roleOf('branded-fusion-aluber', 2, '惨绝戏之导化 阿卢绯尔'), '检索+诱饵');
      // 库妸㽗：同一条线里展开点 → 堆墓 → 留场
      assert.deepEqual([4, 5, 15].map((n) => roleOf('white-albaz', n, '引导之圣女 库妸㽗')), ['展开点', '堆墓', '留场+防手坑']);
    } finally { server.stop(); }
  });

  test('没写这一步的卡沿用最近写的并标出自第几步起；默认只在从没写过时用', async () => {
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR });
    try {
      const { body } = await get(server.url, '/route?id=white-albaz');
      const quem7 = body.steps[6].roles.find((r) => r.md === '引导之圣女 库妸㽗');
      assert.deepEqual([quem7.from, quem7.since, quem7.tags], ['carried', 5, ['堆墓']]);
      const quem5 = body.steps[4].roles.find((r) => r.md === '引导之圣女 库妸㽗');
      assert.deepEqual([quem5.from, quem5.since], ['step', 5]);
    } finally { server.stop(); }
  });
});

describe('作用数据的检查', () => {
  test('烙印的作用数据没有问题，卡组检查也带上它', () => {
    assert.deepEqual(checkRoleTags(BRANDED), []);
    assert.deepEqual(checkDeck(BRANDED), []);
  });

  test('查得出：作用词不在术语表、缺默认作用、原因太短、原因重复、步号越界', () => {
    const bad = structuredClone(BRANDED);
    bad.roleTags.defaults[73819701].tags = ['瞎写'];
    delete bad.roleTags.defaults[62962630];
    bad.roleTags.routes['white-albaz'][1][73819701].why = '太短';
    bad.roleTags.routes['white-albaz'][2][55273560].why = bad.roleTags.routes['white-albaz'][3][55273560]?.why ?? bad.roleTags.routes['aluber'][10][55273560].why;
    bad.roleTags.routes['white-albaz'][99] = { 55273560: { tags: ['素材'], why: '这一步不存在的步号' } };
    const problems = checkRoleTags(bad).join('\n');
    assert.match(problems, /瞎写 不在术语表里/);
    assert.match(problems, /缺默认作用/);
    assert.match(problems, /缺原因/);
    assert.match(problems, /一字不差/);
    assert.match(problems, /没有第 99 步/);
  });

  test('所有路线都标完：每条路线的每个刚上场的中场卡在作用数据里有这一步的条目（对 BRANDED 的 9 条路线都有数据）', () => {
    assert.deepEqual(Object.keys(BRANDED.roleTags.routes).sort(), BRANDED.routes.map((r) => r.id).sort());
  });
});

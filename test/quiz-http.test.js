import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { dataDir, start } from './helpers.js';

const api = (url) => async (method, path, body) => {
  const res = await fetch(`${url}${path}`, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
};
const rowsOf = async (dir) => (await readFile(join(dir, 'quiz.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
const total = Object.keys(BRANDED.cards).length;
const byName = (md) => Object.entries(BRANDED.cards).find(([, c]) => c.md === md);

// 页面看得到的题面 → 正确的选项下标和角色（用卡组数据推，服务不会把对错发出来）
function solve(q) {
  if (q.kind === 'find') return { option: q.options.findIndex((o) => byName(o.text)[1].does === q.prompt.slice('哪张卡：'.length)), roles: [] };
  if (q.kind === 'identify') return { option: q.options.findIndex((o) => o.text === BRANDED.cards[q.image].md), roles: [BRANDED.cards[q.image].role] };
  const card = BRANDED.cards[q.image];
  const [key] = [['does', '干什么'], ['cost', '条件代价'], ['limit', '限制']].find(([, l]) => l === q.missing);
  return { option: q.options.findIndex((o) => o.text === card[key]), roles: [] };
}

describe('记卡：HTTP 接口', () => {
  async function withServer(fn) {
    const data = await dataDir();
    const server = await start({ YUGIOH_DATA: data });
    try { return await fn(api(server.url), data); } finally { server.stop(); }
  }

  test('GET /quiz：一开始每张卡都到期；出题不泄露对错；没出题就答是 404；选项下标越界、角色不认识是 400', () => withServer(async (call) => {
    assert.deepEqual((await call('GET', '/quiz')).body, { due: total, reviewing: 0, fresh: total });
    assert.equal((await call('POST', '/quiz/answer', { option: 0 })).status, 404);
    const next = await call('POST', '/quiz/next');
    assert.equal(next.status, 200);
    const q = next.body;
    assert.equal(q.done, false);
    assert.equal(q.due, total);
    assert.equal(q.options.length, 4);
    assert.deepEqual(q.history, []);
    assert.equal(q.lastMs, null);
    for (const leak of ['answer', 'correct', 'index']) assert.ok(!JSON.stringify(q).includes(`"${leak}"`), `题面里有 ${leak}`);
    assert.equal((await call('POST', '/quiz/answer', { option: 4 })).status, 400);
    assert.equal((await call('POST', '/quiz/answer', { option: 0, roles: ['不存在'] })).status, 400);
    assert.equal((await call('POST', '/quiz/answer', {})).status, 400);
  }));

  test('答对（很快）：评 Easy、8 天后到期、日志追加一行带 FSRS 状态，到期张数少一；答完这一题就没有了', () => withServer(async (call, data) => {
    const q = (await call('POST', '/quiz/next')).body;
    const right = solve(q);
    assert.ok(right.option >= 0);
    const res = await call('POST', '/quiz/answer', right);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.correct, true);
    assert.equal(res.body.rating, 'Easy');
    assert.ok(res.body.ms >= 0 && res.body.ms < 5000);
    assert.equal(res.body.dueInMs, 8 * 86_400_000);
    assert.equal(res.body.answerIndex, right.option);
    assert.equal(res.body.card.md, BRANDED.cards[res.body.card.code].md);
    assert.deepEqual(Object.keys(res.body.card).sort(), ['code', 'cost', 'does', 'limit', 'md', 'role']);
    const rows = await rowsOf(data);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].type, rows[0].code, rows[0].kind, rows[0].correct, rows[0].rating], ['answer', res.body.card.code, q.kind, true, 'Easy']);
    assert.equal(rows[0].card.reps, 1);
    assert.equal((await call('GET', '/quiz')).body.due, total - 1);
    assert.equal((await call('POST', '/quiz/answer', right)).status, 404, '一道题只能答一次');
  }));

  test('答错：评 Again、1 分钟后再到期；identify 名字对了角色错也算错', () => withServer(async (call, data) => {
    let q = (await call('POST', '/quiz/next')).body;
    const right = solve(q);
    let wrong = q.kind === 'identify' ? { option: right.option, roles: [] } : { option: (right.option + 1) % 4, roles: [] };
    let res = await call('POST', '/quiz/answer', wrong);
    assert.equal(res.body.correct, false);
    assert.equal(res.body.rating, 'Again');
    assert.equal(res.body.dueInMs, 60_000);
    assert.equal((await rowsOf(data))[0].correct, false);
    // 再换一道 identify（随机，最多试 30 次）：只选对名字不选角色
    for (let i = 0; i < 30; i++) {
      q = (await call('POST', '/quiz/next')).body;
      if (q.kind === 'identify') break;
    }
    if (q.kind === 'identify') {
      res = await call('POST', '/quiz/answer', { option: solve(q).option, roles: [] });
      assert.equal(res.body.correct, false);
    }
  }));

  test('每张卡答一遍之后没有到期的卡了：POST /quiz/next 返回 done，GET /quiz 是 0', () => withServer(async (call) => {
    for (let i = 0; i < total; i++) {
      const q = (await call('POST', '/quiz/next')).body;
      assert.equal(q.done, false, `第 ${i + 1} 题`);
      assert.equal((await call('POST', '/quiz/answer', solve(q))).body.correct, true);
    }
    assert.deepEqual((await call('POST', '/quiz/next')).body, { done: true, due: 0 });
    assert.deepEqual((await call('GET', '/quiz')).body, { due: 0, reviewing: 0, fresh: 0 });
  }));

  test('服务重启后到期状态还在（读的是数据目录里的日志）', async () => {
    const data = await dataDir();
    const first = await start({ YUGIOH_DATA: data });
    try { const call = api(first.url); await call('POST', '/quiz/answer', solve((await call('POST', '/quiz/next')).body)); } finally { first.stop(); }
    const second = await start({ YUGIOH_DATA: data });
    try { assert.equal((await api(second.url)('GET', '/quiz')).body.due, total - 1); } finally { second.stop(); }
  });
});

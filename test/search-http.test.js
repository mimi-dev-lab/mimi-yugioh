import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { deal, handKey } from '../src/hand.js';
import { indicesFor } from '../src/route.js';
import { SEARCH_BUDGET_MS, searchVersion } from '../src/search.js';
import { BRICK_SEED, SAME_FIVE_SEEDS, WHITE_ALBAZ_SEED, withServer } from './helpers.js';

const ROUTE = BRANDED.routes.find((r) => r.id === 'white-albaz');
const FLAT = ROUTE.steps.flatMap((s) => s.do).filter((r) => r !== 'finish');
const codeOf = (md) => Number(Object.entries(BRANDED.cards).find(([, c]) => c.md === md)[0]);
const cacheFile = (data, seed) => join(data, 'search', `${handKey(deal(BRANDED, seed).hand)}.json`);
const readCache = async (data, seed) => JSON.parse(await readFile(cacheFile(data, seed), 'utf8'));
// 等缓存里出现满足 until 的条目。搜索的时间上限是 SEARCH_BUDGET_MS，再留 30 秒余量
async function waitForCache(data, seed, until = () => true) {
  const deadline = Date.now() + SEARCH_BUDGET_MS + 30000;
  while (Date.now() < deadline) {
    try { const entry = await readCache(data, seed); if (until(entry)) return entry; } catch { /* 还没有 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('搜索缓存一直没出现');
}
// 往临时数据目录里放一条缓存（版本是现行的）：默认是 Game8 白之落胤线当「搜出的路线」
async function seedCache(data, seed, extra = {}) {
  await mkdir(join(data, 'search'), { recursive: true });
  await writeFile(cacheFile(data, seed), JSON.stringify({ v: searchVersion(BRANDED), hand: [...deal(BRANDED, seed).hand].sort((a, b) => a - b), seed, budgetMs: SEARCH_BUDGET_MS, timedOut: false, value: 14, steps: ROUTE.steps, nodes: 0, elapsedMs: 0, ...extra }));
}
async function playFlat(call, from = 0) {
  let state = (await call('GET', '/hand')).body;
  for (const response of FLAT.slice(from)) {
    const res = await call('POST', '/hand/choose', { indices: indicesFor(state.prompt, response) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    state = res.body;
  }
  return state;
}

describe('搜索与提示：HTTP 接口', () => {
  test('开局时后台搜，搜完写进缓存；同一起手再来一手不重搜，结算用缓存里的路线（基准来源 search）', () => withServer(async (call, data) => {
    await call('POST', '/hand/start', { seed: BRICK_SEED });
    const cached = await waitForCache(data, BRICK_SEED);
    assert.equal(cached.timedOut, false);
    assert.ok(Array.isArray(cached.steps));
    const before = await readFile(cacheFile(data, BRICK_SEED), 'utf8');
    const first = (await call('POST', '/hand/end')).body;
    assert.equal(first.benchmark.search, 'done');
    assert.equal(first.benchmark.source, 'search');
    assert.equal(first.benchmark.provisional, false);
    assert.ok(first.bestValue >= first.userValue);

    await call('POST', '/hand/start', { seed: BRICK_SEED });
    const second = (await call('POST', '/hand/end')).body;
    assert.equal(second.benchmark.search, 'done');
    assert.equal(await readFile(cacheFile(data, BRICK_SEED), 'utf8'), before); // 缓存没被重写：没有重搜
  }));

  test('缓存里的路线就是基准：往缓存放一条编的路线，结算按它算，来源 search', () => withServer(async (call, data) => {
    await seedCache(data, WHITE_ALBAZ_SEED);
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    await playFlat(call);
    const s = (await call('POST', '/hand/end')).body;
    assert.deepEqual([s.benchmark.source, s.benchmark.search, s.benchmark.routeId], ['search', 'done', undefined]);
    assert.equal(s.bestValue, 14); // 编的路线是 Game8 那条，值 14；真搜出来的更高，所以这个数证明读的是缓存
    assert.equal(s.fieldScore, 100);
    assert.equal(s.divergeStep, null);
    assert.deepEqual(s.curve.best, s.curve.user);
    assert.deepEqual(s.bestBoard.monsters.sort(), ['冰剑龙 镜翠幻种', '引导之圣女 库妸㽗', '赫之圣女 卡尔塔西亚', '黑衣龙之艾克利西亚'].sort());
    assert.equal((await readCache(data, WHITE_ALBAZ_SEED)).nodes, 0); // 缓存没被改
    const line = (await readFile(join(data, 'hands.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l)).at(-1);
    assert.equal(line.benchmark.source, 'search');
  }));

  test('搜索超时：结算照样返回，基准不是 search，缓存标超时，同一手不重搜', () => withServer(async (call, data) => {
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    const cached = await waitForCache(data, WHITE_ALBAZ_SEED);
    assert.equal(cached.timedOut, true);
    await playFlat(call);
    const s = (await call('POST', '/hand/end')).body;
    assert.equal(s.benchmark.search, 'timed-out');
    assert.equal(s.benchmark.source, 'game8'); // 超时的结果不当基准，退回 Game8
    assert.equal(s.fieldScore, 100);
    const before = await readFile(cacheFile(data, WHITE_ALBAZ_SEED), 'utf8');
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    await call('POST', '/hand/end');
    assert.equal(await readFile(cacheFile(data, WHITE_ALBAZ_SEED), 'utf8'), before);
  }, { YUGIOH_SEARCH_MS: '1' })); // 上限 1 毫秒：一开始就超时

  test('没搜完就结算：用另外两种基准并注明 pending；没有 Game8 路线时 provisional', () => withServer(async (call) => {
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    const s = (await call('POST', '/hand/end')).body; // 马上结算，白之落胤那手要搜二三十秒
    assert.equal(s.benchmark.search, 'pending');
    assert.notEqual(s.benchmark.source, 'search');
  }));

  test('提示：在最好路线上就给路线的下一个回应，计一次提示，结算提示系数 0.8', () => withServer(async (call, data) => {
    await seedCache(data, WHITE_ALBAZ_SEED);
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    let state = (await call('GET', '/hand')).body;
    assert.equal(state.hints, 0);
    const first = await call('POST', '/hand/hint');
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(first.body.indices, indicesFor(state.prompt, FLAT[0]));
    assert.match(first.body.text, /白之落胤/);
    assert.equal(first.body.hints, 1);
    state = (await call('POST', '/hand/choose', { indices: first.body.indices })).body;
    assert.equal(state.hints, 1);
    const second = await call('POST', '/hand/hint');
    assert.deepEqual(second.body.indices, indicesFor(state.prompt, FLAT[1]));
    assert.equal(second.body.hints, 2);
    await call('POST', '/hand/choose', { indices: second.body.indices });
    await playFlat(call, 2);
    const ended = (await call('POST', '/hand/end')).body;
    assert.ok(Math.abs(ended.hintFactor - 0.64) < 1e-9, String(ended.hintFactor));
    const line = (await readFile(join(data, 'hands.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l)).at(-1);
    assert.equal(line.hints, 2);
  }));

  test('提示：走偏之后从当前局面再搜，不照路线的下一个回应（那个回应在当前提示里碰巧也合法）', () => withServer(async (call, data) => {
    // 编的缓存路线：先召唤封锁鸟，再放第 2 格。用户改召唤别的怪兽，到「放哪一格」的提示，路线的下一个回应 { place: 1 } 在这里也合法；
    // 再搜的结果是搜索只试的第一格（{ place: 0 }）。给出第 2 格就是没查是不是偏离
    await seedCache(data, WHITE_ALBAZ_SEED, { steps: [{ text: 'x', do: [{ idle: 'summon', code: codeOf('抽牌小丑与封锁鸟') }, { place: 1 }, 'finish'] }] });
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    const idle = (await call('GET', '/hand')).body;
    const other = idle.prompt.options.findIndex((o) => o.action === 'summon' && o.md === '白之圣女 艾克利西亚');
    const off = (await call('POST', '/hand/choose', { indices: [other] })).body;
    assert.equal(off.prompt.kind, 'place');
    assert.ok(off.prompt.options.length >= 2);
    const hint = await call('POST', '/hand/hint');
    assert.equal(hint.status, 200, JSON.stringify(hint.body));
    assert.deepEqual(hint.body.indices, [0]);
    const taken = await call('POST', '/hand/choose', { indices: hint.body.indices });
    assert.equal(taken.status, 200, JSON.stringify(taken.body));
    assert.equal(taken.body.hints, 1);
  }));

  test('提示：用户选了路线上同一步的另一个格子不算偏离，接着给路线的下一步', () => withServer(async (call, data) => {
    const first = { idle: 'spell-set', code: codeOf('超融合') };
    const next = { idle: 'monster-set', code: codeOf('抽牌小丑与封锁鸟') }; // 搜索不会试盖放没有打断数的卡，所以再搜的结果不会是它
    await seedCache(data, WHITE_ALBAZ_SEED, { steps: [{ text: 'x', do: [first, { place: 0 }, 'pass', next, 'finish'] }] });
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    let state = (await call('GET', '/hand')).body;
    state = (await call('POST', '/hand/choose', { indices: indicesFor(state.prompt, first) })).body;
    assert.equal(state.prompt.kind, 'place');
    state = (await call('POST', '/hand/choose', { indices: [1] })).body; // 路线放第 1 格，用户放第 2 格
    assert.equal(state.prompt.kind, 'chain');
    state = (await call('POST', '/hand/choose', { indices: indicesFor(state.prompt, 'pass') })).body;
    const hint = await call('POST', '/hand/hint');
    assert.equal(hint.status, 200, JSON.stringify(hint.body));
    assert.deepEqual(hint.body.indices, indicesFor(state.prompt, next));
  }));

  test('提示：搜索没搜完时，用户在 Game8 路线的前缀上就给 Game8 路线的下一步，不再搜（再搜要烧满 5 秒）', () => withServer(async (call) => {
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    const t0 = Date.now();
    let state = (await call('GET', '/hand')).body;
    for (let i = 0; i < 3; i++) {
      const hint = await call('POST', '/hand/hint');
      assert.equal(hint.status, 200, JSON.stringify(hint.body));
      assert.deepEqual(hint.body.indices, indicesFor(state.prompt, FLAT[i]));
      state = (await call('POST', '/hand/choose', { indices: hint.body.indices })).body;
    }
    assert.ok(Date.now() - t0 < 4000, `三个提示用了 ${Date.now() - t0} 毫秒`);
  }, { YUGIOH_SEARCH_MS: '0' }));

  test('提示：搜索没搜完，用户又不在 Game8 路线上，就再搜', () => withServer(async (call) => {
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    const idle = (await call('GET', '/hand')).body;
    const off = (await call('POST', '/hand/choose', { indices: [idle.prompt.options.findIndex((o) => o.action === 'summon' && o.md === '白之圣女 艾克利西亚')] })).body;
    const hint = await call('POST', '/hand/hint');
    assert.equal(hint.status, 200, JSON.stringify(hint.body));
    assert.deepEqual(hint.body.indices, [0]); // 放哪一格：再搜只试第一格；Game8 路线这时没有可照的回应
    assert.equal(off.prompt.kind, 'place');
  }, { YUGIOH_SEARCH_MS: '0' }));

  test('回合已经结束或没有进行中的一手：提示 409 / 404', () => withServer(async (call) => {
    assert.equal((await call('POST', '/hand/hint')).status, 404);
    await call('POST', '/hand/start', { seed: BRICK_SEED });
    const idle = (await call('GET', '/hand')).body;
    const over = (await call('POST', '/hand/choose', { indices: [idle.prompt.options.findIndex((o) => o.action === 'end-turn')] })).body;
    assert.equal(over.status, 'turn-over');
    assert.equal((await call('POST', '/hand/hint')).status, 409);
    assert.equal((await call('GET', '/hand')).body.hints, 0); // 要不到提示就不计
  }, { YUGIOH_SEARCH_MS: '0' }));

  test('不同种子发到同样的 5 张牌：第二手用缓存，不重搜', () => withServer(async (call, data) => {
    const [first, second] = SAME_FIVE_SEEDS;
    assert.equal(handKey(deal(BRANDED, first).hand), handKey(deal(BRANDED, second).hand));
    await call('POST', '/hand/start', { seed: first });
    await waitForCache(data, first);
    const before = await readFile(cacheFile(data, first), 'utf8');
    await call('POST', '/hand/end');
    await call('POST', '/hand/start', { seed: second });
    const settled = (await call('POST', '/hand/end')).body;
    assert.equal(settled.benchmark.search, 'done');
    assert.equal(settled.benchmark.source, 'search');
    assert.equal(await readFile(cacheFile(data, second), 'utf8'), before); // 缓存没被重写
  }));

  test('缓存里的路线在这手的种子下重放不了：这次结算注明 replay-failed 不当基准，并用这手的种子重搜、覆盖缓存', () => withServer(async (call, data) => {
    await seedCache(data, BRICK_SEED, { seed: 99, value: 50, steps: [{ text: 'x', do: [{ idle: 'summon', code: 12345 }, 'finish'] }] });
    await call('POST', '/hand/start', { seed: BRICK_SEED });
    const settled = (await call('POST', '/hand/end')).body;
    assert.equal(settled.benchmark.search, 'replay-failed');
    assert.notEqual(settled.benchmark.source, 'search');
    const fresh = await waitForCache(data, BRICK_SEED, (entry) => entry.seed === BRICK_SEED);
    assert.equal(fresh.timedOut, false);
    await call('POST', '/hand/start', { seed: BRICK_SEED });
    assert.equal((await call('POST', '/hand/end')).body.benchmark.search, 'done'); // 以后这手不再卡在暂定
  }));

  test('版本对不上的缓存不算数：重搜并覆盖，结算不用旧路线', () => withServer(async (call, data) => {
    await seedCache(data, BRICK_SEED, { v: '旧版本', value: 99 });
    await call('POST', '/hand/start', { seed: BRICK_SEED });
    const fresh = await waitForCache(data, BRICK_SEED, (entry) => entry.v === searchVersion(BRANDED));
    assert.ok(fresh.value < 99);
  }));

  test('超时的缓存：上限调大之后重搜', () => withServer(async (call, data) => {
    await seedCache(data, BRICK_SEED, { timedOut: true, budgetMs: 1, value: 3 });
    await call('POST', '/hand/start', { seed: BRICK_SEED });
    const fresh = await waitForCache(data, BRICK_SEED, (entry) => !entry.timedOut);
    assert.ok(fresh.budgetMs > 1);
  }));

  test('没有缓存也没在搜（不搜索的设置）：结算的搜索状态是 none', () => withServer(async (call) => {
    await call('POST', '/hand/start', { seed: BRICK_SEED });
    assert.equal((await call('POST', '/hand/end')).body.benchmark.search, 'none');
  }, { YUGIOH_SEARCH_MS: '0' }));
});

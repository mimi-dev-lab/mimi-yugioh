import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { handKey } from '../src/hand.js';
import { openSearchCache } from '../src/search-cache.js';
import { searchVersion } from '../src/search.js';

const DECK = { name: '测试卡组' };
const HAND = [5, 4, 3, 2, 1];
const KEY = handKey(HAND);
const STEPS = [{ text: 'x', do: ['end-turn'] }];
const settle = () => new Promise((resolve) => setImmediate(resolve));

// 内存里的 store 和可编排的 search：calls 记每次搜索的参数，results 是依次返回的结果（Error 就抛）
function setup({ budgetMs = 1000, entries = {}, results = [] } = {}) {
  const files = new Map(Object.entries(entries));
  const store = { readSearch: (key) => files.get(key) ?? null, writeSearch: (key, entry) => files.set(key, entry) };
  const calls = [];
  const search = async (hand, seed, options) => {
    calls.push({ hand, seed, ...options });
    const next = results.shift() ?? { value: 5, steps: STEPS, timedOut: false };
    if (next instanceof Error) throw next;
    return next;
  };
  const cache = openSearchCache({ store, deck: DECK, search, now: () => 42, budgetMs, onError: () => {} });
  return { cache, files, calls };
}
const entry = (extra) => ({ v: searchVersion(DECK), hand: [1, 2, 3, 4, 5], seed: 1, budgetMs: 1000, timedOut: false, value: 5, steps: STEPS, ...extra });

describe('搜索缓存', () => {
  test('没有条目：后台搜，搜的时候是 pending，搜完写进缓存（带版本、起手排序、种子、上限），变成 done', async () => {
    const { cache, files, calls } = setup();
    assert.equal(cache.state(HAND).status, 'none'); // 没有条目也没在搜：不是 failed
    cache.ensure(HAND, 7);
    assert.equal(cache.state(HAND).status, 'pending');
    await settle();
    assert.deepEqual(cache.state(HAND), { status: 'done', steps: STEPS });
    assert.deepEqual(files.get(KEY), { v: searchVersion(DECK), hand: [1, 2, 3, 4, 5], seed: 7, budgetMs: 1000, at: 42, value: 5, steps: STEPS, timedOut: false });
    cache.ensure(HAND, 7);
    await settle();
    assert.equal(calls.length, 1); // 有可用的条目：不重搜
  });

  test('正在搜的不重开', async () => {
    const { cache, calls } = setup();
    cache.ensure(HAND, 1);
    cache.ensure(HAND, 1);
    await settle();
    assert.equal(calls.length, 1);
  });

  test('版本对不上的条目当没有：不算数，重搜后覆盖', async () => {
    const { cache, files, calls } = setup({ entries: { [KEY]: entry({ v: '旧版本', value: 999 }) } });
    assert.equal(cache.state(HAND).status, 'none');
    cache.ensure(HAND, 1);
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(files.get(KEY).v, searchVersion(DECK));
    assert.equal(files.get(KEY).value, 5);
  });

  test('版本随搜索常量和卡组名变', () => {
    assert.notEqual(searchVersion({ name: 'a' }), searchVersion({ name: 'b' }));
  });

  test('版本随卡组数据变：打断数、路线、起手类型、卡组张数改了，旧缓存就作废', () => {
    const deck = { name: 'a', cards: { 1: { interrupts: 1, role: '起手' } }, main: [{ code: 1, count: 3 }], extra: [], handTypes: [{ id: 'x', has: [1] }], routes: [{ id: 'r', steps: [{ text: 't', do: ['finish'] }] }] };
    const same = JSON.parse(JSON.stringify(deck));
    assert.equal(searchVersion(deck), searchVersion(same));
    const changed = [
      { ...same, cards: { 1: { interrupts: 2, role: '起手' } } },
      { ...same, routes: [{ id: 'r', steps: [{ text: 't', do: [] }] }] },
      { ...same, handTypes: [{ id: 'x', has: [2] }] },
      { ...same, main: [{ code: 1, count: 2 }] },
    ];
    for (const d of changed) assert.notEqual(searchVersion(d), searchVersion(deck));
  });

  test('搜崩了不黏住：这手记 failed，下次开这手重搜', async () => {
    const { cache, calls } = setup({ results: [new Error('引擎崩了')] });
    cache.ensure(HAND, 1);
    await settle();
    assert.equal(cache.state(HAND).status, 'failed');
    cache.ensure(HAND, 1);
    await settle();
    assert.equal(calls.length, 2);
    assert.equal(cache.state(HAND).status, 'done');
  });

  test('超时的条目：现在的上限比它跑时的大才重搜，一样大不重搜', async () => {
    const timedOut = entry({ timedOut: true, budgetMs: 1000, value: 3 });
    const same = setup({ budgetMs: 1000, entries: { [KEY]: timedOut } });
    assert.equal(same.cache.state(HAND).status, 'timed-out');
    same.cache.ensure(HAND, 1);
    await settle();
    assert.equal(same.calls.length, 0);

    const bigger = setup({ budgetMs: 5000, entries: { [KEY]: timedOut } });
    bigger.cache.ensure(HAND, 1);
    assert.equal(bigger.cache.state(HAND).status, 'pending'); // 重搜时不再说 timed-out
    await settle();
    assert.equal(bigger.calls.length, 1);
    assert.equal(bigger.calls[0].budgetMs, 5000);
    assert.equal(bigger.cache.state(HAND).status, 'done');
  });

  test('force：已有搜完的条目也重搜，用新的种子覆盖', async () => {
    const { cache, files, calls } = setup({ entries: { [KEY]: entry({ seed: 1 }) } });
    cache.ensure(HAND, 9, { force: true });
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(files.get(KEY).seed, 9);
  });

  test('上限 0：不搜索，状态 none', async () => {
    const { cache, calls } = setup({ budgetMs: 0 });
    cache.ensure(HAND, 1);
    await settle();
    assert.equal(calls.length, 0);
    assert.equal(cache.state(HAND).status, 'none');
  });
});

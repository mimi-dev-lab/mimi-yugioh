import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { BRANDED } from '../src/decks/branded.js';
import { indicesFor } from '../src/route.js';
import { dataDir, ENGINE_DIR, start } from './helpers.js';

// 这个种子发出的起手含白之落胤，而且 Game8 路线在这手上重放得通（别的含白之落胤的起手，别的牌会让路线里的选卡对不上，那种手暂时用个人最好当基准，搜索在后面的票）
const WHITE_ALBAZ_SEED = 37;
const api = (url) => async (method, path, body) => {
  const res = await fetch(`${url}${path}`, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
};
const logLines = async (dir) => (await readFile(join(dir, 'hands.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => JSON.parse(l));

// 把 Game8 路线一步步交给服务：每个回应对着服务返回的当前提示选下标（'finish' 交给「结束回合」）
async function playRouteOverHttp(call, route) {
  let state = (await call('GET', '/hand')).body;
  for (const step of route.steps) {
    for (const response of step.do) {
      if (response === 'finish') continue;
      const indices = indicesFor(state.prompt, response);
      assert.ok(indices.every((i) => i >= 0), `第「${step.text}」步的回应 ${JSON.stringify(response)} 在提示 ${state.prompt?.kind} 里找不到`);
      const res = await call('POST', '/hand/choose', { indices });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      state = res.body;
    }
  }
  return state;
}

describe('打一手：HTTP 接口', () => {
  async function withServer(fn, env = {}) {
    const data = env.YUGIOH_DATA ?? await dataDir();
    const server = await start({ YUGIOH_ENGINE: ENGINE_DIR, ...env, YUGIOH_DATA: data });
    try { return await fn(api(server.url), data); } finally { server.stop(); }
  }

  test('固定种子发含白之落胤的起手，按 Game8 路线逐步提交，结算场面分 100、基准来源 Game8，日志追加一行', () => withServer(async (call, data) => {
    const started = await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    assert.equal(started.status, 200);
    assert.equal(started.body.board.hand.length, 5);
    assert.ok(started.body.board.hand.some((c) => c.md === '白之落胤'));
    assert.equal(started.body.status, 'playing');
    assert.equal(started.body.prompt.kind, 'idle');

    const route = BRANDED.routes.find((r) => r.id === 'white-albaz');
    await playRouteOverHttp(call, route);
    const ended = await call('POST', '/hand/end');
    assert.equal(ended.status, 200, JSON.stringify(ended.body));
    const s = ended.body;
    assert.equal(s.fieldScore, 100);
    assert.equal(s.benchmark.source, 'game8');
    assert.equal(s.benchmark.routeId, 'white-albaz');
    assert.equal(s.userValue, s.bestValue);
    assert.deepEqual([s.speedBonus, s.speedCounted, s.hintFactor, s.total], [20, true, 1, 120]); // 测试里几秒打完，在 60 秒内
    assert.equal(s.handType, 'white-albaz');
    assert.deepEqual(s.finalBoard.monsters.map((c) => c.md).sort(), ['冰剑龙 镜翠幻种', '引导之圣女 库妸㽗', '赫之圣女 卡尔塔西亚', '黑衣龙之艾克利西亚'].sort());
    assert.equal(s.finalBoard.hand.length, 4);
    assert.equal(s.curve.user.length, s.steps.length);
    assert.deepEqual(s.curve.best, s.curve.user); // 用户走的就是最好路线，两条曲线重合
    assert.equal(s.curve.user.at(-1), 1);
    assert.equal(s.divergeStep, null);

    const lines = await logLines(data);
    assert.equal(lines.length, 1);
    const [line] = lines;
    assert.equal(line.type, 'hand');
    assert.equal(line.seed, WHITE_ALBAZ_SEED);
    assert.equal(line.hand.length, 5);
    assert.ok(line.actions.length > 10 && line.actions.every((a) => Number.isInteger(a.atMs) && a.text && Array.isArray(a.indices)));
    assert.deepEqual(line.endBoard.monsters.length, 4);
    assert.deepEqual([line.fieldScore, line.speedBonus, line.hintFactor, line.total, line.hints], [s.fieldScore, s.speedBonus, 1, s.total, 0]);
    assert.equal(line.benchmark.source, 'game8');
    assert.equal(typeof line.durationMs, 'number');

    assert.equal((await call('GET', '/hand')).status, 404); // 结算后没有进行中的一手
  }));

  test('提交非法选择被拒绝，局面和操作记录不变', () => withServer(async (call) => {
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    const before = (await call('GET', '/hand')).body;
    const n = before.prompt.options.length;
    for (const indices of [[n], [-1], [0, 1], [], 'x', [0.5]]) {
      const res = await call('POST', '/hand/choose', { indices });
      assert.equal(res.status, 400, JSON.stringify(indices));
    }
    const after = (await call('GET', '/hand')).body;
    assert.deepEqual({ ...after, elapsedMs: 0 }, { ...before, elapsedMs: 0 });
    assert.deepEqual(after.actions, []);
  }));

  test('只走了路线的前几步就结束回合：场面分不到 100，标出从第几步走偏，速度加成不计', () => withServer(async (call) => {
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    const route = BRANDED.routes.find((r) => r.id === 'white-albaz');
    await playRouteOverHttp(call, { steps: route.steps.slice(0, 1) });
    const s = (await call('POST', '/hand/end')).body;
    assert.equal(s.benchmark.source, 'game8');
    assert.ok(s.fieldScore < 90, String(s.fieldScore));
    assert.equal(s.speedBonus, 0);
    assert.equal(s.speedCounted, false);
    assert.equal(s.total, s.fieldScore);
    assert.equal(s.divergeStep, 1); // 白之落胤发动之后，路线接着发动②叫白之圣女；这里只交了前几个选择，结束回合时可选效果一律不发动，第 1 步的局面就和路线不同
    assert.ok(s.curve.best.length > s.curve.user.length);
  }));

  test('还停在选卡的提示上就结束回合：409，这一手不结算、局面不变，选完再结束才行', () => withServer(async (call, data) => {
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    const idle = (await call('GET', '/hand')).body;
    const albaz = idle.prompt.options.findIndex((o) => o.action === 'activate' && o.md === '白之落胤');
    const mid = (await call('POST', '/hand/choose', { indices: [albaz] })).body;
    assert.equal(mid.prompt.kind, 'cards');
    const refused = await call('POST', '/hand/end');
    assert.equal(refused.status, 409);
    assert.deepEqual({ ...(await call('GET', '/hand')).body, elapsedMs: 0 }, { ...mid, elapsedMs: 0 });
    assert.deepEqual(await logLines(data), []);
  }));

  test('展开中不给场面值或离最好的差距；操作记录有第几步、时间和文字', () => withServer(async (call) => {
    await call('POST', '/hand/start', { seed: WHITE_ALBAZ_SEED });
    const state = (await call('GET', '/hand')).body;
    assert.equal(state.prompt.kind, 'idle');
    const albaz = state.prompt.options.findIndex((o) => o.action === 'activate' && o.md === '白之落胤');
    const res = await call('POST', '/hand/choose', { indices: [albaz] });
    assert.deepEqual(res.body.actions.map((a) => [a.step, a.text]), [[1, '发动 白之落胤']]);
    assert.equal(typeof res.body.actions[0].atMs, 'number');
    const text = JSON.stringify(res.body);
    for (const leak of ['value', 'bestValue', 'fieldScore', 'curve']) assert.ok(!text.includes(`"${leak}`), leak);
    assert.deepEqual(res.body.restrictions, ['本回合额外卡组只能特殊召唤 8 星融合 / 同调怪兽（白之落胤）']);
  }));

  test('烂手直接结束回合：没有 Game8 路线，基准是个人最好（暂定），写明', () => withServer(async (call, data) => {
    const brickSeed = 1;
    await call('POST', '/hand/start', { seed: brickSeed });
    const ended = (await call('POST', '/hand/end')).body;
    assert.equal(ended.benchmark.source, 'personal');
    assert.equal(ended.benchmark.provisional, true);
    assert.equal(ended.finalBoard.hand.length, 5);
    assert.equal(ended.fieldScore, 100);
    assert.equal((await logLines(data)).length, 1);
  }));

  test('同一个种子发同一手牌；不同种子不同', () => withServer(async (call) => {
    const first = (await call('POST', '/hand/start', { seed: 7 })).body.board.hand.map((c) => c.code).sort();
    const again = (await call('POST', '/hand/start', { seed: 7 })).body.board.hand.map((c) => c.code).sort();
    const other = (await call('POST', '/hand/start', { seed: 8 })).body.board.hand.map((c) => c.code).sort();
    assert.deepEqual(first, again);
    assert.notDeepEqual(first, other);
    assert.equal((await call('POST', '/hand/start', { seed: -1 })).status, 400);
  }));

  test('开新的一手顶掉进行中的一手，日志里标作废；服务重启也一样', async () => {
    const data = await dataDir();
    await withServer(async (call) => {
      await call('POST', '/hand/start', { seed: 7 });
      await call('POST', '/hand/start', { seed: 8 });
    }, { YUGIOH_DATA: data });
    let lines = await logLines(data);
    assert.deepEqual(lines.map((l) => [l.type, l.seed]), [['void', 7]]);
    assert.match(lines[0].reason, /新的一手/);
    await withServer(async (call) => {
      assert.equal((await call('GET', '/hand')).status, 404); // 重启后没有进行中的一手
    }, { YUGIOH_DATA: data });
    lines = await logLines(data);
    assert.deepEqual(lines.map((l) => [l.type, l.seed]), [['void', 7], ['void', 8]]);
    assert.match(lines[1].reason, /重启/);
  });

  test('没开始就查、提交、结束返回 404', () => withServer(async (call) => {
    assert.equal((await call('GET', '/hand')).status, 404);
    assert.equal((await call('POST', '/hand/choose', { indices: [0] })).status, 404);
    assert.equal((await call('POST', '/hand/end')).status, 404);
  }));
});

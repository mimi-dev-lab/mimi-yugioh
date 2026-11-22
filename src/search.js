// 最好场面搜索：在决斗会话里做有限偏离的深度优先搜索（存档回滚），按场面值评估我方回合结束时的场面。算法、剪枝、上限见 DESIGN.md「最好场面搜索」。
// 纯逻辑：会话、卡组、「现在」（毫秒的函数）、时间上限都由调用方传进来（见 AGENTS.md「边界」）。
// 搜出的路线用 route.js 的语义回应写（{ idle, code }、{ chain }、{ pick }…），不用选项下标：下标随起手顺序和种子变，缓存按排序后的起手存。
import { createHash } from 'node:crypto';
import { openHandSession, stateKey } from './duel-session.js';
import { descOf, indicesFor, labelFor, sameResponse, startsStep } from './route.js';
import { boardValue } from './scoring.js';

export const SEARCH_BUDGET_MS = 60000; // 一手的搜索时间上限
export const HINT_BUDGET_MS = 5000; // 提示里「从当前局面再搜」的时间上限
export const YIELD_MS = 20; // 每搜这么久让出一次事件循环
export const MAX_DISCREPANCY = 2; // 一条路线上最多有几处不走排在第一的回应
export const MAX_BRANCH = 5; // 选卡时最多试几个不同的密码
export const MAX_COMBOS = 4; // 一次选多张时最多试几种组合
export const GUIDE_WINDOW = 6; // 照 Game8 路线排先后时，往后看几个回应找能对上的
export const MAX_RESPONSES = 250; // 一条路线最多这么多个回应

// 搜索结果的版本：卡组名、卡组数据的指纹（卡表的打断数和角色、主额外卡组、起手类型、展开路线：它们改了，场面值或搜索的排序就变）加上决定搜索范围的常量。
// 缓存里记着它，改了卡组数据或常量、换了卡组，旧缓存的版本对不上，就当没有
export const deckFingerprint = (deck) => createHash('sha1').update(JSON.stringify([deck.cards, deck.main, deck.extra, deck.handTypes, deck.routes], (_k, v) => (typeof v === 'function' ? undefined : v))).digest('hex').slice(0, 12);
export const searchVersion = (deck) => [deck.name, deckFingerprint(deck), MAX_DISCREPANCY, MAX_BRANCH, MAX_COMBOS, GUIDE_WINDOW, MAX_RESPONSES].join('/');

class Timeout extends Error {}
const yieldLoop = () => new Promise((resolve) => setImmediate(resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PAUSE_POLL_MS = 10;

// 路线里出现过的动作和选过的卡：搜索先试它们（只排先后，不限制范围）
function routeMoves(deck) {
  const acts = new Set(); const picks = new Set();
  for (const route of deck.routes ?? []) {
    for (const r of route.steps.flatMap((s) => s.do)) {
      if (r.idle) acts.add(`${r.idle}:${r.code}`);
      if (r.chain) acts.add(`chain:${r.chain}`);
      if (r.pick) r.pick.forEach((c) => picks.add(c));
    }
  }
  return { moves: acts, picks };
}

// 起手含路线要的卡时，把这条路线展平成回应序列，当「先走哪个」的参考
const guidesFor = (deck, hand) => (deck.routes ?? []).filter((r) => hand.includes(r.needs)).map((r) => r.steps.flatMap((s) => s.do).filter((x) => x !== 'finish'));
const noDesc = (r) => (typeof r === 'object' && r.desc !== undefined ? { ...r, desc: undefined } : r);
const matches = (a, b) => sameResponse(noDesc(a), noDesc(b));

// 从 n 个候选里取 size 个的组合（按下标升序），最多 limit 个
function combinations(n, size, limit) {
  const out = [];
  const walk = (start, chosen) => {
    if (out.length >= limit) return;
    if (chosen.length === size) { out.push([...chosen]); return; }
    for (let i = start; i < n; i++) { chosen.push(i); walk(i + 1, chosen); chosen.pop(); }
  };
  walk(0, []);
  return out;
}

// 当前提示上要试的回应，按先试哪个排好。每个回应都是 route.js 能还原成下标的语义回应
function candidates(prompt, preferred, deck) {
  const { options } = prompt;
  const worth = (code) => (preferred.picks.has(code) ? 100 : 0) + (deck.cards[code]?.interrupts ?? 0) * 10 + ({ 终端: 5, 延伸: 3, 起手: 2 }[deck.cards[code]?.role] ?? 0);
  const rank = (response) => {
    if (response === 'end-turn') return 3;
    if ((response.idle && preferred.moves.has(`${response.idle}:${response.code}`)) || (response.chain && preferred.moves.has(`chain:${response.chain}`))) return 0;
    return 1;
  };
  const dedupe = (list) => { const seen = new Set(); return list.filter((r) => { const k = JSON.stringify(r); return seen.has(k) ? false : seen.add(k); }); };
  let list = [];
  switch (prompt.kind) {
    case 'idle':
      // 不进战斗阶段（先攻第一回合不能攻击）；改变表示形式不试（对场面值没有影响）；盖放没有打断数的卡只会少一张手牌，场面值只降不升：不试
      list = options.filter((o) => o.action !== 'to-battle' && o.action !== 'position-change' && !((o.action === 'spell-set' || o.action === 'monster-set') && !deck.cards[o.code]?.interrupts))
        .map((o) => (o.code === undefined ? o.action : { idle: o.action, code: o.code, ...descOf(options, o) }));
      break;
    case 'chain':
      list = options.map((o) => (o.action === 'pass' ? 'pass' : { chain: o.code, ...descOf(options, o) }));
      break;
    case 'yes-no':
      list = ['yes', 'no'];
      break;
    case 'option':
      list = options.map((_, i) => ({ option: i }));
      break;
    case 'place': // 近似：放哪一格、什么表示形式大多不影响场面值，只试第一个（少数靠格子连动的路线会漏掉）
      return [{ place: 0 }];
    case 'position':
      return [{ position: 0 }];
    case 'pick-one':
      list = options.filter((o) => o.action === 'select').map((o) => ({ pick: [o.code] })).sort((a, b) => worth(b.pick[0]) - worth(a.pick[0]));
      if (options.some((o) => o.action === 'finish')) list.push({ finishPick: true });
      return dedupe(list);
    case 'cards': {
      // 按密码去重（同一密码选哪一张结果相同），价值高的排前面；选多张时组合数设上限
      const codes = [...new Set(options.map((o) => o.code))].sort((a, b) => worth(b) - worth(a));
      const max = Math.min(prompt.max, options.length);
      for (let size = prompt.min; size <= max && list.length < MAX_COMBOS; size++) {
        if (size === 0) { list.push({ pick: [] }); continue; }
        const combos = size === 1 ? codes.map((_, i) => [i]) : combinations(codes.length, size, MAX_COMBOS);
        for (const combo of combos) list.push({ pick: combo.map((i) => codes[i]) });
      }
      // 同一个密码要选几张，列表里得有那么多张
      return dedupe(list.filter((r) => r.pick.every((c) => r.pick.filter((x) => x === c).length <= options.filter((o) => o.code === c).length)));
    }
    default:
      return [];
  }
  return dedupe(list).map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(({ r }) => r);
}

// 在会话当前的局面上搜最好的终场。isPaused 返回 true 时搜索停在原地等着，等的时间不计进时间上限和 elapsedMs（提示要用 CPU 时，后台搜索让一让）。返回 { value, steps, timedOut, nodes, elapsedMs }：steps 是从当前提示起走到我方回合结束的路线（按 startsStep 切，{ text, do }）。
// 超时时 value / steps 是超时前找到的最好的（一条都没找到是 null）。搜完会话回到调用时的局面，调用方自己关会话。
// 有限偏离：每个提示上有个排好的先后（照 Game8 路线、动作的价值），一条路线上最多 MAX_DISCREPANCY 处不走排第一的；先搜 0 处、再 1 处、再 2 处，所以超时也先有较好的结果
export async function searchSession(session, deck, { now, budgetMs, useRoutes = true, isPaused = () => false }) {
  const startAt = now();
  let lastYield = startAt;
  let nodes = 0;
  const preferred = routeMoves(deck);
  let pausedMs = 0;
  const guides = useRoutes ? guidesFor(deck, session.board().hand.map((c) => c.code)) : [];
  let seen = new Map(); // 主阶段提示上的置换表：局面 → 到过它时还剩的偏离次数
  const path = []; // 当前走到这里的 { response, starts, text }
  let best = { value: -1, path: null };
  const startCheckpoint = session.checkpoint();

  // guide 是 Game8 路线展平的回应序列，ptr 是走到了它的第几个：候选里有路线往后 GUIDE_WINDOW 个内的回应，就排到最前
  async function visit(ptr, left, guide) {
    nodes++;
    if (isPaused()) {
      const pausedAt = now();
      while (isPaused()) await sleep(PAUSE_POLL_MS);
      pausedMs += now() - pausedAt;
      lastYield = now();
    }
    const t = now();
    if (t - startAt - pausedMs > budgetMs) throw new Timeout();
    if (t - lastYield >= YIELD_MS) { await yieldLoop(); lastYield = now(); }
    if (session.endBoard) {
      const value = boardValue(deck, session.endBoard);
      if (value > best.value) best = { value, path: [...path] };
      return;
    }
    const prompt = session.prompt();
    if (!prompt || path.length >= MAX_RESPONSES) return;
    if (prompt.kind === 'idle') {
      const key = `${stateKey(session.board())}|${session.normalSummonUsed}|${[...session.activated].sort((a, b) => a - b).join(',')}`;
      if ((seen.get(key) ?? -1) >= left) return;
      seen.set(key, left);
    }
    let list = candidates(prompt, preferred, deck);
    const next = new Map(); // 回应 → 走了它之后的 ptr
    if (guide) {
      for (let j = ptr; j < Math.min(guide.length, ptr + GUIDE_WINDOW); j++) {
        const hit = list.find((c) => matches(c, guide[j]));
        if (hit) { list = [hit, ...list.filter((c) => c !== hit)]; next.set(hit, j + 1); break; }
      }
    }
    if ((prompt.kind === 'cards' || prompt.kind === 'pick-one') && list.length > MAX_BRANCH) list = list.slice(0, MAX_BRANCH);
    const checkpoint = session.checkpoint();
    let first = true;
    for (const [k, response] of list.entries()) {
      if (k > 0 && left === 0) break;
      const indices = indicesFor(prompt, response);
      if (indices.some((i) => i < 0)) continue;
      if (!first) session.rollback(checkpoint);
      first = false;
      try { session.choose(indices); } catch { continue; }
      path.push({ response, starts: startsStep(prompt, indices), text: labelFor(deck, prompt, indices) });
      try { await visit(next.get(response) ?? ptr, k > 0 ? left - 1 : left, guide); } finally { path.pop(); }
    }
  }

  let timedOut = false;
  try {
    // 第 0 轮：每条适用的路线各走一遍（外加不照路线的），挑结果最高的路线当参考，再一轮轮放宽偏离次数
    let refGuide = null; let refValue = -1;
    for (const guide of [...guides, null]) {
      seen = new Map();
      const before = best.value;
      session.rollback(startCheckpoint);
      await visit(0, 0, guide);
      if (best.value > before && best.value > refValue) { refValue = best.value; refGuide = guide; }
    }
    for (let left = 1; left <= MAX_DISCREPANCY; left++) {
      seen = new Map();
      session.rollback(startCheckpoint);
      await visit(0, left, refGuide);
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
    timedOut = true;
  } finally {
    session.rollback(startCheckpoint);
  }
  const steps = [];
  for (const { response, starts, text: label } of best.path ?? []) {
    if (starts || !steps.length) steps.push({ text: label, do: [] });
    steps.at(-1).do.push(response);
  }
  return { value: best.path ? best.value : null, steps: best.path ? steps : null, timedOut, nodes, elapsedMs: now() - startAt - pausedMs };
}

// 对一手起手从头搜（开局的局面）。开局走 openHandSession，和用户打牌、重放路线是同一个入口：同一个种子下搜出的路线一定能重放
export async function searchHand(engine, deck, { hand, seed, now, budgetMs = SEARCH_BUDGET_MS, isPaused }) {
  const session = await openHandSession(engine, deck, hand, seed);
  try { return await searchSession(session, deck, { now, budgetMs, isPaused }); } finally { session.close(); }
}

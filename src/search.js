// 最好场面搜索（离线分析用，#37）：在决斗会话里做有限偏离的深度优先搜索（存档回滚、置换表），按场面值评估我方回合结束时的场面。
// 从 #28 删掉的版本恢复，改了两处：① 上限按节点数（maxNodes），不按毫秒，所以同一手、同一种子、同一上限的结果完全一样，续跑和一口气跑出的 JSONL 相同；② 不再让出事件循环、不暂停（脚本里没有别的活要让）。
// 纯逻辑：会话、卡组、上限都由调用方传进来（见 AGENTS.md「边界」）。
// 搜出的路线用 route.js 的语义回应写（{ idle, code }、{ chain }、{ pick }…），不用选项下标：下标随起手顺序和种子变。格式就是卡组数据里路线的 steps，playRoute 能重放。
import { openHandSession } from './duel-session.js';
import { indicesFor, labelFor, startsStep } from './route.js';

export const INTERRUPT_VALUE = 10; // 终场每个打断的场面值
export const HAND_VALUE = 1; // 结束时每张手牌的场面值
export const MAX_DISCREPANCY = 2; // 一条路线上最多有几处不走排在第一的回应
export const MAX_BRANCH = 5; // 选卡时最多试几个不同的密码
export const MAX_COMBOS = 4; // 一次选多张时最多试几种组合
export const GUIDE_WINDOW = 6; // 照已知路线排先后时，往后看几个回应找能对上的
export const MAX_RESPONSES = 250; // 一条路线最多这么多个回应

// 场面值 = 10 × 终场在场各卡的打断数之和 + 1 × 剩余手牌数（DESIGN「卡组数据」：打断数不手写，由卡表算）
export const interruptsOf = (deck, board) => [...board.monsters, ...board.spellTraps].reduce((sum, c) => sum + (deck.cards[c.code]?.interrupts ?? 0), 0);
export const boardValue = (deck, board) => INTERRUPT_VALUE * interruptsOf(deck, board) + HAND_VALUE * board.hand.length;

// 场面的指纹：各区域的卡（不看顺序），置换表用它判断两个局面是不是同一个
const stateKey = (board) => ['hand', 'monsters', 'spellTraps', 'grave', 'banished'].map((z) => board[z].map((c) => c.code).sort((x, y) => x - y).join(',')).join('|');

// 同一张卡在这个提示里有几个同动作的选项（一张卡几个效果）时，回应要带效果描述号 desc 才指得准；只有一个就不带
const descOf = (options, o) => (o.description !== undefined && options.filter((x) => x.action === o.action && x.code === o.code).length > 1 ? { desc: o.description } : {});

// 两个回应是不是同一个选择：选卡的顺序不算
const normalize = (r) => JSON.stringify(r?.pick ? { ...r, pick: [...r.pick].sort((x, y) => x - y) } : r);
const sameResponse = (a, b) => normalize(a) === normalize(b);
const noDesc = (r) => (typeof r === 'object' && r.desc !== undefined ? { ...r, desc: undefined } : r);
const matches = (a, b) => sameResponse(noDesc(a), noDesc(b));

class Capped extends Error {}

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
  const worth = (code) => (preferred.picks.has(code) ? 100 : 0) + (deck.cards[code]?.interrupts ?? 0) * 10 + ({ 终场: 5, 融合素材: 3, 启动: 2 }[deck.cards[code]?.role] ?? 0);
  const rank = (response) => {
    if (response === 'end-turn') return 3;
    if ((response.idle && preferred.moves.has(`${response.idle}:${response.code}`)) || (response.chain && preferred.moves.has(`chain:${response.chain}`))) return 0;
    if (response === 'pass') return 1; // 路线里没用过的连锁发动（手坑之类）排在放行后面：每次放行都不该白花一次偏离
    return 2;
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

// 在会话当前的局面上搜最好的终场。节点 = 一次 visit（走了一个回应）；用掉 maxNodes 个就停，capped 为真，value / steps / endBoard 是停之前找到的最好的（一条都没找到是 null）。
// 返回 { value, steps, endBoard, capped, nodes }：steps 是从当前提示起走到我方回合结束的路线（按 startsStep 切，{ text, do }），endBoard 是搜到的那个终场。搜完会话回到调用时的局面，调用方自己关会话。
// 有限偏离：每个提示上有个排好的先后（照已知路线、动作的价值），一条路线上最多 MAX_DISCREPANCY 处不走排第一的；先搜 0 处、再 1 处、再 2 处，所以不管停在哪，手里都是已搜到的较好结果。同值的取先搜到的，所以结果只由 maxNodes 决定。
export function searchSession(session, deck, { maxNodes, useRoutes = true }) {
  let nodes = 0;
  const preferred = routeMoves(deck);
  const guides = useRoutes ? guidesFor(deck, session.board().hand.map((c) => c.code)) : [];
  let seen = new Map(); // 主阶段提示上的置换表：局面 → 到过它时还剩的偏离次数
  const path = []; // 当前走到这里的 { response, starts, text }
  let best = { value: -1, path: null, endBoard: null };
  const startCheckpoint = session.checkpoint();

  // guide 是已知路线展平的回应序列，ptr 是走到了它的第几个：候选里有路线往后 GUIDE_WINDOW 个内的回应，就排到最前
  function visit(ptr, left, guide) {
    if (nodes >= maxNodes) throw new Capped();
    nodes++;
    if (session.endBoard) {
      const value = boardValue(deck, session.endBoard);
      if (value > best.value) best = { value, path: [...path], endBoard: session.endBoard };
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
    // 路线走完了（它最后的 finish 被滤掉了）：之后的连锁窗口先试放行，和 finish 一样
    if (guide && ptr >= guide.length && prompt.kind === 'chain' && list.includes('pass')) list = ['pass', ...list.filter((c) => c !== 'pass')];
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
      try { visit(next.get(response) ?? ptr, k > 0 ? left - 1 : left, guide); } finally { path.pop(); }
    }
  }

  let capped = false;
  try {
    // 第 0 轮：每条适用的路线各走一遍（外加不照路线的），挑结果最高的路线当参考，再一轮轮放宽偏离次数
    let refGuide = null; let refValue = -1;
    for (const guide of [...guides, null]) {
      seen = new Map();
      const before = best.value;
      session.rollback(startCheckpoint);
      visit(0, 0, guide);
      if (best.value > before && best.value > refValue) { refValue = best.value; refGuide = guide; }
    }
    for (let left = 1; left <= MAX_DISCREPANCY; left++) {
      seen = new Map();
      session.rollback(startCheckpoint);
      visit(0, left, refGuide);
    }
  } catch (e) {
    if (!(e instanceof Capped)) throw e;
    capped = true;
  } finally {
    session.rollback(startCheckpoint);
  }
  const steps = [];
  for (const { response, starts, text: label } of best.path ?? []) {
    if (starts || !steps.length) steps.push({ text: label, do: [] });
    steps.at(-1).do.push(response);
  }
  return { value: best.path ? best.value : null, steps: best.path ? steps : null, endBoard: best.endBoard, capped, nodes };
}

// 对一手起手从头搜（开局的局面）。开局走 openHandSession，和重放路线是同一个入口：同一个种子下搜出的路线一定能重放
export async function searchHand(engine, deck, { hand, seed, maxNodes }) {
  const session = await openHandSession(engine, deck, hand, seed);
  try { return searchSession(session, deck, { maxNodes }); } finally { session.close(); }
}

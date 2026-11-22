// 一手：发牌、操作、结算。包住决斗会话，记每一步的操作和时间，结束时按「评分」一节算分、挑基准。
// 纯逻辑：引擎、卡组、「现在」（毫秒）、历史记录都由调用方传进来（见 AGENTS.md「边界」）。展开中不给用户看离最好差多少，所以 view() 不含场面值。
import { startSession } from './duel-session.js';
import { classifyHand, expand } from './deck.js';
import { stepLedger } from './ledger.js';
import { playRoute, startsStep } from './route.js';
import { boardValue, curve, score } from './scoring.js';

export const HAND_SIZE = 5;
const ACTION_NAMES = { summon: '召唤', 'monster-set': '盖放怪兽', 'special-summon': '特殊召唤', 'position-change': '改变表示形式', 'spell-set': '盖放', activate: '发动', 'to-battle': '进入战斗阶段', 'end-turn': '结束回合' };

// 带种子的随机源（mulberry32）：同一个种子，同一手牌
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 完全随机发 5 张：洗主卡组，取前 5 张当起手，其余是卡组
export function deal(deck, seed) {
  const rng = rngFrom(seed);
  const cards = expand(deck.main);
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return { hand: cards.slice(0, HAND_SIZE), rest: cards.slice(HAND_SIZE) };
}

// 场面的指纹：各区域的卡（不看顺序），用来比较两条路线在某一步之后是不是同一个局面
const stateKey = (b) => ['hand', 'monsters', 'spellTraps', 'grave', 'banished'].map((z) => b[z].map((c) => c.code).sort((x, y) => x - y).join(',')).join('|');

export const handKey = (hand) => [...hand].sort((a, b) => a - b).join('-');
export class HandError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

export async function startHand(engine, deck, { id, seed, now }) {
  const { hand, rest } = deal(deck, seed);
  const engineSeed = [0, 1, 2, 3].map((i) => BigInt((seed + i) >>> 0));
  const session = await startSession(engine, { hand, deck: rest, extra: expand(deck.extra), seed: engineSeed });
  const md = (code) => deck.cards[code]?.md ?? String(code);
  const actions = []; // { step, at（距开局毫秒）, kind, text, indices, valueAfter, state }
  const stepBefore = new Map(); // 每一步开始前的场面，算「花了 → 换来」用
  let step = 0;
  const startedAt = now;
  const info = { id, seed, hand: [...hand], startedAt };

  const named = (o) => ({ ...o, ...(o.code === undefined ? {} : { md: md(o.code), role: deck.cards[o.code]?.role }) });
  const label = (prompt, indices) => {
    const chosen = indices.map((i) => prompt.options[i]);
    const one = chosen[0];
    switch (prompt.kind) {
      case 'idle': return `${ACTION_NAMES[one.action] ?? one.action}${one.code === undefined ? '' : ` ${md(one.code)}`}`;
      case 'cards': return chosen.length ? `选 ${chosen.map((o) => md(o.code)).join('、')}` : '不选';
      case 'pick-one': return one.action === 'finish' ? '选完' : `${one.action === 'unselect' ? '取消' : '选'} ${md(one.code)}`;
      case 'chain': return one.action === 'pass' ? '不发动' : `连锁发动 ${md(one.code)}`;
      case 'yes-no': return one.action === 'yes' ? '发动' : '不发动';
      case 'place': return `放在 ${one.location === 0x4 ? '怪兽区' : '魔陷区'} 第 ${one.sequence + 1} 格`;
      default: return `选第 ${indices[0] + 1} 项`;
    }
  };

  function submit(indices, at) {
    const prompt = session.prompt();
    if (!prompt) throw new HandError('没有要选的提示了', 409);
    let text = '';
    try { text = label(prompt, indices); } catch { /* 下标不合法：读不到选项，由下面的 choose 报错 */ }
    const before = session.board();
    try { session.choose(indices); } catch (e) { throw new HandError(e.message); } // 非法选择在这里被拒绝，会话状态不变
    if (startsStep(prompt, indices) || step === 0) { step++; stepBefore.set(step, before); }
    const board = session.board();
    actions.push({ step, at: at - startedAt, kind: prompt.kind, text, indices, valueAfter: boardValue(deck, board), state: stateKey(board), board });
  }

  // 操作记录：每一步一行（时间取这一步最后一个选择的时间），「花了 → 换来」是这一步开始前和现在最后一个选择之后的场面之差
  function stepRows() {
    const rows = [];
    for (const a of actions) {
      const last = rows.at(-1);
      if (last?.step === a.step) { last.atMs = a.at; last.text += ` → ${a.text}`; last.after = a.board; } else rows.push({ step: a.step, atMs: a.at, text: a.text, after: a.board });
    }
    return rows.map(({ after, ...r }) => ({ ...r, ...stepLedger(stepBefore.get(r.step), after, md) }));
  }

  function view(at) {
    const board = session.board();
    const prompt = session.prompt();
    const withNames = (list) => list.map((c) => ({ ...c, md: md(c.code) }));
    return {
      id, status: session.endBoard ? 'turn-over' : 'playing', startedAt, elapsedMs: at - startedAt, hints: 0,
      prompt: session.endBoard || !prompt ? null : { ...prompt, options: prompt.options.map(named) },
      board: { hand: withNames(board.hand), monsters: withNames(board.monsters), spellTraps: withNames(board.spellTraps), grave: withNames(board.grave), banished: withNames(board.banished), deck: board.deck, extra: withNames(board.extra) },
      normalSummonUsed: session.normalSummonUsed,
      restrictions: (deck.restrictions ?? []).filter((r) => session.activated.includes(r.code)).map((r) => r.text),
      actions: actions.map(({ step: s, at: t, text }) => ({ step: s, atMs: t, text })),
      steps: stepRows(),
    };
  }

  // 结束回合：还停在主阶段就进结束阶段，之后放行连锁、不发动可选效果，直到我方回合结束；遇到要选的东西就拒绝，让用户自己选
  function finishTurn(at) {
    for (let guard = 0; guard < 100 && !session.endBoard; guard++) {
      const prompt = session.prompt();
      const pick = (action) => prompt.options.findIndex((o) => o.action === action);
      const i = !prompt ? -1 : { idle: pick('end-turn'), chain: pick('pass'), 'yes-no': pick('no') }[prompt.kind] ?? -1;
      if (i < 0) throw new HandError('还有没选完的提示，选完再结束回合', 409);
      submit([i], at);
    }
  }

  // 基准：Game8 路线（起手含所需卡，用真实起手在引擎里重放，对不上的路线跳过）和用户在这手上的最好成绩（含这一次），取场面值最高的，同值 Game8 优先
  async function benchmark(userValue, history) {
    let game8 = null;
    for (const route of deck.routes ?? []) {
      if (!hand.includes(route.needs)) continue;
      try {
        const replay = await playRoute(engine, deck, route, { seed: engineSeed, hand });
        const value = boardValue(deck, replay.endBoard);
        if (!game8 || value > game8.value) game8 = { value, routeId: route.id, name: route.name, boards: replay.boards, endBoard: replay.endBoard };
      } catch { /* 这个起手重放不了这条路线（别的牌改了提示）：不当基准 */ }
    }
    const key = handKey(hand);
    const best = Math.max(userValue, ...history.filter((r) => r.type === 'hand' && handKey(r.hand) === key).map((r) => r.userValue));
    if (game8 && game8.value >= best) return { source: 'game8', value: game8.value, game8 };
    return { source: 'personal', value: best, game8 };
  }

  // 结算。history 是日志里已有的记录（找这手牌的个人最好）；返回 { settlement, record }，record 是追加进日志的那一行
  async function end(at, history = []) {
    finishTurn(at);
    const endBoard = session.endBoard;
    const seconds = (at - startedAt) / 1000;
    const userValue = boardValue(deck, endBoard);
    const base = await benchmark(userValue, history);
    const result = score({ userValue, bestValue: base.value, seconds, hints: 0 });
    const benchmarkInfo = { source: base.source, ...(base.game8 ? { routeId: base.game8.routeId } : {}), provisional: !base.game8 };
    const codes = (list) => list.map((c) => c.code);
    const final = { hand: codes(endBoard.hand), monsters: codes(endBoard.monsters), spellTraps: codes(endBoard.spellTraps) };
    const last = new Map(actions.map((a) => [a.step, a])); // 每步取最后一个操作之后的场面
    const userSteps = [...last.values()].map((a) => ({ step: a.step, text: actions.filter((x) => x.step === a.step).map((x) => x.text).join(' → '), value: a.valueAfter, state: a.state }));
    const record = {
      type: 'hand', v: 1, id, seed, hand: [...hand], handType: classifyHand(deck, hand), benchmarkHand: false, startedAt, durationMs: at - startedAt, hints: 0,
      actions: actions.map(({ step: s, at: t, kind, text, indices, valueAfter }) => ({ step: s, atMs: t, kind, text, indices, value: valueAfter })),
      endBoard: final, userValue, bestValue: base.value, benchmark: benchmarkInfo, ...result,
    };
    const { type: _type, ...shown } = record;
    const settlement = {
      ...shown,
      finalBoard: { hand: endBoard.hand.map((c) => ({ ...c, md: md(c.code) })), monsters: endBoard.monsters.map((c) => ({ ...c, md: md(c.code) })), spellTraps: endBoard.spellTraps.map((c) => ({ ...c, md: md(c.code) })) },
      bestBoard: base.game8 && base.source === 'game8' ? { hand: base.game8.endBoard.hand.map((c) => md(c.code)), monsters: base.game8.endBoard.monsters.map((c) => md(c.code)), spellTraps: base.game8.endBoard.spellTraps.map((c) => md(c.code)) } : null,
      steps: userSteps.map(({ state: _state, ...step }) => step),
      curve: { user: userSteps.map((s) => (base.value > 0 ? s.value / base.value : 1)), best: base.game8 ? curve(deck, base.game8.boards, base.value) : null },
    };
    // 走偏的那一步：用户第 i 步之后的局面和最好路线第 i 步之后的不一样（两边都按 startsStep 切步）；一直一样就是 null
    const bestStates = base.game8 ? base.game8.boards.map(stateKey) : null;
    settlement.divergeStep = bestStates ? (userSteps.findIndex((s, i) => s.state !== bestStates[i]) + 1 || null) : null;
    session.close();
    return { settlement, record };
  }

  return { info, view, submit, end, close: () => session.close() };
}

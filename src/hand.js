// 一手：发牌、操作、结算。包住决斗会话，记每一步的操作和时间，结束时按「评分」一节算分、挑基准。
// 纯逻辑：引擎、卡组、「现在」（毫秒）、历史记录都由调用方传进来（见 AGENTS.md「边界」）。展开中不给用户看离最好差多少，所以 view() 不含场面值。
import { openHandSession, stateKey } from './duel-session.js';
import { classifyHand, expand } from './deck.js';
import { stepLedger } from './ledger.js';
import { ACTION_NAMES, indicesFor, labelFor, playRoute, responseFor, sameChoice, startsStep, summarizeLabels } from './route.js';
import { boardValue, curve, interruptsOf, score } from './scoring.js';
import { searchSession } from './search.js';

export const HAND_SIZE = 5;

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

// 完全随机发 5 张：洗主卡组，取前 5 张当起手。剩下的牌不在这里定：会话由 openHandSession 开，卡组的洗牌交给引擎
export function deal(deck, seed) {
  const rng = rngFrom(seed);
  const cards = expand(deck.main);
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return { hand: cards.slice(0, HAND_SIZE) };
}

export const handKey = (hand) => [...hand].sort((a, b) => a - b).join('-');
export class HandError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

export async function startHand(engine, deck, { id, seed, now, number = 1 }) {
  const { hand } = deal(deck, seed);
  const open = () => openHandSession(engine, deck, hand, seed);
  const session = await open();
  const md = (code) => deck.cards[code]?.md ?? String(code);
  const actions = []; // { step, at（距开局毫秒）, kind, text, indices, response（语义回应）, valueAfter, state }
  let hints = 0;
  const hintedSteps = new Set(); // 用了提示的步（提示给的下一个选择落在哪一步）
  let source = null; // 当前这一步是哪张卡的哪个动作发起的（浮层标题用）
  const stepBefore = new Map(); // 每一步开始前的场面，算「花了 → 换来」用
  let step = 0;
  const startedAt = now;
  const info = { id, seed, hand: [...hand], startedAt };

  const named = (o) => ({ ...o, ...(o.code === undefined ? {} : { md: md(o.code), role: deck.cards[o.code]?.role }) });
  const label = (prompt, indices) => labelFor(deck, prompt, indices);

  function submit(indices, at) {
    const prompt = session.prompt();
    if (!prompt) throw new HandError('没有要选的提示了', 409);
    let text = '';
    let response = null;
    try { text = label(prompt, indices); response = responseFor(prompt, indices); } catch { /* 下标不合法：读不到选项，由下面的 choose 报错 */ }
    const before = session.board();
    try { session.choose(indices); } catch (e) { throw new HandError(e.message); } // 非法选择在这里被拒绝，会话状态不变
    if (startsStep(prompt, indices) || step === 0) {
      step++; stepBefore.set(step, before);
      const o = prompt.options[indices[0]];
      source = o?.code === undefined ? null : { code: o.code, md: md(o.code), action: ACTION_NAMES[o.action] ?? (o.action === 'chain' ? '连锁发动' : o.action) };
    }
    const board = session.board();
    actions.push({ step, at: at - startedAt, kind: prompt.kind, text, indices, response, valueAfter: boardValue(deck, board), state: stateKey(board), board });
  }

  // 操作记录：每一步一行（时间取这一步最后一个选择的时间），「花了 → 换来」是这一步开始前和现在最后一个选择之后的场面之差
  function stepRows() {
    const rows = [];
    for (const a of actions) {
      const last = rows.at(-1);
      if (last?.step === a.step) { last.atMs = a.at; last.text += ` → ${a.text}`; last.after = a.board; } else rows.push({ step: a.step, atMs: a.at, text: a.text, after: a.board });
    }
    return rows.map(({ after, ...r }) => ({ ...r, summary: summarize(r.step), ...stepLedger(stepBefore.get(r.step), after, md) }));
  }

  // 一步在操作记录里的一行：发起的动作 + 选了哪些卡；「不发动」「放在第几格」「选第几项」「选完」这类机械确认折叠掉（完整的在 text 里）
  function summarize(n) {
    return summarizeLabels(actions.filter((a) => a.step === n).map((a) => a.text));
  }

  function view(at) {
    const board = session.board();
    const prompt = session.prompt();
    const withNames = (list) => list.map((c) => ({ ...c, md: md(c.code) }));
    return {
      id, number, status: session.endBoard ? 'turn-over' : 'playing', startedAt, elapsedMs: at - startedAt, hints,
      prompt: session.endBoard || !prompt ? null : { ...prompt, ...(prompt.kind !== 'idle' && source ? { source } : {}), options: prompt.options.map(named) },
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

  // Game8 路线：起手含所需卡的，用真实起手和种子在引擎里重放，对不上的（别的牌改了提示）跳过。基准和提示都用，只重放一次
  let game8Replays = null;
  const game8Lines = () => (game8Replays ??= (async () => {
    const lines = [];
    for (const route of deck.routes ?? []) {
      if (!hand.includes(route.needs)) continue;
      try { lines.push({ route, replay: await playRoute(engine, deck, route, { seed, hand }) }); } catch { /* 重放不了：不当基准 */ }
    }
    return lines;
  })());

  // 基准：搜索的最好路线、Game8 路线、用户在这手上的最好成绩（含这一次），取场面值最高的，同值 搜索 > Game8 > 个人最好。
  // 搜索路线存的是语义回应，这里用真实起手和种子重放一遍，得到终场和每一步之后的场面（和 Game8 同一条路）；没搜完、超时、重放不了都不当基准，重放不了记成 replay-failed（缓存的路线是别的种子搜的，这个种子下走不通）。
  // 返回的 line 是拿来画曲线、标走偏、给最好终场的那条路线（搜索和 Game8 里值高的，同值搜索），个人最好更高时也是它；两条都没有是 null
  async function benchmark(userValue, history, searched) {
    let searchLine = null;
    let searchStatus = searched.status;
    if (searchStatus === 'done') {
      try {
        const replay = await playRoute(engine, deck, { id: 'search', name: '搜索', steps: searched.steps }, { seed, hand });
        searchLine = { source: 'search', value: boardValue(deck, replay.endBoard), boards: replay.boards, startBoard: replay.startBoard, steps: replay.steps, endBoard: replay.endBoard };
      } catch { searchStatus = 'replay-failed'; }
    }
    let game8Line = null;
    for (const { route, replay } of await game8Lines()) {
      const value = boardValue(deck, replay.endBoard);
      if (!game8Line || value > game8Line.value) game8Line = { source: 'game8', value, routeId: route.id, name: route.name, boards: replay.boards, startBoard: replay.startBoard, steps: replay.steps, endBoard: replay.endBoard };
    }
    const line = searchLine && (!game8Line || searchLine.value >= game8Line.value) ? searchLine : game8Line;
    const key = handKey(hand);
    const personal = Math.max(userValue, ...history.filter((r) => r.type === 'hand' && handKey(r.hand) === key).map((r) => r.userValue));
    if (line && line.value >= personal) return { source: line.source, value: line.value, line, search: searchStatus };
    return { source: 'personal', value: personal, line, search: searchStatus };
  }

  // 一条路线上的下一个回应：用户到现在的选择（语义形式）是这条路线的前缀（放哪一格、什么表示形式不计）、下一个回应在当前提示里合法才有，否则 null
  function nextOnLine(prompt, line) {
    const made = actions.length;
    if (made >= line.length || !actions.every((a, i) => a.response && sameChoice(a.response, line[i]))) return null;
    const indices = indicesFor(prompt, line[made]);
    return indices.some((i) => i < 0) ? null : indices;
  }

  // 提示：先看有没有一条现成的路线可以照着给下一步：搜完的话只看搜出的最好路线；没搜完（pending、超时、失败…）就看能重放的 Game8 路线，用户在哪条的前缀上就给哪条的下一步。
  // 没有，或者已偏离，就从当前局面用 budgetMs 再搜一次（不照 Game8 路线排序），给第一个回应。再搜在另开的会话里重放用户的选择，不动用户的这一手。
  // 返回 { indices, text, hints }，indices 是当前提示的合法选项下标
  async function hint({ searched, budgetMs, now: clock }) {
    const prompt = session.prompt();
    if (session.endBoard || !prompt) throw new HandError('现在没有要选的提示', 409);
    const made = actions.length;
    const flat = (steps) => steps.flatMap((s) => s.do).filter((r) => r !== 'finish');
    const lines = searched.status === 'done' ? [flat(searched.steps)] : (await game8Lines()).map(({ route }) => flat(route.steps));
    let indices = lines.map((line) => nextOnLine(prompt, line)).find(Boolean) ?? null;
    if (!indices) {
      const copy = await open();
      try {
        for (const a of actions) copy.choose(a.indices);
        const found = await searchSession(copy, deck, { now: clock, budgetMs, useRoutes: false });
        const first = found.steps?.[0]?.do[0];
        indices = first === undefined ? null : indicesFor(prompt, first);
      } finally { copy.close(); }
    }
    if (!indices || indices.some((i) => i < 0)) throw new HandError('没算出提示', 409);
    if (actions.length !== made || session.endBoard) throw new HandError('提示算的时候局面变了，再要一次', 409);
    hints++;
    hintedSteps.add(startsStep(prompt, indices) || step === 0 ? step + 1 : step);
    return { indices, text: `建议：${label(prompt, indices)}`, hints };
  }

  // 结算。history 是日志里已有的记录（找这手牌的个人最好）；返回 { settlement, record }，record 是追加进日志的那一行
  async function end(at, history = [], searched = { status: 'pending' }) {
    finishTurn(at);
    const endBoard = session.endBoard;
    const seconds = (at - startedAt) / 1000;
    const userValue = boardValue(deck, endBoard);
    const base = await benchmark(userValue, history, searched);
    const result = score({ userValue, bestValue: base.value, seconds, hints });
    const benchmarkInfo = { source: base.source, ...(base.line?.routeId ? { routeId: base.line.routeId, name: base.line.name } : {}), provisional: !base.line, search: base.search };
    const codes = (list) => list.map((c) => c.code);
    const final = { hand: codes(endBoard.hand), monsters: codes(endBoard.monsters), spellTraps: codes(endBoard.spellTraps) };
    const last = new Map(actions.map((a) => [a.step, a])); // 每步取最后一个操作之后的场面
    const rows = new Map(stepRows().map((r) => [r.step, r]));
    const userSteps = [...last.values()].map((a) => { const r = rows.get(a.step); return { step: a.step, text: actions.filter((x) => x.step === a.step).map((x) => x.text).join(' → '), summary: r.summary, spent: r.spent, gained: r.gained, hinted: hintedSteps.has(a.step), value: a.valueAfter, state: a.state }; });
    // 最好路线每一步做了什么、花了什么换来什么：和用户的一步对一步
    const line = base.line;
    const bestSteps = line ? line.boards.map((b, i) => ({ step: i + 1, summary: line.steps[i], ...stepLedger(i === 0 ? line.startBoard : line.boards[i - 1], b, md) })) : null;
    const cardsOf = (list) => list.map((c) => ({ code: c.code, md: md(c.code) }));
    // 这类起手（日志里同一个起手类型的）的平均总分，含这一手
    const handType = classifyHand(deck, hand);
    const typeTotals = [...history.filter((r) => r.type === 'hand' && r.handType === handType).map((r) => r.total), result.total];
    const typeName = deck.handTypes.find((t) => t.id === handType)?.name ?? (handType === 'brick' ? '烂手' : '其他起手');
    const record = {
      type: 'hand', v: 1, id, seed, hand: [...hand], handType, benchmarkHand: false, startedAt, durationMs: at - startedAt, hints,
      actions: actions.map(({ step: s, at: t, kind, text, indices, valueAfter }) => ({ step: s, atMs: t, kind, text, indices, value: valueAfter })),
      endBoard: final, userValue, bestValue: base.value, benchmark: benchmarkInfo, ...result,
    };
    const { type: _type, ...shown } = record;
    const settlement = {
      ...shown,
      finalBoard: { hand: endBoard.hand.map((c) => ({ ...c, md: md(c.code) })), monsters: endBoard.monsters.map((c) => ({ ...c, md: md(c.code) })), spellTraps: endBoard.spellTraps.map((c) => ({ ...c, md: md(c.code) })) },
      bestBoard: base.line && base.source !== 'personal' ? { hand: cardsOf(base.line.endBoard.hand), monsters: cardsOf(base.line.endBoard.monsters), spellTraps: cardsOf(base.line.endBoard.spellTraps) } : null,
      // 终场的组成：打断数和手牌数，用户和最好各一份（最好只在基准是搜索或 Game8 时有）
      parts: { user: { interrupts: interruptsOf(deck, endBoard), hand: endBoard.hand.length }, best: base.line && base.source !== 'personal' ? { interrupts: interruptsOf(deck, base.line.endBoard), hand: base.line.endBoard.hand.length } : null },
      steps: userSteps.map(({ state: _state, ...step }) => step),
      bestSteps,
      handTypeStats: { type: handType, name: typeName, average: Math.round(typeTotals.reduce((a, b) => a + b, 0) / typeTotals.length), count: typeTotals.length },
      curve: { user: userSteps.map((s) => (base.value > 0 ? s.value / base.value : 1)), best: base.line ? curve(deck, base.line.boards, base.value) : null },
    };
    // 走偏的那一步：用户第 i 步之后的局面和最好路线第 i 步之后的不一样（两边都按 startsStep 切步）；一直一样就是 null
    const bestStates = base.line ? base.line.boards.map(stateKey) : null;
    settlement.divergeStep = bestStates ? (userSteps.findIndex((s, i) => s.state !== bestStates[i]) + 1 || null) : null;
    session.close();
    return { settlement, record };
  }

  return { info, view, submit, hint, end, close: () => session.close() };
}

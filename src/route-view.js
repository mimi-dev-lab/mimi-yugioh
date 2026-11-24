// 路线的展示数据（GET /routes、GET /route）：把 playRoute 重放出来的每一步场面配上卡名、和上一步的差异、终场汇总。
// 场面全部来自引擎重放，这里只加名字、算差异、数打断；纯函数，引擎由调用方注入。
import { diffEnd, playRoute } from './route.js';

// 场面里展示的区域：手牌、怪兽区（含额外怪兽区）、魔陷区（含场地）、墓地、除外
export const ZONES = ['hand', 'monsters', 'spellTraps', 'grave', 'banished'];

const cardOf = (deck, code) => ({ code, md: deck.cards[code]?.md ?? String(code), jp: deck.cards[code]?.jp ?? String(code) });

// 一张场上的卡：密码、简中名、日文名、区内位置（手牌是第几张，怪兽区 0–4 是主怪兽区、5–6 是额外怪兽区，魔陷区同理）
const placed = (deck, c) => ({ ...cardOf(deck, c.code), sequence: c.sequence });

// 一个区域前后的差异：按密码数张数，多出来的是「进来了」，少了的是「离开了」（区内换位置不算）
function zoneDiff(deck, before, after) {
  const count = (cards) => cards.reduce((m, c) => m.set(c.code, (m.get(c.code) ?? 0) + 1), new Map());
  const a = count(before);
  const b = count(after);
  const surplus = (from, to) => [...from].flatMap(([code, n]) => Array(Math.max(0, n - (to.get(code) ?? 0))).fill(cardOf(deck, code)));
  return { in: surplus(b, a), out: surplus(a, b) };
}

// 场面加上名字，并把刚进来的卡标 fresh（每个密码标最后 delta 张）
function viewBoard(deck, board, diff) {
  const view = {};
  for (const zone of ZONES) {
    const cards = board[zone].map((c) => placed(deck, c));
    for (const entered of diff?.[zone].in ?? []) {
      const target = cards.findLast((c) => c.code === entered.code && !c.fresh);
      if (target) target.fresh = true;
    }
    view[zone] = cards;
  }
  return view;
}

// 终场汇总：场上每张卡、剩余手牌、打断数 = 终场在场各卡 interrupts 之和，每个打断靠哪张卡、怎么打断（同一张卡有几张就合在一条里）
export function endSummary(deck, endBoard) {
  const board = viewBoard(deck, endBoard);
  const copies = new Map();
  for (const c of [...board.monsters, ...board.spellTraps]) copies.set(c.code, (copies.get(c.code) ?? 0) + 1);
  const breakers = [...copies].flatMap(([code, n]) => {
    const { interrupts = 0, interruptHow } = deck.cards[code] ?? {}; // 卡组外的卡（token）不提供打断
    return interrupts > 0 ? [{ ...cardOf(deck, code), copies: n, interrupts: interrupts * n, interruptHow }] : [];
  });
  return { ...board, interrupts: breakers.reduce((n, b) => n + b.interrupts, 0), breakers };
}

// 重放一条路线，返回页面要的全部数据。重放走不通会抛错（带步号），由调用方决定怎么回
export async function replayRoute(engine, deck, route) {
  const played = await playRoute(engine, deck, route);
  if (played.scriptErrors.length) throw new Error(`引擎脚本报错：${played.scriptErrors[0]}`);
  let before = played.startBoard;
  const steps = route.steps.map((step, i) => {
    const after = played.stepBoards[i];
    const diff = Object.fromEntries(ZONES.map((zone) => [zone, zoneDiff(deck, before[zone], after[zone])]));
    before = after;
    return {
      n: i + 1, text: step.text, actions: played.stepActions[i], activated: played.stepActivated[i].map((code) => cardOf(deck, code)),
      board: viewBoard(deck, after, diff), diff,
    };
  });
  const end = endSummary(deck, played.endBoard);
  return {
    id: route.id, name: route.name, needs: cardOf(deck, route.needs), source: route.source, verified: route.verified,
    mismatch: route.mismatch ?? '', engineDiff: diffEnd(route, played.endBoard),
    start: viewBoard(deck, played.startBoard), steps, end,
  };
}

// 路线列表的一项
export const routeListItem = (r) => ({ id: r.id, name: r.name, needs: r.needs, interrupts: r.end.interrupts, steps: r.steps.length, source: r.source, verified: r.verified, mismatch: r.mismatch, engineDiff: r.engineDiff });

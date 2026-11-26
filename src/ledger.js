// 资源账本：路线每一步走完后，这一回合的资源还剩什么。全部由引擎重放的状态算出，不手写：
//   通常召唤：引擎说这回合的召唤权用掉了没（通常召唤或盖放怪兽）、是在第几步用掉的；
//   每回合一次的效果：我方发动过的效果（引擎的发动记录），按卡组数据里的 ONCE_PER_TURN 认出是哪张卡的第几个效果；同一个效果发动几次只列一条；
//     分两组：before = 这一步之前已经用过的，now = 这一步新用掉的（两组不重叠）；发动了表里没有的效果就报错，不悄悄丢掉（引擎没有把「每回合一次」告诉我们，见 branded-ledger.js 文件头）；
//   额外卡组：这一步走完后还剩几张、起手时有几张；关键卡（额外卡组里提供打断的怪兽，取自卡组数据的打断数）一张张列出还在不在额外卡组、不在的话在哪个区。
// 数据写法见 src/decks/branded-ledger.js 文件头。纯函数。
import { cardOf } from './deck.js';
import { effectIndexOf } from './interrupts.js';

const entryKey = (e) => `${e.code}:${e.n}:${e.zone ?? ''}`;

// 返回问题列表（空 = 没问题）。deck.ledger = { oncePerTurn }
export function checkLedger(deck) {
  const problems = [];
  const seen = new Set();
  for (const e of deck.ledger.oncePerTurn) {
    if (!deck.cards[e.code]) problems.push(`账本数据里的 ${e.code} 不在卡表里`);
    if (!Number.isInteger(e.n)) problems.push(`账本数据 ${e.code} 的 n 不是整数`);
    if (!/^[①②③④⑤]$/.test(e.label ?? '') || !e.gist?.trim()) problems.push(`账本数据 ${e.code}:${e.n} 缺 label（①②③）或 gist`);
    if (seen.has(entryKey(e))) problems.push(`账本数据 ${e.code}:${e.n}${e.zone ? `:${e.zone}` : ''} 重复`);
    seen.add(entryKey(e));
  }
  return problems;
}

// 引擎的一次发动 { code, description, zone } 对应账本数据里的哪一项；认不出是 undefined
export function effectOf(deck, activation) {
  const n = effectIndexOf(activation.description);
  const hits = deck.ledger.oncePerTurn.filter((e) => e.code === activation.code && e.n === n);
  return hits.find((e) => e.zone === activation.zone) ?? hits.find((e) => e.zone === undefined);
}

const ZONES = ['hand', 'monsters', 'spellTraps', 'grave', 'banished', 'extra'];

// 每步一个账本：{ normalSummon: { used, step }, effects: { before: [...], now: [...] }（每项 { ...card, label, gist, shared?, step（第几步第一次用）}）, extra: { remaining, start, key: [{ ...card, total, inExtra, elsewhere: { 区名: 张数 } }] } }
// startBoard / stepBoards：重放出的起手和每步之后的场面（含 extra 区）；stepActivations：每步里的发动；stepNormalSummon：每步之后召唤权用掉了没
export function buildLedger(deck, { startBoard, stepBoards, stepActivations, stepNormalSummon }) {
  const keyCodes = [...new Set(deck.extra.map((e) => e.code))].filter((code) => deck.cards[code].interrupts > 0);
  const firstUsed = new Map(); // effect key -> 第几步第一次用
  let summonStep = null;
  return stepBoards.map((board, i) => {
    const n = i + 1;
    for (const a of stepActivations[i]) {
      const e = effectOf(deck, a);
      if (!e) throw new Error(`「每回合一次」表里没有 ${a.code} 的效果描述 ${a.description}（${a.zone}），第 ${n} 步发动了它：先在 src/decks/branded-ledger.js 补上`);
      if (!firstUsed.has(entryKey(e))) firstUsed.set(entryKey(e), n);
    }
    if (stepNormalSummon[i] && summonStep === null) summonStep = n;
    const entries = [...firstUsed].map(([key, step]) => {
      const e = deck.ledger.oncePerTurn.find((x) => entryKey(x) === key);
      return { ...cardOf(deck, e.code), label: e.label, gist: e.gist, ...(e.shared ? { shared: e.shared } : {}), step };
    });
    const effects = { before: entries.filter((e) => e.step < n), now: entries.filter((e) => e.step === n) };
    const key = keyCodes.map((code) => {
      const where = Object.fromEntries(ZONES.map((z) => [z, board[z].filter((c) => c.code === code).length]).filter(([, k]) => k > 0));
      const total = deck.extra.filter((e) => e.code === code).reduce((s, e) => s + e.count, 0);
      const { extra: inExtra = 0, ...elsewhere } = where;
      return { ...cardOf(deck, code), total, inExtra, elsewhere };
    });
    return { normalSummon: { used: stepNormalSummon[i], step: summonStep }, effects, extra: { remaining: board.extra.length, start: startBoard.extra.length, key } };
  });
}

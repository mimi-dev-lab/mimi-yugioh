// 卡组：把 { code, count } 的列表展开成密码数组，并检查卡组数据是否完整、张数是否合规。纯函数，不读文件。
import { maxCopies } from './banlist.js';
import { checkInterruptFields } from './interrupts.js';

export function expand(list) {
  return list.flatMap(({ code, count }) => Array(count).fill(code));
}

// 返回问题列表（空 = 没问题）。deck = { cards, main, extra, roles }，limit 默认用现行禁限表
export function checkDeck(deck, { limit = maxCopies, mainSize = 40, extraSize = 15 } = {}) {
  const problems = [];
  const main = expand(deck.main);
  const extra = expand(deck.extra);
  if (main.length !== mainSize) problems.push(`主卡组 ${main.length} 张，要 ${mainSize} 张`);
  if (extra.length !== extraSize) problems.push(`额外卡组 ${extra.length} 张，要 ${extraSize} 张`);
  const counts = new Map();
  for (const code of [...main, ...extra]) counts.set(code, (counts.get(code) ?? 0) + 1);
  for (const [code, n] of counts) {
    const card = deck.cards[code];
    if (!card) { problems.push(`${code} 不在卡表里`); continue; }
    if (n > limit(code)) problems.push(`${card.jp}（${code}）${n} 张，禁限表上限 ${limit(code)}`);
    for (const key of ['jp', 'md', 'does', 'cost', 'limit']) if (typeof card[key] !== 'string' || !card[key].trim()) problems.push(`${card.jp ?? code} 缺 ${key}`);
    if (!deck.roles.some((r) => r.name === card.role)) problems.push(`${card.jp}（${code}）的作用 ${card.role} 不在 ${deck.roles.map((r) => r.name).join('、')} 里`);
    if (!Number.isInteger(card.interrupts) || card.interrupts < 0) problems.push(`${card.jp}（${code}）的打断数不是非负整数`);
    else if (typeof card.interruptHow !== 'string' || (card.interrupts > 0) !== (card.interruptHow.trim() !== '')) problems.push(`${card.jp}（${code}）的打断数 ${card.interrupts} 和「对手回合怎么打断」对不上：有打断就要写怎么打断，没有就留空`);
  }
  problems.push(...checkInterruptFields(deck));
  for (const code of Object.keys(deck.cards)) if (!counts.has(Number(code))) problems.push(`${deck.cards[code].jp}（${code}）在卡表里但不在卡组里`);
  return problems;
}

// 卡组一览（GET /deck）：每张卡一条，带它在主卡组还是额外卡组、几张；按作用（deck.roles 的先后）分组，组内照卡组数据里的顺序
export function deckOverview(deck) {
  const entries = [...deck.main.map((e) => ({ ...e, zone: 'main' })), ...deck.extra.map((e) => ({ ...e, zone: 'extra' }))];
  const cards = entries.map(({ code, count, zone }) => {
    const { md, jp, role, does, cost, limit, interrupts, interruptHow } = deck.cards[code];
    return { code, md, jp, role, zone, count, does, cost, limit, interrupts, interruptHow };
  });
  const rank = (c) => deck.roles.findIndex((r) => r.name === c.role);
  return { name: deck.name, source: deck.source, roles: deck.roles, cards: cards.sort((a, b) => rank(a) - rank(b)) };
}

// 卡组：把 { code, count } 的列表展开成密码数组，并检查卡组数据是否完整、张数是否合规。纯函数，不读文件。
import { maxCopies } from './banlist.js';

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
    if (!deck.roles.includes(card.role)) problems.push(`${card.jp}（${code}）的角色 ${card.role} 不在 ${deck.roles.join('、')} 里`);
    if (!Number.isInteger(card.interrupts) || card.interrupts < 0) problems.push(`${card.jp}（${code}）的打断数不是非负整数`);
  }
  for (const code of Object.keys(deck.cards)) if (!counts.has(Number(code))) problems.push(`${deck.cards[code].jp}（${code}）在卡表里但不在卡组里`);
  return problems;
}

// 起手类型：规则在卡组数据的 handTypes 里，按顺序第一个命中的算；都没命中，有别的起手卡是 other，一张都没有是 brick
export function classifyHand(deck, hand) {
  for (const type of deck.handTypes) if (type.has.some((code) => hand.includes(code))) return type.id;
  return hand.some((code) => deck.cards[code]?.role === '起手') ? 'other' : 'brick';
}

// 起手类型的显示名：卡组数据里有名字的用它，其余是「其他起手」和「烂手」
export function handTypeName(deck, id) {
  return deck.handTypes.find((t) => t.id === id)?.name ?? (id === 'brick' ? '烂手' : '其他起手');
}

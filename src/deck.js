// 卡组：把 { code, count } 的列表展开成密码数组，并检查卡组数据是否完整、张数是否合规。纯函数，不读文件。
import { maxCopies } from './banlist.js';
import { checkInterruptFields } from './interrupts.js';
import { checkRoleTags } from './roles.js';

export function expand(list) {
  return list.flatMap(({ code, count }) => Array(count).fill(code));
}

// 一张卡的展示数据：密码、简中名、日文名，怪兽再带 level（等级）/ rank（Xyz 阶级）/ link（连接数）之一，取自卡组数据的 levels；
// 卡表里没有的卡（token）名字退回密码。快照、起手速查、卡组一览的卡都从这里来，levels 只在这里并进去
export const cardOf = (deck, code) => ({ code, md: deck.cards[code]?.md ?? String(code), jp: deck.cards[code]?.jp ?? String(code), ...deck.levels?.[code] });

// 返回问题列表（空 = 没问题）。deck = { cards, main, extra, roles, levels? }，limit 默认用现行禁限表
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
  if (deck.roleTags) problems.push(...checkRoleTags(deck));
  for (const code of Object.keys(deck.cards)) if (!counts.has(Number(code))) problems.push(`${deck.cards[code].jp}（${code}）在卡表里但不在卡组里`);
  return problems;
}

// 卡组一览（GET /deck）：roleTerms 是作用标签的术语表，每张卡的 roleTags / roleWhy 是它的默认作用和原因（src/roles.js）；每张卡一条，带它在主卡组还是额外卡组、几张；按作用（deck.roles 的先后）分组，组内照卡组数据里的顺序
export function deckOverview(deck) {
  const entries = [...deck.main.map((e) => ({ ...e, zone: 'main' })), ...deck.extra.map((e) => ({ ...e, zone: 'extra' }))];
  const cards = entries.map(({ code, count, zone }) => {
    const { role, does, cost, limit, interrupts, interruptHow } = deck.cards[code];
    const tags = deck.roleTags?.defaults[code];
    return { ...cardOf(deck, code), role, zone, count, does, cost, limit, interrupts, interruptHow, ...(tags ? { roleTags: tags.tags, roleWhy: tags.why } : {}) };
  });
  const rank = (c) => deck.roles.findIndex((r) => r.name === c.role);
  return { name: deck.name, source: deck.source, roles: deck.roles, ...(deck.roleTags ? { roleTerms: deck.roleTags.terms } : {}), cards: cards.sort((a, b) => rank(a) - rank(b)) };
}

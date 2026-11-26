// 终场打断数：按卡组数据里每张卡的打断条件，算一个终场（我方回合结束时的场面）在对手回合能打断几次。
// 路线的终场汇总（route-view.js 的 endSummary，起手速查也取它）、最好场面搜索和随机起手模拟（search.js 的 interruptsOf）都只调这里，不各算各的。纯函数。
//
// 卡组数据里一张卡和打断有关的字段（写法见 DESIGN「卡组数据」）：
//   interrupts  每张能打断几次；0 就不看下面的字段
//   from        从哪里发动：['field']（默认，怪兽区或魔陷区）或 ['hand', 'field']（手牌也能发动，如铁兽鸟 墨丘利耶）
//   perTurn     同名卡每回合最多用几张（卡片原文「这个卡名的卡在 1 回合只能发动 1 张」或「效果 1 回合只能使用 1 次」）；不写 = 不限
//   needs       发动的前提（只看有没有，不消耗）：条件对象，见 meets
//   pay         发动要付出的、会用掉终场资源的代价：{ discard: n }（弃 n 张手牌）或 { extra: 规格 }（从额外卡组送 1 只符合规格的去墓地）
//   ownTurnLock 效果号 n（卡片脚本里 aux.Stringid(密码, n) 的 n）：这个效果在自己回合发动过，到下一个对手回合结束前都不能再用（冰剑龙的除外效果）。
//               终场的 used（我方回合里发动过、发动后没离开那一格的效果，duel-session 记）里有这张卡这一格的这个效果，它就不算。
//               只给限制跨到对手回合的效果写：普通的「每回合一次」在自己回合结束时就重置了，自己回合用过不影响对手回合
//   tags        这张卡的性质，条件里的规格按它匹配（如 albazFusion = 以阿尔白斯之落胤为融合素材的融合怪兽）
//
// 规格：标签（字符串）、密码（数字）或它们的数组（符合其一即可）；要几张时写 { of, n }，不写 n 是 1。
// 条件对象的键（同时写几个 = 都要满足）：field（自己怪兽区）、hand、handOrField、grave、extra，值是规格；anyOf: [条件对象…] 满足其一即可。
// 数手牌和怪兽区时不算发动的这张卡自己。
//
// 资源分配：手牌发动的卡用掉它自己那张手牌；弃牌代价从剩下的手牌里出；送额外卡组的代价按场上的先后付（怪兽区在魔陷区前）。
// 烙印里会抢额外卡组的只有冰剑龙（怪兽区，要 albazFusion）和落胤与圣女（魔陷区，要 mentionsAlbaz，范围更大），这个先后已经是最优的；加了别的卡组再看要不要换成更聪明的分配。
// 不模拟发动之后场面怎么变（例如烙印断罪让融合怪兽回额外卡组之后，别的卡的前提还在不在）：每张卡都对着终场判断。
// 融合召唤用到的素材（赫之圣女 卡尔塔西亚）只查有没有，不从手牌里扣掉。

// 效果描述号（引擎报的发动记录和提示里的 description，字串）：卡片脚本里 aux.Stringid(密码, n) 是 密码 * 2^20 + n；烙印融合这类用系统字串的，引擎直接报 n（如 1170）。
// 编码（descriptionOf）和解码（effectIndexOf）只在这里：打断数的「自己回合锁住」和资源账本认效果都走它
export const descriptionOf = (code, n) => String(code * 2 ** 20 + n);
export const effectIndexOf = (description) => Number(description) % 2 ** 20;

const asSpec = (spec) => (spec !== null && typeof spec === 'object' && !Array.isArray(spec) ? { of: spec.of, n: spec.n ?? 1 } : { of: spec, n: 1 });
const asList = (of) => (Array.isArray(of) ? of : [of]);

// 一张卡是否符合规格的 of：密码相等，或卡组数据里这张卡带那个标签
export const fits = (deck, code, of) => asList(of).some((o) => (typeof o === 'number' ? code === o : (deck.cards[code]?.tags ?? []).includes(o)));

// 条件是否满足。zones 是各区域的卡（{ code } 的数组），self 是发动的这张卡（同一个对象，数的时候跳过它）
export function meets(deck, need, zones, self) {
  if (!need) return true;
  const zoneOf = { field: zones.monsters, hand: zones.hand, handOrField: [...zones.hand, ...zones.monsters], grave: zones.grave, extra: zones.extra };
  for (const [key, value] of Object.entries(need)) {
    if (key === 'anyOf') { if (!value.some((n) => meets(deck, n, zones, self))) return false; continue; }
    if (!(key in zoneOf)) throw new Error(`打断条件里不认识的键 ${key}`);
    const { of, n } = asSpec(value);
    if (zoneOf[key].filter((c) => c !== self && fits(deck, c.code, of)).length < n) return false;
  }
  return true;
}

// 这张卡这一格的 ownTurnLock 效果（引擎报的效果描述号 = aux.Stringid(密码, n) = 密码 << 20 | n，见 utility.lua；密码超过 2^11 位移会溢出 32 位，所以用乘法），在我方回合里发动过、之后没离开这一格
const lockedByOwnTurn = (card, c, boardZone, used) => card.ownTurnLock !== undefined
  && used.some((u) => u.code === c.code && u.zone === boardZone && u.sequence === c.sequence && u.description === descriptionOf(c.code, card.ownTurnLock));

// 终场的打断：total 是总数，breakers 是每张提供打断的卡 { code, copies（算进去的张数）, interrupts }，按场上的先后（怪兽区、魔陷区，再手牌）。卡组外的卡（token）不提供打断
export function countInterrupts(deck, board) {
  const zones = { hand: board.hand ?? [], monsters: board.monsters ?? [], spellTraps: board.spellTraps ?? [], grave: board.grave ?? [], extra: board.extra ?? [] };
  const usedEffects = board.used ?? [];
  // 1. 能发动的来源：在发动区域里、前提满足、没被自己回合的发动锁住
  const sources = [];
  for (const [from, boardZone] of [['field', 'monsters'], ['field', 'spellTraps'], ['hand', 'hand']]) {
    for (const c of zones[boardZone]) {
      const card = deck.cards[c.code];
      if (!card?.interrupts || !(card.from ?? ['field']).includes(from)) continue;
      if (lockedByOwnTurn(card, c, boardZone, usedEffects)) continue;
      if (meets(deck, card.needs, zones, c)) sources.push({ c, card, zone: from });
    }
  }
  // 2. 同名卡每回合的张数上限（场上的先算）
  const used = new Map();
  const capped = sources.filter(({ c, card }) => {
    const n = used.get(c.code) ?? 0;
    if (card.perTurn !== undefined && n >= card.perTurn) return false;
    used.set(c.code, n + 1);
    return true;
  });
  // 3. 代价：手牌发动的卡占掉自己那张，其余手牌给弃牌代价；额外卡组的代价按场上的先后付
  const hand = zones.hand.filter((h) => !capped.some((s) => s.c === h));
  const extra = [...zones.extra];
  const paid = new Set();
  for (const s of capped) {
    const { discard, extra: spec } = s.card.pay ?? {};
    if (discard !== undefined) {
      if (hand.length < discard) continue;
      hand.splice(0, discard);
    } else if (spec !== undefined) {
      const pick = extra.findIndex((e) => fits(deck, e.code, spec));
      if (pick < 0) continue;
      extra.splice(pick, 1);
    }
    paid.add(s);
  }
  const copies = new Map();
  for (const s of capped) if (paid.has(s)) copies.set(s.c.code, (copies.get(s.c.code) ?? 0) + 1);
  const breakers = [...copies].map(([code, n]) => ({ code, copies: n, interrupts: deck.cards[code].interrupts * n }));
  return { total: breakers.reduce((sum, b) => sum + b.interrupts, 0), breakers };
}

// 卡组数据里打断字段的写法对不对：返回问题列表（checkDeck 调用）
export function checkInterruptFields(deck) {
  const problems = [];
  const tags = new Set(Object.values(deck.cards).flatMap((c) => c.tags ?? []));
  const checkSpec = (name, spec) => {
    const { of, n } = asSpec(spec);
    if (!Number.isInteger(n) || n < 1) problems.push(`${name}：张数 ${n} 不是正整数`);
    for (const o of asList(of)) {
      if (typeof o === 'number' ? !deck.cards[o] : !tags.has(o)) problems.push(`${name}：${o} 不是卡表里的密码，也没有卡带这个标签`);
    }
  };
  const checkNeed = (name, need) => {
    for (const [key, value] of Object.entries(need)) {
      if (key === 'anyOf') { if (!Array.isArray(value) || !value.length) problems.push(`${name}：anyOf 要是非空数组`); else value.forEach((n) => checkNeed(name, n)); } else if (['field', 'hand', 'handOrField', 'grave', 'extra'].includes(key)) checkSpec(name, value);
      else problems.push(`${name}：条件里不认识的键 ${key}`);
    }
  };
  for (const [code, card] of Object.entries(deck.cards)) {
    const name = `${card.jp}（${code}）`;
    if (card.tags !== undefined && !(Array.isArray(card.tags) && card.tags.every((t) => typeof t === 'string'))) problems.push(`${name}：tags 要是字符串数组`);
    const hasRule = ['from', 'perTurn', 'needs', 'pay', 'ownTurnLock'].some((k) => card[k] !== undefined);
    if (hasRule && !card.interrupts) problems.push(`${name}：打断数是 0，不该写打断条件`);
    if (card.from !== undefined && !(Array.isArray(card.from) && card.from.length && card.from.every((z) => z === 'hand' || z === 'field'))) problems.push(`${name}：from 只能是 hand、field`);
    if (card.perTurn !== undefined && !(Number.isInteger(card.perTurn) && card.perTurn >= 1)) problems.push(`${name}：perTurn 要是正整数`);
    if (card.ownTurnLock !== undefined && !(Number.isInteger(card.ownTurnLock) && card.ownTurnLock >= 0 && card.ownTurnLock < 16)) problems.push(`${name}：ownTurnLock 要是 0 到 15 的整数（脚本里的效果号）`);
    if (card.needs !== undefined) checkNeed(name, card.needs);
    if (card.pay !== undefined) {
      const keys = Object.keys(card.pay);
      if (keys.length !== 1 || !['discard', 'extra'].includes(keys[0])) problems.push(`${name}：pay 只能是 { discard } 或 { extra }`);
      else if (keys[0] === 'discard' && !(Number.isInteger(card.pay.discard) && card.pay.discard >= 1)) problems.push(`${name}：弃牌张数要是正整数`);
      else if (keys[0] === 'extra') checkSpec(name, card.pay.extra);
    }
  }
  return problems;
}

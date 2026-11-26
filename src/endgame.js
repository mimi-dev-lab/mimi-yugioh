// 终场倒推（规格 #45 的第 4 块，试用功能 endgame）：2–3 个目标终场，每个写清需要哪几块积木、哪几张关键卡，缺一块时用什么补。
// 目标终场是数据（src/decks/branded-endgames.js：路线、积木、关键卡、500 手里的手数）；这里做三件事：
//   checkEndgames  查数据：引用的路线、积木、卡都存在，积木和路线的分段一致，关键卡都是提供打断的卡（纯数据，不用引擎）；
//   rankEndgames   「怎么挑」的规则：路线终场按提供打断的卡合并，按打断数、500 手里的手数排；测试用它核对数据里挑的就是前几个；
//   buildEndgames  页面要的数据：由重放过的路线（replayRoute 的结果）和卡组数据拼出来，缺一块积木时的补法也是推出来的，不手写。
// 缺积木 X 时的补法（只用路线和积木的数据能推出的）：看目标路线里 X 的前一块 P 和后一块 S，在别的路线里找
//   换一块（swap）：同样是 P 之后、S 之前，别的路线放的是另一块 Y，换成 Y；
//   跳过（skip）：别的路线 P 之后直接就是 S（X 是第一块时，S 直接是那条路线的第一块），不用 X；跳过的路线要的起手卡写在旁边。X 是最后一块时 S 是「终场」，跳过 = 停在 P 做完，改用那条路线的终场；
//   都没有（换不了也跳不过）：改走根本不用 X 的路线，列打断数最高的几条（without）。
// 这是按数据的近似：换的积木给的东西不一样，能不能真的接上要看那块积木的「要什么」，页面把它们并排写出来，由人判断。纯函数。
import { cardOf } from './deck.js';
import { routeBlocks } from './blocks.js';

export const WITHOUT_ROUTES = 3; // 「都没有」时最多列几条改走的路线

const sorted = (codes) => [...codes].sort((a, b) => a - b);
const sameSet = (a, b) => a.length === b.length && sorted(a).every((c, i) => c === sorted(b)[i]);

// 返回问题列表（空 = 没问题）。deck.endgames = 目标终场的列表（数据写法见 src/decks/branded-endgames.js）
export function checkEndgames(deck) {
  const problems = [];
  const list = deck.endgames ?? [];
  if (list.length < 2 || list.length > 3) problems.push(`目标终场 ${list.length} 个，要 2–3 个`);
  const ids = new Set();
  const names = new Set();
  for (const e of list) {
    if (ids.has(e.id)) problems.push(`终场目标 id ${e.id} 重复`);
    ids.add(e.id);
    if (!e.name?.trim()) problems.push(`终场目标 ${e.id} 缺名字`);
    else if (names.has(e.name)) problems.push(`终场目标名字 ${e.name} 重复`);
    names.add(e.name);
    const route = deck.routes.find((r) => r.id === e.route);
    if (!route) problems.push(`终场目标 ${e.id} 指向不存在的路线 ${e.route}`);
    for (const b of e.blocks ?? []) if (!deck.blocks.list.some((x) => x.id === b)) problems.push(`终场目标 ${e.id} 用了不存在的积木 ${b}`);
    if (!e.blocks?.length) problems.push(`终场目标 ${e.id} 没有写需要哪几块积木`);
    else if (route && deck.blocks.segments[route.id]) {
      const actual = routeBlocks(deck, route.id).map((b) => b.id);
      if (JSON.stringify(actual) !== JSON.stringify(e.blocks)) problems.push(`终场目标 ${e.id} 写的积木 ${e.blocks.join('、')} 和路线 ${route.id} 的分段 ${actual.join('、')} 不一致`);
    }
    if (!e.keyCards?.length) problems.push(`终场目标 ${e.id} 没有写关键卡`);
    for (const code of e.keyCards ?? []) if (!(deck.cards[code]?.interrupts > 0)) problems.push(`终场目标 ${e.id} 的关键卡 ${code} 不在卡表里，或不提供打断`);
    if (!Number.isInteger(e.seen) || e.seen < 0) problems.push(`终场目标 ${e.id} 的 seen 不是非负整数`);
  }
  return problems;
}

// 随机起手模拟的一手里，最好终场（场上或手里）有没有这些卡。row.end = { monsters, spellTraps, hand }，都是密码数组
export const endHas = (row, codes) => codes.every((c) => [row.end.monsters, row.end.spellTraps, row.end.hand].some((zone) => zone.includes(c)));

// 「怎么挑」：routes 是重放过的路线，rows 是 500 手的 JSONL 行。
// 每条路线的终场按提供打断的卡合并成一个候选 { keys（卡密码，从小到大）, interrupts, seen（几手的终场里有这几张）, routes（走到它的路线 id）}，
// 按打断数从多到少、同打断数按 seen 从多到少、再按路线在卡组数据里的先后排；seen 是 0 的去掉（500 手一手都没搜到）
export function rankEndgames(routes, rows) {
  const byKeys = new Map();
  for (const r of routes) {
    const keys = sorted(r.end.breakers.map((b) => b.code));
    const id = keys.join(',');
    if (!byKeys.has(id)) byKeys.set(id, { keys, interrupts: r.end.interrupts, seen: rows.filter((row) => endHas(row, keys)).length, routes: [] });
    byKeys.get(id).routes.push(r.id);
  }
  return [...byKeys.values()].filter((c) => c.seen > 0).sort((a, b) => b.interrupts - a.interrupts || b.seen - a.seen); // 稳定排序：同分按路线先后
}

// 缺 X 时的补法：seqs 是每条路线的积木 id 序列（Map 路线 id → [积木 id]），target 是目标路线 id，i 是 X 在其中的位置
function compensate(deck, routesById, seqs, target, i) {
  const seq = seqs.get(target);
  const X = seq[i], P = seq[i - 1] ?? null, S = seq[i + 1] ?? null;
  const blockOf = (id) => { const { name, color, needs, gives } = deck.blocks.list.find((b) => b.id === id); return { id, name, color, needs, gives }; };
  const swaps = new Map(); // Y → 路线
  const skips = [];
  for (const [id, other] of seqs) {
    if (id === target) continue;
    const route = routesById.get(id);
    const from = (blockId) => route.blocks.find((b) => b.id === blockId).from;
    for (let k = 0; k <= other.length; k++) {
      if ((k === 0 ? P !== null : other[k - 1] !== P)) continue;
      const here = other[k] ?? null; // null = 这条路线到头了（终场）
      if (here !== null && here !== X && (S === null ? k === other.length - 1 : other[k + 1] === S)) {
        if (!swaps.has(here)) swaps.set(here, []);
        swaps.get(here).push({ id, name: route.name, step: from(here), needs: route.needs });
      }
      if (!(P === null && S === null) && here === S) skips.push({ id, name: route.name, step: S === null ? route.steps.length : from(S), needs: route.needs });
    }
  }
  const out = {
    swaps: [...swaps].map(([y, rs]) => ({ block: blockOf(y), routes: rs })),
    skips: skips.length ? [{ next: S === null ? null : blockOf(S), routes: skips }] : [],
    without: [],
  };
  if (!out.swaps.length && !out.skips.length) {
    out.without = [...routesById.values()].filter((r) => !seqs.get(r.id).includes(X))
      .sort((a, b) => b.end.interrupts - a.end.interrupts).slice(0, WITHOUT_ROUTES)
      .map((r) => ({ id: r.id, name: r.name, interrupts: r.end.interrupts, needs: r.needs }));
  }
  return out;
}

// 页面要的数据：{ hands（模拟手数）, endgames: [...] }；routes 是 replayRoute 的结果
export function buildEndgames(deck, routes, { hands }) {
  const routesById = new Map(routes.map((r) => [r.id, r]));
  const seqs = new Map(routes.map((r) => [r.id, r.blocks.map((b) => b.id)]));
  const endgames = deck.endgames.map((e) => {
    const route = routesById.get(e.route);
    const keys = sorted(e.keyCards);
    return {
      id: e.id, name: e.name, interrupts: route.end.interrupts, seen: e.seen,
      route: { id: route.id, name: route.name, steps: route.steps.length },
      start: route.needs,
      keyCards: e.keyCards.map((code) => route.end.breakers.find((b) => b.code === code)).map((b) => ({ ...cardOf(deck, b.code), interrupts: b.interrupts, interruptHow: b.interruptHow })),
      blocks: route.blocks.map((b, i) => ({ ...b, usedBy: routes.filter((r) => seqs.get(r.id).includes(b.id)).length, missing: compensate(deck, routesById, seqs, route.id, i) })),
      alsoRoutes: routes.filter((r) => r.id !== route.id && sameSet(r.end.breakers.map((x) => x.code), keys)).map((r) => ({ id: r.id, name: r.name })),
    };
  });
  return { hands, endgames };
}

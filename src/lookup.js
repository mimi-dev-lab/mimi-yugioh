// 起手速查：卡组数据里的 lookup（关键卡 → 路线；缺卡改走哪条）的检查和展示。纯函数，不读文件、不碰引擎。
// 速查只能指向卡组数据里已有的路线：数据是否站得住由测试查（checkLookup，同 checkDeck），展示在路线重放完之后跑（拿路线的名字、打断数）；
// 运行时指向的路线不在重放结果里就抛错，/routes 回 503，页面不显示没核对过的速查。
import { cardOf } from './deck.js';
import { routeListItem } from './route-view.js';

// 返回问题列表（空 = 没问题）。deck = { cards, routes, lookup }
export function checkLookup(deck) {
  const problems = [];
  const name = (code) => deck.cards[code]?.jp ?? String(code);
  const known = (code, what) => { if (!deck.cards[code]) { problems.push(`${what}：${code} 不在卡表里`); return false; } return true; };
  const routeOf = (id, what) => {
    const r = deck.routes.find((x) => x.id === id);
    if (!r) problems.push(`${what}：路线 ${id} 不存在`);
    return r;
  };
  const seen = new Set();
  for (const entry of deck.lookup) {
    const at = `速查「${name(entry.card)}」`;
    if (!known(entry.card, at)) continue;
    if (seen.has(entry.card)) problems.push(`${at} 写了两次`);
    seen.add(entry.card);
    if (!entry.routes.length) problems.push(`${at} 没有路线`);
    for (const { route: id, with: other } of entry.routes) {
      const r = routeOf(id, at);
      if (!r) continue;
      if (!r.hand.includes(entry.card)) problems.push(`${at} 指向 ${id}，但那条路线的起手里没有 ${name(entry.card)}`);
      if (other !== undefined && (!known(other, at) || !r.hand.includes(other))) problems.push(`${at} 指向 ${id} 搭 ${name(other)}，但那条路线的起手里没有它`);
    }
    for (const f of entry.fallbacks) {
      const r = routeOf(f.route, `${at}缺 ${name(f.lack)}`);
      if (!known(f.lack, at)) continue;
      const what = `${at}缺 ${name(f.lack)} 改走 ${f.route}`;
      if (!r) continue;
      if (r.hand.includes(f.lack)) problems.push(`${what}，但那条路线的起手里有 ${name(f.lack)}`);
      if (!f.have.length) problems.push(`${what} 没写手里有哪几张`);
      for (const c of f.have) if (known(c, what) && !r.hand.includes(c)) problems.push(`${what}，但那条路线的起手里没有 ${name(c)}`);
      if (typeof f.how !== 'string' || !f.how.trim()) problems.push(`${what} 没写为什么走得通`);
    }
  }
  return problems;
}

// 展示数据（GET /routes 的 lookup）：卡名换成 { code, md, jp }，目标路线取 /routes 列表里同一份（routeListItem）的 id、名字、终场打断数、步数。
// routes 是重放过的路线（replayRoute 的结果）；指向的路线不在里面就抛错，不让页面显示指向空的速查
export function lookupView(deck, routes) {
  const target = (id) => {
    const r = routes.find((x) => x.id === id);
    if (!r) throw new Error(`速查指向的路线 ${id} 不存在`);
    const { name, interrupts, steps } = routeListItem(r);
    return { id, name, interrupts, steps };
  };
  return deck.lookup.map((e) => ({
    card: cardOf(deck, e.card),
    routes: e.routes.map((r) => ({ ...target(r.route), with: r.with === undefined ? null : cardOf(deck, r.with) })),
    fallbacks: e.fallbacks.map((f) => ({ lack: cardOf(deck, f.lack), have: f.have.map((c) => cardOf(deck, c)), route: target(f.route), how: f.how })),
  }));
}

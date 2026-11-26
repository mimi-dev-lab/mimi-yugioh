// 决策树（规格 #45 的第 6 块，试用功能 tree）：按手牌回答几个「手里有 X 吗？」就走到一条路线。
// 树是数据（src/decks/branded-tree.js，由 scripts/decision-tree.js 用 buildTree 从路线数据和 500 手的结果生成，不手改；测试核对「数据 == 重算」）。
// 分岔问题的措辞可手写覆盖（src/decks/branded-tree-text.js，按卡的密码；没写就用「手里有「卡名」吗？」）。
// 树的形状：节点 { card, yes, no }（问手里有没有这张卡）或叶子 { route }（路线 id）。
//
// 「最好路线」的口径（和模拟里 bestRoute 同一个来源：JSONL 每手的 routeValues）：
//   一手的 routeValues 里，值不是 null 的路线就是「这手能走通的路线」（把路线的操作原样喂给这手的牌，引擎都接得住）；
//   能走通的路线里场面值（10 × 终场打断数 + 剩余手牌）最高的是这手的最好路线，并列的都算（bestRoutes 返回它们）；
//   一条路线都走不通的手没有最好路线，树对它无从对错，不算导向正确（也不从分母里拿掉：N / 总手数）。
//   另给一个更严的数：树指的路线走出的场面值等于这手的最好场面值（搜索和路线里更高的那个，row.value）。
// 生成：从起手速查里出现的卡（deck.lookup 的关键卡、搭的卡、缺卡时手里有的卡）里挑问题，贪心：每个节点选能让「叶子路线命中的手数」增加最多的卡，
// 增加 0 就不再分；每条路线自己的起手（route.hand）也当一个很轻的样本（权重 1，真实的一手是 1000），所以一手都没赢过的路线，只要能靠这些卡分出来也会有叶子；
// 同分取先出现的卡、先排的路线。深度没有另外限制，每个问题都至少让一手（或一条路线）多对。纯函数。
import { cardOf } from './deck.js';

export const REAL = 1000; // 真实的一手的权重
export const CANON = 1; // 路线自己的起手的权重

// 这手最好的路线（并列都算）：路线 id 列表；一条都走不通是 []
export function bestRoutes(row) {
  const walk = Object.entries(row.routeValues ?? {}).filter(([, v]) => v !== null);
  if (!walk.length) return [];
  const top = Math.max(...walk.map(([, v]) => v));
  return walk.filter(([, v]) => v === top).map(([id]) => id);
}

// 可以拿来问的卡：起手速查里出现的卡，按出现的先后去重
export function treeCards(deck) {
  const list = deck.lookup.flatMap((l) => [l.card, ...l.routes.map((r) => r.with), ...l.fallbacks.flatMap((f) => f.have)]).filter((c) => c !== undefined);
  return [...new Set(list)];
}

export function buildTree(deck, rows) {
  const ids = deck.routes.map((r) => r.id);
  const cards = treeCards(deck);
  const samples = [
    ...rows.map((r) => ({ hand: new Set(r.hand), best: bestRoutes(r), w: REAL })).filter((s) => s.best.length),
    ...deck.routes.map((r) => ({ hand: new Set(r.hand), best: [r.id], w: CANON })),
  ];
  const score = (ss) => { // 这批样本里最多能命中多少权重，和用哪条路线
    let top = { w: 0, route: ids[0] };
    for (const id of ids) { const w = ss.reduce((a, s) => a + (s.best.includes(id) ? s.w : 0), 0); if (w > top.w) top = { w, route: id }; }
    return top;
  };
  const grow = (ss, used) => {
    const here = score(ss);
    let pick = null;
    for (const card of cards) {
      if (used.has(card)) continue;
      const yes = ss.filter((s) => s.hand.has(card)); const no = ss.filter((s) => !s.hand.has(card));
      if (!yes.length || !no.length) continue;
      const gain = score(yes).w + score(no).w - here.w;
      if (gain > 0 && (!pick || gain > pick.gain)) pick = { card, gain, yes, no };
    }
    if (!pick) return { route: here.route };
    const next = new Set([...used, pick.card]);
    return { card: pick.card, yes: grow(pick.yes, next), no: grow(pick.no, next) };
  };
  return grow(samples, new Set());
}

// 一手走到的叶子（路线 id）
export function walkTree(tree, hand) {
  let node = tree;
  while (node.card !== undefined) node = hand.includes(node.card) ? node.yes : node.no;
  return node.route;
}

// 每个叶子：{ route, path: [{ card, has }]（从根走到它的回答）}，按树里「是」在前的先后
export function leavesOf(tree, path = []) {
  if (tree.route !== undefined) return [{ route: tree.route, path }];
  return [...leavesOf(tree.yes, [...path, { card: tree.card, has: true }]), ...leavesOf(tree.no, [...path, { card: tree.card, has: false }])];
}

// 导向正确率：对每一手走树，数走到的路线是不是最好路线。口径见文件头
export function scoreTree(tree, rows) {
  const out = { total: rows.length, withRoute: 0, noRoute: 0, correct: 0, strict: 0, perRoute: {}, single: null };
  const bestCount = {};
  for (const row of rows) {
    const best = bestRoutes(row);
    const leaf = walkTree(tree, row.hand);
    const slot = (out.perRoute[leaf] ??= { reached: 0, correct: 0 });
    slot.reached++;
    for (const id of best) bestCount[id] = (bestCount[id] ?? 0) + 1;
    if (!best.length) { out.noRoute++; continue; }
    out.withRoute++;
    if (best.includes(leaf)) { out.correct++; slot.correct++; }
    if (row.routeValues[leaf] === row.value) out.strict++;
  }
  const top = Object.entries(bestCount).sort((a, b) => b[1] - a[1])[0];
  out.single = top ? { route: top[0], correct: top[1] } : { route: null, correct: 0 };
  return out;
}

// 返回问题列表（空 = 没问题）。deck.tree 是树，deck.treeText = { questions: { 卡的密码: 问题 } }
export function checkTree(deck) {
  const problems = [];
  const routeIds = new Set(deck.routes.map((r) => r.id));
  const askable = new Set(treeCards(deck));
  const asked = new Set();
  const visit = (node, above, at) => {
    if (node === null || typeof node !== 'object') { problems.push(`${at} 不是节点`); return; }
    if (node.route !== undefined) {
      if (node.card !== undefined || node.yes !== undefined || node.no !== undefined) problems.push(`${at} 既是叶子又有问题`);
      if (!routeIds.has(node.route)) problems.push(`${at} 指向不存在的路线 ${node.route}`);
      return;
    }
    if (!deck.cards[node.card]) problems.push(`${at} 问的卡 ${node.card} 不在卡表里`);
    else if (!askable.has(node.card)) problems.push(`${at} 问的卡 ${deck.cards[node.card].md} 不在起手速查里`);
    if (above.includes(node.card)) problems.push(`${at} 重复问了 ${deck.cards[node.card]?.md ?? node.card}（这条路上已经问过）`);
    asked.add(node.card);
    if (!node.yes || !node.no) { problems.push(`${at} 缺「是」或「否」的下一步`); return; }
    visit(node.yes, [...above, node.card], `${at}→是`);
    visit(node.no, [...above, node.card], `${at}→否`);
  };
  if (!deck.tree) return ['卡组数据没有决策树'];
  visit(deck.tree, [], '树根');
  if (!problems.length) {
    const leaves = new Set(leavesOf(deck.tree).map((l) => l.route));
    for (const r of deck.routes) if (!leaves.has(r.id)) problems.push(`路线 ${r.id} 没有叶子指向它`);
  }
  for (const [code, text] of Object.entries(deck.treeText?.questions ?? {})) {
    if (!asked.has(Number(code))) problems.push(`问题措辞覆盖的卡 ${code} 不在树里`);
    if (typeof text !== 'string' || !text.trim()) problems.push(`卡 ${code} 的问题措辞是空的`);
  }
  return problems;
}

// 页面数据（GET /tree）：{ root, leaves }。root 是嵌套的节点，问题节点 { id, card, question, yes, no }、叶子 { id, route }，id 是从根走来的回答（根是 ''，是 y、否 n，如 'yn'）；
// leaves 是按树里先后的平铺列表 { id, route, path: [{ card, question, has }] }，给「整棵树」概览用。routes 是重放过的路线
export function treeView(deck, routes) {
  const questionOf = (code) => deck.treeText?.questions?.[code] ?? `手里有「${deck.cards[code].md}」吗？`;
  const routeOf = (id) => {
    const r = routes.find((x) => x.id === id);
    if (!r) throw new Error(`决策树指向的路线 ${id} 不存在`);
    return { id, name: r.name, needs: r.needs, interrupts: r.end.interrupts, steps: r.steps.length };
  };
  const walk = (node, id) => (node.route !== undefined ? { id, route: routeOf(node.route) }
    : { id, card: cardOf(deck, node.card), question: questionOf(node.card), yes: walk(node.yes, `${id}y`), no: walk(node.no, `${id}n`) });
  const root = walk(deck.tree, '');
  const flat = (n, path) => (n.route ? [{ id: n.id, route: n.route, path }]
    : [...flat(n.yes, [...path, { card: n.card, question: n.question, has: true }]), ...flat(n.no, [...path, { card: n.card, question: n.question, has: false }])]);
  return { root, leaves: flat(root, []) };
}

// 生成的数据文件的全文（scripts/decision-tree.js 写它；测试用它核对提交的文件）
export const treeFileText = (tree) => `// 烙印的决策树（试用功能 tree，#52）：由 scripts/decision-tree.js 从路线数据和 docs/opening-analysis.jsonl 生成，不手改；测试核对它等于重算的结果。
// 节点 { card, yes, no }：手里有这张卡（密码）走 yes，没有走 no；叶子 { route }：路线 id。口径和生成规则见 src/tree.js 文件头。问题的措辞覆盖在 branded-tree-text.js。
export const TREE = ${JSON.stringify(tree, null, 2)};
`;

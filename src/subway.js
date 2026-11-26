// 汇流地铁图（规格 #45 的第 3 块，试用功能 subway）：从卡组数据和重放过的路线推出一张图，不手画：
//   起手站  路线要的起手卡（route.needs），一张卡一站；
//   枢纽站  积木（src/blocks.js 的分段）：路线一块块连起来，几条路线共用同一块就是汇流的枢纽（≥2 条路线用）；只一条路线用的叫普通站；
//   终场站  每条路线一个：终场和打断数。
// 边是路线里相邻的两站（起手站 → 第一块积木 → … → 最后一块积木 → 终场站），同一对站被几条路线走过就合成一条边，记路线 id。
// 每站带 stops：点它能跳到的路线步骤 [{ route, step }]（起手站是那张卡第一次用上的那一步，枢纽是积木在那条路线里的第一步，终场站是最后一步），
// 页面照它跳播放器，测试查每个 stop 都对着存在的步骤。布局（layer 列、row 行）也在这里算：列 = 离起手站最长的路线距离，行按上一列的重心排。
// 纯函数：routes 是 replayRoute 的结果（要用每步的 activated / moves 找起手卡第一次用上的那一步）。
import { cardOf } from './deck.js';

// 起手卡第一次用上的那一步：发动了它，或它离开手牌（召唤、盖放、弃掉）；都没有就第 1 步
function firstUse(route, code) {
  const hit = route.steps.find((s) => s.activated.some((c) => c.code === code) || s.moves.some((m) => m.code === code && m.from === 'hand'));
  return hit ? hit.n : 1;
}

export function buildSubway(deck, routes) {
  const byRoute = new Map(routes.map((r) => [r.id, r]));
  const stations = new Map(); // id → 站
  const add = (id, s) => { if (!stations.has(id)) stations.set(id, { id, stops: [], ...s }); return stations.get(id); };
  const edges = new Map(); // 'from>to' → { from, to, routes }
  const link = (from, to, route) => {
    const key = `${from}>${to}`;
    if (!edges.has(key)) edges.set(key, { from, to, routes: [] });
    edges.get(key).routes.push(route);
  };

  for (const route of routes) {
    const startId = `start:${route.needs.code}`;
    add(startId, { kind: 'start', label: route.needs.md, card: cardOf(deck, route.needs.code) }).stops.push({ route: route.id, step: firstUse(route, route.needs.code) });
    let prev = startId;
    for (const b of route.blocks) {
      const id = `block:${b.id}`;
      add(id, { kind: 'hub', label: b.name, color: b.color, needs: b.needs, gives: b.gives, block: b.id }).stops.push({ route: route.id, step: b.from });
      link(prev, id, route.id);
      prev = id;
    }
    const endId = `end:${route.id}`;
    add(endId, { kind: 'end', label: route.name, interrupts: route.end.interrupts, monsters: route.end.monsters.map((c) => c.md) }).stops.push({ route: route.id, step: route.steps.length });
    link(prev, endId, route.id);
  }
  for (const s of stations.values()) {
    if (s.kind === 'hub' && new Set(s.stops.map((x) => x.route)).size < 2) s.kind = 'stop'; // 枢纽看经过的不同路线数，不是 stops 条数
    for (const stop of s.stops) stop.routeName = byRoute.get(stop.route).name;
  }

  // 列：离起手站最长的距离（图里有环就抛错，积木的先后在路线之间要一致）
  const outs = new Map([...stations.keys()].map((id) => [id, []]));
  const ins = new Map([...stations.keys()].map((id) => [id, []]));
  for (const e of edges.values()) { outs.get(e.from).push(e.to); ins.get(e.to).push(e.from); }
  const layer = new Map();
  const visiting = new Set();
  const depth = (id) => {
    if (layer.has(id)) return layer.get(id);
    if (visiting.has(id)) throw new Error(`地铁图里有环，经过 ${id}：同两块积木在不同路线里的先后不一致`);
    visiting.add(id);
    const d = ins.get(id).reduce((m, p) => Math.max(m, depth(p) + 1), 0);
    visiting.delete(id);
    layer.set(id, d);
    return d;
  };
  for (const id of stations.keys()) depth(id);
  const layers = Math.max(...layer.values()) + 1;
  for (const [id, s] of stations) if (s.kind === 'end') layer.set(id, layers - 1); // 终场站都放在最后一列

  // 行：每列按上一列邻居的平均行排，来回扫几遍减少交叉；列里的站按这个顺序一行一个，再按最高的一列居中
  const columns = Array.from({ length: layers }, (_, i) => [...stations.keys()].filter((id) => layer.get(id) === i));
  const order = new Map();
  columns.forEach((col) => col.forEach((id, i) => order.set(id, i)));
  const bary = (id, near) => { const ns = near.get(id); return ns.length ? ns.reduce((a, n) => a + order.get(n), 0) / ns.length : order.get(id); };
  for (let pass = 0; pass < 6; pass++) {
    const sweep = pass % 2 === 0 ? columns.slice(1) : columns.slice(0, -1).reverse();
    for (const col of sweep) {
      const near = pass % 2 === 0 ? ins : outs;
      col.sort((a, b) => bary(a, near) - bary(b, near) || order.get(a) - order.get(b));
      col.forEach((id, i) => order.set(id, i));
    }
  }
  const rows = Math.max(...columns.map((c) => c.length));
  for (const col of columns) col.forEach((id, i) => { Object.assign(stations.get(id), { layer: layer.get(id), row: i + (rows - col.length) / 2 }); });

  return { stations: [...stations.values()], edges: [...edges.values()], layers, rows, routes: routes.map((r) => ({ id: r.id, name: r.name })) };
}

// 积木：检查卡组数据里的 blocks（名字唯一、每条路线每一步都归到恰好一块积木），给路线配上它的积木分段，
// 取积木的操作序列（来自路线数据里它对应的那几步），并算「一手的展开能不能只用这几块积木拼出来」。
// 数据写法和规矩见 src/decks/branded-blocks.js 文件头。纯函数，不读文件。

// 返回问题列表（空 = 没问题）。deck.blocks = { list（积木）, segments（路线 id → 分段）}
export function checkBlocks(deck) {
  const { list: blocks, segments } = deck.blocks;
  const problems = [];
  const ids = new Set();
  const names = new Set();
  const colors = new Set();
  for (const b of blocks) {
    if (ids.has(b.id)) problems.push(`积木 id ${b.id} 重复`);
    ids.add(b.id);
    if (!b.name?.trim()) problems.push(`积木 ${b.id} 缺名字`);
    else if (names.has(b.name)) problems.push(`积木名字 ${b.name} 重复`);
    names.add(b.name);
    if (!/^#[0-9a-f]{6}$/i.test(b.color ?? '')) problems.push(`积木 ${b.name || b.id} 的颜色 ${b.color} 不是 #rrggbb`);
    else if (colors.has(b.color.toLowerCase())) problems.push(`积木 ${b.name} 的颜色 ${b.color} 重复`);
    colors.add(String(b.color).toLowerCase());
    if (!b.needs?.trim()) problems.push(`积木 ${b.name || b.id} 缺「要什么」`);
    if (!b.gives?.trim()) problems.push(`积木 ${b.name || b.id} 缺「给什么」`);
  }
  for (const id of Object.keys(segments)) if (!deck.routes.some((r) => r.id === id)) problems.push(`积木数据里的路线 ${id} 不存在`);
  const used = new Set();
  for (const route of deck.routes) {
    const segs = segments[route.id];
    if (!segs?.length) { problems.push(`${route.id} 没有标积木`); continue; }
    const owners = Array.from({ length: route.steps.length + 1 }, () => 0); // 每一步被几段积木占着
    for (const s of segs) {
      if (!ids.has(s.block)) { problems.push(`${route.id} 用了不存在的积木 ${s.block}`); continue; }
      used.add(s.block);
      if (!(Number.isInteger(s.from) && Number.isInteger(s.to) && s.from >= 1 && s.from <= s.to)) { problems.push(`${route.id} 的一段积木 ${s.block} 步号 ${s.from}–${s.to} 不对`); continue; }
      if (s.to > route.steps.length) problems.push(`${route.id} 没有第 ${s.to} 步（${s.block} 写到了那里）`);
      for (let n = s.from; n <= Math.min(s.to, route.steps.length); n++) owners[n]++;
    }
    const times = {};
    for (const s of segs) times[s.block] = (times[s.block] ?? 0) + 1;
    for (const [id, k] of Object.entries(times)) if (k > 1 && ids.has(id)) problems.push(`${route.id} 里积木 ${id} 用了不止一段（页面按积木 id 找每步属于哪块，一条路线里同一块只能一段）`);
    for (let n = 1; n <= route.steps.length; n++) {
      if (owners[n] === 0) problems.push(`${route.id} 第 ${n} 步没有归到任何积木`);
      else if (owners[n] > 1) problems.push(`${route.id} 第 ${n} 步归了不止一块积木`);
    }
  }
  for (const b of blocks) if (!used.has(b.id)) problems.push(`积木 ${b.name} 没有路线用`);
  return problems;
}

// 一条路线的积木分段，按步号从小到大：[{ id, name, color, needs, gives, from, to }]
export function routeBlocks(deck, routeId) {
  const byId = new Map(deck.blocks.list.map((b) => [b.id, b]));
  return [...(deck.blocks.segments[routeId] ?? [])].sort((a, b) => a.from - b.from)
    .map(({ block, from, to }) => { const { id, name, color, needs, gives } = byId.get(block); return { id, name, color, needs, gives, from, to }; });
}

// 引擎操作序列里不参与匹配的：'finish' 是「之后的连锁窗口全放行直到回合结束」，随机起手搜索走到回合结束就停，不写它
export const opsOf = (steps) => steps.flatMap((s) => s.do).filter((op) => op !== 'finish');
// 两个操作「一样」的标准：键一样。coverHand 的匹配、积木写法的合并、opInBlocks 都用它，口径只此一处
const keyOf = (op) => JSON.stringify(op);

// 哪些路线用到这块积木：路线 id 列表，按卡组里路线的先后
export const routesUsing = (deck, blockId) => deck.routes.filter((r) => (deck.blocks.segments[r.id] ?? []).some((s) => s.block === blockId)).map((r) => r.id);

// 某个操作有没有出现在某块积木的某个写法里；返回判断函数。variants 是 blockVariants 的结果；
// options 和 coverHand 的一样（normalize，放宽口径见 LOOSE），两边同样处理；口径下不看的操作（normalize 返回 null）算有
export function opInBlocks(variants, { normalize = (op) => op } = {}) {
  const known = new Set(variants.flatMap((v) => v.ops.map((op) => normalize(op))).filter((op) => op !== null).map(keyOf));
  return (op) => { const n = normalize(op); return n === null || known.has(keyOf(n)); };
}

// 一手的展开里，哪些积木的某个写法整段出现了（连着的一段操作，不要求从头接上、不要求别的地方也拼得满）：积木 id 的 Set
export function blocksSeenIn(steps, variants) {
  const keys = opsOf(steps).map(keyOf);
  const seen = new Set();
  for (const v of variants) {
    const vk = v.ops.map(keyOf);
    if (vk.length && !seen.has(v.block) && keys.some((_, i) => vk.every((k, j) => keys[i + j] === k))) seen.add(v.block);
  }
  return seen;
}

// 每块积木的写法：一块积木在每条路线里对应的那几步，把它们的 do 接起来就是一个操作序列；序列一样的写法合并（routes 记它们来自哪几条路线）。
// 返回 [{ block（积木 id）, ops, routes: [{ id, from, to }] }]
export function blockVariants(deck) {
  const variants = new Map();
  for (const route of deck.routes) {
    for (const s of deck.blocks.segments[route.id] ?? []) {
      const ops = opsOf(route.steps.slice(s.from - 1, s.to));
      const keys = ops.map(keyOf);
      const id = `${s.block}\u0000${keys.join('\u0001')}`;
      if (!variants.has(id)) variants.set(id, { block: s.block, ops, routes: [] });
      variants.get(id).routes.push({ id: route.id, from: s.from, to: s.to });
    }
  }
  return [...variants.values()];
}

// 一手的展开（步骤的 do 接起来的操作序列）能不能用积木的写法首尾相接拼满：
// 从头起，一块接一块，每块的操作序列要和接下来的操作一字不差；开头的 'pass' 不算（回合开始时手坑的连锁窗口，选不发动），
// 拼完后剩下的只许是 'pass'（放行连锁窗口，等于 finish）。
// normalize(op) 换掉每个操作用来比较的样子，返回 null 就是这个操作不看（两边都一样处理；默认原样，放宽口径见 LOOSE）。
// 返回 { covered, depth, blocks, stuck }：depth 是从头能拼到的最远处（前几个操作拼上了，拼满时是操作总数），
// blocks 是拼满时用到的积木写法（按先后，每项 { block, routes }，有几种拼法取先找到的），没拼满是 []；
// stuck 是没拼满时停在哪：{ step（第几步，从 0 起）, op（接不上的那个操作，原样）}，拼满是 null（depth 已经到头、没有接不上的操作时也是 null）。
// steps 是 JSONL 里一手的 steps；variants 是 blockVariants 的结果
export function coverHand(steps, variants, { normalize = (op) => op } = {}) {
  const keysOf = (ops) => ops.map(normalize).filter((op) => op !== null).map(keyOf);
  const items = steps.flatMap((s, step) => opsOf([s]).map((op) => ({ op, step })))
    .filter(({ op }) => normalize(op) !== null);
  const keys = items.map(({ op }) => keyOf(normalize(op)));
  const candidates = variants.map((v) => ({ v, keys: keysOf(v.ops) })).filter((c) => c.keys.length);
  const reach = new Array(keys.length + 1).fill(null); // reach[i] = 前 i 个操作拼上了：{ from, v }
  const PASS = keyOf('pass');
  // 开头的 pass 不算：回合一开始的连锁窗口里，手牌里的手坑（软绵雀精、增殖的Z）能响应，选「不发动」只是放行，不是展开的决定
  for (let i = 0; i <= keys.length && (i === 0 || keys[i - 1] === PASS); i++) reach[i] = { from: -1, v: null };
  let depth = 0;
  for (let i = 0; i <= keys.length; i++) {
    if (!reach[i]) continue;
    depth = i;
    for (const c of candidates) {
      const end = i + c.keys.length;
      if (end <= keys.length && !reach[end] && c.keys.every((k, j) => k === keys[i + j])) reach[end] = { from: i, v: c.v };
    }
  }
  let end = -1;
  for (let i = keys.length; i >= 0 && end < 0; i--) if (reach[i] && keys.slice(i).every((k) => k === PASS)) end = i;
  if (end < 0) {
    const at = items[depth];
    return { covered: false, depth, blocks: [], stuck: at ? { step: at.step, op: at.op } : null };
  }
  const blocks = [];
  for (let i = end; reach[i].from >= 0; i = reach[i].from) blocks.unshift({ block: reach[i].v.block, routes: reach[i].v.routes });
  return { covered: true, depth: keys.length, blocks, stuck: null };
}

// 放宽口径：不看放在哪一格、什么表示形式、放行连锁窗口（pass），选了哪些卡只看选了几张、选了第几项也不看，只比发动、召唤、连锁发动、是 / 否这些动作和它们对着哪张卡
export const LOOSE = {
  normalize: (op) => {
    if (op === 'pass' || op.place !== undefined || op.position !== undefined) return null;
    if (op.pick) return { pick: op.pick.length };
    if (op.option !== undefined) return 'option';
    return op;
  },
};

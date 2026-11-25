// 路线动画生成器（纯函数）：读一条重放过的路线（GET /route 的内容），给每一步配动作和时间，产出合成页（HTML）和每一步的时间点。
// 每张卡的动作来自每步的 `moves`（引擎的 MSG_MOVE：从哪个区到哪个区，按发生的顺序），不从 diff 推断；融合 / 同调等召唤的特效取自 move.summon，
// 素材取自 move.material，同调光环的星数是怪兽的真实等级（move.level），发动的光和连锁号取自 `activated`，守备表示的怪兽横放（position）。
// 每一步走完后，所有卡的位置和快照一致（planRoute 里对不上就抛错；test/route-anim.test.js 还用 frameAt 把每一步的结束帧和快照逐张对照）。
// 动画本身是一张轨道表（见 anim-engine.js），这里不依赖 gsap；卡图由调用方给（密码 → data: 地址），没有图的卡画卡名牌。
import { ENGINE_SOURCE } from './anim-engine.js';

// ---- 舞台：800×700 的场面（左右是额外卡组 / 除外和墓地 / 卡组，中间 5 格怪兽区和 5 格魔陷区，再下面一条空带放特效，最下面是手牌）----
export const STAGE = { w: 800, h: 700 };
export const CW = 80;
export const CH = 116;
const SX0 = 140;
const PITCH = 110;
const MY = 30;
const SY = 222;
const HY = 524;
const BAND_Y = 396;
const COL_L = 20;
const COL_R = 700;
const CX = 400;
const MERGE = [CX, 452];
const PILE = { extra: [COL_L, MY], banished: [COL_L, SY], grave: [COL_R, MY], deck: [COL_R, SY] };
export const PILES = ['extra', 'banished', 'grave', 'deck'];
const VISIBLE = ['hand', 'monsters', 'spellTraps', 'grave', 'banished']; // 有卡牌实体的区；deck / extra 是堆，卡进出时才画出来
const ZONE_NAME = { deck: '卡组', extra: '额外', hand: '手牌', monsters: '怪兽', spellTraps: '魔陷', grave: '墓地', banished: '除外' };
const COLOR = { cyan: '#22d3ee', amber: '#fbbf24', green: '#4ade80', coral: '#fb7185', violet: '#a78bfa', pink: '#f472b6', sky: '#7dd3fc', white: '#ffffff', mute: '#9a9aa2' };
const ZONE_COLOR = { hand: COLOR.green, monsters: COLOR.cyan, spellTraps: COLOR.amber, grave: COLOR.coral, banished: COLOR.violet, deck: COLOR.mute, extra: COLOR.mute };
const SUMMON_TAG = { fusion: ['融合召唤', COLOR.pink], synchro: ['同调召唤', COLOR.sky], xyz: ['超量召唤', COLOR.violet], link: ['连接召唤', COLOR.cyan], ritual: ['仪式召唤', COLOR.amber] };
const MERGE_KINDS = Object.keys(SUMMON_TAG);

const q = (n) => Math.round(n * 1000) / 1000;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const EPS = 1e-6;

// ---- 位置 ----
const handPos = (i, n) => {
  const pitch = Math.min(100, n > 1 ? 680 / (n - 1) : 100);
  return [Math.round(CX - ((n - 1) * pitch + CW) / 2 + i * pitch), HY];
};
function slotPos(zone, sequence) {
  if (sequence >= 5) {
    if (zone !== 'monsters') throw new Error(`${ZONE_NAME[zone]}区的第 ${sequence} 格（场地区）动画还不支持`);
    return [SX0 + (1 + (sequence - 5) * 2) * PITCH, BAND_Y + 4]; // 额外怪兽区：空带里中间偏左 / 偏右
  }
  return [SX0 + sequence * PITCH, zone === 'monsters' ? MY : SY];
}
const pilePos = (zone, index) => [PILE[zone][0] + Math.min(index, 6) * 3, PILE[zone][1] - Math.min(index, 6) * 0];
const zOf = (zone, index) => (zone === 'grave' || zone === 'banished' ? 20 + index : 10);
const center = (p) => [p[0] + CW / 2, p[1] + CH / 2];

// ---- 轨道：每个元素的每个属性一串段，同一个属性的段在时间上不重叠（重叠就是生成器写错了，直接抛错）----
function newTracks() {
  const init = {};
  const segs = {};
  const state = new Map();
  const key = (id, prop) => `${id}\u0000${prop}`;
  return {
    init, segs,
    reg(id, props) { init[id] = { ...(init[id] ?? {}), ...props }; for (const [p, v] of Object.entries(props)) state.set(key(id, p), { v, t: 0 }); },
    get: (id, prop, dflt) => state.get(key(id, prop))?.v ?? dflt,
    push(id, prop, t0, t1, from, to, ease) {
      const prev = state.get(key(id, prop));
      if (prev && t0 < prev.t - EPS) throw new Error(`${id}.${prop} 的两段重叠：${q(prev.t)} 才结束，${q(t0)} 又开始`);
      const qv = (v) => (typeof v === 'number' ? q(v) : v);
      ((segs[id] ??= {})[prop] ??= []).push([q(t0), q(t1), qv(from), qv(to), ease]);
      state.set(key(id, prop), { v: to, t: t1 });
    },
  };
}

export function planRoute(route) {
  const tr = newTracks();
  const html = { cards: [], fx: [], labels: [] };
  const counters = {};
  const nid = (p) => `${p}${(counters[p] = (counters[p] ?? 0) + 1)}`;
  const tween = (id, prop, t, dur, to, ease = 'l') => tr.push(id, prop, t, t + dur, tr.get(id, prop, prop === 'scale' || prop === 'opacity' ? 1 : 0), to, ease);
  const set = (id, prop, t, v) => tr.push(id, prop, t, t, tr.get(id, prop, v), v, 'l');
  const fx = (markup, init) => { html.fx.push(markup); const id = markup.match(/id="([^"]+)"/)[1]; tr.reg(id, init); return id; };

  const state = new Map(); // 实例 → 现在的外观（tint / tb / back / name），用来判断要不要补一段
  // 实体卡：一张卡一个实例，从堆里出来（出生在堆的位置）、进堆时消失；位置、层级、转角、暗化全由轨道给
  const instances = [];
  function mkCard(card) {
    const id = `c${instances.length}`;
    const inst = { id, code: card.code, md: card.md, zone: null, slot: null, alive: true, x: 0, y: 0, rot: 0, free: 0 };
    instances.push(inst);
    html.cards.push(`<div id="${id}" class="card" data-code="${card.code}"><div id="${id}a" class="a i${card.code}" data-code="${card.code}" data-md="${esc(card.md)}">`
      + `<span class="pt">${esc(card.md)}</span><div id="${id}t" class="tint"></div><div id="${id}k" class="tb"></div><div id="${id}b" class="bk"></div><div id="${id}h" class="hl"></div></div>`
      + `<div id="${id}n" class="nm">${esc(card.md)}</div></div>`);
    tr.reg(id, { x: 0, y: 0, opacity: 0, z: 10 });
    tr.reg(`${id}a`, { rotation: 0 });
    for (const part of ['t', 'k', 'b', 'h', 'n']) tr.reg(`${id}${part}`, { opacity: 0 });
    state.set(inst, { tint: 0, tb: 0, back: 0, name: 0 });
    return inst;
  }

  // ---- 特效（都在卡和名字、区域标签的下面，不盖住它们；只有横幅和发动牌在空带里）----
  const ring = (c, color, t, { size = 100, shape = 'sq', dur = 0.55, s0 = 0.8, s1 = 1.9, delay = 0, w = 3 } = {}) => {
    const id = fx(`<div id="${nid('rg')}" class="rg ${shape}" style="left:${q(c[0] - size / 2)}px;top:${q(c[1] - size / 2)}px;width:${size}px;height:${size}px;border:${w}px solid ${color}"></div>`, { opacity: 0, scale: s0 });
    set(id, 'opacity', t + delay, 1);
    tween(id, 'scale', t + delay, dur, s1, 'o2');
    tween(id, 'opacity', t + delay, dur, 0, 'o2');
  };
  const line = (a, b, color, t, dur) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 4) return;
    const id = fx(`<div id="${nid('ln')}" class="ln" style="left:${q(a[0])}px;top:${q(a[1] - 1.5)}px;width:${q(len)}px;color:${color}"></div>`,
      { rotation: q((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI), scaleX: 0, opacity: 0 });
    set(id, 'opacity', t, 1);
    tween(id, 'scaleX', t, dur, 1, 'io2');
    tween(id, 'opacity', t + dur, 0.4, 0, 'o2');
  };
  const impact = (c, color, t, kick = true) => {
    const fl = fx(`<div id="${nid('fl')}" class="fl" style="left:${q(c[0] - CW / 2)}px;top:${q(c[1] - CH / 2)}px;background:${color}"></div>`, { opacity: 0 });
    set(fl, 'opacity', t, 0.9);
    tween(fl, 'scale', t + 0.03, 0.4, 1.3, 'o3');
    tween(fl, 'opacity', t + 0.03, 0.4, 0, 'o3');
    ring(c, color, t, { size: 100, dur: 0.6, s0: 0.8, s1: 2.3 });
    ring(c, '#fff', t, { size: 100, dur: 0.5, s0: 0.8, s1: 1.7, delay: 0.1, w: 2 });
    for (let i = 0; i < 4; i++) {
      const a = 45 + i * 90;
      const r = (a * Math.PI) / 180;
      const id = fx(`<div id="${nid('tk')}" class="tk" style="left:${q(c[0] - 13)}px;top:${q(c[1] - 1.5)}px;background:${color}"></div>`, { rotation: a, x: Math.cos(r) * 50, y: Math.sin(r) * 50, opacity: 0 });
      set(id, 'opacity', t, 1);
      tween(id, 'x', t, 0.45, Math.cos(r) * 100, 'o2');
      tween(id, 'y', t, 0.45, Math.sin(r) * 100, 'o2');
      tween(id, 'opacity', t, 0.45, 0, 'o2');
    }
    if (kick) { tween('cam', 'y', t, 0.07, 6, 'o2'); tween('cam', 'y', t + 0.07, 0.3, 0, 'o2'); }
  };
  const zonePulse = (zone, color, t) => {
    const [zx, zy] = PILE[zone];
    const id = fx(`<div id="${nid('zp')}" class="zp" style="left:${zx - 3}px;top:${zy - 3}px;border-color:${color}"></div>`, { opacity: 0 });
    set(id, 'opacity', t, 1);
    tween(id, 'opacity', t + 0.05, 0.5, 0, 'o2');
  };
  const banner = (text, color, t, hold) => {
    const id = fx(`<div id="${nid('bn')}" class="bn" style="background:${color};top:${BAND_Y}px"><span>${esc(text)}</span></div>`, { opacity: 0, scaleX: 0, x: 0 });
    set(id, 'opacity', t, 1);
    tween(id, 'scaleX', t, 0.35, 1, 'ox');
    tween(id, 'opacity', t + hold, 0.3, 0, 'i2');
    tween(id, 'x', t + hold, 0.3, 40, 'i2');
  };
  // 发动：空带里一块牌（缩略图、连锁号、卡名），牌的主人身上起一圈光和连锁号
  const spot = (card, n, t, inst) => {
    const id = fx(`<div id="${nid('sp')}" class="spot"><div class="sth i${card.code}"></div><div class="sb">${n}</div><div class="sx"><div class="sk">连锁 ${n} · 发动</div><div class="sn">${esc(card.md)}</div></div></div>`, { opacity: 0, x: -30 });
    set(id, 'opacity', t, 1);
    tween(id, 'x', t, 0.28, 0, 'o3');
    tween(id, 'opacity', t + 0.76, 0.2, 0, 'i2');
    tween(id, 'x', t + 0.76, 0.2, 30, 'i2');
    if (inst) {
      ring(center([inst.x, inst.y]), COLOR.amber, t, { size: 100, dur: 0.6, s0: 0.85, s1: 1.7 });
      const hl = `${inst.id}h`;
      set(hl, 'opacity', t, 1);
      tween(hl, 'opacity', t + 0.7, 0.25, 0, 'l');
      const badge = fx(`<div id="${nid('cb')}" class="cbadge" style="left:${q(inst.x - 8)}px;top:${q(inst.y - 8)}px">${n}</div>`, { opacity: 0, scale: 0 });
      set(badge, 'opacity', t, 1);
      tween(badge, 'scale', t, 0.3, 1, 'ob');
      tween(badge, 'opacity', t + 0.8, 0.2, 0, 'l');
    }
  };

  // ---- 区域框、标签、堆的张数 ----
  const frames = [];
  for (let i = 0; i < 5; i++) {
    frames.push(`<div class="slot" style="left:${SX0 + i * PITCH}px;top:${MY}px"></div><div class="slot" style="left:${SX0 + i * PITCH}px;top:${SY}px"></div>`);
    html.labels.push(`<span class="sl" style="left:${SX0 + i * PITCH}px;top:${MY + CH / 2 - 9}px">怪兽</span><span class="sl" style="left:${SX0 + i * PITCH}px;top:${SY + CH / 2 - 9}px">魔陷</span>`);
  }
  const usesEmz = route.steps.some((s) => s.board.monsters.some((c) => c.sequence >= 5)) || route.start.monsters.some((c) => c.sequence >= 5);
  if (usesEmz) for (const seq of [5, 6]) { const [x, y] = slotPos('monsters', seq); frames.push(`<div class="slot" style="left:${x}px;top:${y}px"></div>`); html.labels.push(`<span class="sl" style="left:${x}px;top:${y + CH / 2 - 9}px">额外怪兽</span>`); }
  for (const zone of PILES) {
    const back = zone === 'deck' || zone === 'extra';
    const [x, y] = PILE[zone];
    frames.push(back ? `<div class="slot pile back" style="left:${x}px;top:${y}px"><i></i><i></i><b></b></div>` : `<div class="slot pile" style="left:${x}px;top:${y}px"></div>`);
    html.labels.push(`<span id="lb-${zone}" class="zl" style="left:${x - 10}px;top:${y + CH + 8}px" data-zone="${zone}"></span>`);
  }
  const handLabel = `<span id="lb-hand" class="zl hand" style="left:${COL_L}px;top:${HY - 24}px" data-zone="hand"></span>`;
  html.labels.push(handLabel);
  const counts = { deck: route.start.deck.length + route.start.hand.length, extra: route.start.extra.length, grave: 0, banished: 0, hand: 0 };
  const countText = (zone) => `${ZONE_NAME[zone]} ${counts[zone]}`;
  const syncLabel = (zone, t) => set(`lb-${zone}`, 'text', t, countText(zone));
  for (const zone of [...PILES, 'hand']) tr.reg(`lb-${zone}`, { text: countText(zone) });
  tr.reg('cam', { y: 0 });

  // ---- 模拟 + 摆位 ----
  const pools = { hand: [], monsters: [], spellTraps: [], grave: [], banished: [] };
  const live = (inst) => inst.alive;

  // 一步的目标摆位：每个区里按快照的顺序，每张卡配一个实例（同密码的取池里第一个没配过的），算出它最后的位置、层级、转角、暗化
  function layout(board, label) {
    const fin = new Map();
    for (const zone of VISIBLE) {
      const want = [...board[zone]].sort((a, b) => a.sequence - b.sequence);
      const have = pools[zone].filter(live);
      if (have.length !== want.length) throw new Error(`${label}：${ZONE_NAME[zone]}区里动画有 ${have.length} 张，快照是 ${want.length} 张`);
      const used = new Set();
      const ordered = want.map((c) => {
        const inst = have.find((i) => !used.has(i) && i.code === c.code);
        if (!inst) throw new Error(`${label}：${c.md} 不在动画的${ZONE_NAME[zone]}区里`);
        used.add(inst);
        return inst;
      });
      pools[zone] = ordered;
      ordered.forEach((inst, i) => {
        const c = want[i];
        const pos = zone === 'hand' ? handPos(i, want.length) : zone === 'grave' || zone === 'banished' ? pilePos(zone, i) : slotPos(zone, c.sequence);
        const position = c.position ?? 'attack';
        fin.set(inst, {
          zone, pos, z: zOf(zone, i), slot: zone === 'monsters' || zone === 'spellTraps' ? c.sequence : null,
          rot: zone === 'monsters' && position !== 'attack' ? 90 : 0, back: (zone === 'monsters' || zone === 'spellTraps') && position === 'facedown' ? 1 : 0,
          tint: zone === 'grave' ? 0.6 : 0, tb: zone === 'banished' ? 0.45 : 0, name: zone === 'grave' || zone === 'banished' ? 0 : 1,
        });
      });
    }
    return fin;
  }

  const look = (inst) => state.get(inst);
  function setLook(inst, t, dur, want) {
    const cur = look(inst);
    for (const [prop, part] of [['tint', 't'], ['tb', 'k'], ['back', 'b'], ['name', 'n']]) {
      if (cur[prop] !== want[prop]) { tween(`${inst.id}${part}`, 'opacity', t, dur, want[prop], 'l'); }
    }
    state.set(inst, { ...cur, ...want });
  }

  // 一张卡飞到 dest：抬高、平移、放大一下再落下、转到目标转角，落地后换外观；返回落地时间
  function fly(inst, t, dest, o = {}) {
    const dur = o.dur ?? 0.7;
    const t0 = Math.max(t, inst.free);
    set(inst.id, 'z', t0, 100);
    tween(inst.id, 'x', t0, dur, dest.pos[0], o.ease ?? 'io2');
    tween(inst.id, 'y', t0, dur, dest.pos[1], o.ease ?? 'io2');
    tween(inst.id, 'scale', t0, dur * 0.45, 1.14, 'o2');
    tween(inst.id, 'scale', t0 + dur * 0.45, dur * 0.55, o.endScale ?? 1, 'i2');
    if (dest.rot !== inst.rot) tween(`${inst.id}a`, 'rotation', t0, dur, dest.rot, 'io2');
    const want = { tint: dest.tint, tb: dest.tb, back: dest.back, name: dest.name };
    setLook(inst, t0 + dur * 0.5, dur * 0.5, want);
    if (o.line !== false) line(center([inst.x, inst.y]), center(dest.pos), o.color ?? ZONE_COLOR[dest.zone] ?? COLOR.white, t0, dur);
    set(inst.id, 'z', t0 + dur, dest.z);
    Object.assign(inst, { x: dest.pos[0], y: dest.pos[1], rot: dest.rot, free: t0 + dur });
    return t0 + dur;
  }
  const landFx = (zone, pos, t) => {
    if (zone === 'monsters') impact(center(pos), COLOR.cyan, t);
    else if (zone === 'spellTraps') ring(center(pos), COLOR.amber, t, { dur: 0.5, s1: 1.9 });
    else if (zone === 'hand') ring(center(pos), COLOR.green, t, { dur: 0.5, s0: 0.9, s1: 1.4 });
    else if (zone === 'grave') zonePulse('grave', COLOR.coral, t);
    else if (zone === 'banished') zonePulse('banished', COLOR.violet, t);
    else zonePulse(zone, COLOR.white, t);
  };

  // 一步里的所有移动先在池子里走一遍（不出画面）：谁从哪里来、到哪里去，是不是这张卡在这一步里的最后一次移动
  function simulate(moves, label) {
    const out = [];
    for (const m of moves) {
      let inst;
      if (m.from === 'deck' || m.from === 'extra') { inst = mkCard(m); inst.born = m.from; }
      else {
        if (!VISIBLE.includes(m.from)) throw new Error(`${label}：${m.md} 从 ${m.from} 出发，动画不支持这个区`);
        const k = pools[m.from].findIndex((i) => i.code === m.code && live(i));
        if (k < 0) throw new Error(`${label}：${m.md} 不在动画的${ZONE_NAME[m.from]}区里，引擎说它从那里出发`);
        [inst] = pools[m.from].splice(k, 1);
      }
      if (m.to === 'deck' || m.to === 'extra' || m.to === 'overlay') inst.alive = false;
      else if (VISIBLE.includes(m.to)) pools[m.to].push(inst);
      else throw new Error(`${label}：${m.md} 去 ${m.to}，动画不支持这个区`);
      out.push({ move: m, inst });
    }
    const lastOf = new Map(out.map((o, i) => [o.inst, i]));
    out.forEach((o, i) => { o.last = lastOf.get(o.inst) === i; });
    return out;
  }

  // 去处：最后一次移动去快照里的位置；中途的一次（这一步里这张卡还会再动）找一个没人用的格子
  function destOf(item, fin, taken) {
    const { move, last, inst } = item;
    if (move.to === 'deck' || move.to === 'extra' || move.to === 'overlay') return { zone: move.to, pos: PILE[move.to] ?? MERGE, z: 10, rot: 0, back: 0, tint: 0, tb: 0, name: 0, consumed: true };
    if (last) return { ...fin.get(inst), consumed: false };
    const zone = move.to;
    const base = { zone, z: 10, rot: zone === 'monsters' && move.position && move.position !== 'attack' ? 90 : 0, back: 0, tint: zone === 'grave' ? 0.6 : 0, tb: zone === 'banished' ? 0.45 : 0, name: zone === 'grave' || zone === 'banished' ? 0 : 1 };
    if (zone === 'monsters' || zone === 'spellTraps') {
      let slot = 0;
      while (taken.has(`${zone}${slot}`) && slot < 4) slot++;
      taken.add(`${zone}${slot}`);
      return { ...base, pos: slotPos(zone, slot) };
    }
    if (zone === 'hand') return { ...base, pos: handPos(Math.max(0, pools.hand.length - 1), Math.max(1, pools.hand.length)) };
    return { ...base, pos: pilePos(zone, 0) };
  }

  const segments = [];
  const planned = [];
  let clock = 0;
  function addSegment(label, build) {
    const start = clock;
    const { end, moves } = build(start);
    const dur = Math.max(end - start + 0.55, 1.6);
    clock = q(start + dur);
    segments.push({ label, start: q(start), dur: q(dur), mark: q(start + dur - 0.05), end: q(start + dur) });
    planned.push(moves);
  }
  const record = (items) => items.map((it) => ({ id: it.inst.id, code: it.move.code, from: it.move.from, to: it.move.to }));

  // 张数标签：卡离开一个区（起飞后一会儿）、进入一个区（落地时）各改一次
  function note(move, tStart, tEnd) {
    if (counts[move.from] !== undefined) { counts[move.from] -= 1; syncLabel(move.from, tStart + 0.3); }
    if (counts[move.to] !== undefined) { counts[move.to] += 1; syncLabel(move.to, tEnd); }
  }
  // 从卡组 / 额外卡组出来的卡：在堆的位置现身
  function birth(item, at) {
    const { inst, move } = item;
    if (!inst.born) return;
    inst.x = PILE[move.from][0]; inst.y = PILE[move.from][1];
    set(inst.id, 'x', at, inst.x); set(inst.id, 'y', at, inst.y); set(inst.id, 'opacity', at, 1);
    zonePulse(move.from, COLOR.white, at);
    inst.born = null;
  }
  const fadeOut = (inst, tEnd) => tween(inst.id, 'opacity', tEnd - 0.25, 0.25, 0, 'i2');
  // 一次普通的移动
  function single(item, dest, at) {
    birth(item, Math.max(at, item.inst.free));
    const start = Math.max(at, item.inst.free);
    const end = fly(item.inst, start, dest, { color: ZONE_COLOR[dest.zone] });
    if (dest.consumed) { fadeOut(item.inst, end); zonePulse(dest.zone, COLOR.white, end); } else landFx(dest.zone, dest.pos, end);
    note(item.move, start, end);
    return end;
  }
  // 融合 / 同调 / 超量 / 连接 / 仪式：素材在空带中间聚拢，特效，召唤出来的怪兽落到格子里，素材再去它们的去处
  function mergeGroup(g, items, dests, cursor) {
    const [tag, col] = SUMMON_TAG[g.kind];
    const summoned = items[g.summoned];
    const sDest = dests[g.summoned];
    const G = Math.max(cursor, summoned.inst.free, ...g.materials.map((m) => items[m].inst.free));
    const mp = [MERGE[0] - CW / 2, MERGE[1] - CH / 2];
    banner(tag, col, G, 1.9);
    g.materials.forEach((m, k) => {
      const { inst, move } = items[m];
      const t0 = G + 0.55 + k * 0.14;
      const spread = (k - (g.materials.length - 1) / 2) * 22;
      birth(items[m], Math.max(t0, inst.free)); // 素材从卡组 / 额外卡组来（卡组融合）：先在堆上现身
      if (move.from === 'banished') zonePulse('banished', col, t0);
      tween(`${inst.id}n`, 'opacity', t0, 0.3, 0, 'l');
      state.set(inst, { ...look(inst), name: 0 });
      fly(inst, t0, { zone: 'hand', pos: [mp[0] + spread, mp[1]], z: 100, rot: 0, back: 0, tint: look(inst).tint, tb: look(inst).tb, name: 0 }, { dur: 0.8, color: col, endScale: 0.8 });
    });
    // 召唤的几何：融合是三层收拢的菱形；同调等是一圈星，颗数是怪兽的真实等级（超量是阶级，连接是连接数）
    if (g.kind === 'fusion' || g.kind === 'ritual') {
      for (let i = 0; i < 3; i++) {
        const size = 100 + i * 36;
        const id = fx(`<div id="${nid('rg')}" class="rg dia" style="left:${MERGE[0] - size / 2}px;top:${MERGE[1] - size / 2}px;width:${size}px;height:${size}px;border:${i > 1 ? 2 : 3}px solid ${col}"></div>`, { opacity: 0, scale: 1.5, rotation: 90 });
        const t0 = G + 1.25 + i * 0.12;
        set(id, 'opacity', t0, 1);
        tween(id, 'scale', t0 + 0.05, 0.85, 0.35, 'i3');
        tween(id, 'rotation', t0 + 0.05, 0.85, -45 * (i % 2 ? -1 : 1), 'i3');
        tween(id, 'opacity', t0 + 0.9, 0.15, 0, 'l');
      }
    } else {
      const stars = summoned.move.level ?? summoned.move.rank ?? summoned.move.link;
      if (!stars) throw new Error(`${summoned.move.md} 没有等级 / 阶级 / 连接数，画不了${tag}的星`);
      const size = 180;
      const ringId = fx(`<div id="${nid('rg')}" class="rg" style="left:${MERGE[0] - size / 2}px;top:${MERGE[1] - size / 2}px;width:${size}px;height:${size}px;border:3px solid ${col}"></div>`, { opacity: 0, scale: 1.4 });
      set(ringId, 'opacity', G + 1.2, 1);
      tween(ringId, 'scale', G + 1.25, 0.9, 0.4, 'i3');
      tween(ringId, 'opacity', G + 2.15, 0.15, 0, 'l');
      const grp = nid('dg');
      const ids = [];
      let dots = '';
      for (let i = 0; i < stars; i++) {
        const a = (i / stars) * Math.PI * 2 - Math.PI / 2;
        dots += `<i id="${grp}_${i}" class="dot" style="left:${q(Math.cos(a) * 66 - 7)}px;top:${q(Math.sin(a) * 66 - 7)}px;background:${i % 2 ? '#fff' : col}"></i>`;
        ids.push(`${grp}_${i}`);
      }
      fx(`<div id="${grp}" class="dg" data-stars="${stars}" style="left:${MERGE[0]}px;top:${MERGE[1]}px">${dots}</div>`, { opacity: 0, scale: 1.5, rotation: 0 });
      for (const id of ids) tr.reg(id, { scale: 0 });
      set(grp, 'opacity', G + 1.2, 1);
      tween(grp, 'scale', G + 1.25, 1.0, 0.55, 'i2');
      tween(grp, 'rotation', G + 1.25, 1.0, 200, 'i2');
      tween(grp, 'opacity', G + 2.2, 0.12, 0, 'l');
      ids.forEach((id, i) => tween(id, 'scale', G + 1.25 + i * 0.05, 0.2, 1, 'ob'));
    }
    const fl = fx(`<div id="${nid('fl')}" class="fl${g.kind === 'fusion' ? '' : ' cir'}" style="left:${MERGE[0] - CW / 2}px;top:${MERGE[1] - CH / 2}px;background:${col}"></div>`, { opacity: 0, scale: 0.3 });
    set(fl, 'opacity', G + 2.12, 0.95);
    tween(fl, 'scale', G + 2.16, 0.45, 3, 'o3');
    tween(fl, 'opacity', G + 2.16, 0.45, 0, 'o3');
    // 召唤出来的怪兽：从额外卡组出来飞到聚拢点，再落到它的格子
    birth(summoned, G + 1.7);
    fly(summoned.inst, G + 1.7, { zone: 'monsters', pos: mp, z: 120, rot: 0, back: 0, tint: 0, tb: 0, name: 0 }, { dur: 0.6, color: col, ease: 'o2' });
    const nEnd = fly(summoned.inst, G + 2.6, sDest, { dur: 0.55, color: col, ease: 'io3' });
    impact(center(sDest.pos), col, nEnd);
    note(summoned.move, G + 1.7, nEnd);
    let end = nEnd;
    g.materials.forEach((m, k) => {
      const { inst, move } = items[m];
      const dest = dests[m];
      const t0 = G + 2.4 + k * 0.12;
      const e = fly(inst, t0, dest, { dur: 0.85, color: dest.consumed ? col : ZONE_COLOR[dest.zone] });
      if (dest.consumed) { fadeOut(inst, e); zonePulse(dest.zone, COLOR.white, e); } else landFx(dest.zone, dest.pos, e);
      note(move, t0, e);
      end = Math.max(end, e);
    });
    return end;
  }

  // ---- 起手：手牌从卡组抽出 ----
  addSegment('起手', (T) => {
    banner('起手', COLOR.white, T + 0.1, 1.1);
    const hand = [...route.start.hand].sort((a, b) => a.sequence - b.sequence);
    const items = simulate(hand.map((c) => ({ ...c, from: 'deck', to: 'hand' })), '起手');
    const fin = layout({ ...route.start, deck: [], extra: [] }, '起手');
    for (const [inst, f] of fin) Object.assign(inst, { zone: f.zone, slot: f.slot });
    let end = T;
    items.forEach((item, i) => {
      const t = T + 0.6 + i * 0.3;
      birth(item, t);
      const dest = { ...fin.get(item.inst) };
      end = Math.max(end, fly(item.inst, t, dest, { dur: 0.65, ease: 'o3', color: COLOR.green }));
      ring(center(dest.pos), COLOR.green, t + 0.65, { dur: 0.45, s0: 0.9, s1: 1.35 });
      note(item.move, t, t + 0.65);
    });
    return { end, moves: record(items) };
  });

  // ---- 每一步 ----
  for (const step of route.steps) {
    addSegment(`第 ${step.n} 步`, (T) => {
      const label = `第 ${step.n} 步`;
      const before = [];
      for (const zone of VISIBLE) before.push(...pools[zone]);
      const items = simulate(step.moves, label);
      const fin = layout(step.board, label);
      const taken = new Set([...fin.values()].filter((f) => f.slot !== null).map((f) => `${f.zone}${f.slot}`));
      for (const inst of before) if (inst.slot !== null && inst.slot !== undefined && inst.zone) taken.add(`${inst.zone}${inst.slot}`);
      const dests = items.map((it) => destOf(it, fin, taken));

      // 发动：这一步开始前就在手里 / 场上 / 墓地的卡先亮一下，连锁号按 activated 的顺序；这一步才出现的卡移动完了再亮
      let t = T + 0.15;
      const claimed = new Set();
      const later = [];
      step.activated.forEach((card, i) => {
        const inst = before.find((b) => b.code === card.code && !claimed.has(b));
        if (inst) { claimed.add(inst); spot(card, i + 1, t, inst); t += 0.95; } else later.push({ card, n: i + 1 });
      });
      let end = t;

      // 移动：按引擎的顺序；融合 / 同调等召唤带着它的素材一起演（素材 = 引擎标了 material 的移动）
      const groups = [];
      let materials = [];
      items.forEach((item, i) => {
        if (item.move.material) materials.push(i);
        else if (MERGE_KINDS.includes(item.move.summon)) { groups.push({ kind: item.move.summon, materials, summoned: i }); materials = []; } else groups.push({ single: i });
      });
      for (const m of materials) groups.push({ single: m });
      let cursor = t + 0.05;
      for (const g of groups) {
        if (g.single !== undefined) { end = Math.max(end, single(items[g.single], dests[g.single], cursor)); cursor += 0.22; } else { const e = mergeGroup(g, items, dests, cursor); end = Math.max(end, e); cursor = e + 0.1; }
      }

      // 没动的卡：位置变了跟着重排（手牌重新居中等），转角、暗化跟快照
      const moved = new Set(items.map((i) => i.inst));
      for (const [inst, f] of fin) {
        inst.zone = f.zone; inst.slot = f.slot;
        if (moved.has(inst)) continue;
        const at = Math.max(T + 0.3, inst.free);
        if (inst.x !== f.pos[0] || inst.y !== f.pos[1]) {
          tween(inst.id, 'x', at, 0.55, f.pos[0], 'io2'); tween(inst.id, 'y', at, 0.55, f.pos[1], 'io2');
          set(inst.id, 'z', at + 0.55, f.z);
          Object.assign(inst, { x: f.pos[0], y: f.pos[1], free: at + 0.55 });
        }
        if (f.rot !== inst.rot) { tween(`${inst.id}a`, 'rotation', at, 0.45, f.rot, 'io2'); inst.rot = f.rot; }
        setLook(inst, Math.max(at, inst.free), 0.3, { tint: f.tint, tb: f.tb, back: f.back, name: f.name });
        end = Math.max(end, inst.free, at + 0.55);
      }
      let tl = Math.max(end, cursor) + 0.1;
      for (const a of later) {
        const inst = [...fin.keys()].find((i) => i.code === a.card.code && !claimed.has(i));
        if (inst) claimed.add(inst);
        spot(a.card, a.n, tl, inst);
        tl += 0.95;
      }
      end = Math.max(end, tl - (later.length ? 0 : 0.1));
      if (items.length === 0 && step.activated.length === 0) {
        // 没有卡动、也没有发动（过阶段、放行连锁）：空带里亮一条说明
        banner(step.text.length > 22 ? `${step.text.slice(0, 21)}…` : step.text, COLOR.mute, T + 0.2, 1.4);
        end = Math.max(end, T + 1.7);
      }
      // 终场：最后一步走完，打断的卡标「打断」
      if (step.n === route.steps.length) {
        let tb = end + 0.1;
        for (const b of route.end.breakers ?? []) {
          const entry = [...fin.entries()].find(([i, f]) => i.code === b.code && (f.zone === 'monsters' || f.zone === 'spellTraps'));
          if (!entry) continue;
          const [i, f] = entry;
          set(`${i.id}h`, 'opacity', tb, 1);
          const tag = fx(`<div id="${nid('bk')}" class="bkt" style="left:${f.pos[0]}px;top:${f.pos[1] + 6}px">打断</div>`, { opacity: 0, y: 8 });
          set(tag, 'opacity', tb, 1);
          tween(tag, 'y', tb, 0.3, 0, 'o3');
          ring(center(f.pos), COLOR.amber, tb, { dur: 0.6, s0: 0.9, s1: 1.8 });
          tb += 0.5;
        }
        end = Math.max(end, tb + 0.3);
      }
      return { end, moves: record(items) };
    });
  }

  return {
    stage: STAGE, duration: q(clock), segments, moves: planned, tracks: tr.segs, init: tr.init, html, frames,
    instances: instances.map((i) => ({ id: i.id, code: i.code, md: i.md })),
    codes: [...new Set([...instances.map((i) => i.code), ...route.steps.flatMap((s) => s.activated.map((c) => c.code))])],
  };
}


// ---- 合成页 HTML：运行时、引擎、轨道表、舞台标记；卡图用 CSS 类带进 data: 地址（每个密码一份）----
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${STAGE.w}px;height:${STAGE.h}px;overflow:hidden;background:#000}
body{font-family:"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans JP","Microsoft YaHei",system-ui,sans-serif;color:#fff}
#root{position:absolute;left:0;top:0;width:${STAGE.w}px;height:${STAGE.h}px;background:#000;overflow:hidden}
#cam{position:absolute;left:0;top:0;width:${STAGE.w}px;height:${STAGE.h}px}
.slot{position:absolute;width:${CW}px;height:${CH}px;border:1.5px solid #2a2a30;border-radius:4px;z-index:1}
.slot.pile{border-color:#3a3a42}
.slot.back{border:none}
.slot.back i{position:absolute;inset:0;background:#0f0f14;border:1.5px solid #3a3a42;border-radius:4px}
.slot.back i:nth-child(1){transform:translate(4px,4px)}
.slot.back i:nth-child(2){transform:translate(2px,2px)}
.slot.back b{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid #44444e;transform:rotate(45deg)}
.sl{position:absolute;width:${CW}px;text-align:center;font-size:14px;line-height:18px;letter-spacing:2px;color:#6e6e78;z-index:6;pointer-events:none}
.zl{position:absolute;width:${CW + 20}px;text-align:center;font-size:16px;line-height:20px;font-weight:700;color:#c9c9d0;z-index:6;pointer-events:none;letter-spacing:1px}
.zl.hand{text-align:left;left:${COL_L}px}
.zp{position:absolute;width:${CW + 6}px;height:${CH + 6}px;border:3px solid #fff;border-radius:6px;opacity:0;z-index:4;pointer-events:none}
.card{position:absolute;left:0;top:0;width:${CW}px;height:${CH}px;opacity:0;z-index:10;pointer-events:none}
.card .a{position:absolute;inset:0;border-radius:3px;background:#1c1c24 center/cover no-repeat;pointer-events:auto;cursor:default}
.card .pt{display:none;position:absolute;left:4px;right:4px;top:6px;font-size:12px;line-height:14px;color:#c4c4cc;text-align:center;overflow:hidden;max-height:90px}
.card .tint,.card .tb,.card .bk,.card .hl{position:absolute;inset:0;border-radius:3px;opacity:0;pointer-events:none}
.card .tint{background:#000}
.card .tb{background:#6d4fd6}
.card .bk{background:#13131c;border:2px solid #3b3b4a}
.card .bk::after{content:"";position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid #44444e;transform:rotate(45deg)}
.card .hl{inset:-4px;border:3px solid ${COLOR.amber};border-radius:6px}
.card .nm{position:absolute;left:-9px;width:${CW + 18}px;top:${CH + 4}px;text-align:center;font-size:15px;line-height:17px;font-weight:600;color:#f3f3f6;text-shadow:0 1px 2px #000,0 0 3px #000;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;pointer-events:none}
.rg{position:absolute;opacity:0;z-index:4;pointer-events:none}
.rg.sq{border-radius:4px}.rg:not(.sq):not(.dia){border-radius:50%}.rg.dia{border-radius:6px}
.fl{position:absolute;width:${CW}px;height:${CH}px;opacity:0;z-index:4;border-radius:4px;pointer-events:none}
.fl.cir{border-radius:50%;width:${CH}px;height:${CH}px;margin-left:-${(CH - CW) / 2}px}
.tk{position:absolute;width:26px;height:3px;opacity:0;z-index:4;pointer-events:none}
.ln{position:absolute;height:3px;opacity:0;z-index:3;background:linear-gradient(90deg,transparent,currentColor);border-radius:2px;transform-origin:0 50%;pointer-events:none}
.dg{position:absolute;width:0;height:0;opacity:0;z-index:4;pointer-events:none}
.dot{position:absolute;width:14px;height:14px;border-radius:50%}
.bn{position:absolute;left:${COL_L}px;height:44px;z-index:40;opacity:0;display:flex;align-items:center;padding:0 20px;transform-origin:0 50%;pointer-events:none}
.bn span{font-size:24px;font-weight:800;color:#000;letter-spacing:4px;white-space:nowrap}
.spot{position:absolute;left:${SX0}px;top:${BAND_Y + 6}px;width:520px;height:100px;opacity:0;z-index:40;pointer-events:none}
.spot .sth{position:absolute;left:0;top:4px;width:62px;height:90px;border-radius:3px;background:#1c1c24 center/cover no-repeat}
.spot .sb{position:absolute;left:-12px;top:-4px;width:34px;height:34px;border-radius:50%;background:${COLOR.amber};color:#000;font-weight:800;font-size:19px;text-align:center;line-height:34px}
.spot .sx{position:absolute;left:84px;top:14px}
.spot .sk{font-size:15px;color:${COLOR.amber};letter-spacing:3px;font-weight:700}
.spot .sn{font-size:28px;font-weight:800;margin-top:6px;white-space:nowrap}
.cbadge{position:absolute;width:26px;height:26px;border-radius:50%;background:${COLOR.amber};color:#000;font-weight:800;font-size:15px;text-align:center;line-height:26px;z-index:60;opacity:0;pointer-events:none}
.bkt{position:absolute;width:${CW}px;height:22px;line-height:22px;text-align:center;background:${COLOR.amber};color:#000;font-weight:800;font-size:14px;letter-spacing:3px;z-index:66;opacity:0;border-radius:3px;pointer-events:none}
`;

// 合成页里的交互：悬停 / 点一下把「哪张卡、在合成页里的位置」交给外层（外层 = 页面）；左右键转给外层；host 问「现在每张卡在哪」时回答（验证脚本用）
const INTERACT = `
(function () {
  function rectOf(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  var cards = document.querySelectorAll('.card .a');
  Array.prototype.forEach.call(cards, function (el) {
    el.addEventListener('mouseenter', function () { parent.postMessage({ type: 'yg-card-hover', code: Number(el.dataset.code), rect: rectOf(el) }, '*'); });
    el.addEventListener('mouseleave', function () { parent.postMessage({ type: 'yg-card-leave', code: Number(el.dataset.code) }, '*'); });
    el.addEventListener('click', function () { parent.postMessage({ type: 'yg-card-tap', code: Number(el.dataset.code), rect: rectOf(el) }, '*'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); parent.postMessage({ type: 'yg-key', key: e.key }, '*'); }
  });
  addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.src !== 'yg-host' || d.cmd !== 'rects') return;
    var out = [];
    Array.prototype.forEach.call(cards, function (el) { if (getComputedStyle(el.parentNode).visibility === 'visible') out.push({ code: Number(el.dataset.code), md: el.dataset.md, rect: rectOf(el) }); });
    parent.postMessage({ type: 'yg-rects', cards: out }, '*');
  });
})();
`;

// 把 </script 和 <!-- 转义，免得内联脚本提前结束（JS 字符串 / 正则里这样写等价）
export const inlineJs = (js) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

// plan + 卡图（密码 → data: 地址或 null）+ 运行时源码 → 合成页 HTML。运行时必须是自带的（含 __hyperframes=），播放器看到它就不会去 CDN 注入
export function renderComposition(plan, { images = new Map(), runtime }) {
  if (!runtime) throw new Error('合成页要带 HyperFrames 运行时');
  const codes = [...new Set([...plan.codes, ...plan.instances.map((i) => i.code)])];
  const imageCss = codes.map((code) => (images.get(code) ? `.a.i${code},.sth.i${code}{background-image:url(${images.get(code)})}` : `.a.i${code},.sth.i${code}{background-color:#2a2a36}.a.i${code} .pt{display:block}`)).join('\n');
  const body = `<div id="root" data-composition-id="main" data-start="0" data-duration="${plan.duration}" data-width="${plan.stage.w}" data-height="${plan.stage.h}">
<div id="cam">
${plan.frames.join('\n')}
${plan.html.fx.join('\n')}
${plan.html.cards.join('\n')}
${plan.html.labels.join('')}
</div>
</div>`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=${plan.stage.w}, height=${plan.stage.h}">
<script>${inlineJs(runtime)}</script>
<style>${CSS}\n${imageCss}</style></head><body>
${body}
<script>
window.__timelines = window.__timelines || {};
${ENGINE_SOURCE}
var TR = ${JSON.stringify(plan.tracks)};
var INIT = ${JSON.stringify(plan.init)};
window.__timelines["main"] = ygMakeTimeline(document, TR, INIT, ${plan.duration});
</script>
<script>${INTERACT}</script>
</body></html>`;
}

// 页面要的时间点：每个位置（0 = 起手，1..N = 第几步）的开始、结束帧（结束帧 = 这一步走完、卡都停稳的那一刻）
export const marksOf = (plan) => ({ starts: plan.segments.map((s) => s.start), ends: plan.segments.map((s) => s.mark), duration: plan.duration });

// ---- 测试和验证用：某一刻每张卡在哪（不开浏览器；和合成页里的引擎同一份 valueAt）----
export function frameAt(plan, t) {
  const { valueAt } = new Function(`${ENGINE_SOURCE}; return { valueAt };`)();
  const read = (id, prop, dflt) => {
    const init = plan.init[id]?.[prop] ?? dflt;
    return plan.tracks[id]?.[prop] ? valueAt(plan.tracks[id][prop], t, init, prop === 'z' || prop === 'text') : init;
  };
  return plan.instances.map((inst) => ({
    id: inst.id, code: inst.code, md: inst.md,
    x: read(inst.id, 'x', 0), y: read(inst.id, 'y', 0), opacity: read(inst.id, 'opacity', 1), z: read(inst.id, 'z', 10),
    rotation: read(`${inst.id}a`, 'rotation', 0), tint: read(`${inst.id}t`, 'opacity', 0), tb: read(`${inst.id}k`, 'opacity', 0), back: read(`${inst.id}b`, 'opacity', 0), name: read(`${inst.id}n`, 'opacity', 1),
  }));
}
export const textAt = (plan, id, t) => {
  const { valueAt } = new Function(`${ENGINE_SOURCE}; return { valueAt };`)();
  return plan.tracks[id]?.text ? valueAt(plan.tracks[id].text, t, plan.init[id]?.text, true) : plan.init[id]?.text;
};
export const GEOMETRY = { CW, CH, SX0, PITCH, MY, SY, HY, PILE, handPos, slotPos, pilePos };

// 路线的展示数据（GET /routes、GET /route）：把 playRoute 重放出来的每一步场面配上卡名、和上一步的差异、终场汇总。
// 场面全部来自引擎重放，这里只加名字、算差异；打断数由 interrupts.js 算；纯函数，引擎由调用方注入。
import { OcgLocation as L, OcgPosition as P } from 'ocgcore-wasm';
import { routeBlocks } from './blocks.js';
import { cardOf } from './deck.js';
import { countInterrupts } from './interrupts.js';
import { ALL_ON } from './features.js';
import { buildLedger } from './ledger.js';
import { handRoles, resolveRoles } from './roles.js';
import { diffEnd, playRoute } from './route.js';

// 场面里展示的区域：手牌、怪兽区（含额外怪兽区）、魔陷区（含场地）、墓地、除外、主卡组、额外卡组
export const ZONES = ['hand', 'monsters', 'spellTraps', 'grave', 'banished', 'deck', 'extra'];

// 引擎的 location 位 → 区名（OVERLAY 是 Xyz 素材，快照里没有这个区，现有卡组也没有 Xyz）；场地区、灵摆区不在本卡组用到的区里，返回 undefined
const ZONE_OF_LOCATION = [[L.OVERLAY, 'overlay'], [L.DECK, 'deck'], [L.HAND, 'hand'], [L.MZONE, 'monsters'], [L.SZONE, 'spellTraps'], [L.GRAVE, 'grave'], [L.REMOVED, 'banished'], [L.EXTRA, 'extra']];
const zoneOf = (location) => ZONE_OF_LOCATION.find(([bit]) => location & bit)?.[1];

// 引擎的表示形式（POS_*）→ attack（表侧攻击）、defense（表侧守备）、facedown（里侧，盖放的怪兽和魔陷）
const positionName = (position) => (position & P.FACEUP_ATTACK ? 'attack' : position & P.FACEUP_DEFENSE ? 'defense' : 'facedown');

// 一张场上的卡：密码、简中名、日文名、区内位置（手牌是第几张，怪兽区 0–4 是主怪兽区、5–6 是额外怪兽区，魔陷区同理）；
// 怪兽区和魔陷区的卡带 position（attack / defense / facedown）
const placed = (deck, zone, c) => ({ ...cardOf(deck, c.code), sequence: c.sequence, ...(zone === 'monsters' || zone === 'spellTraps' ? { position: positionName(c.position) } : {}) });

// 一步里引擎发出的卡片移动：{ code, md, jp, level?/rank?/link?, from, to, fromSequence, sequence, position?, summon?, material?, chain? }。from / to 是区名（ZONES，Xyz 素材是 overlay）；
// fromSequence 是出发处的区内位置（同密码的几张卡在场上时，靠它认是哪一张离开）；sequence 是引擎说的去处的区内位置（MSG_MOVE 的 to.sequence：怪兽区 0–4 主怪兽区、5–6 额外怪兽区，魔陷区同理，手牌、墓地等是进去之后的第几张）；
// position 是去处在怪兽区、魔陷区时的表示形式；summon 是这只怪兽被召唤的方式（normal / special / fusion / synchro / xyz / link / ritual，取自引擎消息）；
// material 是这张卡作为融合 / 同调等召唤的素材被移走；chain 是移动发生时正在连锁的第几环。只列我方的卡；起点终点都是对手那边的不列
function movesOf(deck, events) {
  return events.filter((e) => e.type === 'move' && (e.from.controller === 0 || e.to.controller === 0)).map((e) => {
    if (e.from.controller !== e.to.controller) throw new Error(`${e.code} 在两个玩家之间移动，快照还没处理`);
    const to = zoneOf(e.to.location);
    return {
      ...cardOf(deck, e.code), from: zoneOf(e.from.location), to, fromSequence: e.from.sequence, sequence: e.to.sequence,
      ...(to === 'monsters' || to === 'spellTraps' ? { position: positionName(e.to.position) } : {}),
      ...(e.material ? { material: true } : {}), ...(e.summon === undefined ? {} : { summon: e.summon }), ...(e.chain === undefined ? {} : { chain: e.chain }),
    };
  });
}

// 一个区域前后的差异：按密码数张数，多出来的是「进来了」，少了的是「离开了」（区内换位置不算）
function zoneDiff(deck, before, after) {
  const count = (cards) => cards.reduce((m, c) => m.set(c.code, (m.get(c.code) ?? 0) + 1), new Map());
  const a = count(before);
  const b = count(after);
  const surplus = (from, to) => [...from].flatMap(([code, n]) => Array(Math.max(0, n - (to.get(code) ?? 0))).fill(cardOf(deck, code)));
  return { in: surplus(b, a), out: surplus(a, b) };
}

// 场面加上名字：zones 里每个区的卡，带区内位置，怪兽区和魔陷区的卡带表示形式
const viewZones = (deck, board, zones) => Object.fromEntries(zones.map((zone) => [zone, board[zone].map((c) => placed(deck, zone, c))]));

// 一步走完后的场面（全部区），并把刚进来的卡标 fresh（每个密码标最后 diff 里进来的那几张）
function viewStepBoard(deck, board, diff) {
  const view = viewZones(deck, board, ZONES);
  for (const zone of ZONES) {
    for (const entered of diff[zone].in) {
      const target = view[zone].findLast((c) => c.code === entered.code && !c.fresh);
      if (target) target.fresh = true;
    }
  }
  return view;
}

const END_ZONES = ['hand', 'monsters', 'spellTraps', 'grave', 'banished']; // 终场汇总里列的区：不含主卡组和额外卡组

// 终场汇总：场上每张卡、剩余手牌、打断数（按卡组数据里的条件算，见 src/interrupts.js），每个打断靠哪张卡、怎么打断（同一张卡算进去几张就合在一条里）
export function endSummary(deck, endBoard) {
  const { total, breakers } = countInterrupts(deck, endBoard);
  return { ...viewZones(deck, endBoard, END_ZONES), interrupts: total, breakers: breakers.map((b) => ({ ...cardOf(deck, b.code), copies: b.copies, interrupts: b.interrupts, interruptHow: deck.cards[b.code].interruptHow })) };
}

// 重放一条路线，返回页面要的全部数据（每步的 roles：中场每张卡的作用标签，见 src/roles.js；blocks：这条路线由哪几段积木连成，见 src/blocks.js，每步的 block 是它归的积木 id；每步的 ledger 是资源账本，见 src/ledger.js；features 是试用功能的开关）。重放走不通会抛错（带步号），由调用方决定怎么回
export async function replayRoute(engine, deck, route, { features = ALL_ON } = {}) {
  const played = await playRoute(engine, deck, route);
  if (played.scriptErrors.length) throw new Error(`引擎脚本报错：${played.scriptErrors[0]}`);
  let before = played.startBoard;
  const steps = route.steps.map((step, i) => {
    const after = played.stepBoards[i];
    const diff = Object.fromEntries(ZONES.map((zone) => [zone, zoneDiff(deck, before[zone], after[zone])]));
    before = after;
    return {
      n: i + 1, text: step.text, actions: played.stepActions[i], activated: played.stepActivated[i].map((code) => cardOf(deck, code)),
      board: viewStepBoard(deck, after, diff), diff, moves: movesOf(deck, played.stepEvents[i]),
    };
  });
  // 每步中场（怪兽区、魔陷区）每张卡此刻的作用：这一步写了的、沿用之前写的，或默认
  const roles = resolveRoles(deck, route.id, steps.map((s) => [...s.board.monsters, ...s.board.spellTraps].map((c) => c.code)));
  steps.forEach((s, i) => { s.roles = roles[i].map((r) => ({ ...cardOf(deck, r.code), ...r })); });
  const end = endSummary(deck, played.endBoard);
  // 手牌里此刻有作用的卡（手坑、终场算进打断数的手牌），见 handRoles
  const handView = (hand, breakers) => handRoles(deck, hand.map((c) => c.code), breakers).map((r) => ({ ...cardOf(deck, r.code), ...r }));
  // 资源账本（试用功能 ledger，关了就没有这个字段）：每步一份，全部来自引擎重放的状态，见 src/ledger.js
  if (features.ledger) {
    const ledgers = buildLedger(deck, { startBoard: played.startBoard, stepBoards: played.stepBoards, stepActivations: played.stepActivations, stepNormalSummon: played.stepNormalSummon });
    steps.forEach((s, i) => { s.ledger = ledgers[i]; });
  }
  const blocks = routeBlocks(deck, route.id);
  steps.forEach((s) => { s.block = blocks.find((b) => b.from <= s.n && s.n <= b.to)?.id ?? null; });
  steps.forEach((s, i) => { s.handRoles = handView(s.board.hand, i === steps.length - 1 ? end.breakers.map((b) => b.code) : []); });
  return {
    id: route.id, name: route.name, needs: cardOf(deck, route.needs), source: route.source, verified: route.verified,
    mismatch: route.mismatch ?? '', engineDiff: diffEnd(route, played.endBoard),
    blocks, start: viewZones(deck, played.startBoard, ZONES), startHandRoles: handView(played.startBoard.hand, []), steps, end,
  };
}

// 路线列表的一项
export const routeListItem = (r) => ({ id: r.id, name: r.name, needs: r.needs, interrupts: r.end.interrupts, steps: r.steps.length, source: r.source, verified: r.verified, mismatch: r.mismatch, engineDiff: r.engineDiff });

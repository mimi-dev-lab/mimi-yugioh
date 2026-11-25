// 随机起手模拟（离线分析，#37）：按固定种子发 5 张先攻起手、对一手起手搜最好场面并把已知路线都试一遍、把记录的一行重放。纯逻辑：引擎、卡组、「现在」由调用方传进来；读写文件、命令行在 scripts/opening-*.js。
// 一手的记录（JSONL 的一行）：
//   masterSeed（总种子）、index、seed（这手的发牌种子，也是引擎洗牌的种子）、hand（起手 5 张的密码，发牌顺序）、keys（手里有的关键卡，起手速查里那几张，去重）
//   value（最好场面值）、interrupts（打断数）、handLeft（剩余手牌）、end（最好终场：monsters、spellTraps、hand 的密码，升序）
//   source（最好值的来源：'search' 或路线 id；搜索和路线同值时记 'search'）、searchValue、routeValue（走得通的路线里最高的，没有是 null）、bestRoute（它的路线 id）、routeValues（每条路线的值，走不通是 null）
//   capped（搜索节点数用完了没搜完）、nodes、maxNodes、ms（只记录，不参与任何决定）
//   searchReplayOk（搜出的步骤用 playRoute 重放，场面值和搜索一致）、steps（搜索最好路线的步骤，格式同卡组数据里路线的 steps，playRoute 能重放）
import { expand } from './deck.js';
import { playRoute } from './route.js';
import { boardValue, interruptsOf, searchHand } from './search.js';

export const HAND_SIZE = 5;

// 带种子的随机源（mulberry32）：同一个种子，同一串数
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 每手的种子：总种子派生的前 count 个，所以手数少的跑是手数多的前缀（--count 先给一半再续，和一口气跑一样）
export function handSeeds(masterSeed, count) {
  const rng = rngFrom(masterSeed);
  return Array.from({ length: count }, () => Math.floor(rng() * 2 ** 32));
}

// 完全随机发 5 张：洗主卡组，取前 5 张当起手。剩下的牌由 openHandSession 交给引擎按同一个种子洗
export function deal(deck, seed) {
  const rng = rngFrom(seed);
  const cards = expand(deck.main);
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards.slice(0, HAND_SIZE);
}

// 关键卡：起手速查（deck.lookup）里的卡，按它的先后；返回手里有的，去重
export const keyCardsIn = (deck, hand) => deck.lookup.map((l) => l.card).filter((code) => hand.includes(code));

const codesOf = (cards) => cards.map((c) => c.code).sort((a, b) => a - b);
const endOf = (board) => ({ monsters: codesOf(board.monsters), spellTraps: codesOf(board.spellTraps), hand: codesOf(board.hand) });
// 一个终场的结果：场面值、打断数、剩余手牌、终场的密码；没有终场（搜索和路线都没走到）全是 0 / null
const resultOf = (deck, endBoard) => (endBoard
  ? { value: boardValue(deck, endBoard), interrupts: interruptsOf(deck, endBoard), handLeft: endBoard.hand.length, end: endOf(endBoard) }
  : { value: 0, interrupts: 0, handLeft: 0, end: null });

// 对一手起手：搜最好场面（上限 maxNodes 个节点），再把每条已知路线用这手的起手和种子重放一遍（对不上提示就算走不了），取两者里场面值更高的。
// 搜出的步骤会用 playRoute 重放核对一次：场面值不一致就不采信搜索值（searchReplayOk 为 false）
export async function simulateHand(engine, deck, { masterSeed, index, seed, hand, maxNodes, now }) {
  const startedAt = now();
  const search = await searchHand(engine, deck, { hand, seed, maxNodes });
  let searchValue = null; let searchEnd = null; let searchReplayOk = true;
  if (search.steps) {
    try {
      const replay = await playRoute(engine, deck, { hand, steps: search.steps }, { seed });
      if (boardValue(deck, replay.endBoard) === search.value) { searchValue = search.value; searchEnd = replay.endBoard; } else searchReplayOk = false;
    } catch { searchReplayOk = false; }
  }
  const routeValues = {}; const routeEnds = {};
  for (const route of deck.routes) {
    try {
      const { endBoard } = await playRoute(engine, deck, { ...route, hand }, { seed });
      routeValues[route.id] = boardValue(deck, endBoard);
      routeEnds[route.id] = endBoard;
    } catch { routeValues[route.id] = null; }
  }
  let bestRoute = null;
  for (const [id, v] of Object.entries(routeValues)) if (v !== null && (bestRoute === null || v > routeValues[bestRoute])) bestRoute = id;
  const routeValue = bestRoute === null ? null : routeValues[bestRoute];
  const routeWins = routeValue !== null && (searchValue === null || routeValue > searchValue);
  const endBoard = routeWins ? routeEnds[bestRoute] : searchEnd;
  const base = { masterSeed, index, seed, hand: [...hand], keys: keyCardsIn(deck, hand) };
  const searchPart = { searchValue, routeValue, bestRoute, routeValues, capped: search.capped, nodes: search.nodes, maxNodes, ms: now() - startedAt, searchReplayOk, steps: search.steps ?? [] };
  return { ...base, ...resultOf(deck, endBoard), source: endBoard ? (routeWins ? bestRoute : 'search') : null, ...searchPart };
}

// 把记录里的搜索步骤在引擎里重放：返回终场、场面值、打断数、剩余手牌，调用方和记录对照
export async function replayRow(engine, deck, row) {
  const { endBoard, scriptErrors } = await playRoute(engine, deck, { hand: row.hand, steps: row.steps }, { seed: row.seed });
  return { endBoard, ...resultOf(deck, endBoard), scriptErrors };
}

// 重放结果和记录对照，返回差异列表（空 = 一致）。重放的是搜索的步骤，所以对着 searchValue；最好值来自搜索（source 是 'search'）时，终场、打断数、剩余手牌也要一致
export function checkReplay(row, replay) {
  if (row.searchValue === null || !row.steps?.length) return ['这手没有搜出可重放的路线（searchValue 为 null）'];
  const problems = [];
  if (replay.value !== row.searchValue) problems.push(`场面值 ${replay.value} ≠ 记录的搜索值 ${row.searchValue}`);
  if (row.source === 'search') {
    if (replay.interrupts !== row.interrupts) problems.push(`打断数 ${replay.interrupts} ≠ 记录的 ${row.interrupts}`);
    if (replay.handLeft !== row.handLeft) problems.push(`剩余手牌 ${replay.handLeft} ≠ 记录的 ${row.handLeft}`);
    if (JSON.stringify(replay.end) !== JSON.stringify(row.end)) problems.push(`终场 ${JSON.stringify(replay.end)} ≠ 记录的 ${JSON.stringify(row.end)}`);
  }
  return problems;
}

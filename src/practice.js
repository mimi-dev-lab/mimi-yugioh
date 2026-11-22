// 练习：按弱点发牌、隐藏基准手、首页统计。规则见 DESIGN.md「练习与首页」。纯函数：卡组、日志里的记录、种子都由调用方传进来，不取「现在」，不读文件。
import { classifyHand, handTypeName } from './deck.js';
import { deal, handKey, rngFrom } from './hand.js';

// 按弱点发牌：每个起手类型一个权重 = 1 + WEAK_BOOST × (1 − 最近 WEAK_RECENT 手的平均场面分 ÷ 100)，没打过的类型权重 1。
// 发牌时随机抽起手，按「该类型权重 ÷ 最大权重」的概率接受，不接受就换种子再抽（最多 MAX_REDRAWS 次；拒绝采样，单张卡的概率不动）
export const WEAK_RECENT = 10;
export const WEAK_BOOST = 3;
export const MAX_REDRAWS = 60;

// 隐藏基准手：从种子 BENCHMARK_SEED_BASE 起往上数，每个起手类型取 BENCHMARK_PER_TYPE 手（起手牌互不相同），固定不变；
// 每打满 BENCHMARK_EVERY − 1 手练习手，下一手是基准手（所以每 5 手里有 1 手），按顺序轮着发
export const BENCHMARK_SEED_BASE = 700000;
export const BENCHMARK_PER_TYPE = 2;
export const BENCHMARK_EVERY = 5;

// 首页的「最值得练」要这类起手至少打过 TIP_MIN_HANDS 手才下结论
export const TIP_MIN_HANDS = 3;

export const typeIds = (deck) => [...deck.handTypes.map((t) => t.id), 'other', 'brick'];

// 预先生成的一组基准手：[{ seed, hand, handType }]
export function benchmarkHands(deck) {
  const left = new Map(typeIds(deck).map((id) => [id, BENCHMARK_PER_TYPE]));
  const seen = new Set();
  const out = [];
  for (let seed = BENCHMARK_SEED_BASE; [...left.values()].some((n) => n > 0) && seed < BENCHMARK_SEED_BASE + 200000; seed++) {
    const { hand } = deal(deck, seed);
    const type = classifyHand(deck, hand);
    if (!left.get(type) || seen.has(handKey(hand))) continue;
    left.set(type, left.get(type) - 1);
    seen.add(handKey(hand));
    out.push({ seed, hand, handType: type });
  }
  return out;
}

const settled = (history) => history.filter((r) => r.type === 'hand');
const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;

// 每个起手类型现在的发牌权重：Map(类型 → 权重)。基准手不算练习表现
export function typeWeights(deck, history) {
  const practice = settled(history).filter((r) => !r.benchmarkHand);
  return new Map(typeIds(deck).map((id) => {
    const recent = practice.filter((r) => r.handType === id).slice(-WEAK_RECENT);
    return [id, recent.length ? 1 + WEAK_BOOST * (1 - average(recent.map((r) => r.fieldScore)) / 100) : 1];
  }));
}

// 候选种子的来源：默认是任意 32 位种子（完全随机发牌）。模拟（src/simulation.js）换成从预先搜好的一组种子里抽，见 DESIGN.md「效果验证」
const anySeed = (rng) => Math.floor(rng() * 2 ** 32);

// 发一手练习手：返回 { seed, hand }，hand 就是 deal(deck, seed)，所以「重打这一手」用 seed 发同样的牌。不发基准手的起手牌。
// weakDealing 为 false 时每类权重都是 1（不按弱点多发，模拟里去掉这个功能时用）
export function pickPractice(deck, history, { seed, benchmarkKeys = new Set(), candidateSeed = anySeed, weakDealing = true }) {
  const rng = rngFrom(seed);
  const weights = weakDealing ? typeWeights(deck, history) : new Map(typeIds(deck).map((id) => [id, 1]));
  const top = Math.max(...weights.values());
  let picked = null;
  for (let tries = 0; tries < MAX_REDRAWS || !picked; tries++) {
    const candidate = candidateSeed(rng);
    const { hand } = deal(deck, candidate);
    if (benchmarkKeys.has(handKey(hand))) continue;
    picked = { seed: candidate, hand };
    if (rng() < weights.get(classifyHand(deck, hand)) / top) break;
  }
  return picked;
}

// 下一手发什么：到了基准手的位置发基准手，否则按弱点发练习手。返回 { seed, benchmark }；candidateSeed、weakDealing 原样交给 pickPractice
export function nextDeal(deck, history, { seed, benchmarks, candidateSeed, weakDealing }) {
  const rows = settled(history);
  const sinceBenchmark = rows.length - 1 - rows.findLastIndex((r) => r.benchmarkHand);
  if (benchmarks.length && sinceBenchmark >= BENCHMARK_EVERY - 1) {
    return { seed: benchmarks[rows.filter((r) => r.benchmarkHand).length % benchmarks.length].seed, benchmark: true };
  }
  return { seed: pickPractice(deck, history, { seed, benchmarkKeys: new Set(benchmarks.map((b) => handKey(b.hand))), candidateSeed, weakDealing }).seed, benchmark: false };
}

// 首页的数据。点是练习手（第几手按日志里所有结算过的手数，基准手也占一个号、但不画在散点里）；基准手只出现在 progress
export function homeStats(deck, history) {
  const rows = settled(history).map((r, i) => ({ ...r, number: i + 1 }));
  const point = (r) => ({ number: r.number, handType: r.handType, handTypeName: handTypeName(deck, r.handType), durationMs: r.durationMs, fieldScore: r.fieldScore, speedBonus: r.speedBonus, total: r.total });
  const points = rows.filter((r) => !r.benchmarkHand).map(point);
  const best = points.reduce((top, p) => (!top || p.total > top.total ? p : top), null);
  const types = typeIds(deck).flatMap((id) => {
    const mine = points.filter((p) => p.handType === id);
    return mine.length ? [{ id, name: handTypeName(deck, id), count: mine.length, avgFieldScore: Math.round(average(mine.map((p) => p.fieldScore))), avgDurationMs: Math.round(average(mine.map((p) => p.durationMs))) }] : [];
  }).sort((a, b) => b.avgFieldScore - a.avgFieldScore);
  const weak = types.filter((t) => t.count >= TIP_MIN_HANDS).sort((a, b) => a.avgFieldScore - b.avgFieldScore || b.avgDurationMs - a.avgDurationMs)[0];
  const tip = weak && weak.avgFieldScore < 100 ? { type: weak.id, name: weak.name, avgFieldScore: weak.avgFieldScore, avgDurationMs: weak.avgDurationMs } : null;
  const bench = rows.filter((r) => r.benchmarkHand).map((r, i) => ({ index: i + 1, handType: r.handType, durationMs: r.durationMs, fieldScore: r.fieldScore, total: r.total }));
  return { hands: rows.length, points, best, last: points.at(-1) ?? null, types, tip, progress: { points: bench, average: bench.length ? Math.round(average(bench.map((p) => p.total))) : null } };
}

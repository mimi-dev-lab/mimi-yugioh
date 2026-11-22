// 手动跑的搜索计时：对 20 个随机种子发牌、搜索，打印每手的起手类型、用时、是否超时、最好值，以及用时分布和超时比例。不进 ./ci（要几分钟）。
// 用法：node scripts/search-bench.js [引擎数据目录] [时间上限毫秒]；默认引擎数据 ~/.cache/mimi-yugioh/engine，上限用 src/search.js 的 SEARCH_BUDGET_MS
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BRANDED } from '../src/decks/branded.js';
import { classifyHand } from '../src/deck.js';
import { openEngine } from '../src/duel-session.js';
import { openEngineFiles } from '../src/engine-files.js';
import { deal, rngFrom } from '../src/hand.js';
import { SEARCH_BUDGET_MS, searchHand } from '../src/search.js';

const engineDir = process.argv[2] ?? join(homedir(), '.cache/mimi-yugioh/engine');
const budgetMs = Number(process.argv[3] ?? SEARCH_BUDGET_MS);
const COUNT = 20;
const rng = rngFrom(20261123); // 固定的「随机」：每次跑同样的 20 个种子，前后可比
const seeds = Array.from({ length: COUNT }, () => Math.floor(rng() * 2 ** 32));

const engine = await openEngine(openEngineFiles(engineDir));
const rows = [];
console.log(`每手上限 ${budgetMs} ms，种子 ${seeds.join(' ')}`);
for (const seed of seeds) {
  const { hand } = deal(BRANDED, seed);
  const result = await searchHand(engine, BRANDED, { hand, seed, now: Date.now, budgetMs });
  rows.push({ seed, type: classifyHand(BRANDED, hand), ms: result.elapsedMs, timedOut: result.timedOut, value: result.value, nodes: result.nodes });
  console.log(`seed ${String(seed).padStart(10)}  ${rows.at(-1).type.padEnd(15)} ${String(result.elapsedMs).padStart(6)} ms  ${result.timedOut ? '超时' : '搜完'}  最好值 ${result.value}  节点 ${result.nodes}`);
}
const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
const at = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
console.log(`用时 ms：最小 ${sorted[0]}  中位 ${at(0.5)}  p90 ${at(0.9)}  最大 ${sorted.at(-1)}`);
console.log(`超时 ${rows.filter((r) => r.timedOut).length} / ${rows.length}`);

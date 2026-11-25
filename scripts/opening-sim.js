// 随机起手模拟（#37）：固定种子派生一串发牌种子，每个种子发 5 张先攻起手，搜最好场面并把已知路线都试一遍，每手跑完立刻追加一行 JSON 到输出文件（JSONL，格式见 src/opening-sim.js 开头）。
// 用法：node scripts/opening-sim.js [--count 500] [--seed 20261126] [--max-nodes N] [--out docs/opening-analysis.jsonl] [--engine 引擎数据目录] [--shard i/K]
//   --count      总手数（index 0 到 count-1）。手数少的跑是手数多的前缀
//   --seed       总种子，每手的种子由它派生
//   --max-nodes  一手的搜索节点上限（不是毫秒：同一手、同一种子、同一上限，结果一样，续跑和一口气跑相同）；超了的手记 capped: true
//   --out        输出 JSONL，已有就续跑：跳过里面已完成的 index，最后一行写了一半就丢掉重写；里面的种子、上限和这次的对不上就报错退出
//   --engine     引擎数据目录，默认 $YUGIOH_ENGINE，再默认 ~/.cache/mimi-yugioh/engine（不是 $YUGIOH_DATA/engine，见 DESIGN「随机起手模拟」）
//   --shard i/K  只跑 index 对 K 取余等于 i 的手（K 个进程各写自己的 --out 并行跑；合并用 scripts/opening-report.js --merge）
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BRANDED } from '../src/decks/branded.js';
import { openEngine } from '../src/duel-session.js';
import { openEngineFiles } from '../src/engine-files.js';
import { JSONL_PATH } from '../src/opening-report.js';
import { deal, handSeeds, simulateHand } from '../src/opening-sim.js';
import { engineDirFrom, failerFor } from './opening-common.js';

export const DEFAULT_COUNT = 500;
export const DEFAULT_SEED = 20261126;
export const DEFAULT_MAX_NODES = 100000; // 实测：前 60 手没有一手用满，每手平均约 9 秒，最慢约 45 秒

const fail = failerFor('opening-sim');
const { values } = parseArgs({ options: { count: { type: 'string' }, seed: { type: 'string' }, 'max-nodes': { type: 'string' }, out: { type: 'string' }, engine: { type: 'string' }, shard: { type: 'string' } } });
const positive = (text, name, fallback) => {
  const n = text === undefined ? fallback : Number(text);
  if (!Number.isInteger(n) || n < 1) fail(`--${name} 要是正整数，给的是 ${text}`);
  return n;
};
const count = positive(values.count, 'count', DEFAULT_COUNT);
const masterSeed = Number(values.seed ?? DEFAULT_SEED);
if (!Number.isInteger(masterSeed) || masterSeed < 0 || masterSeed >= 2 ** 32) fail(`--seed 要是 0 到 2^32-1 的整数，给的是 ${values.seed}`);
const maxNodes = positive(values['max-nodes'], 'max-nodes', DEFAULT_MAX_NODES);
const out = values.out ?? JSONL_PATH;
const engineDir = engineDirFrom(values.engine);
const [shardIndex, shardCount] = (values.shard ?? '0/1').split('/').map(Number);
if (!Number.isInteger(shardIndex) || !Number.isInteger(shardCount) || shardCount < 1 || shardIndex < 0 || shardIndex >= shardCount) fail(`--shard 要写成 i/K（0 ≤ i < K），给的是 ${values.shard}`);

const seeds = handSeeds(masterSeed, count);

// 已有的输出：只认完整的、解析得了的行；最后一行没写完（没有换行或解析不了）就丢掉，文件改成只剩好的行
function loadDone() {
  if (!existsSync(out)) return new Set();
  const text = readFileSync(out, 'utf8');
  const lines = text.split('\n');
  lines.pop(); // 最后一段是没写完的半行，或者空串
  const good = [];
  for (const line of lines) {
    try { good.push(JSON.parse(line)); } catch { break; }
  }
  for (const row of good) {
    if (row.maxNodes !== maxNodes) fail(`${out} 里的手是 --max-nodes ${row.maxNodes} 跑的，这次是 ${maxNodes}：换个 --out，或用同样的上限`);
    if (row.masterSeed !== masterSeed) fail(`${out} 里的手是 --seed ${row.masterSeed} 跑的，这次是 ${masterSeed}：换个 --out，或用同样的种子`);
  }
  if (good.length !== text.split('\n').length - 1 || !text.endsWith('\n')) writeFileSync(out, good.map((r) => `${JSON.stringify(r)}\n`).join(''));
  return new Set(good.map((r) => r.index));
}

const done = loadDone();
const engine = await openEngine(openEngineFiles(engineDir));
let ran = 0;
for (let index = 0; index < count; index++) {
  if (index % shardCount !== shardIndex || done.has(index)) continue;
  const seed = seeds[index];
  const row = await simulateHand(engine, BRANDED, { masterSeed, index, seed, hand: deal(BRANDED, seed), maxNodes, now: Date.now });
  appendFileSync(out, `${JSON.stringify(row)}\n`);
  ran++;
  console.log(`手 ${index + 1}/${count}  种子 ${seed}  最好值 ${row.value}（打断 ${row.interrupts}、手牌 ${row.handLeft}）  来源 ${row.source}  节点 ${row.nodes}${row.capped ? ' 超上限' : ''}  ${row.ms} ms`);
}
console.log(`跑了 ${ran} 手，跳过已完成的 ${done.size} 手，输出 ${out}`);

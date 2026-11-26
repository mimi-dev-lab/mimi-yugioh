// 随机起手模拟的报告（#37）：把 scripts/opening-sim.js 写的 JSONL（每手一行，格式见 src/opening-sim.js 开头）算成统计，再排成 docs/opening-analysis.md。
// 纯函数：只看传进来的行和卡组数据，不读时间、不读文件；同样的行得到同样的文字（毫秒只在「总耗时」里出现，它来自行里记的 ms）。
import { blockVariants, coverHand, LOOSE } from './blocks.js';
import { expand } from './deck.js';
import { keyCardsIn } from './opening-sim.js';
import { cardOf } from './deck.js';
import { MAX_BRANCH, MAX_COMBOS, MAX_DISCREPANCY } from './search.js';

export const MIN_LIFT_HANDS = 10; // 「每张卡在手时」只列至少在这么多手里出现过的卡（手数太少，平均不稳）
export const CANDIDATE_DETAIL = 5; // 新路线候选里前几个附完整步骤
export const COMMON_ENDS = 3; // 每组列几种常见终场
export const BRICK_CARDS = 5; // 卡手里比平时更常出现的卡，列几张
export const BRICK_MIN_HANDS = 3; // 一张卡在卡手里至少出现这么多手才进上面那个榜
export const STUCK_ROWS = 8; // 积木拼不出的手，列几个最常停下的步骤
export const BLOCK_CARDS = 5; // 积木拼不出的手，起手里比拼得出的更常有的卡，列几张

// 之前几版的结果，报告「返工说明」一节按先后列出每一版的说明，分布和这次并排对照。那几份 JSONL 已被重跑的结果替换，数字从它们原样抄在这里
// （git show <commit>:docs/opening-analysis.jsonl 能重算）。只有总种子、上限、手数都和这次一样的那一版才写。
// 第二版少算的 7 手：用第三版（#44）的代码重放第二版 JSONL 里每手搜出的步骤，打断数比记录少的手数（7 手都是终场上冰剑龙在自己回合用过除外效果）。
export const PRIOR_VERSIONS = [
  {
    label: '第一版', commit: 'e801814', masterSeed: 20261126, maxNodes: 100000, total: 500,
    distribution: { 0: 12, 1: 68, 2: 187, '3+': 233 }, avgInterrupts: 2.392, avgHandLeft: 2.818, better: 30, uncovered: 440,
    note: '第一版（commit e801814）的打断数不看卡的发动条件，把终场在场各卡的打断数直接相加，结果被高估：例如只通常召唤铁兽鸟 墨丘利耶、盖两张超融合的终场记了 3 个打断，可墨丘利耶要场上有以阿尔白斯之落胤为素材的融合怪兽才能发动，那个终场一只融合怪兽都没有。第一版 500 手里终场场上有墨丘利耶的有 63 手。第二版把每张有打断的卡的条件照卡片原文写进卡组数据，路线终场汇总、起手速查、搜索和本模拟共用 `src/interrupts.js` 算；搜索的评价跟着变了，所以全部手用同一个总种子和上限重跑（不是拿第一版的终场重新打分）。',
  },
  {
    label: '第二版', commit: 'eccc8ed', masterSeed: 20261126, maxNodes: 100000, total: 500,
    distribution: { 0: 23, 1: 80, 2: 210, '3+': 187 }, avgInterrupts: 2.156, avgHandLeft: 3.076, better: 28, uncovered: 429,
    note: '第二版（commit eccc8ed）没算自己回合已经用掉的效果：冰剑龙 镜翠幻种的除外效果在自己回合发动过，到下一个对手回合结束前都不能再用（卡片脚本给它挂的标记跨到对手回合才重置），第二版仍把它算 1 个打断。用这一版的口径重放第二版每手搜出的步骤，有 7 手打断数少 1，全是这种情况。这一版让决斗会话记下我方回合里发动过、之后没离开那一格的效果，终场打断数不算被锁住的（卡组数据的 `ownTurnLock`，见 DESIGN「卡组数据」）；别的打断卡的「每回合一次」在自己回合结束时就重置，自己回合用过不影响对手回合，所以只有冰剑龙这样写。搜索的评价跟着变了，全部手用同一个总种子和上限重跑。这次重跑时卡组数据里的已知路线也和第二版不同（从 7 条加到 9 条，已有的几条也改过步骤，见 `src/decks/branded-routes.js` 的 git 历史），搜索拿路线当参考排先后、每手也重放这些路线，所以下表这一版和第二版的差别不全来自冰剑龙这一条：只看这一条，是上面说的 7 手各少 1。',
  },
];

// 读 JSONL：一行一手，空行跳过，按 index 排序；同一个 index 出现两次报错
export function parseJsonl(text) {
  const rows = text.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  rows.sort((a, b) => a.index - b.index);
  for (let i = 1; i < rows.length; i++) if (rows[i].index === rows[i - 1].index) throw new Error(`index ${rows[i].index} 出现了两次`);
  return rows;
}

const mean = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : 0);
const countBy = (list, keyOf) => list.reduce((m, x) => { const k = keyOf(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});

// 报告里「总种子」「上限」只写一个值：行里这两个字段不止一个值（几份不同参数的 JSONL 混在了一起）就报错，不拼出一个不存在的数
function uniqueValue(rows, field) {
  const values = [...new Set(rows.map((r) => r[field]))];
  if (values.length > 1) throw new Error(`行里的 ${field} 不止一个值（${values.sort((a, b) => a - b).join('、')}）：不同参数跑出的行不能混进同一份报告`);
  return values[0];
}

// 积木覆盖率（票 #48）：每手的最好展开（steps 的操作序列）能不能只用积木拼出来，口径见 src/blocks.js 的 coverHand 和报告「积木覆盖率」一节。
// 没有展开的手（最好展开里没有发动、召唤、特殊召唤和连锁发动，只有盖放和结束回合）没东西可拼，不算在分母里。
const EXPANDS = ['activate', 'summon', 'special-summon'];
const hasExpansion = (steps) => steps.some((s) => s.do.some((op) => typeof op === 'object' && (EXPANDS.includes(op.idle) || op.chain !== undefined)));

function analyzeBlocks(rows, deck, { minLiftHands }) {
  const variants = blockVariants(deck);
  const knownOps = new Set(variants.flatMap((v) => v.ops.map((op) => JSON.stringify(op))));
  const withSteps = rows.filter((r) => hasExpansion(r.steps));
  const strict = withSteps.map((r) => ({ row: r, ...coverHand(r.steps, variants) }));
  const loose = withSteps.filter((r) => coverHand(r.steps, variants, LOOSE).covered).length;
  const covered = strict.filter((x) => x.covered);
  const uncovered = strict.filter((x) => !x.covered);
  const mean = (list) => (list.length ? list.reduce((s, x) => s + x.row.interrupts, 0) / list.length : 0);
  const routeCount = (id) => deck.routes.filter((r) => (deck.blocks.segments[r.id] ?? []).some((seg) => seg.block === id)).length;
  const usage = deck.blocks.blocks.map((b) => ({ id: b.id, name: b.name, needs: b.needs, gives: b.gives, routes: routeCount(b.id), hands: covered.filter((x) => x.blocks.some((u) => u.block === b.id)).length }))
    .sort((a, b) => b.hands - a.hands); // 稳定排序：一样多的按积木在数据里的先后
  const stuckBy = new Map();
  for (const x of uncovered) {
    const text = x.row.steps[x.stuck.step].text;
    const entry = stuckBy.get(text) ?? { text, n: 0, known: 0 };
    entry.n++;
    if (knownOps.has(JSON.stringify(x.stuck.op))) entry.known++;
    stuckBy.set(text, entry);
  }
  const stuck = [...stuckBy.values()].sort((a, b) => b.n - a.n || (a.text < b.text ? -1 : 1));
  const share = (list, code) => (list.length ? list.filter((x) => x.row.hand.includes(code)).length / list.length : 0);
  const cards = [...new Set(expand(deck.main))].flatMap((code) => {
    const nUncovered = uncovered.filter((x) => x.row.hand.includes(code)).length;
    const [u, c] = [share(uncovered, code), share(covered, code)];
    return nUncovered >= Math.max(1, minLiftHands) && u > c ? [{ code, md: cardOf(deck, code).md, nUncovered, nCovered: covered.filter((x) => x.row.hand.includes(code)).length, uncoveredShare: u, coveredShare: c }] : [];
  }).sort((a, b) => (b.uncoveredShare - b.coveredShare) - (a.uncoveredShare - a.coveredShare) || a.code - b.code).slice(0, BLOCK_CARDS);
  return {
    total: rows.length, noExpansion: rows.length - withSteps.length, withExpansion: withSteps.length,
    strict: { covered: covered.length }, loose: { covered: loose },
    blockCount: deck.blocks.blocks.length, variantCount: variants.length, routeCount: deck.routes.length, usage,
    covered: { n: covered.length, avgInterrupts: mean(covered) },
    uncovered: {
      n: uncovered.length, avgInterrupts: mean(uncovered), stuck: stuck.slice(0, STUCK_ROWS), stuckKinds: stuck.length,
      unknownOp: uncovered.filter((x) => !knownOps.has(JSON.stringify(x.stuck.op))).length, atFirstStep: uncovered.filter((x) => x.stuck.step === 0).length, cards,
    },
  };
}

export function analyze(rows, deck, { minLiftHands = MIN_LIFT_HANDS } = {}) {
  const md = (code) => cardOf(deck, code).md;
  const total = rows.length;
  const handTraps = (row) => row.hand.filter((c) => deck.cards[c]?.role === '手坑').length;
  const noStarter = (row) => !row.hand.some((c) => deck.cards[c]?.role === '启动');
  const endText = (row) => {
    if (!row.end) return '（没搜到终场）';
    const names = [...row.end.monsters, ...row.end.spellTraps].map(md).sort();
    return names.length ? names.join('、') : '（空场）';
  };

  const distribution = { 0: 0, 1: 0, 2: 0, '3+': 0 };
  for (const r of rows) distribution[r.interrupts >= 3 ? '3+' : r.interrupts]++;
  const bricks = rows.filter((r) => r.interrupts === 0);

  // 分组：单张关键卡归它那组，两张以上多张组合，没有都没有
  const keyOf = (row) => keyCardsIn(deck, row.hand);
  const groupDefs = [...deck.lookup.map((l) => ({ name: md(l.card), pick: (r) => keyOf(r).length === 1 && keyOf(r)[0] === l.card })),
    { name: '多张组合', pick: (r) => keyOf(r).length >= 2 }, { name: '都没有', pick: (r) => keyOf(r).length === 0 }];
  const groups = groupDefs.map(({ name, pick }) => {
    const list = rows.filter(pick);
    const ends = Object.entries(countBy(list, endText)).map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n || (a.text < b.text ? -1 : 1));
    return { name, n: list.length, avg: mean(list.map((r) => r.interrupts)), best: list.length ? Math.max(...list.map((r) => r.interrupts)) : 0, bricks: list.filter((r) => r.interrupts === 0).length, commonEnds: ends.slice(0, COMMON_ENDS) };
  });

  // 搜索比已知路线好的手：路线走得通、搜索值更高；路线都走不通、搜索却搜到打断的另列
  const better = rows.filter((r) => r.routeValue !== null && r.searchValue !== null && r.searchValue > r.routeValue)
    .sort((a, b) => (b.searchValue - b.routeValue) - (a.searchValue - a.routeValue) || a.index - b.index);
  const uncovered = rows.filter((r) => r.routeValue === null && r.source === 'search' && r.interrupts >= 1).sort((a, b) => b.value - a.value || a.index - b.index);

  // 每张卡在手时：有它的手平均打断数 − 没有它的手平均打断数（每手都有它的卡没法比，不列）
  const lift = [...new Set(expand(deck.main))].flatMap((code) => {
    const withCard = rows.filter((r) => r.hand.includes(code));
    if (withCard.length < Math.max(1, minLiftHands) || withCard.length === total) return [];
    const withAvg = mean(withCard.map((r) => r.interrupts));
    const withoutAvg = mean(rows.filter((r) => !r.hand.includes(code)).map((r) => r.interrupts));
    return [{ code, md: md(code), n: withCard.length, withAvg, withoutAvg, lift: withAvg - withoutAvg }];
  }).sort((a, b) => b.lift - a.lift || a.code - b.code);

  // 卡手的共同点：每张卡在卡手里出现的比例 ÷ 在全部手里出现的比例
  const overRepresented = bricks.length === 0 ? [] : [...new Set(expand(deck.main))].flatMap((code) => {
    const inBricks = bricks.filter((r) => r.hand.includes(code)).length;
    if (inBricks < BRICK_MIN_HANDS) return [];
    const shareBricks = inBricks / bricks.length;
    const inAll = rows.filter((r) => r.hand.includes(code)).length;
    return [{ code, md: md(code), inBricks, inAll, shareBricks, shareAll: inAll / total, ratio: shareBricks / (inAll / total) }];
  }).sort((a, b) => b.ratio - a.ratio || a.code - b.code).slice(0, BRICK_CARDS);

  const blockStats = analyzeBlocks(rows, deck, { minLiftHands });

  return {
    total, distribution, brickRate: total ? bricks.length / total : 0, avgInterrupts: mean(rows.map((r) => r.interrupts)), avgHandLeft: mean(rows.map((r) => r.handLeft)),
    groups, candidates: { better, uncovered }, lift, blocks: blockStats,
    bricks: { n: bricks.length, withoutKey: bricks.filter((r) => keyOf(r).length === 0).length, noStarter: bricks.filter(noStarter).length, avgHandTraps: mean(bricks.map(handTraps)), overRepresented },
    avgHandTraps: mean(rows.map(handTraps)), noStarterAll: rows.filter(noStarter).length,
    masterSeed: uniqueValue(rows, 'masterSeed'), maxNodes: uniqueValue(rows, 'maxNodes'), cappedCount: rows.filter((r) => r.capped).length, replayBad: rows.filter((r) => r.searchReplayOk === false).length,
    sources: countBy(rows, (r) => r.source), avgNodes: mean(rows.map((r) => r.nodes)), maxNodesUsed: rows.length ? Math.max(...rows.map((r) => r.nodes)) : 0, totalMs: rows.reduce((s, r) => s + r.ms, 0),
  };
}

const pct = (n, d) => `${d ? ((100 * n) / d).toFixed(1) : '0.0'}%`;
const f2 = (x) => x.toFixed(2);
const signed = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;
const hours = (ms) => (ms / 3600000).toFixed(2);

// 报告全文。「重算」一节写的是仓里的固定路径（报告提交在这两个位置）
export const JSONL_PATH = 'docs/opening-analysis.jsonl';
export const MD_PATH = 'docs/opening-analysis.md';

// 报告里附完整步骤的新路线候选：搜索比已知路线好的在前，其次是已知路线都走不通的，取前 CANDIDATE_DETAIL 手
export const candidateDetails = ({ candidates }) => [...candidates.better, ...candidates.uncovered].slice(0, CANDIDATE_DETAIL);

export function buildReport(rows, deck, { minLiftHands = MIN_LIFT_HANDS, priorVersions = PRIOR_VERSIONS } = {}) {
  const s = analyze(rows, deck, { minLiftHands });
  const md = (code) => cardOf(deck, code).md;
  const out = [];
  const line = (text = '') => out.push(text);
  const table = (head, body) => { line(`| ${head.join(' | ')} |`); line(`|${head.map(() => '---').join('|')}|`); for (const r of body) line(`| ${r.join(' | ')} |`); line(); };

  line(`# 烙印随机起手模拟（${s.total} 手）`);
  line();
  line('规格 #27 的离线分析（票 #37）。本文件由 `scripts/opening-report.js` 从 `docs/opening-analysis.jsonl` 生成，数字全部能由那份 JSONL 重算，不要手改。');
  line();
  line('## 怎么跑的');
  line();
  line(`- 手数：${s.total} 手。总种子 ${s.masterSeed}，每手的发牌种子由它按 mulberry32 派生；每手把 40 张主卡组按这个种子洗牌，取前 5 张当先攻起手，引擎里剩下的牌用同一个种子洗。`);
  line('- 评价：场面值 = 10 × 我方回合结束时终场的打断数 + 1 × 剩余手牌数。打断数按卡组数据里每张卡的打断数和发动条件算（`src/interrupts.js`，见 DESIGN「卡组数据」）：例如铁兽鸟 墨丘利耶要场上有以阿尔白斯之落胤为素材的融合怪兽才算（在手牌、在场上都算），盖着的超融合每张要弃一张手牌，冰剑龙 镜翠幻种在自己回合用过除外效果就不算（对手回合不能再用）。下面「打断数」都指终场的打断数。');
  const simRoutes = Object.keys(rows[0]?.routeValues ?? {});
  line(`- 每手两路取更好的：一路是规则引擎里的有限偏离深度优先搜索（上限 ${s.maxNodes} 个节点，见最后一节），一路是把卡组数据里的 ${simRoutes.length} 条已知展开路线用这手的起手和种子各重放一遍（对不上引擎提示的就算走不了）。`);
  // 报告只重新生成、不重跑模拟时，卡组数据里的路线可能已经和 JSONL 记录的不同：列出 id 不在 JSONL 里的路线；同 id 换了步骤的查不出来，只写去哪查
  const added = deck.routes.filter((r) => !simRoutes.includes(r.id));
  if (added.length) line(`- 「已知路线」指跑模拟时卡组数据里的那 ${simRoutes.length} 条（${simRoutes.join('、')}）当时的步骤，数字没有跟着之后的路线改动重算。之后新加的路线（id 不在 JSONL 里）：${added.map((r) => `${r.name}（${r.id}）`).join('、')}；同一个 id 之后换了步骤的，这里看不出来，查 \`src/decks/branded-routes.js\` 的 git 历史。`);
  line('- 积木覆盖率（票 #48）：拿每手最好展开的引擎操作序列（`steps[].do`），看它能不能切成若干段，每段和某块积木的某个写法一字不差（积木的写法取自路线数据里那块积木对应的几步）；两个口径和结果见「积木覆盖率」一节。');
  line(`- 最好值来源：${Object.entries(s.sources).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k === 'search' ? '搜索' : `路线 ${k}`} ${n} 手`).join('，')}（搜索和路线同值记搜索）。`);
  line();

  const prior = priorVersions.filter((v) => v.masterSeed === s.masterSeed && v.maxNodes === s.maxNodes && v.total === s.total);
  if (prior.length) {
    line('## 返工说明');
    line();
    for (const v of prior) { line(v.note); line(); }
    line(`之前${prior.map((v) => v.label).join('、')}的分布原样列在下面：`);
    line();
    const cols = [...prior,
      { label: '这一版', distribution: s.distribution, total: s.total, avgInterrupts: s.avgInterrupts, avgHandLeft: s.avgHandLeft, better: s.candidates.better.length, uncovered: s.candidates.uncovered.length }];
    table(['打断数', ...cols.flatMap((c) => [`${c.label}手数`, `${c.label}占比`])], ['0', '1', '2', '3+'].map((k) => [k, ...cols.flatMap((c) => [c.distribution[k], pct(c.distribution[k], c.total)])]));
    table(['', ...cols.map((c) => c.label)], [
      ['卡手率（0 打断）', ...cols.map((c) => pct(c.distribution[0], c.total))],
      ['平均打断数', ...cols.map((c) => f2(c.avgInterrupts))],
      ['平均剩余手牌', ...cols.map((c) => f2(c.avgHandLeft))],
      ['新路线候选（搜索比走得通的已知路线好）', ...cols.map((c) => `${c.better} 手`)],
      ['已知路线都走不通、搜索有打断', ...cols.map((c) => `${c.uncovered} 手`)],
    ]);
  }

  line('## 打断数分布');
  line();
  table(['打断数', '手数', '占比'], ['0', '1', '2', '3+'].map((k) => [k, s.distribution[k], pct(s.distribution[k], s.total)]));
  line(`卡手率（0 打断）：${pct(s.distribution[0], s.total)}（${s.distribution[0]} 手）。平均打断数 ${f2(s.avgInterrupts)}，平均剩余手牌 ${f2(s.avgHandLeft)}。`);
  line();

  line('## 按起手关键卡分组');
  line();
  line(`关键卡是起手速查里的 ${deck.lookup.length} 张。起手里有且只有一张关键卡归那张的组，有两张以上归「多张组合」，一张都没有归「都没有」（同一张关键卡有两张也算一张）。常见终场是终场在场的卡（按名字排序）相同的手合并后最多的几种。`);
  line();
  table(['起手', '手数', '占比', '平均打断数', '最好打断数', '卡手数', '常见终场'], s.groups.map((g) => [g.name, g.n, pct(g.n, s.total), g.n ? f2(g.avg) : '-', g.n ? g.best : '-', g.n ? g.bricks : '-', g.commonEnds.map((e) => `${e.text}（${e.n} 手）`).join('；') || '-']));

  line('## 新路线候选：搜索比已知路线更好的手');
  line();
  const { better, uncovered } = s.candidates;
  line(`搜索值高于已知路线最好值的手：${better.length ? `${better.length} 手` : '没有'}。已知路线都走不通、搜索却搜到至少 1 个打断的手：${uncovered.length ? `${uncovered.length} 手` : '没有'}。`);
  line();
  if (better.length) {
    table(['种子', '第几手', '起手', '搜索值', '已知路线最好值（路线）', '搜索的打断数'], better.map((r) => [r.seed, r.index, r.hand.map(md).join('、'), r.searchValue, `${r.routeValue}（${r.bestRoute}）`, r.interrupts]));
  }
  if (uncovered.length) {
    line('已知路线走不通、搜索有打断的手（按场面值从高到低，最多列 20 手）：');
    line();
    table(['种子', '第几手', '起手', '场面值', '打断数'], uncovered.slice(0, 20).map((r) => [r.seed, r.index, r.hand.map(md).join('、'), r.value, r.interrupts]));
  }
  const detail = candidateDetails(s);
  for (const r of detail) {
    line(`### 种子 ${r.seed}（第 ${r.index} 手）`);
    line();
    line(`起手：${r.hand.map(md).join('、')}。搜索值 ${r.searchValue}；已知路线${r.routeValue === null ? '走不通' : `最好值 ${r.routeValue}（${r.bestRoute}）`}。重放：\`node scripts/opening-replay.js --seed ${r.seed}\``);
    line();
    r.steps.forEach((step, i) => line(`${i + 1}. ${step.text}　\`${JSON.stringify(step.do)}\``));
    line();
  }

  line('## 每张卡在手里时的平均打断数');
  line();
  line(`有这张卡的手的平均打断数，减去没有它的手的平均打断数（提升越大，抽到它越值）；只列至少在 ${Math.max(1, minLiftHands)} 手里出现过的卡。这是相关，不是因果：一张卡常和别的好牌一起被抽到。`);
  line();
  table(['卡', '有它的手数', '有它时平均', '没有它时平均', '提升'], s.lift.map((c) => [c.md, c.n, f2(c.withAvg), f2(c.withoutAvg), signed(c.lift)]));

  line('## 卡手的共同点');
  line();
  line(`卡手 = 终场 0 打断的手，共 ${s.bricks.n} 手。`);
  line();
  if (s.bricks.n) {
    line(`- 一张关键卡都没有的：${s.bricks.withoutKey} 手（${pct(s.bricks.withoutKey, s.bricks.n)}）。`);
    line(`- 一张「启动」作用的卡都没有的：${s.bricks.noStarter} 手（${pct(s.bricks.noStarter, s.bricks.n)}）；全部手里这样的是 ${pct(s.noStarterAll, s.total)}。`);
    line(`- 手坑（作用为「手坑」的卡）平均 ${f2(s.bricks.avgHandTraps)} 张；全部手平均 ${f2(s.avgHandTraps)} 张。`);
    if (s.bricks.overRepresented.length) {
      line(`- 卡手里比平时更常出现的卡（在卡手里出现的比例 ÷ 在全部手里出现的比例，至少 ${BRICK_MIN_HANDS} 手卡手里有）：`);
      line();
      table(['卡', '卡手里有它', '占卡手', '占全部手', '倍数'], s.bricks.overRepresented.map((c) => [c.md, c.inBricks, pct(c.inBricks, s.bricks.n), pct(c.inAll, s.total), f2(c.ratio)]));
    }
  }

  line('## 积木覆盖率');
  line();
  const b = s.blocks;
  line(`规格 #45、票 #48。${b.blockCount} 块积木（\`src/decks/branded-blocks.js\`）把卡组数据里的 ${b.routeCount} 条已知路线拆成段；每块积木在每条路线里对应的那几步，把它们的引擎操作（每步的 \`do\`）接起来是它的一个写法，同一块积木各条路线写得不同的算不同写法，共 ${b.variantCount} 个写法。这一节回答：只用这几块积木，能拼出多少手的最好展开。`);
  line();
  line('口径：');
  line();
  line('- 一手的最好展开 = 上面每手 `steps` 里的引擎操作序列（每步的 `do` 接起来；`finish` 不算：搜索走到回合结束就停，不写它）。积木的写法取现在的路线数据，不是跑模拟时的那几条。');
  line('- 严格口径（下面的主数字）：整个操作序列能切成若干段、首尾相接，每段和某块积木的某个写法一字不差，包括选了哪张卡、放哪一格、什么表示形式；卡号相同、选的卡不同的写法算不同，拼不出。开头的 pass（回合一开始，手牌里的软绵雀精、增殖的Z 这类手坑的连锁窗口选不发动）和结尾的 pass（放行连锁窗口，等于 `finish`）不算。');
  line('- 放宽口径（另算一个数）：不看放哪一格、表示形式和 pass，选了哪些卡只看选了几张、选第几项也不看；发动、召唤、连锁发动哪张卡、是 / 否仍要对上。');
  line('- 只有盖放和结束回合的手（最好展开里没有发动、召唤、特殊召唤和连锁发动）没东西可展开，不算在分母里。');
  line();
  line(`- ${b.noExpansion} 手最好展开只有盖放和结束回合（没有展开可拼）。`);
  line(`- 其余 ${b.withExpansion} 手有展开：严格口径下积木拼得出 ${b.strict.covered} 手（${pct(b.strict.covered, b.withExpansion)}）；放宽口径下 ${b.loose.covered} 手（${pct(b.loose.covered, b.withExpansion)}）。`);
  line();
  line('每块积木在拼得出的手里用到几手（严格口径；同一块在一手里用两次只算一手）、用在几条路线、要什么 → 给什么：');
  line();
  table(['积木', '拼得出的手里用到', '用在几条路线', '要什么 → 给什么'], b.usage.map((u) => [u.name, u.hands, u.routes, `${u.needs} → ${u.gives}`]));
  const u = b.uncovered;
  line(`没拼出的 ${u.n} 手（有展开、严格口径拼不出）的共同点，全部由 JSONL 的步骤算出：`);
  line();
  if (u.n) {
    line(`- 平均打断数 ${f2(u.avgInterrupts)}，拼得出的手是 ${f2(b.covered.avgInterrupts)}。`);
    line(`- 从头拼到最远处之后，下一个接不上的操作在第 1 步的有 ${u.atFirstStep} 手（${pct(u.atFirstStep, u.n)}）：一块积木都没接上。`);
    line(`- 接不上的那个操作，没有任何积木的任何写法含它的有 ${u.unknownOp} 手（${pct(u.unknownOp, u.n)}）：积木没见过这个动作；其余 ${u.n - u.unknownOp} 手停在积木里有、但这里接不上的操作上（选的卡、顺序或前后文不同）。`);
    line();
    line(`最常停下的步骤（步骤说明是搜索写的，共 ${u.stuckKinds} 种，列前 ${u.stuck.length} 种）；「积木里有这个操作」指接不上的那个操作在某块积木的某个写法里出现过：`);
    line();
    table(['停在的步骤', '手数', '积木里有这个操作'], u.stuck.map((x) => [x.text, x.n, `${x.known} 手`]));
    if (u.cards.length) {
      line(`起手里比拼得出的手更常有的卡（至少 ${Math.max(1, minLiftHands)} 手没拼出的手里有它，列前 ${BLOCK_CARDS} 张）：`);
      line();
      table(['卡', '没拼出的手里有它', '拼得出的手里有它'], u.cards.map((c) => [c.md, `${pct(c.nUncovered, u.n)}（${c.nUncovered} 手）`, `${pct(c.nCovered, b.covered.n)}（${c.nCovered} 手）`]));
    }
  }

  line('## 搜索上限和超上限的手');
  line();
  line(`- 搜索上限：每手 ${s.maxNodes} 个节点（一个节点 = 搜索里走一个回应；不按毫秒，所以同一手、同一种子、同一上限的结果完全一样，续跑和一口气跑相同）。`);
  line(`- 超上限（capped）的手：${s.cappedCount} 手（${pct(s.cappedCount, s.total)}）：节点用完时搜索还没搜完，记下的是停之前找到的最好的，真正的最好场面可能更高。其余手是在这个搜索范围里搜完的。`);
  line(`- 每手平均 ${Math.round(s.avgNodes)} 个节点，最多 ${s.maxNodesUsed} 个；各手的耗时加起来 ${hours(s.totalMs)} 小时（只记录，不参与任何决定）。`);
  line(`- 搜出的步骤用 \`playRoute\` 重放核对，场面值对不上的手：${s.replayBad} 手（对不上就不采信搜索值）。`);
  line(`- 搜索不保证穷举：每条路线最多 ${MAX_DISCREPANCY} 处不走排在第一的回应，选卡时最多试 ${MAX_BRANCH} 个不同的卡、${MAX_COMBOS} 种组合，放哪一格和表示形式只试第一个，不进战斗阶段，盖放没有打断数的卡不试。所以「最好」是这个范围里的最好，不是理论最高。`);
  line();

  line('## 重算和重放');
  line();
  line('```');
  line(`node scripts/opening-sim.js --count ${s.total} --seed ${s.masterSeed} --max-nodes ${s.maxNodes} --out ${JSONL_PATH}   # 重跑模拟（已有的行会跳过，续跑）`);
  line(`node scripts/opening-report.js ${JSONL_PATH} --out ${MD_PATH}   # 从 JSONL 重新生成本文件`);
  line(`node scripts/opening-replay.js --seed ${(detail[0] ?? rows[0])?.seed ?? 0}   # 重放某一手搜出的路线，打出终场和打断数并和 JSONL 里的记录对照`);
  line('```');
  line();
  return `${out.join('\n').trimEnd()}\n`;
}

// 随机起手模拟的报告（#37）：把 scripts/opening-sim.js 写的 JSONL（每手一行，格式见 src/opening-sim.js 开头）算成统计，再排成 docs/opening-analysis.md。
// 纯函数：只看传进来的行和卡组数据，不读时间、不读文件；同样的行得到同样的文字（毫秒只在「总耗时」里出现，它来自行里记的 ms）。
import { expand } from './deck.js';
import { keyCardsIn } from './opening-sim.js';
import { cardOf } from './route-view.js';
import { MAX_BRANCH, MAX_COMBOS, MAX_DISCREPANCY } from './search.js';

export const MIN_LIFT_HANDS = 10; // 「每张卡在手时」只列至少在这么多手里出现过的卡（手数太少，平均不稳）
export const CANDIDATE_DETAIL = 5; // 新路线候选里前几个附完整步骤
export const COMMON_ENDS = 3; // 每组列几种常见终场
export const BRICK_CARDS = 5; // 卡手里比平时更常出现的卡，列几张
export const BRICK_MIN_HANDS = 3; // 一张卡在卡手里至少出现这么多手才进上面那个榜

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

  return {
    total, distribution, brickRate: total ? bricks.length / total : 0, avgInterrupts: mean(rows.map((r) => r.interrupts)), avgHandLeft: mean(rows.map((r) => r.handLeft)),
    groups, candidates: { better, uncovered }, lift,
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

export function buildReport(rows, deck, { minLiftHands = MIN_LIFT_HANDS } = {}) {
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
  line('- 评价：场面值 = 10 × 我方回合结束时终场在场各卡的打断数之和 + 1 × 剩余手牌数（打断数照卡组数据里每张卡的 `interrupts`，见 DESIGN「卡组数据」）。下面「打断数」都指终场的打断数之和。');
  line(`- 每手两路取更好的：一路是规则引擎里的有限偏离深度优先搜索（上限 ${s.maxNodes} 个节点，见最后一节），一路是把卡组数据里的 ${Object.keys(rows[0]?.routeValues ?? {}).length} 条已知展开路线用这手的起手和种子各重放一遍（对不上引擎提示的就算走不了）。`);
  line(`- 最好值来源：${Object.entries(s.sources).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k === 'search' ? '搜索' : `路线 ${k}`} ${n} 手`).join('，')}（搜索和路线同值记搜索）。`);
  line();

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

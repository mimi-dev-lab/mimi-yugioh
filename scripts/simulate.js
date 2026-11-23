// 手动跑的模拟学习者实验（规格 #1「效果验证 ①」；做法、成功标准、结果在 docs/simulation-report.md）。不进 ./ci，./ci 只跑 --smoke。
//
//   node scripts/simulate.js                 完整实验：主实验 + 去功能 + 敏感性，结果写进 docs/simulation/
//   node scripts/simulate.js --smoke         冒烟：每种画像 2 个学习者、2 天、只跑主实验，结果写进临时目录后删掉
//   node scripts/simulate.js --only main --learners 5 --timing-only    只看用时（估算完整实验要多久），不打印分数
//   加 --resume：接着上次停下的地方跑（每跑完一个学习者就追加进 <out>/runs.jsonl，已经在里面的不重跑）
//
// 选项：--engine <引擎数据目录>（默认 ~/.cache/mimi-yugioh/engine）、--cache <练习池搜索缓存目录>（默认 ~/.cache/mimi-yugioh/sim-search，公开数据推出来的，可复用）、
//       --workers <n>（默认 CPU 数 − 1）、--learners <n>（每格几个学习者，默认 100）、--out <目录>（默认 docs/simulation）。
// 练习池：练习手从 POOL_SIZE 手预先搜好最好路线的随机起手里抽（搜索约 1 手几秒，真实发牌的起手有几万种，不能每手现搜）；第一次跑先把池子搜完存进 --cache。
// 搜索和提示的时间上限按「调用一次时钟走 1 毫秒」计（约等于真实搜索一个节点 1 毫秒），所以同样的输入同样的结果，和机器快慢无关。
// 每个学习者的数据目录在本次运行用 mkdtemp 建的临时目录里，跑完删掉；不碰 ~/.mimi-yugioh。
import { fork } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRANDED } from '../src/decks/branded.js';
import { openEngine } from '../src/duel-session.js';
import { openEngineFiles } from '../src/engine-files.js';
import { classifyHand } from '../src/deck.js';
import { deal, handKey, rngFrom } from '../src/hand.js';
import { benchmarkHands } from '../src/practice.js';
import { playRoute } from '../src/route.js';
import { HINT_BUDGET_MS, SEARCH_BUDGET_MS, searchHand } from '../src/search.js';
import { openSearchCache } from '../src/search-cache.js';
import { openService } from '../src/service.js';
import { PARAMS, PROFILES } from '../src/sim-learner.js';
import { REGIMENS, runLearner } from '../src/simulation.js';
import { openStore } from '../src/store.js';

const DECK = BRANDED;
export const POOL_SIZE = 2000; // 练习池多少手
export const POOL_SEED = 20261124; // 练习池的种子从这个随机源里抽
export const LEARNER_SEED = 20261201; // 第 p 个画像第 i 个学习者的种子 = LEARNER_SEED + 1000 × p + i，各练法、各参数设置共用（配对比较）
export const DAYS = 14;
export const SUCCESS_DIFF = 15; // 成功标准：第 14 天完整系统比只随机打高至少这么多分，三种画像都成立（主实验和每个敏感性设置都要成立）
export const CONTRIB_MIN = 2; // 去功能：完整系统比去掉它高至少这么多分，且配对差的 95% 置信区间不含 0，才算「有可测贡献」（至少一个画像）
export const SENSITIVITY = ['learnP', 'selfP', 'exposeP', 'slip', 'cardFloor', 'memoryScale', 'dailyMs'];
export const FACTORS = [0.5, 1.5];
const PROFILE_IDS = Object.keys(PROFILES);

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };

// 练习池：固定随机源抽出的 size 手，起手互不相同、不含基准手的牌
export function practicePool(size) {
  const rng = rngFrom(POOL_SEED);
  const taken = new Set(benchmarkHands(DECK).map((b) => handKey(b.hand)));
  const pool = [];
  while (pool.length < size) {
    const seed = Math.floor(rng() * 2 ** 32);
    const key = handKey(deal(DECK, seed).hand);
    if (!taken.has(key)) { taken.add(key); pool.push(seed); }
  }
  return pool;
}

// 所有任务：主实验（三种练法）、去功能（完整系统各去一个）、敏感性（每个参数 ×0.5 / ×1.5，完整系统和只随机打，只考第 0 和第 14 天）
function plan({ learners, only, days }) {
  const jobs = [];
  const add = (exp, regimens, variant, examDays) => {
    for (const [p, profile] of PROFILE_IDS.entries()) for (const regimen of regimens) for (let i = 0; i < learners; i++) jobs.push({ exp, profile, regimen, variant, index: i, seed: LEARNER_SEED + 1000 * p + i, days, examDays });
  };
  const daily = Array.from({ length: days + 1 }, (_, d) => d);
  if (!only || only === 'main') add('main', ['full', 'random', 'game8'], null, daily);
  if (!only || only === 'ablation') add('ablation', ['no-quiz', 'no-weak', 'no-review'], null, daily);
  if (!only || only === 'sensitivity') for (const param of SENSITIVITY) for (const factor of FACTORS) add('sensitivity', ['full', 'random'], { param, factor }, [0, days]);
  return jobs.map((j, id) => ({ ...j, id }));
}

// ---- 工人进程：开一次引擎，按任务跑学习者
async function worker() {
  const { engineDir, cacheDir, runDir, searchBudget, hintBudget } = JSON.parse(process.env.SIM_WORKER);
  const engine = await openEngine(openEngineFiles(engineDir));
  const shared = openStore(cacheDir);
  const game8Steps = [];
  for (const route of DECK.routes) game8Steps.push(...(await playRoute(engine, DECK, route)).steps.map((summary, i) => ({ summary, index: i + 1, handType: classifyHand(DECK, route.hand) })));
  const tickClock = () => { let t = 0; return () => ++t; };
  process.on('message', async (msg) => {
    if (msg.type === 'search') {
      const cache = openSearchCache({ store: shared, deck: DECK, now: tickClock(), budgetMs: searchBudget, search: (hand, seed, o) => searchHand(engine, DECK, { hand, seed, ...o }), onError: (e) => console.error(e) });
      await cache.ensure(deal(DECK, msg.seed).hand, msg.seed);
      process.send({ type: 'done', id: msg.id });
      return;
    }
    const job = msg.job;
    const dir = join(runDir, `job-${job.id}`);
    const open = (now) => {
      const side = (name) => {
        const own = openStore(join(dir, name));
        const store = { ...own, readSearch: shared.readSearch, writeSearch: shared.writeSearch }; // 搜索缓存全体共用（预先搜好的练习池），日志各自一份
        return { store, service: openService({ deck: DECK, store, engine: async () => engine, now, searchMs: 0, hintBudgetMs: hintBudget, searchNow: tickClock() }) };
      };
      let exams = 0;
      return { practice: side('practice'), openExam: () => side(`exam-${++exams}`) };
    };
    const params = { ...PARAMS, ...(job.variant ? { [job.variant.param]: PARAMS[job.variant.param] * job.variant.factor } : {}) };
    const started = Date.now();
    try {
      const result = await runLearner({ deck: DECK, open, profile: PROFILES[job.profile], params, regimen: REGIMENS[job.regimen], seed: job.seed, days: job.days, examDays: job.examDays, pool: msg.pool, game8Steps });
      process.send({ type: 'done', id: job.id, result: { ...result, ms: Date.now() - started } });
    } catch (e) {
      process.send({ type: 'done', id: job.id, error: e.stack });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  process.send({ type: 'ready' });
}

// 把任务分给 n 个工人，全部做完返回结果（按任务 id）
async function runPool(n, env, tasks, toMessage, onDone) {
  const results = new Array(tasks.length);
  let next = 0; let finished = 0;
  await new Promise((resolve, reject) => {
    if (!tasks.length) { resolve(); return; }
    const workers = Array.from({ length: Math.min(n, tasks.length) }, () => fork(fileURLToPath(import.meta.url), ['--worker'], { env: { ...process.env, SIM_WORKER: JSON.stringify(env) }, execArgv: ['--no-warnings'] }));
    const feed = (w) => { if (next < tasks.length) w.send(toMessage(tasks[next++])); else w.kill(); };
    for (const w of workers) {
      w.on('message', (m) => {
        if (m.type === 'ready') { feed(w); return; }
        if (m.error) { workers.forEach((x) => x.kill()); reject(new Error(m.error)); return; }
        results[m.id] = m.result; finished++;
        onDone?.(finished, tasks.length, m.id, m.result);
        if (finished === tasks.length) { workers.forEach((x) => x.kill()); resolve(); } else feed(w);
      });
      w.on('exit', (code) => { if (code && finished < tasks.length) reject(new Error(`工人退出 ${code}`)); });
    }
  });
  return results;
}

// ---- 统计
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0; };
const ci = (a) => { const m = mean(a); const h = 1.96 * sd(a) / Math.sqrt(a.length); return { mean: m, lo: m - h, hi: m + h }; };
const examMean = (r, day) => r.exams.find((e) => e.day === day).mean;

function summarize(jobs, results, days) {
  const cells = new Map();
  jobs.forEach((j, i) => {
    const key = [j.exp, j.variant ? `${j.variant.param}×${j.variant.factor}` : '', j.profile, j.regimen].join('/');
    if (!cells.has(key)) cells.set(key, { exp: j.exp, variant: j.variant, profile: j.profile, regimen: j.regimen, runs: [] });
    cells.get(key).runs.push({ seed: j.seed, ...results[i] });
  });
  const cell = (exp, variant, profile, regimen) => cells.get([exp, variant ?? '', profile, regimen].join('/'));
  const curve = (c) => c.runs[0].exams.map((e) => ({ day: e.day, ...ci(c.runs.map((r) => examMean(r, e.day))) }));
  // 配对差（同一个学习者种子）：a − b 在第 day 天
  const paired = (a, b, day) => {
    const bySeed = new Map(b.runs.map((r) => [r.seed, examMean(r, day)]));
    return ci(a.runs.map((r) => examMean(r, day) - bySeed.get(r.seed)));
  };
  const out = { days, main: {}, ablation: {}, sensitivity: [], activity: {} };
  for (const profile of PROFILE_IDS) {
    const full = cell('main', null, profile, 'full');
    if (!full) continue;
    out.main[profile] = Object.fromEntries(['full', 'random', 'game8'].map((g) => [g, curve(cell('main', null, profile, g))]));
    out.main[profile].diff = paired(full, cell('main', null, profile, 'random'), days);
    out.main[profile].diffGame8 = paired(full, cell('main', null, profile, 'game8'), days);
    out.activity[profile] = Object.fromEntries(['full', 'random', 'game8', 'no-quiz', 'no-weak', 'no-review'].map((g) => [g, cell(g.startsWith('no-') ? 'ablation' : 'main', null, profile, g)]).filter(([, c]) => c).map(([g, c]) => [g, {
      hands: mean(c.runs.map((r) => r.hands)), abandoned: mean(c.runs.map((r) => r.abandoned)), examAbandoned: mean(c.runs.flatMap((r) => r.exams.map((e) => e.abandoned / e.totals.length))), benchmarkHands: mean(c.runs.map((r) => r.benchmarkHands)), hints: mean(c.runs.map((r) => r.hints)), reviews: mean(c.runs.map((r) => r.reviews)), answers: mean(c.runs.map((r) => r.answers)), studied: mean(c.runs.map((r) => r.studied)), known: mean(c.runs.map((r) => r.known)),
    }]));
    for (const g of ['no-quiz', 'no-weak', 'no-review']) {
      const c = cell('ablation', null, profile, g);
      if (!c) continue;
      out.ablation[profile] ??= {};
      out.ablation[profile][g] = { curve: curve(c), contrib: paired(full, c, days) };
    }
  }
  const variants = [...new Set(jobs.filter((j) => j.variant).map((j) => `${j.variant.param}×${j.variant.factor}`))];
  for (const v of variants) {
    const diffs = {};
    for (const profile of PROFILE_IDS) {
      const f = cell('sensitivity', v, profile, 'full'); const r = cell('sensitivity', v, profile, 'random');
      if (f && r) diffs[profile] = { ...paired(f, r, days), full: mean(f.runs.map((x) => examMean(x, days))), random: mean(r.runs.map((x) => examMean(x, days))) };
    }
    out.sensitivity.push({ variant: v, diffs });
  }
  // 结论（成功标准事先写在报告里）
  const mainPass = PROFILE_IDS.every((p) => out.main[p] && out.main[p].diff.mean >= SUCCESS_DIFF);
  const sensPass = out.sensitivity.every((s) => PROFILE_IDS.every((p) => s.diffs[p] && s.diffs[p].mean >= SUCCESS_DIFF));
  out.verdict = { mainPass, sensitivityPass: sensPass, sensitivityRan: out.sensitivity.length > 0, pass: mainPass && sensPass && out.sensitivity.length > 0 };
  out.contributions = Object.fromEntries(['no-quiz', 'no-weak', 'no-review'].map((g) => [g, PROFILE_IDS.some((p) => { const c = out.ablation[p]?.[g]?.contrib; return c && c.mean >= CONTRIB_MIN && c.lo > 0; })]));
  return out;
}

const f1 = (x) => x.toFixed(1);
const range = (c) => `${f1(c.mean)}（${f1(c.lo)}–${f1(c.hi)}）`;

function resultsMarkdown(s, meta) {
  const P = (id) => PROFILES[id].name;
  let md = `# 模拟学习者实验结果（脚本生成）\n\n由 \`node scripts/simulate.js\` 生成，别手改。说明和成功标准见 [../simulation-report.md](../simulation-report.md)。\n\n`;
  md += `- 学习模型：${meta.model}\n- 运行：${meta.command}\n- 用时：${meta.minutes} 分钟（${meta.workers} 个工人进程，${meta.jobs} 个学习者任务）\n- 每格学习者：${meta.learners}；练习池 ${meta.poolSize} 手（其中搜索超时 ${meta.poolTimedOut} 手）；基准手 8 手搜索：${meta.benchmarkStatus}\n\n`;
  md += `数字是第 ${s.days} 天天末考试的基准手平均总分（8 手的平均，再对学习者平均），括号是 95% 置信区间；差是同一个学习者种子配对的差。\n\n`;
  md += `## 结论\n\n- 成功标准（完整系统 − 只随机打 ≥ ${SUCCESS_DIFF}，三种画像都成立）：主实验 **${s.verdict.mainPass ? '成立' : '不成立'}**；敏感性 ${s.verdict.sensitivityRan ? `**${s.verdict.sensitivityPass ? '每个设置都成立' : '有设置不成立'}**` : '没跑'}；合起来 **${s.verdict.pass ? '过' : '没过'}**\n`;
  md += `- 去功能（有可测贡献 = 至少一个画像里完整系统高 ≥ ${CONTRIB_MIN} 分且配对差 95% 区间不含 0）：${Object.keys(s.ablation).length ? Object.entries(s.contributions).map(([g, ok]) => `${REGIMENS[g].name.replace('去掉', '')} ${ok ? '有' : '**没有**'}`).join('；') : '这次没跑'}\n\n`;
  md += `## 主实验\n\n| 画像 | 完整系统 | 只随机打只给分 | 先看 Game8 路线 | 完整 − 只随机打 | 完整 − Game8 |\n|---|---|---|---|---|---|\n`;
  for (const p of Object.keys(s.main)) {
    const m = s.main[p]; const end = (g) => m[g].at(-1);
    md += `| ${P(p)} | ${range(end('full'))} | ${range(end('random'))} | ${range(end('game8'))} | ${range(m.diff)} | ${range(m.diffGame8)} |\n`;
  }
  md += `\n第 0 天（练之前）：${Object.keys(s.main).map((p) => `${P(p)} ${['full', 'random', 'game8'].map((g) => f1(s.main[p][g][0].mean)).join(' / ')}`).join('；')}\n\n![学习曲线](curves.svg)\n\n每天的数：\n\n| 画像 | 练法 | ${s.main[Object.keys(s.main)[0]].full.map((q) => `第${q.day}天`).join(' | ')} |\n|---|---|${s.main[Object.keys(s.main)[0]].full.map(() => '---').join('|')}|\n`;
  for (const p of Object.keys(s.main)) for (const g of ['full', 'random', 'game8']) md += `| ${P(p)} | ${REGIMENS[g].name} | ${s.main[p][g].map((q) => f1(q.mean)).join(' | ')} |\n`;
  if (Object.keys(s.ablation).length) {
    md += `\n## 去功能\n\n| 画像 | 完整系统 | 去掉记卡 | 去掉按弱点发牌 | 去掉复盘 |\n|---|---|---|---|---|\n`;
    for (const p of Object.keys(s.ablation)) {
      const a = s.ablation[p];
      md += `| ${P(p)} | ${f1(s.main[p].full.at(-1).mean)} | ${['no-quiz', 'no-weak', 'no-review'].map((g) => `${f1(a[g].curve.at(-1).mean)}（贡献 ${range(a[g].contrib)}）`).join(' | ')} |\n`;
    }
    md += `\n![去功能](ablation.svg)\n`;
  }
  if (s.sensitivity.length) {
    md += `\n## 敏感性（每个主要参数 ×0.5 / ×1.5，第 ${s.days} 天完整系统 − 只随机打）\n\n| 设置 | ${Object.keys(s.main).map(P).join(' | ')} |\n|---|${Object.keys(s.main).map(() => '---').join('|')}|\n`;
    md += `| 默认（主实验） | ${Object.keys(s.main).map((p) => range(s.main[p].diff)).join(' | ')} |\n`;
    for (const row of s.sensitivity) md += `| ${row.variant} | ${Object.keys(s.main).map((p) => `${range(row.diffs[p])}<br>完整 ${f1(row.diffs[p].full)} / 随机 ${f1(row.diffs[p].random)}`).join(' | ')} |\n`;
    md += `\n![敏感性](sensitivity.svg)\n`;
  }
  md += `\n## 14 天里做了什么（每个学习者平均）\n\n| 画像 | 练法 | 练习手 | 其中基准手 | 没法结算而作废的手 | 考试里没法结算的比例 | 提示 | 看复盘学到的步 | 记卡答题 | 看路线的步 | 记住的决定点 |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const p of Object.keys(s.activity)) for (const [g, a] of Object.entries(s.activity[p])) md += `| ${P(p)} | ${REGIMENS[g].name} | ${f1(a.hands)} | ${f1(a.benchmarkHands)} | ${f1(a.abandoned)} | ${(100 * a.examAbandoned).toFixed(1)}% | ${f1(a.hints)} | ${f1(a.reviews)} | ${f1(a.answers)} | ${f1(a.studied)} | ${f1(a.known)} |\n`;
  return md;
}

async function main() {
  const smoke = flag('smoke');
  const timingOnly = flag('timing-only');
  const engineDir = opt('engine', join(homedir(), '.cache/mimi-yugioh/engine'));
  const runDir = mkdtempSync(join(tmpdir(), 'yugioh-sim-'));
  const cacheDir = smoke ? join(runDir, 'cache') : opt('cache', join(homedir(), '.cache/mimi-yugioh/sim-search'));
  const outDir = smoke ? join(runDir, 'out') : opt('out', fileURLToPath(new URL('../docs/simulation', import.meta.url)));
  const workers = Number(opt('workers', smoke ? 2 : Math.max(1, cpus().length - 1)));
  const learners = Number(opt('learners', smoke ? 2 : 100));
  const days = smoke ? 2 : DAYS;
  const poolSize = smoke ? 3 : POOL_SIZE;
  const env = { engineDir, cacheDir, runDir, searchBudget: smoke ? 300 : SEARCH_BUDGET_MS, hintBudget: smoke ? 300 : HINT_BUDGET_MS };
  const started = Date.now();
  try {
    // 1. 练习池和基准手的最好路线：缓存里没有的才搜
    const pool = practicePool(poolSize);
    const benchmarks = benchmarkHands(DECK);
    const shared = openStore(cacheDir);
    const unsearched = (seeds) => seeds.filter((seed) => !shared.readSearch(handKey(deal(DECK, seed).hand)));
    const toSearch = unsearched([...benchmarks.map((b) => b.seed), ...pool]);
    if (toSearch.length) {
      console.log(`搜索 ${toSearch.length} 手的最好路线（上限 ${env.searchBudget} 步）…`);
      await runPool(workers, env, toSearch.map((seed, id) => ({ id, seed })), (t) => ({ type: 'search', ...t }), (done, all) => { if (done % 100 === 0 || done === all) console.log(`  ${done}/${all}  ${Math.round((Date.now() - started) / 1000)} 秒`); });
    }
    const entry = (seed) => shared.readSearch(handKey(deal(DECK, seed).hand));
    const poolTimedOut = pool.filter((seed) => entry(seed)?.timedOut).length;
    const benchmarkStatus = benchmarks.map((b) => (entry(b.seed)?.timedOut ? '超时' : entry(b.seed)?.steps ? '搜完' : '无')).join('、');
    console.log(`练习池 ${pool.length} 手（搜索超时 ${poolTimedOut}），基准手搜索：${benchmarkStatus}，准备用了 ${Math.round((Date.now() - started) / 1000)} 秒`);
    // 2. 学习者
    const jobs = plan({ learners, only: opt('only', smoke ? 'main' : undefined), days });
    // 每跑完一个学习者就追加一行到 runs.jsonl（中途停下不丢）；--resume 时同一个任务（同样的实验、画像、练法、参数设置、种子）已经在里面的就不再跑
    mkdirSync(outDir, { recursive: true });
    const runsFile = join(outDir, 'runs.jsonl');
    const jobKey = (j) => JSON.stringify([j.exp, j.profile, j.regimen, j.variant, j.seed, j.days, j.examDays]);
    const done = new Map();
    if (flag('resume') && existsSync(runsFile)) for (const line of readFileSync(runsFile, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(line); done.set(jobKey(r.job), r.result); }
    else writeFileSync(runsFile, '');
    const todo = jobs.filter((j) => !done.has(jobKey(j))).map((j, id) => ({ ...j, id, planId: j.id }));
    const simStarted = Date.now();
    console.log(`${jobs.length} 个学习者任务（已有 ${jobs.length - todo.length} 个），${workers} 个工人`);
    await runPool(workers, env, todo, (job) => ({ type: 'learner', job, pool }), (n, all, id, result) => {
      const { id: _id, planId: _plan, ...job } = todo[id];
      appendFileSync(runsFile, `${JSON.stringify({ job, result })}\n`);
      done.set(jobKey(todo[id]), result);
      if (n % 100 === 0 || n === all) console.log(`  ${n}/${all}  ${Math.round((Date.now() - simStarted) / 1000)} 秒`);
    });
    const results = jobs.map((j) => done.get(jobKey(j)));
    const ms = results.map((r) => r.ms).sort((a, b) => a - b);
    console.log(`学习者用时：每个中位 ${ms[Math.floor(ms.length / 2)]} 毫秒、最长 ${ms.at(-1)} 毫秒；全部 ${Math.round((Date.now() - simStarted) / 1000)} 秒`);
    if (timingOnly) return;
    const summary = summarize(jobs, results, days);
    const minutes = ((Date.now() - started) / 60000).toFixed(1);
    const meta = { model: 'v2：可迁移的知识单位（docs/simulation-report.md「第二版学习模型」）', command: `\`node scripts/simulate.js ${args.join(' ')}\``.replace(' `', '`'), minutes, workers, jobs: jobs.length, learners, poolSize, poolTimedOut, benchmarkStatus };
    writeFileSync(join(outDir, 'results.json'), `${JSON.stringify({ meta, ...summary }, null, 1)}\n`);
    writeFileSync(join(outDir, 'results.md'), resultsMarkdown(summary, meta));
    const { curvesSvg, sensitivitySvg, MAIN_COLORS, ABLATION_COLORS } = await import('./sim-charts.js');
    const panels = (series) => Object.keys(summary.main).map((p) => ({ title: PROFILES[p].name, series: series(p) }));
    writeFileSync(join(outDir, 'curves.svg'), curvesSvg({ title: '三种练法的学习曲线：每天天末 8 手基准手的平均总分', subtitle: `每格 ${learners} 个模拟学习者，阴影是 95% 置信区间`, colors: MAIN_COLORS, panels: panels((p) => ['full', 'random', 'game8'].map((g) => ({ id: g, name: REGIMENS[g].name, points: summary.main[p][g] }))) }));
    if (Object.keys(summary.ablation).length) writeFileSync(join(outDir, 'ablation.svg'), curvesSvg({ title: '去功能：完整系统和各去掉一个功能', subtitle: `每格 ${learners} 个模拟学习者，阴影是 95% 置信区间`, colors: ABLATION_COLORS, panels: panels((p) => [{ id: 'full', name: '完整系统', points: summary.main[p].full }, ...['no-quiz', 'no-weak', 'no-review'].map((g) => ({ id: g, name: REGIMENS[g].name, points: summary.ablation[p][g].curve }))]) }));
    if (summary.sensitivity.length) writeFileSync(join(outDir, 'sensitivity.svg'), sensitivitySvg({ title: '敏感性：每个参数 ×0.5 / ×1.5 时，第 14 天的差', threshold: SUCCESS_DIFF, colors: ['#2a78d6', '#eb6834', '#1baf7a'], profiles: PROFILE_IDS.map((id) => ({ id, name: PROFILES[id].name })), rows: [{ label: '默认', diffs: Object.fromEntries(PROFILE_IDS.map((p) => [p, summary.main[p].diff.mean])) }, ...summary.sensitivity.map((s) => ({ label: s.variant, diffs: Object.fromEntries(PROFILE_IDS.map((p) => [p, s.diffs[p].mean])) }))] }));
    console.log(`结论：主实验${summary.verdict.mainPass ? '成立' : '不成立'}，敏感性${summary.verdict.sensitivityRan ? (summary.verdict.sensitivityPass ? '都成立' : '有不成立') : '没跑'}；结果在 ${outDir}，共 ${minutes} 分钟`);
    if (smoke) console.log(JSON.stringify(Object.fromEntries(Object.entries(summary.main).map(([p, m]) => [p, m.diff.mean]))));
  } finally {
    rmSync(runDir, { recursive: true, force: true }); // 只删本次 mkdtemp 建的目录（含冒烟的缓存和输出）
  }
}

if (flag('worker')) worker();
else if (fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exitCode = 1; });

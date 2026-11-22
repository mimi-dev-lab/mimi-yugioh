// 本机服务：只监听 127.0.0.1，没有自己的网页（给用户的入口是 Hermes 里的插件）。接口见 DESIGN.md「接口」。环境变量、「现在」只在这里取。
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BRANDED } from './decks/branded.js';
import { openEngine } from './duel-session.js';
import { openEngineFiles } from './engine-files.js';
import { HandError, deal, handKey, startHand } from './hand.js';
import { benchmarkHands, homeStats, nextDeal } from './practice.js';
import { RATING_NAMES, ROLES, cardStates, dueCodes, grade, nextQuestion, rate, review } from './quiz.js';
import { rngFrom } from './hand.js';
import { HINT_BUDGET_MS, SEARCH_BUDGET_MS, searchHand } from './search.js';
import { openSearchCache } from './search-cache.js';
import { openStore } from './store.js';

const PORT = Number(process.env.PORT ?? 4519);
// 数据目录在仓外，不进 git；引擎数据（卡库和脚本）默认放在里面的 engine/，YUGIOH_ENGINE 能换
const DATA = process.env.YUGIOH_DATA ?? join(homedir(), '.mimi-yugioh');
const ENGINE = process.env.YUGIOH_ENGINE ?? join(DATA, 'engine');
const DECK = BRANDED;
const BENCHMARKS = benchmarkHands(DECK); // 隐藏基准手：固定的一组，不进练习池
const BENCHMARK_KEYS = new Set(BENCHMARKS.map((b) => handKey(b.hand)));
const SEARCH_MS = Number(process.env.YUGIOH_SEARCH_MS ?? SEARCH_BUDGET_MS); // 一手的搜索时间上限；0 = 不搜索

const store = openStore(DATA);
let enginePromise = null; // 第一次打牌才打开引擎：没下载引擎数据时 /health 照样能用
const engine = () => (enginePromise ??= openEngine(openEngineFiles(ENGINE)).catch((e) => { enginePromise = null; throw e; }));

// 后台搜索和它的缓存（怎么管见 src/search-cache.js）。提示要用 CPU 的时候，后台搜索停着等它（等的时间不计进时间上限）
let hinting = 0;
const searchCache = openSearchCache({
  store, deck: DECK, now: Date.now, budgetMs: SEARCH_MS, isPaused: () => hinting > 0,
  search: async (hand, seed, options) => searchHand(await engine(), DECK, { hand, seed, ...options }),
});

let active = null; // 进行中的一手（同一时间只有一手）
let handCount = 0;
let quiz = null; // 记卡：现在在答的这一题（{ question, answer, code, shownAt }），同一时间一题；答完或换新题就清掉

// 把一手没打完就作废的情况记进日志：服务重启时留在 active.json 里的、或者被新开的一手顶掉的
const voidHand = (info, reason) => { store.appendHand({ type: 'void', ...info, reason }); store.clearActive(); };
const stale = store.readActive();
if (stale) voidHand(stale, '服务重启，进行中的一手作废');

const json = (res, status, value) => { const text = JSON.stringify(value); res.writeHead(status, { 'content-type': 'application/json' }).end(text); }; // 先序列化再写头：序列化出错时还能回 500
const readBody = async (req) => {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new HandError('请求体不是 JSON'); }
};
const needActive = () => { if (!active) throw new HandError('没有进行中的一手', 404); return active; };

async function route(req, pathname, query) {
  const key = `${req.method} ${pathname}`;
  const now = Date.now();
  switch (key) {
    case 'GET /health': return [200, { ok: true }];
    // 开始一手：seed（0 到 2^32-1 的整数）可以注入，不给就用现在的时间
    case 'POST /hand/start': {
      const body = await readBody(req);
      if (body.seed !== undefined && !(Number.isInteger(body.seed) && body.seed >= 0 && body.seed < 2 ** 32)) throw new HandError('seed 要是 0 到 2^32-1 的整数');
      if (active) { active.close(); voidHand(active.info, '开了新的一手，这一手作废'); active = null; }
      // 不给种子：该发基准手就发基准手（每 5 手一次），否则按弱点发练习手；给了种子（重打、测试）就照它发，发出来的起手是基准手的牌就仍算基准手（重打基准手不能用提示、不进练习统计）
      const history = store.readHands();
      const { seed, benchmark } = body.seed === undefined ? nextDeal(DECK, history, { seed: now % 2 ** 32, benchmarks: BENCHMARKS }) : { seed: body.seed, benchmark: BENCHMARK_KEYS.has(handKey(deal(DECK, body.seed).hand)) };
      const number = history.filter((r) => r.type === 'hand').length + 1; // 第几手：日志里结算过的手数 + 1
      active = await startHand(await engine(), DECK, { id: `${now}-${++handCount}`, seed, now, number, benchmark });
      store.setActive(active.info);
      searchCache.ensure(active.info.hand, seed);
      return [200, active.view(now)];
    }
    // 首页：每一手的散点、个人最好、各类起手的平均、最值得练的类型、基准手的进步曲线（基准手只出现在曲线里）
    case 'GET /home': return [200, homeStats(DECK, store.readHands())];
    case 'GET /hand': return [200, needActive().view(now)];
    case 'POST /hand/choose': {
      const hand = needActive();
      const { indices } = await readBody(req);
      hand.submit(indices, now);
      return [200, hand.view(now)];
    }
    case 'POST /hand/hint': {
      const hand = needActive();
      hinting++;
      let result;
      try { result = await hand.hint({ searched: searchCache.state(hand.info.hand), now: Date.now, budgetMs: HINT_BUDGET_MS }); } finally { hinting--; }
      if (active !== hand) throw new HandError('这一手已经换了', 409);
      return [200, result];
    }
    case 'POST /hand/end': {
      const hand = needActive();
      const { settlement, record } = await hand.end(now, store.readHands(), searchCache.state(hand.info.hand));
      // 缓存的路线在这手的种子下重放不了：这次结算先不用它，再用这手的种子搜一遍，覆盖缓存
      if (settlement.benchmark.search === 'replay-failed') searchCache.ensure(hand.info.hand, hand.info.seed, { force: true });
      store.appendHand(record);
      store.clearActive();
      active = null;
      return [200, settlement];
    }
    // 卡组里每张卡的卡名（Master Duel 简中）、角色和三件事：页面点卡时显示。不含卡图
    case 'GET /cards': return [200, { cards: Object.fromEntries(Object.entries(DECK.cards).map(([code, c]) => [code, { md: c.md, role: c.role, does: c.does, cost: c.cost, limit: c.limit }])) }];
    // 卡图：JSON 里放 base64，插件后端原样转发、页面拼成 data: 地址（ctx.rest 只会读 JSON）。没有这张图是 404，页面改写卡名
    case 'GET /card-image': {
      const bytes = store.readImage(query.get('code'));
      if (!bytes) return [404, { error: '没有这张卡图（先跑 scripts/sync-card-images.js）' }];
      return [200, { code: Number(query.get('code')), type: 'image/webp', base64: bytes.toString('base64') }];
    }
    // 记卡：到期的张数（有记录以来答过的卡到期了的 + 没答过的），没有每日题量
    case 'GET /quiz': {
      const { reviewing, fresh } = dueCodes(DECK, cardStates(store.readQuiz()), new Date(now), rngFrom(0));
      return [200, { due: reviewing.length + fresh.length, reviewing: reviewing.length, fresh: fresh.length }];
    }
    // 出下一题：计时从这一刻起；没有到期的卡时 { done: true }。再调一次就换一题（上一题作废、不记录）
    case 'POST /quiz/next': {
      const next = nextQuestion(DECK, store.readQuiz(), new Date(now), now % 2 ** 32);
      if (!next) { quiz = null; return [200, { done: true, due: 0 }]; }
      quiz = { ...next, shownAt: now };
      return [200, { done: false, due: next.due, fresh: next.fresh, lastMs: next.lastMs, history: next.history, ...next.question }];
    }
    // 答题：{ option: 选项下标, roles: [角色] }，用时由服务从出题算起；记一行日志（带新的 FSRS 状态），返回对错、正确答案、这张卡的三件事、下次到期
    case 'POST /quiz/answer': {
      if (!quiz) throw new HandError('没有在答的题（先 POST /quiz/next）', 404);
      const { option, roles = [] } = await readBody(req);
      if (!Number.isInteger(option) || option < 0 || option >= quiz.question.options.length) throw new HandError('option 要是选项的下标');
      if (!Array.isArray(roles) || roles.some((r) => !ROLES.includes(r))) throw new HandError(`roles 只能是 ${ROLES.join('、')}`);
      const ms = now - quiz.shownAt;
      const { correct } = grade(quiz.answer, { option, roles });
      const rating = rate(correct, ms);
      const prior = cardStates(store.readQuiz()).get(quiz.code) ?? null;
      const card = review(prior, rating, new Date(now));
      store.appendQuiz({ type: 'answer', at: now, code: quiz.code, kind: quiz.question.kind, correct, ms, rating: RATING_NAMES[rating], picked: { option, roles }, card });
      const c = DECK.cards[quiz.code];
      const result = { correct, ms, rating: RATING_NAMES[rating], dueInMs: new Date(card.due) - now, answerIndex: quiz.answer.index, answerRoles: quiz.answer.roles, card: { code: quiz.code, md: c.md, role: c.role, does: c.does, cost: c.cost, limit: c.limit } };
      quiz = null;
      return [200, result];
    }
    default: return [404, { error: '没有这个接口' }];
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://127.0.0.1');
  try {
    const [status, body] = await route(req, pathname, searchParams);
    json(res, status, body);
  } catch (e) {
    if (e instanceof HandError) return json(res, e.status, { error: e.message });
    console.error(e);
    return json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port} 数据 ${DATA} 引擎 ${ENGINE}`);
});

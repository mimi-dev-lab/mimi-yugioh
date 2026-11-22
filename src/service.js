// 服务的接口：每条路径做什么（DESIGN.md「接口」）。不开端口、不读环境变量、不取「现在」：这些在 src/server.js，它把 HTTP 请求转成 handle() 调用。
// 模拟学习者（src/simulation.js）也经 handle() 打牌：和用户走同一条路径、同一份逻辑，只是「现在」换成模拟的时钟。
import { HandError, deal, handKey, rngFrom, startHand } from './hand.js';
import { benchmarkHands, homeStats, nextDeal } from './practice.js';
import { RATING_NAMES, ROLES, cardStates, dueCodes, grade, nextQuestion, rate, review } from './quiz.js';
import { HINT_BUDGET_MS, SEARCH_BUDGET_MS, searchHand } from './search.js';
import { openSearchCache } from './search-cache.js';

// deck：卡组数据；store：src/store.js 的 openStore；engine：() => Promise<引擎>；now：() => 毫秒（「现在」）；
// searchMs：一手的后台搜索上限（0 = 不搜索）；hintBudgetMs：提示里再搜的上限；searchNow：搜索计时用的时钟（不给就是 now）
export function openService({ deck, store, engine, now, searchMs = SEARCH_BUDGET_MS, hintBudgetMs = HINT_BUDGET_MS, searchNow = now, onSearchError }) {
  const benchmarks = benchmarkHands(deck); // 隐藏基准手：固定的一组，不进练习池
  const benchmarkKeys = new Set(benchmarks.map((b) => handKey(b.hand)));

  // 后台搜索和它的缓存（怎么管见 src/search-cache.js）。提示要用 CPU 的时候，后台搜索停着等它（等的时间不计进时间上限）
  let hinting = 0;
  const searchCache = openSearchCache({
    store, deck, now: searchNow, budgetMs: searchMs, isPaused: () => hinting > 0, ...(onSearchError ? { onError: onSearchError } : {}),
    search: async (hand, seed, options) => searchHand(await engine(), deck, { hand, seed, ...options }),
  });

  let active = null; // 进行中的一手（同一时间只有一手）
  let handCount = 0;
  let quiz = null; // 记卡：现在在答的这一题（{ question, answer, code, shownAt }），同一时间一题；答完或换新题就清掉

  // 把一手没打完就作废的情况记进日志：服务重启时留在 active.json 里的、或者被新开的一手顶掉的
  const voidHand = (info, reason) => { store.appendHand({ type: 'void', ...info, reason }); store.clearActive(); };
  const stale = store.readActive();
  if (stale) voidHand(stale, '服务重启，进行中的一手作废');

  const needActive = () => { if (!active) throw new HandError('没有进行中的一手', 404); return active; };

  // 一个请求：method、pathname、query（URLSearchParams）、readBody（() => Promise<请求体对象>，只有要读的路径才调）。返回 [状态码, 应答]；
  // 请求不合法、状态不允许是 HandError（带状态码），由调用方转成 { error }
  async function route(method, pathname, query, readBody) {
    const key = `${method} ${pathname}`;
    const at = now();
    switch (key) {
      case 'GET /health': return [200, { ok: true }];
      // 开始一手：seed（0 到 2^32-1 的整数）可以注入，不给就用现在的时间
      case 'POST /hand/start': {
        const body = await readBody();
        if (body.seed !== undefined && !(Number.isInteger(body.seed) && body.seed >= 0 && body.seed < 2 ** 32)) throw new HandError('seed 要是 0 到 2^32-1 的整数');
        if (active) { active.close(); voidHand(active.info, '开了新的一手，这一手作废'); active = null; }
        // 不给种子：该发基准手就发基准手（每 5 手一次），否则按弱点发练习手；给了种子（重打、测试）就照它发，发出来的起手是基准手的牌就仍算基准手（重打基准手不能用提示、不进练习统计）
        const history = store.readHands();
        const { seed, benchmark } = body.seed === undefined ? nextDeal(deck, history, { seed: at % 2 ** 32, benchmarks }) : { seed: body.seed, benchmark: benchmarkKeys.has(handKey(deal(deck, body.seed).hand)) };
        const number = history.filter((r) => r.type === 'hand').length + 1; // 第几手：日志里结算过的手数 + 1
        active = await startHand(await engine(), deck, { id: `${at}-${++handCount}`, seed, now: at, number, benchmark });
        store.setActive(active.info);
        searchCache.ensure(active.info.hand, seed);
        return [200, active.view(at)];
      }
      // 首页：每一手的散点、个人最好、各类起手的平均、最值得练的类型、基准手的进步曲线（基准手只出现在曲线里）
      case 'GET /home': return [200, homeStats(deck, store.readHands())];
      case 'GET /hand': return [200, needActive().view(at)];
      case 'POST /hand/choose': {
        const hand = needActive();
        const { indices } = await readBody();
        hand.submit(indices, at);
        return [200, hand.view(at)];
      }
      case 'POST /hand/hint': {
        const hand = needActive();
        hinting++;
        let result;
        try { result = await hand.hint({ searched: searchCache.state(hand.info.hand), now: searchNow, budgetMs: hintBudgetMs }); } finally { hinting--; }
        if (active !== hand) throw new HandError('这一手已经换了', 409);
        return [200, result];
      }
      case 'POST /hand/end': {
        const hand = needActive();
        const { settlement, record } = await hand.end(at, store.readHands(), searchCache.state(hand.info.hand));
        // 缓存的路线在这手的种子下重放不了：这次结算先不用它，再用这手的种子搜一遍，覆盖缓存
        if (settlement.benchmark.search === 'replay-failed') searchCache.ensure(hand.info.hand, hand.info.seed, { force: true });
        store.appendHand(record);
        store.clearActive();
        active = null;
        return [200, settlement];
      }
      // 卡组里每张卡的卡名（Master Duel 简中）、角色和三件事：页面点卡时显示。不含卡图
      case 'GET /cards': return [200, { cards: Object.fromEntries(Object.entries(deck.cards).map(([code, c]) => [code, { md: c.md, role: c.role, does: c.does, cost: c.cost, limit: c.limit }])) }];
      // 卡图：JSON 里放 base64，插件后端原样转发、页面拼成 data: 地址（ctx.rest 只会读 JSON）。没有这张图是 404，页面改写卡名
      case 'GET /card-image': {
        const bytes = store.readImage(query.get('code'));
        if (!bytes) return [404, { error: '没有这张卡图（先跑 scripts/sync-card-images.js）' }];
        return [200, { code: Number(query.get('code')), type: 'image/webp', base64: bytes.toString('base64') }];
      }
      // 记卡：到期的张数（有记录以来答过的卡到期了的 + 没答过的），没有每日题量
      case 'GET /quiz': {
        const { reviewing, fresh } = dueCodes(deck, cardStates(store.readQuiz()), new Date(at), rngFrom(0));
        return [200, { due: reviewing.length + fresh.length, reviewing: reviewing.length, fresh: fresh.length }];
      }
      // 出下一题：计时从这一刻起；没有到期的卡时 { done: true }。再调一次就换一题（上一题作废、不记录）
      case 'POST /quiz/next': {
        const next = nextQuestion(deck, store.readQuiz(), new Date(at), at % 2 ** 32);
        if (!next) { quiz = null; return [200, { done: true, due: 0 }]; }
        quiz = { ...next, shownAt: at };
        return [200, { done: false, due: next.due, fresh: next.fresh, lastMs: next.lastMs, history: next.history, ...next.question }];
      }
      // 答题：{ option: 选项下标, roles: [角色] }，用时由服务从出题算起；记一行日志（带新的 FSRS 状态），返回对错、正确答案、这张卡的三件事、下次到期
      case 'POST /quiz/answer': {
        if (!quiz) throw new HandError('没有在答的题（先 POST /quiz/next）', 404);
        const { option, roles = [] } = await readBody();
        if (!Number.isInteger(option) || option < 0 || option >= quiz.question.options.length) throw new HandError('option 要是选项的下标');
        if (!Array.isArray(roles) || roles.some((r) => !ROLES.includes(r))) throw new HandError(`roles 只能是 ${ROLES.join('、')}`);
        const ms = at - quiz.shownAt;
        const { correct } = grade(quiz.answer, { option, roles });
        const rating = rate(correct, ms);
        const prior = cardStates(store.readQuiz()).get(quiz.code) ?? null;
        const card = review(prior, rating, new Date(at));
        store.appendQuiz({ type: 'answer', at, code: quiz.code, kind: quiz.question.kind, correct, ms, rating: RATING_NAMES[rating], picked: { option, roles }, card });
        const c = deck.cards[quiz.code];
        const result = { correct, ms, rating: RATING_NAMES[rating], dueInMs: new Date(card.due) - at, answerIndex: quiz.answer.index, answerRoles: quiz.answer.roles, card: { code: quiz.code, md: c.md, role: c.role, does: c.does, cost: c.cost, limit: c.limit } };
        quiz = null;
        return [200, result];
      }
      default: return [404, { error: '没有这个接口' }];
    }
  }

  // HandError 转成 [状态码, { error }]；别的异常照抛（server.js 记日志回 500）
  async function handle(method, pathname, { query = new URLSearchParams(), readBody = async () => ({}) } = {}) {
    try {
      return await route(method, pathname, query, readBody);
    } catch (e) {
      if (e instanceof HandError) return [e.status, { error: e.message }];
      throw e;
    }
  }

  return { handle, benchmarks };
}

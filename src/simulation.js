// 模拟实验的一个学习者跑 N 天（规格 #1「效果验证 ①」，做法见 DESIGN.md「效果验证」）：每天按练法记卡 / 看路线 / 打练习手，天末用基准手考一次。
// 打牌、记卡都经服务的 handle()（和 HTTP 接口同一份逻辑）；服务、数据目录、「现在」（模拟的时钟）由调用方给。纯逻辑，不读文件、不取真实时间。
import { handKey, rngFrom } from './hand.js';
import { nextDeal } from './practice.js';
import { DAY_MS, MAX_CHOICES, answerQuiz, createLearner, decide, knownCount, learnFromHint, learnFromQuiz, learnFromReview, learnFromScore, stepItems, study, wantsHint } from './sim-learner.js';

// 练法：完整系统和两种对照，以及完整系统各去掉一个功能
const FULL = { quiz: true, weakDealing: true, review: true, hints: true, study: false };
export const REGIMENS = {
  full: { name: '完整系统', ...FULL },
  random: { name: '只随机打只给分', quiz: false, weakDealing: false, review: false, hints: false, study: false },
  game8: { name: '先看 Game8 路线再打', quiz: false, weakDealing: false, review: false, hints: false, study: true },
  'no-quiz': { name: '去掉记卡', ...FULL, quiz: false },
  'no-weak': { name: '去掉按弱点发牌', ...FULL, weakDealing: false },
  'no-review': { name: '去掉复盘', ...FULL, review: false },
};

export const SIM_START = Date.UTC(2026, 11, 1, 0, 0); // 第 0 天 09:00（日本时间）；第 d 天的练习从 SIM_START + d 天开始
export const QUIZ_MS = 5 * 60000; // 记卡每天最多这么久（先记卡再打牌）
export const STUDY_MS = 5 * 60000; // 看 Game8 路线每天这么久（先看再打牌）
export const STUDY_STEP_MS = 15000; // 看路线上的一步要这么久
export const REVIEW_MS = 40000; // 看一次结算复盘（逐步对照）
export const SCORE_LOOK_MS = 5000; // 只看分数
export const HINT_READ_MS = 3000; // 看一次提示
export const QUIZ_FEEDBACK_MS = 3000; // 看一题的批改
export const EXAM_HOUR_MS = 22 * 3600000; // 天末考试的时刻（当天 0 点起）

const call = (service) => async (method, path, body) => {
  const [status, value] = await service.handle(method, path, { readBody: async () => body ?? {} });
  if (status !== 200) throw new Error(`${method} ${path} → ${status} ${value.error}`);
  return value;
};
const callMaybe = (service) => (method, path, body) => service.handle(method, path, { readBody: async () => body ?? {} });

// 打一手：从开局走到结算。learner 照自己的模型选，hints 为 true 时卡住了会要提示（基准手服务回 409，不算）。返回 { settlement, keys, hints, abandoned }；
// abandoned：遇到服务还不支持的提示，这一手没法结算（settlement 是 null）
async function playHand(service, learner, deck, clock, { seed, hints: canHint }) {
  const api = call(service);
  let view = await api('POST', '/hand/start', { seed });
  const keys = [];
  let hints = 0;
  for (let n = 0; view.status === 'playing' && view.prompt; n++) {
    if (n > MAX_CHOICES + 200) throw new Error(`种子 ${seed}：选了 ${n} 次回合还没结束`);
    const prompt = view.prompt;
    // 服务还不支持的引擎提示：用户在这里既选不了也结束不了回合，只能开下一手（服务把这一手记成作废）。模拟照做，这一手不结算
    if (prompt.kind === 'unsupported') return { settlement: null, keys, hints, abandoned: true };
    const endTurn = prompt.kind === 'idle' && n >= MAX_CHOICES ? prompt.options.findIndex((o) => o.action === 'end-turn') : -1;
    let d = endTurn >= 0 ? { indices: [endTurn], ms: 1000, keys: [], stuck: false } : decide(learner, deck, prompt, clock.t);
    if (canHint && wantsHint(learner, d, hints)) {
      const [status, hint] = await callMaybe(service)('POST', '/hand/hint');
      if (status === 200) {
        hints++;
        clock.t += HINT_READ_MS;
        learnFromHint(learner, deck, prompt, hint.indices, clock.t);
        d = { ...d, indices: hint.indices, keys: [] };
      }
    }
    clock.t += d.ms;
    keys.push(...d.keys);
    view = await api('POST', '/hand/choose', { indices: d.indices });
  }
  const settlement = await api('POST', '/hand/end');
  return { settlement, keys, hints, abandoned: false };
}

// 天末考试：每手基准手打一次（另一个服务、另一份数据目录，不进练习日志），学习者照常做决定但什么都不学。
// 返回 { totals, abandoned }：每手的总分；没法结算的一手（遇到服务不支持的提示）记 0 分，abandoned 是这种手的数目
async function exam(service, learner, deck, clock, benchmarks, rng) {
  const frozen = { ...learner, rng, params: { ...learner.params, exposeP: 0 } };
  const totals = [];
  let abandoned = 0;
  for (const b of benchmarks) {
    const played = await playHand(service, frozen, deck, clock, { seed: b.seed, hints: false });
    if (played.abandoned) abandoned++;
    totals.push(played.abandoned ? 0 : played.settlement.total);
  }
  return { totals, abandoned };
}

const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;

// 跑一个学习者。open(now) 返回 { practice: { service, store }, exam: { service } }：两份服务都用 now 当「现在」。
// profile / params：src/sim-learner.js 的画像和参数；regimen：REGIMENS 的一项；seed：这个学习者的种子（同一个种子同一个结果）；
// pool：练习手从这组种子里抽（预先搜好最好路线的）；game8Steps：Game8 路线每一步的文字（看路线的练法用）；examDays：哪几天考（0 = 练之前）
export async function runLearner({ deck, open, profile, params, regimen, seed, days, examDays, pool, game8Steps = [] }) {
  const clock = { t: SIM_START };
  const { practice, exam: examSide } = open(() => clock.t);
  const rng = rngFrom(seed);
  const learner = createLearner(profile, params, rng);
  const api = call(practice.service);
  const benchmarks = practice.service.benchmarks;
  const benchmarkKeys = new Set(benchmarks.map((b) => handKey(b.hand)));
  const out = { exams: [], hands: 0, abandoned: 0, benchmarkHands: 0, hints: 0, reviews: 0, answers: 0, studied: 0 };
  let cursor = 0; // 看路线看到哪一步了（第二天接着看）
  const examAt = async (day) => {
    clock.t = SIM_START + day * DAY_MS + EXAM_HOUR_MS;
    const { totals, abandoned } = await exam(examSide.service, learner, deck, clock, benchmarks, rngFrom((seed ^ Math.imul(day + 1, 0x9E3779B1)) >>> 0));
    out.exams.push({ day, mean: mean(totals), totals, abandoned });
  };
  if (examDays.includes(0)) await examAt(0);
  for (let day = 1; day <= days; day++) {
    clock.t = SIM_START + day * DAY_MS;
    const dayEnd = clock.t + params.dailyMs;
    if (regimen.quiz) {
      const until = Math.min(clock.t + QUIZ_MS, dayEnd);
      while (clock.t < until) {
        const q = await api('POST', '/quiz/next');
        if (q.done) break;
        const a = answerQuiz(learner, deck, q, clock.t);
        clock.t += a.ms;
        const r = await api('POST', '/quiz/answer', { option: a.option, roles: a.roles });
        learnFromQuiz(learner, a.code, r.rating, clock.t);
        clock.t += QUIZ_FEEDBACK_MS;
        out.answers++;
      }
    }
    if (regimen.study && game8Steps.length) {
      const until = Math.min(clock.t + STUDY_MS, dayEnd);
      while (clock.t < until) {
        clock.t += STUDY_STEP_MS;
        study(learner, stepItems(game8Steps[cursor++ % game8Steps.length]), clock.t);
        out.studied++;
      }
    }
    while (clock.t < dayEnd) {
      const dealt = nextDeal(deck, practice.store.readHands(), { seed: Math.floor(rng() * 2 ** 32), benchmarks, weakDealing: regimen.weakDealing, candidateSeed: (r) => pool[Math.floor(r() * pool.length)] });
      const { settlement, keys, hints, abandoned } = await playHand(practice.service, learner, deck, clock, { seed: dealt.seed, hints: regimen.hints });
      out.hints += hints;
      if (abandoned) { out.abandoned++; continue; } // 作废的一手不占基准手的位置，也没有结算可看
      out.hands++;
      if (dealt.benchmark || benchmarkKeys.has(handKey(settlement.hand))) out.benchmarkHands++;
      clock.t += regimen.review ? REVIEW_MS : SCORE_LOOK_MS;
      if (regimen.review && learnFromReview(learner, settlement, clock.t)) out.reviews++;
      learnFromScore(learner, settlement.total, keys, clock.t);
    }
    if (examDays.includes(day)) await examAt(day);
  }
  out.known = knownCount(learner);
  return out;
}

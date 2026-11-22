// 模拟学习者：一个按学习模型做决定的假玩家（规格 #1「效果验证 ①」，做法和参数见 DESIGN.md「效果验证」和 docs/simulation-report.md）。
// 状态 = 每张卡的「认识度」+ 每个决定点「会不会」，都是一张 FSRS 卡（ts-fsrs 默认参数），按天遗忘；
// 打牌时只看服务给的提示和合法选项（GET /hand 的 prompt），会的大概率选对，不会的乱选或贪心；学习只来自系统里真实发生的事件（复盘、提示、记卡、看路线、看分数）。
// 纯逻辑：「现在」（毫秒）、随机源、卡组都由调用方传进来；不碰服务，服务由 src/simulation.js 驱动。
import { Rating, createEmptyCard, fsrs } from 'ts-fsrs';
import { labelFor } from './route.js';

// 三种画像。thinkMs：一个决定的基本用时；greedy：不会的时候按贪心选（否则乱选）的概率；memoryScale：遗忘速度的倍数（2 = 同样的间隔，忘得像过了两倍时间）
export const PROFILES = {
  novice: { name: '完全新手', thinkMs: 9000, greedy: 0, memoryScale: 1 },
  player: { name: '会打但不熟烙印', thinkMs: 5000, greedy: 0.8, memoryScale: 1 },
  forgetful: { name: '记性差', thinkMs: 7000, greedy: 0.5, memoryScale: 2.5 },
};

// 学习模型的主要参数（敏感性实验每个 ±50%）
export const PARAMS = {
  learnP: 0.6, // 复盘看到走偏那步、用提示、看 Game8 路线时，把其中一个决定点记住的概率
  selfP: 0.2, // 只看分数时：总分 ≥ selfScore 的那手，把自己做过的每个决定点记住的概率
  exposeP: 0.2, // 打牌时选了一张卡，顺便记住这张卡（认识度 +1 次 Hard 复习）的概率
  slip: 0.1, // 想起了会的那步，却没照做的概率
  cardFloor: 0.5, // 完全不认识这张卡时，想起的决定点还能用上的比例：能用上 = 决定点的记忆 × (cardFloor + (1 − cardFloor) × 卡的认识度)
  memoryScale: 1, // 全体的遗忘速度倍数（和画像的相乘）
  dailyMs: 20 * 60000, // 每天练多久（毫秒，含记卡、看路线、看复盘）
};
// 不在敏感性里调的设置
export const SELF_SCORE = 80; // 「这手打得好」：总分到这个数，只看分数的学习者才回想自己这手的做法
export const HINT_P = 0.25; // 卡住（主阶段一个会的都想不起来）时要提示的概率；一手最多一次
export const QUIZ_THINK_MS = 6000; // 记卡一题的基本用时
export const MECHANICAL_MS = 1500; // 选格子、表示形式、是否发动这类机械确认的用时
export const KNOWN_SPEEDUP = 0.6; // 照会的那步走时，用时乘这个
export const MAX_CHOICES = 150; // 一手最多做这么多个选择，之后能结束回合就结束

const scheduler = fsrs(); // 默认参数，不开 fuzz
const DAY_MS = 86400000;
const ROLE_VALUE = { 终端: 3, 打断: 3, 起手: 2, 延伸: 2, 回收: 1, 手坑: 0 };
const IDLE_PRIORITY = { activate: 4, 'special-summon': 4, summon: 3, 'end-turn': 0.5, 'spell-set': 0.3, 'monster-set': 0.3, 'position-change': 0 };

// 一个学习者：profile 是 PROFILES 的一项，params 是 PARAMS（可以改几项），rng 是 () => [0,1)
export function createLearner(profile, params, rng) {
  return { profile, params, rng, cards: new Map(), decisions: new Map() };
}

// 一份记忆（FSRS 卡）此刻想得起来的概率：没学过是 0。遗忘速度按画像和参数放大经过的时间
function recallOf(learner, memory, now) {
  if (!memory) return 0;
  const scale = learner.profile.memoryScale * learner.params.memoryScale;
  const last = memory.last_review ? memory.last_review.getTime() : now;
  return scheduler.retrievability(memory, new Date(last + Math.max(0, now - last) * scale), false);
}
const remember = (map, key, now, rating) => {
  const memory = map.get(key) ?? createEmptyCard(new Date(now));
  map.set(key, scheduler.next(memory, new Date(now), rating).card);
};

export const familiarity = (learner, code, now) => recallOf(learner, learner.cards.get(code), now);
export const knows = (learner, key, now) => recallOf(learner, learner.decisions.get(key), now);
export const knownCount = (learner) => learner.decisions.size;

// 决定点的写法：「这一步由谁发起|选了什么」。主阶段和连锁里发起一步的选择没有前缀（`|发动 X`）；这一步里的选卡带上发起的那个（`发动 X|选 Y`）。
// 和页面、结算复盘、提示上的文字同一套（labelFor、summarizeLabels），所以学习者看到的文字就能对上选项
const contextOf = (prompt) => (prompt.source ? `${prompt.source.action} ${prompt.source.md}` : '');
const optionKey = (deck, prompt, i) => {
  if (prompt.kind === 'idle' || prompt.kind === 'chain') return `|${labelFor(deck, prompt, [i])}`;
  const o = prompt.options[i];
  if ((prompt.kind === 'cards' || prompt.kind === 'pick-one') && o.code !== undefined && o.action !== 'finish') return `${contextOf(prompt)}|选 ${o.md}`;
  return null;
};

// 结算复盘、Game8 路线上的一步（summarizeLabels 的格式：「发动 X · 选 A、B」或「… 选 A、B、C 等 5 张」）→ 这一步里的决定点
export function stepItems(summary) {
  const [head, picks] = summary.split(' · 选 ');
  const names = picks ? picks.replace(/ 等 \d+ 张$/, '').split('、') : [];
  return [`|${head}`, ...names.map((n) => `${head}|选 ${n}`)];
}

// 照概率 p 把这些决定点记住（Good 一次）
export function study(learner, items, now, p = learner.params.learnP) {
  for (const key of items) if (learner.rng() < p) remember(learner.decisions, key, now, Rating.Good);
}

// 一个选项此刻有多「值」：认识这张卡才知道它的角色和打断数，不认识就是瞎猜
function perceived(learner, deck, o, now) {
  const card = o.code === undefined ? null : deck.cards[o.code];
  if (!card || learner.rng() >= familiarity(learner, o.code, now)) return learner.rng() * 3;
  return ROLE_VALUE[card.role] + 2 * card.interrupts;
}

const pickRandom = (rng, list) => list[Math.floor(rng() * list.length)];
const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

// 不会的时候怎么选：乱选（完全新手），或按贪心（会打的人：主阶段先发动、特召、召唤，选卡先选认识的、值高的）
function fallback(learner, deck, prompt, now, greedy) {
  const { options, kind } = prompt;
  const all = options.map((_, i) => i).filter((i) => options[i].action !== 'unselect' && options[i].action !== 'to-battle');
  const usable = all.length ? all : [0];
  if (kind === 'cards') {
    const cards = usable.filter((i) => options[i].code !== undefined);
    const n = Math.min(prompt.max, Math.max(prompt.min, 1), cards.length);
    const order = greedy ? [...cards].map((i) => [i, perceived(learner, deck, options[i], now)]).sort((a, b) => b[1] - a[1]).map(([i]) => i) : shuffle(learner.rng, cards);
    return order.slice(0, Math.max(n, prompt.min));
  }
  if (!greedy) return [pickRandom(learner.rng, usable)];
  if (kind === 'idle') return [best(usable, (i) => (IDLE_PRIORITY[options[i].action] ?? 0) + 0.1 * perceived(learner, deck, options[i], now))];
  if (kind === 'chain') return [usable.find((i) => options[i].action === 'chain') ?? usable[0]];
  if (kind === 'yes-no') return [Math.max(0, options.findIndex((o) => o.action === 'yes'))];
  if (kind === 'pick-one') {
    const cards = usable.filter((i) => options[i].code !== undefined && options[i].action !== 'finish');
    return [cards.length ? best(cards, (i) => perceived(learner, deck, options[i], now)) : usable[0]];
  }
  return [usable[0]];
}
const best = (list, value) => list.map((i) => [i, value(i)]).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
function shuffle(rng, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 对一个提示做决定：返回 { indices, ms, known, stuck, keys }。known：照会的决定点走的；stuck：主阶段一个会的都没想起来（可以要提示）；keys：这次选择对应的决定点（看分数学习时回想）
export function decide(learner, deck, prompt, now) {
  const { rng, params, profile } = learner;
  const { options, kind } = prompt;
  const recalled = [];
  options.forEach((o, i) => {
    const key = optionKey(deck, prompt, i);
    if (!key || !learner.decisions.has(key)) return;
    const card = o.code === undefined ? 1 : params.cardFloor + (1 - params.cardFloor) * familiarity(learner, o.code, now);
    const r = knows(learner, key, now);
    if (rng() < r * card) recalled.push([i, r]);
  });
  let indices;
  const known = recalled.length > 0 && rng() >= params.slip;
  if (known) {
    recalled.sort((a, b) => b[1] - a[1]);
    if (kind === 'cards') {
      const mine = [...new Set(recalled.map(([i]) => i))].slice(0, prompt.max);
      const rest = fallback(learner, deck, prompt, now, true).filter((i) => !mine.includes(i));
      indices = [...mine, ...rest].slice(0, Math.max(prompt.min, mine.length));
    } else indices = [recalled[0][0]];
  } else indices = fallback(learner, deck, prompt, now, rng() < profile.greedy);
  // 用时：认识选项里的卡越少越慢，照会的走更快；机械确认固定
  const codes = [...new Set(options.map((o) => o.code).filter((c) => c !== undefined))];
  const fam = codes.length ? codes.reduce((s, c) => s + familiarity(learner, c, now), 0) / codes.length : 1;
  const mechanical = !codes.length || kind === 'place' || kind === 'position';
  const ms = Math.round((mechanical ? MECHANICAL_MS : profile.thinkMs * (2 - fam) * (known ? KNOWN_SPEEDUP : 1)) * Math.exp(0.3 * gauss(rng)));
  for (const i of indices) {
    const code = options[i]?.code;
    if (code !== undefined && rng() < params.exposeP) remember(learner.cards, code, now, Rating.Hard);
  }
  return { indices, ms, known, stuck: kind === 'idle' && !known, keys: indices.map((i) => optionKey(deck, prompt, i)).filter(Boolean) };
}

// 要不要提示：卡住了、这一手还没要过、按 HINT_P
export const wantsHint = (learner, decision, hintsSoFar) => decision.stuck && hintsSoFar === 0 && learner.rng() < HINT_P;

// 照提示学：提示给的选项（indices）对应的决定点按 learnP 记住
export function learnFromHint(learner, deck, prompt, indices, now) {
  study(learner, indices.map((i) => optionKey(deck, prompt, i)).filter(Boolean), now);
}

// 结算复盘：看「逐步对照」里自己走偏的那一步（结算的 divergeStep；自己一直没走偏、只是停得早，就是最好路线的下一步），把最好路线那一步的决定点按 learnP 记住。
// 场面分 100 就不用看；没有最好路线（基准只有个人最好）看不了。返回学到的那一步的文字或 null
export function learnFromReview(learner, settlement, now) {
  if (settlement.fieldScore >= 100 || !settlement.bestSteps) return null;
  const step = settlement.divergeStep ?? (settlement.steps.length < settlement.bestSteps.length ? settlement.steps.length + 1 : null);
  const best = step && settlement.bestSteps[step - 1];
  if (!best) return null;
  study(learner, stepItems(best.summary), now);
  return best.summary;
}

// 只看分数：总分 ≥ SELF_SCORE 的那手，回想自己做过的决定点，每个按 selfP 记住
export function learnFromScore(learner, total, keys, now) {
  if (total < SELF_SCORE) return;
  study(learner, [...new Set(keys)], now, learner.params.selfP);
}

// 记卡答一题：question 是 POST /quiz/next 的题面，deck 用来知道题问的是哪张卡和正确答案（学习者认识这张卡就答得对）。
// 返回 { option, roles, ms, code }：认识度决定答对的概率和用时；想不起来就在选项里乱猜
export function answerQuiz(learner, deck, question, now) {
  const { rng, profile } = learner;
  const code = question.image ?? Number(Object.entries(deck.cards).find(([, c]) => question.prompt === `哪张卡：${c.does}`)?.[0]);
  const card = deck.cards[code];
  const right = question.kind === 'fill' ? card[{ 干什么: 'does', 条件代价: 'cost', 限制: 'limit' }[question.missing]] : card.md;
  const fam = familiarity(learner, code, now);
  const recalled = rng() < fam;
  const option = recalled ? question.options.findIndex((o) => o.text === right) : Math.floor(rng() * question.options.length);
  const roles = question.kind !== 'identify' ? [] : recalled ? [card.role] : [pickRandom(rng, question.roles)];
  const ms = Math.round(QUIZ_THINK_MS * (recalled ? 1.5 - fam : 1.6) * Math.exp(0.3 * gauss(rng)) * (profile.thinkMs / PROFILES.player.thinkMs));
  return { option, roles, ms, code };
}

// 答完看反馈：按服务给的评分（Again / Hard / Good / Easy）复习这张卡的认识度，和服务里那张 FSRS 卡同一个评分
export function learnFromQuiz(learner, code, rating, now) {
  remember(learner.cards, code, now, Rating[rating]);
}

export { DAY_MS };

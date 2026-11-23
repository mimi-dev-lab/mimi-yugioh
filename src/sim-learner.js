// 模拟学习者：一个按学习模型做决定的假玩家（规格 #1「效果验证 ①」，做法和参数见 DESIGN.md「效果验证」和 docs/simulation-report.md）。
// 状态 = 每张卡的「认识度」+ 一组可迁移的知识单位（这张卡该用、该多早用、该拿什么，这类起手先走哪张，资源交换的原则；见下面「知识的单位」），都是一张 FSRS 卡（ts-fsrs 默认参数），按天遗忘；
// 打牌时只看服务给的提示和合法选项（GET /hand 的 prompt），想起学到的单位就照着选，想不起来乱选或贪心；学习只来自系统里真实发生的事件（复盘、提示、记卡、看路线、看分数）。
// 纯逻辑：「现在」（毫秒）、随机源、卡组都由调用方传进来；不碰服务，服务由 src/simulation.js 驱动。
import { Rating, createEmptyCard, fsrs } from 'ts-fsrs';

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
const ROLE_VALUE = { 终端: 3, 打断: 3, 起手: 2, 延伸: 2, 回收: 1, 手坑: 0 };
const IDLE_PRIORITY = { activate: 4, 'special-summon': 4, summon: 3, 'end-turn': 0.5, 'spell-set': 0.3, 'monster-set': 0.3, 'position-change': 0 };

// 一个学习者：profile 是 PROFILES 的一项，params 是 PARAMS（可以改几项），rng 是 () => [0,1)
export function createLearner(profile, params, rng) {
  return { profile, params, rng, cards: new Map(), decisions: new Map(), order: new Map(), picks: new Map() };
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

// 知识的单位（第二版，2026-11-23 看到第一次结果之后改的，见 docs/simulation-report.md「第二版学习模型」）：按卡、按角色、按原则记，换一手没见过的牌同样用得上。
//   use:<卡>            这张卡该用，并且该多早用（记下最好路线里用它的平均步序，越小越先用）
//   pick:<卡>:<目标>    这张卡的效果该检索 / 选哪张（同一张卡学到几个目标时按学到的次数排先后）
//   open:<起手类型>:<卡> 这类起手先从哪张卡开始
//   principle:<原则>    资源交换的原则：keep-handtraps（手坑留在手里，自己回合不召唤不发动）、no-dead-set（不盖放没有打断数的卡）、end-when-done（会的都用完了就结束回合，不乱用）
// 每个单位是一张 FSRS 卡（会忘）；用上它还要认识相关的卡（cardFloor）。复盘、提示、看路线、看分数学的都是这些单位
export const PRINCIPLES = ['keep-handtraps', 'no-dead-set', 'end-when-done'];
const STARTS = { 发动: 'activate', 连锁发动: 'chain', 召唤: 'summon', 特殊召唤: 'special-summon', 盖放: 'set', 结束回合: 'end-turn' };
const SET_ACTIONS = new Set(['spell-set', 'monster-set']);

const nameIndex = new WeakMap();
const codeByName = (deck) => { if (!nameIndex.has(deck)) nameIndex.set(deck, new Map(Object.entries(deck.cards).map(([c, v]) => [v.md, Number(c)]))); return nameIndex.get(deck); };
// 一步的文字（summarizeLabels 的格式：「发动 X · 选 A、B」「… 选 A、B、C 等 5 张」「结束回合」）→ { action, code, picks }
export function parseStep(deck, summary) {
  const [head, picks] = summary.split(' · 选 ');
  const sp = head.indexOf(' ');
  const verb = sp < 0 ? head : head.slice(0, sp);
  const names = picks ? picks.replace(/ 等 \d+ 张$/, '').split('、') : [];
  const byName = codeByName(deck);
  return { action: STARTS[verb] ?? null, code: sp < 0 ? undefined : byName.get(head.slice(sp + 1)), picks: names.map((n) => byName.get(n)).filter((c) => c !== undefined) };
}

// 一步（最好路线、Game8 路线、提示、自己的一步）→ 这一步里的知识单位。index 是这一步在一手里的步序（从 1 数），handType 是这手的起手类型
export function stepUnits(deck, summary, index, handType) {
  const { action, code, picks } = parseStep(deck, summary);
  if (action === 'end-turn') return [{ key: 'principle:end-when-done' }];
  if (code === undefined || action === null) return [];
  const units = action === 'set' ? [] : [{ key: `use:${code}`, code, index }];
  if (handType && action !== 'chain' && action !== 'set' && index <= 2) units.push({ key: `open:${handType}:${code}`, code });
  for (const t of picks) units.push({ key: `pick:${code}:${t}`, code: t, source: code });
  return units;
}

// 照概率 p 学这些单位（各 Good 一次）；use 单位同时记下步序（平均），pick 单位记次数
export function study(learner, units, now, p = learner.params.learnP) {
  for (const u of units) {
    if (learner.rng() >= p) continue;
    remember(learner.decisions, u.key, now, Rating.Good);
    if (u.index !== undefined) { const o = learner.order.get(u.code) ?? { sum: 0, n: 0 }; o.sum += u.index; o.n++; learner.order.set(u.code, o); }
    if (u.source !== undefined) learner.picks.set(u.key, (learner.picks.get(u.key) ?? 0) + 1);
  }
}

// 想不想得起这个单位：记忆 × (cardFloor + (1 − cardFloor) × 相关卡的认识度)，掷一次
const recalls = (learner, key, code, now) => {
  if (!learner.decisions.has(key)) return false;
  const gate = code === undefined ? 1 : learner.params.cardFloor + (1 - learner.params.cardFloor) * familiarity(learner, code, now);
  return learner.rng() < knows(learner, key, now) * gate;
};
const orderOf = (learner, code) => { const o = learner.order.get(code); return o ? o.sum / o.n : Infinity; };
// 认出这张卡是手坑（要认识这张卡）
const seesRole = (learner, deck, code, role, now) => code !== undefined && deck.cards[code]?.role === role && learner.rng() < familiarity(learner, code, now);

// 一个选项此刻有多「值」：认识这张卡才知道它的角色和打断数，不认识就是瞎猜
function perceived(learner, deck, o, now) {
  const card = o.code === undefined ? null : deck.cards[o.code];
  if (!card || learner.rng() >= familiarity(learner, o.code, now)) return learner.rng() * 3;
  return ROLE_VALUE[card.role] + 2 * card.interrupts;
}

const pickRandom = (rng, list) => list[Math.floor(rng() * list.length)];
const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

// 不会的时候怎么选：乱选（完全新手），或按贪心（会打的人：主阶段先发动、特召、召唤，选卡先选认识的、值高的）
// allowed：还能选的选项下标（原则排除掉的不在里面）
function fallback(learner, deck, prompt, now, greedy, allowed) {
  const { options, kind } = prompt;
  const usable = allowed.length ? allowed : [0];
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

const usableOf = (prompt) => {
  const all = prompt.options.map((_, i) => i).filter((i) => prompt.options[i].action !== 'unselect' && prompt.options[i].action !== 'to-battle');
  return all.length ? all : [0];
};
// 一次选择对应的知识单位（看分数、照提示学时用）。ctx：{ step（这一手已经走了几步）、handType }
function choiceUnits(prompt, indices, ctx) {
  const { options, kind } = prompt;
  const o = options[indices[0]];
  if (kind === 'idle' || kind === 'chain') {
    if (o?.code === undefined || SET_ACTIONS.has(o.action) || o.action === 'position-change' || o.action === 'pass') return o?.action === 'end-turn' ? [{ key: 'principle:end-when-done' }] : [];
    const units = [{ key: `use:${o.code}`, code: o.code, index: (ctx.step ?? 0) + 1 }];
    if (kind === 'idle' && ctx.handType && (ctx.step ?? 0) === 0) units.push({ key: `open:${ctx.handType}:${o.code}`, code: o.code });
    return units;
  }
  const src = prompt.source?.code;
  if ((kind === 'cards' || kind === 'pick-one') && src !== undefined) return indices.map((i) => options[i]).filter((x) => x?.code !== undefined && x.action !== 'finish').map((x) => ({ key: `pick:${src}:${x.code}`, code: x.code, source: src }));
  return [];
}

// 对一个提示做决定：返回 { indices, ms, known, stuck, units }。known：照学到的单位走的；stuck：主阶段什么都没想起来（可以要提示）；units：这次选择对应的知识单位。
// ctx：{ step（这一手已经走了几步）、handType（这手的起手类型，学习者看自己的起手就知道） }
// 顺序：① 这一手第一步、想起「这类起手先从哪张开始」→ 用它；② 想起几张卡「该用」→ 用学到的最该先用的那张；选卡时想起「这张卡该拿什么」→ 拿它；
// ③ 都没想起：按想起的原则排除选项（手坑不用、不盖放没打断的卡；「用完就结束」时直接结束回合），剩下的乱选或贪心
export function decide(learner, deck, prompt, now, ctx = {}) {
  const { rng, params, profile } = learner;
  const { options, kind } = prompt;
  const usable = usableOf(prompt);
  const step = ctx.step ?? 0;
  let choice = null;
  if (kind === 'idle' || kind === 'chain') {
    const acting = usable.filter((i) => options[i].code !== undefined && !SET_ACTIONS.has(options[i].action) && options[i].action !== 'position-change' && (kind === 'idle' || options[i].action === 'chain'));
    if (kind === 'idle' && step === 0 && ctx.handType) {
      const opener = acting.find((i) => recalls(learner, `open:${ctx.handType}:${options[i].code}`, options[i].code, now));
      if (opener !== undefined) choice = [opener];
    }
    if (!choice) {
      const known = acting.filter((i) => recalls(learner, `use:${options[i].code}`, options[i].code, now));
      if (known.length) choice = [best(known, (i) => -orderOf(learner, options[i].code))];
    }
  } else if ((kind === 'cards' || kind === 'pick-one') && prompt.source?.code !== undefined) {
    const src = prompt.source.code;
    const known = usable.filter((i) => options[i].code !== undefined && options[i].action !== 'finish' && recalls(learner, `pick:${src}:${options[i].code}`, options[i].code, now));
    const sorted = [...known].sort((a, b) => (learner.picks.get(`pick:${src}:${options[b].code}`) ?? 0) - (learner.picks.get(`pick:${src}:${options[a].code}`) ?? 0));
    if (sorted.length && kind === 'pick-one') choice = [sorted[0]];
    if (sorted.length && kind === 'cards') {
      const mine = sorted.slice(0, prompt.max);
      const rest = fallback(learner, deck, prompt, now, true, usable).filter((i) => !mine.includes(i));
      choice = [...mine, ...rest].slice(0, Math.max(prompt.min, mine.length));
    }
  }
  const known = choice !== null && rng() >= params.slip;
  let indices = known ? choice : null;
  if (!indices) {
    let allowed = usable;
    if (kind === 'idle' || kind === 'chain') {
      const principle = (id) => recalls(learner, `principle:${id}`, undefined, now);
      if (principle('keep-handtraps')) allowed = allowed.filter((i) => options[i].action === 'pass' || !seesRole(learner, deck, options[i].code, '手坑', now));
      if (principle('no-dead-set')) allowed = allowed.filter((i) => !(SET_ACTIONS.has(options[i].action) && (deck.cards[options[i].code]?.interrupts ?? 0) === 0));
      const end = allowed.find((i) => options[i].action === 'end-turn');
      if (kind === 'idle' && step >= 1 && end !== undefined && principle('end-when-done')) indices = [end];
    }
    indices ??= fallback(learner, deck, prompt, now, rng() < profile.greedy, allowed);
  }
  // 用时：认识选项里的卡越少越慢，照学到的走更快；机械确认固定
  const codes = [...new Set(options.map((o) => o.code).filter((c) => c !== undefined))];
  const fam = codes.length ? codes.reduce((s, c) => s + familiarity(learner, c, now), 0) / codes.length : 1;
  const mechanical = !codes.length || kind === 'place' || kind === 'position';
  const ms = Math.round((mechanical ? MECHANICAL_MS : profile.thinkMs * (2 - fam) * (known ? KNOWN_SPEEDUP : 1)) * Math.exp(0.3 * gauss(rng)));
  for (const i of indices) {
    const code = options[i]?.code;
    if (code !== undefined && rng() < params.exposeP) remember(learner.cards, code, now, Rating.Hard);
  }
  return { indices, ms, known, stuck: kind === 'idle' && !known, units: choiceUnits(prompt, indices, ctx) };
}

// 要不要提示：卡住了、这一手还没要过、按 HINT_P
export const wantsHint = (learner, decision, hintsSoFar) => decision.stuck && hintsSoFar === 0 && learner.rng() < HINT_P;

// 照提示学：提示给的选项（indices）对应的知识单位按 learnP 学
export function learnFromHint(learner, prompt, indices, now, ctx = {}) {
  study(learner, choiceUnits(prompt, indices, ctx), now);
}

// 结算复盘：看「逐步对照」里自己走偏的那一步（结算的 divergeStep；自己一直没走偏、只是停得早，就是最好路线的下一步）。
// 学最好路线那一步的单位（这张卡该用、该在第几步用、该拿什么；第一二步还学「这类起手先从它开始」；最好路线在这里结束回合就学「用完就结束」），
// 再看自己那一步错在哪：用了手坑（认得出是手坑时）就学「手坑留在手里」，盖放了没打断的卡就学「不盖放没打断的卡」。各按 learnP。
// 场面分 100 就不用看；没有最好路线（基准只有个人最好）看不了。返回学到的那一步的文字或 null
export function learnFromReview(learner, deck, settlement, now) {
  if (settlement.fieldScore >= 100 || !settlement.bestSteps) return null;
  const step = settlement.divergeStep ?? (settlement.steps.length < settlement.bestSteps.length ? settlement.steps.length + 1 : null);
  const best = step && settlement.bestSteps[step - 1];
  if (!best) return null;
  const units = stepUnits(deck, best.summary, step, settlement.handTypeStats?.type);
  const mine = settlement.steps[step - 1] && parseStep(deck, settlement.steps[step - 1].summary);
  if (mine && ['activate', 'chain', 'summon', 'special-summon'].includes(mine.action) && seesRole(learner, deck, mine.code, '手坑', now)) units.push({ key: 'principle:keep-handtraps' });
  if (mine?.action === 'set' && mine.code !== undefined && (deck.cards[mine.code]?.interrupts ?? 0) === 0) units.push({ key: 'principle:no-dead-set' });
  study(learner, units, now);
  return best.summary;
}

// 只看分数：总分 ≥ SELF_SCORE 的那手，回想自己这手的做法（units：这手每次选择的知识单位），每个按 selfP 学
export function learnFromScore(learner, total, units, now) {
  if (total < SELF_SCORE) return;
  const seen = new Set();
  study(learner, units.filter((u) => !seen.has(u.key) && seen.add(u.key)), now, learner.params.selfP);
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


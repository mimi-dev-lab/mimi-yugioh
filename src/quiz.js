// 记卡：出题、评分换算、间隔复习（ts-fsrs，默认参数）。规则写在 DESIGN.md「记卡」一节，常量和那里同名。
// 纯逻辑：卡组、已有的答题记录、「现在」（Date）、随机源都由调用方传进来（见 AGENTS.md「边界」）。
import { Rating, createEmptyCard, fsrs } from 'ts-fsrs';
import { rngFrom } from './hand.js';

export const ROLES = ['起手', '延伸', '终端', '打断', '手坑', '回收'];
export const FACTS = [['does', '干什么'], ['cost', '条件代价'], ['limit', '限制']];
export const KINDS = ['identify', 'fill', 'find'];
export const OPTION_COUNT = 4;
export const EASY_MS = 5000; // 对且这么快（含）= Easy：间隔加长
export const HARD_MS = 10000; // 对但超过这个 = Hard；两者之间是 Good
export const RATING_NAMES = { [Rating.Again]: 'Again', [Rating.Hard]: 'Hard', [Rating.Good]: 'Good', [Rating.Easy]: 'Easy' };
const HISTORY_SIZE = 8;

const scheduler = fsrs(); // 默认参数；不开 fuzz，同样的输入同样的到期时间

// 评分换算：错 = Again；对且 ≤ EASY_MS = Easy；对且 ≤ HARD_MS = Good；对但更慢 = Hard
export const rate = (correct, ms) => (!correct ? Rating.Again : ms <= EASY_MS ? Rating.Easy : ms <= HARD_MS ? Rating.Good : Rating.Hard);

// FSRS 卡存在日志里是 JSON（日期成了字符串），用之前还原
const revive = (card) => ({ ...card, due: new Date(card.due), ...(card.last_review ? { last_review: new Date(card.last_review) } : {}) });

// 答一次题：state 是这张卡上次的 FSRS 状态（没答过是 null），返回新的状态（可直接 JSON 化）
export function review(state, rating, now) {
  const card = state ? revive(state) : createEmptyCard(now);
  return scheduler.next(card, now, rating).card;
}

// 答题日志（每行 { type: 'answer', code, ms, correct, card… }）→ 每张卡现在的 FSRS 状态（最后一次答题之后的）
export function cardStates(rows) {
  const states = new Map();
  for (const r of rows) if (r.type === 'answer') states.set(r.code, r.card);
  return states;
}
// 这张卡以往的答题用时（毫秒，旧的在前，最多 HISTORY_SIZE 个）
export const historyOf = (rows, code) => rows.filter((r) => r.type === 'answer' && r.code === code).map((r) => r.ms).slice(-HISTORY_SIZE);

// 到期的卡：答过的卡到期时间 ≤ 现在，按到期早晚排；没答过的卡（新卡）排在后面，顺序由 rng 洗。没有每日题量，到期的都算
export function dueCodes(deck, states, now, rng) {
  const codes = Object.keys(deck.cards).map(Number);
  const reviewing = codes.filter((c) => states.has(c) && new Date(states.get(c).due) <= now)
    .sort((a, b) => new Date(states.get(a).due) - new Date(states.get(b).due) || a - b);
  const fresh = codes.filter((c) => !states.has(c));
  for (let i = fresh.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
  return { reviewing, fresh, due: [...reviewing, ...fresh] };
}

// 从 pool 里不放回地取 n 个：先洗再取
const sample = (pool, n, rng) => {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};
// 把正确项放进干扰项里随机的位置
const shuffleIn = (right, wrong, rng) => { const all = sample([{ ...right, correct: true }, ...wrong.map((w) => ({ ...w, correct: false }))], OPTION_COUNT, rng); return all; };

// 给一张卡出一道题；这套卡组凑不齐互不相同的干扰项时返回 null。返回 { question, answer }：
// question 是发给页面的（选项只有文字，没有对错），answer 留在服务里批改用：{ index（正确项的下标）、roles（identify 要选的角色）、code }
// - identify 看卡图选卡名和角色（都对才算对）；fill 给卡名和三件事里的两件，补第三件；find 给「干什么」，从选项里找出这张卡
export function makeQuestion(deck, code, kind, rng) {
  const card = deck.cards[code];
  const others = Object.entries(deck.cards).filter(([c]) => Number(c) !== code).map(([c, v]) => ({ code: Number(c), ...v }));
  const distinct = (key, own) => {
    const seen = new Set([own]);
    return sample(others, others.length, rng).filter((o) => !seen.has(o[key]) && seen.add(o[key]));
  };
  let right; let wrong; let question;
  if (kind === 'identify') {
    right = { text: card.md }; wrong = distinct('md', card.md).slice(0, OPTION_COUNT - 1).map((o) => ({ text: o.md }));
    question = { kind, prompt: '这张卡叫什么？是什么角色？', image: code, roles: ROLES };
  } else if (kind === 'fill') {
    const [key, label] = sample(FACTS, 1, rng)[0];
    right = { text: card[key] }; wrong = distinct(key, card[key]).slice(0, OPTION_COUNT - 1).map((o) => ({ text: o[key] }));
    question = { kind, prompt: `「${card.md}」的「${label}」是什么？`, image: code, name: card.md, given: FACTS.filter(([k]) => k !== key).map(([k, l]) => ({ label: l, text: card[k] })), missing: label };
  } else {
    right = { text: card.md }; wrong = distinct('md', card.md).slice(0, OPTION_COUNT - 1).map((o) => ({ text: o.md }));
    question = { kind, prompt: `哪张卡：${card.does}`, image: null };
  }
  if (wrong.length < OPTION_COUNT - 1) return null;
  const options = shuffleIn(right, wrong, rng);
  return { question: { ...question, options: options.map((o) => ({ text: o.text })) }, answer: { index: options.findIndex((o) => o.correct), roles: kind === 'identify' ? [card.role] : [], code } };
}

// 出下一题：挑到期的第一张卡，三种题型随机（这张卡凑不齐某种题就换一种）；没有到期的卡返回 null
// 返回 { question, answer, code, due（到期的张数，含这一题）, fresh（其中没答过的）}
export function nextQuestion(deck, rows, now, seed) {
  const rng = rngFrom(seed);
  const states = cardStates(rows);
  const { due, fresh } = dueCodes(deck, states, now, rng);
  if (!due.length) return null;
  const code = due[0];
  for (const kind of sample(KINDS, KINDS.length, rng)) {
    const made = makeQuestion(deck, code, kind, rng);
    if (made) return { ...made, code, due: due.length, fresh: fresh.length, history: historyOf(rows, code), lastMs: historyOf(rows, code).at(-1) ?? null };
  }
  throw new Error(`卡 ${code} 出不了题：卡组里互不相同的干扰项不够`);
}

// 批改：picked 是 { option: 选项下标, roles: [选的角色] }；identify 要名字和角色集合都对，别的只看选项
export function grade(answer, picked) {
  const optionOk = Number.isInteger(picked?.option) && picked.option === answer.index;
  const roles = [...new Set(picked?.roles ?? [])].sort();
  const rolesOk = roles.length === answer.roles.length && roles.every((r, i) => r === [...answer.roles].sort()[i]);
  return { correct: optionOk && rolesOk, optionOk, rolesOk };
}

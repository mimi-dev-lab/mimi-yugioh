// 评分：场面值、场面分、速度加成、提示系数、总分、每一步之后的场面。纯函数；常量和 DESIGN.md「评分」一节同名，改的时候两边一起改。
export const INTERRUPT_VALUE = 10; // 对手回合每打断一次的场面值
export const HAND_VALUE = 1; // 结束时每张手牌的场面值
export const SPEED_MIN_FIELD_SCORE = 90; // 场面分到这个数才计速度加成
export const SPEED_MAX_BONUS = 20; // 60 秒内的加成
export const SPEED_FULL_SECONDS = 60;
export const SPEED_ZERO_SECONDS = 300; // 到这个用时加成降为 0
export const HINT_FACTOR = 0.8; // 每用一次提示乘一次

// 场面值 = 10 × 在场的卡的打断数之和 + 1 × 手牌数。board 是会话的场面（终场，或「把当时在场的卡当终场算」）
export const interruptsOf = (deck, board) => [...board.monsters, ...board.spellTraps].reduce((sum, c) => sum + (deck.cards[c.code]?.interrupts ?? 0), 0);
export const boardValue = (deck, board) => INTERRUPT_VALUE * interruptsOf(deck, board) + HAND_VALUE * board.hand.length;

// 场面分 = 100 × min(1, 用户 ÷ 最好)，取整；最好是 0（烂手）时，用户不可能更差，记 100
export function fieldScore(userValue, bestValue) {
  if (bestValue <= 0) return 100;
  return Math.round(100 * Math.min(1, userValue / bestValue));
}

// 速度加成：场面分 ≥ 90 才计；60 秒内 +20，300 秒起 0，中间线性，取整
export function speedBonus(seconds, field) {
  if (field < SPEED_MIN_FIELD_SCORE) return 0;
  if (seconds <= SPEED_FULL_SECONDS) return SPEED_MAX_BONUS;
  if (seconds >= SPEED_ZERO_SECONDS) return 0;
  return Math.round(SPEED_MAX_BONUS * (SPEED_ZERO_SECONDS - seconds) / (SPEED_ZERO_SECONDS - SPEED_FULL_SECONDS));
}

export const hintFactor = (hints) => HINT_FACTOR ** hints;

// 总分 = (场面分 + 速度加成) × 提示系数，取整；返回各项，结算屏每项一格
export function score({ userValue, bestValue, seconds, hints }) {
  const field = fieldScore(userValue, bestValue);
  const speed = speedBonus(seconds, field);
  const factor = hintFactor(hints);
  return { fieldScore: field, speedBonus: speed, speedCounted: field >= SPEED_MIN_FIELD_SCORE, hintFactor: factor, total: Math.round((field + speed) * factor) };
}

// 「每一步之后的场面」：每步之后的场面值 ÷ 最好场面值（最好是 0 记 1）
export const curve = (deck, boards, bestValue) => boards.map((b) => (bestValue > 0 ? boardValue(deck, b) / bestValue : 1));

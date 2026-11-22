// 一步的「花了什么 → 换来什么」：比较这一步前后我方各区域的卡（按卡号数张数），写成给用户看的两句话。纯函数。
// 花了 = 离开手牌 / 额外卡组 / 卡组 / 场上的卡；换来 = 进入场上 / 手牌 / 墓地 / 除外的卡。同一张卡手牌→场上，两边都会写到，这是真实的资源交换，不是重复。
const ZONES = [['hand', '手牌'], ['extra', '额外'], ['deck', '卡组'], ['monsters', '场上'], ['spellTraps', '场上'], ['grave', '墓地'], ['banished', '除外']];
const SPEND = new Set(['手牌', '额外', '卡组', '场上']);
const GAIN = new Set(['场上', '手牌', '墓地', '除外']);

const countBy = (list) => list.reduce((m, c) => m.set(c.code, (m.get(c.code) ?? 0) + 1), new Map());
// 卡组里的卡不报卡号（引擎只给张数），所以按张数算
const zoneCards = (board, key) => (key === 'deck' ? [] : board[key] ?? []);

// 某个区域名（场上合并怪兽区和魔陷区）前后的变化：{ out: [卡号…], in: [卡号…], deckDelta }
function change(before, after, label) {
  const keys = ZONES.filter(([, l]) => l === label).map(([k]) => k);
  const b = countBy(keys.flatMap((k) => zoneCards(before, k)));
  const a = countBy(keys.flatMap((k) => zoneCards(after, k)));
  const out = []; const gained = [];
  for (const code of new Set([...b.keys(), ...a.keys()])) {
    const d = (a.get(code) ?? 0) - (b.get(code) ?? 0);
    for (let i = 0; i < Math.abs(d); i++) (d < 0 ? out : gained).push(code);
  }
  return { out, in: gained };
}

const names = (codes, md) => codes.map(md).join('、');
const part = (label, sign, codes, md) => `${label} ${sign}${codes.length}${codes.length <= 2 ? `（${names(codes, md)}）` : ''}`;

// before / after 是 session.board() 的结果；md 是卡号 → 卡名。两边都没变化时写「无」
export function stepLedger(before, after, md) {
  const spent = []; const gained = [];
  for (const label of new Set(ZONES.map(([, l]) => l))) {
    if (label === '卡组') {
      const d = before.deck - after.deck;
      if (d > 0) spent.push(`卡组 −${d}`);
      continue;
    }
    const c = change(before, after, label);
    if (c.out.length && SPEND.has(label)) spent.push(part(label, '−', c.out, md));
    if (c.in.length && GAIN.has(label)) gained.push(part(label, '+', c.in, md));
  }
  return { spent: spent.join('，') || '无', gained: gained.join('，') || '无' };
}

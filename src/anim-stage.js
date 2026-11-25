// 路线动画的舞台：尺寸、每个区的位置、颜色、区名（纯数据和几何，不碰时间轴也不生成 HTML）。
// 竖着从上到下：横幅 / 发动牌的专用条（NOTICE，不放任何区）、怪兽区一排、魔陷区一排、额外怪兽区（两格，居中偏左 / 偏右）、手牌；
// 每一排下面留三行卡名（NAME_H）的位置；左右两列是额外卡组 / 除外和墓地 / 卡组。融合 / 同调的素材在额外怪兽区那一排的正中聚拢。
export const CW = 80;
export const CH = 116;
export const NAME_H = 55; // 卡下面的名字：离卡 4 px，15 px 字、最多三行（17 px 一行）
export const PITCH = 110; // 一排里相邻两格的间距
export const SX0 = 140;
export const COL_L = 20;
export const COL_R = 700;
export const CX = 400;
const GAP = 12;
const ROW = CH + NAME_H + GAP;
export const MY = 116; // 怪兽区一排的 y
export const SY = MY + ROW; // 魔陷区
export const EMZ_Y = SY + ROW; // 额外怪兽区
export const HY = EMZ_Y + CH + NAME_H + 30; // 手牌（留 30 给「手牌」标签）
export const STAGE = { w: 800, h: HY + CH + NAME_H + 5 };
export const NOTICE = { x: 0, y: 0, w: STAGE.w, h: MY - 6 }; // 横幅和发动牌只在这一条里
export const NOTICE_BANNER_H = 44;
export const NOTICE_SPOT_H = 100;
export const MERGE = [CX, EMZ_Y + CH / 2];
export const PILE = { extra: [COL_L, MY], banished: [COL_L, SY], grave: [COL_R, MY], deck: [COL_R, SY] };
export const PILES = ['extra', 'banished', 'grave', 'deck'];
export const VISIBLE = ['hand', 'monsters', 'spellTraps', 'grave', 'banished']; // 有卡牌实体的区；deck / extra 是堆，卡进出时才画出来
export const ZONE_NAME = { deck: '卡组', extra: '额外', hand: '手牌', monsters: '怪兽', spellTraps: '魔陷', grave: '墓地', banished: '除外' };
export const COLOR = { cyan: '#22d3ee', amber: '#fbbf24', green: '#4ade80', coral: '#fb7185', violet: '#a78bfa', pink: '#f472b6', sky: '#7dd3fc', white: '#ffffff', mute: '#9a9aa2' };
export const ZONE_COLOR = { hand: COLOR.green, monsters: COLOR.cyan, spellTraps: COLOR.amber, grave: COLOR.coral, banished: COLOR.violet, deck: COLOR.mute, extra: COLOR.mute };
export const SUMMON_TAG = { fusion: ['融合召唤', COLOR.pink], synchro: ['同调召唤', COLOR.sky], xyz: ['超量召唤', COLOR.violet], link: ['连接召唤', COLOR.cyan], ritual: ['仪式召唤', COLOR.amber] };
// 守备表示：卡横放（转 90 度），整体缩到横着的宽度比一格的间距窄 16 px，不碰相邻格的框
export const SIDEWAYS_SCALE = Math.round(((PITCH - 16) / CH) * 1000) / 1000; // 轨道表里数值只留三位小数，这里先取整

export const handPos = (i, n) => {
  const pitch = Math.min(100, n > 1 ? 680 / (n - 1) : 100);
  return [Math.round(CX - ((n - 1) * pitch + CW) / 2 + i * pitch), HY];
};
// 怪兽区 / 魔陷区的格子：0–4 是主格，怪兽区的 5、6 是额外怪兽区；魔陷区的 5（场地区）动画还不支持
export function slotPos(zone, sequence) {
  if (sequence >= 5) {
    if (zone !== 'monsters') throw new Error(`${ZONE_NAME[zone]}区的第 ${sequence} 格（场地区）动画还不支持`);
    return [SX0 + (1 + (sequence - 5) * 2) * PITCH, EMZ_Y];
  }
  return [SX0 + sequence * PITCH, zone === 'monsters' ? MY : SY];
}
export const pilePos = (zone, index) => [PILE[zone][0] + Math.min(index, 6) * 3, PILE[zone][1]];
export const zOf = (zone, index) => (zone === 'grave' || zone === 'banished' ? 20 + index : 10);
export const center = (p) => [p[0] + CW / 2, p[1] + CH / 2];

// 舞台上每个区占的矩形 { kind, x, y, w, h }：卡、卡名、区域标签（横幅和发动牌的专用条不能和它们相交，test/anim-stage.test.js 查）
export function zoneRects({ emz = true, hand = 8 } = {}) {
  const out = [];
  const card = (kind, [x, y]) => out.push({ kind: `${kind}卡`, x, y, w: CW, h: CH }, { kind: `${kind}卡名`, x: x - 9, y: y + CH + 4, w: CW + 18, h: NAME_H - 4 });
  for (let i = 0; i < 5; i++) {
    for (const zone of ['monsters', 'spellTraps']) {
      const [x, y] = slotPos(zone, i);
      card(ZONE_NAME[zone], [x, y]);
      out.push({ kind: `${ZONE_NAME[zone]}标签`, x, y: y + CH / 2 - 9, w: CW, h: 18 });
    }
  }
  if (emz) for (const seq of [5, 6]) { const [x, y] = slotPos('monsters', seq); card('额外怪兽', [x, y]); out.push({ kind: '额外怪兽标签', x, y: y + CH / 2 - 9, w: CW, h: 18 }); }
  for (const zone of PILES) {
    const [x, y] = PILE[zone];
    out.push({ kind: `${ZONE_NAME[zone]}堆`, x, y, w: CW + 18, h: CH }, { kind: `${ZONE_NAME[zone]}张数`, x: x - 10, y: y + CH + 8, w: CW + 20, h: 20 });
  }
  for (let i = 0; i < hand; i++) card('手牌', handPos(i, hand));
  out.push({ kind: '手牌标签', x: COL_L, y: HY - 24, w: CW + 20, h: 20 });
  return out;
}
export const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

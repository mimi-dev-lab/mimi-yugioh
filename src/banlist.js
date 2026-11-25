// Master Duel 禁限表（我们自己维护，引擎里没有）。现行表：2026-11-05 版 + 11-24 公告、12-04 起适用的改动（BANLIST_DATE 记适用日）。
// 只收和烙印卡组有关的条目，不是整张表：没写的卡按 3 张算。要换卡组、换表时在这里加条目、改日期，来源写在条目后面。
// 来源：
//   11-05 版：Yugipedia「November 2026 Lists (Master Duel)」https://yugipedia.com/wiki/November_2026_Lists_(Master_Duel)（2026-11-26 复核了和卡组有关的条目）
//   11-24 公告（12-04 适用）：YGOrganization https://ygorganization.com/master-duel-nov-24-update-new-fl-list 、Master Duel Meta https://www.masterduelmeta.com/articles/news/november-24-2026/master-duel-forbidden-list-update 、Luminous Core https://luminous-core.net/2026/11/post-3955/（三处一致；没有读到官方原文）
//   11-24 公告共 6 张：圣秘龙骑士 无制限→禁止；白之落胤 无制限→限制；计都星辰 Ketu 准限制→限制；魔兽的怀柔 禁止→限制；VS 蛟龙 准限制→无制限；王之遗宝祀圣域 准限制→无制限。其中只有白之落胤在烙印卡组里。
export const BANLIST_DATE = '2026-12-04';

// 密码 → 张数上限（0 禁止、1 限制、2 准限制）
export const LIMITS = {
  44362883: 1, // 烙印融合
  73819701: 1, // 白き竜の落胤（12-04 起 3→1；规则上算阿尔白斯之落胤，两张合起来仍最多 3 张，所以只是白之落胤最多 1 张）
  75500286: 1, // 封印的黄金柜
  23434538: 1, // 増殖するG
  33854624: 1, // 渊兽 玛格纳姆特
  65681983: 1, // 抹杀之指名者
  70369116: 1, // 捕食植物 青锁龙森蚺
  30271097: 2, // The Fallen ＆ The Virtuous
  55204071: 0, // 机关傀偶－梦魇
  24224830: 0, // 墓穴指名者
  96598015: 0, // 金满之壶
  // 分かつ烙印（Branded Expulsion，简中「分离烙印」）禁止（密码 1041278）。它不是「烙印追放」：烙印追放是 Branded Banishment（6763530），11-05 版里没有它，按 3 张算，所以不再记。两张都不在当前卡组里，不影响检查
  1041278: 0, // 分かつ烙印
};

export const maxCopies = (code) => LIMITS[code] ?? 3;

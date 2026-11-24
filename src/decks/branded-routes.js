// 烙印的展开路线。前两条出处 Game8「烙印デッキのレシピと回し方・対策」（https://game8.jp/yugioh-masterduel/534262，2026-11-20 版）；
// 后面几条补自 B站专栏「烙印展开路线图汇总」（東京西瓜，路线图）和 T³ 文库 Mas《【MD 烙印】展开路线一览》的译文（Duel Simulator 回放），每条的 source 写出处。
// 每条路线是引擎可重放的步骤序列：每步一句我们自己的说明（text）和这一步要给引擎的回应（do）。回应的写法见 src/route.js。
// 路线只写「从哪些牌出发」（hand 是起手 5 张：出处说的初动卡，其余是填充用的无关牌），不写具体的洗牌顺序。
// end 是出处写的我方回合结束时的终场（出处没写剩几张手牌时，按起手张数减去用掉的算）；测试把引擎重放出来的终场和它对照。
// 每条路线另带：source（出处 { name, url, date }，date 是页面版本日期）、verified（引擎重放验证的日期）、mismatch（教程和引擎结果不一致处的说明，一致就不写这个字段）。
const C = {
  albaz: 73819701, // 白之落胤
  whiteSaint: 55273560, // 白之圣女 艾克利西亚
  quem: 45883110, // 引导之圣女 库妸㽗
  cartesia: 95515789, // 赫之圣女 卡尔塔西亚
  aluber: 62962630, // 阿卢绯尔
  brandedFusion: 44362883, albionBranded: 87746184, blackEcclesia: 78397661, // 烙印融合、烙印龙阿尔比昂、黑衣龙之艾克利西亚
  opening: 36637374, red: 82738008, lubellion: 70534340, mirrorjade: 44146295, // 烙印开幕、赫之烙印、神炎龙、冰剑龙
  granguignol: 24915933, dragonDevours: 76666602, virtuous: 30271097, titaniklad: 41373230, retribution: 17751597, // 赫焉龙、吞喰圣痕之龙、落胤与圣女、灰烬龙、烙印断罪
  lockBird: 94145021, superPoly: 48130397, sarcophagus: 75500286,
  nadir: 1984618, dogmatika: 60303688, // 天底的使徒、教导之圣女 艾克利西亚
  highSpirits: 29948294, fuwalos: 42141493, rindbrumm: 51409648, // 烙印之气炎、多多迷宝・软绵雀精、击铁龙 猎宝机装
  shroudedAlbion: 25451383, mercourier: 19096726, // 黑衣龙 阿尔比昂、铁兽鸟 墨丘利耶
};

const SOURCE = { name: 'Game8', url: 'https://game8.jp/yugioh-masterduel/534262', date: '2026-11-20' };
const BILI_ROUTES = { name: 'B站专栏 東京西瓜「烙印展开路线图汇总」', url: 'https://www.bilibili.com/opus/1209923211067654167', date: '2026-06-04' };
const MAS_ROUTES = { name: 'T³ 文库 Mas「展开路线一览」', url: 'https://docs.ihex.dev/public/yugioh/md/branded-md-mas-combo-routes/', date: '2026-06-05' };
const VERIFIED = '2026-11-24';

const act = (code) => ({ idle: 'activate', code });
const chain = (code) => ({ chain: code });
const pick = (...codes) => ({ pick: codes });
const place = { place: 0 }; // 第一个空格
const position = { position: 0 }; // 表侧攻击表示

// 起手的四张填充牌：2 超融合、黄金柜、抽牌小丑与封锁鸟，都不影响展开（路线 hand = 初动卡 + 它们）
const FILLER = [C.superPoly, C.superPoly, C.sarcophagus, C.lockBird];
// 两卡展开的起手有两张初动卡，填充牌少一张：去掉一张超融合
const FILLER_TWO_CARD = FILLER.slice(1);

// 多条路线逐字相同的步骤和步骤段。只有说明（text）和回应（do）都一样才共用；说明略有不同的（例如多半句）各条自己写。
// 两个概念别混：黑衣龙之艾克利西亚（C.blackEcclesia，同调怪兽，白之落胤线的中段）≠ 黑衣龙 阿尔比昂（C.shroudedAlbion，手牌的龙族怪兽，只在气炎＋黑衣龙 阿尔比昂线当「给对方看」的素材）。
const endTurn = { text: '结束回合，进结束阶段', do: ['end-turn'] };
const finish = { text: '放行剩下的连锁窗口，直到我方回合结束', do: ['finish'] };

// 白之落胤线中段
const albazSendsAlbionAndSummons = { text: '手牌的白之落胤发动①：从额外卡组把烙印龙阿尔比昂送去墓地，自己特殊召唤', do: [act(C.albaz), pick(C.albionBranded), 'pass', place, position] };
const albazCallsSaint = { text: '白之落胤②：从卡组特殊召唤白之圣女', do: ['yes', 'pass', pick(C.whiteSaint), place, position, 'pass'] };
const albazSaintSynchroEcclesia = { text: '白之落胤＋白之圣女同调召唤黑衣龙之艾克利西亚', do: [{ idle: 'special-summon', code: C.blackEcclesia }, pick(C.whiteSaint), pick(C.albaz), place, position, 'pass', 'pass'] };
const ecclesiaCallsQuem = { text: '黑衣龙之艾克利西亚除外自己，从卡组特殊召唤引导之圣女 库妸㽗', do: [act(C.blackEcclesia), 'pass', pick(C.quem), place, position] };
const quemSendsCartesia = { text: '库妸㽗①：从卡组把赫之圣女 卡尔塔西亚送去墓地', do: ['yes', 'pass', pick(C.cartesia), 'pass'] };
const endPhaseSaintCartesiaReturn = { text: '结束阶段：墓地的白之圣女和卡尔塔西亚各自回到手牌', do: [chain(C.whiteSaint), 'pass', 'pass', chain(C.cartesia), 'pass', 'pass'] };
// 结束阶段 开幕 → 阿卢绯尔 → 赫之烙印 → 卢绯里昂：从墓地的烙印龙阿尔比昂检索烙印开幕，到融合出神炎龙 卢绯里昂为止
const albionOpeningToLubellion = [
  { text: '墓地的烙印龙阿尔比昂：从卡组把烙印开幕加入手牌', do: [chain(C.albionBranded), 'pass', pick(C.opening), { option: 0 }] },
  { text: '发动烙印开幕：弃抽牌小丑与封锁鸟，从卡组守备表示叫出阿卢绯尔', do: [chain(C.opening), place, 'pass', pick(C.lockBird), pick(C.aluber), { option: 1 }, place, 'yes', 'pass'] },
  { text: '阿卢绯尔：从卡组把赫之烙印加入手牌', do: [pick(C.red)] },
  { text: '发动赫之烙印：墓地的白之落胤回手，并选择融合', do: [chain(C.red), place, pick(C.albaz), 'pass', 'yes'] },
  { text: '白之落胤＋阿卢绯尔融合召唤神炎龙 卢绯里昂', do: [pick(C.lubellion), pick(C.albaz), pick(C.aluber), place, position] },
];
const lubellionDiscardsCartesia = { text: '卢绯里昂的效果：弃手牌的卡尔塔西亚', do: ['yes', pick(C.cartesia), 'pass'] };
// 卢绯里昂融合出冰剑龙 镜翠幻种，到我方回合结束
const lubellionFusionToTurnEnd = [
  { text: '卢绯里昂＋除外状态的白之落胤融合召唤冰剑龙 镜翠幻种', do: [pick(C.mirrorjade), pick(C.lubellion), pick(C.albaz), place, position] },
  { text: '冰剑龙从额外卡组出场（任何卡离开额外卡组都会触发），库妸㽗②：把墓地的卡尔塔西亚特殊召唤', do: ['yes', pick(C.cartesia), 'pass', place, position] },
  { text: '结束阶段：除外的黑衣龙之艾克利西亚回到场上', do: ['pass', chain(C.blackEcclesia), place] },
  finish,
];

// 烙印融合线和阿卢绯尔线共用的几步（第二次融合的素材不同，各自写）
const fusionSummonsAlbion = { text: '发动烙印融合：用卡组的白之落胤和卡尔塔西亚融合召唤烙印龙阿尔比昂', do: [act(C.brandedFusion), place, 'pass', pick(C.albionBranded), pick(C.albaz), pick(C.cartesia), place, position] };
const granguignolSendsDevours = { text: '格兰吉尼奥尔①：从额外卡组把吞喰圣痕之龙送去墓地', do: ['yes', 'pass', pick(C.dragonDevours), 'pass'] };
const devoursSearchesVirtuous = { text: '结束阶段：墓地的吞喰圣痕之龙检索落胤与圣女', do: ['yes', 'pass', pick(C.virtuous)] };
const virtuousSendsTitaniklad = { text: '发动落胤与圣女：送灰烬龙 落尘劣种去墓地，破坏烙印龙阿尔比昂', do: [chain(C.virtuous), place, { option: 0 }, pick(C.titaniklad), pick(C.albionBranded), 'pass', 'pass'] };
const albionSetsRetribution = { text: '墓地的烙印龙阿尔比昂：从卡组把烙印断罪盖放', do: [chain(C.albionBranded), 'pass', pick(C.retribution), { option: 1 }, place] };

export const ROUTES = [
  {
    id: 'white-albaz',
    name: '基本展开｜白之落胤初动',
    source: SOURCE,
    verified: VERIFIED,
    needs: C.albaz,
    // 起手：白之落胤 + FILLER 四张
    hand: [C.albaz, ...FILLER],
    end: { monsters: [C.mirrorjade, C.quem, C.cartesia, C.blackEcclesia], spellTraps: [], hand: 4 },
    steps: [
      albazSendsAlbionAndSummons,
      albazCallsSaint,
      albazSaintSynchroEcclesia,
      ecclesiaCallsQuem,
      quemSendsCartesia,
      endTurn,
      endPhaseSaintCartesiaReturn,
      ...albionOpeningToLubellion,
      lubellionDiscardsCartesia,
      ...lubellionFusionToTurnEnd,
    ],
  },
  {
    id: 'branded-fusion',
    name: '基本展开｜烙印融合初动',
    source: SOURCE,
    verified: VERIFIED,
    needs: C.brandedFusion,
    // 起手：烙印融合 + FILLER
    hand: [C.brandedFusion, ...FILLER],
    end: { monsters: [C.granguignol, C.albaz, C.whiteSaint], spellTraps: [C.retribution], hand: 4 },
    steps: [
      fusionSummonsAlbion,
      { text: '烙印龙阿尔比昂①：用墓地的白之落胤和卡尔塔西亚融合召唤赫焉龙 格兰吉尼奥尔', do: ['yes', 'pass', pick(C.granguignol), pick(C.albaz), pick(C.cartesia), place, position] },
      granguignolSendsDevours,
      endTurn,
      devoursSearchesVirtuous,
      virtuousSendsTitaniklad,
      { text: '墓地的灰烬龙：从卡组特殊召唤白之落胤', do: [chain(C.titaniklad), 'pass', pick(C.albaz), { option: 1 }, place, position] },
      albazCallsSaint,
      albionSetsRetribution,
      finish,
    ],
  },
  {
    id: 'aluber',
    name: '基本展开｜阿卢绯尔初动',
    source: BILI_ROUTES,
    verified: VERIFIED,
    needs: C.aluber,
    // 起手：阿卢绯尔 + FILLER。阿卢绯尔检索烙印融合，之后和烙印融合线几乎一样，只是第二次融合用阿卢绯尔当素材
    hand: [C.aluber, ...FILLER],
    end: { monsters: [C.granguignol, C.albaz, C.whiteSaint], spellTraps: [C.retribution], hand: 4 },
    steps: [
      { text: '通常召唤阿卢绯尔（用掉这回合的召唤权）', do: [{ idle: 'summon', code: C.aluber }, place, 'pass'] },
      { text: '阿卢绯尔：从卡组把烙印融合加入手牌', do: ['yes', 'pass', pick(C.brandedFusion), 'pass'] },
      fusionSummonsAlbion,
      { text: '烙印龙阿尔比昂①：除外墓地的卡尔塔西亚和场上的阿卢绯尔，融合召唤赫焉龙 格兰吉尼奥尔', do: ['yes', 'pass', pick(C.granguignol), pick(C.cartesia), pick(C.aluber), place, position] },
      granguignolSendsDevours,
      endTurn,
      devoursSearchesVirtuous,
      virtuousSendsTitaniklad,
      { text: '墓地的灰烬龙：从卡组特殊召唤第二张白之落胤', do: [chain(C.titaniklad), 'pass', pick(C.albaz), { option: 1 }, place, position] },
      albazCallsSaint,
      albionSetsRetribution,
      finish,
    ],
  },
  {
    id: 'white-saint',
    name: '基本展开｜白之圣女初动',
    source: BILI_ROUTES,
    verified: VERIFIED,
    needs: C.whiteSaint,
    // 起手：白之圣女 + FILLER。不经过额外卡组送墓，所以结束阶段没有回收；路线图在对手回合还有后续（黑衣龙叫白之落胤再融合），这里只到我方回合结束
    hand: [C.whiteSaint, ...FILLER],
    end: { monsters: [C.quem, C.blackEcclesia], spellTraps: [], hand: 4 },
    steps: [
      { text: '通常召唤白之圣女', do: [{ idle: 'summon', code: C.whiteSaint }, place, 'pass'] },
      { text: '白之圣女②：解放自己，从卡组特殊召唤白之落胤（规则上算阿尔白斯之落胤）', do: [chain(C.whiteSaint), 'pass', pick(C.albaz), place, position] },
      albazCallsSaint,
      albazSaintSynchroEcclesia,
      ecclesiaCallsQuem,
      { text: '库妸㽗①：从卡组把赫之圣女 卡尔塔西亚送去墓地，留给下一回合', do: ['yes', 'pass', pick(C.cartesia), 'pass'] },
      endTurn,
      { text: '结束阶段：除外的黑衣龙之艾克利西亚回到场上', do: [place] },
      finish,
    ],
  },
  {
    id: 'high-spirits-fuwalos',
    name: '两卡展开｜烙印之气炎＋软绵雀精',
    source: BILI_ROUTES,
    verified: VERIFIED,
    needs: C.highSpirits,
    // 起手：烙印之气炎 + 软绵雀精（路线图写「任意气炎能用的怪兽」）+ FILLER_TWO_CARD。气炎拿到白之落胤后，和白之落胤线一样
    hand: [C.highSpirits, C.fuwalos, ...FILLER_TWO_CARD],
    end: { monsters: [C.mirrorjade, C.quem, C.cartesia, C.blackEcclesia], spellTraps: [], hand: 3 },
    steps: [
      { text: '回合一开始发动烙印之气炎：给对方看软绵雀精，从额外卡组把同是鸟兽族的击铁龙 猎宝机装送去墓地，再弃软绵雀精检索白之落胤', do: [chain(C.highSpirits), place, 'pass', pick(C.fuwalos), pick(C.rindbrumm), 'yes', pick(C.albaz), 'pass'] },
      albazSendsAlbionAndSummons,
      albazCallsSaint,
      albazSaintSynchroEcclesia,
      ecclesiaCallsQuem,
      quemSendsCartesia,
      endTurn,
      endPhaseSaintCartesiaReturn,
      ...albionOpeningToLubellion,
      lubellionDiscardsCartesia,
      ...lubellionFusionToTurnEnd,
    ],
  },
  {
    id: 'high-spirits-shrouded',
    name: '两卡展开｜烙印之气炎＋黑衣龙 阿尔比昂',
    source: BILI_ROUTES,
    verified: VERIFIED,
    needs: C.highSpirits,
    // 起手：烙印之气炎 + 黑衣龙 阿尔比昂（路线图写「任意龙族」）+ FILLER_TWO_CARD。气炎送的是灰烬龙，结束阶段由它叫库妸㽗，黑衣龙之艾克利西亚就能改叫铁兽鸟
    hand: [C.highSpirits, C.shroudedAlbion, ...FILLER_TWO_CARD],
    end: { monsters: [C.mirrorjade, C.quem, C.cartesia, C.blackEcclesia, C.mercourier], spellTraps: [], hand: 3 },
    steps: [
      { text: '回合一开始发动烙印之气炎：给对方看黑衣龙 阿尔比昂，从额外卡组把同是龙族的灰烬龙 落尘劣种送去墓地，再弃黑衣龙 阿尔比昂检索白之落胤', do: [chain(C.highSpirits), place, 'pass', pick(C.shroudedAlbion), pick(C.titaniklad), 'yes', pick(C.albaz), 'pass'] },
      albazSendsAlbionAndSummons,
      albazCallsSaint,
      albazSaintSynchroEcclesia,
      { text: '黑衣龙之艾克利西亚除外自己，从卡组特殊召唤铁兽鸟 墨丘利耶（库妸㽗留给灰烬龙叫）', do: [act(C.blackEcclesia), 'pass', pick(C.mercourier), place, position, 'pass'] },
      endTurn,
      { text: '结束阶段：墓地的灰烬龙从卡组特殊召唤引导之圣女 库妸㽗', do: [chain(C.titaniklad), 'pass', pick(C.quem), { option: 1 }, place, position] },
      quemSendsCartesia,
      { text: '墓地的白之圣女和卡尔塔西亚各自回到手牌', do: [chain(C.whiteSaint), 'pass', 'pass', chain(C.cartesia), 'pass', 'pass'] },
      ...albionOpeningToLubellion,
      { text: '卢绯里昂的效果：弃手牌的卡尔塔西亚', do: [chain(C.lubellion), pick(C.cartesia), 'pass', 'pass'] },
      ...lubellionFusionToTurnEnd,
    ],
  },
  {
    id: 'nadir-servant',
    name: '基本展开｜天底的使徒初动',
    source: MAS_ROUTES,
    verified: VERIFIED,
    needs: C.nadir,
    // 起手：天底的使徒 + FILLER（出处第 06 条）。天底发动后这回合不能从额外卡组特殊召唤，所以不做融合，靠墓地的融合怪兽在结束阶段铺场；要投入教导之圣女
    hand: [C.nadir, ...FILLER],
    end: { monsters: [C.albaz, C.quem, C.cartesia], spellTraps: [C.virtuous, C.retribution], hand: 4 },
    steps: [
      { text: '发动天底的使徒：从额外卡组把灰烬龙 落尘劣种送去墓地，从卡组检索白之落胤（这回合不能再从额外卡组特殊召唤）', do: [act(C.nadir), place, 'pass', pick(C.titaniklad), pick(C.albaz), 'pass'] },
      { text: '手牌的白之落胤发动①：从额外卡组把吞喰圣痕之龙送去墓地，自己特殊召唤', do: [act(C.albaz), pick(C.dragonDevours), 'pass', place, position] },
      { text: '白之落胤②：从卡组特殊召唤教导之圣女 艾克利西亚', do: ['yes', 'pass', pick(C.dogmatika), place, position] },
      { text: '教导之圣女②：从卡组把落胤与圣女（规则上也算教导卡）加入手牌', do: ['yes', 'pass', pick(C.virtuous), 'pass'] },
      { text: '盖放落胤与圣女，留到对手回合用', do: [{ idle: 'spell-set', code: C.virtuous }, place, 'pass'] },
      endTurn,
      { text: '结束阶段：墓地的吞喰圣痕之龙检索第二张落胤与圣女', do: [chain(C.dragonDevours), 'pass', pick(C.virtuous), 'pass'] },
      { text: '墓地的灰烬龙：从卡组特殊召唤引导之圣女 库妸㽗', do: [chain(C.titaniklad), 'pass', pick(C.quem), { option: 1 }, place, position] },
      { text: '库妸㽗①：从卡组把赫之圣女 卡尔塔西亚送去墓地', do: ['yes', 'pass', pick(C.cartesia)] },
      { text: '从手牌发动落胤与圣女：从额外卡组把烙印龙阿尔比昂送去墓地，破坏场上的教导之圣女腾出格子', do: [chain(C.virtuous), place, { option: 0 }, pick(C.albionBranded), pick(C.dogmatika), 'pass'] },
      { text: '落胤与圣女把烙印龙阿尔比昂从额外卡组送去墓地（任何卡离开额外卡组都会触发），库妸㽗②：把墓地的卡尔塔西亚特殊召唤', do: ['yes', pick(C.cartesia), 'pass', place, position] },
      { text: '墓地的烙印龙阿尔比昂：从卡组把烙印断罪盖放', do: ['pass', 'yes', 'pass', pick(C.retribution), { option: 1 }, place] },
      finish,
    ],
  },
];

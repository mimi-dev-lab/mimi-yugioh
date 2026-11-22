// 烙印的两条展开路线，出处 Game8「烙印デッキのレシピと回し方・対策」（https://game8.jp/yugioh-masterduel/534262，2026-11-20 版）。
// 每条路线是引擎可重放的步骤序列：每步一句我们自己的说明（text）和这一步要给引擎的回应（do）。回应的写法见 src/route.js。
// 路线只写「从哪些牌出发」（hand 是起手 5 张，其余是填充用的无关牌，凑够 Game8 说的 1 卡初动），不写具体的洗牌顺序。
// end 是 Game8 页面写的终场；测试把引擎重放出来的终场和它对照。
const C = {
  albaz: 73819701, // 白之落胤
  whiteSaint: 55273560, // 白之圣女 艾克利西亚
  quem: 45883110, // 引导之圣女 库妸㽗
  cartesia: 95515789, // 赫之圣女 卡尔塔西亚
  aluber: 62962630, // 阿卢绯尔
  brandedFusion: 44362883, albionBranded: 87746184, blackAlbion: 78397661, // 烙印融合、烙印龙阿尔比昂、黑衣龙之艾克利西亚
  opening: 36637374, red: 82738008, lubellion: 70534340, mirrorjade: 44146295, // 烙印开幕、赫之烙印、神炎龙、冰剑龙
  granguignol: 24915933, dragonDevours: 76666602, virtuous: 30271097, titaniklad: 41373230, retribution: 17751597, // 赫焉龙、吞喰圣痕之龙、落胤与圣女、灰烬龙、烙印断罪
  lockBird: 94145021, superPoly: 48130397, sarcophagus: 75500286,
};

const act = (code) => ({ idle: 'activate', code });
const chain = (code) => ({ chain: code });
const pick = (...codes) => ({ pick: codes });
const place = { place: 0 }; // 第一个空格
const position = { position: 0 }; // 表侧攻击表示

export const ROUTES = [
  {
    id: 'white-albaz',
    name: '基本展开｜白之落胤初动',
    needs: C.albaz,
    // 起手：白之落胤 + 4 张不影响展开的牌（2 超融合、黄金柜、抽牌小丑与封锁鸟）
    hand: [C.albaz, C.superPoly, C.superPoly, C.sarcophagus, C.lockBird],
    end: { monsters: [C.mirrorjade, C.quem, C.cartesia, C.blackAlbion], spellTraps: [], hand: 4 },
    steps: [
      { text: '手牌的白之落胤发动①：从额外卡组把烙印龙阿尔比昂送去墓地，自己特殊召唤', do: [act(C.albaz), pick(C.albionBranded), 'pass', place, position] },
      { text: '白之落胤②：从卡组特殊召唤白之圣女', do: ['yes', 'pass', pick(C.whiteSaint), place, position, 'pass'] },
      { text: '白之落胤＋白之圣女同调召唤黑衣龙之艾克利西亚', do: [{ idle: 'special-summon', code: C.blackAlbion }, pick(C.whiteSaint), pick(C.albaz), place, position, 'pass', 'pass'] },
      { text: '黑衣龙之艾克利西亚除外自己，从卡组特殊召唤引导之圣女 库妸㽗', do: [act(C.blackAlbion), 'pass', pick(C.quem), place, position] },
      { text: '库妸㽗①：从卡组把赫之圣女 卡尔塔西亚送去墓地', do: ['yes', 'pass', pick(C.cartesia), 'pass'] },
      { text: '结束回合，进结束阶段', do: ['end-turn'] },
      { text: '结束阶段：墓地的白之圣女和卡尔塔西亚各自回到手牌', do: [chain(C.whiteSaint), 'pass', 'pass', chain(C.cartesia), 'pass', 'pass'] },
      { text: '墓地的烙印龙阿尔比昂：从卡组把烙印开幕加入手牌', do: [chain(C.albionBranded), 'pass', pick(C.opening), { option: 0 }] },
      { text: '发动烙印开幕：弃抽牌小丑与封锁鸟，从卡组守备表示叫出阿卢绯尔', do: [chain(C.opening), place, 'pass', pick(C.lockBird), pick(C.aluber), { option: 1 }, place, 'yes', 'pass'] },
      { text: '阿卢绯尔：从卡组把赫之烙印加入手牌', do: [pick(C.red)] },
      { text: '发动赫之烙印：墓地的白之落胤回手，并选择融合', do: [chain(C.red), place, pick(C.albaz), 'pass', 'yes'] },
      { text: '白之落胤＋阿卢绯尔融合召唤神炎龙 卢绯里昂', do: [pick(C.lubellion), pick(C.albaz), pick(C.aluber), place, position] },
      { text: '卢绯里昂的效果：弃手牌的卡尔塔西亚', do: ['yes', pick(C.cartesia), 'pass'] },
      { text: '卢绯里昂＋除外状态的白之落胤融合召唤冰剑龙 镜翠幻种', do: [pick(C.mirrorjade), pick(C.lubellion), pick(C.albaz), place, position] },
      { text: '额外卡组的卡离场，库妸㽗②：把墓地的卡尔塔西亚特殊召唤', do: ['yes', pick(C.cartesia), 'pass', place, position] },
      { text: '结束阶段：除外的黑衣龙之艾克利西亚回到场上', do: ['pass', chain(C.blackAlbion), place] },
      { text: '放行剩下的连锁窗口，直到我方回合结束', do: ['finish'] },
    ],
  },
  {
    id: 'branded-fusion',
    name: '基本展开｜烙印融合初动',
    needs: C.brandedFusion,
    // 起手：烙印融合 + 同样 4 张填充牌
    hand: [C.brandedFusion, C.superPoly, C.superPoly, C.sarcophagus, C.lockBird],
    end: { monsters: [C.granguignol, C.albaz, C.whiteSaint], spellTraps: [C.retribution], hand: 4 },
    steps: [
      { text: '发动烙印融合：用卡组的白之落胤和卡尔塔西亚融合召唤烙印龙阿尔比昂', do: [act(C.brandedFusion), place, 'pass', pick(C.albionBranded), pick(C.albaz), pick(C.cartesia), place, position] },
      { text: '烙印龙阿尔比昂①：用墓地的白之落胤和卡尔塔西亚融合召唤赫焉龙 格兰吉尼奥尔', do: ['yes', 'pass', pick(C.granguignol), pick(C.albaz), pick(C.cartesia), place, position] },
      { text: '格兰吉尼奥尔①：从额外卡组把吞喰圣痕之龙送去墓地', do: ['yes', 'pass', pick(C.dragonDevours), 'pass'] },
      { text: '结束回合，进结束阶段', do: ['end-turn'] },
      { text: '结束阶段：墓地的吞喰圣痕之龙检索落胤与圣女', do: ['yes', 'pass', pick(C.virtuous)] },
      { text: '发动落胤与圣女：送灰烬龙 落尘劣种去墓地，破坏烙印龙阿尔比昂', do: [chain(C.virtuous), place, { option: 0 }, pick(C.titaniklad), pick(C.albionBranded), 'pass', 'pass'] },
      { text: '墓地的灰烬龙：从卡组特殊召唤白之落胤', do: [chain(C.titaniklad), 'pass', pick(C.albaz), { option: 1 }, place, position] },
      { text: '白之落胤②：从卡组特殊召唤白之圣女', do: ['yes', 'pass', pick(C.whiteSaint), place, position, 'pass'] },
      { text: '墓地的烙印龙阿尔比昂：从卡组把烙印断罪盖放', do: [chain(C.albionBranded), 'pass', pick(C.retribution), { option: 1 }, place] },
      { text: '放行剩下的连锁窗口，直到我方回合结束', do: ['finish'] },
    ],
  },
];

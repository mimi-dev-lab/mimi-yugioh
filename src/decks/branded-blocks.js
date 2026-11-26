// 烙印的「积木」：把 9 条展开路线拆成少数几块有名字、可复用的小段，每块写「要什么 → 给什么」。和卡表、路线步骤分开放（不改卡表行，不改路线步骤本身）。两份数据：
//   BLOCKS    积木：id、名字（MD 简中玩家的说法，要形象好记）、要什么（needs）、给什么（gives）。名字不许重复（测试查）
//   SEGMENTS  路线 id → 这条路线由哪几段积木连起来：{ block, from, to }，步号从 1 起、含两头；从第 1 步到最后一步首尾相接，不漏不重叠（测试查，新路线加进来漏标会红）
// 同一块积木在不同路线里的步骤可以略有不同（弃的牌、送墓的龙、拿的卡不一样），每种写法都是这块积木的一个「写法」：
// 积木的操作序列取自路线数据里它对应的那几步的 do（src/blocks.js 的 blockVariants），报告里「只用这几块积木能拼出多少手」按它匹配（src/opening-report.js）。
// 每块的「要什么、给什么」只写路线步骤说明和卡的效果里查得到的事。

export const BLOCKS = [
  {
    id: 'high-spirits-swap', name: '气炎换落胤',
    needs: '手里有烙印之气炎，还有一只能给对方看的怪兽（龙族或鸟兽族：额外卡组里要有同种族的 8 星融合怪兽）',
    gives: '额外卡组里同种族的融合怪兽（灰烬龙或击铁龙）进墓地，弃掉给对方看的那只怪兽，从卡组检索白之落胤',
  },
  {
    id: 'albaz-jump', name: '落胤起跳',
    needs: '白之落胤在手，或能把它拿到手 / 叫出来（天底的使徒检索、白之圣女解放后从卡组特召）',
    gives: '白之落胤上场，再叫出一只圣女（白之圣女或教导之圣女）；落胤从手牌上场时，顺手从额外卡组送一只龙去墓地备用（烙印龙阿尔比昂或吞喰圣痕之龙）',
  },
  {
    id: 'saint-relay', name: '圣女接力',
    needs: '场上有白之落胤和白之圣女',
    gives: '两只同调成黑衣龙之艾克利西亚，它除外自己，叫出下一只：引导之圣女 库妸㽗（库妸㽗再把赫之圣女 卡尔塔西亚送去墓地），或铁兽鸟 墨丘利耶',
  },
  {
    id: 'sword-lock', name: '三英压场',
    needs: '场上有白之落胤和白之圣女',
    gives: '两只同调成三英的相剑师留在场上（对手回合能让一张表侧表示的卡效果无效），并检索赫之圣女 卡尔塔西亚；墓地有白之落胤时，卡尔塔西亚能从手牌自己特召，对手回合再多一个打断',
  },
  {
    id: 'end-phase-recycle', name: '结束阶段大回收',
    needs: '展开里已把有墓地效果的卡送进墓地：白之圣女和卡尔塔西亚、吞喰圣痕之龙、灰烬龙、烙印龙阿尔比昂',
    gives: '结束回合后这些效果一起触发：圣女和卡尔塔西亚回手，或检索落胤与圣女、灰烬龙叫出库妸㽗 / 白之落胤，下一块要的素材都备齐',
  },
  {
    id: 'opening-bridge', name: '开幕搭桥',
    needs: '墓地有烙印龙阿尔比昂和白之落胤，手里有一张能弃的牌',
    gives: '阿尔比昂检索烙印开幕，开幕叫出阿卢绯尔，阿卢绯尔检索赫之烙印，赫之烙印让落胤回手并融合出神炎龙 卢绯里昂，卢绯里昂再弃一张卡尔塔西亚进墓地',
  },
  {
    id: 'mirrorjade-lock', name: '冰剑龙封场',
    needs: '场上有神炎龙 卢绯里昂，除外区有白之落胤，场上有库妸㽗、墓地有卡尔塔西亚',
    gives: '融合出冰剑龙 镜翠幻种，库妸㽗把墓地的卡尔塔西亚叫回场上；黑衣龙之艾克利西亚回场，放行连锁到回合结束，终场就是这一套',
  },
  {
    id: 'fusion-chain', name: '融合连发',
    needs: '手里有烙印融合，素材（阿尔白斯之落胤和卡尔塔西亚，或软绵雀精）在卡组里',
    gives: '融合出一只以阿尔白斯之落胤为素材的融合怪兽：走烙印龙阿尔比昂能接着融合出赫焉龙 格兰吉尼奥尔，并把吞喰圣痕之龙送进墓地；走击铁龙 猎宝机装则当场留下一个打断，也让烙印断罪和墨丘利耶的条件成立',
  },
  {
    id: 'aluber-spark', name: '阿卢绯尔点火',
    needs: '手里有阿卢绯尔，这回合的通常召唤还没用',
    gives: '通常召唤阿卢绯尔，从卡组检索一张烙印魔陷：下一块要融合就拿烙印融合，要封场就拿烙印断罪',
  },
  {
    id: 'set-and-close', name: '收网',
    needs: '展开做完了，手里或墓地有留给对手回合的陷阱',
    gives: '把烙印断罪、超融合这类留给对手回合的卡盖好，结束回合并放行剩下的连锁窗口，场面交给对手回合',
  },
];

export const SEGMENTS = {
  'white-albaz': [
    { block: 'albaz-jump', from: 1, to: 2 },
    { block: 'saint-relay', from: 3, to: 5 },
    { block: 'end-phase-recycle', from: 6, to: 7 },
    { block: 'opening-bridge', from: 8, to: 13 },
    { block: 'mirrorjade-lock', from: 14, to: 17 },
  ],
  'branded-fusion': [
    { block: 'fusion-chain', from: 1, to: 3 },
    { block: 'end-phase-recycle', from: 4, to: 8 },
    { block: 'set-and-close', from: 9, to: 10 },
  ],
  aluber: [
    { block: 'aluber-spark', from: 1, to: 2 },
    { block: 'fusion-chain', from: 3, to: 5 },
    { block: 'end-phase-recycle', from: 6, to: 10 },
    { block: 'set-and-close', from: 11, to: 12 },
  ],
  'white-saint': [
    { block: 'albaz-jump', from: 1, to: 3 },
    { block: 'sword-lock', from: 4, to: 6 },
    { block: 'set-and-close', from: 7, to: 8 },
  ],
  'branded-fusion-aluber': [
    { block: 'aluber-spark', from: 1, to: 2 },
    { block: 'fusion-chain', from: 3, to: 3 },
    { block: 'set-and-close', from: 4, to: 7 },
  ],
  'high-spirits-fuwalos': [
    { block: 'high-spirits-swap', from: 1, to: 1 },
    { block: 'albaz-jump', from: 2, to: 3 },
    { block: 'saint-relay', from: 4, to: 6 },
    { block: 'end-phase-recycle', from: 7, to: 8 },
    { block: 'opening-bridge', from: 9, to: 14 },
    { block: 'mirrorjade-lock', from: 15, to: 18 },
  ],
  'high-spirits-shrouded': [
    { block: 'high-spirits-swap', from: 1, to: 1 },
    { block: 'albaz-jump', from: 2, to: 3 },
    { block: 'saint-relay', from: 4, to: 5 },
    { block: 'end-phase-recycle', from: 6, to: 9 },
    { block: 'opening-bridge', from: 10, to: 15 },
    { block: 'mirrorjade-lock', from: 16, to: 19 },
  ],
  'high-spirits-albaz': [
    { block: 'high-spirits-swap', from: 1, to: 1 },
    { block: 'albaz-jump', from: 2, to: 3 },
    { block: 'sword-lock', from: 4, to: 5 },
    { block: 'end-phase-recycle', from: 6, to: 9 },
    { block: 'opening-bridge', from: 10, to: 15 },
    { block: 'mirrorjade-lock', from: 16, to: 18 },
  ],
  'nadir-servant': [
    { block: 'albaz-jump', from: 1, to: 5 },
    { block: 'end-phase-recycle', from: 6, to: 11 },
    { block: 'set-and-close', from: 12, to: 13 },
  ],
};

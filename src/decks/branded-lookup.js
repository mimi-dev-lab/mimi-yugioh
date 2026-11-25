// 烙印的起手速查：手里有哪张关键卡走哪条路线；缺某张卡时改走哪条。是数据，只能指向 branded-routes.js 里已有、引擎重放过的路线（id）。
// 每一项只写路线数据里站得住的事：key 卡、「搭」的卡、「手里有」的卡都必须在被指向的那条路线的起手（hand）里，「缺」的卡必须不在；
// 怎么说（how）只写那条路线的步骤里真有的东西。这些由 src/lookup.js 的 checkLookup 查，服务启动时有问题就起不来。
import { C } from './branded-routes.js';

// card：关键卡；routes：拿到它走哪条（with：这条路线还要搭的那张卡，单卡起手不写）；
// fallbacks：缺 lack、手里有 have（一张或几张）时改走 route，how 是为什么走得通
export const LOOKUP = [
  {
    card: C.albaz,
    routes: [{ route: 'white-albaz' }],
    fallbacks: [
      { lack: C.albaz, have: [C.whiteSaint], route: 'white-saint', how: '白之圣女②解放自己，从卡组特殊召唤白之落胤，之后接上白之落胤线的中段' },
      { lack: C.albaz, have: [C.nadir], route: 'nadir-servant', how: '天底的使徒发动时从卡组检索白之落胤；这条线不做融合，靠墓地的融合怪兽在结束阶段铺场' },
      { lack: C.albaz, have: [C.highSpirits, C.fuwalos], route: 'high-spirits-fuwalos', how: '烙印之气炎给对方看软绵雀精、弃它，从卡组检索白之落胤，之后和白之落胤线一样' },
    ],
  },
  {
    card: C.brandedFusion,
    routes: [{ route: 'branded-fusion' }],
    fallbacks: [
      { lack: C.brandedFusion, have: [C.aluber], route: 'aluber', how: '通常召唤阿卢绯尔，从卡组检索烙印融合，之后和烙印融合线几乎一样，第二次融合用阿卢绯尔当素材' },
      { lack: C.brandedFusion, have: [C.albaz], route: 'white-albaz', how: '白之落胤线全程不用烙印融合' },
    ],
  },
  {
    card: C.aluber,
    routes: [{ route: 'aluber' }],
    fallbacks: [
      { lack: C.aluber, have: [C.brandedFusion], route: 'branded-fusion', how: '烙印融合线不用阿卢绯尔，第二次融合用墓地的阿尔白斯之落胤当素材' },
    ],
  },
  {
    card: C.nadir,
    routes: [{ route: 'nadir-servant' }],
    fallbacks: [
      { lack: C.nadir, have: [C.albaz], route: 'white-albaz', how: '手里直接有白之落胤，不用靠天底的使徒检索它' },
    ],
  },
  {
    card: C.whiteSaint,
    routes: [{ route: 'white-saint' }],
    fallbacks: [
      { lack: C.whiteSaint, have: [C.albaz], route: 'white-albaz', how: '白之落胤②会从卡组特殊召唤白之圣女，不用手牌里有它' },
    ],
  },
  {
    card: C.highSpirits,
    routes: [{ route: 'high-spirits-fuwalos', with: C.fuwalos }, { route: 'high-spirits-shrouded', with: C.shroudedAlbion }],
    fallbacks: [
      { lack: C.fuwalos, have: [C.highSpirits, C.shroudedAlbion], route: 'high-spirits-shrouded', how: '烙印之气炎给对方看黑衣龙 阿尔比昂、从额外卡组把灰烬龙 落尘劣种送去墓地，再弃黑衣龙 阿尔比昂检索白之落胤；前几步和白之落胤线一样，中段不同：黑衣龙之艾克利西亚除外自己，改叫铁兽鸟 墨丘利耶，结束阶段由灰烬龙从卡组特殊召唤库妸㽗；终场多一只铁兽鸟 墨丘利耶' },
      { lack: C.shroudedAlbion, have: [C.highSpirits, C.fuwalos], route: 'high-spirits-fuwalos', how: '烙印之气炎给对方看软绵雀精、从额外卡组把击铁龙 猎宝机装送去墓地，再弃软绵雀精检索白之落胤；拿到白之落胤之后的步骤和白之落胤线完全一样' },
    ],
  },
];

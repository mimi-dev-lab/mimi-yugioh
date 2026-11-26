// 烙印的「目标终场」（试用功能 endgame，规格 #45 的第 4 块）：几个值得倒推的终场，每个写清需要哪几块积木、哪几张关键卡。和卡表、路线步骤、积木分开放。
// 终场 = 一条路线走完的场面；它「是哪个终场」由提供打断的那几张卡定（路线的 end.breakers，引擎重放得出）。字段：
//   id        英文 id
//   name      终场的名字（提供打断的几张卡）
//   route     走到这个终场的路线 id（必须是 branded-routes.js 里的路线；别的路线也走到同一组卡时页面会另列出来，不用写）
//   blocks    这条路线用的积木 id，按先后（必须和 branded-blocks.js 里这条路线的分段一致，测试查）
//   keyCards  终场里提供打断的卡的密码（必须和这条路线重放出的终场一致，测试查）；起手卡取这条路线的 needs，不重复写
//   seen      500 手随机起手模拟里，最好终场的场上或手里有这几张卡的手数（docs/opening-analysis.jsonl，测试重算）
// 怎么挑：把每条路线的终场按提供打断的卡合并，按打断数从多到少、同打断数按 seen 从多到少排，去掉 seen 是 0 的（500 手一手都没搜到，学了也用不上），取前 3。
// 这条规则由 src/endgame.js 的 rankEndgames 算，测试用它核对下面三项就是前 3、先后一样。缺一块积木时的补法不写在这里：由 src/endgame.js 从路线和积木的数据里推。
import { C } from './branded-routes.js';

const SIM_HANDS = 500; // seen 是从多少手里数的（docs/opening-analysis.jsonl 的行数，测试查）

const LIST = [
  {
    id: 'trap-trio', name: '落胤与圣女＋烙印断罪＋卡尔塔西亚',
    route: 'nadir-servant', blocks: ['albaz-jump', 'end-phase-recycle', 'set-and-close'],
    keyCards: [C.cartesia, C.virtuous, C.retribution], seen: 69,
  },
  {
    id: 'sword-mirrorjade', name: '三英的相剑师＋冰剑龙＋卡尔塔西亚',
    route: 'high-spirits-albaz', blocks: ['high-spirits-swap', 'albaz-jump', 'sword-lock', 'end-phase-recycle', 'opening-bridge', 'mirrorjade-lock'],
    keyCards: [C.sword, C.mirrorjade, C.cartesia], seen: 29,
  },
  {
    id: 'mercurier-mirrorjade', name: '铁兽鸟 墨丘利耶＋冰剑龙＋卡尔塔西亚',
    route: 'high-spirits-shrouded', blocks: ['high-spirits-swap', 'albaz-jump', 'saint-relay', 'end-phase-recycle', 'opening-bridge', 'mirrorjade-lock'],
    keyCards: [C.mercourier, C.mirrorjade, C.cartesia], seen: 14,
  },
];

export const ENDGAMES = { hands: SIM_HANDS, list: LIST };

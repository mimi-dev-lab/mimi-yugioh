// 决策树分岔问题的措辞（覆盖表；树本身由脚本生成在 branded-tree.js）。键是卡的密码，没写的卡用默认「手里有「卡名」吗？」。
// 只在写出来比默认更清楚时才覆盖；每个键都得是树里问到的卡（测试查）。
import { C } from './branded-routes.js';

export const QUESTIONS = {
  [C.albaz]: '手里有白之落胤吗？（只算白之落胤本身，阿尔白斯之落胤另问）',
  [C.brandedFusion]: '手里有烙印融合吗？',
  [C.highSpirits]: '手里有烙印之气炎吗？（它要给对方看一只怪兽）',
  [C.aluber]: '手里有阿卢绯尔（惨绝戏之导化）吗？',
};

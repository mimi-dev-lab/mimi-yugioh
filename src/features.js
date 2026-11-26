// 试用功能的开关（规格 #45 的试用块：资源账本、地铁图、终场倒推、决策树）。默认全开；服务启动时用环境变量 YUGIOH_FEATURES_OFF（逗号分隔的名字）关掉其中几个。
// 关掉的功能，接口里不带它的数据，插件页面看不到那一块，别的功能不受影响。读环境变量只在 src/server.js，这里只有名字和默认值。
export const FEATURE_NAMES = ['ledger', 'subway', 'endgame', 'tree'];

// off 是要关的名字列表；不认识的名字抛错（拼错了不能悄悄不生效）
export function featuresFrom(off = []) {
  for (const name of off) if (!FEATURE_NAMES.includes(name)) throw new Error(`没有这个功能开关：${name}（有 ${FEATURE_NAMES.join('、')}）`);
  return Object.fromEntries(FEATURE_NAMES.map((name) => [name, !off.includes(name)]));
}

export const ALL_ON = featuresFrom();

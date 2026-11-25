// opening-sim.js 和 opening-replay.js 共用的两样东西：引擎数据目录的默认值、报错退出。
// 引擎目录默认 ~/.cache/mimi-yugioh/engine（和测试、./ci 同一处），不是 YUGIOH_DATA 下的 engine/：离线分析不碰用户数据目录 ~/.mimi-yugioh（DESIGN「随机起手模拟」）。
import { homedir } from 'node:os';
import { join } from 'node:path';

// 命令行 --engine 优先，其次环境变量 YUGIOH_ENGINE，最后是缓存目录
export const engineDirFrom = (flag) => flag ?? process.env.YUGIOH_ENGINE ?? join(homedir(), '.cache/mimi-yugioh/engine');

// 给某个脚本做它的 fail：错误信息前缀脚本名，退出码 2（参数不对、读不了输入）
export const failerFor = (script) => (message) => { console.error(`${script}: ${message}`); process.exit(2); };

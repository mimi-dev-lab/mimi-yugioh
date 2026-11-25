// 重放一手搜出的路线（#37）：从 JSONL 里取那一手的步骤，在引擎里用这手的起手和种子重放，打出终场、打断数，并和记录对照；一致退出 0，不一致退出 1，找不到那一手或参数不对退出 2。
// 用法：node scripts/opening-replay.js --seed 种子 | --index 第几手 [--file docs/opening-analysis.jsonl] [--engine 引擎数据目录]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BRANDED } from '../src/decks/branded.js';
import { openEngine } from '../src/duel-session.js';
import { openEngineFiles } from '../src/engine-files.js';
import { checkReplay, replayRow } from '../src/opening-sim.js';
import { JSONL_PATH, parseJsonl } from '../src/opening-report.js';
import { cardOf } from '../src/route-view.js';
import { engineDirFrom, failerFor } from './opening-common.js';

const fail = failerFor('opening-replay');
const { values } = parseArgs({ options: { seed: { type: 'string' }, index: { type: 'string' }, file: { type: 'string' }, engine: { type: 'string' } } });
if ((values.seed === undefined) === (values.index === undefined)) fail('要给 --seed 或 --index 其中一个');
const file = values.file ?? JSONL_PATH;
let rows;
try { rows = parseJsonl(readFileSync(file, 'utf8')); } catch (e) { fail(`读不了 ${file}：${e.message}`); }
const row = values.seed !== undefined ? rows.find((r) => r.seed === Number(values.seed)) : rows.find((r) => r.index === Number(values.index));
if (!row) fail(`${file} 里没有${values.seed !== undefined ? `种子 ${values.seed}` : `第 ${values.index} 手`}`);

const engineDir = engineDirFrom(values.engine);
const engine = await openEngine(openEngineFiles(engineDir));
const names = (codes) => (codes.length ? codes.map((code) => cardOf(BRANDED, code).md).join('、') : '无');
const noPath = row.searchValue === null || !row.steps?.length ? checkReplay(row, null) : [];
if (noPath.length) {
  console.log(`种子 ${row.seed}（第 ${row.index} 手），起手：${names(row.hand)}\n不一致：${noPath.join('；')}`);
  process.exit(1);
}
const replay = await replayRow(engine, BRANDED, row);
console.log(`种子 ${row.seed}（第 ${row.index} 手），起手：${names(row.hand)}`);
console.log(`重放搜索的路线：${row.steps.length} 步${row.steps.map((s, i) => `\n  ${i + 1}. ${s.text}`).join('')}`);
console.log(`终场：怪兽区 ${names(replay.end.monsters)}；魔陷区 ${names(replay.end.spellTraps)}；手牌 ${names(replay.end.hand)}`);
console.log(`重放：场面值 ${replay.value}，打断数 ${replay.interrupts}，剩余手牌 ${replay.handLeft}${replay.scriptErrors.length ? `，引擎脚本报错 ${replay.scriptErrors.length} 条` : ''}`);
console.log(`记录：搜索值 ${row.searchValue}，最好值 ${row.value}（来源 ${row.source}），${row.capped ? '超上限' : '搜完'}`);
const problems = checkReplay(row, replay);
if (problems.length) {
  console.log(`不一致：${problems.join('；')}`);
  process.exit(1);
}
console.log('一致：重放出的场面值和记录相同');

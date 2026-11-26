// 决策树的生成（#52）：路线数据 + 500 手 JSONL → src/decks/branded-tree.js（不手改；测试核对它等于这里重算的）。
// 用法：node scripts/decision-tree.js [JSONL] [--out src/decks/branded-tree.js]；改了路线、速查或重跑了 500 手之后跑一遍，再跑 scripts/opening-report.js 更新报告。
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BRANDED } from '../src/decks/branded.js';
import { JSONL_PATH, parseJsonl } from '../src/opening-report.js';
import { buildTree, treeFileText } from '../src/tree.js';

const { values, positionals } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true });
const rows = parseJsonl(readFileSync(positionals[0] ?? JSONL_PATH, 'utf8'));
const out = values.out ?? 'src/decks/branded-tree.js';
writeFileSync(out, treeFileText(buildTree(BRANDED, rows)));
console.log(`${rows.length} 手 → ${out}`);

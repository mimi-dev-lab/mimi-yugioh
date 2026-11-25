// 随机起手模拟的报告（#37）：JSONL → docs/opening-analysis.md，纯计算，同一份 JSONL 同一份报告（算法在 src/opening-report.js）。
// 用法：node scripts/opening-report.js [JSONL…] [--out docs/opening-analysis.md] [--merge 合并后的JSONL]
//   JSONL   一个或几个（opening-sim.js --shard 的各分片），默认 docs/opening-analysis.jsonl；同一个 index 出现两次报错
//   --out   报告写到哪，默认 docs/opening-analysis.md
//   --merge 把读进来的行按 index 排好，写成一份 JSONL（几个分片合成提交的那份）
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BRANDED } from '../src/decks/branded.js';
import { JSONL_PATH, MD_PATH, buildReport, parseJsonl } from '../src/opening-report.js';
import { failerFor } from './opening-common.js';

const { values, positionals } = parseArgs({ options: { out: { type: 'string' }, merge: { type: 'string' } }, allowPositionals: true });
const inputs = positionals.length ? positionals : [JSONL_PATH];
const fail = failerFor('opening-report');
let rows; let report;
try {
  rows = parseJsonl(inputs.map((f) => readFileSync(f, 'utf8')).join('\n'));
  report = buildReport(rows, BRANDED);
} catch (e) {
  fail(e.message);
}
if (values.merge) writeFileSync(values.merge, rows.map((r) => `${JSON.stringify(r)}\n`).join(''));
writeFileSync(values.out ?? MD_PATH, report);
console.log(`${rows.length} 手 → ${values.out ?? MD_PATH}${values.merge ? `，合并的 JSONL 写到 ${values.merge}` : ''}`);

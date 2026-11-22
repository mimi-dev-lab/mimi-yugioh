// 按日文卡名从百鸽 ygocdb 查密码和 Master Duel 简体中文名（md_name），打印成 JSON。
// 用法：node scripts/fetch-card-names.js <名字文件，每行一个日文卡名>。联网，只在整理卡组数据时手动跑；结果写死进 src/decks/ 的数据里，服务不联网。
import { readFileSync } from 'node:fs';

const names = readFileSync(process.argv[2], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const out = {};
for (const jp of names) {
  const res = await fetch(`https://ygocdb.com/api/v0/?search=${encodeURIComponent(jp)}`);
  if (!res.ok) throw new Error(`${jp}: HTTP ${res.status}`);
  const hit = (await res.json()).result.find((r) => r.jp_name === jp);
  if (!hit) throw new Error(`${jp}: ygocdb 里没有日文名完全一致的卡`);
  out[jp] = { id: hit.id, md_name: hit.md_name, cn_name: hit.cn_name, en_name: hit.en_name };
}
console.log(JSON.stringify(out, null, 2));

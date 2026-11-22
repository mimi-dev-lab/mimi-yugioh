// 把卡组用到的卡图（几十张）从 NAS 复制到数据目录的 images/：走 ssh（launchd 下的进程用不了 NAS 的挂载，见家仓技能 home-lan-devices）。
// 不用 rsync：NAS 上的 rsync 经 ssh 起服务端会报 Permission denied（2026-11-23 实测，ssh 本身和 tar 都通），所以先 ssh 里 stat 读大小，
// 再用 ssh + tar 只拉缺的和大小不对的。手动跑，不进 ./ci，服务不联网。卡图不进仓（仓是公开的）；卡名写在图下方用 md_name（cn 卡图上印的是另一套译名）。
//   node scripts/sync-card-images.js [--dry-run] [目标目录]
// 目标目录默认 $YUGIOH_DATA/images，再默认 ~/.mimi-yugioh/images。NAS 地址和目录可用 YUGIOH_NAS、YUGIOH_NAS_IMAGES 换。
// --dry-run：不复制，打出要复制的文件数和 NAS 上没有的卡号。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BRANDED } from '../src/decks/branded.js';

const NAS = process.env.YUGIOH_NAS ?? 'lifan222@192.168.10.124';
const NAS_IMAGES = process.env.YUGIOH_NAS_IMAGES ?? 'mimi-projects/mimi-yugioh/images/cn'; // 相对 NAS 上用户的家目录
const SSH = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10'];
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dest = args.find((a) => !a.startsWith('--')) ?? join(process.env.YUGIOH_DATA ?? join(homedir(), '.mimi-yugioh'), 'images');
const die = (msg) => { console.error(msg); process.exit(1); };

const codes = [...new Set([...BRANDED.main, ...BRANDED.extra].map((c) => c.code))].sort((a, b) => a - b);
const names = codes.map((c) => `${c}.webp`);
// 远端每个文件一行「名字 大小」；没有的文件 stat 报错（退出码非 0 照常），所以只看 stdout
const remote = spawnSync('ssh', [...SSH, NAS, `cd ${NAS_IMAGES} && stat -c '%n %s' ${names.join(' ')}`], { encoding: 'utf8' });
if (remote.error || (remote.status !== 0 && !remote.stdout)) die(`连不上 NAS（${NAS}）：${(remote.stderr ?? remote.error?.message ?? '').trim()}`);
const sizes = new Map(remote.stdout.split('\n').filter(Boolean).map((l) => l.split(' ')).map(([n, s]) => [n, Number(s)]));
const missing = names.filter((n) => !sizes.has(n));
const local = (n) => join(dest, n);
const todo = names.filter((n) => sizes.has(n) && !(existsSync(local(n)) && statSync(local(n)).size === sizes.get(n)));

console.log(`${dryRun ? '[dry-run] ' : ''}卡组用到 ${names.length} 张卡图；NAS 上有 ${sizes.size} 张；${dryRun ? '要复制' : '复制'} ${todo.length} 个文件 → ${dest}（其余已是最新）`);
if (missing.length) console.log(`NAS 上没有：${missing.join(', ')}`);
if (!dryRun && todo.length) {
  mkdirSync(dest, { recursive: true });
  const pull = spawnSync('sh', ['-c', `ssh ${SSH.join(' ')} "$1" "cd $2 && tar cf - $3" | tar xf - -C "$4"`, 'sync', NAS, NAS_IMAGES, todo.join(' '), dest], { encoding: 'utf8' });
  if (pull.status !== 0) die(`复制失败：${(pull.stderr ?? '').trim()}`);
  const bad = todo.filter((n) => !existsSync(local(n)) || statSync(local(n)).size !== sizes.get(n));
  if (bad.length) die(`复制后大小对不上：${bad.join(', ')}`);
  console.log(`已复制 ${todo.length} 个，大小都和 NAS 一致`);
}
process.exitCode = missing.length ? 2 : 0;

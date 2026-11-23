// 部署到 mini（在仓里跑）：把一个提交（默认 origin/main）整体换进部署目录、装好依赖，写 DEPLOYED，只重启自己的 launchd 任务，最后跑冒烟。
// 用法：node scripts/deploy.js [--dry-run] [<提交>]。退出码跟冒烟（scripts/smoke.js）。
// --dry-run：只导出到系统临时目录并逐文件核对，再打出真跑时会做的事（换哪个目录、plist 变没变、重启哪个任务）；不写部署目录、不装依赖、不碰 launchd、不冒烟。步骤见 DESIGN.md「在 mini 上常驻」，上线顺序见 README「上线清单」
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { smoke } from './smoke.js';

const LABEL = 'jp.lifan.mimi-yugioh';
const REPO = fileURLToPath(new URL('..', import.meta.url));
// 下面几个位置只给测试换，默认是 mini 上的真实位置
const DEST = process.env.YUGIOH_DEPLOY_DIR ?? join(homedir(), 'Library/Application Support/MimiYugioh');
const AGENTS = process.env.YUGIOH_AGENTS_DIR ?? join(homedir(), 'Library/LaunchAgents');
const LAUNCHCTL = process.env.YUGIOH_LAUNCHCTL ?? 'launchctl';
const NPM = process.env.YUGIOH_NPM ?? 'npm';

const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
const step = (what) => console.log(`部署 ${what}`);

async function filesUnder(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) out.push(relative(dir, join(entry.parentPath, entry.name)));
  }
  return out.sort();
}

// 导出的内容和提交逐文件一致（字节相同、不多不少）才换上
async function verify(dir, sha) {
  const want = git('ls-tree', '-r', '--name-only', sha).split('\n').filter(Boolean).sort();
  const got = await filesUnder(dir);
  const missing = want.filter((f) => !got.includes(f));
  const extra = got.filter((f) => !want.includes(f));
  if (missing.length || extra.length) {
    throw new Error(`导出的文件和 ${sha.slice(0, 7)} 不一样：少了 ${missing.join('、') || '无'}；多了 ${extra.join('、') || '无'}`);
  }
  for (const file of want) {
    const committed = execFileSync('git', ['show', `${sha}:${file}`], { cwd: REPO, maxBuffer: 1 << 26 });
    if (!committed.equals(await readFile(join(dir, file)))) throw new Error(`导出的 ${file} 和 ${sha.slice(0, 7)} 里的不一样`);
  }
}

// 导出到部署目录旁边的新目录，核对后整体换上（仓里删掉的文件在部署目录里也就没了）；中途失败就把原来的放回去
async function swapIn(sha) {
  const fresh = `${DEST}.new-${process.pid}`;
  const old = `${DEST}.old-${process.pid}`;
  try {
    await mkdir(fresh, { recursive: true });
    execFileSync('/bin/sh', ['-c', 'git archive "$0" | tar -x -C "$1"', sha, fresh], { cwd: REPO });
    await verify(fresh, sha);
    step('导出的文件和提交逐个一致');
    // 依赖装在部署目录里（git archive 不带 node_modules）：只装 dependencies、不跑安装脚本，和 ./ci 的 npm ci 一样；装不上就停在这，原来的那份没动
    execFileSync(NPM, ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--silent'], { cwd: fresh, stdio: 'inherit' });
    step('依赖装好了（npm ci --omit=dev）');
    await writeFile(join(fresh, 'DEPLOYED'), `${sha}\n`);
    await mkdir(dirname(DEST), { recursive: true });
    const hadOld = await rename(DEST, old).then(() => true, (error) => { if (error.code === 'ENOENT') return false; throw error; });
    try {
      await rename(fresh, DEST);
    } catch (error) {
      if (hadOld) await rename(old, DEST);
      throw error;
    }
    await rm(old, { recursive: true, force: true });
  } finally {
    await rm(fresh, { recursive: true, force: true });
  }
}

// 只动自己的任务：plist（取刚部署的那份，不取本地 checkout 的）变了才重新装，否则 kickstart -k 重启
async function restart() {
  const target = `gui/${process.getuid()}`;
  const installed = join(AGENTS, `${LABEL}.plist`);
  const deployed = join(DEST, 'launchd', `${LABEL}.plist`);
  if ((await readFile(deployed)).equals(await readFile(installed).catch(() => Buffer.alloc(0)))) {
    execFileSync(LAUNCHCTL, ['kickstart', '-k', `${target}/${LABEL}`]);
    step(`plist 没变，重启了 ${LABEL}`);
    return;
  }
  await mkdir(AGENTS, { recursive: true });
  await copyFile(deployed, installed);
  try {
    execFileSync(LAUNCHCTL, ['bootout', `${target}/${LABEL}`], { stdio: 'ignore' });
  } catch { /* 还没装过 */ }
  // bootout 回来时任务可能还没完全卸掉，bootstrap 失败就隔一秒再试，最多三次
  for (let i = 1; ; i++) {
    try {
      execFileSync(LAUNCHCTL, ['bootstrap', target, installed]);
      break;
    } catch (error) {
      if (i === 3) throw error;
      execFileSync('/bin/sleep', ['1']);
    }
  }
  step(`plist 变了，重新装了 ${LABEL}`);
}

// 演练：导出到临时目录核对一遍，说清真跑时会怎么换、重启；什么都不留下
async function dryRun(sha) {
  const fresh = await mkdtemp(join(tmpdir(), 'yugioh-deploy-dry-'));
  try {
    execFileSync('/bin/sh', ['-c', 'git archive "$0" | tar -x -C "$1"', sha, fresh], { cwd: REPO });
    await verify(fresh, sha);
    step('[dry-run] 导出的文件和提交逐个一致');
    const same = (await readFile(join(fresh, 'launchd', `${LABEL}.plist`))).equals(await readFile(join(AGENTS, `${LABEL}.plist`)).catch(() => Buffer.alloc(0)));
    step(`[dry-run] 真跑会：npm ci --omit=dev 后整体换进 ${DEST}，写 DEPLOYED = ${sha}`);
    step(`[dry-run] 真跑会：${same ? `plist 没变，kickstart -k ${LABEL}` : `装 ${join(AGENTS, `${LABEL}.plist`)}，bootout + bootstrap ${LABEL}`}，再跑冒烟`);
  } finally {
    await rm(fresh, { recursive: true, force: true });
  }
  return 0;
}

async function main(args) {
  const dry = args.includes('--dry-run');
  const ref = args.find((a) => !a.startsWith('--')) ?? 'origin/main';
  if (ref.startsWith('origin/')) git('fetch', '-q', 'origin'); // 部署 origin 上的东西前先 fetch，不部署过时的
  const sha = git('rev-parse', `${ref}^{commit}`);
  if (dry) { step(`${sha.slice(0, 7)}（${ref}）到 ${DEST}`); return dryRun(sha); }
  step(`${sha.slice(0, 7)}（${ref}）到 ${DEST}`);
  await swapIn(sha);
  step(`换上了，DEPLOYED = ${sha}`);
  await restart();
  return smoke(sha);
}

process.exitCode = await main(process.argv.slice(2)).catch((error) => {
  console.log(`部署失败：${error.message}`);
  return 1;
});

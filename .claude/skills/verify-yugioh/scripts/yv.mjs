#!/usr/bin/env node
// 游戏王服务的验证实例：起一个临时的服务（PORT=0、临时数据目录、自己编的卡图），查它健不健康，用完清掉。
// 插件页由同目录的 plugin-verify 驱动（它先调这里的 launch）。用法见上一级的 SKILL.md。
//   yv launch [--images <目录>]       起服务，打出「就绪：<地址>」「run: <id>」「证据目录：<目录>」。--images：复制这个目录里的真卡图（<卡号>.webp），默认用编的单色小图
//   yv doctor [--run <id>]          这次值不值得驱动（只读；退出码 0 = 值得）
//   yv cleanup [--run <id>] [--all] 停这次起的服务（pid 和命令行都对得上才停），删临时目录，证据留下
//   yv api <路径> [--run <id>]       只读的第二个视图：GET 这次的服务（例如 /deck），打出 JSON
//   yv runs                         还有哪些
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRANDED } from '../../../../src/decks/branded.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
const SERVER = join(REPO, 'src/server.js');
const RUNS = join(tmpdir(), 'yugioh-verify'); // 每次一个子目录：数据目录、服务日志
const EVIDENCE = process.env.YV_EVIDENCE ?? join(homedir(), 'work/personal/.verify/yugioh'); // 证据：cleanup 不删
const REAL_DATA = join(homedir(), '.mimi-yugioh');
const LIVE_PORT = 4519;
// 编的卡图：1×1 的无损 webp（单色），不是真卡图；真的用 --images 给目录
const FAKE_WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');

const die = (msg) => { console.error(`yv: ${msg}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const cmdline = (pid) => { try { return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; } };

function parse(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) opts[a.slice(2)] = true;
    else { opts[a.slice(2)] = next; i++; }
  }
  return { opts, pos };
}

const ids = () => (existsSync(RUNS) ? readdirSync(RUNS).filter((d) => existsSync(join(RUNS, d, 'run.json'))) : []);
function runOf(opts) {
  const all = ids();
  const id = opts.run ?? (all.length === 1 ? all[0] : die(all.length ? `有 ${all.length} 次在跑（${all.join(', ')}），用 --run <id> 指定` : '没有在跑的实例，先 yv launch'));
  const file = join(RUNS, id, 'run.json');
  if (!existsSync(file)) die(`没有这次：${id}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function waitFor(fn, ms, what) {
  const until = Date.now() + ms;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* 还没好 */ }
    if (Date.now() > until) throw new Error(`等了 ${ms / 1000} 秒还没好：${what}`);
    await sleep(200);
  }
}

async function launch(opts) {
  await mkdir(RUNS, { recursive: true });
  const dir = await mkdtemp(join(RUNS, `${new Date().toISOString().slice(0, 10)}-`));
  const id = basename(dir);
  const evidence = join(EVIDENCE, id);
  await mkdir(evidence, { recursive: true });
  const data = join(dir, 'data');
  const images = join(data, 'images');
  mkdirSync(images, { recursive: true });
  const codes = [...new Set([...BRANDED.main, ...BRANDED.extra].map((c) => c.code))];
  for (const code of codes) {
    const real = opts.images ? join(String(opts.images), `${code}.webp`) : null;
    if (real && existsSync(real)) copyFileSync(real, join(images, `${code}.webp`));
    else if (!opts.images) writeFileSync(join(images, `${code}.webp`), FAKE_WEBP);
  }
  const serverLog = join(dir, 'server.log');
  const out = openSync(serverLog, 'a');
  const server = spawn(process.execPath, [SERVER], { cwd: REPO, detached: true, stdio: ['ignore', out, out],
    env: { ...process.env, PORT: '0', YUGIOH_DATA: data, YUGIOH_ENGINE: process.env.YUGIOH_ENGINE ?? join(homedir(), '.cache/mimi-yugioh/engine') } });
  server.unref();
  try {
    const url = await waitFor(async () => readFileSync(serverLog, 'utf8').match(/http:\/\/127\.0\.0\.1:\d+/)?.[0], 15_000, `服务打出地址（看 ${serverLog}）`);
    await waitFor(async () => (await fetch(`${url}/health`)).ok, 15_000, '/health 200');
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    const run = { id, dir, evidence, url, repo: REPO, sha, launchedAt: new Date().toISOString(), data, serverLog, server: server.pid };
    await writeFile(join(dir, 'run.json'), JSON.stringify(run, null, 2));
    await writeFile(join(evidence, 'run.json'), JSON.stringify(run, null, 2));
    console.log(`就绪：${url}（卡图 ${opts.images ? '真的' : '编的'}，代码 ${sha}）\nrun: ${id}\n证据目录：${evidence}`);
  } catch (error) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* 已经停了 */ }
    rmSync(dir, { recursive: true, force: true });
    die(error.message);
  }
}

async function doctor(opts) {
  const run = runOf(opts);
  let bad = 0;
  const check = (ok, what) => { if (!ok) bad++; console.log(`${ok ? '通过' : '失败'} ${what}`); };
  check(alive(run.server) && cmdline(run.server).includes(SERVER), `服务进程 ${run.server} 活着，跑的是本仓的 src/server.js`);
  const env = (() => { try { return execFileSync('ps', ['eww', '-o', 'command=', '-p', String(run.server)], { encoding: 'utf8' }); } catch { return ''; } })();
  check(env.includes(`YUGIOH_DATA=${run.data}`) && !env.includes(`YUGIOH_DATA=${REAL_DATA}`), `数据目录是这次的临时目录（${run.data}），不是 ~/.mimi-yugioh`);
  check(Number(new URL(run.url).port) !== LIVE_PORT, `端口不是线上的 ${LIVE_PORT}`);
  const res = await fetch(`${run.url}/health`).catch(() => null);
  check(res?.ok, '/health 200');
  console.log(bad ? `不健康：${bad} 项失败。yv cleanup --run ${run.id} 后重新 launch` : `健康：${run.url}（run ${run.id}）`);
  process.exitCode = bad ? 1 : 0;
}

async function stop(run) {
  if (alive(run.server) && cmdline(run.server).includes(SERVER)) {
    try { process.kill(-run.server, 'SIGTERM'); } catch { process.kill(run.server, 'SIGTERM'); }
    for (let i = 0; i < 50 && alive(run.server); i++) await sleep(100);
  }
  if (existsSync(run.serverLog) && existsSync(run.evidence)) await copyFile(run.serverLog, join(run.evidence, 'server.log'));
  rmSync(run.dir, { recursive: true, force: true });
  console.log(`停了 ${run.id}，证据留在 ${run.evidence}`);
}

async function cleanup(opts) {
  if (opts.all) {
    for (const id of ids()) await stop(JSON.parse(readFileSync(join(RUNS, id, 'run.json'), 'utf8')));
    return;
  }
  await stop(runOf(opts));
}

async function api(opts, [path]) {
  if (!path?.startsWith('/')) die('yv api 要带 / 开头的路径');
  const res = await fetch(`${runOf(opts).url}${path}`);
  console.log(JSON.stringify(await res.json(), null, 1));
  process.exitCode = res.ok ? 0 : 1;
}

const [cmd, ...rest] = process.argv.slice(2);
const { opts, pos } = parse(rest);
const COMMANDS = { launch, doctor, cleanup, api: () => api(opts, pos), runs: () => console.log(ids().join('\n') || '（没有）') };
if (!COMMANDS[cmd]) die('子命令：launch [--images 目录] | doctor | api /路径 | cleanup [--all] | runs（都可带 --run <id>）');
await COMMANDS[cmd](opts);

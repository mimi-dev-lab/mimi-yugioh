// 线上冒烟（只读）：部署的版本对不对、本机的游戏王服务能不能打开、卡组一览读不读得到、卡组用到的卡图在不在。不写数据目录。
// 用法：node scripts/smoke.js [--sha <期望的 sha>]（不给就是 origin/main）。见 README「上线清单」与 DESIGN.md「在 mini 上常驻」
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRANDED } from '../src/decks/branded.js';

// 下面几个位置只给测试换，默认是 mini 上的真实位置。服务只听本机，没有别的入口（给用户的入口是 Hermes 里的插件）
const DEPLOY_DIR = process.env.YUGIOH_DEPLOY_DIR ?? join(homedir(), 'Library/Application Support/MimiYugioh');
const BASE = (process.env.YUGIOH_SMOKE_BASE ?? 'http://127.0.0.1:4519').replace(/\/+$/, '');
const LOG = process.env.YUGIOH_LOG ?? join(homedir(), 'Library/Logs/mimi-yugioh.log');
const LOG_WARN_BYTES = 10 * 1024 * 1024; // 日志不轮转；超过 10 MB 提醒，到时候再定
const WAIT_MS = 30_000; // 刚 kickstart 完服务要一会儿才起来：第一条请求连不上时最多等这么久
const REQUEST_MS = 10_000;
const REPO = fileURLToPath(new URL('..', import.meta.url));
const CODES = [...new Set([...BRANDED.main, ...BRANDED.extra].map((c) => c.code))];

async function fetchJson(path, waitForStart = false) {
  const until = Date.now() + (waitForStart ? WAIT_MS : 0);
  for (;;) {
    try {
      const res = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(REQUEST_MS) });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* 不是 JSON：当作没有内容 */ }
      return { status: res.status, body };
    } catch (error) {
      if (Date.now() >= until) return { status: 0, body: { error: error.cause?.code ?? error.message } };
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export async function smoke(sha) {
  const lines = [];
  const say = (kind, what) => { lines.push(kind); console.log(`${kind} ${what}`); };
  const deployed = (await readFile(join(DEPLOY_DIR, 'DEPLOYED'), 'utf8').catch(() => '')).trim();
  if (deployed === sha) say('通过', `部署的版本 ${sha.slice(0, 7)}`);
  else say('失败', `部署的版本是 ${deployed.slice(0, 7) || '（没有 DEPLOYED）'}，期望 ${sha.slice(0, 7)}`);

  // /health 是服务活着；/deck 是卡组一览（页面的第一个页签）；/routes 是展开路线的列表（引擎数据在、路线都重放得通才是 200）
  const checks = [
    ['health', (b) => b?.ok === true || '回应不是 {ok:true}'],
    ['deck', (b) => (Array.isArray(b?.cards) && b.cards.length > 0) || '200 但没有卡组一览'],
    // 起手速查（lookup）和路线在同一个接口里：要有，指向的路线都得在列表里
    ['routes', (b) => {
      if (!Array.isArray(b?.routes) || b.routes.length === 0) return '200 但没有路线';
      if (!Array.isArray(b.lookup) || b.lookup.length === 0) return '200 但没有起手速查';
      const dangling = b.lookup.flatMap((e) => [...e.routes, ...e.fallbacks.map((f) => f.route)]).filter((t) => !b.routes.some((r) => r.id === t.id));
      return dangling.length === 0 || `起手速查指向不存在的路线：${dangling.map((t) => t.id).join('、')}`;
    }],
  ];
  for (const [i, [path, ok]] of checks.entries()) {
    const began = Date.now();
    const { status, body } = await fetchJson(path, i === 0);
    const verdict = status === 200 ? ok(body) : null;
    if (status !== 200) say('失败', `${BASE}/${path} ${status || '连不上'}${body?.error ? `：${body.error}` : ''}`);
    else if (verdict !== true) say('失败', `${BASE}/${path} ${verdict}`);
    else say('通过', `${BASE}/${path} 200（${Date.now() - began} ms${path === 'deck' ? `，${body.cards.length} 种卡` : path === 'routes' ? `，${body.routes.length} 条路线、${body.lookup?.length} 张速查关键卡` : ''}）`);
  }

  // 卡图经服务读（和插件页面走的是同一条路）：卡组用到的每张都要有；缺了页面只是改写卡名，所以只提醒
  const missing = [];
  for (const code of CODES) if ((await fetchJson(`card-image?code=${code}`)).status !== 200) missing.push(code);
  if (missing.length === 0) say('通过', `卡图 ${CODES.length}/${CODES.length} 张都在`);
  else say('提醒', `卡图缺 ${missing.length}/${CODES.length} 张（${missing.join('、')}）：跑 node scripts/sync-card-images.js`);

  const size = await stat(LOG).then((s) => s.size).catch(() => null);
  if (size != null && size > LOG_WARN_BYTES) say('提醒', `服务日志 ${LOG} 有 ${(size / 1024 / 1024).toFixed(1)} MB，超过 10 MB`);

  const failed = lines.filter((k) => k === '失败').length;
  console.log(failed ? `冒烟没过：${failed} 项失败` : `冒烟通过（${lines.filter((k) => k === '提醒').length} 项提醒）`);
  return failed ? 1 : 0;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const at = process.argv.indexOf('--sha');
  const sha = at > 0 ? process.argv[at + 1] : execFileSync('git', ['rev-parse', 'origin/main'], { cwd: REPO, encoding: 'utf8' }).trim();
  process.exitCode = await smoke(sha);
}

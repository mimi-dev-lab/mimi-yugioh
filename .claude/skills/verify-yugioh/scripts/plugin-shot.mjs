#!/usr/bin/env node
// plugin-verify 的 shot 用的浏览器脚本：用本机的无头 Chromium（不装依赖）打开临时网页工作区，像用户一样从侧栏点「游戏王」（默认是「总览」页签），
// 可选地切页签、开始 / 继续一手、点一张卡、点它的操作、回答引擎的提示、结束回合，写 <name>.png / .txt / .json（网络记录）。
// 用法：node plugin-shot.mjs '<json：{ base, cookies:[[name,value]…], evidence, name, design, tab, start, resume, select, do, answer, end, compare }>'
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const opts = JSON.parse(process.argv[2]);
// 假数据里服务端的「现在」（东京 2026-10-30）：seed.mjs、test/helpers.js 的 NOW 同一天
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromeBinary() {
  if (process.env.XV_CHROME) return process.env.XV_CHROME;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const d of dirs) {
    const bin = join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (existsSync(bin)) return bin;
  }
  throw new Error('找不到无头 Chromium：设 XV_CHROME，或 `npx playwright install chromium-headless-shell`');
}

const profile = mkdtempSync(join(tmpdir(), 'yugioh-plugin-chrome-'));
const chrome = spawn(chromeBinary(), ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const done = () => { chrome.kill('SIGKILL'); rmSync(profile, { recursive: true, force: true }); };
process.on('exit', done);

async function main() {
  let cdpPort;
  for (let i = 0; i < 100 && !cdpPort; i++) {
    try { cdpPort = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || null; } catch { await sleep(200); }
  }
  if (!cdpPort) throw new Error('Chromium 的调试端口没起来');
  const target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (fn, arg) => {
    const r = await send('Runtime.evaluate', { expression: `(${fn})(${JSON.stringify(arg ?? null)})`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`页面脚本出错：${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  const until = async (fn, arg, ms, what) => {
    const end = Date.now() + ms;
    for (;;) {
      if (await evaluate(fn, arg).catch(() => false)) return;
      if (Date.now() > end) throw new Error(`等了 ${ms / 1000} 秒还没好：${what}`);
      await sleep(300);
    }
  };
  // 按可见名字（aria-label 或文字）点按钮；点到了返回 true
  const clickButton = (name) => evaluate((n) => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || x.innerText || '').trim() === n);
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, name);

  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  const view = opts.design ? { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false } : { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false };
  await send('Emulation.setDeviceMetricsOverride', view);
  for (const [name, value] of opts.cookies) await send('Network.setCookie', { name, value, url: `${opts.base}/`, httpOnly: true });
  await send('Page.navigate', { url: `${opts.base}/#/` });

  // 点「游戏王」之前的请求是网页工作区自己加载的（它向 Google Fonts 要一个字体）；之后的才是插件该负责的
  // 网页工作区先盖一层 CONNECTING，连上后端才有侧栏：等到「游戏王」出现并点中
  await until(() => !!document.body && document.body.innerText.length > 0, null, 60000, '网页工作区打开');
  const t0 = await evaluate(() => performance.now());
  await until(async () => {
    const find = () => [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || x.innerText || '').trim() === '游戏王');
    if (!find()) {
      const show = document.querySelector('button[aria-label="Show sidebar"]');
      if (show) show.click();
      await new Promise((r) => setTimeout(r, 500));
    }
    const b = find();
    if (!b) return false;
    b.click();
    return true;
  }, null, 120000, '侧栏出现「游戏王」（网页工作区连上了后端）');

  // 页面的根是 .yg；画完 = data-ready 为真（卡信息和进行中的一手都问过了）
  const drawn = () => until(() => { const x = document.querySelector('.yg'); return !!x && x.dataset.ready === 'true'; }, null, 60000, '游戏王页面画出来');
  await drawn();
  if (opts.design) { await clickButton('Hide sidebar'); await sleep(1500); }
  const fail = async (e) => {
    await writeFile(`${opts.evidence}/${opts.name}.failed.txt`, await evaluate(() => document.querySelector('.yg')?.innerText ?? '(没有页面)'));
    throw e;
  };
  if (opts.tab && opts.tab !== '首页') {
    if (!(await clickButton(opts.tab))) throw new Error(`页面上没有页签「${opts.tab}」`);
    await until((t) => [...document.querySelectorAll('.yg-tab.on')].some((b) => b.innerText === t), opts.tab, 10000, `「${opts.tab}」页签打开`);
  }
  const playing = (what) => until(() => !!document.querySelector('.yg-play .yg-time'), null, 30000, what);
  if (opts.start) {
    if (!(await clickButton('开始一手'))) throw new Error('页面上没有「开始一手」');
    await playing('进入展开中屏');
  }
  if (opts.resume) {
    if (!(await clickButton('继续这一手'))) throw new Error('页面上没有「继续这一手」（服务里没有进行中的一手？）');
    await playing('进入展开中屏');
  }
  // 点桌面上一张卡（按卡名：aria-label）；操作按钮在右边的面板里，按钮名是操作名
  if (opts.select) {
    const clicked = await evaluate((n) => { const b = [...document.querySelectorAll('.yg-board button.yg-card')].find((x) => x.getAttribute('aria-label') === n); if (!b) return false; b.click(); return true; }, opts.select);
    if (!clicked) throw new Error(`桌面上没有卡「${opts.select}」`);
    await until((n) => document.querySelector('.yg-detail .yg-title')?.innerText === n, opts.select, 10000, `详情区显示「${opts.select}」`);
  }
  if (opts.do) {
    const rows = () => document.querySelectorAll('.yg-table .td.dim').length;
    const before = await evaluate(rows);
    if (!(await clickButton(opts.do))) throw new Error(`详情区没有操作「${opts.do}」`);
    try {
      // 点完要么出了引擎的提示，要么记录多了一步（不用提示就办完的操作）
      await until((n) => !!document.querySelector('.yg-modal') || document.querySelectorAll('.yg-table .td.dim').length > n, before, 20000, '操作生效（出提示或记录多一行）');
    } catch (e) { await fail(e); }
  }
  // 回答引擎的提示：每次取第一个选项（要选多张时点够 min 张再点「确定」；逐张选时取到「选完」），最多 N 个
  if (opts.answer) {
    for (let i = 0; i < opts.answer; i++) {
      const has = await evaluate(() => !!document.querySelector('.yg-modal [role=dialog][aria-label="引擎的选择"]'));
      if (!has) break;
      const done = await evaluate(() => {
        const box = document.querySelector('.yg-modal [role=dialog][aria-label="引擎的选择"]');
        const title = box.querySelector('.yg-prompt-title').innerText;
        const confirm = [...box.querySelectorAll('button')].find((b) => /^确定/.test(b.innerText) && !b.disabled);
        if (confirm) { confirm.click(); return title; }
        const finish = [...box.querySelectorAll('button')].find((b) => b.innerText === '选完');
        const opt = box.querySelector('button.yg-opt:not(.sel)');
        const need = title.match(/选 (\d+)/);
        if (need && box.querySelectorAll('button.yg-opt.sel').length < Number(need[1]) && opt) { opt.click(); return `${title}（点一张）`; }
        // 连锁、是否发动：取「不发动」（取第一个会越连越长）；其余取「选完」或第一个选项
        const decline = [...box.querySelectorAll('button')].find((b) => b.innerText === '不发动');
        const first = decline ?? finish ?? opt ?? box.querySelector('button.yg-btn.primary, button.yg-btn.wide, button.yg-btn');
        if (!first) return null;
        first.click();
        return title;
      });
      if (!done) break;
      await sleep(500);
    }
    await until(() => !document.querySelector('.yg-modal [aria-label="引擎的选择"]'), null, 20000, '引擎的提示都答完了').catch(fail);
  }
  if (opts.end) {
    if (!(await clickButton('结束回合'))) throw new Error('页面上没有「结束回合」');
    await until(() => !!document.querySelector('[aria-label="结算"]') || !!document.querySelector('.yg-error'), null, 30000, '结算出来（或报错）').catch(fail);
  }
  const overflowX = await evaluate(() => { const x = document.querySelector('.yg'); return x.scrollWidth > x.clientWidth + 1; });
  const height = await evaluate(() => document.querySelector('.yg').scrollHeight);
  await sleep(600);
  // --design 保持 1280×860 的视口（和设计稿同样大）；平时把视口拉到内容那么高
  if (!opts.design) { await send('Emulation.setDeviceMetricsOverride', { ...view, height: Math.min(height + 200, 4000) }); await sleep(500); }
  await until(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, 5000, '动画走完').catch(() => {});
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${opts.evidence}/${opts.name}.png`, Buffer.from(shot.data, 'base64'));
  await writeFile(`${opts.evidence}/${opts.name}.txt`, await evaluate(() => document.querySelector('.yg').innerText));
  const all = await evaluate((t) => performance.getEntriesByType('resource').map((e) => [e.name, e.startTime >= t]), t0);
  const urls = all.filter(([, after]) => after).map(([u]) => u);
  const foreign = urls.filter((u) => !u.startsWith(`${opts.base}/`));
  const hostLoad = all.filter(([u, after]) => !after && !u.startsWith(`${opts.base}/`)).map(([u]) => u);
  await writeFile(`${opts.evidence}/${opts.name}.json`, JSON.stringify({ overflowX, requests: urls.length, foreign, hostLoad, urls }, null, 1));
  // 并排对照：设计稿 PNG 在左、这张在右，用 data: 地址在一个页面里拼好再截一张
  if (opts.compare) {
    const design = (await readFile(opts.compare)).toString('base64');
    const html = `<meta charset="utf-8"><body style="margin:0;background:#222;display:flex;gap:16px;padding:16px;font:14px sans-serif;color:#ddd"><div><div style="margin-bottom:6px">设计稿 design-r3</div><img style="width:1280px;display:block" src="data:image/png;base64,${design}"></div><div><div style="margin-bottom:6px">真 Hermes 里的页面</div><img style="width:1280px;display:block" src="data:image/png;base64,${shot.data}"></div></body>`;
    await send('Emulation.setDeviceMetricsOverride', { width: 2608, height: 940, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
    await sleep(1500);
    const both = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`${opts.evidence}/${opts.name}-compare.png`, Buffer.from(both.data, 'base64'));
  }
}

main().then(() => process.exit(0), async (e) => {
  console.error(`plugin-shot: ${e.message}`);
  process.exit(1);
});

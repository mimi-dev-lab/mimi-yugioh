#!/usr/bin/env node
// plugin-verify 的 shot 用的浏览器脚本：用本机的无头 Chromium（不装依赖）打开临时网页工作区，像用户一样从侧栏点「游戏王」（默认是「卡组一览」页签），
// 可选地切页签、在卡组一览里点一张卡、在展开路线里点一条路线并翻到某一步（点「下一步」或按右方向键），写 <name>.png / .txt / .json（网络记录）。
// 用法：node plugin-shot.mjs '<json：{ base, cookies:[[name,value]…], evidence, name, design, mobile, tab, select, route, step, keys, compare }>'
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // --design：设计稿的 1280×860；--mobile：手机宽（390×844，按手机模拟）；都不给：1600 宽的桌面
const view = opts.mobile ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : opts.design ? { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false } : { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false };
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

  // 页面的根是 .yg；画完 = data-ready 为真（卡组一览问过了）
  const drawn = () => until(() => { const x = document.querySelector('.yg'); return !!x && x.dataset.ready === 'true'; }, null, 60000, '游戏王页面画出来');
  await drawn();
  if (opts.design || opts.mobile) { await clickButton('Hide sidebar'); await sleep(1500); }
  // 网页工作区自己的「Update ready」提示框会盖住页面顶部：有就点它的关闭（只点那个框里不是「See what's new」的按钮），不碰别的
  await evaluate(() => {
    const box = [...document.querySelectorAll('div')].find((d) => d.innerText?.startsWith('Update ready') && d.querySelector('button'));
    [...(box?.querySelectorAll('button') ?? [])].find((b) => !/See what/.test(b.innerText))?.click();
  });
  const fail = async (e) => {
    await writeFile(`${opts.evidence}/${opts.name}.failed.txt`, await evaluate(() => document.querySelector('.yg')?.innerText ?? '(没有页面)'));
    throw e;
  };
  if (opts.tab && opts.tab !== '卡组一览') {
    if (!(await clickButton(opts.tab))) throw new Error(`页面上没有页签「${opts.tab}」`);
    await until((t) => [...document.querySelectorAll('.yg-tab.on')].some((b) => b.innerText === t), opts.tab, 10000, `「${opts.tab}」页签打开`);
  }
  // 卡组一览里点一张卡（按卡名：aria-label），等说明区出这张卡
  if (opts.select) {
    const clicked = await evaluate((n) => { const b = [...document.querySelectorAll('.yg-deck button.yg-tile')].find((x) => x.getAttribute('aria-label') === n); if (!b) return false; b.click(); return true; }, opts.select);
    if (!clicked) await fail(new Error(`卡组一览里没有卡「${opts.select}」`));
    await until((n) => document.querySelector('.yg-detail .yg-title')?.innerText === n, opts.select, 10000, `说明区显示「${opts.select}」`).catch(fail);
  }
  // 展开路线：按 id 或名字点列表里的一条，再从第 1 步一步步点「下一步」（--keys：按右方向键）走到第 N 步或最后一步
  if (opts.route) {
    if (!opts.tab || opts.tab === '卡组一览') {
      if (!(await clickButton('展开路线'))) throw new Error('页面上没有页签「展开路线」');
      await until(() => [...document.querySelectorAll('.yg-tab.on')].some((b) => b.innerText === '展开路线'), null, 10000, '「展开路线」页签打开');
    }
    await until((r) => document.querySelectorAll('.yg-route').length > 0, null, 30000, '路线列表出来').catch(fail);
    const opened = await evaluate((r) => { const b = [...document.querySelectorAll('button.yg-route')].find((x) => x.dataset.routeId === r || (x.getAttribute('aria-label') || '').includes(r)); if (!b) return false; b.click(); return true; }, opts.route);
    if (!opened) await fail(new Error(`路线列表里没有「${opts.route}」`));
    await until(() => !!document.querySelector('.yg-player'), null, 60000, '播放页出来').catch(fail);
    if (opts.step) {
      const total = await evaluate(() => Number(document.querySelector('.yg-player').dataset.total));
      const target = opts.step === 'last' ? total : Number(opts.step);
      if (!Number.isInteger(target) || target < 1 || target > total) await fail(new Error(`--step ${opts.step} 不在 1–${total} 里`));
      for (;;) {
        const now = await evaluate(() => Number(document.querySelector('.yg-player').dataset.step));
        if (now >= target) break;
        if (opts.keys) {
          for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
        } else if (!(await clickButton('下一步'))) await fail(new Error(`第 ${now} 步上点不了「下一步」`));
        await until((n) => Number(document.querySelector('.yg-player').dataset.step) > n, now, 10000, `翻到第 ${now + 1} 步`).catch(fail);
      }
    }
  }
  const overflowX = await evaluate(() => { const x = document.querySelector('.yg'); return x.scrollWidth > x.clientWidth + 1 || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; });
  const height = await evaluate(() => document.querySelector('.yg').scrollHeight);
  await sleep(600);
  // --design 保持 1280×860 的视口（和设计稿同样大），--mobile 保持一屏手机；平时把视口拉到内容那么高
  if (!opts.design && !opts.mobile) { await send('Emulation.setDeviceMetricsOverride', { ...view, height: Math.min(height + 200, 4000) }); await sleep(500); }
  else if (opts.mobile && opts.route) { await send('Emulation.setDeviceMetricsOverride', { ...view, height: Math.min(height + 100, 5000) }); await sleep(500); }
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

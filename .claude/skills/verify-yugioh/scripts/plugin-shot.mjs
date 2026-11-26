#!/usr/bin/env node
// plugin-verify 的 shot 用的浏览器脚本：用本机的无头 Chromium（不装依赖）打开临时网页工作区，像用户一样从侧栏点「游戏王」（默认是「卡组一览」页签），
// 可选地切页签、在卡组一览里点一张卡、在展开路线里点一条路线、或在起手速查里点一条路线（--jump，跳到那条路线的播放页）并翻到某一步（点「下一步」或按右方向键），写 <name>.png / .txt / .json（网络记录）。
// 用法：node plugin-shot.mjs '<json：{ base, cookies:[[name,value]…], evidence, name, design, mobile, tab, select, route, jump, step, keys, compare, compareLabel, compareWith }>'
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
  const jsErrors = []; // 页面和动画框里没接住的 JS 异常
  const cdpRequests = []; // 这个标签页和它的子框架（路线动画的框架）发的每一个请求：[网址, 来自哪个会话]
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    if (d.method === 'Network.requestWillBeSent') cdpRequests.push([d.params.request.url, d.sessionId ? 'child' : 'page']);
    if (d.method === 'Runtime.exceptionThrown') jsErrors.push(String(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 300));
    if (d.method === 'Target.attachedToTarget') { send('Network.enable', {}, d.params.sessionId).catch(() => {}); send('Runtime.enable', {}, d.params.sessionId).catch(() => {}); }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
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
  await send('Runtime.enable');
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  // --design：设计稿的 1280×860；--mobile：手机宽（390×844，按手机模拟）；都不给：1600 宽的桌面
const view = opts.mobile ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : opts.design ? { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false } : { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false };
  await send('Emulation.setDeviceMetricsOverride', view);
  if (opts.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
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

  cdpRequests.length = 0; // 从这里起的请求才算插件和它的动画框架发的
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
    await until((n) => document.querySelector(matchMedia('(max-width: 760px), (hover: none)').matches ? '.yg-pop .yg-title' : '.yg-detail .yg-title')?.innerText === n, opts.select, 10000, `说明区（手机宽是弹窗）显示「${opts.select}」`).catch(fail);
  }
  // 展开路线：按 id 或名字点列表里的一条，播放页默认停在起手（第 0 步），再一步步点「下一步」（--keys：按右方向键）走到第 N 步（0 或「起手」就是不动）或最后一步
  // 起手速查：点速查里指向这条路线的第一个按钮（data-route-id），应当跳到「展开路线」页签里这条路线的播放页（起手，第 0 步）
  if (opts.jump) {
    if (opts.tab !== '起手速查') throw new Error('--jump 要和 --tab 起手速查 一起用');
    await until(() => document.querySelectorAll('.yg-lookup .yg-jump').length > 0, null, 30000, '速查出来').catch(fail);
    const jumped = await evaluate((r) => { const b = [...document.querySelectorAll('.yg-lookup .yg-jump')].find((x) => x.dataset.routeId === r); if (!b) return false; b.click(); return true; }, opts.jump);
    if (!jumped) await fail(new Error(`速查里没有指向「${opts.jump}」的路线`));
    await until(() => !!document.querySelector('.yg-player') && [...document.querySelectorAll('.yg-tab.on')].some((b) => b.innerText === '展开路线'), null, 60000, '跳到展开路线的播放页').catch(fail);
  }
  if (opts.route) {
    if (!opts.tab || opts.tab === '卡组一览') {
      if (!(await clickButton('展开路线'))) throw new Error('页面上没有页签「展开路线」');
      await until(() => [...document.querySelectorAll('.yg-tab.on')].some((b) => b.innerText === '展开路线'), null, 10000, '「展开路线」页签打开');
    }
    await until((r) => document.querySelectorAll('.yg-route').length > 0, null, 30000, '路线列表出来').catch(fail);
    const opened = await evaluate((r) => { const b = [...document.querySelectorAll('button.yg-route')].find((x) => x.dataset.routeId === r || (x.getAttribute('aria-label') || '').includes(r)); if (!b) return false; b.click(); return true; }, opts.route);
    if (!opened) await fail(new Error(`路线列表里没有「${opts.route}」`));
    await until(() => !!document.querySelector('.yg-player'), null, 60000, '播放页出来').catch(fail);
  }
  // 播放页的动画框架就绪（路线动画页装好、播放器 ready）才算打开
  if (opts.route || opts.jump) await until(() => document.querySelector('.yg-player')?.dataset.ready === 'true', null, 120000, '路线动画就绪').catch(fail);
  const idle = (ms = 60000) => until(() => document.querySelector('.yg-player').dataset.mode === 'idle', null, ms, '动画播完停住');
  if (opts.step) {
    if (!opts.route && !opts.jump) throw new Error('--step 要和 --route 或 --jump 一起用');
    const total = await evaluate(() => Number(document.querySelector('.yg-player').dataset.total));
    const target = opts.step === 'last' ? total : opts.step === '起手' ? 0 : Number(opts.step);
    if (!Number.isInteger(target) || target < 0 || target > total) await fail(new Error(`--step ${opts.step} 不在 0（起手）–${total} 里`));
    for (;;) {
      const now = await evaluate(() => Number(document.querySelector('.yg-player').dataset.step));
      if (now >= target) break;
      if (opts.keys) {
        for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
      } else if (!(await clickButton('下一步'))) await fail(new Error(`第 ${now} 步上点不了「下一步」`));
      await until((n) => Number(document.querySelector('.yg-player').dataset.step) > n, now, 10000, `翻到第 ${now + 1} 步`).catch(fail);
      await idle().catch(fail); // 下一步：播这一步的动画，播完停住
    }
  }
  // --click-step N：点步号条上的第 N 步（跳到那一步的结束帧，不播）；--play-all：点「连播」，等它播到终场停住，记下用了多久
  if (opts.clickStep !== undefined && opts.clickStep !== null) {
    const label = opts.clickStep === '起手' ? '起手' : `第 ${opts.clickStep} 步`;
    if (!(await clickButton(label))) await fail(new Error(`步号条上没有「${label}」`));
    await until((n) => Number(document.querySelector('.yg-player').dataset.step) === n, opts.clickStep === '起手' ? 0 : Number(opts.clickStep), 10000, `跳到${label}`).catch(fail);
    await idle(10000).catch(fail);
  }
  let playedMs = null;
  if (opts.playAll) {
    const t = Date.now();
    if (!(await clickButton('连播'))) await fail(new Error('点不了「连播」'));
    await until(() => document.querySelector('.yg-player').dataset.mode === 'auto', null, 10000, '开始连播').catch(fail);
    await until(() => { const p = document.querySelector('.yg-player'); return p.dataset.mode === 'idle' && p.dataset.step === p.dataset.total; }, null, 240000, '连播到终场').catch(fail);
    playedMs = Date.now() - t;
  }
  // --next-mid MS：（和 --step K 一起）到了第 K 步后点「下一步」，等 MS 毫秒（动画还在播）就往下走去截图：页面上的步号条和动画框都是真的中间状态
  if (opts.nextMid) {
    const now = await evaluate(() => Number(document.querySelector('.yg-player').dataset.step));
    if (!(await clickButton('下一步'))) await fail(new Error(`第 ${now} 步上点不了「下一步」`));
    await until((n) => Number(document.querySelector('.yg-player').dataset.step) > n, now, 10000, `翻到第 ${now + 1} 步`).catch(fail);
    await evaluate(() => document.querySelector('.yg-stage').scrollIntoView({ block: 'start' }));
    await sleep(opts.nextMid);
  }
  // --stage-at K:比例：把动画跳到第 K 步（0 = 起手）动画的这个比例处停住（取中间帧用）
  if (opts.stageAt) {
    const [k, frac] = opts.stageAt.split(':').map(Number);
    await evaluate(() => document.querySelector('.yg-stage').scrollIntoView({ block: 'start' }));
    await evaluate(({ k, frac }) => {
      const st = document.querySelector('.yg-stage'); const a = st.dataset.starts.split(',').map(Number); const e = st.dataset.ends.split(',').map(Number);
      st.querySelector('iframe').contentWindow.postMessage({ src: 'yg-host', cmd: 'seek', t: a[k] + (e[k] - a[k]) * frac }, '*');
    }, { k, frac });
    await sleep(1800);
  }
  // 卡片弹窗：--hover 卡名（桌面：鼠标移到那张卡上）或 --tap 卡名（手机：触摸点一下），范围 --within CSS（默认整页）；等弹窗 .yg-pop 出这张卡
  const aim = opts.hover ?? opts.tap ?? opts.hoverAnim ?? opts.tapAnim;
  const tapping = opts.tap ?? opts.tapAnim;
  let pop = null;
  if (aim) {
    // --hover-anim / --tap-anim 卡名：向动画框架要「现在看得见的每张卡在哪」（yg-rects），再用真鼠标 / 真触摸点过去，走完整条悬停链路
    const animAt = async (name) => {
      await evaluate(() => document.querySelector('.yg-stage').scrollIntoView({ block: 'start' }));
      await sleep(400);
      const cards = await evaluate(() => new Promise((resolve) => {
        const on = (e) => { if (e.data && e.data.type === 'yg-rects') { removeEventListener('message', on); resolve(e.data.cards); } };
        addEventListener('message', on);
        document.querySelector('.yg-stage iframe').contentWindow.postMessage({ src: 'yg-host', cmd: 'rects' }, '*');
        setTimeout(() => resolve(null), 8000);
      }));
      const c = cards?.find((x) => x.md === name);
      const f = await evaluate(() => { const r = document.querySelector('.yg-stage iframe').getBoundingClientRect(); return { x: r.left, y: r.top }; }); // 框架在页面里的位置
      return c ? { x: f.x + c.rect.x + c.rect.w / 2, y: f.y + c.rect.y + c.rect.h / 2 } : null;
    };
    const at = await (opts.hoverAnim || opts.tapAnim ? animAt(aim) : evaluate(({ name, within }) => {
      const root = document.querySelector(within || '.yg');
      const el = [...(root?.querySelectorAll('[data-card-code]') ?? [])].find((x) => x.dataset.cardMd === name);
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, { name: aim, within: opts.within })).then((v) => v ?? fail(new Error(`页面上没有卡「${aim}」（范围 ${opts.within ?? '.yg'}）`)));
    await sleep(300);
    if (tapping) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x - 3, y: at.y - 3 });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    }
    const popped = () => until((n) => document.querySelector('.yg-pop .yg-title')?.innerText === n, aim, 4000, `弹窗显示「${aim}」`);
    // 鼠标事件偶尔在页面刚滚完时被吞：没出来就把鼠标移开再移回来，重试两次
    for (let attempt = 0; ; attempt++) {
      try { await popped(); break; } catch (e) {
        if (attempt >= 2 || tapping) await fail(e);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
        await sleep(300);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x - 4, y: at.y - 2 });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
      }
    }
    await sleep(300);
    pop = await evaluate(() => { const r = document.querySelector('.yg-pop').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight, text: document.querySelector('.yg-pop').innerText }; });
  }
  // 路线动画里的作用标签：向动画框架要看得见的卡和作用标签的位置（yg-rects），每块标签要贴在自己那张卡上（水平在卡的范围里，竖直在卡的上沿和下沿 +30 px 之间：守备横放的卡标签在横着的卡下面一点），记进 .json 的 stage
  const stageRects = () => evaluate(() => new Promise((resolve) => {
    const fr = document.querySelector('.yg-stage iframe');
    if (!fr) return resolve(null);
    const on = (e) => { if (e.data && e.data.type === 'yg-rects') { removeEventListener('message', on); resolve({ cards: e.data.cards, roles: e.data.roles ?? [] }); } };
    addEventListener('message', on);
    fr.contentWindow.postMessage({ src: 'yg-host', cmd: 'rects' }, '*');
    setTimeout(() => resolve(null), 8000);
  }));
  let stage = null;
  if (opts.route || opts.jump) {
    const r = await stageRects();
    if (r) {
      const scale = r.cards[0] ? r.cards[0].rect.w / 80 : 1; // 动画缩放：卡宽 80 px 在页面里有多宽
      const detached = r.roles.filter((t) => {
        const c = r.cards.find((x) => x.card === t.card);
        if (!c) return true;
        const cx = t.rect.x + t.rect.w / 2;
        return !(cx >= c.rect.x && cx <= c.rect.x + c.rect.w && t.rect.y >= c.rect.y - 1 && t.rect.y + t.rect.h <= c.rect.y + c.rect.h + 30 * scale);
      });
      stage = { roles: r.roles.map((t) => ({ ...t, md: r.cards.find((x) => x.card === t.card)?.md })), cards: r.cards, detached };
      if (opts.requireRoles && !r.roles.length) await fail(new Error('动画里没有看得见的作用标签'));
      if (detached.length) await fail(new Error(`作用标签没贴在卡上：${detached.map((t) => `${t.code} ${t.tags}`).join('、')}`));
    }
  }
  // --hover-role / --tap-role 卡名：把真鼠标移到（手机：点）动画里这张卡的作用标签上，等页面上出原因的小框 .yg-roletip
  let roleTip = null;
  const roleAim = opts.hoverRole ?? opts.tapRole;
  if (roleAim) {
    await evaluate(() => document.querySelector('.yg-stage').scrollIntoView({ block: 'start' }));
    await sleep(400);
    const r = await stageRects();
    const card = r?.cards.find((c) => c.md === roleAim);
    const tag = card && r.roles.find((t) => t.card === card.card);
    if (!tag) await fail(new Error(`动画里「${roleAim}」没有看得见的作用标签`));
    const f = await evaluate(() => { const b = document.querySelector('.yg-stage iframe').getBoundingClientRect(); return { x: b.left, y: b.top }; });
    const at = { x: f.x + tag.rect.x + tag.rect.w / 2, y: f.y + tag.rect.y + tag.rect.h / 2 };
    if (opts.tapRole) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x - 3, y: at.y - 3 });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    }
    await until(() => !!document.querySelector('.yg-roletip'), null, 5000, `「${roleAim}」的作用标签出原因`).catch(fail);
    await sleep(300);
    roleTip = await evaluate(() => { const el = document.querySelector('.yg-roletip'); const b = el.getBoundingClientRect(); return { text: el.innerText, left: b.left, top: b.top, right: b.right, bottom: b.bottom, vw: innerWidth, vh: innerHeight }; });
    roleTip.chip = { tags: tag.tags, x: at.x, y: at.y };
  }
  // 播放页的步号条和按钮有没有被网页工作区的窗口头部（或别的东西）盖住：每个按钮的上沿、下沿各取一点，elementFromPoint 要落在按钮自己身上
  const bar = await evaluate(() => {
    const btns = [...document.querySelectorAll('.yg-controls button')];
    if (!btns.length) return null;
    const hidden = btns.filter((b) => {
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2;
      return [r.top + 2, r.bottom - 2].some((y) => !b.contains(document.elementFromPoint(x, y)));
    }).map((b) => b.innerText.trim());
    const first = btns[0].getBoundingClientRect();
    return { clear: hidden.length === 0, hidden, firstTop: first.top, firstBottom: first.bottom };
  });
  const overflowX = await evaluate(() => { const x = document.querySelector('.yg'); return x.scrollWidth > x.clientWidth + 1 || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; });
  const height = await evaluate(() => document.querySelector('.yg').scrollHeight);
  await sleep(600);
  // --design 保持 1280×860 的视口（和设计稿同样大），--mobile 保持一屏手机；平时把视口拉到内容那么高
  if (aim || roleAim) { /* 弹窗开着：不改视口，不然鼠标和弹窗都变了 */ }
  else if (!opts.design && !opts.mobile) { await send('Emulation.setDeviceMetricsOverride', { ...view, height: Math.min(height + 200, 4000) }); await sleep(500); }
  else if (opts.mobile && (opts.route || opts.jump || (opts.tab === '起手速查' || opts.tab === '术语表'))) { await send('Emulation.setDeviceMetricsOverride', { ...view, height: Math.min(height + 100, 5000) }); await sleep(500); }
  await until(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, 5000, '动画走完').catch(() => {});
  // --clip-stage：只截动画框（场面特写），按 2 倍像素
  const clip = opts.clipStage ? await evaluate(() => { const st = document.querySelector('.yg-stage'); st.scrollIntoView({ block: 'start' }); const b = st.querySelector('iframe').getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height, scale: 2 }; }) : null;
  if (clip) await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  await writeFile(`${opts.evidence}/${opts.name}.png`, Buffer.from(shot.data, 'base64'));
  await writeFile(`${opts.evidence}/${opts.name}.txt`, await evaluate(() => document.querySelector('.yg').innerText));
  // --close：关弹窗（手机点「× 关上」，再点开按 Esc；桌面按 Esc），弹窗要没了
  let closed = null;
  if (opts.close) {
    if (!pop) throw new Error('--close 要和 --hover 或 --tap 一起用');
    const gone = () => evaluate(() => !document.querySelector('.yg-pop'));
    const esc = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); await sleep(300); };
    closed = {};
    if (opts.tap) {
      closed.button = (await evaluate(() => { const b = document.querySelector('.yg-pop button'); if (!b || b.innerText.trim() !== '× 关上') return false; b.click(); return true; })) && (await sleep(300), await gone());
      const at = await evaluate((n) => { const el = [...document.querySelectorAll('[data-card-code]')].find((x) => x.dataset.cardMd === n); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, aim);
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await until(() => !!document.querySelector('.yg-pop'), null, 5000, '再点一次弹窗又出来');
    }
    await esc();
    closed.esc = await gone();
  }
  const all = await evaluate((t) => performance.getEntriesByType('resource').map((e) => [e.name, e.startTime >= t]), t0);
  const urls = all.filter(([, after]) => after).map(([u]) => u);
  const foreign = urls.filter((u) => !u.startsWith(`${opts.base}/`));
  const hostLoad = all.filter(([u, after]) => !after && !u.startsWith(`${opts.base}/`)).map(([u]) => u);
  const local = (u) => u.startsWith(`${opts.base}/`) || u.startsWith('data:') || u.startsWith('about:');
  const cdp = { total: cdpRequests.length, foreign: cdpRequests.filter(([u]) => !local(u)).map(([u]) => u), dataUrls: cdpRequests.filter(([u]) => u.startsWith('data:')).length };
  if (opts.netFile) await writeFile(opts.netFile, `${cdpRequests.map(([u, from]) => `${from}\t${u.startsWith('data:') ? `${u.slice(0, 60)}… (${u.length} 字符)` : u}${local(u) ? '' : '\t<-- 非本地'}`).join('\n')}\n`);
  await writeFile(`${opts.evidence}/${opts.name}.json`, JSON.stringify({ overflowX, bar, pop, closed, stage, roleTip, requests: urls.length, foreign, hostLoad, urls, cdp, jsErrors, playedMs }, null, 1));
  // 并排对照：设计稿 PNG 在左（标签 --compare-label，默认「样子稿」），这张和 --compare-with 列的同一证据目录里先截的几张在右，上下排；在一个 data: 页面里拼好再截一张
  if (opts.compare) {
    const b64 = async (f) => (await readFile(f)).toString('base64');
    const right = [[opts.name, shot.data], ...await Promise.all((opts.compareWith ?? []).map(async (n) => [n, await b64(`${opts.evidence}/${n}.png`)]))];
    const fig = (label, data) => `<div><div style="margin-bottom:6px">${label}</div><img style="width:1280px;display:block" src="data:image/png;base64,${data}"></div>`;
    const html = `<meta charset="utf-8"><body style="margin:0;background:#222;display:flex;align-items:flex-start;gap:16px;padding:16px;font:14px sans-serif;color:#ddd">`
      + `<div>${fig(opts.compareLabel || '样子稿', await b64(opts.compare))}</div>`
      + `<div style="display:flex;flex-direction:column;gap:16px">${right.map(([n, d]) => fig(`真 Hermes 里的页面：${n}`, d)).join('')}</div></body>`;
    await send('Emulation.setDeviceMetricsOverride', { width: 2608, height: 940, deviceScaleFactor: 1, mobile: false });
    // 三张 PNG 的 data: 地址太长，Chromium 不肯整页导航过去：先到 about:blank，再把页面内容直接塞进去
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(500);
    const { frameTree } = await send('Page.getFrameTree');
    await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
    await sleep(1500);
    const h = await evaluate(() => document.documentElement.scrollHeight);
    await send('Emulation.setDeviceMetricsOverride', { width: 2608, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    const both = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`${opts.evidence}/${opts.name}-compare.png`, Buffer.from(both.data, 'base64'));
  }
}

main().then(() => process.exit(0), async (e) => {
  console.error(`plugin-shot: ${e.message}`);
  process.exit(1);
});

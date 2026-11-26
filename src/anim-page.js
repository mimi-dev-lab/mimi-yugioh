// 路线动画的页面（纯函数）：把合成页（anim-render.js）放进 <hyperframes-player>，外面再包一层「外壳页」，整个做成 data: 地址，
// 由插件页放进 SDK 的 SandboxedFrame（网页工作区的 CSP 不许插件页自己跑内联脚本，见 DESIGN.md「路线动画」）。
//
// 外壳页和插件页之间的消息（插件页 → 外壳页用 postMessage，外壳页 → 插件页用 parent.postMessage）：
//   插件页 → 外壳页  { src: 'yg-host', cmd: 'seek', t }              跳到某一刻（停住）
//                    { src: 'yg-host', cmd: 'playRange', from, to }  从 from 播到 to，播完停住
//                    { src: 'yg-host', cmd: 'pause' }                暂停
//                    { src: 'yg-host', cmd: 'rects' }                问现在每张看得见的卡在哪（验证脚本用）
//   外壳页 → 插件页  { src: 'yg-guest', type: 'yg-ready', duration }  播放器就绪
//                    yg-time { t }（播放中每帧一次、seek 之后一次）、yg-ended { t }（播到 to）、yg-error { detail }
//                    yg-card-hover { code, rect } / yg-card-leave { code } / yg-card-tap { code, rect }（rect 已换算成外壳页视口里的像素，
//                    插件页再加上框架自己的位置）、yg-role-hover / yg-role-tap { code, tags, why, rect } / yg-role-leave { code }（场上的作用标签，rect 同上）、
//                    yg-key { key }（左右键转给插件页）、yg-rects { cards, roles }（cards 是看得见的卡：{ code, md, card（卡的元素 id）, rect }；roles 是看得见的作用标签：{ code, tags, card（卡的元素 id）, rect }）
// 不联网有三道：合成页自带 HyperFrames 运行时（播放器看到合成页已带运行时，就不会去 CDN 注入）；页面头上的 CSP 把 connect / 脚本 / 图片
// 都限在页面内和 data:；本仓不放 gsap。卡图一律 data: 地址。
import { planRoute } from './anim-plan.js';
import { inlineJs, marksOf, renderComposition } from './anim-render.js';
import { STAGE } from './anim-stage.js';

export const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; frame-src 'self' about: data:; child-src about: data:";

export function buildGuestHtml({ player, composition, stage }) {
  // 合成页作为播放器的 srcdoc 属性：是一个 JS 字符串，放进内联脚本前同样转义（inlineJs）
  const compJs = inlineJs(JSON.stringify(composition));
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>*{margin:0}html,body{width:100%;height:100%;background:#000;overflow:hidden}hyperframes-player{display:block;width:100%;height:100%}</style></head>
<body><hyperframes-player id="pl" interactive disable-click-to-play muted assets-loading-ui="none"></hyperframes-player>
<script>${inlineJs(player)}</script>
<script>(function () {
  var W = ${stage.w}, pl = document.getElementById('pl'), raf = 0;
  function up(m) { m.src = 'yg-guest'; parent.postMessage(m, '*'); }
  function clearRange() { pl.rangeStart = null; pl.rangeEnd = null; }
  function tick() { up({ type: 'yg-time', t: pl.currentTime }); if (!pl.paused) raf = requestAnimationFrame(tick); else raf = 0; }
  function poll() { if (!raf) raf = requestAnimationFrame(tick); }
  pl.addEventListener('ready', function () { up({ type: 'yg-ready', duration: pl.duration }); });
  pl.addEventListener('error', function (e) { up({ type: 'yg-error', detail: String((e && e.detail && e.detail.message) || (e && e.message) || 'player error') }); });
  pl.addEventListener('ended', function () {
    var to = pl.rangeEnd; clearRange();
    if (typeof to === 'number') pl.seek(to);   // 播放器播到区间末尾前一帧就停，补一次 seek 让画面落在这一步的结束帧
    up({ type: 'yg-time', t: typeof to === 'number' ? to : pl.currentTime });
    up({ type: 'yg-ended', t: typeof to === 'number' ? to : pl.currentTime });
  });
  pl.setAttribute('srcdoc', ${compJs});
  addEventListener('message', function (e) {
    var d = e.data;
    if (e.source === parent) {                                     // 来自插件页
      if (!d || d.src !== 'yg-host') return;
      if (d.cmd === 'seek') { pl.pause(); clearRange(); pl.seek(d.t); up({ type: 'yg-time', t: d.t }); }
      else if (d.cmd === 'playRange') { pl.pause(); clearRange(); pl.seek(d.from); pl.rangeStart = d.from; pl.rangeEnd = d.to; pl.play(); poll(); }
      else if (d.cmd === 'pause') { pl.pause(); up({ type: 'yg-time', t: pl.currentTime }); }
      else if (d.cmd === 'rects' && pl.iframeElement && pl.iframeElement.contentWindow) pl.iframeElement.contentWindow.postMessage(d, '*');
      return;
    }
    if (d && /^yg-(card-hover|card-leave|card-tap|role-hover|role-leave|role-tap|key|rects)$/.test(d.type)) {   // 来自合成页：把合成页里的像素换算成本页视口里的
      var r = pl.iframeElement.getBoundingClientRect(), s = r.width / W;
      var fix = function (b) { return { x: r.left + b.x * s, y: r.top + b.y * s, w: b.w * s, h: b.h * s }; };
      if (d.rect) d.rect = fix(d.rect);
      if (d.cards) d.cards = d.cards.map(function (c) { return { code: c.code, md: c.md, card: c.card, rect: fix(c.rect) }; });
      if (d.roles) d.roles = d.roles.map(function (c) { return { code: c.code, tags: c.tags, card: c.card, rect: fix(c.rect) }; });
      up(d);
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); up({ type: 'yg-key', key: e.key }); } });
})();</script></body></html>`;
}

const dataUrl = (html) => `data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`;
export const imageUri = (bytes) => (bytes ? `data:image/webp;base64,${Buffer.from(bytes).toString('base64')}` : null);

// 一条路线的动画页：{ src（data: 地址，给 SandboxedFrame）、starts / ends（每个位置：0 = 起手，1..N = 第几步；开始帧、结束帧的秒数）、duration、stage }
// roleTerms 是作用标签的术语表（给场上的作用标签着色）；readImage(code) 读卡图（没有就 null，画卡名牌）；vendor 是 { player, runtime }（vendor-files.js 读的）
export function buildRouteAnim({ route, roleTerms, readImage, vendor }) {
  const plan = planRoute(route, { roleTerms });
  const images = new Map(plan.codes.map((code) => [code, imageUri(readImage(code))]));
  const composition = renderComposition(plan, { images, runtime: vendor.runtime });
  const html = buildGuestHtml({ player: vendor.player, composition, stage: STAGE });
  return { id: route.id, src: dataUrl(html), ...marksOf(plan), stage: STAGE };
}

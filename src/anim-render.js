// 路线动画的合成页（纯函数）：把 anim-plan.js 的计划（轨道表、HTML 片段）加上样式、交互脚本、轨道引擎和 HyperFrames 运行时，拼成一页 HTML；
// 卡图用 CSS 类带进 data: 地址（每个密码一份），没有图的卡画卡名牌。卡图和运行时由调用方给。
import { ENGINE_SOURCE } from './anim-engine.js';
import { CH, COLOR, COL_L, CW, NOTICE, NOTICE_BANNER_H, NOTICE_SPOT_H, STAGE, SX0 } from './anim-stage.js';

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${STAGE.w}px;height:${STAGE.h}px;overflow:hidden;background:#000}
body{font-family:"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans JP","Microsoft YaHei",system-ui,sans-serif;color:#fff}
#root{position:absolute;left:0;top:0;width:${STAGE.w}px;height:${STAGE.h}px;background:#000;overflow:hidden}
#cam{position:absolute;left:0;top:0;width:${STAGE.w}px;height:${STAGE.h}px}
.slot{position:absolute;width:${CW}px;height:${CH}px;border:1.5px solid #2a2a30;border-radius:4px;z-index:1}
.slot.pile{border-color:#3a3a42}
.slot.back{border:none}
.slot.back i{position:absolute;inset:0;background:#0f0f14;border:1.5px solid #3a3a42;border-radius:4px}
.slot.back i:nth-child(1){transform:translate(4px,4px)}
.slot.back i:nth-child(2){transform:translate(2px,2px)}
.slot.back b{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid #44444e;transform:rotate(45deg)}
.sl{position:absolute;width:${CW}px;text-align:center;font-size:14px;line-height:18px;letter-spacing:2px;color:#6e6e78;z-index:6;pointer-events:none}
.zl{position:absolute;width:${CW + 20}px;text-align:center;font-size:16px;line-height:20px;font-weight:700;color:#c9c9d0;z-index:6;pointer-events:none;letter-spacing:1px}
.zl.hand{text-align:left;left:${COL_L}px}
.zp{position:absolute;width:${CW + 6}px;height:${CH + 6}px;border:3px solid #fff;border-radius:6px;opacity:0;z-index:4;pointer-events:none}
.card{position:absolute;left:0;top:0;width:${CW}px;height:${CH}px;opacity:0;z-index:10;pointer-events:none}
.card .a{position:absolute;inset:0;border-radius:3px;background:#1c1c24 center/cover no-repeat;pointer-events:auto;cursor:default}
.card .pt{display:none;position:absolute;left:4px;right:4px;top:6px;font-size:12px;line-height:14px;color:#c4c4cc;text-align:center;overflow:hidden;max-height:90px}
.card .tint,.card .tb,.card .bk,.card .hl{position:absolute;inset:0;border-radius:3px;opacity:0;pointer-events:none}
.card .tint{background:#000}
.card .tb{background:#6d4fd6}
.card .bk{background:#13131c;border:2px solid #3b3b4a}
.card .bk::after{content:"";position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid #44444e;transform:rotate(45deg)}
.card .hl{inset:-4px;border:3px solid ${COLOR.amber};border-radius:6px}
.card .nm{position:absolute;left:-9px;width:${CW + 18}px;top:${CH + 4}px;text-align:center;font-size:15px;line-height:17px;font-weight:600;color:#f3f3f6;text-shadow:0 1px 2px #000,0 0 3px #000;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;pointer-events:none}
.rg{position:absolute;opacity:0;z-index:4;pointer-events:none}
.rg.sq{border-radius:4px}.rg:not(.sq):not(.dia){border-radius:50%}.rg.dia{border-radius:6px}
.fl{position:absolute;width:${CW}px;height:${CH}px;opacity:0;z-index:4;border-radius:4px;pointer-events:none}
.fl.cir{border-radius:50%;width:${CH}px;height:${CH}px;margin-left:-${(CH - CW) / 2}px}
.tk{position:absolute;width:26px;height:3px;opacity:0;z-index:4;pointer-events:none}
.ln{position:absolute;height:3px;opacity:0;z-index:3;background:linear-gradient(90deg,transparent,currentColor);border-radius:2px;transform-origin:0 50%;pointer-events:none}
.dg{position:absolute;width:0;height:0;opacity:0;z-index:4;pointer-events:none}
.dot{position:absolute;width:14px;height:14px;border-radius:50%}
.bn{position:absolute;left:${COL_L}px;height:${NOTICE_BANNER_H}px;z-index:40;opacity:0;display:flex;align-items:center;padding:0 20px;transform-origin:0 50%;pointer-events:none}
.bn span{font-size:24px;font-weight:800;color:#000;letter-spacing:4px;white-space:nowrap}
.spot{position:absolute;left:${SX0}px;top:${NOTICE.y + (NOTICE.h - NOTICE_SPOT_H) / 2}px;width:520px;height:${NOTICE_SPOT_H}px;opacity:0;z-index:40;pointer-events:none}
.spot .sth{position:absolute;left:0;top:4px;width:62px;height:90px;border-radius:3px;background:#1c1c24 center/cover no-repeat}
.spot .sb{position:absolute;left:-12px;top:-4px;width:34px;height:34px;border-radius:50%;background:${COLOR.amber};color:#000;font-weight:800;font-size:19px;text-align:center;line-height:34px}
.spot .sx{position:absolute;left:84px;top:14px}
.spot .sk{font-size:15px;color:${COLOR.amber};letter-spacing:3px;font-weight:700}
.spot .sn{font-size:28px;font-weight:800;margin-top:6px;white-space:nowrap}
.cbadge{position:absolute;width:26px;height:26px;border-radius:50%;background:${COLOR.amber};color:#000;font-weight:800;font-size:15px;text-align:center;line-height:26px;z-index:60;opacity:0;pointer-events:none}
.bkt{position:absolute;width:${CW}px;height:22px;line-height:22px;text-align:center;background:${COLOR.amber};color:#000;font-weight:800;font-size:14px;letter-spacing:3px;z-index:66;opacity:0;border-radius:3px;pointer-events:none}
`;

// 合成页里的交互：悬停 / 点一下把「哪张卡、在合成页里的位置」交给外层（外层 = 页面）；左右键转给外层；host 问「现在每张卡在哪」时回答（验证脚本用）
const INTERACT = `
(function () {
  function rectOf(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  var cards = document.querySelectorAll('.card .a');
  Array.prototype.forEach.call(cards, function (el) {
    el.addEventListener('mouseenter', function () { parent.postMessage({ type: 'yg-card-hover', code: Number(el.dataset.code), rect: rectOf(el) }, '*'); });
    el.addEventListener('mouseleave', function () { parent.postMessage({ type: 'yg-card-leave', code: Number(el.dataset.code) }, '*'); });
    el.addEventListener('click', function () { parent.postMessage({ type: 'yg-card-tap', code: Number(el.dataset.code), rect: rectOf(el) }, '*'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); parent.postMessage({ type: 'yg-key', key: e.key }, '*'); }
  });
  addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.src !== 'yg-host' || d.cmd !== 'rects') return;
    var out = [];
    Array.prototype.forEach.call(cards, function (el) { if (getComputedStyle(el.parentNode).visibility === 'visible') out.push({ code: Number(el.dataset.code), md: el.dataset.md, rect: rectOf(el) }); });
    parent.postMessage({ type: 'yg-rects', cards: out }, '*');
  });
})();
`;

// 把 </script 和 <!-- 转义，免得内联脚本提前结束（JS 字符串 / 正则里这样写等价）；放进内联 <script> 的代码和 JS 字符串都过这一个
export const inlineJs = (js) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

// plan + 卡图（密码 → data: 地址或 null）+ 运行时源码 → 合成页 HTML。运行时必须是自带的（含 __hyperframes=），播放器看到它就不会去 CDN 注入
export function renderComposition(plan, { images = new Map(), runtime }) {
  if (!runtime) throw new Error('合成页要带 HyperFrames 运行时');
  const codes = [...new Set([...plan.codes, ...plan.instances.map((i) => i.code)])];
  const imageCss = codes.map((code) => (images.get(code) ? `.a.i${code},.sth.i${code}{background-image:url(${images.get(code)})}` : `.a.i${code},.sth.i${code}{background-color:#2a2a36}.a.i${code} .pt{display:block}`)).join('\n');
  const body = `<div id="root" data-composition-id="main" data-start="0" data-duration="${plan.duration}" data-width="${plan.stage.w}" data-height="${plan.stage.h}">
<div id="cam">
${plan.frames.join('\n')}
${plan.html.fx.join('\n')}
${plan.html.cards.join('\n')}
${plan.html.labels.join('')}
</div>
</div>`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=${plan.stage.w}, height=${plan.stage.h}">
<script>${inlineJs(runtime)}</script>
<style>${CSS}\n${imageCss}</style></head><body>
${body}
<script>
window.__timelines = window.__timelines || {};
${ENGINE_SOURCE}
var TR = ${JSON.stringify(plan.tracks)};
var INIT = ${JSON.stringify(plan.init)};
window.__timelines["main"] = ygMakeTimeline(document, TR, INIT, ${plan.duration});
</script>
<script>${INTERACT}</script>
</body></html>`;
}

// 页面要的时间点：每个位置（0 = 起手，1..N = 第几步）的开始、结束帧（结束帧 = 这一步走完、卡都停稳的那一刻）
export const marksOf = (plan) => ({ starts: plan.segments.map((s) => s.start), ends: plan.segments.map((s) => s.mark), duration: plan.duration });

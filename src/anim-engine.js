// 路线动画合成页里跑的小时间轴引擎（浏览器端脚本，以字符串形式放进合成页）。不用 gsap（GreenSock 标准许可，不是开源许可）：
// 动画是一张轨道表 TR（每个元素的每个属性一串 [起, 止, 起值, 止值, 缓动]），seek(t) 时对每个元素算出这一刻的值、写进样式。
// 它按 HyperFrames 运行时的约定登记在 window.__timelines 里（运行时负责播放、暂停、seek 的时钟，引擎只管「给时间，画这一帧」）。
// 同一份源码在 node 里也能 new Function 出来测（test/anim-engine.test.js）：不碰 document 的部分是纯函数 valueAt。
//
// 属性：x、y（平移，像素）、scale、scaleX、scaleY、rotation（度）、opacity 是连续的；z（层级）、text（文字）是离散的（到点就换）。
// 元素的初值在 INIT；没有轨道的属性一直是初值。opacity 到 0 的元素同时 visibility:hidden，免得看不见的卡还吃鼠标。
export const ENGINE_SOURCE = `
var YG_EASE = {
  l: function (p) { return p; },
  o2: function (p) { return 1 - (1 - p) * (1 - p); },
  o3: function (p) { return 1 - Math.pow(1 - p, 3); },
  i2: function (p) { return p * p; },
  i3: function (p) { return p * p * p; },
  io2: function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; },
  io3: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
  ox: function (p) { return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); },
  ob: function (p) { var s = 1.9; return 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2); }
};
var YG_DISCRETE = { z: 1, text: 1 };
// 一个属性在 t 这一刻的值：segs 按起点排好，取起点不晚于 t 的最后一段；还没到第一段就是初值
function valueAt(segs, t, init, discrete) {
  var lo = 0, hi = segs.length - 1, k = -1;
  while (lo <= hi) { var mid = (lo + hi) >> 1; if (segs[mid][0] <= t) { k = mid; lo = mid + 1; } else hi = mid - 1; }
  if (k < 0) return init;
  var s = segs[k];
  if (discrete || t >= s[1] || s[1] <= s[0]) return s[3];
  var p = (t - s[0]) / (s[1] - s[0]);
  return s[2] + (s[3] - s[2]) * YG_EASE[s[4]](p);
}
function ygMakeTimeline(doc, TR, INIT, DUR) {
  var ids = {}, key;
  for (key in INIT) ids[key] = 1;
  for (key in TR) ids[key] = 1;
  var list = Object.keys(ids).map(function (id) { return { id: id, el: doc.getElementById(id), segs: TR[id] || {}, init: INIT[id] || {} }; });
  function draw(t) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i], el = e.el, v = {};
      if (!el) continue;
      ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation', 'opacity', 'z', 'text'].forEach(function (p) {
        var d = e.init[p] === undefined ? (p === 'scale' || p === 'scaleX' || p === 'scaleY' || p === 'opacity' ? 1 : p === 'text' ? null : 0) : e.init[p];
        v[p] = e.segs[p] ? valueAt(e.segs[p], t, d, YG_DISCRETE[p]) : d;
      });
      el.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) rotate(' + v.rotation + 'deg) scale(' + (v.scale * v.scaleX) + ',' + (v.scale * v.scaleY) + ')';
      el.style.opacity = v.opacity;
      el.style.visibility = v.opacity < 0.01 ? 'hidden' : 'visible';
      if (e.segs.z || e.init.z !== undefined) el.style.zIndex = v.z;
      if (v.text !== null && el.textContent !== String(v.text)) el.textContent = v.text;
    }
  }
  var cur = 0;
  var tl = {
    seek: function (t) { cur = Math.max(0, Math.min(DUR, Number(t) || 0)); draw(cur); return tl; },
    totalTime: function (t) { return t === undefined ? cur : tl.seek(t); },
    progress: function (p) { return p === undefined ? cur / DUR : tl.seek(p * DUR); },
    time: function () { return cur; },
    duration: function () { return DUR; },
    totalDuration: function () { return DUR; },
    play: function () {}, pause: function () {}, paused: function () { return true; },
    timeScale: function () {}, add: function () {}, set: function () {}, getChildren: function () { return []; }
  };
  tl.seek(0);
  return tl;
}
`;

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { CSP, buildGuestHtml, buildRouteAnim, imageUri } from '../src/anim-page.js';
import { INTERACT } from '../src/anim-render.js';
import { STAGE } from '../src/anim-stage.js';
import { ENGINE_SOURCE } from '../src/anim-engine.js';
import { readHyperframes } from '../src/vendor-files.js';

// 一条最小的路线：起手一张卡，第 1 步把它召唤到怪兽区
const card = { code: 73819701, md: '白之落胤', jp: '白き竜の落胤', level: 4 };
const board = (o = {}) => ({ hand: [], monsters: [], spellTraps: [], grave: [], banished: [], deck: [], extra: [], ...o });
const route = {
  id: 'mini', name: 'mini', start: board({ hand: [{ ...card, sequence: 0 }], deck: new Array(2).fill(card) }),
  steps: [{ n: 1, text: '召唤', actions: [], activated: [], diff: {}, moves: [{ ...card, from: 'hand', fromSequence: 0, to: 'monsters', sequence: 0, position: 'attack', summon: 'normal' }], board: board({ monsters: [{ ...card, sequence: 0, position: 'attack' }], deck: new Array(2).fill(card) }) }],
  end: { breakers: [] },
};
const vendor = readHyperframes();
const decode = (src) => Buffer.from(src.split(',')[1], 'base64').toString('utf8');

describe('路线动画页：本地、不联网', () => {
  test('vendor/ 里的运行时带 __hyperframes=（播放器据此不去 CDN 注入），许可证和说明都在', () => {
    assert.match(vendor.runtime, /__hyperframes=/);
    assert.ok(readFileSync(new URL('../vendor/hyperframes/LICENSE', import.meta.url), 'utf8').includes('Apache License'));
    assert.match(readFileSync(new URL('../vendor/hyperframes/NOTICE.md', import.meta.url), 'utf8'), /0\.9\.91/);
  });

  test('页面是 data:text/html 地址，头上是 CSP（connect / 脚本 / 图片只许页内和 data:），合成页把运行时内联进去', () => {
    const anim = buildRouteAnim({ route, readImage: () => Buffer.from('img'), vendor });
    assert.match(anim.src, /^data:text\/html;base64,/);
    const html = decode(anim.src);
    assert.ok(html.indexOf(`Content-Security-Policy" content="${CSP}"`) > 0 && html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
    assert.match(CSP, /connect-src 'none'/);
    assert.match(CSP, /default-src 'none'/);
    assert.doesNotMatch(CSP, /https?:|\*/);
    assert.ok(html.includes('__hyperframes=')); // 合成页（srcdoc 里）自带运行时
    assert.deepEqual(anim.stage, STAGE);
    assert.equal(anim.starts.length, 2);
    assert.equal(anim.ends.length, 2);
  });

  test('没有任何请求来源：没有 script src、link、img、iframe src、@import，自己写的部分没有 http(s):// 网址', () => {
    const stub = { player: '/* player */', runtime: '/* runtime */' };
    const html = decode(buildRouteAnim({ route, readImage: () => Buffer.from('img'), vendor: stub }).src);
    assert.doesNotMatch(html, /https?:\/\//);
    assert.doesNotMatch(html, /<script[^>]*\ssrc=|<link\b|<img\b|<iframe\b|@import|<base\b/i);
    assert.match(html, /url\(data:image\/webp;base64,/);
    assert.equal(imageUri(null), null);
  });

  test('转义：播放器里的 </script 不会提前结束内联脚本', () => {
    const html = buildGuestHtml({ player: 'var s="</script><!--";', composition: '<p>x</p></script><!--', stage: { w: 800, h: 700 } });
    assert.equal(html.match(/<\/script>/g).length, 2);
    assert.doesNotMatch(html, /<!--/);
  });

  test('外壳页处理插件页的命令（seek、playRange、pause、rects），把合成页的悬停、点击（卡和作用标签）、左右键转给插件页', () => {
    const html = buildGuestHtml({ player: '', composition: '', stage: { w: 800, h: 700 } });
    for (const needle of ["'seek'", "'playRange'", "'pause'", "'rects'", 'card-hover|card-leave|card-tap|role-hover|role-leave|role-tap|key|rects', 'd.roles', 'yg-ended', 'yg-ready']) assert.ok(html.includes(needle), needle);
    assert.ok(html.includes('interactive'));
    assert.ok(html.includes('assets-loading-ui="none"')); // 不然卡图还在解码时播放器盖一层模糊的加载牌 // 没有 interactive，播放器会把鼠标事件吃掉，悬停就没了
  });
});

// 空格键：在最小的假浏览器里跑页面脚本，看它拦不拦、转不转
const shellScript = () => buildGuestHtml({ player: '', composition: '', stage: { w: 800, h: 700 } }).match(/<script>[\s\S]*?<\/script>/g)[1].replace(/^<script>|<\/script>$/g, '');
function fakePage(code) {
  const doc = {}, win = {}, sent = [], toIframe = [];
  const parent = { postMessage: (m) => sent.push(m) };
  const pl = { addEventListener() {}, setAttribute() {}, iframeElement: { contentWindow: { postMessage: (m) => toIframe.push(m) } } };
  const on = (bag) => (type, fn) => { bag[type] = fn; };
  vm.runInNewContext(code, { document: { addEventListener: on(doc), getElementById: () => pl, querySelectorAll: () => [] }, addEventListener: on(win), parent, requestAnimationFrame: () => 1, getComputedStyle: () => ({}) });
  return {
    toIframe,
    keys: () => sent.filter((m) => m.type === 'yg-key').map((m) => m.key),
    press: (k) => { let prevented = false; doc.keydown({ key: k, preventDefault: () => { prevented = true; } }); return prevented; },
    space: (on) => win.message({ source: parent, data: { src: 'yg-host', cmd: 'keys', space: on } }),
  };
}

describe('空格键：只在「先猜再看」开着时由框转给插件页，关着时和没有这个开关一样', () => {
  for (const [name, code] of [['外壳页', shellScript], ['合成页', () => INTERACT]]) {
    test(`${name}：默认空格不拦不转，左右键照旧；host 发 keys space:true 后转并拦，再发 false 又不转`, () => {
      const page = fakePage(code());
      assert.equal(page.press(' '), false);
      assert.equal(page.press('ArrowLeft'), true);
      assert.deepEqual(page.keys(), ['ArrowLeft']);
      page.space(true);
      assert.equal(page.press(' '), true);
      assert.deepEqual(page.keys(), ['ArrowLeft', ' ']);
      page.space(false);
      assert.equal(page.press(' '), false);
      assert.deepEqual(page.keys(), ['ArrowLeft', ' ']);
      if (name === '外壳页') assert.deepEqual(page.toIframe.map((m) => m.space), [true, false]); // 外壳页把开关再转给合成页
    });
  }
});

describe('动画引擎 valueAt', () => {
  const { valueAt } = new Function(`${ENGINE_SOURCE}; return { valueAt };`)();
  const segs = [[1, 2, 0, 100, 'l'], [2, 3, 100, 50, 'l'], [5, 5, 50, 7, 'l']];
  test('段前是初值、段中按缓动插值、段后停在终值，到点就换的跳变', () => {
    assert.equal(valueAt(segs, 0.5, -1, false), -1);
    assert.equal(valueAt(segs, 1.5, -1, false), 50);
    assert.equal(valueAt(segs, 2.5, -1, false), 75);
    assert.equal(valueAt(segs, 4, -1, false), 50);
    assert.equal(valueAt(segs, 5, -1, false), 7);
    assert.equal(valueAt([[1, 2, 'a', 'b', 'l']], 1.5, 'a', true), 'b');
  });
});

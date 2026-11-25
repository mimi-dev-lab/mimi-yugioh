# HyperFrames（第三方，原样放进来，不改）

路线动画页（`src/anim-page.js` 拼页面，`src/vendor-files.js` 读这两个文件）用 HyperFrames 的播放器和运行时。本目录是第三方代码，不是本仓写的；`./ci` 的 `outbound` 检查只扫 `src/` 和 `plugin/`，不扫这里。

- 项目：HyperFrames，https://github.com/heygen-com/hyperframes ，许可证 Apache-2.0（本目录的 `LICENSE` 是它仓根的原文）。克隆的提交 `90e86ef38a279812f9a0edc91a10a97596bb7fe9`。
- 版本：全部 0.9.91。
- `hyperframes-player.global.js`：`<hyperframes-player>` 的全局构建（`packages/player` 0.9.91 的 IIFE 构建），131542 字节，md5 `5ac0b28565a50ccacd22f3111cb8edfe`。
- `hyperframe.runtime.iife.js`：合成页里的运行时（`@hyperframes/core` 0.9.91 的 `dist/hyperframe.runtime.iife.js`，即 `hyperframes` 0.9.91 包里的同名文件），777765 字节，md5 `2395a4b534bbf747eeaf8e08c3c66c05`。它打包了 HyperFrames 自己的依赖（如 postcss，MIT）。
- 里面的网址字符串（`https://cdn.jsdelivr.net/npm/…`、`www.w3.org` 命名空间等）是上游的回退和 XML 命名空间：合成页自带运行时（含 `__hyperframes=`），播放器就不会去 CDN 注入运行时；`src/anim-page.js` 另给页面加了 CSP，任何外网请求都会被浏览器拦下（`test/anim-page.test.js` 查）。
- 没有用 gsap（GreenSock 标准许可，不是开源许可）：动画时间轴由 `src/anim-engine.js` 自己的小引擎驱动，走运行时的 `window.__timelines` 约定。

换版本：把新版本的两个文件原样换进来，改上面的版本和 md5，跑 `./ci` 和 `scripts/plugin-smoke.sh`。

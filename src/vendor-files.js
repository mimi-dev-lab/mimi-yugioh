// 读第三方文件：vendor/hyperframes/ 里的播放器和运行时（HyperFrames 0.9.91，Apache-2.0，原样放着，说明见 vendor/hyperframes/NOTICE.md）。
// 只读；路径相对本文件，不取环境变量。拼成页面是 anim-page.js 的事，这里只负责读。
import { readFileSync } from 'node:fs';

const dir = new URL('../vendor/hyperframes/', import.meta.url);

export function readHyperframes() {
  const read = (name) => readFileSync(new URL(name, dir), 'utf8');
  return { player: read('hyperframes-player.global.js'), runtime: read('hyperframe.runtime.iife.js') };
}

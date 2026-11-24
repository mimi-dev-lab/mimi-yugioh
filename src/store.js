// 数据目录的读取：只有这个文件碰数据目录（格式见 DESIGN.md「数据目录」）。目录由调用方传进来。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function openStore(dir) {
  return {
    // 卡图：数据目录的 images/<卡号>.webp（scripts/sync-card-images.js 从 NAS 复制来）；没有就是 null。卡号只收纯数字，路径不会跑出 images/
    readImage(code) {
      if (!/^\d{1,10}$/.test(String(code))) return null;
      try { return readFileSync(join(dir, 'images', `${code}.webp`)); } catch { return null; }
    },
  };
}

// 数据目录的读写：只有这个文件写数据目录（格式见 DESIGN.md「数据目录」）。目录由调用方传进来。
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function openStore(dir) {
  mkdirSync(dir, { recursive: true });
  const log = join(dir, 'hands.jsonl');
  const active = join(dir, 'active.json');
  return {
    // 日志只追加：每一手结算一行（type: hand），作废的一手也一行（type: void）
    appendHand(record) { appendFileSync(log, `${JSON.stringify(record)}\n`); },
    // 读所有行；坏行（比如写到一半断电）跳过
    readHands() {
      if (!existsSync(log)) return [];
      return readFileSync(log, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
    },
    // 进行中的一手的开局信息：服务重启时据此把它记成作废
    setActive(info) { writeFileSync(active, JSON.stringify(info)); },
    clearActive() { rmSync(active, { force: true }); },
    readActive() { try { return JSON.parse(readFileSync(active, 'utf8')); } catch { return null; } },
  };
}

// 数据目录的读写：只有这个文件写数据目录（格式见 DESIGN.md「数据目录」）。目录由调用方传进来。
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function openStore(dir) {
  mkdirSync(dir, { recursive: true });
  const log = join(dir, 'hands.jsonl');
  const active = join(dir, 'active.json');
  const quiz = join(dir, 'quiz.jsonl');
  const searches = join(dir, 'search');
  return {
    // 日志只追加：每一手结算一行（type: hand），作废的一手也一行（type: void）
    appendHand(record) { appendFileSync(log, `${JSON.stringify(record)}\n`); },
    // 读所有行；坏行（比如写到一半断电）跳过
    readHands() {
      if (!existsSync(log)) return [];
      return readFileSync(log, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
    },
    // 记卡的答题日志：只追加，每次答题一行（带答完之后这张卡的 FSRS 状态）；读法同 readHands
    appendQuiz(row) { appendFileSync(quiz, `${JSON.stringify(row)}\n`); },
    readQuiz() {
      if (!existsSync(quiz)) return [];
      return readFileSync(quiz, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
    },
    // 进行中的一手的开局信息：服务重启时据此把它记成作废
    setActive(info) { writeFileSync(active, JSON.stringify(info)); },
    clearActive() { rmSync(active, { force: true }); },
    // 卡图：数据目录的 images/<卡号>.webp（scripts/sync-card-images.js 从 NAS 复制来）；没有就是 null。卡号只收纯数字，路径不会跑出 images/
    readImage(code) { return /^\d{1,10}$/.test(String(code)) ? (() => { try { return readFileSync(join(dir, 'images', `${code}.webp`)); } catch { return null; } })() : null; },
    // 搜索缓存：每手起手（5 张排序后的密码用 - 连起来）一个文件，同一手不重复搜。先写临时文件再改名，读的人不会读到写了一半的
    readSearch(key) { try { return JSON.parse(readFileSync(join(searches, `${key}.json`), 'utf8')); } catch { return null; } },
    writeSearch(key, entry) {
      mkdirSync(searches, { recursive: true });
      const tmp = join(searches, `${key}.json.tmp`);
      writeFileSync(tmp, JSON.stringify(entry));
      renameSync(tmp, join(searches, `${key}.json`));
    },
    readActive() { try { return JSON.parse(readFileSync(active, 'utf8')); } catch { return null; } },
  };
}

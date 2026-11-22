// 搜索缓存的管理：同一手（起手排序后）在后台只搜一次，搜完写进缓存，并回答「这手的搜索现状」。读写缓存经 store，怎么搜（引擎）、「现在」、时间上限都由调用方传进来。
// 缓存条目的规则见 DESIGN.md「最好场面搜索」的「缓存」。
import { handKey } from './hand.js';
import { searchVersion } from './search.js';

// store：readSearch / writeSearch；search(hand, seed, { now, budgetMs, isPaused })：返回搜索结果的函数；budgetMs <= 0 表示不搜索
export function openSearchCache({ store, deck, search, now, budgetMs, isPaused, onError = console.error }) {
  const running = new Map(); // handKey → 'pending' | 'failed'；failed 只是「上一次搜崩了」的记号，下次开这手会重搜
  const version = searchVersion(deck);
  // 版本对得上的条目才算数
  const entryFor = (key) => {
    const entry = store.readSearch(key);
    return entry?.v === version ? entry : null;
  };

  return {
    // 这手需要搜就在后台开始搜（不等它）：没有可用的条目、超时的条目用的上限比现在小、上次搜崩了；force 是已有条目也重搜（条目的路线在这个种子下重放不了）。已经在搜的不重开
    ensure(hand, seed, { force = false } = {}) {
      const key = handKey(hand);
      if (budgetMs <= 0 || running.get(key) === 'pending') return;
      const entry = entryFor(key);
      const stale = !entry || (entry.timedOut && (entry.budgetMs ?? 0) < budgetMs);
      if (!force && !stale) return;
      running.set(key, 'pending');
      search(hand, seed, { now, budgetMs, isPaused }).then((result) => {
        store.writeSearch(key, { v: version, hand: [...hand].sort((a, b) => a - b), seed, budgetMs, at: now(), ...result });
        running.delete(key);
      }).catch((e) => { onError(e); running.set(key, 'failed'); });
    },
    // 这一手的搜索现状：done（搜完，带 steps）/ timed-out（超时，不当基准）/ pending（在搜）/ failed（上次搜崩了）/ none（没有条目也没在搜，比如不搜索的设置）
    state(hand) {
      const key = handKey(hand);
      const entry = entryFor(key);
      if (entry && !entry.timedOut && entry.steps) return { status: 'done', steps: entry.steps };
      const run = running.get(key);
      if (run) return { status: run };
      return { status: entry?.timedOut ? 'timed-out' : 'none' };
    },
  };
}

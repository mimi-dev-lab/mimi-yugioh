#!/bin/sh
# ./ci 的第一项（checks/list 的 !ci-lock）：同一个检出同时只跑一份 ./ci，第二份在这里等前一份结束再往下跑
# （两份一起跑时插件冒烟抢同一台机器，两份都慢、都可能超时）。
# 锁是这个检出自己的 git 目录（每个 worktree 一个）下的 ci-lock/，owner 里写「./ci 的进程号 它的开始时间」。那个进程没了，
# 或者进程号被别的进程重用了（开始时间对不上），锁就算放了，下一份直接接手：./ci 被杀掉也不会卡住后面的，不用谁去删。
# 锁放在本仓的检查里，不改共用的 ./ci 运行器（AGENTS.md「检查与合并」）。
# 测试用：YUGIOH_CI_LOCK_DIR（锁目录）、YUGIOH_CI_LOCK_OWNER（主人的进程号，不往上找 ./ci）、YUGIOH_CI_LOCK_POLL（等的间隔，秒）。
set -f
root=$(cd "$(dirname "$0")/.." && pwd) || exit 1
poll=${YUGIOH_CI_LOCK_POLL:-2}
started() { ps -o lstart= -p "$1" 2>/dev/null; }

# 往上找跑 checks/list 的那份 ./ci：命令行里有一个词是 ci 或以 /ci 结尾
ci_pid() {
  p=$PPID
  while [ -n "$p" ] && [ "$p" -gt 1 ]; do
    for w in $(ps -o command= -p "$p"); do
      case $w in ci | */ci) echo "$p"; return 0 ;; esac
    done
    p=$(ps -o ppid= -p "$p" | tr -d ' ')
  done
  return 1
}

owner=${YUGIOH_CI_LOCK_OWNER:-$(ci_pid)}
[ -n "$owner" ] || { echo "ci: skip ci-lock（不是从 ./ci 跑的，不上锁）"; exit 0; }
dir=${YUGIOH_CI_LOCK_DIR:-$(git -C "$root" rev-parse --absolute-git-dir 2>/dev/null)/ci-lock}
[ "$dir" != /ci-lock ] || { echo "ci: skip ci-lock（不在 git 检出里）"; exit 0; }
[ -d "$(dirname "$dir")" ] || { echo "ci-lock: 放锁的目录 $(dirname "$dir") 不存在" >&2; exit 1; }
me="$owner $(started "$owner")"
# 清掉放了的锁：几份同时发现锁放了时，只让拿到 $dir.clean 的那份去删，删之前再看一眼主人没换（别人可能已经接手了）
take_over() {
  mkdir "$dir.clean" 2>/dev/null || {
    [ -n "$(find "$dir.clean" -maxdepth 0 -mmin -1 2>/dev/null)" ] || rm -rf "$dir.clean"
    return
  }
  [ "$(cat "$dir/owner" 2>/dev/null)" = "$1" ] && rm -rf "$dir"
  rmdir "$dir.clean"
}
deadline=$(($(date +%s) + 3600))
said=
while ! mkdir "$dir" 2>/dev/null; do
  held=$(cat "$dir/owner" 2>/dev/null)
  [ "$held" = "$me" ] && exit 0
  if [ -z "$held" ]; then
    # 刚建好、主人还没写进去：等一会儿；空了一分钟以上是写之前就被杀了
    if [ -n "$(find "$dir" -maxdepth 0 -mmin -1 2>/dev/null)" ]; then sleep "$poll"; continue; fi
  else
    pid=${held%% *}
    if [ "$held" = "$pid $(started "$pid")" ]; then
      [ -n "$said" ] || echo "ci-lock: 这个检出里另一份 ./ci（进程 $pid）在跑，等它结束" >&2
      said=1
      [ "$(date +%s)" -lt "$deadline" ] || { echo "ci-lock: 等了一小时，进程 $pid 的 ./ci 还没结束；看看它是不是卡住了（$dir/owner）" >&2; exit 1; }
      sleep "$poll"
      continue
    fi
  fi
  take_over "$held"
done
echo "$me" >"$dir/owner"

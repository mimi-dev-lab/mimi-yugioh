#!/bin/sh
# ./ci 的插件冒烟：游戏王插件在临时的网页工作区（只开 Webapp 的 Hermes 网关，插件用本仓的 plugin/，后端转给编的数据起的游戏王服务）里，
# 从侧栏点「游戏王」：先看首页和另两个页签；点「开始一手」进展开中屏（计时、操作记录、手牌、「提示 分数 ×0.8」、结束回合，没有百分比和「还差」），
# 立刻结束回合看结算；再换一手固定种子（37，含白之落胤）的：点卡看三件事、点「发动」、回答引擎的提示，操作记录多出一步，写着花了什么换来什么。
# 每次的网络记录里不能有不同源的请求。照验证技能（.claude/skills/verify-yugioh）的 plugin-verify。
# 不碰线上：端口、数据目录都是这次临时的，卡图是编的单色小图，不连 NAS；证据放临时目录，过了就删，没过留着并打出路径。
# YUGIOH_SMOKE_KEEP=<目录>：过了也把截图拷到那个目录。
root=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "$root" || exit 1
if [ "${CI_SKIP_PLUGIN_SMOKE:-}" = 1 ]; then echo "ci: skip plugin-smoke"; exit 0; fi
V=.claude/skills/verify-yugioh/scripts/plugin-verify
YV_EVIDENCE=$(mktemp -d) || exit 1
export YV_EVIDENCE
status=1
cleanup() {
  "$V" down >/dev/null 2>&1
  if [ "$status" = 0 ] && [ -n "${YUGIOH_SMOKE_KEEP:-}" ]; then
    mkdir -p "$YUGIOH_SMOKE_KEEP" && find "$YV_EVIDENCE" -name '*.png' -exec cp {} "$YUGIOH_SMOKE_KEEP"/ \;
  fi
  [ "$status" = 0 ] && rm -rf "$YV_EVIDENCE" || echo "证据留在 $YV_EVIDENCE" >&2
}
trap cleanup EXIT
# shot 名字 [参数…]：截一张，页面上不能有 NaN、undefined、Infinity
shot() {
  name=$1; shift
  "$V" shot "$name" "$@" || { echo "$name 失败（有不同源的请求或没画出来）：$*"; exit 1; }
  for bad in "NaN" "undefined" "Infinity"; do
    ! grep -qF "$bad" "$ev/$name.txt" || { echo "$name 上有「${bad}」，见 $ev/$name.txt"; exit 1; }
  done
}
# has 名字 文字…：页面上都要有；lacks 名字 文字…：都不能有
has() {
  name=$1; shift
  for want in "$@"; do
    grep -qF "$want" "$ev/$name.txt" || { echo "$name 上没有「${want}」，见 $ev/$name.txt"; exit 1; }
  done
}
lacks() {
  name=$1; shift
  for bad in "$@"; do
    ! grep -qF "$bad" "$ev/$name.txt" || { echo "$name 上有「${bad}」，见 $ev/$name.txt"; exit 1; }
  done
}

"$V" up || exit 1
ev=$(ls -d "$YV_EVIDENCE"/*/ | head -1)
shot home
has home "游戏王" "首页" "记卡" "记录" "计时赛" "开始一手"
lacks home "继续这一手"
shot cards --tab 记卡
has cards "记卡"
shot log --tab 记录
has log "记录"
# 点「开始一手」：展开中屏。展开中不显示离最好差多少：没有百分比、「还差」、估值
shot start --design --start
has start "第 1 手 · 用时" "用时" "提示" "0 次 · ×1.0" "分数 ×0.8" "操作记录" "花了 → 换来" "轮到你" "召唤权 未用" "手牌 5" "结束回合" "场面分在结束回合后才揭晓"
lacks start "%" "还差" "估值" "场面值"
# 立刻结束回合：结算出来（总分、场面分、速度加成、提示系数）
shot ended --design --resume --end
has ended "这一手结束了" "总分" "场面分" "速度加成" "提示系数" "再来一手"
"$V" down >/dev/null 2>&1

# 固定种子 37：含白之落胤的起手。卡名写在卡图下方，点卡看角色和三件事，发动一个效果、回答引擎的提示，操作记录多出一步
"$V" up --hand-seed 37 || exit 1
ev=$(ls -dt "$YV_EVIDENCE"/*/ | head -1)
shot detail --design --resume --select 天底的使徒
has detail "手牌 5" "白之落胤" "抽牌小丑与封锁鸟" "白之圣女 艾克利西亚" "天底的使徒" "超融合" "起手" "干什么" "条件代价" "限制"
lacks detail "%" "还差" "估值"
shot prompt --design --resume --select 白之落胤 --do 发动
has prompt "发动 白之落胤 · 选 1 张额外的卡：送去墓地" "三英的相剑师" "×2"
shot played --design --resume --answer 14
has played "发动 白之落胤 · 选 三英的相剑师" "花了 → 换来" "手牌 −1（白之落胤）" "场上 +" "轮到你" "本回合额外卡组只能特殊召唤 8 星融合 / 同调怪兽（白之落胤）"
lacks played "%" "还差" "估值" "不发动 →" "放在 怪兽区"
status=0
echo "游戏王插件在网页工作区里画出来了：首页和另两个页签；开始一手、点卡看三件事、发动、回答引擎的提示、操作记录写着花了什么换来什么、结束回合出结算；展开中没有百分比、「还差」、估值"

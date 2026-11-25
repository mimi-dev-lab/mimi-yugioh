#!/bin/sh
# ./ci 的插件冒烟：游戏王插件在临时的网页工作区（只开 Webapp 的 Hermes 网关，插件用本仓的 plugin/，后端转给编的数据起的游戏王服务）里，
# 从侧栏点「游戏王」：首页是教程外壳，第一个页签「卡组一览」按作用分组列出每张卡（简中名、日文名）；点一张卡看效果说明和对手回合怎么打断；
# 桌面宽和手机宽各走一遍；展开路线：列表、点进白之落胤线（停在起手）翻到第 1 步、中间一步、终场（点下一步和按右方向键各一次），看终场汇总的打断数；起手速查：每张关键卡的路线和缺卡改走哪条，点一条路线跳到它的播放页（桌面宽、手机宽）。页面上不能有打牌、评分、记卡、进步曲线的字样，也没有百分比。
# 卡片弹窗：桌面悬停卡组一览、路线场面、终场汇总、起手速查的卡，手机点一下，弹窗整块在窗口里、关得掉。
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

# 旧功能的字样：页面上哪儿都不能有
OLD="开始一手 继续这一手 结束回合 总分 场面分 速度加成 提示 记卡 进步 个人最好 基准 到期 %"
"$V" up || exit 1
ev=$(ls -d "$YV_EVIDENCE"/*/ | head -1)
shot deck
has deck "游戏王 · 烙印教程" "卡组一览" "展开路线" "起手速查" "主卡组 40 张" "额外卡组 15 张" "Game8（2026-11-20 版）" \
  "启动" "检索" "融合素材" "终场" "手坑" "白之落胤" "白き竜の落胤" "冰剑龙 镜翠幻种" "灰流丽" "打断 1" "×3" "额外" "点一张卡看效果说明"
# shellcheck disable=SC2086
lacks deck $OLD
shot card --select "冰剑龙 镜翠幻种"
has card "冰剑龙 镜翠幻种" "氷剣竜ミラジェイド" "终场" "额外卡组 ×1" "干什么" "条件代价" "限制" "对手回合" "终场时能打断 1 次：" "关上"
lacks card "点一张卡看效果说明"
shot card-none --select 白之落胤
has card-none "白之落胤" "启动" "主卡组 ×1" "终场时不提供打断"
shot phone --mobile
has phone "卡组一览" "启动" "白之落胤" "白き竜の落胤"
# shellcheck disable=SC2086
lacks phone $OLD
shot phone-card --mobile --select 灰流丽
has phone-card "灰流丽" "灰流うらら" "手坑" "干什么" "从手牌发动，不算终场的打断" "× 关上"
lacks phone-card "点一张卡看效果说明"
shot routes --tab 展开路线
has routes "基本展开｜白之落胤初动" "基本展开｜烙印融合初动" "需要的起手卡" "终场打断 2" "终场打断 1" "来源 Game8（2026-11-20 版）" "引擎验证于 2026-11-24"
lacks routes "还没做"
shot route-start --route white-albaz
has route-start "起手" "起手 · 共 17 步" "上一步" "下一步" "连播" "墓地 0 张" "来源 Game8"
lacks route-start "花了什么" "发动了" "终场汇总"
shot route-first --route white-albaz --step 1
has route-first "第 1 / 17 步" "上一步" "下一步" "连播" "发动了 白之落胤" "花了什么" "换来什么" "怪兽区" "手牌" "墓地 1 张" "除外 0 张" "来源 Game8" "页面版本 2026-11-20" "引擎验证于 2026-11-24"
lacks route-first "终场汇总"
shot route-mid --route white-albaz --step 9
has route-mid "第 9 / 17 步"
lacks route-mid "终场汇总"
shot route-end --route white-albaz --step last --keys
has route-end "第 17 / 17 步 · 终场" "终场汇总" "对手回合能打断 2 次" "打断 1" "冰剑龙 镜翠幻种" "赫之圣女 卡尔塔西亚" "剩余手牌"
lacks route-end "%" "还差" "估值" "评分" "总分"
shot route-fusion-end --route branded-fusion --step last
has route-fusion-end "第 10 / 10 步 · 终场" "终场汇总" "对手回合能打断 1 次" "烙印断罪"
shot route-phone-start --mobile --route white-albaz --step 起手
has route-phone-start "起手 · 共 17 步"
lacks route-phone-start "花了什么"
shot route-phone --mobile --route white-albaz --step 2
has route-phone "第 2 / 17 步" "花了什么"
shot route-phone-end --mobile --route white-albaz --step last
has route-phone-end "终场汇总" "对手回合能打断 2 次"
shot quick --tab 起手速查
has quick "手里有哪张关键卡" "白之落胤" "烙印融合" "惨绝戏之导化 阿卢绯尔" "天底的使徒" "白之圣女 艾克利西亚" "烙印之气炎" "手里有它：走" "基本展开｜白之落胤初动" "终场打断 2" "搭 多多迷宝・软绵雀精" "搭 黑衣龙 阿尔比昂" "缺 烙印融合" "手里有 惨绝戏之导化 阿卢绯尔 →" "检索烙印融合"
lacks quick "还没做" "读取速查" "%" "还差" "估值" "评分" "总分"
# shellcheck disable=SC2086
lacks quick $OLD
shot quick-phone --mobile --tab 起手速查
has quick-phone "缺 烙印融合" "基本展开｜烙印融合初动" "终场打断 1"
# 点一条速查里的路线：跳到展开路线页签里那条路线的播放页，停在起手；再翻到终场
shot quick-jump --tab 起手速查 --jump aluber
has quick-jump "展开路线" "基本展开｜阿卢绯尔初动" "← 路线列表" "起手 · 共 12 步" "手牌"
lacks quick-jump "花了什么" "手里有哪张关键卡"
shot quick-jump-end --tab 起手速查 --jump white-saint --step last
has quick-jump-end "基本展开｜白之圣女初动" "终场汇总" "对手回合能打断 0 次"
shot quick-jump-phone --mobile --tab 起手速查 --jump nadir-servant --step 2
has quick-jump-phone "基本展开｜天底的使徒初动" "第 2 / 13 步" "花了什么"
# 卡片弹窗：悬停（桌面）/ 点一下（手机）弹出放大卡图 + 两个名字 + 作用 + 三件事 + 对手回合怎么打断；整块在窗口里；关得掉
popup() {
  name=$1
  node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const p = j.pop;
    const bad = [];
    if (!p) bad.push("没有弹窗");
    else if (p.left < 0 || p.top < 0 || p.right > p.vw || p.bottom > p.vh) bad.push(`弹窗超出窗口：${JSON.stringify(p)}`);
    if (process.argv[2] === "close" && !(j.closed && j.closed.esc && (j.closed.button !== false))) bad.push(`没关上：${JSON.stringify(j.closed)}`);
    if (bad.length) { console.error(bad.join("；")); process.exit(1); }
  ' "$ev/$name.json" "$2" || { echo "$name 的弹窗不对，见 $ev/$name.json"; exit 1; }
}
shot hover-deck --hover "冰剑龙 镜翠幻种" --close
popup hover-deck close
grep -q '"text": ".*氷剣竜ミラジェイド.*干什么.*对手回合.*终场时能打断 1 次' "$ev/hover-deck.json" || { echo "hover-deck 的弹窗里缺日文名、干什么或对手回合，见 $ev/hover-deck.json"; exit 1; }
shot hover-route --route white-albaz --step 1 --hover-anim 白之落胤 --close
popup hover-route close
shot hover-lookup --tab 起手速查 --hover 白之落胤 --within .yg-lookup --close
popup hover-lookup close
shot hover-end --route white-albaz --step last --hover "冰剑龙 镜翠幻种" --within .yg-end --close
popup hover-end close
shot tap-route --mobile --route white-albaz --step 1 --tap-anim 白之落胤
popup tap-route
grep -qF "× 关上" "$ev/tap-route.json" || { echo "tap-route 的弹窗里没有「× 关上」，见 $ev/tap-route.json"; exit 1; }
shot tap-deck --mobile --tab 起手速查 --tap 白之落胤 --within .yg-lookup --close
popup tap-deck close
# 路线动画：下一步播完停住；点步号跳到那一步的结束帧；连播到终场；动画中间帧；只有本地请求（动画框架里也不联网）
shot anim-mid --route white-albaz --stage-at 3:0.4
has anim-mid "起手 · 共 17 步"
shot anim-jump --route white-albaz --step 3 --click-step 9
has anim-jump "第 9 / 17 步" "发动了 烙印开幕"
lacks anim-jump "终场汇总"
shot anim-back --route white-albaz --step 3 --click-step 起手
has anim-back "起手 · 共 17 步"
shot anim-auto --route branded-fusion --play-all
has anim-auto "第 10 / 10 步 · 终场" "终场汇总" "对手回合能打断 1 次"
shot anim-phone-auto --mobile --route branded-fusion --step 2 --click-step 10
has anim-phone-auto "终场汇总"
for name in hover-deck hover-route anim-mid anim-jump anim-back anim-auto anim-phone-auto hover-lookup hover-end tap-route tap-deck; do
  grep -q '"overflowX": false' "$ev/$name.json" || { echo "$name 有横向滚动条，见 $ev/$name.json"; exit 1; }
done
for name in tap-route anim-mid anim-jump anim-back anim-auto anim-phone-auto hover-route; do
  node -e 'const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (!j.cdp || j.cdp.foreign.length || j.cdp.total < 1) { console.error(JSON.stringify(j.cdp)); process.exit(1); }' "$ev/$name.json" || { echo "$name 的网络记录里有非本地请求，或没记到请求，见 $ev/$name.json"; exit 1; }
done
for name in anim-jump anim-auto anim-phone-auto hover-route; do
  grep -q '"jsErrors": \[\]' "$ev/$name.json" || { echo "$name 里有没接住的 JS 异常，见 $ev/$name.json"; exit 1; }
done
for name in deck card phone phone-card routes route-start route-first route-mid route-end route-fusion-end route-phone-start route-phone route-phone-end quick quick-phone quick-jump quick-jump-end quick-jump-phone; do
  grep -q '"overflowX": false' "$ev/$name.json" || { echo "$name 有横向滚动条，见 $ev/$name.json"; exit 1; }
done
status=0
echo "游戏王插件在网页工作区里画出来了：卡组一览按作用分组（简中名、日文名、张数、打断数），点卡出效果说明和对手回合怎么打断，桌面宽和手机宽都能用；展开路线列表和逐步播放（起手、第 1 步、中间一步、终场汇总，桌面宽和手机宽），路线动画（下一步播完停住、点步号跳、连播到终场、中间帧、动画里悬停和点卡、动画框里没有非本地请求）；起手速查按关键卡列出路线和缺卡改走哪条，点一条跳到它的播放页；没有旧功能的字样"

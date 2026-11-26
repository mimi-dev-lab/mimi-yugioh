---
name: verify-yugioh
description: 在真的游戏王插件页上证明行为：用编的数据起一个临时的游戏王服务和只开 Webapp 的临时 Hermes 网关，无头 Chromium 从侧栏点「游戏王」，看烙印教程的卡组一览、点卡看说明、展开路线的列表和逐步播放、切页签，桌面宽和手机宽截图留证据，可和设计稿并排。改了 src/ 或 plugin/、要截图给用户看、或要确认「页面上真的这样」时用。
---

# 验证游戏王（verify-yugioh）

两个脚本，都在 `scripts/`（在仓根跑）：

- `yv.mjs`（下文 `yv`）：起一个临时的游戏王服务（`PORT=0`、临时数据目录、编的卡图）；`doctor` 查它、`api` 看第二个视图、`cleanup` 清掉。
- `plugin-verify`（下文 `P`）：先 `yv launch`，再起一个只开 Webapp 的临时 Hermes 网关（插件用本仓的 `plugin/`，后端的 `YUGIOH_URL` 指向那个临时实例），用无头 Chromium 像用户一样点。

只用 Node 22、python3、本机已有的无头 Chromium（`~/Library/Caches/ms-playwright` 的 headless shell，`XV_CHROME` 可换）和 Hermes（`hermes` 在 PATH 或 `~/.local/bin`），不装依赖。登录的 cookie 由 mac-mini 检出里的 `bin/panel-login --webapp` 签（`MAC_MINI_REPO` 可换）；Hermes 的运行时（约 640 MB）第一次装进 `~/Library/Caches/yugioh-verify/runtime`，tv-theater 的验证已经装过时直接用那份（`YUGIOH_VERIFY_RUNTIME` 可换）。

**临时数据是硬规矩**：实例只读这次临时目录，从不读 `~/.mimi-yugioh`，不连 mini 上常驻的 `127.0.0.1:4519`，不碰用户的网页工作区（9120）和面板（9119），不跑 `plugin-setup --live`（它碰线上）。`./ci` 里的冒烟用编的单色小图，不连 NAS。

## Launch

```sh
P=.claude/skills/verify-yugioh/scripts/plugin-verify
$P up                      # 编的单色卡图
$P up --images ~/.cache/mimi-yugioh/real-images   # 用真卡图（先 node scripts/sync-card-images.js <目录> 从 NAS 复制），给用户看的截图用这个
```

`up` 先查 Node 是 22 以上、本仓的依赖装好了（`npm ci`），不对就立刻说怎么修；再打出 run.json、跑一遍 `doctor`；中途失败会把已经起来的停掉。

## Drive

```sh
$P shot <名字> [--design | --mobile] [--tab 卡组一览|展开路线|起手速查] [--select 卡名] [--route ID或名字 | --jump ID] [--step N|起手|last] [--keys] [--compare PNG]
```

从侧栏点「游戏王」（默认是「卡组一览」），可选地：`--tab` 切页签，`--select` 在卡组一览里按卡名点一张卡（等说明区出这张卡）；`--jump ID`（要和 `--tab 起手速查` 一起用）点速查里指向这条路线的第一个按钮，页面应当跳到「展开路线」页签里那条路线的播放页（起手，第 0 步）；`--route` 打开「展开路线」并点列表里的那条（按 id，如 `white-albaz` / `branded-fusion`，或名字的一部分），播放页默认停在「起手」（第 0 步）；`--step N|起手|last`（要和 `--route` 或 `--jump` 一起用）从起手起一步步点「下一步」走到第 N 步（0 或「起手」不动）或最后一步（终场汇总），`--keys` 改按右方向键。手机宽加 `--route` 时整页截长图。视口默认是 1600 宽的桌面、按内容拉高；`--design` 是设计稿的 1280×860 并收起侧栏；`--mobile` 是手机（390×844，按手机模拟）并收起侧栏。网页工作区自己的「Update ready」提示框会被关掉，不盖住页面。`--hover-anim` / `--tap-anim 卡名` 悬停 / 点路线动画里的一张卡（动画框报位置，真鼠标点过去）；`--click-step N|起手` 点步号条；`--play-all` 点「连播」等到终场（用时写进 `.json` 的 `playedMs`）；`--stage-at K:比例` 把动画停在第 K 步的这个比例处（中间帧）；`--net-file 文件` 把这个标签页和动画框发的每个请求写进文件（`.json` 的 `cdp.foreign` 是非本地的）。`--compare` 另写 `<名字>-compare.png`：设计稿在左、这张在右。写进证据目录 `<名字>.png`、`.txt`（页面文字）、`.json`（这个页签发的请求、不同源的请求、有没有横向滚动条 `overflowX`）。

很多张一起截用 `batch`（`./ci` 的冒烟就是这样）：

```sh
$P batch shots.txt [--jobs N]   # N 默认 3；./ci 的冒烟用 6
```

`shots.txt` 一行一张，写 `shot` 后面的那些词（`#` 起是注释）；空行隔开的每一段是一个浏览器，按顺序截，最多 `--jobs` 段同时跑。一段里下一张只比上一张多点几下（同一个宽度；页签、选的卡、路线和上一张相同或在它后面接着点；步数不往回）、而且上一张没做过悬停、点步号、连播、先猜再看这类改状态的动作时，接着上一张的页面走，不重新载入；否则开一个新的浏览器上下文（和全新的配置目录一样）重新载入。每张写的证据和 `shot` 一样；有一张没截成或有不同源的请求就退出 1。要省时间就把能接着走的排在一段里（例如路线列表 → 起手 → 第 1 步 → 中间一步 → 终场）。

第二个视图（不走页面）：`node .claude/skills/verify-yugioh/scripts/yv.mjs api /deck`（只读 GET）。

## Evidence

证据目录 `~/work/personal/.verify/yugioh/<yv run id>/`（`YV_EVIDENCE` 可换），`down` 不删。证明的标准：

- 走用户的路：点页面上的页签、卡、路线和「下一步」，不直接调接口来造结果。路线播放要翻完一条：`--step 起手`、`--step 1`、中间一步、`--step last` 各一张，桌面宽和手机宽都有。
- 动作前后都留：点卡前一张、点卡后一张，加上第二个视图（`yv api /deck`）。
- 桌面宽和手机宽各截一张（`--mobile`），`.json` 的 `overflowX` 要是 false。
- 页面上出现 `NaN`、`undefined`、`Infinity`，或 `shot` 退出 1，就是失败。页面上出现百分比、「还差」、估值或旧功能（打牌、评分、记卡、进步曲线）的字样也是失败（冒烟查）。
- **改界面的票**附截图，和 `~/work/.preview/yugioh/design-r3/` 里对应的 PNG 并排（`--design --compare`）。
- 要给用户看：把截图拷到 `~/work/.preview/<slug>/`，汇报里写那份的绝对路径。`scripts/plugin-smoke.sh` 带 `YUGIOH_SMOKE_KEEP=<目录>` 跑时，过了会把截图都拷过去（编的单色卡图）。

## Cleanup

```sh
$P down                                                          # 停网关和临时实例，删 run 目录，证据留下
node .claude/skills/verify-yugioh/scripts/yv.mjs cleanup --all  # 停掉所有还留着的临时实例（上次失败留下的）
```

每次验证结束都 `down`，失败的那次也一样；不用 `pkill` 这类按名字杀（临时网关和线上的命令行一样）。

## 功能地图

`features/plugin.md` 是要验证什么、怎么走的清单。页面或入口变了就改它，`scripts/plugin-smoke.sh`（`./ci` plugin-smoke）也跟着改。

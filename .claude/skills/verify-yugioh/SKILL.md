---
name: verify-yugioh
description: 在真的游戏王插件页上证明行为：用编的数据起一个临时的游戏王服务和只开 Webapp 的临时 Hermes 网关，无头 Chromium 从侧栏点「游戏王」，开始一手、点卡、发动、回答引擎的提示、结束回合，截图留证据，并和设计稿并排。改了 src/ 或 plugin/、要截图给用户看、或要确认「页面上真的这样」时用。
---

# 验证游戏王（verify-yugioh）

两个脚本，都在 `scripts/`（在仓根跑）：

- `yv.mjs`（下文 `yv`）：起一个临时的游戏王服务（`PORT=0`、临时数据目录、编的卡图），可选地先用固定种子发一手；`doctor` 查它、`api` / `data` 看第二个视图、`cleanup` 清掉。
- `plugin-verify`（下文 `P`）：先 `yv launch`，再起一个只开 Webapp 的临时 Hermes 网关（插件用本仓的 `plugin/`，后端的 `YUGIOH_URL` 指向那个临时实例），用无头 Chromium 像用户一样点。

只用 Node 22、python3、本机已有的无头 Chromium（`~/Library/Caches/ms-playwright` 的 headless shell，`XV_CHROME` 可换）和 Hermes（`hermes` 在 PATH 或 `~/.local/bin`），不装依赖。登录的 cookie 由 mac-mini 检出里的 `bin/panel-login --webapp` 签（`MAC_MINI_REPO` 可换）；Hermes 的运行时（约 640 MB）第一次装进 `~/Library/Caches/yugioh-verify/runtime`，tv-theater 的验证已经装过时直接用那份（`YUGIOH_VERIFY_RUNTIME` 可换）。引擎数据（卡库和脚本）读 `~/.cache/mimi-yugioh/engine`（`YUGIOH_ENGINE` 可换），没有就先 `node scripts/prepare-engine.js "$HOME/.cache/mimi-yugioh/engine"`。

**临时数据是硬规矩**：实例只读这次临时目录，从不读 `~/.mimi-yugioh`，不连 mini 上常驻的 `127.0.0.1:4519`，不碰用户的网页工作区（9120）和面板（9119），不跑 `plugin-setup --live`（它碰线上）。`./ci` 里的冒烟用编的单色小图，不连 NAS。

## Launch

```sh
P=.claude/skills/verify-yugioh/scripts/plugin-verify
$P up                      # 还没发牌：首页有「开始一手」
$P up --hand-seed 37       # 开页面之前先发种子 37（含白之落胤）的一手：页面上点「继续这一手」；每次都是同一手
$P up --hand-seed 37 --images ~/.cache/mimi-yugioh/real-images   # 用真卡图（先 node scripts/sync-card-images.js <目录> 从 NAS 复制），给用户看的截图用这个
```

`up` 打出 run.json 再跑一遍 `doctor`；中途失败会把已经起来的停掉。

## Drive

```sh
$P shot <名字> [--design] [--tab 首页|记卡|记录] [--start|--resume] [--select 卡名] [--do 操作] [--answer N] [--end] [--compare PNG]
```

从侧栏点「游戏王」，可选地：`--start` 点「开始一手」（随机一手）、`--resume` 点「继续这一手」，`--select` 点桌上的一张卡（详情区出角色和三件事），`--do` 点它的操作（发动、召唤……），`--answer N` 回答最多 N 个引擎的提示（取第一个选项，连锁取「不发动」），`--end` 点「结束回合」等结算。`--design` 把视口设成设计稿的 1280×860 并收起侧栏；`--compare` 另写 `<名字>-compare.png`：设计稿在左、这张在右。写进证据目录 `<名字>.png`、`.txt`（页面文字）、`.json`（这个页签发的每个请求和不同源的那些）。有不同源的请求就退出 1。

第二个视图（不走页面）：`node .claude/skills/verify-yugioh/scripts/yv.mjs api /hand`（只读 GET）、`… yv.mjs data hands.jsonl --tail 1`（结算日志的最后一行，结束回合以后看有没有写进去）。

## Evidence

证据目录 `~/work/personal/.verify/yugioh/<yv run id>/`（`YV_EVIDENCE` 可换），`down` 不删。证明的标准：

- 走用户的路：点页面上的按钮，不直接 POST 接口来造结果。固定种子发牌（`up --hand-seed`）是开局的布置，不算造结果。
- 动作前后都留：动作前一张、动作后一张，加上第二个视图（`yv api /hand`）。
- 写日志的功能同时看副作用：结束回合以后 `yv data hands.jsonl --tail 1`。
- 页面上出现 `NaN`、`undefined`、`Infinity`，或 `shot` 退出 1，就是失败。展开中屏上出现百分比、「还差」、估值也是失败（冒烟查）。
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

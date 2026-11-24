# mimi-yugioh

游戏王 Master Duel 的烙印教程 wiki，给用户一个人看：卡组一览（每张卡的卡图、简中名、日文名、作用、效果说明），逐步播放的展开路线（每步的场面由引擎重放得出，终场汇总打断数），以后加上起手速查。形状是 Hermes 插件 + 一个只听本机的服务；路线由规则引擎重放验证。规则、检查和设计见 [AGENTS.md](AGENTS.md)、[DESIGN.md](DESIGN.md)。规格是 #27（取代 #1 的计时练习）。

```sh
node scripts/prepare-engine.js                 # 下载引擎数据（卡库和卡牌脚本）到 ~/.mimi-yugioh/engine（路线重放测试用）
YUGIOH_DATA=$(mktemp -d) npm start             # 起服务（127.0.0.1:4519）
curl -s 127.0.0.1:4519/health
curl -s 127.0.0.1:4519/deck                    # 卡组一览
curl -s 127.0.0.1:4519/routes                  # 展开路线列表（服务启动时用引擎重放；引擎数据在 $YUGIOH_ENGINE，默认 ~/.mimi-yugioh/engine，缺了回 503）
./ci                                           # 全部检查
```

## 部署

在 mac mini 上由 launchd 常驻（`jp.lifan.mimi-yugioh`，`launchd/jp.lifan.mimi-yugioh.plist`），只听 `127.0.0.1:4519`，跑部署目录 `~/Library/Application Support/MimiYugioh/` 里的那份。`npm run deploy`（部署 `origin/main`；`npm run deploy -- <sha>` 部署别的提交；`npm run deploy -- --dry-run` 只导出核对、打出真跑时会做的事，什么都不写）导出、核对、装依赖（`npm ci --omit=dev`）、换上、只重启自己的任务、最后跑冒烟；`npm run smoke` 单独查线上（只读）。数据（引擎数据、卡图，还有旧版留下的日志）在 `~/.mimi-yugioh/`，不在部署目录里，部署不动它。细节见 DESIGN.md「在 mini 上常驻」。

## 插件

`plugin/` 是 Hermes 的磁盘插件 `yugioh`：页面 `plugin/webapp/plugin.js`（侧栏「游戏王」，路由 `/yugioh`），后端 `plugin/dashboard/plugin_api.py`（只把请求转给 `YUGIOH_URL`，默认 `http://127.0.0.1:4519`，必须是本机）。`scripts/plugin-setup --live` 只做两条软链：后端 `~/.hermes/plugins/yugioh → 本仓 plugin/`，页面 `~/.hermes/desktop-plugins/yugioh → 本仓 plugin/webapp`（链整个文件夹）；`--home <目录>` 链进别的 HERMES_HOME（验证用），`--remove` 拆掉；目标处已有别的东西就停下。注意链接指向**本仓的 checkout**（`~/work/personal/repos/mimi-yugioh`），不是部署目录：这个 checkout 要一直在，插件的改动要在这里 `git pull` 后才到线上。页面改了以后：⌘K → Reload desktop plugins；后端（`plugin_api.py`）改了要重启网关（#28 把后端的路径换成了 `/deck`、`/card-image`：部署 #28 时要让用户在独立终端跑一次 `hermes gateway restart`，不然页面取不到卡组一览）；#29 又加了 `/routes`、`/route`，部署 #29 时同样要重启网关。

## 上线清单

上线要用户点头（#12 里 2026-11-23 同意）。按顺序做，每步做完先查再往下。在 mini 上、用 `~/work/personal/repos/mimi-yugioh` 的 main（`git switch main && git pull`，工作树要干净）。`PATH` 里要有 `node`（22）和 `npm`。

**1. 准备数据。** 引擎数据（公开的卡库和脚本）和卡组用到的卡图进 `~/.mimi-yugioh/`：

```sh
node scripts/prepare-engine.js
node scripts/sync-card-images.js --dry-run     # 先看：要复制几个、NAS 上缺哪几张
node scripts/sync-card-images.js
```

查：`cat ~/.mimi-yugioh/engine/VERSION` 有两个 sha；`ls ~/.mimi-yugioh/images | wc -l` 等于 `sync-card-images.js` 说的「卡组用到 N 张」减去「NAS 上没有」的张数（NAS 上缺的卡图页面改写卡名，不挡上线；再跑一次 `sync-card-images.js` 输出「复制 0 个文件」）。`sync-card-images.js` 走 ssh 连 NAS，连不上就停下报告，不换办法。

**2. 部署服务。**

```sh
npm run deploy -- --dry-run     # 先演练：导出核对通过，打出会装 plist、会 bootstrap
npm run deploy
```

查：最后一行是「冒烟通过」；`cat "$HOME/Library/Application Support/MimiYugioh/DEPLOYED"` 等于 `git rev-parse origin/main`；`launchctl print gui/$(id -u)/jp.lifan.mimi-yugioh | grep state` 是 `running`；`curl -s http://127.0.0.1:4519/health` 是 `{"ok":true}`；`launchctl` 里只多了 `jp.lifan.mimi-yugioh`，别的任务没动。冒烟里「卡图缺 N 张」只是提醒，数目要和第 1 步「NAS 上没有」的一致。

**3. 装插件。**

```sh
scripts/plugin-setup --live
```

查：`ls -la ~/.hermes/plugins/yugioh ~/.hermes/desktop-plugins/yugioh` 两条都指回本仓（`plugin/` 和 `plugin/webapp`）。

**4. 打开插件。** 在 `lifaninjp/mac-mini` 的 `hermes/config.yaml` 里给 `plugins.enabled` 加一行 `- yugioh`（只暂存这个文件、提交、推送，照 mac-mini 的规矩）。服务在默认的 `http://127.0.0.1:4519` 时不用设 `YUGIOH_URL`。同一次提交里在 mac-mini 里 `~/work/personal/AGENTS.md` 的原件项目表登记网页路径 `/yugioh`（入口是 Hermes 里的插件，不是单独的网址）。
查：`grep -n -- '- yugioh' hermes/config.yaml` 在 `plugins.enabled` 下面。

**5. 重启网关（用户跑）。** 银月和 worker 都不能跑（会杀掉自己的进程）。让用户在**独立的终端**里跑一句：`hermes gateway restart`（后端在重启时才加载）。
查：`hermes gateway status` 起来了；用户的 Hermes 桌面端侧栏出现「游戏王」。

**6. 在真 Hermes 里验证（银月）。** 打开「游戏王」：第一个页签「卡组一览」按作用分组画出每张卡（卡图是真图），点一张卡出效果说明；手机上经 tailnet 打开同一页也能看；截图。点「展开路线」，翻完一条路线到终场汇总。登录后 `/api/plugins/yugioh/deck`、`/api/plugins/yugioh/routes` 是 200。只读，不写线上数据。
查：`npm run smoke` 通过。

**回退**（哪一步出问题就从那一步往回退；数据一直在 `~/.mimi-yugioh/`，哪一步退都不删它）：

- 插件：从 `hermes/config.yaml` 的 `plugins.enabled` 拿掉 `yugioh`，`scripts/plugin-setup --live --remove`，让用户在独立终端跑 `hermes gateway restart`。查：侧栏没有「游戏王」，`~/.hermes/plugins/yugioh` 不在了。
- 服务：`launchctl bootout gui/$(id -u)/jp.lifan.mimi-yugioh && rm ~/Library/LaunchAgents/jp.lifan.mimi-yugioh.plist`。查：`curl -s http://127.0.0.1:4519/health` 连不上。要回到上一个版本而不是停掉：`npm run deploy -- <上一个 sha>`。
- 数据：`~/.mimi-yugioh/` 里的 `hands.jsonl`、`quiz.jsonl` 是旧版的练习记录，服务已不读，确认不用了再删，删之前要用户说；`engine/` 和 `images/` 是可再生的（重跑第 1 步）。

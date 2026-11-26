# 设计

结构、数据目录、环境变量和口径以本文件为准；代码里的常量照这里写，改的时候两边一起改。术语见 [GLOSSARY.md](GLOSSARY.md)，规格是 #27（烙印教程 wiki，取代 #1 的计时练习），架构约定见 [AGENTS.md](AGENTS.md)「架构约定」。

## 结构

```
src/server.js        本地服务（Node 22 内置 http，只监听 127.0.0.1:4519）：/health、卡组一览、展开路线、卡图；环境变量只在这里取；启动时用引擎重放每条路线并缓存
src/deck.js          卡组：展开张数、`cardOf`（一张卡的展示数据，等级 / 阶级 / 连接数在这里并进去）、检查卡组数据（40/15 张、禁限、每张卡的名字、作用、三件事、打断数和怎么打断）、卡组一览（每张卡带默认作用标签）；纯函数
src/banlist.js       Master Duel 禁限表（自己维护，现行 11-24 公告的表（12-04 适用），只收和卡组有关的条目）
src/duel-session.js  决斗会话：包住规则引擎 ocgcore-wasm，一手牌一个会话；开局（卡组、起手、种子）、当前提示和合法选项、提交选择、查场面、存档回滚；纯逻辑，卡库和脚本由调用方注入
src/route.js         展开路线重放：把一条路线的步骤喂给决斗会话，走到我方回合结束，返回终场和每一步之后的场面，并和路线上写的终场对照
src/route-view.js    路线的展示数据：把 playRoute 重放出的每一步场面配上卡名、算和上一步的差异、标刚进来的卡、汇总终场和打断数；纯函数，引擎由调用方注入
src/interrupts.js    终场打断数：按卡组数据里每张卡的打断条件（from / perTurn / needs / pay / ownTurnLock / tags）和终场的 used（自己回合发动过的效果）算一个终场能打断几次、靠哪几张卡；路线终场汇总、起手速查、搜索、随机起手模拟都只调它；纯函数
src/roles.js         作用标签：检查卡组数据里的 roleTags（词在术语表里、每张卡有默认作用、原因在一条路线内不重复），并算路线每一步中场每张卡此刻的作用（这一步写的 / 沿用 / 默认）、手牌里哪些卡此刻有作用（手坑、终场算进打断数的手牌）；纯函数
src/lookup.js        起手速查：检查卡组数据里的 lookup（目标路线存在、起手里的卡对得上路线数据）、把它展开成 GET /routes 的 lookup（卡名、目标路线的名字和打断数）；纯函数
src/decks/branded.js         烙印卡组数据：卡表、卡名、作用、三件事、打断数和怎么打断
src/decks/branded-routes.js  烙印的展开路线（引擎可重放的步骤序列）：Game8 两条，另有从 B站专栏路线图、T³ 文库 Mas 的展开一览补的几条，和本仓随机起手模拟（docs/opening-analysis.md）里搜出的几条，每条带出处
src/decks/branded-levels.js  烙印每只怪兽的等级 / 阶级 / 连接数（单独一处，测试对照引擎卡库）
src/decks/branded-roles.js   烙印的作用标签：术语表（词、解释、颜色）、每张卡的默认作用和原因、每条路线每一步中场卡的覆盖；不改卡表行
src/decks/branded-lookup.js  烙印的起手速查数据：关键卡 → 路线，缺卡改走哪条（只指向 branded-routes.js 里的路线 id）
src/search.js        最好场面搜索（离线分析用，#37）：在决斗会话里做有限偏离的深度优先搜索（存档回滚、置换表），按场面值评估终场；上限按节点数；纯逻辑，见「随机起手模拟」
src/opening-sim.js   随机起手模拟：发牌（mulberry32）、总种子派生每手种子、一手的模拟（搜索 + 已知路线取更好的）、记录重放和对照；纯逻辑，引擎、「现在」由调用方注入
src/opening-report.js  随机起手模拟的报告：JSONL 的行 → 统计 → docs/opening-analysis.md 的文字；纯函数
src/engine-files.js  读引擎数据：cards.cdb（node:sqlite）和卡牌脚本，给会话提供 cardReader、scriptReader、卡名；只读
src/anim-stage.js   路线动画的舞台：尺寸（800×859）、每个区的位置（横幅 / 发动牌专用条、怪兽区、魔陷区、额外怪兽区、手牌、左右两列堆）、颜色、守备横放的缩放、占位矩形；纯数据和几何
src/anim-plan.js    路线动画的计划：读一条重放过的路线，每步按引擎的 `moves`（含落点的 sequence）配动作（卡从哪个区飞到哪一格、融合 / 同调的素材和特效、发动的光和连锁号、守备横放），产出轨道表、每个位置的时间段和合成页的 HTML 片段；纯函数
src/anim-render.js  路线动画的合成页：样式、合成页里的交互脚本、轨道引擎、运行时、卡图（CSS 里的 data: 地址）拼成一页 HTML；`inlineJs`（内联脚本转义，anim-page 也用它）；纯函数，卡图和运行时由调用方给
src/anim-engine.js   合成页里跑的小时间轴引擎（字符串形式的浏览器脚本；轨道表 + seek(t)，不用 gsap），按 HyperFrames 运行时的 `window.__timelines` 约定登记
src/anim-page.js     路线动画的页面：合成页放进 `<hyperframes-player>`，外面包一层外壳页（CSP、和插件页之间的消息），做成 data: 地址；`buildRouteAnim` 是 GET /route-anim 的内容；纯函数
src/vendor-files.js  读 vendor/hyperframes/ 里的第三方文件（只读；boundary 表里的一个文件）
vendor/hyperframes/  HyperFrames 0.9.91 的播放器和运行时（Apache-2.0，原样放着；LICENSE、NOTICE.md 写了版本和 md5）；`./ci` 的 outbound 只扫 `src/` 和 `plugin/`，不扫这里
src/store.js         数据目录的读取（卡图）；唯一碰数据目录的地方
scripts/prepare-engine.js  把固定版本的 Project Ignis CardScripts 和 BabelCDB 的 cards.cdb 下载到引擎数据目录（唯一联网的地方）
scripts/fetch-card-names.js  按日文卡名向 ygocdb 查密码和简中名（md_name），整理卡组数据时手动跑；服务不联网
scripts/sync-card-images.js  把卡组用到的卡图从 NAS 经 ssh（stat + tar）复制到数据目录 images/；手动跑，`--dry-run` 只打出要复制的文件数
launchd/             在 mac mini 上常驻用的 launchd 配置 jp.lifan.mimi-yugioh（见「在 mini 上常驻」）
scripts/opening-sim.js  随机起手模拟（离线，#37）：固定种子发 5 张先攻起手，每手搜最好场面并试已知路线，每手一行追加到 JSONL，可续跑、可 `--shard` 并行；手动跑，不进 ./ci
scripts/opening-report.js  JSONL → docs/opening-analysis.md（纯计算）；`--merge` 把几个分片合成一份 JSONL
scripts/opening-common.js  opening-sim.js 和 opening-replay.js 共用：引擎数据目录的默认值、报错退出
scripts/opening-replay.js  从 JSONL 取一手（`--seed` 或 `--index`）搜出的步骤，在引擎里重放，打出终场和打断数并和记录对照
scripts/deploy.js    部署到 mini：导出 origin/main、核对、装依赖、换上、只重启自己的任务、冒烟；`--dry-run` 只演练
scripts/smoke.js     线上冒烟（只读）：部署的版本、/health、/deck、/routes（有路线、每条重放通过）、卡组用到的卡图
scripts/plugin-setup  把插件链进 Hermes 的插件目录（`--home <目录>` 沙盒用；`--live` 是上线那一步，单独一张票，要用户点头）
scripts/plugin-smoke.sh  ./ci 的插件冒烟：临时 Hermes 网页工作区里看卡组一览、点卡看说明、展开路线列表和逐步播放（起手、第 1 步、中间一步、终场），路线动画（下一步播完停住、点步号跳、连播到终场、中间帧、动画里悬停 / 点卡、网络记录里没有非本地请求），桌面宽和手机宽各一遍
scripts/check.js     ./ci 用的架构约定检查（boundary、deps-whitelist、outbound、test-isolation、plugin、plugin-loads）
plugin/              Hermes 插件「游戏王」（路由 /yugioh）：plugin.yaml、dashboard/（后端，只转发给本机服务）、webapp/plugin.js（页面）
.claude/skills/verify-yugioh/  在真页面上验证的技能：yv.mjs（临时服务）、plugin-verify（临时网页工作区）、plugin-shot.mjs（无头 Chromium）
test/                模块测试与起服务的测试（帮手 helpers.js：PORT=0、临时数据目录、打开引擎、按计划驱动会话）
ci                   合并前的统一检查（land 跑它），检查项在 checks/list（./ci 是 mac-mini 共用运行器的拷贝）
```

## 环境变量

| 环境变量 | 默认 | 用途 |
|---|---|---|
| `PORT` | `4519` | 端口（`0` = 随便挑一个空闲的） |
| `YUGIOH_DATA` | `~/.mimi-yugioh` | 数据目录（仓外、不进 git） |
| `YUGIOH_ENGINE` | `$YUGIOH_DATA/engine` | 引擎数据目录（卡库、脚本）：`scripts/prepare-engine.js` 下载到这里，测试、`./ci` 和离线分析脚本（`scripts/opening-*.js`，见「随机起手模拟」）用 `~/.cache/mimi-yugioh/engine`。服务启动时用它重放展开路线（`/routes`、`/route`）；目录里没有数据时这两个接口回 503，别的接口照常 |
| `YUGIOH_URL` | `http://127.0.0.1:4519` | 插件后端转发到哪个服务（只许本机）；在 Hermes 网关的环境里设 |
| `YUGIOH_DEPLOY_DIR`、`YUGIOH_AGENTS_DIR`、`YUGIOH_LAUNCHCTL`、`YUGIOH_NPM`、`YUGIOH_SMOKE_BASE`、`YUGIOH_LOG` | mini 上的真实位置 | 只给部署、冒烟的演练换成临时的（部署目录、LaunchAgents 目录、launchctl 和 npm 命令、冒烟连的地址、日志） |
| `YUGIOH_NAS`、`YUGIOH_NAS_IMAGES` | `lifan222@192.168.10.124`、`mimi-projects/mimi-yugioh/images/cn` | 只有 `scripts/sync-card-images.js` 读：NAS 的 ssh 地址和卡图目录（相对它的家目录） |

## 在 mini 上常驻

游戏王服务在 mac mini 上由 launchd 常驻（`launchd/jp.lifan.mimi-yugioh.plist`，`RunAtLoad` + `KeepAlive`），只监听 `127.0.0.1:4519`。**没有自己的网页、不加 tailscale 转发**：给用户的入口只有 Hermes 网页工作区里的插件「游戏王」，插件后端在同一台机器上转给 4519。服务不往外发请求。

跑的是部署目录 `~/Library/Application Support/MimiYugioh/` 里的那份，不跟着仓的 checkout 变；数据目录 `~/.mimi-yugioh/`（`engine/`、`images/`，还有旧版留下的日志）在部署目录之外，换部署不动它。部署：在仓里跑 `npm run deploy`（部署 `origin/main`；`npm run deploy -- <提交>` 部署别的提交，回滚就是部署上一个 sha）。它做的事（`scripts/deploy.js`）：

1. 部署 `origin/…` 时先 `git fetch`，取要部署的提交的 sha；
2. `git archive` 导出到部署目录旁边的新目录，和提交逐文件比对（字节相同、不多不少），不一致就停下并写明少了、多了或不一样的文件；
3. 在新目录里 `npm ci --omit=dev --ignore-scripts`（`git archive` 不带 `node_modules`；这是部署唯一联网的一步，装 `ocgcore-wasm`）；装不上就停在这，原来的那份没动；
4. 写 `DEPLOYED`（部署的 sha），把新目录整体换上、旧的删掉；换的时候失败就把原来的放回去，不留下临时目录；
5. 刚部署的那份 plist 和 `~/Library/LaunchAgents/` 里的一样就只 `launchctl kickstart -k gui/<uid>/jp.lifan.mimi-yugioh`，不一样就拷过去再 `bootout` + `bootstrap`（`bootstrap` 失败隔一秒再试，最多三次）；只动 `jp.lifan.mimi-yugioh`；
6. 跑冒烟，退出码跟冒烟。

`--dry-run` 只做 1、2（导出到系统临时目录核对完就删），再打出 3–6 真跑时会做的事；不写部署目录、不装依赖、不碰 launchd、不冒烟。

冒烟（`npm run smoke`，`scripts/smoke.js`）只读：`DEPLOYED` 等于期望的 sha（默认 `origin/main`）；`127.0.0.1:4519` 的 `/health`（`{ok:true}`）、`/deck`（有卡）、`/routes`（有路线和起手速查、速查指向的路线都在列表里；引擎数据在、每条重放得通才是 200）都 200；卡组用到的每张卡图经 `/card-image` 都读得到（缺了只提醒：页面改写卡名）；服务日志超过 10 MB 时提醒。输出一行一项「通过 / 失败 / 提醒」，有失败就非 0。

`./ci` 的插件冒烟（`scripts/plugin-smoke.sh`，临时网页工作区里无头 Chromium 截图，截图拷到 `YUGIOH_SMOKE_KEEP` 目录）除卡组一览外，还截 `/routes` 的路线列表和白之落胤线的播放页：起手（第 0 步）、第 1 步、中间一步、终场（桌面宽按钮和右方向键各一次、手机宽），烙印融合线的终场；起手速查截桌面宽和手机宽，并从速查点路线（阿卢绯尔线、白之圣女线、天底的使徒线）看跳到播放页、翻到终场；每张查页面文字和不横向滚动。

日志在 `~/Library/Logs/mimi-yugioh.log`。查跑的是哪个版本：`cat "$HOME/Library/Application Support/MimiYugioh/DEPLOYED"`。node 用 mise 装的绝对路径（`…/mise/installs/node/22/bin/node`，`22` 是指向当前小版本的软链接）；服务不读 iCloud，不要完全磁盘访问权限，也不连 NAS（卡图由 `sync-card-images.js` 手动复制进 `images/`）。上线的整个顺序（准备数据、部署、装插件、回退）见 README「上线清单」。

## 引擎数据

`scripts/prepare-engine.js` 下载两样公开数据到引擎数据目录，版本固定在脚本顶部的两个 sha：

- `scripts/`：Project Ignis CardScripts 的 `SCRIPTS_SHA` 那一版（卡牌脚本，Lua）
- `cards.cdb`：Project Ignis BabelCDB 的 `CDB_SHA` 那一版（卡库，SQLite，卡名是日文）
- `VERSION`：记下上面两个 sha；目录已经是这个版本就不重复下载

引擎里没有 Master Duel 的禁限表，要自己生成（以后的票）。卡图不进仓，在 NAS。

## 决斗会话

`startSession(engine, { hand, deck, extra, seed })`：我方是 0 号玩家、先攻，起手 `hand` 直接放进手牌，`deck` 是剩下的主卡组（引擎按种子洗），`extra` 是额外卡组；对手用 40 张没有效果的通常怪兽凑数，它的提示由会话自动放弃，所以不会打断展开。

- `prompt()`：`{ kind, player, min, max, options[] }`；决斗结束时 `null`。`kind` 有 `idle`（主阶段：召唤、特招、发动、盖放、改变表示形式、进战斗、结束回合）、`cards`（选卡 / 选祭品，选 min–max 张）、`pick-one`（逐张选，末项可能是「选完」）、`chain`（连锁，末项可能是「不发动」）、`yes-no`、`option`、`position`、`place`（怪兽区 / 魔陷区的格子）。还没支持的引擎提示给 `unsupported`，`choose` 会抛错。
- `choose(indices)`：选项下标数组（单选放一个）。下标越界、重复、个数不在 min–max 内抛错，状态不变。
- `board()`：我方场面，每个区域是 `{ code, name, sequence, position }` 的列表（手牌、怪兽区含额外怪兽区、魔陷区含场地区、墓地、除外、主卡组、额外卡组；`position` 是引擎的 POS_* 位）。
- `events`：引擎发出的卡片移动消息的记录，按发生顺序，到我方回合结束为止。`{ type: 'move', code, from, to, reason, summon?, chain? }`（`from` / `to` 是 `{ controller, location, sequence, position }`，来自 MSG_MOVE；`summon` 是紧跟其后的 MSG_SUMMONING / MSG_SPSUMMONING 说的召唤方式：`normal`，或 `special` / `fusion` / `synchro` / `xyz` / `link` / `ritual`，特殊召唤的种类取自这次召唤前素材移动的 `reason`（REASON_MATERIAL 加 FUSION / SYNCHRO / XYZ / LINK / RITUAL）；`chain` 是发生时正在连锁的第几环）和 `{ type: 'chaining', code, controller, chain }`。路线重放按步切片。
- `checkpoint()` / `rollback(n)`：存档就是「已提交了几个选择」；回滚用同一个种子重新开局并重放前 n 个选择，所以回滚后的提示和场面和存档时一致。每次回滚要重建决斗、重新加载 `constant.lua` 和 `utility.lua`，再加重放 n 个选择的时间，所以越深越慢；要量就在 `rollback` 前后计时。
- `openHandSession(engine, deck, hand, seed)`：重放路线从它开会话：起手 `hand`，卡组是「主卡组 − 起手」（按卡组数据里的顺序交给引擎洗），种子由发牌的种子推出（同一个种子同一副洗牌）。同一手起手、同一个种子，洗牌和每一步的提示都一样；路线不该依赖洗牌，换种子也要走得通（测试查）。
- `scriptErrors`：引擎脚本报的错，正常的一手应该是空。

## 卡组数据

`src/decks/<卡组>.js` 导出一个卡组对象 `{ name, source, roles, cards, main, extra, levels?, routes, lookup, roleTags }`：

- `source`：卡表的出处 `{ name, url, date }`（页面版本日期），卡组一览上显示并链过去。
- `roles`：卡表行 `role` 的取值和含义，`[{ name, note }]`（`name` 是 `启动 / 检索 / 融合素材 / 终场 / 手坑`，`note` 是页面上组名下的一句含义，词义见 GLOSSARY.md「作用」；含义的原文只写在这里）。
- `cards`：密码 → `{ jp, md, role, interrupts, interruptHow, does, cost, limit }`，有打断的卡另有 `from / perTurn / needs / pay / ownTurnLock / tags`（见下），别的卡可能有 `tags`。`md` 是 Master Duel 简体中文客户端的译名（ygocdb 的 `md_name`，用 `scripts/fetch-card-names.js` 查，写死在数据里；字符照抄，不手敲：库妸㽗 是 U+5E93 U+59B8 U+3F57），`jp` 是日文名。`role` 是 `roles` 里某个 `name`；`does / cost / limit` 是「三件事」，我们自己的概括；`interrupts` 是这张卡每张在对手回合里能打断几次，`interruptHow` 写怎么打断，`interrupts` 是 0 就是空字符串。有打断的卡另写发动条件（照 ygocdb 的卡片原文，结构化，不写在算法里）：`from`（从哪发动，默认 `['field']`，铁兽鸟 墨丘利耶是 `['hand', 'field']`）、`perTurn`（同名卡每回合最多用几张）、`ownTurnLock`（效果号 n，卡片脚本里 `aux.Stringid(密码, n)` 的 n：这个效果在自己回合发动过，到下一个对手回合结束前都不能再用，终场的 `used` 里有这一格的这个效果就不算；引擎报的描述号是 `密码 << 20 | n`。只给限制跨到对手回合的效果写，现在只有冰剑龙 镜翠幻种的除外效果：脚本在自己回合发动后挂一个到对手回合结束才重置的标记。别的打断卡的「每回合一次」在自己回合结束时就重置，自己回合用过不影响对手回合，#44 对着引擎脚本逐张查过）、`needs`（前提，只看有没有：`field / hand / handOrField / grave / extra` 各要几张符合规格的卡，`anyOf` 满足其一）、`pay`（会用掉终场资源的代价：`{ discard: n }` 弃手牌，`{ extra: 规格 }` 从额外卡组送一只）；规格是标签、密码或它们的数组，标签写在卡的 `tags` 里（`albazFusion` 以阿尔白斯之落胤为融合素材的融合怪兽、`mentionsAlbaz`、`albazName`、`albazNameOnField`、`lightDark`，含义见 `src/decks/branded.js` 文件头）。`cost` 是「三件事」里给人看的代价文字，不是 `pay`。一个终场的打断数由 `src/interrupts.js` 的 `countInterrupts` 按这些字段算（写法和资源怎么分配见那个文件开头），不在路线里手写；`checkDeck` 也查这些字段的写法。
- `main` / `extra`：`{ code, count }` 列表。`checkDeck` 查张数（主 40、额外 15、不超禁限表上限）和每张卡的字段是否齐，`interrupts` 和 `interruptHow` 是否对得上（有打断就要写怎么打断，没有就留空）。
- `routes`：展开路线，`{ id, name, source, verified, mismatch?, needs, hand, steps, end }`。`source` 是这条路线的出处 `{ name, url, date }`（页面版本日期；取自本仓随机起手模拟的路线写「本仓 500 手模拟（seed 那一手的发牌种子）」，链到 `docs/opening-analysis.md`，`date` 是报告那一版的日期，按模拟那一手改过的地方（去掉依赖洗牌的抽牌、多余的卡）写在路线数据的注释里），`verified` 是引擎重放验证的日期（写在数据里，改了路线或引擎要重新验证再改它），`mismatch` 是教程和引擎结果不一致处的说明（一致就不写）。`hand` 是起手 5 张（必要卡 + 填充牌），`steps` 每步 `{ text, do }`，`do` 是给引擎的回应（写法见 `src/route.js` 开头），`end` 是出处页面写的我方回合结束时的终场 `{ monsters, spellTraps, hand }`（`hand` 是剩几张手牌；出处没写时，按起手张数减去这条路线用掉的算，写法同 `src/decks/branded-routes.js` 文件头）。`playRoute` 重放（返回终场、路线数据里每一步走完后的场面 `stepBoards`、每步的引擎动作文字和发动了效果的卡，另有按引擎的提示切的 `boards`），`diffEnd` 和 `end` 对照。
- `levels`（可选）：密码 → `{ level }` / `{ rank }`（Xyz 阶级）/ `{ link }`（连接数），每只怪兽一项，魔法陷阱没有。烙印的在 `src/decks/branded-levels.js`（不混进卡表行，`test/route-moves.test.js` 对照引擎卡库 cards.cdb 查）；`cardOf` 把它并进每张卡，所以快照里的卡和 `/deck` 的卡都带 `level` / `rank` / `link`。
- `roleTags`：作用标签 `{ terms, defaults, routes }`，写法和规矩见 `src/decks/branded-roles.js` 文件头：`terms` 术语表 `[{ name, note, color }]`；`defaults` 密码 → `{ tags, why }`（卡表里每张卡都有，1–2 个词和一句原因）；`routes` 路线 id → 步号 → 密码 → `{ tags, why }`（这一步中场卡此刻的作用，覆盖默认；刚上场的那一步必须写，之后沿用）。`checkDeck` 调 `checkRoleTags`（`src/roles.js`）查：词都在术语表里、每张卡有默认作用、原因至少 10 字、默认作用之间不重复、同一条路线里的覆盖和默认作用及本路线别的步不重复（不同路线走同一步棋可以写同一句）、路线和步号存在。作用标签和上面的 `role`（粗分类，起手速查、随机起手模拟、弹窗的「对手回合」那句用它）是两回事。
- `lookup`：起手速查，`[{ card, routes, fallbacks }]`，一项一张关键卡（`card` 是密码），三个字段都必填（没有缺卡改走的写 `[]`）。`routes` 是手里有它走哪条：`[{ route, with? }]`，`route` 是路线 id，`with` 是这条路线起手里还要搭的那张卡（两卡以上的展开才有，如烙印之气炎搭软绵雀精或黑衣龙 阿尔比昂；只写一张，三卡展开的第三张写在路线名里）。`fallbacks` 是缺卡改走哪条：`[{ lack, have, route, how }]`，缺 `lack`、手里有 `have`（一张或几张）时改走 `route`，`how` 是为什么走得通，只写那条路线的步骤里真有的事。`checkLookup`（`src/lookup.js`）查：每个 `route` 都是 `routes` 里的 id，关键卡、`with`、`have` 都在那条路线的起手（`hand`）里，`lack` 不在，每张卡都在卡表里，`how` 非空，关键卡不重复；只在测试里查（`test/branded-data.test.js`，同 `checkDeck`），服务启动不查；运行时 `lookupView` 遇到指向的路线不在重放结果里就抛错，`/routes` 回 503。速查不手写打断数和步数：展示时取重放出来的路线（`lookupView`）。

第一套（烙印）的卡表照 Game8 2026-11-20 版取用，有一处不照：页面的卡表没有赫之烙印，路线 A 却要用阿卢绯尔检索它，所以数据里是 烙印之气炎 ×2 + 赫之烙印 ×1（页面是 烙印之气炎 ×3）。

会话的 `endBoard`：我方回合结束（对手回合开始）那一刻的场面，之后的抽牌不算；没结束是 `null`。路线重放读它。除了各区（同 `board()`），另带 `used`：我方回合里发动过、发动后那张卡没离开那一格的效果 `[{ code, description, zone, sequence }]`（`description` 是引擎报的效果描述号，字符串，同提示选项的 `description`；`zone` 是 `board()` 的区名；那一格的卡被移走，它的记录就作废，引擎也在卡离开时重置它身上的标记），终场打断数用它去掉自己回合已经锁住的效果（`ownTurnLock`，见「卡组数据」）。

## 接口

只听 127.0.0.1，只读。错误是 `{ error }`；没有的路径 404（旧版的 `/hand*`、`/home`、`/cards`、`/quiz*` 都删了，也是 404）。

| 路径 | 作用 |
|---|---|
| `GET /health` | `{ ok: true }` |
| `GET /deck` | 卡组一览：`name`、`source`（`{ name, url, date }`）、`roles`（作用的先后，每项 `{ name, note }`）、`roleTerms`（作用标签的术语表，每项 `{ name, note, color }`）、`cards`（主卡组在前、额外卡组在后，各自照卡组数据的顺序；页面按每张卡 `roleTags` 的第一个词分组；每张 `code`、`md`、`jp`、`level` / `rank` / `link`（怪兽才有）、`role`、`zone`（`main` / `extra`）、`count`、`does / cost / limit`、`interrupts`、`interruptHow`、`roleTags`（默认作用，1–2 个词）、`roleWhy`（一句原因））。不含卡图 |
| `GET /routes` | `{ routes, lookup }`。`routes[]` 是展开路线列表，每条 `id`、`name`、`needs`（起手卡 `{ code, md, jp }`）、`interrupts`（终场打断数）、`steps`（步数）、`source`、`verified`、`mismatch`、`engineDiff`。`lookup[]` 是起手速查，一项一张关键卡：`card`（`{ code, md, jp }`）、`routes[]`（手里有它走哪条：`id`、`name`、`interrupts`、`steps`，两卡展开另有 `with`，搭的那张卡 `{ code, md, jp }`，单卡起手是 `null`）、`fallbacks[]`（缺卡改走哪条：`lack`、`have[]`（都是 `{ code, md, jp }`）、`route`（同 `routes[]` 的一项）、`how`）。目标路线的名字、打断数、步数取自重放出的路线，和 `routes[]` 里同 id 的一致，页面不用再请求。引擎数据缺失或重放不通 503 `{ error }`（没有 `lookup`） |
| `GET /route?id=X` | 一条路线：`id`、`name`、`needs`、`source`、`verified`、`mismatch`、`engineDiff`、`start`（起手场面）、`steps`（每步的说明、场面快照、差异）、`end`（终场汇总），格式见「路线快照」。没有这个 id 404；缺 id 也是 404；引擎问题 503 |
| `GET /route-anim?id=X` | 一条路线的动画页：`id`、`src`（`data:text/html;base64,…`，页面放进 SDK 的 SandboxedFrame；带卡图、HyperFrames 播放器和运行时，几 MB）、`starts` / `ends`（每个位置一项：0 = 起手，1..N = 第几步；开始帧、结束帧的秒数，结束帧 = 这一步走完、卡都停稳的那一刻）、`duration`、`stage`（`{ w, h }` = 800×859）。第一次请求时拼，按路线缓存。没有这个 id 404；引擎问题 503 |
| `GET /card-image?code=N` | 一张卡图，`{ code, type, base64 }`（插件经 `ctx.rest` 只读 JSON，页面拼成 data: 地址）；数据目录 `images/` 里没有就 404；`code` 只收纯数字 |

## 路线快照（`src/route-view.js`）

`replayRoute(engine, deck, route)` 重放一条路线，返回 `GET /route` 的内容。场面**不手写**，全部来自引擎重放：

- `steps`：路线数据里每一项 `steps` 一条（条数 = `route.steps.length`），`{ n, text, actions, activated, board, diff, moves }`。`board` 是这一步走完后我方的完整场面：`hand`、`monsters`（含额外怪兽区，`sequence` 5、6）、`spellTraps`（含场地）、`grave`、`banished`、`deck`（主卡组每一张，顺序是引擎洗牌后的）、`extra`（额外卡组每一张），每张卡 `{ code, md, jp, level?/rank?/link?, sequence }`（`sequence` 是区内位置；怪兽才有等级 / 阶级 / 连接数），怪兽区和魔陷区的卡多一个 `position`：`attack`（表侧攻击）、`defense`（表侧守备，页面横放）、`facedown`（里侧），刚进来的卡多一个 `fresh: true`。`diff` 是和上一步（第 1 步对比起手 `start`）相比 7 个区各自的 `{ in, out }`：进来了哪些、离开了哪些，即「花了什么 → 换来什么」（按密码数张数，区内换位置不算）。`activated` 是这一步里引擎记到的我方发动效果的卡，`actions` 是这一步引擎动作的文字（去掉「发动」「选完」「放在第几格」这类机械确认）。最后一步的 `board` 是终场。
- `roles`（每步一项，数组）：这一步走完后中场（`monsters` 加 `spellTraps`）每个密码一条，`{ code, md, jp, …, tags（1–2 个作用词）, why（此刻为什么是这个作用）, from, since? }`；`from` 是 `step`（这一步写了）、`carried`（沿用之前写的，`since` 是写在第几步）、`default`（默认，`why` 是卡的默认原因）。由 `resolveRoles`（`src/roles.js`）按卡组数据的 `roleTags` 算，不依赖引擎之外的东西；刚上场（`fresh`）的卡必须是 `step`（测试查）。
- `handRoles`（每步一项）和 `startHandRoles`（起手）：手牌里此刻有作用的卡，每个密码一条 `{ code, md, jp, …, tags, why, from }`。作用数据只写中场，手牌不另写：默认作用里有「手坑」的卡用默认作用；终场那一步算进打断数的手牌（如铁兽鸟 墨丘利耶）也标，默认作用里有「打断」就用默认作用，没有就是「打断」+ 怎么打断（`from: 'breaker'`）；别的手牌不标。由 `handRoles`（`src/roles.js`）算。
- `moves`：这一步里引擎自己发出的卡片移动（会话的 MSG_MOVE，按发生顺序，只列我方的卡；**不是从 diff 推断的**）：`{ code, md, jp, level?/rank?/link?, from, to, fromSequence, sequence, position?, summon?, chain? }`。`fromSequence` 是出发处的区内位置（同密码的几张卡在场上时靠它认是哪一张离开），`sequence` 是引擎说的去处的区内位置（MSG_MOVE 的 `to.sequence`：怪兽区 0–4 主怪兽区、5–6 额外怪兽区，魔陷区同理，手牌、墓地等是进去之后的第几张），动画里所有落点的格子都取自它，不自己挑；`from` / `to` 是区名 `hand / monsters / spellTraps / grave / banished / deck / extra`（Xyz 素材是 `overlay`，快照里没有这个区，现有卡组没有 Xyz）；`position` 是去处在怪兽区 / 魔陷区时的表示形式；`summon` 是这只怪兽被召唤的方式（`normal`、`special`、`fusion`、`synchro`、`xyz`、`link`、`ritual`，取自引擎消息）；`chain` 是移动发生时正在连锁的第几环（发动魔法上场、支付之前不在连锁里）。每个区、每个密码的净进出等于 `diff` 的 `in` / `out`（`test/route-moves.test.js` 对每条路线每一步查）。注意引擎的移动语义：融合 / 同调的素材移动的 `reason` 带 MATERIAL，去处由效果决定（同调素材进墓地；白之落胤线第 14 步冰剑龙的融合素材，卢绯里昂回额外卡组、除外的白之落胤回主卡组）；除外的怪兽回场是一条 `banished → monsters` 的移动。
- `end`（终场汇总）：`monsters`、`spellTraps`、`hand`、`grave`、`banished`，`interrupts` = 终场的打断数（`countInterrupts`：发动条件满足的各卡 `interrupts` 之和，墨丘利耶在手牌也算，自己回合用过除外效果的冰剑龙不算），`breakers` 列出每个打断靠哪张卡、算进去几张、怎么打断（`interruptHow`）；条件不满足的卡不列。不在路线里手写。
- `engineDiff`：引擎重放的终场和路线上写的 `end` 的差异（`diffEnd`，空 = 一致）；`mismatch`：路线数据里写的说明。教程和引擎不一致时两者都在，页面醒目显示；路线测试要求 `engineDiff` 非空时 `mismatch` 必须有（`test/route-view-http.test.js`）。
- `source`、`verified`、`needs`（起手卡 `{ code, md, jp }`）、`start`（起手场面）。

服务启动时对 `BRANDED.routes` 逐条重放并缓存（启动后台跑，请求等它跑完；耗时随路线数和步数增长，要量就在服务刚启动时给第一次 `/routes` 请求计时）。引擎数据缺失或哪条重放不通（脚本报错、步骤对不上提示），`/routes` 和 `/route` 都回 503 和原因，不让页面显示没验证过的路线。

## 随机起手模拟（离线分析，#37）

不进服务、不进页面。`scripts/opening-sim.js` 对随机起手搜最大化的展开，结果存成 `docs/opening-analysis.jsonl`，`scripts/opening-report.js` 由它生成 `docs/opening-analysis.md`。

- **发牌**：总种子（默认 `DEFAULT_SEED`）按 mulberry32 派生每手的种子，所以 `--count` 少的是多的前缀。每手：主卡组 40 张按这手的种子洗牌取前 5 张当先攻起手；引擎里剩下的牌由 `openHandSession` 用同一个种子洗（和路线重放同一个入口）。
- **场面值** = 10 × 终场的打断数 + 1 × 剩余手牌数（`src/search.js` 的 `boardValue`；打断数由 `src/interrupts.js` 按卡组数据里的条件算，和路线终场汇总同一个函数）。
- **搜索**（`searchSession`）：有限偏离深度优先，每个提示上先排好试的先后（起手含某条已知路线的初动卡时，路线展平成回应序列当参考；其次路线里出现过的动作和选过的卡、卡表里打断数和作用高的卡；结束回合排最后；连锁窗口里路线没用过的发动排在放行后面），一条路线上最多 `MAX_DISCREPANCY`(2) 处不走排第一的，先搜 0 处、再 1 处、再 2 处。主阶段提示上有置换表。选卡同一密码只算一种，选一张最多试 `MAX_BRANCH`(5) 个、选多张最多 `MAX_COMBOS`(4) 种组合；放哪一格和表示形式只试第一个；不进战斗阶段、不改变表示形式、不盖放没有打断数的卡；一条路线最多 `MAX_RESPONSES`(250) 个回应。这些是近似：搜出的是「这个范围里最好的」，场面值保证可达（见下面的重放核对），不保证是理论最高。
- **上限按节点数，不按毫秒**：`--max-nodes`（默认 `DEFAULT_MAX_NODES`）是一手最多走多少个回应（节点）。用完时搜索停在原地，记下停之前找到的最好的，这手标 `capped: true`。毫秒只记录（`ms`），不参与任何决定，所以同一手、同一种子、同一上限的结果完全一样：续跑和一口气跑出的 JSONL 相同（毫秒除外）。
- **已知路线**：每手把 `deck.routes` 每一条用这手实际的起手和种子重放一遍（`playRoute`，起手换成这手的），对不上引擎提示就算走不了（`null`）。最好值取搜索和路线里更高的，同值记搜索；记下 `searchValue`、`routeValue`（走得通的路线里最高的）、`bestRoute`、`routeValues`。`searchValue > routeValue` 的手是新路线候选。
- **重放核对**：搜出的步骤再用 `playRoute` 重放一次，场面值对不上就不采信搜索值（`searchReplayOk: false`，报告里写手数）。`scripts/opening-replay.js` 是同一件事的命令行：取 JSONL 里那手的步骤重放，和记录对照。
- **JSONL 一行一手**：字段见 `src/opening-sim.js` 开头。续跑：读已有的 JSONL，跳过已完成的 index，最后一行没写完就丢掉重写；已有的行的总种子或上限和这次对不上就报错退出。`--shard i/K` 只跑 index 对 K 取余等于 i 的手，K 个进程各写自己的文件并行跑，`opening-report.js --merge` 合成一份。
- **引擎目录**：`--engine`，其次 `$YUGIOH_ENGINE`，默认 `~/.cache/mimi-yugioh/engine`（`scripts/opening-common.js`）。和服务的默认（`$YUGIOH_DATA/engine`，见「环境变量」）不同，是有意的：离线分析是手动跑的脚本，不碰用户数据目录 `~/.mimi-yugioh`，用测试和 `./ci` 共用的那份缓存。
- **报告**：纯计算，同一份 JSONL 同一份文字；行里的总种子或搜索上限不止一个值（不同参数的 JSONL 混在一起）就报错，不出报告；每个数字能由 JSONL 重算，重算命令写在报告最后一节。`test/opening-report.test.js` 里有一条：提交的报告等于从提交的 JSONL 重新生成的。

## 数据目录

服务只读 `images/`，不写数据目录。

| 文件 | 内容 |
|---|---|
| `images/<卡号>.webp` | 卡图，`scripts/sync-card-images.js` 从 NAS 复制来，只放卡组用到的几十张；不进仓。cn 卡图上印的是另一套译名，页面一律把 `md_name` 写在图下方；NAS 上没有的卡（现在是 82344137 原初之神 法拉）页面在图的位置写卡名 |
| `engine/` | 引擎数据（见「引擎数据」），可再生 |
| `hands.jsonl`、`quiz.jsonl`、`search/`、`active.json` | 旧版（打一手、记卡、搜索缓存）留下的，#28 起服务不读不写，留在原地不删；要删由用户说。格式见 git 历史里 #28 之前的本文件 |

## 插件

`plugin/dashboard/plugin_api.py`（Hermes 挂在 `/api/plugins/yugioh/`）只转发，一条路径对一条服务接口，没有别的：`GET /deck`、`GET /routes`（含 `lookup`）、`GET /route?id=` 和 `GET /route-anim?id=`（id 只许小写字母、数字、连字符、最长 64 个字符，否则 400）、`GET /card-image?code=`（只收数字）。没有写的接口。服务没应答是 502。后端的路径改了要重启 Hermes 网关才生效。

页面 `plugin/webapp/plugin.js`：标题「游戏王 · 烙印教程」，三个页签：

- **卡组一览**（第一个）：顶上一行写卡组名、主 / 额外卡组张数、卡表出处（链到 `source.url`）。按默认作用标签的第一个词分组（`roleTerms` 的先后），每组写张数和一句含义；每张卡是卡图 + 简中名 + 日文名，多张的标 ×N，额外卡组的标「额外」，有打断的标「打断 N」。点卡在右边（手机宽在底部弹出）显示大图、两个名字、作用、在哪个卡组几张、三件事和「对手回合」（有打断：终场时能打断几次、怎么打断；手坑：从手牌发动，不算终场的打断；别的：终场时不提供打断）；再点一次、点「关上」或按 Esc 收起（桌面宽；手机宽见「卡片弹窗」）。
- **展开路线**：先是路线列表（每条：起手卡的卡图 + 简中名、终场打断数、步数、来源和页面版本日期、引擎验证日期，有 mismatch 标「和教程不一致」），点一条进播放页。播放页顶上是「← 路线列表」、路线名、来源链接（`source.url`）、页面版本日期、「引擎验证于 …」，有 `mismatch` 或 `engineDiff` 时一个橙色边框的醒目框「教程和引擎不一致」；一条步号条（最前面是「起手」，点任一号跳到那一步的结束帧）、上一步 / 下一步 / 连播、「第 N / 总数 步」，键盘左右键同样翻步（路线没读到、焦点在输入框或可编辑区时不响应；焦点在动画框里时由框转发）；步号条和按钮在桌面宽（> 760 px）吸在滚动区顶上，往下滚看场面时也不被窗口头部盖住（场面的 `scroll-margin-top` 是这条的高度）。打开播放页默认停在「起手」（第 0 步）。**动画**（见「路线动画」）：下一步播这一步的动画然后停住；上一步和点步号直接跳到那一步的结束帧，不倒放；连播从当前步播到终场（再点是暂停，停在步中间再点接着播；在起手点是从抽牌开始整条播）；播的时候点下一步 / 上一步是直接跳到这一步 / 上一步的结束帧。桌面宽（容器 ≥ 1040 px）动画在左、**步骤面板**在右，窄的时候上下排。步骤面板照样子稿 C（`anim-proto/c-flat`），颜色和动画同一套（`src/anim-stage.js` 的 `COLOR` / `ZONE_COLOR` / `SUMMON_TAG`，插件里抄了一份，`test/plugin-colors.test.js` 对照）：
  - **第 N 步**：顶上分段进度条（一步一段，走过的白、当前的黄）；大步号（两位数，面板里最大的字）；右上角按动作着色的标签：这一步有 fusion / synchro / … 召唤（`moves[].summon`）用 `SUMMON_TAG` 的字和颜色（同调浅蓝、融合粉），别的（召唤、发动效果、效果处理、推进）一律中性灰；这一步的说明；「花了什么 → 换来什么」两栏，取自这一步的 `moves`（同一张卡这一步里连着动几次并成一行，写最初 → 最后的地方，如「场上→墓地」，颜色是去处区的颜色）：花了什么 = 从手牌或场上进了墓地 / 除外 / 卡组 / 额外卡组的卡（粉色左边条），换来什么 = 进了手牌或场上的卡、从卡组 / 额外卡组直接进墓地 / 除外的卡（青色左边条），中间一个箭头，一栏没有就是「—」；「发动了 …」一行小字；墓地、除外各几张和是哪些卡（动画里墓地、除外是叠着的）；最下面折叠的「引擎里的操作」（`actions`）。
  - **起手**：大字「起手」、白色「先攻」标签、一句说明（手牌几张，往后每一步都和上一步比）、起手手牌的卡图和名字、墓地 / 除外 0 张；没有花了什么。
  - **终场**（最后一步、不在播放中）：大字「终场」、黄色「先攻结束」标签、黄色大号打断数 +「个打断」、「靠这些卡」每个打断一条（黄色左边条、卡图、卡名、打断几次和怎么打断；没有打断写「终场没有打断」）、剩余手牌、墓地 / 除外，最下面折叠的「第 N 步：说明」（这一步的发动和引擎操作）。场上的卡看动画（每张卡带着作用标签，打断的卡亮一圈，「打断」在它的作用标签里）。
  - 步骤面板和终场的「中场的卡和它们此刻的作用」后面列手牌里此刻有作用的卡（标「在手牌里」）；起手面板的手牌下面标它们的作用。
  - 动画里的作用标签悬停（手机点一下）在标签下面弹一个小框（作用词 + 原因，放不下翻到上面，夹在窗口里）；点小框、换步、滚动、Esc 收起。卡片弹窗的「第 N 步」一行也包括手牌（「第 N 步 · 手牌」，起手是「起手 · 手牌」）。
- **术语表**：每个作用词一块（颜色、解释、默认带它的卡有几种）；宽屏两栏（每栏至少 420 px），手机一栏。
  面板里的卡图都能悬停（手机点一下）出卡片弹窗。
- **起手速查**：每张关键卡一块（白之落胤、烙印融合、阿卢绯尔、天底的使徒、白之圣女、烙印之气炎、阿尔白斯之落胤），卡图 + 简中名 + 日文名；「手里有它：走」下面是路线按钮（路线名、终场打断数、步数；两卡展开的路线标「搭 X」）；再下面是「缺 X　手里有 Y → 路线」几行，每行一个路线按钮和一句为什么走得通。数据全来自 `GET /routes` 的 `lookup`，页面不再请求别的。点路线按钮跳到「展开路线」页签里那条路线的播放页，停在起手（第 0 步）；点页签只切页，不动展开路线里打开的路线。`GET /routes` 只请求一次，展开路线和起手速查共用。

**卡片弹窗**（三个页签通用）：桌面上鼠标移到任何一张卡（卡组一览、路线动画里的卡、步骤面板里的卡、起手速查的关键卡）弹出放大卡图、简中名和日文名、作用、三件事、对手回合怎么打断（和点卡的说明区同一份渲染，只是没有「关上」）；弹窗在卡的右边，放不下翻到左边，再夹在窗口里，不超出边缘；滚动或 Esc 收起。手机宽（≤ 760 px 或没有悬停）点一下弹出，从底部升起，带「× 关上」，Esc 也能关；卡组一览也一样：手机上点卡只出这个弹窗，不再开页面里的说明区（桌面宽仍是悬停弹窗加点一下在右边的说明区），所以同一时刻只有一个详情界面。入口只有一个：`useCardPopup()` 给 `{ show(code, rect), hide, bind }`，`show` 收卡号和页面视口坐标里的矩形（`DOMRect` 或 `{left, top, right, bottom}`），别的来源也用它：动画框里的卡悬停（手机点一下）时，框把卡号和卡在框里的矩形转上来，页面加上框自己的位置再 `show`。

教程没有评分：页面上不许出现百分比、「还差」、估值（`./ci` 的 plugin 检查查源码，plugin-smoke 查渲染出来的文字和旧功能的字样）。宽度 ≤ 760 px 按手机排（页签占满一行、卡图小一号、说明从底部弹出），不出横向滚动条。

## 路线动画

`GET /route-anim` 的页面（`src/anim-page.js`）放在插件页的 SDK `SandboxedFrame` 里：网页工作区的 CSP（`script-src 'self' blob: <hash>`）不许插件页自己跑内联脚本，而 SandboxedFrame 的 `data:text/html` 地址会交给网关的 guest 外壳页（opaque origin，允许内联脚本）。页面是三层：外壳页（`<hyperframes-player interactive disable-click-to-play muted>`，CSP 头，和插件页的消息）、合成页（作为播放器的 `srcdoc`：内联的 HyperFrames 运行时 + 轨道表引擎 + 舞台标记）、卡图（CSS 类里的 data: 地址，每个密码一份；没有图的卡画卡名牌）。

- **动作来自引擎**：每步的卡片移动取自 `steps[].moves`（起点区 → 终点区，按发生顺序；deck / extra 是堆，从那里出来的卡在堆的位置现身，进去的卡飞到堆里消失），不从 diff 推断；`summon` 是 fusion / synchro / xyz / link / ritual 时，`material` 标了的素材在舞台中间（额外怪兽区那一排的正中）聚拢，特效（融合是三层菱形，同调等是一圈星，星数 = 怪兽的真实等级 / 阶级 / 连接数），召唤的怪兽从额外卡组飞来落进格子，素材再去它们的去处；`activated` 的卡先亮一下并标连锁号（按 activated 的顺序），这一步才出现的卡在移动完了再亮；守备表示的怪兽横放（转 90 度），里侧的盖着卡背；最后一步结束后打断的卡亮一圈。
- **作用标签**：每张卡在每个位置结束时带它此刻的作用标签（中场取 `roles`，手牌取 `handRoles` / `startHandRoles`，墓地和除外不带），1–2 个照术语表着色的小块，放在卡面的下沿（卡的子元素，卡飞到哪跟到哪，不跟着守备横放转，不压卡名）；作用变了或换了区，旧的在这一步开始时收起，新的在这一步的动作都完了时出现，所以播放中不会有标签停在旧位置；终场不另画「打断」横幅，「打断」只在作用标签里出现一次。颜色由 `buildRouteAnim` 的 `roleTerms`（卡组数据的术语表）给。`test/anim-plan.test.js` 查每个结束帧的标签和 `roles` / `handRoles` 一致、整条时间轴上看得见的标签都长在看得见的卡上；verify-yugioh 的每张路线截图向动画框要 `yg-rects`，量每块标签是不是贴在自己的卡上（`.json` 的 `stage`）。每个位置结束时所有卡的位置、层级、转角、暗化和快照一致（`planRoute` 对不上就抛错；`test/anim-plan.test.js` 用 `frameAt` 把每条路线每个结束帧和快照逐张对照）。
- **特效不盖字**：光环、冲击波、拖尾、闪光都在卡、卡名和区域标签的下面（层级低）；横幅和发动牌只在舞台最上面的专用条里（`NOTICE`，不放任何区；`test/anim-stage.test.js` 查它和每个区的卡、卡名、标签、含额外怪兽区都不相交）；卡名 15 px、最多三行，在卡下面。守备横放的卡缩放到横着的宽度比一格间距窄 16 px，不碰相邻格的框。融合 / 同调的素材在额外怪兽区那一排的正中聚拢。
- **时间轴**：`planRoute` 记一张轨道表（每个元素的每个属性一串 `[起, 止, 起值, 止值, 缓动]`，同一属性的段不许重叠），`anim-engine.js` 在 seek(t) 时算值写样式；不用 gsap（GreenSock 标准许可，不是开源许可）。
- **位置和时间点**：位置 0 = 起手（5 张手牌从卡组抽出），1..N = 第几步；每段末尾留 0.85 s 让特效收完，`ends[k]` 是段末前 0.05 s（卡停稳、特效收完）。下一步 = 从 `ends[k]` 播到 `ends[k+1]`；跳 = seek 到 `ends[k]`。
- **不联网**：运行时内联（含 `__hyperframes=`，播放器据此不去 CDN 注入）；外壳页头上有 CSP（`default-src 'none'`，脚本、样式只许内联，图片、字体只许 data:，`connect-src 'none'`），任何回退的外网请求都会被浏览器拦成明显的失败；服务不下载任何东西。验证：`test/anim-page.test.js` 查页面里没有请求来源，plugin-smoke 记下动画框里每个请求，不许有非本地的。网页工作区自己加载时会向 Google Fonts 要一个字体（不是插件的，插件去不掉）。
- **消息**（插件页 ↔ 外壳页，协议写在 `anim-page.js` 头部）：插件页发 `seek` / `playRange` / `pause`，框发 `yg-ready` / `yg-time` / `yg-ended`、卡的悬停 / 点击（带框里的矩形）、左右键。插件页只收 `event.source === frame.contentWindow` 的消息。
- **第三方文件**：`vendor/hyperframes/`，版本、md5、许可证见 NOTICE.md；换版本是原样换文件。
- 已知的限制：手机宽（390 px）动画整体缩到约一半，卡下的名字很小，靠点一下弹窗看字；Xyz 素材（overlay）和场地区（魔陷区第 5 格）动画还不支持，遇到会抛错（现有卡组没有）。

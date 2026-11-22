# 设计

结构、数据目录、环境变量和口径以本文件为准；代码里的常量照这里写，改的时候两边一起改。术语见 [GLOSSARY.md](GLOSSARY.md)，规格是 #1，架构约定见 [AGENTS.md](AGENTS.md)「架构约定」。

## 结构

```
src/server.js        本地服务（Node 22 内置 http，只监听 127.0.0.1:4519）：/health 和打一手的接口；环境变量、「现在」只在这里取
src/hand.js          一手：发牌（种子可注入）、记操作和时间、结算（挑基准、算分、每一步之后的场面）；纯逻辑，引擎、卡组、「现在」、历史记录由调用方传入
src/scoring.js       评分：场面值、场面分、速度加成、提示系数、总分；纯函数，常量和下面「评分」一节同名
src/quiz.js          记卡：出题（三种）、批改、评分换算、到期的卡、FSRS 状态（ts-fsrs）；纯函数，卡组、日志行、「现在」、种子由调用方传入
src/store.js         数据目录的读写（日志、进行中的一手、卡图）；唯一读写数据目录的地方
src/ledger.js        一步的「花了什么 → 换来什么」：比较这一步前后我方各区域的卡；纯函数
src/duel-session.js  决斗会话：包住规则引擎 ocgcore-wasm，一手牌一个会话；开局（卡组、起手、种子）、当前提示和合法选项、提交选择、查场面、存档回滚；纯逻辑，卡库和脚本由调用方注入
src/deck.js          卡组：展开张数、检查卡组数据（40/15 张、禁限、每张卡的名字角色三件事打断数）、起手分类；纯函数
src/banlist.js       Master Duel 禁限表（自己维护，现行 2026-11-05，只收和卡组有关的条目）
src/route.js         展开路线重放：把一条路线的步骤喂给决斗会话，走到我方回合结束，返回终场，并和路线上写的终场对照
src/decks/branded.js         烙印卡组数据：卡表、卡名、角色、三件事、打断数、起手类型规则
src/decks/branded-routes.js  烙印的两条 Game8 展开路线（引擎可重放的步骤序列）
src/engine-files.js  读引擎数据：cards.cdb（node:sqlite）和卡牌脚本，给会话提供 cardReader、scriptReader、卡名；只读
scripts/prepare-engine.js  把固定版本的 Project Ignis CardScripts 和 BabelCDB 的 cards.cdb 下载到引擎数据目录（唯一联网的地方）
scripts/fetch-card-names.js  按日文卡名向 ygocdb 查密码和简中名（md_name），整理卡组数据时手动跑；服务不联网
scripts/sync-card-images.js  把卡组用到的卡图从 NAS 经 ssh（stat + tar）复制到数据目录 images/；手动跑，`--dry-run` 只打出要复制的文件数
scripts/plugin-setup  把插件链进 Hermes 的插件目录（`--home <目录>` 沙盒用；`--live` 是上线那一步，单独一张票，要用户点头）
scripts/plugin-smoke.sh  ./ci 的插件冒烟：临时 Hermes 网页工作区里开始一手、点卡、发动、回答提示、结束回合
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
| `YUGIOH_ENGINE` | `$YUGIOH_DATA/engine` | 引擎数据目录（卡库、脚本）；测试和 `./ci` 用 `~/.cache/mimi-yugioh/engine` |
| `YUGIOH_URL` | `http://127.0.0.1:4519` | 插件后端转发到哪个服务（只许本机）；在 Hermes 网关的环境里设 |
| `YUGIOH_NAS`、`YUGIOH_NAS_IMAGES` | `lifan222@192.168.10.124`、`mimi-projects/mimi-yugioh/images/cn` | 只有 `scripts/sync-card-images.js` 读：NAS 的 ssh 地址和卡图目录（相对它的家目录） |

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
- `board()`：我方场面，每个区域是 `{ code, name, sequence }` 的列表（手牌、怪兽区含额外怪兽区、魔陷区含场地区、墓地、除外、额外卡组）和主卡组张数。
- `checkpoint()` / `rollback(n)`：存档就是「已提交了几个选择」；回滚用同一个种子重新开局并重放前 n 个选择，所以回滚后的提示和场面和存档时一致。重放的代价随步数线性增长，搜索要用时再评估。
- `scriptErrors`：引擎脚本报的错，正常的一手应该是空。

## 卡组数据

`src/decks/<卡组>.js` 导出一个卡组对象 `{ name, source, roles, cards, main, extra, handTypes, routes }`：

- `cards`：密码 → `{ jp, md, role, interrupts, does, cost, limit }`。`md` 是 Master Duel 简体中文客户端的译名（ygocdb 的 `md_name`，用 `scripts/fetch-card-names.js` 查，写死在数据里；字符照抄，不手敲：库妸㽗 是 U+5E93 U+59B8 U+3F57）。`role` 是起手 / 延伸 / 终端 / 打断 / 手坑 / 回收之一；`does / cost / limit` 是「三件事」，我们自己的概括；`interrupts` 是这张卡在终场时对手回合里能打断几次（手牌里的卡不算，手牌另计）。
- `main` / `extra`：`{ code, count }` 列表。`checkDeck` 查张数（主 40、额外 15、不超禁限表上限）和每张卡的字段是否齐。
- `handTypes`：起手类型规则，按顺序第一个含 `has` 里任一张的算；都不含时，有别的「起手」角色的卡是 `other`，一张都没有是 `brick`（烂手）。
- `routes`：展开路线，`{ id, name, needs, hand, steps, end }`。`hand` 是起手 5 张（必要卡 + 填充牌），`steps` 每步 `{ text, do }`，`do` 是给引擎的回应（写法见 `src/route.js` 开头），`end` 是出处页面写的终场。`playRoute` 重放，`diffEnd` 和 `end` 对照。

第一套（烙印）的卡表照 Game8 2026-11-20 版取用，有一处不照：页面的卡表没有赫之烙印，路线 A 却要用阿卢绯尔检索它，所以数据里是 烙印之气炎 ×2 + 赫之烙印 ×1（页面是 烙印之气炎 ×3）。

会话的 `endBoard`：我方回合结束（对手回合开始）那一刻的场面，之后的抽牌不算；没结束是 `null`。路线重放和以后的评分都读它。

## 评分

常量在 `src/scoring.js`，名字和这里一致。规则是规格 #1「评分」一节：

- 场面值 = `INTERRUPT_VALUE`(10) × 终场在场的卡的打断数之和 + `HAND_VALUE`(1) × 手牌数
- 场面分 = 100 × min(1, 用户场面值 ÷ 最好场面值)，取整；最好场面值 ≤ 0（烂手）记 100
- 速度加成：场面分 ≥ `SPEED_MIN_FIELD_SCORE`(90) 才计；用时 ≤ 60 秒 +20，≥ 300 秒 0，中间线性，取整
- 提示系数 = `HINT_FACTOR`(0.8) 的提示次数次方；总分 = (场面分 + 速度加成) × 提示系数，取整
- 「每一步之后的场面」：每步之后的场面值 ÷ 最好场面值。**一步** = 主阶段的一个命令，或连锁窗口里发动一个效果，它后面的选卡、选格子、放行都算在这一步里（`startsStep`）。用户的操作记录和最好路线都按这个切，所以两条曲线能一步对一步

基准 = 下面两个里场面值高的，同值取 Game8，结算写明来源（`benchmark.source`）：

1. `game8`：起手含某条 Game8 路线的初动卡时，用用户真实的起手、同一个种子在引擎里重放这条路线，取终场（多条取最高）。别的牌会让路线里的选卡对不上，那条路线就跳过。
2. `personal`：用户在这手牌（5 张排序后相同）上已结算过的最好场面值，加上这一次。没有 Game8 路线适用时 `benchmark.provisional` 为 true：基准只有用户自己，场面分偏高，等搜索（下一张票）补上。

`divergeStep`：用户第 i 步之后的局面和最好路线第 i 步之后的不一样的第一个 i（从 1 数）；一直一样或没有路线是 null。提示（用户请求的下一步建议）还没做，`hints` 恒为 0。

## 接口

只听 127.0.0.1。一次只有一手。错误是 `{ error }`：400 请求不合法（选择非法、局面不变）、404 没有进行中的一手、409 状态不允许。

| 路径 | 作用 |
|---|---|
| `POST /hand/start` `{ seed? }` | 开始一手。`seed` 是 0 到 2^32-1 的整数，同一个种子发同一手、引擎洗同一副牌；不给就用现在的时间。已有进行中的一手会被作废（日志记 `void`）。返回当前一手 |
| `GET /hand` | 当前一手：`status`（`playing` / `turn-over`）、`elapsedMs`、`hints`、`prompt`（`kind` 和合法选项，选项带 Master Duel 卡名 `md` 和角色）、`board`（手牌、怪兽区、魔陷区、墓地、除外、额外卡组）、`normalSummonUsed`（召唤权）、`restrictions`（已生效限制）、`actions`（每个选择一条：第几步、距开局毫秒、文字）、`steps`（操作记录，每一步一行：`step`、`atMs` 是这一步最后一个选择的时间、`text`、`spent` / `gained` 是这一步前后各区域的卡之差，见 `src/ledger.js`：花了 = 离开手牌 / 额外 / 卡组 / 场上的，换来 = 进入场上 / 手牌 / 墓地 / 除外的，手牌→场上两边都写）。展开中没有场面值，也没有离最好的差距 |
| `POST /hand/choose` `{ indices }` | 对当前提示选选项下标数组（单选放一个）。非法选择 400，局面不变。返回当前一手 |
| `GET /cards` | 卡组里每张卡：`md`（Master Duel 简中名）、`role`、`does / cost / limit`（三件事）；页面点卡时显示 |
| `GET /card-image?code=N` | 一张卡图，`{ code, type, base64 }`（插件经 `ctx.rest` 只读 JSON，页面拼成 data: 地址）；数据目录 `images/` 里没有就 404；`code` 只收纯数字 |
| `GET /quiz` | 记卡：`{ due, reviewing, fresh }`，到期的张数（答过的到期了的 + 没答过的） |
| `POST /quiz/next` | 出下一题并开始计时；没有到期的卡返回 `{ done: true, due: 0 }`。题面：`kind`、`prompt`、`image`（卡号或 null）、`options[{text}]`、`roles`（identify）、`given` / `name` / `missing`（fill）、`due`、`fresh`、`lastMs`、`history`（这张卡以往的用时）；不含对错。再调一次换一题（上一题作废） |
| `POST /quiz/answer` `{ option, roles? }` | 批改上一题：400 选项或角色不合法，404 没有在答的题；记一行日志，返回 `correct`、`ms`、`rating`、`dueInMs`、`answerIndex`、`answerRoles`、`card`（名字角色三件事） |
| `POST /hand/end` | 结束回合并结算：还停在主阶段就进结束阶段，之后放行连锁、不发动可选效果；遇到要选的东西返回 409，用户选完再结束。返回结算（分数各项、`benchmark`、终场和最好终场、`steps`、`curve`、`divergeStep`），并往日志追加一行 |

`restrictions` 是按卡写死的（`src/decks/branded.js` 的 `RESTRICTIONS`）：这张卡发动过效果，就列出它带来的当回合限制，只收卡面写着「发动回合」的几条；引擎不对外报限制。`normalSummonUsed` 来自引擎的召唤、盖放怪兽消息。

## 记卡

每张卡（卡组数据里的每个密码）是一张 FSRS 卡（`ts-fsrs` 默认参数，不开 fuzz）。常量在 `src/quiz.js`，名字和这里一致。**没有每日题量**：到期的卡（答过的卡到期时间 ≤ 现在，按到期早晚排；没答过的新卡排在后面、顺序随机）都算，用户想停就点「结束」。

- 评分换算（`rate`）：错 = Again；对且用时 ≤ `EASY_MS`(5000 ms) = Easy；对且 ≤ `HARD_MS`(10000 ms) = Good；对但更慢 = Hard。例（新卡）：快且对 8 天后到期、对 10 分钟后、慢 5.5 分钟后、错 1 分钟后
- 用时由服务从出题那一刻算起（`POST /quiz/next`），页面不报用时
- 三种题，每题 4 个选项，文字互不相同，干扰项取自同一卡组：`identify` 看卡图选 Master Duel 卡名**和**角色（名字、角色都对才算对）；`fill` 给卡名和「干什么 / 条件代价 / 限制」里的两件，补第三件；`find` 给一张卡的「干什么」，选出是哪张卡。题型随机；这张卡凑不齐互不相同的干扰项就换一种
- 批改（`grade`）：`{ option: 选项下标, roles: [角色] }`；`identify` 角色集合要和卡的角色一致，别的题型 `roles` 要是空的
- 页面：数字键 1–4 选答案，5–0 选角色（identify），回车提交、再回车下一题；本题已用的计时条在 10 秒处满，5 秒处标「5 秒内答对 → 间隔加长」，有上次用时时标上次；右上「n / 到期张数」；答完显示对错、评分、下次多久后再考和这张卡的三件事

## 数据目录

| 文件 | 内容 |
|---|---|
| `hands.jsonl` | 只追加，一行一个 JSON。结算一行（`type: "hand"`）：`id`、`seed`、`hand`（起手 5 个密码）、`handType`、`benchmarkHand`（是不是基准手，现在恒为 false）、`startedAt`（毫秒）、`durationMs`、`hints`、`actions`（每个选择一条：`step`、`atMs`、`kind`、`text`、`indices`、`value` 是这个选择之后的场面值）、`endBoard`（终场的手牌、怪兽区、魔陷区密码）、`userValue`、`bestValue`、`benchmark`（`source`、`routeId`、`provisional`）、`fieldScore`、`speedBonus`、`speedCounted`、`hintFactor`、`total`。作废一行（`type: "void"`）：`id`、`seed`、`hand`、`startedAt`、`reason` |
| `images/<卡号>.webp` | 卡图，`scripts/sync-card-images.js` 从 NAS 复制来，只放卡组用到的几十张；不进仓。cn 卡图上印的是另一套译名，页面一律把 `md_name` 写在图下方；NAS 上没有的卡（现在是 82344137 原初之神 法拉）页面在图的位置写卡名 |
| `quiz.jsonl` | 只追加，一行一次答题：`type: "answer"`、`at`（毫秒）、`code`、`kind`、`correct`、`ms`、`rating`（Again/Hard/Good/Easy）、`picked`（`option`、`roles`）、`card`（答完之后这张卡的 FSRS 状态，JSON）。一张卡现在的状态 = 它最后一行的 `card`，没有单独的状态文件，所以不会和答题记录对不上 |
| `active.json` | 进行中的一手的开局信息（`id`、`seed`、`hand`、`startedAt`）；结算时删。服务启动时发现它还在，说明上次没打完，记一行 `void`（原因：服务重启）再删 |

## 插件

`plugin/dashboard/plugin_api.py`（Hermes 挂在 `/api/plugins/yugioh/`）只转发，一条路径对一条服务接口，没有别的：`GET /hand`、`POST /hand/{start,choose,end}`（白名单 `HAND_WRITES`，别的路径 404 不到服务）、`GET /cards`、`GET /card-image?code=`（只收数字）、`GET /quiz`、`POST /quiz/{next,answer}`（白名单 `QUIZ_WRITES`）。服务没应答是 502。页面 `plugin/webapp/plugin.js`：首页（开始一手 / 继续这一手）、记卡（快答，见「记卡」一节）和记录（占位）、展开中屏（照设计稿 clock-play：计时、提示次数、操作记录、场地、手牌、点卡的详情和合法操作、引擎提示的浮层、提示按钮、结束回合）、小结算（总分、场面分、速度加成、提示系数；完整结算屏另一张票）。提示按钮写着「分数 ×0.8」但现在是灰的：提示接口属于 #5（最好场面搜索）。展开中页面拿不到场面值：服务不发，页面上也不许出现百分比、「还差」、估值（`./ci` 的 plugin 检查查源码，plugin-smoke 查渲染出来的文字）。

# 设计

结构、数据目录、环境变量和口径以本文件为准；代码里的常量照这里写，改的时候两边一起改。术语见 [GLOSSARY.md](GLOSSARY.md)，规格是 #1，架构约定见 [AGENTS.md](AGENTS.md)「架构约定」。

## 结构

```
src/server.js        本地服务（Node 22 内置 http，只监听 127.0.0.1:4519）：环境变量、「现在」、开端口只在这里，请求转给 service.js
src/service.js       接口：每条路径做什么（handle(method, path, …) → [状态码, 应答]）；「现在」、数据目录、引擎由调用方传入。HTTP 服务和模拟学习者调的是它
src/hand.js          一手：发牌（种子可注入）、记操作和时间、提示、结算（挑基准、算分、每一步之后的场面）；纯逻辑，引擎、卡组、「现在」、历史记录由调用方传入
src/search.js        最好场面搜索：在决斗会话里做有限偏离的深度优先搜索（存档回滚、置换表），按场面值评估终场，得出最好场面值和路线（语义回应）；也给提示用（从当前局面再搜）；纯逻辑，会话、卡组、「现在」、时间上限由调用方传入
src/practice.js      练习：按弱点发牌（拒绝采样）、隐藏基准手（固定一组、每 5 手一次）、首页统计；纯函数，卡组、日志记录、种子由调用方传入
src/scoring.js       评分：场面值、场面分、速度加成、提示系数、总分；纯函数，常量和下面「评分」一节同名
src/quiz.js          记卡：出题（三种）、批改、评分换算、到期的卡、FSRS 状态（ts-fsrs）；纯函数，卡组、日志行、「现在」、种子由调用方传入
src/store.js         数据目录的读写（日志、进行中的一手、卡图、搜索缓存）；唯一读写数据目录的地方
src/ledger.js        一步的「花了什么 → 换来什么」：比较这一步前后我方各区域的卡；纯函数
src/duel-session.js  决斗会话：包住规则引擎 ocgcore-wasm，一手牌一个会话；开局（卡组、起手、种子）、当前提示和合法选项、提交选择、查场面、存档回滚；纯逻辑，卡库和脚本由调用方注入
src/deck.js          卡组：展开张数、检查卡组数据（40/15 张、禁限、每张卡的名字角色三件事打断数）、起手分类；纯函数
src/banlist.js       Master Duel 禁限表（自己维护，现行 2026-11-05，只收和卡组有关的条目）
src/route.js         展开路线重放：把一条路线的步骤喂给决斗会话，走到我方回合结束，返回终场，并和路线上写的终场对照
src/decks/branded.js         烙印卡组数据：卡表、卡名、角色、三件事、打断数、起手类型规则
src/decks/branded-routes.js  烙印的两条 Game8 展开路线（引擎可重放的步骤序列）
src/sim-learner.js   模拟学习者的学习模型：每张卡的认识度 + 每个决定点会不会（FSRS 遗忘）、在合法选项里做决定、从复盘 / 提示 / 记卡 / 路线 / 分数学；纯逻辑，「现在」、随机源由调用方传入
src/simulation.js    模拟实验的一个学习者：按练法跑 N 天（记卡、看路线、打练习手、看复盘），天末考基准手；经 service.js 的 handle() 打牌，服务和模拟时钟由调用方给
src/engine-files.js  读引擎数据：cards.cdb（node:sqlite）和卡牌脚本，给会话提供 cardReader、scriptReader、卡名；只读
scripts/prepare-engine.js  把固定版本的 Project Ignis CardScripts 和 BabelCDB 的 cards.cdb 下载到引擎数据目录（唯一联网的地方）
scripts/fetch-card-names.js  按日文卡名向 ygocdb 查密码和简中名（md_name），整理卡组数据时手动跑；服务不联网
scripts/sync-card-images.js  把卡组用到的卡图从 NAS 经 ssh（stat + tar）复制到数据目录 images/；手动跑，`--dry-run` 只打出要复制的文件数
scripts/plugin-setup  把插件链进 Hermes 的插件目录（`--home <目录>` 沙盒用；`--live` 是上线那一步，单独一张票，要用户点头）
scripts/plugin-smoke.sh  ./ci 的插件冒烟：临时 Hermes 网页工作区里开始一手、点卡、发动、回答提示、结束回合
scripts/simulate.js  手动跑的模拟学习者实验（练习池预先搜索、多进程、出 docs/simulation/ 的表和图）；`--smoke` 是 ./ci 的冒烟。图在 scripts/sim-charts.js
scripts/search-bench.js  手动跑的搜索计时：20 个随机种子发牌、搜索，打印每手的起手类型、用时、是否超时、最好值，以及用时分布和超时比例；不进 ./ci
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
| `YUGIOH_SEARCH_MS` | `60000`（`SEARCH_BUDGET_MS`） | 一手的搜索时间上限（毫秒）；`0` = 不搜索（开局不起后台搜索，结算的搜索状态是 `none`，测打一手本身时用它）；提示的上限 `HINT_BUDGET_MS` 不受它影响 |
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
- `checkpoint()` / `rollback(n)`：存档就是「已提交了几个选择」；回滚用同一个种子重新开局并重放前 n 个选择，所以回滚后的提示和场面和存档时一致。每次回滚要重建决斗、重新加载 `constant.lua` 和 `utility.lua`，实测约 8 毫秒，再加重放 n 个选择的时间（深处约十几毫秒）：搜索的耗时几乎全花在回滚上。
- `engineSeed(seed)`：发牌的种子推出引擎的洗牌种子，同一个种子同一副洗牌。
- `openHandSession(engine, deck, hand, seed)`：用户打牌、后台搜索、结算重放、提示再搜都从它开会话：起手 `hand`，卡组是「主卡组 − 起手」（按卡组数据里的顺序交给引擎洗），种子是 `engineSeed(seed)`。同一手起手、同一个种子，几边看到的洗牌和提示一样，所以同一个种子下搜出的路线在用户的会话里一定走得通。不同种子的洗牌不同，同样的 5 张牌换个种子，缓存的路线不一定走得通（见「最好场面搜索」的缓存）。
- `stateKey(board)`：场面的指纹（手牌、怪兽区、魔陷区、墓地、除外的卡，不看顺序），搜索的置换表和「走偏」都用它。
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

基准 = 下面三个里场面值高的，同值的优先级 **搜索 > Game8 > 个人最好**（`benchmark.source` 写明是哪个）：

1. `search`：「最好场面搜索」一节搜出的路线。结算时用用户真实的起手和种子把缓存里的路线重放一遍，取终场和每一步之后的场面（所以 `bestValue` 是重放出来的值，不是缓存里记的）。没搜完（`pending`）、超时（`timed-out`）、搜崩了（`failed`）、没有条目也没在搜（`none`，比如 `YUGIOH_SEARCH_MS=0`）、缓存的路线在这手的种子下重放不了（`replay-failed`，见「缓存」）都不当基准；`benchmark.search` 记这个状态，搜完的是 `done`。
2. `game8`：起手含某条 Game8 路线的初动卡时，用用户真实的起手、同一个种子在引擎里重放这条路线，取终场（多条取最高）。别的牌会让路线里的选卡对不上，那条路线就跳过。
3. `personal`：用户在这手牌（5 张排序后相同）上已结算过的最好场面值，加上这一次。

`benchmark.provisional` 只在没有搜索基准、也没有 Game8 基准时为 true：基准只有用户自己，场面分偏高。逐步曲线和 `divergeStep` 对着搜索和 Game8 里值高的那条路线（同值取搜索），即使个人最好更高也是；`bestBoard` 只在基准来源是搜索或 Game8 时给。

`divergeStep`：用户第 i 步之后的局面和最好路线第 i 步之后的不一样的第一个 i（从 1 数）；一直一样或没有路线是 null。`hints` 是这一手要过几次提示，结算的提示系数按它算（见「最好场面搜索」的「提示」）。

## 最好场面搜索

`src/search.js`。对一手起手在引擎里搜「我方回合结束时场面值最高」的路线；常量名和这里一致：

- **搜什么**：`searchSession(session, deck, { now, budgetMs })` 在会话当前的局面上深度优先搜，每个选择用存档回滚（`checkpoint` / `rollback`）退回再试下一个，走到 `endBoard` 就按 `boardValue` 评估，留最高的。结束回合后的连锁窗口、选卡等和展开中一样展开（Game8 路线里结束阶段的效果也是赚面的一部分）。`searchHand` 从一手起手的开局搜。
- **路线的写法**：用 `src/route.js` 的语义回应（`{ idle, code }`、`{ chain }`、`{ pick }`、`{ place }`、`'yes'`…），不用选项下标：下标随起手顺序和种子变，缓存按排序后的 5 张起手存、不同种子共用。按 `startsStep` 切成 `steps`，格式就是卡组数据里路线的 `steps`，`playRoute` 能直接重放。同一张卡有几个能发动的效果时回应多带 `desc`。选卡按密码选（同一密码靠前的先选），所以同一密码的几张只算一种。
- **有限偏离**：每个提示上先排好试的先后，一条路线上最多有 `MAX_DISCREPANCY`(2) 处不走排第一的；先搜 0 处、再 1 处、再 2 处，所以不管什么时候停，手里都是已搜到的较好结果。排序：起手含某条 Game8 路线的初动卡时，路线展平成回应序列，每个提示上优先走序列里往后 `GUIDE_WINDOW`(6) 个内第一个对得上的回应；其次是路线里出现过的动作、选过的卡、卡组数据里打断数和角色高的卡；结束回合排最后。路线只是排序的参考，终场是搜索在引擎里真实走出来的，不是把路线结果塞进答案。
- **剪枝**：① 主阶段提示上的置换表：局面指纹（手牌、怪兽区、魔陷区、墓地、除外的卡，不看顺序）+ 召唤权 + 已发动过的卡，到过的局面且当时剩的偏离次数不少于现在就不再搜；② `place`（放哪一格）、`position`（表示形式）只试第一个；③ 选卡：同一密码只算一种，选一张时最多试价值最高的 `MAX_BRANCH`(5) 个密码，选多张时最多 `MAX_COMBOS`(4) 种组合；④ 不进战斗阶段、不改变表示形式，不盖放没有打断数的卡（只会少一张手牌）；⑤ 一条路线最多 `MAX_RESPONSES`(250) 个回应。这些是近似：搜出的是「这个范围里最好的」，场面值保证可达，不保证是理论最高。
- **不堵服务**：`searchSession` 是 async，每 `YIELD_MS`(20) 毫秒 `await` 一次 `setImmediate` 让出事件循环；不用 worker 或子进程。「现在」由调用方传（函数），搜索本身不取时间。
- **提示和后台搜索抢 CPU**：服务只有一个线程。提示（`/hand/hint`）进行时后台搜索停在原地等着（`isPaused`，每个节点查一次），等的时间不计进它的时间上限和 `elapsedMs`，提示完了接着搜；所以提示不会被后台搜索拖慢，后台搜索也不会因为用户要了提示就超时。
- **时间上限**：`SEARCH_BUDGET_MS`(60000) 是一手的上限，`server.js` 读环境变量 `YUGIOH_SEARCH_MS` 覆盖（`0` = 不搜索）。`HINT_BUDGET_MS`(5000) 是提示里「从当前局面再搜」的上限。实测数字见 PR 描述里的 `scripts/search-bench.js` 输出（20 个随机种子）。每次回滚要重建决斗，约 8 毫秒起，是耗时的大头。测试用的搜索上限就是 `SEARCH_BUDGET_MS`，等缓存出现最多等 `SEARCH_BUDGET_MS` 再加 30 秒。
- **缓存**（`src/search-cache.js`）：`POST /hand/start` 时这手（排序后的 5 张）需要搜就在后台开始搜（不 await，同一手只搜一次，已在搜的不重开），搜完由 `store.js` 写进数据目录的 `search/`（格式见「数据目录」）。超时的搜索也写一条（`timedOut: true`，存超时前找到的最好值，供参考）。需要搜的是：
  - 没有条目，或条目的版本 `v` 对不上现行的 `searchVersion(deck)`（卡组名、卡组数据指纹加 `MAX_DISCREPANCY`、`MAX_BRANCH`、`MAX_COMBOS`、`GUIDE_WINDOW`、`MAX_RESPONSES`）：版本对不上的条目当没有，搜完覆盖；改了这些常量或换了卡组，旧结果就这样作废。卡组数据（卡表的打断数和角色、主额外卡组、起手类型、展开路线）改了也作废：`searchVersion` 带一个这些数据的指纹（`deckFingerprint`）；
  - 条目是超时的，并且现在的上限比它跑时的 `budgetMs` 大：重搜。上限一样或更小不重搜；超时的条目永远不当基准；
  - 上次搜崩了（异常）：不黏住，下次开这手重搜。崩了之后到重搜之前，这手的状态是 `failed`；没有条目也没在搜（比如 `YUGIOH_SEARCH_MS=0`）是 `none`；
  - 结算时发现缓存的路线在这手的种子下重放不了（搜它用的种子和这手的不同，同样 5 张牌洗牌不同）：这次结算按另外两种基准算，`benchmark.search` 记 `replay-failed`，并用这手的种子重搜、覆盖缓存，以后这个种子不再卡在暂定。

  服务重启时没搜完的不留痕迹，下次开这手重新搜。
- **提示**（`hand.hint`）：先找现成的路线照着给下一步：搜完了就只看缓存里搜出的最好路线；没搜完（pending、超时、失败、none）就看能重放的 Game8 路线。用户到现在的选择（语义形式）是某条路线的前缀、路线的下一个回应在当前提示里合法，就给它。比较时 `place`（放哪一格）和 `position`（表示形式）不分是哪个：搜索只试第一个，用户选了别的格子不算偏离（近似：换格子偶尔会影响后面的路线）。没有可照的路线或已偏离，就在另开的会话里重放用户的选择，从当前局面用 `HINT_BUDGET_MS` 再搜一次（不照 Game8 路线排序），给第一个回应，不动用户的这一手。返回的是当前提示的选项下标 `indices` 加一句 `text`；`hints` 加 1，结算的提示系数 = 0.8^`hints`，`view` 和日志的 `hints` 都是它。

## 练习与首页

常量在 `src/practice.js`，名字和这里一致。

- **按弱点发牌**：每个起手类型一个权重 = 1 + `WEAK_BOOST`(3) × (1 − 最近 `WEAK_RECENT`(10) 手练习手的平均场面分 ÷ 100)，没打过的类型是 1（全 100 分也是 1）。发牌用拒绝采样：随机抽一手（种子由 `rngFrom` 推出，所以这手的种子就能重发同样的牌），按「该类型权重 ÷ 当前最大权重」的概率接受，否则再抽，最多 `MAX_REDRAWS`(60) 次；单张卡的概率不动。基准手不算练习表现。例：固定种子 0–2999，烙印融合起手没有历史时 284 次，场面分都是 40 时 683 次。
- **隐藏基准手**：`benchmarkHands(deck)` 从种子 `BENCHMARK_SEED_BASE`(700000) 往上数，每个起手类型取 `BENCHMARK_PER_TYPE`(2) 手（起手牌互不相同），一共 8 手，固定不变。每打满 `BENCHMARK_EVERY`(5) − 1 手练习手，下一手（第 5、10、15……手）是基准手，按顺序轮着发；作废的手不占位。基准手的起手牌不会作为练习手发出（发牌时拒绝）；`POST /hand/hint` 对基准手回 409「这一手不能用提示」，不计次数；结算和普通一手一样（不带 `benchmarkHand`），日志的 `benchmarkHand` 为 true。`POST /hand/start` 带 `seed`（重打、测试）照它发；发出来的起手是基准手的牌，仍算基准手（重打不能绕过提示限制、不进练习统计）。
- **`GET /home`**：`hands`（日志里结算过的手数，含基准手）、`points`（每个练习手：`number`、`handType`、`handTypeName`、`durationMs`、`fieldScore`、`speedBonus`、`total`；基准手不在里面，号码照占）、`best`（总分最高的点）、`last`（最近一个练习手）、`types`（每个打过的起手类型：`count`、`avgFieldScore`、`avgDurationMs`，按平均场面从高到低）、`tip`（打过至少 `TIP_MIN_HANDS`(3) 手的类型里平均场面最低且不到 100 的那类，没有是 null）、`progress`（基准手按打的先后：`points`[`index`、`total`…]、`average`）。0 手时都是空的。
- 页面：散点横轴用时（到 5:00，更慢的手把轴拉长）、纵轴场面分；速度加成区画在场面 ≥ 90% 的一条带里，颜色从 60 秒到 5:00 线性变淡，写「60 秒内 +20，到 5:00 线性降为 0」，不画 1:30 / 2:30 / 3:30 分档（那是设计稿自己画的，规格 #1 说不用）。到期记卡数来自 `GET /quiz`。

## 效果验证（模拟学习者）

规格 #1「效果验证 ①」。做法、参数、成功标准和结果都在 [docs/simulation-report.md](docs/simulation-report.md)，这里只记和代码有关的约定：

- 模拟学习者经 `src/service.js` 的 `handle()` 打牌和记卡，和 HTTP 接口同一份逻辑；「现在」是模拟的时钟。搜索和提示的时间上限用「取一次时钟走 1 毫秒」的计步时钟（`openService` 的 `searchNow`），同样的输入同样的结果。
- 练习手从预先搜好的练习池（`scripts/simulate.js` 的 `POOL_SIZE` 手）里抽：`nextDeal` / `pickPractice` 的 `candidateSeed` 换候选种子的来源；`weakDealing: false` 时每类权重都是 1（去掉按弱点发牌）。产品里两个选项都用默认。
- `searchCache.ensure` 返回这次搜索的 Promise（没开新搜索是 null），预先搜练习池时等它；服务不等。
- 模拟服务的 `searchMs` 是 0：只读共用的搜索缓存，不在后台搜，所以结果不受后台搜索快慢影响。
- 考试每次新开服务和数据目录（`runLearner` 的 `openExam()`）：结算的基准含「这手牌的个人最好」，考试留着以前的记录，打得好的基准手会越考越难。
- 学习模型的知识单位（`use:` / `pick:` / `open:` / `principle:`）见 `src/sim-learner.js` 开头和报告的「第二版学习模型」。
- 实验脚本每跑完一个学习者就往 `<out>/runs.jsonl` 追加一行，`--resume` 接着跑。

## 接口

只听 127.0.0.1。一次只有一手。错误是 `{ error }`：400 请求不合法（选择非法、局面不变）、404 没有进行中的一手、409 状态不允许。

| 路径 | 作用 |
|---|---|
| `POST /hand/start` `{ seed? }` | 开始一手；缓存里没有这手起手的搜索结果就在后台开始搜（不等它）。`seed` 是 0 到 2^32-1 的整数，同一个种子发同一手、引擎洗同一副牌；不给就用现在的时间。已有进行中的一手会被作废（日志记 `void`）。返回当前一手 |
| `GET /hand` | 当前一手：`status`（`playing` / `turn-over`）、`elapsedMs`、`hints`、`prompt`（`kind` 和合法选项，选项带 Master Duel 卡名 `md` 和角色）、`board`（手牌、怪兽区、魔陷区、墓地、除外、额外卡组）、`normalSummonUsed`（召唤权）、`restrictions`（已生效限制）、`actions`（每个选择一条：第几步、距开局毫秒、文字）、`steps`（操作记录，每一步一行：`step`、`atMs` 是这一步最后一个选择的时间、`text`、`spent` / `gained` 是这一步前后各区域的卡之差，见 `src/ledger.js`：花了 = 离开手牌 / 额外 / 卡组 / 场上的，换来 = 进入场上 / 手牌 / 墓地 / 除外的，手牌→场上两边都写）。展开中没有场面值，也没有离最好的差距 |
| `POST /hand/choose` `{ indices }` | 对当前提示选选项下标数组（单选放一个）。非法选择 400，局面不变。返回当前一手 |
| `POST /hand/hint` | 要一个提示：返回 `{ indices, text, hints }`，`indices` 是当前提示的合法选项下标（直接交给 `/hand/choose` 就是照提示走），`text` 是一句说明，`hints` 是这一手到现在要过几次。当前提示不需要选择（没有提示、回合已结束）返回 409，不计数。算法见「最好场面搜索」 |
| `GET /home` | 首页统计，见「练习与首页」 |
| `GET /cards` | 卡组里每张卡：`md`（Master Duel 简中名）、`role`、`does / cost / limit`（三件事）；页面点卡时显示 |
| `GET /card-image?code=N` | 一张卡图，`{ code, type, base64 }`（插件经 `ctx.rest` 只读 JSON，页面拼成 data: 地址）；数据目录 `images/` 里没有就 404；`code` 只收纯数字 |
| `GET /quiz` | 记卡：`{ due, reviewing, fresh }`，到期的张数（答过的到期了的 + 没答过的） |
| `POST /quiz/next` | 出下一题并开始计时；没有到期的卡返回 `{ done: true, due: 0 }`。题面：`kind`、`prompt`、`image`（卡号或 null）、`options[{text}]`、`roles`（identify）、`given` / `name` / `missing`（fill）、`due`、`fresh`、`lastMs`、`history`（这张卡以往的用时）；不含对错。再调一次换一题（上一题作废） |
| `POST /quiz/answer` `{ option, roles? }` | 批改上一题：400 选项或角色不合法，404 没有在答的题；记一行日志，返回 `correct`、`ms`、`rating`、`dueInMs`、`answerIndex`、`answerRoles`、`card`（名字角色三件事） |
| `POST /hand/end` | 结束回合并结算：还停在主阶段就进结束阶段，之后放行连锁、不发动可选效果；遇到要选的东西返回 409，用户选完再结束。不等搜索：搜完了就用，没搜完或超时就用另外两种基准。返回结算（分数各项、`benchmark`（带 `name`：Game8 路线名）、`finalBoard` / `bestBoard`（卡带 `code` 和 `md`）、`parts`（终场的打断数和手牌数，用户和最好各一份）、`steps`（用户每步：`summary`、`spent`、`gained`、`hinted`）、`bestSteps`（最好路线每步：`summary`、`spent`、`gained`，没有最好路线是 null）、`handTypeStats`（这类起手的平均总分，含这一手）、`curve`、`divergeStep`、`seed`），并往日志追加一行。页面的「重打这一手」用结算里的 `seed` 再 `POST /hand/start`，同一个种子发同样的 5 张牌；「再来一手」不带种子 |

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
| `hands.jsonl` | 只追加，一行一个 JSON。结算一行（`type: "hand"`）：`id`、`seed`、`hand`（起手 5 个密码）、`handType`、`benchmarkHand`（是不是基准手）、`startedAt`（毫秒）、`durationMs`、`hints`（提示次数）、`actions`（每个选择一条：`step`、`atMs`、`kind`、`text`、`indices`、`value` 是这个选择之后的场面值）、`endBoard`（终场的手牌、怪兽区、魔陷区密码）、`userValue`、`bestValue`、`benchmark`（`source`：`search` / `game8` / `personal`，`routeId`（Game8 路线才有）、`provisional`、`search`：搜索现状 `done` / `pending` / `timed-out` / `failed` / `none` / `replay-failed`）、`fieldScore`、`speedBonus`、`speedCounted`、`hintFactor`、`total`。作废一行（`type: "void"`）：`id`、`seed`、`hand`、`startedAt`、`reason` |
| `images/<卡号>.webp` | 卡图，`scripts/sync-card-images.js` 从 NAS 复制来，只放卡组用到的几十张；不进仓。cn 卡图上印的是另一套译名，页面一律把 `md_name` 写在图下方；NAS 上没有的卡（现在是 82344137 原初之神 法拉）页面在图的位置写卡名 |
| `quiz.jsonl` | 只追加，一行一次答题：`type: "answer"`、`at`（毫秒）、`code`、`kind`、`correct`、`ms`、`rating`（Again/Hard/Good/Easy）、`picked`（`option`、`roles`）、`card`（答完之后这张卡的 FSRS 状态，JSON）。一张卡现在的状态 = 它最后一行的 `card`，没有单独的状态文件，所以不会和答题记录对不上 |
| `search/<起手>.json` | 搜索缓存，一手起手一个文件，文件名是排序后的 5 个密码用 `-` 连起来（`handKey`）。内容：`v`（版本，`searchVersion(deck)` 的字符串，对不上现行的就当没有这条）、`hand`（排序后的 5 个密码）、`seed`（搜它用的种子）、`budgetMs`（搜它时的时间上限；超时的条目在现在的上限更大时重搜）、`at`（写入时的毫秒时间）、`timedOut`、`value`（找到的最好场面值，一条都没找到是 null）、`steps`（路线，格式同卡组数据里的 `routes[].steps`，每个回应是语义回应）、`nodes`、`elapsedMs`。先写临时文件再改名；`timedOut` 为 true 的不当基准 |
| `active.json` | 进行中的一手的开局信息（`id`、`seed`、`hand`、`startedAt`）；结算时删。服务启动时发现它还在，说明上次没打完，记一行 `void`（原因：服务重启）再删 |

## 插件

`plugin/dashboard/plugin_api.py`（Hermes 挂在 `/api/plugins/yugioh/`）只转发，一条路径对一条服务接口，没有别的：`GET /hand`、`POST /hand/{start,choose,end}`（白名单 `HAND_WRITES`，别的路径 404 不到服务）、`GET /home`、`GET /cards`、`GET /card-image?code=`（只收数字）。服务没应答是 502。页面 `plugin/webapp/plugin.js`：首页（开始一手 / 继续这一手）、记卡和记录（占位）、展开中屏（照设计稿 clock-play：计时、提示次数、操作记录、场地、手牌、点卡的详情和合法操作、引擎提示的浮层、提示按钮、结束回合）、小结算（总分、场面分、速度加成、提示系数；完整结算屏另一张票）。提示按钮写着「分数 ×0.8」但现在是灰的：服务的提示接口 `POST /hand/hint` 已有，插件转发和按钮接上另开票。展开中页面拿不到场面值：服务不发，页面上也不许出现百分比、「还差」、估值（`./ci` 的 plugin 检查查源码，plugin-smoke 查渲染出来的文字）。

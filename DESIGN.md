# 设计

结构、数据目录、环境变量和口径以本文件为准；代码里的常量照这里写，改的时候两边一起改。术语见 [GLOSSARY.md](GLOSSARY.md)，规格是 #1，架构约定见 [AGENTS.md](AGENTS.md)「架构约定」。

## 结构

```
src/server.js        本地服务（Node 22 内置 http，只监听 127.0.0.1:4519）：目前只有 GET /health；环境变量、「现在」只在这里取
src/duel-session.js  决斗会话：包住规则引擎 ocgcore-wasm，一手牌一个会话；开局（卡组、起手、种子）、当前提示和合法选项、提交选择、查场面、存档回滚；纯逻辑，卡库和脚本由调用方注入
src/deck.js          卡组：展开张数、检查卡组数据（40/15 张、禁限、每张卡的名字角色三件事打断数）、起手分类；纯函数
src/banlist.js       Master Duel 禁限表（自己维护，现行 2026-11-05，只收和卡组有关的条目）
src/route.js         展开路线重放：把一条路线的步骤喂给决斗会话，走到我方回合结束，返回终场，并和路线上写的终场对照
src/decks/branded.js         烙印卡组数据：卡表、卡名、角色、三件事、打断数、起手类型规则
src/decks/branded-routes.js  烙印的两条 Game8 展开路线（引擎可重放的步骤序列）
src/engine-files.js  读引擎数据：cards.cdb（node:sqlite）和卡牌脚本，给会话提供 cardReader、scriptReader、卡名；只读
scripts/prepare-engine.js  把固定版本的 Project Ignis CardScripts 和 BabelCDB 的 cards.cdb 下载到引擎数据目录（唯一联网的地方）
scripts/fetch-card-names.js  按日文卡名向 ygocdb 查密码和简中名（md_name），整理卡组数据时手动跑；服务不联网
scripts/check.js     ./ci 用的架构约定检查（boundary、deps-whitelist、outbound、test-isolation）
test/                模块测试与起服务的测试（帮手 helpers.js：PORT=0、临时数据目录、打开引擎、按计划驱动会话）
ci                   合并前的统一检查（land 跑它），检查项在 checks/list（./ci 是 mac-mini 共用运行器的拷贝）
```

## 环境变量

| 环境变量 | 默认 | 用途 |
|---|---|---|
| `PORT` | `4519` | 端口（`0` = 随便挑一个空闲的） |
| `YUGIOH_DATA` | `~/.mimi-yugioh` | 数据目录（仓外、不进 git） |
| `YUGIOH_ENGINE` | `$YUGIOH_DATA/engine` | 引擎数据目录（卡库、脚本）；测试和 `./ci` 用 `~/.cache/mimi-yugioh/engine` |

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

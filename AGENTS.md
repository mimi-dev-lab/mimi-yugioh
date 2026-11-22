# mimi-yugioh 的规矩

游戏王 Master Duel 卡组训练：给用户一个人用，先学「烙印」。项目表的 id 是 `yugioh`（`~/work/personal/AGENTS.md`）。长期结论（用户定过的事、查清的事实）在家仓 `~/work/personal/repos/home/wiki/yugioh.md`，动手前先读。

- 仓在 `mimi-dev-lab` 组织下，**公开**。不往仓里放卡图、整篇抓来的文章或任何密钥；卡图在 NAS（见 wiki），展开路线写成我们自己的结构化数据并注明出处链接
- 身份：commit `Li Fan <12878764+lifaninjp@users.noreply.github.com>`
- 现状：2026-02 的旧 Next.js 应用已在 #2 删掉。新版做成 Hermes 插件，形态照 `lifaninjp/finance`：本机服务（`src/`，只听 `127.0.0.1:4519`）+ 只做外壳的插件（`plugin/`，还没建）。规格是 #1，选定的设计稿在 `~/work/.preview/yugioh/design-r3/`
- 先读 [DESIGN.md](DESIGN.md)（结构、数据目录、环境变量）和 [GLOSSARY.md](GLOSSARY.md)（起手、场面值、场面分、基准手、决定点……）
- 运行：`YUGIOH_DATA=$(mktemp -d) npm start`；引擎数据先 `node scripts/prepare-engine.js`。测试 `npm test`（Node 22+）。合并前的全部检查是 `./ci`（先 `export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH`）
- 环境变量一律 `YUGIOH_…` 前缀（`PORT` 除外）

## 检查与合并

- 检查的统一入口是仓根的 `./ci`：跑 `checks/list` 里的每一项，有一项没过就退出 1。增删检查只改 `checks/list`
- `./ci` 是 `lifaninjp/mac-mini` 里共用运行器的拷贝，不在本仓改：要改先改 mac-mini 的 `./ci`，再用它的 `bin/ci-sync` 拷过来（`bin/ci-sync --check <本仓目录>` 核对有没有漂移）
- 合并 PR 只用 `land <PR号> --repo mimi-dev-lab/mimi-yugioh`（mac-mini 的 `bin/land`）：它在干净的 worktree 里把 main 合进 PR，跑 `./ci`，过了才合
- 测试和检查不碰线上：不连外部服务、不读真实数据目录，要数据就用临时目录和编的数据

## 架构约定

改代码前对照这一节；标「机械」的由 `./ci`（`checks/list`，规则在 `scripts/check.js`）查，没标的只能靠读。来源：照 `lifaninjp/finance` 的 AGENTS.md「架构约定」，只留适用于本仓的几条，#2 定。

**一个功能放哪**
- 规则或计算：`src/` 下一个按领域起名的模块（`duel-session.js`、以后的 `scoring.js`…），由 `src/server.js` 调用；测试在 `test/<领域>.test.js`，起服务的在 `test/<领域>-http.test.js`。DESIGN.md「结构」一模块一行，新模块加一行。回头看：`src/server.js` 超过 400 行时按路由拆（另开票）。
- 接口：只在 `src/server.js` 加路径。
- 插件（以后的 `plugin/`）只做外壳：后端只把请求转给本机服务，不算数、不读数据、不起子进程；页面只经 `ctx.rest` 调本插件的后端。建插件的那张票把它的检查（照 finance 的 plugin、plugin-loads、plugin-smoke）加进 `checks/list`。

**边界只在少数文件**（机械：boundary）
- 环境变量、「现在」（`Date.now()`、`new Date()`）、开服务只在 `src/server.js`；读卡库和脚本（`node:fs`、`node:sqlite`）只在 `src/engine-files.js`；写数据目录只在 `src/store.js`（还没有）；服务里哪个文件都不起子进程、不往外发请求。别的 `src/` 模块是纯函数或只接收注入的读取函数，「现在」、路径、卡库都作为参数传进去，测试因此能用临时目录和固定种子。回头看：要加新的外部来源时，在这张表里加一个文件，不是放宽规则。

**禁用的写法**
- 依赖（机械：deps-whitelist）：`package.json` 的 dependencies 只有 `ocgcore-wasm`（用到间隔复习时加 `ts-fsrs`，改 `scripts/check.js` 的 `ALLOWED_DEPS` 并在那张票里说明）；没有 devDependencies、不加构建；旧应用（Next.js / Supabase / Cloudflare）的包和文件不许回来。
- 对外地址（机械：outbound、boundary）：`src/` 的代码里写的地址只许本机，服务不往外发请求。联网只有 `scripts/prepare-engine.js`（下载固定版本的公开引擎数据）和 `./ci` 的 `engine` 那一项（调用它）。回头看：要接外部服务（例如查 ygocdb 的卡名）时，先开票定，数据下载做成准备脚本，不放进服务。
- 测试碰线上（机械：test-isolation）：`test/` 里不写常驻服务的端口（4519）、tailnet 地址、`~/.mimi-yugioh`；起服务用 `test/helpers.js`（`PORT=0`、临时数据目录）。引擎数据（公开的卡库和脚本）在复用的缓存目录 `~/.cache/mimi-yugioh/engine`，不是用户数据，`./ci` 的 `engine` 负责下载。回头看：这条拦了正当的测试时，把那个值放进 helpers 换个写法，不放宽规则。
- 引擎的约定（查不了，靠读）：必须先加载 `constant.lua`、`utility.lua`；开局用固定种子，存档回滚靠同种子重放已提交的选择，所以会话里不许引入不可重放的随机或「现在」。

**验证**
- 改了 `src/`，`./ci` 全绿；改了服务的启动或接口，再 `YUGIOH_DATA=$(mktemp -d) PORT=0 npm start` 后 curl `/health`。改插件的界面要在真页面上证明（建插件的票定怎么做）。

## Agent skills

### Issue tracker

GitHub Issues，在 `mimi-dev-lab/mimi-yugioh`。See `docs/agents/issue-tracker.md`.

### Triage labels

Matt 的五个默认标签，另加 `blocked`。See `docs/agents/triage-labels.md`.

### Domain docs

single-context：仓根 `GLOSSARY.md` 和 `docs/adr/`（用到时再建）。See `docs/agents/domain.md`.

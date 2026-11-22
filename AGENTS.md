# mimi-yugioh 的规矩

游戏王 Master Duel 卡组训练：给用户一个人用，先学「烙印」。项目表的 id 是 `yugioh`（`~/work/personal/AGENTS.md`）。长期结论（用户定过的事、查清的事实）在家仓 `~/work/personal/repos/home/wiki/yugioh.md`，动手前先读。

- 仓在 `mimi-dev-lab` 组织下，**公开**。不往仓里放卡图、整篇抓来的文章或任何密钥；卡图在 NAS（见 wiki），展开路线写成我们自己的结构化数据并注明出处链接
- 身份：commit `Li Fan <12878764+lifaninjp@users.noreply.github.com>`
- 现状：根目录还是 2026-02 的旧 Next.js 应用（卡牌查询、卡组详情、场地图），数据和展开都过时。新版做成 Hermes 插件，形态照 `lifaninjp/finance`：本机服务 + 只做外壳的插件。界面在设计稿定下之前不写（家仓技能 `design-artifacts`）

## 检查与合并

- 检查的统一入口是仓根的 `./ci`：跑 `checks/list` 里的每一项，有一项没过就退出 1。增删检查只改 `checks/list`
- `./ci` 是 `lifaninjp/mac-mini` 里共用运行器的拷贝，不在本仓改：要改先改 mac-mini 的 `./ci`，再用它的 `bin/ci-sync` 拷过来（`bin/ci-sync --check <本仓目录>` 核对有没有漂移）
- 合并 PR 只用 `land <PR号> --repo mimi-dev-lab/mimi-yugioh`（mac-mini 的 `bin/land`）：它在干净的 worktree 里把 main 合进 PR，跑 `./ci`，过了才合
- 测试和检查不碰线上：不连外部服务、不读真实数据目录，要数据就用临时目录和编的数据

## 架构约定

（新版的第一张票定，待填。）

## Agent skills

### Issue tracker

GitHub Issues，在 `mimi-dev-lab/mimi-yugioh`。See `docs/agents/issue-tracker.md`.

### Triage labels

Matt 的五个默认标签，另加 `blocked`。See `docs/agents/triage-labels.md`.

### Domain docs

single-context：仓根 `GLOSSARY.md` 和 `docs/adr/`（用到时再建）。See `docs/agents/domain.md`.

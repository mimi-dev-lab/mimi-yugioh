# mimi-yugioh

游戏王 Master Duel 卡组训练，给用户一个人用，先学「烙印」：Hermes 插件 + 一个只听本机的服务。规则、检查和设计见 [AGENTS.md](AGENTS.md)、[DESIGN.md](DESIGN.md)。规格是 #1。

```sh
node scripts/prepare-engine.js                 # 下载引擎数据（卡库和卡牌脚本）到 ~/.mimi-yugioh/engine
YUGIOH_DATA=$(mktemp -d) npm start             # 起服务（127.0.0.1:4519）
curl -s 127.0.0.1:4519/health
./ci                                           # 全部检查
```

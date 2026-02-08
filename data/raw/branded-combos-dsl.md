# 烙印卡组展开模式 (带 DSL)
> 生成时间: 2026-02-02
> 来源: NotebookLM

## 模式一：基础单卡展开 (Standard 1-Card Combo)

**适用场景:** 手牌只有《烙印融合 / Branded Fusion》或《死狱乡的导化 阿鲁伯 / Aluber the Jester of Despia》。

**目标:** 确立《冰剑龙》压制，并调度《深渊之兽》续航，回合结束盖放反击陷阱。

### 详细步骤

1. **启动:** 通常召唤《死狱乡的导化 阿鲁伯 / Aluber the Jester of Despia》，发动效果检索《烙印融合 / Branded Fusion》
2. **融合 1:** 发动《烙印融合 / Branded Fusion》。从卡组将《阿不思的落胤 / Fallen of Albaz》和《深渊之兽 赫界龙 / The Bystial Lubellion》（光属性）送入墓地，融合召唤《烙印龙 白界龙 / Albion the Branded Dragon》
3. **融合 2:** 《烙印龙 白界龙 / Albion the Branded Dragon》效果发动，除外墓地的《阿不思的落胤 / Fallen of Albaz》和场上的《死狱乡的导化 阿鲁伯 / Aluber the Jester of Despia》，融合召唤《神炎龙 赫界龙 / Lubellion the Searing Dragon》
4. **融合 3 (终端):** 《神炎龙 赫界龙 / Lubellion the Searing Dragon》效果发动（丢弃 1 张手牌），将除外区的《阿不思的落胤 / Fallen of Albaz》和场上的自身洗回卡组，融合召唤《冰剑龙 幻冰龙 / Mirrorjade the Iceblade Dragon》
5. **资源调度:** 墓地《深渊之兽 赫界龙 / The Bystial Lubellion》效果发动，解放场上的《烙印龙 白界龙 / Albion the Branded Dragon》特殊召唤自身
6. **贴永续:** 《深渊之兽 赫界龙 / The Bystial Lubellion》效果发动，从卡组将《失烙印 / Branded Lost》（或《烙印之兽 / Branded Beast》）表侧表示放置到场上
7. **回合结束 (EP):** 墓地《烙印龙 白界龙 / Albion the Branded Dragon》效果发动，盖放《烙印断罪 / Branded Retribution》或《赫之烙印 / Branded in Red》

### DSL 流程图

```excalidraw-dsl
(开始) -> [通招 阿鲁伯 / Aluber]
[通招 阿鲁伯 / Aluber] -> [检索 烙印融合 / Branded Fusion]
[检索 烙印融合 / Branded Fusion] -> [发动 烙印融合 / Branded Fusion]
[发动 烙印融合 / Branded Fusion] -> [堆墓: 阿不思 + 深渊之兽赫界龙]
[堆墓: 阿不思 + 深渊之兽赫界龙] -> [融合召唤 烙印龙 / Albion]
[融合召唤 烙印龙 / Albion] -> [烙印龙效果: 除外阿不思+阿鲁伯]
[烙印龙效果: 除外阿不思+阿鲁伯] -> [融合召唤 神炎龙 / Lubellion]
[融合召唤 神炎龙 / Lubellion] -> [神炎龙效果: 丢1手牌, 洗回素材]
[神炎龙效果: 丢1手牌, 洗回素材] -> [融合召唤 冰剑龙 / Mirrorjade]
[融合召唤 冰剑龙 / Mirrorjade] -> [墓地赫界龙效果: 解放烙印龙特招]
[墓地赫界龙效果: 解放烙印龙特招] -> [赫界龙效果: 贴 失烙印 / Branded Lost]
[赫界龙效果: 贴 失烙印 / Branded Lost] -> [结束阶段: 烙印龙效果]
[结束阶段: 烙印龙效果] -> [盖放 烙印断罪 / Branded Retribution]
[盖放 烙印断罪 / Branded Retribution] -> (结束)
```

---

## 模式二：双卡资源循环 (Resource Loop Combo)

**适用场景:** 手牌持有《烙印融合 / Branded Fusion》+《深渊之兽 赫界龙 / The Bystial Lubellion》。

**核心机制:** 利用"自排连锁"防止《灰流丽》，并通过《烙印断罪》回收《烙印融合》实现资源循环。

### 详细步骤

1. **准备:** 发动《深渊之兽 赫界龙 / The Bystial Lubellion》手牌效果（送墓自身），检索《深渊之兽 萨隆魔龙 / Bystial Saronir》
2. **融合:** 发动《烙印融合 / Branded Fusion》，从卡组将《阿不思的落胤 / Fallen of Albaz》和《深渊之兽 萨隆魔龙 / Bystial Saronir》送入墓地，融合召唤《烙印龙 白界龙 / Albion the Branded Dragon》
3. **连锁处理 (Chain Block):**
   - C1: 《烙印龙 白界龙 / Albion the Branded Dragon》（融合效果）
   - C2: 《深渊之兽 萨隆魔龙 / Bystial Saronir》（堆墓效果）
   - 目的：防止 C1 被无效
4. **逆序结算:**
   - C2 结算：《深渊之兽 萨隆魔龙 / Bystial Saronir》从卡组堆墓《烙印断罪 / Branded Retribution》
   - C1 结算：《烙印龙 白界龙 / Albion the Branded Dragon》除外墓地素材，融合召唤《神炎龙 赫界龙 / Lubellion the Searing Dragon》
5. **终端:** 《神炎龙 赫界龙 / Lubellion the Searing Dragon》效果洗回素材，融合召唤《冰剑龙 幻冰龙 / Mirrorjade the Iceblade Dragon》
6. **资源回收:**
   - 墓地《深渊之兽 赫界龙 / The Bystial Lubellion》解放场上的烙印龙特招，贴《失烙印 / Branded Lost》
   - 发动墓地《烙印断罪 / Branded Retribution》效果，除外自身，回收墓地的《烙印融合 / Branded Fusion》

### DSL 流程图

```excalidraw-dsl
(开始) -> [赫界龙效果: 丢弃自身检索萨隆]
[赫界龙效果: 丢弃自身检索萨隆] -> [发动 烙印融合 / Branded Fusion]
[发动 烙印融合 / Branded Fusion] -> [堆墓: 阿不思 + 萨隆魔龙]
[堆墓: 阿不思 + 萨隆魔龙] -> [融合召唤 烙印龙 / Albion]
[融合召唤 烙印龙 / Albion] -> {自排连锁: C1烙印龙 C2萨隆?}
{自排连锁: C1烙印龙 C2萨隆?} -> [C2结算: 堆墓 烙印断罪 / Branded Retribution]
[C2结算: 堆墓 烙印断罪 / Branded Retribution] -> [C1结算: 出 神炎龙 / Lubellion]
[C1结算: 出 神炎龙 / Lubellion] -> [神炎龙效果: 出 冰剑龙 / Mirrorjade]
[神炎龙效果: 出 冰剑龙 / Mirrorjade] -> [墓地赫界龙起跳: 贴 失烙印]
[墓地赫界龙起跳: 贴 失烙印] -> [墓地断罪效果: 回收 烙印融合]
[墓地断罪效果: 回收 烙印融合] -> (结束)
```

---

## 模式三：梦魇封锁 (Gimmick Puppet Lock)

**适用场景:** 手牌《融合派兵 / Fusion Deployment》+《烙印融合 / Branded Fusion》（或阿鲁伯）。

**目标:** 在对方回合通过《真炎龙》将《机关傀儡-梦魇》特招到对方场上，封锁对方特招（2026年环境主流打法）。

### 详细步骤

1. **铺场:** 发动《融合派兵 / Fusion Deployment》，从卡组特招《赫之圣女 卡尔特西娅 / Blazing Cartesia, the Virtuous》
2. **融合展开:** 发动《烙印融合 / Branded Fusion》，标准流程做出《冰剑龙 幻冰龙 / Mirrorjade the Iceblade Dragon》（过程同模式一，注意保留场上的赫之圣女）
3. **二速融合:** 发动场上《赫之圣女 卡尔特西娅 / Blazing Cartesia, the Virtuous》的效果，与场上的怪兽（如深渊之兽赫界龙）融合召唤《赫焉龙 大木偶剧场龙 / Granguignol the Dusk Dragon》
4. **埋雷:** 《赫焉龙 大木偶剧场龙 / Granguignol the Dusk Dragon》效果发动，从卡组/额外卡组堆墓《机关傀儡-梦魇 / Gimmick Puppet Nightmare》
5. **EP 盖牌:** 回合结束阶段，墓地《烙印龙 白界龙 / Albion the Branded Dragon》效果发动，盖放《赫之烙印 / Branded in Red》（或通过断罪回收）
6. **对方回合:**
   - 发动《赫之烙印 / Branded in Red》，回收墓地阿不思，融合召唤《真炎龙 白界龙 / Albion the Sanctifire Dragon》
   - 《真炎龙 白界龙 / Albion the Sanctifire Dragon》效果发动，苏生墓地的《机关傀儡-梦魇 / Gimmick Puppet Nightmare》到对方场上，苏生另一只怪兽到己方场上
   - 结果：对方本回合不能特殊召唤

### DSL 流程图

```excalidraw-dsl
(开始) -> [发动 融合派兵 / Fusion Deployment]
[发动 融合派兵 / Fusion Deployment] -> [特招 赫之圣女 / Cartesia]
[特招 赫之圣女 / Cartesia] -> [烙印融合展开 -> 出 冰剑龙 / Mirrorjade]
[烙印融合展开 -> 出 冰剑龙 / Mirrorjade] -> [赫之圣女效果: 融合 赫焉龙 / Granguignol]
[赫之圣女效果: 融合 赫焉龙 / Granguignol] -> [赫焉龙效果: 堆墓 机关傀儡-梦魇 / Gimmick Puppet Nightmare]
[赫焉龙效果: 堆墓 机关傀儡-梦魇 / Gimmick Puppet Nightmare] -> [EP: 盖放 赫之烙印 / Branded in Red]
[EP: 盖放 赫之烙印 / Branded in Red] -> (对方回合)
(对方回合) -> [发动 赫之烙印: 出 真炎龙 / Sanctifire Dragon]
[发动 赫之烙印: 出 真炎龙 / Sanctifire Dragon] -> [真炎龙效果: 苏生梦魇到对方场上]
[真炎龙效果: 苏生梦魇到对方场上] -> (封锁达成)
```

---

## 模式四：气炎展开 (High Spirits Combo)

**适用场景:** 手牌《烙印的气炎 / Branded in High Spirits》+ 龙族/鸟兽族/机械族怪兽（或《深渊之兽》）。

**优势:** 规避《灰流丽》对《烙印融合》的直接打击，不占通招调度资源。

### 详细步骤

1. **启动:** 发动《烙印的气炎 / Branded in High Spirits》，展示手牌的《深渊之兽 赫界龙 / The Bystial Lubellion》（或阿不思）
2. **堆墓与检索:** 从额外卡组堆墓《灰烬龙 落胤龙 / Titaniklad the Ash Dragon》（或对应种族融合怪），丢弃展示的怪兽，检索《护宝炮妖·姬特 / Springans Kitt》（或阿不思/赫之圣女）
3. **调度融合:** 特殊召唤《护宝炮妖·姬特 / Springans Kitt》，效果检索《烙印融合 / Branded Fusion》并回一张手牌
4. **后续:** 此时通常召唤权尚在，且已拿到《烙印融合》，可以继续进行标准展开。若对方有手坑，可利用墓地《灰烬龙 落胤龙 / Titaniklad the Ash Dragon》在 EP 特招《赫之圣女 卡尔特西娅 / Blazing Cartesia, the Virtuous》或《引导的圣女 奎姆 / Guiding Quem, the Virtuous》进行妥协

### DSL 流程图

```excalidraw-dsl
(开始) -> [发动 烙印的气炎 / Branded in High Spirits]
[发动 烙印的气炎 / Branded in High Spirits] -> [展示手牌怪兽, 堆墓额外融合怪]
[展示手牌怪兽, 堆墓额外融合怪] -> [检索 护宝炮妖·姬特 / Springans Kitt]
[检索 护宝炮妖·姬特 / Springans Kitt] -> [特招 姬特 & 检索 烙印融合 / Branded Fusion]
[特招 姬特 & 检索 烙印融合 / Branded Fusion] -> {是否还有通招?}
{是否还有通招?} -> [是: 发动烙印融合进标准展开]
{是否还有通招?} -> [否: EP利用灰烬龙特招圣女]
[是: 发动烙印融合进标准展开] -> (标准场)
[否: EP利用灰烬龙特招圣女] -> (妥协场)
```

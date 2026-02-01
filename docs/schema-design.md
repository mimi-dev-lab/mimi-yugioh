# mimi-yugioh 数据架构设计

## 概览

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                         │
│  ├── /                      → React SPA                     │
│  └── /data/decks/*.json     → 卡组教学数据（静态）            │
├─────────────────────────────────────────────────────────────┤
│                    Cloudflare Workers                       │
│  └── /api/*                 → API 端点                      │
├─────────────────────────────────────────────────────────────┤
│                    Cloudflare D1                            │
│  ├── cards                  → 卡牌数据 (14149条)             │
│  └── decks                  → 卡组索引                       │
├─────────────────────────────────────────────────────────────┤
│                    Cloudflare R2                            │
│  └── /cn/{id}.webp          → 卡牌图片                       │
│  └── /jp/{id}.webp                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## D1 表结构

### cards 表

```sql
CREATE TABLE cards (
  id INTEGER PRIMARY KEY,           -- 卡牌ID (YGOProDeck ID)
  name TEXT NOT NULL,               -- 英文名
  name_cn TEXT,                     -- 中文名
  name_jp TEXT,                     -- 日文名
  type TEXT NOT NULL,               -- 卡牌类型 (Monster Card / Spell Card / Trap Card)
  race TEXT,                        -- 种族/魔法陷阱类型
  attribute TEXT,                   -- 属性 (DARK/LIGHT/...)
  level INTEGER,                    -- 等级/阶级/LINK值
  atk INTEGER,                      -- 攻击力
  def INTEGER,                      -- 防御力
  desc_cn TEXT,                     -- 中文效果描述
  archetype TEXT,                   -- 所属系列 (可选，便于筛选)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_cards_name_cn ON cards(name_cn);
CREATE INDEX idx_cards_type ON cards(type);
CREATE INDEX idx_cards_archetype ON cards(archetype);

-- 全文搜索 (FTS5)
CREATE VIRTUAL TABLE cards_fts USING fts5(
  name_cn,
  desc_cn,
  content='cards',
  content_rowid='id'
);
```

### decks 表

```sql
CREATE TABLE decks (
  id TEXT PRIMARY KEY,              -- 卡组ID (如 "branded", "dark-magician")
  name TEXT NOT NULL,               -- 显示名 (如 "烙印")
  name_jp TEXT,                     -- 日文名
  description TEXT,                 -- 简短描述
  tags TEXT,                        -- JSON 数组 ["融合", "墓地利用", "TIER1"]
  thumbnail_card_id INTEGER,        -- 封面卡牌ID (用于显示图片)
  difficulty INTEGER DEFAULT 3,     -- 难度 1-5
  tier TEXT,                        -- 环境等级 (TIER1/TIER2/ROGUE/FUN)
  data_version INTEGER DEFAULT 1,   -- 数据版本号
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thumbnail_card_id) REFERENCES cards(id)
);

-- 索引
CREATE INDEX idx_decks_tier ON decks(tier);
```

---

## 卡组教学 JSON Schema

文件位置: `/data/decks/{deck_id}.json`

```typescript
interface DeckTeaching {
  // === 元信息 ===
  id: string;                       // "branded"
  version: number;                  // 数据版本，与 D1 decks.data_version 对应
  generatedAt: string;              // ISO 日期 "2026-02-01"
  source: {
    type: "notebooklm";
    notebookId: string;
    notebookName: string;
  };

  // === 基本信息 ===
  name: string;                     // "烙印"
  nameJp?: string;                  // "烙印"
  description: string;              // 一句话描述
  tags: string[];                   // ["融合", "墓地利用", "妨害型"]
  difficulty: 1 | 2 | 3 | 4 | 5;    // 上手难度
  tier?: string;                    // "TIER1"

  // === コンセプト解説 ===
  concept: {
    overview: string;               // 卡组整体介绍 (2-3段)
    coreStrategy: string;           // 核心战术详解
    strengths: string[];            // 优势
    weaknesses: string[];           // 弱点
    playstyle: string;              // 游戏风格描述
    keyCards: CardRef[];            // 核心卡牌 (带说明)
  };

  // === デッキ構成リスト ===
  decklist: {
    main: DeckCard[];               // 主卡组
    extra: DeckCard[];              // 额外卡组
    side?: DeckCard[];              // 副卡组 (可选)
    totalMain: number;              // 主卡组总数 (校验用)
    totalExtra: number;             // 额外卡组总数
  };

  // === 展開教学 ===
  combos: Combo[];                  // 展开路线列表

  // === 补充内容 (可选) ===
  tips?: string[];                  // 使用技巧
  counters?: string[];              // 如何应对此卡组
  variants?: DeckVariant[];         // 构筑变体
}

// === 子类型定义 ===

interface CardRef {
  name: string;                     // 中文卡名 (用于匹配)
  role: string;                     // 在卡组中的定位
  explanation: string;              // 为什么重要
}

interface DeckCard {
  name: string;                     // 中文卡名
  count: number;                    // 投入数量
  category: "monster" | "spell" | "trap" | "extra";
  role: string;                     // 定位 (如 "核心启动点", "后续资源", "泛用手坑")
  effect: string;                   // 简述效果/用法
  priority: "core" | "staple" | "tech" | "flex";  // 重要程度
  notes?: string;                   // 补充说明
}

interface Combo {
  id: string;                       // "combo-1"
  name: string;                     // "气炎 + 任意手坑"
  description: string;              // 这套 combo 的目标/特点
  startingHand: string[];           // 起手需要的卡 (中文卡名)
  conditions?: string;              // 发动条件/前提
  steps: ComboStep[];               // 详细步骤
  finalBoard: FinalBoard;           // 最终盘面
  difficulty: 1 | 2 | 3 | 4 | 5;    // combo 难度
  notes?: string[];                 // 注意事项
}

interface ComboStep {
  step: number;                     // 步骤序号
  action: string;                   // 操作描述 (详细)
  cardUsed?: string;                // 使用的卡牌
  result: string;                   // 这一步的结果
  chainable?: boolean;              // 是否可被连锁
  interruptionRisk?: string;        // 可能被什么打断
  tips?: string;                    // 小技巧
}

interface FinalBoard {
  description: string;              // 文字描述最终盘面
  monsters: BoardCard[];            // 场上的怪兽
  spellTraps?: BoardCard[];         // 场上的魔陷
  hand?: string[];                  // 手牌剩余
  graveyard?: string[];             // 墓地关键卡
  interruptionCount: number;        // 妨害数量
  interruptionDetails: string[];    // 妨害点详解
}

interface BoardCard {
  name: string;                     // 卡名
  position?: "attack" | "defense" | "facedown";
  materials?: string[];             // 素材 (融合/XYZ/链接)
  note?: string;                    // 说明
}

interface DeckVariant {
  name: string;                     // 变体名 (如 "纯烙印", "烙印龙剑士")
  changes: string[];                // 与标准构筑的区别
  pros: string[];                   // 优点
  cons: string[];                   // 缺点
}
```

---

## API 端点设计

### 卡牌相关

```
GET /api/cards
  ?q={搜索词}           # 全文搜索
  &type={类型}          # 筛选类型
  &archetype={系列}     # 筛选系列
  &page={页码}
  &limit={每页数量}

GET /api/cards/:id      # 获取单张卡牌详情

POST /api/cards/resolve # 批量解析卡名 → 完整信息
  Body: { "names": ["烙印融合", "白之落胤", ...] }
  Response: {
    "resolved": [
      { "name": "烙印融合", "id": 12345, "image": "https://..." },
      ...
    ],
    "notFound": ["某张不存在的卡"]
  }
```

### 卡组相关

```
GET /api/decks          # 卡组列表
  ?tier={环境等级}
  &tag={标签}

GET /api/decks/:id      # 卡组基本信息 (从 D1)
GET /api/decks/:id/full # 卡组完整教学数据 (从静态 JSON + 解析卡牌)
```

---

## 数据流

### 生成卡组教学数据

```
NotebookLM 查询
      ↓
  3个标准查询结果
      ↓
  整理成 JSON (按 Schema)
      ↓
  保存到 /data/decks/{id}.json
      ↓
  同时更新 D1 decks 表 (索引信息)
```

### APP 加载卡组详情

```
用户点击卡组
      ↓
  请求 /api/decks/{id}/full
      ↓
  Worker 读取静态 JSON
      ↓
  提取所有卡名，调用 cards/resolve
      ↓
  合并卡牌详情 (id, 图片URL)
      ↓
  返回完整数据给前端
```

---

## 图片 URL 规则

```javascript
const getCardImage = (cardId: number, lang: 'cn' | 'jp' = 'cn') => {
  return `https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev/${lang}/${cardId}.webp`;
};
```

---

## 下一步

1. [ ] 创建 D1 数据库
2. [ ] 导入卡牌数据到 cards 表
3. [ ] 创建 Worker API
4. [ ] 按 Schema 整理烙印卡组数据
5. [ ] 前端对接 API

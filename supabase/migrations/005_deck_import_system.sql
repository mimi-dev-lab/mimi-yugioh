-- ============================================
-- 005: 卡组导入系统 - 别名库 + 笔记系统
-- ============================================

-- 1. 卡片别名库（智能匹配核心）
CREATE TABLE IF NOT EXISTS card_aliases (
  alias TEXT PRIMARY KEY,           -- 别名（小写存储）
  card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
  source TEXT DEFAULT 'manual',     -- manual / learned / ai
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_card_aliases_card ON card_aliases(card_id);

-- 2. 更新 decks 表结构
ALTER TABLE decks ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS source_text TEXT;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS notes JSONB DEFAULT '{}';
ALTER TABLE decks ADD COLUMN IF NOT EXISTS is_imported BOOLEAN DEFAULT FALSE;

-- 3. 预置常用别名
INSERT INTO card_aliases (alias, card_id, source) VALUES
-- 手坑
('灰流', 14558127, 'manual'),
('灰流丽', 14558127, 'manual'),
('ash', 14558127, 'manual'),
('灰', 14558127, 'manual'),
('增殖的g', 23434538, 'manual'),
('增g', 23434538, 'manual'),
('g', 23434538, 'manual'),
('増殖するg', 23434538, 'manual'),
('增殖', 23434538, 'manual'),
('无限泡影', 10045474, 'manual'),
('泡影', 10045474, 'manual'),
('无效泡影', 10045474, 'manual'),
('屋敷わらし', 67750322, 'manual'),
('屋敷', 67750322, 'manual'),
('座敷童', 67750322, 'manual'),
('d.d.乌鸦', 24508238, 'manual'),
('dd乌鸦', 24508238, 'manual'),
('乌鸦', 24508238, 'manual'),
('效果遮蒙者', 97268402, 'manual'),
('遮蒙', 97268402, 'manual'),
('veiler', 97268402, 'manual'),
('幽鬼兔', 59438930, 'manual'),
('兔子', 59438930, 'manual'),
('ghost belle', 59438930, 'manual'),
('锁鸟', 94145021, 'manual'),
('朱光的宣告者', 94145021, 'manual'),
('宣告者', 94145021, 'manual'),
-- 泛用魔法
('哈利的羽毛扫', 18144506, 'manual'),
('羽毛扫', 18144506, 'manual'),
('大扫除', 18144506, 'manual'),
('harpies feather duster', 18144506, 'manual'),
('雷击', 12580477, 'manual'),
('闪电风暴', 12580477, 'manual'),
('lightning storm', 12580477, 'manual'),
('强欲而贪欲之壶', 35261759, 'manual'),
('强贪', 35261759, 'manual'),
('pot of desires', 35261759, 'manual'),
('强欲而谦虚之壶', 98645731, 'manual'),
('强谦', 98645731, 'manual'),
('pot of duality', 98645731, 'manual'),
('金满而谦虚之壶', 84211599, 'manual'),
('金谦', 84211599, 'manual'),
('pot of prosperity', 84211599, 'manual'),
('墓穴的指名者', 24224830, 'manual'),
('墓穴', 24224830, 'manual'),
('墓指', 24224830, 'manual'),
('called by the grave', 24224830, 'manual'),
('抹杀之指名者', 65681983, 'manual'),
('抹杀', 65681983, 'manual'),
('crossout designator', 65681983, 'manual'),
-- 泛用陷阱
('神之宣告', 41420027, 'manual'),
('神宣', 41420027, 'manual'),
('solemn judgment', 41420027, 'manual'),
('神之警告', 84749824, 'manual'),
('神警', 84749824, 'manual'),
('solemn warning', 84749824, 'manual'),
('神之通告', 40605147, 'manual'),
('神通', 40605147, 'manual'),
('solemn strike', 40605147, 'manual'),
('虚无空间', 5851097, 'manual'),
('虚无', 5851097, 'manual'),
-- 泛用额外
('编码语者', 1861629, 'manual'),
('decode talker', 1861629, 'manual'),
('转生炎兽日光狼', 78661338, 'manual'),
('日光狼', 78661338, 'manual'),
('水晶机巧继承玻纤', 50588353, 'manual'),
('玻纤', 50588353, 'manual'),
('halqifibrax', 50588353, 'manual'),
('召命之神弓阿波罗萨', 4280258, 'manual'),
('阿波罗萨', 4280258, 'manual'),
('apollousa', 4280258, 'manual'),
('天霆号阿宙斯', 90448279, 'manual'),
('阿宙斯', 90448279, 'manual'),
('zeus', 90448279, 'manual'),
('鸟铳士卡斯泰尔', 82633039, 'manual'),
('卡斯泰尔', 82633039, 'manual'),
('castel', 82633039, 'manual'),
('深渊鳞甲龙', 21044178, 'manual'),
('深渊龙', 21044178, 'manual'),
('abyss dweller', 21044178, 'manual')
ON CONFLICT (alias) DO NOTHING;

COMMENT ON TABLE card_aliases IS '卡片别名库，用于智能匹配';
COMMENT ON COLUMN decks.notes IS '卡组笔记 JSON: {playstyle, combos, tech_choices, matchups, tips}';

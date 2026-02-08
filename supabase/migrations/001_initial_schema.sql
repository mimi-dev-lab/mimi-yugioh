-- Mimi-YuGiOh Database Schema v1
-- Created: 2026-02-08

-- ============================================
-- 1. cards - 卡片主表
-- ============================================
CREATE TABLE cards (
  id INTEGER PRIMARY KEY,           -- Konami 官方卡片 ID
  name_en TEXT,                     -- 英文名
  name_jp TEXT,                     -- 日文名
  name_cn TEXT,                     -- 中文名
  card_type TEXT,                   -- 类型 (Monster/Spell/Trap)
  sub_type TEXT,                    -- 子类型 (Effect/Tuner/Fusion/Link...)
  attribute TEXT,                   -- 属性 (LIGHT/DARK/FIRE/WATER/WIND/EARTH/DIVINE)
  race TEXT,                        -- 种族 (Dragon/Spellcaster/Warrior...)
  level INTEGER,                    -- 等级/阶级/连接值
  atk INTEGER,                      -- 攻击力 (NULL = 无攻击力)
  def INTEGER,                      -- 守备力 (NULL = 连接怪兽/无守备力)
  desc_en TEXT,                     -- 英文效果
  desc_jp TEXT,                     -- 日文效果
  desc_cn TEXT,                     -- 中文效果
  archetype TEXT,                   -- 所属系列 (Branded/Blue-Eyes/Bystial...)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_cards_name_cn ON cards(name_cn);
CREATE INDEX idx_cards_name_jp ON cards(name_jp);
CREATE INDEX idx_cards_archetype ON cards(archetype);
CREATE INDEX idx_cards_card_type ON cards(card_type);

-- ============================================
-- 2. decks - 卡组表
-- ============================================
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,               -- 卡组名称
  description TEXT,                 -- 描述
  category TEXT,                    -- 分类 (控制/展开/融合...)
  source_url TEXT,                  -- 来源链接
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. deck_cards - 卡组卡片关联表
-- ============================================
CREATE TABLE deck_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID REFERENCES decks(id) ON DELETE CASCADE,
  card_id INTEGER REFERENCES cards(id),
  zone TEXT NOT NULL CHECK (zone IN ('main', 'extra', 'side')),
  count INTEGER NOT NULL DEFAULT 1 CHECK (count BETWEEN 1 AND 3),
  UNIQUE(deck_id, card_id, zone)
);

CREATE INDEX idx_deck_cards_deck ON deck_cards(deck_id);

-- ============================================
-- 4. combos - 连招表
-- ============================================
CREATE TABLE combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,               -- 连招名称
  starting_cards JSONB,             -- 起手卡 ["卡名1", "卡名2"]
  combo_type TEXT CHECK (combo_type IN ('single', 'double', 'triple')),
  difficulty TEXT CHECK (difficulty IN ('easy', 'normal', 'hard')),
  end_board JSONB,                  -- 最终盘面 {monsters: [], negates: N, ...}
  notes TEXT,                       -- 备注
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_combos_deck ON combos(deck_id);

-- ============================================
-- 5. combo_steps - 连招步骤表
-- ============================================
CREATE TABLE combo_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID REFERENCES combos(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,      -- 步骤顺序
  action_type TEXT,                 -- 动作类型 (normal_summon/special_summon/activate/search...)
  card_name TEXT,                   -- 使用的卡
  description TEXT,                 -- 步骤说明
  search_target TEXT,               -- 检索目标
  summon_target TEXT,               -- 召唤目标
  UNIQUE(combo_id, step_order)
);

CREATE INDEX idx_combo_steps_combo ON combo_steps(combo_id);

-- ============================================
-- 更新触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER decks_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

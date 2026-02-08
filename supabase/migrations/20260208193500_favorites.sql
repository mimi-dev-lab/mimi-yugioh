-- ============================================
-- 收藏系统
-- ============================================

-- 1. 收藏夹表（支持分组）
CREATE TABLE favorite_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#daa520',      -- 文件夹颜色
  icon TEXT DEFAULT 'star',          -- 图标名
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认收藏夹
INSERT INTO favorite_folders (id, name, description, color, sort_order) VALUES 
  ('00000000-0000-0000-0000-000000000001', '默认收藏', '我收藏的卡片', '#daa520', 0);

-- 2. 收藏记录表
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES favorite_folders(id) ON DELETE SET NULL 
    DEFAULT '00000000-0000-0000-0000-000000000001',
  note TEXT,                         -- 收藏备注
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(card_id, folder_id)         -- 同一卡片在同一文件夹只能收藏一次
);

-- 索引
CREATE INDEX idx_favorites_card ON favorites(card_id);
CREATE INDEX idx_favorites_folder ON favorites(folder_id);
CREATE INDEX idx_favorites_created ON favorites(created_at DESC);

-- 更新触发器
CREATE TRIGGER favorite_folders_updated_at
  BEFORE UPDATE ON favorite_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 视图：收藏卡片详情（便于查询）
-- ============================================
CREATE VIEW favorite_cards_view AS
SELECT 
  f.id as favorite_id,
  f.card_id,
  f.folder_id,
  f.note,
  f.created_at as favorited_at,
  ff.name as folder_name,
  ff.color as folder_color,
  c.name_cn,
  c.name_jp,
  c.name_en,
  c.card_type,
  c.sub_type,
  c.attribute,
  c.race,
  c.level,
  c.atk,
  c.def,
  c.desc_cn,
  c.archetype
FROM favorites f
LEFT JOIN favorite_folders ff ON f.folder_id = ff.id
LEFT JOIN cards c ON f.card_id = c.id;

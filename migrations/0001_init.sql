-- 卡牌表
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_cn TEXT,
  name_jp TEXT,
  type TEXT NOT NULL,
  race TEXT,
  attribute TEXT,
  level INTEGER,
  atk INTEGER,
  def INTEGER,
  desc_cn TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cards_name_cn ON cards(name_cn);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);

-- 卡组表
CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_jp TEXT,
  description TEXT,
  tags TEXT,
  thumbnail_card_id INTEGER,
  difficulty INTEGER DEFAULT 3,
  tier TEXT,
  data_version INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_decks_tier ON decks(tier);

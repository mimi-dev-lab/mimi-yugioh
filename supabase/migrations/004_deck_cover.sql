-- ============================================
-- 004: Add cover_card_id to decks
-- ============================================

-- 卡组封面卡片
ALTER TABLE decks ADD COLUMN cover_card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL;

-- 索引
CREATE INDEX idx_decks_cover ON decks(cover_card_id);

COMMENT ON COLUMN decks.cover_card_id IS '卡组封面卡片ID，由用户手动选择';

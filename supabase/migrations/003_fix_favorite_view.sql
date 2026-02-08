-- 修复 favorite_cards_view，添加所有语言的描述字段
DROP VIEW IF EXISTS favorite_cards_view;

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
  c.desc_jp,
  c.desc_en,
  c.archetype,
  c.banlist_ocg
FROM favorites f
LEFT JOIN favorite_folders ff ON f.folder_id = ff.id
LEFT JOIN cards c ON f.card_id = c.id;

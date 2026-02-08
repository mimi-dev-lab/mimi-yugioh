#!/usr/bin/env python3
"""
后处理脚本：将 combo 文本中的《卡名》转换为《卡名:ID》

匹配策略（按优先级）：
1. 优先从卡组列表 (deck_list) 匹配 — 同源数据，100% 准确
2. Fallback 到数据库 — 处理卡组外的卡（如通用手坑）

用法：
  python enrich-card-ids.py input.json output.json
  python enrich-card-ids.py input.json  # 原地修改
"""

import json
import re
import sys
import requests
from pathlib import Path

API_BASE = "https://mimi-yugioh.pages.dev/api"

def extract_deck_cards(data: dict) -> dict[str, int]:
    """从卡组数据中提取卡名→ID映射"""
    cards = {}
    
    deck_list = data.get('deck_list', {})
    
    # 主卡组
    main_deck = deck_list.get('main_deck', {})
    for category in ['monsters', 'spells', 'traps']:
        for card in main_deck.get(category, []):
            name = card.get('name_cn')
            card_id = card.get('id')
            if name and card_id:
                cards[name] = card_id
    
    # 额外卡组
    extra_deck = deck_list.get('extra_deck', {})
    for category in ['synchro', 'link', 'xyz', 'fusion']:
        for card in extra_deck.get(category, []):
            name = card.get('name_cn')
            card_id = card.get('id')
            if name and card_id:
                cards[name] = card_id
    
    # 副卡组
    side_deck = deck_list.get('side_deck', [])
    for card in side_deck:
        name = card.get('name_cn')
        card_id = card.get('id')
        if name and card_id:
            cards[name] = card_id
    
    return cards

def load_db_names() -> dict[str, int]:
    """从 API 加载完整卡名→ID 映射（作为 fallback）"""
    print("📥 Loading card names from database...")
    resp = requests.get(f"{API_BASE}/cards/names")
    resp.raise_for_status()
    data = resp.json()
    print(f"  ✅ Loaded {data['count']} card names")
    return data['names']

def enrich_text(text: str, deck_cards: dict[str, int], db_cards: dict[str, int]) -> str:
    """
    将文本中的《卡名》替换为《卡名:ID》
    优先从 deck_cards 匹配，fallback 到 db_cards
    """
    if not text:
        return text
    
    pattern = r'《([^》:]+)》'
    
    def replace_match(m):
        card_name = m.group(1)
        
        # 优先级1: 精确匹配卡组列表
        if card_name in deck_cards:
            return f"《{card_name}:{deck_cards[card_name]}》"
        
        # 优先级2: 精确匹配数据库
        if card_name in db_cards:
            print(f"  ⚠️  DB fallback: 《{card_name}》")
            return f"《{card_name}:{db_cards[card_name]}》"
        
        # 优先级3: 卡组列表前缀匹配（处理简称）
        for full_name, card_id in deck_cards.items():
            if full_name.startswith(card_name) or card_name in full_name:
                print(f"  🔄 Deck fuzzy: 《{card_name}》→ 《{full_name}》")
                return f"《{full_name}:{card_id}》"
        
        # 未找到
        print(f"  ❌ Not found: 《{card_name}》")
        return m.group(0)
    
    return re.sub(pattern, replace_match, text)

def enrich_object(obj, deck_cards: dict[str, int], db_cards: dict[str, int]):
    """递归处理对象中的所有字符串字段"""
    if isinstance(obj, str):
        return enrich_text(obj, deck_cards, db_cards)
    elif isinstance(obj, list):
        return [enrich_object(item, deck_cards, db_cards) for item in obj]
    elif isinstance(obj, dict):
        return {k: enrich_object(v, deck_cards, db_cards) for k, v in obj.items()}
    else:
        return obj

def main():
    if len(sys.argv) < 2:
        print("Usage: python enrich-card-ids.py input.json [output.json]")
        sys.exit(1)
    
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else input_path
    
    print(f"📄 Input: {input_path}")
    print(f"📄 Output: {output_path}")
    
    # 读取 JSON
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 提取卡组卡名（优先匹配源）
    deck_cards = extract_deck_cards(data)
    print(f"🎴 Deck cards: {len(deck_cards)} cards")
    
    # 加载数据库卡名（fallback）
    db_cards = load_db_names()
    
    # 处理
    print("🔄 Enriching card names with IDs...")
    enriched = enrich_object(data, deck_cards, db_cards)
    
    # 保存
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(enriched, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Done! Saved to {output_path}")

if __name__ == "__main__":
    main()

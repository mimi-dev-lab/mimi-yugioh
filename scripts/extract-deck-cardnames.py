#!/usr/bin/env python3
"""
从卡组 JSON 提取所有卡名，用于提供给 NotebookLM 参考

用法：
  python extract-deck-cardnames.py deck.json
  
输出格式（可直接复制到 prompt）：
【白森林相关】
- 白森的阿斯特娅 (ID: 25592142)
- 白森的西尔薇 (ID: 98385955)
...
"""

import json
import sys
from pathlib import Path
from collections import defaultdict

def extract_cards(deck_data: dict) -> dict[str, list[tuple[str, int]]]:
    """提取卡组中所有卡牌，按类别分组"""
    cards_by_category = defaultdict(list)
    
    # 从 deck_list 提取
    deck_list = deck_data.get('deck_list', {})
    
    # 主卡组
    main_deck = deck_list.get('main_deck', {})
    for category in ['monsters', 'spells', 'traps']:
        for card in main_deck.get(category, []):
            name = card.get('name_cn') or card.get('name')
            card_id = card.get('id')
            role = card.get('role', '')
            if name and card_id:
                # 根据 role 分类
                if '白森' in name or '白森' in role:
                    cards_by_category['白森林系'].append((name, card_id))
                elif '百夫长' in name or '骑士' in name:
                    cards_by_category['百夫长系'].append((name, card_id))
                elif '手坑' in role:
                    cards_by_category['手坑'].append((name, card_id))
                else:
                    cards_by_category['其他'].append((name, card_id))
    
    # 额外卡组
    extra_deck = deck_list.get('extra_deck', {})
    for category in ['synchro', 'link', 'xyz', 'fusion']:
        for card in extra_deck.get(category, []):
            name = card.get('name_cn') or card.get('name')
            card_id = card.get('id')
            if name and card_id:
                if '白森' in name:
                    cards_by_category['白森林系（额外）'].append((name, card_id))
                elif '骑士' in name:
                    cards_by_category['百夫长系（额外）'].append((name, card_id))
                else:
                    cards_by_category['额外卡组'].append((name, card_id))
    
    return cards_by_category

def main():
    if len(sys.argv) < 2:
        print("Usage: python extract-deck-cardnames.py deck.json")
        sys.exit(1)
    
    deck_path = Path(sys.argv[1])
    
    with open(deck_path, 'r', encoding='utf-8') as f:
        deck_data = json.load(f)
    
    cards = extract_cards(deck_data)
    
    print("=" * 60)
    print("卡名参考列表（请在 combo 描述中使用以下完整卡名）")
    print("=" * 60)
    print()
    
    for category, card_list in cards.items():
        if card_list:
            print(f"【{category}】")
            for name, card_id in sorted(set(card_list)):
                print(f"  - {name} (ID: {card_id})")
            print()

if __name__ == "__main__":
    main()

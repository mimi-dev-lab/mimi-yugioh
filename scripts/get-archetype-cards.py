#!/usr/bin/env python3
"""
从数据库获取系列相关卡牌，生成 NotebookLM prompt 用的卡名参考

用法：
  python get-archetype-cards.py "白森" "百夫长" "骑士"
  
输出可直接复制到 NotebookLM prompt
"""

import sys
import requests

API_BASE = "https://mimi-yugioh.pages.dev/api"

def search_cards(keyword: str) -> list[dict]:
    """搜索包含关键词的卡牌"""
    resp = requests.get(f"{API_BASE}/cards", params={"q": keyword, "limit": 100})
    resp.raise_for_status()
    return resp.json().get("cards", [])

def main():
    if len(sys.argv) < 2:
        print("Usage: python get-archetype-cards.py <keyword1> [keyword2] ...")
        print("Example: python get-archetype-cards.py 白森 百夫长 骑士")
        sys.exit(1)
    
    keywords = sys.argv[1:]
    all_cards = {}
    
    for keyword in keywords:
        print(f"🔍 Searching: {keyword}", file=sys.stderr)
        cards = search_cards(keyword)
        for card in cards:
            card_id = card.get("id")
            name_cn = card.get("name_cn")
            if card_id and name_cn:
                all_cards[card_id] = name_cn
    
    print(f"\n找到 {len(all_cards)} 张卡牌\n", file=sys.stderr)
    
    # 输出 prompt 格式
    print("=" * 60)
    print("【卡名参考列表 - 请在描述中使用以下完整卡名】")
    print("=" * 60)
    print()
    print("重要：描述 combo 时，卡名必须使用《》包裹，且与下方列表完全一致！")
    print()
    
    # 按名称排序输出
    for card_id, name_cn in sorted(all_cards.items(), key=lambda x: x[1]):
        print(f"- {name_cn}")
    
    print()
    print("=" * 60)
    print("示例格式：")
    print('发动《白森的阿斯特娅》效果，从卡组特殊召唤《白森的西尔薇》')
    print("=" * 60)

if __name__ == "__main__":
    main()

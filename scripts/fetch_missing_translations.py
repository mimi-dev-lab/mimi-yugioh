#!/usr/bin/env python3
"""
从 YGOProDeck API 获取缺失的中日文卡片名称和描述
"""
import json
import time
import requests
from pathlib import Path

# YGOProDeck API
YGOPRODECK_API = "https://db.ygoprodeck.com/api/v7/cardinfo.php"

# 百鸽笼 API (中文数据)
OUROCG_API = "https://www.ourocg.cn/api/card"

def fetch_from_ygoprodeck(card_id: int) -> dict | None:
    """从 YGOProDeck 获取卡片数据"""
    try:
        resp = requests.get(f"{YGOPRODECK_API}?id={card_id}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("data"):
                card = data["data"][0]
                return {
                    "id": card_id,
                    "name_en": card.get("name"),
                    "name_jp": card.get("name_jp"),  # 可能没有
                    "desc_en": card.get("desc"),
                    "desc_jp": card.get("desc_jp"),  # 可能没有
                }
    except Exception as e:
        print(f"  YGOProDeck error for {card_id}: {e}")
    return None

def fetch_from_ourocg(card_id: int) -> dict | None:
    """从百鸽笼获取中文数据"""
    try:
        resp = requests.get(f"{OUROCG_API}/{card_id}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("data"):
                card = data["data"]
                return {
                    "id": card_id,
                    "name_cn": card.get("name_cn") or card.get("name"),
                    "name_jp": card.get("name_jp") or card.get("name_ja"),
                    "desc_cn": card.get("desc_cn") or card.get("desc"),
                    "desc_jp": card.get("desc_jp") or card.get("desc_ja"),
                }
    except Exception as e:
        print(f"  OurOCG error for {card_id}: {e}")
    return None

def search_by_name(name_en: str) -> dict | None:
    """用英文名搜索"""
    try:
        # 先尝试 YGOProDeck
        resp = requests.get(f"{YGOPRODECK_API}?fname={requests.utils.quote(name_en)}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("data"):
                for card in data["data"]:
                    if card.get("name", "").lower() == name_en.lower():
                        return {
                            "name_jp": card.get("name_jp"),
                            "desc_jp": card.get("desc_jp"),
                        }
    except Exception as e:
        print(f"  Search error for '{name_en}': {e}")
    return None

def main():
    # 读取缺失卡片列表
    missing_file = Path("/tmp/missing_cards.txt")
    if not missing_file.exists():
        print("Missing cards file not found!")
        return
    
    card_ids = [int(line.strip()) for line in missing_file.read_text().strip().split("\n") if line.strip()]
    print(f"Found {len(card_ids)} cards with missing translations")
    
    results = []
    
    for i, card_id in enumerate(card_ids[:50]):  # 先处理前50张测试
        print(f"[{i+1}/{len(card_ids[:50])}] Fetching card {card_id}...")
        
        # 尝试从百鸽笼获取
        data = fetch_from_ourocg(card_id)
        
        if not data:
            # 尝试从 YGOProDeck 获取
            data = fetch_from_ygoprodeck(card_id)
        
        if data:
            results.append(data)
            print(f"  Found: {data.get('name_cn') or data.get('name_jp') or 'partial'}")
        else:
            print(f"  Not found")
        
        time.sleep(0.3)  # 避免请求过快
    
    # 保存结果
    output_file = Path("/tmp/card_translations.json")
    output_file.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"\nSaved {len(results)} results to {output_file}")

if __name__ == "__main__":
    main()

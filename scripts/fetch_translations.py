#!/usr/bin/env python3
"""
从多个数据源获取缺失的游戏王卡片中日文数据
"""
import json
import time
import re
import subprocess
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import quote

def fetch_url(url, headers=None):
    """简单的 URL 获取"""
    try:
        req = Request(url, headers=headers or {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        })
        with urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"  Fetch error: {e}")
        return None

def search_ygocdb(card_id):
    """从 YGOCDB (中文) 搜索"""
    try:
        url = f"https://ygocdb.com/api/v0/?search={card_id}"
        data = fetch_url(url)
        if data:
            result = json.loads(data)
            if result.get("result"):
                card = result["result"][0]
                return {
                    "name_cn": card.get("cn_name"),
                    "name_jp": card.get("jp_name"),
                    "desc_cn": card.get("cn_text"),
                    "desc_jp": card.get("jp_text"),
                }
    except Exception as e:
        print(f"  YGOCDB error: {e}")
    return None

def search_ygocdb_by_name(name_en):
    """用英文名从 YGOCDB 搜索"""
    try:
        url = f"https://ygocdb.com/api/v0/?search={quote(name_en)}"
        data = fetch_url(url)
        if data:
            result = json.loads(data)
            if result.get("result"):
                # 找到最匹配的
                for card in result["result"]:
                    if card.get("en_name", "").lower() == name_en.lower():
                        return {
                            "name_cn": card.get("cn_name"),
                            "name_jp": card.get("jp_name"),
                            "desc_cn": card.get("cn_text"),
                            "desc_jp": card.get("jp_text"),
                        }
    except Exception as e:
        print(f"  YGOCDB search error: {e}")
    return None

def get_missing_cards():
    """从数据库获取缺失翻译的卡片"""
    cmd = """docker exec supabase_db_mimi-yugioh psql -U postgres -d postgres -t -A -F '|' -c "
    SELECT id, name_en, name_cn, name_jp, desc_cn, desc_jp
    FROM cards 
    WHERE (name_cn IS NULL OR name_cn = '') OR (name_jp IS NULL OR name_jp = '')
    ORDER BY id;
    " """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    
    cards = []
    for line in result.stdout.strip().split("\n"):
        if line and line.strip():
            parts = line.split("|")
            if len(parts) >= 2 and parts[0].strip().isdigit():
                cards.append({
                    "id": int(parts[0].strip()),
                    "name_en": parts[1].strip() if len(parts) > 1 else "",
                    "name_cn": parts[2].strip() if len(parts) > 2 else "",
                    "name_jp": parts[3].strip() if len(parts) > 3 else "",
                    "desc_cn": parts[4].strip() if len(parts) > 4 else "",
                    "desc_jp": parts[5].strip() if len(parts) > 5 else "",
                })
    return cards

def update_card(card_id, name_cn=None, name_jp=None, desc_cn=None, desc_jp=None):
    """更新数据库中的卡片数据"""
    updates = []
    if name_cn:
        updates.append(f"name_cn = '{name_cn.replace(chr(39), chr(39)+chr(39))}'")
    if name_jp:
        updates.append(f"name_jp = '{name_jp.replace(chr(39), chr(39)+chr(39))}'")
    if desc_cn:
        updates.append(f"desc_cn = '{desc_cn.replace(chr(39), chr(39)+chr(39))}'")
    if desc_jp:
        updates.append(f"desc_jp = '{desc_jp.replace(chr(39), chr(39)+chr(39))}'")
    
    if not updates:
        return False
    
    sql = f"UPDATE cards SET {', '.join(updates)} WHERE id = {card_id};"
    cmd = f'docker exec supabase_db_mimi-yugioh psql -U postgres -d postgres -c "{sql}"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return "UPDATE 1" in result.stdout

def main():
    print("Fetching missing card translations...")
    cards = get_missing_cards()
    print(f"Found {len(cards)} cards with missing translations\n")
    
    updated = 0
    not_found = []
    
    for i, card in enumerate(cards):
        print(f"[{i+1}/{len(cards)}] {card['id']}: {card['name_en']}")
        
        # 先用 ID 搜索
        data = search_ygocdb(card["id"])
        
        # 如果没找到，用名字搜索
        if not data or (not data.get("name_cn") and not data.get("name_jp")):
            data = search_ygocdb_by_name(card["name_en"])
        
        if data and (data.get("name_cn") or data.get("name_jp")):
            # 只更新缺失的字段
            name_cn = data.get("name_cn") if not card.get("name_cn") else None
            name_jp = data.get("name_jp") if not card.get("name_jp") else None
            desc_cn = data.get("desc_cn") if not card.get("desc_cn") else None
            desc_jp = data.get("desc_jp") if not card.get("desc_jp") else None
            
            if name_cn or name_jp or desc_cn or desc_jp:
                success = update_card(card["id"], name_cn, name_jp, desc_cn, desc_jp)
                if success:
                    updated += 1
                    print(f"  ✓ Updated: CN={name_cn}, JP={name_jp}")
                else:
                    print(f"  ✗ Update failed")
            else:
                print(f"  - Already complete")
        else:
            not_found.append(card)
            print(f"  ✗ Not found in YGOCDB")
        
        time.sleep(0.2)  # Rate limiting
    
    print(f"\n=== Summary ===")
    print(f"Updated: {updated}")
    print(f"Not found: {len(not_found)}")
    
    if not_found:
        print("\nCards not found in YGOCDB:")
        for card in not_found[:20]:
            print(f"  - {card['id']}: {card['name_en']}")
        if len(not_found) > 20:
            print(f"  ... and {len(not_found) - 20} more")

if __name__ == "__main__":
    main()

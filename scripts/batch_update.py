#!/usr/bin/env python3
"""批量更新缺失的卡片翻译"""
import json
import time
import subprocess
import re
import sys
from urllib.request import urlopen, Request

def fetch_ygocdb(card_id):
    try:
        url = f"https://ygocdb.com/api/v0/?search={card_id}"
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=10) as resp:
            data = resp.read().decode("utf-8", errors="ignore")
            data = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', data)
            result = json.loads(data)
            if result.get("result"):
                r = result["result"][0]
                return {
                    "cn_name": r.get("cn_name", ""),
                    "jp_name": r.get("jp_name", ""),
                    "desc_cn": r.get("text", {}).get("desc", ""),
                }
    except Exception as e:
        pass
    return None

def update_db(card_id, cn_name, jp_name, desc_cn):
    parts = []
    if cn_name:
        parts.append(f"name_cn = '{cn_name.replace(chr(39), chr(39)+chr(39))}'")
    if jp_name:
        parts.append(f"name_jp = '{jp_name.replace(chr(39), chr(39)+chr(39))}'")
    if desc_cn:
        parts.append(f"desc_cn = '{desc_cn.replace(chr(39), chr(39)+chr(39))}'")
    
    if parts:
        sql = f"UPDATE cards SET {', '.join(parts)} WHERE id = {card_id};"
        cmd = f'docker exec supabase_db_mimi-yugioh psql -U postgres -d postgres -c "{sql}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return "UPDATE 1" in result.stdout
    return False

def main():
    # 获取所有缺失的卡片 ID
    print("Fetching missing card IDs...", flush=True)
    cmd = """docker exec supabase_db_mimi-yugioh psql -U postgres -d postgres -t -A -c "
    SELECT id FROM cards 
    WHERE (name_cn IS NULL OR name_cn = '') OR (name_jp IS NULL OR name_jp = '')
    ORDER BY id;
    " """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    card_ids = [int(x.strip()) for x in result.stdout.strip().split('\n') if x.strip().isdigit()]

    print(f"Processing {len(card_ids)} cards...", flush=True)

    updated = 0
    not_found = 0
    not_found_list = []

    for i, card_id in enumerate(card_ids):
        if i % 20 == 0:
            print(f"Progress: {i}/{len(card_ids)} (updated: {updated}, not_found: {not_found})", flush=True)
        
        data = fetch_ygocdb(card_id)
        if data and (data["cn_name"] or data["jp_name"]):
            if update_db(card_id, data["cn_name"], data["jp_name"], data["desc_cn"]):
                updated += 1
        else:
            not_found += 1
            not_found_list.append(card_id)
        
        time.sleep(0.15)

    print(f"\n=== Summary ===", flush=True)
    print(f"Updated: {updated}", flush=True)
    print(f"Not found: {not_found}", flush=True)
    if not_found_list:
        print(f"\nNot found IDs:", flush=True)
        for cid in not_found_list[:50]:
            print(f"  {cid}", flush=True)
        if len(not_found_list) > 50:
            print(f"  ... and {len(not_found_list) - 50} more", flush=True)

if __name__ == "__main__":
    main()

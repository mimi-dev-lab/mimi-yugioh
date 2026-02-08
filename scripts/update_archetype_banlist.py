#!/usr/bin/env python3
"""
从 YGOProDeck API 批量更新 archetype 和 banlist 数据
"""

import requests
import psycopg2
import time
import sys

# 数据库连接
DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 54322,
    "user": "postgres",
    "password": "postgres",
    "database": "postgres"
}

# YGOProDeck API
API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php"

def get_all_cards_from_api():
    """一次性获取所有卡片数据（API 支持）"""
    print("📥 从 YGOProDeck API 获取所有卡片数据...")
    
    try:
        response = requests.get(API_URL, timeout=60)
        response.raise_for_status()
        data = response.json()
        cards = data.get('data', [])
        print(f"✅ 获取到 {len(cards)} 张卡片")
        return cards
    except Exception as e:
        print(f"❌ API 请求失败: {e}")
        return []

def update_database(api_cards):
    """批量更新数据库"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    # 获取数据库中的所有卡片 ID
    cur.execute("SELECT id FROM cards")
    db_ids = set(row[0] for row in cur.fetchall())
    print(f"📊 数据库有 {len(db_ids)} 张卡片")
    
    # 构建 API 数据映射
    api_map = {}
    for card in api_cards:
        card_id = card.get('id')
        if card_id:
            archetype = card.get('archetype')
            banlist = card.get('banlist_info', {})
            api_map[card_id] = {
                'archetype': archetype,
                'banlist_ocg': banlist.get('ban_ocg'),
                'banlist_tcg': banlist.get('ban_tcg'),
            }
    
    print(f"📊 API 数据映射了 {len(api_map)} 张卡片")
    
    # 统计
    updated = 0
    has_archetype = 0
    has_banlist = 0
    
    # 批量更新
    batch_size = 500
    updates = []
    
    for card_id in db_ids:
        if card_id in api_map:
            info = api_map[card_id]
            updates.append((
                info['archetype'],
                info['banlist_ocg'],
                info['banlist_tcg'],
                card_id
            ))
            
            if info['archetype']:
                has_archetype += 1
            if info['banlist_ocg'] or info['banlist_tcg']:
                has_banlist += 1
    
    print(f"📝 准备更新 {len(updates)} 张卡片...")
    print(f"   - 有 archetype: {has_archetype}")
    print(f"   - 有 banlist: {has_banlist}")
    
    # 执行批量更新
    for i in range(0, len(updates), batch_size):
        batch = updates[i:i+batch_size]
        cur.executemany("""
            UPDATE cards 
            SET archetype = %s, banlist_ocg = %s, banlist_tcg = %s
            WHERE id = %s
        """, batch)
        conn.commit()
        updated += len(batch)
        print(f"   进度: {updated}/{len(updates)}")
    
    cur.close()
    conn.close()
    
    print(f"\n✅ 更新完成！")
    print(f"   - 总更新: {updated}")
    print(f"   - 有 archetype: {has_archetype}")
    print(f"   - 有 banlist: {has_banlist}")

def show_stats():
    """显示更新后的统计"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    # Archetype 统计
    cur.execute("""
        SELECT archetype, COUNT(*) as cnt 
        FROM cards 
        WHERE archetype IS NOT NULL AND archetype != ''
        GROUP BY archetype 
        ORDER BY cnt DESC 
        LIMIT 20
    """)
    print("\n📊 热门系列 TOP 20:")
    for row in cur.fetchall():
        print(f"   {row[0]}: {row[1]}")
    
    # Banlist 统计
    cur.execute("""
        SELECT banlist_ocg, COUNT(*) as cnt 
        FROM cards 
        WHERE banlist_ocg IS NOT NULL
        GROUP BY banlist_ocg
    """)
    print("\n📊 OCG 禁限统计:")
    for row in cur.fetchall():
        print(f"   {row[0]}: {row[1]}")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    print("🚀 开始更新 archetype 和 banlist 数据...\n")
    
    # 获取 API 数据
    api_cards = get_all_cards_from_api()
    
    if api_cards:
        # 更新数据库
        update_database(api_cards)
        
        # 显示统计
        show_stats()
    else:
        print("❌ 无法获取 API 数据，退出")
        sys.exit(1)

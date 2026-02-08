#!/usr/bin/env python3
"""
从 YGOCDB 批量导入所有版本的中文卡名到别名库
这样不管文章用港台/简中/MD版翻译，都能匹配到正确的卡片
"""

import asyncio
import httpx
import json
import time
from pathlib import Path

# Supabase 配置
SUPABASE_URL = "http://127.0.0.1:54321"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

YGOCDB_API = "https://ygocdb.com/api/v0/"

# 要导入的名字字段（优先级从高到低）
NAME_FIELDS = ["cn_name", "sc_name", "md_name", "cnocg_n", "nwbbs_n"]


async def get_all_card_ids() -> list[int]:
    """获取数据库中所有卡片ID"""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/cards",
            params={"select": "id", "limit": "20000"},
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }
        )
        cards = resp.json()
        return [c["id"] for c in cards]


async def search_ygocdb_by_id(card_id: int):
    """通过 ID 搜索 YGOCDB"""
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(f"{YGOCDB_API}?search={card_id}")
            data = resp.json()
            results = data.get("result", [])
            for r in results:
                if r.get("id") == card_id:
                    return r
            return None
        except Exception as e:
            return None


async def insert_alias(alias: str, card_id: int, source: str = "ygocdb"):
    """插入别名（忽略重复）"""
    if not alias or len(alias) < 2:
        return False
    
    # 规范化：小写、去空格
    normalized = alias.lower().strip()
    
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/card_aliases",
                json={"alias": normalized, "card_id": card_id, "source": source},
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=ignore-duplicates"
                }
            )
            return resp.status_code in [200, 201, 409]
        except:
            return False


async def process_card(card_id: int) -> int:
    """处理单张卡片，返回新增的别名数"""
    result = await search_ygocdb_by_id(card_id)
    if not result:
        return 0
    
    added = 0
    seen = set()  # 避免重复
    
    for field in NAME_FIELDS:
        name = result.get(field, "")
        if name and name.lower() not in seen:
            seen.add(name.lower())
            if await insert_alias(name, card_id):
                added += 1
    
    # 也加入日文名和英文名作为别名
    jp_name = result.get("jp_name", "")
    en_name = result.get("en_name", "")
    if jp_name and jp_name.lower() not in seen:
        seen.add(jp_name.lower())
        await insert_alias(jp_name, card_id)
        added += 1
    if en_name and en_name.lower() not in seen:
        seen.add(en_name.lower())
        await insert_alias(en_name, card_id)
        added += 1
    
    return added


async def main():
    print("🔄 从 YGOCDB 导入卡名别名...")
    
    # 获取所有卡片 ID
    print("📥 获取卡片列表...")
    card_ids = await get_all_card_ids()
    print(f"   共 {len(card_ids)} 张卡片")
    
    # 批量处理
    total_added = 0
    processed = 0
    
    print("🔄 开始导入别名...")
    
    for i, card_id in enumerate(card_ids):
        added = await process_card(card_id)
        total_added += added
        processed += 1
        
        if (i + 1) % 100 == 0:
            print(f"   [{i+1}/{len(card_ids)}] 已处理, 新增 {total_added} 个别名")
        
        # 避免请求过快（YGOCDB 限流）
        if (i + 1) % 10 == 0:
            await asyncio.sleep(0.3)
    
    print(f"\n✅ 导入完成！")
    print(f"   处理: {processed} 张卡片")
    print(f"   新增: {total_added} 个别名")


if __name__ == "__main__":
    asyncio.run(main())

#!/usr/bin/env python3
"""
从 YGOCDB 同步中文卡名和效果文本
YGOCDB API: https://ygocdb.com/api/v0/?search=关键词

字段说明：
- cn_name: 港台繁体翻译
- sc_name: 简体中文官方翻译 (优先使用)
- md_name: Master Duel 版本
- cnocg_n: CNOCG 版本
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

# 日志文件
LOG_FILE = Path(__file__).parent / "sync_log.json"


async def search_ygocdb(query: str) -> list[dict]:
    """搜索 YGOCDB"""
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(f"{YGOCDB_API}?search={query}")
            data = resp.json()
            return data.get("result", [])
        except Exception as e:
            print(f"  ❌ 搜索失败: {e}")
            return []


async def get_cards_to_update() -> list[dict]:
    """获取需要更新的卡片（有日文名但中文名可能不准确的）"""
    async with httpx.AsyncClient(timeout=30) as client:
        # 获取所有有日文名的卡片
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/cards",
            params={
                "select": "id,name_cn,name_jp,name_en,desc_cn",
                "name_jp": "not.is.null",
                "limit": "15000"
            },
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }
        )
        return resp.json()


async def update_card(card_id: int, name_cn: str, desc_cn: str = None):
    """更新卡片的中文数据"""
    data = {"name_cn": name_cn}
    if desc_cn:
        data["desc_cn"] = desc_cn
    
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/cards",
            params={"id": f"eq.{card_id}"},
            json=data,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json"
            }
        )
        return resp.status_code == 204


async def sync_batch(cards: list[dict], batch_size: int = 50):
    """批量同步卡片数据"""
    updated = 0
    skipped = 0
    failed = 0
    changes = []
    
    for i, card in enumerate(cards):
        card_id = card["id"]
        jp_name = card.get("name_jp", "")
        old_cn_name = card.get("name_cn", "")
        
        if not jp_name:
            skipped += 1
            continue
        
        # 用日文名或英文名搜索 YGOCDB
        results = await search_ygocdb(card.get("name_en", jp_name))
        
        # 找到匹配的卡片
        matched = None
        for r in results:
            if r.get("id") == card_id or r.get("jp_name") == jp_name:
                matched = r
                break
        
        if not matched:
            # 用 ID 搜索
            results = await search_ygocdb(str(card_id))
            for r in results:
                if r.get("id") == card_id:
                    matched = r
                    break
        
        if matched:
            # 优先使用 sc_name (简体中文官方) 或 md_name (Master Duel)
            new_cn_name = matched.get("sc_name") or matched.get("md_name") or matched.get("cn_name")
            new_desc = matched.get("text", {}).get("desc", "")
            
            if new_cn_name and new_cn_name != old_cn_name:
                success = await update_card(card_id, new_cn_name, new_desc if new_desc else None)
                if success:
                    updated += 1
                    changes.append({
                        "id": card_id,
                        "old": old_cn_name,
                        "new": new_cn_name
                    })
                    print(f"  ✅ [{i+1}/{len(cards)}] {old_cn_name} → {new_cn_name}")
                else:
                    failed += 1
                    print(f"  ❌ [{i+1}/{len(cards)}] 更新失败: {card_id}")
            else:
                skipped += 1
                if (i + 1) % 100 == 0:
                    print(f"  ⏭️ [{i+1}/{len(cards)}] 跳过（已是最新）")
        else:
            skipped += 1
            if (i + 1) % 100 == 0:
                print(f"  ⏭️ [{i+1}/{len(cards)}] 跳过（未找到）")
        
        # 避免请求过快
        if (i + 1) % 10 == 0:
            await asyncio.sleep(0.5)
    
    return updated, skipped, failed, changes


async def main():
    print("🔄 开始同步 YGOCDB 中文数据...")
    
    # 获取需要更新的卡片
    print("📥 获取卡片列表...")
    cards = await get_cards_to_update()
    print(f"   共 {len(cards)} 张卡片")
    
    # 批量同步
    print("🔄 开始同步...")
    updated, skipped, failed, changes = await sync_batch(cards)
    
    # 保存日志
    LOG_FILE.write_text(json.dumps({
        "total": len(cards),
        "updated": updated,
        "skipped": skipped,
        "failed": failed,
        "changes": changes
    }, ensure_ascii=False, indent=2))
    
    print(f"\n✅ 同步完成！")
    print(f"   更新: {updated}")
    print(f"   跳过: {skipped}")
    print(f"   失败: {failed}")
    print(f"   日志: {LOG_FILE}")


if __name__ == "__main__":
    asyncio.run(main())

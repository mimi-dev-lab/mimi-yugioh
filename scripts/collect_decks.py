#!/usr/bin/env python3
"""
菜蘑菇游戏王卡组爬虫
从 https://www.caimogu.cc/circle/special/370.html 收集卡组数据
"""

import json
import os
import re
import time
from datetime import datetime
from playwright.sync_api import sync_playwright

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'decks')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 卡组分类页面
DECK_CATEGORIES = [
    {'url': 'https://www.caimogu.cc/circle/370.html?tab=1', 'category': '硬核'},
    {'url': 'https://www.caimogu.cc/circle/370.html?tab=2', 'category': '娱乐'},
    {'url': 'https://www.caimogu.cc/circle/370.html?tab=3', 'category': '萌新'},
]

def extract_deck_links(page):
    """从列表页提取卡组文章链接"""
    links = []
    # 查找所有卡组文章链接
    elements = page.query_selector_all('a[href*="/post/"]')
    for el in elements:
        href = el.get_attribute('href')
        title = el.inner_text().strip()
        if href and title and '卡组' in title or '介绍' in title or '攻略' in title:
            if href.startswith('/'):
                href = 'https://www.caimogu.cc' + href
            links.append({'url': href, 'title': title})
    return links

def extract_deck_content(page, url, category):
    """从详情页提取卡组内容"""
    try:
        page.goto(url, wait_until='networkidle', timeout=30000)
        time.sleep(2)  # 等待动态内容加载
        
        # 提取标题
        title_el = page.query_selector('div:has-text("卡组"):not(:has(div))')
        title = title_el.inner_text() if title_el else ''
        
        # 提取作者
        author_el = page.query_selector('text=/by .+/')
        author = ''
        if author_el:
            author_text = author_el.inner_text()
            author = author_text.replace('by ', '').strip()
        
        # 提取正文内容
        content = page.inner_text('body')
        
        # 提取更新日期
        date_match = re.search(r'更新于\s*(\d{4}-\d{2}-\d{2})', content)
        updated_at = date_match.group(1) if date_match else ''
        
        deck_data = {
            'id': url.split('/')[-1].replace('.html', ''),
            'name': title or extract_deck_name(content),
            'category': category,
            'description': extract_description(content),
            'source_url': url,
            'author': author,
            'updated_at': updated_at,
            'main_deck': extract_main_deck(content),
            'extra_deck': extract_extra_deck(content),
            'side_deck': [],
            'combos': extract_combos(content),
            'tips': extract_tips(content),
            'raw_content': content[:5000],  # 保存部分原始内容供后续处理
            'collected_at': datetime.now().strftime('%Y-%m-%d')
        }
        
        return deck_data
    except Exception as e:
        print(f'Error extracting {url}: {e}')
        return None

def extract_deck_name(content):
    """从内容中提取卡组名称"""
    # 匹配【xxx】格式的标题
    match = re.search(r'【([^】]+)】', content)
    if match:
        return match.group(1)
    return ''

def extract_description(content):
    """提取卡组描述"""
    # 取前500字符作为描述
    lines = content.split('\n')
    desc_lines = []
    for line in lines[:20]:
        line = line.strip()
        if len(line) > 20 and not line.startswith('http'):
            desc_lines.append(line)
            if len(''.join(desc_lines)) > 300:
                break
    return ' '.join(desc_lines)[:500]

def extract_main_deck(content):
    """提取主卡组（简化版，后续可以用AI优化）"""
    # 这里简化处理，实际可以用更复杂的规则或AI来提取
    cards = []
    # 匹配常见的卡牌名称模式
    patterns = [
        r'(\d+)[张x×]?\s*[「『]([^」』]+)[」』]',
        r'[「『]([^」』]+)[」』]\s*[x×]?\s*(\d+)',
    ]
    for pattern in patterns:
        matches = re.findall(pattern, content)
        for match in matches:
            if pattern.startswith(r'(\d+)'):
                count, name = match
            else:
                name, count = match
            cards.append({'name': name, 'count': int(count)})
    return cards[:40]  # 主卡组最多40张

def extract_extra_deck(content):
    """提取额外卡组"""
    # 简化处理
    return []

def extract_combos(content):
    """提取连招"""
    combos = []
    # 匹配"combo"、"连招"、"展开"等关键词后的内容
    combo_section = re.search(r'(combo|连招|展开|基础流程)[：:]\s*(.+?)(?=\n\n|\Z)', content, re.I | re.S)
    if combo_section:
        steps = combo_section.group(2).split('\n')
        steps = [s.strip() for s in steps if s.strip() and len(s.strip()) > 5]
        if steps:
            combos.append({
                'name': '基础展开',
                'steps': steps[:10]
            })
    return combos

def extract_tips(content):
    """提取使用技巧"""
    tips = []
    # 匹配"注意"、"技巧"、"tips"等关键词
    tip_patterns = [
        r'注意[：:]\s*([^\n]+)',
        r'技巧[：:]\s*([^\n]+)',
        r'要点[：:]\s*([^\n]+)',
    ]
    for pattern in tip_patterns:
        matches = re.findall(pattern, content)
        tips.extend(matches)
    return tips[:10]

def main():
    print('🎴 开始收集卡组数据...')
    print(f'📁 输出目录: {OUTPUT_DIR}')
    
    all_decks = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        page = context.new_page()
        
        # 从专题页获取卡组列表
        print('\n📋 获取卡组列表...')
        page.goto('https://www.caimogu.cc/circle/special/370.html', wait_until='networkidle')
        time.sleep(3)
        
        deck_links = extract_deck_links(page)
        print(f'   找到 {len(deck_links)} 个卡组文章')
        
        # 限制收集数量（测试用）
        deck_links = deck_links[:20]
        
        # 收集每个卡组
        for i, link in enumerate(deck_links):
            print(f'\n[{i+1}/{len(deck_links)}] 收集: {link["title"][:30]}...')
            
            deck_data = extract_deck_content(page, link['url'], '卡组分享')
            if deck_data:
                all_decks.append(deck_data)
                
                # 保存单个卡组
                deck_file = os.path.join(OUTPUT_DIR, f'{deck_data["id"]}.json')
                with open(deck_file, 'w', encoding='utf-8') as f:
                    json.dump(deck_data, f, ensure_ascii=False, indent=2)
                print(f'   ✅ 已保存: {deck_file}')
            
            time.sleep(2)  # 避免请求过快
        
        browser.close()
    
    # 保存汇总文件
    summary_file = os.path.join(OUTPUT_DIR, 'all_decks.json')
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(all_decks, f, ensure_ascii=False, indent=2)
    
    print(f'\n✅ 完成！共收集 {len(all_decks)} 套卡组')
    print(f'📁 汇总文件: {summary_file}')

if __name__ == '__main__':
    main()

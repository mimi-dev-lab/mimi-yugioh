import { NextRequest, NextResponse } from 'next/server'

// Gemini 通用服务器地址（宿主机运行，端口 8766）
const GEMINI_URL = process.env.GEMINI_API_URL || 'http://host.docker.internal:8766'

const ANALYSIS_PROMPT = `你是游戏王卡组分析专家。请从以下文章中提取卡组信息。

## 任务
1. 识别卡组名称
2. 提取卡组列表（含数量、英文名、角色标签）
3. 提取打法思路
4. 提取起手判断（好手牌/坏手牌）
5. 提取 Combo 详细步骤
6. 提取对局建议

## 卡名提取规则
- **优先提取日文卡名**（最准确，用于匹配）
- 同时提取中文名
- 提取角色标签（如 [核心][初动][展开][终端][手坑][泛用]）
- 数量用阿拉伯数字
- **Combo 步骤中的卡名必须用日文名**（card_jp 字段）

## 场面摆放规则（重要！）
- emz: 额外怪兽区，数组长度2，Link怪兽只能放这里
- mmz: 主怪兽区，数组长度5，通常/效果怪兽放这里
- stz: 魔陷区，数组长度5，永续魔法/陷阱放这里
- field_spell: 场地魔法（单独字段）
- gy: 墓地（数组）
- hand: 手牌（数组）

摆放规则：Link怪兽只能放emz，融合/同调/超量优先放emz，通常怪兽放mmz中间位置

## 返回格式（严格JSON）
{
  "name": "卡组名称",
  "name_en": "English Deck Name",
  "deck_type": "中速/速攻/控制",
  "difficulty": "入门/中等/高级",
  "main_deck": [
    {
      "name_en": "English Card Name",
      "name_cn": "中文卡名",
      "count": 3,
      "roles": ["核心", "初动"],
      "category": "monster"
    }
  ],
  "extra_deck": [
    {
      "name_en": "English Name",
      "name_cn": "中文名",
      "count": 1,
      "roles": ["终端"],
      "category": "fusion"
    }
  ],
  "side_deck": [],
  "notes": {
    "playstyle": "核心战术和风格描述（3-5句话）",
    "starting_hands": {
      "ideal": [
        {
          "cards": ["卡A", "任意1张"],
          "result": "预期终盘",
          "description": "展开思路"
        }
      ],
      "acceptable": [
        {
          "cards": ["卡B单卡"],
          "result": "预期终盘",
          "description": "展开思路"
        }
      ],
      "bad": [
        {
          "cards": ["全手坑", "无初动"],
          "suggestion": "换牌建议"
        }
      ]
    },
    "combos": [
      {
        "name": "Combo 名称",
        "difficulty": 1,
        "starting_hand": ["日文卡名A", "日文卡名B"],
        "steps": [
          {
            "title": "第一步：检索",
            "card_jp": "E・HERO エアーマン",
            "desc": "通召气流人，发动①效果检索HERO怪兽",
            "action": "通召 → 检索",
            "field": {
              "emz": [null, null],
              "mmz": [null, null, "E・HERO エアーマン", null, null],
              "stz": [null, null, null, null, null],
              "field_spell": null,
              "gy": [],
              "hand": ["検索した日文卡名"]
            }
          },
          {
            "title": "第二步：Link召唤",
            "card_jp": "X・HERO クロスガイ",
            "desc": "Link召唤十字魔侠（Link怪兽只能放EMZ）",
            "action": "Link召唤 → 堆墓",
            "field": {
              "emz": ["X・HERO クロスガイ", null],
              "mmz": [null, null, null, null, null],
              "stz": [null, null, null, null, null],
              "field_spell": null,
              "gy": ["E・HERO エアーマン", "素材怪兽"],
              "hand": ["手牌"]
            }
          }
        ],
        "end_board": {
          "field": ["日文卡名A", "日文卡名B"],
          "set": ["盖卡"],
          "graveyard": ["墓地资源"]
        },
        "counter_play": "对手回合的应对方式",
        "weaknesses": ["灰流うらら", "无限泡影"]
      }
    ],
    "tech_choices": "泛用卡位说明",
    "matchups": [
      {
        "opponent": "对手卡组",
        "winrate": "有利/五五开/不利",
        "going_first": "先攻策略",
        "going_second": "后攻策略",
        "key_cards": "关键卡",
        "notes": "注意点"
      }
    ],
    "tips": [
      {"title": "技巧名", "content": "详细说明"}
    ]
  }
}

---
原文内容：
`

interface CardInfo {
  name_jp: string
  name_cn: string
  roles: string[]
}

// 从文章中预提取日文卡名和角色标签
function extractCardInfo(text: string): Map<string, CardInfo> {
  const mapping = new Map<string, CardInfo>() // 中文名 -> CardInfo
  
  // 匹配格式: Nx **日文名** (中文名) [角色1][角色2]
  // 日文名包含：平假名、片假名、汉字、数字、英文字母、特殊符号
  const patterns = [
    // 格式1: 3x **日文名** (中文名) [角色]
    /\d+x?\s*\*\*([^*]+)\*\*\s*\(([^)]+)\)\s*(\[[\u4e00-\u9fa5]+\](?:\[[\u4e00-\u9fa5]+\])*)?/g,
    // 格式2: **日文名** (中文名) [角色]
    /\*\*([^*]+)\*\*\s*\(([^/)]+)\)\s*(\[[\u4e00-\u9fa5]+\](?:\[[\u4e00-\u9fa5]+\])*)?/g,
  ]
  
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const japaneseName = match[1].trim()
      const chineseName = match[2].trim()
      const rolesStr = match[3] || ''
      
      // 提取角色标签
      const roles: string[] = []
      const rolePattern = /\[([\u4e00-\u9fa5]+)\]/g
      let roleMatch
      while ((roleMatch = rolePattern.exec(rolesStr)) !== null) {
        roles.push(roleMatch[1])
      }
      
      if (japaneseName && chineseName && !mapping.has(chineseName)) {
        mapping.set(chineseName, {
          name_jp: japaneseName,
          name_cn: chineseName,
          roles: roles
        })
      }
    }
  }
  
  return mapping
}

// 给解析结果添加日文名和角色
function enrichWithCardInfo(data: any, cardInfoMap: Map<string, CardInfo>): any {
  const enrichDeck = (deck: any[]) => {
    return deck.map(card => {
      const name = card.name || card.name_cn
      const info = cardInfoMap.get(name)
      return {
        ...card,
        name_cn: name,
        name_jp: info?.name_jp || card.name_jp || null,
        roles: info?.roles || card.roles || []
      }
    })
  }
  
  return {
    ...data,
    main_deck: enrichDeck(data.main_deck || []),
    extra_deck: enrichDeck(data.extra_deck || []),
    side_deck: enrichDeck(data.side_deck || [])
  }
}

// POST /api/decks/analyze - AI 分析文章
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, url } = body

    if (!text && !url) {
      return NextResponse.json({ error: '需要提供 text 或 url' }, { status: 400 })
    }

    let content = text
    
    // 如果提供了 URL，先抓取内容
    if (url && !text) {
      try {
        const fetchRes = await fetch(url)
        content = await fetchRes.text()
        // 简单提取文本（去掉 HTML 标签）
        content = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        if (content.length > 15000) {
          content = content.substring(0, 15000) + '...'
        }
      } catch (e) {
        return NextResponse.json({ error: '无法获取 URL 内容' }, { status: 400 })
      }
    }

    // 预提取卡片信息（英文名+角色）
    const cardInfoMap = extractCardInfo(content)
    console.log(`[Analyze] 提取到 ${cardInfoMap.size} 个卡片信息`)

    // 调用 Gemini 分析（使用 /analyze 端点，服务器内置 prompt）
    try {
      const geminiRes = await fetch(`${GEMINI_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content }),
      })

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json()
        
        if (geminiData.success && geminiData.data) {
          // 用预提取的卡片信息丰富解析结果
          const enrichedData = enrichWithCardInfo(geminiData.data, cardInfoMap)
          return NextResponse.json({ 
            success: true, 
            data: enrichedData,
            source: 'gemini',
            cards_found: cardInfoMap.size
          })
        } else {
          // AI 返回格式有问题
          return NextResponse.json({ 
            success: false, 
            error: geminiData.error || 'AI 返回格式无法解析',
            raw: geminiData.raw 
          })
        }
      }
    } catch (e) {
      console.error('Gemini service error:', e)
    }

    // Fallback: 简单的正则提取（备用方案）
    const fallbackResult = simpleParse(content)
    const enrichedFallback = enrichWithCardInfo(fallbackResult, cardInfoMap)
    return NextResponse.json({ 
      success: true, 
      data: enrichedFallback,
      source: 'fallback',
      warning: 'AI 服务不可用，使用简单解析',
      cards_found: cardInfoMap.size
    })

  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json({ error: '分析失败' }, { status: 500 })
  }
}

// 简单解析（Fallback）
function simpleParse(text: string): any {
  const result = {
    name: '导入的卡组',
    main_deck: [] as { name: string; count: number }[],
    extra_deck: [] as { name: string; count: number }[],
    side_deck: [] as { name: string; count: number }[],
    notes: {
      playstyle: '',
      combos: [],
      tech_choices: '',
      matchups: [],
      tips: []
    }
  }

  // 尝试提取卡名（简单模式：数字 + 卡名）
  const cardPattern = /(\d+)[x×\s]+([^\d\n]{2,30})/g
  let match
  while ((match = cardPattern.exec(text)) !== null) {
    const count = parseInt(match[1])
    const name = match[2].trim()
    if (count >= 1 && count <= 3 && name.length >= 2) {
      result.main_deck.push({ name, count })
    }
  }

  // 如果没找到，尝试另一种格式（卡名 x数字）
  if (result.main_deck.length === 0) {
    const altPattern = /([^\d\n]{2,30})[x×]\s*(\d+)/g
    while ((match = altPattern.exec(text)) !== null) {
      const name = match[1].trim()
      const count = parseInt(match[2])
      if (count >= 1 && count <= 3 && name.length >= 2) {
        result.main_deck.push({ name, count })
      }
    }
  }

  return result
}

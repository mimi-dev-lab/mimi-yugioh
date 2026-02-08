import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

interface MatchResult {
  original_name: string
  matched_id: number | null
  matched_name: string | null
  confidence: number  // 0-1
  match_type: 'exact' | 'alias' | 'fuzzy' | 'none'
}

// 规范化卡名（去掉空格、标点、转小写）
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[・·\-－—_\s]+/g, '')  // 去掉各种分隔符
    .replace(/[「」『』【】《》<>()（）\[\]]/g, '')  // 去掉括号
    .replace(/[！!？?。.、,，:：;；]/g, '')  // 去掉标点
    .trim()
}

interface CardInput {
  name?: string       // 向后兼容
  name_jp?: string    // 日文名（最优先）
  name_en?: string    // 英文名
  name_cn?: string    // 中文名（备用）
}

// POST /api/cards/match - 批量匹配卡名
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // 支持两种格式：{ names: string[] } 或 { cards: CardInput[] }
    const names = body.names as string[] | undefined
    const cards = body.cards as CardInput[] | undefined

    if (!names && !cards) {
      return NextResponse.json({ error: '需要提供 names 数组或 cards 数组' }, { status: 400 })
    }

    const results: MatchResult[] = []

    if (cards) {
      // 新格式：优先用日文名匹配
      for (const card of cards) {
        const result = await matchCardMultiLang(card.name_jp, card.name_en, card.name_cn || card.name)
        results.push(result)
      }
    } else if (names) {
      // 旧格式：只有中文名
      for (const name of names) {
        const result = await matchCard(name)
        results.push(result)
      }
    }

    return NextResponse.json({ matches: results })
  } catch (error) {
    console.error('Match error:', error)
    return NextResponse.json({ error: 'Match failed' }, { status: 500 })
  }
}

// 多语言匹配：日文名 > 英文名 > 中文名
async function matchCardMultiLang(nameJp?: string, nameEn?: string, nameCn?: string): Promise<MatchResult> {
  const displayName = nameCn || nameJp || nameEn || ''
  
  // 1. 优先用日文名精确匹配（最准确）
  if (nameJp) {
    const jpMatch = await searchByJapaneseName(nameJp)
    if (jpMatch) {
      return {
        original_name: displayName,
        matched_id: jpMatch.id,
        matched_name: jpMatch.name_cn || jpMatch.name_jp,
        confidence: 1.0,
        match_type: 'exact'
      }
    }
  }
  
  // 2. 日文名匹配失败，尝试英文名
  if (nameEn) {
    const enMatch = await searchByEnglishName(nameEn)
    if (enMatch) {
      return {
        original_name: displayName,
        matched_id: enMatch.id,
        matched_name: enMatch.name_cn || enMatch.name_en,
        confidence: 0.95,
        match_type: 'exact'
      }
    }
  }
  
  // 3. 回退到中文名匹配
  if (nameCn) {
    return await matchCard(nameCn)
  }
  
  // 4. 都没有则返回未匹配
  return {
    original_name: displayName,
    matched_id: null,
    matched_name: null,
    confidence: 0,
    match_type: 'none'
  }
}

// 规范化日文名（去掉中点、空格等）
function normalizeJapaneseName(name: string): string {
  return name
    .replace(/[・･\s－\-]/g, '')  // 去掉中点、空格、连字符
    .trim()
}

// 日文名搜索
async function searchByJapaneseName(nameJp: string): Promise<any | null> {
  // 1. 先尝试精确匹配
  const exactResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/cards?name_jp=eq.${encodeURIComponent(nameJp)}&select=id,name_cn,name_jp,name_en&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  )
  
  if (exactResponse.ok) {
    const data = await exactResponse.json()
    if (data.length > 0) return data[0]
  }
  
  // 2. 去掉中点后精确匹配
  const normalizedJp = normalizeJapaneseName(nameJp)
  if (normalizedJp !== nameJp) {
    const normalizedResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/cards?name_jp=eq.${encodeURIComponent(normalizedJp)}&select=id,name_cn,name_jp,name_en&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    
    if (normalizedResponse.ok) {
      const data = await normalizedResponse.json()
      if (data.length > 0) return data[0]
    }
  }
  
  // 3. 提取关键词进行模糊匹配（去掉系列前缀）
  const keywords = nameJp
    .replace(/^[A-Z][-・]HERO\s*/i, '')  // 去掉 D-HERO 等前缀
    .split(/[・･\s－\-]+/)
    .filter(k => k.length >= 2)
  
  if (keywords.length >= 1) {
    const keywordQuery = keywords.map(k => `name_jp.ilike.*${encodeURIComponent(k)}*`).join(',')
    const fuzzyResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/cards?and=(${keywordQuery})&select=id,name_cn,name_jp,name_en&limit=5`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    
    if (fuzzyResponse.ok) {
      const data = await fuzzyResponse.json()
      if (data.length > 0) return data[0]
    }
  }
  
  return null
}

// 优先使用英文名匹配（保留兼容）
async function matchCardWithEnglish(nameEn?: string, nameCn?: string): Promise<MatchResult> {
  const displayName = nameCn || nameEn || ''
  
  // 1. 优先用英文名精确匹配
  if (nameEn) {
    const englishMatch = await searchByEnglishName(nameEn)
    if (englishMatch) {
      return {
        original_name: displayName,
        matched_id: englishMatch.id,
        matched_name: englishMatch.name_cn || englishMatch.name_en,
        confidence: 1.0,
        match_type: 'exact'
      }
    }
  }
  
  // 2. 如果英文名匹配失败，回退到中文名匹配
  if (nameCn) {
    return await matchCard(nameCn)
  }
  
  // 3. 都没有则返回未匹配
  return {
    original_name: displayName,
    matched_id: null,
    matched_name: null,
    confidence: 0,
    match_type: 'none'
  }
}

// HERO 系列英文缩写映射
const HERO_ABBREVIATIONS: Record<string, string> = {
  'M-HERO': 'Masked HERO',
  'M・HERO': 'Masked HERO',
  'X-HERO': 'Xtra HERO',
  'X・HERO': 'Xtra HERO',
  'D-HERO': 'Destiny HERO',
  'D・HERO': 'Destiny HERO',
  'E-HERO': 'Elemental HERO',
  'E・HERO': 'Elemental HERO',
  'V-HERO': 'Vision HERO',
  'V・HERO': 'Vision HERO',
  'C-HERO': 'Contrast HERO',
  'C・HERO': 'Contrast HERO',
}

// HERO 系列中文缩写映射（民间翻译 → 官方翻译）
const HERO_CN_ABBREVIATIONS: Record<string, string> = {
  'M・HERO': '假面－英雄',
  'M-HERO': '假面－英雄',
  'X・HERO': '特异－英雄',
  'X-HERO': '特异－英雄',
  'D・HERO': '命运－英雄',
  'D-HERO': '命运－英雄',
  'E・HERO': '元素－英雄',
  'E-HERO': '元素－英雄',
  'V・HERO': '幻视－英雄',
  'V-HERO': '幻视－英雄',
  'C・HERO': '对极－英雄',
  'C-HERO': '对极－英雄',
}

// 展开中文 HERO 缩写
function expandHeroCnAbbreviation(name: string): string {
  for (const [abbr, full] of Object.entries(HERO_CN_ABBREVIATIONS)) {
    if (name.includes(abbr)) {
      return name.replace(abbr, full)
    }
  }
  return name
}

// 展开 HERO 缩写
function expandHeroAbbreviation(name: string): string {
  for (const [abbr, full] of Object.entries(HERO_ABBREVIATIONS)) {
    if (name.startsWith(abbr)) {
      return name.replace(abbr, full)
    }
  }
  return name
}

// 英文名搜索
async function searchByEnglishName(nameEn: string): Promise<any | null> {
  // 先展开 HERO 缩写
  const expandedName = expandHeroAbbreviation(nameEn)
  const searchNames = expandedName !== nameEn ? [expandedName, nameEn] : [nameEn]
  
  for (const searchName of searchNames) {
    // 尝试精确匹配
    const exactResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/cards?name_en=ilike.${encodeURIComponent(searchName)}&select=id,name_cn,name_jp,name_en&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    
    if (exactResponse.ok) {
      const data = await exactResponse.json()
      if (data.length > 0) return data[0]
    }
  }
  
  // 尝试模糊匹配（用展开后的名字）
  const fuzzyResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/cards?name_en=ilike.*${encodeURIComponent(expandedName)}*&select=id,name_cn,name_jp,name_en&limit=5`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  )
  
  if (fuzzyResponse.ok) {
    const data = await fuzzyResponse.json()
    if (data.length > 0) {
      // 找最匹配的
      for (const card of data) {
        const cardNameLower = card.name_en.toLowerCase()
        const expandedLower = expandedName.toLowerCase()
        const originalLower = nameEn.toLowerCase()
        
        if (cardNameLower === expandedLower || cardNameLower === originalLower) {
          return card
        }
        // 处理 "The XXX" vs "XXX" 的情况
        const cardNoThe = cardNameLower.replace(/^the\s+/i, '')
        const searchNoThe = expandedLower.replace(/^the\s+/i, '')
        if (cardNoThe === searchNoThe) {
          return card
        }
      }
      return data[0] // 返回第一个模糊匹配
    }
  }
  
  return null
}

async function matchCard(originalName: string): Promise<MatchResult> {
  const normalized = normalizeName(originalName)
  
  // 0. 展开中文 HERO 缩写
  const expandedCnName = expandHeroCnAbbreviation(originalName)
  const searchNames = expandedCnName !== originalName ? [originalName, expandedCnName] : [originalName]
  
  // 1. 精确匹配（中文/日文/英文卡名）- 包括展开后的名字
  for (const searchName of searchNames) {
    const exactMatch = await searchExact(searchName)
    if (exactMatch) {
      return {
        original_name: originalName,
        matched_id: exactMatch.id,
        matched_name: exactMatch.name_cn || exactMatch.name_jp || exactMatch.name_en,
        confidence: 1.0,
        match_type: 'exact'
      }
    }
  }

  // 2. 别名库匹配（包含部分匹配）
  const aliasMatch = await searchAlias(normalized, originalName)
  if (aliasMatch) {
    return {
      original_name: originalName,
      matched_id: aliasMatch.id,
      matched_name: aliasMatch.name_cn || aliasMatch.name_jp || aliasMatch.name_en,
      confidence: 0.95,
      match_type: 'alias'
    }
  }

  // 3. 系列别名替换匹配
  const seriesMatch = await searchWithSeriesAlias(originalName)
  if (seriesMatch) {
    return {
      original_name: originalName,
      matched_id: seriesMatch.id,
      matched_name: seriesMatch.name_cn || seriesMatch.name_jp || seriesMatch.name_en,
      confidence: 0.9,
      match_type: 'alias'
    }
  }

  // 4. 模糊匹配（规范化后比较）
  const fuzzyMatch = await searchFuzzy(normalized, originalName)
  if (fuzzyMatch) {
    return {
      original_name: originalName,
      matched_id: fuzzyMatch.id,
      matched_name: fuzzyMatch.name_cn || fuzzyMatch.name_jp || fuzzyMatch.name_en,
      confidence: fuzzyMatch.confidence,
      match_type: 'fuzzy'
    }
  }

  // 5. 未匹配（英文名匹配是更好的方案，在上层处理）
  return {
    original_name: originalName,
    matched_id: null,
    matched_name: null,
    confidence: 0,
    match_type: 'none'
  }
}

// 精确匹配
async function searchExact(name: string): Promise<any | null> {
  // 先尝试精确匹配
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/cards?or=(name_cn.eq.${encodeURIComponent(name)},name_jp.eq.${encodeURIComponent(name)},name_en.ilike.${encodeURIComponent(name)})&select=id,name_cn,name_jp,name_en&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  )
  
  if (response.ok) {
    const data = await response.json()
    if (data.length > 0) return data[0]
  }
  
  // 尝试用关键词进行 ILIKE 模糊匹配
  // 提取关键词（去掉系列前缀，分割连字符）
  const keywords = name
    .replace(/^[A-Z][-・]HERO\s*/i, '')  // 去掉 E・HERO 等前缀
    .replace(/^(假面|特异|命运|元素|幻视|对极)[－-]英雄\s*/i, '')  // 去掉中文前缀
    .split(/[-－・\s]+/)
    .filter(k => k.length >= 2)
  
  if (keywords.length >= 2) {
    // 用关键词构建搜索条件
    const keywordQuery = keywords.map(k => `name_cn.ilike.*${encodeURIComponent(k)}*`).join(',')
    const fuzzyResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/cards?and=(${keywordQuery})&select=id,name_cn,name_jp,name_en&limit=5`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    
    if (fuzzyResponse.ok) {
      const data = await fuzzyResponse.json()
      if (data.length === 1) return data[0]  // 唯一匹配
      if (data.length > 1) {
        // 多个结果时，找包含所有关键词的
        for (const card of data) {
          const cardName = (card.name_cn || '').toLowerCase()
          if (keywords.every(k => cardName.includes(k.toLowerCase()))) {
            return card
          }
        }
        return data[0]  // 返回第一个
      }
    }
  }
  
  return null
}

// 别名匹配（支持精确和部分匹配）
async function searchAlias(normalizedName: string, originalName: string): Promise<any | null> {
  // 先尝试精确匹配
  const exactResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/card_aliases?alias=eq.${encodeURIComponent(normalizedName)}&select=card_id,cards(id,name_cn,name_jp,name_en)`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  )
  
  if (exactResponse.ok) {
    const data = await exactResponse.json()
    if (data.length > 0 && data[0].cards) {
      return data[0].cards
    }
  }
  
  // 再尝试部分匹配（别名包含搜索词）
  const partialResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/card_aliases?alias=ilike.*${encodeURIComponent(normalizedName)}*&select=card_id,cards(id,name_cn,name_jp,name_en)&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  )
  
  if (partialResponse.ok) {
    const data = await partialResponse.json()
    if (data.length > 0 && data[0].cards) {
      return data[0].cards
    }
  }
  
  return null
}

// 系列别名替换匹配
async function searchWithSeriesAlias(originalName: string): Promise<any | null> {
  // 获取所有系列别名
  const aliasResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/series_aliases?select=alias_prefix,official_prefix`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  )
  
  if (!aliasResponse.ok) return null
  const aliases = await aliasResponse.json()
  
  // 尝试每个系列别名替换
  for (const { alias_prefix, official_prefix } of aliases) {
    if (originalName.includes(alias_prefix)) {
      // 替换系列前缀
      let converted = originalName.replace(alias_prefix, official_prefix)
      
      // 提取搜索关键词（分割名字部分）
      const parts = originalName.replace(alias_prefix, '').split(/[\s的之・・－-]+/).filter(p => p.length > 0)
      
      // 同时尝试「的」→「之」替换
      const variants = [
        converted,
        converted.replace(/的/g, '之'),
        converted.replace(/之/g, '的'),
      ]
      
      for (const variant of variants) {
        // 构建搜索条件：系列前缀 + 关键词
        let searchConditions = [`name_cn.ilike.*${encodeURIComponent(official_prefix)}*`]
        
        // 如果有额外关键词，添加到搜索条件
        if (parts.length > 0) {
          // 搜索包含系列前缀 AND 包含任一关键词的卡
          const keywordCondition = parts.map(p => `name_cn.ilike.*${encodeURIComponent(p)}*`).join(',')
          
          const cardResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/cards?name_cn=ilike.*${encodeURIComponent(official_prefix)}*&or=(${keywordCondition})&select=id,name_cn,name_jp,name_en&limit=10`,
            {
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
              },
            }
          )
          
          if (cardResponse.ok) {
            const cards = await cardResponse.json()
            if (cards.length > 0) {
              // 找最匹配的（包含最多关键词的）
              let bestMatch = cards[0]
              let bestScore = 0
              
              for (const card of cards) {
                const cardName = (card.name_cn || '').toLowerCase()
                let matchedParts = 0
                for (const part of parts) {
                  if (cardName.includes(part.toLowerCase())) {
                    matchedParts++
                  }
                }
                // 评分 = 关键词匹配数 / 总关键词数 + 名称相似度
                const partScore = matchedParts / parts.length
                const simScore = calculateSimilarity(normalizeName(variant), normalizeName(cardName))
                const totalScore = partScore * 0.7 + simScore * 0.3
                
                if (totalScore > bestScore) {
                  bestScore = totalScore
                  bestMatch = card
                }
              }
              
              if (bestScore > 0.3) {
                return bestMatch
              }
            }
          }
        }
      }
    }
  }
  
  return null
}

// 模糊匹配
async function searchFuzzy(normalized: string, original: string): Promise<any | null> {
  // 尝试 LIKE 搜索
  const searchTerms = [original, normalized]
  
  for (const term of searchTerms) {
    if (term.length < 2) continue
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/cards?or=(name_cn.ilike.*${encodeURIComponent(term)}*,name_jp.ilike.*${encodeURIComponent(term)}*,name_en.ilike.*${encodeURIComponent(term)}*)&select=id,name_cn,name_jp,name_en&limit=5`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    
    if (!response.ok) continue
    const data = await response.json()
    
    if (data.length > 0) {
      // 计算置信度（基于名称相似度）
      const best = data[0]
      const bestName = (best.name_cn || best.name_jp || best.name_en || '').toLowerCase()
      const similarity = calculateSimilarity(normalized, normalizeName(bestName))
      
      if (similarity > 0.5) {
        return { ...best, confidence: similarity }
      }
    }
  }
  
  return null
}

// 改进的相似度计算（考虑子串匹配和字符重叠）
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1.0
  if (!a || !b) return 0
  
  // 如果一个完全包含另一个，给高分
  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length < b.length ? a : b
    const longer = a.length >= b.length ? a : b
    return 0.7 + (0.3 * shorter.length / longer.length)
  }
  
  // 计算最长公共子串
  let maxCommon = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) {
        k++
      }
      maxCommon = Math.max(maxCommon, k)
    }
  }
  
  // 基于最长公共子串的相似度
  const lcsScore = maxCommon / Math.max(a.length, b.length)
  
  // Jaccard 相似度
  const setA = new Set(a.split(''))
  const setB = new Set(b.split(''))
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  const jaccardScore = intersection.size / union.size
  
  // 综合分数（偏重子串匹配）
  return lcsScore * 0.6 + jaccardScore * 0.4
}

// GET /api/cards/match?name=xxx - 单个匹配
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')
  
  if (!name) {
    return NextResponse.json({ error: '需要提供 name 参数' }, { status: 400 })
  }
  
  const result = await matchCard(name)
  return NextResponse.json(result)
}

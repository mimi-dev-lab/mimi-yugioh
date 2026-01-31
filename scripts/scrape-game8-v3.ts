/**
 * Game8 卡组抓取脚本 v3
 * 使用 markdown 格式解析，更精准
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 测试用的3个卡组URL
const TEST_URLS = [
  'https://game8.jp/yugioh-masterduel/656291',  // 白き森
  'https://game8.jp/yugioh-masterduel/657387',  // 白き森センチュリオン  
  'https://game8.jp/yugioh-masterduel/424027',  // 電脳堺
]

interface DeckCard {
  name_jp: string
  count: number
}

interface ComboStep {
  num: string
  text: string
}

interface ContentBlock {
  type: 'text' | 'heading' | 'cards' | 'table' | 'steps' | 'board' | 'list'
  content?: string
  items?: string[]
  cards?: string[]
  steps?: ComboStep[]
  rows?: Record<string, string>[]
}

interface Section {
  title: string
  blocks: ContentBlock[]
}

interface DeckData {
  id: string
  name_jp: string
  source_url: string
  
  evaluation: {
    tier: string
    deck_type: string
    difficulty: string
    cost: string
    features: string[]
  }
  
  recipe: {
    main_deck: DeckCard[]
    extra_deck: DeckCard[]
  }
  
  sections: Section[]
  
  scraped_at: string
}

async function fetchMarkdown(url: string): Promise<{ text: string; title: string }> {
  // 使用类似 web_fetch 的方式获取 markdown
  const response = await fetch(url)
  const html = await response.text()
  
  // 简单提取标题
  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  const title = titleMatch ? titleMatch[1] : ''
  
  // 使用 readability 风格提取 - 这里简化处理，直接返回原始响应
  return { text: html, title }
}

function extractDeckId(url: string): string {
  const match = url.match(/\/(\d+)$/)
  return match ? `game8-${match[1]}` : `game8-${Date.now()}`
}

function parseMarkdownContent(text: string, url: string): DeckData {
  const id = extractDeckId(url)
  
  // 提取标题
  const titleMatch = text.match(/【マスターデュエル】(.+?)(?:のレシピ|デッキ)/)
  const name_jp = titleMatch ? titleMatch[1] + 'デッキ' : '不明デッキ'
  
  // 评价
  const evaluation = {
    tier: '',
    deck_type: '',
    difficulty: '',
    cost: '',
    features: [] as string[]
  }
  
  // Tier
  const tierMatch = text.match(/(Tier\d+|ランク外)/)
  if (tierMatch) evaluation.tier = tierMatch[1]
  
  // デッキタイプ
  if (text.includes('展開型')) evaluation.deck_type = '展開型'
  else if (text.includes('コントロール型')) evaluation.deck_type = 'コントロール型'
  else if (text.includes('ビート型')) evaluation.deck_type = 'ビート型'
  
  // 難易度
  if (text.includes('難しい')) evaluation.difficulty = '難しい'
  else if (text.includes('普通')) evaluation.difficulty = '普通'
  else if (text.includes('簡単')) evaluation.difficulty = '簡単'
  
  // コスト
  const costMatch = text.match(/生成コスト[^\n]*?(高|中|低)/)
  if (costMatch) evaluation.cost = costMatch[1]
  
  // 解说要点
  const featuresMatch = text.match(/★.+?の解説★\s*([\s\S]*?)(?=メインデッキ|レシピ|$)/i)
  if (featuresMatch) {
    const lines = featuresMatch[1].split('\n')
      .map(l => l.trim())
      .filter(l => l && l.length > 5 && l.length < 100 && !l.includes('http'))
    evaluation.features = lines.slice(0, 5)
  }
  
  // 卡组配方 - 更精确的解析
  const recipe = {
    main_deck: [] as DeckCard[],
    extra_deck: [] as DeckCard[]
  }
  
  // 查找卡表区域
  // 格式1: [カード名](url) 数量
  // 格式2: カード名 数量
  
  const mainDeckMatch = text.match(/メインデッキ[（\(]?(\d+)枚?[）\)]?([\s\S]*?)(?=エクストラデッキ|EX|$)/i)
  const extraDeckMatch = text.match(/エクストラデッキ[（\(]?(\d+)枚?[）\)]?([\s\S]*?)(?=モンスター|魔法|罠|関連|$)/i)
  
  function parseCardList(content: string): DeckCard[] {
    const cards: DeckCard[] = []
    const seen = new Set<string>()
    
    // 匹配 [カード名](url) 后面跟着数量
    const pattern1 = /\[([^\]]+)\]\([^)]+\)\s*(\d+)?/g
    let match
    while ((match = pattern1.exec(content)) !== null) {
      const name = match[1].trim()
      const count = match[2] ? parseInt(match[2]) : 1
      
      // 过滤无效卡名
      if (name && name.length > 1 && name.length < 40 && 
          !name.includes('▶') && !name.includes('デッキ') &&
          !seen.has(name)) {
        seen.add(name)
        cards.push({ name_jp: name, count })
      }
    }
    
    // 匹配表格行格式：カード名 数量
    const tablePattern = /\[([^\]]+)\]\([^)]+\)\s*\n(\d+)/g
    while ((match = tablePattern.exec(content)) !== null) {
      const name = match[1].trim()
      const count = parseInt(match[2])
      const existing = cards.find(c => c.name_jp === name)
      if (existing) {
        existing.count = count
      }
    }
    
    return cards
  }
  
  if (mainDeckMatch) {
    recipe.main_deck = parseCardList(mainDeckMatch[2])
  }
  
  if (extraDeckMatch) {
    recipe.extra_deck = parseCardList(extraDeckMatch[2])
  }
  
  // Sections - 提取所有内容区块
  const sections: Section[] = []
  
  // 定义要提取的主要区块
  const sectionPatterns = [
    { title: '基礎知識', pattern: /基礎知識([\s\S]*?)(?=回し方|基本展開|対策|関連|$)/i },
    { title: '回し方', pattern: /回し方[のまとめ]*([\s\S]*?)(?=基本展開|対策|関連|$)/i },
    { title: '基本展開', pattern: /基本展開([\s\S]*?)(?=対策|手札誘発|関連|$)/i },
    { title: '対策と手札誘発', pattern: /対策[と手札誘発のタイミング]*([\s\S]*?)(?=関連|おすすめ|$)/i },
  ]
  
  for (const { title, pattern } of sectionPatterns) {
    const match = text.match(pattern)
    if (match) {
      const content = match[1]
      const blocks = parseContentBlocks(content)
      if (blocks.length > 0) {
        sections.push({ title, blocks })
      }
    }
  }
  
  return {
    id,
    name_jp,
    source_url: url,
    evaluation,
    recipe,
    sections,
    scraped_at: new Date().toISOString()
  }
}

function parseContentBlocks(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  
  // 分割成段落
  const paragraphs = content.split(/\n\n+/)
  
  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed || trimmed.length < 5) continue
    
    // 过滤广告和无关内容
    if (trimmed.includes('http') && trimmed.length < 50) continue
    if (trimmed.match(/^\d+\/\d+/)) continue // 日期
    if (trimmed.includes('広告') || trimmed.includes('PR')) continue
    
    // 检测展开步骤表格
    if (trimmed.includes('手順') && trimmed.includes('詳細')) {
      const steps = parseStepsTable(trimmed)
      if (steps.length > 0) {
        blocks.push({ type: 'steps', steps })
        continue
      }
    }
    
    // 检测普通表格
    if (trimmed.includes('|') || (trimmed.match(/\n.*\n.*\n/) && trimmed.includes('\t'))) {
      const rows = parseTable(trimmed)
      if (rows.length > 0) {
        blocks.push({ type: 'table', rows })
        continue
      }
    }
    
    // 检测列表
    if (trimmed.match(/^[-•]\s/m)) {
      const items = trimmed.split('\n')
        .filter(l => l.match(/^[-•]\s/))
        .map(l => l.replace(/^[-•]\s*/, '').trim())
      if (items.length > 0) {
        blocks.push({ type: 'list', items })
        continue
      }
    }
    
    // 检测卡牌引用
    const cardRefs = trimmed.match(/\[([^\]]+)\]\([^)]+\)/g)
    if (cardRefs && cardRefs.length >= 3) {
      const cards = cardRefs.map(ref => {
        const m = ref.match(/\[([^\]]+)\]/)
        return m ? m[1] : ''
      }).filter(c => c && c.length < 30)
      if (cards.length > 0) {
        blocks.push({ type: 'cards', cards })
      }
    }
    
    // 普通文本段落
    // 清理 markdown 链接，只保留文字
    const cleanText = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/[^\s]+/g, '')
      .trim()
    
    if (cleanText.length > 10 && cleanText.length < 2000) {
      blocks.push({ type: 'text', content: cleanText })
    }
  }
  
  return blocks
}

function parseStepsTable(text: string): ComboStep[] {
  const steps: ComboStep[] = []
  
  // 匹配 ①②③ 格式
  const circlePattern = /([①②③④⑤⑥⑦⑧⑨⑩])\s*([\s\S]*?)(?=[①②③④⑤⑥⑦⑧⑨⑩]|$)/g
  let match
  while ((match = circlePattern.exec(text)) !== null) {
    const num = match[1]
    const detail = match[2].trim().replace(/\n/g, ' ').slice(0, 500)
    if (detail.length > 5) {
      steps.push({ num, text: detail })
    }
  }
  
  // 如果没找到圆圈数字，尝试普通数字
  if (steps.length === 0) {
    const numPattern = /(\d+)[\.、]\s*([\s\S]*?)(?=\d+[\.、]|$)/g
    while ((match = numPattern.exec(text)) !== null) {
      const num = match[1]
      const detail = match[2].trim().replace(/\n/g, ' ').slice(0, 500)
      if (detail.length > 5) {
        steps.push({ num, text: detail })
      }
    }
  }
  
  return steps
}

function parseTable(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  const lines = text.split('\n').filter(l => l.trim())
  
  for (const line of lines) {
    if (line.includes('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c)
      if (cells.length >= 2) {
        rows.push({ col1: cells[0], col2: cells[1], col3: cells[2] || '' })
      }
    }
  }
  
  return rows
}

async function scrapeDeckFromWebFetch(url: string): Promise<DeckData> {
  console.log(`📥 抓取: ${url}`)
  
  // 使用 fetch 获取页面，然后手动处理
  // 实际上我们应该用之前 web_fetch 得到的 markdown
  // 这里模拟那个过程
  
  const response = await fetch(url)
  const html = await response.text()
  
  // 提取纯文本（简化的 readability）
  let text = html
    // 移除 script 和 style
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // 将链接转为 markdown 格式
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)')
    // 移除其他标签
    .replace(/<[^>]+>/g, '\n')
    // 清理多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  
  const data = parseMarkdownContent(text, url)
  console.log(`✅ 完成: ${data.name_jp}`)
  console.log(`   - Main: ${data.recipe.main_deck.length}, Extra: ${data.recipe.extra_deck.length}`)
  console.log(`   - Sections: ${data.sections.length}`)
  
  return data
}

async function main() {
  const outputDir = path.join(__dirname, '../data/decks-raw')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  
  const results: DeckData[] = []
  
  for (const url of TEST_URLS) {
    try {
      const data = await scrapeDeckFromWebFetch(url)
      results.push(data)
      
      // 保存单个文件
      const filePath = path.join(outputDir, `${data.id}.json`)
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
      console.log(`💾 已保存: ${filePath}\n`)
      
      // 避免请求过快
      await new Promise(r => setTimeout(r, 500))
    } catch (err) {
      console.error(`❌ 抓取失败: ${url}`, err)
    }
  }
  
  console.log(`\n📋 共抓取 ${results.length} 个卡组`)
}

main().catch(console.error)

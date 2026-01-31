/**
 * Game8 卡组完整抓取脚本 v2
 * 100% 抓取所有内容，动态 sections 结构
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as cheerio from 'cheerio'

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
  num: number
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
  
  related_decks: { name: string, url: string }[]
  
  scraped_at: string
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url)
  return response.text()
}

function extractDeckId(url: string): string {
  const match = url.match(/\/(\d+)$/)
  return match ? `game8-${match[1]}` : `game8-${Date.now()}`
}

function parseDeckPage(html: string, url: string): DeckData {
  const $ = cheerio.load(html)
  
  const id = extractDeckId(url)
  
  // 标题
  const titleMatch = $('title').text().match(/【マスターデュエル】(.+?)のレシピ/)
  const name_jp = titleMatch ? titleMatch[1] : $('h1').first().text().trim()
  
  // 评价区
  const evaluation = {
    tier: '',
    deck_type: '',
    difficulty: '',
    cost: '',
    features: [] as string[]
  }
  
  // 查找评价信息
  const evalText = $('body').text()
  
  // Tier
  const tierMatch = evalText.match(/(Tier\d+|ランク外)/)
  if (tierMatch) evaluation.tier = tierMatch[1]
  
  // 查找デッキタイプ、難易度、生成コスト的表格
  $('table').each((_, table) => {
    const text = $(table).text()
    if (text.includes('デッキタイプ') || text.includes('プレイ難易度')) {
      $(table).find('td').each((i, td) => {
        const cellText = $(td).text().trim()
        if (cellText.includes('型')) evaluation.deck_type = cellText
        if (['難しい', '普通', '簡単'].includes(cellText)) evaluation.difficulty = cellText
        if (['高', '中', '低'].includes(cellText)) evaluation.cost = cellText
      })
    }
  })
  
  // 解说要点 (★...★ 内的内容)
  $('body').text().replace(/★(.+?)の解説★([\s\S]*?)(?=メインデッキ|$)/, (_, __, content) => {
    const lines = content.trim().split('\n').filter((l: string) => l.trim() && !l.includes('http'))
    evaluation.features = lines.slice(0, 5).map((l: string) => l.trim())
    return ''
  })
  
  // 卡组配方
  const recipe = {
    main_deck: [] as DeckCard[],
    extra_deck: [] as DeckCard[]
  }
  
  // 解析卡表
  let currentDeck: 'main' | 'extra' = 'main'
  
  $('a').each((_, el) => {
    const href = $(el).attr('href') || ''
    const text = $(el).text().trim()
    
    // 检测是否是卡牌链接
    if (href.includes('/yugioh-masterduel/') && !href.includes('game8.jp/yugioh-masterduel/4') && text && !text.includes('▶')) {
      // 排除导航链接
      if (text.length > 1 && text.length < 50 && !text.includes('デッキ') && !text.includes('ランキング')) {
        // 检查是否在エクストラ区域
        const parentText = $(el).parents().slice(0, 5).text()
        if (parentText.includes('エクストラデッキ') || parentText.includes('EX')) {
          currentDeck = 'extra'
        }
        
        // 查找数量 (通常在旁边)
        let count = 1
        const nextText = $(el).parent().text()
        const countMatch = nextText.match(/(\d+)枚?$/) || nextText.match(/x(\d+)/)
        if (countMatch) count = parseInt(countMatch[1])
        
        const deck = currentDeck === 'main' ? recipe.main_deck : recipe.extra_deck
        
        // 避免重复
        const existing = deck.find(c => c.name_jp === text)
        if (!existing && text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/)) {
          deck.push({ name_jp: text, count })
        }
      }
    }
  })
  
  // Sections - 动态提取所有内容区块
  const sections: Section[] = []
  
  // 主要内容区域的标题标识
  const sectionTitles = [
    '基礎知識', '回し方', '基本展開', '展開例', '対策', '手札誘発', 
    '採用カード', '入れ替え候補', '相性', 'コンボ', '立ち回り'
  ]
  
  // 查找所有 h2, h3, h4 标题并提取其后的内容
  $('h2, h3, h4, .a-header, [class*="heading"]').each((_, heading) => {
    const title = $(heading).text().trim()
    
    // 过滤掉无关标题
    if (!title || title.includes('関連') || title.includes('広告') || title.includes('おすすめ')) {
      return
    }
    
    // 检查是否是我们关心的内容
    const isRelevant = sectionTitles.some(t => title.includes(t)) || 
                       title.includes('デッキ') ||
                       title.includes('カード') ||
                       title.includes('展開') ||
                       title.includes('召喚')
    
    if (!isRelevant && !title.match(/[\u3040-\u309F\u30A0-\u30FF]/)) {
      return
    }
    
    const blocks: ContentBlock[] = []
    
    // 获取该标题后的所有内容直到下一个同级标题
    let current = $(heading).next()
    while (current.length && !current.is('h2, h3, h4, .a-header')) {
      const tagName = current.prop('tagName')?.toLowerCase()
      const text = current.text().trim()
      
      if (!text || text.length < 2) {
        current = current.next()
        continue
      }
      
      // 处理表格 (展开步骤等)
      if (tagName === 'table') {
        const rows: Record<string, string>[] = []
        const headers: string[] = []
        
        current.find('th').each((_, th) => {
          headers.push($(th).text().trim())
        })
        
        current.find('tr').each((_, tr) => {
          const cells = $(tr).find('td')
          if (cells.length > 0) {
            const row: Record<string, string> = {}
            cells.each((i, td) => {
              const key = headers[i] || `col${i}`
              row[key] = $(td).text().trim()
            })
            if (Object.values(row).some(v => v)) {
              rows.push(row)
            }
          }
        })
        
        if (rows.length > 0) {
          // 检测是否是展开步骤
          if (headers.includes('手順') || headers.includes('詳細')) {
            const steps: ComboStep[] = rows.map((row, i) => ({
              num: i + 1,
              text: row['詳細'] || row['col1'] || Object.values(row).join(' ')
            }))
            blocks.push({ type: 'steps', steps })
          } else {
            blocks.push({ type: 'table', rows })
          }
        }
      }
      // 处理列表
      else if (tagName === 'ul' || tagName === 'ol') {
        const items: string[] = []
        current.find('li').each((_, li) => {
          const liText = $(li).text().trim()
          if (liText) items.push(liText)
        })
        if (items.length > 0) {
          blocks.push({ type: 'list', items })
        }
      }
      // 处理段落和其他文本
      else if (text && text.length > 5) {
        // 检查是否包含卡牌列表
        const cardLinks = current.find('a[href*="/yugioh-masterduel/"]')
        if (cardLinks.length > 2) {
          const cards: string[] = []
          cardLinks.each((_, a) => {
            const cardName = $(a).text().trim()
            if (cardName && cardName.length < 30) {
              cards.push(cardName)
            }
          })
          if (cards.length > 0) {
            blocks.push({ type: 'cards', cards })
          }
        }
        
        // 过滤掉纯链接文本
        if (!text.startsWith('http') && !text.match(/^[\d\/]+$/)) {
          blocks.push({ type: 'text', content: text })
        }
      }
      
      current = current.next()
    }
    
    if (blocks.length > 0) {
      sections.push({ title, blocks })
    }
  })
  
  // 特别处理：展开盤面
  const boardSection = extractBoardInfo($)
  if (boardSection) {
    // 找到合适的位置插入
    const expandIndex = sections.findIndex(s => s.title.includes('展開'))
    if (expandIndex >= 0) {
      sections[expandIndex].blocks.unshift(...boardSection)
    } else {
      sections.push({ title: '展開盤面', blocks: boardSection })
    }
  }
  
  // 相关卡组
  const related_decks: { name: string, url: string }[] = []
  $('a[href*="/yugioh-masterduel/"]').each((_, a) => {
    const href = $(a).attr('href') || ''
    const text = $(a).text().trim()
    if (text.includes('デッキ') || (text.length < 20 && href.match(/\/\d{6}$/))) {
      if (!related_decks.find(d => d.name === text)) {
        related_decks.push({ 
          name: text, 
          url: href.startsWith('http') ? href : `https://game8.jp${href}` 
        })
      }
    }
  })
  
  return {
    id,
    name_jp,
    source_url: url,
    evaluation,
    recipe,
    sections,
    related_decks: related_decks.slice(0, 10),
    scraped_at: new Date().toISOString()
  }
}

function extractBoardInfo($: cheerio.CheerioAPI): ContentBlock[] | null {
  const blocks: ContentBlock[] = []
  
  // 查找展開盤面相关内容
  const pageText = $('body').text()
  
  // 必要なカード
  const requiredMatch = pageText.match(/必要なカード[：:\s]*([\s\S]*?)(?=作り出せる|結果|$)/)
  if (requiredMatch) {
    blocks.push({ type: 'text', content: `必要なカード: ${requiredMatch[1].trim().slice(0, 200)}` })
  }
  
  // 作り出せる盤面
  const resultMatch = pageText.match(/作り出せる盤面[：:\s]*([\s\S]*?)(?=手順|$)/)
  if (resultMatch) {
    blocks.push({ type: 'text', content: `作り出せる盤面: ${resultMatch[1].trim().slice(0, 300)}` })
  }
  
  return blocks.length > 0 ? blocks : null
}

async function scrapeDeck(url: string): Promise<DeckData> {
  console.log(`📥 抓取: ${url}`)
  const html = await fetchPage(url)
  const data = parseDeckPage(html, url)
  console.log(`✅ 完成: ${data.name_jp} (${data.recipe.main_deck.length} main, ${data.recipe.extra_deck.length} extra, ${data.sections.length} sections)`)
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
      const data = await scrapeDeck(url)
      results.push(data)
      
      // 保存单个文件
      const filePath = path.join(outputDir, `${data.id}.json`)
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
      console.log(`💾 已保存: ${filePath}`)
      
      // 避免请求过快
      await new Promise(r => setTimeout(r, 500))
    } catch (err) {
      console.error(`❌ 抓取失败: ${url}`, err)
    }
  }
  
  // 保存汇总
  const summaryPath = path.join(outputDir, '_summary.json')
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`\n📋 汇总已保存: ${summaryPath}`)
  console.log(`共抓取 ${results.length} 个卡组`)
}

main().catch(console.error)

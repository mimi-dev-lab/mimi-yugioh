/**
 * Game8 完整 Markdown 解析器
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface DeckCard {
  name_jp: string
  count: number
  game8_id: string
}

interface Section {
  title: string
  content: string
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

function parseMarkdown(text: string, url: string): DeckData {
  const id = url.match(/\/(\d+)$/)?.[1] || Date.now().toString()
  
  // 标题
  const titleMatch = text.match(/【マスターデュエル】(.+?)のレシピ/) || 
                     text.match(/(.+?)デッキについて/)
  const name_jp = titleMatch ? titleMatch[1].replace('デッキ', '') : '不明'
  
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
  
  // Type/Difficulty/Cost
  if (text.includes('展開型')) evaluation.deck_type = '展開型'
  else if (text.includes('コントロール型')) evaluation.deck_type = 'コントロール型'
  
  if (text.includes('難しい')) evaluation.difficulty = '難しい'
  else if (text.includes('普通')) evaluation.difficulty = '普通'
  else if (text.includes('簡単')) evaluation.difficulty = '簡単'
  
  // 生成コスト后面的值
  const costMatch = text.match(/生成コスト\s*\n\s*(展開型|コントロール型|ビート型)\s*\n\s*(難しい|普通|簡単)\s*\n\s*(高|中|低)/)
  if (costMatch) {
    evaluation.deck_type = costMatch[1]
    evaluation.difficulty = costMatch[2]
    evaluation.cost = costMatch[3]
  }
  
  // Features
  const featuresMatch = text.match(/★(.+?)の解説★\s*([\s\S]*?)(?=はみるとん|監修|メインデッキ)/i)
  if (featuresMatch) {
    evaluation.features = featuresMatch[2]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && l.length > 5 && l.length < 100 && !l.includes('http'))
      .slice(0, 5)
  }
  
  // 卡组配方
  const recipe = {
    main_deck: [] as DeckCard[],
    extra_deck: [] as DeckCard[]
  }
  
  // 1. 解析 URL 格式卡表
  const mainSection = text.match(/メインデッキ\((\d+)枚\)([\s\S]*?)エクストラデッキ/)
  const extraSection = text.match(/エクストラデッキ\((\d+)枚\)([\s\S]*?)(?=\nモンスター|\n モンスター)/)
  
  function parseUrlCards(section: string): Map<string, number> {
    const cards = new Map<string, number>()
    const urlPattern = /game8\.jp\/yugioh-masterduel\/(\d+)x(\d+)/g
    let match
    while ((match = urlPattern.exec(section)) !== null) {
      cards.set(match[1], parseInt(match[2]))
    }
    return cards
  }
  
  const mainCardCounts = mainSection ? parseUrlCards(mainSection[2]) : new Map()
  const extraCardCounts = extraSection ? parseUrlCards(extraSection[2]) : new Map()
  
  // 2. 解析表格格式获取卡名
  // 格式: [カード名](https://game8.jp/yugioh-masterduel/ID)\n数量
  const cardPattern = /\[([^\]]+)\]\(https:\/\/game8\.jp\/yugioh-masterduel\/(\d+)\)\s*\n(\d+)/g
  let cardMatch
  
  // 标记当前是主卡组还是额外卡组
  const mainDeckIds = new Set(mainCardCounts.keys())
  const extraDeckIds = new Set(extraCardCounts.keys())
  
  while ((cardMatch = cardPattern.exec(text)) !== null) {
    const name = cardMatch[1]
    const game8Id = cardMatch[2]
    const count = parseInt(cardMatch[3])
    
    // 跳过非卡牌链接
    if (name.includes('▶') || name.includes('はこちら')) continue
    
    if (mainDeckIds.has(game8Id)) {
      recipe.main_deck.push({ name_jp: name, count, game8_id: game8Id })
    } else if (extraDeckIds.has(game8Id)) {
      recipe.extra_deck.push({ name_jp: name, count, game8_id: game8Id })
    }
  }
  
  // Sections - 保留完整内容
  const sections: Section[] = []
  
  // 基礎知識
  const basicMatch = text.match(/白き森の主なカード例([\s\S]*?)(?=「.+?」の回し方まとめ)/)
  if (basicMatch) {
    sections.push({
      title: '基礎知識',
      content: cleanContent(basicMatch[1])
    })
  }
  
  // 回し方
  const playstyleMatch = text.match(/「.+?」の回し方まとめ([\s\S]*?)(?=展開盤面)/)
  if (playstyleMatch) {
    sections.push({
      title: '回し方',
      content: cleanContent(playstyleMatch[1])
    })
  }
  
  // 基本展開 (最重要！)
  const comboMatch = text.match(/展開盤面([\s\S]*?)(?=モンスター効果を止める)/)
  if (comboMatch) {
    sections.push({
      title: '基本展開',
      content: cleanContent(comboMatch[1])
    })
  }
  
  // 対策
  const counterMatch = text.match(/モンスター効果を止める([\s\S]*?)(?=手札誘発\n打つべき)/)
  if (counterMatch) {
    sections.push({
      title: '対策',
      content: cleanContent(counterMatch[1])
    })
  }
  
  // 手札誘発タイミング
  const handtrapMatch = text.match(/手札誘発\n打つべきタイミングと解説([\s\S]*?)$/)
  if (handtrapMatch) {
    sections.push({
      title: '手札誘発のタイミング',
      content: cleanContent(handtrapMatch[1])
    })
  }
  
  return {
    id: `game8-${id}`,
    name_jp,
    source_url: url,
    evaluation,
    recipe,
    sections,
    scraped_at: new Date().toISOString()
  }
}

function cleanContent(text: string): string {
  return text
    // 移除纯 URL 行
    .replace(/^https:\/\/game8\.jp\/yugioh-masterduel\/\d+$/gm, '')
    // 移除 /yugioh-masterduel/xxx 格式
    .replace(/^\/yugioh-masterduel\/\d+$/gm, '')
    // 将 markdown 链接转为「」格式
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '「$1」')
    // 清理多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 读取并解析
const mdPath = path.join(__dirname, '../data/markdown-raw/656291.md')
const mdContent = fs.readFileSync(mdPath, 'utf-8')
const result = parseMarkdown(mdContent, 'https://game8.jp/yugioh-masterduel/656291')

// 添加原始日文内容
const finalResult = {
  ...result,
  raw_markdown: mdContent
}

// 保存
const outputPath = path.join(__dirname, '../data/decks-raw/game8-656291.json')
fs.writeFileSync(outputPath, JSON.stringify(finalResult, null, 2), 'utf-8')

console.log('✅ 已生成:', outputPath)
console.log('\n--- 预览 ---')
console.log(`名称: ${result.name_jp}`)
console.log(`评价: ${result.evaluation.tier} | ${result.evaluation.deck_type} | ${result.evaluation.difficulty} | ${result.evaluation.cost}`)
console.log(`主卡组: ${result.recipe.main_deck.length} 张`)
console.log(`额外卡组: ${result.recipe.extra_deck.length} 张`)
console.log(`Sections: ${result.sections.map(s => s.title).join(', ')}`)

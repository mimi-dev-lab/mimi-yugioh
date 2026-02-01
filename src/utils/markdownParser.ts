/**
 * Markdown 解析器
 * 解析 [[card:卡名|game8_id]] 格式
 */

export interface CardRef {
  name: string
  game8Id: string
  fullMatch: string
}

export interface ParsedDeck {
  meta: {
    source: string
    deckName: string
    tier: string
    deckType: string
    difficulty: string
    cost: string
  }
  sections: ParsedSection[]
  cardRefs: Map<string, CardRef>
}

export interface ParsedSection {
  level: number
  title: string
  content: ParsedContent[]
}

export interface ParsedContent {
  type: 'text' | 'list' | 'table' | 'quote' | 'code' | 'field'
  text?: string
  items?: string[]
  rows?: Record<string, string>[]
  code?: string
  lang?: string
}

// 解析 [[card:xxx|id]] 格式
export function parseCardRefs(text: string): { text: string; cards: CardRef[] } {
  const cards: CardRef[] = []
  const cardPattern = /\[\[card:([^|\]]+)\|?(\d*)\]\]/g
  
  let match
  while ((match = cardPattern.exec(text)) !== null) {
    cards.push({
      name: match[1],
      game8Id: match[2] || '',
      fullMatch: match[0]
    })
  }
  
  return { text, cards }
}

// 将 [[card:xxx|id]] 替换为可渲染的格式
export function replaceCardRefs(text: string): string {
  return text.replace(/\[\[card:([^|\]]+)\|?(\d*)\]\]/g, (_, name, game8Id) => {
    // 这里返回一个特殊标记，前端组件会处理
    return `{{card:${name}:${game8Id}}}`
  })
}

// 解析 frontmatter
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {}
  let body = content
  
  if (content.startsWith('---')) {
    const endIndex = content.indexOf('---', 3)
    if (endIndex !== -1) {
      const frontmatter = content.slice(3, endIndex).trim()
      body = content.slice(endIndex + 3).trim()
      
      frontmatter.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':')
        if (colonIndex !== -1) {
          const key = line.slice(0, colonIndex).trim()
          const value = line.slice(colonIndex + 1).trim()
          meta[key] = value
        }
      })
    }
  }
  
  return { meta, body }
}

// 解析整个 markdown 文件
export function parseMarkdown(content: string): ParsedDeck {
  const { meta, body } = parseFrontmatter(content)
  const cardRefs = new Map<string, CardRef>()
  const sections: ParsedSection[] = []
  
  // 收集所有卡片引用
  const { cards } = parseCardRefs(body)
  cards.forEach(card => {
    if (card.game8Id) {
      cardRefs.set(card.game8Id, card)
    }
    cardRefs.set(card.name, card)
  })
  
  // 按行解析
  const lines = body.split('\n')
  let currentSection: ParsedSection | null = null
  let currentContent: ParsedContent | null = null
  let inCodeBlock = false
  let codeBlockLang = ''
  let codeBlockContent: string[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // 代码块处理
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // 结束代码块
        if (currentSection) {
          currentSection.content.push({
            type: codeBlockLang === 'field' ? 'field' : 'code',
            code: codeBlockContent.join('\n'),
            lang: codeBlockLang
          })
        }
        inCodeBlock = false
        codeBlockContent = []
        codeBlockLang = ''
      } else {
        // 开始代码块
        inCodeBlock = true
        codeBlockLang = line.slice(3).trim()
      }
      continue
    }
    
    if (inCodeBlock) {
      codeBlockContent.push(line)
      continue
    }
    
    // 标题处理 (H1-H4)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const title = headingMatch[2]
      
      // H4 作为内容的一部分（分组标题）
      if (level === 4 && currentSection) {
        currentContent = { type: 'text', text: `#### ${title}` }
        currentSection.content.push(currentContent)
        currentContent = null
        continue
      }
      
      currentSection = {
        level,
        title,
        content: []
      }
      sections.push(currentSection)
      currentContent = null
      continue
    }
    
    // 跳过分隔线
    if (line.trim() === '---') {
      continue
    }
    
    // 列表项
    if (line.match(/^[-*]\s+/)) {
      const item = line.replace(/^[-*]\s+/, '').trim()
      
      if (currentContent?.type === 'list') {
        currentContent.items?.push(item)
      } else {
        currentContent = { type: 'list', items: [item] }
        currentSection?.content.push(currentContent)
      }
      continue
    }
    
    // 引用块
    if (line.startsWith('>')) {
      const quoteText = line.replace(/^>\s*/, '')
      
      if (currentContent?.type === 'quote') {
        currentContent.text = (currentContent.text || '') + '\n' + quoteText
      } else {
        currentContent = { type: 'quote', text: quoteText }
        currentSection?.content.push(currentContent)
      }
      continue
    }
    
    // 表格
    if (line.includes('|') && line.trim().startsWith('|')) {
      // 简单跳过表格分隔行
      if (line.match(/^\|[-:\s|]+\|$/)) {
        continue
      }
      
      // 先保护 [[card:xxx|id]] 格式中的 |
      const protectedLine = line.replace(/\[\[card:([^|\]]+)\|(\d+)\]\]/g, '[[card:$1___PIPE___$2]]')
      const cells = protectedLine.split('|').filter(c => c.trim()).map(c => c.trim().replace(/___PIPE___/g, '|'))
      
      if (currentContent?.type === 'table' && currentContent.rows) {
        // 假设第一行是表头
        const headers = Object.keys(currentContent.rows[0] || {})
        if (headers.length === 0) {
          // 这是表头行
          const row: Record<string, string> = {}
          cells.forEach((cell, idx) => {
            row[`col${idx}`] = cell
          })
          currentContent.rows.push(row)
        } else {
          // 数据行
          const row: Record<string, string> = {}
          cells.forEach((cell, idx) => {
            row[headers[idx] || `col${idx}`] = cell
          })
          currentContent.rows.push(row)
        }
      } else {
        currentContent = { type: 'table', rows: [] }
        const row: Record<string, string> = {}
        cells.forEach((cell, idx) => {
          row[`col${idx}`] = cell
        })
        currentContent.rows?.push(row)
        currentSection?.content.push(currentContent)
      }
      continue
    }
    
    // 普通文本
    if (line.trim()) {
      if (currentContent?.type === 'text') {
        currentContent.text = (currentContent.text || '') + '\n' + line
      } else {
        currentContent = { type: 'text', text: line }
        currentSection?.content.push(currentContent)
      }
    } else {
      // 空行，重置当前内容
      currentContent = null
    }
  }
  
  return {
    meta: {
      source: meta.source || '',
      deckName: meta.deck_name || '',
      tier: meta.tier || '',
      deckType: meta.deck_type || '',
      difficulty: meta.difficulty || '',
      cost: meta.cost || ''
    },
    sections,
    cardRefs
  }
}

// 从 game8 ID 获取卡片数据的辅助函数
export function getCardByGame8Id(game8Id: string, cardIndex: Map<string, number>): number | null {
  return cardIndex.get(game8Id) || null
}

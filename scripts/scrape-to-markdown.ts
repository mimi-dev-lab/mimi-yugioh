/**
 * Game8 卡组爬虫 → 清洁 Markdown
 * 
 * 输出格式：
 * - 卡牌引用: [[card:カード名]] 或 [[card-id:game8_id]]
 * - 战场: ```field ... ```
 * - Combo 步骤: > ① ② ③ ...
 * 
 * Usage: npx tsx scripts/scrape-to-markdown.ts <url>
 */

import { chromium, Browser, Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const OUTPUT_DIR = './data/markdown-clean'

interface CardRef {
  name: string
  game8_id: string
  count?: number
}

// 从 Game8 URL 提取卡片 ID
function extractGame8Id(url: string): string {
  const match = url.match(/\/yugioh-masterduel\/(\d+)/)
  return match ? match[1] : ''
}

// 将卡名转换为标记格式
function cardTag(name: string, game8Id?: string): string {
  if (game8Id) {
    return `[[card:${name}|${game8Id}]]`
  }
  return `[[card:${name}]]`
}

// 清理文本
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

async function scrapeDeckPage(url: string): Promise<string> {
  console.log(`🔍 抓取: ${url}`)
  
  const browser: Browser = await chromium.launch({ headless: true })
  const page: Page = await browser.newPage()
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000) // 等待动态内容加载
    
    // 提取页面ID
    const pageId = extractGame8Id(url)
    
    // 开始构建 Markdown
    let md = ''
    
    // ========== 标题 ==========
    const title = await page.$eval('h1', el => el.textContent?.trim() || '')
    md += `# ${title}\n\n`
    md += `> 来源: ${url}\n\n`
    
    // ========== 评价区域 ==========
    md += `## 评价\n\n`
    
    // Tier
    const tier = await page.$eval('.deck-evaluation, .a-boxTitle', el => el.textContent?.trim() || '').catch(() => '')
    if (tier) {
      md += `**Tier**: ${tier}\n\n`
    }
    
    // 评价表格
    const evalRows = await page.$$eval('table tr', rows => {
      return rows.map(row => {
        const cells = row.querySelectorAll('td, th')
        return Array.from(cells).map(c => c.textContent?.trim() || '')
      }).filter(r => r.length > 0)
    }).catch(() => [])
    
    if (evalRows.length > 0) {
      md += `| 属性 | 值 |\n|------|----|\n`
      for (const row of evalRows) {
        if (row.length >= 2) {
          md += `| ${row[0]} | ${row[1]} |\n`
        }
      }
      md += '\n'
    }
    
    // 特点
    const features = await page.$$eval('.a-listMarker li, .deck-feature li', els => 
      els.map(el => el.textContent?.trim() || '')
    ).catch(() => [])
    
    if (features.length > 0) {
      md += `### 特点\n\n`
      for (const f of features) {
        if (f) md += `- ${f}\n`
      }
      md += '\n'
    }
    
    // ========== 卡组列表 ==========
    md += `## 卡组列表\n\n`
    
    // 主卡组
    const mainDeckCards = await extractDeckList(page, 'メインデッキ')
    if (mainDeckCards.length > 0) {
      md += `### 主卡组 (${mainDeckCards.reduce((s, c) => s + (c.count || 1), 0)}枚)\n\n`
      for (const card of mainDeckCards) {
        md += `- ${cardTag(card.name, card.game8_id)} ×${card.count || 1}\n`
      }
      md += '\n'
    }
    
    // 额外卡组
    const extraDeckCards = await extractDeckList(page, 'エクストラデッキ')
    if (extraDeckCards.length > 0) {
      md += `### 额外卡组 (${extraDeckCards.reduce((s, c) => s + (c.count || 1), 0)}枚)\n\n`
      for (const card of extraDeckCards) {
        md += `- ${cardTag(card.name, card.game8_id)} ×${card.count || 1}\n`
      }
      md += '\n'
    }
    
    // ========== 内容区块 ==========
    // 获取所有主要标题和内容
    const sections = await page.$$eval('article h2, article h3, article .a-text, article .a-boxList, article table', els => {
      const result: { type: string; tag: string; text: string; html: string }[] = []
      
      for (const el of els) {
        const tag = el.tagName.toLowerCase()
        const text = el.textContent?.trim() || ''
        const html = el.innerHTML || ''
        
        if (tag === 'h2' || tag === 'h3') {
          result.push({ type: 'heading', tag, text, html })
        } else if (el.classList.contains('a-text')) {
          result.push({ type: 'text', tag: 'p', text, html })
        } else if (el.classList.contains('a-boxList')) {
          result.push({ type: 'list', tag: 'ul', text, html })
        } else if (tag === 'table') {
          result.push({ type: 'table', tag, text, html })
        }
      }
      
      return result
    })
    
    // 当前处理的 section
    let currentSection = ''
    
    for (const block of sections) {
      if (block.type === 'heading') {
        const level = block.tag === 'h2' ? '##' : '###'
        currentSection = block.text
        md += `\n${level} ${block.text}\n\n`
      } else if (block.type === 'text') {
        // 处理文本，识别卡牌引用
        let text = block.text
        
        // 识别「カード名」格式的卡牌引用
        text = text.replace(/「([^」]+)」/g, (_, name) => `[[card:${name}]]`)
        
        // 识别 Combo 步骤 ①②③...
        if (/[①②③④⑤⑥⑦⑧⑨⑩]/.test(text)) {
          const steps = text.split(/([①②③④⑤⑥⑦⑧⑨⑩])/).filter(s => s.trim())
          let stepMd = ''
          for (let i = 0; i < steps.length; i += 2) {
            const num = steps[i]
            const content = steps[i + 1] || ''
            if (num && content) {
              // 每个步骤的子动作用 → 开头
              const lines = content.split('→').map(l => l.trim()).filter(l => l)
              stepMd += `> **${num}** ${lines[0]}\n`
              for (let j = 1; j < lines.length; j++) {
                stepMd += `>   → ${lines[j]}\n`
              }
              stepMd += '>\n'
            }
          }
          md += stepMd + '\n'
        } else {
          md += `${text}\n\n`
        }
      } else if (block.type === 'list') {
        const items = block.text.split('\n').filter(s => s.trim())
        for (const item of items) {
          let text = item.replace(/「([^」]+)」/g, (_, name) => `[[card:${name}]]`)
          md += `- ${text}\n`
        }
        md += '\n'
      } else if (block.type === 'table') {
        // 检查是否是盘面表格
        if (block.text.includes('墓地') || currentSection.includes('展開')) {
          md += '```field\n'
          md += block.text.replace(/「([^」]+)」/g, (_, name) => `[[card:${name}]]`)
          md += '\n```\n\n'
        }
      }
    }
    
    // ========== 手坑时机 ==========
    const handtraps = await page.$$eval('.handtrap-timing, [class*="handtrap"]', els => 
      els.map(el => ({
        card: el.querySelector('img')?.getAttribute('alt') || '',
        timing: el.textContent?.trim() || ''
      }))
    ).catch(() => [])
    
    if (handtraps.length > 0) {
      md += `## 手坑时机\n\n`
      for (const ht of handtraps) {
        if (ht.card) {
          md += `### ${cardTag(ht.card)}\n\n`
          md += `${ht.timing}\n\n`
        }
      }
    }
    
    await browser.close()
    return md
    
  } catch (error) {
    await browser.close()
    throw error
  }
}

// 提取卡组列表
async function extractDeckList(page: Page, sectionName: string): Promise<CardRef[]> {
  const cards: CardRef[] = []
  
  // 方法1: 从链接提取
  const cardLinks = await page.$$eval(`a[href*="/yugioh-masterduel/"]`, (els, section) => {
    // 找到对应 section 后的卡片链接
    const results: { name: string; url: string; count: number }[] = []
    let inSection = false
    
    for (const el of els) {
      const parent = el.closest('section, div')
      const sectionTitle = parent?.querySelector('h2, h3')?.textContent || ''
      
      if (sectionTitle.includes(section)) {
        inSection = true
      } else if (inSection && sectionTitle && !sectionTitle.includes(section)) {
        break
      }
      
      if (inSection) {
        const href = el.getAttribute('href') || ''
        const name = el.textContent?.trim() || ''
        // 检查是否有数量标记 (x3 等)
        const countMatch = href.match(/x(\d+)$/) || el.closest('div')?.textContent?.match(/×(\d+)/)
        const count = countMatch ? parseInt(countMatch[1]) : 1
        
        if (href.includes('/yugioh-masterduel/') && name && !href.includes('423817')) {
          results.push({ name, url: href, count })
        }
      }
    }
    
    return results
  }, sectionName).catch(() => [])
  
  for (const link of cardLinks) {
    const game8Id = extractGame8Id(link.url)
    if (game8Id && !cards.find(c => c.game8_id === game8Id)) {
      cards.push({
        name: link.name,
        game8_id: game8Id,
        count: link.count
      })
    }
  }
  
  // 方法2: 从表格提取
  if (cards.length === 0) {
    const tableCards = await page.$$eval('table tr', (rows, section) => {
      const results: { name: string; count: number }[] = []
      let inSection = false
      
      for (const row of rows) {
        const text = row.textContent || ''
        if (text.includes(section)) {
          inSection = true
          continue
        }
        
        if (inSection) {
          const nameCell = row.querySelector('td:nth-child(2), td a')
          const countCell = row.querySelector('td:last-child')
          const name = nameCell?.textContent?.trim() || ''
          const count = parseInt(countCell?.textContent || '1') || 1
          
          if (name && !name.includes('レア度')) {
            results.push({ name, count })
          }
        }
      }
      
      return results
    }, sectionName).catch(() => [])
    
    for (const card of tableCards) {
      cards.push({
        name: card.name,
        game8_id: '',
        count: card.count
      })
    }
  }
  
  return cards
}

// 主函数
async function main() {
  const url = process.argv[2]
  
  if (!url) {
    console.log('Usage: npx tsx scripts/scrape-to-markdown.ts <url>')
    console.log('Example: npx tsx scripts/scrape-to-markdown.ts https://game8.jp/yugioh-masterduel/656291')
    process.exit(1)
  }
  
  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
  
  try {
    const markdown = await scrapeDeckPage(url)
    
    // 保存文件
    const pageId = extractGame8Id(url)
    const outputPath = path.join(OUTPUT_DIR, `${pageId}.md`)
    fs.writeFileSync(outputPath, markdown, 'utf-8')
    
    console.log(`✅ 保存到: ${outputPath}`)
    console.log('\n--- 预览 ---\n')
    console.log(markdown.slice(0, 2000))
    if (markdown.length > 2000) {
      console.log('\n... (truncated)')
    }
    
  } catch (error) {
    console.error('❌ 抓取失败:', error)
    process.exit(1)
  }
}

main()

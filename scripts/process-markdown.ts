/**
 * 处理 Game8 原始 markdown → 干净的结构化 markdown
 * 
 * 输入: web_fetch 获取的原始 markdown
 * 输出: 带 [[card:xxx]] 标记的清洁 markdown
 * 
 * Usage: npx tsx scripts/process-markdown.ts <input.md> <output.md>
 *        或者用 --url 直接处理 URL
 */

import * as fs from 'fs'

// Game8 ID → 卡名映射（从 URL 提取）
const CARD_ID_MAP: Record<string, string> = {}

// 从文本中提取所有 game8 卡片链接并构建映射
function extractCardLinks(text: string): void {
  // 格式1: [卡名](https://game8.jp/yugioh-masterduel/ID)
  const linkPattern = /\[([^\]]+)\]\(https?:\/\/game8\.jp\/yugioh-masterduel\/(\d+)\)/g
  let match
  while ((match = linkPattern.exec(text)) !== null) {
    const cardName = match[1]
    const game8Id = match[2]
    if (cardName && game8Id && !cardName.includes('環境') && !cardName.includes('ランキング')) {
      CARD_ID_MAP[game8Id] = cardName
    }
  }
  
  // 格式2: https://game8.jp/yugioh-masterduel/IDxN (卡组列表)
  const deckPattern = /https:\/\/game8\.jp\/yugioh-masterduel\/(\d+)x(\d+)/g
  while ((match = deckPattern.exec(text)) !== null) {
    const game8Id = match[1]
    // 这种格式没有卡名，稍后需要补充
  }
}

// 将卡名转换为标记格式
function cardTag(name: string, game8Id?: string): string {
  if (game8Id) {
    return `[[card:${name}|${game8Id}]]`
  }
  return `[[card:${name}]]`
}

// 处理文本中的卡名引用
function processCardRefs(text: string): string {
  // 处理「カード名」格式
  let result = text.replace(/「([^」]+)」/g, (match, name) => {
    // 查找对应的 game8 ID
    const id = Object.entries(CARD_ID_MAP).find(([_, n]) => n === name)?.[0]
    return `「${cardTag(name, id)}」`
  })
  
  // 处理 [卡名](URL) 格式
  result = result.replace(/\[([^\]]+)\]\(https?:\/\/game8\.jp\/yugioh-masterduel\/(\d+)\)/g, 
    (_, name, id) => cardTag(name, id)
  )
  
  // 处理单独的 URL (卡组列表)
  result = result.replace(/https:\/\/game8\.jp\/yugioh-masterduel\/(\d+)x(\d+)/g, 
    (_, id, count) => {
      const name = CARD_ID_MAP[id] || `card_${id}`
      return `- ${cardTag(name, id)} ×${count}`
    }
  )
  
  // 处理单独的 URL (图片引用等)
  result = result.replace(/^https:\/\/game8\.jp\/yugioh-masterduel\/(\d+)$/gm, 
    (_, id) => {
      const name = CARD_ID_MAP[id]
      return name ? cardTag(name, id) : `[[card-id:${id}]]`
    }
  )
  
  return result
}

// 主处理函数
function processMarkdown(rawMd: string): string {
  // 先提取所有卡片链接
  extractCardLinks(rawMd)
  
  const lines = rawMd.split('\n')
  const output: string[] = []
  
  let currentSection = ''
  let inDeckList = false
  let deckType = '' // 'main' | 'extra'
  let skipUntilSection = false
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim()
    
    // 跳过空行堆积
    if (!line) {
      if (output.length > 0 && output[output.length - 1] !== '') {
        output.push('')
      }
      continue
    }
    
    // 跳过目录
    if (line.startsWith('- [') && line.includes('#hl_')) {
      continue
    }
    
    // 跳过无关链接
    if (line.startsWith('[▶︎') || line.startsWith('/yugioh-masterduel/437')) {
      continue
    }
    
    // 跳过底部的相关链接
    if (line.includes('登場・強化テーマ') || line.includes('その他の環境デッキ')) {
      skipUntilSection = true
      continue
    }
    
    if (skipUntilSection) {
      continue
    }
    
    // 检测章节标题
    if (line === 'デッキ評価' || line.includes('評価')) {
      currentSection = 'evaluation'
      output.push('## 评价\n')
      continue
    }
    
    if (line.includes('メインデッキ')) {
      currentSection = 'recipe'
      inDeckList = true
      deckType = 'main'
      const countMatch = line.match(/\((\d+)枚\)/)
      output.push(`## 卡组列表\n`)
      output.push(`### 主卡组 (${countMatch?.[1] || '?'}枚)\n`)
      continue
    }
    
    if (line.includes('エクストラデッキ')) {
      deckType = 'extra'
      const countMatch = line.match(/\((\d+)枚\)/)
      output.push(`### 额外卡组 (${countMatch?.[1] || '?'}枚)\n`)
      continue
    }
    
    if (line === '基礎知識' || line.includes('白き森の主なカード')) {
      currentSection = 'basics'
      inDeckList = false
      output.push(`## 基础知识\n`)
      continue
    }
    
    if (line.includes('回し方まとめ') || line === '回し方') {
      currentSection = 'howto'
      output.push(`## 使用方法\n`)
      continue
    }
    
    if (line === '展開盤面' || line.includes('基本展開')) {
      currentSection = 'combo'
      output.push(`## 基本展开\n`)
      continue
    }
    
    if (line.includes('対策') || line.includes('モンスター効果を止める')) {
      currentSection = 'counter'
      if (!output.some(l => l.includes('## 克制方法'))) {
        output.push(`## 克制方法\n`)
      }
      continue
    }
    
    if (line.includes('手札誘発') && line.includes('タイミング')) {
      currentSection = 'handtrap'
      output.push(`## 手坑时机\n`)
      continue
    }
    
    // 处理卡组列表
    if (inDeckList && line.match(/^https:\/\/game8\.jp\/yugioh-masterduel\/\d+x\d+$/)) {
      const processed = processCardRefs(line)
      output.push(processed)
      continue
    }
    
    // 跳过表格头
    if (line === 'レア度' || line === 'カード名' || line === '採用枚数' || 
        line === 'モンスター' || line === '魔法' || line === '罠' || line === 'EX' ||
        line === '手順' || line === '詳細') {
      continue
    }
    
    // 处理 Combo 步骤
    if (/^[①②③④⑤⑥⑦⑧⑨⑩]$/.test(line)) {
      // 步骤编号单独一行，下一行是内容
      const stepNum = line
      const nextLine = lines[i + 1]?.trim() || ''
      if (nextLine) {
        output.push(`\n> **${stepNum}** ${processCardRefs(nextLine)}`)
        i++ // 跳过下一行
        
        // 继续读取 → 开头的子步骤
        while (i + 1 < lines.length) {
          const subLine = lines[i + 1]?.trim() || ''
          if (subLine.startsWith('→')) {
            output.push(`>   ${processCardRefs(subLine)}`)
            i++
          } else if (subLine.startsWith('「') || subLine.includes('効果')) {
            output.push(`>   → ${processCardRefs(subLine)}`)
            i++
          } else {
            break
          }
        }
      }
      continue
    }
    
    // 处理盘面表格
    if (line === '-' && currentSection === 'combo') {
      // 可能是盘面图，收集后续内容
      const boardLines: string[] = [line]
      while (i + 1 < lines.length && 
             (lines[i + 1]?.trim() === '-' || 
              lines[i + 1]?.trim().startsWith('https://game8') ||
              lines[i + 1]?.trim() === '墓地')) {
        i++
        boardLines.push(lines[i].trim())
      }
      
      if (boardLines.length > 3) {
        output.push('\n```field')
        output.push('# 最终盘面')
        for (const bl of boardLines) {
          output.push(processCardRefs(bl))
        }
        output.push('```\n')
      }
      continue
    }
    
    // 处理共通效果说明框
    if (line.includes('共通効果')) {
      output.push(`\n### ${line}\n`)
      continue
    }
    
    // 处理小标题（以空格开头的标题）
    if (line.startsWith(' ') && line.endsWith('例') || 
        line.includes('ターンに出す') ||
        line.includes('を止める')) {
      output.push(`\n### ${line.trim()}\n`)
      continue
    }
    
    // 处理「必要カード」等关键信息
    if (line.startsWith('必要カード') || line.startsWith('作り出せる盤面')) {
      output.push(`\n**${line}**\n`)
      continue
    }
    
    // 处理盘面描述
    if (line.startsWith('盤面：')) {
      output.push(`\n**${processCardRefs(line)}**\n`)
      continue
    }
    
    // 处理手坑说明
    if (line === '【解説】') {
      continue // 跳过，下一行是实际内容
    }
    
    // 普通文本
    const processed = processCardRefs(line)
    
    // 检查是否是卡片说明（格式：卡名 + 效果）
    if (processed.includes('[[card:') && processed.length > 50) {
      output.push(processed + '\n')
    } else if (processed.startsWith('[[card:') && processed.endsWith(']]')) {
      // 单独的卡片引用，可能是列表项
      output.push(`- ${processed}`)
    } else {
      output.push(processed)
    }
  }
  
  // 清理输出
  let result = output.join('\n')
  
  // 移除多余空行
  result = result.replace(/\n{3,}/g, '\n\n')
  
  // 添加头部
  const header = `---
source: game8.jp
processed_at: ${new Date().toISOString()}
card_count: ${Object.keys(CARD_ID_MAP).length}
---

`
  
  return header + result
}

// CLI
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length < 1) {
    console.log('Usage:')
    console.log('  npx tsx scripts/process-markdown.ts <input.md> [output.md]')
    console.log('  npx tsx scripts/process-markdown.ts --raw "<markdown text>"')
    process.exit(1)
  }
  
  let inputMd: string
  let outputPath: string
  
  if (args[0] === '--raw') {
    inputMd = args[1]
    outputPath = args[2] || './data/markdown-clean/output.md'
  } else {
    inputMd = fs.readFileSync(args[0], 'utf-8')
    outputPath = args[1] || args[0].replace('.md', '-clean.md')
  }
  
  console.log('📝 处理 Markdown...')
  const result = processMarkdown(inputMd)
  
  // 确保输出目录存在
  const dir = outputPath.substring(0, outputPath.lastIndexOf('/'))
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  fs.writeFileSync(outputPath, result, 'utf-8')
  console.log(`✅ 保存到: ${outputPath}`)
  console.log(`📊 识别到 ${Object.keys(CARD_ID_MAP).length} 张卡片`)
  
  // 预览
  console.log('\n--- 预览 (前2000字符) ---\n')
  console.log(result.slice(0, 2000))
}

main()

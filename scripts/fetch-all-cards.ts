/**
 * 从 YGOPRODECK API 获取完整卡片数据
 * 运行: npx tsx scripts/fetch-all-cards.ts
 */

import { writeFileSync } from 'fs'
import { resolve } from 'path'

const API_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

interface YGOCard {
  id: number
  name: string
  type: string
  desc: string
  atk?: number
  def?: number
  level?: number
  race?: string
  attribute?: string
  card_images: { image_url: string; image_url_small: string; image_url_cropped: string }[]
}

interface OutputCard {
  id: number
  name: string
  name_cn?: string
  type: string
  desc: string
  desc_cn?: string
  atk: number | null
  def: number | null
  level: number | null
  race: string | null
  attribute: string | null
  image: string
  image_small: string
}

async function fetchAllCards() {
  console.log('🔄 正在从 YGOPRODECK 获取卡片数据...')
  
  const res = await fetch(API_URL)
  if (!res.ok) {
    throw new Error(`API 请求失败: ${res.status}`)
  }
  
  const data = await res.json()
  const cards: YGOCard[] = data.data
  
  console.log(`✅ 获取到 ${cards.length} 张卡片`)
  
  // 转换格式
  const outputCards: OutputCard[] = cards.map(card => ({
    id: card.id,
    name: card.name,
    name_cn: undefined, // 中文名需要另外处理
    type: card.type,
    desc: card.desc,
    desc_cn: undefined,
    atk: card.atk ?? null,
    def: card.def ?? null,
    level: card.level ?? null,
    race: card.race ?? null,
    attribute: card.attribute ?? null,
    image: card.card_images[0]?.image_url ?? '',
    image_small: card.card_images[0]?.image_url_small ?? '',
  }))
  
  // 保存文件
  const outputPath = resolve(__dirname, '../public/data/cards.json')
  writeFileSync(outputPath, JSON.stringify(outputCards))
  
  console.log(`💾 已保存到 ${outputPath}`)
  console.log(`📊 文件大小: ${(JSON.stringify(outputCards).length / 1024 / 1024).toFixed(2)} MB`)
  
  // 验证黑魔术师
  const darkMagician = outputCards.find(c => c.name === 'Dark Magician')
  if (darkMagician) {
    console.log(`\n🧙 找到黑魔术师:`)
    console.log(`   ID: ${darkMagician.id}`)
    console.log(`   ATK: ${darkMagician.atk} / DEF: ${darkMagician.def}`)
  }
}

fetchAllCards().catch(console.error)

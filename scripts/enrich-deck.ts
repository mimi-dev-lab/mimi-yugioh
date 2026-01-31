/**
 * 为卡组数据添加完整卡牌信息
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 读取数据
const deckPath = path.join(__dirname, '../data/decks-raw/game8-656291.json')
const cardsPath = path.join(__dirname, '../dist/data/cards.json')

const deck = JSON.parse(fs.readFileSync(deckPath, 'utf-8'))
const cards: any[] = JSON.parse(fs.readFileSync(cardsPath, 'utf-8'))

// 建立日文名索引
const cardsByJpName = new Map<string, any>()
for (const card of cards) {
  if (card.name_jp) {
    cardsByJpName.set(card.name_jp, card)
  }
}

// 丰富主卡组数据
function enrichCard(deckCard: { name_jp: string; count: number; game8_id: string }) {
  const fullCard = cardsByJpName.get(deckCard.name_jp)
  
  if (fullCard) {
    return {
      ...deckCard,
      id: fullCard.id,
      name: fullCard.name,
      name_cn: fullCard.name_cn,
      type: fullCard.type,
      desc: fullCard.desc,
      desc_cn: fullCard.desc_cn,
      atk: fullCard.atk,
      def: fullCard.def,
      level: fullCard.level,
      race: fullCard.race,
      attribute: fullCard.attribute,
      image_path_cn: fullCard.image_path_cn,
      image_path_jp: fullCard.image_path_jp,
    }
  }
  
  return deckCard
}

// 处理卡组
deck.recipe.main_deck = deck.recipe.main_deck.map(enrichCard)
deck.recipe.extra_deck = deck.recipe.extra_deck.map(enrichCard)

// 保存
const outputPath = path.join(__dirname, '../data/decks-raw/game8-656291-enriched.json')
fs.writeFileSync(outputPath, JSON.stringify(deck, null, 2), 'utf-8')

console.log('✅ 已生成:', outputPath)
console.log(`主卡组: ${deck.recipe.main_deck.length} 种`)
console.log(`额外卡组: ${deck.recipe.extra_deck.length} 种`)

// 检查匹配情况
const mainMatched = deck.recipe.main_deck.filter((c: any) => c.id).length
const extraMatched = deck.recipe.extra_deck.filter((c: any) => c.id).length
console.log(`\n匹配成功: 主卡组 ${mainMatched}/${deck.recipe.main_deck.length}, 额外 ${extraMatched}/${deck.recipe.extra_deck.length}`)

/**
 * Game8 Markdown 解析器
 * 将 web_fetch 获取的 markdown 文本解析成结构化数据
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface DeckCard {
  name_jp: string
  count: number
  game8_id?: string
}

interface ComboStep {
  num: string
  detail: string
}

interface Section {
  title: string
  content: string  // 保留原始文本
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
  const titleMatch = text.match(/【マスターデュエル】(.+?)(?:のレシピ|デッキ)/)
  const name_jp = titleMatch ? titleMatch[1] : '不明'
  
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
  
  // Type/Difficulty/Cost - 在评价区块附近
  const evalBlock = text.match(/デッキタイプ[\s\S]*?生成コスト[\s\S]*?\n\n([\s\S]*?)\n\n/)
  if (evalBlock) {
    const lines = evalBlock[1].split('\n').map(l => l.trim()).filter(l => l)
    for (const line of lines) {
      if (line.includes('型')) evaluation.deck_type = line
      if (['難しい', '普通', '簡単'].includes(line)) evaluation.difficulty = line
      if (['高', '中', '低'].includes(line)) evaluation.cost = line
    }
  }
  
  // Features - ★...★ 区块
  const featuresMatch = text.match(/★(.+?)の解説★\s*([\s\S]*?)(?=はみるとん|メインデッキ|レシピ)/i)
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
  
  // 方法1: 解析 URL 格式 (game8.jp/yugioh-masterduel/IDxCOUNT)
  const mainDeckSection = text.match(/メインデッキ\((\d+)枚\)([\s\S]*?)エクストラデッキ/)
  const extraDeckSection = text.match(/エクストラデッキ\((\d+)枚\)([\s\S]*?)(?=モンスター\n|魔法\n|$)/)
  
  function parseUrlCards(section: string): DeckCard[] {
    const cards: DeckCard[] = []
    const urlPattern = /game8\.jp\/yugioh-masterduel\/(\d+)x(\d+)/g
    let match
    while ((match = urlPattern.exec(section)) !== null) {
      cards.push({
        game8_id: match[1],
        name_jp: '', // 稍后填充
        count: parseInt(match[2])
      })
    }
    return cards
  }
  
  if (mainDeckSection) {
    recipe.main_deck = parseUrlCards(mainDeckSection[2])
  }
  if (extraDeckSection) {
    recipe.extra_deck = parseUrlCards(extraDeckSection[2])
  }
  
  // 方法2: 从表格区域获取卡名
  // 格式: [カード名](url)\n数量
  const cardTablePattern = /\[([^\]]+)\]\(https:\/\/game8\.jp\/yugioh-masterduel\/(\d+)\)\s*\n(\d+)/g
  let cardMatch
  while ((cardMatch = cardTablePattern.exec(text)) !== null) {
    const name = cardMatch[1]
    const game8Id = cardMatch[2]
    const count = parseInt(cardMatch[3])
    
    // 找到对应的卡并更新名字
    const mainCard = recipe.main_deck.find(c => c.game8_id === game8Id)
    if (mainCard) {
      mainCard.name_jp = name
      mainCard.count = count
    } else {
      const extraCard = recipe.extra_deck.find(c => c.game8_id === game8Id)
      if (extraCard) {
        extraCard.name_jp = name
        extraCard.count = count
      }
    }
  }
  
  // 过滤掉没有名字的卡（可能是解析错误）
  recipe.main_deck = recipe.main_deck.filter(c => c.name_jp)
  recipe.extra_deck = recipe.extra_deck.filter(c => c.name_jp)
  
  // Sections - 按主要区块分割
  const sections: Section[] = []
  
  // 定义主要区块的标记
  const sectionMarkers = [
    { title: '基礎知識', start: /白き森の主なカード例|基礎知識/, end: /回し方まとめ|回し方/ },
    { title: '回し方', start: /「.+?」の回し方まとめ|回し方/, end: /基本展開|展開盤面/ },
    { title: '基本展開', start: /展開盤面|基本展開/, end: /対策|モンスター効果を止める/ },
    { title: '対策と手札誘発', start: /モンスター効果を止める|対策/, end: /「ジアピカル|関連リンク|$/ },
  ]
  
  for (const marker of sectionMarkers) {
    const startMatch = text.match(marker.start)
    const endMatch = text.match(marker.end)
    
    if (startMatch && startMatch.index !== undefined) {
      const startIdx = startMatch.index
      let endIdx = text.length
      
      if (endMatch && endMatch.index !== undefined && endMatch.index > startIdx) {
        endIdx = endMatch.index
      }
      
      const content = text.slice(startIdx, endIdx).trim()
      if (content.length > 50) {
        sections.push({
          title: marker.title,
          content: cleanContent(content)
        })
      }
    }
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
    // 清理纯 URL 行
    .replace(/^https:\/\/game8\.jp[^\s]*$/gm, '')
    // 清理 /yugioh-masterduel/xxx 格式
    .replace(/^\/yugioh-masterduel\/\d+$/gm, '')
    // 保留 markdown 链接但简化
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '「$1」')
    // 清理多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 测试数据
const testMarkdown = `遊戯王マスターデュエルにおける白き森デッキについての記事です。

デッキ評価

ランク外

デッキタイプ
プレイ難易度
生成コスト

展開型
普通
中

★白き森デッキの解説★

レベル6,8,10シンクロが出しやすいシンクロデッキ

コストで魔法罠カードを墓地に送って展開するのが特徴

制約が一切ないので様々なテーマと混ぜ物が可能

メインデッキ(40枚)

https://game8.jp/yugioh-masterduel/435980x3

https://game8.jp/yugioh-masterduel/642619x1

https://game8.jp/yugioh-masterduel/435145x3

エクストラデッキ(15枚)

https://game8.jp/yugioh-masterduel/447045x1

https://game8.jp/yugioh-masterduel/431941x1

モンスター

[灰流うらら](https://game8.jp/yugioh-masterduel/435980)
3

[白き森のルシア](https://game8.jp/yugioh-masterduel/642619)
1

[増殖するG](https://game8.jp/yugioh-masterduel/435145)
3

EX

[フルール・ド・バロネス](https://game8.jp/yugioh-masterduel/447045)
1

[フォーミュラ・シンクロン](https://game8.jp/yugioh-masterduel/431941)
1

白き森の主なカード例

「白き森」は、レベル2の非チューナーとレベル4のチューナーで構成されたシンクロデッキです。

「白き森デッキ」の回し方まとめ

初動となる3種類の「白き森」モンスターから始動

展開盤面

-
墓地
-

必要カード

「アステーリャ」＋「トイソルジャー」

作り出せる盤面

盤面：「マスカレーナ」「バロネス」「ディアベル」

手順
詳細

①
「トイソルジャー」を魔法カード扱いでセット
→「アステーリャ」を召喚し効果で「トイソルジャー」をコストに「シルヴィ」を特殊召喚

②
「トイボックス」を発動し効果で「トイタンク」と「トイソルジャー」をセット

③
「シルヴィ」＋「アステーリャ」→「ルシエラ」をシンクロ召喚

モンスター効果を止める

「白き森」は基本的な動きはモンスター効果で展開しシンクロを繰り返すシンプルなもののため、モンスター効果を無効にできれば動きが止まる可能性が高いです。

「ジアピカルプレデターズ」の登場
`

// 测试
const result = parseMarkdown(testMarkdown, 'https://game8.jp/yugioh-masterduel/656291')
console.log(JSON.stringify(result, null, 2))

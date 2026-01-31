/**
 * Game8 卡组数据解析器
 * 将抓取的数据转换成 APP 需要的 JSON 格式
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 加载卡牌数据库（用于日文→中文翻译）
const cardsDbPath = path.join(__dirname, '../dist/data/cards.json')
const cardsDb: any[] = JSON.parse(fs.readFileSync(cardsDbPath, 'utf-8'))

// 建立日文名 → 中文名映射
const jpToCnMap = new Map<string, { id: number; name_cn: string }>()
for (const card of cardsDb) {
  if (card.name_jp) {
    jpToCnMap.set(card.name_jp, { id: card.id, name_cn: card.name_cn || card.name })
  }
}

// 解析卡表中的卡名
function parseCardName(text: string): { name_jp: string; count: number } | null {
  // 格式: [卡名](url) 或 纯文字卡名
  const linkMatch = text.match(/\[([^\]]+)\]\([^)]+\)/)
  if (linkMatch) {
    return { name_jp: linkMatch[1], count: 1 }
  }
  return null
}

// 翻译卡名
function translateCardName(jpName: string): { id: number; name_cn: string; name_jp: string } {
  const found = jpToCnMap.get(jpName)
  if (found) {
    return { id: found.id, name_cn: found.name_cn, name_jp: jpName }
  }
  // 没找到就保留日文
  return { id: 0, name_cn: jpName, name_jp: jpName }
}

// 白き森卡组的原始数据
const rawData = {
  url: "https://game8.jp/yugioh-masterduel/656291",
  title: "白き森デッキ",
  
  // 评价
  tier: "ランク外",
  deck_type: "展開型",
  difficulty: "普通",
  cost: "中",
  
  // 解说
  features: [
    "レベル6,8,10シンクロが出しやすいシンクロデッキ",
    "コストで魔法罠カードを墓地に送って展開するのが特徴",
    "制約が一切ないので様々なテーマと混ぜ物が可能"
  ],
  
  // 主卡组
  main_deck_jp: [
    { name: "灰流うらら", count: 3 },
    { name: "白き森のルシア", count: 1 },
    { name: "増殖するG", count: 3 },
    { name: "エフェクト・ヴェーラー", count: 2 },
    { name: "白き森のシルヴィ", count: 2 },
    { name: "白き森のリゼット", count: 3 },
    { name: "白き森のアステーリャ", count: 3 },
    { name: "トイ・タンク", count: 1 },
    { name: "トイ・ソルジャー", count: 3 },
    { name: "抹殺の指名者", count: 1 },
    { name: "白き森にはいるべからず", count: 1 },
    { name: "白き森のいいつたえ", count: 3 },
    { name: "トイ・ボックス", count: 3 },
    { name: "シンクロ・ランブル", count: 1 },
    { name: "墓穴の指名者", count: 2 },
    { name: "ピリ・レイスの地図", count: 3 },
    { name: "伍世壊浄心", count: 1 },
    { name: "無限泡影", count: 3 },
    { name: "白き森のわざわいなり", count: 1 },
  ],
  
  // 额外卡组
  extra_deck_jp: [
    { name: "フルール・ド・バロネス", count: 1 },
    { name: "フォーミュラ・シンクロン", count: 1 },
    { name: "ハイパーサイコライザー", count: 1 },
    { name: "スターダスト・チャージ・ウォリアー", count: 1 },
    { name: "クリスタルウィング・シンクロ・ドラゴン", count: 1 },
    { name: "カオス・アンヘル－混沌の双翼－", count: 1 },
    { name: "ヴィサス＝アムリターラ", count: 1 },
    { name: "赤き竜", count: 1 },
    { name: "白き森の魔狼シルウィア", count: 1 },
    { name: "白き森の魔性ルシエラ", count: 1 },
    { name: "白き森の妖魔ディアベル", count: 1 },
    { name: "召命の神弓－アポロウーサ", count: 1 },
    { name: "閉ザサレシ世界ノ冥神", count: 1 },
    { name: "I：Pマスカレーナ", count: 1 },
    { name: "S：Pリトルナイト", count: 1 },
  ],
  
  // 基础知识
  basic_knowledge: {
    description: "「白き森」是由 Lv2 非调整和 Lv4 调整组成的同步召唤卡组。各卡牌都有检索、从卡组特殊召唤等获取卡差的效果，同步召唤的同时手牌和场面会不断增加。",
    monster_common_effect: "可以将自己手牌・场上的1张魔法・陷阱卡送去墓地来发动。～固有效果～",
    spell_trap_common_effect: "此卡因怪兽效果发动而被送去墓地的场合才能发动。将此卡在自己场上盖放。",
    synergy_themes: ["トイ (玩具)", "センチュリオン (百夫长)", "ホルス"]
  },
  
  // 回し方 (运营)
  playstyle: {
    summary: [
      "从3种初动「白き森」怪兽开始展开",
      "同步召唤露榭菈进行进一步展开",
      "用2种「白き森」同步怪兽进行妨害"
    ],
    starters: [
      {
        name_jp: "白き森のアステーリャ",
        effect: "可以将手牌・场上的魔法陷阱1张送去墓地，从卡组特殊召唤1只魔法使族・光属性调整怪兽。"
      },
      {
        name_jp: "白き森のリゼット", 
        effect: "可以将手牌・场上的魔法陷阱1张送去墓地，将此卡从手牌特殊召唤。之后，从卡组将1只「白き森」怪兽加入手牌。"
      },
      {
        name_jp: "白き森のシルヴィ",
        effect: "此卡召唤・特殊召唤的场合才能发动。从卡组将1张「白き森」魔法・陷阱卡加入手牌。"
      }
    ],
    key_synchros: [
      {
        name_jp: "白き森の魔性ルシエラ",
        role: "展开中继",
        effect: "特殊召唤时可检索「白き森」卡或魔法使族・光属性怪兽"
      },
      {
        name_jp: "白き森の妖魔ディアベル",
        role: "妨害",
        effect: "对方发动效果时，可从EX・墓地・除外特殊召唤Lv7以下同步怪兽"
      },
      {
        name_jp: "白き森の魔狼シルウィア",
        role: "妨害",
        effect: "特殊召唤时可将对方场上全部怪兽变成里侧守备"
      }
    ]
  },
  
  // 基本展开
  combos: [
    {
      name: "双卡基本展开",
      required_cards: ["白き森のアステーリャ", "トイ・ソルジャー"],
      end_board: ["I：Pマスカレーナ", "フルール・ド・バロネス", "白き森の妖魔ディアベル", "白き森のわざわいなり", "伍世壊浄心", "トイ・ボックス×2"],
      steps: [
        "将「玩具士兵」作为魔法卡盖放",
        "召唤「阿斯特丽雅」，以「玩具士兵」为cost特殊召唤「希露薇」",
        "「希露薇」效果检索「灾厄临世」",
        "「玩具士兵」效果特殊召唤自身并检索「玩具盒」",
        "发动「玩具盒」，盖放「玩具坦克」和「玩具士兵」",
        "「希露薇」+「阿斯特丽雅」→ 同步召唤「露榭菈」",
        "「露榭菈」以「玩具士兵」为cost检索「传说」",
        "发动「传说」检索「莉赛特」",
        "「露榭菈」+「玩具士兵」→ 同步召唤「男爵夫人」",
        "「莉赛特」以「玩具坦克」为cost特殊召唤自身并检索「露希亚」",
        "「玩具坦克」效果特殊召唤自身并复活「露榭菈」",
        "「露希亚」效果特殊召唤自身，以「玩具盒」为cost抽1卡",
        "「阿斯特丽雅」墓地效果特殊召唤自身",
        "「露榭菈」+「阿斯特丽雅」→ 同步召唤「迪亚贝尔」",
        "「迪亚贝尔」效果回收「玩具盒」",
        "再次发动「玩具盒」盖放墓地的「玩具坦克」和「玩具士兵」",
        "「希露薇」墓地效果将「露榭菈」返回卡组并特殊召唤自身",
        "「希露薇」+「露希亚」→ 同步召唤「阿姆利塔拉」",
        "「阿姆利塔拉」效果检索「伍世壊浄心」",
        "「阿姆利塔拉」+「莉赛特」→ 连接召唤「假面舞会」"
      ]
    }
  ],
  
  // 对策
  counters: {
    monster_effect_negate: {
      description: "「白き森」基本上是用怪兽效果展开并重复同步的简单套路，无效怪兽效果就很可能让其停止运转。",
      examples: ["エフェクト・ヴェーラー", "禁じられた一滴", "スキルドレイン"]
    },
    search_negate: {
      description: "「白き森」展开中检索效果非常重要，被阻止就无法继续展开。特别是「抽锁鸟」会封锁整个回合的检索，是天敌。",
      examples: ["灰流うらら", "ドロール＆ロックバード"]
    },
    summon_limit: {
      description: "因为是同步召唤主体的卡组，「次元障壁」是强力克制。另外「白き森」以魔法使族为主，「同族感染病」也很有效，限制展开的「召唤限制器」也是有效的克制牌。",
      examples: ["次元障壁", "サモンリミッター", "センサー万別"]
    }
  },
  
  // 手诱时机
  handtrap_timing: [
    {
      handtrap_jp: "増殖するG",
      targets_jp: ["白き森のアステーリャ", "白き森のリゼット", "白き森のわざわいなり"],
      explanation: "对特殊召唤效果、作为展开起点的主卡组初动卡发动。"
    },
    {
      handtrap_jp: "灰流うらら",
      targets_jp: ["白き森のアステーリャ", "白き森のリゼット", "白き森のシルヴィ", "白き森のいいつたえ"],
      explanation: "阻止初动的检索、特殊召唤即可。"
    },
    {
      handtrap_jp: "無限泡影",
      targets_jp: ["白き森のアステーリャ", "白き森のシルヴィ", "白き森の魔性ルシエラ", "白き森の妖魔ディアベル"],
      explanation: "除了初动外，对同步怪兽的检索和妨害效果无效也很有效。"
    }
  ]
}

// 转换为APP格式
function convertToAppFormat(raw: typeof rawData) {
  // 翻译主卡组
  const mainDeck = raw.main_deck_jp.map(card => {
    const translated = translateCardName(card.name)
    return {
      id: translated.id,
      name: translated.name_cn,
      name_jp: translated.name_jp,
      count: card.count
    }
  })
  
  // 翻译额外卡组
  const extraDeck = raw.extra_deck_jp.map(card => {
    const translated = translateCardName(card.name)
    return {
      id: translated.id,
      name: translated.name_cn,
      name_jp: translated.name_jp,
      count: card.count
    }
  })
  
  // 翻译手诱时机
  const handtrapTiming = raw.handtrap_timing.map(ht => {
    const handtrap = translateCardName(ht.handtrap_jp)
    const targets = ht.targets_jp.map(t => translateCardName(t))
    return {
      handtrap: { id: handtrap.id, name: handtrap.name_cn },
      targets: targets.map(t => ({ id: t.id, name: t.name_cn })),
      explanation: ht.explanation
    }
  })
  
  return {
    id: "game8-656291",
    name: "白森",
    name_jp: "白き森",
    source_url: raw.url,
    source: "game8",
    
    // 评价
    tier: raw.tier,
    deck_type: raw.deck_type === "展開型" ? "展开型" : raw.deck_type,
    difficulty: raw.difficulty === "普通" ? "普通" : raw.difficulty,
    cost: raw.cost === "中" ? "中" : raw.cost,
    
    // 特点
    features: [
      "容易做出 Lv6/8/10 同步的同步卡组",
      "以魔法陷阱作为 cost 送墓来展开是其特征",
      "完全没有召唤限制，可以和各种主题混合"
    ],
    
    // 基础知识
    basic_knowledge: raw.basic_knowledge,
    
    // 卡组配方
    main_deck: mainDeck,
    extra_deck: extraDeck,
    
    // 运营
    playstyle: raw.playstyle,
    
    // 展开
    combos: raw.combos,
    
    // 对策
    counters: raw.counters,
    
    // 手诱时机
    handtrap_timing: handtrapTiming,
    
    // 元数据
    updated_at: new Date().toISOString().split('T')[0]
  }
}

// 执行转换
const result = convertToAppFormat(rawData)

// 输出
const outputPath = path.join(__dirname, '../data/decks/game8-656291.json')
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')

console.log('✅ 已生成:', outputPath)
console.log(JSON.stringify(result, null, 2))

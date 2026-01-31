/**
 * 卡组攻略页面 - 增强版
 * 图文并茂，交互式展开，战场可视化
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  ArrowLeft, Loader2, ExternalLink, ChevronDown,
  BookOpen, Zap, Shield, Layers,
  Play, Info, AlertTriangle
} from 'lucide-react'
import GameField from '../components/GameField'
import ComboStep from '../components/ComboStep'

interface DeckCard {
  name_jp: string
  count: number
  game8_id: string
  id?: number
  name?: string
  name_cn?: string
  type?: string
  desc_cn?: string
  atk?: number
  def?: number
  level?: number
}

interface Section {
  title: string
  content: string
}

interface Game8Deck {
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

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'

// 日文术语翻译映射
const JP_TO_CN: Record<string, string> = {
  '白き森': '白森',
  'シンクロ': '同调',
  'チューナー': '调整',
  '特殊召喚': '特殊召唤',
  '召喚': '召唤',
  'サーチ': '检索',
  'デッキ': '卡组',
  'フィールド': '场上',
  '墓地': '墓地',
  '手札': '手卡',
  '効果': '效果',
  '発動': '发动',
  '送る': '送去',
  'モンスター': '怪兽',
  '魔法': '魔法',
  '罠': '陷阱',
  'リンク': '连接',
  'エクストラ': '额外',
  '表側': '表侧',
  '裏側': '里侧',
  '守備': '守备',
  '攻撃': '攻击',
  '対象': '对象',
  '無効': '无效',
  'ターン': '回合',
  '相手': '对方',
  '自分': '自己',
  'コスト': '费用',
}

// 简单翻译函数
function translateText(text: string): string {
  let result = text
  Object.entries(JP_TO_CN).forEach(([jp, cn]) => {
    result = result.replace(new RegExp(jp, 'g'), cn)
  })
  return result
}

// 从内容中解析 Combo 步骤
function parseComboSteps(content: string): { 
  before: string
  steps: { num: string; text: string }[]
  board: string
  required: string
  result: string
} {
  const steps: { num: string; text: string }[] = []
  const stepPattern = /([①②③④⑤⑥⑦⑧⑨⑩])\s*([\s\S]*?)(?=[①②③④⑤⑥⑦⑧⑨⑩]|$)/g
  
  let match
  while ((match = stepPattern.exec(content)) !== null) {
    const num = match[1]
    const text = match[2].trim()
    if (text.length > 5) {
      steps.push({ num, text })
    }
  }

  // 提取必要卡片和结果
  const requiredMatch = content.match(/必要カード[：:]?\s*([\s\S]*?)(?=作り出せる盤面|$)/i)
  const resultMatch = content.match(/作り出せる盤面[：:]?\s*([\s\S]*?)(?=手順|①|$)/i)
  const boardMatch = content.match(/盤面[：:]?\s*([\s\S]*?)(?=「|$)/i)
  
  const firstStepIndex = content.search(/[①②③④⑤⑥⑦⑧⑨⑩]/)
  const before = firstStepIndex > 0 ? content.slice(0, firstStepIndex).trim() : ''

  return {
    before,
    steps,
    board: boardMatch?.[1]?.trim() || '',
    required: requiredMatch?.[1]?.trim() || '',
    result: resultMatch?.[1]?.trim() || ''
  }
}

// 从文本提取最终场面的卡片
function parseEndBoard(content: string, cardMap: Map<string, DeckCard>): {
  monsters: DeckCard[]
  spells: DeckCard[]
  description: string
} {
  const monsters: DeckCard[] = []
  const spells: DeckCard[] = []
  
  // 查找盘面部分
  const boardSection = content.match(/盤面[：:]?\s*「([^」]+)」/g) || []
  
  // 从卡名映射中查找
  cardMap.forEach((card, name) => {
    if (content.includes(`「${name}」`) || content.includes(name)) {
      if (card.type?.includes('Monster') || card.type?.includes('Synchro') || card.type?.includes('Link')) {
        if (!monsters.find(c => c.id === card.id)) {
          monsters.push(card)
        }
      } else if (card.type?.includes('Spell') || card.type?.includes('Trap')) {
        if (!spells.find(c => c.id === card.id)) {
          spells.push(card)
        }
      }
    }
  })
  
  return { monsters, spells, description: boardSection.join(' ') }
}

export default function DeckGuidePage() {
  const { deckId } = useParams()
  const [deck, setDeck] = useState<Game8Deck | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0, 1, 2]))
  const [selectedCard, setSelectedCard] = useState<DeckCard | null>(null)

  useEffect(() => {
    async function loadDeck() {
      try {
        // 优先加载 enriched 版本
        let response = await fetch(`/data/decks/${deckId}-enriched.json`)
        if (!response.ok) {
          response = await fetch(`/data/decks/${deckId}.json`)
        }
        if (!response.ok) throw new Error('Deck not found')
        const data = await response.json()
        setDeck(data)
      } catch (err) {
        setError('卡组数据加载失败')
      } finally {
        setLoading(false)
      }
    }
    loadDeck()
  }, [deckId])

  // 构建卡名到卡片的映射
  const cardMap = useMemo(() => {
    const map = new Map<string, DeckCard>()
    if (!deck) return map
    
    ;[...deck.recipe.main_deck, ...deck.recipe.extra_deck].forEach(card => {
      map.set(card.name_jp, card)
      if (card.name) map.set(card.name, card)
      if (card.name_cn) map.set(card.name_cn, card)
    })
    
    return map
  }, [deck])

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-purple-500" size={48} />
      </div>
    )
  }

  if (error || !deck) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-900 flex flex-col items-center justify-center">
        <p className="text-red-400 text-lg mb-4">{error || '卡组未找到'}</p>
        <Link to="/decks" className="text-purple-400 hover:text-purple-300 flex items-center gap-2">
          <ArrowLeft size={20} />
          返回卡组列表
        </Link>
      </div>
    )
  }

  const mainTotal = deck.recipe.main_deck.reduce((sum, c) => sum + c.count, 0)
  const extraTotal = deck.recipe.extra_deck.reduce((sum, c) => sum + c.count, 0)

  // Section 图标和翻译映射
  const sectionConfig: Record<string, { icon: typeof BookOpen; title: string; color: string }> = {
    '基礎知識': { icon: BookOpen, title: '基础知识', color: 'blue' },
    '回し方': { icon: Play, title: '使用方法', color: 'purple' },
    '基本展開': { icon: Zap, title: '基本展开', color: 'yellow' },
    '対策': { icon: Shield, title: '克制方法', color: 'red' },
    '手札誘発のタイミング': { icon: AlertTriangle, title: '手坑时机', color: 'orange' },
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/10 to-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* Header */}
        <header className="mb-8">
          <Link 
            to="/decks" 
            className="inline-flex items-center gap-2 text-gray-400 hover:text-purple-400 transition-colors mb-6"
          >
            <ArrowLeft size={18} />
            <span>返回列表</span>
          </Link>
          
          <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 rounded-2xl p-6 border border-purple-500/20">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {deck.name_jp}
            </h1>
            
            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-full text-sm font-medium shadow-lg shadow-purple-500/20">
                {deck.evaluation.tier}
              </span>
              <span className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full text-sm font-medium">
                {translateText(deck.evaluation.deck_type)}
              </span>
              <span className="px-4 py-1.5 bg-gray-700 text-gray-200 rounded-full text-sm">
                难度: {deck.evaluation.difficulty}
              </span>
              <span className="px-4 py-1.5 bg-gray-700 text-gray-200 rounded-full text-sm">
                花费: {deck.evaluation.cost}
              </span>
            </div>

            {/* Features */}
            {deck.evaluation.features.length > 0 && (
              <div className="space-y-2">
                {deck.evaluation.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">✦</span>
                    <span className="text-gray-300">{translateText(f)}</span>
                  </div>
                ))}
              </div>
            )}

            <a 
              href={deck.source_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-sm text-purple-400 hover:text-purple-300 transition-colors"
            >
              <ExternalLink size={14} />
              Game8 原文
            </a>
          </div>
        </header>

        {/* Recipe - 卡组列表 */}
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Layers className="text-purple-400" size={24} />
            <h2 className="text-2xl font-bold text-white">卡组构成</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            {/* Main Deck */}
            <div className="bg-gray-800/60 backdrop-blur rounded-xl p-5 border border-gray-700/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-purple-300">主卡组</h3>
                <span className="bg-purple-600/30 text-purple-300 px-3 py-1 rounded-full text-sm font-medium">
                  {mainTotal}枚
                </span>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {deck.recipe.main_deck.map((card, i) => (
                  <button 
                    key={i} 
                    onClick={() => setSelectedCard(card)}
                    className="relative group"
                    title={card.name_cn || card.name_jp}
                  >
                    {card.id ? (
                      <img
                        src={`${R2_BASE}/cn/${card.id}.webp`}
                        alt={card.name_cn || card.name_jp}
                        className="w-full aspect-[59/86] object-cover rounded border-2 border-transparent group-hover:border-purple-500 transition-colors"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards_small/${card.id}.jpg`
                        }}
                      />
                    ) : (
                      <div className="w-full aspect-[59/86] bg-gray-700 rounded flex items-center justify-center">
                        <span className="text-gray-500 text-xs text-center px-1">{card.name_jp.slice(0, 4)}</span>
                      </div>
                    )}
                    {card.count > 1 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                        {card.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Extra Deck */}
            <div className="bg-gray-800/60 backdrop-blur rounded-xl p-5 border border-gray-700/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-blue-300">额外卡组</h3>
                <span className="bg-blue-600/30 text-blue-300 px-3 py-1 rounded-full text-sm font-medium">
                  {extraTotal}枚
                </span>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {deck.recipe.extra_deck.map((card, i) => (
                  <button 
                    key={i}
                    onClick={() => setSelectedCard(card)}
                    className="relative group"
                    title={card.name_cn || card.name_jp}
                  >
                    {card.id ? (
                      <img
                        src={`${R2_BASE}/cn/${card.id}.webp`}
                        alt={card.name_cn || card.name_jp}
                        className="w-full aspect-[59/86] object-cover rounded border-2 border-transparent group-hover:border-blue-500 transition-colors"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards_small/${card.id}.jpg`
                        }}
                      />
                    ) : (
                      <div className="w-full aspect-[59/86] bg-gray-700 rounded flex items-center justify-center">
                        <span className="text-gray-500 text-xs text-center px-1">{card.name_jp.slice(0, 4)}</span>
                      </div>
                    )}
                    {card.count > 1 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                        {card.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Sections */}
        <section className="space-y-4">
          {deck.sections.map((section, index) => {
            const config = sectionConfig[section.title] || { 
              icon: Info, 
              title: section.title,
              color: 'gray'
            }
            const Icon = config.icon
            const isExpanded = expandedSections.has(index)
            const isComboSection = section.title === '基本展開'
            const comboData = isComboSection ? parseComboSteps(section.content) : null
            
            return (
              <div 
                key={index} 
                className="bg-gray-800/60 backdrop-blur rounded-xl border border-gray-700/50 overflow-hidden"
              >
                <button
                  onClick={() => toggleSection(index)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 bg-${config.color}-600/20 rounded-lg`}>
                      <Icon className={`text-${config.color}-400`} size={20} />
                    </div>
                    <h2 className="text-xl font-bold text-white">{config.title}</h2>
                  </div>
                  <div className={`p-1 rounded-full transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown className="text-gray-400" size={24} />
                  </div>
                </button>
                
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-700/50">
                    {isComboSection && comboData && comboData.steps.length > 0 ? (
                      <div className="pt-4 space-y-6">
                        {/* 展开说明 */}
                        {comboData.before && (
                          <div className="text-gray-300 text-sm leading-relaxed">
                            {translateText(comboData.before)}
                          </div>
                        )}

                        {/* 战场可视化 */}
                        {comboData.result && (
                          <GameField
                            cards={[
                              // 根据结果解析场上的卡
                              ...parseEndBoard(section.content, cardMap).monsters.slice(0, 5).map((c, i) => ({
                                id: c.id,
                                name: c.name,
                                name_cn: c.name_cn,
                                zone: 'monster' as const,
                                position: i
                              })),
                              ...parseEndBoard(section.content, cardMap).spells.slice(0, 5).map((c, i) => ({
                                id: c.id,
                                name: c.name,
                                name_cn: c.name_cn,
                                zone: 'spell' as const,
                                position: i
                              }))
                            ]}
                            title="最终盘面"
                            description={translateText(comboData.result)}
                          />
                        )}

                        {/* Combo 步骤 */}
                        <ComboStep
                          steps={comboData.steps.map(s => ({
                            ...s,
                            textCn: translateText(s.text.split('\n')[0])
                          }))}
                          requiredCards={
                            comboData.required
                              ? comboData.required.split(/[＋+]/).map(name => {
                                  const trimmed = name.replace(/[「」]/g, '').trim()
                                  return cardMap.get(trimmed)
                                }).filter((c): c is DeckCard => !!c && !!c.id) as any
                              : undefined
                          }
                          resultBoard={translateText(comboData.result)}
                          allCards={cardMap as any}
                        />
                      </div>
                    ) : section.title === '手札誘発のタイミング' ? (
                      // 手坑时机特殊处理
                      <div className="pt-4 space-y-4">
                        {section.content.split(/「([^」]+)」/).filter((_, i) => i % 2 === 0).map((block, i) => {
                          if (!block.trim()) return null
                          const cardName = section.content.split(/「([^」]+)」/)[i * 2 + 1]
                          const card = cardName ? cardMap.get(cardName) : null
                          
                          return (
                            <div key={i} className="bg-gray-900/50 rounded-lg p-4">
                              {card && card.id && (
                                <div className="flex items-start gap-4 mb-3">
                                  <img
                                    src={`${R2_BASE}/cn/${card.id}.webp`}
                                    alt={card.name_cn || cardName}
                                    className="w-16 h-22 object-cover rounded shadow-lg"
                                  />
                                  <div>
                                    <h4 className="text-orange-400 font-medium">{card.name_cn || cardName}</h4>
                                    <p className="text-gray-400 text-sm mt-1">{translateText(block)}</p>
                                  </div>
                                </div>
                              )}
                              {!card && block.includes('【解説】') && (
                                <p className="text-gray-300 text-sm">
                                  {translateText(block.replace('【解説】', ''))}
                                </p>
                              )}
                            </div>
                          )
                        }).filter(Boolean)}
                      </div>
                    ) : (
                      // 普通 Section
                      <div className="pt-4 space-y-4">
                        {section.content.split(/\n\n+/).filter(p => p.trim()).map((para, i) => {
                          // 检查是否包含卡名
                          const cardNames = para.match(/「([^」]+)」/g) || []
                          const mentionedCards = cardNames
                            .map(name => cardMap.get(name.replace(/[「」]/g, '')))
                            .filter((c): c is DeckCard => !!c && !!c.id)

                          return (
                            <div key={i} className="space-y-3">
                              {mentionedCards.length > 0 && (
                                <div className="flex gap-2 flex-wrap">
                                  {mentionedCards.slice(0, 4).map((card, j) => (
                                    <button
                                      key={j}
                                      onClick={() => setSelectedCard(card)}
                                      className="flex items-center gap-2 bg-gray-900/50 rounded-lg p-2 hover:bg-gray-900/80 transition-colors"
                                    >
                                      <img
                                        src={`${R2_BASE}/cn/${card.id}.webp`}
                                        alt={card.name_cn}
                                        className="w-8 h-11 object-cover rounded"
                                      />
                                      <span className="text-gray-300 text-sm">{card.name_cn}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <p className="text-gray-300 leading-relaxed">
                                {translateText(para)}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </section>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-gray-500 text-sm">
            数据更新: {new Date(deck.scraped_at).toLocaleDateString('zh-CN')}
          </p>
        </footer>

        {/* Card Detail Modal */}
        {selectedCard && (
          <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCard(null)}
          >
            <div 
              className="bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex gap-4">
                  {selectedCard.id && (
                    <img
                      src={`${R2_BASE}/cn/${selectedCard.id}.webp`}
                      alt={selectedCard.name_cn || selectedCard.name_jp}
                      className="w-32 h-44 object-cover rounded-lg shadow-lg"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-1">
                      {selectedCard.name_cn || selectedCard.name_jp}
                    </h3>
                    <p className="text-gray-400 text-sm mb-2">{selectedCard.name_jp}</p>
                    {selectedCard.type && (
                      <span className="inline-block px-2 py-1 bg-purple-600/30 text-purple-300 rounded text-xs mb-2">
                        {selectedCard.type}
                      </span>
                    )}
                    {selectedCard.level && (
                      <p className="text-yellow-400 text-sm">★{selectedCard.level}</p>
                    )}
                    {(selectedCard.atk !== undefined || selectedCard.def !== undefined) && (
                      <p className="text-gray-300 text-sm">
                        ATK/{selectedCard.atk ?? '?'} DEF/{selectedCard.def ?? '?'}
                      </p>
                    )}
                  </div>
                </div>
                {selectedCard.desc_cn && (
                  <div className="mt-4 p-3 bg-gray-800 rounded-lg">
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedCard.desc_cn}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setSelectedCard(null)}
                  className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

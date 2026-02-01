/**
 * Markdown 格式卡组页面
 * 点击卡片弹出详情弹窗
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  ArrowLeft, Loader2, ExternalLink, ChevronDown, ChevronRight,
  Star, Layers, BookOpen, Play, Zap, Shield
} from 'lucide-react'
import { parseMarkdown } from '../utils/markdownParser'
import type { ParsedSection, ParsedContent } from '../utils/markdownParser'
import GameField from '../components/GameField'
import CardModal from '../components/CardModal'

interface CardInfo {
  id: number
  name: string
  name_cn: string
  desc_cn?: string
  type?: string
  atk?: number
  def?: number
  level?: number
  attribute?: string
  race?: string
}

// 目录配置
const SECTION_CONFIG: Record<string, { icon: typeof Star; color: string; title: string }> = {
  '評価': { icon: Star, title: '评价', color: 'yellow' },
  'レシピ': { icon: Layers, title: '卡组列表', color: 'purple' },
  '基礎知識': { icon: BookOpen, title: '基础知识', color: 'blue' },
  '回し方': { icon: Play, title: '使用方法', color: 'green' },
  '展開': { icon: Zap, title: '展开 Combo', color: 'orange' },
  '対策と手札誘発のタイミング': { icon: Shield, title: '克制与手坑', color: 'red' },
}

// Game8 ID → 卡片 ID 映射
const GAME8_TO_CARD: Record<string, number> = {
  '435980': 14558127, '435145': 23434538, '433232': 97268402,
  '642616': 25592142, '642618': 98385955, '629962': 69925461,
  '629958': 65504487, '642617': 61980241, '642619': 24779554,
  '429589': 65681983, '429215': 24224830, '629978': 24878656,
  '642672': 99289828, '429342': 33907039, '598455': 88901994,
  '642673': 35778533, '429818': 10045474, '580482': 18158393,
  '642689': 62995268, '447045': 84815190, '430394': 4280258,
  '430374': 98127546, '431753': 50954680, '430271': 65741786,
  '544193': 22850702, '580476': 821049, '593480': 63436931,
  '607493': 29301450, '642644': 14307929, '431941': 50091196,
  '642646': 41924516, '642645': 77313225, '431918': 99115354,
  '431826': 64880894,
  // 克制卡（修正映射）
  '427462': 24299458,  // 禁忌的一滴
  '427601': 82732705,  // 技能抽取
  '435783': 94145021,  // 抽牌小丑与封锁鸟
  '427496': 83326048,  // 次元障壁
  '427279': 23516703,  // 召唤限制器
  '427805': 17078030,  // センサー万別
}

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'

export default function MarkdownDeckPage() {
  const { deckId } = useParams()
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['評価', 'レシピ', '基礎知識', '回し方', '展開', '対策と手札誘発のタイミング'])
  )
  const [cards, setCards] = useState<CardInfo[]>([])
  const [selectedCard, setSelectedCard] = useState<CardInfo | null>(null)

  useEffect(() => {
    fetch('/data/cards.json')
      .then(res => res.json())
      .then(data => setCards(data))
      .catch(err => console.error('Failed to load cards:', err))
  }, [])

  const cardIndex = useMemo(() => {
    const index = new Map<string, CardInfo>()
    Object.entries(GAME8_TO_CARD).forEach(([game8Id, cardId]) => {
      const card = cards.find(c => c.id === cardId)
      if (card) {
        index.set(game8Id, card)
        index.set(card.name, card)
        if (card.name_cn) index.set(card.name_cn, card)
      }
    })
    return index
  }, [cards])

  useEffect(() => {
    async function loadMarkdown() {
      try {
        const response = await fetch(`/data/decks/${deckId}.md`)
        if (!response.ok) throw new Error('Deck not found')
        const text = await response.text()
        setMarkdown(text)
      } catch (err) {
        setError('卡组数据加载失败')
      } finally {
        setLoading(false)
      }
    }
    loadMarkdown()
  }, [deckId])

  const parsed = useMemo(() => {
    if (!markdown) return null
    return parseMarkdown(markdown)
  }, [markdown])

  const toggleSection = (title: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  // 渲染可点击的卡片标签
  const CardTag = ({ card }: { card: CardInfo }) => (
    <button
      onClick={() => setSelectedCard(card)}
      className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 px-1 rounded transition-colors cursor-pointer"
    >
      {card.name_cn}
    </button>
  )

  // 渲染带卡片标记和粗体的文本
  const renderText = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    let key = 0
    
    const combinedPattern = /(\[\[card:([^|\]]+)\|?(\d*)\]\])|(\*\*([^*]+)\*\*)/g
    let lastIndex = 0
    let match
    
    while ((match = combinedPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }
      
      if (match[1]) {
        const name = match[2]
        const id = match[3]
        const card = cardIndex.get(id) || cardIndex.get(name)
        
        if (card) {
          parts.push(<CardTag key={key++} card={card} />)
        } else {
          parts.push(<span key={key++} className="text-purple-400">{name}</span>)
        }
      } else if (match[4]) {
        const boldContent = match[5]
        const innerParts = renderText(boldContent)
        parts.push(
          <strong key={key++} className="text-white font-semibold">
            {innerParts}
          </strong>
        )
      }
      
      lastIndex = match.index + match[0].length
    }
    
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }
    
    return parts.length > 0 ? parts : [text]
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-purple-500" size={48} />
      </div>
    )
  }

  if (error || !parsed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <p className="text-red-400 text-lg mb-4">{error || '卡组未找到'}</p>
        <Link to="/decks" className="text-purple-400 hover:text-purple-300 flex items-center gap-2">
          <ArrowLeft size={20} /> 返回
        </Link>
      </div>
    )
  }

  // 渲染内容
  const renderContent = (content: ParsedContent, key: number, sectionTitle: string) => {
    switch (content.type) {
      case 'text': {
        const text = content.text || ''
        if (text.startsWith('####')) {
          const titleText = text.replace(/^####\s*/, '')
          return (
            <h4 key={key} className="text-base font-semibold text-purple-300 mt-4 mb-2">
              {renderText(titleText)}
            </h4>
          )
        }
        return (
          <p key={key} className="text-gray-300 leading-relaxed mb-3">
            {renderText(text)}
          </p>
        )
      }
      
      case 'list': {
        const isCardList = sectionTitle === 'レシピ' && content.items?.some(i => i.includes('[[card:'))
        
        if (isCardList) {
          return (
            <div key={key} className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2 mb-4">
              {content.items?.map((item, i) => {
                const match = item.match(/\[\[card:([^|\]]+)\|?(\d*)\]\]/)
                const countMatch = item.match(/×(\d+)/)
                if (match) {
                  const card = cardIndex.get(match[2]) || cardIndex.get(match[1])
                  const count = countMatch ? parseInt(countMatch[1]) : 1
                  if (card) {
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedCard(card)}
                        className="relative group text-left"
                      >
                        <img
                          src={`${R2_BASE}/cn/${card.id}.webp`}
                          alt={card.name_cn}
                          className="w-full aspect-[59/86] object-cover rounded border border-gray-700 group-hover:border-purple-500 transition-colors"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards_small/${card.id}.jpg`
                          }}
                        />
                        {count > 1 && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                            {count}
                          </span>
                        )}
                        <p className="text-[10px] text-gray-400 text-center mt-1 truncate">
                          {card.name_cn}
                        </p>
                      </button>
                    )
                  }
                }
                return null
              })}
            </div>
          )
        }
        
        return (
          <ul key={key} className="space-y-2 mb-4">
            {content.items?.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-300">
                <span className="text-purple-400 mt-1">•</span>
                <span>{renderText(item)}</span>
              </li>
            ))}
          </ul>
        )
      }
      
      case 'quote': {
        const text = content.text || ''
        const hasStepNum = /[①②③④⑤⑥⑦⑧⑨⑩]/.test(text)
        
        if (hasStepNum) {
          return (
            <div key={key} className="bg-gradient-to-r from-gray-800/80 to-gray-800/40 rounded-xl p-4 mb-3 border-l-4 border-purple-500">
              {text.split('\n').map((line, i) => {
                const stepMatch = line.match(/\*\*([①②③④⑤⑥⑦⑧⑨⑩])\s*([^*]*)\*\*/) || line.match(/^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)/)
                if (stepMatch) {
                  return (
                    <div key={i} className="flex gap-3 mb-2">
                      <span className="flex-shrink-0 w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {stepMatch[1]}
                      </span>
                      <p className="text-gray-200 pt-0.5">{renderText(stepMatch[2])}</p>
                    </div>
                  )
                }
                if (line.trim().startsWith('→')) {
                  return (
                    <p key={i} className="text-purple-300 pl-10 mb-1 text-sm">
                      {renderText(line)}
                    </p>
                  )
                }
                if (line.trim()) {
                  return <p key={i} className="text-gray-300 pl-10">{renderText(line)}</p>
                }
                return null
              })}
            </div>
          )
        }
        
        return (
          <blockquote key={key} className="border-l-4 border-blue-500 pl-4 py-2 my-3 bg-blue-900/20 rounded-r-lg">
            <p className="text-gray-200">{renderText(text)}</p>
          </blockquote>
        )
      }
      
      case 'table': {
        if (!content.rows || content.rows.length === 0) return null
        const headers = Object.keys(content.rows[0])
        return (
          <div key={key} className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-gray-700 rounded-lg overflow-hidden">
              <thead className="bg-gray-800">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="text-left py-3 px-4 text-gray-300 font-medium">
                      {renderText(content.rows?.[0][h] || '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {content.rows.slice(1).map((row, i) => (
                  <tr key={i} className="border-t border-gray-700 hover:bg-gray-800/50">
                    {headers.map((h, j) => (
                      <td key={j} className="py-3 px-4 text-gray-300">
                        {renderText(row[h] || '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      
      case 'field': {
        const fieldCards = parseFieldCode(content.code || '', cardIndex, setSelectedCard)
        return (
          <div key={key} className="my-4">
            <GameField cards={fieldCards} title="最终盘面" onCardClick={setSelectedCard} />
          </div>
        )
      }
      
      default:
        return null
    }
  }

  const renderSubSection = (section: ParsedSection, key: number, parentTitle: string) => {
    return (
      <div key={key} className="mb-6">
        <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <span className="w-1 h-5 bg-purple-500 rounded"></span>
          {section.title}
        </h3>
        {section.content.map((content, i) => renderContent(content, i, parentTitle))}
      </div>
    )
  }

  const h1Section = parsed.sections.find(s => s.level === 1)
  const title = h1Section?.title || parsed.meta.deckName || '卡组'
  const orderedSections = ['評価', 'レシピ', '基礎知識', '回し方', '展開', '対策と手札誘発のタイミング']

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/10 to-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* Header */}
        <header className="mb-8">
          <Link to="/decks" className="inline-flex items-center gap-2 text-gray-400 hover:text-purple-400 transition-colors mb-6">
            <ArrowLeft size={18} /> 返回列表
          </Link>
          
          <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 rounded-2xl p-6 border border-purple-500/20">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">{title}</h1>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {parsed.meta.tier && (
                <span className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-full text-sm font-medium">
                  {parsed.meta.tier}
                </span>
              )}
              {parsed.meta.deckType && (
                <span className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full text-sm font-medium">
                  {parsed.meta.deckType}
                </span>
              )}
              {parsed.meta.difficulty && (
                <span className="px-4 py-1.5 bg-gray-700 text-gray-200 rounded-full text-sm">
                  难度: {parsed.meta.difficulty}
                </span>
              )}
              {parsed.meta.cost && (
                <span className="px-4 py-1.5 bg-gray-700 text-gray-200 rounded-full text-sm">
                  花费: {parsed.meta.cost}
                </span>
              )}
            </div>

            {parsed.meta.source && (
              <a href={parsed.meta.source} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors">
                <ExternalLink size={14} /> Game8 原文
              </a>
            )}
          </div>
        </header>

        {/* Sections */}
        <div className="space-y-4">
          {orderedSections.map(sectionKey => {
            const section = parsed.sections.find(s => s.level === 2 && s.title === sectionKey)
            if (!section) return null
            
            const config = SECTION_CONFIG[sectionKey] || { icon: BookOpen, title: sectionKey, color: 'gray' }
            const Icon = config.icon
            const isExpanded = expandedSections.has(sectionKey)
            
            const sectionIndex = parsed.sections.indexOf(section)
            const subSections: ParsedSection[] = []
            for (let i = sectionIndex + 1; i < parsed.sections.length; i++) {
              const s = parsed.sections[i]
              if (s.level === 2) break
              if (s.level === 3) subSections.push(s)
            }
            
            return (
              <div key={sectionKey} className="bg-gray-800/60 backdrop-blur rounded-xl border border-gray-700/50 overflow-hidden">
                <button
                  onClick={() => toggleSection(sectionKey)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gray-700/50">
                      <Icon className="text-purple-400" size={20} />
                    </div>
                    <h2 className="text-xl font-bold text-white">{config.title}</h2>
                  </div>
                  {isExpanded ? <ChevronDown className="text-gray-400" size={24} /> : <ChevronRight className="text-gray-400" size={24} />}
                </button>
                
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-700/50">
                    <div className="pt-4">
                      {section.content.map((content, i) => renderContent(content, i, sectionKey))}
                      {subSections.map((sub, i) => renderSubSection(sub, i, sectionKey))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

      </div>

      {/* Card Modal */}
      <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  )
}

function parseFieldCode(code: string, cardIndex: Map<string, CardInfo>, _onCardClick?: (card: CardInfo) => void): any[] {
  const cards: any[] = []
  const lines = code.split('\n')
  
  lines.forEach(line => {
    const zone = line.includes('怪兽区') ? 'monster' : line.includes('魔陷区') || line.includes('后排') ? 'spell' : null
    if (!zone) return
    
    const matches = line.matchAll(/\[\[card:([^|\]]+)\|?(\d*)\]\]/g)
    let pos = 0
    for (const match of matches) {
      const card = cardIndex.get(match[2]) || cardIndex.get(match[1])
      if (card) {
        cards.push({ id: card.id, name: card.name, name_cn: card.name_cn, zone, position: pos, card })
      }
      pos++
    }
  })
  
  return cards
}

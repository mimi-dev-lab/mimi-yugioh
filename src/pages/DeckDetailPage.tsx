import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Layers, Zap, ExternalLink, Loader2, Target, Lightbulb, Swords, ChevronDown, ChevronUp } from 'lucide-react'
import CardModal from '../components/CardModal'

interface DeckCard {
  id: number
  name: string
  name_cn: string
  count: number
  role: string
  link?: number
}

interface Combo {
  name: string
  situation: string
  steps: string[]
  result: string
}

interface Deck {
  id: string
  name: string
  name_en: string
  category: string
  difficulty: string
  description: string
  author: string
  source_url: string
  version: string
  philosophy: {
    core_concept: string
    win_condition: string
    key_mechanic: string
  }
  main_deck: DeckCard[]
  extra_deck: DeckCard[]
  combos: Combo[]
  tips: {
    basic: string[]
    advanced: string[]
    deckbuilding: string[]
  }
  matchup: {
    position: string
    strengths: string[]
    vs_handtraps: Record<string, string>
    going_first: string
    going_second: string
  }
  card_analysis: Record<string, { why_important: string; synergy?: string; notes?: string }>
}

export default function DeckDetailPage() {
  const { deckId } = useParams()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCombo, setExpandedCombo] = useState<number | null>(0)
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'deckbuilding'>('basic')
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null)

  useEffect(() => {
    async function loadDeck() {
      try {
        const response = await fetch(`/data/decks/${deckId}.json`)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-ygo-accent" size={40} />
      </div>
    )
  }

  if (error || !deck) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">{error || '卡组未找到'}</p>
        <Link to="/decks" className="text-ygo-accent hover:underline mt-4 inline-block">
          返回卡组列表
        </Link>
      </div>
    )
  }

  const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'
  const YGOPRODECK_BASE = 'https://images.ygoprodeck.com/images/cards_small'

  const getCardImageUrl = (id: number) => {
    return `${R2_BASE}/cn/${id}.webp`
  }

  const mainDeckCount = deck.main_deck.reduce((sum, c) => sum + c.count, 0)
  const extraDeckCount = deck.extra_deck.reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back Button */}
      <Link 
        to="/decks" 
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={18} />
        返回卡组
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-3xl font-bold text-white">{deck.name}</h1>
          <span className="text-gray-400">{deck.name_en}</span>
          <span className={`px-3 py-1 rounded-lg text-sm ${
            deck.category === 'T1' 
              ? 'bg-red-500/20 text-red-400'
              : deck.category === 'T2'
              ? 'bg-orange-500/20 text-orange-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}>
            {deck.category}
          </span>
          <span className="px-3 py-1 rounded-lg text-sm bg-gray-700 text-gray-300">
            {deck.difficulty}
          </span>
        </div>
        <p className="text-gray-400 mb-2">{deck.description}</p>
        <p className="text-gray-500 text-sm">版本: {deck.version}</p>
        {deck.source_url && (
          <a 
            href={deck.source_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-ygo-accent hover:underline text-sm mt-2"
          >
            来源: {deck.author} <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* Philosophy */}
      <div className="p-4 bg-gradient-to-r from-ygo-dark to-gray-900 rounded-xl border border-gray-700 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Target className="text-ygo-accent" size={20} />
          <h2 className="text-lg font-bold text-white">卡组理念</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <div className="text-gray-400 text-sm mb-1">核心概念</div>
            <div className="text-white">{deck.philosophy.core_concept}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm mb-1">获胜条件</div>
            <div className="text-white">{deck.philosophy.win_condition}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm mb-1">关键机制</div>
            <div className="text-ygo-gold">{deck.philosophy.key_mechanic}</div>
          </div>
        </div>
      </div>

      {/* Deck List */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Main Deck */}
        <div className="p-4 bg-ygo-dark rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="text-ygo-accent" size={20} />
            <h2 className="text-lg font-bold text-white">主卡组</h2>
            <span className="text-gray-500 text-sm">({mainDeckCount} 张)</span>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {deck.main_deck.map((card, i) => (
              <button 
                key={i}
                onClick={() => setSelectedCardId(card.id)}
                className="w-full flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-left"
              >
                <img 
                  src={getCardImageUrl(card.id)}
                  alt={card.name_cn}
                  className="w-10 h-14 object-cover rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `${YGOPRODECK_BASE}/${card.id}.jpg`
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-200 truncate">{card.name_cn}</div>
                  <div className="text-gray-500 text-xs">{card.role}</div>
                </div>
                <span className="text-ygo-accent font-mono">×{card.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Extra Deck */}
        <div className="p-4 bg-ygo-dark rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="text-purple-400" size={20} />
            <h2 className="text-lg font-bold text-white">额外卡组</h2>
            <span className="text-gray-500 text-sm">({extraDeckCount} 张)</span>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {deck.extra_deck.map((card, i) => (
              <button 
                key={i}
                onClick={() => setSelectedCardId(card.id)}
                className="w-full flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-left"
              >
                <img 
                  src={getCardImageUrl(card.id)}
                  alt={card.name_cn}
                  className="w-10 h-14 object-cover rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `${YGOPRODECK_BASE}/${card.id}.jpg`
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-200 truncate">{card.name_cn}</div>
                  <div className="text-gray-500 text-xs">
                    {card.link && `LINK-${card.link} · `}{card.role}
                  </div>
                </div>
                <span className="text-purple-400 font-mono">×{card.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Combos */}
      <div className="p-4 bg-ygo-dark rounded-xl border border-gray-700 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="text-yellow-400" size={20} />
          <h2 className="text-lg font-bold text-white">Combo 连招</h2>
        </div>
        <div className="space-y-3">
          {deck.combos.map((combo, i) => (
            <div key={i} className="border border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedCombo(expandedCombo === i ? null : i)}
                className="w-full flex items-center justify-between p-3 bg-gray-800/50 hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-yellow-500/20 text-yellow-400 rounded-full flex items-center justify-center text-sm">
                    {i + 1}
                  </span>
                  <div className="text-left">
                    <div className="text-white font-medium">{combo.name}</div>
                    <div className="text-gray-500 text-xs">{combo.situation}</div>
                  </div>
                </div>
                {expandedCombo === i ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
              </button>
              {expandedCombo === i && (
                <div className="p-4 border-t border-gray-700">
                  <ol className="space-y-2 mb-3">
                    {combo.steps.map((step, j) => (
                      <li key={j} className="flex gap-3 text-gray-300">
                        <span className="flex-shrink-0 w-5 h-5 bg-ygo-accent/20 text-ygo-accent rounded-full flex items-center justify-center text-xs">
                          {j + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <Target size={14} />
                    <span>结果: {combo.result}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="p-4 bg-ygo-dark rounded-xl border border-gray-700 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="text-blue-400" size={20} />
          <h2 className="text-lg font-bold text-white">使用技巧</h2>
        </div>
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(['basic', 'advanced', 'deckbuilding'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === tab
                  ? 'bg-ygo-accent text-black'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {tab === 'basic' ? '基础操作' : tab === 'advanced' ? '进阶技巧' : '构筑思路'}
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {deck.tips[activeTab].map((tip, i) => (
            <li key={i} className="flex gap-2 text-gray-300">
              <span className="text-blue-400 flex-shrink-0">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Matchup */}
      <div className="p-4 bg-ygo-dark rounded-xl border border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <Swords className="text-red-400" size={20} />
          <h2 className="text-lg font-bold text-white">对局指南</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="text-gray-400 text-sm mb-1">环境定位</div>
            <div className="text-white">{deck.matchup.position}</div>
          </div>
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="text-gray-400 text-sm mb-1">擅长对抗</div>
            <div className="text-green-400">{deck.matchup.strengths.join('、')}</div>
          </div>
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="text-gray-400 text-sm mb-1">先手策略</div>
            <div className="text-white">{deck.matchup.going_first}</div>
          </div>
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <div className="text-gray-400 text-sm mb-1">后手策略</div>
            <div className="text-white">{deck.matchup.going_second}</div>
          </div>
        </div>
        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="text-gray-400 text-sm mb-2">手坑应对</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(deck.matchup.vs_handtraps).map(([handtrap, response]) => (
              <div key={handtrap} className="text-sm">
                <span className="text-orange-400">{handtrap}:</span>{' '}
                <span className="text-gray-300">{response}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card Modal */}
      <CardModal cardId={selectedCardId} onClose={() => setSelectedCardId(null)} />
    </div>
  )
}

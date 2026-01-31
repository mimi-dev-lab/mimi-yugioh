import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  ArrowLeft, Loader2, ExternalLink, ChevronDown,
  BookOpen, Zap, Target, Shield, Sparkles, Layers
} from 'lucide-react'

interface DeckCard {
  name_jp: string
  count: number
  game8_id: string
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
  raw_markdown?: string
  scraped_at: string
}

// Section 图标映射
const sectionIcons: Record<string, typeof BookOpen> = {
  '基礎知識': BookOpen,
  '回し方': Zap,
  '基本展開': Target,
  '対策': Shield,
  '手札誘発のタイミング': Sparkles,
}

// 解析展开步骤
function parseComboSteps(content: string): { before: string; steps: { num: string; text: string }[]; after: string } {
  const steps: { num: string; text: string }[] = []
  
  // 查找 ①②③... 格式的步骤
  const stepPattern = /([①②③④⑤⑥⑦⑧⑨⑩])\s*\n?([\s\S]*?)(?=[①②③④⑤⑥⑦⑧⑨⑩]|モンスター効果|$)/g
  let match
  
  while ((match = stepPattern.exec(content)) !== null) {
    const num = match[1]
    const text = match[2].trim()
    if (text.length > 5) {
      steps.push({ num, text })
    }
  }
  
  // 分离步骤前后的内容
  const firstStepIndex = content.search(/[①②③④⑤⑥⑦⑧⑨⑩]/)
  const before = firstStepIndex > 0 ? content.slice(0, firstStepIndex).trim() : ''
  
  const after = ''
  
  return { before, steps, after }
}

// 格式化内容为段落
function formatContent(content: string): string[] {
  return content
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

export default function Game8DeckPage() {
  const { deckId } = useParams()
  const [deck, setDeck] = useState<Game8Deck | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0, 1, 2]))

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
                {deck.evaluation.deck_type}
              </span>
              <span className="px-4 py-1.5 bg-gray-700 text-gray-200 rounded-full text-sm">
                難易度: {deck.evaluation.difficulty}
              </span>
              <span className="px-4 py-1.5 bg-gray-700 text-gray-200 rounded-full text-sm">
                コスト: {deck.evaluation.cost}
              </span>
            </div>

            {/* Features */}
            {deck.evaluation.features.length > 0 && (
              <div className="space-y-2">
                {deck.evaluation.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">✦</span>
                    <span className="text-gray-300">{f}</span>
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
              Game8 で見る
            </a>
          </div>
        </header>

        {/* Recipe */}
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Layers className="text-purple-400" size={24} />
            <h2 className="text-2xl font-bold text-white">デッキレシピ</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            {/* Main Deck */}
            <div className="bg-gray-800/60 backdrop-blur rounded-xl p-5 border border-gray-700/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-purple-300">メインデッキ</h3>
                <span className="bg-purple-600/30 text-purple-300 px-3 py-1 rounded-full text-sm font-medium">
                  {mainTotal}枚
                </span>
              </div>
              <div className="space-y-2">
                {deck.recipe.main_deck.map((card, i) => (
                  <div 
                    key={i} 
                    className="flex justify-between items-center bg-gray-900/50 hover:bg-gray-900/80 rounded-lg px-4 py-2.5 transition-colors cursor-pointer group"
                  >
                    <span className="text-gray-200 group-hover:text-white transition-colors">
                      {card.name_jp}
                    </span>
                    <span className="bg-purple-600/40 text-purple-200 px-2.5 py-0.5 rounded-md text-sm font-medium">
                      ×{card.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Extra Deck */}
            <div className="bg-gray-800/60 backdrop-blur rounded-xl p-5 border border-gray-700/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-blue-300">エクストラデッキ</h3>
                <span className="bg-blue-600/30 text-blue-300 px-3 py-1 rounded-full text-sm font-medium">
                  {extraTotal}枚
                </span>
              </div>
              <div className="space-y-2">
                {deck.recipe.extra_deck.map((card, i) => (
                  <div 
                    key={i} 
                    className="flex justify-between items-center bg-gray-900/50 hover:bg-gray-900/80 rounded-lg px-4 py-2.5 transition-colors cursor-pointer group"
                  >
                    <span className="text-gray-200 group-hover:text-white transition-colors">
                      {card.name_jp}
                    </span>
                    <span className="bg-blue-600/40 text-blue-200 px-2.5 py-0.5 rounded-md text-sm font-medium">
                      ×{card.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Sections */}
        <section className="space-y-4">
          {deck.sections.map((section, index) => {
            const Icon = sectionIcons[section.title] || BookOpen
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
                    <div className="p-2 bg-purple-600/20 rounded-lg">
                      <Icon className="text-purple-400" size={20} />
                    </div>
                    <h2 className="text-xl font-bold text-white">{section.title}</h2>
                  </div>
                  <div className={`p-1 rounded-full transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown className="text-gray-400" size={24} />
                  </div>
                </button>
                
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-700/50">
                    {isComboSection && comboData && comboData.steps.length > 0 ? (
                      <div className="pt-4">
                        {/* 展开前的说明 */}
                        {comboData.before && (
                          <div className="mb-6 space-y-3">
                            {formatContent(comboData.before).map((p, i) => (
                              <p key={i} className="text-gray-300 leading-relaxed">{p}</p>
                            ))}
                          </div>
                        )}
                        
                        {/* 展开步骤 */}
                        <div className="space-y-3">
                          {comboData.steps.map((step, i) => (
                            <div 
                              key={i}
                              className="flex gap-4 bg-gradient-to-r from-gray-900/80 to-gray-900/40 rounded-xl p-4 border-l-4 border-purple-500"
                            >
                              <div className="flex-shrink-0 w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                                {step.num}
                              </div>
                              <div className="flex-1 pt-1.5">
                                <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">
                                  {step.text.split('\n').map((line, j) => (
                                    <span key={j}>
                                      {line.startsWith('→') ? (
                                        <span className="text-purple-300">{line}</span>
                                      ) : line}
                                      {j < step.text.split('\n').length - 1 && <br />}
                                    </span>
                                  ))}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4 space-y-4">
                        {formatContent(section.content).map((para, i) => (
                          <p key={i} className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {para}
                          </p>
                        ))}
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
            データ取得日: {new Date(deck.scraped_at).toLocaleDateString('ja-JP')}
          </p>
        </footer>
      </div>
    </div>
  )
}

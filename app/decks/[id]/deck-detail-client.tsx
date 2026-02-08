'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { 
  ArrowLeft, ExternalLink, Layers, Sparkles, Shield, 
  BookOpen, Swords, Wand2, Zap, ChevronDown, ChevronRight,
  Target, Lightbulb, Play, Crown
} from 'lucide-react'
import { CardDetailModal, type Card as ModalCard } from '@/components/CardDetailModal'
import { ComboSimulator } from '@/components/ComboSimulator'

interface Card {
  id: number
  name_cn: string | null
  name_jp: string | null
  name_en: string
  card_type: string
  sub_type: string | null
  attribute: string | null
  race: string | null
  level: number | null
  atk: number | null
  def: number | null
  desc_cn: string | null
  desc_jp: string | null
  desc_en: string
  archetype: string | null
  banlist_ocg: string | null
}

interface DeckCard {
  id: string
  card_id: number
  zone: 'main' | 'extra' | 'side'
  count: number
  card: Card
}

interface Combo {
  name: string
  difficulty?: number
  starting_hand?: string[]
  steps?: string[] | { action: string; card?: string; card_cn?: string; effect?: string }[]
  end_board?: string | { field?: string[]; set?: string[]; graveyard?: string[] }
  counter_play?: string
  weaknesses?: string[]
}

interface Matchup {
  opponent: string
  winrate?: string
  going_first?: string
  going_second?: string
  key_cards?: string
  strategy?: string
  notes?: string
}

interface StartingHand {
  cards: string[]
  result: string
  description?: string
}

interface BadHand {
  cards: string[]
  suggestion?: string
}

interface StartingHands {
  ideal?: StartingHand[]
  acceptable?: StartingHand[]
  bad?: BadHand[]
}

interface Tip {
  title?: string
  content: string
}

interface DeckNotes {
  playstyle?: string
  combos?: Combo[]
  starting_hands?: StartingHands
  tech_choices?: string
  matchups?: Matchup[]
  tips?: (string | Tip)[]
}

interface Deck {
  id: string
  name: string
  description: string | null
  source_url: string | null
  source_text: string | null
  cover_card_id: number | null
  cover_card: Card | null
  notes: DeckNotes | null
  main_deck: DeckCard[]
  extra_deck: DeckCard[]
  side_deck: DeckCard[]
}

// 属性中文
const ATTR_CN: Record<string, string> = {
  DARK: '暗', LIGHT: '光', EARTH: '地', WATER: '水', FIRE: '炎', WIND: '风', DIVINE: '神'
}

type TabType = 'deck' | 'combo' | 'starting' | 'matchups'

export function DeckDetailClient({ deckId }: { deckId: string }) {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewCard, setPreviewCard] = useState<Card | null>(null)
  const [expandedCombo, setExpandedCombo] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('deck')
  const [showCoverPicker, setShowCoverPicker] = useState(false)

  useEffect(() => {
    fetchDeck()
  }, [deckId])

  async function fetchDeck() {
    try {
      const res = await fetch(`/api/decks/${deckId}`)
      if (res.ok) {
        const data = await res.json()
        setDeck(data)
      }
    } catch (error) {
      console.error('Failed to fetch deck:', error)
    } finally {
      setLoading(false)
    }
  }

  function getCardImageUrl(cardId: number): string {
    return `/card-images/cn/${cardId}.webp`
  }

  async function updateCover(cardId: number) {
    try {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_card_id: cardId })
      })
      if (res.ok) {
        // 重新获取卡组数据
        fetchDeck()
        setShowCoverPicker(false)
      }
    } catch (error) {
      console.error('Failed to update cover:', error)
    }
  }

  function getCardName(card: Card): string {
    return card.name_cn || card.name_jp || card.name_en
  }

  function getTotalCount(deckCards: DeckCard[]): number {
    return deckCards.reduce((sum, dc) => sum + dc.count, 0)
  }

  // 按类型分组卡片
  function groupByType(deckCards: DeckCard[]): { monsters: DeckCard[]; spells: DeckCard[]; traps: DeckCard[] } {
    const monsters: DeckCard[] = []
    const spells: DeckCard[] = []
    const traps: DeckCard[] = []
    
    deckCards.forEach(dc => {
      const type = dc.card.card_type || ''
      if (type.includes('Spell')) spells.push(dc)
      else if (type.includes('Trap')) traps.push(dc)
      else monsters.push(dc)
    })
    
    return { monsters, spells, traps }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!deck) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-amber-200">
        <p className="text-xl mb-4">卡组不存在</p>
        <Link href="/decks" className="text-amber-500 hover:underline">返回卡组列表</Link>
      </div>
    )
  }

  const mainCount = getTotalCount(deck.main_deck)
  const extraCount = getTotalCount(deck.extra_deck)
  const sideCount = getTotalCount(deck.side_deck)
  const mainGrouped = groupByType(deck.main_deck)
  const notes = deck.notes || {}

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-amber-50">
      {/* 魔法阵背景 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-[0.03]">
          <div className="absolute inset-0 border border-amber-500/30 rounded-full animate-spin" style={{ animationDuration: '120s' }} />
        </div>
      </div>

      {/* 顶部导航 */}
      <nav className="sticky top-0 z-40 bg-black/90 backdrop-blur-md border-b border-amber-900/30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/decks" className="text-amber-200/60 hover:text-amber-200 flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> 卡组列表
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-amber-200/60">主{mainCount}</span>
            <span className="text-purple-400/60">额{extraCount}</span>
            <span className="text-blue-400/60">副{sideCount}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* 卡组头部 */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          {/* 封面 */}
          <div 
            className="w-40 h-56 flex-shrink-0 mx-auto md:mx-0 relative group cursor-pointer"
            onClick={() => setShowCoverPicker(true)}
          >
            {deck.cover_card_id ? (
              <img
                src={getCardImageUrl(deck.cover_card_id)}
                alt="封面"
                className="w-full h-full object-cover rounded-lg shadow-2xl"
              />
            ) : (
              <div className="w-full h-full bg-amber-900/20 rounded-lg flex items-center justify-center">
                <Crown className="w-12 h-12 text-amber-200/20" />
              </div>
            )}
            {/* 编辑遮罩 */}
            <div className="absolute inset-0 bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-amber-200 text-sm font-medium">点击更换</span>
            </div>
          </div>

          {/* 信息 */}
          <div className="flex-1">
            <h1 className="text-3xl font-black text-amber-200 mb-2">{deck.name}</h1>
            
            {deck.source_url && (
              <a 
                href={deck.source_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-amber-500 hover:text-amber-400 mb-4"
              >
                <ExternalLink className="w-4 h-4" />
                查看原文
              </a>
            )}

            {/* 打法思路（核心展示） */}
            {notes.playstyle && (
              <div className="bg-gradient-to-r from-amber-950/30 to-transparent border-l-4 border-amber-500 pl-4 py-3 mt-4">
                <h3 className="text-sm font-bold text-amber-400 mb-1 flex items-center gap-1">
                  <Target className="w-4 h-4" /> 打法思路
                </h3>
                <p className="text-amber-100/80 text-sm leading-relaxed">{notes.playstyle}</p>
              </div>
            )}
          </div>
        </div>

        {/* Tab 导航 */}
        <div className="flex gap-1 mb-6 border-b border-amber-900/30 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {[
            { id: 'deck' as TabType, label: '卡组列表', icon: Layers },
            { id: 'combo' as TabType, label: 'Combo教学', icon: Play, count: notes.combos?.length },
            { id: 'starting' as TabType, label: '起手判断', icon: Target },
            { id: 'matchups' as TabType, label: '对局指南', icon: Swords, count: notes.matchups?.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-[2px] ${
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-200'
                  : 'border-transparent text-amber-200/50 hover:text-amber-200/80'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-900/50 rounded">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className="space-y-6">
          {/* 卡组列表 Tab */}
          {activeTab === 'deck' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 主卡组 */}
              <div className="bg-gradient-to-br from-amber-950/20 to-transparent border border-amber-900/30 rounded-xl p-4">
                <h2 className="text-lg font-bold text-amber-200 mb-4 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-500" />
                  主卡组 <span className="text-amber-200/50 font-normal">({mainCount})</span>
                </h2>

                {/* 怪兽 */}
                {mainGrouped.monsters.length > 0 && (
                <CardGroup 
                  icon={<Swords className="w-4 h-4" />}
                  title="怪兽"
                  cards={mainGrouped.monsters}
                  onPreview={setPreviewCard}
                  showName={true}
                />
              )}
              
              {/* 魔法 */}
              {mainGrouped.spells.length > 0 && (
                <CardGroup 
                  icon={<Wand2 className="w-4 h-4 text-green-400" />}
                  title="魔法"
                  cards={mainGrouped.spells}
                  showName={true}
                  onPreview={setPreviewCard}
                />
              )}
              
              {/* 陷阱 */}
              {mainGrouped.traps.length > 0 && (
                <CardGroup 
                  icon={<Zap className="w-4 h-4 text-purple-400" />}
                  title="陷阱"
                  cards={mainGrouped.traps}
                  onPreview={setPreviewCard}
                  showName={true}
                />
              )}
            </div>

            {/* 额外卡组 */}
            {deck.extra_deck.length > 0 && (
              <div className="bg-gradient-to-br from-purple-950/20 to-transparent border border-purple-900/30 rounded-xl p-4">
                <h2 className="text-lg font-bold text-purple-200 mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  额外卡组 <span className="text-purple-200/50 font-normal">({extraCount})</span>
                </h2>
                <CardGrid cards={deck.extra_deck} onPreview={setPreviewCard} showName={true} />
              </div>
            )}

            {/* 副卡组 */}
            {deck.side_deck.length > 0 && (
              <div className="bg-gradient-to-br from-blue-950/20 to-transparent border border-blue-900/30 rounded-xl p-4">
                <h2 className="text-lg font-bold text-blue-200 mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-400" />
                  副卡组 <span className="text-blue-200/50 font-normal">({sideCount})</span>
                </h2>
                <CardGrid cards={deck.side_deck} onPreview={setPreviewCard} showName={true} />
              </div>
            )}

            {/* 换卡建议 & 小技巧（放在卡组列表下方） */}
            {(notes.tech_choices || (notes.tips && notes.tips.length > 0)) && (
              <div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {notes.tech_choices && (
                  <div className="bg-gradient-to-br from-amber-950/20 to-transparent border border-amber-900/30 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-amber-400 mb-2 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" /> 换卡建议
                    </h3>
                    <p className="text-sm text-amber-100/70 leading-relaxed">{notes.tech_choices}</p>
                  </div>
                )}
                {notes.tips && notes.tips.length > 0 && (
                  <div className="bg-gradient-to-br from-cyan-950/20 to-transparent border border-cyan-900/30 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-cyan-400 mb-2 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" /> 小技巧
                    </h3>
                    <ul className="text-sm text-amber-100/70 space-y-1">
                      {notes.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-cyan-500">•</span>
                          {typeof tip === 'string' ? tip : tip.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            </div>
          )}

          {/* Combo 教学 Tab - 棋盘模拟器 */}
          {activeTab === 'combo' && (
            <div className="space-y-8">
              {notes.combos && notes.combos.length > 0 ? (
                notes.combos.map((combo, index) => {
                  // 检查是否有场面状态数据
                  const hasFieldData = combo.steps?.some((s: any) => s.field)
                  
                  if (hasFieldData) {
                    // 有场面数据，使用模拟器
                    return (
                      <div key={index} className="border-2 border-[#333]">
                        <ComboSimulator
                          title={combo.name || `Combo ${index + 1}`}
                          steps={(combo.steps as any[]).map(s => ({
                            title: s.title || '',
                            card: s.card,
                            card_jp: s.card_jp,
                            desc: s.desc || s.effect || '',
                            action: s.action || '',
                            field: s.field || { emz: [null, null], mmz: [null,null,null,null,null], stz: [null,null,null,null,null], gy: [], hand: [] }
                          }))}
                          deckCards={[...deck.main_deck, ...deck.extra_deck, ...deck.side_deck]}
                        />
                      </div>
                    )
                  }
                  
                  // 无场面数据，使用流程图样式
                  return (
                    <div key={index} className="relative">
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-10">
                        <div className="w-[150%] aspect-square border border-[#daa520]/30 rounded-full animate-[spin_60s_linear_infinite]" />
                      </div>
                      
                      <div className="relative bg-black/40 border-2 border-[#333] overflow-hidden">
                        <button
                          onClick={() => setExpandedCombo(expandedCombo === index ? null : index)}
                          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[#daa520]/5 transition-colors border-b border-[#333]"
                        >
                          <div className="flex items-center gap-4">
                            <span className="w-10 h-10 bg-[#daa520] flex items-center justify-center text-black font-black text-lg">
                              {index + 1}
                            </span>
                            <div>
                              <span className="font-black text-[#fff176] text-xl tracking-tight">{combo.name || `Combo ${index + 1}`}</span>
                              {combo.difficulty && (
                                <div className="flex items-center gap-1 mt-1">
                                  {[...Array(5)].map((_, i) => (
                                    <div key={i} className={`w-2 h-2 rotate-45 ${i < combo.difficulty! ? 'bg-[#daa520]' : 'bg-[#333]'}`} />
                                  ))}
                                  <span className="text-[10px] text-[#5c4002] ml-1">难度</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <ChevronDown className={`w-6 h-6 text-[#daa520] transition-transform ${expandedCombo === index ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {expandedCombo === index && (
                          <div className="p-5 space-y-6">
                            {combo.starting_hand && combo.starting_hand.length > 0 && (
                              <div className="bg-[#daa520]/10 border-2 border-[#daa520]/30 p-4">
                                <h4 className="text-xs font-bold text-[#daa520] mb-3 flex items-center gap-2">
                                  <Zap size={14} fill="currentColor" />
                                  起手要求
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {combo.starting_hand.map((card, i) => (
                                    <span key={i} className="px-3 py-1.5 bg-black/50 border border-[#daa520]/50 text-amber-100 text-sm font-medium">
                                      {card}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {combo.steps && combo.steps.length > 0 && (
                              <div>
                                <h4 className="text-xs font-bold text-[#daa520] mb-4 flex items-center gap-2">
                                  <Play size={14} fill="currentColor" />
                                  展开流程
                                </h4>
                                <div className="relative">
                                  <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-gradient-to-b from-[#daa520] via-[#daa520]/50 to-[#daa520]" />
                                  <div className="space-y-4">
                                    {combo.steps.map((step, i) => {
                                      const stepText = typeof step === 'string' ? step : `${step.action}: ${step.card_cn || step.card} - ${step.effect}`
                                      const isLast = i === combo.steps!.length - 1
                                      return (
                                        <div key={i} className="flex items-start gap-4 relative">
                                          <div className={`relative z-10 w-10 h-10 flex-shrink-0 flex items-center justify-center font-black text-sm ${isLast ? 'bg-[#daa520] text-black' : 'bg-black border-2 border-[#daa520] text-[#daa520]'}`}>
                                            {isLast ? '★' : i + 1}
                                          </div>
                                          <div className={`flex-1 p-3 border-2 ${isLast ? 'bg-[#daa520]/10 border-[#daa520]' : 'bg-black/30 border-[#333]'}`}>
                                            <p className={`text-sm leading-relaxed ${isLast ? 'text-[#fff176] font-medium' : 'text-amber-100/90'}`}>
                                              {stepText}
                                            </p>
                                          </div>
                                          {!isLast && <div className="absolute left-[18px] -bottom-3 text-[#daa520] text-lg">↓</div>}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {combo.end_board && (
                              <div className="bg-gradient-to-r from-[#daa520]/20 to-transparent border-l-4 border-[#daa520] pl-4 py-3">
                                <h4 className="text-xs font-bold text-[#daa520] mb-2 flex items-center gap-2">
                                  <Crown size={14} />
                                  最终场面
                                </h4>
                                <p className="text-amber-100 text-sm font-medium">
                                  {typeof combo.end_board === 'string' ? combo.end_board : `场上: ${combo.end_board.field?.join(', ')}`}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="bg-black/30 border-2 border-[#333] p-8 text-center">
                  <Play className="w-12 h-12 text-[#333] mx-auto mb-3" />
                  <p className="text-[#5c4002]">暂无 Combo 教学</p>
                </div>
              )}
            </div>
          )}

          {/* 起手判断 Tab */}
          {activeTab === 'starting' && (
            <div className="space-y-6">
              {notes.starting_hands ? (
                <>
                  {/* 理想起手 */}
                  {notes.starting_hands.ideal && notes.starting_hands.ideal.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-green-400 mb-3 flex items-center gap-2">
                        ✅ 理想起手
                      </h3>
                      <div className="space-y-3">
                        {notes.starting_hands.ideal.map((hand, i) => (
                          <div key={i} className="bg-gradient-to-r from-green-950/20 to-transparent border border-green-900/30 rounded-lg p-4">
                            <p className="font-medium text-green-300 mb-1">{hand.cards.join(' + ')}</p>
                            <p className="text-sm text-amber-100/80">→ {hand.result}</p>
                            {hand.description && <p className="text-xs text-amber-100/60 mt-1">{hand.description}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 勉强能打 */}
                  {notes.starting_hands.acceptable && notes.starting_hands.acceptable.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
                        ⚠️ 勉强能打
                      </h3>
                      <div className="space-y-3">
                        {notes.starting_hands.acceptable.map((hand, i) => (
                          <div key={i} className="bg-gradient-to-r from-yellow-950/20 to-transparent border border-yellow-900/30 rounded-lg p-4">
                            <p className="font-medium text-yellow-300 mb-1">{hand.cards.join(' + ')}</p>
                            <p className="text-sm text-amber-100/80">→ {hand.result}</p>
                            {hand.description && <p className="text-xs text-amber-100/60 mt-1">{hand.description}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 坏手牌 */}
                  {notes.starting_hands.bad && notes.starting_hands.bad.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-red-400 mb-3 flex items-center gap-2">
                        ❌ 重开吧
                      </h3>
                      <div className="space-y-3">
                        {notes.starting_hands.bad.map((hand, i) => (
                          <div key={i} className="bg-gradient-to-r from-red-950/20 to-transparent border border-red-900/30 rounded-lg p-4">
                            <p className="font-medium text-red-300 mb-1">{hand.cards.join(' + ')}</p>
                            {hand.suggestion && <p className="text-sm text-amber-100/60">{hand.suggestion}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-black/30 border border-amber-900/30 rounded-xl p-8 text-center">
                  <Target className="w-12 h-12 text-amber-200/20 mx-auto mb-3" />
                  <p className="text-amber-200/40">暂无起手判断指南</p>
                </div>
              )}
            </div>
          )}

          {/* 对局指南 Tab */}
          {activeTab === 'matchups' && (
            <div className="space-y-4">
              {notes.matchups && notes.matchups.length > 0 ? (
                notes.matchups.map((mu, i) => (
                  <div key={i} className="bg-gradient-to-br from-red-950/20 to-transparent border border-red-900/30 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-bold text-red-300">vs {mu.opponent}</h3>
                      {mu.winrate && (
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          mu.winrate === '有利' ? 'bg-green-900/50 text-green-300' :
                          mu.winrate === '不利' ? 'bg-red-900/50 text-red-300' :
                          'bg-yellow-900/50 text-yellow-300'
                        }`}>
                          {mu.winrate}
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {mu.going_first && (
                        <div className="bg-black/30 rounded-lg p-3">
                          <h4 className="text-xs font-bold text-blue-400 mb-1">🥇 先攻</h4>
                          <p className="text-amber-100/80">{mu.going_first}</p>
                        </div>
                      )}
                      {mu.going_second && (
                        <div className="bg-black/30 rounded-lg p-3">
                          <h4 className="text-xs font-bold text-orange-400 mb-1">🥈 后攻</h4>
                          <p className="text-amber-100/80">{mu.going_second}</p>
                        </div>
                      )}
                    </div>
                    
                    {mu.key_cards && (
                      <p className="text-xs text-amber-100/60 mt-2">🔑 关键卡: {mu.key_cards}</p>
                    )}
                    {mu.strategy && (
                      <p className="text-sm text-amber-100/70 mt-2">{mu.strategy}</p>
                    )}
                    {mu.notes && (
                      <p className="text-xs text-amber-100/50 mt-2 italic">{mu.notes}</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="bg-black/30 border border-amber-900/30 rounded-xl p-8 text-center">
                  <Swords className="w-12 h-12 text-amber-200/20 mx-auto mb-3" />
                  <p className="text-amber-200/40">暂无对局指南</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* 卡片预览弹窗（复用共享组件） */}
      {previewCard && (
        <CardDetailModal
          card={previewCard as ModalCard}
          onClose={() => setPreviewCard(null)}
        />
      )}

      {/* 封面选择器弹窗 */}
      {showCoverPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setShowCoverPicker(false)}>
          <div className="bg-[#0d0d0d] border border-amber-900/50 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-amber-900/30 flex items-center justify-between">
              <h3 className="text-lg font-bold text-amber-200">选择封面卡</h3>
              <button onClick={() => setShowCoverPicker(false)} className="text-amber-200/60 hover:text-amber-200">✕</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
                {[...deck.main_deck, ...deck.extra_deck, ...deck.side_deck].map(dc => (
                  <div
                    key={dc.id}
                    onClick={() => updateCover(dc.card_id)}
                    className={`aspect-[3/4] rounded overflow-hidden cursor-pointer border-2 transition-all hover:scale-105 ${
                      deck.cover_card_id === dc.card_id 
                        ? 'border-amber-500 ring-2 ring-amber-500/50' 
                        : 'border-transparent hover:border-amber-500/50'
                    }`}
                  >
                    <img
                      src={getCardImageUrl(dc.card_id)}
                      alt={dc.card.name_cn || dc.card.name_en}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 卡片分组（带类型标题）
function CardGroup({ 
  icon, 
  title, 
  cards, 
  onPreview,
  showName = false
}: { 
  icon: React.ReactNode
  title: string
  cards: DeckCard[]
  onPreview: (card: Card) => void
  showName?: boolean
}) {
  const count = cards.reduce((s, c) => s + c.count, 0)
  
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2 text-sm text-amber-200/60">
        {icon}
        <span>{title} ({count})</span>
      </div>
      <CardGrid cards={cards} onPreview={onPreview} showName={showName} />
    </div>
  )
}

// 卡片网格（只读）
function CardGrid({ 
  cards, 
  onPreview,
  showName = false
}: { 
  cards: DeckCard[]
  onPreview: (card: Card) => void
  showName?: boolean
}) {
  // 简化卡名（去掉系列前缀，保留核心名）
  function getShortName(card: Card): string {
    const name = card.name_cn || card.name_jp || card.name_en
    // 去掉常见前缀
    return name
      .replace(/^(元素|假面|特异|命运|幻视|对极)[－-]英雄\s*/, '')
      .replace(/^[A-Z][-・]HERO\s*/i, '')
      .replace(/^(E|M|D|V|X|C)・HERO\s*/i, '')
  }
  
  return (
    <div className={`grid ${showName ? 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2' : 'grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1.5'}`}>
      {cards.map(dc => (
        <div
          key={dc.id}
          onClick={() => onPreview(dc.card)}
          className="relative cursor-pointer group"
        >
          <div className="aspect-[3/4] rounded overflow-hidden border border-transparent group-hover:border-amber-500 transition-colors">
            <img
              src={`/card-images/cn/${dc.card_id}.webp`}
              alt={dc.card.name_cn || dc.card.name_en}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
            />
          </div>
          {/* 数量角标 */}
          {dc.count > 1 && (
            <div className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/80 border border-amber-500 rounded-full flex items-center justify-center text-[10px] font-bold text-amber-200">
              {dc.count}
            </div>
          )}
          {/* 卡名 */}
          {showName && (
            <p className="mt-1 text-[10px] text-amber-200/70 text-center leading-tight line-clamp-2 group-hover:text-amber-200">
              {getShortName(dc.card)}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

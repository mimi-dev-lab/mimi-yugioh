/**
 * 卡组详情页 V2 - 新数据结构
 * 基于 NotebookLM 生成的 JSON 数据
 */

import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  ArrowLeft, Loader2, Star, Layers, BookOpen, 
  Zap, Shield, Target, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown, Swords, Play
} from 'lucide-react'
import { ComboPlayer, whiteForestCombo } from '../components/ComboPlayer'
import { ExcalidrawComboChart } from '../components/ComboFlowChart'

// 类型定义
interface DeckCard {
  id: number
  name_jp: string
  name_cn: string
  count: number
  role: string
  note: string
}

interface FinalBoardField {
  extra_monster_zone: { position: string; card_id: number; name_cn: string; state: string } | null
  monster_zone: (({ card_id: number; name_cn: string; state: string }) | null)[]
  spell_trap_zone: (({ card_id: number; name_cn: string; state: string }) | null)[]
  field_zone: { card_id: number; name_cn: string } | null
}

interface DeckData {
  id: string
  name: string
  name_en: string
  evaluation: {
    tier: string
    type: string
    difficulty: string
    cost: string
    pros: string[]
    cons: string[]
  }
  deck_list: {
    main_deck: { monsters: DeckCard[]; spells: DeckCard[]; traps: DeckCard[] }
    extra_deck: { synchro: DeckCard[]; link: DeckCard[] }
  }
  basics: {
    core_mechanic: string
    key_cards: { id: number; name_cn: string; role: string; explanation: string }[]
  }
  combos: {
    id: string
    name: string
    required_cards: { id?: number; name_cn?: string; type?: string; description?: string }[]
    difficulty: string
    steps: { step: number; action: string; result: string }[]
    final_board_ref: string
    if_interrupted: Record<string, string>
  }[]
  final_boards: {
    id: string
    name: string
    field: FinalBoardField
    negates: number
    negate_details: string[]
    opponent_turn_plays: string[]
  }[]
  hand_guides: {
    name: string
    hand: number[]
    rating: string
    strategy: string
    recommended_combo: string
  }[]
  matchup: {
    weaknesses: string[]
    handtrap_timing: Record<string, { timing: string; effect: string }>
  }
}

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'

// 卡图组件
function CardImage({ id, name, size = 'sm', count }: { id: number; name: string; size?: 'sm' | 'md' | 'lg'; count?: number }) {
  const sizeClasses = {
    sm: 'w-12 h-[70px]',
    md: 'w-16 h-[93px]',
    lg: 'w-20 h-[117px]'
  }
  
  return (
    <div className="relative group">
      <img
        src={`${R2_BASE}/cn/${id}.webp`}
        alt={name}
        className={`${sizeClasses[size]} object-cover rounded border border-gray-700 group-hover:border-purple-500 transition-colors`}
        onError={(e) => {
          (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`
        }}
      />
      {count && count > 1 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
          {count}
        </span>
      )}
    </div>
  )
}

// 游戏场地可视化组件
function GameFieldVisual({ field, negates }: { field: FinalBoardField; negates: number }) {
  const emptySlot = "bg-gray-800/50 border border-gray-700 border-dashed"
  const filledSlot = "bg-gray-800 border border-purple-500/50"
  
  const renderCard = (card: { card_id: number; name_cn: string; state?: string } | null, isSet?: boolean) => {
    if (!card) return <div className={`w-12 h-[70px] rounded ${emptySlot}`} />
    return (
      <div className={`relative ${filledSlot} rounded overflow-hidden`}>
        <img
          src={`${R2_BASE}/cn/${card.card_id}.webp`}
          alt={card.name_cn}
          className={`w-12 h-[70px] object-cover ${isSet || card.state === 'set' ? 'brightness-50' : ''} ${card.state === 'defense' ? 'rotate-90 scale-75' : ''}`}
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards_small/${card.card_id}.jpg`
          }}
        />
        {(isSet || card.state === 'set') && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-gray-300 bg-black/50 px-1 rounded">SET</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-xl p-4 border border-gray-700">
      {/* 干扰数 */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <Shield className="text-purple-400" size={20} />
        <span className="text-xl font-bold text-white">{negates} 干扰</span>
      </div>
      
      {/* 额外怪兽区 */}
      <div className="flex justify-center gap-16 mb-3">
        <div className="text-center">
          {field.extra_monster_zone?.position === 'left' 
            ? renderCard(field.extra_monster_zone)
            : <div className={`w-12 h-[70px] rounded ${emptySlot}`} />
          }
          <span className="text-[10px] text-gray-500">EX-L</span>
        </div>
        <div className="text-center">
          {field.extra_monster_zone?.position === 'right'
            ? renderCard(field.extra_monster_zone)
            : <div className={`w-12 h-[70px] rounded ${emptySlot}`} />
          }
          <span className="text-[10px] text-gray-500">EX-R</span>
        </div>
      </div>

      {/* 怪兽区 */}
      <div className="flex justify-center gap-1 mb-2">
        {field.monster_zone.map((card, i) => (
          <div key={`m-${i}`} className="text-center">
            {renderCard(card)}
          </div>
        ))}
      </div>

      {/* 魔陷区 + 场地 */}
      <div className="flex justify-center items-center gap-1">
        {/* 场地魔法 */}
        <div className="text-center mr-2">
          {field.field_zone ? renderCard({ card_id: field.field_zone.card_id, name_cn: field.field_zone.name_cn }) : <div className={`w-12 h-[70px] rounded ${emptySlot}`} />}
          <span className="text-[10px] text-gray-500">场地</span>
        </div>
        {/* 魔陷区 */}
        {field.spell_trap_zone.map((card, i) => (
          <div key={`st-${i}`} className="text-center">
            {renderCard(card, card?.state === 'set')}
          </div>
        ))}
      </div>
    </div>
  )
}

// 折叠模块组件
function Section({ title, icon: Icon, children, defaultOpen = true }: { 
  title: string; 
  icon: typeof Star; 
  children: React.ReactNode;
  defaultOpen?: boolean 
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  
  return (
    <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Icon className="text-purple-400" size={20} />
          </div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
        </div>
        {isOpen ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
      </button>
      {isOpen && <div className="px-4 pb-4 border-t border-gray-700/50">{children}</div>}
    </div>
  )
}

export default function DeckDetailPageV2() {
  const { deckId } = useParams()
  const [deck, setDeck] = useState<DeckData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCombo, setSelectedCombo] = useState(0)
  const [showAnimatedCombo, setShowAnimatedCombo] = useState(false)

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
        <Loader2 className="animate-spin text-purple-500" size={40} />
      </div>
    )
  }

  if (error || !deck) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">{error || '卡组未找到'}</p>
        <Link to="/decks" className="text-purple-400 hover:underline mt-4 inline-block">返回卡组列表</Link>
      </div>
    )
  }

  const mainDeckTotal = deck.deck_list.main_deck.monsters.reduce((s, c) => s + c.count, 0) +
    deck.deck_list.main_deck.spells.reduce((s, c) => s + c.count, 0) +
    deck.deck_list.main_deck.traps.reduce((s, c) => s + c.count, 0)
  const extraDeckTotal = deck.deck_list.extra_deck.synchro.reduce((s, c) => s + c.count, 0) +
    deck.deck_list.extra_deck.link.reduce((s, c) => s + c.count, 0)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <Link to="/decks" className="inline-flex items-center gap-2 text-gray-400 hover:text-purple-400 mb-4">
          <ArrowLeft size={18} /> 返回
        </Link>
        <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 rounded-xl p-6 border border-purple-500/20">
          <h1 className="text-3xl font-bold text-white mb-2">{deck.name}</h1>
          <p className="text-gray-400 mb-4">{deck.name_en}</p>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-purple-600 text-white rounded-full text-sm">{deck.evaluation.tier}</span>
            <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm">{deck.evaluation.type}</span>
            <span className="px-3 py-1 bg-gray-700 text-gray-200 rounded-full text-sm">难度: {deck.evaluation.difficulty}</span>
            <span className="px-3 py-1 bg-gray-700 text-gray-200 rounded-full text-sm">花费: {deck.evaluation.cost}</span>
          </div>
        </div>
      </div>

      {/* 评价 */}
      <Section title="评价" icon={Star}>
        <div className="grid md:grid-cols-2 gap-4 pt-4">
          <div className="bg-green-900/20 rounded-lg p-4 border border-green-500/30">
            <div className="flex items-center gap-2 mb-3">
              <ThumbsUp className="text-green-400" size={18} />
              <span className="font-medium text-green-400">优点</span>
            </div>
            <ul className="space-y-2">
              {deck.evaluation.pros.map((pro, i) => (
                <li key={i} className="text-gray-300 text-sm flex gap-2">
                  <span className="text-green-400">✓</span>
                  <span>{pro}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-red-900/20 rounded-lg p-4 border border-red-500/30">
            <div className="flex items-center gap-2 mb-3">
              <ThumbsDown className="text-red-400" size={18} />
              <span className="font-medium text-red-400">缺点</span>
            </div>
            <ul className="space-y-2">
              {deck.evaluation.cons.map((con, i) => (
                <li key={i} className="text-gray-300 text-sm flex gap-2">
                  <span className="text-red-400">✗</span>
                  <span>{con}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* 卡组列表 - 最重要 */}
      <Section title={`卡组列表 (${mainDeckTotal} + ${extraDeckTotal})`} icon={Layers}>
        <div className="pt-4 space-y-6">
          {/* 主卡组 - 怪兽 */}
          <div>
            <h3 className="text-sm font-medium text-purple-400 mb-3">怪兽 ({deck.deck_list.main_deck.monsters.reduce((s,c)=>s+c.count,0)})</h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {deck.deck_list.main_deck.monsters.map((card, i) => (
                <div key={i} className="text-center group cursor-pointer">
                  <CardImage id={card.id} name={card.name_cn} count={card.count} />
                  <p className="text-[10px] text-gray-400 mt-1 truncate group-hover:text-purple-300">{card.name_cn}</p>
                  <p className="text-[9px] text-gray-600">{card.role}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* 主卡组 - 魔法 */}
          <div>
            <h3 className="text-sm font-medium text-green-400 mb-3">魔法 ({deck.deck_list.main_deck.spells.reduce((s,c)=>s+c.count,0)})</h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {deck.deck_list.main_deck.spells.map((card, i) => (
                <div key={i} className="text-center group cursor-pointer">
                  <CardImage id={card.id} name={card.name_cn} count={card.count} />
                  <p className="text-[10px] text-gray-400 mt-1 truncate group-hover:text-green-300">{card.name_cn}</p>
                  <p className="text-[9px] text-gray-600">{card.role}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* 主卡组 - 陷阱 */}
          <div>
            <h3 className="text-sm font-medium text-pink-400 mb-3">陷阱 ({deck.deck_list.main_deck.traps.reduce((s,c)=>s+c.count,0)})</h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {deck.deck_list.main_deck.traps.map((card, i) => (
                <div key={i} className="text-center group cursor-pointer">
                  <CardImage id={card.id} name={card.name_cn} count={card.count} />
                  <p className="text-[10px] text-gray-400 mt-1 truncate group-hover:text-pink-300">{card.name_cn}</p>
                  <p className="text-[9px] text-gray-600">{card.role}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* 额外卡组 */}
          <div>
            <h3 className="text-sm font-medium text-blue-400 mb-3">额外卡组 ({extraDeckTotal})</h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {[...deck.deck_list.extra_deck.synchro, ...deck.deck_list.extra_deck.link].map((card, i) => (
                <div key={i} className="text-center group cursor-pointer">
                  <CardImage id={card.id} name={card.name_cn} count={card.count} />
                  <p className="text-[10px] text-gray-400 mt-1 truncate group-hover:text-blue-300">{card.name_cn}</p>
                  <p className="text-[9px] text-gray-600">{card.role}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 基础知识 */}
      <Section title="基础知识" icon={BookOpen} defaultOpen={false}>
        <div className="pt-4 space-y-4">
          <div className="bg-gray-900/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-purple-400 mb-2">核心机制</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{deck.basics.core_mechanic}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-purple-400 mb-3">关键卡片</h3>
            <div className="space-y-3">
              {deck.basics.key_cards.map((card, i) => (
                <div key={i} className="flex gap-4 bg-gray-900/50 rounded-lg p-3">
                  <CardImage id={card.id} name={card.name_cn} size="md" />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium">{card.name_cn}</span>
                      <span className="text-xs text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded">{card.role}</span>
                    </div>
                    <p className="text-gray-400 text-sm">{card.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Combo 展开 */}
      <Section title="展开路线" icon={Zap}>
        <div className="pt-4 space-y-4">
          {/* 可视化展示 - 仅白森林百夫长卡组显示 */}
          {deckId === 'white-forest-centurion' && (
            <div className="mb-6 space-y-4">
              {/* ✨ Excalidraw 手绘风格流程图 */}
              <ExcalidrawComboChart />
              
              {/* 切换按钮 */}
              <div className="flex gap-2 flex-wrap">
                {/* 动画播放器（可选） */}
                <button
                  onClick={() => setShowAnimatedCombo(!showAnimatedCombo)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    showAnimatedCombo 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'
                  }`}
                >
                  <Play size={18} />
                  {showAnimatedCombo ? '隐藏场地动画' : '🎮 查看场地动画'}
                </button>
              </div>
              
              {showAnimatedCombo && (
                <div className="mt-4">
                  <ComboPlayer combo={whiteForestCombo} />
                </div>
              )}
            </div>
          )}
          {deck.combos.map((combo, idx) => (
            <div key={combo.id} className={`border rounded-lg overflow-hidden ${selectedCombo === idx ? 'border-purple-500' : 'border-gray-700'}`}>
              <button
                onClick={() => setSelectedCombo(idx)}
                className="w-full flex items-center justify-between p-4 bg-gray-900/50 hover:bg-gray-800/50"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">{idx + 1}</span>
                  <div className="text-left">
                    <h4 className="text-white font-medium">{combo.name}</h4>
                    <p className="text-xs text-gray-500">难度: {combo.difficulty}</p>
                  </div>
                </div>
                {selectedCombo === idx ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
              </button>
              
              {selectedCombo === idx && (
                <div className="p-4 border-t border-gray-700 space-y-4">
                  {/* 所需卡片 */}
                  <div>
                    <h5 className="text-sm text-gray-400 mb-2">所需卡片:</h5>
                    <div className="flex gap-2 flex-wrap">
                      {combo.required_cards.map((card, i) => (
                        <span key={i} className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm">
                          {card.name_cn || card.description}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  {/* 步骤 */}
                  <div className="space-y-2">
                    {combo.steps.map((step) => (
                      <div key={step.step} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-xs text-gray-300">
                          {step.step}
                        </span>
                        <div className="flex-1">
                          <p className="text-gray-200 text-sm">{step.action}</p>
                          <p className="text-gray-500 text-xs mt-1">→ {step.result}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* 被打断时 */}
                  <div className="bg-red-900/20 rounded-lg p-3 border border-red-500/30">
                    <h5 className="text-sm text-red-400 mb-2">被手坑时:</h5>
                    {Object.entries(combo.if_interrupted).map(([handtrap, response]) => (
                      <p key={handtrap} className="text-gray-300 text-sm mb-1">
                        <span className="text-red-400">{handtrap}:</span> {response}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* 最终盘面 */}
      <Section title="最终盘面" icon={Target}>
        <div className="pt-4 space-y-4">
          {deck.final_boards.map((board) => (
            <div key={board.id}>
              <h3 className="text-white font-medium mb-3">{board.name}</h3>
              <GameFieldVisual field={board.field} negates={board.negates} />
              
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                <div className="bg-purple-900/20 rounded-lg p-3 border border-purple-500/30">
                  <h5 className="text-sm text-purple-400 mb-2">干扰点:</h5>
                  <ul className="space-y-1">
                    {board.negate_details.map((detail, i) => (
                      <li key={i} className="text-gray-300 text-sm">• {detail}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-500/30">
                  <h5 className="text-sm text-blue-400 mb-2">对手回合操作:</h5>
                  <ul className="space-y-1">
                    {board.opponent_turn_plays.map((play, i) => (
                      <li key={i} className="text-gray-300 text-sm">• {play}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 起手教学 */}
      <Section title="起手教学" icon={Swords} defaultOpen={false}>
        <div className="pt-4 space-y-4">
          {deck.hand_guides.map((guide, idx) => (
            <div key={idx} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-white font-medium">{guide.name}</h4>
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                  guide.rating === 'S' ? 'bg-yellow-500 text-black' :
                  guide.rating === 'A' ? 'bg-purple-500 text-white' :
                  guide.rating === 'B' ? 'bg-blue-500 text-white' :
                  'bg-gray-500 text-white'
                }`}>
                  {guide.rating}
                </span>
              </div>
              <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                {guide.hand.map((cardId, i) => {
                  const card = [...deck.deck_list.main_deck.monsters, ...deck.deck_list.main_deck.spells, ...deck.deck_list.main_deck.traps]
                    .find(c => c.id === cardId)
                  return (
                    <div key={i} className="flex-shrink-0 text-center">
                      <CardImage id={cardId} name={card?.name_cn || ''} size="sm" />
                    </div>
                  )
                })}
              </div>
              <p className="text-gray-300 text-sm">{guide.strategy}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 手坑应对 */}
      <Section title="手坑应对" icon={Shield} defaultOpen={false}>
        <div className="pt-4 space-y-4">
          <div className="bg-red-900/20 rounded-lg p-4 border border-red-500/30">
            <h4 className="text-red-400 font-medium mb-2">弱点</h4>
            <ul className="space-y-1">
              {deck.matchup.weaknesses.map((w, i) => (
                <li key={i} className="text-gray-300 text-sm">• {w}</li>
              ))}
            </ul>
          </div>
          
          <div className="space-y-3">
            <h4 className="text-purple-400 font-medium">手坑打点时机</h4>
            {Object.entries(deck.matchup.handtrap_timing).map(([name, info]) => (
              <div key={name} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                <h5 className="text-white font-medium mb-1">{name}</h5>
                <p className="text-gray-400 text-sm"><span className="text-purple-400">时机:</span> {info.timing}</p>
                <p className="text-gray-400 text-sm"><span className="text-purple-400">效果:</span> {info.effect}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  )
}

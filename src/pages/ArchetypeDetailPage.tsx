/**
 * 模块化卡组详情页
 * 布局：本家轴介绍 → 各配合轴（含展开教学+盘面）
 */

import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  ArrowLeft, Loader2, Layers, Zap, 
  ChevronDown, ChevronUp, Target, Play, 
  AlertTriangle, CheckCircle, XCircle, Lightbulb
} from 'lucide-react'
import ClickableCard, { ClickableCardName } from '../components/ClickableCard'
import DuelField from '../components/DuelField'

// 类型定义
interface CardData {
  id: number
  name_cn: string
  name_jp?: string
  count: number
  countRange?: [number, number]
  role: string
  explanation: string
  tips?: string[]
  counters?: string[]
}

interface ComboStep {
  step: number
  action: string
  result: string
  note?: string
}

interface FinalBoard {
  monsters?: Array<{ name: string; id?: number; position?: string; atk?: number }>
  spellTraps?: Array<{ name: string; id?: number; state: string }>
  hand?: string[]
  negates?: number
  negateDetails?: string[]
  vulnerabilities?: string[]
}

interface Combo {
  id: string
  name: string
  difficulty: string
  startingHand: { required: string[]; optional?: string[] }
  steps: ComboStep[]
  finalBoard?: FinalBoard
  interruptionGuide?: Record<string, string>
}

interface Engine {
  id: string
  name: string
  type: string
  tier?: string
  difficulty?: string
  cost?: string
  philosophy?: string
  coreCards: CardData[]
  flexCards?: CardData[]
  extraDeckCards?: CardData[]
  synergy?: string
  explanation?: string
  combos?: Combo[]
  matchup?: {
    weaknesses?: string[]
    handtrapTiming?: Record<string, { timing: string; effect: string }>
  }
}

interface Archetype {
  id: string
  name: string
  name_en: string
  overview: {
    description: string
    playstyle?: string
    history?: string
    strengths?: string[]
    weaknesses?: string[]
  }
  homeEngine: Engine
  supportEngines: Engine[]
  glossary?: Record<string, string>
}

// 卡片详情行
function CardRow({ card, isFlex = false }: { card: CardData; isFlex?: boolean }) {
  const [showTips, setShowTips] = useState(false)
  
  return (
    <div className="rounded-lg bg-gray-800/50 p-3">
      <div className="flex gap-3">
        <ClickableCard id={card.id} name={card.name_cn} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ClickableCardName id={card.id} name={card.name_cn} className="font-medium text-white text-sm" />
            <span className={`text-xs px-2 py-0.5 rounded ${isFlex ? 'bg-yellow-500/20 text-yellow-300' : 'bg-red-500/20 text-red-300'}`}>
              {card.countRange ? `${card.countRange[0]}-${card.countRange[1]}` : `×${card.count}`}
            </span>
            <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded">{card.role}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{card.explanation}</p>
          
          {card.tips && card.tips.length > 0 && (
            <>
              <button 
                className="text-xs text-purple-400 mt-1 hover:underline"
                onClick={() => setShowTips(!showTips)}
              >
                {showTips ? '收起技巧 ▲' : '使用技巧 ▼'}
              </button>
              {showTips && (
                <div className="mt-2 p-2 bg-green-900/20 rounded border border-green-500/20">
                  <ul className="text-xs text-gray-300 space-y-1">
                    {card.tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <Lightbulb size={10} className="text-green-400 mt-0.5 flex-shrink-0" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Combo 展示
function ComboCard({ combo }: { combo: Combo }) {
  const [expanded, setExpanded] = useState(false)
  
  const difficultyStyle = {
    easy: 'bg-green-500/20 text-green-300',
    normal: 'bg-yellow-500/20 text-yellow-300',
    hard: 'bg-red-500/20 text-red-300',
  }[combo.difficulty] || 'bg-gray-500/20 text-gray-300'
  
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
      <button 
        className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-700/30 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Play className="text-green-400" size={16} />
          <span className="font-medium text-white text-sm">{combo.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${difficultyStyle}`}>
            {combo.difficulty === 'easy' ? '简单' : combo.difficulty === 'normal' ? '普通' : '困难'}
          </span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      
      {expanded && (
        <div className="p-3 pt-0 space-y-3">
          {/* 起手条件 */}
          <div className="p-2 bg-gray-900/50 rounded text-xs">
            <span className="text-green-400">起手：</span>
            <span className="text-gray-300">{combo.startingHand.required.join(' / ')}</span>
          </div>
          
          {/* 步骤 */}
          <div className="space-y-2">
            {combo.steps.map((step, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-300 flex items-center justify-center text-xs flex-shrink-0">
                  {step.step}
                </span>
                <div>
                  <p className="text-gray-200">{step.action}</p>
                  <p className="text-xs text-green-400">→ {step.result}</p>
                </div>
              </div>
            ))}
          </div>
          
          {/* 被打断指南 */}
          {combo.interruptionGuide && Object.keys(combo.interruptionGuide).length > 0 && (
            <div className="p-2 bg-red-900/20 rounded border border-red-500/20">
              <div className="text-xs text-red-300 font-medium mb-1 flex items-center gap-1">
                <AlertTriangle size={12} />
                被断怎么办
              </div>
              {Object.entries(combo.interruptionGuide).map(([k, v]) => (
                <p key={k} className="text-xs text-gray-300">
                  <span className="text-red-400">{k}</span> → {v}
                </p>
              ))}
            </div>
          )}
          
          {/* 最终盘面 */}
          {combo.finalBoard && (
            <div className="mt-3">
              <DuelField 
                field={combo.finalBoard as any} 
                title="最终盘面" 
                negates={combo.finalBoard.negates} 
              />
              
              {/* 妨害详情 */}
              {combo.finalBoard.negateDetails && combo.finalBoard.negateDetails.length > 0 && (
                <div className="mt-2 p-2 bg-blue-900/20 rounded border border-blue-500/20">
                  <div className="text-xs text-blue-300 font-medium mb-1">🛡️ 妨害详情</div>
                  <ul className="text-xs text-gray-300 space-y-0.5">
                    {combo.finalBoard.negateDetails.map((d, i) => (
                      <li key={i}>• {d}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* 弱点 */}
              {combo.finalBoard.vulnerabilities && combo.finalBoard.vulnerabilities.length > 0 && (
                <div className="mt-2 p-2 bg-orange-900/20 rounded border border-orange-500/20">
                  <div className="text-xs text-orange-300 font-medium mb-1">⚠️ 被克制</div>
                  <ul className="text-xs text-gray-300">
                    {combo.finalBoard.vulnerabilities.map((v, i) => (
                      <li key={i}>• {v}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 轴展示组件（包含卡片+Combo+盘面）
function EngineSection({ engine, isHome = false }: { engine: Engine; isHome?: boolean }) {
  const [cardsExpanded, setCardsExpanded] = useState(isHome)
  const [combosExpanded, setCombosExpanded] = useState(false)
  
  return (
    <div className={`rounded-xl border ${isHome ? 'border-purple-500/50 bg-purple-900/10' : 'border-gray-700 bg-gray-800/30'} overflow-hidden`}>
      {/* 轴标题 */}
      <div className="p-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isHome ? 'bg-purple-500/20' : 'bg-blue-500/20'}`}>
              {isHome ? <Layers className="text-purple-400" size={20} /> : <Zap className="text-blue-400" size={20} />}
            </div>
            <div>
              <h3 className="font-bold text-white">{engine.name}</h3>
              {!isHome && engine.tier && (
                <div className="flex gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">{engine.tier}</span>
                  {engine.difficulty && <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded">{engine.difficulty}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* 理念 */}
        {engine.philosophy && (
          <p className="text-sm text-gray-400 mt-3">{engine.philosophy}</p>
        )}
        
        {/* 配合点 */}
        {engine.synergy && (
          <div className="mt-3 p-3 bg-blue-900/20 rounded-lg border border-blue-500/20">
            <div className="flex items-center gap-1 text-xs text-blue-300 font-medium mb-1">
              <Target size={12} />
              与本家轴的配合
            </div>
            <p className="text-xs text-gray-300 whitespace-pre-wrap">{engine.synergy}</p>
          </div>
        )}
      </div>
      
      {/* 卡片列表 */}
      <div className="border-b border-gray-700/50">
        <button 
          className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-700/20 transition"
          onClick={() => setCardsExpanded(!cardsExpanded)}
        >
          <span className="text-sm font-medium text-gray-300">📦 卡片构成</span>
          {cardsExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        
        {cardsExpanded && (
          <div className="p-3 pt-0 space-y-4">
            {/* 核心卡 */}
            <div>
              <h4 className="text-xs font-medium text-red-300 mb-2 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                核心卡（必带）
              </h4>
              <div className="space-y-2">
                {engine.coreCards.map((card, i) => (
                  <CardRow key={i} card={card} />
                ))}
              </div>
            </div>
            
            {/* 可调卡 */}
            {engine.flexCards && engine.flexCards.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-yellow-300 mb-2 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  可调整
                </h4>
                <div className="space-y-2">
                  {engine.flexCards.map((card, i) => (
                    <CardRow key={i} card={card} isFlex />
                  ))}
                </div>
              </div>
            )}
            
            {/* 额外卡组 */}
            {engine.extraDeckCards && engine.extraDeckCards.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-purple-300 mb-2 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  额外卡组
                </h4>
                <div className="space-y-2">
                  {engine.extraDeckCards.map((card, i) => (
                    <CardRow key={i} card={card} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* 展开教学（本家轴不显示，因为实际展开是和配合轴联动的） */}
      {!isHome && engine.combos && engine.combos.length > 0 && (
        <div className="border-b border-gray-700/50">
          <button 
            className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-700/20 transition"
            onClick={() => setCombosExpanded(!combosExpanded)}
          >
            <span className="text-sm font-medium text-gray-300">🎮 展开教学 ({engine.combos.length})</span>
            {combosExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
          
          {combosExpanded && (
            <div className="p-3 pt-0 space-y-3">
              {engine.combos.map(combo => (
                <ComboCard key={combo.id} combo={combo} />
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* 对策指南 */}
      {engine.matchup && (
        <div className="p-3">
          <div className="text-xs text-gray-500 mb-2">⚠️ 弱点与对策</div>
          {engine.matchup.weaknesses && (
            <div className="flex flex-wrap gap-1 mb-2">
              {engine.matchup.weaknesses.map((w, i) => (
                <span key={i} className="text-xs px-2 py-0.5 bg-red-500/20 text-red-300 rounded">{w}</span>
              ))}
            </div>
          )}
          {engine.matchup.handtrapTiming && (
            <div className="space-y-1">
              {Object.entries(engine.matchup.handtrapTiming).map(([card, info]) => (
                <p key={card} className="text-xs text-gray-400">
                  <span className="text-yellow-400">{card}</span>
                  <span className="text-gray-500"> @ {info.timing}</span>
                  <span className="text-red-400 block ml-4">→ {info.effect}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 主页面
export default function ArchetypeDetailPage() {
  const { archetypeId } = useParams()
  const [archetype, setArchetype] = useState<Archetype | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/data/archetypes/${archetypeId}.json`)
        if (!res.ok) throw new Error('无法加载数据')
        const data = await res.json()
        setArchetype(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [archetypeId])
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-purple-500" size={32} />
      </div>
    )
  }
  
  if (error || !archetype) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">加载失败: {error}</p>
        <Link to="/decks" className="text-purple-400 hover:underline mt-4 inline-block">返回</Link>
      </div>
    )
  }
  
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* 返回 */}
      <Link to="/decks" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition">
        <ArrowLeft size={16} />
        返回卡组列表
      </Link>
      
      {/* 标题 */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-white">{archetype.name}</h1>
          <span className="text-gray-500">{archetype.name_en}</span>
        </div>
        <p className="text-gray-300 mt-2">{archetype.overview.description}</p>
      </div>
      
      {/* 玩法/历史 */}
      <div className="grid md:grid-cols-2 gap-4">
        {archetype.overview.playstyle && (
          <div className="p-4 bg-gray-800 rounded-xl">
            <h3 className="text-sm font-medium text-purple-300 mb-2">🎮 玩法风格</h3>
            <p className="text-sm text-gray-300">{archetype.overview.playstyle}</p>
          </div>
        )}
        {archetype.overview.history && (
          <div className="p-4 bg-gray-800/50 rounded-xl">
            <h3 className="text-sm font-medium text-gray-400 mb-2">📜 历史</h3>
            <p className="text-sm text-gray-400">{archetype.overview.history}</p>
          </div>
        )}
      </div>
      
      {/* 优缺点 */}
      {(archetype.overview.strengths || archetype.overview.weaknesses) && (
        <div className="grid md:grid-cols-2 gap-4">
          {archetype.overview.strengths && (
            <div className="p-4 bg-green-900/20 rounded-xl border border-green-500/30">
              <h3 className="text-green-300 font-medium mb-2 flex items-center gap-1">
                <CheckCircle size={16} />
                优点
              </h3>
              <ul className="space-y-1">
                {archetype.overview.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-gray-300">• {s}</li>
                ))}
              </ul>
            </div>
          )}
          {archetype.overview.weaknesses && (
            <div className="p-4 bg-red-900/20 rounded-xl border border-red-500/30">
              <h3 className="text-red-300 font-medium mb-2 flex items-center gap-1">
                <XCircle size={16} />
                弱点
              </h3>
              <ul className="space-y-1">
                {archetype.overview.weaknesses.map((w, i) => (
                  <li key={i} className="text-sm text-gray-300">• {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      {/* 本家轴 */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Layers className="text-purple-400" size={20} />
          本家轴
        </h2>
        <EngineSection engine={archetype.homeEngine} isHome />
      </section>
      
      {/* 配合轴 */}
      {archetype.supportEngines.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="text-blue-400" size={20} />
            配合轴（含展开教学）
          </h2>
          <div className="space-y-4">
            {archetype.supportEngines.map(engine => (
              <EngineSection key={engine.id} engine={engine} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

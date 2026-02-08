'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { 
  Zap, Layers, ChevronLeft, ChevronRight, 
  Box, Skull, Crown, Play
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CardDetailModal, type Card } from './CardDetailModal'

// ============ 类型定义 ============
interface FieldState {
  emz?: (string | null)[]   // 额外怪兽区 2格 [左, 右]
  mmz: (string | null)[]    // 主怪兽区 5格
  stz?: (string | null)[]   // 魔陷区 5格
  field_spell?: string | null  // 场地魔法
  gy: string[]              // 墓地
  hand: string[]            // 手牌
}

interface ComboStep {
  title: string
  card?: string       // 旧格式（中文）
  card_jp?: string    // 新格式（日文，优先）
  type?: string
  desc: string
  action: string
  field: FieldState
}

interface DeckCard {
  card_id: number
  card: Card
}

interface ComboSimulatorProps {
  title: string
  steps: ComboStep[]
  deckCards?: DeckCard[]  // 卡组中的卡片（用于匹配卡名获取ID和详情）
  endBoard?: {
    pressure?: string
    graveyard?: string
  }
}

// ============ 子组件 ============

// 场地格子
function FieldSlot({ 
  children, 
  label, 
  isActive 
}: { 
  children?: React.ReactNode
  label: string
  isActive?: boolean 
}) {
  return (
    <div className={cn(
      "relative w-full aspect-[3/4] border-2 flex items-center justify-center transition-all duration-500",
      isActive 
        ? "border-[#daa520] shadow-[0_0_20px_rgba(218,165,32,0.4)] bg-[#1a1508]" 
        : "border-[#333] bg-black/40"
    )}>
      <span className="absolute inset-0 flex items-center justify-center opacity-20 text-[6px] font-bold uppercase pointer-events-none">
        {label}
      </span>
      {children}
    </div>
  )
}

// 场上卡片（带真实卡图）
function CardActor({ 
  name, 
  cardId,
  onClick 
}: { 
  name: string
  cardId?: number
  onClick?: () => void
}) {
  if (cardId) {
    return (
      <div 
        className="w-[90%] h-[90%] relative cursor-pointer group animate-in fade-in zoom-in duration-300"
        onClick={onClick}
      >
        <Image
          src={`/card-images/cn/${cardId}.webp`}
          alt={name}
          fill
          className="object-cover border border-[#daa520]/50"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.src = `/card-images/jp/${cardId}.webp`
          }}
        />
        {/* Hover 效果 */}
        <div className="absolute inset-0 bg-[#daa520]/0 group-hover:bg-[#daa520]/20 transition-colors border-2 border-transparent group-hover:border-[#daa520]" />
        {/* 卡名 */}
        <div className="absolute -bottom-5 left-0 right-0 text-[7px] font-bold text-center text-[#daa520] truncate px-0.5">
          {name}
        </div>
      </div>
    )
  }
  
  // 无卡图的占位
  return (
    <div className="w-[88%] h-[88%] bg-[#1a1a1a] border border-[#daa520]/50 flex flex-col items-center justify-center relative overflow-hidden animate-in fade-in zoom-in duration-300">
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
      <Layers size={14} className="text-[#daa520]/40 mb-1" />
      <div className="absolute bottom-1 px-1 w-full text-[7px] font-bold text-[#daa520] truncate text-center z-10 leading-tight">
        {name}
      </div>
    </div>
  )
}

// ============ 主组件 ============
export function ComboSimulator({ title, steps, deckCards, endBoard }: ComboSimulatorProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [previewCard, setPreviewCard] = useState<Card | null>(null)

  // 建立卡名 -> 卡片信息的映射（优先日文名）
  const cardNameMap = useMemo(() => {
    const map = new Map<string, { id: number; card: Card }>()
    if (!deckCards) return map
    
    for (const dc of deckCards) {
      const card = dc.card
      const info = { id: dc.card_id, card }
      
      // 日文名优先（最准确）
      if (card.name_jp) {
        map.set(card.name_jp, info)
        // 日文名标准化（去掉空格、点等）
        const normalized = card.name_jp.replace(/[・\s]/g, '')
        map.set(normalized, info)
      }
      // 中文名
      if (card.name_cn) {
        map.set(card.name_cn, info)
      }
      // 英文名
      if (card.name_en) {
        map.set(card.name_en, info)
      }
    }
    return map
  }, [deckCards])

  // 根据卡名查找卡片（优先日文名匹配）
  const findCard = (name: string): { id: number; card: Card } | undefined => {
    if (!name) return undefined
    
    // 1. 直接匹配
    if (cardNameMap.has(name)) return cardNameMap.get(name)
    
    // 2. 标准化后匹配（去掉空格、点等）
    const normalized = name.replace(/[・\s\-－]/g, '')
    if (cardNameMap.has(normalized)) return cardNameMap.get(normalized)
    
    // 3. 模糊匹配
    for (const [key, value] of cardNameMap) {
      const keyNorm = key.replace(/[・\s\-－]/g, '')
      if (keyNorm.includes(normalized) || normalized.includes(keyNorm)) {
        return value
      }
    }
    
    return undefined
  }

  const handleStepChange = (index: number) => {
    if (isAnimating || index < 0 || index >= steps.length) return
    setIsAnimating(true)
    setActiveStep(index)
    setTimeout(() => setIsAnimating(false), 400)
  }

  const handleCardClick = (name: string) => {
    const found = findCard(name)
    if (found) {
      setPreviewCard(found.card)
    }
  }

  const currentStep = steps[activeStep]
  const currentField = currentStep.field

  return (
    <div className="min-h-[600px] bg-[#0a0a0a] text-amber-100 relative overflow-hidden">
      {/* 动态背景光效 */}
      <div className={cn(
        "absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#daa520]/5 blur-[120px] rounded-full transition-opacity duration-1000",
        isAnimating ? 'opacity-20' : 'opacity-40'
      )} />

      <div className="max-w-6xl mx-auto px-4 py-6 relative z-10">
        {/* 顶部标题 */}
        <header className="mb-6 flex justify-between items-end">
          <div>
            <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-[#daa520]/10 border border-[#daa520]/30 text-[#daa520] text-[10px] font-bold mb-2">
              <Play size={10} fill="currentColor" />
              COMBO SIMULATOR
            </div>
            <h1 className="text-2xl font-black tracking-tight text-[#fff176] italic">{title}</h1>
          </div>
          <div className="flex gap-2">
            <button 
              disabled={activeStep === 0} 
              onClick={() => handleStepChange(activeStep - 1)}
              className="p-2 bg-[#1a1a1a] border-2 border-[#333] disabled:opacity-20 hover:border-[#daa520] text-[#daa520] transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              disabled={activeStep === steps.length - 1} 
              onClick={() => handleStepChange(activeStep + 1)}
              className="p-2 bg-[#daa520] border-2 border-[#daa520] text-black disabled:opacity-20 hover:bg-[#b8860b] transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* 左侧：步骤导航 */}
          <div className="lg:col-span-3 space-y-2">
            {steps.map((s, i) => (
              <div 
                key={i}
                onClick={() => handleStepChange(i)}
                className={cn(
                  "group relative p-3 border-2 transition-all cursor-pointer overflow-hidden",
                  activeStep === i 
                    ? "bg-[#daa520] border-[#daa520] text-black translate-x-1" 
                    : "bg-[#111] border-[#333] text-[#5c4002] hover:border-[#5c4002]"
                )}
              >
                <div className="flex items-center gap-3 relative z-10">
                  <span className={cn(
                    "text-[10px] font-mono font-bold",
                    activeStep === i ? "text-black" : "text-[#daa520]"
                  )}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-bold text-xs truncate">{s.card}</h3>
                </div>
                {activeStep === i && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent animate-pulse" />
                )}
              </div>
            ))}

            {/* 效果说明 */}
            <div className="mt-4 p-4 bg-[#111] border-2 border-[#333]">
              <h2 className="text-sm font-black text-[#daa520] mb-2 uppercase tracking-tight italic border-b border-[#333] pb-2">
                Effect Resolution
              </h2>
              <p className="text-[11px] text-amber-100/70 leading-relaxed min-h-[50px]">
                {currentStep.desc}
              </p>
              <div className="mt-3 flex items-center gap-2 text-[10px] font-bold bg-[#daa520]/10 p-2 border border-[#daa520]/30 text-[#daa520]">
                <Zap size={12} fill="currentColor" />
                {currentStep.action}
              </div>
            </div>
          </div>

          {/* 右侧：3D 动态棋盘 */}
          <div className="lg:col-span-9 flex flex-col items-center">
            <div className="perspective-1000 w-full flex justify-center py-8">
              <div className="relative w-full max-w-2xl transform-gpu rotateX-35 transition-transform duration-700 hover:rotateX-28">
                {/* 额外怪兽区 (EMZ) - Link怪兽专用 */}
                <div className="grid grid-cols-7 gap-2 mb-3">
                  <div /> {/* 场地魔法占位 */}
                  <div />
                  {(currentField.emz || [null, null]).map((monster, i) => {
                    const found = monster ? findCard(monster) : undefined
                    return (
                      <FieldSlot key={i} label="EMZ" isActive={!!monster}>
                        {monster && (
                          <CardActor 
                            name={monster} 
                            cardId={found?.id}
                            onClick={() => handleCardClick(monster)}
                          />
                        )}
                      </FieldSlot>
                    )
                  })}
                  <div />
                  <div />
                  <div /> {/* 卡组占位 */}
                </div>

                {/* 主怪兽区 (MMZ) + 场地魔法 */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {/* 场地魔法 */}
                  <div className="flex flex-col gap-1">
                    <FieldSlot label="场地" isActive={!!currentField.field_spell}>
                      {currentField.field_spell && (() => {
                        const found = findCard(currentField.field_spell)
                        return (
                          <CardActor 
                            name={currentField.field_spell} 
                            cardId={found?.id}
                            onClick={() => handleCardClick(currentField.field_spell!)}
                          />
                        )
                      })()}
                    </FieldSlot>
                  </div>
                  
                  {/* MMZ 5格 */}
                  {currentField.mmz.map((monster, i) => {
                    const found = monster ? findCard(monster) : undefined
                    return (
                      <FieldSlot key={i} label="MMZ" isActive={!!monster}>
                        {monster && (
                          <CardActor 
                            name={monster} 
                            cardId={found?.id}
                            onClick={() => handleCardClick(monster)}
                          />
                        )}
                      </FieldSlot>
                    )
                  })}
                  
                  {/* 卡组 */}
                  <div className="flex flex-col gap-1">
                    <div className="w-full aspect-[3/4] bg-blue-900/20 border-2 border-[#333] flex items-center justify-center">
                      <Box size={12} className="text-[#5c4002] opacity-40" />
                    </div>
                    <span className="text-[6px] text-center text-[#5c4002]">DECK</span>
                  </div>
                </div>

                {/* 魔陷区 (STZ) + 墓地 */}
                <div className="grid grid-cols-7 gap-2">
                  {/* 墓地 */}
                  <div className="flex flex-col gap-1">
                    <div className={cn(
                      "w-full aspect-[3/4] border-2 flex flex-col items-center justify-center transition-all",
                      currentField.gy.length > 0 
                        ? "bg-purple-900/20 border-purple-500/50" 
                        : "bg-black/20 border-[#333]"
                    )}>
                      <Skull size={10} className={currentField.gy.length > 0 ? "text-purple-400" : "text-[#333]"} />
                      <span className="text-[6px] text-purple-400 font-bold">{currentField.gy.length}</span>
                    </div>
                    <span className="text-[6px] text-center text-purple-400/60">GY</span>
                  </div>
                  
                  {/* STZ 5格 */}
                  {(currentField.stz || [null, null, null, null, null]).map((card, i) => {
                    const found = card ? findCard(card) : undefined
                    return (
                      <FieldSlot key={i} label="STZ" isActive={!!card}>
                        {card && (
                          <CardActor 
                            name={card} 
                            cardId={found?.id}
                            onClick={() => handleCardClick(card)}
                          />
                        )}
                      </FieldSlot>
                    )
                  })}
                  
                  {/* 额外卡组 */}
                  <div className="flex flex-col gap-1">
                    <div className="w-full aspect-[3/4] bg-violet-900/20 border-2 border-[#333] flex items-center justify-center">
                      <Layers size={10} className="text-violet-500 opacity-40" />
                    </div>
                    <span className="text-[6px] text-center text-violet-400/60">EX</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 手牌区 */}
            <div className="w-full mt-4 flex flex-col items-center">
              <div className="text-[10px] font-bold text-[#5c4002] mb-3 tracking-widest uppercase">Your Hand</div>
              <div className="flex gap-3 justify-center min-h-[90px] items-end">
                {currentField.hand.map((h, i) => {
                  const found = findCard(h)
                  return (
                    <div 
                      key={`${h}-${i}`} 
                      className="w-14 h-20 relative cursor-pointer group transition-all hover:scale-110 hover:-translate-y-2 animate-in slide-in-from-bottom-4"
                      onClick={() => handleCardClick(h)}
                    >
                      {found?.id ? (
                        <>
                          <Image
                            src={`/card-images/cn/${found.id}.webp`}
                            alt={h}
                            fill
                            className="object-cover border-2 border-[#daa520]/50 shadow-lg"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.src = `/card-images/jp/${found.id}.webp`
                            }}
                          />
                          <div className="absolute inset-0 border-2 border-transparent group-hover:border-[#daa520] transition-colors" />
                        </>
                      ) : (
                        <div className="w-full h-full bg-[#1a1a1a] border-2 border-[#daa520]/50 flex flex-col items-center justify-center">
                          <Layers size={16} className="text-[#daa520] opacity-40 mb-1" />
                          <span className="text-[6px] font-bold text-center px-1 text-[#daa520] truncate w-full">{h}</span>
                        </div>
                      )}
                      <div className="absolute -bottom-4 left-0 right-0 text-[6px] font-bold text-center text-[#daa520]/60 truncate">
                        {h}
                      </div>
                    </div>
                  )
                })}
                {currentField.hand.length === 0 && (
                  <div className="text-[10px] text-[#333] italic border-2 border-dashed border-[#333] px-8 py-4 flex items-center">
                    Empty Hand
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 底部：压制力说明 */}
        {endBoard && activeStep === steps.length - 1 && (
          <footer className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 border-t-2 border-[#333] pt-6">
            {endBoard.pressure && (
              <div className="flex gap-4 items-start p-4 bg-[#111] border-2 border-[#333]">
                <Crown className="text-[#daa520] shrink-0 mt-1" size={20} />
                <div>
                  <h4 className="font-bold text-sm mb-1 text-[#fff176]">场面压制力</h4>
                  <p className="text-[11px] text-amber-100/60">{endBoard.pressure}</p>
                </div>
              </div>
            )}
            {endBoard.graveyard && (
              <div className="flex gap-4 items-start p-4 bg-[#111] border-2 border-[#333]">
                <Skull className="text-purple-400 shrink-0 mt-1" size={20} />
                <div>
                  <h4 className="font-bold text-sm mb-1 text-[#fff176]">墓地续航</h4>
                  <p className="text-[11px] text-amber-100/60">{endBoard.graveyard}</p>
                </div>
              </div>
            )}
          </footer>
        )}
      </div>

      {/* 卡片详情弹窗 */}
      {previewCard && (
        <CardDetailModal
          card={previewCard}
          onClose={() => setPreviewCard(null)}
        />
      )}

      {/* 3D 透视样式 */}
      <style jsx>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .rotateX-35 {
          transform: rotateX(35deg);
        }
        .rotateX-35:hover, .rotateX-28 {
          transform: rotateX(28deg);
        }
      `}</style>
    </div>
  )
}

// ============ 从现有 Combo 数据转换 ============
export function convertComboToSimulator(combo: {
  name?: string
  starting_hand?: string[]
  steps?: (string | { action: string; card?: string; card_cn?: string; effect?: string })[]
  end_board?: string | { field?: string[]; set?: string[]; graveyard?: string[] }
  weaknesses?: string[]
}): { title: string; steps: ComboStep[] } | null {
  if (!combo.steps || combo.steps.length === 0) return null

  // 简单转换：每一步只有文字，场面状态置空
  const steps: ComboStep[] = combo.steps.map((step, i) => {
    const stepText = typeof step === 'string' ? step : `${step.action}: ${step.card_cn || step.card}`
    
    return {
      title: `Step ${i + 1}`,
      card: stepText.split('，')[0] || stepText.substring(0, 20),
      desc: stepText,
      action: stepText.substring(0, 30) + (stepText.length > 30 ? '...' : ''),
      field: {
        mmz: [null, null, null, null, null],
        gy: [],
        hand: combo.starting_hand || []
      }
    }
  })

  return {
    title: combo.name || 'Combo',
    steps
  }
}

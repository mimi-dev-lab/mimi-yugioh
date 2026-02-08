'use client'

import { useState } from 'react'
import Image from 'next/image'
import { 
  Zap, Layers, ChevronLeft, ChevronRight, 
  Box, Skull, ShieldAlert, Ghost, Play
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CardDetailModal, type Card } from './CardDetailModal'

// ============ 类型定义 ============
interface FieldState {
  mmz: (CardRef | null)[]  // 主怪兽区 5格
  stz?: (CardRef | null)[] // 魔陷区 5格
  gy: CardRef[]            // 墓地
  hand: CardRef[]          // 手牌
  emz?: (CardRef | null)[] // 额外怪兽区 2格
  field?: CardRef | null   // 场地魔法区
  banished?: CardRef[]     // 除外区
  deck?: number            // 卡组剩余数量
  extraDeck?: number       // 额外卡组剩余数量
}

interface CardRef {
  id: number
  name: string
}

interface ComboStep {
  title: string
  card: CardRef
  desc: string
  action: string
  field: FieldState
}

interface ComboVisualizerProps {
  steps: ComboStep[]
  deckCards?: Map<number, Card>  // 卡组内所有卡的详情
  onCardClick?: (cardId: number) => void
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
      <span className="absolute inset-0 flex items-center justify-center opacity-10 text-[6px] font-bold uppercase pointer-events-none">
        {label}
      </span>
      {children}
    </div>
  )
}

// 卡片显示（真实卡图）
function CardActor({ 
  card, 
  onClick,
  size = 'normal'
}: { 
  card: CardRef
  onClick?: () => void
  size?: 'normal' | 'small'
}) {
  const imgSize = size === 'small' ? 'w-[85%] h-[85%]' : 'w-[90%] h-[90%]'
  
  return (
    <div 
      className={cn(
        imgSize,
        "relative cursor-pointer group transition-transform hover:scale-105"
      )}
      onClick={onClick}
    >
      <Image
        src={`/card-images/cn/${card.id}.webp`}
        alt={card.name}
        fill
        className="object-cover border border-[#daa520]/50 shadow-lg"
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.src = `/card-images/jp/${card.id}.webp`
        }}
      />
      {/* Hover 发光效果 */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-[#daa520]/30 to-transparent" />
      {/* 卡名 */}
      <div className="absolute -bottom-5 left-0 right-0 text-[7px] font-bold text-center text-amber-200/80 truncate px-1">
        {card.name}
      </div>
    </div>
  )
}

// 手牌卡片
function HandCard({ 
  card, 
  onClick 
}: { 
  card: CardRef
  onClick?: () => void
}) {
  return (
    <div 
      className="w-14 h-20 relative cursor-pointer group transition-all hover:scale-110 hover:-translate-y-2"
      onClick={onClick}
    >
      <Image
        src={`/card-images/cn/${card.id}.webp`}
        alt={card.name}
        fill
        className="object-cover border-2 border-[#daa520]/50 shadow-lg shadow-[#daa520]/20"
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.src = `/card-images/jp/${card.id}.webp`
        }}
      />
      <div className="absolute inset-0 border-2 border-transparent group-hover:border-[#daa520] transition-colors" />
      <div className="absolute -bottom-4 left-0 right-0 text-[6px] font-bold text-center text-amber-200/60 truncate">
        {card.name}
      </div>
    </div>
  )
}

// ============ 主组件 ============
export function ComboVisualizer({ 
  steps, 
  deckCards,
  onCardClick 
}: ComboVisualizerProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [previewCard, setPreviewCard] = useState<Card | null>(null)

  const handleStepChange = (index: number) => {
    if (isAnimating || index < 0 || index >= steps.length) return
    setIsAnimating(true)
    setActiveStep(index)
    setTimeout(() => setIsAnimating(false), 400)
  }

  const handleCardClick = (cardRef: CardRef) => {
    if (deckCards?.has(cardRef.id)) {
      setPreviewCard(deckCards.get(cardRef.id)!)
    } else if (onCardClick) {
      onCardClick(cardRef.id)
    }
  }

  const currentStep = steps[activeStep]
  const currentField = currentStep.field

  return (
    <div className="relative">
      {/* 魔法阵背景 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-20">
        <div className="w-[120%] aspect-square border border-[#daa520]/30 rounded-full animate-[spin_60s_linear_infinite]" />
        <div className="absolute w-[100%] aspect-square border border-[#daa520]/20 rounded-full animate-[spin_45s_linear_infinite_reverse]" />
        <div className="absolute w-[80%] aspect-square border border-dashed border-[#daa520]/10 rounded-full animate-[spin_30s_linear_infinite]" />
      </div>

      <div className="relative z-10">
        {/* 顶部：标题 + 导航 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2 py-1 bg-[#daa520]/10 border border-[#daa520]/30 text-[#daa520] text-[10px] font-bold mb-1">
              <Play size={10} fill="currentColor" />
              COMBO SIMULATOR
            </div>
            <h2 className="text-xl font-black text-[#fff176] tracking-tight">
              {currentStep.title}
            </h2>
          </div>
          
          <div className="flex gap-2">
            <button 
              disabled={activeStep === 0} 
              onClick={() => handleStepChange(activeStep - 1)}
              className="p-2 border-2 border-[#333] text-[#5c4002] disabled:opacity-20 hover:border-[#daa520] hover:text-[#daa520] transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="px-3 py-2 bg-[#daa520] text-black font-bold text-sm">
              {activeStep + 1} / {steps.length}
            </span>
            <button 
              disabled={activeStep === steps.length - 1} 
              onClick={() => handleStepChange(activeStep + 1)}
              className="p-2 border-2 border-[#daa520] bg-[#daa520] text-black disabled:opacity-20 hover:bg-[#b8860b] transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧：步骤列表 */}
          <div className="lg:col-span-3 space-y-2">
            {steps.map((s, i) => (
              <div 
                key={i}
                onClick={() => handleStepChange(i)}
                className={cn(
                  "group relative p-3 border-2 transition-all cursor-pointer overflow-hidden",
                  activeStep === i 
                    ? "bg-[#daa520] border-[#daa520] text-black translate-x-1" 
                    : "bg-black/40 border-[#333] text-[#5c4002] hover:border-[#5c4002]"
                )}
              >
                <div className="flex items-center gap-3 relative z-10">
                  <span className={cn(
                    "text-[10px] font-mono font-bold",
                    activeStep === i ? "text-black" : "text-[#daa520]"
                  )}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-xs truncate">{s.card.name}</h3>
                    <p className={cn(
                      "text-[9px] truncate",
                      activeStep === i ? "text-black/60" : "text-[#5c4002]/60"
                    )}>
                      {s.action}
                    </p>
                  </div>
                </div>
                {activeStep === i && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
                )}
              </div>
            ))}

            {/* 效果说明卡片 */}
            <div className="mt-4 p-4 bg-black/60 border-2 border-[#333]">
              <h3 className="text-xs font-bold text-[#daa520] mb-2 pb-2 border-b border-[#333] flex items-center gap-2">
                <Zap size={12} fill="currentColor" />
                效果处理
              </h3>
              <p className="text-[11px] text-amber-100/70 leading-relaxed">
                {currentStep.desc}
              </p>
              <div className="mt-3 flex items-center gap-2 text-[10px] font-bold bg-[#daa520]/10 p-2 border border-[#daa520]/30 text-[#daa520]">
                <Zap size={12} />
                {currentStep.action}
              </div>
            </div>
          </div>

          {/* 右侧：3D 棋盘 */}
          <div className="lg:col-span-9 flex flex-col items-center">
            <div className="perspective-1000 w-full flex justify-center py-6">
              <div className="relative w-full max-w-2xl transform-gpu rotateX-35 transition-transform duration-700">
                
                {/* 额外怪兽区 (EMZ) - 顶部中央 */}
                <div className="flex justify-center gap-2 mb-4">
                  <div className="w-14">
                    <FieldSlot label="EMZ" isActive={!!currentField.emz?.[0]}>
                      {currentField.emz?.[0] && (
                        <CardActor 
                          card={currentField.emz[0]} 
                          size="small"
                          onClick={() => handleCardClick(currentField.emz![0]!)}
                        />
                      )}
                    </FieldSlot>
                  </div>
                  <div className="w-14">
                    <FieldSlot label="EMZ" isActive={!!currentField.emz?.[1]}>
                      {currentField.emz?.[1] && (
                        <CardActor 
                          card={currentField.emz[1]} 
                          size="small"
                          onClick={() => handleCardClick(currentField.emz![1]!)}
                        />
                      )}
                    </FieldSlot>
                  </div>
                </div>

                {/* 主区域：左侧(场地+EX) + 中央(MMZ+STZ) + 右侧(除外+墓地+卡组) */}
                <div className="flex gap-3">
                  {/* 左侧：场地区 + 额外卡组 */}
                  <div className="flex flex-col gap-2 w-12">
                    {/* 场地魔法区 */}
                    <div className="w-full">
                      <FieldSlot label="FIELD" isActive={!!currentField.field}>
                        {currentField.field && (
                          <CardActor 
                            card={currentField.field} 
                            size="small"
                            onClick={() => handleCardClick(currentField.field!)}
                          />
                        )}
                      </FieldSlot>
                      <div className="text-[7px] text-center text-emerald-400/60 mt-1">场地</div>
                    </div>
                    {/* 额外卡组 */}
                    <div className="w-full">
                      <div className="w-full aspect-[3/4] bg-violet-900/30 border border-violet-500/40 flex flex-col items-center justify-center">
                        <Layers size={12} className="text-violet-400" />
                        <span className="text-[7px] text-violet-400 font-bold mt-0.5">
                          {currentField.extraDeck ?? 15}
                        </span>
                      </div>
                      <div className="text-[7px] text-center text-violet-400/60 mt-1">EX</div>
                    </div>
                  </div>

                  {/* 中央：主怪兽区 + 魔陷区 */}
                  <div className="flex-1">
                    {/* 主怪兽区 (MMZ) */}
                    <div className="grid grid-cols-5 gap-2 mb-2">
                      {currentField.mmz.map((monster, i) => (
                        <FieldSlot key={i} label="MMZ" isActive={!!monster}>
                          {monster && (
                            <CardActor 
                              card={monster} 
                              onClick={() => handleCardClick(monster)}
                            />
                          )}
                        </FieldSlot>
                      ))}
                    </div>

                    {/* 魔陷区 (STZ) */}
                    <div className="grid grid-cols-5 gap-2">
                      {(currentField.stz || [null, null, null, null, null]).map((spell, i) => (
                        <FieldSlot key={i} label="STZ" isActive={!!spell}>
                          {spell && (
                            <CardActor 
                              card={spell} 
                              onClick={() => handleCardClick(spell)}
                            />
                          )}
                        </FieldSlot>
                      ))}
                    </div>
                  </div>

                  {/* 右侧：除外区 + 墓地 + 卡组 */}
                  <div className="flex flex-col gap-2 w-12">
                    {/* 除外区 */}
                    <div className="w-full">
                      <div className={cn(
                        "w-full aspect-[3/4] border flex flex-col items-center justify-center transition-all",
                        (currentField.banished?.length ?? 0) > 0 
                          ? "bg-red-900/20 border-red-500/50" 
                          : "bg-black/20 border-[#333]"
                      )}>
                        <ShieldAlert size={12} className={(currentField.banished?.length ?? 0) > 0 ? "text-red-400" : "text-[#333]"} />
                        <span className="text-[7px] text-red-400 font-bold mt-0.5">
                          {currentField.banished?.length ?? 0}
                        </span>
                      </div>
                      <div className="text-[7px] text-center text-red-400/60 mt-1">除外</div>
                    </div>
                    {/* 墓地 */}
                    <div className="w-full">
                      <div className={cn(
                        "relative w-full aspect-[3/4] border flex flex-col items-center justify-center transition-all",
                        currentField.gy.length > 0 
                          ? "bg-purple-900/20 border-purple-500/50" 
                          : "bg-black/20 border-[#333]"
                      )}>
                        <Skull size={12} className={currentField.gy.length > 0 ? "text-purple-400" : "text-[#333]"} />
                        <span className="text-[7px] text-purple-400 font-bold mt-0.5">
                          {currentField.gy.length}
                        </span>
                      </div>
                      <div className="text-[7px] text-center text-purple-400/60 mt-1">墓地</div>
                    </div>
                    {/* 主卡组 */}
                    <div className="w-full">
                      <div className="w-full aspect-[3/4] bg-blue-900/20 border border-blue-500/40 flex flex-col items-center justify-center">
                        <Box size={12} className="text-blue-400" />
                        <span className="text-[7px] text-blue-400 font-bold mt-0.5">
                          {currentField.deck ?? 40}
                        </span>
                      </div>
                      <div className="text-[7px] text-center text-blue-400/60 mt-1">卡组</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 手牌区 */}
            <div className="w-full mt-8 flex flex-col items-center">
              <div className="text-[10px] font-bold text-[#5c4002] mb-3 tracking-widest uppercase flex items-center gap-2">
                <Layers size={12} />
                HAND
              </div>
              <div className="flex gap-4 justify-center min-h-[90px] items-end">
                {currentField.hand.map((h, i) => (
                  <HandCard 
                    key={`${h.id}-${i}`} 
                    card={h} 
                    onClick={() => handleCardClick(h)}
                  />
                ))}
                {currentField.hand.length === 0 && (
                  <div className="text-[10px] text-[#333] italic border border-dashed border-[#333] px-8 py-4">
                    手牌为空
                  </div>
                )}
              </div>
            </div>

            {/* 墓地列表 */}
            {currentField.gy.length > 0 && (
              <div className="w-full mt-6 p-3 bg-purple-900/10 border border-purple-500/20">
                <div className="text-[9px] font-bold text-purple-400 mb-2 flex items-center gap-1">
                  <Ghost size={10} />
                  墓地 ({currentField.gy.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {currentField.gy.map((c, i) => (
                    <span 
                      key={`${c.id}-${i}`}
                      onClick={() => handleCardClick(c)}
                      className="text-[9px] px-2 py-0.5 bg-purple-900/30 text-purple-300 cursor-pointer hover:bg-purple-900/50 transition-colors"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
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
        .rotateX-35:hover {
          transform: rotateX(28deg);
        }
      `}</style>
    </div>
  )
}

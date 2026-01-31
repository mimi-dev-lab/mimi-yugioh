/**
 * 交互式 Combo 步骤组件
 * 点击展开详细说明，显示涉及的卡图
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, ArrowRight, Sparkles } from 'lucide-react'

interface CardInfo {
  id: number
  name: string
  name_cn: string
}

interface Step {
  num: string
  text: string
  textCn?: string
  cards?: CardInfo[]
  subSteps?: string[]
}

interface ComboStepProps {
  steps: Step[]
  requiredCards?: CardInfo[]
  resultBoard?: string
  allCards?: Map<string, CardInfo> // 用于从文本中提取卡片
}

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'

// 从步骤文本中提取涉及的卡片名
function extractCardsFromText(text: string, cardMap: Map<string, CardInfo>): CardInfo[] {
  const found: CardInfo[] = []
  const seen = new Set<number>()
  
  cardMap.forEach((card, name) => {
    // 检查日文名或中文名
    if ((text.includes(name) || text.includes(card.name_cn)) && !seen.has(card.id)) {
      found.push(card)
      seen.add(card.id)
    }
  })
  
  return found
}

export default function ComboStep({ steps, requiredCards, resultBoard, allCards }: ComboStepProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0]))

  const toggleStep = (index: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedSteps(new Set(steps.map((_, i) => i)))
  }

  const collapseAll = () => {
    setExpandedSteps(new Set())
  }

  return (
    <div className="space-y-4">
      {/* 必要卡片 */}
      {requiredCards && requiredCards.length > 0 && (
        <div className="bg-gradient-to-r from-amber-900/30 to-yellow-900/20 rounded-xl p-4 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="text-amber-400" size={18} />
            <span className="text-amber-300 font-medium">必要手卡</span>
          </div>
          <div className="flex gap-3 flex-wrap">
            {requiredCards.map((card, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-900/50 rounded-lg p-2">
                <img
                  src={`${R2_BASE}/cn/${card.id}.webp`}
                  alt={card.name_cn}
                  className="w-10 h-14 object-cover rounded shadow"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards_small/${card.id}.jpg`
                  }}
                />
                <span className="text-gray-200 text-sm">{card.name_cn}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 控制按钮 */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={expandAll}
          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700/50 transition-colors"
        >
          全部展开
        </button>
        <button
          onClick={collapseAll}
          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700/50 transition-colors"
        >
          全部折叠
        </button>
      </div>

      {/* 步骤列表 */}
      <div className="space-y-2">
        {steps.map((step, index) => {
          const isExpanded = expandedSteps.has(index)
          const involvedCards = allCards ? extractCardsFromText(step.text, allCards) : (step.cards || [])
          
          return (
            <div 
              key={index}
              className="bg-gray-800/60 rounded-xl border border-gray-700/50 overflow-hidden"
            >
              {/* 步骤标题栏 */}
              <button
                onClick={() => toggleStep(index)}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-700/30 transition-colors"
              >
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/20">
                  {step.num}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-gray-200 line-clamp-1">
                    {step.textCn || step.text.split('\n')[0]}
                  </div>
                  {involvedCards.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {involvedCards.slice(0, 4).map((card, i) => (
                        <img
                          key={i}
                          src={`${R2_BASE}/cn/${card.id}.webp`}
                          alt={card.name_cn}
                          className="w-6 h-8 object-cover rounded border border-gray-600"
                        />
                      ))}
                      {involvedCards.length > 4 && (
                        <span className="text-gray-500 text-xs self-center">+{involvedCards.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronDown className="text-gray-400" size={20} />
                ) : (
                  <ChevronRight className="text-gray-400" size={20} />
                )}
              </button>

              {/* 展开内容 */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-700/50">
                  {/* 涉及的卡片 */}
                  {involvedCards.length > 0 && (
                    <div className="flex gap-2 py-3 overflow-x-auto">
                      {involvedCards.map((card, i) => (
                        <div key={i} className="flex-shrink-0 text-center">
                          <img
                            src={`${R2_BASE}/cn/${card.id}.webp`}
                            alt={card.name_cn}
                            className="w-14 h-20 object-cover rounded border border-purple-500/30 shadow-lg"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards_small/${card.id}.jpg`
                            }}
                          />
                          <div className="text-[10px] text-gray-400 mt-1 max-w-[56px] truncate">
                            {card.name_cn}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 详细步骤 */}
                  <div className="space-y-2 pt-2">
                    {step.text.split('\n').filter(line => line.trim()).map((line, i) => {
                      const isArrow = line.trim().startsWith('→')
                      return (
                        <div key={i} className={`flex items-start gap-2 ${isArrow ? 'pl-4' : ''}`}>
                          {isArrow ? (
                            <ArrowRight className="text-purple-400 flex-shrink-0 mt-0.5" size={14} />
                          ) : (
                            <span className="text-gray-500 flex-shrink-0">•</span>
                          )}
                          <span className={`${isArrow ? 'text-purple-300' : 'text-gray-300'} text-sm leading-relaxed`}>
                            {line.replace(/^→\s*/, '')}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 最终盘面 */}
      {resultBoard && (
        <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/20 rounded-xl p-4 border border-green-500/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm">✓</span>
            </div>
            <span className="text-green-300 font-medium">最终盘面</span>
          </div>
          <p className="text-gray-300 text-sm">{resultBoard}</p>
        </div>
      )}
    </div>
  )
}

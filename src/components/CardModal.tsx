import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { Card } from '../types'
import { getAttributeCN, getRaceCN, getCardFrame } from '../utils/cardMappings'

interface CardModalProps {
  cardId: number | null
  onClose: () => void
}

export default function CardModal({ cardId, onClose }: CardModalProps) {
  const [card, setCard] = useState<Card | null>(null)
  const [loading, setLoading] = useState(false)

  const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'

  useEffect(() => {
    if (!cardId) {
      setCard(null)
      return
    }

    async function loadCard() {
      setLoading(true)
      try {
        const res = await fetch('/data/cards.json')
        const data: Card[] = await res.json()
        const found = data.find(c => c.id === cardId)
        setCard(found || null)
      } catch {
        setCard(null)
      } finally {
        setLoading(false)
      }
    }
    loadCard()
  }, [cardId])

  // ESC 键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  if (!cardId) return null

  const frame = card ? getCardFrame(card.type) : ''
  const attributeCN = card ? getAttributeCN(card.attribute) : ''
  const raceCN = card ? getRaceCN(card.race) : ''

  // 边框颜色
  const getFrameColor = (f: string) => {
    const colors: Record<string, string> = {
      '魔法': 'border-emerald-500',
      '陷阱': 'border-pink-500',
      '融合': 'border-purple-500',
      '同步': 'border-gray-300',
      '超量': 'border-gray-600',
      '连接': 'border-blue-500',
      '仪式': 'border-sky-500',
      '灵摆': 'border-orange-500',
      '通常': 'border-amber-500',
      '效果': 'border-orange-500',
    }
    return colors[f] || 'border-gray-500'
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-ygo-dark rounded-2xl border-2 ${card ? getFrameColor(frame) : 'border-gray-700'} shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-gray-800/80 rounded-full hover:bg-gray-700 transition-colors"
        >
          <X size={20} className="text-gray-400" />
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-ygo-accent" size={40} />
          </div>
        ) : card ? (
          <div className="flex flex-col md:flex-row gap-6 p-6">
            {/* 卡图 */}
            <div className="flex-shrink-0 mx-auto md:mx-0">
              <img
                src={`${R2_BASE}/cn/${card.id}.webp`}
                alt={card.name_cn || card.name}
                className="w-48 md:w-56 rounded-lg shadow-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`
                }}
              />
            </div>

            {/* 卡片信息 */}
            <div className="flex-1 space-y-4">
              {/* 名称 */}
              <div>
                <h2 className="text-2xl font-bold text-white">{card.name_cn || card.name}</h2>
                {card.name_cn && (
                  <p className="text-gray-400 text-sm">{card.name}</p>
                )}
                {card.name_jp && (
                  <p className="text-gray-500 text-xs">{card.name_jp}</p>
                )}
              </div>

              {/* 属性标签 */}
              <div className="flex flex-wrap gap-2">
                <span className={`px-3 py-1 rounded-lg text-sm ${
                  frame === '魔法' ? 'bg-emerald-500/20 text-emerald-400' :
                  frame === '陷阱' ? 'bg-pink-500/20 text-pink-400' :
                  frame === '融合' ? 'bg-purple-500/20 text-purple-400' :
                  frame === '同步' ? 'bg-gray-300/20 text-gray-200' :
                  frame === '超量' ? 'bg-gray-800 text-gray-200' :
                  frame === '连接' ? 'bg-blue-500/20 text-blue-400' :
                  frame === '仪式' ? 'bg-sky-500/20 text-sky-400' :
                  'bg-orange-500/20 text-orange-400'
                }`}>
                  {frame}
                </span>
                {attributeCN && (
                  <span className="px-3 py-1 rounded-lg text-sm bg-gray-700 text-gray-300">
                    {attributeCN}
                  </span>
                )}
                {raceCN && !['魔法', '陷阱'].includes(frame) && (
                  <span className="px-3 py-1 rounded-lg text-sm bg-gray-700 text-gray-300">
                    {raceCN}
                  </span>
                )}
                {card.level && (
                  <span className="px-3 py-1 rounded-lg text-sm bg-ygo-gold/20 text-ygo-gold">
                    ★ {card.level}
                  </span>
                )}
              </div>

              {/* 攻守 */}
              {card.atk !== null && (
                <div className="flex gap-4 text-lg">
                  <span className="text-red-400">
                    ATK <span className="font-bold text-white">{card.atk}</span>
                  </span>
                  {card.def !== null && (
                    <span className="text-blue-400">
                      DEF <span className="font-bold text-white">{card.def}</span>
                    </span>
                  )}
                </div>
              )}

              {/* 效果描述 */}
              <div className="p-4 bg-gray-800/50 rounded-lg">
                <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {card.desc_cn || card.desc}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">
            卡片信息加载失败
          </div>
        )}
      </div>
    </div>
  )
}

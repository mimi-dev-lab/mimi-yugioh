/**
 * 卡片详情弹窗
 */
import { X } from 'lucide-react'
import { useEffect } from 'react'

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

interface CardModalProps {
  card: CardInfo | null
  onClose: () => void
}

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'

export default function CardModal({ card, onClose }: CardModalProps) {
  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  if (!card) return null

  // 解析卡片类型
  const getTypeLabel = (type?: string) => {
    if (!type) return '未知'
    if (type.includes('Synchro')) return '同调怪兽'
    if (type.includes('Link')) return '链接怪兽'
    if (type.includes('Xyz')) return '超量怪兽'
    if (type.includes('Fusion')) return '融合怪兽'
    if (type.includes('Ritual')) return '仪式怪兽'
    if (type.includes('Tuner')) return '调整怪兽'
    if (type.includes('Effect')) return '效果怪兽'
    if (type.includes('Normal')) return '通常怪兽'
    if (type.includes('Spell')) return '魔法卡'
    if (type.includes('Trap')) return '陷阱卡'
    return type
  }

  const getAttributeLabel = (attr?: string) => {
    const map: Record<string, string> = {
      'LIGHT': '光', 'DARK': '暗', 'FIRE': '炎',
      'WATER': '水', 'EARTH': '地', 'WIND': '风', 'DIVINE': '神'
    }
    return map[attr || ''] || attr || ''
  }

  const getRaceLabel = (race?: string) => {
    const map: Record<string, string> = {
      'Spellcaster': '魔法师', 'Dragon': '龙', 'Zombie': '不死',
      'Warrior': '战士', 'Beast-Warrior': '兽战士', 'Beast': '兽',
      'Winged Beast': '鸟兽', 'Machine': '机械', 'Fiend': '恶魔',
      'Fairy': '天使', 'Insect': '昆虫', 'Dinosaur': '恐龙',
      'Reptile': '爬虫', 'Fish': '鱼', 'Sea Serpent': '海龙',
      'Aqua': '水', 'Pyro': '炎', 'Thunder': '雷',
      'Rock': '岩石', 'Plant': '植物', 'Psychic': '超能力',
      'Wyrm': '幻龙', 'Cyberse': '电子界', 'Illusion': '幻想魔'
    }
    return map[race || ''] || race || ''
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 max-w-lg w-full max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white">{card.name_cn}</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="text-gray-400" size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          <div className="flex gap-4">
            {/* 卡图 */}
            <div className="flex-shrink-0">
              <img
                src={`${R2_BASE}/cn/${card.id}.webp`}
                alt={card.name_cn}
                className="w-32 h-44 object-cover rounded-lg border border-gray-600"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`
                }}
              />
            </div>

            {/* 信息 */}
            <div className="flex-1 space-y-2">
              <div className="text-sm text-gray-400">{card.name}</div>
              
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 bg-purple-600/30 text-purple-300 rounded">
                  {getTypeLabel(card.type)}
                </span>
                {card.attribute && (
                  <span className="px-2 py-1 bg-blue-600/30 text-blue-300 rounded">
                    {getAttributeLabel(card.attribute)}
                  </span>
                )}
                {card.race && (
                  <span className="px-2 py-1 bg-green-600/30 text-green-300 rounded">
                    {getRaceLabel(card.race)}
                  </span>
                )}
              </div>

              {card.level !== undefined && (
                <div className="text-yellow-400 text-sm">
                  {'★'.repeat(card.level)}
                </div>
              )}

              {(card.atk !== undefined || card.def !== undefined) && (
                <div className="text-sm text-gray-300">
                  ATK/{card.atk ?? '?'} DEF/{card.def ?? '?'}
                </div>
              )}
            </div>
          </div>

          {/* 效果文本 */}
          {card.desc_cn && (
            <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                {card.desc_cn}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

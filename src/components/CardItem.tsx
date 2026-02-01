import { Link } from 'react-router-dom'
import type { Card } from '../types'
import { getAttributeCN, getRaceCN, getCardFrame } from '../utils/cardMappings'

interface CardItemProps {
  card: Card
}

export default function CardItem({ card }: CardItemProps) {
  // 卡片边框对应的颜色
  const getFrameColor = (frame: string) => {
    const colors: Record<string, string> = {
      '魔法': 'bg-emerald-500/20 text-emerald-400',
      '陷阱': 'bg-pink-500/20 text-pink-400',
      '融合': 'bg-purple-500/20 text-purple-400',
      '同步': 'bg-gray-300/20 text-gray-200',
      '超量': 'bg-gray-800/80 text-gray-200',
      '连接': 'bg-blue-500/20 text-blue-400',
      '仪式': 'bg-sky-500/20 text-sky-400',
      '灵摆': 'bg-gradient-to-r from-emerald-500/20 to-orange-500/20 text-orange-400',
      '通常': 'bg-amber-500/20 text-amber-400',
      '效果': 'bg-orange-500/20 text-orange-400',
    }
    return colors[frame] || 'bg-gray-500/20 text-gray-400'
  }

  // 属性对应的颜色
  const getAttributeColor = (attr: string) => {
    const colors: Record<string, string> = {
      '暗': 'text-purple-400',
      '光': 'text-yellow-400',
      '地': 'text-amber-600',
      '水': 'text-blue-400',
      '火': 'text-red-400',
      '风': 'text-green-400',
      '神': 'text-yellow-300',
    }
    return colors[attr] || 'text-gray-400'
  }

  // 使用 API 返回的图片 URL，或构造默认 URL
  const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'
  const imageUrl = card.image_url || `${R2_BASE}/cn/${card.id}.webp`

  const frame = getCardFrame(card.type)
  const attributeCN = getAttributeCN(card.attribute)
  const raceCN = getRaceCN(card.race)

  return (
    <Link 
      to={`/cards/${card.id}`}
      className="group cursor-pointer"
    >
      <div className="aspect-[59/86] bg-ygo-dark rounded-lg border border-gray-700 overflow-hidden card-hover relative">
        <img
          src={imageUrl}
          alt={card.name_cn || card.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            // 图片加载失败时使用备用图
            (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`
          }}
        />
        
        {/* 悬停时显示卡牌信息 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2">
          {card.atk !== null && (
            <div className="text-xs text-gray-300">
              攻/{card.atk} 守/{card.def}
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-2 space-y-1">
        <h3 className="text-sm text-gray-200 truncate group-hover:text-ygo-accent transition-colors">
          {card.name_cn || card.name}
        </h3>
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded ${getFrameColor(frame)}`}>
            {frame === '魔法' || frame === '陷阱' ? frame : raceCN || frame}
          </span>
          {attributeCN && (
            <span className={`text-xs ${getAttributeColor(attributeCN)}`}>
              {attributeCN}
            </span>
          )}
          {card.level && (
            <span className="text-xs text-ygo-gold">★{card.level}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

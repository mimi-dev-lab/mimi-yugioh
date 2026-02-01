/**
 * 卡片标签组件
 * 显示卡名，hover 显示卡图
 */

import { useState } from 'react'

interface CardInfo {
  id: number
  name: string
  name_cn: string
  type?: string
  desc_cn?: string
}

interface CardTagProps {
  name: string
  game8Id?: string
  cardData?: CardInfo
  showImage?: boolean
}

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'

export default function CardTag({ name, game8Id: _game8Id, cardData, showImage = true }: CardTagProps) {
  void _game8Id // suppress unused warning
  const [showTooltip, setShowTooltip] = useState(false)
  
  const displayName = cardData?.name_cn || name
  const cardId = cardData?.id
  
  return (
    <span 
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="text-purple-400 hover:text-purple-300 cursor-pointer border-b border-dotted border-purple-400/50">
        {displayName}
      </span>
      
      {/* Tooltip with card image */}
      {showImage && showTooltip && cardId && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none">
          <div className="bg-gray-900 rounded-lg shadow-xl border border-gray-700 p-2">
            <img
              src={`${R2_BASE}/cn/${cardId}.webp`}
              alt={displayName}
              className="w-24 h-32 object-cover rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards_small/${cardId}.jpg`
              }}
            />
            <div className="text-center text-xs text-gray-300 mt-1 max-w-[96px] truncate">
              {displayName}
            </div>
          </div>
        </div>
      )}
    </span>
  )
}

// 解析文本中的 {{card:name:id}} 并渲染为 CardTag
export function renderWithCards(
  text: string, 
  cardIndex: Map<string, CardInfo>
): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const pattern = /\{\{card:([^:}]+):(\d*)\}\}|\[\[card:([^|\]]+)\|?(\d*)\]\]/g
  
  let lastIndex = 0
  let match
  let key = 0
  
  while ((match = pattern.exec(text)) !== null) {
    // 添加匹配之前的文本
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    
    const name = match[1] || match[3]
    const id = match[2] || match[4]
    
    // 查找卡片数据
    let cardData: CardInfo | undefined
    if (id) {
      cardData = cardIndex.get(id)
    }
    if (!cardData) {
      cardData = cardIndex.get(name)
    }
    
    parts.push(
      <CardTag 
        key={key++} 
        name={name} 
        game8Id={id} 
        cardData={cardData}
      />
    )
    
    lastIndex = match.index + match[0].length
  }
  
  // 添加剩余文本
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  
  return parts
}

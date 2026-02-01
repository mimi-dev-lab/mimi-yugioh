/**
 * 可点击的卡片组件
 * 点击后弹出详情弹窗
 */

import { useState } from 'react'
import CardDetailModal from './CardDetailModal'

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'

interface ClickableCardProps {
  id: number
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showName?: boolean
  className?: string
}

const sizeClasses = {
  xs: 'w-8 h-[47px]',
  sm: 'w-12 h-[70px]',
  md: 'w-16 h-[93px]',
  lg: 'w-24 h-[140px]'
}

export default function ClickableCard({ 
  id, 
  name, 
  size = 'sm', 
  showName = false,
  className = ''
}: ClickableCardProps) {
  const [showModal, setShowModal] = useState(false)
  const [imgSrc, setImgSrc] = useState(
    id && id !== 0 
      ? `${R2_BASE}/cn/${id}.webp` 
      : ''
  )
  
  const handleImgError = () => {
    if (imgSrc.includes('r2.dev')) {
      setImgSrc(`https://images.ygoprodeck.com/images/cards_small/${id}.jpg`)
    }
  }
  
  const handleClick = () => {
    setShowModal(true)
  }
  
  // 无 ID 时显示占位符
  if (!id || id === 0) {
    return (
      <div className={`${sizeClasses[size]} ${className}`}>
        <div 
          className={`${sizeClasses[size]} bg-gray-800 rounded border border-gray-700 flex items-center justify-center cursor-pointer hover:border-purple-500 transition-colors`}
          onClick={handleClick}
          title={name}
        >
          <span className="text-xs text-gray-500 text-center px-1 line-clamp-2">
            {name.slice(0, 6)}
          </span>
        </div>
        {showName && (
          <p className="text-xs text-gray-400 mt-1 text-center truncate" title={name}>
            {name}
          </p>
        )}
        {showModal && (
          <CardDetailModal 
            cardId={id} 
            cardName={name}
            onClose={() => setShowModal(false)} 
          />
        )}
      </div>
    )
  }
  
  return (
    <div className={`${className}`}>
      <img
        src={imgSrc}
        alt={name}
        className={`${sizeClasses[size]} object-cover rounded border border-gray-700 hover:border-purple-500 hover:scale-105 cursor-pointer transition-all shadow-md`}
        onClick={handleClick}
        onError={handleImgError}
        title={name}
      />
      {showName && (
        <p 
          className="text-xs text-gray-400 mt-1 text-center truncate cursor-pointer hover:text-purple-400"
          style={{ maxWidth: sizeClasses[size].split(' ')[0].replace('w-', '') + 'rem' }}
          onClick={handleClick}
          title={name}
        >
          {name}
        </p>
      )}
      {showModal && (
        <CardDetailModal 
          cardId={id} 
          cardName={name}
          onClose={() => setShowModal(false)} 
        />
      )}
    </div>
  )
}

// 可点击的卡名（纯文字版）
interface ClickableCardNameProps {
  id: number
  name: string
  className?: string
}

export function ClickableCardName({ id, name, className = '' }: ClickableCardNameProps) {
  const [showModal, setShowModal] = useState(false)
  
  return (
    <>
      <span 
        className={`cursor-pointer hover:text-purple-400 underline decoration-dotted underline-offset-2 ${className}`}
        onClick={() => setShowModal(true)}
      >
        {name}
      </span>
      {showModal && (
        <CardDetailModal 
          cardId={id} 
          cardName={name}
          onClose={() => setShowModal(false)} 
        />
      )}
    </>
  )
}

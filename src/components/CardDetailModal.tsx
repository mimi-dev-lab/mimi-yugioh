/**
 * 卡片详情弹窗组件
 * 点击卡图/卡名时弹出，显示完整卡片信息
 */

import { useEffect, useState } from 'react'
import { X, Loader2, ZoomIn } from 'lucide-react'
import { createPortal } from 'react-dom'

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'

interface CardData {
  id: number
  name: string
  name_cn?: string
  name_jp?: string
  type: string
  desc: string
  desc_cn?: string
  atk?: number | null
  def?: number | null
  level?: number | null
  race?: string
  attribute?: string
}

interface CardDetailModalProps {
  cardId: number
  cardName?: string
  onClose: () => void
}

// 属性中文映射
const attributeCN: Record<string, string> = {
  DARK: '暗',
  LIGHT: '光',
  EARTH: '地',
  WATER: '水',
  FIRE: '炎',
  WIND: '风',
  DIVINE: '神',
}

// 属性颜色映射
const attributeColors: Record<string, string> = {
  DARK: 'bg-purple-600',
  LIGHT: 'bg-yellow-400 text-black',
  EARTH: 'bg-amber-700',
  WATER: 'bg-blue-500',
  FIRE: 'bg-red-500',
  WIND: 'bg-green-500',
  DIVINE: 'bg-gradient-to-r from-yellow-400 to-orange-500',
}

// 卡片类型中文映射
const typeCN: Record<string, string> = {
  'Normal Monster': '通常怪兽',
  'Effect Monster': '效果怪兽',
  'Fusion Monster': '融合怪兽',
  'Synchro Monster': '同步怪兽',
  'Xyz Monster': '超量怪兽',
  'Link Monster': '链接怪兽',
  'Ritual Monster': '仪式怪兽',
  'Ritual Effect Monster': '仪式/效果怪兽',
  'Fusion Effect Monster': '融合/效果怪兽',
  'Synchro Effect Monster': '同步/效果怪兽',
  'Synchro Tuner Effect Monster': '同步/调整/效果怪兽',
  'Spell Card': '魔法卡',
  'Trap Card': '陷阱卡',
  'Pendulum Effect Monster': '灵摆/效果怪兽',
  'Pendulum Normal Monster': '灵摆/通常怪兽',
  'Pendulum Tuner Effect Monster': '灵摆/调整/效果怪兽',
  'Tuner Monster': '调整怪兽',
  'Flip Effect Monster': '反转效果怪兽',
  'Spirit Monster': '灵魂怪兽',
  'Union Effect Monster': '同盟/效果怪兽',
  'Gemini Monster': '二重怪兽',
  'Toon Monster': '卡通怪兽',
}

// 种族中文映射
const raceCN: Record<string, string> = {
  'Spellcaster': '魔法师',
  'Dragon': '龙',
  'Zombie': '不死',
  'Warrior': '战士',
  'Beast-Warrior': '兽战士',
  'Beast': '兽',
  'Winged Beast': '鸟兽',
  'Fiend': '恶魔',
  'Fairy': '天使',
  'Insect': '昆虫',
  'Dinosaur': '恐龙',
  'Reptile': '爬虫',
  'Fish': '鱼',
  'Sea Serpent': '海龙',
  'Aqua': '水',
  'Pyro': '炎',
  'Thunder': '雷',
  'Rock': '岩石',
  'Plant': '植物',
  'Machine': '机械',
  'Psychic': '念动力',
  'Divine-Beast': '幻神兽',
  'Wyrm': '幻龙',
  'Cyberse': '电子界',
  'Illusion': '幻想魔',
  // 魔法陷阱类型
  'Normal': '通常',
  'Continuous': '永续',
  'Quick-Play': '速攻',
  'Equip': '装备',
  'Field': '场地',
  'Ritual': '仪式',
  'Counter': '反击',
}

// 卡片类型颜色
const typeColors: Record<string, string> = {
  'Normal Monster': 'bg-yellow-600',
  'Effect Monster': 'bg-orange-600',
  'Fusion Monster': 'bg-purple-700',
  'Fusion Effect Monster': 'bg-purple-700',
  'Synchro Monster': 'bg-gray-200 text-black',
  'Synchro Effect Monster': 'bg-gray-200 text-black',
  'Synchro Tuner Effect Monster': 'bg-gray-200 text-black',
  'Xyz Monster': 'bg-gray-900 border border-white',
  'Link Monster': 'bg-blue-800',
  'Ritual Monster': 'bg-blue-500',
  'Ritual Effect Monster': 'bg-blue-500',
  'Spell Card': 'bg-teal-600',
  'Trap Card': 'bg-pink-700',
  'Pendulum Effect Monster': 'bg-gradient-to-r from-green-500 to-blue-500',
  'Pendulum Normal Monster': 'bg-gradient-to-r from-yellow-500 to-blue-500',
}

// 图片放大弹窗
function ImageZoomModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return createPortal(
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 cursor-zoom-out"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-gray-800 hover:bg-gray-700 transition"
      >
        <X size={24} />
      </button>
    </div>,
    document.body
  )
}

export default function CardDetailModal({ cardId, cardName, onClose }: CardDetailModalProps) {
  const [card, setCard] = useState<CardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imgSrc, setImgSrc] = useState<string>('')
  const [showZoom, setShowZoom] = useState(false)
  
  // 禁用背景滚动
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  
  // 加载卡片数据
  useEffect(() => {
    const loadCard = async () => {
      if (!cardId || cardId === 0) {
        setError('无卡片 ID')
        setLoading(false)
        return
      }
      
      try {
        setLoading(true)
        // 从本地 cards.json 查找
        const res = await fetch('/data/cards.json')
        if (!res.ok) throw new Error('无法加载卡片数据库')
        const cards: CardData[] = await res.json()
        const found = cards.find(c => c.id === cardId)
        
        if (found) {
          setCard(found)
        } else {
          // 本地没有，尝试从 API 获取
          const apiRes = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${cardId}`)
          if (apiRes.ok) {
            const apiData = await apiRes.json()
            if (apiData.data && apiData.data[0]) {
              setCard(apiData.data[0])
            } else {
              setError('卡片不存在')
            }
          } else {
            setError('卡片不存在')
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }
    loadCard()
  }, [cardId])
  
  // 设置图片源
  useEffect(() => {
    if (cardId && cardId !== 0) {
      setImgSrc(`${R2_BASE}/cn/${cardId}.webp`)
    }
  }, [cardId])
  
  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showZoom) {
          setShowZoom(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose, showZoom])
  
  // 图片加载失败时切换源
  const handleImgError = () => {
    if (imgSrc.includes('r2.dev')) {
      setImgSrc(`https://images.ygoprodeck.com/images/cards/${cardId}.jpg`)
    }
  }
  
  // 高清图片 URL
  const hdImageUrl = imgSrc.includes('r2.dev') 
    ? imgSrc.replace('/cn/', '/cn/').replace('.webp', '.webp') // 保持原样，R2已是高清
    : `https://images.ygoprodeck.com/images/cards/${cardId}.jpg`
  
  const displayName = card?.name_cn || card?.name || cardName || '未知卡片'
  const cardType = card?.type || ''
  const isMonster = cardType.includes('Monster')
  
  // 使用 Portal 渲染到 body
  return createPortal(
    <>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div 
          className="relative bg-gray-900 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-hidden border border-gray-700 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 关闭按钮 */}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-800 hover:bg-gray-700 transition"
          >
            <X size={20} />
          </button>
          
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="animate-spin text-purple-500" size={32} />
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <p className="text-gray-500 text-sm">卡片 ID: {cardId}</p>
              {cardName && <p className="text-gray-400 mt-2">{cardName}</p>}
            </div>
          ) : card ? (
            <div className="flex flex-col md:flex-row">
              {/* 左侧：卡图（可点击放大） */}
              <div className="md:w-2/5 p-4 flex justify-center">
                <div className="relative group cursor-zoom-in" onClick={() => setShowZoom(true)}>
                  <img
                    src={imgSrc}
                    alt={displayName}
                    className="w-full max-w-[180px] rounded-lg shadow-lg transition-transform group-hover:scale-105"
                    onError={handleImgError}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                    <ZoomIn className="text-white" size={32} />
                  </div>
                </div>
              </div>
              
              {/* 右侧：卡片信息 */}
              <div className="md:w-3/5 p-4 md:pl-0 overflow-y-auto max-h-[70vh]">
                {/* 卡名 */}
                <h2 className="text-xl font-bold text-white mb-1">{displayName}</h2>
                {card.name_jp && (
                  <p className="text-sm text-gray-400 mb-3">{card.name_jp}</p>
                )}
                
                {/* 标签 */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {/* 卡片类型 */}
                  <span className={`px-2 py-1 rounded text-xs font-medium ${typeColors[cardType] || 'bg-gray-700'}`}>
                    {typeCN[cardType] || cardType}
                  </span>
                  
                  {/* 属性 */}
                  {card.attribute && (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${attributeColors[card.attribute] || 'bg-gray-600'}`}>
                      {attributeCN[card.attribute] || card.attribute}
                    </span>
                  )}
                  
                  {/* 种族 */}
                  {card.race && (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-gray-700">
                      {raceCN[card.race] || card.race}
                    </span>
                  )}
                </div>
                
                {/* 怪兽数值 */}
                {isMonster && (
                  <div className="flex gap-4 mb-4">
                    {card.level !== null && card.level !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="text-yellow-400">★</span>
                        <span className="text-white font-bold">{card.level}</span>
                      </div>
                    )}
                    {card.atk !== null && card.atk !== undefined && (
                      <div>
                        <span className="text-gray-400 text-sm">ATK</span>
                        <span className="text-red-400 font-bold ml-1">{card.atk}</span>
                      </div>
                    )}
                    {card.def !== null && card.def !== undefined && (
                      <div>
                        <span className="text-gray-400 text-sm">DEF</span>
                        <span className="text-blue-400 font-bold ml-1">{card.def}</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* 效果文本（只显示中文） */}
                <div className="space-y-3">
                  {card.desc_cn ? (
                    <div>
                      <h3 className="text-xs text-gray-500 mb-1">卡片效果</h3>
                      <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {card.desc_cn}
                      </p>
                    </div>
                  ) : card.desc && (
                    <div>
                      <h3 className="text-xs text-gray-500 mb-1">卡片效果</h3>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {card.desc}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      
      {/* 图片放大弹窗 */}
      {showZoom && (
        <ImageZoomModal 
          src={hdImageUrl} 
          alt={displayName} 
          onClose={() => setShowZoom(false)} 
        />
      )}
    </>,
    document.body
  )
}

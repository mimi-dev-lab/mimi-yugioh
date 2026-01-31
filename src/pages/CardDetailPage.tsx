import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Star, Swords, Shield, Loader2, Globe } from 'lucide-react'
import { useCard } from '../hooks/useCards'
import { getAttributeCN, getRaceCN, getCardTypeCN, getCardFrame } from '../utils/cardMappings'

type ImageLang = 'cn' | 'jp' | 'en'

export default function CardDetailPage() {
  const { cardId } = useParams()
  const { card, loading, error } = useCard(cardId || '')
  const [imageLang, setImageLang] = useState<ImageLang>('cn')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-ygo-accent" size={40} />
      </div>
    )
  }

  if (error || !card) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">卡牌未找到</p>
        <Link to="/cards" className="text-ygo-accent hover:underline mt-4 inline-block">
          返回图鉴
        </Link>
      </div>
    )
  }

  // 卡图 URL
  const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'
  const YGOPRODECK_BASE = 'https://images.ygoprodeck.com/images/cards'
  
  const getImageUrl = () => {
    if (imageLang === 'en') {
      // 英文用外链 YGOPRODeck
      return `${YGOPRODECK_BASE}/${card.id}.jpg`
    }
    // 中文或日文用 R2 存储
    return `${R2_BASE}/${imageLang}/${card.id}.webp`
  }

  const frame = getCardFrame(card.type)
  const attributeCN = getAttributeCN(card.attribute)
  const raceCN = getRaceCN(card.race)
  const typeCN = getCardTypeCN(card.type)

  // 卡片边框颜色
  const getFrameStyle = () => {
    const styles: Record<string, string> = {
      '魔法': 'from-emerald-600 to-emerald-900',
      '陷阱': 'from-pink-600 to-pink-900',
      '融合': 'from-purple-600 to-purple-900',
      '同步': 'from-gray-400 to-gray-600',
      '超量': 'from-gray-900 to-black',
      '连接': 'from-blue-600 to-blue-900',
      '仪式': 'from-sky-600 to-sky-900',
      '灵摆': 'from-teal-600 to-orange-600',
      '通常': 'from-amber-600 to-amber-900',
      '效果': 'from-orange-600 to-orange-900',
    }
    return styles[frame] || 'from-gray-600 to-gray-900'
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Button */}
      <Link 
        to="/cards" 
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={18} />
        返回图鉴
      </Link>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Card Image */}
        <div className="space-y-4">
          <div className={`aspect-[59/86] bg-gradient-to-br ${getFrameStyle()} rounded-2xl p-1 overflow-hidden`}>
            <img
              src={getImageUrl()}
              alt={card.name_cn || card.name}
              className="w-full h-full object-cover rounded-xl"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`
              }}
            />
          </div>

          {/* Language Switcher */}
          <div className="flex items-center justify-center gap-2">
            <Globe size={16} className="text-gray-400" />
            <span className="text-gray-400 text-sm">卡图语言：</span>
            {(['cn', 'jp', 'en'] as ImageLang[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setImageLang(lang)}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  imageLang === lang
                    ? 'bg-ygo-accent text-black'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {lang === 'cn' ? '中文' : lang === 'jp' ? '日文' : '英文'}
              </button>
            ))}
          </div>
        </div>

        {/* Card Info */}
        <div className="space-y-6">
          {/* Name */}
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">{card.name_cn || card.name}</h1>
            <p className="text-gray-400">{card.name}</p>
            {card.name_jp && <p className="text-gray-500 text-sm">{card.name_jp}</p>}
          </div>

          {/* Card Type Badges */}
          <div className="flex gap-2 flex-wrap">
            <span className={`px-3 py-1 rounded-lg text-sm ${
              frame === '魔法' ? 'bg-emerald-500/20 text-emerald-400' :
              frame === '陷阱' ? 'bg-pink-500/20 text-pink-400' :
              'bg-orange-500/20 text-orange-400'
            }`}>
              {typeCN}
            </span>
            {!card.type.includes('Spell') && !card.type.includes('Trap') && raceCN && (
              <span className="px-3 py-1 rounded-lg text-sm bg-gray-700 text-gray-300">
                {raceCN}
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            {card.level !== null && (
              <div className="p-4 bg-ygo-dark rounded-xl">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <Star size={14} />
                  {card.type.includes('Xyz') ? '阶级' : card.type.includes('Link') ? 'LINK' : '等级'}
                </div>
                <div className="text-xl font-bold text-ygo-gold">
                  {card.type.includes('Link') ? `LINK-${card.level}` : '★'.repeat(card.level)}
                </div>
              </div>
            )}
            {attributeCN && (
              <div className="p-4 bg-ygo-dark rounded-xl">
                <div className="text-gray-400 text-sm mb-1">属性</div>
                <div className="text-lg font-bold text-white">
                  {attributeCN}
                </div>
              </div>
            )}
            {card.atk !== null && (
              <div className="p-4 bg-ygo-dark rounded-xl">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <Swords size={14} />
                  攻击力
                </div>
                <div className="text-2xl font-bold text-red-400">{card.atk}</div>
              </div>
            )}
            {card.def !== null && !card.type.includes('Link') && (
              <div className="p-4 bg-ygo-dark rounded-xl">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <Shield size={14} />
                  守备力
                </div>
                <div className="text-2xl font-bold text-blue-400">{card.def}</div>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="p-4 bg-ygo-dark rounded-xl">
            <div className="text-gray-400 text-sm mb-2">效果描述</div>
            <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">
              {card.desc_cn || card.desc}
            </p>
          </div>

          {/* Related Decks Placeholder */}
          <div>
            <h3 className="text-lg font-bold text-white mb-3">相关卡组</h3>
            <div className="text-gray-500 text-sm">
              暂无相关卡组数据
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

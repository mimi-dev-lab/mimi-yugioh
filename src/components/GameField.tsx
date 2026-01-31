/**
 * 游戏王战场区域图
 * 显示5个怪兽区 + 5个魔陷区 + 额外怪兽区
 */

interface FieldCard {
  id?: number
  name?: string
  name_cn?: string
  zone: 'monster' | 'spell' | 'extra' | 'gy'
  position?: number // 0-4 for zones, or specific position
}

interface GameFieldProps {
  cards: FieldCard[]
  title?: string
  description?: string
}

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev'

export default function GameField({ cards, title, description }: GameFieldProps) {
  // 按区域分组
  const monsterZone = Array(5).fill(null)
  const spellZone = Array(5).fill(null)
  let extraZone: FieldCard | null = null
  const graveyard: FieldCard[] = []

  cards.forEach(card => {
    if (card.zone === 'monster' && card.position !== undefined && card.position < 5) {
      monsterZone[card.position] = card
    } else if (card.zone === 'spell' && card.position !== undefined && card.position < 5) {
      spellZone[card.position] = card
    } else if (card.zone === 'extra') {
      extraZone = card
    } else if (card.zone === 'gy') {
      graveyard.push(card)
    }
  })

  const renderSlot = (card: FieldCard | null, type: string, index: number) => {
    if (card && card.id) {
      return (
        <div 
          key={`${type}-${index}`}
          className="relative group"
          title={card.name_cn || card.name}
        >
          <img
            src={`${R2_BASE}/cn/${card.id}.webp`}
            alt={card.name_cn || card.name}
            className="w-12 h-16 md:w-14 md:h-20 object-cover rounded border-2 border-purple-500/50 shadow-lg shadow-purple-500/20"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://images.ygoprodeck.com/images/cards_small/${card.id}.jpg`
            }}
          />
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
            {card.name_cn || card.name}
          </div>
        </div>
      )
    }
    return (
      <div 
        key={`${type}-${index}`}
        className="w-12 h-16 md:w-14 md:h-20 border-2 border-dashed border-gray-600/50 rounded bg-gray-800/30"
      />
    )
  }

  return (
    <div className="bg-gradient-to-br from-gray-900 via-green-900/20 to-gray-900 rounded-2xl p-4 md:p-6 border border-green-500/20">
      {title && (
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      )}
      {description && (
        <p className="text-gray-400 text-sm mb-4">{description}</p>
      )}

      {/* 战场布局 */}
      <div className="flex flex-col items-center gap-2">
        {/* 对方场地（简化显示） */}
        <div className="text-gray-500 text-xs mb-1">─── 对方场地 ───</div>
        
        {/* 额外怪兽区 */}
        <div className="flex justify-center gap-2 mb-2">
          <div className="flex gap-2">
            <div className="w-12 h-16 md:w-14 md:h-20" /> {/* 占位 */}
            {extraZone ? renderSlot(extraZone, 'extra', 0) : (
              <div className="w-12 h-16 md:w-14 md:h-20 border-2 border-dashed border-blue-500/30 rounded bg-blue-900/10 flex items-center justify-center">
                <span className="text-blue-400/50 text-[10px]">EX</span>
              </div>
            )}
            <div className="w-12 h-16 md:w-14 md:h-20" /> {/* 占位 */}
          </div>
        </div>

        {/* 怪兽区 */}
        <div className="flex gap-1.5 md:gap-2">
          {monsterZone.map((card, i) => renderSlot(card, 'monster', i))}
        </div>
        
        <div className="text-gray-500 text-[10px] my-1">▲ 怪兽区 │ 魔陷区 ▼</div>

        {/* 魔陷区 */}
        <div className="flex gap-1.5 md:gap-2">
          {spellZone.map((card, i) => renderSlot(card, 'spell', i))}
        </div>

        {/* 墓地提示 */}
        {graveyard.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-gray-500 text-xs">墓地:</span>
            <div className="flex gap-1 flex-wrap">
              {graveyard.slice(0, 5).map((card, i) => (
                <div key={i} className="relative group">
                  <img
                    src={`${R2_BASE}/cn/${card.id}.webp`}
                    alt={card.name_cn || card.name}
                    className="w-8 h-11 object-cover rounded border border-gray-600 opacity-70"
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {card.name_cn || card.name}
                  </div>
                </div>
              ))}
              {graveyard.length > 5 && (
                <span className="text-gray-500 text-xs self-center">+{graveyard.length - 5}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 图例 */}
      <div className="mt-4 pt-4 border-t border-gray-700/50 flex flex-wrap gap-4 justify-center text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-4 border border-purple-500/50 rounded" />
          <span>已放置</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-4 border border-dashed border-gray-600/50 rounded" />
          <span>空位</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-4 border border-dashed border-blue-500/30 rounded" />
          <span>EX区</span>
        </div>
      </div>
    </div>
  )
}

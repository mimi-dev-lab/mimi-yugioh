/**
 * 游戏王对战场地组件
 * 以棋盘形式展示最终盘面，显示卡牌缩略图
 */

import { useState } from 'react'
import ClickableCard from './ClickableCard'

interface FieldCard {
  name: string
  id?: number
  position?: 'attack' | 'defense' | 'set'
  atk?: number
}

interface SpellTrapCard {
  name: string
  id?: number
  state: string
}

interface FieldState {
  monsters?: FieldCard[]
  spellTraps?: SpellTrapCard[]
  fieldSpell?: { name: string; id?: number }
  hand?: string[]
}

interface DuelFieldProps {
  field: FieldState
  title?: string
  negates?: number
}

// 单个怪兽区卡片
function MonsterSlot({ card, slotNum }: { card?: FieldCard; slotNum: number }) {
  if (!card) {
    return (
      <div className="w-14 h-14 border border-dashed border-gray-600 rounded flex items-center justify-center text-xs text-gray-600 bg-gray-900/30">
        M{slotNum}
      </div>
    )
  }
  
  const isSet = card.position === 'set'
  const isDefense = card.position === 'defense'
  
  if (card.id && card.id !== 0) {
    return (
      <div className={`relative ${isDefense ? 'rotate-90' : ''}`}>
        <ClickableCard id={card.id} name={card.name} size="xs" />
        {card.atk !== undefined && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] bg-black/80 px-1 rounded text-red-400">
            {card.atk}
          </div>
        )}
      </div>
    )
  }
  
  // 没有ID时显示文字
  return (
    <div 
      className={`w-14 h-14 rounded border ${isSet ? 'bg-gray-800 border-gray-600' : 'bg-gradient-to-br from-purple-900 to-purple-700 border-purple-500'} ${isDefense ? 'rotate-90' : ''} flex items-center justify-center`}
      title={card.name}
    >
      {isSet ? (
        <span className="text-xs text-gray-500">盖</span>
      ) : (
        <span className="text-[9px] text-white text-center px-0.5 leading-tight">
          {card.name.slice(0, 4)}
        </span>
      )}
    </div>
  )
}

// 单个魔陷区卡片
function SpellTrapSlot({ card, slotNum }: { card?: SpellTrapCard; slotNum: number }) {
  if (!card) {
    return (
      <div className="w-14 h-14 border border-dashed border-gray-600 rounded flex items-center justify-center text-xs text-gray-600 bg-gray-900/30">
        S{slotNum}
      </div>
    )
  }
  
  const isSet = card.state === '盖放' || card.state === 'set'
  
  if (card.id && card.id !== 0) {
    return (
      <div className="relative">
        {isSet ? (
          <div className="w-14 h-14 rounded border bg-gray-800 border-gray-600 flex items-center justify-center" title={card.name}>
            <span className="text-xs text-gray-500">盖</span>
          </div>
        ) : (
          <ClickableCard id={card.id} name={card.name} size="xs" />
        )}
      </div>
    )
  }
  
  return (
    <div 
      className={`w-14 h-14 rounded border ${isSet ? 'bg-gray-800 border-gray-600' : 'bg-gradient-to-br from-teal-900 to-teal-700 border-teal-500'} flex items-center justify-center`}
      title={card.name}
    >
      {isSet ? (
        <span className="text-xs text-gray-500">盖</span>
      ) : (
        <span className="text-[9px] text-white text-center px-0.5 leading-tight">
          {card.name.slice(0, 4)}
        </span>
      )}
    </div>
  )
}

// 场地魔法卡
function FieldSpellSlot({ card }: { card?: { name: string; id?: number } }) {
  if (!card) return null
  
  if (card.id && card.id !== 0) {
    return (
      <div className="text-center">
        <div className="text-[10px] text-gray-500 mb-1">场地</div>
        <ClickableCard id={card.id} name={card.name} size="xs" />
      </div>
    )
  }
  
  return (
    <div className="text-center">
      <div className="text-[10px] text-gray-500 mb-1">场地</div>
      <div 
        className="w-12 h-12 rounded border bg-gradient-to-br from-green-900 to-green-700 border-green-500 flex items-center justify-center"
        title={card.name}
      >
        <span className="text-[8px] text-white text-center px-0.5">{card.name.slice(0, 4)}</span>
      </div>
    </div>
  )
}

export default function DuelField({ field, title, negates }: DuelFieldProps) {
  const [showDetails, setShowDetails] = useState(false)
  
  // 填充到5个位置
  const monsters = [...(field.monsters || []), ...Array(5).fill(null)].slice(0, 5)
  
  // 分离场地魔法
  const fieldSpell = field.fieldSpell || field.spellTraps?.find(s => s.state === '场地魔法' || s.state === '场地')
  const nonFieldSpellTraps = field.spellTraps?.filter(s => s.state !== '场地魔法' && s.state !== '场地') || []
  const spellTraps = [...nonFieldSpellTraps, ...Array(5).fill(null)].slice(0, 5)
  
  return (
    <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
      {/* 标题和妨害数 */}
      {(title || negates !== undefined) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h4 className="text-sm font-medium text-white">{title}</h4>}
          {negates !== undefined && negates > 0 && (
            <div className="flex items-center gap-1 bg-blue-500/20 px-3 py-1 rounded-full">
              <span className="text-blue-400 font-bold text-lg">{negates}</span>
              <span className="text-xs text-blue-300">妨害</span>
            </div>
          )}
        </div>
      )}
      
      {/* 场地区域 */}
      <div className="relative">
        {/* 对手区域（虚线占位） */}
        <div className="flex justify-center gap-1 mb-2 opacity-20">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="w-10 h-10 border border-dashed border-gray-600 rounded" />
          ))}
        </div>
        
        <div className="h-px bg-gradient-to-r from-transparent via-gray-500 to-transparent my-2" />
        
        {/* 我方怪兽区 */}
        <div className="flex justify-center gap-2 mb-2">
          {monsters.map((monster, i) => (
            <MonsterSlot key={i} card={monster} slotNum={i + 1} />
          ))}
        </div>
        
        {/* 我方魔陷区 */}
        <div className="flex justify-center gap-2 mb-2">
          {spellTraps.map((st, i) => (
            <SpellTrapSlot key={i} card={st} slotNum={i + 1} />
          ))}
        </div>
        
        {/* 场地魔法区（左侧） */}
        {fieldSpell && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <FieldSpellSlot card={fieldSpell} />
          </div>
        )}
      </div>
      
      {/* 手牌区域 */}
      {field.hand && field.hand.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-2">🃏 手牌资源</div>
          <div className="flex flex-wrap gap-2">
            {field.hand.map((card, i) => (
              <span 
                key={i} 
                className="text-xs px-2 py-1 bg-gray-700/80 rounded text-gray-300 border border-gray-600"
              >
                {card}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {/* 详情展开 */}
      <button 
        className="mt-3 text-xs text-purple-400 hover:text-purple-300 transition"
        onClick={() => setShowDetails(!showDetails)}
      >
        {showDetails ? '收起详情 ▲' : '查看场面列表 ▼'}
      </button>
      
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-2 text-xs">
          {field.monsters && field.monsters.length > 0 && (
            <div>
              <span className="text-purple-400">怪兽区：</span>
              <span className="text-gray-300">
                {field.monsters.map(m => m.name).join('、')}
              </span>
            </div>
          )}
          {field.spellTraps && field.spellTraps.length > 0 && (
            <div>
              <span className="text-teal-400">魔陷区：</span>
              <span className="text-gray-300">
                {field.spellTraps.map(s => `${s.name}(${s.state})`).join('、')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

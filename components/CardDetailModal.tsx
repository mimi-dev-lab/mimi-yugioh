'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Search, Star, FolderPlus, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============ 类型定义 ============
export interface Card {
  id: number
  name_cn: string | null
  name_jp: string | null
  name_en: string
  card_type: string
  sub_type: string | null
  attribute: string | null
  race: string | null
  level: number | null
  atk: number | null
  def: number | null
  scale?: number
  desc_cn: string | null
  desc_jp: string | null
  desc_en: string
  archetype: string | null
  banlist_ocg: string | null
}

export interface FavoriteFolder {
  id: string
  name: string
  color: string
  card_count: number
}

type Language = 'cn' | 'jp' | 'en'

// ============ 常量 ============
const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'cn', label: '中文' },
  { code: 'jp', label: '日文' },
  { code: 'en', label: '英文' },
]

const BANLIST_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  Forbidden: { label: '禁止', color: 'text-red-300', bg: 'bg-red-900/80' },
  Limited: { label: '限制', color: 'text-orange-300', bg: 'bg-orange-900/80' },
  'Semi-Limited': { label: '准限制', color: 'text-yellow-300', bg: 'bg-yellow-900/80' },
}

const SUBTYPE_CN: Record<string, string> = {
  Fusion: '融合', Synchro: '同调', Xyz: '超量', Link: '连接', Pendulum: '灵摆',
  Ritual: '仪式', Normal: '通常', Effect: '效果', Tuner: '调整', Flip: '翻转',
  Spirit: '灵魂', Toon: '卡通', Union: '同盟', Gemini: '二重',
  'Quick-Play': '速攻', Continuous: '永续', Equip: '装备', Field: '场地', Counter: '反击',
}

const RACE_CN: Record<string, string> = {
  Dragon: '龙族', Warrior: '战士族', Spellcaster: '魔法使族', Fiend: '恶魔族',
  Machine: '机械族', Fairy: '天使族', Zombie: '不死族', Beast: '兽族',
  'Beast-Warrior': '兽战士族', 'Winged Beast': '鸟兽族', Insect: '昆虫族',
  Plant: '植物族', Aqua: '水族', Fish: '鱼族', 'Sea Serpent': '海龙族',
  Reptile: '爬虫族', Rock: '岩石族', Pyro: '炎族', Thunder: '雷族',
  Dinosaur: '恐龙族', Cyberse: '电子界族', Wyrm: '幻龙族', Psychic: '念动力族',
  'Divine-Beast': '幻神兽族', 'Creator-God': '创世神族',
}

// ============ 组件 ============
interface CardDetailModalProps {
  card: Card
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
  onTagClick?: (type: string, value: string) => void
  // 收藏功能（可选）
  isFavorited?: boolean
  currentFolderId?: string | null
  onToggleFavorite?: () => void
  folders?: FavoriteFolder[]
  onMoveToFolder?: (folderId: string) => void
}

export function CardDetailModal({
  card,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  onTagClick,
  isFavorited,
  currentFolderId,
  onToggleFavorite,
  folders,
  onMoveToFolder,
}: CardDetailModalProps) {
  const [lang, setLang] = useState<Language>('cn')
  const [showFolderMenu, setShowFolderMenu] = useState(false)
  const [showFullImage, setShowFullImage] = useState(false)

  const cardType = card.card_type || 'Monster'
  const isMonster = cardType === 'Monster'
  const isLink = card.sub_type?.includes('Link')
  const isPendulum = card.sub_type?.includes('Pendulum')
  const isXyz = card.sub_type?.includes('Xyz')
  const banStatus = card.banlist_ocg ? BANLIST_STATUS[card.banlist_ocg as keyof typeof BANLIST_STATUS] : null

  const getName = (): string => {
    if (lang === 'cn') return card.name_cn || card.name_jp || card.name_en || 'Unknown'
    if (lang === 'jp') return card.name_jp || card.name_cn || card.name_en || 'Unknown'
    return card.name_en || card.name_cn || card.name_jp || 'Unknown'
  }
  
  const getSubName = () => {
    if (lang === 'cn') return card.name_jp
    if (lang === 'jp') return card.name_cn
    return card.name_jp || card.name_cn
  }
  
  const getDesc = () => {
    if (lang === 'cn') return card.desc_cn || card.desc_jp || card.desc_en
    if (lang === 'jp') return card.desc_jp || card.desc_cn || card.desc_en
    return card.desc_en || card.desc_cn || card.desc_jp
  }
  
  const getImagePath = () => `/card-images/${lang}/${card.id}.webp`

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasPrev && onPrev) onPrev()
      else if (e.key === 'ArrowRight' && hasNext && onNext) onNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  const getSubTypeText = () => {
    if (!card.sub_type) return null
    const parts = card.sub_type.split(' ').filter(p => p !== 'Monster' && p !== 'Card')
    const translated = parts.map(p => SUBTYPE_CN[p] || p)
    return translated.length > 0 ? translated.join(' / ') : null
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-4xl relative animate-[smoothAppear_0.3s_ease-out_forwards]" onClick={(e) => e.stopPropagation()}>
        <div className="absolute -inset-4 bg-[#daa520] opacity-10 blur-3xl animate-pulse" />
        
        <div className="relative border-4 border-black bg-[#0d0d0d] shadow-[0_0_60px_rgba(218,165,32,0.1)] overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* 左侧：卡图 */}
            <div className="md:w-[40%] bg-[#151515] p-6 flex flex-col items-center justify-center border-r-4 border-black">
              {/* 语言切换 */}
              <div className="flex gap-1 mb-3 w-full justify-center">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold border-2 transition-all",
                      lang === l.code
                        ? "bg-[#daa520] text-black border-[#daa520]"
                        : "bg-transparent text-[#5c4002] border-[#333] hover:border-[#daa520] hover:text-[#daa520]"
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              
              <div 
                className="w-full aspect-[421/614] border-4 border-black bg-black relative overflow-hidden cursor-zoom-in group/img"
                onClick={() => setShowFullImage(true)}
              >
                <Image
                  src={getImagePath()}
                  alt={getName()}
                  fill
                  className="object-contain transition-transform duration-300 group-hover/img:scale-[1.02]"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    if (!target.src.includes('/cn/')) {
                      target.src = `/card-images/cn/${card.id}.webp`
                    }
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/img:bg-black/30 transition-all">
                  <div className="opacity-0 group-hover/img:opacity-100 transition-opacity text-white text-sm font-bold flex items-center gap-2 bg-black/60 px-3 py-2 border border-[#daa520]">
                    <Search size={16} /> 点击放大
                  </div>
                </div>
              </div>
              
              {/* 导航按钮 */}
              <div className="mt-4 flex gap-2 w-full">
                <button onClick={onPrev} disabled={!hasPrev} className={cn("flex-1 py-2.5 text-sm font-bold border-2 border-[#333] transition-all", hasPrev ? "text-[#5c4002] hover:text-[#daa520] hover:border-[#daa520]" : "text-[#333] cursor-not-allowed")}>
                  ← 上一张
                </button>
                <button onClick={onClose} className="flex-1 py-2.5 text-sm font-bold border-2 border-[#333] text-[#5c4002] hover:text-[#daa520] hover:border-[#daa520] transition-all">
                  关闭
                </button>
                <button onClick={onNext} disabled={!hasNext} className={cn("flex-1 py-2.5 text-sm font-bold border-2 border-[#333] transition-all", hasNext ? "text-[#5c4002] hover:text-[#daa520] hover:border-[#daa520]" : "text-[#333] cursor-not-allowed")}>
                  下一张 →
                </button>
              </div>
            </div>

            {/* 右侧：详情 */}
            <div className="md:w-[60%] p-6 bg-[#0d0d0d] flex flex-col">
              {/* 卡名 */}
              <div className="flex items-start gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl md:text-2xl font-black text-[#fff176] leading-tight mb-1">
                    {getName()}
                  </h2>
                  {getSubName() && <p className="text-xs text-[#5c4002] truncate">{getSubName()}</p>}
                </div>
                {banStatus && (
                  <div className={cn("px-2 py-1 text-xs font-black", banStatus.bg, banStatus.color)}>
                    {banStatus.label}
                  </div>
                )}
              </div>

              {/* 等级/阶级/Link值 */}
              {isMonster && card.level && (
                <div className="flex items-center gap-2 mb-3">
                  {isLink ? (
                    <span className="text-xs text-[#4fc3f7] font-bold">LINK-{card.level}</span>
                  ) : isXyz ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#5c4002] mr-1">阶级</span>
                      {[...Array(Math.min(card.level, 12))].map((_, i) => (
                        <div key={i} className="w-3 h-3 rotate-45 bg-black border-2 border-[#daa520]" />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#5c4002] mr-1">等级</span>
                      {[...Array(Math.min(card.level, 12))].map((_, i) => (
                        <div key={i} className="w-3 h-3 rotate-45 bg-[#daa520] border border-black shadow-[0_0_4px_#daa520]" />
                      ))}
                    </div>
                  )}
                  {isPendulum && card.scale !== undefined && (
                    <div className="ml-4 flex items-center gap-1">
                      <span className="text-xs text-[#f06292] font-bold">灵摆刻度: {card.scale}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 标签 */}
              <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-[#333]">
                <span className="text-xs bg-[#daa520] text-black px-2 py-1 font-bold">
                  {cardType === 'Monster' ? '怪兽' : cardType === 'Spell' ? '魔法' : '陷阱'}
                </span>
                {getSubTypeText() && (
                  <span className="text-xs bg-[#333] text-[#daa520] px-2 py-1 font-bold">
                    {getSubTypeText()}
                  </span>
                )}
                {card.race && (
                  <button 
                    onClick={() => onTagClick?.('race', card.race!)}
                    className="text-xs border border-[#5c4002] text-[#5c4002] px-2 py-1 font-bold hover:bg-[#5c4002] hover:text-black transition-colors"
                  >
                    {RACE_CN[card.race] || card.race}
                  </button>
                )}
                {card.archetype && (
                  <button 
                    onClick={() => onTagClick?.('archetype', card.archetype!)}
                    className="text-xs border border-[#daa520] text-[#daa520] px-2 py-1 font-bold hover:bg-[#daa520] hover:text-black transition-colors"
                  >
                    {card.archetype}
                  </button>
                )}
              </div>

              {/* 攻击力/守备力 */}
              {card.atk !== null && (
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-500 font-bold">攻击力</span>
                    <span className="text-xl font-black text-[#fff176] font-mono">{card.atk}</span>
                  </div>
                  {!isLink && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-500 font-bold">守备力</span>
                      <span className="text-xl font-black text-[#fff176] font-mono">{card.def ?? '----'}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 效果描述 */}
              <div className="flex-1 bg-[#111] p-4 border-2 border-[#333] relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-[#daa520]/30 to-transparent" />
                <p className="text-sm leading-relaxed text-[#f3eacb]/90 whitespace-pre-wrap overflow-y-auto max-h-48">
                  {getDesc() || '无效果描述'}
                </p>
              </div>

              {/* 底部信息 */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#333]">
                <span className="text-xs text-[#333] font-mono">ID: {card.id}</span>
                {onToggleFavorite && (
                  <div className="relative flex items-center gap-2">
                    <button 
                      onClick={() => onToggleFavorite()}
                      className={cn(
                        "text-xs flex items-center gap-1.5 px-3 py-1.5 border-2 transition-all font-bold",
                        isFavorited 
                          ? "bg-[#daa520] border-[#daa520] text-black hover:bg-red-500 hover:border-red-500 hover:text-white" 
                          : "border-[#5c4002] text-[#5c4002] hover:border-[#daa520] hover:text-[#daa520]"
                      )}
                    >
                      <Star size={14} fill={isFavorited ? "currentColor" : "none"} />
                      {isFavorited ? '已收藏' : '收藏'}
                    </button>
                    
                    {isFavorited && folders && folders.length > 0 && (
                      <button 
                        onClick={() => setShowFolderMenu(!showFolderMenu)}
                        className={cn(
                          "text-xs px-2 py-1.5 border-2 transition-colors flex items-center gap-1",
                          showFolderMenu 
                            ? "border-[#daa520] text-[#daa520]" 
                            : "border-[#333] text-[#5c4002] hover:border-[#daa520] hover:text-[#daa520]"
                        )}
                      >
                        <FolderPlus size={14} />
                      </button>
                    )}
                    
                    {showFolderMenu && folders && (
                      <div className="absolute bottom-full right-0 mb-2 bg-[#111] border-2 border-[#daa520] shadow-xl z-50 min-w-[200px]">
                        <div className="p-2 border-b border-[#333] text-xs text-[#daa520] font-bold">
                          移动到收藏夹
                        </div>
                        {folders.map(folder => {
                          const isCurrent = folder.id === currentFolderId
                          return (
                            <button
                              key={folder.id}
                              onClick={() => { 
                                if (!isCurrent && onMoveToFolder) {
                                  onMoveToFolder(folder.id)
                                }
                                setShowFolderMenu(false)
                              }}
                              disabled={isCurrent}
                              className={cn(
                                "w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors",
                                isCurrent ? "bg-[#1a1a1a] cursor-not-allowed" : "hover:bg-[#1a1a1a]"
                              )}
                            >
                              <div className="w-3 h-3 rounded" style={{ backgroundColor: folder.color }} />
                              <span className={isCurrent ? "text-[#daa520] font-bold" : "text-[#f3eacb]"}>
                                {folder.name}
                              </span>
                              {isCurrent && <Check size={12} className="text-[#daa520]" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 全屏图片 */}
      {showFullImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/98 cursor-zoom-out"
          onClick={() => setShowFullImage(false)}
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            <div className="w-[150vmax] h-[150vmax] border-[3px] border-[#daa520]/20 rounded-full animate-[spin_30s_linear_infinite]" />
            <div className="absolute w-[120vmax] h-[120vmax] border-[2px] border-[#daa520]/15 rounded-full animate-[spin_25s_linear_infinite_reverse]" />
          </div>
          
          <div className="absolute top-8 left-8 w-16 h-16 border-l-2 border-t-2 border-[#daa520]/50" />
          <div className="absolute top-8 right-8 w-16 h-16 border-r-2 border-t-2 border-[#daa520]/50" />
          <div className="absolute bottom-8 left-8 w-16 h-16 border-l-2 border-b-2 border-[#daa520]/50" />
          <div className="absolute bottom-8 right-8 w-16 h-16 border-r-2 border-b-2 border-[#daa520]/50" />
          
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <div className="absolute -inset-8 bg-[#daa520]/20 blur-3xl" />
            <div className="relative border-4 border-[#daa520] shadow-[0_0_80px_rgba(218,165,32,0.4)]">
              <div className="absolute -top-2 -left-2 w-4 h-4 bg-[#daa520]" />
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-[#daa520]" />
              <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-[#daa520]" />
              <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-[#daa520]" />
              
              <div className="relative w-[80vmin] max-w-[500px] aspect-[421/614] bg-black overflow-hidden">
                <Image
                  src={getImagePath()}
                  alt={getName()}
                  fill
                  className="object-contain"
                  priority
                  sizes="80vmin"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    if (!target.src.includes('/cn/')) {
                      target.src = `/card-images/cn/${card.id}.webp`
                    }
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />
              </div>
            </div>
            
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
              <div className="text-xl font-black text-[#fff176] drop-shadow-[0_0_10px_rgba(255,241,118,0.5)]">
                {getName()}
              </div>
              <div className="text-sm text-[#daa520]/70 mt-1">点击任意位置关闭</div>
            </div>
          </div>
          
          <button 
            onClick={() => setShowFullImage(false)}
            className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center border-2 border-[#daa520] text-[#daa520] hover:bg-[#daa520] hover:text-black transition-all"
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  )
}

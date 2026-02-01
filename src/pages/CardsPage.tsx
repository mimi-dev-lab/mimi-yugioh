import { useState, useMemo } from 'react'
import { Search, Filter, ChevronDown, ChevronUp, Loader2, X, Sparkles } from 'lucide-react'
import { useCards } from '../hooks/useCards'
import CardItem from '../components/CardItem'
import type { CardFilter } from '../types'
import { filterOptions } from '../utils/cardMappings'

export default function CardsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  
  // 筛选状态
  const [selectedFrames, setSelectedFrames] = useState<string[]>([])
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([])
  const [selectedSpellTrapTypes, setSelectedSpellTrapTypes] = useState<string[]>([])
  const [selectedRaces, setSelectedRaces] = useState<string[]>([])
  const [selectedLevels, setSelectedLevels] = useState<number[]>([])
  const [atkRange, setAtkRange] = useState<[number | null, number | null]>([null, null])
  const [defRange, setDefRange] = useState<[number | null, number | null]>([null, null])

  const filter: CardFilter = useMemo(() => ({
    search: searchTerm,
    frames: selectedFrames,
    attributes: selectedAttributes,
    spellTrapTypes: selectedSpellTrapTypes,
    races: selectedRaces,
    levels: selectedLevels,
    atkMin: atkRange[0] ?? undefined,
    atkMax: atkRange[1] ?? undefined,
    defMin: defRange[0] ?? undefined,
    defMax: defRange[1] ?? undefined,
  }), [searchTerm, selectedFrames, selectedAttributes, selectedSpellTrapTypes, selectedRaces, selectedLevels, atkRange, defRange])

  // 判断是否有任何筛选条件
  const hasAnyFilter = searchTerm || selectedFrames.length > 0 || selectedAttributes.length > 0 || 
    selectedSpellTrapTypes.length > 0 || selectedRaces.length > 0 || selectedLevels.length > 0 ||
    atkRange[0] !== null || atkRange[1] !== null || defRange[0] !== null || defRange[1] !== null

  // 只有有筛选条件时才请求 API
  const { cards, loading, total, totalPages } = useCards(hasAnyFilter ? filter : undefined, page, 48)

  // 切换筛选项
  const toggleFilter = <T,>(_arr: T[], item: T, setter: React.Dispatch<React.SetStateAction<T[]>>) => {
    setter(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
    setPage(1)
  }

  // 清除所有筛选
  const clearFilters = () => {
    setSelectedFrames([])
    setSelectedAttributes([])
    setSelectedSpellTrapTypes([])
    setSelectedRaces([])
    setSelectedLevels([])
    setAtkRange([null, null])
    setDefRange([null, null])
    setSearchTerm('')
    setPage(1)
  }

  const hasActiveFilters = selectedFrames.length > 0 || selectedAttributes.length > 0 || 
    selectedSpellTrapTypes.length > 0 || selectedRaces.length > 0 || selectedLevels.length > 0 ||
    atkRange[0] !== null || atkRange[1] !== null || defRange[0] !== null || defRange[1] !== null

  const activeFilterCount = selectedFrames.length + selectedAttributes.length + 
    selectedSpellTrapTypes.length + selectedRaces.length + selectedLevels.length +
    (atkRange[0] !== null || atkRange[1] !== null ? 1 : 0) +
    (defRange[0] !== null || defRange[1] !== null ? 1 : 0)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-ygo-accent/20 via-purple-500/10 to-blue-500/10 p-6 border border-ygo-accent/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-ygo-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-ygo-accent/20 flex items-center justify-center">
              <Sparkles className="text-ygo-accent" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">卡牌图鉴</h1>
              <p className="text-gray-400 text-sm">探索游戏王全部卡牌</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-ygo-accent">
              {hasAnyFilter ? total.toLocaleString() : '11,749'}
            </div>
            <div className="text-gray-400 text-sm">
              {hasAnyFilter ? '符合条件' : '张卡牌'}
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-4">
        <div className="flex gap-3">
          {/* Search Input */}
          <div className="flex-1 relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-ygo-accent transition-colors" size={20} />
            <input
              type="text"
              placeholder="搜索卡牌名称、效果..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-12 pr-4 py-4 bg-ygo-dark/80 backdrop-blur border border-gray-700/50 rounded-2xl focus:outline-none focus:border-ygo-accent/50 focus:ring-2 focus:ring-ygo-accent/20 transition-all text-white placeholder:text-gray-500"
            />
          </div>
          
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-5 py-4 rounded-2xl border flex items-center gap-2 transition-all ${
              showFilters || hasActiveFilters
                ? 'bg-ygo-accent text-black border-ygo-accent shadow-lg shadow-ygo-accent/25' 
                : 'bg-ygo-dark/80 backdrop-blur border-gray-700/50 text-gray-300 hover:border-gray-500 hover:text-white'
            }`}
          >
            <Filter size={20} />
            <span className="hidden sm:inline font-medium">筛选</span>
            {activeFilterCount > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                showFilters || hasActiveFilters ? 'bg-black/20 text-black' : 'bg-ygo-accent text-black'
              }`}>
                {activeFilterCount}
              </span>
            )}
            {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-all"
              title="清除筛选"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="p-6 bg-ygo-dark/80 backdrop-blur rounded-2xl border border-gray-700/50 space-y-6 animate-in slide-in-from-top-2 duration-200">
            {/* 卡片边框 */}
            <FilterSection title="🃏 卡片类型" subtitle="怪兽、魔法、陷阱">
              <div className="flex flex-wrap gap-2">
                {filterOptions.cardFrames.map((frame) => (
                  <FilterChip
                    key={frame}
                    label={frame}
                    active={selectedFrames.includes(frame)}
                    onClick={() => toggleFilter(selectedFrames, frame, setSelectedFrames)}
                    color={getFrameColor(frame)}
                  />
                ))}
              </div>
            </FilterSection>

            {/* 属性 */}
            <FilterSection title="✨ 属性" subtitle="怪兽卡的属性">
              <div className="flex flex-wrap gap-2">
                {filterOptions.attributes.map((attr) => (
                  <FilterChip
                    key={attr}
                    label={attr}
                    active={selectedAttributes.includes(attr)}
                    onClick={() => toggleFilter(selectedAttributes, attr, setSelectedAttributes)}
                    color={getAttributeColor(attr)}
                  />
                ))}
              </div>
            </FilterSection>

            {/* 魔法·陷阱的种类 */}
            <FilterSection title="📜 魔法·陷阱种类">
              <div className="flex flex-wrap gap-2">
                {filterOptions.spellTrapTypes.map((st) => (
                  <FilterChip
                    key={st}
                    label={st}
                    active={selectedSpellTrapTypes.includes(st)}
                    onClick={() => toggleFilter(selectedSpellTrapTypes, st, setSelectedSpellTrapTypes)}
                    color={st.includes('魔法') ? 'emerald' : 'pink'}
                  />
                ))}
              </div>
            </FilterSection>

            {/* 种族 */}
            <FilterSection title="👹 种族" subtitle="怪兽卡的种族">
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                {filterOptions.races.map((race) => (
                  <FilterChip
                    key={race}
                    label={race}
                    active={selectedRaces.includes(race)}
                    onClick={() => toggleFilter(selectedRaces, race, setSelectedRaces)}
                    color="blue"
                  />
                ))}
              </div>
            </FilterSection>

            {/* 等级·阶级 */}
            <FilterSection title="⭐ 等级·阶级">
              <div className="flex flex-wrap gap-1.5">
                {filterOptions.levels.map((level) => (
                  <button
                    key={level}
                    onClick={() => toggleFilter(selectedLevels, level, setSelectedLevels)}
                    className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                      selectedLevels.includes(level)
                        ? 'bg-ygo-gold text-black shadow-lg shadow-ygo-gold/30'
                        : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700 border border-gray-600/50'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </FilterSection>

            {/* 攻击力 & 守备力 */}
            <div className="grid md:grid-cols-2 gap-6">
              <FilterSection title="⚔️ 攻击力">
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    placeholder="最小"
                    value={atkRange[0] ?? ''}
                    onChange={(e) => { setAtkRange([e.target.value ? Number(e.target.value) : null, atkRange[1]]); setPage(1); }}
                    className="flex-1 px-4 py-3 bg-gray-800/80 border border-gray-600/50 rounded-xl text-center focus:outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 transition-all"
                  />
                  <span className="text-gray-500 font-medium">~</span>
                  <input
                    type="number"
                    placeholder="最大"
                    value={atkRange[1] ?? ''}
                    onChange={(e) => { setAtkRange([atkRange[0], e.target.value ? Number(e.target.value) : null]); setPage(1); }}
                    className="flex-1 px-4 py-3 bg-gray-800/80 border border-gray-600/50 rounded-xl text-center focus:outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 transition-all"
                  />
                </div>
              </FilterSection>

              <FilterSection title="🛡️ 守备力">
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    placeholder="最小"
                    value={defRange[0] ?? ''}
                    onChange={(e) => { setDefRange([e.target.value ? Number(e.target.value) : null, defRange[1]]); setPage(1); }}
                    className="flex-1 px-4 py-3 bg-gray-800/80 border border-gray-600/50 rounded-xl text-center focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                  <span className="text-gray-500 font-medium">~</span>
                  <input
                    type="number"
                    placeholder="最大"
                    value={defRange[1] ?? ''}
                    onChange={(e) => { setDefRange([defRange[0], e.target.value ? Number(e.target.value) : null]); setPage(1); }}
                    className="flex-1 px-4 py-3 bg-gray-800/80 border border-gray-600/50 rounded-xl text-center focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
              </FilterSection>
            </div>
          </div>
        )}
      </div>

      {/* Cards Grid */}
      {!hasAnyFilter ? (
        // 空状态：引导用户搜索或筛选
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-ygo-accent/20 to-purple-500/20 flex items-center justify-center border border-ygo-accent/20">
            <Search className="text-ygo-accent" size={40} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">开始搜索</h2>
          <p className="text-gray-400 text-center max-w-md mb-8">
            输入卡牌名称、效果关键词，或使用筛选器找到你想要的卡牌
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <QuickSearchButton label="灰流丽" onClick={() => { setSearchTerm('灰流丽'); setPage(1); }} />
            <QuickSearchButton label="融合怪兽" onClick={() => { setSelectedFrames(['融合']); setPage(1); }} />
            <QuickSearchButton label="龙族" onClick={() => { setSelectedRaces(['龙族']); setPage(1); }} />
            <QuickSearchButton label="8星以上" onClick={() => { setSelectedLevels([8,9,10,11,12]); setPage(1); }} />
          </div>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-ygo-accent" size={48} />
          <p className="text-gray-400">加载中...</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800/50 flex items-center justify-center">
            <Search className="text-gray-600" size={32} />
          </div>
          <p className="text-gray-400 text-lg">没有找到符合条件的卡牌</p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-4 text-ygo-accent hover:underline">
              清除筛选条件
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {cards.map((card, index) => (
            <div 
              key={card.id} 
              className="animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${index * 20}ms` }}
            >
              <CardItem card={card} />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-6">
          <button 
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="px-3 py-2 bg-ygo-dark/80 border border-gray-700/50 rounded-xl text-gray-400 hover:border-gray-500 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            首页
          </button>
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-ygo-dark/80 border border-gray-700/50 rounded-xl text-gray-400 hover:border-gray-500 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          
          <div className="flex items-center gap-2 px-4">
            <input
              type="number"
              min={1}
              max={totalPages}
              value={page}
              onChange={(e) => {
                const val = parseInt(e.target.value)
                if (val >= 1 && val <= totalPages) setPage(val)
              }}
              className="w-16 px-2 py-2 bg-gray-800 border border-gray-600 rounded-xl text-center text-white focus:outline-none focus:border-ygo-accent"
            />
            <span className="text-gray-500">/</span>
            <span className="text-gray-400">{totalPages}</span>
          </div>
          
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-ygo-dark/80 border border-gray-700/50 rounded-xl text-gray-400 hover:border-gray-500 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            下一页
          </button>
          <button 
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="px-3 py-2 bg-ygo-dark/80 border border-gray-700/50 rounded-xl text-gray-400 hover:border-gray-500 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            末页
          </button>
        </div>
      )}
    </div>
  )
}

// 筛选区块组件
function FilterSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <label className="text-sm font-medium text-white">{title}</label>
        {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

// 筛选按钮组件
function FilterChip({ 
  label, 
  active, 
  onClick, 
  color = 'yellow',
}: { 
  label: string
  active: boolean
  onClick: () => void
  color?: string
}) {
  const colorClasses: Record<string, { active: string; inactive: string }> = {
    yellow: { active: 'bg-ygo-accent text-black', inactive: 'hover:border-ygo-accent/50' },
    orange: { active: 'bg-orange-500 text-white', inactive: 'hover:border-orange-500/50' },
    purple: { active: 'bg-purple-500 text-white', inactive: 'hover:border-purple-500/50' },
    emerald: { active: 'bg-emerald-500 text-white', inactive: 'hover:border-emerald-500/50' },
    pink: { active: 'bg-pink-500 text-white', inactive: 'hover:border-pink-500/50' },
    blue: { active: 'bg-blue-500 text-white', inactive: 'hover:border-blue-500/50' },
    sky: { active: 'bg-sky-500 text-white', inactive: 'hover:border-sky-500/50' },
    gray: { active: 'bg-gray-400 text-black', inactive: 'hover:border-gray-400/50' },
    red: { active: 'bg-red-500 text-white', inactive: 'hover:border-red-500/50' },
    amber: { active: 'bg-amber-600 text-white', inactive: 'hover:border-amber-600/50' },
    lime: { active: 'bg-lime-500 text-black', inactive: 'hover:border-lime-500/50' },
  }

  const colorSet = colorClasses[color] || colorClasses.yellow

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? `${colorSet.active} shadow-lg`
          : `bg-gray-800/80 text-gray-300 border border-gray-600/50 ${colorSet.inactive}`
      }`}
    >
      {label}
    </button>
  )
}

// 边框颜色映射
function getFrameColor(frame: string): string {
  const map: Record<string, string> = {
    '通常': 'amber',
    '效果': 'orange',
    '融合': 'purple',
    '仪式': 'sky',
    '同步': 'gray',
    '超量': 'gray',
    '灵摆': 'lime',
    '连接': 'blue',
    '魔法': 'emerald',
    '陷阱': 'pink',
  }
  return map[frame] || 'yellow'
}

// 属性颜色映射
function getAttributeColor(attr: string): string {
  const map: Record<string, string> = {
    '暗': 'purple',
    '光': 'yellow',
    '地': 'amber',
    '水': 'blue',
    '火': 'red',
    '风': 'lime',
    '神': 'yellow',
  }
  return map[attr] || 'gray'
}

// 快捷搜索按钮
function QuickSearchButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 bg-gray-800/80 border border-gray-600/50 rounded-xl text-gray-300 hover:border-ygo-accent/50 hover:text-ygo-accent transition-all"
    >
      {label}
    </button>
  )
}

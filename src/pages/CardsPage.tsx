import { useState, useMemo } from 'react'
import { Search, Filter, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
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

  const { cards, loading, total, totalPages } = useCards(filter, page, 48)

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">卡牌图鉴</h1>
        <span className="text-gray-400 text-sm">
          {loading ? '加载中...' : `共 ${total.toLocaleString()} 张卡牌`}
        </span>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-4">
        <div className="flex gap-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="搜索卡牌名称或效果..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-3 bg-ygo-dark border border-gray-700 rounded-xl focus:outline-none focus:border-ygo-accent transition-colors"
            />
          </div>
          
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-3 rounded-xl border flex items-center gap-2 transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-ygo-accent/20 border-ygo-accent text-ygo-accent' 
                : 'bg-ygo-dark border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            <Filter size={18} />
            <span className="hidden md:inline">筛选</span>
            {hasActiveFilters && (
              <span className="bg-ygo-accent text-black text-xs px-1.5 rounded-full">!</span>
            )}
            {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-3 rounded-xl border border-gray-700 text-gray-400 hover:border-red-500 hover:text-red-400 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="p-4 bg-ygo-dark rounded-xl border border-gray-700 space-y-6">
            {/* 卡片边框 */}
            <FilterSection title="🃏 卡片边框" icon="card">
              <div className="flex flex-wrap gap-2">
                {filterOptions.cardFrames.map((frame) => (
                  <FilterButton
                    key={frame}
                    label={frame}
                    active={selectedFrames.includes(frame)}
                    onClick={() => toggleFilter(selectedFrames, frame, setSelectedFrames)}
                  />
                ))}
              </div>
            </FilterSection>

            {/* 属性 */}
            <FilterSection title="✨ 属性">
              <div className="flex flex-wrap gap-2">
                {filterOptions.attributes.map((attr) => (
                  <FilterButton
                    key={attr}
                    label={attr}
                    active={selectedAttributes.includes(attr)}
                    onClick={() => toggleFilter(selectedAttributes, attr, setSelectedAttributes)}
                    color="purple"
                  />
                ))}
              </div>
            </FilterSection>

            {/* 魔法·陷阱的种类 */}
            <FilterSection title="📜 魔法·陷阱的种类">
              <div className="flex flex-wrap gap-2">
                {filterOptions.spellTrapTypes.map((st) => (
                  <FilterButton
                    key={st}
                    label={st}
                    active={selectedSpellTrapTypes.includes(st)}
                    onClick={() => toggleFilter(selectedSpellTrapTypes, st, setSelectedSpellTrapTypes)}
                    color="green"
                  />
                ))}
              </div>
            </FilterSection>

            {/* 种族 */}
            <FilterSection title="👹 种族">
              <div className="flex flex-wrap gap-2">
                {filterOptions.races.map((race) => (
                  <FilterButton
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
              <div className="flex flex-wrap gap-2">
                {filterOptions.levels.map((level) => (
                  <FilterButton
                    key={level}
                    label={level.toString()}
                    active={selectedLevels.includes(level)}
                    onClick={() => toggleFilter(selectedLevels, level, setSelectedLevels)}
                    color="gold"
                    small
                  />
                ))}
              </div>
            </FilterSection>

            {/* 攻击力 & 守备力 */}
            <div className="grid md:grid-cols-2 gap-4">
              <FilterSection title="⚔️ 攻击力">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="最小"
                    value={atkRange[0] ?? ''}
                    onChange={(e) => setAtkRange([e.target.value ? Number(e.target.value) : null, atkRange[1]])}
                    className="w-24 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-center"
                  />
                  <span className="text-gray-500">~</span>
                  <input
                    type="number"
                    placeholder="最大"
                    value={atkRange[1] ?? ''}
                    onChange={(e) => setAtkRange([atkRange[0], e.target.value ? Number(e.target.value) : null])}
                    className="w-24 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-center"
                  />
                </div>
              </FilterSection>

              <FilterSection title="🛡️ 守备力">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="最小"
                    value={defRange[0] ?? ''}
                    onChange={(e) => setDefRange([e.target.value ? Number(e.target.value) : null, defRange[1]])}
                    className="w-24 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-center"
                  />
                  <span className="text-gray-500">~</span>
                  <input
                    type="number"
                    placeholder="最大"
                    value={defRange[1] ?? ''}
                    onChange={(e) => setDefRange([defRange[0], e.target.value ? Number(e.target.value) : null])}
                    className="w-24 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-center"
                  />
                </div>
              </FilterSection>
            </div>
          </div>
        )}
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-ygo-accent" size={40} />
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p>没有找到符合条件的卡牌</p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-4 text-ygo-accent hover:underline">
              清除筛选条件
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {cards.map((card) => (
            <CardItem key={card.id} card={card} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-6">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-ygo-dark border border-gray-700 rounded-lg text-gray-400 hover:border-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          
          <span className="px-4 py-2 text-gray-400">
            {page} / {totalPages}
          </span>
          
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-ygo-dark border border-gray-700 rounded-lg text-gray-400 hover:border-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}

// 筛选区块组件
function FilterSection({ title, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-gray-400 mb-2 block">{title}</label>
      {children}
    </div>
  )
}

// 筛选按钮组件
function FilterButton({ 
  label, 
  active, 
  onClick, 
  color = 'yellow',
  small = false 
}: { 
  label: string
  active: boolean
  onClick: () => void
  color?: 'yellow' | 'purple' | 'green' | 'blue' | 'gold'
  small?: boolean
}) {
  const colorClasses = {
    yellow: 'bg-ygo-accent text-black',
    purple: 'bg-purple-500 text-white',
    green: 'bg-emerald-500 text-white',
    blue: 'bg-blue-500 text-white',
    gold: 'bg-yellow-500 text-black',
  }

  return (
    <button
      onClick={onClick}
      className={`${small ? 'w-10 h-10' : 'px-3 py-1.5'} rounded-lg text-sm transition-colors ${
        active
          ? colorClasses[color]
          : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
      }`}
    >
      {label}
    </button>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, Users, Gamepad2, Trophy } from 'lucide-react'

const categories = [
  { id: 'all', label: '全部', icon: Layers },
  { id: 'beginner', label: '萌新', icon: Users },
  { id: 'casual', label: '娱乐', icon: Gamepad2 },
  { id: 'competitive', label: '硬核', icon: Trophy },
]

// 卡组数据
const sampleDecks = [
  {
    id: 'white-forest-centurion',
    name: '白森林百夫长',
    category: 'T3',
    description: '结合「白森林」资源循环与「百夫长」加速同调的混合型卡组，先攻压制力极强。',
    cardCount: 40,
    extraCount: 15,
    cover: 'https://images.ygoprodeck.com/images/cards_small/10178001.jpg',
  },
]

export default function DecksPage() {
  const [selectedCategory, setSelectedCategory] = useState('all')

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">卡组集合</h1>
        <span className="text-gray-400 text-sm">共 {sampleDecks.length} 套卡组</span>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSelectedCategory(id)}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 whitespace-nowrap transition-colors ${
              selectedCategory === id
                ? 'bg-ygo-accent text-black'
                : 'bg-ygo-dark text-gray-400 hover:bg-gray-800'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {/* Decks Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sampleDecks.map((deck) => (
          <Link
            key={deck.id}
            to={`/v2/${deck.id}`}
            className="group p-4 bg-ygo-dark rounded-xl border border-gray-700 hover:border-ygo-accent/50 transition-all duration-300"
          >
            {/* Deck Cover */}
            <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg mb-4 overflow-hidden">
              {deck.cover ? (
                <img 
                  src={deck.cover} 
                  alt={deck.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600">
                  <Layers size={40} />
                </div>
              )}
            </div>

            {/* Deck Info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white group-hover:text-ygo-accent transition-colors">
                  {deck.name}
                </h3>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  deck.category === '硬核' || deck.category === 'T1'
                    ? 'bg-red-500/20 text-red-400'
                    : deck.category === '娱乐' || deck.category === 'T2'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {deck.category}
                </span>
              </div>
              <p className="text-gray-400 text-sm line-clamp-2">{deck.description}</p>
              <div className="flex gap-4 text-xs text-gray-500">
                <span>主卡组: {deck.cardCount}</span>
                <span>额外: {deck.extraCount}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Empty State for loading */}
      {sampleDecks.length === 0 && (
        <div className="text-center py-12">
          <Layers className="mx-auto text-gray-600 mb-4" size={48} />
          <p className="text-gray-400">卡组数据收集中...</p>
        </div>
      )}
    </div>
  )
}

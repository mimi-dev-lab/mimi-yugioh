import { Link } from 'react-router-dom'
import { BookOpen, Layers, Sparkles, TrendingUp } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="text-ygo-gold">游戏王</span>
          <span className="text-white">卡牌图鉴</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          收录全部卡牌数据，精选优质卡组构筑，助你成为决斗大师
        </p>
      </section>

      {/* Feature Cards */}
      <section className="grid md:grid-cols-2 gap-6">
        <Link
          to="/cards"
          className="group p-6 bg-gradient-to-br from-ygo-dark to-gray-900 rounded-2xl border border-gray-800 hover:border-ygo-accent/50 transition-all duration-300"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-ygo-accent/20 rounded-xl">
              <BookOpen className="text-ygo-accent" size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2 group-hover:text-ygo-accent transition-colors">
                卡牌图鉴
              </h2>
              <p className="text-gray-400">
                收录 14,000+ 张卡牌，支持多条件筛选，快速找到你需要的卡
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <span className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-300">怪兽</span>
            <span className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-300">魔法</span>
            <span className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-300">陷阱</span>
          </div>
        </Link>

        <Link
          to="/decks"
          className="group p-6 bg-gradient-to-br from-ygo-dark to-gray-900 rounded-2xl border border-gray-800 hover:border-ygo-purple/50 transition-all duration-300"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-ygo-purple/20 rounded-xl">
              <Layers className="text-ygo-purple" size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2 group-hover:text-ygo-purple transition-colors">
                卡组集合
              </h2>
              <p className="text-gray-400">
                精选热门卡组，包含详细玩法说明和 Combo 教学
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <span className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-300">萌新</span>
            <span className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-300">娱乐</span>
            <span className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-300">硬核</span>
          </div>
        </Link>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '卡牌总数', value: '14,149', icon: BookOpen },
          { label: '精选卡组', value: '50+', icon: Layers },
          { label: '每日更新', value: '实时', icon: TrendingUp },
          { label: '中文支持', value: '100%', icon: Sparkles },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="p-4 bg-ygo-dark rounded-xl text-center">
            <Icon className="mx-auto text-ygo-accent mb-2" size={24} />
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-sm text-gray-400">{label}</div>
          </div>
        ))}
      </section>

      {/* Recent Decks Preview */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">热门卡组</h2>
          <Link to="/decks" className="text-ygo-accent hover:underline text-sm">
            查看全部 →
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {/* Placeholder cards */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 bg-ygo-dark rounded-xl border border-gray-800">
              <div className="aspect-video bg-gray-800 rounded-lg mb-3 animate-pulse" />
              <div className="h-4 bg-gray-800 rounded w-3/4 mb-2 animate-pulse" />
              <div className="h-3 bg-gray-800 rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

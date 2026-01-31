import { Outlet, Link, useLocation } from 'react-router-dom'
import { Search, BookOpen, Layers, Home } from 'lucide-react'

const navItems = [
  { path: '/', label: '首页', icon: Home },
  { path: '/cards', label: '卡牌图鉴', icon: BookOpen },
  { path: '/decks', label: '卡组集合', icon: Layers },
]

export default function Layout() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-ygo-darker">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-ygo-dark/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🎴</span>
            <span className="text-xl font-bold text-ygo-gold">游戏王图鉴</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                  location.pathname === path
                    ? 'bg-ygo-accent/20 text-ygo-accent'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          {/* Search */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="text"
                placeholder="搜索卡牌..."
                className="w-48 md:w-64 pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-ygo-accent transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <nav className="md:hidden flex border-t border-gray-800">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs transition-colors ${
                location.pathname === path
                  ? 'text-ygo-accent'
                  : 'text-gray-400'
              }`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>游戏王卡牌图鉴 by Mimi 🐱</p>
          <p className="mt-1">数据来源：YGOPro Database / 菜蘑菇社区</p>
        </div>
      </footer>
    </div>
  )
}

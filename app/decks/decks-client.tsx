'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Trash2, Image, FolderOpen, Layers, Wand2 } from 'lucide-react'

interface Deck {
  id: string
  name: string
  description: string | null
  category: string | null
  cover_card_id: number | null
  cover_card: {
    id: number
    name_cn: string | null
    name_jp: string | null
    name_en: string
  } | null
  card_count: number
  created_at: string
  updated_at: string
}

export function DecksClient() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    fetchDecks()
  }, [])

  async function fetchDecks() {
    try {
      const res = await fetch('/api/decks')
      if (res.ok) {
        const data = await res.json()
        setDecks(data)
      }
    } catch (error) {
      console.error('Failed to fetch decks:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteDeck(id: string) {
    try {
      const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteConfirm(null)
        fetchDecks()
      }
    } catch (error) {
      console.error('Failed to delete deck:', error)
    }
  }

  function getCoverImageUrl(deck: Deck): string | null {
    if (!deck.cover_card_id) return null
    return `/card-images/cn/${deck.cover_card_id}.webp`
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-amber-50">
      {/* 魔法阵背景 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-[0.03]">
          <div className="absolute inset-0 border border-amber-500/30 rounded-full animate-spin" style={{ animationDuration: '120s' }} />
        </div>
      </div>

      {/* 顶部导航 */}
      <nav className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-amber-900/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/cards" className="text-amber-200/60 hover:text-amber-200 transition-colors">
              ← 卡片库
            </Link>
            <h1 className="text-xl font-bold text-amber-200 flex items-center gap-2">
              <Layers className="w-5 h-5" />
              卡组教学
            </h1>
          </div>
          <Link
            href="/decks/import"
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-medium rounded-lg transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            智能导入
          </Link>
        </div>
      </nav>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : decks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-amber-200/40">
            <FolderOpen className="w-16 h-16 mb-4" />
            <p className="text-lg">还没有卡组</p>
            <p className="text-sm mt-2 text-center">从网上找到喜欢的卡组文章<br/>用 AI 智能导入，自动提取卡组和打法</p>
            <Link href="/decks/import" className="mt-4 px-6 py-2 bg-amber-600 hover:bg-amber-500 text-black font-medium rounded-lg flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              开始导入
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {decks.map(deck => (
              <div
                key={deck.id}
                className="group relative bg-gradient-to-br from-amber-950/20 to-amber-900/10 border border-amber-900/30 rounded-xl overflow-hidden hover:border-amber-600/50 transition-all hover:shadow-lg hover:shadow-amber-900/20"
              >
                {/* 封面图 */}
                <Link href={`/decks/${deck.id}`}>
                  <div className="aspect-[3/4] relative bg-black/50">
                    {getCoverImageUrl(deck) ? (
                      <img
                        src={getCoverImageUrl(deck)!}
                        alt={deck.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-200/20">
                        <Image className="w-16 h-16 mb-2" />
                        <span className="text-sm">无封面</span>
                      </div>
                    )}
                    {/* 卡片数量标签 */}
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-xs text-amber-200">
                      {deck.card_count} 张
                    </div>
                  </div>
                </Link>

                {/* 卡组信息 */}
                <div className="p-4">
                  <Link href={`/decks/${deck.id}`}>
                    <h3 className="font-bold text-amber-100 hover:text-amber-200 transition-colors truncate">
                      {deck.name}
                    </h3>
                  </Link>
                  {deck.description && (
                    <p className="text-sm text-amber-200/50 mt-1 line-clamp-2">
                      {deck.description}
                    </p>
                  )}
                  <p className="text-xs text-amber-200/30 mt-2">
                    {new Date(deck.updated_at).toLocaleDateString('zh-CN')}
                  </p>
                </div>

                {/* 删除按钮 */}
                <button
                  onClick={(e) => { e.preventDefault(); setDeleteConfirm(deck.id); }}
                  className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-red-600 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1a1510] border border-red-900/50 rounded-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-red-400 mb-2">确认删除</h2>
            <p className="text-amber-200/70 mb-6">删除后无法恢复，确定要删除这个卡组吗？</p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-amber-900/50 text-amber-200/70 rounded-lg hover:bg-amber-900/20 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteDeck(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

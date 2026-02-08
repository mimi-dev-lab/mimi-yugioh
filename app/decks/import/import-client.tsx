'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, Wand2, Loader2, Check, X, AlertTriangle, 
  Search, ChevronRight, FileText, Sparkles, BookOpen
} from 'lucide-react'

interface CardMatch {
  original_name: string
  matched_id: number | null
  matched_name: string | null
  confidence: number
  match_type: 'exact' | 'alias' | 'fuzzy' | 'none'
  count: number
  // 用户手动选择
  manual_id?: number
  manual_name?: string
}

interface AnalysisResult {
  name: string
  main_deck: CardMatch[]
  extra_deck: CardMatch[]
  side_deck: CardMatch[]
  notes: {
    playstyle?: string
    combos?: any[]
    tech_choices?: string
    matchups?: any[]
    tips?: string[]
  }
}

interface SearchResult {
  id: number
  name_cn: string | null
  name_jp: string | null
  name_en: string
}

export function ImportClient() {
  const router = useRouter()
  
  // 步骤状态
  const [step, setStep] = useState<'input' | 'analyzing' | 'preview' | 'importing'>('input')
  
  // 输入
  const [inputText, setInputText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  
  // 分析结果
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  
  // 手动匹配
  const [searchingFor, setSearchingFor] = useState<{ zone: string; index: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)

  // AI 分析
  const analyze = async () => {
    if (!inputText.trim()) {
      setError('请粘贴文章内容')
      return
    }

    setStep('analyzing')
    setError(null)
    setWarning(null)

    try {
      // 1. 调用 AI 分析
      const analyzeRes = await fetch('/api/decks/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, url: sourceUrl || undefined }),
      })

      const analyzeData = await analyzeRes.json()
      
      if (!analyzeData.success || !analyzeData.data) {
        throw new Error(analyzeData.error || 'AI 分析失败')
      }

      if (analyzeData.warning) {
        setWarning(analyzeData.warning)
      }

      const aiResult = analyzeData.data

      // 2. 批量匹配卡名（优先用日文名）
      const allCards = [
        ...aiResult.main_deck.map((c: any) => ({ 
          name_jp: c.name_jp,
          name_en: c.name_en, 
          name_cn: c.name_cn || c.name,
          count: c.count 
        })),
        ...aiResult.extra_deck.map((c: any) => ({ 
          name_jp: c.name_jp,
          name_en: c.name_en, 
          name_cn: c.name_cn || c.name,
          count: c.count 
        })),
        ...aiResult.side_deck.map((c: any) => ({ 
          name_jp: c.name_jp,
          name_en: c.name_en, 
          name_cn: c.name_cn || c.name,
          count: c.count 
        })),
      ]

      const matchRes = await fetch('/api/cards/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: allCards }),
      })

      const matchData = await matchRes.json()
      const matches = matchData.matches || []

      // 3. 组装结果
      let matchIndex = 0
      const buildMatches = (cards: any[]): CardMatch[] => {
        return cards.map((c: any) => {
          const match = matches[matchIndex++] || {}
          return {
            original_name: c.name_cn || c.name,
            matched_id: match.matched_id,
            matched_name: match.matched_name,
            confidence: match.confidence || 0,
            match_type: match.match_type || 'none',
            count: c.count || 1,
          }
        })
      }

      setResult({
        name: aiResult.name || '导入的卡组',
        main_deck: buildMatches(aiResult.main_deck || []),
        extra_deck: buildMatches(aiResult.extra_deck || []),
        side_deck: buildMatches(aiResult.side_deck || []),
        notes: aiResult.notes || {},
      })

      setStep('preview')

    } catch (e: any) {
      console.error('Analysis error:', e)
      setError(e.message || '分析失败，请重试')
      setStep('input')
    }
  }

  // 搜索卡片（手动匹配）
  const searchCards = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const res = await fetch(`/api/cards?search=${encodeURIComponent(query)}&limit=10`)
      const data = await res.json()
      setSearchResults(data.cards || [])
    } catch (e) {
      console.error('Search error:', e)
    }
    setSearching(false)
  }, [])

  // 手动选择卡片
  const selectCard = (card: SearchResult) => {
    if (!searchingFor || !result) return

    const { zone, index } = searchingFor
    const newResult = { ...result }
    
    const deck = zone === 'main' ? newResult.main_deck : 
                 zone === 'extra' ? newResult.extra_deck : newResult.side_deck

    deck[index] = {
      ...deck[index],
      manual_id: card.id,
      manual_name: card.name_cn || card.name_jp || card.name_en,
      confidence: 1,
      match_type: 'exact',
    }

    setResult(newResult)
    setSearchingFor(null)
    setSearchQuery('')
    setSearchResults([])

    // 学习新别名
    fetch('/api/decks/import', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        alias: deck[index].original_name, 
        card_id: card.id 
      }),
    }).catch(() => {})
  }

  // 导入卡组
  const importDeck = async () => {
    if (!result) return

    setStep('importing')

    try {
      const buildCards = (matches: CardMatch[]) => 
        matches
          .filter(m => m.manual_id || m.matched_id)
          .map(m => ({
            card_id: m.manual_id || m.matched_id!,
            count: m.count,
          }))

      const res = await fetch('/api/decks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: result.name,
          source_url: sourceUrl || undefined,
          source_text: inputText,
          main_deck: buildCards(result.main_deck),
          extra_deck: buildCards(result.extra_deck),
          side_deck: buildCards(result.side_deck),
          notes: result.notes,
        }),
      })

      const data = await res.json()

      if (data.success && data.deck_id) {
        router.push(`/decks/${data.deck_id}`)
      } else {
        throw new Error(data.error || '导入失败')
      }

    } catch (e: any) {
      setError(e.message || '导入失败')
      setStep('preview')
    }
  }

  // 统计匹配情况
  const getStats = () => {
    if (!result) return { total: 0, matched: 0, unmatched: 0 }
    
    const all = [...result.main_deck, ...result.extra_deck, ...result.side_deck]
    const matched = all.filter(m => m.manual_id || m.matched_id).length
    
    return {
      total: all.length,
      matched,
      unmatched: all.length - matched,
    }
  }

  const stats = getStats()

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-amber-50">
      {/* 魔法阵背景 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-[0.03]">
          <div className="absolute inset-0 border border-amber-500/30 rounded-full animate-spin" style={{ animationDuration: '120s' }} />
        </div>
      </div>

      {/* 顶部导航 */}
      <nav className="sticky top-0 z-40 bg-black/90 backdrop-blur-md border-b border-amber-900/30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/decks" className="text-amber-200/60 hover:text-amber-200 flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> 返回
          </Link>
          <h1 className="text-xl font-bold text-amber-200 flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            智能导入卡组
          </h1>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        
        {/* Step 1: 输入 */}
        {step === 'input' && (
          <div className="space-y-6">
            {/* NotebookLM 提示词模板 */}
            <PromptTemplate />
            
            <div className="bg-gradient-to-br from-amber-950/20 to-transparent border border-amber-900/30 rounded-xl p-6">
              <h2 className="text-lg font-bold text-amber-200 mb-2 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                粘贴卡组文章
              </h2>
              <p className="text-sm text-amber-200/60 mb-4">
                支持任何格式的卡组介绍文章，AI 会自动识别卡组列表和打法说明
              </p>
              
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                className="w-full h-64 px-4 py-3 bg-black/50 border border-amber-900/50 rounded-lg text-amber-100 resize-none focus:outline-none focus:border-amber-600 font-mono text-sm"
                placeholder="在这里粘贴卡组文章内容...

例如：
【黑魔导卡组介绍】

主卡组（40张）：
黑魔导 x3
黑魔导女孩 x2
..."
              />
              
              <div className="mt-4">
                <label className="block text-sm text-amber-200/60 mb-1">来源链接（可选）</label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={e => setSourceUrl(e.target.value)}
                  className="w-full px-4 py-2 bg-black/50 border border-amber-900/50 rounded-lg text-amber-100 focus:outline-none focus:border-amber-600"
                  placeholder="https://..."
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-900/30 border border-red-900/50 rounded-lg text-red-300">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
            )}

            <button
              onClick={analyze}
              disabled={!inputText.trim()}
              className="w-full py-4 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900/30 disabled:text-amber-200/30 text-black font-bold text-lg rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              AI 智能分析
            </button>
          </div>
        )}

        {/* Step 2: 分析中 */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-amber-500 animate-spin mb-4" />
            <p className="text-amber-200 text-lg">AI 正在分析文章...</p>
            <p className="text-amber-200/50 text-sm mt-2">识别卡组列表和打法说明</p>
          </div>
        )}

        {/* Step 3: 预览确认 */}
        {step === 'preview' && result && (
          <div className="space-y-6">
            {/* 警告信息 */}
            {warning && (
              <div className="flex items-center gap-2 px-4 py-3 bg-yellow-900/30 border border-yellow-900/50 rounded-lg text-yellow-300">
                <AlertTriangle className="w-4 h-4" />
                {warning}
              </div>
            )}

            {/* 卡组名称 */}
            <div className="bg-gradient-to-br from-amber-950/20 to-transparent border border-amber-900/30 rounded-xl p-4">
              <label className="block text-sm text-amber-200/60 mb-1">卡组名称</label>
              <input
                type="text"
                value={result.name}
                onChange={e => setResult({ ...result, name: e.target.value })}
                className="w-full px-4 py-2 bg-black/50 border border-amber-900/50 rounded-lg text-amber-100 text-lg font-bold focus:outline-none focus:border-amber-600"
              />
            </div>

            {/* 匹配统计 */}
            <div className="flex items-center gap-4 px-4 py-3 bg-black/30 border border-amber-900/30 rounded-lg">
              <span className="text-amber-200/60">匹配结果:</span>
              <span className="text-green-400">✓ {stats.matched} 已匹配</span>
              {stats.unmatched > 0 && (
                <span className="text-red-400">✗ {stats.unmatched} 未匹配</span>
              )}
              <span className="text-amber-200/40">共 {stats.total} 张</span>
            </div>

            {/* 主卡组 */}
            <MatchSection
              title="主卡组"
              matches={result.main_deck}
              zone="main"
              onSearch={(index) => { setSearchingFor({ zone: 'main', index }); setSearchQuery(result.main_deck[index].original_name); }}
            />

            {/* 额外卡组 */}
            {result.extra_deck.length > 0 && (
              <MatchSection
                title="额外卡组"
                matches={result.extra_deck}
                zone="extra"
                onSearch={(index) => { setSearchingFor({ zone: 'extra', index }); setSearchQuery(result.extra_deck[index].original_name); }}
              />
            )}

            {/* 副卡组 */}
            {result.side_deck.length > 0 && (
              <MatchSection
                title="副卡组"
                matches={result.side_deck}
                zone="side"
                onSearch={(index) => { setSearchingFor({ zone: 'side', index }); setSearchQuery(result.side_deck[index].original_name); }}
              />
            )}

            {/* 笔记预览 */}
            {result.notes && (result.notes.playstyle || result.notes.combos?.length) && (
              <div className="bg-gradient-to-br from-green-950/20 to-transparent border border-green-900/30 rounded-xl p-4">
                <h3 className="text-lg font-bold text-green-400 mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  笔记预览
                </h3>
                {result.notes.playstyle && (
                  <div className="mb-3">
                    <h4 className="text-sm font-bold text-green-300 mb-1">打法思路</h4>
                    <p className="text-sm text-amber-200/70">{result.notes.playstyle}</p>
                  </div>
                )}
                {result.notes.combos && result.notes.combos.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-sm font-bold text-green-300 mb-1">Combo ({result.notes.combos.length})</h4>
                    <p className="text-sm text-amber-200/50">导入后可查看详细步骤</p>
                  </div>
                )}
              </div>
            )}

            {/* 错误信息 */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-900/30 border border-red-900/50 rounded-lg text-red-300">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-4">
              <button
                onClick={() => { setStep('input'); setResult(null); }}
                className="flex-1 py-3 border border-amber-900/50 text-amber-200/70 rounded-lg hover:bg-amber-900/20"
              >
                返回修改
              </button>
              <button
                onClick={importDeck}
                disabled={stats.matched === 0}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900/30 disabled:text-amber-200/30 text-black font-bold rounded-lg flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                确认导入
              </button>
            </div>
          </div>
        )}

        {/* Step 4: 导入中 */}
        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-amber-500 animate-spin mb-4" />
            <p className="text-amber-200 text-lg">正在导入卡组...</p>
          </div>
        )}
      </main>

      {/* 手动搜索弹窗 */}
      {searchingFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 pt-20 px-4" onClick={() => setSearchingFor(null)}>
          <div className="bg-[#1a1510] border border-amber-900/50 rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-amber-900/30">
              <h3 className="text-lg font-bold text-amber-200 mb-2">手动选择卡片</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-200/30" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); searchCards(e.target.value); }}
                  className="w-full pl-10 pr-4 py-2 bg-black/50 border border-amber-900/50 rounded-lg text-amber-100 focus:outline-none focus:border-amber-600"
                  placeholder="搜索卡片名称..."
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-4">
              {searching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                </div>
              ) : searchResults.length === 0 ? (
                <p className="text-center text-amber-200/40 py-8">输入关键字搜索卡片</p>
              ) : (
                <div className="space-y-2">
                  {searchResults.map(card => (
                    <button
                      key={card.id}
                      onClick={() => selectCard(card)}
                      className="w-full flex items-center gap-3 p-2 hover:bg-amber-900/20 rounded-lg text-left"
                    >
                      <img
                        src={`/card-images/cn/${card.id}.webp`}
                        alt=""
                        className="w-10 h-14 object-cover rounded"
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-amber-100 truncate">{card.name_cn || card.name_jp || card.name_en}</p>
                        <p className="text-xs text-amber-200/50">ID: {card.id}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-amber-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 匹配结果区块
// NotebookLM 提示词模板组件
function PromptTemplate() {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  
  const promptText = `请为【在此输入卡组名称】生成一份卡组教学文档。

## 格式要求

### 卡表格式（每张卡必须这样写）
- 3x **日文卡名** (中文卡名) [角色]

例如：
- 3x **増殖するG** (增殖的G) [手坑]
- 3x **灰流うらら** (灰流丽) [手坑]
- 2x **M・HERO ダーク・ロウ** (M・HERO 暗爪) [终端]

角色标签只用这些: [核心][初动][展开][终端][手坑][检索][保护][去除][泛用]

### 需要包含的内容

1. **打法思路** - 3-5句话概括核心战术

2. **卡组列表** - 分主卡组/额外卡组，每张卡都要有日文名和角色标签

3. **起手判断**
   - ✅ 理想起手（2-3种情况，写明需要哪些卡，能做出什么场）
   - ⚠️ 勉强能打（写明条件和预期结果）

4. **Combo 教学**（给5个常用Combo）
   - 起手要求（需要哪些卡）
   - 详细步骤（每步写出日文卡名和中文卡名）
   - 最终场面（场上有什么、盖了什么、墓地有什么资源）

5. **小技巧**（3-5个进阶技巧）`
  
  const copyPrompt = async () => {
    try {
      // 优先使用现代 API
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText)
      } else {
        // HTTP 环境 fallback
        const textarea = document.createElement('textarea')
        textarea.value = promptText
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }
  
  return (
    <div className="bg-gradient-to-br from-blue-950/20 to-transparent border border-blue-900/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-blue-900/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-400" />
          <span className="font-bold text-blue-200">NotebookLM 提示词模板</span>
          <span className="text-xs text-blue-400/60 px-2 py-0.5 bg-blue-900/30 rounded">推荐</span>
        </div>
        <ChevronRight className={`w-5 h-5 text-blue-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      
      {expanded && (
        <div className="px-4 pb-4 border-t border-blue-900/30">
          <p className="text-sm text-blue-200/60 py-3">
            复制下面的提示词发给 NotebookLM，然后将回复粘贴到下方
          </p>
          
          <div className="relative">
            <pre className="p-4 bg-black/50 rounded-lg text-sm text-blue-100 whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto font-mono">
              {promptText}
            </pre>
            
            <button
              onClick={copyPrompt}
              className={`absolute top-2 right-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                copied 
                  ? 'bg-green-600 text-white' 
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {copied ? '✓ 已复制' : '复制提示词'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MatchSection({ 
  title, 
  matches, 
  zone,
  onSearch 
}: { 
  title: string
  matches: CardMatch[]
  zone: string
  onSearch: (index: number) => void
}) {
  const total = matches.reduce((s, m) => s + m.count, 0)
  
  return (
    <div className="bg-gradient-to-br from-amber-950/10 to-transparent border border-amber-900/30 rounded-xl p-4">
      <h3 className="text-lg font-bold text-amber-200 mb-3">
        {title} <span className="text-amber-200/50 font-normal">({total}张)</span>
      </h3>
      <div className="space-y-1">
        {matches.map((match, index) => (
          <div 
            key={index} 
            className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
              match.manual_id || match.matched_id 
                ? 'bg-green-900/10 border border-green-900/30' 
                : 'bg-red-900/10 border border-red-900/30'
            }`}
          >
            {/* 数量 */}
            <span className="w-6 text-center text-amber-200/60 font-mono">{match.count}x</span>
            
            {/* 原名 */}
            <span className="flex-1 text-amber-100 truncate">{match.original_name}</span>
            
            {/* 匹配结果 */}
            {match.manual_id || match.matched_id ? (
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-sm">→ {match.manual_name || match.matched_name}</span>
                <Check className="w-4 h-4 text-green-500" />
              </div>
            ) : (
              <button
                onClick={() => onSearch(index)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-300 rounded"
              >
                <Search className="w-3 h-3" />
                手动选择
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

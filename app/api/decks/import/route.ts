import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

interface CardInput {
  card_id: number
  count: number
}

interface ImportData {
  name: string
  source_url?: string
  source_text?: string
  cover_card_id?: number
  main_deck: CardInput[]
  extra_deck: CardInput[]
  side_deck: CardInput[]
  notes?: {
    playstyle?: string
    combos?: any[]
    tech_choices?: string
    matchups?: any[]
    tips?: string[]
  }
}

// POST /api/decks/import - 导入卡组
export async function POST(request: NextRequest) {
  try {
    const body: ImportData = await request.json()

    if (!body.name) {
      return NextResponse.json({ error: '需要提供卡组名称' }, { status: 400 })
    }

    // 1. 创建卡组
    const deckRes = await fetch(`${SUPABASE_URL}/rest/v1/decks`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        name: body.name,
        source_url: body.source_url || null,
        source_text: body.source_text || null,
        cover_card_id: body.cover_card_id || (body.main_deck[0]?.card_id) || null,
        notes: body.notes || {},
        is_imported: true,
      }),
    })

    if (!deckRes.ok) {
      const err = await deckRes.text()
      throw new Error(`创建卡组失败: ${err}`)
    }

    const [deck] = await deckRes.json()
    const deckId = deck.id

    // 2. 批量添加卡片
    const allCards: { deck_id: string; card_id: number; zone: string; count: number }[] = []

    body.main_deck.forEach(c => {
      if (c.card_id && c.count > 0) {
        allCards.push({ deck_id: deckId, card_id: c.card_id, zone: 'main', count: c.count })
      }
    })

    body.extra_deck.forEach(c => {
      if (c.card_id && c.count > 0) {
        allCards.push({ deck_id: deckId, card_id: c.card_id, zone: 'extra', count: c.count })
      }
    })

    body.side_deck.forEach(c => {
      if (c.card_id && c.count > 0) {
        allCards.push({ deck_id: deckId, card_id: c.card_id, zone: 'side', count: c.count })
      }
    })

    if (allCards.length > 0) {
      const cardsRes = await fetch(`${SUPABASE_URL}/rest/v1/deck_cards`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(allCards),
      })

      if (!cardsRes.ok) {
        console.error('添加卡片失败:', await cardsRes.text())
      }
    }

    // 3. 学习新别名（如果有未匹配的卡名在匹配过程中被用户手动选择）
    // 这个功能在前端实现

    return NextResponse.json({ 
      success: true, 
      deck_id: deckId,
      card_count: allCards.length
    })

  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json({ error: '导入失败' }, { status: 500 })
  }
}

// POST /api/decks/import/learn - 学习新别名
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { alias, card_id } = body

    if (!alias || !card_id) {
      return NextResponse.json({ error: '需要提供 alias 和 card_id' }, { status: 400 })
    }

    // 规范化别名
    const normalizedAlias = alias.toLowerCase().trim()

    // 插入别名
    const res = await fetch(`${SUPABASE_URL}/rest/v1/card_aliases`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        alias: normalizedAlias,
        card_id,
        source: 'learned',
      }),
    })

    if (res.ok) {
      return NextResponse.json({ success: true })
    } else {
      // 可能是重复的别名，忽略
      return NextResponse.json({ success: true, note: 'alias may already exist' })
    }

  } catch (error) {
    console.error('Learn alias error:', error)
    return NextResponse.json({ error: '学习别名失败' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// GET /api/decks - 获取所有卡组
export async function GET(request: NextRequest) {
  try {
    // 获取卡组列表，包含封面卡片信息和卡片数量
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/decks?select=*,cover_card:cards!cover_card_id(id,name_cn,name_jp,name_en)&order=updated_at.desc`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status}`)
    }

    const decks = await response.json()

    // 获取每个卡组的卡片数量
    const deckIds = decks.map((d: any) => d.id)
    if (deckIds.length > 0) {
      const countResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/deck_cards?select=deck_id,count&deck_id=in.(${deckIds.map((id: string) => `"${id}"`).join(',')})`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          },
        }
      )
      
      if (countResponse.ok) {
        const deckCards = await countResponse.json()
        // 计算每个卡组的总卡片数
        const cardCounts: Record<string, number> = {}
        deckCards.forEach((dc: any) => {
          cardCounts[dc.deck_id] = (cardCounts[dc.deck_id] || 0) + dc.count
        })
        
        decks.forEach((deck: any) => {
          deck.card_count = cardCounts[deck.id] || 0
        })
      }
    }

    return NextResponse.json(decks)
  } catch (error) {
    console.error('Error fetching decks:', error)
    return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 })
  }
}

// POST /api/decks - 创建新卡组
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, category, cover_card_id } = body

    if (!name) {
      return NextResponse.json({ error: '卡组名称不能为空' }, { status: 400 })
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/decks`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          name,
          description: description || null,
          category: category || null,
          cover_card_id: cover_card_id || null,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Supabase error: ${error}`)
    }

    const deck = await response.json()
    return NextResponse.json(deck[0], { status: 201 })
  } catch (error) {
    console.error('Error creating deck:', error)
    return NextResponse.json({ error: 'Failed to create deck' }, { status: 500 })
  }
}

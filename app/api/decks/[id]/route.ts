import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// GET /api/decks/[id] - 获取单个卡组详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    // 获取卡组基本信息
    const deckResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/decks?id=eq.${id}&select=*,cover_card:cards!cover_card_id(id,name_cn,name_jp,name_en)`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )

    if (!deckResponse.ok) {
      throw new Error(`Supabase error: ${deckResponse.status}`)
    }

    const decks = await deckResponse.json()
    if (decks.length === 0) {
      return NextResponse.json({ error: '卡组不存在' }, { status: 404 })
    }

    const deck = decks[0]

    // 获取卡组内的卡片
    const cardsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/deck_cards?deck_id=eq.${id}&select=*,card:cards(*)`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )

    if (cardsResponse.ok) {
      const deckCards = await cardsResponse.json()
      // 按区域分组
      deck.main_deck = deckCards.filter((dc: any) => dc.zone === 'main')
      deck.extra_deck = deckCards.filter((dc: any) => dc.zone === 'extra')
      deck.side_deck = deckCards.filter((dc: any) => dc.zone === 'side')
    }

    return NextResponse.json(deck)
  } catch (error) {
    console.error('Error fetching deck:', error)
    return NextResponse.json({ error: 'Failed to fetch deck' }, { status: 500 })
  }
}

// PATCH /api/decks/[id] - 更新卡组
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const body = await request.json()
    const { name, description, category, cover_card_id } = body

    const updateData: any = { updated_at: new Date().toISOString() }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (category !== undefined) updateData.category = category
    if (cover_card_id !== undefined) updateData.cover_card_id = cover_card_id

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/decks?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(updateData),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Supabase error: ${error}`)
    }

    const deck = await response.json()
    return NextResponse.json(deck[0])
  } catch (error) {
    console.error('Error updating deck:', error)
    return NextResponse.json({ error: 'Failed to update deck' }, { status: 500 })
  }
}

// DELETE /api/decks/[id] - 删除卡组
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/decks?id=eq.${id}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting deck:', error)
    return NextResponse.json({ error: 'Failed to delete deck' }, { status: 500 })
  }
}

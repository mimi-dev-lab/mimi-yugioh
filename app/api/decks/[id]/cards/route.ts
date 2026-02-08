import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// POST /api/decks/[id]/cards - 添加卡片到卡组
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deck_id } = await params
  
  try {
    const body = await request.json()
    const { card_id, zone = 'main', count = 1 } = body

    if (!card_id) {
      return NextResponse.json({ error: '缺少卡片ID' }, { status: 400 })
    }

    // 检查卡组是否存在
    const deckCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/decks?id=eq.${deck_id}&select=id`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    const decks = await deckCheck.json()
    if (decks.length === 0) {
      return NextResponse.json({ error: '卡组不存在' }, { status: 404 })
    }

    // 检查是否已存在该卡片
    const existingCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/deck_cards?deck_id=eq.${deck_id}&card_id=eq.${card_id}&zone=eq.${zone}&select=id,count`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    )
    const existing = await existingCheck.json()

    if (existing.length > 0) {
      // 更新数量（最多3张）
      const newCount = Math.min(existing[0].count + count, 3)
      const updateResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/deck_cards?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ count: newCount }),
        }
      )
      const updated = await updateResponse.json()
      return NextResponse.json(updated[0])
    } else {
      // 新增
      const insertResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/deck_cards`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            deck_id,
            card_id,
            zone,
            count: Math.min(count, 3),
          }),
        }
      )
      
      if (!insertResponse.ok) {
        const error = await insertResponse.text()
        throw new Error(`Supabase error: ${error}`)
      }

      const deckCard = await insertResponse.json()
      return NextResponse.json(deckCard[0], { status: 201 })
    }
  } catch (error) {
    console.error('Error adding card to deck:', error)
    return NextResponse.json({ error: 'Failed to add card' }, { status: 500 })
  }
}

// DELETE /api/decks/[id]/cards - 从卡组移除卡片
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const deckCardId = searchParams.get('deckCardId')
  const cardId = searchParams.get('cardId')
  const zone = searchParams.get('zone')
  const deckId = searchParams.get('deckId')

  try {
    let deleteUrl = `${SUPABASE_URL}/rest/v1/deck_cards?`
    
    if (deckCardId) {
      deleteUrl += `id=eq.${deckCardId}`
    } else if (cardId && zone && deckId) {
      deleteUrl += `deck_id=eq.${deckId}&card_id=eq.${cardId}&zone=eq.${zone}`
    } else {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing card from deck:', error)
    return NextResponse.json({ error: 'Failed to remove card' }, { status: 500 })
  }
}

// PATCH /api/decks/[id]/cards - 更新卡片数量或区域
export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const deckCardId = searchParams.get('deckCardId')

  if (!deckCardId) {
    return NextResponse.json({ error: '缺少 deckCardId' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { count, zone } = body

    const updateData: any = {}
    if (count !== undefined) updateData.count = Math.min(Math.max(count, 1), 3)
    if (zone !== undefined) updateData.zone = zone

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/deck_cards?id=eq.${deckCardId}`,
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
      throw new Error(`Supabase error: ${response.status}`)
    }

    const updated = await response.json()
    return NextResponse.json(updated[0])
  } catch (error) {
    console.error('Error updating deck card:', error)
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 })
  }
}

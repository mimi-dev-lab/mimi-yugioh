import { DeckDetailClient } from './deck-detail-client'

export const metadata = {
  title: '卡组详情 | Mimi YuGiOh',
}

export default async function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DeckDetailClient deckId={id} />
}

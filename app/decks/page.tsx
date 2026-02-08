import { DecksClient } from './decks-client'

export const metadata = {
  title: '卡组构筑 | Mimi YuGiOh',
  description: '管理你的游戏王卡组',
}

export default function DecksPage() {
  return <DecksClient />
}

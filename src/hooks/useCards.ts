import { useState, useEffect, useCallback } from 'react'
import type { Card, CardFilter } from '../types'
import { attributeMapReverse, raceMapReverse } from '../utils/cardMappings'

const API_BASE = '/api'

// 魔陷种类中文 → API 参数
const spellTrapTypeMap: Record<string, string> = {
  '通常魔法': 'normal_spell',
  '场地魔法': 'field_spell',
  '装备魔法': 'equip_spell',
  '永续魔法': 'continuous_spell',
  '速攻魔法': 'quickplay_spell',
  '仪式魔法': 'ritual_spell',
  '通常陷阱': 'normal_trap',
  '永续陷阱': 'continuous_trap',
  '反击陷阱': 'counter_trap',
}

export function useCards(filter?: CardFilter, page = 1, limit = 48) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const fetchCards = useCallback(async () => {
    // 如果没有 filter，不请求 API，返回空状态
    if (!filter) {
      setCards([])
      setTotal(0)
      setTotalPages(0)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', limit.toString())
      
      // 搜索关键词
      if (filter?.search) {
        params.set('q', filter.search)
      }
      
      // 卡片边框
      if (filter?.frames && filter.frames.length > 0) {
        params.set('frames', filter.frames.join(','))
      }
      
      // 属性（转换为英文）
      if (filter?.attributes && filter.attributes.length > 0) {
        const engAttributes = filter.attributes.map(a => attributeMapReverse[a] || a)
        params.set('attributes', engAttributes.join(','))
      }
      
      // 种族（转换为英文）
      if (filter?.races && filter.races.length > 0) {
        const engRaces = filter.races.map(r => raceMapReverse[r] || r)
        params.set('races', engRaces.join(','))
      }
      
      // 魔陷种类（转换为 API 参数格式）
      if (filter?.spellTrapTypes && filter.spellTrapTypes.length > 0) {
        const apiTypes = filter.spellTrapTypes.map(t => spellTrapTypeMap[t]).filter(Boolean)
        if (apiTypes.length > 0) {
          params.set('spellTrapTypes', apiTypes.join(','))
        }
      }
      
      // 等级
      if (filter?.levels && filter.levels.length > 0) {
        params.set('levels', filter.levels.join(','))
      }
      
      // 攻击力范围
      if (filter?.atkMin !== undefined) {
        params.set('atkMin', filter.atkMin.toString())
      }
      if (filter?.atkMax !== undefined) {
        params.set('atkMax', filter.atkMax.toString())
      }
      
      // 防御力范围
      if (filter?.defMin !== undefined) {
        params.set('defMin', filter.defMin.toString())
      }
      if (filter?.defMax !== undefined) {
        params.set('defMax', filter.defMax.toString())
      }
      
      const res = await fetch(`${API_BASE}/cards?${params}`)
      if (!res.ok) throw new Error('Failed to load cards')
      
      const data = await res.json()
      
      const transformedCards: Card[] = data.cards.map((card: Record<string, unknown>) => ({
        id: card.id as number,
        name: card.name as string,
        name_cn: card.name_cn as string | null,
        name_jp: card.name_jp as string | null,
        type: card.type as string,
        race: card.race as string | null,
        attribute: card.attribute as string | null,
        level: card.level as number | null,
        atk: card.atk as number | null,
        def: card.def as number | null,
        desc: '',
        desc_cn: card.desc_cn as string | null,
        image_url: card.image_cn as string,
        image_url_jp: card.image_jp as string,
      }))
      
      setCards(transformedCards)
      setTotal(data.pagination.total)
      setTotalPages(data.pagination.totalPages)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [
    filter?.search,
    filter?.frames,
    filter?.attributes,
    filter?.races,
    filter?.spellTrapTypes,
    filter?.levels,
    filter?.atkMin,
    filter?.atkMax,
    filter?.defMin,
    filter?.defMax,
    page,
    limit
  ])

  useEffect(() => {
    fetchCards()
  }, [fetchCards])

  return {
    cards,
    loading,
    error,
    total,
    totalPages,
    page,
  }
}

export function useCard(cardId: string | number) {
  const [card, setCard] = useState<Card | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadCard = async () => {
      try {
        setLoading(true)
        const res = await fetch(`${API_BASE}/cards/${cardId}`)
        if (!res.ok) throw new Error('Card not found')
        
        const data = await res.json()
        
        setCard({
          id: data.id,
          name: data.name,
          name_cn: data.name_cn,
          name_jp: data.name_jp,
          type: data.type,
          race: data.race,
          attribute: data.attribute,
          level: data.level,
          atk: data.atk,
          def: data.def,
          desc: '',
          desc_cn: data.desc_cn,
          image_url: data.image_cn,
          image_url_jp: data.image_jp,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    loadCard()
  }, [cardId])

  return { card, loading, error }
}

// 批量解析卡名
export async function resolveCardNames(names: string[]): Promise<{
  resolved: Card[]
  notFound: string[]
}> {
  const res = await fetch(`${API_BASE}/cards/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  })
  
  if (!res.ok) throw new Error('Failed to resolve card names')
  
  const data = await res.json()
  
  return {
    resolved: data.resolved.map((card: Record<string, unknown>) => ({
      id: card.id as number,
      name: card.name as string,
      name_cn: card.name_cn as string | null,
      name_jp: card.name_jp as string | null,
      type: card.type as string,
      race: card.race as string | null,
      attribute: card.attribute as string | null,
      level: card.level as number | null,
      atk: card.atk as number | null,
      def: card.def as number | null,
      desc: '',
      desc_cn: card.desc_cn as string | null,
      image_url: card.image_cn as string,
      image_url_jp: card.image_jp as string,
    })),
    notFound: data.notFound,
  }
}

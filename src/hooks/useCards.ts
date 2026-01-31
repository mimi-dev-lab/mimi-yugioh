import { useState, useEffect, useMemo } from 'react'
import type { Card, CardFilter } from '../types'
import { attributeMapReverse, raceMapReverse, getCardFrame } from '../utils/cardMappings'

// 开发环境直接加载 JSON（生产环境会用 D1 API）
const CARDS_URL = '/data/cards.json'

export function useCards(filter?: CardFilter, page = 1, limit = 48) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allCards, setAllCards] = useState<Card[]>([])

  // 加载所有卡牌数据
  useEffect(() => {
    const loadCards = async () => {
      try {
        setLoading(true)
        const res = await fetch(CARDS_URL)
        if (!res.ok) throw new Error('Failed to load cards')
        const data = await res.json()
        setAllCards(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    loadCards()
  }, [])

  // 过滤和分页
  const filteredCards = useMemo(() => {
    if (!allCards.length) return []
    
    let result = [...allCards]

    // 搜索
    if (filter?.search) {
      const searchLower = filter.search.toLowerCase()
      result = result.filter(card => 
        card.name_cn?.toLowerCase().includes(searchLower) ||
        card.name.toLowerCase().includes(searchLower) ||
        card.desc_cn?.toLowerCase().includes(searchLower) ||
        card.desc.toLowerCase().includes(searchLower)
      )
    }

    // 卡片边框筛选
    if (filter?.frames && filter.frames.length > 0) {
      result = result.filter(card => {
        const frame = getCardFrame(card.type)
        return filter.frames!.includes(frame)
      })
    }

    // 属性筛选
    if (filter?.attributes && filter.attributes.length > 0) {
      result = result.filter(card => {
        if (!card.attribute) return false
        // 将中文属性转换为英文进行匹配
        return filter.attributes!.some(attr => {
          const engAttr = attributeMapReverse[attr]
          return card.attribute === engAttr || card.attribute === attr
        })
      })
    }

    // 魔法陷阱种类筛选
    if (filter?.spellTrapTypes && filter.spellTrapTypes.length > 0) {
      result = result.filter(card => {
        const type = card.type
        const race = card.race
        
        return filter.spellTrapTypes!.some(st => {
          if (st === '通常魔法') return type.includes('Spell') && race === 'Normal'
          if (st === '场地魔法') return type.includes('Spell') && race === 'Field'
          if (st === '装备魔法') return type.includes('Spell') && race === 'Equip'
          if (st === '永续魔法') return type.includes('Spell') && race === 'Continuous'
          if (st === '速攻魔法') return type.includes('Spell') && race === 'Quick-Play'
          if (st === '仪式魔法') return type.includes('Spell') && race === 'Ritual'
          if (st === '通常陷阱') return type.includes('Trap') && race === 'Normal'
          if (st === '永续陷阱') return type.includes('Trap') && race === 'Continuous'
          if (st === '反击陷阱') return type.includes('Trap') && race === 'Counter'
          return false
        })
      })
    }

    // 种族筛选
    if (filter?.races && filter.races.length > 0) {
      result = result.filter(card => {
        if (!card.race) return false
        // 只对怪兽卡筛选种族
        if (card.type.includes('Spell') || card.type.includes('Trap')) return false
        
        return filter.races!.some(race => {
          const engRace = raceMapReverse[race]
          return card.race === engRace || card.race === race
        })
      })
    }

    // 等级筛选
    if (filter?.levels && filter.levels.length > 0) {
      result = result.filter(card => {
        if (card.level === null) return false
        return filter.levels!.includes(card.level)
      })
    }

    // 攻击力范围
    if (filter?.atkMin !== undefined) {
      result = result.filter(card => card.atk !== null && card.atk >= filter.atkMin!)
    }
    if (filter?.atkMax !== undefined) {
      result = result.filter(card => card.atk !== null && card.atk <= filter.atkMax!)
    }

    // 守备力范围
    if (filter?.defMin !== undefined) {
      result = result.filter(card => card.def !== null && card.def >= filter.defMin!)
    }
    if (filter?.defMax !== undefined) {
      result = result.filter(card => card.def !== null && card.def <= filter.defMax!)
    }

    return result
  }, [allCards, filter])

  // 分页
  const paginatedCards = useMemo(() => {
    const start = (page - 1) * limit
    return filteredCards.slice(start, start + limit)
  }, [filteredCards, page, limit])

  const totalPages = Math.ceil(filteredCards.length / limit)

  return {
    cards: paginatedCards,
    loading,
    error,
    total: filteredCards.length,
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
        const res = await fetch(CARDS_URL)
        if (!res.ok) throw new Error('Failed to load cards')
        const data: Card[] = await res.json()
        const found = data.find(c => c.id === Number(cardId))
        if (!found) throw new Error('Card not found')
        setCard(found)
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

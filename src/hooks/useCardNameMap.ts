import { useState, useEffect } from 'react';
import type { Card } from '../types';

const CARDS_URL = '/data/cards.json';

/**
 * 加载卡片名称 → ID 映射
 * 支持中文名、英文名、日文名
 */
export function useCardNameMap() {
  const [nameToId, setNameToId] = useState<Record<string, number>>({});
  const [idToCard, setIdToCard] = useState<Record<number, Card>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCards = async () => {
      try {
        setLoading(true);
        const res = await fetch(CARDS_URL);
        if (!res.ok) throw new Error('Failed to load cards');
        const cards: Card[] = await res.json();

        const nameMap: Record<string, number> = {};
        const cardMap: Record<number, Card> = {};

        for (const card of cards) {
          // 中文名
          if (card.name_cn) {
            nameMap[card.name_cn] = card.id;
            // 也尝试去掉空格的版本
            nameMap[card.name_cn.replace(/\s+/g, '')] = card.id;
          }
          // 英文名
          if (card.name) {
            nameMap[card.name] = card.id;
            nameMap[card.name.toLowerCase()] = card.id;
          }
          // 日文名
          if (card.name_jp) {
            nameMap[card.name_jp] = card.id;
          }
          
          cardMap[card.id] = card;
        }

        setNameToId(nameMap);
        setIdToCard(cardMap);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadCards();
  }, []);

  // 通过名字获取卡片 ID（模糊匹配）
  const getCardId = (name: string): number | undefined => {
    // 精确匹配
    if (nameToId[name]) return nameToId[name];
    
    // 去空格匹配
    const noSpace = name.replace(/\s+/g, '');
    if (nameToId[noSpace]) return nameToId[noSpace];
    
    // 小写匹配
    if (nameToId[name.toLowerCase()]) return nameToId[name.toLowerCase()];
    
    // 部分匹配（卡名包含输入）
    for (const [cardName, id] of Object.entries(nameToId)) {
      if (cardName.includes(name) || name.includes(cardName)) {
        return id;
      }
    }
    
    return undefined;
  };

  // 通过 ID 获取卡片详情
  const getCard = (id: number): Card | undefined => {
    return idToCard[id];
  };

  return {
    nameToId,
    idToCard,
    getCardId,
    getCard,
    loading,
    error,
  };
}

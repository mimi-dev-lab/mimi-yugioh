// 英文到中文的映射表

// 属性映射
export const attributeMap: Record<string, string> = {
  'DARK': '暗',
  'LIGHT': '光',
  'EARTH': '地',
  'WATER': '水',
  'FIRE': '火',
  'WIND': '风',
  'DIVINE': '神',
}

export const attributeMapReverse: Record<string, string> = {
  '暗': 'DARK',
  '光': 'LIGHT',
  '地': 'EARTH',
  '水': 'WATER',
  '火': 'FIRE',
  '风': 'WIND',
  '神': 'DIVINE',
}

// 种族映射
export const raceMap: Record<string, string> = {
  'Spellcaster': '魔法师族',
  'Dragon': '龙族',
  'Zombie': '不死族',
  'Warrior': '战士族',
  'Beast-Warrior': '兽战士族',
  'Beast': '兽族',
  'Winged Beast': '鸟兽族',
  'Machine': '机械族',
  'Fiend': '恶魔族',
  'Fairy': '天使族',
  'Insect': '昆虫族',
  'Dinosaur': '恐龙族',
  'Reptile': '爬虫类族',
  'Fish': '鱼族',
  'Sea Serpent': '海龙族',
  'Aqua': '水族',
  'Pyro': '炎族',
  'Thunder': '雷族',
  'Rock': '岩石族',
  'Plant': '植物族',
  'Psychic': '念动力族',
  'Wyrm': '幻龙族',
  'Cyberse': '电子界族',
  'Divine-Beast': '幻神兽族',
  'Illusion': '幻想魔族',
  'Creator-God': '创世神族',
  // 魔法陷阱类型
  'Normal': '通常',
  'Continuous': '永续',
  'Equip': '装备',
  'Field': '场地',
  'Quick-Play': '速攻',
  'Ritual': '仪式',
  'Counter': '反击',
}

export const raceMapReverse: Record<string, string> = Object.fromEntries(
  Object.entries(raceMap).map(([k, v]) => [v, k])
)

// 卡片类型映射
export const cardTypeMap: Record<string, string> = {
  'Normal Monster': '通常怪兽',
  'Effect Monster': '效果怪兽',
  'Fusion Monster': '融合怪兽',
  'Ritual Monster': '仪式怪兽',
  'Synchro Monster': '同步怪兽',
  'Xyz Monster': '超量怪兽',
  'Pendulum Normal Monster': '灵摆通常怪兽',
  'Pendulum Effect Monster': '灵摆效果怪兽',
  'Link Monster': '连接怪兽',
  'Spell Card': '魔法卡',
  'Trap Card': '陷阱卡',
  'Ritual Spell Card': '仪式魔法',
  'Continuous Spell Card': '永续魔法',
  'Equip Spell Card': '装备魔法',
  'Field Spell Card': '场地魔法',
  'Quick-Play Spell Card': '速攻魔法',
  'Normal Spell Card': '通常魔法',
  'Continuous Trap Card': '永续陷阱',
  'Counter Trap Card': '反击陷阱',
  'Normal Trap Card': '通常陷阱',
}

// 筛选选项
export const filterOptions = {
  // 卡片边框（怪兽类型）
  cardFrames: ['通常', '效果', '融合', '仪式', '同步', '超量', '灵摆', '连接', '魔法', '陷阱'],
  
  // 属性
  attributes: ['光', '暗', '水', '火', '地', '风', '神'],
  
  // 魔法陷阱种类
  spellTrapTypes: [
    '通常魔法', '场地魔法', '装备魔法', '永续魔法', '速攻魔法', '仪式魔法',
    '通常陷阱', '永续陷阱', '反击陷阱'
  ],
  
  // 种族
  races: [
    '魔法师族', '龙族', '不死族', '战士族', '兽战士族', '兽族', '鸟兽族', '机械族',
    '恶魔族', '天使族', '昆虫族', '恐龙族', '爬虫类族', '鱼族', '海龙族', '水族',
    '炎族', '雷族', '岩石族', '植物族', '念动力族', '幻龙族', '电子界族', '幻神兽族', '幻想魔族'
  ],
  
  // 等级/阶级
  levels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  
  // 能力·其他
  abilities: ['卡通', '二重', '同盟', '灵魂', '协调', '翻转', '特殊召唤'],
}

// 获取中文属性
export function getAttributeCN(attr: string | null): string {
  if (!attr) return ''
  return attributeMap[attr] || attr
}

// 获取中文种族
export function getRaceCN(race: string | null): string {
  if (!race) return ''
  return raceMap[race] || race
}

// 获取中文卡片类型
export function getCardTypeCN(type: string): string {
  // 先尝试完整匹配
  if (cardTypeMap[type]) return cardTypeMap[type]
  
  // 简化判断
  if (type.includes('Spell')) return '魔法'
  if (type.includes('Trap')) return '陷阱'
  if (type.includes('Link')) return '连接'
  if (type.includes('Xyz')) return '超量'
  if (type.includes('Synchro')) return '同步'
  if (type.includes('Fusion')) return '融合'
  if (type.includes('Ritual')) return '仪式'
  if (type.includes('Pendulum')) return '灵摆'
  if (type.includes('Normal') && type.includes('Monster')) return '通常'
  if (type.includes('Effect')) return '效果'
  
  return type
}

// 判断卡片边框类型
export function getCardFrame(type: string): string {
  if (type.includes('Spell')) return '魔法'
  if (type.includes('Trap')) return '陷阱'
  if (type.includes('Link')) return '连接'
  if (type.includes('Xyz')) return '超量'
  if (type.includes('Synchro')) return '同步'
  if (type.includes('Fusion')) return '融合'
  if (type.includes('Ritual') && type.includes('Monster')) return '仪式'
  if (type.includes('Pendulum')) return '灵摆'
  if (type.includes('Normal') && !type.includes('Spell') && !type.includes('Trap')) return '通常'
  return '效果'
}

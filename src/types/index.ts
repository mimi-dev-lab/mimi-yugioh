// 卡牌类型
export interface Card {
  id: number;
  name: string;          // 英文名
  name_cn: string;       // 中文名
  name_jp?: string;      // 日文名
  type: string;          // Spell Card, Trap Card, Monster Card 等
  desc: string;          // 英文描述
  desc_cn?: string;      // 中文描述
  atk: number | null;
  def: number | null;
  level: number | null;
  race: string;          // 种族/魔法陷阱类型
  attribute: string | null; // 属性
  image_path_cn: string;
  image_path_en: string;
  image_path_jp?: string;
}

// 卡牌筛选条件
export interface CardFilter {
  search?: string;
  frames?: string[];       // 卡片边框：通常、效果、融合等
  attributes?: string[];   // 属性：暗、光、地等
  spellTrapTypes?: string[]; // 魔法陷阱种类
  races?: string[];        // 种族
  levels?: number[];       // 等级/阶级
  atkMin?: number;
  atkMax?: number;
  defMin?: number;
  defMax?: number;
}

// 卡组中的卡
export interface DeckCard {
  name: string;          // 卡牌中文名
  count: number;         // 数量
  card?: Card;           // 关联的卡牌详情
}

// 连招
export interface Combo {
  name: string;
  steps: string[];
}

// 卡组
export interface Deck {
  id: string;
  name: string;
  category: '萌新' | '娱乐' | '硬核' | '竞技';
  description: string;
  source_url?: string;
  author?: string;
  main_deck: DeckCard[];
  extra_deck: DeckCard[];
  side_deck?: DeckCard[];
  combos?: Combo[];
  tips?: string[];
  collected_at: string;
  cover_image?: string;
}

// 分页
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// API 响应
export interface ApiResponse<T> {
  data: T;
  pagination?: Pagination;
  error?: string;
}

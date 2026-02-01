/**
 * 模块化卡组数据结构
 * 核心理念：本家轴 + 可选配合轴
 */

// 卡牌基础信息
export interface ArchetypeCard {
  id: number;
  name_cn: string;
  name_jp?: string;
  count: number;           // 推荐数量
  countRange?: [number, number];  // 可选范围，如 [1, 3]
  role: string;            // 在轴中的角色
  explanation: string;     // 作用说明
}

// 轴（Engine）- 最小模块单元
export interface Engine {
  id: string;
  name: string;
  type: 'home' | 'support';   // 本家轴 or 配合轴
  
  // 卡牌分类
  coreCards: ArchetypeCard[];      // 必带核心（固定）
  flexCards: ArchetypeCard[];      // 可调整（数量或取舍）
  extraDeckCards?: ArchetypeCard[]; // 额外卡组
  
  explanation: string;        // 这个轴的核心机制
  synergy?: string;           // 与本家轴的配合点（仅 support 轴）
  
  // 该轴独有的 combo（可选）
  combos?: EngineCombo[];
}

// 轴内 combo
export interface EngineCombo {
  id: string;
  name: string;
  startingCards: string[];    // 起手需要的卡名
  steps: ComboStep[];
  result: string;             // 展开结果
}

// Combo 步骤
export interface ComboStep {
  step: number;
  action: string;
  result: string;
  tip?: string;               // 操作提示
}

// 完整展开（跨轴）
export interface FullCombo {
  id: string;
  name: string;
  engines: string[];          // 依赖哪些轴 ["home", "primite"]
  difficulty: 'easy' | 'normal' | 'hard';
  
  startingHand: {
    required: string[];       // 必须有
    optional?: string[];      // 有更好
  };
  
  steps: ComboStep[];
  finalBoardId: string;       // 对应的最终盘面
  
  // 被打断指南
  interruptionGuide?: Record<string, string>;
}

// 最终盘面
export interface FinalBoard {
  id: string;
  name: string;
  
  // 场面状态
  field: {
    monsters: { name: string; position?: string; state?: string }[];
    spellTraps: { name: string; state?: string }[];
    hand?: number;            // 剩余手牌
  };
  
  // 妨害能力
  negates: number;
  negateDetails: string[];
  
  // 对手回合操作
  opponentTurnPlays?: string[];
}

// 构筑方案（本家 + 某配合轴的组合）
export interface Build {
  id: string;
  name: string;               // "黑魔导·原初构筑"
  engines: string[];          // ["home", "primite"]
  
  tier?: string;              // 强度评级
  difficulty: string;
  cost: string;
  
  // 评价
  pros: string[];
  cons: string[];
  
  // 该构筑的 combo 和盘面
  combos: FullCombo[];
  finalBoards: FinalBoard[];
  
  // 对策指南
  matchup?: {
    weaknesses: string[];
    handtrapTiming?: Record<string, { timing: string; effect: string }>;
  };
}

// 系列（Archetype）- 顶层结构
export interface Archetype {
  id: string;                 // "dark-magician"
  name: string;               // "黑魔导"
  name_en?: string;
  
  // 系列概述
  overview: {
    description: string;      // 简介
    playstyle: string;        // 玩法风格
    history?: string;         // 历史/背景
  };
  
  // 本家轴（固定）
  homeEngine: Engine;
  
  // 可选配合轴
  supportEngines: Engine[];
  
  // 不同构筑方案
  builds: Build[];
  
  // 泛用卡推荐（手坑等）
  staples?: {
    handtraps: ArchetypeCard[];
    boardBreakers?: ArchetypeCard[];
    protection?: ArchetypeCard[];
  };
}

// Combo 动画播放器类型定义

export type ZoneType = 
  | 'hand' 
  | 'deck' 
  | 'extra_deck'
  | 'graveyard' 
  | 'banished'
  | 'monster_1' | 'monster_2' | 'monster_3' | 'monster_4' | 'monster_5'
  | 'spell_trap_1' | 'spell_trap_2' | 'spell_trap_3' | 'spell_trap_4' | 'spell_trap_5'
  | 'extra_monster_left' | 'extra_monster_right'
  | 'field_zone';

export type ActionType = 
  | 'normal_summon'    // 通常召唤
  | 'special_summon'   // 特殊召唤
  | 'synchro_summon'   // 同调召唤
  | 'link_summon'      // 连接召唤
  | 'activate'         // 发动效果
  | 'set'              // 盖卡
  | 'search'           // 检索
  | 'send_to_gy'       // 送墓
  | 'revive'           // 苏生
  | 'return_to_deck'   // 回卡组
  | 'return_to_hand'   // 回手牌
  | 'banish';          // 除外

export interface CardState {
  id: number;
  name: string;
  zone: ZoneType;
  faceDown?: boolean;
  position?: 'attack' | 'defense';
}

export interface ComboAction {
  type: ActionType;
  cardId: number;
  cardName: string;
  from?: ZoneType;
  to?: ZoneType;
  materials?: number[];  // 同调/连接素材的卡片ID
  searchTarget?: number; // 检索目标
  description?: string;  // 动作描述
}

export interface ComboStep {
  step: number;
  title: string;
  actions: ComboAction[];
  description: string;
  resultDescription: string;
}

export interface AnimatedCombo {
  id: string;
  name: string;
  initialHand: number[];  // 起手卡片ID
  steps: ComboStep[];
}

// 场地位置坐标 (相对百分比)
export const ZONE_POSITIONS: Record<ZoneType, { x: number; y: number }> = {
  hand: { x: 50, y: 95 },
  deck: { x: 90, y: 65 },
  extra_deck: { x: 10, y: 65 },
  graveyard: { x: 90, y: 35 },
  banished: { x: 95, y: 50 },
  monster_1: { x: 20, y: 35 },
  monster_2: { x: 35, y: 35 },
  monster_3: { x: 50, y: 35 },
  monster_4: { x: 65, y: 35 },
  monster_5: { x: 80, y: 35 },
  spell_trap_1: { x: 20, y: 55 },
  spell_trap_2: { x: 35, y: 55 },
  spell_trap_3: { x: 50, y: 55 },
  spell_trap_4: { x: 65, y: 55 },
  spell_trap_5: { x: 80, y: 55 },
  extra_monster_left: { x: 35, y: 15 },
  extra_monster_right: { x: 65, y: 15 },
  field_zone: { x: 5, y: 55 },
};

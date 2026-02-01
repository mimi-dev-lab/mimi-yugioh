import type { AnimatedCombo } from './types';

// 卡片ID常量
const CARDS = {
  // 白森林
  ASTELLAR: 25592142,      // 阿斯特莉亚
  SILVY: 98385955,         // 希尔薇
  ELZETTE: 61980241,       // 里泽特
  RUCIA: 24779554,         // 露西亚
  RCIELA: 77313225,        // 露西埃拉 (6星同调)
  DIABELL: 14307929,       // 迪亚贝尔 (8星同调)
  SILVERA: 41924516,       // 西尔维亚 (6星同调)
  TALES: 99289828,         // 白森林的传说
  WOES: 62995268,          // 白森林的灾厄
  
  // 百夫长
  PRIMERA: 15005145,       // 普莉梅拉
  TRUDEA: 42493140,        // 特鲁迪娅
  AUXILA: 71858682,        // 阿克西拉 (12星同调)
  LEGATIA: 15982593,       // 勒加提亚 (12星同调)
  STAND_UP: 41371602,      // 起立吧！百夫长骑士！
  PHALANX: 40155014,       // 骑士魔防阵
  
  // 泛用
  BARONNE: 84815190,       // 鲜花女爵
  STARDUST_CHARGE: 64880894, // 星尘充能战士
  IP_MASQUERENA: 65741786, // IP莱娜
  
  // 手坑 (作为Cost)
  ASH: 14558127,
  MAXX_C: 23434538,
  IMPERM: 10045474,
};

export const whiteForestCombo: AnimatedCombo = {
  id: 'white-forest-combo-1',
  name: '阿斯特莉亚+Cost 标准展开',
  initialHand: [CARDS.ASTELLAR, CARDS.TALES, CARDS.ASH, CARDS.MAXX_C, CARDS.IMPERM],
  steps: [
    {
      step: 1,
      title: '通召阿斯特莉亚，特召希尔薇',
      description: '通召《阿斯特莉亚》，Cost《白森林的传说》，从卡组特召《希尔薇》',
      resultDescription: '场上：阿斯特莉亚 + 希尔薇',
      actions: [
        { type: 'normal_summon', cardId: CARDS.ASTELLAR, cardName: '阿斯特莉亚', from: 'hand', to: 'monster_3' },
        { type: 'send_to_gy', cardId: CARDS.TALES, cardName: '白森林的传说', from: 'hand', to: 'graveyard', description: 'Cost' },
        { type: 'activate', cardId: CARDS.ASTELLAR, cardName: '阿斯特莉亚', description: '效果发动' },
        { type: 'special_summon', cardId: CARDS.SILVY, cardName: '希尔薇', from: 'deck', to: 'monster_2' },
        { type: 'activate', cardId: CARDS.SILVY, cardName: '希尔薇', description: '检索效果' },
        { type: 'search', cardId: CARDS.TALES, cardName: '白森林的传说', from: 'deck', to: 'hand' },
      ]
    },
    {
      step: 2,
      title: '同调露西埃拉，检索灾厄',
      description: '同调召唤《露西埃拉》(2+4=6星)，发动效果检索《白森林的灾厄》',
      resultDescription: '场上：露西埃拉 + 阿斯特莉亚（苏生）',
      actions: [
        { type: 'synchro_summon', cardId: CARDS.RCIELA, cardName: '露西埃拉', from: 'extra_deck', to: 'monster_3', materials: [CARDS.ASTELLAR, CARDS.SILVY] },
        { type: 'send_to_gy', cardId: CARDS.ASTELLAR, cardName: '阿斯特莉亚', from: 'monster_3', to: 'graveyard', description: '同调素材' },
        { type: 'send_to_gy', cardId: CARDS.SILVY, cardName: '希尔薇', from: 'monster_2', to: 'graveyard', description: '同调素材' },
        { type: 'activate', cardId: CARDS.RCIELA, cardName: '露西埃拉', description: '效果发动' },
        { type: 'send_to_gy', cardId: CARDS.TALES, cardName: '白森林的传说', from: 'hand', to: 'graveyard', description: 'Cost' },
        { type: 'search', cardId: CARDS.WOES, cardName: '白森林的灾厄', from: 'deck', to: 'hand' },
        { type: 'set', cardId: CARDS.TALES, cardName: '白森林的传说', from: 'graveyard', to: 'spell_trap_3', description: '墓地效果盖回' },
        { type: 'revive', cardId: CARDS.ASTELLAR, cardName: '阿斯特莉亚', from: 'graveyard', to: 'monster_2', description: '墓地效果苏生' },
      ]
    },
    {
      step: 3,
      title: '同调迪亚贝尔，回收传说',
      description: '发动盖卡《传说》检索《里泽特》，同调《迪亚贝尔》(2+6=8星)',
      resultDescription: '场上：迪亚贝尔',
      actions: [
        { type: 'activate', cardId: CARDS.TALES, cardName: '白森林的传说', from: 'spell_trap_3', description: '发动' },
        { type: 'search', cardId: CARDS.ELZETTE, cardName: '里泽特', from: 'deck', to: 'hand' },
        { type: 'synchro_summon', cardId: CARDS.DIABELL, cardName: '迪亚贝尔', from: 'extra_deck', to: 'monster_3', materials: [CARDS.RCIELA, CARDS.ASTELLAR] },
        { type: 'send_to_gy', cardId: CARDS.RCIELA, cardName: '露西埃拉', from: 'monster_3', to: 'graveyard', description: '同调素材' },
        { type: 'send_to_gy', cardId: CARDS.ASTELLAR, cardName: '阿斯特莉亚', from: 'monster_2', to: 'graveyard', description: '同调素材' },
        { type: 'activate', cardId: CARDS.DIABELL, cardName: '迪亚贝尔', description: '效果发动' },
        { type: 'return_to_hand', cardId: CARDS.TALES, cardName: '白森林的传说', from: 'graveyard', to: 'hand', description: '回收' },
      ]
    },
    {
      step: 4,
      title: '同调阿克西拉，检索场地',
      description: '希尔薇墓地效果弹回露西埃拉特召自身，同调《阿克西拉》(8+4=12星)',
      resultDescription: '场上：阿克西拉 + 场地魔法',
      actions: [
        { type: 'activate', cardId: CARDS.SILVY, cardName: '希尔薇', from: 'graveyard', description: '墓地效果' },
        { type: 'return_to_deck', cardId: CARDS.RCIELA, cardName: '露西埃拉', from: 'graveyard', to: 'extra_deck' },
        { type: 'special_summon', cardId: CARDS.SILVY, cardName: '希尔薇', from: 'graveyard', to: 'monster_2' },
        { type: 'synchro_summon', cardId: CARDS.AUXILA, cardName: '阿克西拉', from: 'extra_deck', to: 'monster_3', materials: [CARDS.DIABELL, CARDS.SILVY] },
        { type: 'send_to_gy', cardId: CARDS.DIABELL, cardName: '迪亚贝尔', from: 'monster_3', to: 'graveyard', description: '同调素材' },
        { type: 'send_to_gy', cardId: CARDS.SILVY, cardName: '希尔薇', from: 'monster_2', to: 'graveyard', description: '同调素材' },
        { type: 'activate', cardId: CARDS.AUXILA, cardName: '阿克西拉', description: '效果发动' },
        { type: 'search', cardId: CARDS.STAND_UP, cardName: '起立吧！百夫长骑士！', from: 'deck', to: 'field_zone' },
      ]
    },
    {
      step: 5,
      title: '里泽特+露西亚展开',
      description: '手牌《里泽特》Cost《灾厄》特召自身，检索《露西亚》并特召',
      resultDescription: '场上：阿克西拉 + 里泽特 + 露西亚',
      actions: [
        { type: 'send_to_gy', cardId: CARDS.WOES, cardName: '白森林的灾厄', from: 'hand', to: 'graveyard', description: 'Cost' },
        { type: 'special_summon', cardId: CARDS.ELZETTE, cardName: '里泽特', from: 'hand', to: 'monster_2' },
        { type: 'activate', cardId: CARDS.ELZETTE, cardName: '里泽特', description: '检索效果' },
        { type: 'search', cardId: CARDS.RUCIA, cardName: '露西亚', from: 'deck', to: 'hand' },
        { type: 'set', cardId: CARDS.WOES, cardName: '白森林的灾厄', from: 'graveyard', to: 'spell_trap_1', description: '墓地效果盖回' },
        { type: 'special_summon', cardId: CARDS.RUCIA, cardName: '露西亚', from: 'hand', to: 'monster_4', description: '自身效果特召' },
      ]
    },
    {
      step: 6,
      title: '同调星尘充能，发动场地',
      description: '同调《星尘充能战士》抽1卡，发动场地放置《普莉梅拉》',
      resultDescription: '场上：阿克西拉 + 星尘充能 + 普莉梅拉',
      actions: [
        { type: 'synchro_summon', cardId: CARDS.STARDUST_CHARGE, cardName: '星尘充能战士', from: 'extra_deck', to: 'monster_2', materials: [CARDS.ELZETTE, CARDS.RUCIA] },
        { type: 'send_to_gy', cardId: CARDS.ELZETTE, cardName: '里泽特', from: 'monster_2', to: 'graveyard', description: '同调素材' },
        { type: 'send_to_gy', cardId: CARDS.RUCIA, cardName: '露西亚', from: 'monster_4', to: 'graveyard', description: '同调素材' },
        { type: 'activate', cardId: CARDS.STARDUST_CHARGE, cardName: '星尘充能战士', description: '抽1卡' },
        { type: 'activate', cardId: CARDS.STAND_UP, cardName: '起立吧！百夫长骑士！', from: 'field_zone', description: '场地效果' },
        { type: 'set', cardId: CARDS.PRIMERA, cardName: '普莉梅拉', from: 'deck', to: 'spell_trap_2', description: '放置为永续陷阱' },
        { type: 'special_summon', cardId: CARDS.PRIMERA, cardName: '普莉梅拉', from: 'spell_trap_2', to: 'monster_4', description: '自身效果特召' },
        { type: 'activate', cardId: CARDS.PRIMERA, cardName: '普莉梅拉', description: '检索效果' },
        { type: 'search', cardId: CARDS.PHALANX, cardName: '骑士魔防阵', from: 'deck', to: 'hand' },
      ]
    },
    {
      step: 7,
      title: '同调鲜花女爵，连接IP莱娜',
      description: '同调《鲜花女爵》(6+4=10星)，露西亚弹回迪亚贝尔特召，连接《IP莱娜》',
      resultDescription: '场上：鲜花女爵 + IP莱娜',
      actions: [
        { type: 'synchro_summon', cardId: CARDS.BARONNE, cardName: '鲜花女爵', from: 'extra_deck', to: 'monster_2', materials: [CARDS.STARDUST_CHARGE, CARDS.PRIMERA] },
        { type: 'send_to_gy', cardId: CARDS.STARDUST_CHARGE, cardName: '星尘充能战士', from: 'monster_2', to: 'graveyard', description: '同调素材' },
        { type: 'send_to_gy', cardId: CARDS.PRIMERA, cardName: '普莉梅拉', from: 'monster_4', to: 'graveyard', description: '同调素材' },
        { type: 'activate', cardId: CARDS.RUCIA, cardName: '露西亚', from: 'graveyard', description: '墓地效果' },
        { type: 'return_to_deck', cardId: CARDS.DIABELL, cardName: '迪亚贝尔', from: 'graveyard', to: 'extra_deck' },
        { type: 'special_summon', cardId: CARDS.RUCIA, cardName: '露西亚', from: 'graveyard', to: 'monster_4' },
        { type: 'link_summon', cardId: CARDS.IP_MASQUERENA, cardName: 'IP莱娜', from: 'extra_deck', to: 'extra_monster_left', materials: [CARDS.RUCIA, CARDS.AUXILA] },
        { type: 'send_to_gy', cardId: CARDS.RUCIA, cardName: '露西亚', from: 'monster_4', to: 'graveyard', description: '连接素材' },
        { type: 'send_to_gy', cardId: CARDS.AUXILA, cardName: '阿克西拉', from: 'monster_3', to: 'graveyard', description: '连接素材' },
      ]
    },
    {
      step: 8,
      title: '苏生阿克西拉，回合结束放置',
      description: '除外《骑士魔防阵》苏生《阿克西拉》，结束阶段放置《普莉梅拉》',
      resultDescription: '终场：鲜花 + IP莱娜 + 阿克西拉 + 盖卡灾厄 + 永续普莉梅拉',
      actions: [
        { type: 'banish', cardId: CARDS.PHALANX, cardName: '骑士魔防阵', from: 'hand', to: 'banished', description: '墓地效果Cost' },
        { type: 'revive', cardId: CARDS.AUXILA, cardName: '阿克西拉', from: 'graveyard', to: 'monster_3' },
        { type: 'set', cardId: CARDS.PRIMERA, cardName: '普莉梅拉', from: 'graveyard', to: 'spell_trap_2', description: '结束阶段放置' },
      ]
    },
  ]
};

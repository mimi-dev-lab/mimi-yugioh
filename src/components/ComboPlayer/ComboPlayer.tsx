import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AnimatedCombo, CardState, ZoneType, ComboAction } from './types';
import styles from './ComboPlayer.module.css';

interface ComboPlayerProps {
  combo: AnimatedCombo;
  cardNames?: Record<number, string>;
}

const getCardImageUrl = (cardId: number) => 
  `https://images.ygoprodeck.com/images/cards_small/${cardId}.jpg`;

export function ComboPlayer({ combo }: ComboPlayerProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cards, setCards] = useState<CardState[]>([]);
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [effectText, setEffectText] = useState<string>('');

  // 初始化手牌
  useEffect(() => {
    const initialCards: CardState[] = combo.initialHand.map((id) => ({
      id,
      name: '',
      zone: 'hand' as ZoneType,
    }));
    setCards(initialCards);
    setCurrentStep(0);
  }, [combo]);

  // 执行单个动作
  const executeAction = useCallback((action: ComboAction) => {
    setActiveCard(action.cardId);
    setEffectText(action.description || action.type);

    setCards(prev => {
      const newCards = [...prev];
      
      switch (action.type) {
        case 'normal_summon':
        case 'special_summon':
        case 'synchro_summon':
        case 'link_summon':
        case 'revive': {
          // 检查卡片是否已存在
          const existingIndex = newCards.findIndex(c => c.id === action.cardId);
          if (existingIndex >= 0) {
            newCards[existingIndex].zone = action.to!;
          } else {
            newCards.push({
              id: action.cardId,
              name: action.cardName,
              zone: action.to!,
            });
          }
          // 如果是同调/连接，移除素材
          if (action.materials) {
            action.materials.forEach(matId => {
              const matIndex = newCards.findIndex(c => c.id === matId && c.zone !== 'graveyard' && c.zone !== 'extra_deck');
              if (matIndex >= 0) {
                newCards[matIndex].zone = 'graveyard';
              }
            });
          }
          break;
        }
        case 'send_to_gy': {
          const idx = newCards.findIndex(c => c.id === action.cardId && c.zone !== 'graveyard');
          if (idx >= 0) {
            newCards[idx].zone = 'graveyard';
          }
          break;
        }
        case 'search':
        case 'return_to_hand': {
          const existingIndex = newCards.findIndex(c => c.id === action.cardId);
          if (existingIndex >= 0) {
            newCards[existingIndex].zone = 'hand';
          } else {
            newCards.push({
              id: action.cardId,
              name: action.cardName,
              zone: 'hand',
            });
          }
          break;
        }
        case 'set': {
          const existingIndex = newCards.findIndex(c => c.id === action.cardId);
          if (existingIndex >= 0) {
            newCards[existingIndex].zone = action.to!;
            newCards[existingIndex].faceDown = true;
          } else {
            newCards.push({
              id: action.cardId,
              name: action.cardName,
              zone: action.to!,
              faceDown: true,
            });
          }
          break;
        }
        case 'return_to_deck': {
          const idx = newCards.findIndex(c => c.id === action.cardId);
          if (idx >= 0) {
            // 返回卡组/额外卡组的卡片移除显示
            newCards.splice(idx, 1);
          }
          break;
        }
        case 'banish': {
          const idx = newCards.findIndex(c => c.id === action.cardId);
          if (idx >= 0) {
            newCards[idx].zone = 'banished';
          }
          break;
        }
        case 'activate': {
          // 只高亮，不移动
          break;
        }
      }
      
      return newCards;
    });

    // 清除高亮
    setTimeout(() => {
      setActiveCard(null);
      setEffectText('');
    }, 800);
  }, []);

  // 播放当前步骤
  const playStep = useCallback(async (stepIndex: number) => {
    const step = combo.steps[stepIndex];
    if (!step) return;

    for (let i = 0; i < step.actions.length; i++) {
      executeAction(step.actions[i]);
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  }, [combo, executeAction]);

  // 自动播放
  useEffect(() => {
    if (!isPlaying) return;
    
    const timer = setTimeout(async () => {
      if (currentStep < combo.steps.length) {
        await playStep(currentStep);
        setCurrentStep(prev => prev + 1);
      } else {
        setIsPlaying(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, combo, playStep]);

  // 控制函数
  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStep(0);
    const initialCards: CardState[] = combo.initialHand.map((id) => ({
      id,
      name: '',
      zone: 'hand' as ZoneType,
    }));
    setCards(initialCards);
  };
  const handleNextStep = async () => {
    if (currentStep < combo.steps.length) {
      await playStep(currentStep);
      setCurrentStep(prev => prev + 1);
    }
  };
  const handlePrevStep = () => {
    if (currentStep > 0) {
      // 简化：重置到开始，然后播放到前一步
      handleReset();
      // TODO: 实现更精细的回退
    }
  };

  // 获取某区域的卡片
  const getCardsInZone = (zone: ZoneType) => 
    cards.filter(c => c.zone === zone);

  const step = combo.steps[currentStep - 1];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>🎬 {combo.name}</h3>
        <div className={styles.stepIndicator}>
          Step {currentStep} / {combo.steps.length}
        </div>
      </div>

      {/* 场地区域 */}
      <div className={styles.field}>
        {/* 效果文字 */}
        <AnimatePresence>
          {effectText && (
            <motion.div
              className={styles.effectText}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {effectText}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 额外怪兽区 */}
        <div className={styles.extraMonsterZone}>
          <div className={styles.zoneSlot} data-zone="extra_monster_left">
            {getCardsInZone('extra_monster_left').map(card => (
              <CardComponent key={card.id} card={card} isActive={activeCard === card.id} />
            ))}
          </div>
          <div className={styles.zoneSlot} data-zone="extra_monster_right">
            {getCardsInZone('extra_monster_right').map(card => (
              <CardComponent key={card.id} card={card} isActive={activeCard === card.id} />
            ))}
          </div>
        </div>

        {/* 怪兽区 */}
        <div className={styles.monsterZone}>
          {[1,2,3,4,5].map(i => (
            <div key={i} className={styles.zoneSlot} data-zone={`monster_${i}`}>
              {getCardsInZone(`monster_${i}` as ZoneType).map(card => (
                <CardComponent key={card.id} card={card} isActive={activeCard === card.id} />
              ))}
            </div>
          ))}
        </div>

        {/* 魔陷区 */}
        <div className={styles.spellTrapZone}>
          <div className={styles.fieldZoneSlot}>
            {getCardsInZone('field_zone').map(card => (
              <CardComponent key={card.id} card={card} isActive={activeCard === card.id} />
            ))}
          </div>
          {[1,2,3,4,5].map(i => (
            <div key={i} className={styles.zoneSlot} data-zone={`spell_trap_${i}`}>
              {getCardsInZone(`spell_trap_${i}` as ZoneType).map(card => (
                <CardComponent key={card.id} card={card} isActive={activeCard === card.id} />
              ))}
            </div>
          ))}
        </div>

        {/* 墓地/除外/卡组 */}
        <div className={styles.sideZones}>
          <div className={styles.deckArea}>
            <div className={styles.deckLabel}>卡组</div>
          </div>
          <div className={styles.graveyardArea}>
            <div className={styles.deckLabel}>墓地 ({getCardsInZone('graveyard').length})</div>
          </div>
        </div>

        {/* 手牌区 */}
        <div className={styles.handZone}>
          {getCardsInZone('hand').map((card, i) => (
            <CardComponent 
              key={card.id} 
              card={card} 
              isActive={activeCard === card.id}
              style={{ marginLeft: i > 0 ? '-20px' : 0 }}
            />
          ))}
        </div>
      </div>

      {/* 步骤说明 */}
      <div className={styles.stepInfo}>
        {step ? (
          <>
            <div className={styles.stepTitle}>{step.title}</div>
            <div className={styles.stepDesc}>{step.description}</div>
            <div className={styles.stepResult}>→ {step.resultDescription}</div>
          </>
        ) : currentStep === 0 ? (
          <div className={styles.stepTitle}>准备开始...</div>
        ) : (
          <div className={styles.stepTitle}>🎉 展开完成！</div>
        )}
      </div>

      {/* 控制栏 */}
      <div className={styles.controls}>
        <button onClick={handleReset} className={styles.controlBtn}>⏮ 重置</button>
        <button onClick={handlePrevStep} className={styles.controlBtn} disabled={currentStep === 0}>◀ 上一步</button>
        {isPlaying ? (
          <button onClick={handlePause} className={styles.controlBtn}>⏸ 暂停</button>
        ) : (
          <button onClick={handlePlay} className={styles.controlBtn}>▶ 播放</button>
        )}
        <button onClick={handleNextStep} className={styles.controlBtn} disabled={currentStep >= combo.steps.length}>下一步 ▶</button>
      </div>
    </div>
  );
}

// 卡片组件
function CardComponent({ 
  card, 
  isActive, 
  style 
}: { 
  card: CardState; 
  isActive: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={`${styles.card} ${isActive ? styles.cardActive : ''} ${card.faceDown ? styles.cardFaceDown : ''}`}
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      style={style}
    >
      {card.faceDown ? (
        <div className={styles.cardBack} />
      ) : (
        <img 
          src={getCardImageUrl(card.id)} 
          alt={card.name}
          className={styles.cardImage}
        />
      )}
      {isActive && (
        <motion.div 
          className={styles.cardGlow}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

export default ComboPlayer;

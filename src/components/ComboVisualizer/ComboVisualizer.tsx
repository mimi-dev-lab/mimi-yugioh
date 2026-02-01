import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import type { AnimatedCombo } from '../ComboPlayer/types';
import styles from './ComboVisualizer.module.css';

interface ComboVisualizerProps {
  combo: AnimatedCombo;
}

const getCardImageUrl = (cardId: number) =>
  `https://images.ygoprodeck.com/images/cards_small/${cardId}.jpg`;

// 从动作类型获取图标和颜色
const getActionStyle = (type: string) => {
  const styles: Record<string, { icon: string; color: string; label: string }> = {
    normal_summon: { icon: '📤', color: '#22c55e', label: '通召' },
    special_summon: { icon: '⚡', color: '#eab308', label: '特召' },
    synchro_summon: { icon: '🌀', color: '#8b5cf6', label: '同调' },
    link_summon: { icon: '🔗', color: '#3b82f6', label: '连接' },
    activate: { icon: '✨', color: '#f59e0b', label: '发动' },
    search: { icon: '🔍', color: '#06b6d4', label: '检索' },
    set: { icon: '⬇️', color: '#6b7280', label: '盖卡' },
    send_to_gy: { icon: '💀', color: '#ef4444', label: '送墓' },
    revive: { icon: '💫', color: '#10b981', label: '苏生' },
  };
  return styles[type] || { icon: '▶', color: '#9ca3af', label: type };
};

// 获取步骤的主要动作（用于流程图显示）
const getMainAction = (step: AnimatedCombo['steps'][0]) => {
  // 优先显示召唤类动作
  const summonAction = step.actions.find(a => 
    ['synchro_summon', 'link_summon', 'normal_summon', 'special_summon'].includes(a.type)
  );
  if (summonAction) return summonAction;
  return step.actions[0];
};

export function ComboVisualizer({ combo }: ComboVisualizerProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 点击流程图节点
  const handleNodeClick = (index: number) => {
    setCurrentStep(index);
    // 滚动到对应分镜
    if (scrollRef.current) {
      const cardWidth = 320;
      scrollRef.current.scrollTo({
        left: index * cardWidth,
        behavior: 'smooth'
      });
    }
  };

  // 监听滚动更新当前步骤
  const handleScroll = () => {
    if (scrollRef.current) {
      const scrollLeft = scrollRef.current.scrollLeft;
      const cardWidth = 320;
      const newStep = Math.round(scrollLeft / cardWidth);
      if (newStep !== currentStep && newStep >= 0 && newStep < combo.steps.length) {
        setCurrentStep(newStep);
      }
    }
  };

  return (
    <div className={styles.container}>
      {/* 流程图总览 */}
      <div className={styles.flowChart}>
        <div className={styles.flowTitle}>
          <span>🗺️ 展开路线图</span>
          <span className={styles.stepCount}>{combo.steps.length} 步</span>
        </div>
        
        <div className={styles.flowNodes}>
          {/* 起点：手牌 */}
          <div className={styles.startNode}>
            <div className={styles.startIcon}>🎴</div>
            <div className={styles.startLabel}>起手</div>
          </div>
          
          <div className={styles.flowArrow}>→</div>

          {combo.steps.map((step, index) => {
            const mainAction = getMainAction(step);
            const actionStyle = getActionStyle(mainAction.type);
            const isActive = currentStep === index;

            return (
              <div key={index} className={styles.nodeWrapper}>
                <motion.div
                  className={`${styles.flowNode} ${isActive ? styles.nodeActive : ''}`}
                  onClick={() => handleNodeClick(index)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{ 
                    borderColor: isActive ? actionStyle.color : 'transparent',
                    boxShadow: isActive ? `0 0 20px ${actionStyle.color}40` : 'none'
                  }}
                >
                  <div className={styles.nodeStep}>{index + 1}</div>
                  <div className={styles.nodeIcon}>{actionStyle.icon}</div>
                  <div className={styles.nodeLabel} style={{ color: actionStyle.color }}>
                    {actionStyle.label}
                  </div>
                  <div className={styles.nodeCard}>
                    {mainAction.cardName.length > 6 
                      ? mainAction.cardName.slice(0, 6) + '...' 
                      : mainAction.cardName}
                  </div>
                </motion.div>
                
                {index < combo.steps.length - 1 && (
                  <div className={styles.flowArrow}>→</div>
                )}
              </div>
            );
          })}

          {/* 终点 */}
          <div className={styles.flowArrow}>→</div>
          <div className={styles.endNode}>
            <div className={styles.endIcon}>🏆</div>
            <div className={styles.endLabel}>终场</div>
          </div>
        </div>
      </div>

      {/* 分镜滑动区 */}
      <div className={styles.storyboard}>
        <div className={styles.storyTitle}>
          <span>📖 详细步骤</span>
          <span className={styles.swipeHint}>← 左右滑动 →</span>
        </div>

        <div 
          className={styles.storyScroll} 
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {combo.steps.map((step, index) => {
            const mainAction = getMainAction(step);
            const actionStyle = getActionStyle(mainAction.type);

            return (
              <motion.div
                key={index}
                className={`${styles.storyCard} ${currentStep === index ? styles.cardActive : ''}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                {/* 卡片头部 */}
                <div className={styles.cardHeader} style={{ background: `linear-gradient(135deg, ${actionStyle.color}20, transparent)` }}>
                  <div className={styles.cardStep}>
                    <span className={styles.stepNumber}>{index + 1}</span>
                    <span className={styles.stepTotal}>/ {combo.steps.length}</span>
                  </div>
                  <div className={styles.cardAction} style={{ color: actionStyle.color }}>
                    {actionStyle.icon} {actionStyle.label}
                  </div>
                </div>

                {/* 主要卡图 */}
                <div className={styles.cardVisual}>
                  <img 
                    src={getCardImageUrl(mainAction.cardId)} 
                    alt={mainAction.cardName}
                    className={styles.mainCardImage}
                  />
                  {/* 如果是同调，显示素材 */}
                  {mainAction.materials && mainAction.materials.length > 0 && (
                    <div className={styles.materials}>
                      {mainAction.materials.map((matId, i) => (
                        <img 
                          key={i}
                          src={getCardImageUrl(matId)}
                          alt="素材"
                          className={styles.materialImage}
                        />
                      ))}
                      <div className={styles.materialArrow}>→</div>
                    </div>
                  )}
                </div>

                {/* 标题和描述 */}
                <div className={styles.cardContent}>
                  <h4 className={styles.cardTitle}>{step.title}</h4>
                  <p className={styles.cardDesc}>{step.description}</p>
                </div>

                {/* 结果 */}
                <div className={styles.cardResult}>
                  <span className={styles.resultIcon}>→</span>
                  <span>{step.resultDescription}</span>
                </div>

                {/* 涉及的所有动作 */}
                <div className={styles.actionList}>
                  {step.actions.slice(0, 4).map((action, i) => {
                    const style = getActionStyle(action.type);
                    return (
                      <span key={i} className={styles.actionTag} style={{ borderColor: style.color }}>
                        {style.icon} {action.cardName.slice(0, 4)}
                      </span>
                    );
                  })}
                  {step.actions.length > 4 && (
                    <span className={styles.moreActions}>+{step.actions.length - 4}</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* 进度指示器 */}
        <div className={styles.progressDots}>
          {combo.steps.map((_, index) => (
            <button
              key={index}
              className={`${styles.dot} ${currentStep === index ? styles.dotActive : ''}`}
              onClick={() => handleNodeClick(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ComboVisualizer;

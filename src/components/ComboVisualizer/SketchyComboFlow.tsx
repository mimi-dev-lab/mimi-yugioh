import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import rough from 'roughjs';
import { useCardNameMap } from '../../hooks/useCardNameMap';
import styles from './SketchyComboFlow.module.css';

// 实际 JSON 数据格式
interface ComboStep {
  card: string;
  action: string;
  level?: number;
  from?: string[];
  searchTarget?: string;
  reviveTarget?: string;
  note?: string;
  branch?: string;
}

interface FinalBoard {
  monsters: string[];
  spellTrap: string[];
  disruptions: number;
}

interface ComboData {
  name: string;
  startingHand: string[];
  steps: ComboStep[];
  finalBoard: FinalBoard;
}

interface SketchyComboFlowProps {
  combo: ComboData;
}

const getCardImageUrl = (cardId: number) =>
  `https://images.ygoprodeck.com/images/cards_small/${cardId}.jpg`;

const getCardImageUrlLarge = (cardId: number) =>
  `https://images.ygoprodeck.com/images/cards/${cardId}.jpg`;

// 动作类型配色
const actionColors: Record<string, { bg: string; border: string; label: string }> = {
  '通常召唤': { bg: '#b2f2bb', border: '#2f9e44', label: '通召' },
  '特殊召唤': { bg: '#a5d8ff', border: '#1971c2', label: '特召' },
  '同调召唤': { bg: '#d0bfff', border: '#7950f2', label: '同调' },
  '连接召唤': { bg: '#a5d8ff', border: '#1971c2', label: '连接' },
  'XYZ召唤': { bg: '#1e1e1e', border: '#ffd43b', label: 'XYZ' },
  '检索': { bg: '#99e9f2', border: '#0c8599', label: '检索' },
  '盖卡': { bg: '#dee2e6', border: '#495057', label: '盖卡' },
  '送墓': { bg: '#ffc9c9', border: '#e03131', label: '送墓' },
  '苏生': { bg: '#b2f2bb', border: '#2f9e44', label: '苏生' },
};

const getActionStyle = (action: string) => {
  // 尝试精确匹配
  if (actionColors[action]) return actionColors[action];
  // 尝试模糊匹配
  for (const [key, style] of Object.entries(actionColors)) {
    if (action.includes(key) || key.includes(action)) return style;
  }
  return { bg: '#f1f3f5', border: '#868e96', label: action };
};

// 手绘箭头 SVG 组件
function SketchyArrow({ direction = 'right' }: { direction?: 'right' | 'down' }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    svgRef.current.innerHTML = '';

    const rc = rough.svg(svgRef.current);
    
    if (direction === 'right') {
      const line = rc.line(5, 15, 35, 15, { stroke: '#495057', strokeWidth: 2, roughness: 1.5 });
      const head1 = rc.line(35, 15, 28, 10, { stroke: '#495057', strokeWidth: 2, roughness: 1 });
      const head2 = rc.line(35, 15, 28, 20, { stroke: '#495057', strokeWidth: 2, roughness: 1 });
      svgRef.current.appendChild(line);
      svgRef.current.appendChild(head1);
      svgRef.current.appendChild(head2);
    } else {
      const line = rc.line(15, 5, 15, 25, { stroke: '#495057', strokeWidth: 2, roughness: 1.5 });
      const head1 = rc.line(15, 25, 10, 18, { stroke: '#495057', strokeWidth: 2, roughness: 1 });
      const head2 = rc.line(15, 25, 20, 18, { stroke: '#495057', strokeWidth: 2, roughness: 1 });
      svgRef.current.appendChild(line);
      svgRef.current.appendChild(head1);
      svgRef.current.appendChild(head2);
    }
  }, [direction]);

  return (
    <svg 
      ref={svgRef} 
      className={direction === 'right' ? styles.arrowRight : styles.arrowDown}
      width={direction === 'right' ? 40 : 30}
      height={direction === 'right' ? 30 : 30}
    />
  );
}

// 手绘边框卡片 - 优化版：只在首次渲染时生成 SVG
function SketchyCard({ 
  step,
  index,
  isActive,
  onClick,
  onHover,
  cardId,
}: { 
  step: ComboStep;
  index: number;
  isActive: boolean;
  onClick: () => void;
  onHover: (hover: boolean) => void;
  cardId?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const actionStyle = getActionStyle(step.action);
  const initializedRef = useRef(false);

  // 只在首次渲染时生成 SVG，不随 isActive 变化重绘
  useEffect(() => {
    if (!svgRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const rc = rough.svg(svgRef.current);
    const rect = rc.rectangle(3, 3, 114, 154, {
      stroke: actionStyle.border,
      strokeWidth: 2,
      roughness: 1.2,
      fill: actionStyle.bg,
      fillStyle: 'hachure',
      hachureGap: 6,
      fillWeight: 1,
    });
    svgRef.current.appendChild(rect);
  }, [actionStyle]);

  return (
    <div
      className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <svg ref={svgRef} className={styles.cardBorder} />
      
      <div className={styles.cardInner}>
        {/* 步骤编号 */}
        <div className={styles.stepBadge} style={{ backgroundColor: actionStyle.border }}>
          {index + 1}
        </div>

        {/* 卡图 */}
        <div className={styles.cardImageWrapper}>
          {cardId ? (
            <img
              src={getCardImageUrl(cardId)}
              alt={step.card}
              className={styles.cardImage}
              loading="lazy"
            />
          ) : (
            <div className={styles.cardPlaceholder}>
              <span>🎴</span>
            </div>
          )}
        </div>

        {/* 动作标签 */}
        <div className={styles.actionLabel} style={{ backgroundColor: actionStyle.border }}>
          {actionStyle.label}
        </div>

        {/* 卡名 */}
        <div className={styles.cardName}>
          {step.card.length > 8 
            ? step.card.slice(0, 8) + '...' 
            : step.card}
        </div>
      </div>
    </div>
  );
}

// 详情面板
function DetailPanel({ step, onClose, cardId }: { step: ComboStep | null; onClose: () => void; cardId?: number }) {
  const actionStyle = step ? getActionStyle(step.action) : null;

  return (
    <AnimatePresence>
      {step && actionStyle && (
        <motion.div
          className={styles.detailPanel}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
        >
          <button className={styles.closeBtn} onClick={onClose}>×</button>
          
          <div className={styles.detailHeader} style={{ borderColor: actionStyle.border }}>
            {cardId ? (
              <img
                src={getCardImageUrlLarge(cardId)}
                alt={step.card}
                className={styles.detailImage}
              />
            ) : (
              <div className={styles.detailPlaceholder}>
                <span>🎴</span>
                <span>{step.card}</span>
              </div>
            )}
          </div>

          <div className={styles.detailContent}>
            <h3 className={styles.detailTitle}>{step.card}</h3>
            <span className={styles.detailAction} style={{ backgroundColor: actionStyle.border }}>
              {actionStyle.label}
            </span>
            
            {step.note && (
              <p className={styles.detailDesc}>{step.note}</p>
            )}

            {/* 素材卡 */}
            {step.from && step.from.length > 0 && (
              <div className={styles.materials}>
                <span className={styles.materialsLabel}>素材：</span>
                <div className={styles.materialNames}>
                  {step.from.map((name, i) => (
                    <span key={i} className={styles.materialName}>{name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 检索目标 */}
            {step.searchTarget && (
              <div className={styles.result}>
                <span className={styles.resultArrow}>🔍</span>
                检索：{step.searchTarget}
              </div>
            )}

            {/* 苏生目标 */}
            {step.reviveTarget && (
              <div className={styles.result}>
                <span className={styles.resultArrow}>💫</span>
                苏生：{step.reviveTarget}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SketchyComboFlow({ combo }: SketchyComboFlowProps) {
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const titleRef = useRef<SVGSVGElement>(null);
  
  // 加载卡名映射
  const { getCardId } = useCardNameMap();

  // 手绘标题下划线
  useEffect(() => {
    if (!titleRef.current) return;
    titleRef.current.innerHTML = '';
    
    const rc = rough.svg(titleRef.current);
    const line = rc.line(0, 5, 280, 5, { 
      stroke: '#fab005', 
      strokeWidth: 3, 
      roughness: 2 
    });
    titleRef.current.appendChild(line);
  }, []);

  // 按行分组（每行4个）
  const rows: ComboStep[][] = [];
  for (let i = 0; i < combo.steps.length; i += 4) {
    rows.push(combo.steps.slice(i, i + 4));
  }

  const displayedStep = hoveredStep !== null ? hoveredStep : activeStep;
  const displayedStepData = displayedStep !== null ? combo.steps[displayedStep] : null;

  return (
    <div className={styles.container}>
      {/* 标题 */}
      <div className={styles.header}>
        <h2 className={styles.title}>{combo.name}</h2>
        <svg ref={titleRef} className={styles.titleUnderline} width="280" height="10" />
        
        <div className={styles.startingHand}>
          <span className={styles.handLabel}>🎴 起手：</span>
          {combo.startingHand.map((card, i) => (
            <span key={i} className={styles.handCard}>{card}</span>
          ))}
        </div>
      </div>

      {/* 主体区域 */}
      <div className={styles.mainArea}>
        {/* 流程图 */}
        <div className={styles.flowArea}>
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className={styles.flowRow}>
              {row.map((step, colIndex) => {
                const globalIndex = rowIndex * 4 + colIndex;
                const isLast = globalIndex === combo.steps.length - 1;
                
                return (
                  <div key={globalIndex} className={styles.stepWrapper}>
                    <SketchyCard
                      step={step}
                      index={globalIndex}
                      isActive={displayedStep === globalIndex}
                      onClick={() => setActiveStep(globalIndex)}
                      onHover={(hover) => setHoveredStep(hover ? globalIndex : null)}
                      cardId={getCardId(step.card)}
                    />
                    
                    {/* 箭头 */}
                    {!isLast && colIndex < 3 && (
                      <SketchyArrow direction="right" />
                    )}
                  </div>
                );
              })}
              
              {/* 行间箭头 */}
              {rowIndex < rows.length - 1 && (
                <div className={styles.rowArrow}>
                  <SketchyArrow direction="down" />
                </div>
              )}
            </div>
          ))}

          {/* 最终场面 */}
          {combo.finalBoard && (
            <div className={styles.finalBoard}>
              <div className={styles.finalLabel}>🏆 最终场面</div>
              <div className={styles.finalContent}>
                <div className={styles.finalMonsters}>
                  {combo.finalBoard.monsters.map((m, i) => (
                    <span key={i} className={styles.finalCard}>{m}</span>
                  ))}
                </div>
                <div className={styles.finalSpells}>
                  {combo.finalBoard.spellTrap.map((s, i) => (
                    <span key={i} className={styles.finalSpell}>{s}</span>
                  ))}
                </div>
                <div className={styles.disruptions}>
                  妨害数：<strong>{combo.finalBoard.disruptions}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 详情面板 */}
        <DetailPanel 
          step={displayedStepData}
          onClose={() => setActiveStep(null)}
          cardId={displayedStepData ? getCardId(displayedStepData.card) : undefined}
        />
      </div>
    </div>
  );
}

export default SketchyComboFlow;

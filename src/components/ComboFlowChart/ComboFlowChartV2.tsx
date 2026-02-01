import { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  Handle,
  Position,
  Panel,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import styles from './ComboFlowChartV2.module.css';

// 卡片名 -> ID 映射
const CARD_IDS: Record<string, number> = {
  '白森林的阿斯特莉亚': 25592142,
  '白森林的希尔薇': 98385955,
  '白森林的魔性 露西埃拉': 77313225,
  '白森林的传说': 99289828,
  '白森林的妖魔 迪亚贝尔': 14307929,
  '白森林的灾厄': 62995268,
  '白森林的里泽特': 61980241,
  '白森林的露西亚': 24779554,
  '骑士皇 阿克西拉': 71858682,
  '起立吧！百夫长骑士！': 41371602,
  '重骑士 普莉梅拉': 15005145,
  '觉醒吧！百夫长骑士！': 62256492,
  '星尘充能战士': 64880894,
  '鲜花女爵': 84815190,
  'I：P伪装舞会莱娜': 65741786,
};

const getCardImageUrl = (cardId: number) =>
  `https://images.ygoprodeck.com/images/cards/${cardId}.jpg`;

const getCardSmallImageUrl = (cardId: number) =>
  `https://images.ygoprodeck.com/images/cards_small/${cardId}.jpg`;

// 动作配置
const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  '通常召唤': { label: '通召', color: '#22c55e', bg: '#22c55e20' },
  '特殊召唤': { label: '特召', color: '#eab308', bg: '#eab30820' },
  '同调召唤': { label: '同调', color: '#8b5cf6', bg: '#8b5cf620' },
  '连接召唤': { label: '连接', color: '#3b82f6', bg: '#3b82f620' },
  '检索': { label: '检索', color: '#06b6d4', bg: '#06b6d420' },
  '苏生': { label: '苏生', color: '#10b981', bg: '#10b98120' },
  '盖卡': { label: '盖卡', color: '#6b7280', bg: '#6b728020' },
};

// 卡片详情弹窗
interface CardModalProps {
  card: { name: string; id: number; note?: string };
  onClose: () => void;
}

function CardModal({ card, onClose }: CardModalProps) {
  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        <img 
          src={getCardImageUrl(card.id)} 
          alt={card.name} 
          className={styles.modalImage}
        />
        <div className={styles.modalInfo}>
          <h3>{card.name}</h3>
          {card.note && <p>{card.note}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}

// 主线卡片节点
interface CardNodeData {
  cardName: string;
  cardId: number;
  action: string;
  note?: string;
  onClick: () => void;
}

function CardNode({ data }: { data: CardNodeData }) {
  const config = ACTION_CONFIG[data.action] || ACTION_CONFIG['特殊召唤'];
  
  return (
    <div className={styles.cardNode} onClick={data.onClick}>
      <Handle type="target" position={Position.Top} className={styles.handle} />
      <Handle type="target" position={Position.Left} className={styles.handle} id="left" />
      
      <img 
        src={getCardSmallImageUrl(data.cardId)} 
        alt={data.cardName}
        className={styles.cardImage}
      />
      <div className={styles.cardName}>{data.cardName}</div>
      <div className={styles.actionTag} style={{ background: config.bg, color: config.color }}>
        {config.label}
      </div>
      
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
      <Handle type="source" position={Position.Right} className={styles.handle} id="right" />
    </div>
  );
}

// 分支卡片节点
function BranchNode({ data }: { data: CardNodeData }) {
  const config = ACTION_CONFIG[data.action] || ACTION_CONFIG['检索'];
  
  return (
    <div className={styles.branchNode} onClick={data.onClick}>
      <Handle type="target" position={Position.Left} className={styles.handleSmall} />
      
      <img 
        src={getCardSmallImageUrl(data.cardId)} 
        alt={data.cardName}
        className={styles.branchImage}
      />
      <div className={styles.branchName}>{data.cardName}</div>
      <div className={styles.branchTag} style={{ background: config.bg, color: config.color }}>
        {config.label}
      </div>
      
      <Handle type="source" position={Position.Bottom} className={styles.handleSmall} />
      <Handle type="source" position={Position.Right} className={styles.handleSmall} id="right" />
    </div>
  );
}

const nodeTypes = {
  card: CardNode,
  branch: BranchNode,
};

// Combo 数据类型
interface ComboStep {
  card: string;
  action: string;
  level?: number;
  from?: string[];
  searchTarget?: string;
  reviveTarget?: string;
  branch?: string;
  note?: string;
}

interface ComboData {
  name: string;
  startingHand: string[];
  steps: ComboStep[];
}

// 正确的流程图数据
const WHITE_FOREST_COMBO: ComboData = {
  name: "白森林百夫长标准展开",
  startingHand: ["白森林的阿斯特莉亚", "任意魔法/陷阱卡"],
  steps: [
    // 主线步骤，每个步骤可以有检索目标
    { card: "白森林的阿斯特莉亚", action: "通常召唤", searchTarget: "白森林的希尔薇" },
    { card: "白森林的希尔薇", action: "特殊召唤", searchTarget: "白森林的传说" },
    { card: "白森林的魔性 露西埃拉", action: "同调召唤", searchTarget: "白森林的灾厄" },
    { card: "白森林的妖魔 迪亚贝尔", action: "同调召唤", searchTarget: "白森林的里泽特" },
    { card: "白森林的希尔薇", action: "苏生" },
    { card: "骑士皇 阿克西拉", action: "同调召唤", searchTarget: "起立吧！百夫长骑士！" },
    { card: "白森林的里泽特", action: "特殊召唤", searchTarget: "白森林的露西亚" },
    { card: "重骑士 普莉梅拉", action: "特殊召唤" },
    { card: "白森林的露西亚", action: "特殊召唤" },
    { card: "星尘充能战士", action: "同调召唤" },
    { card: "鲜花女爵", action: "同调召唤" },
  ],
};

// 生成节点和边
function generateFlowData(
  combo: ComboData,
  onCardClick: (card: { name: string; id: number; note?: string }) => void
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  // 布局配置
  const MAIN_X = 250;
  const BRANCH_X = 500;
  const ROW_HEIGHT = 180;
  const START_Y = 50;
  
  let currentY = START_Y;
  
  combo.steps.forEach((step, index) => {
    const cardId = CARD_IDS[step.card] || 0;
    const mainNodeId = `main-${index}`;
    
    // 主线节点
    nodes.push({
      id: mainNodeId,
      type: 'card',
      position: { x: MAIN_X, y: currentY },
      data: {
        cardName: step.card,
        cardId,
        action: step.action,
        note: step.note,
        onClick: () => onCardClick({ name: step.card, id: cardId, note: step.note }),
      },
    });
    
    // 主线连线（从上一个主线节点）
    if (index > 0) {
      edges.push({
        id: `e-main-${index - 1}-${index}`,
        source: `main-${index - 1}`,
        target: mainNodeId,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
      });
    }
    
    // 检索分支节点
    if (step.searchTarget) {
      const branchId = CARD_IDS[step.searchTarget] || 0;
      const branchNodeId = `branch-${index}`;
      
      nodes.push({
        id: branchNodeId,
        type: 'branch',
        position: { x: BRANCH_X, y: currentY + 20 },
        data: {
          cardName: step.searchTarget,
          cardId: branchId,
          action: '检索',
          onClick: () => onCardClick({ name: step.searchTarget!, id: branchId }),
        },
      });
      
      // 检索连线（从主线节点到分支）
      edges.push({
        id: `e-search-${index}`,
        source: mainNodeId,
        sourceHandle: 'right',
        target: branchNodeId,
        style: { stroke: '#06b6d4', strokeWidth: 2, strokeDasharray: '6,4' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#06b6d4' },
        label: '检索',
        labelStyle: { fill: '#06b6d4', fontSize: 11, fontWeight: 500 },
        labelBgStyle: { fill: '#0a0a12', fillOpacity: 0.8 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
      });
    }
    
    currentY += ROW_HEIGHT;
  });
  
  return { nodes, edges };
}

// 内部 Flow 组件
function FlowContent({ 
  combo, 
  isFullscreen, 
  onToggleFullscreen,
  onCardClick,
}: { 
  combo: ComboData;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onCardClick: (card: { name: string; id: number; note?: string }) => void;
}) {
  const { fitView } = useReactFlow();
  
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => generateFlowData(combo, onCardClick),
    [combo, onCardClick]
  );
  
  const [nodes] = useNodesState(initialNodes);
  const [edges] = useEdgesState(initialEdges);

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.15, duration: 300 });
    }, 100);
    return () => clearTimeout(timer);
  }, [isFullscreen, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.3}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={true}
      zoomOnScroll={true}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#374151" gap={30} size={1} />
      <Panel position="top-right" className={styles.panel}>
        <button onClick={onToggleFullscreen} className={styles.fullscreenBtn}>
          {isFullscreen ? '✕ 关闭' : '⛶ 全屏'}
        </button>
      </Panel>
      <Panel position="bottom-left" className={styles.legend}>
        <span style={{ color: '#8b5cf6' }}>━</span> 召唤
        <span style={{ color: '#06b6d4' }}>┅</span> 检索
      </Panel>
    </ReactFlow>
  );
}

// 主组件
interface ComboFlowChartV2Props {
  combo?: ComboData;
}

export function ComboFlowChartV2({ combo }: ComboFlowChartV2Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<{ name: string; id: number; note?: string } | null>(null);
  
  const toggleFullscreen = useCallback(() => setIsFullscreen(prev => !prev), []);
  const handleCardClick = useCallback((card: { name: string; id: number; note?: string }) => {
    setSelectedCard(card);
  }, []);
  
  const activeCombo = combo || WHITE_FOREST_COMBO;

  const flowContent = (
    <div className={`${styles.container} ${isFullscreen ? styles.fullscreen : ''}`}>
      <div className={styles.flowWrapper}>
        <ReactFlowProvider>
          <FlowContent 
            combo={activeCombo}
            isFullscreen={isFullscreen} 
            onToggleFullscreen={toggleFullscreen}
            onCardClick={handleCardClick}
          />
        </ReactFlowProvider>
      </div>
      {selectedCard && (
        <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );

  if (isFullscreen) {
    return createPortal(flowContent, document.body);
  }

  return flowContent;
}

export default ComboFlowChartV2;

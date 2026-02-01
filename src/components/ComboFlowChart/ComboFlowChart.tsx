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
import type { AnimatedCombo } from '../ComboPlayer/types';
import styles from './ComboFlowChart.module.css';

interface ComboFlowChartProps {
  combo: AnimatedCombo;
}

// 使用更大的卡图
const getCardImageUrl = (cardId: number) =>
  `https://images.ygoprodeck.com/images/cards/${cardId}.jpg`;

// 边的样式配置
const EDGE_STYLES = {
  summon: { stroke: '#8b5cf6', strokeWidth: 3, animated: true },
  cost: { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '5,5' },
  search: { stroke: '#06b6d4', strokeWidth: 2 },
  material: { stroke: '#f59e0b', strokeWidth: 2 },
  revive: { stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '8,4' },
};

// 怪兽卡节点
function MonsterNode({ data }: { data: { cardId: number; name: string; level?: string; action: string } }) {
  return (
    <div className={styles.monsterNode}>
      <Handle type="target" position={Position.Top} className={styles.handle} id="top" />
      <Handle type="target" position={Position.Left} className={styles.handle} id="left" />
      <img src={getCardImageUrl(data.cardId)} alt={data.name} className={styles.monsterImage} />
      <div className={styles.monsterInfo}>
        <span className={styles.monsterName}>{data.name}</span>
        {data.level && <span className={styles.monsterLevel}>{data.level}</span>}
      </div>
      <div className={`${styles.actionTag} ${styles[data.action]}`}>
        {data.action === 'synchro' && '🌀 同调'}
        {data.action === 'link' && '🔗 连接'}
        {data.action === 'normal' && '📤 通召'}
        {data.action === 'special' && '⚡ 特召'}
        {data.action === 'revive' && '💫 苏生'}
      </div>
      <Handle type="source" position={Position.Bottom} className={styles.handle} id="bottom" />
      <Handle type="source" position={Position.Right} className={styles.handle} id="right" />
    </div>
  );
}

// 魔陷卡节点（用于Cost/检索目标）
function SpellNode({ data }: { data: { cardId: number; name: string; role: string } }) {
  return (
    <div className={`${styles.spellNode} ${styles[data.role]}`}>
      <Handle type="target" position={Position.Top} className={styles.handleSmall} id="top" />
      <Handle type="target" position={Position.Left} className={styles.handleSmall} id="left" />
      <img src={getCardImageUrl(data.cardId)} alt={data.name} className={styles.spellImage} />
      <span className={styles.spellName}>{data.name}</span>
      <div className={styles.roleTag}>
        {data.role === 'cost' && '💀 Cost'}
        {data.role === 'search' && '🔍 检索'}
        {data.role === 'set' && '⬇️ 盖卡'}
      </div>
      <Handle type="source" position={Position.Bottom} className={styles.handleSmall} id="bottom" />
      <Handle type="source" position={Position.Right} className={styles.handleSmall} id="right" />
    </div>
  );
}

// 合并节点（用于同调素材汇合）
function MergeNode({ data }: { data: { label: string } }) {
  return (
    <div className={styles.mergeNode}>
      <Handle type="target" position={Position.Top} className={styles.handleSmall} id="top" />
      <Handle type="target" position={Position.Left} className={styles.handleSmall} id="left" />
      <span>{data.label}</span>
      <Handle type="source" position={Position.Bottom} className={styles.handleSmall} id="bottom" />
    </div>
  );
}

const nodeTypes = {
  monster: MonsterNode,
  spell: SpellNode,
  merge: MergeNode,
};

// 白森林百夫长的详细流程图数据
function createWhiteForestNodes(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    // === 第一层：起手 ===
    { id: 'hand', type: 'merge', position: { x: 400, y: 0 }, data: { label: '🎴 起手' } },
    
    // === 第二层：通召阿斯特莉亚 ===
    { id: 'astellar-1', type: 'monster', position: { x: 300, y: 100 }, 
      data: { cardId: 25592142, name: '阿斯特莉亚', action: 'normal' } },
    { id: 'tales-cost-1', type: 'spell', position: { x: 500, y: 100 }, 
      data: { cardId: 99289828, name: '传说', role: 'cost' } },
    
    // === 第三层：希尔薇登场 ===
    { id: 'silvy-1', type: 'monster', position: { x: 300, y: 250 }, 
      data: { cardId: 98385955, name: '希尔薇', action: 'special' } },
    { id: 'tales-search', type: 'spell', position: { x: 500, y: 250 }, 
      data: { cardId: 99289828, name: '传说', role: 'search' } },
    
    // === 第四层：同调露西埃拉 ===
    { id: 'synchro-1', type: 'merge', position: { x: 300, y: 380 }, data: { label: '2+4=6' } },
    { id: 'rciela', type: 'monster', position: { x: 300, y: 450 }, 
      data: { cardId: 77313225, name: '露西埃拉', level: '★6', action: 'synchro' } },
    { id: 'woes-search', type: 'spell', position: { x: 500, y: 450 }, 
      data: { cardId: 62995268, name: '灾厄', role: 'search' } },
    { id: 'astellar-revive', type: 'monster', position: { x: 100, y: 450 }, 
      data: { cardId: 25592142, name: '阿斯特莉亚', action: 'revive' } },
    
    // === 第五层：同调迪亚贝尔 ===
    { id: 'synchro-2', type: 'merge', position: { x: 200, y: 580 }, data: { label: '6+2=8' } },
    { id: 'diabell', type: 'monster', position: { x: 200, y: 650 }, 
      data: { cardId: 14307929, name: '迪亚贝尔', level: '★8', action: 'synchro' } },
    { id: 'elzette-search', type: 'spell', position: { x: 400, y: 650 }, 
      data: { cardId: 61980241, name: '里泽特', role: 'search' } },
    
    // === 第六层：同调阿克西拉 ===
    { id: 'silvy-revive', type: 'monster', position: { x: 50, y: 750 }, 
      data: { cardId: 98385955, name: '希尔薇', action: 'revive' } },
    { id: 'synchro-3', type: 'merge', position: { x: 200, y: 800 }, data: { label: '8+4=12' } },
    { id: 'auxila', type: 'monster', position: { x: 200, y: 870 }, 
      data: { cardId: 71858682, name: '阿克西拉', level: '★12', action: 'synchro' } },
    { id: 'standup-search', type: 'spell', position: { x: 400, y: 870 }, 
      data: { cardId: 41371602, name: '起立吧！', role: 'search' } },
    
    // === 第七层：里泽特+露西亚展开 ===
    { id: 'elzette', type: 'monster', position: { x: 500, y: 970 }, 
      data: { cardId: 61980241, name: '里泽特', action: 'special' } },
    { id: 'rucia', type: 'monster', position: { x: 650, y: 970 }, 
      data: { cardId: 24779554, name: '露西亚', action: 'special' } },
    
    // === 第八层：同调星尘充能 ===
    { id: 'synchro-4', type: 'merge', position: { x: 575, y: 1070 }, data: { label: '2+4=6' } },
    { id: 'stardust', type: 'monster', position: { x: 575, y: 1140 }, 
      data: { cardId: 64880894, name: '星尘充能', level: '★6', action: 'synchro' } },
    { id: 'primera', type: 'monster', position: { x: 350, y: 1140 }, 
      data: { cardId: 15005145, name: '普莉梅拉', action: 'special' } },
    
    // === 第九层：同调鲜花女爵 ===
    { id: 'synchro-5', type: 'merge', position: { x: 460, y: 1250 }, data: { label: '6+4=10' } },
    { id: 'baronne', type: 'monster', position: { x: 460, y: 1320 }, 
      data: { cardId: 84815190, name: '鲜花女爵', level: '★10', action: 'synchro' } },
    
    // === 第十层：连接IP莱娜 ===
    { id: 'rucia-revive', type: 'monster', position: { x: 250, y: 1320 }, 
      data: { cardId: 24779554, name: '露西亚', action: 'revive' } },
    { id: 'link-1', type: 'merge', position: { x: 150, y: 1420 }, data: { label: 'LINK-2' } },
    { id: 'ip', type: 'monster', position: { x: 150, y: 1490 }, 
      data: { cardId: 65741786, name: 'IP莱娜', action: 'link' } },
    
    // === 最终：苏生阿克西拉 ===
    { id: 'auxila-revive', type: 'monster', position: { x: 350, y: 1490 }, 
      data: { cardId: 71858682, name: '阿克西拉', action: 'revive' } },
    
    // === 终场 ===
    { id: 'final', type: 'merge', position: { x: 300, y: 1600 }, data: { label: '🏆 终场 4妨害' } },
  ];

  const edges: Edge[] = [
    // 起手到通召
    { id: 'e1', source: 'hand', target: 'astellar-1', ...EDGE_STYLES.summon, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
    { id: 'e2', source: 'hand', target: 'tales-cost-1', ...EDGE_STYLES.cost, label: 'Cost', labelStyle: { fill: '#ef4444', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' } },
    
    // 阿斯特莉亚特召希尔薇
    { id: 'e3', source: 'astellar-1', target: 'silvy-1', sourceHandle: 'bottom', ...EDGE_STYLES.summon, label: '效果特召', labelStyle: { fill: '#8b5cf6', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
    { id: 'e4', source: 'silvy-1', target: 'tales-search', sourceHandle: 'right', ...EDGE_STYLES.search, label: '检索', labelStyle: { fill: '#06b6d4', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#06b6d4' } },
    
    // 同调露西埃拉
    { id: 'e5', source: 'astellar-1', target: 'synchro-1', sourceHandle: 'bottom', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e6', source: 'silvy-1', target: 'synchro-1', sourceHandle: 'bottom', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e7', source: 'synchro-1', target: 'rciela', ...EDGE_STYLES.summon, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
    { id: 'e8', source: 'rciela', target: 'woes-search', sourceHandle: 'right', ...EDGE_STYLES.search, label: '检索', labelStyle: { fill: '#06b6d4', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#06b6d4' } },
    { id: 'e9', source: 'rciela', target: 'astellar-revive', sourceHandle: 'left', targetHandle: 'right', ...EDGE_STYLES.revive, label: '墓地苏生', labelStyle: { fill: '#22c55e', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' } },
    
    // 同调迪亚贝尔
    { id: 'e10', source: 'rciela', target: 'synchro-2', sourceHandle: 'bottom', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e11', source: 'astellar-revive', target: 'synchro-2', sourceHandle: 'bottom', targetHandle: 'left', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e12', source: 'synchro-2', target: 'diabell', ...EDGE_STYLES.summon, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
    { id: 'e13', source: 'diabell', target: 'elzette-search', sourceHandle: 'right', ...EDGE_STYLES.search, label: '检索', labelStyle: { fill: '#06b6d4', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#06b6d4' } },
    
    // 同调阿克西拉
    { id: 'e14', source: 'diabell', target: 'synchro-3', sourceHandle: 'bottom', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e15', source: 'silvy-revive', target: 'synchro-3', sourceHandle: 'bottom', targetHandle: 'left', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e16', source: 'synchro-3', target: 'auxila', ...EDGE_STYLES.summon, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
    { id: 'e17', source: 'auxila', target: 'standup-search', sourceHandle: 'right', ...EDGE_STYLES.search, label: '检索', labelStyle: { fill: '#06b6d4', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#06b6d4' } },
    
    // 希尔薇墓地效果
    { id: 'e18', source: 'synchro-1', target: 'silvy-revive', targetHandle: 'top', ...EDGE_STYLES.revive, label: '墓地苏生', labelStyle: { fill: '#22c55e', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' } },
    
    // 里泽特+露西亚展开
    { id: 'e19', source: 'elzette-search', target: 'elzette', sourceHandle: 'bottom', ...EDGE_STYLES.summon, label: '自身特召', labelStyle: { fill: '#eab308', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#eab308' } },
    { id: 'e20', source: 'elzette', target: 'rucia', sourceHandle: 'right', ...EDGE_STYLES.search, label: '检索特召', labelStyle: { fill: '#06b6d4', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#06b6d4' } },
    
    // 同调星尘充能
    { id: 'e21', source: 'elzette', target: 'synchro-4', sourceHandle: 'bottom', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e22', source: 'rucia', target: 'synchro-4', sourceHandle: 'bottom', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e23', source: 'synchro-4', target: 'stardust', ...EDGE_STYLES.summon, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
    
    // 普莉梅拉
    { id: 'e24', source: 'standup-search', target: 'primera', sourceHandle: 'bottom', ...EDGE_STYLES.summon, label: '场地特召', labelStyle: { fill: '#8b5cf6', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
    
    // 同调鲜花女爵
    { id: 'e25', source: 'stardust', target: 'synchro-5', sourceHandle: 'bottom', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e26', source: 'primera', target: 'synchro-5', sourceHandle: 'bottom', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e27', source: 'synchro-5', target: 'baronne', ...EDGE_STYLES.summon, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
    
    // 露西亚苏生
    { id: 'e28', source: 'synchro-4', target: 'rucia-revive', targetHandle: 'top', ...EDGE_STYLES.revive, label: '墓地苏生', labelStyle: { fill: '#22c55e', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' } },
    
    // 连接IP莱娜
    { id: 'e29', source: 'rucia-revive', target: 'link-1', sourceHandle: 'bottom', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e30', source: 'auxila', target: 'link-1', sourceHandle: 'bottom', targetHandle: 'top', ...EDGE_STYLES.material, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' } },
    { id: 'e31', source: 'link-1', target: 'ip', ...EDGE_STYLES.summon, markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' } },
    
    // 苏生阿克西拉
    { id: 'e32', source: 'link-1', target: 'auxila-revive', targetHandle: 'top', ...EDGE_STYLES.revive, label: '骑士魔防阵', labelStyle: { fill: '#22c55e', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' } },
    
    // 终场
    { id: 'e33', source: 'baronne', target: 'final', sourceHandle: 'bottom', ...EDGE_STYLES.summon, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
    { id: 'e34', source: 'ip', target: 'final', sourceHandle: 'bottom', ...EDGE_STYLES.summon, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
    { id: 'e35', source: 'auxila-revive', target: 'final', sourceHandle: 'bottom', ...EDGE_STYLES.summon, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } },
  ];

  return { nodes, edges };
}

function FlowContent({ isFullscreen, onToggleFullscreen }: { isFullscreen: boolean; onToggleFullscreen: () => void }) {
  const { fitView } = useReactFlow();
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => createWhiteForestNodes(), []);
  const [nodes] = useNodesState(initialNodes);
  const [edges] = useEdgesState(initialEdges);

  // 全屏切换时重新适应视图
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.1, duration: 300 });
    }, 100);
    return () => clearTimeout(timer);
  }, [isFullscreen, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.1 }}
      minZoom={0.2}
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
        <div className={styles.legendItem}><span style={{background: '#8b5cf6'}}></span> 召唤</div>
        <div className={styles.legendItem}><span style={{background: '#f59e0b'}}></span> 素材</div>
        <div className={styles.legendItem}><span style={{background: '#06b6d4'}}></span> 检索</div>
        <div className={styles.legendItem}><span style={{background: '#ef4444'}}></span> Cost</div>
        <div className={styles.legendItem}><span style={{background: '#22c55e'}}></span> 苏生</div>
      </Panel>
    </ReactFlow>
  );
}

export function ComboFlowChart(_props: ComboFlowChartProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => setIsFullscreen(prev => !prev), []);

  const flowContent = (
    <div className={`${styles.container} ${isFullscreen ? styles.fullscreen : ''}`}>
      <div className={styles.flowWrapper}>
        <ReactFlowProvider>
          <FlowContent isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} />
        </ReactFlowProvider>
      </div>
    </div>
  );

  // 全屏时用 portal 渲染到 body，避免被父元素样式影响
  if (isFullscreen) {
    return createPortal(flowContent, document.body);
  }

  return flowContent;
}

export default ComboFlowChart;

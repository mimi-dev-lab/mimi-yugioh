/**
 * Excalidraw 手绘风格流程图组件
 * 展示白森林百夫长 Combo 展开路线
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Excalidraw } from '@excalidraw/excalidraw';

// 卡片名 -> ID 映射
const CARD_IDS: Record<string, number> = {
  '阿斯特莉亚': 25592142,
  '希尔薇': 98385955,
  '露西埃拉': 77313225,
  '传说': 99289828,
  '迪亚贝尔': 14307929,
  '灾厄': 62995268,
  '里泽特': 61980241,
  '露西亚': 24779554,
  '阿克西拉': 71858682,
  '起立吧': 41371602,
  '普莉梅拉': 15005145,
  '星尘充能': 64880894,
  '鲜花女爵': 84815190,
  'IP莱娜': 65741786,
  '魔狼': 41924516,
};

// 根据文本查找对应卡片
function findCardByText(text: string): { name: string; id: number } | null {
  for (const [name, id] of Object.entries(CARD_IDS)) {
    if (text.includes(name)) {
      return { name, id };
    }
  }
  return null;
}

const getCardImageUrl = (cardId: number) =>
  `https://images.ygoprodeck.com/images/cards/${cardId}.jpg`;

// 卡片详情弹窗
interface CardModalProps {
  card: { name: string; id: number };
  onClose: () => void;
}

function CardModal({ card, onClose }: CardModalProps) {
  return createPortal(
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: '#1a1a2e',
          borderRadius: '16px',
          padding: '20px',
          maxWidth: '400px',
          border: '2px solid #8b5cf6',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '24px',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
        <img 
          src={getCardImageUrl(card.id)} 
          alt={card.name}
          style={{
            width: '100%',
            maxHeight: '500px',
            objectFit: 'contain',
            borderRadius: '8px',
          }}
        />
        <h3 style={{ color: 'white', textAlign: 'center', marginTop: '12px' }}>
          {card.name}
        </h3>
      </div>
    </div>,
    document.body
  );
}

// 生成简单的 Excalidraw 测试元素
function generateExcalidrawElements(): readonly any[] {
  // 最简单的测试 - 只有一个矩形和文字
  return [
    {
      id: "rect1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      strokeColor: "#8b5cf6",
      backgroundColor: "#8b5cf620",
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 1,
      opacity: 100,
      seed: 12345,
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      groupIds: [],
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
      angle: 0,
    },
    {
      id: "text1",
      type: "text",
      x: 120,
      y: 130,
      width: 160,
      height: 40,
      text: "阿斯特莉亚",
      fontSize: 24,
      fontFamily: 1,
      textAlign: "center",
      verticalAlign: "middle",
      strokeColor: "#ffffff",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      opacity: 100,
      seed: 12346,
      version: 1,
      versionNonce: 2,
      isDeleted: false,
      groupIds: [],
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
      angle: 0,
      baseline: 24,
      lineHeight: 1.25,
      originalText: "阿斯特莉亚",
    },
  ];
}

// 主组件
export function ExcalidrawComboChart() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<{ name: string; id: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const excalidrawRef = useRef<any>(null);
  const [elements] = useState(() => generateExcalidrawElements());

  // 组件加载后滚动到内容
  useEffect(() => {
    const timer = setTimeout(() => {
      if (excalidrawRef.current) {
        excalidrawRef.current.scrollToContent(excalidrawRef.current.getSceneElements(), {
          fitToViewport: true,
          viewportZoomFactor: 0.9,
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handlePointerUp = useCallback((
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _activeTool: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pointerDownState: any,
  ) => {
    // 获取点击位置的元素
    if (excalidrawRef.current) {
      const api = excalidrawRef.current;
      const allElements = api.getSceneElements();
      const { origin } = pointerDownState;
      
      // 查找点击的文本元素
      for (const el of allElements) {
        if (el.type === 'text' && !el.isDeleted) {
          if (
            origin.x >= el.x &&
            origin.x <= el.x + (el.width || 200) &&
            origin.y >= el.y &&
            origin.y <= el.y + (el.height || 30)
          ) {
            const card = findCardByText(el.text);
            if (card) {
              setSelectedCard(card);
              return;
            }
          }
        }
      }
    }
  }, []);

  const toggleFullscreen = useCallback(() => setIsFullscreen(prev => !prev), []);

  const content = (
    <div
      style={{
        width: '100%',
        height: isFullscreen ? '100vh' : '600px',
        background: '#0a0a12',
        borderRadius: isFullscreen ? 0 : '12px',
        overflow: 'hidden',
        position: isFullscreen ? 'fixed' : 'relative',
        inset: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 9999 : 1,
      }}
    >
      <Excalidraw
        excalidrawAPI={(api) => { excalidrawRef.current = api; }}
        initialData={{
          elements,
          appState: {
            viewBackgroundColor: '#0a0a12',
            currentItemStrokeColor: '#ffffff',
            currentItemBackgroundColor: 'transparent',
            theme: 'dark',
            scrollX: 100,
            scrollY: -50,
          },
          scrollToContent: true,
        }}
        onPointerUp={handlePointerUp}
        viewModeEnabled={true}
        zenModeEnabled={true}
        gridModeEnabled={false}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            saveAsImage: false,
          },
        }}
      />
      
      {/* 全屏按钮 */}
      <button
        onClick={toggleFullscreen}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          padding: '8px 16px',
          background: '#8b5cf620',
          border: '1px solid #8b5cf6',
          borderRadius: '8px',
          color: '#8b5cf6',
          cursor: 'pointer',
          fontSize: '14px',
          zIndex: 10,
        }}
      >
        {isFullscreen ? '✕ 关闭' : '⛶ 全屏'}
      </button>

      {/* 图例 */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          display: 'flex',
          gap: '16px',
          padding: '8px 12px',
          background: '#1a1a2e90',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#9ca3af',
          zIndex: 10,
        }}
      >
        <span><span style={{ color: '#22c55e' }}>■</span> 通召</span>
        <span><span style={{ color: '#eab308' }}>■</span> 特召</span>
        <span><span style={{ color: '#8b5cf6' }}>■</span> 同调</span>
        <span><span style={{ color: '#3b82f6' }}>■</span> 连接</span>
        <span><span style={{ color: '#06b6d4' }}>┅</span> 检索</span>
      </div>
      
      {/* 提示 */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          padding: '6px 12px',
          background: '#1a1a2e90',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#9ca3af',
          zIndex: 10,
        }}
      >
        💡 点击卡片名查看详情
      </div>
    </div>
  );

  return (
    <>
      {isFullscreen ? createPortal(content, document.body) : content}
      {selectedCard && (
        <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </>
  );
}

export default ExcalidrawComboChart;

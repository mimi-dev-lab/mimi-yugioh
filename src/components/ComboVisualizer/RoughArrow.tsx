import { useEffect, useRef } from 'react';
import rough from 'roughjs';

interface RoughArrowProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color?: string;
  strokeWidth?: number;
  roughness?: number;
}

export function RoughArrow({
  startX,
  startY,
  endX,
  endY,
  color = '#1e1e1e',
  strokeWidth = 2,
  roughness = 1,
}: RoughArrowProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    // 清空之前的内容
    svgRef.current.innerHTML = '';

    const rc = rough.svg(svgRef.current);

    // 计算箭头方向
    const angle = Math.atan2(endY - startY, endX - startX);
    const headLen = 12;
    const headAngle = Math.PI / 6;

    // 箭头头部两个点
    const head1X = endX - headLen * Math.cos(angle - headAngle);
    const head1Y = endY - headLen * Math.sin(angle - headAngle);
    const head2X = endX - headLen * Math.cos(angle + headAngle);
    const head2Y = endY - headLen * Math.sin(angle + headAngle);

    // 画线
    const line = rc.line(startX, startY, endX, endY, {
      stroke: color,
      strokeWidth,
      roughness,
    });
    svgRef.current.appendChild(line);

    // 画箭头头部
    const head1 = rc.line(endX, endY, head1X, head1Y, {
      stroke: color,
      strokeWidth,
      roughness,
    });
    const head2 = rc.line(endX, endY, head2X, head2Y, {
      stroke: color,
      strokeWidth,
      roughness,
    });
    svgRef.current.appendChild(head1);
    svgRef.current.appendChild(head2);
  }, [startX, startY, endX, endY, color, strokeWidth, roughness]);

  // 计算 SVG 尺寸
  const padding = 20;
  const minX = Math.min(startX, endX) - padding;
  const minY = Math.min(startY, endY) - padding;
  const width = Math.abs(endX - startX) + padding * 2;
  const height = Math.abs(endY - startY) + padding * 2;

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        left: minX,
        top: minY,
        width,
        height,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      viewBox={`${minX} ${minY} ${width} ${height}`}
    />
  );
}

// 水平手绘箭头（用于流程图）
export function RoughHorizontalArrow({ width = 40, color = '#666' }: { width?: number; color?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    svgRef.current.innerHTML = '';

    const rc = rough.svg(svgRef.current);
    const y = 15;

    // 主线
    const line = rc.line(0, y, width - 10, y, {
      stroke: color,
      strokeWidth: 2,
      roughness: 1.2,
    });
    svgRef.current.appendChild(line);

    // 箭头头部
    const head1 = rc.line(width - 10, y, width - 18, y - 6, {
      stroke: color,
      strokeWidth: 2,
      roughness: 1,
    });
    const head2 = rc.line(width - 10, y, width - 18, y + 6, {
      stroke: color,
      strokeWidth: 2,
      roughness: 1,
    });
    svgRef.current.appendChild(head1);
    svgRef.current.appendChild(head2);
  }, [width, color]);

  return (
    <svg
      ref={svgRef}
      style={{ width, height: 30, flexShrink: 0 }}
    />
  );
}

// 手绘边框矩形
export function RoughBox({
  width,
  height,
  color = '#1e1e1e',
  fill,
  roughness = 1,
  children,
  className,
  onClick,
}: {
  width: number;
  height: number;
  color?: string;
  fill?: string;
  roughness?: number;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    svgRef.current.innerHTML = '';

    const rc = rough.svg(svgRef.current);
    const rect = rc.rectangle(2, 2, width - 4, height - 4, {
      stroke: color,
      strokeWidth: 2,
      roughness,
      fill: fill,
      fillStyle: fill ? 'hachure' : undefined,
      hachureGap: 4,
    });
    svgRef.current.appendChild(rect);
  }, [width, height, color, fill, roughness]);

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        position: 'relative',
        width,
        height,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <svg
        ref={svgRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        {children}
      </div>
    </div>
  );
}

export default RoughArrow;

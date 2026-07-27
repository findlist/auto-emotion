import { useState, useMemo, useCallback } from 'react';

interface PressureRadarProps {
  data: {
    work: number;
    life: number;
    social: number;
    finance: number;
    health: number;
    hasData: boolean;
  };
  size?: number;
}

type DimKey = 'work' | 'life' | 'social' | 'finance' | 'health';

const DIMENSIONS: { key: DimKey; label: string }[] = [
  { key: 'work', label: '工作' },
  { key: 'life', label: '生活' },
  { key: 'social', label: '社交' },
  { key: 'finance', label: '财务' },
  { key: 'health', label: '健康' },
];

const LEVELS = 5;
const ANGLE_START = -90;
const ANGLE_STEP = 72;

// 压力强度阈值：getIntensityColor / getPolygonFill / getPolygonStroke 三函数共享。
// 40 为低压上限（薄荷绿），70 为中压上限（黄），超过 70 走高压（粉红）。
// 三函数必须共用同一阈值，避免 fill 与 stroke 颜色区间错位。
const LOW_PRESSURE_THRESHOLD = 40;
const HIGH_PRESSURE_THRESHOLD = 70;

// 压力强度调色板（hex）：getIntensityColor 与 getPolygonStroke 共享。
// getPolygonFill 使用 rgba 格式不与此处共享，但颜色值一一对应（同色系不同透明度）。
// 调整颜色时需同步修改 getPolygonFill 中的 rgba 值保持视觉一致。
const PRESSURE_COLORS = {
  low: '#3dd9b5',
  mid: '#ffd93d',
  high: '#ff3d7f',
} as const;

// 通用配置常量：SVG 描边/填充/文字色 + 等宽字体族 + 压力上下限 + 无数据默认值。
// INK_COLOR 用于 6 处 SVG 属性与 style 属性（boxShadow/borderTop 中的 #1a1a1a
// 属 CSS 字符串子串不抽取，避免模板字符串增加复杂度）。
const INK_COLOR = '#1a1a1a';
const MONO_FONT_FAMILY = "'DM Mono', monospace";
const MAX_PRESSURE = 100;
const DEFAULT_PRESSURE = 50;

function deg2rad(deg: number) {
  return (deg * Math.PI) / 180;
}

function getPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = deg2rad(angleDeg);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function polygonPath(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
}

function getIntensityColor(value: number): string {
  if (value <= LOW_PRESSURE_THRESHOLD) return PRESSURE_COLORS.low;
  if (value <= 55) return '#c4e84b';
  if (value <= HIGH_PRESSURE_THRESHOLD) return PRESSURE_COLORS.mid;
  if (value <= 85) return '#ff6b35';
  return PRESSURE_COLORS.high;
}

function getPolygonFill(avgValue: number): string {
  if (avgValue <= LOW_PRESSURE_THRESHOLD) return 'rgba(61,217,181,0.25)';
  if (avgValue <= HIGH_PRESSURE_THRESHOLD) return 'rgba(255,217,61,0.25)';
  return 'rgba(255,61,127,0.25)';
}

function getPolygonStroke(avgValue: number): string {
  if (avgValue <= LOW_PRESSURE_THRESHOLD) return PRESSURE_COLORS.low;
  if (avgValue <= HIGH_PRESSURE_THRESHOLD) return PRESSURE_COLORS.mid;
  return PRESSURE_COLORS.high;
}

function PressureRadar({ data, size = 280 }: PressureRadarProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const displayData = useMemo(() => {
    const fallback = data.hasData ? data : {
      work: DEFAULT_PRESSURE, life: DEFAULT_PRESSURE, social: DEFAULT_PRESSURE, finance: DEFAULT_PRESSURE, health: DEFAULT_PRESSURE, hasData: false,
    };
    return DIMENSIONS.map((d) => ({
      ...d,
      value: Math.min(MAX_PRESSURE, Math.max(0, fallback[d.key])),
    }));
  }, [data]);

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 40;

  const gridPolygons = useMemo(() => {
    return Array.from({ length: LEVELS }, (_, level) => {
      const r = maxR * ((level + 1) / LEVELS);
      const points = DIMENSIONS.map((_, i) => getPoint(cx, cy, r, ANGLE_START + i * ANGLE_STEP));
      return polygonPath(points);
    });
  }, [cx, cy, maxR]);

  const axes = useMemo(() => {
    return DIMENSIONS.map((_, i) => {
      const end = getPoint(cx, cy, maxR, ANGLE_START + i * ANGLE_STEP);
      return { x1: cx, y1: cy, x2: end.x, y2: end.y };
    });
  }, [cx, cy, maxR]);

  const dataPolygonPath = useMemo(() => {
    const points = displayData.map((d, i) => {
      const r = maxR * (d.value / MAX_PRESSURE);
      return getPoint(cx, cy, r, ANGLE_START + i * ANGLE_STEP);
    });
    return polygonPath(points);
  }, [displayData, cx, cy, maxR]);

  const labelPositions = useMemo(() => {
    return displayData.map((d, i) => {
      const labelR = maxR + 24;
      const pos = getPoint(cx, cy, labelR, ANGLE_START + i * ANGLE_STEP);
      return { ...pos, label: d.label, value: d.value, color: getIntensityColor(d.value) };
    });
  }, [displayData, cx, cy, maxR]);

  const dotPositions = useMemo(() => {
    return displayData.map((d, i) => {
      const r = maxR * (d.value / MAX_PRESSURE);
      const pos = getPoint(cx, cy, r, ANGLE_START + i * ANGLE_STEP);
      return { ...pos, value: d.value, color: getIntensityColor(d.value) };
    });
  }, [displayData, cx, cy, maxR]);

  const avgValue = useMemo(() => {
    const sum = displayData.reduce((acc, d) => acc + d.value, 0);
    return sum / displayData.length;
  }, [displayData]);

  const handleDotEnter = useCallback((index: number) => setHoveredIndex(index), []);
  const handleDotLeave = useCallback(() => setHoveredIndex(null), []);

  return (
    <div className="inline-block relative">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
      >
        <defs>
          <filter id="radar-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="2" dy="2" stdDeviation="0" floodColor="#1a1a1a" floodOpacity="0.3" />
          </filter>
        </defs>

        <g>
          {gridPolygons.map((path, i) => (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={INK_COLOR}
              strokeWidth={i === gridPolygons.length - 1 ? 2 : 1}
              opacity={0.15 + i * 0.05}
            />
          ))}
        </g>

        <g>
          {axes.map((a, i) => (
            <line
              key={i}
              x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
              stroke={INK_COLOR}
              strokeWidth={1}
              opacity={0.15}
            />
          ))}
        </g>

        <path
          d={dataPolygonPath}
          fill={getPolygonFill(avgValue)}
          stroke={getPolygonStroke(avgValue)}
          strokeWidth={2.5}
          filter="url(#radar-shadow)"
          className="origin-center animate-radar-expand"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {dotPositions.map((dot, i) => (
          <g key={i}>
            <circle
              cx={dot.x} cy={dot.y} r={hoveredIndex === i ? 7 : 5}
              fill={dot.color}
              stroke={INK_COLOR}
              strokeWidth={2}
              className="transition-all duration-150 cursor-pointer"
              onMouseEnter={() => handleDotEnter(i)}
              onMouseLeave={handleDotLeave}
            />
            {/* 透明扩大点击区域：r=16 大于主圆 r=5/7，覆盖主圆所有 hover 区域。
                真实浏览器中此圆在上层捕获事件，主圆 onMouseEnter 不会重复触发；
                保留主圆事件绑定是 React Testing Library fireEvent 直接触发的兼容 */}
            <circle
              cx={dot.x} cy={dot.y} r={16}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => handleDotEnter(i)}
              onMouseLeave={handleDotLeave}
            />
          </g>
        ))}

        {labelPositions.map((lbl, i) => (
          <text
            key={i}
            x={lbl.x}
            y={lbl.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="select-none pointer-events-none"
            style={{
              fontFamily: "'ZCOOL KuaiLe', 'Bungee', cursive",
              fontSize: '13px',
              fill: INK_COLOR,
              fontWeight: 700,
            }}
          >
            {lbl.label}
          </text>
        ))}
      </svg>

      {hoveredIndex !== null && (() => {
        const dot = dotPositions[hoveredIndex];
        const dim = displayData[hoveredIndex];
        const tooltipX = dot.x;
        const tooltipY = dot.y - 28;
        return (
          <div
            className="absolute pointer-events-none z-10"
            style={{
              left: tooltipX,
              top: tooltipY,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div
              className="px-3 py-1.5 rounded-md text-sm font-bold whitespace-nowrap border-2 border-ink"
              style={{
                backgroundColor: '#fff8e7',
                color: INK_COLOR,
                fontFamily: MONO_FONT_FAMILY,
                boxShadow: '3px 3px 0 #1a1a1a',
              }}
            >
              {dim.label}：<span style={{ color: dot.color }}>{dim.value}</span>
            </div>
            <div
              className="w-0 h-0 mx-auto"
              style={{
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid #1a1a1a',
              }}
            />
          </div>
        );
      })()}

      {!data.hasData && (
        <p
          className="text-center mt-2 text-xs"
          style={{
            fontFamily: "'DM Mono', monospace",
            color: 'rgba(26,26,26,0.5)',
          }}
        >
          暂无个人数据，展示全站平均
        </p>
      )}
    </div>
  );
}

export default PressureRadar;

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

interface Node {
  id: string;
  title: string;
  category: string;
  year: string;
  pub_date?: string;
  connections?: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: string | Node;
  target: string | Node;
  weight: number;
}

interface NetworkData {
  nodes: Node[];
  links: Link[];
}

interface BrainNetworkProps {
  data: NetworkData;
  onNodeClick?: (node: Node) => void;
  selectedNodeId?: string | null;
  highlightedCategory?: string | null;
  highlightedYear?: string | null;
}

// 카테고리별 색상 팔레트
const categoryColors: Record<string, string> = {
  '주제별 글모음': '#6366f1', // indigo
  '여행': '#f59e0b', // amber
  '독서와 글쓰기': '#10b981', // emerald
  '연작 에세이들': '#ec4899', // pink
  'AI 학교': '#8b5cf6', // violet
  '음식 인테리어 쇼핑': '#14b8a6', // teal
  '잡동사니': '#6b7280', // gray
  'default': '#94a3b8',
};

function getCategoryColor(category: string): string {
  if (!category) return categoryColors.default;
  for (const key of Object.keys(categoryColors)) {
    if (category.startsWith(key)) return categoryColors[key];
  }
  return categoryColors.default;
}

// 연도별 밝기 (오래된 글 = 더 어두운 색)
function getYearOpacity(year: string): number {
  const y = parseInt(year);
  if (isNaN(y)) return 0.5;
  const minYear = 2007;
  const maxYear = 2026;
  return 0.3 + 0.7 * ((y - minYear) / (maxYear - minYear));
}

export default function BrainNetwork({
  data,
  onNodeClick,
  selectedNodeId,
  highlightedCategory,
  highlightedYear,
}: BrainNetworkProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);

  // 반응형 크기 조정
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // D3 시각화
  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = dimensions;
    const nodes = data.nodes.map(d => ({ ...d }));
    const links = data.links.map(d => ({ ...d }));

    // 줌 기능
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    const container = svg.append('g');

    // 배경 그라데이션
    const defs = svg.append('defs');
    const gradient = defs.append('radialGradient')
      .attr('id', 'brain-gradient')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#1e1b4b')
      .attr('stop-opacity', 0.1);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#0f0a1e')
      .attr('stop-opacity', 0.05);

    // 글로우 효과
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    filter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');

    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // 시뮬레이션 설정
    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links)
        .id(d => d.id)
        .distance(80)
        .strength(0.3))
      .force('charge', d3.forceManyBody()
        .strength(-120)
        .distanceMax(300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(15))
      .force('x', d3.forceX(width / 2).strength(0.02))
      .force('y', d3.forceY(height / 2).strength(0.02));

    simulationRef.current = simulation;

    // 링크 그리기
    const link = container.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#4a5568')
      .attr('stroke-opacity', 0.15)
      .attr('stroke-width', d => Math.sqrt(d.weight));

    // 노드 그리기
    const node = container.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, Node>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer');

    // 드래그 동작 적용
    const dragBehavior = d3.drag<SVGGElement, Node>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(dragBehavior);

    // 노드 원
    node.append('circle')
      .attr('r', d => {
        const connections = d.connections || 1;
        return Math.min(5 + Math.sqrt(connections) * 2, 20);
      })
      .attr('fill', d => getCategoryColor(d.category))
      .attr('opacity', d => {
        if (highlightedCategory && !d.category.startsWith(highlightedCategory)) return 0.1;
        if (highlightedYear && d.year !== highlightedYear) return 0.1;
        return getYearOpacity(d.year);
      })
      .attr('stroke', d => selectedNodeId === d.id ? '#fff' : 'none')
      .attr('stroke-width', d => selectedNodeId === d.id ? 2 : 0)
      .attr('filter', d => selectedNodeId === d.id ? 'url(#glow)' : 'none');

    // 마우스 이벤트
    node
      .on('mouseenter', (event, d) => {
        setHoveredNode(d);

        // 연결된 노드 하이라이트
        const connectedIds = new Set<string>();
        links.forEach(l => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          if (sourceId === d.id) connectedIds.add(targetId);
          if (targetId === d.id) connectedIds.add(sourceId);
        });

        node.select('circle')
          .transition()
          .duration(200)
          .attr('opacity', n => {
            if (n.id === d.id || connectedIds.has(n.id)) return 1;
            return 0.1;
          });

        link
          .transition()
          .duration(200)
          .attr('stroke-opacity', l => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return sourceId === d.id || targetId === d.id ? 0.6 : 0.05;
          })
          .attr('stroke', l => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return sourceId === d.id || targetId === d.id ? getCategoryColor(d.category) : '#4a5568';
          });
      })
      .on('mouseleave', () => {
        setHoveredNode(null);

        node.select('circle')
          .transition()
          .duration(200)
          .attr('opacity', d => {
            if (highlightedCategory && !d.category.startsWith(highlightedCategory)) return 0.1;
            if (highlightedYear && d.year !== highlightedYear) return 0.1;
            return getYearOpacity(d.year);
          });

        link
          .transition()
          .duration(200)
          .attr('stroke-opacity', 0.15)
          .attr('stroke', '#4a5568');
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeClick?.(d);
      });

    // 시뮬레이션 틱
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x || 0)
        .attr('y1', d => (d.source as Node).y || 0)
        .attr('x2', d => (d.target as Node).x || 0)
        .attr('y2', d => (d.target as Node).y || 0);

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    // 초기 위치 안정화
    simulation.alpha(0.5).restart();

    return () => {
      simulation.stop();
    };
  }, [data, dimensions, selectedNodeId, highlightedCategory, highlightedYear, onNodeClick]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl overflow-hidden">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />

      {/* 호버 툴팁 */}
      {hoveredNode && (
        <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg p-4 shadow-xl border border-slate-200 max-w-md">
          <h3 className="font-medium text-slate-800 text-lg leading-tight">
            {hoveredNode.title}
          </h3>
          <div className="flex items-center gap-2 mt-2 text-sm">
            <span
              className="px-2 py-0.5 rounded-full text-white text-xs"
              style={{ backgroundColor: getCategoryColor(hoveredNode.category) }}
            >
              {hoveredNode.category || '미분류'}
            </span>
            <span className="text-slate-500 font-mono text-xs">
              {hoveredNode.pub_date?.slice(0, 10) || hoveredNode.year}
            </span>
          </div>
        </div>
      )}

      {/* 범례 */}
      <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-sm rounded-lg p-3 text-xs text-white/80">
        <div className="font-medium mb-2 text-white/90">카테고리</div>
        <div className="space-y-1">
          {Object.entries(categoryColors).filter(([k]) => k !== 'default').map(([name, color]) => (
            <div key={name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span>{name.replace('주제별 글모음', '주제별')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 조작 안내 */}
      <div className="absolute bottom-4 right-4 text-xs text-white/50">
        드래그: 이동 · 스크롤: 확대/축소 · 클릭: 글 보기
      </div>
    </div>
  );
}

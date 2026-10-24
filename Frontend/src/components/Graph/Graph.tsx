import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { useMemoryData } from './useMemoryData';
import { useForceSimulation } from './useForceSimulation';
import type { GraphProps, ForceNode, ForceLink } from './types';

const DEFAULT_KIND_COLORS: Record<string, string> = {
  decision: '#1d4ed8',
  bug_fix: '#dc2626',
  lesson: '#7c3aed',
  convention: '#ca8a04',
  constraint: '#059669',
  reference: '#6b7280',
  task_outcome: '#db2777',
  fact: '#7f9cf5',
  fix: '#d9a441',
  note: '#9a9a9a'
};

export function Graph({
  projectId,
  onNodeClick,
  nodeRadius,
  showLabels,
  kindColors,
  status,
  kind,
  subject,
  query,
  limit,
  className,
  style
}: GraphProps) {
  const radius = nodeRadius ?? 20;
  const [showLabelsState, setShowLabelsState] = useState(showLabels ?? true);
  useEffect(() => {
    setShowLabelsState(showLabels ?? true);
  }, [showLabels]);

  const colors = { ...DEFAULT_KIND_COLORS, ...(kindColors ?? {}) };
  const colorFor = (k?: string) => (k && colors[k]) || '#6366f1';

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [transform, setTransform] = useState('translate(0,0) scale(1)');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setDimensions({ width: el.clientWidth || 800, height: el.clientHeight || 600 });
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { memories, edges: relEdges, loading, error } = useMemoryData({
    projectId,
    status,
    kind,
    subject,
    query,
    limit
  });

  const nodes = useMemo<ForceNode[]>(() => {
    return memories.map((m) => ({
      id: String(m.id),
      label: String(m.title ?? m.statement ?? m.summary ?? m.id),
      kind: m.kind,
      status: m.status
    }));
  }, [memories]);

  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo<ForceLink[]>(
    () => relEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
    [relEdges, nodeIds]
  );

  const { simulationRef, positions } = useForceSimulation(nodes, edges, dimensions.width, dimensions.height, {
    nodeRadius: radius
  });

  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId) return set;
    set.add(selectedId);
    edges.forEach((e) => {
      if (e.source === selectedId) set.add(e.target);
      if (e.target === selectedId) set.add(e.source);
    });
    return set;
  }, [selectedId, edges]);

  // Zoom
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (ev: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        setTransform(`translate(${ev.transform.x},${ev.transform.y}) scale(${ev.transform.k})`);
      });
    svg.call(zoom as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void);
    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  // Drag
  useEffect(() => {
    if (!svgRef.current || !simulationRef.current) return;
    const sim = simulationRef.current;
    const svg = d3.select(svgRef.current);
    const drag = d3
      .drag<SVGGElement, ForceNode>()
      .on('start', (event: d3.D3DragEvent<SVGGElement, ForceNode, unknown>) => {
        const d = event.subject as ForceNode;
        if (!event.active) sim.alphaTarget(0.3).restart();
        const n = sim.nodes().find((x) => x.id === d.id);
        if (n) {
          n.fx = n.x;
          n.fy = n.y;
        }
      })
      .on('drag', (event: d3.D3DragEvent<SVGGElement, ForceNode, unknown>) => {
        const d = event.subject as ForceNode;
        const n = sim.nodes().find((x) => x.id === d.id);
        if (n) {
          n.fx = event.x;
          n.fy = event.y;
        }
      })
      .on('end', (event: d3.D3DragEvent<SVGGElement, ForceNode, unknown>) => {
        const d = event.subject as ForceNode;
        if (!event.active) sim.alphaTarget(0);
        const n = sim.nodes().find((x) => x.id === d.id);
        if (n) {
          n.fx = null;
          n.fy = null;
        }
      });
    svg.selectAll<SVGGElement, ForceNode>('g.node').data(nodes, (d: ForceNode) => d.id).call(drag);
  }, [nodes]);

  const handleNodeClick = useCallback(
    (id: string) => {
      setSelectedId(id);
      onNodeClick?.(id);
    },
    [onNodeClick]
  );

  const highlightEdge = useCallback(
    (e: ForceLink) => {
      if (!selectedId) return 1;
      return e.source === selectedId || e.target === selectedId ? 1 : 0.15;
    },
    [selectedId]
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', ...(style ?? {}) }}
      role="img"
      aria-label="Memory relationship graph"
    >
      {loading && (
        <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 12, zIndex: 2 }}>Loading...</div>
      )}
      {error && (
        <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 12, color: '#dc2626', zIndex: 2 }}>
          {error}
        </div>
      )}
      {!loading && nodes.length === 0 && !error && (
        <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 12, zIndex: 2 }}>No nodes to display.</div>
      )}
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }}>
        <g transform={transform}>
          {edges.map((e, i) => {
            const s = positions.get(e.source);
            const t = positions.get(e.target);
            if (!s || !t) return null;
            return (
              <line
                key={`edge-${e.source}-${e.target}-${i}`}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke="var(--border, #9ca3af)"
                strokeWidth={1.5}
                opacity={highlightEdge(e)}
              />
            );
          })}
          {nodes.map((n) => {
            const p = positions.get(n.id) ?? { x: dimensions.width / 2, y: dimensions.height / 2 };
            const opacity = selectedId ? (neighbors.has(n.id) ? 1 : 0.25) : 1;
            return (
              <g
                key={n.id}
                className="node"
                transform={`translate(${p.x},${p.y})`}
                tabIndex={0}
                aria-label={n.label}
                style={{ cursor: 'grab', opacity }}
                onClick={() => handleNodeClick(n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNodeClick(n.id);
                }}
              >
                <circle
                  r={radius}
                  fill={colorFor(n.kind)}
                  stroke={n.status === 'suggested' ? '#f59e0b' : 'var(--border, #9ca3af)'}
                  strokeWidth={1.5}
                  strokeDasharray={n.status === 'suggested' ? '4,3' : undefined}
                />
                {showLabelsState && (
                  <text dx={radius + 4} dy={4} fontSize={11} fill="var(--text, #111827)">
                    {String(n.label).slice(0, 28)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
export default Graph;

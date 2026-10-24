import { useStore } from '../lib/store';
import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

const NODE_RADIUS_BASE = 8;

export default function GraphView() {
  const { graphData, loadGraph, includeUnreviewedGraph, setIncludeUnreviewedGraph, openItem } = useStore();
  const [view, setView] = useState<'graph' | 'table'>('graph');
  const [localMode, setLocalMode] = useState(false);
  const [centerId, setCenterId] = useState<string | undefined>(undefined);
  const [depth, setDepth] = useState(2);
  const [search, setSearch] = useState('');
  const [showLabels, setShowLabels] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [colorByKind, setColorByKind] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<any>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const zoomRef = useRef<any>(null);

  // filters
  const [kindFilter, setKindFilter] = useState<string[]>([]);
  const [statusFilter] = useState<string[]>([]);
  const kinds = useMemo(() => Array.from(new Set(graphData.nodes.map((n: any) => n.kind).filter(Boolean))), [graphData]);
  void kinds;

  // reload data when filters change
  useEffect(() => {
    setLoading(true);
    setError(null);
    try {
      loadGraph({
        includeUnreviewed: includeUnreviewedGraph,
        kinds: kindFilter.length ? kindFilter : undefined,
        statuses: statusFilter.length ? statusFilter : undefined,
        centerId: localMode ? centerId : undefined,
        depth: localMode ? depth : undefined,
        q: search || undefined,
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, [includeUnreviewedGraph, kindFilter, statusFilter, localMode, centerId, depth, search]);

  // render graph
  useEffect(() => {
    if (view !== 'graph' || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (ev: any) => g.attr('transform', ev.transform));
    svg.call(zoom as any);
    zoomRef.current = zoom;

    const nodes: any[] = graphData.nodes.map((n: any) => {
      const cached = positionsRef.current.get(n.id);
      const deg = graphData.edges.filter((e: any) => e.from === n.id || e.to === n.id).length;
      const isRoot = (n.id || '').startsWith('root_');
      return { ...n, x: isRoot ? width / 2 : (cached?.x ?? undefined), y: isRoot ? height / 2 : (cached?.y ?? undefined), degree: deg, isRoot };
    });
    const links: any[] = graphData.edges.map((e: any) => ({ source: e.from, target: e.to, type: e.type }));

    // degree map
    const degreeMap = new Map<string, number>();
    nodes.forEach(n => degreeMap.set(n.id, 0));
    links.forEach(l => { degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1); degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1); });

    const radiusFor = (n: any) => NODE_RADIUS_BASE + Math.min(12, (degreeMap.get(n.id) || 0) * 1.5);

    // color by kind
    const colorFor = (n: any) => {
      if (!colorByKind) return 'var(--accent)';
      if (n.type === 'resource') return 'var(--status-approved)';
      const palette: Record<string, string> = {
        decision: '#8b7cf6', fact: '#7f9cf5', convention: '#5bb98c', fix: '#d9a441', constraint: '#e0676b', note: '#9a9a9a',
      };
      return palette[n.kind] || 'var(--accent)';
    };

    // clustering centers by kind
    const kindsList = Array.from(new Set(nodes.map(n => n.kind || n.type)));
    const clusterCenters = new Map<string, { x: number; y: number }>();
    const radius = Math.min(width, height) * 0.35;
    kindsList.forEach((k, i) => {
      const angle = (i / kindsList.length) * 2 * Math.PI;
      clusterCenters.set(k, { x: width / 2 + radius * Math.cos(angle), y: height / 2 + radius * Math.sin(angle) });
    });

    // simulation
    if (simRef.current) simRef.current.stop();
    // root node fixed at center
    nodes.forEach((n: any) => { if (n.isRoot) { n.fx = width / 2; n.fy = height / 2; } });

    const radiusByDepth = (d: any) => {
      const depth = d.depth ?? 1;
      if (depth <= 0) return 0;
      if (depth === 1) return 110;
      if (depth === 2) return 200;
      return 290;
    };

    const sim = d3.forceSimulation(nodes as any)
      .velocityDecay(0.35)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance((d: any) => {
        if (d.type === 'contains') return 100;
        if (d.type === 'conflicts_with') return 180;
        return 110;
      }).strength((d: any) => d.type === 'contains' ? 0.7 : 0.5))
      .force('charge', d3.forceManyBody().strength((d: any) => d.isRoot ? -800 : -220))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('radial', d3.forceRadial((d: any) => radiusByDepth(d), width / 2, height / 2).strength((d: any) => d.isRoot ? 0 : 0.35))
      .force('collide', d3.forceCollide().radius((d: any) => radiusFor(d) + 6).iterations(2))
      .force('rootAttraction', d3.forceX(width / 2).strength((d: any) => d.isRoot ? 0 : 0.04))
      .force('rootAttractionY', d3.forceY(height / 2).strength((d: any) => d.isRoot ? 0 : 0.04));

    simRef.current = sim;

    // edges
    const linkSel = g.append('g').attr('class', 'links').selectAll('line').data(showEdges ? links : []).enter().append('line')
      .attr('stroke', (d: any) => d.type === 'conflicts_with' ? 'var(--status-conflict)' : d.type === 'contains' ? 'var(--text-muted)' : 'var(--border)')
      .attr('stroke-dasharray', (d: any) => d.type === 'conflicts_with' ? '6,4' : d.type === 'contains' ? '3,3' : null)
      .attr('stroke-width', 1.5)
      .attr('marker-end', (d: any) => (d.type === 'fixes' || d.type === 'depends_on') ? 'url(#arrow)' : null);

    // arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrow').attr('viewBox', '0 -5 10 10').attr('refX', 18).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'var(--text-muted)');

    // nodes
    const nodeSel = g.append('g').attr('class', 'nodes').selectAll('g').data(nodes).enter().append('g')
      .attr('tabindex', 0)
      .attr('aria-label', (d: any) => d.label)
      .style('cursor', 'grab')
      .call(d3.drag<any, any>()
        .on('start', (ev, d) => { if (d.isRoot) return; if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (ev, d) => { if (d.isRoot) return; d.fx = ev.x; d.fy = ev.y; })
        .on('end', (ev, d) => { if (d.isRoot) return; if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; positionsRef.current.set(d.id, { x: d.x, y: d.y }); }))
      .on('click', (_ev: any, d: any) => { setSelectedId(d.id); openItem(d.id); })
      .on('dblclick', (_ev: any, d: any) => openItem(d.id))
      .on('mouseover', (ev: any, d: any) => setTooltip({ x: ev.pageX, y: ev.pageY, node: d }))
      .on('mouseout', () => setTooltip(null));

    nodeSel.append('circle')
      .attr('r', (d: any) => d.isRoot ? radiusFor(d) + 8 : radiusFor(d))
      .attr('fill', (d: any) => d.isRoot ? 'var(--accent-2, #7f9cf5)' : colorFor(d))
      .attr('stroke', (d: any) => d.status === 'suggested' ? 'var(--status-unreviewed)' : 'var(--border)')
      .attr('stroke-dasharray', (d: any) => d.status === 'suggested' ? '4,3' : null)
      .attr('stroke-width', 1.5);

    if (showLabels) {
      nodeSel.append('text')
        .attr('dx', (d: any) => radiusFor(d) + 4)
        .attr('dy', 4)
        .attr('font-size', 11)
        .attr('fill', 'var(--text)')
        .text((d: any) => (d.label || '').slice(0, 28));
    }

    // highlight selected neighbors
    const highlight = (id: string | null) => {
      if (!id) {
        nodeSel.attr('opacity', 1);
        linkSel.attr('opacity', 1);
        return;
      }
      const neighbors = new Set<string>([id]);
      links.forEach(l => { if (l.source.id === id || l.source === id) neighbors.add(l.target.id || l.target); if (l.target.id === id || l.target === id) neighbors.add(l.source.id || l.source); });
      nodeSel.attr('opacity', (d: any) => neighbors.has(d.id) ? 1 : 0.25);
      linkSel.attr('opacity', (d: any) => (d.source.id || d.source) === id || (d.target.id || d.target) === id ? 1 : 0.15);
    };
    highlight(selectedId);

    // search highlight
    if (search) {
      const ql = search.toLowerCase();
      nodeSel.attr('opacity', (d: any) => (d.label || '').toLowerCase().includes(ql) || (d.id || '').toLowerCase().includes(ql) ? 1 : 0.2);
    }

    sim.on('tick', () => {
      linkSel
        .attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      nodeSel.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    sim.on('end', () => {
      nodes.forEach(n => positionsRef.current.set(n.id, { x: n.x, y: n.y }));
    });

    return () => { sim.stop(); };
  }, [graphData, view, openItem, showLabels, showEdges, colorByKind, selectedId, search]);

  // reset viewport
  const resetView = () => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(500).call(zoomRef.current.transform, d3.zoomIdentity);
  };

  const kindOptions = ['decision', 'fact', 'convention', 'fix', 'constraint', 'note'];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={includeUnreviewedGraph} onChange={e => setIncludeUnreviewedGraph(e.target.checked)} /> Include unreviewed</label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={localMode} onChange={e => { setLocalMode(e.target.checked); if (!e.target.checked) setCenterId(undefined); }} /> Local graph
        </label>
        {localMode && (
          <>
            <input value={centerId || ''} onChange={e => setCenterId(e.target.value || undefined)} placeholder="Center node id" className="text-xs bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 w-32" />
            <select value={depth} onChange={e => setDepth(Number(e.target.value))} className="text-xs bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1">
              <option value={1}>depth 1</option>
              <option value={2}>depth 2</option>
              <option value={3}>depth 3</option>
            </select>
          </>
        )}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes..." className="text-xs bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 w-32" />
        <select multiple value={kindFilter} onChange={e => setKindFilter(Array.from(e.target.selectedOptions).map(o => o.value))} className="text-xs bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1">
          {kindOptions.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <div className="ml-auto flex gap-1 flex-wrap">
          <button onClick={() => setShowLabels(s => !s)} className={`px-2 py-1 text-xs rounded ${showLabels ? 'bg-[var(--bg-elevated)]' : ''}`}>Labels</button>
          <button onClick={() => setShowEdges(s => !s)} className={`px-2 py-1 text-xs rounded ${showEdges ? 'bg-[var(--bg-elevated)]' : ''}`}>Edges</button>
          <button onClick={() => setColorByKind(s => !s)} className={`px-2 py-1 text-xs rounded ${colorByKind ? 'bg-[var(--bg-elevated)]' : ''}`}>Colors</button>
          <button onClick={resetView} className="px-2 py-1 text-xs rounded border border-[var(--border)]">Reset view</button>
          <button onClick={() => setView('graph')} className={`px-2 py-1 text-xs rounded ${view === 'graph' ? 'bg-[var(--bg-elevated)]' : ''}`}>Graph</button>
          <button onClick={() => setView('table')} className={`px-2 py-1 text-xs rounded ${view === 'table' ? 'bg-[var(--bg-elevated)]' : ''}`}>Table</button>
        </div>
      </div>
      {graphData.truncated && <div className="px-4 py-1 text-xs text-[var(--status-unreviewed)]">Showing {graphData.nodes.length} of {graphData.total}. Narrow by kind or subject.</div>}
      {loading && <div className="px-4 py-1 text-xs text-[var(--text-muted)]">Loading...</div>}
      {error && <div className="px-4 py-1 text-xs text-[var(--status-conflict)]">{error}</div>}
      {graphData.nodes.length === 0 && !loading && <div className="px-4 py-2 text-sm text-[var(--text-muted)]">No nodes to display.</div>}
      {view === 'graph' ? (
        <div className="flex-1 relative min-h-0">
          <svg ref={svgRef} className="w-full h-full" />
          {tooltip && (
            <div className="absolute pointer-events-none bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-xs" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
              <div className="font-medium">{tooltip.node.label}</div>
              <div className="text-[var(--text-muted)]">{tooltip.node.id} · {tooltip.node.type}{tooltip.node.status ? ` · ${tooltip.node.status}` : ''}</div>
              <div className="text-[var(--text-muted)]">degree: {tooltip.node.degree}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <h3 className="text-sm font-semibold mb-2">Nodes</h3>
          <table className="w-full text-sm border-collapse">
            <thead><tr><th className="text-left border-b border-[var(--border)] p-1">ID</th><th className="text-left border-b border-[var(--border)] p-1">Type</th><th className="text-left border-b border-[var(--border)] p-1">Label</th><th className="text-left border-b border-[var(--border)] p-1">Status</th><th className="text-left border-b border-[var(--border)] p-1">Degree</th></tr></thead>
            <tbody>
              {graphData.nodes.map((n: any) => (
                <tr key={n.id} tabIndex={0} className="hover:bg-[var(--bg-elevated)] cursor-pointer" onClick={() => openItem(n.id)} onKeyDown={e => { if (e.key === 'Enter') openItem(n.id); }}>
                  <td className="p-1">{n.id}</td><td className="p-1">{n.type}</td><td className="p-1">{n.label}</td><td className="p-1">{n.status}</td><td className="p-1">{n.degree}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="text-sm font-semibold mt-4 mb-2">Edges</h3>
          <table className="w-full text-sm border-collapse">
            <thead><tr><th className="text-left border-b border-[var(--border)] p-1">From</th><th className="text-left border-b border-[var(--border)] p-1">To</th><th className="text-left border-b border-[var(--border)] p-1">Type</th></tr></thead>
            <tbody>
              {graphData.edges.map((e: any, i: number) => (
                <tr key={i}><td className="p-1">{e.from}</td><td className="p-1">{e.to}</td><td className="p-1">{e.type}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

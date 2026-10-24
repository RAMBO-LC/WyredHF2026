import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { ForceNode, ForceLink } from './types';

export interface UseForceSimulationOptions {
  nodeRadius?: number;
}

export function useForceSimulation(
  nodes: ForceNode[],
  links: ForceLink[],
  width: number,
  height: number,
  options?: UseForceSimulationOptions
) {
  const simulationRef = useRef<d3.Simulation<ForceNode, ForceLink> | null>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const nodeRadius = options?.nodeRadius ?? 20;

  const nodeKey = nodes.map((n) => n.id).join('|');
  const linkKey = links.map((l) => `${l.source}->${l.target}`).join('|');

  useEffect(() => {
    if (!width || !height || nodes.length === 0) return;

    const simNodes: ForceNode[] = nodes.map((n) => {
      const cached = positions.get(n.id);
      return {
        ...n,
        x: cached?.x ?? width / 2 + (Math.random() - 0.5) * 20,
        y: cached?.y ?? height / 2 + (Math.random() - 0.5) * 20
      };
    });
    const simLinks = links.map((l) => ({ ...l }));

    const sim = d3
      .forceSimulation<ForceNode>(simNodes)
      .velocityDecay(0.35)
      .force(
        'link',
        d3
          .forceLink<ForceNode, ForceLink>(simLinks)
          .id((d) => d.id)
          .distance(110)
          .strength(0.5)
      )
      .force('charge', d3.forceManyBody<ForceNode>().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collide', d3.forceCollide<ForceNode>().radius(nodeRadius + 6).iterations(2));

    simulationRef.current = sim;

    let frame = 0;
    sim.on('tick', () => {
      frame += 1;
      if (frame % 2 !== 0) return;
      const m = new Map<string, { x: number; y: number }>();
      sim.nodes().forEach((n) => {
        if (n.x != null && n.y != null) m.set(n.id, { x: n.x, y: n.y });
      });
      setPositions(m);
    });
    sim.on('end', () => {
      const m = new Map<string, { x: number; y: number }>();
      sim.nodes().forEach((n) => {
        if (n.x != null && n.y != null) m.set(n.id, { x: n.x, y: n.y });
      });
      setPositions(m);
    });

    return () => {
      sim.stop();
      simulationRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, linkKey, width, height, nodeRadius]);

  return { simulationRef, positions };
}
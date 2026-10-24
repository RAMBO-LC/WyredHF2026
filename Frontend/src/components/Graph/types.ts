export interface TBMemory {
  id: string;
  title?: string;
  statement?: string;
  summary?: string;
  kind?: string;
  status?: string;
  tags?: string[];
  project_id?: string;
  projectId?: string;
  path?: string;
  [key: string]: unknown;
}

export interface TBRelationship {
  id?: string;
  fromMemoryId?: string;
  toMemoryId?: string;
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  type?: string;
  [key: string]: unknown;
}

export interface ForceNode {
  id: string;
  label: string;
  kind?: string;
  status?: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface ForceLink {
  source: string;
  target: string;
  type?: string;
}

export interface GraphProps {
  projectId: string;
  onNodeClick?: (nodeId: string) => void;
  nodeRadius?: number;
  showLabels?: boolean;
  kindColors?: Record<string, string>;
  status?: string | string[];
  kind?: string | string[];
  subject?: string;
  query?: string;
  limit?: number;
  className?: string;
  style?: React.CSSProperties;
}
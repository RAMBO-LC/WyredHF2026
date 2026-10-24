import { useState, useEffect, useCallback } from 'react';
import type { TBMemory, TBRelationship, ForceLink } from './types';

export interface UseMemoryDataOptions {
  projectId: string;
  status?: string | string[];
  kind?: string | string[];
  subject?: string;
  query?: string;
  limit?: number;
}

const API_BASE = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? '';

function normalizeMemories(payload: unknown): TBMemory[] {
  if (Array.isArray(payload)) return payload as TBMemory[];
  const obj = payload as { data?: unknown; memories?: unknown } | null;
  if (obj && Array.isArray(obj.data)) return obj.data as TBMemory[];
  if (obj && Array.isArray(obj.memories)) return obj.memories as TBMemory[];
  return [];
}

function normalizeRelationships(payload: unknown): TBRelationship[] {
  if (Array.isArray(payload)) return payload as TBRelationship[];
  const obj = payload as { data?: unknown; relationships?: unknown } | null;
  if (obj && Array.isArray(obj.data)) return obj.data as TBRelationship[];
  if (obj && Array.isArray(obj.relationships)) return obj.relationships as TBRelationship[];
  return [];
}

export function useMemoryData(optionsOrProjectId: string | UseMemoryDataOptions) {
  const opts: UseMemoryDataOptions =
    typeof optionsOrProjectId === 'string'
      ? { projectId: optionsOrProjectId }
      : optionsOrProjectId;

  const [memories, setMemories] = useState<TBMemory[]>([]);
  const [relationships, setRelationships] = useState<Record<string, TBRelationship[]>>({});
  const [edges, setEdges] = useState<ForceLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!opts.projectId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('projectId', opts.projectId);
      const statuses = opts.status ? (Array.isArray(opts.status) ? opts.status : [opts.status]) : [];
      statuses.forEach((s) => params.append('status', s));
      const kinds = opts.kind ? (Array.isArray(opts.kind) ? opts.kind : [opts.kind]) : [];
      kinds.forEach((k) => params.append('kind', k));
      if (opts.subject) params.set('subject', opts.subject);
      if (opts.query) params.set('query', opts.query);
      if (opts.limit) params.set('limit', String(opts.limit));

      const res = await fetch(`${API_BASE}/v1/memories?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const mems = normalizeMemories(json);
      setMemories(mems);

      const relMap: Record<string, TBRelationship[]> = {};
      const edgeList: ForceLink[] = [];
      await Promise.all(
        mems.map(async (m) => {
          try {
            const r = await fetch(
              `${API_BASE}/v1/memories/${encodeURIComponent(String(m.id))}/relationships?projectId=${encodeURIComponent(opts.projectId)}`
            );
            if (!r.ok) return;
            const j = await r.json();
            const rels = normalizeRelationships(j);
            relMap[String(m.id)] = rels;
            rels.forEach((rel) => {
              const from = String(rel.fromMemoryId ?? rel.from ?? rel.source ?? m.id);
              const toCandidate = rel.toMemoryId ?? rel.to ?? rel.target;
              if (toCandidate == null) return;
              const to = String(toCandidate);
              edgeList.push({ source: from, target: to, type: String(rel.type ?? 'related_to') });
            });
          } catch {
            // ignore per-memory relationship failures
          }
        })
      );
      setRelationships(relMap);
      const seen = new Set<string>();
      const deduped = edgeList.filter((e) => {
        const key = `${e.source}->${e.target}:${e.type ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setEdges(deduped);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, [
    opts.projectId,
    JSON.stringify(opts.status),
    JSON.stringify(opts.kind),
    opts.subject,
    opts.query,
    opts.limit
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { memories, relationships, edges, loading, error, refetch: fetchData };
}
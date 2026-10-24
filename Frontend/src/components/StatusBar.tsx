import { useStore } from '../lib/store';
import { api } from '../api/mock';

export default function StatusBar() {
  const { selectedId } = useStore();
  const s = api.getStatus();
  return (
    <footer className="h-7 bg-[var(--bg-ribbon)] border-t border-[var(--border)] flex items-center px-3 text-xs text-[var(--text-muted)] gap-4">
      <span>Project: team-brain</span>
      <span>Extractor: {s.extractor} {s.extractor_version}</span>
      <span>API: {s.api} · DB: {s.db}</span>
      <span>Approved: {s.approved_count} / Unreviewed: {s.unreviewed_count}</span>
      <span className="ml-auto">{selectedId || ''}</span>
    </footer>
  );
}

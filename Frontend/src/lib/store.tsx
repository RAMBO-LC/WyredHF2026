import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/mock';

export type RibbonKey = 'files' | 'search' | 'graph' | 'chat' | 'context' | 'review' | 'packs' | 'settings' | 'people' | 'sharing';
export interface Tab { id: string; title: string; type: 'note' | 'graph' | 'chat' | 'context' | 'review' | 'packs' | 'search' | 'settings' | 'people' | 'sharing'; itemId?: string; }
export interface StoreCtx {
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  ribbon: RibbonKey;
  setRibbon: (r: RibbonKey) => void;
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  selectedId: string | null;
  openItem: (id: string) => void;
  tree: any[];
  status: any;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: any[];
  runSearch: (q: string) => void;
  graphData: any;
  loadGraph: (opts?: any) => void;
  includeUnreviewedGraph: boolean;
  setIncludeUnreviewedGraph: (b: boolean) => void;
  chatThreads: any[];
  refreshThreads: () => void;
  quickSwitcherOpen: boolean;
  setQuickSwitcherOpen: (b: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (b: boolean) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });
  const [ribbon, setRibbon] = useState<RibbonKey>('files');
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'tab-home', title: 'Home', type: 'note' }]);
  const [activeTabId, setActiveTabId] = useState<string | null>('tab-home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tree, setTree] = useState<any[]>([]);
  const [status] = useState<any>(api.getStatus());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<any>({ nodes: [], edges: [], truncated: false, total: 0 });
  const [includeUnreviewedGraph, setIncludeUnreviewedGraph] = useState(false);
  const [chatThreads, setChatThreads] = useState<any[]>([]);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const setTheme = (t: 'dark' | 'light') => { setThemeState(t); localStorage.setItem('theme', t); };
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => { setTree(api.getVaultTree()); setChatThreads(api.listThreads()); }, []);

  const openTab = useCallback((tab: Tab) => {
    setTabs(prev => {
      const exists = prev.find(t => t.id === tab.id);
      if (exists) { setActiveTabId(tab.id); return prev; }
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTabId === id) setActiveTabId(next.length ? next[next.length - 1].id : null);
      return next;
    });
  }, [activeTabId]);

  const openItem = useCallback((id: string) => {
    setSelectedId(id);
    openTab({ id: `tab-${id}`, title: id, type: 'note', itemId: id });
  }, [openTab]);

  const runSearch = useCallback((q: string) => {
    setSearchQuery(q);
    setSearchResults(api.search(q));
  }, []);

  const loadGraph = useCallback((opts?: any) => {
    setGraphData(api.getGraph(opts));
  }, []);

  const refreshThreads = useCallback(() => setChatThreads(api.listThreads()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); setQuickSwitcherOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommandPaletteOpen(true); }
      if (e.key === 'Escape') { setQuickSwitcherOpen(false); setCommandPaletteOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value: StoreCtx = {
    theme, setTheme, ribbon, setRibbon, tabs, activeTabId, openTab, closeTab, setActiveTab: setActiveTabId,
    selectedId, openItem, tree, status, searchQuery, setSearchQuery, searchResults, runSearch,
    graphData, loadGraph, includeUnreviewedGraph, setIncludeUnreviewedGraph,
    chatThreads, refreshThreads, quickSwitcherOpen, setQuickSwitcherOpen, commandPaletteOpen, setCommandPaletteOpen,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('no store');
  return c;
}

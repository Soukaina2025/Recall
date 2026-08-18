import { useState, useEffect } from 'react';
import { Search, Brain, Clock, TrendingUp, Filter, Sparkles } from 'lucide-react';
import { supabase, type Memory, type MemoryCategory } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/memoryEngine';

const CATEGORY_COLORS: Record<MemoryCategory, { bg: string; text: string; border: string }> = {
  fact: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  preference: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  event: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  skill: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  relationship: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20' },
  goal: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
};

const CATEGORIES: MemoryCategory[] = ['fact', 'preference', 'event', 'skill', 'relationship', 'goal'];

type ScoredMemory = Memory & { _score?: number };

export default function MemoryExplorer() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScoredMemory[] | null>(null);
  const [activeCategory, setActiveCategory] = useState<MemoryCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'important' | 'recalled'>('recent');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

  useEffect(() => {
    loadMemories();
  }, [activeCategory, sortBy]);

  async function loadMemories() {
    let query = supabase.from('memories').select('*');

    if (activeCategory !== 'all') {
      query = query.eq('category', activeCategory);
    }

    if (sortBy === 'recent') {
      query = query.order('created_at', { ascending: false });
    } else if (sortBy === 'important') {
      query = query.order('importance', { ascending: false });
    } else {
      query = query.order('recall_count', { ascending: false });
    }

    const { data } = await query.limit(100);
    if (data) setMemories(data as Memory[]);
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      loadMemories();
      return;
    }

    setIsSearching(true);
    const queryEmbedding = generateEmbedding(searchQuery);

    const { data: allMemories } = await supabase
      .from('memories')
      .select('*')
      .limit(200);

    if (allMemories) {
      const scored = (allMemories as Memory[])
        .map((m) => {
          const emb = m.embedding as unknown as number[] | null;
          let sim = 0;
          if (emb) {
            let dot = 0;
            for (let i = 0; i < queryEmbedding.length; i++) dot += queryEmbedding[i] * emb[i];
            sim = dot;
          }
          return { ...m, _score: sim + m.importance * 0.05 };
        })
        .sort((a, b) => (b._score || 0) - (a._score || 0))
        .slice(0, 20);

      setSearchResults(scored);
    }
    setIsSearching(false);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }

  const displayMemories = searchResults ?? memories;

  return (
    <div className="h-full flex flex-col">
      {/* Search bar */}
      <div className="border-b border-border p-6 bg-surface/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-semibold text-white">Memory Explorer</h2>
            <span className="text-xs text-text-dim ml-auto">{displayMemories.length} memories</span>
          </div>

          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Semantic search across all memories..."
                className="input-field pl-10"
              />
            </div>
            <button onClick={handleSearch} className="btn-primary text-sm px-5">
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-text-dim" />
            <button
              onClick={() => { setActiveCategory('all'); setSearchResults(null); }}
              className={`chip transition-colors ${activeCategory === 'all' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface-2 text-text-muted border border-transparent hover:border-border'}`}
            >
              All
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setSearchResults(null); }}
                className={`chip transition-colors ${activeCategory === cat ? `${CATEGORY_COLORS[cat].bg} ${CATEGORY_COLORS[cat].text} ${CATEGORY_COLORS[cat].border}` : 'bg-surface-2 text-text-muted border border-transparent hover:border-border'}`}
              >
                {cat}
              </button>
            ))}

            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setSortBy('recent')}
                className={`chip ${sortBy === 'recent' ? 'bg-surface-2 text-primary' : 'bg-transparent text-text-dim hover:text-text-muted'}`}
              >
                <Clock className="w-3 h-3" /> Recent
              </button>
              <button
                onClick={() => setSortBy('important')}
                className={`chip ${sortBy === 'important' ? 'bg-surface-2 text-primary' : 'bg-transparent text-text-dim hover:text-text-muted'}`}
              >
                <TrendingUp className="w-3 h-3" /> Important
              </button>
              <button
                onClick={() => setSortBy('recalled')}
                className={`chip ${sortBy === 'recalled' ? 'bg-surface-2 text-primary' : 'bg-transparent text-text-dim hover:text-text-muted'}`}
              >
                <Sparkles className="w-3 h-3" /> Recalled
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Memory cards */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {displayMemories.length === 0 && (
            <div className="text-center py-20">
              <Brain className="w-12 h-12 text-text-dim mx-auto mb-4" />
              <p className="text-text-muted">No memories yet. Start a conversation to create some.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayMemories.map((mem) => {
              const colors = CATEGORY_COLORS[mem.category];
              const score = searchResults ? ((mem as ScoredMemory)._score || 0) : null;
              return (
                <div
                  key={mem.id}
                  onClick={() => setSelectedMemory(mem)}
                  className="card p-4 hover:border-primary/30 transition-all cursor-pointer group animate-fade-in"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className={`chip ${colors.bg} ${colors.text} ${colors.border}`}>
                      {mem.category}
                    </span>
                    <div className="flex items-center gap-2">
                      {score !== null && (
                        <span className="text-xs font-mono text-accent">
                          {(score * 100).toFixed(0)}%
                        </span>
                      )}
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${i < mem.importance ? 'bg-primary' : 'bg-border'}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-text leading-relaxed mb-3">{mem.content}</p>

                  <div className="flex items-center gap-3 text-xs text-text-dim">
                    <span>{new Date(mem.created_at).toLocaleDateString()}</span>
                    {mem.recall_count > 0 && (
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Recalled {mem.recall_count}x
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Memory detail modal */}
      {selectedMemory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedMemory(null)}
        >
          <div className="glass-strong rounded-2xl p-8 max-w-lg w-full animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className={`chip ${CATEGORY_COLORS[selectedMemory.category].bg} ${CATEGORY_COLORS[selectedMemory.category].text} ${CATEGORY_COLORS[selectedMemory.category].border}`}>
                {selectedMemory.category}
              </span>
              <button onClick={() => setSelectedMemory(null)} className="text-text-dim hover:text-text">
                ✕
              </button>
            </div>
            <p className="text-base text-white leading-relaxed mb-6">{selectedMemory.content}</p>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-text-dim">Importance</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full ${i < selectedMemory.importance ? 'bg-primary' : 'bg-border'}`} />
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim">Recall count</span>
                <span className="text-text">{selectedMemory.recall_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim">Created</span>
                <span className="text-text">{new Date(selectedMemory.created_at).toLocaleString()}</span>
              </div>
              {selectedMemory.last_recalled_at && (
                <div className="flex justify-between">
                  <span className="text-text-dim">Last recalled</span>
                  <span className="text-text">{new Date(selectedMemory.last_recalled_at).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-dim">Embedding dim</span>
                <span className="text-text font-mono">1536</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

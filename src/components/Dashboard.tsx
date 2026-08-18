import { useState, useEffect } from 'react';
import { Brain, Network, Sparkles, TrendingUp, Clock, Layers, RefreshCw, Zap, Activity } from 'lucide-react';
import { supabase, type Memory, type Reflection } from '@/lib/supabase';
import { consolidateMemories } from '@/lib/memoryEngine';

const CATEGORY_COLORS: Record<string, string> = {
  fact: '#3b82f6',
  preference: '#10b981',
  event: '#f59e0b',
  skill: '#06b6d4',
  relationship: '#ec4899',
  goal: '#8b5cf6',
};

export default function Dashboard({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState({
    totalMemories: 0,
    totalConversations: 0,
    totalMessages: 0,
    totalLinks: 0,
    avgImportance: 0,
    totalRecalls: 0,
  });
  const [categoryDist, setCategoryDist] = useState<{ category: string; count: number }[]>([]);
  const [recentMemories, setRecentMemories] = useState<Memory[]>([]);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [consolidationResult, setConsolidationResult] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, [refreshKey]);

  async function loadStats() {
    const { count: memCount } = await supabase.from('memories').select('*', { count: 'exact', head: true });
    const { count: convCount } = await supabase.from('conversations').select('*', { count: 'exact', head: true });
    const { count: msgCount } = await supabase.from('messages').select('*', { count: 'exact', head: true });
    const { count: linkCount } = await supabase.from('memory_links').select('*', { count: 'exact', head: true });

    const { data: allMemories } = await supabase.from('memories').select('*');
    const memList = (allMemories || []) as Memory[];

    const avgImp = memList.length > 0
      ? memList.reduce((s, m) => s + m.importance, 0) / memList.length
      : 0;
    const totalRecalls = memList.reduce((s, m) => s + m.recall_count, 0);

    setStats({
      totalMemories: memCount || 0,
      totalConversations: convCount || 0,
      totalMessages: msgCount || 0,
      totalLinks: linkCount || 0,
      avgImportance: avgImp,
      totalRecalls,
    });

    // Category distribution
    const dist: Record<string, number> = {};
    for (const m of memList) {
      dist[m.category] = (dist[m.category] || 0) + 1;
    }
    setCategoryDist(Object.entries(dist).map(([category, count]) => ({ category, count })));

    // Recent memories
    const { data: recent } = await supabase.from('memories').select('*').order('created_at', { ascending: false }).limit(5);
    if (recent) setRecentMemories(recent as Memory[]);

    // Reflections
    const { data: refData } = await supabase.from('memory_reflections').select('*').order('created_at', { ascending: false }).limit(3);
    if (refData) setReflections(refData as Reflection[]);
  }

  async function handleConsolidate() {
    setIsConsolidating(true);
    setConsolidationResult(null);
    const result = await consolidateMemories();
    setConsolidationResult(result.reflection);
    setIsConsolidating(false);
    loadStats();
  }

  const statCards = [
    { label: 'Total Memories', value: stats.totalMemories, icon: Brain, color: 'text-primary' },
    { label: 'Conversations', value: stats.totalConversations, icon: Layers, color: 'text-accent' },
    { label: 'Messages', value: stats.totalMessages, icon: Activity, color: 'text-primary-light' },
    { label: 'Graph Links', value: stats.totalLinks, icon: Network, color: 'text-accent' },
    { label: 'Avg Importance', value: `${stats.avgImportance.toFixed(1)}/5`, icon: TrendingUp, color: 'text-primary' },
    { label: 'Total Recalls', value: stats.totalRecalls, icon: Sparkles, color: 'text-accent' },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-semibold text-white">Memory Dashboard</h2>
          </div>
          <button
            onClick={handleConsolidate}
            disabled={isConsolidating}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {isConsolidating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Consolidating...
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                Run Consolidation
              </>
            )}
          </button>
        </div>

        {/* Consolidation result */}
        {consolidationResult && (
          <div className="card p-4 border-primary/30 animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium text-white mb-1">Reflection Complete</div>
                <p className="text-xs text-text-muted leading-relaxed">{consolidationResult}</p>
              </div>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map((stat, i) => (
            <div key={i} className="card p-4 animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-text-dim">{stat.label}</span>
              </div>
              <div className="font-display text-2xl font-bold text-white">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Category distribution + recent memories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category distribution */}
          <div className="card p-6">
            <h3 className="font-display text-base font-semibold text-white mb-4">Memory Distribution</h3>
            {categoryDist.length === 0 ? (
              <p className="text-sm text-text-dim py-8 text-center">No memories yet</p>
            ) : (
              <div className="space-y-3">
                {categoryDist.map(({ category, count }) => {
                  const max = Math.max(...categoryDist.map((d) => d.count));
                  const pct = (count / max) * 100;
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-text-muted capitalize">{category}</span>
                        <span className="text-xs font-mono text-text-dim">{count}</span>
                      </div>
                      <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: CATEGORY_COLORS[category] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent memories */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-text-dim" />
              <h3 className="font-display text-base font-semibold text-white">Recent Memories</h3>
            </div>
            {recentMemories.length === 0 ? (
              <p className="text-sm text-text-dim py-8 text-center">No memories yet</p>
            ) : (
              <div className="space-y-3">
                {recentMemories.map((mem) => (
                  <div key={mem.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-2/50 hover:bg-surface-2 transition-colors">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: CATEGORY_COLORS[mem.category] }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text leading-snug truncate">{mem.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-text-dim capitalize">{mem.category}</span>
                        <span className="text-xs text-text-dim">·</span>
                        <span className="text-xs text-text-dim">{new Date(mem.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reflections */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-display text-base font-semibold text-white">Agent Reflections</h3>
          </div>
          {reflections.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-text-dim mb-2">No reflections yet.</p>
              <p className="text-xs text-text-dim">Run consolidation to generate a reflection — the agent analyzes its memory store, merges duplicates, and updates importance scores.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reflections.map((ref) => (
                <div key={ref.id} className="p-3 rounded-lg bg-surface-2/50 border-l-2 border-primary/30">
                  <p className="text-sm text-text-muted leading-relaxed">{ref.reflection_text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-text-dim">{new Date(ref.created_at).toLocaleString()}</span>
                    {ref.memories_consolidated > 0 && (
                      <span className="chip bg-primary/10 text-primary border border-primary/20">
                        {ref.memories_consolidated} merged
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

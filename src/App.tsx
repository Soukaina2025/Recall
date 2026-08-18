import { useState } from 'react';
import { Brain, MessageSquare, Network, LayoutDashboard, Home } from 'lucide-react';
import Landing from '@/components/Landing';
import ChatInterface from '@/components/ChatInterface';
import MemoryExplorer from '@/components/MemoryExplorer';
import MemoryGraph from '@/components/MemoryGraph';
import Dashboard from '@/components/Dashboard';

type View = 'landing' | 'chat' | 'explore' | 'graph' | 'dashboard';

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  if (view === 'landing') {
    return <Landing onStart={() => setView('chat')} />;
  }

  const navItems: { id: View; label: string; icon: typeof Brain }[] = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'explore', label: 'Memories', icon: Brain },
    { id: 'graph', label: 'Graph', icon: Network },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* Top nav */}
      <nav className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface/50 backdrop-blur-md z-20">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setView('landing')}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow">
              <Brain className="w-4.5 h-4.5 text-bg" strokeWidth={2.5} />
            </div>
            <span className="font-display text-lg font-bold text-white group-hover:text-primary transition-colors">Recall</span>
          </button>

          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  view === item.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-muted hover:text-text hover:bg-surface-2'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setView('landing')}
          className="flex items-center gap-1.5 text-xs text-text-dim hover:text-text-muted transition-colors"
        >
          <Home className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Home</span>
        </button>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {view === 'chat' && <ChatInterface onMemoriesChanged={triggerRefresh} />}
        {view === 'explore' && <MemoryExplorer />}
        {view === 'graph' && <MemoryGraph />}
        {view === 'dashboard' && <Dashboard refreshKey={refreshKey} />}
      </main>
    </div>
  );
}

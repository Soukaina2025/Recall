import { useState, useEffect, useRef } from 'react';
import { Network, RefreshCw } from 'lucide-react';
import { supabase, type Memory, type MemoryLink } from '@/lib/supabase';

type GraphNode = {
  id: string;
  label: string;
  category: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  importance: number;
};

type GraphEdge = {
  source: string;
  target: string;
  strength: number;
  relation_type: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  fact: '#3b82f6',
  preference: '#10b981',
  event: '#f59e0b',
  skill: '#06b6d4',
  relationship: '#ec4899',
  goal: '#8b5cf6',
};

export default function MemoryGraph() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [links, setLinks] = useState<MemoryLink[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (nodes.length > 0) {
      startSimulation();
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [nodes, edges]);

  async function loadData() {
    const { data: memData } = await supabase.from('memories').select('*').limit(50);
    const { data: linkData } = await supabase.from('memory_links').select('*').limit(100);

    if (memData) setMemories(memData as Memory[]);
    if (linkData) setLinks(linkData as MemoryLink[]);

    // Build graph nodes
    const memList = (memData || []) as Memory[];
    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;

    const graphNodes: GraphNode[] = memList.map((m, i) => {
      const angle = (i / memList.length) * Math.PI * 2;
      const radius = Math.min(width, height) * 0.3;
      return {
        id: m.id,
        label: m.content.slice(0, 30),
        category: m.category,
        x: width / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: height / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        importance: m.importance,
      };
    });

    const graphEdges: GraphEdge[] = (linkData || []).map((l) => ({
      source: (l as MemoryLink).source_id,
      target: (l as MemoryLink).target_id,
      strength: (l as MemoryLink).strength,
      relation_type: (l as MemoryLink).relation_type,
    }));

    setNodes(graphNodes);
    setEdges(graphEdges);
  }

  function startSimulation() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const animate = () => {
      // Force simulation
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 800 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 120;
        const force = (dist - targetDist) * 0.01 * edge.strength;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Center gravity
      for (const node of nodes) {
        node.vx += (width / 2 - node.x) * 0.001;
        node.vy += (height / 2 - node.y) * 0.001;
      }

      // Apply velocity with damping
      for (const node of nodes) {
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;
        // Keep in bounds
        node.x = Math.max(30, Math.min(width - 30, node.x));
        node.y = Math.max(30, Math.min(height - 30, node.y));
      }

      // Draw
      ctx.clearRect(0, 0, width, height);

      // Draw edges
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const isHighlighted = hoveredNode === a.id || hoveredNode === b.id ||
          selectedNode?.id === a.id || selectedNode?.id === b.id;
        ctx.strokeStyle = isHighlighted ? `rgba(16, 185, 129, ${edge.strength * 0.6})` : `rgba(255, 255, 255, ${edge.strength * 0.08})`;
        ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        const color = CATEGORY_COLORS[node.category] || '#6b7280';
        const isHovered = hoveredNode === node.id;
        const isSelected = selectedNode?.id === node.id;
        const radius = 4 + node.importance * 1.5;

        // Glow
        if (isHovered || isSelected) {
          ctx.shadowBlur = 20;
          ctx.shadowColor = color;
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        // Label on hover
        if (isHovered || isSelected) {
          ctx.fillStyle = '#e5e7eb';
          ctx.font = '11px Inter, sans-serif';
          ctx.textAlign = 'center';
          const label = node.label.length > 35 ? node.label.slice(0, 35) + '...' : node.label;
          ctx.fillText(label, node.x, node.y - radius - 6);
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let found: string | null = null;
    for (const node of nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        found = node.id;
        break;
      }
    }
    setHoveredNode(found);
    canvas.style.cursor = found ? 'pointer' : 'default';
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const node of nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        setSelectedNode(selectedNode?.id === node.id ? null : node);
        return;
      }
    }
    setSelectedNode(null);
  }

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Connected nodes to selected
  const connectedNodes = selectedNode
    ? edges
        .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
        .map((e) => (e.source === selectedNode.id ? e.target : e.source))
    : [];

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border p-6 bg-surface/30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Network className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-semibold text-white">Memory Graph</h2>
            <span className="text-xs text-text-dim">{nodes.length} nodes · {edges.length} edges</span>
          </div>
          <button onClick={loadData} className="btn-ghost text-sm flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          className="absolute inset-0"
        />

        {/* Legend */}
        <div className="absolute bottom-4 left-4 glass rounded-xl p-3 space-y-1.5">
          <div className="text-xs text-text-dim mb-2 font-medium">Categories</div>
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="text-xs text-text-muted capitalize">{cat}</span>
            </div>
          ))}
        </div>

        {/* Selected node info */}
        {selectedNode && (
          <div className="absolute top-4 right-4 glass-strong rounded-xl p-4 max-w-xs animate-slide-up">
            <div className="text-xs text-text-dim mb-1 capitalize">{selectedNode.category}</div>
            <p className="text-sm text-white mb-3">{selectedNode.label}{memories.find((m) => m.id === selectedNode.id)?.content.slice(30)}</p>
            <div className="text-xs text-text-muted">
              Importance: {selectedNode.importance}/5 · {connectedNodes.length} connections
            </div>
          </div>
        )}

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Network className="w-12 h-12 text-text-dim mx-auto mb-4" />
              <p className="text-text-muted">No memories to graph yet. Start a conversation first.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

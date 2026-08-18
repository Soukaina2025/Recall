import { Brain, Database, Network, Sparkles, Zap, Shield, ArrowRight, Cpu, GitBranch, Layers } from 'lucide-react';

type Props = {
  onStart: () => void;
};

export default function Landing({ onStart }: Props) {
  return (
    <div className="min-h-screen bg-bg overflow-x-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px] animate-pulse-glow" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow">
            <Brain className="w-5 h-5 text-bg" strokeWidth={2.5} />
          </div>
          <span className="font-display text-xl font-bold text-white">Recall</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="#how" className="text-sm text-text-muted hover:text-text transition-colors hidden sm:block">How it works</a>
          <a href="#architecture" className="text-sm text-text-muted hover:text-text transition-colors hidden sm:block">Architecture</a>
          <button onClick={onStart} className="btn-primary text-sm">
            Launch Agent
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass mb-8 animate-fade-in">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-text-muted">CockroachDB x AWS Hackathon — Agentic Memory</span>
          </div>

          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-bold text-white leading-[1.05] mb-6 animate-slide-up">
            The AI agent that
            <br />
            <span className="gradient-text">never forgets.</span>
          </h1>

          <p className="text-lg sm:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed mb-10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Recall is an autonomous agent with persistent semantic memory powered by CockroachDB's
            distributed vector indexing. It extracts, embeds, and recalls memories across conversations —
            building a living knowledge graph that grows with every interaction.
          </p>

          <div className="flex items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <button onClick={onStart} className="btn-primary text-base px-7 py-3 flex items-center gap-2">
              Start Chatting
              <ArrowRight className="w-4 h-4" />
            </button>
            <a href="#how" className="btn-ghost text-base px-7 py-3">
              See How It Works
            </a>
          </div>
        </div>

        {/* Floating memory visualization */}
        <div className="relative mt-24 max-w-5xl mx-auto animate-fade-in" style={{ animationDelay: '0.4s' }}>
          <div className="glass-strong rounded-2xl p-8 glow">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: Brain, title: 'Extract', desc: 'Agent parses conversations and extracts atomic memories — facts, preferences, goals, events.', color: 'text-primary' },
                { icon: Layers, title: 'Embed & Store', desc: 'Each memory gets a 1536-dim vector embedding stored in CockroachDB with distributed HNSW indexing.', color: 'text-accent' },
                { icon: Network, title: 'Recall & Link', desc: 'Semantic search retrieves relevant memories and links them into a growing knowledge graph.', color: 'text-primary-light' },
              ].map((step, i) => (
                <div key={i} className="relative">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center">
                      <step.icon className={`w-5 h-5 ${step.color}`} />
                    </div>
                    <span className="text-xs font-mono text-text-dim">0{i + 1}</span>
                  </div>
                  <h3 className="font-display text-lg font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-text-muted leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-white mb-4">Memory that compounds</h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            Unlike stateless chatbots, Recall builds a persistent memory layer that gets richer over time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: Database, title: 'Distributed Vector Index', desc: 'CockroachDB stores embeddings with HNSW indexing for fast semantic search at scale. No separate vector store needed.' },
            { icon: GitBranch, title: 'Memory Graph', desc: 'Memories are linked by semantic similarity into a knowledge graph. Related concepts reinforce each other through graph traversal.' },
            { icon: Cpu, title: 'Autonomous Extraction', desc: 'The agent automatically identifies facts, preferences, goals, and events from natural conversation — no manual tagging.' },
            { icon: Zap, title: 'Instant Recall', desc: 'Every query triggers semantic retrieval across all stored memories. The agent remembers what matters, when it matters.' },
            { icon: Shield, title: 'Consolidation Engine', desc: 'Periodic reflection merges duplicate memories, updates importance scores, and prunes low-value entries — just like human sleep.' },
            { icon: Sparkles, title: 'Contextual Responses', desc: 'Responses are grounded in retrieved memories. The agent connects new information to what it already knows about you.' },
          ].map((feature, i) => (
            <div key={i} className="card p-6 hover:border-primary/30 transition-all duration-300 hover:translate-y-[-2px] group">
              <div className="w-11 h-11 rounded-xl bg-surface-2 group-hover:bg-primary/10 flex items-center justify-center mb-4 transition-colors">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-text-muted leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section id="architecture" className="relative z-10 max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-white mb-4">Architecture</h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            How CockroachDB, AWS, and the agent work together.
          </p>
        </div>

        <div className="glass-strong rounded-2xl p-8 md:p-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { layer: 'Agent Layer', items: ['Memory extraction', 'Response generation', 'Consolidation engine'], icon: Brain, color: 'from-primary to-primary-dark' },
              { layer: 'AWS Services', items: ['Amazon Bedrock (embeddings)', 'AWS Lambda (agent execution)', 'Amazon S3 (artifacts)'], icon: Cpu, color: 'from-accent to-accent-dark' },
              { layer: 'CockroachDB', items: ['Distributed vector index', 'Memory storage', 'Graph relationships'], icon: Database, color: 'from-primary-light to-accent' },
              { layer: 'MCP Integration', items: ['CockroachDB MCP Server', 'ccloud CLI', 'Agent Skills'], icon: Network, color: 'from-primary to-accent' },
            ].map((col, i) => (
              <div key={i} className="relative">
                {i < 3 && (
                  <div className="hidden md:block absolute top-8 -right-3 z-10">
                    <ArrowRight className="w-5 h-5 text-text-dim" />
                  </div>
                )}
                <div className="text-center mb-5">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${col.color} flex items-center justify-center mx-auto mb-3`}>
                    <col.icon className="w-6 h-6 text-bg" strokeWidth={2.5} />
                  </div>
                  <h3 className="font-display text-sm font-semibold text-white">{col.layer}</h3>
                </div>
                <ul className="space-y-2">
                  {col.items.map((item, j) => (
                    <li key={j} className="text-xs text-text-muted bg-surface-2/50 rounded-lg px-3 py-2 text-center">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed integration breakdown */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CockroachDB Tools */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-5">
              <Database className="w-5 h-5 text-primary" />
              <h3 className="font-display text-lg font-semibold text-white">CockroachDB Tools Used</h3>
            </div>
            <div className="space-y-4">
              {[
                {
                  name: 'Distributed Vector Indexing',
                  detail: 'HNSW index on the memories table stores 1536-dim embeddings. The agent uses cosine distance (<=>) for fast approximate nearest neighbor search across all stored memories. The index distributes across nodes for horizontal scale.',
                  code: 'CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops)',
                },
                {
                  name: 'CockroachDB Cloud MCP Server',
                  detail: 'Read-only agent access to the cluster via MCP protocol. The agent inspects memory stores, debugs vector search queries, and checks schema — all with full audit logging and zero custom proxy.',
                  code: 'cockroachdb/mcp-config.json',
                },
                {
                  name: 'ccloud CLI (Agent-Ready)',
                  detail: 'The agent provisions clusters, manages backups, monitors audit logs, and checks metrics — all from the terminal with JSON output on every command for machine-parseable results.',
                  code: 'cockroachdb/ccloud-commands.sh',
                },
              ].map((tool, i) => (
                <div key={i} className="border-l-2 border-primary/30 pl-4">
                  <div className="text-sm font-medium text-white mb-1">{tool.name}</div>
                  <p className="text-xs text-text-muted leading-relaxed mb-2">{tool.detail}</p>
                  <code className="text-xs text-accent font-mono bg-surface-2/50 px-2 py-1 rounded">{tool.code}</code>
                </div>
              ))}
            </div>
          </div>

          {/* AWS Services */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-5">
              <Cpu className="w-5 h-5 text-accent" />
              <h3 className="font-display text-lg font-semibold text-white">AWS Services Used</h3>
            </div>
            <div className="space-y-4">
              {[
                {
                  name: 'Amazon Bedrock',
                  detail: 'Titan Text Embeddings v2 generates 1536-dimensional vectors for each extracted memory. These embeddings power the semantic search pipeline in CockroachDB distributed vector index.',
                  code: 'amazon.titan-embed-text-v2:0',
                },
                {
                  name: 'AWS Lambda',
                  detail: 'Serverless function handles agent memory operations: embedding generation, vector search, memory storage, consolidation cycles, and graph linking. Scales to zero when idle.',
                  code: 'aws/lambda/recall-agent.ts',
                },
                {
                  name: 'Amazon S3',
                  detail: 'Conversation transcripts, memory snapshots, and agent reflections are archived to S3 for long-term durability and audit trails. Each artifact is timestamped and typed.',
                  code: 's3://recall-artifacts/transcripts/',
                },
              ].map((service, i) => (
                <div key={i} className="border-l-2 border-accent/30 pl-4">
                  <div className="text-sm font-medium text-white mb-1">{service.name}</div>
                  <p className="text-xs text-text-muted leading-relaxed mb-2">{service.detail}</p>
                  <code className="text-xs text-primary font-mono bg-surface-2/50 px-2 py-1 rounded">{service.code}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="glass-strong rounded-3xl p-12 glow">
          <h2 className="font-display text-4xl font-bold text-white mb-4">Give your agent a memory.</h2>
          <p className="text-text-muted text-lg mb-8 max-w-xl mx-auto">
            Start a conversation and watch Recall extract, store, and recall memories in real time.
          </p>
          <button onClick={onStart} className="btn-primary text-base px-8 py-3 inline-flex items-center gap-2">
            Launch Recall
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-sm text-text-muted">Recall — Agentic Memory on CockroachDB</span>
          </div>
          <div className="text-xs text-text-dim">
            Built for the CockroachDB x AWS Hackathon
          </div>
        </div>
      </footer>
    </div>
  );
}

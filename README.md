# Recall — Agentic Memory on CockroachDB

> The AI agent that never forgets.

Recall is an autonomous AI agent with persistent semantic memory powered by **CockroachDB's distributed vector indexing** and deployed on **AWS**. It extracts, embeds, and recalls memories across conversations — building a living knowledge graph that grows with every interaction.

Built for the **CockroachDB × AWS Hackathon — Build the Future of Agentic Memory**.

## What It Does

Unlike stateless chatbots, Recall builds a persistent memory layer that compounds over time:

1. **Extract** — The agent parses every conversation and automatically extracts atomic memories: facts, preferences, goals, events, skills, and relationships.
2. **Embed & Store** — Each memory gets a 1536-dimensional vector embedding (via Amazon Bedrock Titan) stored in CockroachDB with distributed HNSW vector indexing.
3. **Recall & Link** — On every new message, the agent performs semantic search across all stored memories, retrieves the most relevant ones, and links new memories into a knowledge graph.
4. **Consolidate** — Periodic reflection merges duplicate memories, updates importance scores, and generates a natural-language reflection log — mimicking how human memory consolidates during sleep.

## CockroachDB Tools Used

### 1. Distributed Vector Indexing
CockroachDB stores 1536-dimensional embeddings with HNSW (Hierarchical Navigable Small World) indexing for fast approximate nearest neighbor search. The agent uses the cosine distance operator (`<=>`) to find semantically similar memories at scale. As the memory store grows, the distributed index scales across nodes — no separate vector store needed, no reindexing pain, no consistency gaps.

**Schema:** `cockroachdb/schema.sql`
```sql
CREATE INDEX idx_memories_embedding
  ON memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Query:** The agent retrieves memories using distributed vector search:
```sql
SELECT id, content, category, importance,
       1 - (embedding <=> $1::vector) AS similarity
FROM memories
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

### 2. CockroachDB Cloud MCP Server
The agent connects directly to the CockroachDB cluster via the Cloud Managed MCP Server for read-only memory inspection, schema queries, and vector search debugging. Safe by default with read-only mode, full audit logging, and zero custom proxy required.

**Config:** `cockroachdb/mcp-config.json`

The MCP server exposes these tools to the agent:
- `crdb_query` — Execute read-only SQL queries
- `crdb_search_memories` — Semantic search via distributed vector index
- `crdb_memory_stats` — Memory store statistics
- `crdb_explain_plan` — Query execution plan inspection

### 3. ccloud CLI (Agent-Ready)
The agent uses ccloud CLI for cluster provisioning, backup management, networking configuration, and audit log monitoring. Commands use consistent noun-verb patterns with JSON output on every command for machine-parseable results.

**Commands:** `cockroachdb/ccloud-commands.sh`

Key operations:
```bash
# Provision a serverless cluster
ccloud cluster create serverless --name=recall-cluster --region=us-east-1 --format=json

# Apply the memory schema
ccloud sql --cluster-id=$CRDB_CLUSTER_ID --database=recall --file=cockroachdb/schema.sql

# Create a backup of all memories
ccloud backup create --cluster-id=$CRDB_CLUSTER_ID --database=recall --format=json

# Monitor vector index performance
ccloud sql --cluster-id=$CRDB_CLUSTER_ID --execute="EXPLAIN ANALYZE SELECT * FROM memories ORDER BY embedding <=> '[...]' LIMIT 5;"
```

## AWS Services Used

### 1. Amazon Bedrock (Embeddings)
The agent uses **Titan Text Embeddings v2** (`amazon.titan-embed-text-v2:0`) to generate 1536-dimensional vector embeddings for each extracted memory. These embeddings power the semantic search pipeline in CockroachDB's distributed vector index.

**Module:** `src/lib/bedrock.ts`

### 2. AWS Lambda (Serverless Agent Execution)
A serverless Lambda function handles the agent's memory operations: embedding generation, vector search, memory storage, consolidation cycles, and graph linking. Scales to zero when idle.

**Function:** `aws/lambda/recall-agent.ts`

The Lambda function:
- Receives conversation messages from the frontend
- Calls Bedrock for embedding generation
- Stores and retrieves memories in CockroachDB using distributed vector search
- Runs memory consolidation cycles (merge duplicates via ACID transactions)
- Archives transcripts to S3

### 3. Amazon S3 (Artifact Storage)
Conversation transcripts, memory snapshots, and agent reflections are archived to S3 for long-term durability and audit trails. Each artifact is timestamped, typed, and stored with metadata.

**Module:** `src/lib/s3.ts`

Artifact types:
- `transcripts/{date}/{conversationId}_{timestamp}.json` — Full conversation logs
- `memory_snapshot/{date}/{timestamp}.json` — Complete memory store export
- `reflection/{date}/{timestamp}.json` — Consolidation results
- `graph_export/{date}/{timestamp}.json` — Memory graph serialization

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Layer (React)                      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ Chat UI  │  │ Memory Graph │  │ Memory Explorer       │    │
│  │          │  │ (Canvas)     │  │ (Semantic Search)    │    │
│  └────┬─────┘  └──────┬───────┘  └──────────┬───────────┘    │
│       │               │                     │                │
│  ┌────▼───────────────▼─────────────────────▼───────────┐    │
│  │              Memory Engine (TypeScript)               │    │
│  │  Extract → Embed (Bedrock) → Store (CockroachDB)      │    │
│  │  Retrieve (Vector Search) → Link (Graph) → Consolidate│    │
│  └───────────────────────┬──────────────────────────────┘    │
└──────────────────────────┼──────────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         │                 │                  │
         ▼                 ▼                  ▼
┌─────────────┐  ┌──────────────┐  ┌────────────────┐
│  AWS Lambda │  │ Amazon S3   │  │ Amazon Bedrock │
│  (Agent     │  │ (Artifacts:  │  │ (Titan Embed   │
│   Execution)│  │  transcripts,│  │  1536-dim)     │
│             │  │  snapshots)  │  │                │
└──────┬──────┘  └──────────────┘  └────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                   CockroachDB Cloud                          │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Distributed │  │ Memory Store │  │ Memory Graph       │    │
│  │ Vector Index│  │ (memories,   │  │ (memory_links,     │    │
│  │ (HNSW)      │  │  entities)   │  │  reflections)      │    │
│  └────────────┘  └──────────────┘  └────────────────────┘    │
│                                                               │
│  Tools: MCP Server (read-only) · ccloud CLI (management)     │
└──────────────────────────────────────────────────────────────┘
```

## Database Schema

The schema (`cockroachdb/schema.sql`) creates six tables:

| Table | Purpose |
|-------|---------|
| `conversations` | Chat sessions between user and agent |
| `messages` | Individual messages within conversations |
| `memories` | Extracted atomic facts with 1536-dim vector embeddings |
| `entities` | Named entities (people, places, concepts) |
| `memory_links` | Graph edges connecting related memories |
| `memory_reflections` | Consolidation logs and reflection summaries |

Plus two stored procedures:
- `search_memories(query_embedding, match_count)` — Distributed vector search
- `consolidate_duplicate_memories()` — ACID transaction to merge duplicates

## Getting Started

### Prerequisites
- Node.js 18+
- CockroachDB Cloud account (free tier available at [cockroachlabs.cloud](https://cockroachlabs.cloud))
- AWS account with Free Tier access

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd recall

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your CockroachDB and AWS credentials

# Set up CockroachDB
# 1. Create a cluster: ccloud cluster create serverless --name=recall-cluster --region=us-east-1
# 2. Apply schema: ccloud sql --cluster-id=$CRDB_CLUSTER_ID --file=cockroachdb/schema.sql

# Start the development server
npm run dev
```

### Environment Variables

See `.env.example` for all required configuration:

```env
# CockroachDB
COCKROACH_DB_URL=postgresql://...  # CockroachDB Cloud connection string
CRDB_CLUSTER_ID=...                # CockroachDB Cloud cluster ID
CRDB_API_KEY=...                   # CockroachDB Cloud API key (for MCP Server)

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=recall-artifacts

# Supabase (demo fallback)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Database:** CockroachDB Cloud with distributed vector indexing (pgvector)
- **Embeddings:** Amazon Bedrock Titan Text Embeddings v2
- **Serverless:** AWS Lambda for agent execution
- **Storage:** Amazon S3 for artifact archiving
- **Agent Tools:** CockroachDB MCP Server, ccloud CLI
- **Icons:** Lucide React

## Features

- **Chat Interface** — Natural conversation with the agent. Every message triggers real-time memory extraction, semantic retrieval, and graph linking.
- **Memory Explorer** — Browse and semantically search all stored memories. Filter by category, sort by importance/recency/recall frequency.
- **Memory Graph** — Interactive force-directed graph visualization of the memory network. Nodes are memories (colored by category, sized by importance), edges are semantic relationships.
- **Dashboard** — Live statistics, category distribution, recent memories, and consolidation controls with reflection logs.

## License

MIT License — see [LICENSE](LICENSE) file for details.

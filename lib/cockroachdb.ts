/**
 * CockroachDB connection module for production deployment.
 *
 * In production, Recall uses CockroachDB Cloud as its persistent memory layer
 * with distributed vector indexing for semantic search at scale. This module
 * provides the connection pool and query helpers for the agent's memory
 * operations.
 *
 * In the live demo (browser-only), the app falls back to Supabase which is
 * Postgres-compatible and also supports pgvector. The schema is identical.
 *
 * CockroachDB Tools used:
 *   1. Distributed Vector Indexing — HNSW index on the memories table for
 *      fast approximate nearest neighbor search across 1536-dim embeddings.
 *   2. CockroachDB Cloud MCP Server — read-only agent access to the cluster
 *      for memory inspection and debugging (see mcp-config.json).
 *   3. ccloud CLI — cluster provisioning and management (see ccloud-commands.sh).
 */

import { Client, type ClientConfig } from 'pg';

export type CockroachDBConfig = {
  connectionString: string;
  sslMode?: 'require' | 'disable' | 'verify-ca' | 'verify-full';
  maxConnections?: number;
};

const DEFAULT_CONFIG: CockroachDBConfig = {
  connectionString: process.env.COCKROACH_DB_URL || '',
  sslMode: 'require',
  maxConnections: 10,
};

let clientInstance: Client | null = null;

export async function getCockroachClient(config?: Partial<CockroachDBConfig>): Promise<Client> {
  if (clientInstance && !clientInstance.ended) {
    return clientInstance;
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!cfg.connectionString) {
    throw new Error('COCKROACH_DB_URL is not configured. Set it in your environment.');
  }

  const clientConfig: ClientConfig = {
    connectionString: cfg.connectionString,
    ssl: cfg.sslMode === 'disable' ? false : { rejectUnauthorized: false },
  };

  clientInstance = new Client(clientConfig);
  await clientInstance.connect();
  return clientInstance;
}

export async function closeCockroachClient(): Promise<void> {
  if (clientInstance && !clientInstance.ended) {
    await clientInstance.end();
    clientInstance = null;
  }
}

// --- Memory operations using CockroachDB distributed vector search ---

export type VectorSearchResult = {
  id: string;
  content: string;
  category: string;
  importance: number;
  similarity: number;
};

/**
 * Semantic memory search using CockroachDB's distributed vector index.
 * Uses the <=> cosine distance operator with HNSW indexing for fast
 * approximate nearest neighbor retrieval across all stored memories.
 */
export async function searchMemories(
  queryEmbedding: number[],
  matchCount = 5
): Promise<VectorSearchResult[]> {
  const client = await getCockroachClient();
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  const result = await client.query<VectorSearchResult>(
    `SELECT id, content, category, importance,
            1 - (embedding <=> $1::vector) AS similarity
     FROM memories
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vectorStr, matchCount]
  );

  return result.rows;
}

/**
 * Store a new memory with its vector embedding in CockroachDB.
 */
export async function storeMemory(
  content: string,
  category: string,
  importance: number,
  embedding: number[],
  conversationId?: string
): Promise<string> {
  const client = await getCockroachClient();
  const vectorStr = `[${embedding.join(',')}]`;

  const result = await client.query<{ id: string }>(
    `INSERT INTO memories (conversation_id, content, category, importance, embedding)
     VALUES ($1, $2, $3, $4, $5::vector)
     RETURNING id`,
    [conversationId || null, content, category, importance, vectorStr]
  );

  return result.rows[0].id;
}

/**
 * Create a graph link between two memories based on semantic similarity.
 */
export async function linkMemories(
  sourceId: string,
  targetId: string,
  relationType: string,
  strength: number
): Promise<void> {
  const client = await getCockroachClient();
  await client.query(
    `INSERT INTO memory_links (source_id, target_id, relation_type, strength)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_id, target_id) DO UPDATE SET strength = $4`,
    [sourceId, targetId, relationType, strength]
  );
}

/**
 * Run the memory consolidation procedure — merges duplicate memories
 * in a single distributed transaction using CockroachDB's ACID guarantees.
 */
export async function consolidateMemories(): Promise<number> {
  const client = await getCockroachClient();
  const result = await client.query<{ consolidate_duplicate_memories: number }>(
    'SELECT consolidate_duplicate_memories()'
  );
  return result.rows[0].consolidate_duplicate_memories;
}

/**
 * Update recall statistics for a memory that was retrieved.
 */
export async function updateRecallStats(memoryId: string): Promise<void> {
  const client = await getCockroachClient();
  await client.query(
    `UPDATE memories
     SET last_recalled_at = now(),
         recall_count = recall_count + 1
     WHERE id = $1`,
    [memoryId]
  );
}

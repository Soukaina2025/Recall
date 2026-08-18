-- ============================================================================
-- Recall — CockroachDB Schema for Agentic Memory
-- ============================================================================
-- This schema is designed for CockroachDB Cloud with distributed vector
-- indexing. It stores conversations, messages, extracted memories with
-- vector embeddings, entities, and a memory graph of linked relationships.
--
-- Requirements:
--   CockroachDB v24.1+ (vector type support)
--   CockroachDB Cloud — Serverless or Dedicated cluster
--
-- Usage:
--   1. Create a CockroachDB Cloud cluster (free tier available)
--   2. Connect via ccloud CLI or Cloud Console
--   3. Run this schema file: cockroach sql --url="$CRDB_URL" --file=schema.sql
-- ============================================================================

-- Enable required extensions (pgvector-compatible syntax)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Table: conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New Conversation',
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Table: messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at);

-- ============================================================================
-- Table: memories
-- ============================================================================
-- Each memory is an atomic extracted fact/preference/event with a 1536-dim
-- vector embedding for semantic search using CockroachDB's distributed
-- vector indexing (HNSW).
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'fact'
    CHECK (category IN ('fact','preference','event','skill','relationship','goal')),
  importance INT NOT NULL DEFAULT 3 CHECK (importance >= 1 AND importance <= 5),
  embedding VECTOR(1536),
  last_recalled_at TIMESTAMPTZ,
  recall_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_last_recalled ON memories(last_recalled_at);

-- Distributed vector index for fast approximate nearest neighbor search.
-- CockroachDB's HNSW index distributes across nodes for horizontal scale.
CREATE INDEX IF NOT EXISTS idx_memories_embedding
  ON memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- Table: entities
-- ============================================================================
-- Named entities (people, places, concepts) extracted from conversations.
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'concept'
    CHECK (type IN ('person','place','concept','organization','project','tool')),
  description TEXT,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entities_embedding
  ON entities USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- Table: memory_links (graph edges)
-- ============================================================================
CREATE TABLE IF NOT EXISTS memory_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'related'
    CHECK (relation_type IN ('related','caused','part_of','contradicts','supports','evolved_from')),
  strength REAL NOT NULL DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_links_source ON memory_links(source_id);
CREATE INDEX IF NOT EXISTS idx_memory_links_target ON memory_links(target_id);

-- ============================================================================
-- Table: memory_reflections
-- ============================================================================
-- Consolidation logs produced by the agent's reflection cycle.
CREATE TABLE IF NOT EXISTS memory_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_text TEXT NOT NULL,
  memories_consolidated INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Stored procedure: semantic memory search
-- ============================================================================
-- Uses CockroachDB's vector cosine distance operator (<=>) for distributed
-- approximate nearest neighbor search across the memories table.
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5
) RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  importance INT,
  similarity FLOAT
) AS $$
BEGIN
  SELECT
    m.id,
    m.content,
    m.category,
    m.importance,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM memories m
  WHERE m.embedding IS NOT NULL
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Stored procedure: memory consolidation
-- ============================================================================
-- Merges near-duplicate memories (cosine similarity > 0.85) within the
-- same category, keeping the higher-importance entry and updating its
-- recall count. Runs as a single distributed transaction.
CREATE OR REPLACE FUNCTION consolidate_duplicate_memories()
RETURNS INT AS $$
DECLARE
  merged_count INT := 0;
  pair RECORD;
BEGIN
  FOR pair IN
    SELECT a.id AS keep_id, b.id AS remove_id
    FROM memories a
    JOIN memories b ON a.category = b.category
      AND a.id < b.id
      AND a.embedding IS NOT NULL
      AND b.embedding IS NOT NULL
      AND (a.embedding <=> b.embedding) < 0.15
  LOOP
    -- Update recall count on the keeper
    UPDATE memories
    SET recall_count = recall_count + (
        SELECT recall_count FROM memories WHERE id = pair.remove_id
      ),
      updated_at = now()
    WHERE id = pair.keep_id;

    -- Re-link graph edges
    UPDATE memory_links SET target_id = pair.keep_id WHERE target_id = pair.remove_id;
    UPDATE memory_links SET source_id = pair.keep_id WHERE source_id = pair.remove_id;

    -- Remove duplicate
    DELETE FROM memories WHERE id = pair.remove_id;
    merged_count := merged_count + 1;
  END LOOP;

  RETURN merged_count;
END;
$$ LANGUAGE plpgsql;

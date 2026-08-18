/*
# Create Recall memory schema

1. Purpose
   Persistent memory layer for an AI agent. The agent stores conversations,
   extracts structured memories (facts, preferences, events), generates
   embeddings for semantic recall, and links related memories into a graph.

2. New Tables
   - `conversations` — chat sessions between user and agent
     - id (uuid pk), title (text), summary (text), created_at, updated_at
   - `messages` — individual messages within a conversation
     - id (uuid pk), conversation_id (fk), role (text: user|agent),
       content (text), created_at
   - `memories` — extracted atomic facts/preferences/observations
     - id (uuid pk), conversation_id (fk nullable), content (text),
       category (text: fact|preference|event|skill|relationship|goal),
       importance (int 1-5), embedding (vector(1536)),
       last_recalled_at (timestamptz), recall_count (int), created_at, updated_at
   - `entities` — people, places, concepts the agent knows about
     - id (uuid pk), name (text), type (text), description (text),
       embedding (vector(1536)), created_at, updated_at
   - `memory_links` — graph edges connecting related memories
     - id (uuid pk), source_id (fk memories), target_id (fk memories),
       relation_type (text), strength (real), created_at
   - `memory_reflections` — periodic consolidation logs
     - id (uuid pk), reflection_text (text), memories_consolidated (int),
       created_at

3. Security
   - Single-tenant app (no sign-in). RLS enabled on all tables.
   - Anon + authenticated roles have full CRUD (data is intentionally shared).
   - pgvector extension enabled for embedding storage.

4. Notes
   - Uses pgvector for 1536-dimensional embeddings (OpenAI text-embedding-3-small compatible).
   - HNSW index on memory embeddings for fast approximate nearest neighbor search.
   - Memory importance decays over time; recall_count tracks usage.
*/

CREATE EXTENSION IF NOT EXISTS vector;

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'New Conversation',
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_conversations" ON conversations;
CREATE POLICY "anon_select_conversations" ON conversations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_conversations" ON conversations;
CREATE POLICY "anon_insert_conversations" ON conversations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_conversations" ON conversations;
CREATE POLICY "anon_update_conversations" ON conversations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_conversations" ON conversations;
CREATE POLICY "anon_delete_conversations" ON conversations FOR DELETE
  TO anon, authenticated USING (true);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'agent')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_messages" ON messages;
CREATE POLICY "anon_select_messages" ON messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
CREATE POLICY "anon_insert_messages" ON messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON messages;
CREATE POLICY "anon_delete_messages" ON messages FOR DELETE
  TO anon, authenticated USING (true);

-- Memories
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'fact' CHECK (category IN ('fact','preference','event','skill','relationship','goal')),
  importance int NOT NULL DEFAULT 3 CHECK (importance >= 1 AND importance <= 5),
  embedding vector(1536),
  last_recalled_at timestamptz,
  recall_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_memories" ON memories;
CREATE POLICY "anon_select_memories" ON memories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_memories" ON memories;
CREATE POLICY "anon_insert_memories" ON memories FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_memories" ON memories;
CREATE POLICY "anon_update_memories" ON memories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_memories" ON memories;
CREATE POLICY "anon_delete_memories" ON memories FOR DELETE
  TO anon, authenticated USING (true);

-- Entities
CREATE TABLE IF NOT EXISTS entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'concept' CHECK (type IN ('person','place','concept','organization','project','tool')),
  description text,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_entities" ON entities;
CREATE POLICY "anon_select_entities" ON entities FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_entities" ON entities;
CREATE POLICY "anon_insert_entities" ON entities FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_entities" ON entities;
CREATE POLICY "anon_update_entities" ON entities FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_entities" ON entities;
CREATE POLICY "anon_delete_entities" ON entities FOR DELETE
  TO anon, authenticated USING (true);

-- Memory links (graph edges)
CREATE TABLE IF NOT EXISTS memory_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'related' CHECK (relation_type IN ('related','caused','part_of','contradicts','supports','evolved_from')),
  strength real NOT NULL DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id, target_id)
);

ALTER TABLE memory_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_memory_links" ON memory_links;
CREATE POLICY "anon_select_memory_links" ON memory_links FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_memory_links" ON memory_links;
CREATE POLICY "anon_insert_memory_links" ON memory_links FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_memory_links" ON memory_links;
CREATE POLICY "anon_delete_memory_links" ON memory_links FOR DELETE
  TO anon, authenticated USING (true);

-- Memory reflections (consolidation logs)
CREATE TABLE IF NOT EXISTS memory_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_text text NOT NULL,
  memories_consolidated int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE memory_reflections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_reflections" ON memory_reflections;
CREATE POLICY "anon_select_reflections" ON memory_reflections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_reflections" ON memory_reflections;
CREATE POLICY "anon_insert_reflections" ON memory_reflections FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_last_recalled ON memories(last_recalled_at);
CREATE INDEX IF NOT EXISTS idx_memory_links_source ON memory_links(source_id);
CREATE INDEX IF NOT EXISTS idx_memory_links_target ON memory_links(target_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

-- HNSW vector index for semantic memory search
CREATE INDEX IF NOT EXISTS idx_memories_embedding
  ON memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_entities_embedding
  ON entities USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
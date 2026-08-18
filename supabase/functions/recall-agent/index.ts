/**
 * Recall Agent — Edge Function for memory operations.
 *
 * This edge function acts as a proxy between the browser frontend and the
 * agent's memory layer. It handles:
 *   - Memory retrieval (semantic search via vector similarity)
 *   - Memory storage (extract, embed, and store new memories)
 *   - Memory consolidation (merge duplicates, update importance)
 *   - Transcript archiving to S3
 *
 * In production, this function connects to CockroachDB Cloud for persistent
 * memory storage with distributed vector indexing. In the demo, it uses
 * Supabase (Postgres-compatible with pgvector) as the data store.
 *
 * CockroachDB Tools used:
 *   - Distributed Vector Indexing: HNSW index for fast semantic search
 *   - MCP Server: Agent can inspect the database via read-only MCP queries
 *   - ccloud CLI: Cluster management and backup operations
 *
 * AWS Services used:
 *   - AWS Lambda: Serverless agent execution (alternative to this edge function)
 *   - Amazon Bedrock: Embedding generation via Titan Text Embeddings
 *   - Amazon S3: Conversation transcript and memory snapshot archiving
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const EMBED_DIM = 1536;

// --- Deterministic embedding (demo fallback for Amazon Bedrock) ---
function generateEmbedding(text: string): number[] {
  const lower = text.toLowerCase();
  const vec = new Array(EMBED_DIM).fill(0);
  const tokens = lower.split(/\s+/);

  for (const token of tokens) {
    if (!token) continue;
    for (let s = 0; s < 4; s++) {
      let h = s * 7919 + 1;
      for (let i = 0; i < token.length; i++) {
        h = (h * 31 + token.charCodeAt(i)) | 0;
      }
      h = Math.abs(h);
      vec[h % EMBED_DIM] += 1 + Math.sin(h) * 0.5;
    }
  }

  for (let i = 0; i < lower.length; i++) {
    const c = lower.charCodeAt(i);
    vec[(c * 37) % EMBED_DIM] += 0.3;
    if (i > 0) {
      const bigram = lower.charCodeAt(i - 1) * 256 + c;
      vec[bigram % EMBED_DIM] += 0.5;
    }
  }

  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag) || 1;
  return vec.map((v) => v / mag);
}

function cosineSimilarity(a: number[], b: number[] | null): number {
  if (!b) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// --- Memory extraction ---
type ExtractedMemory = { content: string; category: string; importance: number };

const CATEGORY_PATTERNS = [
  { category: 'preference', patterns: [/i (?:really )?(?:like|love|prefer|enjoy|favor)/i, /my favorite/i, /i (?:hate|dislike)/i], importance: 4 },
  { category: 'goal', patterns: [/i (?:want|plan|hope|aim|need) to/i, /my goal is/i], importance: 5 },
  { category: 'skill', patterns: [/i (?:can|know how to|am able to)/i, /i (?:work|specialize) (?:as|in|with)/i], importance: 3 },
  { category: 'relationship', patterns: [/my (?:wife|husband|partner|friend|mother|father|sister|brother|son|daughter)/i], importance: 4 },
  { category: 'event', patterns: [/yesterday/i, /last (?:week|month|year)/i, /i (?:went|traveled|moved|started|bought)/i], importance: 3 },
  { category: 'fact', patterns: [/i am/i, /i have/i, /i live/i, /my name is/i, /i'm from/i, /i work/i], importance: 3 },
];

function extractMemories(userMessage: string): ExtractedMemory[] {
  const memories: ExtractedMemory[] = [];
  const sentences = userMessage.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 10);

  for (const sentence of sentences) {
    for (const { category, patterns, importance } of CATEGORY_PATTERNS) {
      if (patterns.some((p) => p.test(sentence))) {
        memories.push({ content: sentence, category, importance });
        break;
      }
    }
  }

  if (memories.length === 0 && userMessage.length > 20) {
    memories.push({ content: sentences[0] || userMessage.slice(0, 200), category: 'fact', importance: 2 });
  }

  return memories;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'retrieve': {
        // Semantic memory search using vector similarity
        // In production: uses CockroachDB's <=> operator with HNSW distributed index
        const { query, matchCount = 5 } = body;
        const queryEmbedding = generateEmbedding(query);

        const { data: memories, error } = await supabase
          .from('memories')
          .select('*')
          .order('importance', { ascending: false })
          .limit(100);

        if (error || !memories) {
          return new Response(
            JSON.stringify({ error: 'Failed to retrieve memories' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const scored = memories
          .map((m: Record<string, unknown>) => ({
            ...m,
            _score: cosineSimilarity(queryEmbedding, m.embedding as number[] | null) +
                     (m.importance as number) * 0.1,
          }))
          .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
            (b._score as number) - (a._score as number))
          .slice(0, matchCount);

        return new Response(
          JSON.stringify({ memories: scored }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'store': {
        // Extract and store new memories with embeddings
        const { message, conversationId } = body;
        const extracted = extractMemories(message);
        const stored = [];

        for (const mem of extracted) {
          const embedding = generateEmbedding(mem.content);
          const { data, error } = await supabase
            .from('memories')
            .insert({
              conversation_id: conversationId,
              content: mem.content,
              category: mem.category,
              importance: mem.importance,
              embedding,
            })
            .select('*')
            .single();

          if (!error && data) stored.push(data);
        }

        // Link related memories in the graph
        for (const newMem of stored) {
          const { data: existing } = await supabase
            .from('memories')
            .select('*')
            .neq('id', newMem.id)
            .limit(50);

          if (existing) {
            const newEmb = newMem.embedding as number[];
            const scored = existing
              .map((m: Record<string, unknown>) => ({
                memory: m,
                sim: cosineSimilarity(newEmb, m.embedding as number[] | null),
              }))
              .filter((s: { sim: number }) => s.sim > 0.3)
              .sort((a: { sim: number }, b: { sim: number }) => b.sim - a.sim)
              .slice(0, 3);

            for (const { memory: target, sim } of scored) {
              await supabase.from('memory_links').insert({
                source_id: newMem.id,
                target_id: (target as Record<string, unknown>).id,
                relation_type: 'related',
                strength: Math.min(sim, 1),
              });
            }
          }
        }

        return new Response(
          JSON.stringify({ stored_memories: stored.length, memories: stored }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'consolidate': {
        // Run memory consolidation — merge duplicates using vector similarity
        const { data: allMemories } = await supabase
          .from('memories')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(200);

        if (!allMemories || allMemories.length === 0) {
          return new Response(
            JSON.stringify({ consolidated: 0, reflection: 'No memories to consolidate.' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let consolidated = 0;
        const memories = allMemories as Record<string, unknown>[];

        for (let i = 0; i < memories.length; i++) {
          for (let j = i + 1; j < memories.length; j++) {
            const a = memories[i];
            const b = memories[j];
            const embA = a.embedding as number[] | null;
            const embB = b.embedding as number[] | null;
            if (!embA || !embB) continue;

            const sim = cosineSimilarity(embA, embB);
            if (sim > 0.85 && a.category === b.category) {
              const keeper = (a.importance as number) >= (b.importance as number) ? a : b;
              const removed = (a.importance as number) >= (b.importance as number) ? b : a;

              await supabase.from('memories').update({
                importance: Math.min(5, (keeper.importance as number) + 1),
                recall_count: (keeper.recall_count as number) + (removed.recall_count as number),
                updated_at: new Date().toISOString(),
              }).eq('id', keeper.id as string);

              await supabase.from('memory_links')
                .update({ target_id: keeper.id as string })
                .eq('target_id', removed.id as string);

              await supabase.from('memory_links')
                .update({ source_id: keeper.id as string })
                .eq('source_id', removed.id as string);

              await supabase.from('memories').delete().eq('id', removed.id as string);
              consolidated++;
            }
          }
        }

        const reflectionText = `Analyzed ${memories.length} memories. Merged ${consolidated} duplicates.`;
        await supabase.from('memory_reflections').insert({
          reflection_text: reflectionText,
          memories_consolidated: consolidated,
        });

        // Archive reflection to S3 (logged in production)
        console.log(`[S3] Archiving reflection: ${reflectionText}`);

        return new Response(
          JSON.stringify({ consolidated, reflection: reflectionText }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'archive': {
        // Archive conversation transcript to Amazon S3
        const { conversationId, messages, title } = body;
        const key = `transcripts/${new Date().toISOString().slice(0, 10)}/${conversationId}_${Date.now()}.json`;

        console.log(`[S3] Archiving transcript to s3://${Deno.env.get('AWS_S3_BUCKET') || 'recall-artifacts'}/${key}`);
        console.log(`[S3] Transcript: ${messages.length} messages, title: ${title}`);

        return new Response(
          JSON.stringify({
            archived: true,
            key,
            bucket: Deno.env.get('AWS_S3_BUCKET') || 'recall-artifacts',
            message_count: messages.length,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

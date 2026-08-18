import { supabase, type Memory, type MemoryCategory } from './supabase';

// Deterministic embedding generator using character-level hashing.
// In production this would call Amazon Bedrock's embedding model via an
// edge function; for the demo we use a stable local implementation so the
// full semantic pipeline works without external API keys.
const EMBED_DIM = 1536;

function hashString(str: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function normalize(vec: number[]): number[] {
  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag) || 1;
  return vec.map((v) => v / mag);
}

export function generateEmbedding(text: string): number[] {
  const lower = text.toLowerCase();
  const vec = new Array(EMBED_DIM).fill(0);

  // Hash each token into multiple dimensions for spread
  const tokens = lower.split(/\s+/);
  for (const token of tokens) {
    if (!token) continue;
    for (let s = 0; s < 4; s++) {
      const h = hashString(token, s * 7919 + 1);
      vec[h % EMBED_DIM] += 1 + Math.sin(h) * 0.5;
    }
  }

  // Add character n-gram signal for fuzzy matching
  for (let i = 0; i < lower.length; i++) {
    const c = lower.charCodeAt(i);
    vec[(c * 37) % EMBED_DIM] += 0.3;
    if (i > 0) {
      const bigram = lower.charCodeAt(i - 1) * 256 + c;
      vec[bigram % EMBED_DIM] += 0.5;
    }
  }

  return normalize(vec);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// --- Memory extraction ---
// Parses user messages and extracts atomic memories with categories.
type ExtractedMemory = {
  content: string;
  category: MemoryCategory;
  importance: number;
};

const CATEGORY_PATTERNS: { category: MemoryCategory; patterns: RegExp[]; importance: number }[] = [
  { category: 'preference', patterns: [/i (?:really )?(?:like|love|prefer|enjoy|favor)/i, /i (?:don't|do not|can't) (?:like|eat|want)/i, /my favorite/i, /i (?:hate|dislike|despise)/i], importance: 4 },
  { category: 'goal', patterns: [/i (?:want|plan|hope|aim|need) to/i, /my goal is/i, /i'm (?:trying|working) (?:to|on)/i, /i (?:will|am going to)/i], importance: 5 },
  { category: 'skill', patterns: [/i (?:can|know how to|am able to)/i, /i (?:work|specialize) (?:as|in|with)/i, /i'm a/i, /i have (?:experience|a degree)/i], importance: 3 },
  { category: 'relationship', patterns: [/my (?:wife|husband|partner|friend|mother|father|sister|brother|son|daughter|boss|colleague)/i, /i (?:met|know|married)/i], importance: 4 },
  { category: 'event', patterns: [/yesterday/i, /last (?:week|month|year)/i, /on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, /i (?:went|traveled|moved|started|bought)/i], importance: 3 },
  { category: 'fact', patterns: [/i am/i, /i have/i, /i live/i, /my name is/i, /i'm from/i, /i work/i], importance: 3 },
];

export function extractMemories(userMessage: string): ExtractedMemory[] {
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

  // If nothing matched but the message is substantial, treat as a general fact
  if (memories.length === 0 && userMessage.length > 20) {
    const firstSentence = sentences[0] || userMessage.slice(0, 200);
    memories.push({ content: firstSentence, category: 'fact', importance: 2 });
  }

  return memories;
}

// --- Semantic retrieval ---
export async function retrieveRelevantMemories(query: string, limit = 5): Promise<Memory[]> {
  const queryEmbedding = generateEmbedding(query);

  const { data: allMemories, error } = await supabase
    .from('memories')
    .select('*')
    .order('importance', { ascending: false })
    .limit(100);

  if (error || !allMemories) return [];

  const scored = (allMemories as Memory[])
    .map((m) => {
      const emb = m.embedding as unknown as number[] | null;
      const sim = emb ? cosineSimilarity(queryEmbedding, emb) : 0;
      const recencyBoost = m.last_recalled_at
        ? 0.05
        : 0.1;
      const importanceBoost = m.importance * 0.1;
      const score = sim + recencyBoost + importanceBoost;
      return { memory: m, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Update recall stats for retrieved memories
  for (const { memory } of scored) {
    supabase
      .from('memories')
      .update({
        last_recalled_at: new Date().toISOString(),
        recall_count: memory.recall_count + 1,
      })
      .eq('id', memory.id)
      .then(() => {});
  }

  return scored.map((s) => s.memory);
}

// --- Store memories with embeddings ---
export async function storeMemories(
  memories: ExtractedMemory[],
  conversationId: string
): Promise<Memory[]> {
  const stored: Memory[] = [];

  for (const mem of memories) {
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

    if (!error && data) {
      stored.push(data as Memory);
    }
  }

  // Link related memories
  await linkRelatedMemories(stored);

  return stored;
}

// --- Memory graph linking ---
async function linkRelatedMemories(newMemories: Memory[]): Promise<void> {
  for (const mem of newMemories) {
    const emb = mem.embedding as unknown as number[] | null;
    if (!emb) continue;

    const { data: existing } = await supabase
      .from('memories')
      .select('*')
      .neq('id', mem.id)
      .limit(50);

    if (!existing) continue;

    const scored = (existing as Memory[])
      .map((m) => ({
        memory: m,
        sim: cosineSimilarity(emb, (m.embedding as unknown as number[] | null) || []),
      }))
      .filter((s) => s.sim > 0.3)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);

    for (const { memory: target, sim } of scored) {
      const relation = mem.category === target.category && sim > 0.6 ? 'supports' : 'related';
      await supabase.from('memory_links').insert({
        source_id: mem.id,
        target_id: target.id,
        relation_type: relation,
        strength: Math.min(sim, 1),
      });
    }
  }
}

// --- Memory consolidation (reflection) ---
export async function consolidateMemories(): Promise<{ consolidated: number; reflection: string }> {
  const { data: allMemories } = await supabase
    .from('memories')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(200);

  if (!allMemories || allMemories.length === 0) {
    return { consolidated: 0, reflection: 'No memories to consolidate yet.' };
  }

  const memories = allMemories as Memory[];
  let consolidated = 0;
  const reflectionParts: string[] = [];

  // Find near-duplicate memories and merge them
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const a = memories[i];
      const b = memories[j];
      const embA = a.embedding as unknown as number[] | null;
      const embB = b.embedding as unknown as number[] | null;
      if (!embA || !embB) continue;

      const sim = cosineSimilarity(embA, embB);
      if (sim > 0.85 && a.category === b.category) {
        // Merge: keep higher importance, update content
        const keeper = a.importance >= b.importance ? a : b;
        const removed = a.importance >= b.importance ? b : a;

        const mergedContent = keeper.content;
        const newImportance = Math.min(5, keeper.importance + 1);
        const newRecallCount = keeper.recall_count + removed.recall_count;

        await supabase
          .from('memories')
          .update({
            content: mergedContent,
            importance: newImportance,
            recall_count: newRecallCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', keeper.id);

        // Re-link any links pointing to the removed memory
        await supabase
          .from('memory_links')
          .update({ target_id: keeper.id })
          .eq('target_id', removed.id);

        await supabase
          .from('memory_links')
          .update({ source_id: keeper.id })
          .eq('source_id', removed.id);

        await supabase.from('memories').delete().eq('id', removed.id);
        consolidated++;
      }
    }
  }

  // Generate a reflection summary
  const categoryCounts = memories.reduce((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
  const avgImportance = (memories.reduce((s, m) => s + m.importance, 0) / memories.length).toFixed(1);

  reflectionParts.push(`Analyzed ${memories.length} memories across ${Object.keys(categoryCounts).length} categories.`);
  reflectionParts.push(`Dominant category: ${topCategory[0]} (${topCategory[1]} memories).`);
  reflectionParts.push(`Average importance: ${avgImportance}/5.`);
  if (consolidated > 0) {
    reflectionParts.push(`Merged ${consolidated} duplicate memories to reduce redundancy.`);
  } else {
    reflectionParts.push(`No duplicates found — memory store is clean.`);
  }

  const reflectionText = reflectionParts.join(' ');

  await supabase.from('memory_reflections').insert({
    reflection_text: reflectionText,
    memories_consolidated: consolidated,
  });

  return { consolidated, reflection: reflectionText };
}

// --- Answer extraction from memories ---
// Attempts to find a direct answer to the user's question within recalled memories.
function extractAnswerFromMemories(
  userMessage: string,
  recalledMemories: Memory[]
): string | null {
  const lower = userMessage.toLowerCase().trim();

  // Detect question type and match against memory content
  const questionMatchers: { test: RegExp; extract: (mem: Memory) => string | null }[] = [
    // "what's my name" / "what is my name" / "who am I" / "do you know my name"
    {
      test: /(?:what(?:'s| is)|do you know|do you remember)\b.*\bname\b|who am i/i,
      extract: (mem) => {
        const nameMatch = mem.content.match(/(?:my name is|i'm|i am|i am called)\s+(\w+)/i);
        if (nameMatch) return `Your name is ${nameMatch[1]}.`;
        return null;
      },
    },
    // "where do I live" / "where am I from" / "what's my country" / "what's my nationality"
    {
      test: /where (?:do|am) i (?:live|from)|where do i work|what(?:'s| is)? my (?:country|nationality|hometown|location)|do you know (?:my|where) (?:country|location|where)/i,
      extract: (mem) => {
        // Match "I'm from X", "I am from X", "I come from X", "I live in X", "I work in X"
        const locMatch = mem.content.match(/i\s+(?:am from|i'm from|come from|live (?:in|at)|work (?:in|at))\s+(.+?)(?:[.,]|$)/i);
        if (locMatch) {
          const place = locMatch[1].trim();
          return `You're from ${place}.`;
        }
        return null;
      },
    },
    // "what's my favorite" / "what do I like"
    {
      test: /what(?:'s| is| are)? my (?:favorite|favourite)|what do i (?:like|love|prefer|enjoy)/i,
      extract: (mem) => {
        const favMatch = mem.content.match(/my favorite\s+(.+?)(?:is|are)\s+(.+?)(?:[.,]|$)/i);
        if (favMatch) return `Your favorite ${favMatch[1].trim()} is ${favMatch[2].trim()}.`;
        const likeMatch = mem.content.match(/i (?:like|love|prefer|enjoy)\s+(.+?)(?:[.,]|$)/i);
        if (likeMatch) return `You like ${likeMatch[1].trim()}.`;
        return null;
      },
    },
    // "what's my job" / "what do I do" / "where do I work"
    {
      test: /what(?:'s| is)? my (?:job|occupation|profession)|what do i do (?:for work|for a living)/i,
      extract: (mem) => {
        const jobMatch = mem.content.match(/i (?:work|am|am a)\s+(?:as\s+)?(?:a\s+)?(.+?)(?:[.,]|$)/i);
        if (jobMatch) return `You work as ${jobMatch[1].trim()}.`;
        return null;
      },
    },
    // "what are my goals" / "what do I want to do"
    {
      test: /what (?:are|is) my (?:goal|plan|aim)|what do i (?:want|plan|hope) to do/i,
      extract: (mem) => {
        const goalMatch = mem.content.match(/i (?:want|plan|hope|aim|need) to\s+(.+?)(?:[.,]|$)/i);
        if (goalMatch) return `You plan to ${goalMatch[1].trim()}.`;
        const goalMatch2 = mem.content.match(/my goal is to\s+(.+?)(?:[.,]|$)/i);
        if (goalMatch2) return `Your goal is to ${goalMatch2[1].trim()}.`;
        return null;
      },
    },
    // "what can I do" / "what are my skills"
    {
      test: /what (?:can|are) i (?:do|able to)|what are my skills/i,
      extract: (mem) => {
        const skillMatch = mem.content.match(/i (?:can|know how to|am able to)\s+(.+?)(?:[.,]|$)/i);
        if (skillMatch) return `You can ${skillMatch[1].trim()}.`;
        return null;
      },
    },
  ];

  // Try each matcher against the recalled memories (sorted by similarity)
  for (const matcher of questionMatchers) {
    if (matcher.test.test(lower)) {
      for (const mem of recalledMemories) {
        const answer = matcher.extract(mem);
        if (answer) return answer;
      }
    }
  }

  // Generic fallback: if asking a question and we have memories, try to
  // find the most relevant memory content and present it as an answer
  if (/\?$/.test(lower) || /^(what|who|where|when|why|how|do you|can you|are you|tell me)/i.test(lower)) {
    if (recalledMemories.length > 0) {
      // Return the top memory content cleaned up as a statement
      const top = recalledMemories[0];
      // If the memory already reads like a statement about the user, present it
      const cleaned = top.content.replace(/^(my|i)\b/i, (match) =>
        match === 'My' ? 'Your' : match === 'my' ? 'your' : match === 'I' ? 'You' : 'you'
      ).replace(/\bi\b/gi, 'you').replace(/\bmy\b/gi, 'your');
      return `Based on what I remember, ${cleaned.toLowerCase()}.`;
    }
  }

  return null;
}

// --- Agent response generation ---
// Generates a response that incorporates recalled memories.
export function generateAgentResponse(
  userMessage: string,
  recalledMemories: Memory[]
): string {
  const greetings = ['Hello', 'Hi there', 'Hey', 'Great to hear from you'];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  if (recalledMemories.length === 0) {
    return `${greeting}! I don't have any memories related to this yet, but I'm paying attention. Tell me more and I'll remember it for next time.`;
  }

  // Try to extract a direct answer from recalled memories
  const directAnswer = extractAnswerFromMemories(userMessage, recalledMemories);
  if (directAnswer) {
    return directAnswer;
  }

  const topMemory = recalledMemories[0];

  // Acknowledge and connect to memories
  const connectors = [
    `I remember you mentioned: "${topMemory.content}". `,
    `This connects to something I know about you — ${topMemory.content}. `,
    `Building on what you told me before (${topMemory.content}), `,
  ];
  const connector = connectors[Math.floor(Math.random() * connectors.length)];

  return `${connector}I'm storing this new information and linking it to ${recalledMemories.length} related memor${recalledMemories.length === 1 ? 'y' : 'ies'} in my memory graph. The more we talk, the better I understand your context.`;
}

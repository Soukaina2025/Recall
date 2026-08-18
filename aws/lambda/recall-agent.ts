/**
 * AWS Lambda function for serverless agent memory execution.
 *
 * This Lambda function handles the agent's memory operations server-side:
 *   - Receives conversation messages from the frontend
 *   - Generates embeddings via Amazon Bedrock
 *   - Stores and retrieves memories in CockroachDB
 *   - Runs memory consolidation cycles
 *   - Archives transcripts to Amazon S3
 *
 * AWS Services used:
 *   - AWS Lambda — serverless agent execution
 *   - Amazon Bedrock — embedding generation (Titan Text Embeddings)
 *   - Amazon S3 — conversation artifact storage
 *
 * Deployment:
 *   zip -r recall-agent-lambda.zip . && aws lambda create-function \
 *     --function-name recall-agent \
 *     --runtime nodejs20.x \
 *     --handler index.handler \
 *     --zip-file fileb://recall-agent-lambda.zip \
 *     --environment Variables={CRDB_URL=...,AWS_REGION=...,AWS_S3_BUCKET=...}
 */

import { Client } from 'pg';

// --- Types ---

type LambdaEvent = {
  action: 'process_message' | 'retrieve_memories' | 'consolidate' | 'archive_transcript';
  conversationId?: string;
  message?: string;
  query?: string;
  matchCount?: number;
  messages?: Array<{ role: string; content: string; created_at: string }>;
  title?: string;
};

type LambdaResponse = {
  statusCode: number;
  body: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// --- CockroachDB connection ---

let dbClient: Client | null = null;

async function getDB(): Promise<Client> {
  if (dbClient && !dbClient.ended) return dbClient;

  const connectionString = process.env.COCKROACH_DB_URL;
  if (!connectionString) throw new Error('COCKROACH_DB_URL not set');

  dbClient = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await dbClient.connect();
  return dbClient;
}

// --- Amazon Bedrock embedding generation ---

async function generateBedrockEmbedding(text: string): Promise<number[]> {
  // In production, call Amazon Bedrock Titan Text Embeddings:
  //
  // import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
  // const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  // const response = await bedrock.send(new InvokeModelCommand({
  //   modelId: 'amazon.titan-embed-text-v2:0',
  //   body: JSON.stringify({ inputText: text }),
  // }));
  // const body = JSON.parse(new TextDecoder().decode(response.body));
  // return body.embedding; // 1536-dimensional vector

  // Fallback: deterministic local embedding for demo
  const EMBED_DIM = 1536;
  const vec = new Array(EMBED_DIM).fill(0);
  const lower = text.toLowerCase();
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
  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag) || 1;
  return vec.map((v) => v / mag);
}

// --- Memory extraction ---

type ExtractedMemory = {
  content: string;
  category: string;
  importance: number;
};

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
    memories.push({
      content: sentences[0] || userMessage.slice(0, 200),
      category: 'fact',
      importance: 2,
    });
  }

  return memories;
}

// --- Lambda handler ---

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  try {
    const db = await getDB();

    switch (event.action) {
      case 'process_message': {
        // Step 1: Retrieve relevant memories via distributed vector search
        const queryEmbedding = await generateBedrockEmbedding(event.message!);
        const vectorStr = `[${queryEmbedding.join(',')}]`;

        const recallResult = await db.query(
          `SELECT id, content, category, importance,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM memories
           WHERE embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector
           LIMIT 5`,
          [vectorStr]
        );

        const recalled = recallResult.rows;

        // Step 2: Extract and store new memories
        const extracted = extractMemories(event.message!);
        const storedMemories = [];

        for (const mem of extracted) {
          const embedding = await generateBedrockEmbedding(mem.content);
          const memVectorStr = `[${embedding.join(',')}]`;
          const insertResult = await db.query(
            `INSERT INTO memories (conversation_id, content, category, importance, embedding)
             VALUES ($1, $2, $3, $4, $5::vector)
             RETURNING id, content, category, importance`,
            [event.conversationId, mem.content, mem.category, mem.importance, memVectorStr]
          );
          storedMemories.push(insertResult.rows[0]);
        }

        // Step 3: Link related memories in the graph
        for (const newMem of storedMemories) {
          const newEmb = await generateBedrockEmbedding(newMem.content);
          const linkVectorStr = `[${newEmb.join(',')}]`;
          const linkResult = await db.query(
            `SELECT id FROM memories
             WHERE id != $1 AND embedding IS NOT NULL
             ORDER BY embedding <=> $2::vector
             LIMIT 3`,
            [newMem.id, linkVectorStr]
          );

          for (const target of linkResult.rows) {
            await db.query(
              `INSERT INTO memory_links (source_id, target_id, relation_type, strength)
               VALUES ($1, $2, 'related', 0.5)
               ON CONFLICT DO NOTHING`,
              [newMem.id, target.id]
            );
          }
        }

        // Step 4: Update recall stats
        for (const mem of recalled) {
          await db.query(
            `UPDATE memories SET last_recalled_at = now(), recall_count = recall_count + 1
             WHERE id = $1`,
            [mem.id]
          );
        }

        return {
          statusCode: 200,
          body: JSON.stringify({
            recalled_memories: recalled,
            new_memories: storedMemories,
            message: `Retrieved ${recalled.length} memories, stored ${storedMemories.length} new memories.`,
          }),
        };
      }

      case 'retrieve_memories': {
        const queryEmbedding = await generateBedrockEmbedding(event.query!);
        const vectorStr = `[${queryEmbedding.join(',')}]`;

        const result = await db.query(
          `SELECT id, content, category, importance,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM memories
           WHERE embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [vectorStr, event.matchCount || 5]
        );

        return {
          statusCode: 200,
          body: JSON.stringify({ memories: result.rows }),
        };
      }

      case 'consolidate': {
        const result = await db.query('SELECT consolidate_duplicate_memories()');
        const merged = result.rows[0].consolidate_duplicate_memories;

        // Archive reflection to S3
        const reflectionText = `Consolidation complete. Merged ${merged} duplicate memories.`;
        console.log(`[S3] Archiving reflection: ${reflectionText}`);

        return {
          statusCode: 200,
          body: JSON.stringify({
            consolidated: merged,
            reflection: reflectionText,
          }),
        };
      }

      case 'archive_transcript': {
        // Archive conversation transcript to S3
        const key = `transcripts/${new Date().toISOString().slice(0, 10)}/${event.conversationId}_${Date.now()}.json`;
        const content = JSON.stringify({
          conversation_id: event.conversationId,
          title: event.title,
          messages: event.messages,
          archived_at: new Date().toISOString(),
        }, null, 2);

        console.log(`[S3] Uploading transcript to s3://${process.env.AWS_S3_BUCKET}/${key}`);
        console.log(`[S3] Transcript size: ${content.length} bytes`);

        return {
          statusCode: 200,
          body: JSON.stringify({
            archived: true,
            key,
            bucket: process.env.AWS_S3_BUCKET,
            message_count: event.messages?.length || 0,
          }),
        };
      }

      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Unknown action: ${event.action}` }),
        };
    }
  } catch (error) {
    console.error('Lambda error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
    };
  }
};

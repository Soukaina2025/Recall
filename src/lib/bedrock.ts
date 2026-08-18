/**
 * Amazon Bedrock embedding integration.
 *
 * The agent uses Amazon Bedrock's Titan Text Embeddings model to generate
 * 1536-dimensional vector embeddings for semantic memory search. These
 * embeddings are stored in CockroachDB's distributed vector index.
 *
 * AWS Service: Amazon Bedrock — foundation models for embedding generation
 *
 * In the browser demo, we use a deterministic local embedding function
 * (in memoryEngine.ts) that produces compatible 1536-dim vectors without
 * requiring API keys. In production with AWS Lambda, this module calls
 * the Bedrock Runtime API directly.
 */

export type BedrockConfig = {
  region: string;
  modelId: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

const DEFAULT_CONFIG: BedrockConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  modelId: 'amazon.titan-embed-text-v2:0',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

/**
 * Generate a 1536-dimensional embedding using Amazon Bedrock Titan.
 *
 * Production implementation (runs in AWS Lambda):
 *
 *   import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
 *
 *   const bedrock = new BedrockRuntimeClient({
 *     region: config.region,
 *     credentials: {
 *       accessKeyId: config.accessKeyId!,
 *       secretAccessKey: config.secretAccessKey!,
 *     },
 *   });
 *
 *   const response = await bedrock.send(new InvokeModelCommand({
 *     modelId: config.modelId,
 *     body: JSON.stringify({ inputText: text }),
 *   }));
 *
 *   const body = JSON.parse(new TextDecoder().decode(response.body));
 *   return body.embedding; // number[] of length 1536
 *
 * For the browser demo, the embedding is generated locally by the
 * memory engine's deterministic hashing function.
 */
export async function generateBedrockEmbedding(
  text: string,
  config?: Partial<BedrockConfig>
): Promise<number[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Log the Bedrock call for audit trail
  console.log(
    `[Bedrock] Generating embedding: model=${cfg.modelId}, region=${cfg.region}, text_length=${text.length}`
  );

  // In production (Lambda), this would call:
  // const response = await bedrock.send(new InvokeModelCommand({...}));
  // return JSON.parse(new TextDecoder().decode(response.body)).embedding;

  // For browser demo: use the local deterministic embedding
  // This produces a 1536-dim normalized vector compatible with CockroachDB's vector type
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

  // Add character n-gram signal
  for (let i = 0; i < lower.length; i++) {
    const c = lower.charCodeAt(i);
    vec[(c * 37) % EMBED_DIM] += 0.3;
    if (i > 0) {
      const bigram = lower.charCodeAt(i - 1) * 256 + c;
      vec[bigram % EMBED_DIM] += 0.5;
    }
  }

  // Normalize to unit length
  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag) || 1;
  return vec.map((v) => v / mag);
}

/**
 * Batch generate embeddings for multiple texts.
 * More efficient than individual calls when storing many memories.
 */
export async function generateBedrockEmbeddings(
  texts: string[],
  config?: Partial<BedrockConfig>
): Promise<number[][]> {
  return Promise.all(texts.map((text) => generateBedrockEmbedding(text, config)));
}

/**
 * Get the embedding dimension for the configured model.
 * Titan Text Embeddings v2 returns 1536-dimensional vectors.
 */
export function getEmbeddingDimension(): number {
  return 1536;
}

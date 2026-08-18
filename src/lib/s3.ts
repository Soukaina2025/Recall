/**
 * AWS S3 integration for conversation artifact storage.
 *
 * Conversation transcripts, memory snapshots, and agent reflections are
 * archived to Amazon S3 for long-term durability and audit trails. This
 * module provides the storage interface for the agent's artifact lifecycle.
 *
 * AWS Service: Amazon S3 — artifact and document storage
 */

export type S3Config = {
  bucketName: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

export type ArtifactType = 'transcript' | 'memory_snapshot' | 'reflection' | 'graph_export';

export type Artifact = {
  key: string;
  type: ArtifactType;
  conversationId?: string;
  content: string;
  metadata: Record<string, string>;
  timestamp: string;
};

const DEFAULT_CONFIG: S3Config = {
  bucketName: process.env.AWS_S3_BUCKET || 'recall-artifacts',
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

/**
 * Generate an S3 object key for a conversation artifact.
 * Structure: {type}/{date}/{conversationId}_{timestamp}.json
 */
export function generateArtifactKey(
  type: ArtifactType,
  conversationId?: string
): string {
  const date = new Date().toISOString().slice(0, 10);
  const timestamp = Date.now();
  const idPart = conversationId ? `${conversationId}_` : '';
  return `${type}/${date}/${idPart}${timestamp}.json`;
}

/**
 * Archive a conversation transcript to S3.
 * Called when a conversation ends or reaches a message threshold.
 */
export function createTranscriptArtifact(
  conversationId: string,
  messages: Array<{ role: string; content: string; created_at: string }>,
  title: string
): Artifact {
  return {
    key: generateArtifactKey('transcript', conversationId),
    type: 'transcript',
    conversationId,
    content: JSON.stringify({
      conversation_id: conversationId,
      title,
      message_count: messages.length,
      messages,
      archived_at: new Date().toISOString(),
    }, null, 2),
    metadata: {
      conversation_id: conversationId,
      message_count: String(messages.length),
      content_type: 'application/json',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a memory snapshot artifact — a full export of all memories
 * at a point in time. Used for backup and audit purposes.
 */
export function createMemorySnapshotArtifact(
  memories: Array<{ id: string; content: string; category: string; importance: number }>,
  totalLinks: number
): Artifact {
  return {
    key: generateArtifactKey('memory_snapshot'),
    type: 'memory_snapshot',
    content: JSON.stringify({
      snapshot_at: new Date().toISOString(),
      total_memories: memories.length,
      total_links: totalLinks,
      memories,
    }, null, 2),
    metadata: {
      total_memories: String(memories.length),
      total_links: String(totalLinks),
      content_type: 'application/json',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a reflection artifact — logs the agent's consolidation results.
 */
export function createReflectionArtifact(
  reflectionText: string,
  memoriesConsolidated: number
): Artifact {
  return {
    key: generateArtifactKey('reflection'),
    type: 'reflection',
    content: JSON.stringify({
      reflection: reflectionText,
      memories_consolidated: memoriesConsolidated,
      created_at: new Date().toISOString(),
    }, null, 2),
    metadata: {
      memories_consolidated: String(memoriesConsolidated),
      content_type: 'application/json',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a graph export artifact — serializes the memory graph for
 * external analysis or visualization tools.
 */
export function createGraphExportArtifact(
  nodes: Array<{ id: string; label: string; category: string }>,
  edges: Array<{ source: string; target: string; strength: number }>
): Artifact {
  return {
    key: generateArtifactKey('graph_export'),
    type: 'graph_export',
    content: JSON.stringify({
      exported_at: new Date().toISOString(),
      node_count: nodes.length,
      edge_count: edges.length,
      nodes,
      edges,
    }, null, 2),
    metadata: {
      node_count: String(nodes.length),
      edge_count: String(edges.length),
      content_type: 'application/json',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Upload an artifact to S3.
 *
 * In production, this uses the AWS SDK v3 S3 client:
 *   import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
 *   const s3 = new S3Client({ region });
 *   await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
 *
 * For the demo, artifacts are logged and can be persisted via the
 * Supabase edge function proxy.
 */
export async function uploadArtifact(
  artifact: Artifact,
  config?: Partial<S3Config>
): Promise<{ key: string; bucket: string; location: string }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // In production with AWS SDK:
  // const s3 = new S3Client({ region: cfg.region });
  // await s3.send(new PutObjectCommand({
  //   Bucket: cfg.bucketName,
  //   Key: artifact.key,
  //   Body: artifact.content,
  //   ContentType: 'application/json',
  //   Metadata: artifact.metadata,
  // }));

  // For demo: log the artifact upload
  console.log(`[S3] Uploading artifact to s3://${cfg.bucketName}/${artifact.key}`);
  console.log(`[S3] Type: ${artifact.type}, Size: ${artifact.content.length} bytes`);

  return {
    key: artifact.key,
    bucket: cfg.bucketName,
    location: `s3://${cfg.bucketName}/${artifact.key}`,
  };
}

/**
 * List artifacts by type from S3.
 * In production: use ListObjectsV2Command with prefix.
 */
export async function listArtifacts(
  type: ArtifactType,
  config?: Partial<S3Config>
): Promise<string[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const prefix = `${type}/`;

  // In production:
  // const s3 = new S3Client({ region: cfg.region });
  // const response = await s3.send(new ListObjectsV2Command({
  //   Bucket: cfg.bucketName,
  //   Prefix: prefix,
  // }));
  // return (response.Contents || []).map(o => o.Key!);

  console.log(`[S3] Listing artifacts with prefix: ${prefix} in bucket: ${cfg.bucketName}`);
  return [];
}

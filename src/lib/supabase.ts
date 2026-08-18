import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});

export type Conversation = {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: 'user' | 'agent';
  content: string;
  created_at: string;
};

export type MemoryCategory = 'fact' | 'preference' | 'event' | 'skill' | 'relationship' | 'goal';

export type Memory = {
  id: string;
  conversation_id: string | null;
  content: string;
  category: MemoryCategory;
  importance: number;
  embedding: number[] | null;
  last_recalled_at: string | null;
  recall_count: number;
  created_at: string;
  updated_at: string;
};

export type EntityType = 'person' | 'place' | 'concept' | 'organization' | 'project' | 'tool';

export type Entity = {
  id: string;
  name: string;
  type: EntityType;
  description: string | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
};

export type MemoryLink = {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: 'related' | 'caused' | 'part_of' | 'contradicts' | 'supports' | 'evolved_from';
  strength: number;
  created_at: string;
};

export type Reflection = {
  id: string;
  reflection_text: string;
  memories_consolidated: number;
  created_at: string;
};

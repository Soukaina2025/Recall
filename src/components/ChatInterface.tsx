import { useState, useRef, useEffect } from 'react';
import { Send, Brain, Sparkles, Network, Loader2, Trash2, Plus, MessageSquare } from 'lucide-react';
import { supabase, type Conversation, type Message, type Memory } from '@/lib/supabase';
import { extractMemories, retrieveRelevantMemories, storeMemories, generateAgentResponse } from '@/lib/memoryEngine';

type Props = {
  onMemoriesChanged: () => void;
};

export default function ChatInterface({ onMemoriesChanged }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [recalledMemories, setRecalledMemories] = useState<Memory[]>([]);
  const [newMemories, setNewMemories] = useState<Memory[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation.id);
    } else {
      setMessages([]);
      setRecalledMemories([]);
      setNewMemories([]);
    }
  }, [activeConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversations() {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) setConversations(data as Conversation[]);
  }

  async function loadMessages(conversationId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data as Message[]);
  }

  async function startNewConversation() {
    const { data, error } = await supabase
      .from('conversations')
      .insert({ title: 'New Conversation' })
      .select('*')
      .single();

    if (data && !error) {
      const newConv = data as Conversation;
      setActiveConversation(newConv);
      setConversations([newConv, ...conversations]);
      setMessages([]);
      setRecalledMemories([]);
      setNewMemories([]);
      inputRef.current?.focus();
    }
  }

  async function deleteConversation(id: string) {
    await supabase.from('conversations').delete().eq('id', id);
    if (activeConversation?.id === id) {
      setActiveConversation(null);
      setMessages([]);
    }
    setConversations(conversations.filter((c) => c.id !== id));
    onMemoriesChanged();
  }

  async function sendMessage() {
    if (!input.trim() || isThinking) return;

    let conversation = activeConversation;
    if (!conversation) {
      const { data, error } = await supabase
        .from('conversations')
        .insert({ title: input.slice(0, 50) })
        .select('*')
        .single();
      if (data && !error) {
        conversation = data as Conversation;
        setActiveConversation(conversation);
        setConversations([conversation, ...conversations]);
      } else {
        return;
      }
    }

    const userMessage = input.trim();
    setInput('');
    setIsThinking(true);
    setNewMemories([]);

    // Insert user message
    const { data: insertedMsg } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        role: 'user',
        content: userMessage,
      })
      .select('*')
      .single();

    if (insertedMsg) {
      setMessages((prev) => [...prev, insertedMsg as Message]);
    }

    // Update conversation title if it's the first message
    if (messages.length === 0) {
      const title = userMessage.slice(0, 50);
      await supabase.from('conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', conversation.id);
      setConversations((prev) => prev.map((c) => c.id === conversation!.id ? { ...c, title } : c));
    }

    // Step 1: Retrieve relevant memories
    const recalled = await retrieveRelevantMemories(userMessage, 5);
    setRecalledMemories(recalled);

    // Step 2: Extract new memories from user message
    const extracted = extractMemories(userMessage);
    const stored = await storeMemories(extracted, conversation.id);
    setNewMemories(stored);

    // Step 3: Generate response using recalled memories
    const response = generateAgentResponse(userMessage, recalled);

    // Small delay for natural feel
    await new Promise((r) => setTimeout(r, 600));

    // Insert agent message
    const { data: agentMsg } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        role: 'agent',
        content: response,
      })
      .select('*')
      .single();

    if (agentMsg) {
      setMessages((prev) => [...prev, agentMsg as Message]);
    }

    // Update conversation timestamp
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);

    setIsThinking(false);
    onMemoriesChanged();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar — conversations */}
      <div className="w-64 flex-shrink-0 border-r border-border bg-surface/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <button onClick={startNewConversation} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <div className="text-center py-8 text-text-dim text-sm">
              No conversations yet
            </div>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                activeConversation?.id === conv.id
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-surface-2 text-text-muted'
              }`}
              onClick={() => setActiveConversation(conv)}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm truncate flex-1">{conv.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-text-dim hover:text-error"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Memory context bar */}
        {(recalledMemories.length > 0 || newMemories.length > 0) && (
          <div className="border-b border-border bg-surface/30 px-6 py-3 animate-slide-up">
            <div className="flex items-center gap-4 flex-wrap">
              {recalledMemories.length > 0 && (
                <div className="flex items-center gap-2">
                  <Network className="w-3.5 h-3.5 text-accent" />
                  <span className="text-xs text-text-muted">Recalled {recalledMemories.length} memories</span>
                </div>
              )}
              {newMemories.length > 0 && (
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs text-text-muted">Extracted {newMemories.length} new memories</span>
                </div>
              )}
              {recalledMemories.slice(0, 3).map((m, i) => (
                <div key={i} className="chip bg-accent/10 text-accent border border-accent/20">
                  {m.category}
                </div>
              ))}
              {newMemories.slice(0, 3).map((m, i) => (
                <div key={i} className="chip bg-primary/10 text-primary border border-primary/20">
                  {m.category}: {m.content.slice(0, 30)}...
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 && !isThinking && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-5 animate-float">
                <Brain className="w-8 h-8 text-bg" strokeWidth={2.5} />
              </div>
              <h3 className="font-display text-xl font-semibold text-white mb-2">
                {activeConversation ? 'Start the conversation' : 'Create a conversation to begin'}
              </h3>
              <p className="text-sm text-text-muted leading-relaxed">
                Tell Recall about yourself, your projects, your preferences. The agent will extract and store
                memories, then recall them in future conversations.
              </p>
              <div className="mt-6 space-y-2 text-left w-full">
                {[
                  'Hi, I work as a software engineer in Berlin',
                  'My favorite programming language is Rust',
                  'I plan to learn machine learning this year',
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                    className="block w-full text-left text-sm text-text-muted bg-surface-2/50 hover:bg-surface-2 hover:text-text rounded-lg px-4 py-2.5 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 animate-slide-up ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-surface-2'
                    : 'bg-gradient-to-br from-primary to-accent'
                }`}>
                  {msg.role === 'user' ? (
                    <span className="text-xs font-semibold text-text-muted">U</span>
                  ) : (
                    <Brain className="w-4 h-4 text-bg" strokeWidth={2.5} />
                  )}
                </div>
                <div className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                  msg.role === 'user'
                    ? 'bg-surface-2 text-text'
                    : 'glass text-text'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex gap-3 animate-slide-up">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                  <Brain className="w-4 h-4 text-bg" strokeWidth={2.5} />
                </div>
                <div className="glass rounded-2xl px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  <span className="text-sm text-text-muted">Recalling memories...</span>
                </div>
              </div>
            )}
          </div>
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-4 bg-surface/30">
          <div className="max-w-3xl mx-auto flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell Recall something about yourself..."
              rows={1}
              className="input-field flex-1 resize-none max-h-32"
              style={{ minHeight: '48px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isThinking}
              className="btn-primary h-12 w-12 flex items-center justify-center flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

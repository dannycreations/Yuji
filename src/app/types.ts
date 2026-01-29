export type Role = 'system' | 'user' | 'assistant';

export interface Attachment {
  id: string;
  type: 'image';
  url: string; // Base64 or URL
  name: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
  timestamp: number;
  parentId?: string; // For branching
  childrenIds?: string[]; // For branching
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[]; // All messages in the tree
  activeMessageId?: string; // The "leaf" node defining the current path
  createdAt: number;
  updatedAt: number;
  systemPrompt?: string;
  modelConfig?: ModelConfig;
}

export interface ModelConfig {
  provider: 'openai' | 'custom';
  model: string;
  temperature: number;
  maxTokens?: number;
  topP?: number;
}

export interface Settings {
  apiKey: string;
  baseUrl: string; // For custom providers
  defaultSystemPrompt: string;
  defaultModel: string;
  theme: 'dark' | 'light';
  enterToSend: boolean;

  // Persona Settings
  userName: string;
  userOccupation: string;
  assistantTraits: string[];
  additionalContext: string;
}

export interface AppState {
  sessions: Record<string, ChatSession>;
  activeSessionId: string | null;
  settings: Settings;
  isSidebarOpen: boolean;
  isSettingsOpen: boolean;
}

export type ChatAction =
  | { type: 'CREATE_SESSION' }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'SET_ACTIVE_SESSION'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: { sessionId: string; message: Message } }
  | { type: 'UPDATE_MESSAGE'; payload: { sessionId: string; messageId: string; content: string } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'TOGGLE_SETTINGS' }
  | { type: 'CLEAR_HISTORY' };

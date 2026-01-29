import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_SETTINGS } from '../app/constants';
import { AppState, ChatSession, Message, Settings } from '../app/types';

interface Store extends AppState {
  createSession: () => string;
  deleteSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  switchBranch: (sessionId: string, messageId: string) => void;
  addMessage: (sessionId: string, message: Message) => void;
  removeMessage: (sessionId: string, messageId: string) => void;
  updateMessage: (sessionId: string, messageId: string, content: string) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  toggleSidebar: () => void;
  toggleSettings: () => void;
  setSessionSystemPrompt: (sessionId: string, prompt: string) => void;
  setSessionModel: (sessionId: string, model: string) => void;
  branchChat: (sessionId: string, messageId: string) => string;
  importSessions: (sessions: Record<string, ChatSession>) => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      sessions: {},
      activeSessionId: null,
      settings: DEFAULT_SETTINGS,
      isSidebarOpen: true,
      isSettingsOpen: false,

      createSession: () => {
        const id = crypto.randomUUID();
        const newSession: ChatSession = {
          id,
          title: 'New Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          systemPrompt: get().settings.defaultSystemPrompt,
          modelConfig: {
            provider: 'openai',
            model: get().settings.defaultModel,
            temperature: 0.7,
          },
        };
        set((state) => ({
          sessions: { [id]: newSession, ...state.sessions },
          activeSessionId: id,
        }));
        return id;
      },

      deleteSession: (id) => {
        set((state) => {
          const { [id]: deleted, ...rest } = state.sessions;
          let newActiveId = state.activeSessionId;
          if (state.activeSessionId === id) {
            const keys = Object.keys(rest);
            newActiveId = keys.length > 0 ? keys[0] : null;
          }
          return { sessions: rest, activeSessionId: newActiveId };
        });
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      switchBranch: (sessionId, messageId) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                activeMessageId: messageId,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      addMessage: (sessionId, message) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          // Clone messages to avoid direct mutations (safety check)
          const messages = JSON.parse(JSON.stringify(session.messages)) as Message[];

          // If message has parentId, update parent's childrenIds
          if (message.parentId) {
            const parent = messages.find((m) => m.id === message.parentId);
            if (parent) {
              parent.childrenIds = [...(parent.childrenIds || []), message.id];
            }
          }

          messages.push(message);

          // Auto-update title if it's the first user message
          let title = session.title;
          if (session.messages.length === 0 && message.role === 'user' && message.content) {
            title = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
          }

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages,
                activeMessageId: message.id,
                title,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      removeMessage: (sessionId, messageId) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const updatedMessages = session.messages.filter((m) => m.id !== messageId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages: updatedMessages,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      updateMessage: (sessionId, messageId, content) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          const updatedMessages = session.messages.map((m) => (m.id === messageId ? { ...m, content } : m));

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages: updatedMessages,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),

      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

      toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

      setSessionSystemPrompt: (sessionId, prompt) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, systemPrompt: prompt },
            },
          };
        });
      },

      setSessionModel: (sessionId, model) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                modelConfig: {
                  ...(session.modelConfig || { provider: 'openai', temperature: 0.7 }),
                  model,
                },
              },
            },
          };
        });
      },

      branchChat: (sessionId, messageId) => {
        const state = get();
        const sourceSession = state.sessions[sessionId];
        if (!sourceSession) return sessionId;

        // Find index of the message to branch from
        const messageIndex = sourceSession.messages.findIndex((m) => m.id === messageId);
        if (messageIndex === -1) return sessionId;

        // Create new session with messages up to (and including) the branch point
        const newId = crypto.randomUUID();
        const branchedMessages = sourceSession.messages.slice(0, messageIndex + 1);

        const newSession: ChatSession = {
          ...sourceSession,
          id: newId,
          title: `${sourceSession.title} (Branch)`,
          messages: branchedMessages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          sessions: { [newId]: newSession, ...state.sessions },
          activeSessionId: newId,
        }));

        return newId;
      },

      importSessions: (newSessions) => {
        set((state) => ({
          sessions: { ...state.sessions, ...newSessions },
        }));
      },
    }),
    {
      name: 'yuji-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

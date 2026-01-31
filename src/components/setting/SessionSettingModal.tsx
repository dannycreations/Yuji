import clsx from 'clsx';
import { Effect } from 'effect';
import { useState } from 'react';

import { useAction, useStore } from '../../hooks/useStore';
import { ChatService } from '../../services/ChatService';
import { StoreService } from '../../services/StoreService';
import { Icon } from '../shared/Icon';

import type { FC } from 'react';
import type { AppState } from '../../app/Schema';

interface SessionSettingModalProps {
  readonly sessionId: string;
  readonly onClose: () => void;
}

type SessionSettingTab = 'general' | 'persona';

export const SessionSettingModal: FC<SessionSettingModalProps> = ({ sessionId, onClose }) => {
  const sessions = useStore((s: AppState) => s.sessions, {});

  const setSessionSystemPrompt = useAction((sessionId: string, prompt: string, override?: boolean) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      yield* store.update((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;
        return {
          ...state,
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...session,
              systemPrompt: prompt,
              overrideGlobalPrompt: override !== undefined ? override : session.overrideGlobalPrompt,
            },
          },
        };
      });
    }),
  );

  const setSessionModel = useAction((sessionId: string, model: string) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      yield* store.update((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;
        return {
          ...state,
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...session,
              modelConfig: {
                ...(session.modelConfig || { provider: 'openai', temperature: 0.7 }),
                model,
                provider: 'openai',
              },
            },
          },
        };
      });
    }),
  );

  const renameSession = useAction((sessionId: string, title: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.renameSession(sessionId, title);
    }),
  );
  const session = sessions[sessionId];

  const [activeTab, setActiveTab] = useState<SessionSettingTab>('general');
  const [title, setTitle] = useState(session?.title || '');
  const [prompt, setPrompt] = useState(session?.systemPrompt || '');
  const [overrideGlobal, setOverrideGlobal] = useState(session?.overrideGlobalPrompt ?? true);
  const [model, setModel] = useState(session?.modelConfig?.model || '');

  if (!session) return null;

  const handleSave = () => {
    if (title && title !== session.title) {
      renameSession(sessionId, title);
    }
    setSessionSystemPrompt(sessionId, prompt, overrideGlobal);
    if (model) {
      setSessionModel(sessionId, model);
    }
    onClose();
  };

  const tabs: { id: SessionSettingTab; label: string; icon: any }[] = [
    { id: 'general', label: 'General', icon: 'Settings' },
    { id: 'persona', label: 'Persona', icon: 'Sparkles' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg h-[500px] bg-surface border border-surface_light rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        <div className="flex-shrink-0 bg-surface_light/30 border-b border-surface_light backdrop-blur-md">
          <div className="flex items-center justify-between px-5 py-3.5">
            <h2 className="text-base font-display font-bold text-white tracking-tight">Chat Settings</h2>
            <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full transition-colors">
              <Icon name="X" size={16} />
            </button>
          </div>

          <div className="px-5 flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all outline-none whitespace-nowrap',
                  activeTab === tab.id ? 'border-primary text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700',
                )}
              >
                <Icon name={tab.icon} size={14} className={clsx(activeTab === tab.id ? 'text-primary' : 'text-zinc-500')} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {activeTab === 'general' && (
            <div className="space-y-6 animate-fade-in">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Chat Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-black border border-surface_light rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                  placeholder="Enter chat title..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-black border border-surface_light rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                  placeholder="e.g., gpt-4o"
                />
                <p className="text-[10px] text-zinc-500 italic">Overrides default model for this chat</p>
              </div>
            </div>
          )}

          {activeTab === 'persona' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between p-3.5 bg-surface_light/20 rounded-xl border border-surface_light/50">
                <div className="space-y-0.5 pr-4">
                  <label className="text-xs font-semibold text-zinc-200 block">Override Global Persona</label>
                  <p className="text-[10px] text-zinc-500 leading-tight">
                    {overrideGlobal ? 'Use only instructions below' : 'Combine with global settings'}
                  </p>
                </div>
                <button
                  onClick={() => setOverrideGlobal(!overrideGlobal)}
                  className={clsx('w-9 h-5 rounded-full transition-colors relative flex-shrink-0', overrideGlobal ? 'bg-primary' : 'bg-zinc-700')}
                >
                  <div
                    className={clsx(
                      'absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform shadow-sm',
                      overrideGlobal ? 'translate-x-4' : '',
                    )}
                  />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Chat Instructions</label>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full h-40 bg-black border border-surface_light rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700 resize-none font-mono"
                  placeholder="Enter custom instructions for this specific conversation..."
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-6 py-4 bg-surface_light/20 border-t border-surface_light flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-semibold transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary_hover transition-colors shadow-lg shadow-primary/10 active:scale-95 duration-100"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

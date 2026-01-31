import clsx from 'clsx';
import { Effect } from 'effect';
import { useEffect, useState } from 'react';

import { useAction, useStore } from '../../hooks/useStore';
import { ChatService } from '../../services/ChatService';
import { StoreService } from '../../services/StoreService';
import { SettingModal } from '../shared/SettingModal';

import type { FC } from 'react';
import type { AppState } from '../../app/Schema';
import type { SettingTabItem } from '../shared/SettingModal';

interface SessionSettingModalProps {
  readonly sessionId: string;
  readonly onClose: () => void;
}

const SESSION_SETTING_TABS: SettingTabItem[] = [
  { icon: 'Settings', id: 'general', label: 'General' },
  { icon: 'Sparkles', id: 'persona', label: 'Persona' },
];

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

  const [activeTab, setActiveTab] = useState('general');
  const [title, setTitle] = useState(session?.title || '');
  const [prompt, setPrompt] = useState(session?.systemPrompt || '');
  const [overrideGlobal, setOverrideGlobal] = useState(session?.overrideGlobalPrompt ?? true);
  const [model, setModel] = useState(session?.modelConfig?.model || '');

  useEffect(() => {
    if (session) {
      setTitle(session.title || '');
      setPrompt(session.systemPrompt || '');
      setOverrideGlobal(session.overrideGlobalPrompt ?? true);
      setModel(session.modelConfig?.model || '');
    }
  }, [session]);

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

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-5 animate-fade-in">
            <h3 className="text-lg font-medium text-white mb-4">Chat Configuration</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Chat Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                placeholder="Enter chat title..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                placeholder="e.g., gpt-4o"
              />
              <p className="text-xs text-zinc-500">Overrides the global default model for this specific chat.</p>
            </div>
          </div>
        );

      case 'persona':
        return (
          <div className="space-y-5 animate-fade-in">
            <h3 className="text-lg font-medium text-white mb-4">Chat Persona</h3>
            <div className="flex items-center justify-between px-4 py-3.5 bg-white/5 rounded-xl border border-white/5 hover:bg-white/[0.07] transition-colors">
              <div className="space-y-1 pr-4">
                <label className="text-sm font-semibold text-zinc-200 block">Override Global Persona</label>
                <p className="text-xs text-zinc-500 leading-tight">
                  {overrideGlobal ? 'Only use the instructions below.' : 'Combine below instructions with global persona settings.'}
                </p>
              </div>
              <button
                onClick={() => setOverrideGlobal(!overrideGlobal)}
                className={clsx('w-11 h-6 rounded-full transition-colors relative flex-shrink-0', overrideGlobal ? 'bg-primary' : 'bg-zinc-700')}
              >
                <div
                  className={clsx(
                    'absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm',
                    overrideGlobal ? 'translate-x-5' : '',
                  )}
                />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">System Instructions</label>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-64 bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700 resize-none font-mono leading-relaxed"
                placeholder="Enter custom instructions for this specific conversation..."
              />
            </div>
          </div>
        );
    }
  };

  return (
    <SettingModal
      title="Chat Settings"
      tabs={SESSION_SETTING_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-semibold transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary_hover transition-colors shadow-lg shadow-primary/20 active:scale-95 duration-100"
          >
            Save Changes
          </button>
        </>
      }
    >
      {renderContent()}
    </SettingModal>
  );
};

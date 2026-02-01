import { Effect } from 'effect';
import { useEffect, useState } from 'react';

import { useAction, useStore } from '../../hooks/useStore';
import { ChatService } from '../../services/ChatService';
import { StoreService } from '../../services/StoreService';
import { InputSwitch, InputText, InputTextarea } from '../shared/InputArea';
import { SettingModal } from '../shared/modal/SettingModal';

import type { FC } from 'react';
import type { AppState } from '../../app/Schema';
import type { SettingTabItem } from '../shared/modal/SettingModal';

interface SessionSettingModalProps {
  readonly sessionId: string;
  readonly onClose: () => void;
}

const SESSION_SETTING_TABS: SettingTabItem[] = [
  { icon: 'Settings', id: 'general', label: 'General' },
  { icon: 'User', id: 'persona', label: 'Personalization' },
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

  const handleClose = () => {
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
          <div className="space-y-3 animate-fade-in">
            <div className="space-y-2">
              <label className="settings-label">Chat Title</label>
              <InputText value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter chat title..." />
            </div>

            <div className="space-y-2">
              <label className="settings-label">Model Override</label>
              <InputText value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g., gpt-4o" />
              <p className="text-xs text-text-secondary">Overrides the global default model for this specific chat.</p>
            </div>
          </div>
        );

      case 'persona':
        return (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between py-2 border-b border-separator">
              <div>
                <div className="text-sm text-text-primary">Override Global Persona</div>
                <div className="text-xs text-text-secondary">
                  {overrideGlobal ? 'Only use the instructions below.' : 'Combine below instructions with global persona settings.'}
                </div>
              </div>
              <InputSwitch checked={overrideGlobal} onChange={setOverrideGlobal} />
            </div>

            <div className="space-y-2">
              <label className="settings-label">System Instructions</label>
              <InputTextarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                minRows={8}
                className="font-mono"
                placeholder="Enter custom instructions for this specific conversation..."
              />
            </div>
          </div>
        );
    }
  };

  const activeTabLabel = SESSION_SETTING_TABS.find((t) => t.id === activeTab)?.label || '';

  return (
    <SettingModal tabs={SESSION_SETTING_TABS} activeTab={activeTab} onTabChange={setActiveTab} onClose={handleClose} title={activeTabLabel}>
      {renderContent()}
    </SettingModal>
  );
};

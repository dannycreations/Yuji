import { Effect } from 'effect';
import { useState } from 'react';

import { useAction, useStore } from '../../hooks/useStore';
import { StoreService } from '../../services/StoreService';
import { Icon } from '../shared/Icon';
import { InputSwitch, InputText } from '../shared/InputArea';
import { SettingModal } from '../shared/modal/SettingModal';
import { InstructionSection, PersonalisationSection } from './SettingSection';

import type { FC } from 'react';
import type { AppState, ChatSession } from '../../app/Schema';
import type { SettingTabItem } from '../shared/modal/SettingModal';

interface SessionSettingModalProps {
  readonly sessionId: string;
  readonly onClose: () => void;
}

const SESSION_SETTING_TABS: SettingTabItem[] = [
  { icon: 'Settings', id: 'general', label: 'General' },
  { icon: 'Terminal', id: 'instruction', label: 'Instruction' },
  { icon: 'User', id: 'persona', label: 'Personalization' },
];

export const SessionSettingModal: FC<SessionSettingModalProps> = ({ sessionId, onClose }) => {
  const sessions = useStore((s: AppState) => s.sessions, {});

  const updateSession = useAction((sessionId: string, updates: Partial<ChatSession>) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      yield* store.update((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;
        return {
          ...state,
          sessions: {
            ...state.sessions,
            [sessionId]: { ...session, ...updates },
          },
        };
      });
    }),
  );

  const session = sessions[sessionId];

  const [activeTab, setActiveTab] = useState('general');

  if (!session) return null;

  const updateGeneral = (updates: Partial<ChatSession['general']>) => {
    updateSession(sessionId, { general: { ...session.general, ...updates } });
  };

  const updateInstruction = (updates: Partial<ChatSession['instruction']>) => {
    updateSession(sessionId, { instruction: { ...session.instruction, ...updates } });
  };

  const updatePersonalisation = (updates: Partial<ChatSession['personalisation']>) => {
    updateSession(sessionId, { personalisation: { ...session.personalisation, ...updates } });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
            <div className="space-y-2">
              <label className="settings-label">Chat Title</label>
              <InputText
                value={session.title}
                onChange={(e) => updateSession(sessionId, { title: e.target.value })}
                placeholder="Enter chat title..."
              />
            </div>

            <div className="flex items-center justify-between py-2 border-b border-separator">
              <div>
                <div className="text-sm text-text-primary">Override Global Model</div>
                <div className="text-xs text-text-secondary">Use a specific model for this chat.</div>
              </div>
              <InputSwitch checked={!!session.general.overrideModel} onChange={(checked) => updateGeneral({ overrideModel: checked })} />
            </div>

            {session.general.overrideModel && (
              <div className="space-y-2 animate-fade-in">
                <label className="settings-label">Model Name</label>
                <InputText
                  value={session.general.model || ''}
                  onChange={(e) => updateGeneral({ model: e.target.value })}
                  placeholder="e.g., gpt-4o"
                />
              </div>
            )}

            <div className="flex items-center justify-between py-2 border-b border-separator">
              <div>
                <div className="text-sm text-text-primary">Override Instructions</div>
                <div className="text-xs text-text-secondary">Ignore global system prompt.</div>
              </div>
              <InputSwitch checked={!!session.general.overrideInstruction} onChange={(checked) => updateGeneral({ overrideInstruction: checked })} />
            </div>

            <div className="flex items-center justify-between py-2 border-b border-separator">
              <div>
                <div className="text-sm text-text-primary">Override Personalization</div>
                <div className="text-xs text-text-secondary">Ignore global user persona.</div>
              </div>
              <InputSwitch
                checked={!!session.general.overridePersonalisation}
                onChange={(checked) => updateGeneral({ overridePersonalisation: checked })}
              />
            </div>
          </div>
        );

      case 'instruction':
        return (
          <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
            {!session.general.overrideInstruction ? (
              <div className="flex flex-col items-center justify-center py-10 text-text-secondary bg-line rounded-xl border border-dashed border-separator">
                <Icon name="Lock" size={24} className="mb-2 opacity-50" />
                <p className="text-sm">Instruction is following global settings.</p>
                <button
                  onClick={() => updateGeneral({ overrideInstruction: true })}
                  className="mt-4 text-xs font-bold text-primary hover:underline uppercase tracking-widest"
                >
                  Enable Override
                </button>
              </div>
            ) : (
              <InstructionSection
                instruction={session.instruction}
                onChange={updateInstruction}
                footer="This will completely replace the global system prompt."
              />
            )}
          </div>
        );

      case 'persona':
        return (
          <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
            {!session.general.overridePersonalisation ? (
              <div className="flex flex-col items-center justify-center py-10 text-text-secondary bg-line rounded-xl border border-dashed border-separator">
                <Icon name="Lock" size={24} className="mb-2 opacity-50" />
                <p className="text-sm">Personalization is following global settings.</p>
                <button
                  onClick={() => updateGeneral({ overridePersonalisation: true })}
                  className="mt-4 text-xs font-bold text-primary hover:underline uppercase tracking-widest"
                >
                  Enable Override
                </button>
              </div>
            ) : (
              <PersonalisationSection personalisation={session.personalisation} onChange={updatePersonalisation} />
            )}
          </div>
        );
    }
  };

  const activeTabLabel = SESSION_SETTING_TABS.find((t) => t.id === activeTab)?.label || '';

  return (
    <SettingModal tabs={SESSION_SETTING_TABS} activeTab={activeTab} onTabChange={setActiveTab} onClose={onClose} title={activeTabLabel}>
      {renderContent()}
    </SettingModal>
  );
};

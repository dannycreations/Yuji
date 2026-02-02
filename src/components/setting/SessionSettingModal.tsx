import { useState } from 'react';

import { useStore, useUpdateStore } from '../../hooks/useStore';
import { Icon } from '../shared/Icon';
import { InputText } from '../shared/InputArea';
import { SettingModal } from '../shared/modal/SettingModal';
import { InstructionSection, OverrideSection, PersonalisationSection } from './SettingSection';

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

  const updateStore = useUpdateStore();

  const updateSession = (updates: Partial<ChatSession>) =>
    updateStore((state) => {
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

  const session = sessions[sessionId];

  const [activeTab, setActiveTab] = useState('general');

  if (!session) return null;

  const updateGeneral = (updates: Partial<ChatSession['general']>) => {
    updateSession({ general: { ...session.general, ...updates } });
  };

  const updateInstruction = (updates: Partial<ChatSession['instruction']>) => {
    updateSession({ instruction: { ...session.instruction, ...updates } });
  };

  const updatePersonalisation = (updates: Partial<ChatSession['personalisation']>) => {
    updateSession({ personalisation: { ...session.personalisation, ...updates } });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
            <div className="space-y-2">
              <label className="settings-label">Chat Title</label>
              <InputText value={session.title} onChange={(e) => updateSession({ title: e.target.value })} placeholder="Enter chat title..." />
            </div>

            <OverrideSection
              title="Override Instruction"
              description="Ignore global system prompt."
              checked={!!session.general.overrideInstruction}
              onChange={(checked) => updateGeneral({ overrideInstruction: checked })}
            />

            <OverrideSection
              title="Override Personalization"
              description="Ignore global user persona."
              checked={!!session.general.overridePersonalisation}
              onChange={(checked) => updateGeneral({ overridePersonalisation: checked })}
            />
          </div>
        );

      case 'instruction':
        return (
          <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
            {session.general.overrideInstruction ? (
              <InstructionSection
                instruction={session.instruction}
                onChange={updateInstruction}
                footer="This will completely replace the global system prompt."
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-text-secondary bg-line rounded-xl border border-dashed border-separator animate-fade-in">
                <Icon name="Lock" size={24} className="mb-2 opacity-50" />
                <p className="text-sm">Instruction is following global settings.</p>
                <button
                  onClick={() => updateGeneral({ overrideInstruction: true })}
                  className="mt-4 text-xs font-bold text-primary hover:underline uppercase tracking-widest"
                >
                  Enable Override
                </button>
              </div>
            )}
          </div>
        );

      case 'persona':
        return (
          <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
            {session.general.overridePersonalisation ? (
              <PersonalisationSection personalisation={session.personalisation} onChange={updatePersonalisation} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-text-secondary bg-line rounded-xl border border-dashed border-separator animate-fade-in">
                <Icon name="Lock" size={24} className="mb-2 opacity-50" />
                <p className="text-sm">Personalization is following global settings.</p>
                <button
                  onClick={() => updateGeneral({ overridePersonalisation: true })}
                  className="mt-4 text-xs font-bold text-primary hover:underline uppercase tracking-widest"
                >
                  Enable Override
                </button>
              </div>
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

import { useState } from 'react';

import { useStore, useUpdateStore } from '../../hooks/useStore';
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
              title="Override Global Model"
              description="Use a specific model for this chat."
              checked={!!session.general.overrideModel}
              onChange={(checked) => updateGeneral({ overrideModel: checked })}
            >
              <div className="space-y-2">
                <label className="settings-label">Model Name</label>
                <InputText
                  value={session.general.model || ''}
                  onChange={(e) => updateGeneral({ model: e.target.value })}
                  placeholder="e.g., gpt-4o"
                />
              </div>
            </OverrideSection>

            <OverrideSection
              title="Override Instructions"
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
            <OverrideSection
              title="Override Instructions"
              description="Instruction is following global settings."
              checked={!!session.general.overrideInstruction}
              onChange={(checked) => updateGeneral({ overrideInstruction: checked })}
              onEnable={() => updateGeneral({ overrideInstruction: true })}
            >
              <InstructionSection
                instruction={session.instruction}
                onChange={updateInstruction}
                footer="This will completely replace the global system prompt."
              />
            </OverrideSection>
          </div>
        );

      case 'persona':
        return (
          <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
            <OverrideSection
              title="Override Personalization"
              description="Personalization is following global settings."
              checked={!!session.general.overridePersonalisation}
              onChange={(checked) => updateGeneral({ overridePersonalisation: checked })}
              onEnable={() => updateGeneral({ overridePersonalisation: true })}
            >
              <PersonalisationSection personalisation={session.personalisation} onChange={updatePersonalisation} />
            </OverrideSection>
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

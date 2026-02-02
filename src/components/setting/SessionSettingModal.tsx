import { Effect } from 'effect';
import { useState } from 'react';

import { useStore, useStoreEffect } from '../../hooks/useStore';
import { ChatService } from '../../services/ChatService';
import { InputSwitch, InputText } from '../shared/InputArea';
import { SettingModal } from '../shared/modal/SettingModal';
import { InstructionSection, OverrideSection, PersonalisationSection, SectionWrapper, SettingField, SettingItem } from './SettingSection';

import type { FC } from 'react';
import type { ChatSession } from '../../app/Schema';
import type { SettingTabItem } from '../shared/modal/SettingModal';

interface SessionSettingModalProps {
  readonly sessionId: string;
  readonly onClose: () => void;
}

const SESSION_SETTING_TABS: ReadonlyArray<SettingTabItem> = [
  { icon: 'Settings', id: 'general', label: 'General' },
  { icon: 'Terminal', id: 'instruction', label: 'Instruction' },
  { icon: 'User', id: 'persona', label: 'Personalization' },
];

export const SessionSettingModal: FC<SessionSettingModalProps> = ({ sessionId, onClose }) => {
  const sessions = useStore((s) => s.sessions);
  const session = sessions[sessionId];

  const updateSessionEffect = useStoreEffect((sessionId: string, f: (s: ChatSession, now: number) => ChatSession) =>
    Effect.flatMap(ChatService, (chat) => chat.updateSession(sessionId, f)),
  );

  const [activeTab, setActiveTab] = useState('general');

  if (!session) return null;

  const updateSession = (updates: Partial<ChatSession>) => updateSessionEffect(sessionId, (s) => ({ ...s, ...updates }));
  const updateGeneral = (updates: Partial<ChatSession['general']>) => updateSession({ general: { ...session.general, ...updates } });

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <SectionWrapper className="space-y-3">
            <SettingField label="Chat Title">
              <InputText value={session.title} onChange={(e) => updateSession({ title: e.target.value })} placeholder="Enter chat title..." />
            </SettingField>

            <SettingItem label="Override Instruction" description="Ignore global system prompt." className="border-t border-separator mt-2 pt-2">
              <InputSwitch checked={!!session.general.overrideInstruction} onChange={(checked) => updateGeneral({ overrideInstruction: checked })} />
            </SettingItem>

            <SettingItem label="Override Personalization" description="Ignore global user persona." className="border-t border-separator pt-2">
              <InputSwitch
                checked={!!session.general.overridePersonalisation}
                onChange={(checked) => updateGeneral({ overridePersonalisation: checked })}
              />
            </SettingItem>
          </SectionWrapper>
        );

      case 'instruction':
        return (
          <SectionWrapper>
            <OverrideSection
              title="Session Instruction"
              description="System prompt for this specific chat."
              lockDescription="Instruction is following global settings."
              checked={!!session.general.overrideInstruction}
              onChange={(checked) => updateGeneral({ overrideInstruction: checked })}
            >
              <InstructionSection
                instruction={session.instruction}
                onChange={(updates) => updateSession({ instruction: { ...session.instruction, ...updates } })}
                footer="This will completely replace the global system prompt."
              />
            </OverrideSection>
          </SectionWrapper>
        );

      case 'persona':
        return (
          <SectionWrapper>
            <OverrideSection
              title="Session Personalization"
              description="User persona for this specific chat."
              lockDescription="Personalization is following global settings."
              checked={!!session.general.overridePersonalisation}
              onChange={(checked) => updateGeneral({ overridePersonalisation: checked })}
            >
              <PersonalisationSection
                personalisation={session.personalisation}
                onChange={(updates) => updateSession({ personalisation: { ...session.personalisation, ...updates } })}
              />
            </OverrideSection>
          </SectionWrapper>
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

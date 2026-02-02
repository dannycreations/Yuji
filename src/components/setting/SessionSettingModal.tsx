import { Effect } from 'effect';
import { useState } from 'react';

import { useAction, useStore } from '../../hooks/useStore';
import { ChatService } from '../../services/ChatService';
import { InputSwitch, InputText } from '../shared/InputArea';
import { SettingModal } from '../shared/modal/SettingModal';
import { InstructionSection, OverrideSection, PersonalisationSection } from './SettingSection';

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
  const sessions = useStore((s) => s.sessions, {});
  const session = sessions[sessionId];

  const updateSessionEffect = useAction((sessionId: string, f: (s: ChatSession, now: number) => ChatSession) =>
    Effect.flatMap(ChatService, (chat) => chat.updateSession(sessionId, f)),
  );

  const [activeTab, setActiveTab] = useState('general');

  if (!session) return null;

  const updateSession = (updates: Partial<ChatSession>) => {
    updateSessionEffect(sessionId, (s: ChatSession) => ({ ...s, ...updates }));
  };

  const updateGeneral = (updates: Partial<ChatSession['general']>) => {
    updateSession({ general: { ...session.general, ...updates } });
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

            <div className="py-2 border-t border-separator mt-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-text-primary">Override Instruction</div>
                  <div className="text-xs text-text-secondary">Ignore global system prompt.</div>
                </div>
                <InputSwitch
                  checked={!!session.general.overrideInstruction}
                  onChange={(checked) => updateGeneral({ overrideInstruction: checked })}
                />
              </div>
            </div>

            <div className="py-2 border-t border-separator">
              <div className="flex items-center justify-between">
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
          </div>
        );

      case 'instruction':
        return (
          <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
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
          </div>
        );

      case 'persona':
        return (
          <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
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

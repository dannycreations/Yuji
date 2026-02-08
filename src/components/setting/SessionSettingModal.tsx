import { Effect } from 'effect';
import { useEffect, useState } from 'react';

import { useStore, useStoreAction, useStoreEffect } from '../../hooks/useStore';
import { ChatService } from '../../services/ChatService';
import { StorageService } from '../../services/StorageService';
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

const SESSION_SETTING_TABS: SettingTabItem[] = [
  { icon: 'Settings', id: 'general', label: 'General' },
  { icon: 'Terminal', id: 'instruction', label: 'Instruction' },
  { icon: 'User', id: 'persona', label: 'Personalization' },
];

export const SessionSettingModal: FC<SessionSettingModalProps> = ({ sessionId, onClose }) => {
  const activeSession = useStore((s) => s.activeSession);
  const [localSession, setLocalSession] = useState<ChatSession | null>(null);

  const updateSession = useStoreAction(
    (
      _s,
      sessionId: string,
      f: (session: ChatSession, now: number) => ChatSession,
      options?: {
        readonly skipUpdateTimestamp?: boolean;
        readonly metadataOnly?: boolean;
      },
    ) => Effect.flatMap(ChatService, (chat) => chat.updateSession(sessionId, f, options)),
  );
  const getSession = useStoreEffect((id: string) => Effect.flatMap(StorageService, (storage) => storage.getSession(id)));

  const updateTargetSession = (targetId: string, f: (s: ChatSession, now: number) => ChatSession, metadataOnly = false) => {
    updateSession(targetId, f, { metadataOnly });
    if (!metadataOnly) {
      getSession(targetId).then((session) => {
        if (session) setLocalSession(session);
      });
    }
  };

  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    if (activeSession?.id === sessionId) {
      setLocalSession(null);
    } else {
      getSession(sessionId).then((s) => s && setLocalSession(s));
    }
  }, [sessionId, activeSession?.id, getSession]);

  const session = activeSession?.id === sessionId ? activeSession : localSession;
  if (!session) return null;

  const patchSession = (f: (s: ChatSession) => ChatSession, metadataOnly = false) => updateTargetSession(sessionId, (s) => f(s), metadataOnly);

  const handleGeneral = (updates: Partial<ChatSession['general']>) => patchSession((s) => ({ ...s, general: { ...s.general, ...updates } }));

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <SectionWrapper className="space-y-3">
            <SettingField label="Chat Title">
              <InputText
                value={session.title}
                onChange={(e) => patchSession((s) => ({ ...s, title: e.target.value }), true)}
                placeholder="Enter chat title..."
              />
            </SettingField>

            <SettingItem label="Override Instruction" description="Ignore global system prompt." className="panel-section-group mt-2 pt-2">
              <InputSwitch checked={!!session.general.overrideInstruction} onChange={(checked) => handleGeneral({ overrideInstruction: checked })} />
            </SettingItem>

            <SettingItem label="Override Personalization" description="Ignore global user persona." className="panel-section-group pt-2">
              <InputSwitch
                checked={!!session.general.overridePersonalisation}
                onChange={(checked) => handleGeneral({ overridePersonalisation: checked })}
              />
            </SettingItem>
          </SectionWrapper>
        );

      case 'instruction':
        return (
          <SectionWrapper>
            <OverrideSection
              description="Instruction is following global settings."
              checked={!!session.general.overrideInstruction}
              onChange={(checked) => handleGeneral({ overrideInstruction: checked })}
              onDataChange={(updates) => patchSession((s) => ({ ...s, instruction: { ...s.instruction, ...updates } }))}
            >
              {({ onChange }) => (
                <InstructionSection
                  instruction={session.instruction}
                  onChange={onChange}
                  footer="This will completely replace the global system prompt."
                />
              )}
            </OverrideSection>
          </SectionWrapper>
        );

      case 'persona':
        return (
          <SectionWrapper>
            <OverrideSection
              description="Personalization is following global settings."
              checked={!!session.general.overridePersonalisation}
              onChange={(checked) => handleGeneral({ overridePersonalisation: checked })}
              onDataChange={(updates) => patchSession((s) => ({ ...s, personalisation: { ...s.personalisation, ...updates } }))}
            >
              {({ onChange }) => <PersonalisationSection personalisation={session.personalisation} onChange={onChange} />}
            </OverrideSection>
          </SectionWrapper>
        );
    }
  };

  return (
    <SettingModal tabs={SESSION_SETTING_TABS} activeTab={activeTab} onTabChange={setActiveTab} onClose={onClose}>
      {renderContent()}
    </SettingModal>
  );
};

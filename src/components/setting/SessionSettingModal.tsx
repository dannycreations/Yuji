import { Effect } from 'effect';
import { useEffect, useState } from 'react';

import { YujiRuntime } from '../../app/Runtime';
import { useStore, useStoreAction } from '../../hooks/useStore';
import { ChatService } from '../../services/ChatService';
import { StorageService } from '../../services/StorageService';
import { InputSwitch, InputText } from '../shared/InputArea';
import { SettingModal } from '../shared/modal/SettingModal';
import { InstructionSection, OverrideSection, PersonalisationSection, SectionWrapper, SettingField, SettingItem } from './SettingSection';

import type { FC } from 'react';
import type { ChatMetadata, ChatSession } from '../../app/Schema';
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

  const updateActiveSession = useStoreAction((_, f: (s: ChatSession, now: number) => ChatSession) =>
    Effect.flatMap(ChatService, (chat) => chat.updateActiveSession(f)),
  );
  const updateSession = useStoreAction((_, sessionId: string, f: (s: ChatSession, now: number) => ChatSession) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateSessionFull(sessionId, f);
      const storage = yield* StorageService;
      const session = yield* storage.getSession(sessionId);
      if (session) setLocalSession(session);
    }),
  );
  const updateSessionMeta = useStoreAction((_, sessionId: string, f: (s: ChatMetadata, now: number) => ChatMetadata) =>
    Effect.flatMap(ChatService, (chat) => chat.updateSession(sessionId, f)),
  );

  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    if (activeSession && activeSession.id === sessionId) {
      setLocalSession(null);
      return;
    }

    YujiRuntime.runPromise(
      Effect.gen(function* () {
        const storage = yield* StorageService;
        const session = yield* storage.getSession(sessionId);
        if (session) {
          setLocalSession(session);
        }
      }),
    );
  }, [sessionId, activeSession?.id]);

  const session = activeSession && activeSession.id === sessionId ? activeSession : localSession;

  if (!session) return null;

  const handleSession = (updates: Partial<ChatSession>) =>
    activeSession?.id === sessionId ? updateActiveSession((s) => ({ ...s, ...updates })) : updateSession(sessionId, (s) => ({ ...s, ...updates }));
  const handleSessionMeta = (updates: Partial<ChatMetadata>) => updateSessionMeta(sessionId, (s) => ({ ...s, ...updates }));
  const handleConfig = (updates: Partial<ChatSession>) => handleSession({ ...session, ...updates });
  const handleGeneral = (updates: Partial<ChatSession['general']>) => handleConfig({ general: { ...session.general, ...updates } });

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <SectionWrapper className="space-y-3">
            <SettingField label="Chat Title">
              <InputText value={session.title} onChange={(e) => handleSessionMeta({ title: e.target.value })} placeholder="Enter chat title..." />
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
          <OverrideSection
            description="Instruction is following global settings."
            checked={!!session.general.overrideInstruction}
            onChange={(checked) => handleGeneral({ overrideInstruction: checked })}
            onDataChange={(updates) => handleConfig({ instruction: { ...session.instruction, ...updates } })}
          >
            {({ onChange }) => (
              <InstructionSection
                instruction={session.instruction}
                onChange={onChange}
                footer="This will completely replace the global system prompt."
              />
            )}
          </OverrideSection>
        );

      case 'persona':
        return (
          <OverrideSection
            description="Personalization is following global settings."
            checked={!!session.general.overridePersonalisation}
            onChange={(checked) => handleGeneral({ overridePersonalisation: checked })}
            onDataChange={(updates) => handleConfig({ personalisation: { ...session.personalisation, ...updates } })}
          >
            {({ onChange }) => <PersonalisationSection personalisation={session.personalisation} onChange={onChange} />}
          </OverrideSection>
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

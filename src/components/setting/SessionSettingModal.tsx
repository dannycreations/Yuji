import { Effect } from 'effect';
import { useEffect, useState } from 'react';

import { YujiRuntime } from '../../app/Runtime';
import { useStore, useStoreEffect } from '../../hooks/useStore';
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

  const updateActiveSessionEffect = useStoreEffect((f: (s: ChatSession, now: number) => ChatSession) =>
    Effect.flatMap(ChatService, (chat) => chat.updateActiveSession(f)),
  );

  const updateSessionEffect = useStoreEffect((sessionId: string, f: (s: ChatSession, now: number) => ChatSession) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateSessionFull(sessionId, f);
      const storage = yield* StorageService;
      const session = yield* storage.getSession(sessionId);
      if (session) setLocalSession(session);
    }),
  );

  const updateSessionMetaEffect = useStoreEffect((sessionId: string, f: (s: ChatMetadata, now: number) => ChatMetadata) =>
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

  const updateSession = (updates: Partial<ChatSession>) =>
    activeSession?.id === sessionId
      ? updateActiveSessionEffect((s) => ({ ...s, ...updates }))
      : updateSessionEffect(sessionId, (s) => ({ ...s, ...updates }));
  const updateSessionMeta = (updates: Partial<ChatMetadata>) => updateSessionMetaEffect(sessionId, (s) => ({ ...s, ...updates }));
  const updateConfig = (updates: Partial<ChatSession>) => updateSession({ ...session, ...updates });
  const updateGeneral = (updates: Partial<ChatSession['general']>) => updateConfig({ general: { ...session.general, ...updates } });

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <SectionWrapper className="space-y-3">
            <SettingField label="Chat Title">
              <InputText value={session.title} onChange={(e) => updateSessionMeta({ title: e.target.value })} placeholder="Enter chat title..." />
            </SettingField>

            <SettingItem label="Override Instruction" description="Ignore global system prompt." className="panel-section-group mt-2 pt-2">
              <InputSwitch checked={!!session.general.overrideInstruction} onChange={(checked) => updateGeneral({ overrideInstruction: checked })} />
            </SettingItem>

            <SettingItem label="Override Personalization" description="Ignore global user persona." className="panel-section-group pt-2">
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
              description="Instruction is following global settings."
              checked={!!session.general.overrideInstruction}
              onChange={(checked) => updateGeneral({ overrideInstruction: checked })}
              onDataChange={(updates) => updateConfig({ instruction: { ...session.instruction, ...updates } })}
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
              onChange={(checked) => updateGeneral({ overridePersonalisation: checked })}
              onDataChange={(updates) => updateConfig({ personalisation: { ...session.personalisation, ...updates } })}
            >
              {({ onChange }) => <PersonalisationSection personalisation={session.personalisation} onChange={onChange} />}
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

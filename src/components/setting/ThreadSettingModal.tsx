import { Effect } from 'effect';
import { useEffect, useState } from 'react';

import { useStore, useStoreAction, useStoreEffect } from '../../hooks/useStore';
import { ChatService } from '../../services/ChatService';
import { StoreService } from '../../services/StoreService';
import { InputSwitch, InputText } from '../shared/InputArea';
import { SettingModal } from '../shared/modal/SettingModal';
import { InstructionSection, OverrideSection, PersonalisationSection, SectionWrapper, SettingField, SettingItem } from './SettingSection';

import type { FC } from 'react';
import type { ChatThread } from '../../app/Schema';
import type { SettingTabItem } from '../shared/modal/SettingModal';

interface ThreadSettingModalProps {
  readonly threadId: string;
  readonly onClose: () => void;
}

const THREAD_SETTING_TABS: SettingTabItem[] = [
  { icon: 'Settings', id: 'general', label: 'General' },
  { icon: 'Terminal', id: 'instruction', label: 'Instruction' },
  { icon: 'User', id: 'persona', label: 'Personalization' },
];

export const ThreadSettingModal: FC<ThreadSettingModalProps> = ({ threadId, onClose }) => {
  const activeThread = useStore((s) => s.activeThread);
  const [localThread, setLocalThread] = useState<ChatThread | null>(null);

  const updateThread = useStoreAction(
    (
      _s,
      threadId: string,
      f: (thread: ChatThread, now: number) => ChatThread,
      options?: {
        readonly skipUpdateTimestamp?: boolean;
        readonly metadataOnly?: boolean;
      },
    ) => Effect.flatMap(ChatService, (chat) => chat.updateThread(threadId, f, options)),
  );
  const getThread = useStoreEffect((id: string) => Effect.flatMap(StoreService, (s) => s.getThread(id)));

  const updateTargetThread = (targetId: string, f: (s: ChatThread, now: number) => ChatThread, metadataOnly = false) => {
    updateThread(targetId, f, { metadataOnly });
    if (!metadataOnly) {
      getThread(targetId).then((thread) => {
        if (thread) setLocalThread(thread);
      });
    }
  };

  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    if (activeThread?.id === threadId) {
      setLocalThread(null);
    } else {
      getThread(threadId).then((s) => s && setLocalThread(s));
    }
  }, [threadId, activeThread?.id, getThread]);

  const thread = activeThread?.id === threadId ? activeThread : localThread;
  if (!thread) return null;

  const patchThread = (f: (s: ChatThread) => ChatThread, metadataOnly = false) => updateTargetThread(threadId, (s) => f(s), metadataOnly);

  const handleGeneral = (updates: Partial<ChatThread['general']>) => patchThread((s) => ({ ...s, general: { ...s.general, ...updates } }));

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <SectionWrapper className="space-y-3">
            <SettingField label="Chat Title">
              <InputText
                value={thread.title}
                onChange={(e) => patchThread((s) => ({ ...s, title: e.target.value }), true)}
                placeholder="Enter chat title..."
              />
            </SettingField>

            <SettingItem label="Override Instruction" description="Ignore global system prompt." className="panel-section-group mt-2 pt-2">
              <InputSwitch checked={!!thread.general.overrideInstruction} onChange={(checked) => handleGeneral({ overrideInstruction: checked })} />
            </SettingItem>

            <SettingItem label="Override Personalization" description="Ignore global user persona." className="panel-section-group pt-2">
              <InputSwitch
                checked={!!thread.general.overridePersonalisation}
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
              checked={!!thread.general.overrideInstruction}
              onChange={(checked) => handleGeneral({ overrideInstruction: checked })}
              onDataChange={(updates) => patchThread((s) => ({ ...s, instruction: { ...s.instruction, ...updates } }))}
            >
              {({ onChange }) => (
                <InstructionSection
                  instruction={thread.instruction}
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
              checked={!!thread.general.overridePersonalisation}
              onChange={(checked) => handleGeneral({ overridePersonalisation: checked })}
              onDataChange={(updates) => patchThread((s) => ({ ...s, personalisation: { ...s.personalisation, ...updates } }))}
            >
              {({ onChange }) => <PersonalisationSection personalisation={thread.personalisation} onChange={onChange} />}
            </OverrideSection>
          </SectionWrapper>
        );
    }
  };

  return (
    <SettingModal tabs={THREAD_SETTING_TABS} activeTab={activeTab} onTabChange={setActiveTab} onClose={onClose}>
      {renderContent()}
    </SettingModal>
  );
};

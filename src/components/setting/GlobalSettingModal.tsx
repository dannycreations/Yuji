import { useState } from 'react';

import { useStore, useToggleSetting, useUpdateSetting } from '../../hooks/useStore';
import { SettingModal } from '../shared/modal/SettingModal';
import {
  ConnectionSection,
  GeneralSection,
  HistorySection,
  InstructionSection,
  ModelsSection,
  PersonalisationSection,
  SectionWrapper,
} from './SettingSection';

import type { FC } from 'react';
import type { SettingTabItem } from '../shared/modal/SettingModal';

type GlobalSettingTab = 'general' | 'connection' | 'models' | 'instruction' | 'persona' | 'history';

const GLOBAL_SETTING_TABS: SettingTabItem[] = [
  { icon: 'Settings', id: 'general', label: 'General' },
  { icon: 'Link', id: 'connection', label: 'Connection' },
  { icon: 'Cpu', id: 'models', label: 'Models' },
  { icon: 'Terminal', id: 'instruction', label: 'Instruction' },
  { icon: 'User', id: 'persona', label: 'Personalization' },
  { icon: 'History', id: 'history', label: 'History & Sync' },
];

export const GlobalSettingModal: FC = () => {
  const isSettingOpen = useStore((s) => s.isSettingOpen);
  const settings = useStore((s) => s.settings);
  const sessions = useStore((s) => s.sessions);
  const availableModels = useStore((s) => s.availableModels);

  const toggleSetting = useToggleSetting();
  const updateSetting = useUpdateSetting();

  const [activeTab, setActiveTab] = useState<GlobalSettingTab>('general');

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSection settings={settings} />;
      case 'connection':
        return <ConnectionSection settings={settings} />;
      case 'models':
        return <ModelsSection settings={settings} availableModels={availableModels} />;
      case 'instruction':
        return (
          <InstructionSection
            instruction={settings.instruction}
            onChange={(updates) => updateSetting({ instruction: { ...settings.instruction, ...updates } })}
            footer="This instruction will be sent as the system prompt to the AI."
          />
        );
      case 'persona':
        return (
          <SectionWrapper>
            <PersonalisationSection
              personalisation={settings.personalisation}
              onChange={(updates) => updateSetting({ personalisation: { ...settings.personalisation, ...updates } })}
            />
          </SectionWrapper>
        );
      case 'history':
        return <HistorySection sessions={sessions} />;
    }
  };

  const activeTabLabel = GLOBAL_SETTING_TABS.find((t) => t.id === activeTab)?.label || '';

  return (
    <SettingModal
      isOpen={isSettingOpen}
      tabs={GLOBAL_SETTING_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={toggleSetting}
      title={activeTabLabel}
    >
      {renderContent()}
    </SettingModal>
  );
};

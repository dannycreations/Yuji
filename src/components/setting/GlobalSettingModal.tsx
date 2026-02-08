import { useState } from 'react';

import { useStore, useStoreAction } from '../../hooks/useStore';
import { SettingModal } from '../shared/modal/SettingModal';
import { ConnectionSection, GeneralSection, HistorySection, InstructionSection, ModelsSection, PersonalisationSection } from './SettingSection';

import type { FC } from 'react';
import type { AppRuntimeState } from '../../app/Schema';
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

  const toggleSetting = useStoreAction((s) => s.toggle('isSettingOpen'));
  const updateSetting = useStoreAction(
    (s, updates: Partial<AppRuntimeState['settings']> | ((settings: AppRuntimeState['settings']) => AppRuntimeState['settings'])) =>
      s.updateSetting(updates),
  );

  const [activeTab, setActiveTab] = useState('general');

  const renderContent = () => {
    switch (activeTab as GlobalSettingTab) {
      case 'general':
        return <GeneralSection settings={settings} onChange={updateSetting} />;
      case 'connection':
        return <ConnectionSection settings={settings} onChange={updateSetting} />;
      case 'models':
        return <ModelsSection settings={settings} availableModels={availableModels} onChange={updateSetting} />;
      case 'instruction':
        return (
          <InstructionSection
            instruction={settings.instruction}
            onChange={(updates) => updateSetting((s) => ({ ...s, instruction: { ...s.instruction, ...updates } }))}
            footer="This instruction will be sent as the system prompt to the AI."
          />
        );
      case 'persona':
        return (
          <PersonalisationSection
            personalisation={settings.personalisation}
            onChange={(updates) => updateSetting((s) => ({ ...s, personalisation: { ...s.personalisation, ...updates } }))}
          />
        );
      case 'history':
        return <HistorySection sessions={sessions} />;
    }
  };

  return (
    <SettingModal isOpen={isSettingOpen} tabs={GLOBAL_SETTING_TABS} activeTab={activeTab} onTabChange={setActiveTab} onClose={toggleSetting}>
      {renderContent()}
    </SettingModal>
  );
};

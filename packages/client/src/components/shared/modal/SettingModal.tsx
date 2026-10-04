import { cn } from 'cn';
import { X } from 'lucide-react';

import { ButtonInput } from '@yuji/client/components/shared/InputArea';
import { Modal, ModalHeader } from '@yuji/client/components/shared/modal/Modal';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface SettingTabItem<T extends string = string> {
  readonly id: T;
  readonly label: string;
  readonly icon: LucideIcon;
}

interface SettingModalProps<T extends string> {
  readonly isOpen?: boolean;
  readonly tabs: ReadonlyArray<SettingTabItem<T>>;
  readonly activeTab: T;
  readonly onTabChange: (id: T) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export const SettingModal = <T extends string>({ isOpen = true, tabs, activeTab, onTabChange, onClose, children }: SettingModalProps<T>) => {
  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label ?? '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} containerClassName="settings-modal-container">
      {/* Sidebar */}
      <div className="settings-sidebar">
        <div className="flex-between px-1 mb-2">
          <ButtonInput onClick={onClose}>
            <X size={18} />
          </ButtonInput>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => onTabChange(tab.id)} className={cn('list-item-interactive', activeTab === tab.id && 'active')}>
              <tab.icon size={18} className="list-item-icon settings-tab-icon" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="settings-main-content bg-background">
        <ModalHeader title={activeTabLabel} />

        <div className="flex-1 min-h-0">
          <div className="w-full h-full">{children}</div>
        </div>
      </div>
    </Modal>
  );
};

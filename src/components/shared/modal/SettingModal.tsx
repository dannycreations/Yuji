import clsx from 'clsx';

import { Button } from '../Button';
import { Icon } from '../Icon';
import { Modal } from './Modal';

import type { FC, ReactNode } from 'react';

export interface SettingTabItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

interface SettingModalProps {
  readonly isOpen?: boolean;
  readonly tabs: SettingTabItem[];
  readonly activeTab: string;
  readonly onTabChange: (id: any) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly sidebarBottom?: ReactNode;
  readonly title?: ReactNode;
}

export const SettingModal: FC<SettingModalProps> = ({ isOpen = true, tabs, activeTab, onTabChange, onClose, children, sidebarBottom, title }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} containerClassName="w-full max-w-settings h-settings bg-sidebar flex overflow-hidden origin-bottom">
      {/* Sidebar */}
      <div className="w-settings-sidebar bg-sidebar flex flex-col flex-shrink-0 py-2 px-2 border-r border-separator/50">
        <div className="flex justify-between items-center px-1 mb-2">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <Icon name="X" size={18} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => onTabChange(tab.id)} className={clsx('list-item-interactive', activeTab === tab.id && 'active')}>
              <Icon name={tab.icon} size={18} className="list-item-icon" />
              {tab.label}
            </button>
          ))}
        </div>
        {sidebarBottom && <div className="modal-footer">{sidebarBottom}</div>}
      </div>

      {/* Main Content */}
      <div className="settings-main-content bg-background">
        <div className="modal-header">
          <div className="header-title">{title}</div>
        </div>

        <div className="flex-1 min-h-0">
          <div className="w-full h-full">{children}</div>
        </div>
      </div>
    </Modal>
  );
};

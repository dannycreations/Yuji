import clsx from 'clsx';

import { Icon } from './Icon';

import type { FC, ReactNode } from 'react';

export interface SettingTabItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

interface SettingModalProps {
  readonly title: string;
  readonly tabs: ReadonlyArray<SettingTabItem>;
  readonly activeTab: string;
  readonly onTabChange: (id: any) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly sidebarBottom?: ReactNode;
}

export const SettingModal: FC<SettingModalProps> = ({ title, tabs, activeTab, onTabChange, onClose, children, footer, sidebarBottom }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-5xl h-[650px] bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl flex overflow-hidden animate-slide-up">
        {/* Sidebar */}
        <div className="w-64 bg-[#09090b] border-r border-white/5 flex flex-col flex-shrink-0">
          <div className="h-16 flex items-center px-6 border-b border-white/5">
            <h2 className="text-lg font-display font-bold text-white tracking-wide uppercase">{title}</h2>
          </div>

          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group text-left border border-transparent',
                  activeTab === tab.id ? 'bg-white/10 text-white border-white/5 shadow-sm' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300',
                )}
              >
                <Icon
                  name={tab.icon}
                  size={16}
                  className={clsx('transition-colors', activeTab === tab.id ? 'text-primary' : 'text-zinc-600 group-hover:text-zinc-400')}
                />
                {tab.label}
              </button>
            ))}
          </div>

          {sidebarBottom && <div className="p-4 border-t border-white/5">{sidebarBottom}</div>}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0e] relative">
          {/* Header with Close Button */}
          <div className="h-16 flex items-center justify-end px-6 border-b border-white/5 flex-shrink-0 bg-[#0c0c0e]">
            <button onClick={onClose} className="p-2 text-zinc-600 hover:text-white hover:bg-white/5 rounded-full transition-colors">
              <Icon name="X" size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            <div className="p-8 max-w-3xl mx-auto w-full min-h-full">{children}</div>
          </div>

          {footer && <div className="flex-shrink-0 px-8 py-4 border-t border-white/5 bg-[#09090b] flex items-center justify-end gap-3">{footer}</div>}
        </div>
      </div>
    </div>
  );
};

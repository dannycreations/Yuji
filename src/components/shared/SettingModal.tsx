import clsx from 'clsx';
import { useRef, useState } from 'react';

import { useClickOutside } from '../../hooks/useClickOutside';
import { Icon } from './Icon';

import type { FC, ReactNode } from 'react';

export interface SettingTabItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

interface SettingModalProps {
  readonly tabs: ReadonlyArray<SettingTabItem>;
  readonly activeTab: string;
  readonly onTabChange: (id: any) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly sidebarBottom?: ReactNode;
  readonly title?: ReactNode;
}

export const SettingModal: FC<SettingModalProps> = ({ tabs, activeTab, onTabChange, onClose, children, sidebarBottom, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 200); // Match animation duration (0.2s)
  };

  useClickOutside(containerRef, handleClose);

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4',
        isClosing ? 'animate-fade-out' : 'animate-fade-in',
      )}
    >
      <div
        ref={containerRef}
        className={clsx(
          'w-full max-w-4xl h-[600px] bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden',
          isClosing ? 'animate-slide-down' : 'animate-slide-up',
        )}
      >
        <div className="h-14 flex flex-shrink-0">
          {/* Sidebar Header */}
          <div className="w-64 border-b border-r border-white/5 flex items-center px-4 bg-[#09090b]">
            <button onClick={handleClose} className="p-2 text-zinc-600 hover:text-white hover:bg-white/5 rounded-full transition-colors group">
              <Icon name="X" size={18} />
            </button>
          </div>
          {/* Main Header */}
          <div className="flex-1 border-b border-white/5 bg-[#0c0c0e] flex items-center px-6">
            {title && <div className="text-lg font-semibold text-zinc-200">{title}</div>}
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-64 bg-[#09090b] border-r border-white/5 flex flex-col flex-shrink-0">
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
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              <div className="p-4 max-w-3xl mx-auto w-full min-h-full">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

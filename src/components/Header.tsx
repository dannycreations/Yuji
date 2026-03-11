import { ChevronDown, PanelLeftOpen } from 'lucide-react';
import { useRef, useState } from 'react';

import { useClickOutside } from '../hooks/useClickOutside';
import { useStore, useStoreAction } from '../hooks/useStore';
import { ButtonInput } from './shared/InputArea';
import { ModePicker } from './shared/PickerArea';

import type { FC } from 'react';
import type { GlobalSetting } from '../app/Schema';

export const Header: FC = () => {
  const [showModePicker, setShowModePicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useClickOutside(pickerRef, (e) => {
    // If we click inside the portal (Dropdown), don't close
    const target = e.target as Node;
    const dropdowns = document.querySelectorAll('.model-picker-dropdown');
    for (const dropdown of Array.from(dropdowns)) {
      if (dropdown.contains(target)) return;
    }

    setShowModePicker(false);
  });

  const settings = useStore((s) => s.settings);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);

  const toggleSidebar = useStoreAction((s) => s.toggle('isSidebarOpen'));
  const updateSetting = useStoreAction((s, updates: Partial<GlobalSetting>) => s.updateSetting(updates));

  const currentMode = settings.mode;
  const currentModeName = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);

  const handleModeSelect = (mode: 'chat' | 'agent') => {
    updateSetting({ mode });
    setShowModePicker(false);
  };

  return (
    <div className="sticky-header">
      <div className="flex items-center gap-2">
        {!isSidebarOpen && (
          <ButtonInput onClick={toggleSidebar} title="Open Sidebar">
            <PanelLeftOpen size={20} />
          </ButtonInput>
        )}

        <div className="relative" ref={pickerRef}>
          <ButtonInput onClick={() => setShowModePicker(!showModePicker)}>
            <span className="header-title pr-1">{currentModeName}</span>
            <ChevronDown size={16} className="text-text-secondary" />
          </ButtonInput>

          <ModePicker
            isOpen={showModePicker}
            triggerRef={pickerRef}
            className="model-picker-dropdown -translate-y-2"
            currentMode={currentMode}
            onSelect={handleModeSelect}
            onClose={() => setShowModePicker(false)}
          />
        </div>
      </div>
    </div>
  );
};

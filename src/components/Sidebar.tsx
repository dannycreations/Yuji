import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { Archive, Bot, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pin, Settings, SquarePen, Trash2, User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { MODE_LIST } from '../app/Constant';
import { getFlattenedThreads, sortThreadsByDate } from '../helpers/ThreadHelper';
import { useClickOutside } from '../hooks/useClickOutside';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { useChatAction, useStore, useStoreAction } from '../hooks/useStore';
import { getFirstChar, shallowEqual } from '../utilities/CommonUtil';
import { ThreadSettingModal } from './setting/ThreadSettingModal';
import { Dropdown, DropdownItem } from './shared/Dropdown';
import { ButtonInput, SearchInput } from './shared/InputArea';
import { ModePicker } from './shared/PickerArea';

import type { FC } from 'react';
import type { ConfirmOptions } from '../app/Schema';

export const Sidebar: FC = () => {
  const threads = useStore((s) => s.threads, shallowEqual);
  const settings = useStore((s) => s.settings, shallowEqual);
  const userName = settings.personalisation.userName;
  const activeThreadId = useStore((s) => s.activeThreadId);
  const pinnedThreadIds = useStore((s) => s.pinnedThreadIds, shallowEqual);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const backgroundThreadIds = useStore((s) => s.backgroundThreadIds, shallowEqual);

  const setActiveThread = useStoreAction((s, id: string | null) => s.setActiveThread(id));
  const loadMoreThreads = useStoreAction((s) => s.loadMoreThreads());
  const searchThreads = useStoreAction((s, query: string) => s.searchThreads(query));
  const toggleSidebar = useStoreAction((s) => s.toggle('isSidebarOpen'));
  const toggleSetting = useStoreAction((s) => s.toggle('isSettingOpen'));
  const showConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));

  const onCreateThread = useChatAction((c, mode?: 'chat' | 'agent') => c.createThread(mode));
  const onDeleteThreads = useChatAction((c, id: string) => c.deleteThreads(id));

  const handleTogglePin = useStoreAction((s, id: string) => s.togglePin(id));
  const handleToggleArchive = useStoreAction((s, id: string) => s.toggleArchive(id));

  const [showModePicker, setShowModePicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useClickOutside(pickerRef, () => setShowModePicker(false));

  const handleModeSelect = (mode: 'chat' | 'agent') => {
    setShowModePicker(false);
    onCreateThread(mode);
  };

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    searchThreads(searchQuery);
  }, [searchQuery, searchThreads]);

  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useResizeObserver(scrollContainerRef);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<number | null>(null);

  const flattenedThreads = useMemo(() => {
    const sorted = sortThreadsByDate(Object.values(threads));
    return getFlattenedThreads(sorted, searchQuery, pinnedThreadIds);
  }, [threads, searchQuery, pinnedThreadIds]);

  const virtualizer = useVirtualizer({
    count: flattenedThreads.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 44,
    getItemKey: (index) => {
      const item = flattenedThreads[index];
      if (!item) return `empty-${index}`;
      return item.type === 'label' ? `label-${item.label}` : item.thread.id;
    },
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const [lastItem] = [...virtualItems].reverse();

    if (!lastItem) {
      return;
    }

    const isLastItemVisible = lastItem.index >= flattenedThreads.length - 1;

    if (!isLastItemVisible) {
      return;
    }

    loadMoreThreads();
  }, [virtualItems, flattenedThreads.length, loadMoreThreads]);

  const menuThreadMetadata = menuOpenId ? threads[menuOpenId] : null;

  return (
    <>
      {!isSidebarOpen && (
        <div className="fixed top-[10px] left-3 z-header">
          <ButtonInput
            onClick={toggleSidebar}
            title="Open Sidebar"
            className="bg-background/80 backdrop-blur border border-separator/50 h-9 w-9 p-0! flex-center"
          >
            <PanelLeftOpen size={20} />
          </ButtonInput>
        </div>
      )}
      <div className={clsx('sidebar-container', !isSidebarOpen && 'hidden')}>
        <div className="sidebar-header relative">
          <ButtonInput onClick={toggleSidebar} className="z-chat-input h-9 w-9 p-0! flex-center" title="Close Sidebar">
            <PanelLeftClose size={20} />
          </ButtonInput>

          <div className="abs-center pointer-events-none">
            <ButtonInput variant="logo" onClick={() => setActiveThread(null)}>
              <Bot size={20} className="text-primary" />
              <div className="header-title">Yuji</div>
            </ButtonInput>
          </div>

          <div className="relative" ref={pickerRef}>
            <ButtonInput onClick={() => setShowModePicker(!showModePicker)} className="z-chat-input" title="New Chat">
              <SquarePen size={20} />
            </ButtonInput>

            <ModePicker
              isOpen={showModePicker}
              triggerRef={pickerRef}
              ignoreRef={pickerRef}
              className="left-auto right-0 origin-top-right"
              onSelect={handleModeSelect}
              onClose={() => setShowModePicker(false)}
            />
          </div>
        </div>

        <div className="px-2 mb-2">
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            debounceMs={150}
            placeholder="Search threads..."
            className="input-sm bg-surface/50! border-transparent! focus:border-line/30! focus:bg-surface!"
          />
        </div>

        <div
          className={clsx('sidebar-content scrollbar-autohide', isScrolling && 'scrolling')}
          ref={scrollContainerRef}
          onScroll={() => {
            setIsScrolling(true);
            if (scrollTimerRef.current) {
              window.clearTimeout(scrollTimerRef.current);
            }
            scrollTimerRef.current = window.setTimeout(() => {
              setIsScrolling(false);
              scrollTimerRef.current = null;
            }, 1500);
          }}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
              }}
            >
              {virtualItems.map((virtualRow) => {
                const item = flattenedThreads[virtualRow.index];
                if (!item) return null;

                if (item.type === 'label') {
                  return (
                    <h3 key={virtualRow.key} ref={virtualizer.measureElement} data-index={virtualRow.index} className="label-caps p-2">
                      {item.label}
                    </h3>
                  );
                }
                const { thread } = item;
                return (
                  <div
                    key={virtualRow.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    className={clsx('sidebar-thread-item group', activeThreadId === thread.id && 'sidebar-thread-item-active')}
                    onClick={() => setActiveThread(thread.id)}
                  >
                    <div className="sidebar-thread-title flex items-center gap-2">
                      {(() => {
                        const modeInfo = MODE_LIST.find((m) => m.id === thread.mode);
                        const ModeIcon = modeInfo?.icon;
                        return ModeIcon && <ModeIcon size={14} className="text-text-tertiary flex-shrink-0" />;
                      })()}
                      <span className="block truncate">{thread.title}</span>
                    </div>

                    <div className="sidebar-thread-indicator-wrapper">
                      {backgroundThreadIds.includes(thread.id) && (
                        <div
                          className={clsx('flex items-center transition-opacity', menuOpenId === thread.id ? 'opacity-0' : 'group-hover:opacity-0')}
                        >
                          <div className="sidebar-activity-indicator" />
                        </div>
                      )}

                      {!backgroundThreadIds.includes(thread.id) && pinnedThreadIds.includes(thread.id) && (
                        <div
                          className={clsx(
                            'flex items-center text-text-tertiary transition-opacity',
                            menuOpenId === thread.id ? 'opacity-0' : 'group-hover:opacity-0',
                          )}
                        >
                          <Pin size={16} className="rotate-45" />
                        </div>
                      )}
                      <ButtonInput
                        ref={menuOpenId === thread.id ? menuTriggerRef : null}
                        className={clsx('sidebar-thread-action-btn', menuOpenId === thread.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === thread.id ? null : thread.id);
                        }}
                      >
                        <MoreHorizontal size={16} />
                      </ButtonInput>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <ButtonInput variant="sidebar" onClick={toggleSetting}>
            <div className="avatar-sm">{getFirstChar(userName) || <User size={12} />}</div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-medium truncate">{userName || 'User'}</div>
            </div>
            <div className="text-text-tertiary flex items-center">
              <Settings size={16} />
            </div>
          </ButtonInput>
        </div>
        {settingsOpenId && <ThreadSettingModal threadId={settingsOpenId} onClose={() => setSettingsOpenId(null)} />}

        {menuOpenId && menuThreadMetadata && (
          <Dropdown isOpen={true} triggerRef={menuTriggerRef} onClose={() => setMenuOpenId(null)}>
            <DropdownItem
              icon={Pin}
              iconClassName={clsx(pinnedThreadIds.includes(menuOpenId) && 'rotate-45')}
              label={pinnedThreadIds.includes(menuOpenId) ? 'Unpin' : 'Pin'}
              onClick={() => {
                setMenuOpenId(null);
                handleTogglePin(menuOpenId);
              }}
            />
            <DropdownItem
              icon={Archive}
              label="Archive"
              onClick={() => {
                setMenuOpenId(null);
                handleToggleArchive(menuOpenId);
              }}
            />
            <DropdownItem
              icon={Settings}
              label="Settings"
              onClick={() => {
                setMenuOpenId(null);
                setSettingsOpenId(menuOpenId);
              }}
            />
            <DropdownItem
              icon={Trash2}
              label="Delete"
              variant="danger"
              onClick={() => {
                setMenuOpenId(null);
                showConfirm({
                  title: 'Delete chat?',
                  message: `This will delete **${menuThreadMetadata?.title}** permanently.`,
                  confirmLabel: 'Delete',
                  onConfirm: () => onDeleteThreads(menuOpenId),
                  variant: 'danger',
                });
              }}
            />
          </Dropdown>
        )}
      </div>
    </>
  );
};

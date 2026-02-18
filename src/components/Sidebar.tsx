import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';

import { filterThreads, groupThreads, sortThreadsByDate } from '../helpers/ThreadHelper';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { useChatAction, useStore, useStoreAction } from '../hooks/useStore';
import { useVirtualList } from '../hooks/useVirtualList';
import { getFirstChar } from '../utilities/CommonUtil';
import { ThreadSettingModal } from './setting/ThreadSettingModal';
import { Dropdown, DropdownItem } from './shared/Dropdown';
import { Icon } from './shared/Icon';
import { InputButton, InputSearch } from './shared/InputArea';

import type { FC } from 'react';
import type { ConfirmOptions, Thread } from '../app/Schema';

export const Sidebar: FC = () => {
  const threads = useStore(
    (s) => s.threads,
    (a, b) => a === b,
  );
  const userName = useStore((s) => s.settings.personalisation.userName);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const pinnedThreadIds = useStore((s) => s.pinnedThreadIds);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const backgroundThreadIds = useStore((s) => s.backgroundThreadIds);

  const setActiveThread = useStoreAction((s, id: string | null) => s.setActiveThread(id));
  const loadMoreThreads = useStoreAction((s) => s.loadMoreThreads());
  const searchThreads = useStoreAction((s, query: string) => s.searchThreads(query));
  const toggleSidebar = useStoreAction((s) => s.toggle('isSidebarOpen'));
  const toggleSetting = useStoreAction((s) => s.toggle('isSettingOpen'));
  const showConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));

  const onCreateThread = useChatAction((c) => c.createThread());
  const onDeleteThreads = useChatAction((c, id: string) => c.deleteThreads(id));

  const handleTogglePin = useStoreAction((s, id: string) => s.togglePin(id));
  const handleToggleArchive = useStoreAction((s, id: string) => s.toggleArchive(id));

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => searchThreads(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery, searchThreads]);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { height: containerHeight } = useResizeObserver(scrollContainerRef);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<number | null>(null);

  const sortedThreads = useMemo(() => sortThreadsByDate(Object.values(threads)).filter((t) => !t.archived), [threads]);

  const flattenedThreads = useMemo(() => {
    const filtered = filterThreads(sortedThreads, searchQuery);
    const grouped = groupThreads(filtered, pinnedThreadIds);

    const result: Array<{ type: 'label'; label: string } | { type: 'thread'; thread: Thread }> = [];
    const entries = Object.entries(grouped);

    for (let i = 0; i < entries.length; i++) {
      const [label, group] = entries[i];
      if (group.length > 0) {
        result.push({ type: 'label', label });
        for (let j = 0; j < group.length; j++) {
          result.push({ type: 'thread', thread: group[j] as Thread });
        }
      }
    }
    return result;
  }, [sortedThreads, searchQuery, pinnedThreadIds]);

  const { startIndex, endIndex, translateY, totalHeight, onScroll, measureElement } = useVirtualList({
    containerHeight,
    estimatedItemHeight: 44, // 40px item + 4px gap
    items: flattenedThreads,
    getItemKey: (item) => (item.type === 'label' ? `label-${item.label}` : item.thread.id),
  });

  const { handleScroll: handleInfiniteScroll } = useInfiniteScroll({
    onLoadMore: () => {
      loadMoreThreads();
    },
    direction: 'bottom',
    threshold: 20,
  });

  const menuThreadMetadata = menuOpenId ? threads[menuOpenId] : null;

  return (
    <div className={clsx('sidebar-container', !isSidebarOpen && 'hidden')}>
      <div className="sidebar-header relative">
        <InputButton onClick={toggleSidebar} className="z-chat-input" title="Close Sidebar">
          <Icon name="PanelLeftClose" size={20} />
        </InputButton>

        <div className="abs-center pointer-events-none">
          <InputButton variant="logo" onClick={() => setActiveThread(null)}>
            <Icon name="Bot" size={20} className="text-primary" />
            <div className="header-title">Yuji</div>
          </InputButton>
        </div>

        <InputButton onClick={onCreateThread} className="z-chat-input" title="New Chat">
          <Icon name="SquarePen" size={20} />
        </InputButton>
      </div>

      <div className="px-2 mb-2">
        <InputSearch
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search threads..."
          className="input-sm bg-surface/50! border-transparent! focus:border-line/30! focus:bg-surface!"
        />
      </div>

      <div
        className={clsx('sidebar-content scrollbar-autohide', isScrolling && 'scrolling')}
        ref={scrollContainerRef}
        onScroll={(e) => {
          onScroll(e);
          handleInfiniteScroll(e);

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
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${translateY}px)` }}>
            {flattenedThreads.slice(startIndex, endIndex).map((item) => {
              if (item.type === 'label') {
                return (
                  <h3 key={`label-${item.label}`} ref={measureElement} data-vkey={`label-${item.label}`} className="label-caps p-2 h-[40px]">
                    {item.label}
                  </h3>
                );
              }
              const { thread } = item;
              return (
                <div
                  key={thread.id}
                  ref={measureElement}
                  data-vkey={thread.id}
                  className={clsx('sidebar-thread-item group', activeThreadId === thread.id && 'sidebar-thread-item-active')}
                  onClick={() => setActiveThread(thread.id)}
                >
                  <div className="sidebar-thread-title flex items-center gap-2">
                    <span className="block truncate">{thread.title}</span>
                  </div>

                  <div className="sidebar-thread-indicator-wrapper">
                    {backgroundThreadIds.includes(thread.id) ? (
                      <div className={clsx('flex items-center transition-opacity', menuOpenId === thread.id ? 'opacity-0' : 'group-hover:opacity-0')}>
                        <div className="sidebar-activity-indicator" />
                      </div>
                    ) : (
                      pinnedThreadIds.includes(thread.id) && (
                        <div
                          className={clsx(
                            'flex items-center text-text-tertiary transition-opacity',
                            menuOpenId === thread.id ? 'opacity-0' : 'group-hover:opacity-0',
                          )}
                        >
                          <Icon name="Pin" size={16} className="rotate-45" />
                        </div>
                      )
                    )}
                    <InputButton
                      ref={menuOpenId === thread.id ? menuTriggerRef : null}
                      className={clsx(
                        'p-1 transition-opacity absolute inset-0 bg-transparent flex-center',
                        menuOpenId === thread.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === thread.id ? null : thread.id);
                      }}
                    >
                      <Icon name="MoreHorizontal" size={16} />
                    </InputButton>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <InputButton variant="sidebar" onClick={toggleSetting}>
          <div className="avatar-sm">{getFirstChar(userName) || <Icon name="User" size={12} />}</div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium truncate">{userName || 'User'}</div>
          </div>
          <div className="text-text-tertiary flex items-center">
            <Icon name="Settings" size={16} />
          </div>
        </InputButton>
      </div>
      {settingsOpenId && <ThreadSettingModal threadId={settingsOpenId} onClose={() => setSettingsOpenId(null)} />}

      {menuOpenId && menuThreadMetadata && (
        <Dropdown isOpen={true} triggerRef={menuTriggerRef} onClose={() => setMenuOpenId(null)}>
          <DropdownItem
            icon="Pin"
            iconClassName={clsx(pinnedThreadIds.includes(menuOpenId) && 'rotate-45')}
            label={pinnedThreadIds.includes(menuOpenId) ? 'Unpin' : 'Pin'}
            onClick={() => {
              setMenuOpenId(null);
              handleTogglePin(menuOpenId);
            }}
          />
          <DropdownItem
            icon="Archive"
            label="Archive"
            onClick={() => {
              setMenuOpenId(null);
              handleToggleArchive(menuOpenId);
            }}
          />
          <DropdownItem
            icon="Settings"
            label="Settings"
            onClick={() => {
              setMenuOpenId(null);
              setSettingsOpenId(menuOpenId);
            }}
          />
          <DropdownItem
            icon="Trash2"
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
  );
};

import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';

import { filterSessions, groupSessions, sortSessionsByDate } from '../helpers/SessionHelper';
import { useChatAction } from '../hooks/useChatAction';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { useStore, useStoreAction } from '../hooks/useStore';
import { useVirtualList } from '../hooks/useVirtualList';
import { getFirstChar } from '../utilities/CommonUtil';
import { SessionSettingModal } from './setting/SessionSettingModal';
import { Button } from './shared/Button';
import { Dropdown, DropdownItem } from './shared/Dropdown';
import { Icon } from './shared/Icon';
import { InputSearch } from './shared/InputArea';

import type { FC } from 'react';
import type { ChatSession, ConfirmOptions } from '../app/Schema';

export const Sidebar: FC = () => {
  const sessions = useStore((s) => s.sessions);
  const settings = useStore((s) => s.settings);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const pinnedSessionIds = useStore((s) => s.pinnedSessionIds);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const backgroundSessionIds = useStore((s) => s.backgroundSessionIds);

  const setActiveSession = useStoreAction((s, id: string | null) => s.setActiveSession(id));
  const loadMoreSessions = useStoreAction((s) => s.loadMoreSessions());
  const toggleSidebar = useStoreAction((s) => s.toggle('isSidebarOpen'));
  const toggleSetting = useStoreAction((s) => s.toggle('isSettingOpen'));
  const showConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));

  const { handleCreateSession, handleDeleteSession, handleTogglePin } = useChatAction();

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { height: containerHeight } = useResizeObserver(scrollContainerRef);

  const sortedSessions = useMemo(() => sortSessionsByDate(Object.values(sessions) as ChatSession[]), [sessions]);

  const filteredSessions = useMemo(() => {
    return filterSessions(sortedSessions, searchQuery);
  }, [sortedSessions, searchQuery]);

  const groupedSessions = useMemo(() => groupSessions(filteredSessions, pinnedSessionIds), [filteredSessions, pinnedSessionIds]);

  const flattenedSessions = useMemo(() => {
    const result: Array<{ type: 'label'; label: string } | { type: 'session'; session: ChatSession }> = [];
    const entries = Object.entries(groupedSessions);
    for (let i = 0; i < entries.length; i++) {
      const [label, group] = entries[i];
      if (group.length > 0) {
        result.push({ type: 'label', label });
        for (let j = 0; j < group.length; j++) {
          result.push({ type: 'session', session: group[j] as ChatSession });
        }
      }
    }
    return result;
  }, [groupedSessions]);

  const { startIndex, endIndex, translateY, totalHeight, onScroll } = useVirtualList({
    containerHeight,
    estimatedItemHeight: 44, // 40px item + 4px gap
    totalCount: flattenedSessions.length,
  });

  const menuSessionMetadata = menuOpenId ? sessions[menuOpenId] : null;

  if (!isSidebarOpen) return null;

  return (
    <div className="sidebar-container">
      <div className="sidebar-header relative">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="z-chat-input" title="Close Sidebar">
          <Icon name="PanelLeftClose" size={20} />
        </Button>

        <div className="abs-center flex-center pointer-events-none">
          <button onClick={() => setActiveSession(null)} className="sidebar-logo">
            <Icon name="Bot" size={20} className="text-primary" />
            <span className="header-title">Yuji</span>
          </button>
        </div>

        <Button variant="ghost" size="icon" onClick={handleCreateSession} className="z-chat-input" title="New Chat">
          <Icon name="SquarePen" size={20} />
        </Button>
      </div>

      <div className="px-3 mb-2">
        <InputSearch
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search sessions..."
          className="py-2 bg-surface/50 border-transparent focus:border-line/30 focus:bg-surface"
        />
      </div>

      <div
        className="sidebar-content"
        ref={scrollContainerRef}
        onScroll={(e) => {
          onScroll(e);
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
          if (scrollHeight - scrollTop <= clientHeight + 100) {
            loadMoreSessions().catch(console.error);
          }
        }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${translateY}px)` }}>
            {flattenedSessions.slice(startIndex, endIndex).map((item) => {
              if (item.type === 'label') {
                return (
                  <h3 key={`label-${item.label}`} className="label-caps px-2 py-2 mb-1 h-[40px] mt-1">
                    {item.label}
                  </h3>
                );
              }
              const { session } = item;
              return (
                <div
                  key={session.id}
                  className={clsx('sidebar-session-item group h-[40px] mt-1', activeSessionId === session.id && 'sidebar-session-item-active')}
                  onClick={() => setActiveSession(session.id)}
                >
                  <div className="sidebar-session-title flex items-center gap-2 min-w-0">
                    <span className="block truncate">{session.title}</span>
                  </div>

                  <div className="sidebar-session-indicator-wrapper">
                    {backgroundSessionIds.includes(session.id) ? (
                      <div
                        className={clsx('flex items-center transition-opacity', menuOpenId === session.id ? 'opacity-0' : 'group-hover:opacity-0')}
                      >
                        <div className="sidebar-activity-indicator" />
                      </div>
                    ) : (
                      pinnedSessionIds.includes(session.id) && (
                        <div
                          className={clsx(
                            'flex items-center text-text-tertiary transition-opacity',
                            menuOpenId === session.id ? 'opacity-0' : 'group-hover:opacity-0',
                          )}
                        >
                          <Icon name="Pin" size={16} className="rotate-45" />
                        </div>
                      )
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={clsx(
                        '!p-1 transition-opacity absolute inset-0 bg-transparent flex-center',
                        menuOpenId === session.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuPosition({ top: rect.top + 36, left: rect.right - 36 });
                        setMenuOpenId(menuOpenId === session.id ? null : session.id);
                      }}
                    >
                      <Icon name="MoreHorizontal" size={16} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <Button variant="sidebar" onClick={toggleSetting}>
          <div className="avatar-sm bg-surface-hover flex-center">
            {getFirstChar(settings.personalisation.userName) || <Icon name="User" size={12} />}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium truncate">{settings.personalisation.userName || 'User'}</div>
          </div>
          <div className="text-text-tertiary flex items-center">
            <Icon name="Settings" size={16} />
          </div>
        </Button>
      </div>
      {settingsOpenId && <SessionSettingModal sessionId={settingsOpenId} onClose={() => setSettingsOpenId(null)} />}

      {menuOpenId && menuPosition && menuSessionMetadata && (
        <Dropdown
          isOpen={true}
          position={menuPosition}
          onClose={() => {
            setMenuOpenId(null);
            setMenuPosition(null);
          }}
        >
          <DropdownItem
            icon="Pin"
            iconClassName={clsx(pinnedSessionIds.includes(menuOpenId) && 'rotate-45')}
            label={pinnedSessionIds.includes(menuOpenId) ? 'Unpin' : 'Pin'}
            onClick={() => handleTogglePin(menuOpenId)}
          />
          <DropdownItem icon="Settings" label="Settings" onClick={() => setSettingsOpenId(menuOpenId)} />
          <DropdownItem
            icon="Trash2"
            label="Delete"
            variant="danger"
            onClick={() =>
              showConfirm({
                title: 'Delete chat?',
                message: `This will delete **${menuSessionMetadata?.title}** permanently.`,
                confirmLabel: 'Delete',
                onConfirm: () => handleDeleteSession(menuOpenId),
                variant: 'danger',
              })
            }
          />
        </Dropdown>
      )}
    </div>
  );
};

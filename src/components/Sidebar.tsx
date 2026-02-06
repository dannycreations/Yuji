import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';

import { groupSessions } from '../helpers/SessionHelper';
import { useChatAction } from '../hooks/useChatAction';
import { useClickOutside } from '../hooks/useClickOutside';
import { useConfirm, useStore, useStoreAction, useToggleSetting, useToggleSidebar } from '../hooks/useStore';
import { SessionSettingModal } from './setting/SessionSettingModal';
import { Button } from './shared/Button';
import { Icon } from './shared/Icon';
import { InputSearch } from './shared/InputArea';

import type { FC } from 'react';
import type { ChatSession } from '../app/Schema';

export const Sidebar: FC = () => {
  const sessions = useStore((s) => s.sessions);
  const settings = useStore((s) => s.settings);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const pinnedSessionIds = useStore((s) => s.pinnedSessionIds);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const backgroundSessionIds = useStore((s) => s.backgroundSessionIds);

  const setActiveSession = useStoreAction((s, id: string | null) => s.setActiveSession(id));
  const toggleSidebar = useToggleSidebar();
  const toggleSetting = useToggleSetting();
  const showConfirm = useConfirm();

  const { handleCreateSession, handleDeleteSession, handleTogglePin } = useChatAction();

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => {
    if (menuOpenId) {
      setMenuOpenId(null);
      setMenuPosition(null);
    }
  });

  const filteredSessions = useMemo(() => {
    const allSessions = (Object.values(sessions) as ChatSession[]).sort((a, b) => b.updatedAt - a.updatedAt);
    const query = searchQuery.trim().toLowerCase();
    return query ? allSessions.filter((s) => s.title.toLowerCase().includes(query)) : allSessions;
  }, [sessions, searchQuery]);

  const groupedSessions = useMemo(() => groupSessions(filteredSessions, pinnedSessionIds), [filteredSessions, pinnedSessionIds]);

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

      <div className="sidebar-content">
        {Object.entries(groupedSessions).map(
          ([label, group]) =>
            group.length > 0 && (
              <div key={label} className="mb-3">
                <h3 className="label-caps px-2 py-2 mb-1">{label}</h3>
                <div className="sidebar-session-list">
                  {group.map((session) => (
                    <div
                      key={session.id}
                      className={clsx('sidebar-session-item group', activeSessionId === session.id && 'sidebar-session-item-active')}
                      onClick={() => setActiveSession(session.id)}
                    >
                      <div className="sidebar-session-title flex items-center gap-2 min-w-0">
                        <span className="block truncate">{session.title}</span>
                      </div>

                      <div className="sidebar-session-indicator-wrapper">
                        {backgroundSessionIds.includes(session.id) ? (
                          <div
                            className={clsx(
                              'flex items-center transition-opacity',
                              menuOpenId === session.id ? 'opacity-0' : 'group-hover:opacity-0',
                            )}
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
                  ))}
                </div>
              </div>
            ),
        )}
      </div>

      <div className="sidebar-footer">
        <Button variant="sidebar" onClick={toggleSetting}>
          <div className="avatar-sm bg-surface-hover flex-center">
            {settings.personalisation.userName ? settings.personalisation.userName.charAt(0).toUpperCase() : <Icon name="User" size={12} />}
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
        <div
          ref={menuRef}
          className="dropdown-menu fixed w-44 py-1 origin-top-right"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            {
              icon: 'Pin',
              label: pinnedSessionIds.includes(menuOpenId) ? 'Unpin' : 'Pin',
              onClick: () => handleTogglePin(menuOpenId),
              className: pinnedSessionIds.includes(menuOpenId) && 'rotate-45',
            },
            {
              icon: 'Settings',
              label: 'Settings',
              onClick: () => setSettingsOpenId(menuOpenId),
            },
            {
              icon: 'Trash2',
              label: 'Delete',
              variant: 'danger',
              onClick: () =>
                showConfirm({
                  title: 'Delete chat?',
                  message: `This will delete **${menuSessionMetadata?.title}** permanently.`,
                  confirmLabel: 'Delete',
                  onConfirm: () => handleDeleteSession(menuOpenId),
                  variant: 'danger',
                }),
            },
          ].map((item, idx) => (
            <button
              key={idx}
              className={clsx('dropdown-item', item.variant === 'danger' ? 'danger' : '!text-text-primary')}
              onClick={() => {
                item.onClick();
                setMenuOpenId(null);
                setMenuPosition(null);
              }}
            >
              <Icon name={item.icon} size={16} className={clsx(item.variant !== 'danger' && 'text-text-tertiary', item.className)} />
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

import clsx from 'clsx';
import { Effect } from 'effect';
import { useMemo, useRef, useState } from 'react';

import { DEFAULT_SETTINGS } from '../app/Constant';
import { groupSessions } from '../helpers/SessionHelper';
import { useClickOutside } from '../hooks/useClickOutside';
import { useAction, useConfirm, useStore, useUpdateStore } from '../hooks/useStore';
import { ChatService } from '../services/ChatService';
import { SessionSettingModal } from './setting/SessionSettingModal';
import { Icon } from './shared/Icon';
import { InputSearch } from './shared/InputArea';

import type { FC } from 'react';
import type { AppState, ChatSession } from '../app/Schema';

export const Sidebar: FC = () => {
  const sessions = useStore((s: AppState) => s.sessions, {});
  const settings = useStore((s: AppState) => s.settings, DEFAULT_SETTINGS);
  const activeSessionId = useStore((s: AppState) => s.activeSessionId, null);
  const isSidebarOpen = useStore((s: AppState) => s.isSidebarOpen, true);

  const updateStore = useUpdateStore();

  const setActiveSession = (id: string | null) => updateStore((s) => ({ ...s, activeSessionId: id }));
  const toggleSidebar = () => updateStore((s) => ({ ...s, isSidebarOpen: !s.isSidebarOpen }));
  const toggleSetting = () => updateStore((s) => ({ ...s, isSettingOpen: !s.isSettingOpen }));

  const showConfirm = useConfirm();

  const handleCreateSession = useAction(() =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.createSession();
    }),
  );

  const handleDeleteSession = useAction((id: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.deleteSession(id);
    }),
  );

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => {
    setMenuOpenId(null);
    setMenuPosition(null);
  });

  const filteredSessions = useMemo(() => {
    let allSessions = (Object.values(sessions) as ChatSession[]).sort((a, b) => b.updatedAt - a.updatedAt);
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      allSessions = allSessions.filter((s) => s.title.toLowerCase().includes(query));
    }
    return allSessions;
  }, [sessions, searchQuery]);

  const groupedSessions = groupSessions(filteredSessions);

  const menuSession = menuOpenId ? sessions[menuOpenId] : null;

  if (!isSidebarOpen) return null;

  return (
    <div className="sidebar-container">
      <div className="sidebar-header relative">
        <button onClick={toggleSidebar} className="btn-icon z-10" title="Close Sidebar">
          <Icon name="PanelLeftClose" size={20} />
        </button>

        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => setActiveSession(null)}
            className="flex items-center gap-1 hover:opacity-70 transition-opacity select-none cursor-pointer"
          >
            <Icon name="Bot" size={20} className="text-primary" />
            <span className="header-title">Yuji</span>
          </button>
        </div>

        <button onClick={handleCreateSession} className="btn-icon z-10" title="New Chat">
          <Icon name="SquarePen" size={20} />
        </button>
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
                      <div className="sidebar-session-title">
                        <span className="block truncate">{session.title}</span>
                        {/* Fade effect for long titles */}
                        <div className={clsx('sidebar-session-fade', activeSessionId === session.id && 'sidebar-session-fade-active')} />
                      </div>

                      <div className="relative flex items-center">
                        <button
                          className={clsx(
                            'btn-icon !p-1 transition-opacity',
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
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ),
        )}
      </div>

      <div className="sidebar-footer">
        <button
          onClick={toggleSetting}
          className="w-full flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-surface transition-colors text-text-primary"
        >
          <div className="avatar-sm bg-surface-hover">
            {settings.personalisation.userName ? settings.personalisation.userName.charAt(0).toUpperCase() : <Icon name="User" size={12} />}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium truncate">{settings.personalisation.userName || 'User'}</div>
          </div>
          <div className="text-text-tertiary flex items-center">
            <Icon name="Settings" size={16} />
          </div>
        </button>
      </div>
      {settingsOpenId && <SessionSettingModal sessionId={settingsOpenId} onClose={() => setSettingsOpenId(null)} />}

      {menuOpenId && menuPosition && menuSession && (
        <div
          ref={menuRef}
          className="dropdown-menu fixed w-44 py-1 z-[100] animate-fade-in"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="list-item-interactive !text-text-primary mx-1 w-[calc(100%-8px)] hover:bg-surface-hover px-2 py-2"
            onClick={() => {
              setSettingsOpenId(menuOpenId);
              setMenuOpenId(null);
              setMenuPosition(null);
            }}
          >
            <Icon name="Settings" size={16} className="text-text-secondary" />
            <span className="flex-1 text-left">Settings</span>
          </button>
          <button
            className="list-item-interactive !text-danger mx-1 w-[calc(100%-8px)] hover:bg-surface-hover px-2 py-2"
            onClick={() => {
              showConfirm({
                title: 'Delete chat?',
                message: `This will delete **${menuSession.title}** permanently.`,
                confirmLabel: 'Delete',
                onConfirm: () => handleDeleteSession(menuOpenId),
                variant: 'danger',
              });
              setMenuOpenId(null);
              setMenuPosition(null);
            }}
          >
            <Icon name="Trash2" size={16} />
            <span className="flex-1 text-left">Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};

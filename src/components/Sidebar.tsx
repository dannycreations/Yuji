import clsx from 'clsx';
import { Effect } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_SETTINGS } from '../app/Constant';
import { YujiRuntime } from '../app/Yuji';
import { useAction, useStore } from '../hooks/useStore';
import { ChatService } from '../services/ChatService';
import { StoreService } from '../services/StoreService';
import { SessionSettingModal } from './setting/SessionSettingModal';
import { Icon } from './shared/Icon';

import type { FC } from 'react';
import type { AppState, ChatSession, ConfirmState } from '../app/Schema';

export const Sidebar: FC = () => {
  const sessions = useStore((s: AppState) => s.sessions, {});
  const settings = useStore((s: AppState) => s.settings, DEFAULT_SETTINGS);
  const activeSessionId = useStore((s: AppState) => s.activeSessionId, null);
  const isSidebarOpen = useStore((s: AppState) => s.isSidebarOpen, true);

  const updateStore = useAction((f: (s: AppState) => AppState) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      return yield* store.update(f);
    }),
  );

  const setActiveSession = (id: string | null) => updateStore((s) => ({ ...s, activeSessionId: id }));
  const toggleSidebar = () => updateStore((s) => ({ ...s, isSidebarOpen: !s.isSidebarOpen }));
  const toggleSettings = () => updateStore((s) => ({ ...s, isSettingsOpen: !s.isSettingsOpen }));
  const showConfirm = (config: Omit<ConfirmState, 'isOpen' | 'id'> & { onConfirm: () => void }) =>
    YujiRuntime.runPromise(
      Effect.gen(function* () {
        const store = yield* StoreService;
        yield* store.setConfirm(config);
      }),
    );

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateSession = () => {
    YujiRuntime.runPromise(
      Effect.gen(function* () {
        const chat = yield* ChatService;
        yield* chat.createSession();
      }),
    );
  };

  const handleDeleteSession = (id: string) => {
    YujiRuntime.runPromise(
      Effect.gen(function* () {
        const chat = yield* ChatService;
        yield* chat.deleteSession(id);
      }),
    );
  };

  const filteredSessions = useMemo(() => {
    const allSessions = (Object.values(sessions) as ChatSession[]).sort((a, b) => b.updatedAt - a.updatedAt);
    return allSessions;
  }, [sessions]);

  const groupSessions = (sessionsList: ChatSession[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: Record<string, ChatSession[]> = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      'Previous 30 Days': [],
    };

    sessionsList.forEach((session) => {
      const date = new Date(session.updatedAt);
      if (date.toDateString() === today.toDateString()) {
        groups['Today'].push(session);
      } else if (date.toDateString() === yesterday.toDateString()) {
        groups['Yesterday'].push(session);
      } else if (today.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
        groups['Previous 7 Days'].push(session);
      } else {
        groups['Previous 30 Days'].push(session);
      }
    });

    return groups;
  };

  const groupedSessions = groupSessions(filteredSessions);

  if (!isSidebarOpen) return null;

  return (
    <div className="sidebar-container">
      <div className="sidebar-header">
        <button onClick={toggleSidebar} className="btn-icon" title="Close Sidebar">
          <Icon name="PanelLeftClose" size={20} />
        </button>
        <button onClick={handleCreateSession} className="btn-icon" title="New Chat">
          <Icon name="SquarePen" size={20} />
        </button>
      </div>

      <div className="sidebar-content">
        {Object.entries(groupedSessions).map(
          ([label, group]) =>
            group.length > 0 && (
              <div key={label} className="mb-4">
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

                      <div className="absolute right-2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="btn-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === session.id ? null : session.id);
                          }}
                        >
                          <Icon name="MoreHorizontal" size={16} />
                        </button>

                        {menuOpenId === session.id && (
                          <div ref={menuRef} className="dropdown-menu right-0 top-full mt-1 w-40 py-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="list-item-interactive !text-text-primary hover:bg-surface-hover"
                              onClick={() => {
                                setSettingsOpenId(session.id);
                                setMenuOpenId(null);
                              }}
                            >
                              <Icon name="Settings" size={14} />
                              Settings
                            </button>
                            <button
                              className="list-item-interactive !text-danger hover:bg-surface-hover"
                              onClick={() => {
                                showConfirm({
                                  title: 'Delete chat?',
                                  message: `This will delete **${session.title}** permanently.`,
                                  confirmLabel: 'Delete',
                                  onConfirm: () => handleDeleteSession(session.id),
                                  variant: 'danger',
                                });
                                setMenuOpenId(null);
                              }}
                            >
                              <Icon name="Trash2" size={14} />
                              Delete
                            </button>
                          </div>
                        )}
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
          onClick={toggleSettings}
          className="w-full flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-surface transition-colors text-text-primary"
        >
          <div className="avatar-sm bg-surface-hover">
            {settings.userName ? settings.userName.charAt(0).toUpperCase() : <Icon name="User" size={12} />}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium truncate">{settings.userName || 'User'}</div>
          </div>
          <div className="text-text-tertiary flex items-center">
            <Icon name="Settings" size={16} />
          </div>
        </button>
      </div>
      {settingsOpenId && <SessionSettingModal sessionId={settingsOpenId} onClose={() => setSettingsOpenId(null)} />}
    </div>
  );
};

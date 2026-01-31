import { Effect } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

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

  const [searchTerm, setSearchTerm] = useState('');
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
    if (!searchTerm.trim()) return allSessions;
    return allSessions.filter((session) => session.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [sessions, searchTerm]);

  const groupSessions = (sessionsList: ChatSession[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: Record<string, ChatSession[]> = {
      Today: [],
      Yesterday: [],
      Recent: [],
      Older: [],
    };

    sessionsList.forEach((session) => {
      const date = new Date(session.updatedAt);
      if (date.toDateString() === today.toDateString()) {
        groups['Today'].push(session);
      } else if (date.toDateString() === yesterday.toDateString()) {
        groups['Yesterday'].push(session);
      } else if (today.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
        groups['Recent'].push(session);
      } else {
        groups['Older'].push(session);
      }
    });

    return groups;
  };

  const groupedSessions = groupSessions(filteredSessions);

  if (!isSidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-20 p-1.5 bg-surface text-zinc-400 hover:text-white rounded-lg shadow-lg border border-surface_light transition-colors"
      >
        <Icon name="PanelLeftOpen" size={18} />
      </button>
    );
  }

  return (
    <div className="w-80 h-screen bg-black flex flex-col border-r border-surface_light flex-shrink-0 relative z-10 transition-all duration-300">
      <div className="p-4 flex items-center justify-between">
        <button onClick={toggleSidebar} className="text-zinc-500 hover:text-white transition-colors p-1.5">
          <Icon name="PanelLeftClose" size={20} />
        </button>
        <button onClick={handleCreateSession} className="p-1.5 text-zinc-500 hover:text-white transition-colors" title="New Chat">
          <Icon name="SquarePen" size={20} />
        </button>
      </div>

      <div className="px-4 pb-5">
        <div className="relative group">
          <Icon
            name="Search"
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-zinc-400 transition-colors"
          />
          <input
            type="text"
            placeholder="Search history..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface_light/30 text-sm text-zinc-200 pl-10 pr-4 py-2.5 rounded-xl border border-transparent focus:bg-surface_light/50 focus:border-zinc-800 outline-none transition-all placeholder:text-zinc-700"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 space-y-5">
        {Object.entries(groupedSessions).map(
          ([label, group]) =>
            group.length > 0 && (
              <div key={label} className="px-1">
                <h3 className="text-[11px] font-bold text-zinc-500 mb-2 px-3 uppercase tracking-widest">{label}</h3>
                <div className="space-y-1">
                  {group.map((session) => (
                    <div
                      key={session.id}
                      className={`group relative flex items-center rounded-xl px-3.5 py-3 text-[13px] transition-all cursor-pointer ${
                        activeSessionId === session.id
                          ? 'bg-surface_light text-white shadow-sm ring-1 ring-white/5'
                          : 'text-zinc-400 hover:bg-surface_light/40 hover:text-zinc-200'
                      }`}
                      onClick={() => setActiveSession(session.id)}
                    >
                      <span className="truncate flex-1 pr-8 font-medium leading-tight">{session.title}</span>
                      <div className="absolute right-3 flex items-center">
                        <button
                          className={`p-1.5 text-zinc-500 hover:text-white transition-all rounded-lg hover:bg-surface_light ${
                            menuOpenId === session.id ? 'opacity-100 bg-surface_light text-white' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === session.id ? null : session.id);
                          }}
                        >
                          <Icon name="MoreHorizontal" size={16} />
                        </button>

                        {menuOpenId === session.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 top-full mt-1 w-36 bg-surface border border-surface_light rounded-xl shadow-2xl z-20 py-1.5 animate-in fade-in zoom-in duration-100 origin-top-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-surface_light hover:text-white transition-colors"
                              onClick={() => {
                                setSettingsOpenId(session.id);
                                setMenuOpenId(null);
                              }}
                            >
                              <Icon name="Settings" size={14} />
                              Settings
                            </button>
                            <div className="h-px bg-surface_light mx-2 my-1" />
                            <button
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition-colors"
                              onClick={() => {
                                showConfirm({
                                  title: 'Delete Chat',
                                  message: 'Are you sure you want to delete this chat? This action cannot be undone.',
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

      <div className="p-4 border-t border-surface_light bg-black">
        <button
          onClick={toggleSettings}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-400 hover:bg-surface_light/50 hover:text-white transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <Icon name="User" size={18} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-[13px] font-bold truncate">Local User</div>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Personal Space</div>
          </div>
          <Icon name="Settings" size={16} />
        </button>
      </div>
      {settingsOpenId && <SessionSettingModal sessionId={settingsOpenId} onClose={() => setSettingsOpenId(null)} />}
    </div>
  );
};
